from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure
from ..tasks_storage import (
    ensure_path_within_base,
    generate_stored_filename,
    get_uploads_base_dir,
    validate_upload,
)
from ..services.document_ai_service import extract_document_data_with_ai
from . import orders, purchases

router = APIRouter(prefix="/companies/{company_id}/documents", tags=["documents"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


def _documents_upload_dir(*, tenant_id: int, company_id: int) -> Path:
    base = get_uploads_base_dir()
    path = base / "tenants" / str(tenant_id) / "companies" / str(company_id) / "documents"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _log(db: Session, *, document_id: int, message: str) -> None:
    db.add(models.DocumentLog(document_id=document_id, message=message))


def _norm_text(v: str | None) -> str:
    return (v or "").strip()


def _find_or_create_supplier(
    *,
    db: Session,
    company_id: int,
    vendor_name: str,
    current_user: models.User,
    allow_create: bool,
) -> models.Supplier:
    clean_name = _norm_text(vendor_name)
    if not clean_name:
        raise HTTPException(status_code=400, detail="vendor_name is required.")

    existing = (
        db.query(models.Supplier)
        .filter(
            models.Supplier.company_id == company_id,
            func.lower(models.Supplier.name) == clean_name.lower(),
        )
        .first()
    )
    if existing:
        return existing

    if not allow_create:
        raise HTTPException(status_code=400, detail=f"Supplier not found: {clean_name}")

    creditor_group = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.name == "Sundry Creditors",
        )
        .first()
    )
    if not creditor_group:
        raise HTTPException(status_code=400, detail="Ledger group 'Sundry Creditors' not found for this company")

    ob_type = (
        models.OpeningBalanceType.DEBIT
        if creditor_group.group_type in (models.LedgerGroupType.ASSET, models.LedgerGroupType.EXPENSE)
        else models.OpeningBalanceType.CREDIT
    )
    ledger = models.Ledger(
        company_id=company_id,
        group_id=creditor_group.id,
        name=clean_name,
        code=None,
        opening_balance=0,
        opening_balance_type=ob_type,
        is_active=True,
    )
    db.add(ledger)
    db.flush()

    supplier = models.Supplier(
        company_id=company_id,
        tenant_id=current_user.tenant_id,
        name=clean_name,
        ledger_id=ledger.id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
        is_active=True,
    )
    db.add(supplier)
    db.flush()
    return supplier


def _find_or_create_item(
    *,
    db: Session,
    company_id: int,
    item_name: str,
    unit_price: float,
    allow_create: bool,
) -> models.Item:
    clean_name = _norm_text(item_name)
    if not clean_name:
        raise HTTPException(status_code=400, detail="Item name cannot be empty.")

    existing = (
        db.query(models.Item)
        .filter(
            models.Item.company_id == company_id,
            func.lower(models.Item.name) == clean_name.lower(),
        )
        .first()
    )
    if existing:
        return existing

    if not allow_create:
        raise HTTPException(status_code=400, detail=f"Item not found: {clean_name}")

    item = models.Item(
        company_id=company_id,
        name=clean_name,
        unit="pcs",
        default_purchase_rate=max(float(unit_price or 0), 0),
        is_active=True,
    )
    db.add(item)
    db.flush()
    return item


def _coerce_date(v: str | date | None) -> date:
    if isinstance(v, date):
        return v
    if isinstance(v, str) and v.strip():
        try:
            return datetime.fromisoformat(v.strip()).date()
        except ValueError:
            pass
    return date.today()


def _enforce_tenant_daily_scan_quota(*, db: Session, tenant_id: int) -> None:
    tenant = db.query(models.Tenant).filter(models.Tenant.id == int(tenant_id)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    if not bool(getattr(tenant, "document_scan_enabled", True)):
        raise HTTPException(
            status_code=403,
            detail="Document scanning is disabled for this tenant. Contact superadmin.",
        )

    daily_limit = getattr(tenant, "daily_document_scan_limit", None)
    if daily_limit is None:
        return

    daily_limit = int(daily_limit)
    if daily_limit <= 0:
        raise HTTPException(
            status_code=403,
            detail="Daily document scan limit is set to 0 for this tenant.",
        )

    now = datetime.utcnow()
    start_utc = datetime(now.year, now.month, now.day)
    end_utc = start_utc + timedelta(days=1)

    used = (
        db.query(func.count(models.Document.id))
        .join(models.Company, models.Company.id == models.Document.company_id)
        .filter(
            models.Company.tenant_id == int(tenant_id),
            models.Document.created_at >= start_utc,
            models.Document.created_at < end_utc,
            models.Document.status.in_(
                [models.DocumentStatus.processed, models.DocumentStatus.confirmed]
            ),
        )
        .scalar()
    )
    used = int(used or 0)

    if used >= daily_limit:
        raise HTTPException(
            status_code=429,
            detail=f"Daily document scan limit reached ({daily_limit}) for this tenant.",
        )


@router.post("/upload", response_model=schemas.DocumentRead)
def upload_document(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    tenant_id = int(current_user.tenant_id or company.tenant_id or 0)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context is required for document upload.")

    content = file.file.read()
    size_bytes = len(content)
    validate_upload(
        content_type=file.content_type,
        size_bytes=size_bytes,
        allowed_types={"application/pdf", "image/jpeg", "image/png", "image/jpg"},
        max_bytes=25 * 1024 * 1024,
    )

    original_name = file.filename or "document"
    stored_filename = generate_stored_filename(original_name)
    dest_dir = _documents_upload_dir(tenant_id=tenant_id, company_id=company_id)
    dest_path = dest_dir / stored_filename
    dest_path.write_bytes(content)

    base = get_uploads_base_dir()
    ensure_path_within_base(dest_path, base)

    file_type = "pdf" if (file.content_type or "").lower() == "application/pdf" else "image"
    file_url = f"/uploads/tenants/{tenant_id}/companies/{company_id}/documents/{stored_filename}"

    doc = models.Document(
        company_id=company_id,
        file_url=file_url,
        file_type=file_type,
        status=models.DocumentStatus.uploaded,
        extracted_data=None,
        document_kind=None,
        original_filename=original_name,
        content_type=file.content_type,
        size_bytes=size_bytes,
        uploaded_by=current_user.id,
    )
    db.add(doc)
    db.flush()
    _log(db, document_id=doc.id, message="Document uploaded.")
    db.commit()
    db.refresh(doc)
    return doc


@router.post("/{document_id}/process", response_model=schemas.DocumentRead)
def process_document(
    company_id: int,
    document_id: int,
    payload: schemas.DocumentProcessRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.company_id == company_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    if doc.status == models.DocumentStatus.confirmed and not payload.force:
        raise HTTPException(status_code=400, detail="Document already confirmed and cannot be re-processed.")

    tenant_id = int(current_user.tenant_id or company.tenant_id or 0)
    if not tenant_id:
        raise HTTPException(status_code=400, detail="Tenant context is required for document processing.")
    _enforce_tenant_daily_scan_quota(db=db, tenant_id=tenant_id)

    filename = Path(doc.file_url).name
    file_path = _documents_upload_dir(tenant_id=tenant_id, company_id=company_id) / filename
    ensure_path_within_base(file_path, get_uploads_base_dir())
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Uploaded file not found on disk.")

    # Placeholder OCR input (binary decoded as text). This keeps module ready for OCR engine plug-in.
    text_guess = file_path.read_bytes().decode("utf-8", errors="ignore")
    if len(text_guess) > 20000:
        text_guess = text_guess[:20000]

    try:
        extracted = extract_document_data_with_ai(
            db=db,
            company_id=company_id,
            filename=doc.original_filename or filename,
            content_type=doc.content_type,
            document_text=text_guess,
        )
        doc.extracted_data = extracted
        doc.status = models.DocumentStatus.processed
        doc.document_kind = (extracted.get("document_type") or "").strip().upper() or doc.document_kind
        _log(db, document_id=doc.id, message="Document processed with AI extraction.")
    except HTTPException as exc:
        doc.status = models.DocumentStatus.failed
        _log(db, document_id=doc.id, message=f"AI extraction failed: {exc.detail}")
        db.commit()
        raise

    db.commit()
    db.refresh(doc)
    return doc


@router.get("", response_model=list[schemas.DocumentRead])
def get_documents(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    return (
        db.query(models.Document)
        .filter(models.Document.company_id == company_id)
        .order_by(models.Document.created_at.desc(), models.Document.id.desc())
        .all()
    )


@router.get("/{document_id}", response_model=schemas.DocumentRead)
def get_document_by_id(
    company_id: int,
    document_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.company_id == company_id)
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return doc


@router.post("/{document_id}/confirm", response_model=schemas.DocumentConfirmResponse)
def confirm_document(
    company_id: int,
    document_id: int,
    payload: schemas.DocumentConfirmRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    doc = (
        db.query(models.Document)
        .filter(models.Document.id == document_id, models.Document.company_id == company_id)
        .with_for_update()
        .first()
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.status == models.DocumentStatus.confirmed:
        raise HTTPException(status_code=409, detail="Document already confirmed.")

    ed = payload.extracted_data
    supplier = _find_or_create_supplier(
        db=db,
        company_id=company_id,
        vendor_name=ed.vendor_name or "",
        current_user=current_user,
        allow_create=payload.allow_create_missing_supplier,
    )

    prepared_lines: list[tuple[models.Item, float, float, float]] = []
    for item in (ed.items or []):
        item_name = _norm_text(item.name)
        if not item_name:
            continue
        it = _find_or_create_item(
            db=db,
            company_id=company_id,
            item_name=item_name,
            unit_price=float(item.price or 0),
            allow_create=payload.allow_create_missing_items,
        )
        prepared_lines.append((it, float(item.qty or 0) or 1.0, float(item.price or 0), float(item.tax_rate or 0)))

    if not prepared_lines:
        raise HTTPException(status_code=400, detail="No valid line items found to create transaction.")

    created_type: str
    created_id: int
    created_reference: str | None

    if payload.document_type == "BILL":
        invoice_number = _norm_text(ed.invoice_number)
        if invoice_number:
            duplicate = (
                db.query(models.PurchaseBill.id)
                .filter(
                    models.PurchaseBill.company_id == company_id,
                    func.lower(models.PurchaseBill.reference) == invoice_number.lower(),
                )
                .first()
            )
            if duplicate:
                raise HTTPException(status_code=409, detail=f"Duplicate invoice number detected: {invoice_number}")

        bill_input = schemas.PurchaseBillCreate(
            supplier_id=int(supplier.id),
            date=_coerce_date(ed.invoice_date),
            reference=invoice_number or None,
            lines=[
                schemas.PurchaseBillLine(
                    item_id=int(item.id),
                    quantity=qty,
                    rate=price,
                    discount=0,
                    tax_rate=tax_rate,
                    hs_code=None,
                )
                for item, qty, price, tax_rate in prepared_lines
            ],
        )
        bill = purchases.create_bill(
            company_id=company_id,
            bill_in=bill_input,
            db=db,
            current_user=current_user,
        )
        created_type = "PURCHASE_BILL"
        created_id = int(bill.id)
        created_reference = bill.reference
    else:
        po_input = schemas.PurchaseOrderCreate(
            supplier_id=int(supplier.id),
            date=_coerce_date(ed.invoice_date),
            reference=_norm_text(ed.invoice_number) or None,
            lines=[
                schemas.PurchaseOrderLine(
                    item_id=int(item.id),
                    quantity=qty,
                    rate=price,
                    discount=0,
                    tax_rate=tax_rate,
                    hs_code=None,
                )
                for item, qty, price, tax_rate in prepared_lines
            ],
        )
        po = orders.create_purchase_order(
            company_id=company_id,
            order_in=po_input,
            db=db,
            current_user=current_user,
        )
        created_type = "PURCHASE_ORDER"
        created_id = int(po.id)
        created_reference = po.reference

    doc.extracted_data = payload.extracted_data.model_dump()
    doc.document_kind = payload.document_type
    doc.status = models.DocumentStatus.confirmed
    doc.confirmed_at = datetime.utcnow()
    _log(db, document_id=doc.id, message=f"Document confirmed and converted to {created_type} #{created_id}.")
    db.commit()

    return schemas.DocumentConfirmResponse(
        document_id=int(doc.id),
        status=str(doc.status.value if hasattr(doc.status, "value") else doc.status),
        created_type=created_type,
        created_id=created_id,
        created_reference=created_reference,
    )

