from datetime import date
from contextlib import nullcontext

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks
from sqlalchemy import MetaData, Table, func, text
from sqlalchemy.orm import Session, joinedload, selectinload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..nepali_date import ad_to_bs_str, bs_to_ad_date, get_nepali_fiscal_year
from ..voucher_service import (
    get_next_voucher_number,
    derive_fiscal_year,
    get_voucher_type_prefix,
    get_company_calendar_mode,
)
from . import purchases
from ..dependencies import get_company_secure, validate_transaction_date
from ..services import notification_service


router = APIRouter(prefix="/companies/{company_id}", tags=["vouchers"])


def _compute_sales_invoice_totals_subquery():
    line = models.SalesInvoiceLine
    subtotal = (line.quantity * line.rate) - line.discount
    line_total = subtotal + (subtotal * (line.tax_rate / 100.0))
    return func.coalesce(func.sum(line_total), 0)


def _compute_purchase_bill_totals_subquery():
    line = models.PurchaseBillLine
    subtotal = (line.quantity * line.rate) - line.discount
    line_total = subtotal + (subtotal * (line.tax_rate / 100.0))
    return func.coalesce(func.sum(line_total), 0)


def _voucher_expected_allocation_doc_type(voucher_type: models.VoucherType) -> str:
    if voucher_type == models.VoucherType.PAYMENT:
        return models.AllocationDocType.PURCHASE_BILL.value
    if voucher_type == models.VoucherType.RECEIPT:
        return models.AllocationDocType.SALES_INVOICE.value
    raise HTTPException(status_code=400, detail="Allocations only supported for PAYMENT and RECEIPT vouchers")


def _get_voucher_counterparty_ledger_id(*, voucher: models.Voucher) -> int | None:
    if not getattr(voucher, "lines", None):
        return None
    cash_like_ledger_id = None
    if getattr(voucher, "payment_mode", None) is not None:
        cash_like_ledger_id = getattr(voucher.payment_mode, "ledger_id", None)

    candidate_ids: list[int] = []
    for line in voucher.lines:
        if cash_like_ledger_id is not None and int(line.ledger_id) == int(cash_like_ledger_id):
            continue
        if float(line.debit or 0) > 0 or float(line.credit or 0) > 0:
            candidate_ids.append(int(line.ledger_id))

    if not candidate_ids:
        return None
    if len(set(candidate_ids)) == 1:
        return candidate_ids[0]
    return None


def _get_voucher_by_id_or_number(
    db: Session,
    *,
    company_id: int,
    voucher_id: int,
) -> models.Voucher | None:
    voucher = (
        db.query(models.Voucher)
        .filter(models.Voucher.company_id == company_id, models.Voucher.id == voucher_id)
        .first()
    )
    if voucher is not None:
        return voucher

    # Fallbacks for clients that mistakenly send voucher_sequence or numeric voucher_number
    voucher = (
        db.query(models.Voucher)
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_sequence == voucher_id,
        )
        .first()
    )
    if voucher is not None:
        return voucher

    return (
        db.query(models.Voucher)
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_number == str(voucher_id),
        )
        .first()
    )


def _read_voucher_allocations(
    db: Session,
    *,
    company_id: int,
    voucher_id: int,
) -> list[schemas.VoucherAllocationRead]:
    rows = (
        db.query(models.VoucherAllocation)
        .filter(
            models.VoucherAllocation.company_id == company_id,
            models.VoucherAllocation.voucher_id == voucher_id,
        )
        .order_by(models.VoucherAllocation.id.asc())
        .all()
    )
    if not rows:
        return []

    invoice_ids = [int(r.doc_id) for r in rows if str(r.doc_type) == models.AllocationDocType.SALES_INVOICE.value]
    bill_ids = [int(r.doc_id) for r in rows if str(r.doc_type) == models.AllocationDocType.PURCHASE_BILL.value]

    invoice_numbers: dict[int, str | None] = {}
    if invoice_ids:
        invs = (
            db.query(models.SalesInvoice.id, models.SalesInvoice.reference)
            .filter(models.SalesInvoice.company_id == company_id, models.SalesInvoice.id.in_(invoice_ids))
            .all()
        )
        invoice_numbers = {int(i): (str(ref) if ref is not None else None) for i, ref in invs}

    bill_numbers: dict[int, str | None] = {}
    if bill_ids:
        bills = (
            db.query(models.PurchaseBill.id, models.PurchaseBill.reference)
            .filter(models.PurchaseBill.company_id == company_id, models.PurchaseBill.id.in_(bill_ids))
            .all()
        )
        bill_numbers = {int(i): (str(ref) if ref is not None else None) for i, ref in bills}

    result: list[schemas.VoucherAllocationRead] = []
    for r in rows:
        doc_type = str(r.doc_type)
        doc_id = int(r.doc_id)
        doc_number = None
        if doc_type == models.AllocationDocType.SALES_INVOICE.value:
            doc_number = invoice_numbers.get(doc_id)
        elif doc_type == models.AllocationDocType.PURCHASE_BILL.value:
            doc_number = bill_numbers.get(doc_id)

        result.append(
            schemas.VoucherAllocationRead(
                doc_type=doc_type,
                doc_id=doc_id,
                doc_number=doc_number,
                amount=float(r.allocated_amount),
            )
        )
    return result


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)




def _resolve_voucher_date_for_company(
    db: Session,
    *,
    company_id: int,
    voucher_date: date | None,
    voucher_date_bs: str | None,
) -> date:
    """Return the AD date to store, using BS input if company is in BS mode."""

    calendar_mode = get_company_calendar_mode(db, company_id=company_id)

    if calendar_mode == "BS" and voucher_date_bs:
        ad = bs_to_ad_date(voucher_date_bs)
        if voucher_date is not None and voucher_date != ad:
            raise HTTPException(
                status_code=400,
                detail="voucher_date and voucher_date_bs do not match",
            )
        return ad

    if voucher_date is None:
        raise HTTPException(status_code=400, detail="voucher_date is required")
    return voucher_date


def _voucher_date_bs_for_company(db: Session, *, company_id: int, voucher_date: date) -> str | None:
    calendar_mode = get_company_calendar_mode(db, company_id=company_id)
    if calendar_mode == "BS":
        return ad_to_bs_str(voucher_date)
    return None


def _ensure_party_group(
    db: Session,
    *,
    company_id: int,
    group_name: str,
    group_type: models.LedgerGroupType,
) -> models.LedgerGroup:
    group = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            func.lower(models.LedgerGroup.name) == func.lower(group_name),
        )
        .order_by(models.LedgerGroup.id.asc())
        .first()
    )
    if group is not None:
        if group.name != group_name:
            group.name = group_name
            db.add(group)
        return group

    parent_name = "Current Assets" if group_name == "Sundry Debtors" else "Current Liabilities"
    parent = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            func.lower(models.LedgerGroup.name) == func.lower(parent_name),
        )
        .order_by(models.LedgerGroup.id.asc())
        .first()
    )

    group = models.LedgerGroup(
        company_id=company_id,
        name=group_name,
        group_type=group_type,
        parent_group_id=(parent.id if parent is not None else None),
    )
    db.add(group)
    db.flush()
    return group


def _ensure_party_ledger(
    db: Session,
    *,
    company_id: int,
    party_name: str,
    group: models.LedgerGroup,
) -> models.Ledger:
    if group.group_type in (models.LedgerGroupType.ASSET, models.LedgerGroupType.EXPENSE):
        ob_type = models.OpeningBalanceType.DEBIT
    else:
        ob_type = models.OpeningBalanceType.CREDIT

    ledger = models.Ledger(
        company_id=company_id,
        group_id=group.id,
        name=party_name,
        code=None,
        opening_balance=0,
        opening_balance_type=ob_type,
        is_active=True,
    )
    db.add(ledger)
    db.flush()
    return ledger


def _collect_descendant_group_ids(db: Session, *, company_id: int, root_group_id: int) -> list[int]:
    groups = (
        db.query(models.LedgerGroup.id, models.LedgerGroup.parent_group_id)
        .filter(models.LedgerGroup.company_id == company_id)
        .all()
    )

    children_by_parent: dict[int, list[int]] = {}
    for gid, parent_id in groups:
        if parent_id is None:
            continue
        children_by_parent.setdefault(int(parent_id), []).append(int(gid))

    result: list[int] = []
    stack = [int(root_group_id)]
    seen: set[int] = set()
    while stack:
        current = stack.pop()
        if current in seen:
            continue
        seen.add(current)
        result.append(current)
        stack.extend(children_by_parent.get(current, []))

    return result


def _find_existing_party_ledger(
    db: Session,
    *,
    company_id: int,
    party_name: str,
    allowed_group_ids: list[int],
) -> models.Ledger | None:
    return (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id.in_(allowed_group_ids),
            func.lower(models.Ledger.name) == func.lower(str(party_name).strip()),
        )
        .order_by(models.Ledger.id.asc())
        .first()
    )


def _validate_lines(lines: list[schemas.VoucherLineCreate]) -> None:
    total_debit = sum(l.debit for l in lines)
    total_credit = sum(l.credit for l in lines)
    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(status_code=400, detail="Voucher not balanced (debits != credits)")


@router.get(
    "/vouchers/counterparty-ledgers",
    response_model=list[schemas.LedgerCounterpartyRead],
)
def list_counterparty_ledgers(
    company_id: int,
    request: Request,
    voucher_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    # Read voucher_type from raw query params to avoid FastAPI 422 errors when
    # clients send duplicate query params or odd casing.
    raw_values = request.query_params.getlist("voucher_type")
    raw = None
    for v in raw_values:
        if isinstance(v, str) and v.strip():
            raw = v
            break
    if raw is None:
        raw = voucher_type

    try:
        voucher_type_enum = models.VoucherType(str(raw or "").strip().upper())
    except Exception:
        raise HTTPException(status_code=400, detail="voucher_type must be PAYMENT or RECEIPT")

    if voucher_type_enum == models.VoucherType.PAYMENT:
        group = _ensure_party_group(
            db,
            company_id=company_id,
            group_name="Sundry Creditors",
            group_type=models.LedgerGroupType.LIABILITY,
        )

        group_ids = _collect_descendant_group_ids(db, company_id=company_id, root_group_id=group.id)
        suppliers = db.query(models.Supplier).filter(models.Supplier.company_id == company_id).all()

        # Batch-fetch all ledgers for these suppliers in a single query
        supplier_ledger_ids = [s.ledger_id for s in suppliers if s.ledger_id is not None]
        existing_ledger_map: dict[int, models.Ledger] = {}
        if supplier_ledger_ids:
            rows = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.id.in_(supplier_ledger_ids),
                    models.Ledger.company_id == company_id,
                )
                .all()
            )
            existing_ledger_map = {l.id: l for l in rows}

        changed = False
        for supplier in suppliers:
            current_ledger: models.Ledger | None = (
                existing_ledger_map.get(supplier.ledger_id) if supplier.ledger_id is not None else None
            )

            supplier_name = (supplier.name or "").strip()
            needs_relink = (
                current_ledger is None
                or current_ledger.group_id not in group_ids
                or (supplier_name and current_ledger.name.strip().lower() != supplier_name.lower())
            )

            if needs_relink:
                existing = _find_existing_party_ledger(
                    db,
                    company_id=company_id,
                    party_name=supplier.name,
                    allowed_group_ids=group_ids,
                )
                ledger = existing or _ensure_party_ledger(
                    db,
                    company_id=company_id,
                    party_name=supplier.name,
                    group=group,
                )
                supplier.ledger_id = ledger.id
                db.add(supplier)
                changed = True
        if changed:
            db.commit()

        # Eager-load group to avoid per-row lazy queries on l.group.name
        ledgers = (
            db.query(models.Ledger)
            .join(models.LedgerGroup, models.LedgerGroup.id == models.Ledger.group_id)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.is_active == True,
                models.LedgerGroup.group_type.in_([models.LedgerGroupType.LIABILITY, models.LedgerGroupType.ASSET]),
            )
            .options(joinedload(models.Ledger.group))
            .order_by(models.Ledger.name)
            .all()
        )
        return [
            schemas.LedgerCounterpartyRead(
                id=l.id,
                name=l.name,
                group_id=l.group_id,
                group_name=l.group.name if l.group else None,
            )
            for l in ledgers
        ]

    if voucher_type_enum == models.VoucherType.RECEIPT:
        group = _ensure_party_group(
            db,
            company_id=company_id,
            group_name="Sundry Debtors",
            group_type=models.LedgerGroupType.ASSET,
        )

        group_ids = _collect_descendant_group_ids(db, company_id=company_id, root_group_id=group.id)
        customers = db.query(models.Customer).filter(models.Customer.company_id == company_id).all()

        # Batch-fetch all ledgers for these customers in a single query
        customer_ledger_ids = [c.ledger_id for c in customers if c.ledger_id is not None]
        existing_customer_ledger_map: dict[int, models.Ledger] = {}
        if customer_ledger_ids:
            rows = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.id.in_(customer_ledger_ids),
                    models.Ledger.company_id == company_id,
                )
                .all()
            )
            existing_customer_ledger_map = {l.id: l for l in rows}

        changed = False
        for customer in customers:
            current_ledger: models.Ledger | None = (
                existing_customer_ledger_map.get(customer.ledger_id) if customer.ledger_id is not None else None
            )

            customer_name = (customer.name or "").strip()
            needs_relink = (
                current_ledger is None
                or current_ledger.group_id not in group_ids
                or (customer_name and current_ledger.name.strip().lower() != customer_name.lower())
            )

            if needs_relink:
                existing = _find_existing_party_ledger(
                    db,
                    company_id=company_id,
                    party_name=customer.name,
                    allowed_group_ids=group_ids,
                )
                ledger = existing or _ensure_party_ledger(
                    db,
                    company_id=company_id,
                    party_name=customer.name,
                    group=group,
                )
                customer.ledger_id = ledger.id
                db.add(customer)
                changed = True
        if changed:
            db.commit()

        # Eager-load group to avoid per-row lazy queries on l.group.name
        ledgers = (
            db.query(models.Ledger)
            .join(models.LedgerGroup, models.LedgerGroup.id == models.Ledger.group_id)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.is_active == True,
                models.LedgerGroup.group_type.in_([models.LedgerGroupType.LIABILITY, models.LedgerGroupType.ASSET]),
            )
            .options(joinedload(models.Ledger.group))
            .order_by(models.Ledger.name)
            .all()
        )
        return [
            schemas.LedgerCounterpartyRead(
                id=l.id,
                name=l.name,
                group_id=l.group_id,
                group_name=l.group.name if l.group else None,
            )
            for l in ledgers
        ]

    raise HTTPException(status_code=400, detail="voucher_type must be PAYMENT or RECEIPT")


def _validate_cost_centers(company: models.Company, line: schemas.VoucherLineBase) -> None:
    """Enforce per-company cost center mode.

    Modes:
    - None (default): cost centers disabled; department_id and project_id must be null.
    - "single": only one dimension is active (department OR project).
    - "double": both department_id and project_id are allowed on the same line.
    """

    mode = company.cost_center_mode
    single_dim = company.cost_center_single_dimension

    # Cost centers disabled
    if mode is None:
        if (
            line.department_id is not None
            or line.project_id is not None
            or line.segment_id is not None
        ):
            raise HTTPException(
                status_code=400,
                detail="Cost centers are disabled for this company",
            )
        return

    if mode == "single":
        if single_dim == "department":
            if line.project_id is not None or line.segment_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail="Only Department can be set in single-department cost center mode",
                )
        elif single_dim == "project":
            if line.department_id is not None or line.segment_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail="Only Project can be set in single-project cost center mode",
                )
        elif single_dim == "segment":
            if line.department_id is not None or line.project_id is not None:
                raise HTTPException(
                    status_code=400,
                    detail="Only Segment can be set in single-segment cost center mode",
                )
    elif mode == "double":
        # Traditionally department + project. 
        # If segment is set, we might want to block it or allow it if we generalize double.
        # For now, let's allow any two? Or stick to specific pairs?
        # The user just said "add segment", so let's allow segment in double too if they want?
        # Actually, let's just make it "at most two" for double mode?
        dims = [line.department_id, line.project_id, line.segment_id]
        active_dims = [d for d in dims if d is not None]
        if len(active_dims) > 2:
            raise HTTPException(
                status_code=400,
                detail="At most two cost center dimensions are allowed in double-dimension mode",
            )
    elif mode == "triple":
        # All three allowed
        pass


def _derive_fiscal_year(db: Session, *, company_id: int, voucher_date: date) -> str:
    return derive_fiscal_year(db, company_id=company_id, voucher_date=voucher_date)


def _voucher_type_prefix(voucher_type: models.VoucherType) -> str:
    return get_voucher_type_prefix(voucher_type)




def _build_voucher_diff(old: dict, new: dict):
    changes: list[str] = []
    diff: dict[str, dict] = {}

    for key, old_val in old.items():
        new_val = new.get(key)
        if old_val != new_val:
            changes.append(f"{key} {old_val}  {new_val}")
            diff[key] = {"old": str(old_val), "new": str(new_val)}

    summary = ", ".join(changes) if changes else "No visible field changes"
    return summary, (diff or None)


def _log_voucher_action(
    db: Session,
    *,
    tenant_id: int,
    company_id: int,
    voucher: models.Voucher,
    action: models.VoucherAction,
    actor: str | None,
    summary: str,
    diff_json: dict | None = None,
) -> None:
    log = models.VoucherLog(
        tenant_id=tenant_id,
        company_id=company_id,
        voucher_id=voucher.id,
        voucher_number=voucher.voucher_number,
        action=action,
        actor=actor,
        summary=summary,
        diff_json=diff_json,
    )
    db.add(log)


def _compute_voucher_total(db: Session, company_id: int, voucher: models.Voucher) -> float:
    """Compute a human-friendly total amount for a voucher."""

    # Priority 1: Linked business documents (PurchaseBill or SalesInvoice).
    # This prevents "doubling" of totals in cash-settled transactions where
    # both the bill and the settlement are recorded in the same voucher.
    
    # Check purchase bills
    bill = (
        db.query(models.PurchaseBill)
        .filter(
            models.PurchaseBill.company_id == company_id,
            models.PurchaseBill.voucher_id == voucher.id,
        )
        .first()
    )
    if bill is not None:
        grand_total = 0.0
        # If the bill has stored lines, sum them up.
        if bill.lines:
            for line in bill.lines:
                subtotal = float(line.quantity) * float(line.rate) - float(line.discount)
                tax = subtotal * float(line.tax_rate) / 100.0
                grand_total += subtotal + tax
            return grand_total
        # If no lines (unlikely for a bill but possible in some states), 
        # fall back to lines check below.

    # Check sales invoices
    invoice = (
        db.query(models.SalesInvoice)
        .filter(
            models.SalesInvoice.company_id == company_id,
            models.SalesInvoice.voucher_id == voucher.id,
        )
        .first()
    )
    if invoice is not None:
        grand_total = 0.0
        if invoice.lines:
            for line in invoice.lines:
                subtotal = float(line.quantity) * float(line.rate) - float(line.discount)
                tax = subtotal * float(line.tax_rate) / 100.0
                grand_total += subtotal + tax
            return grand_total

    # Priority 2: Sum of voucher lines (standard for manual vouchers).
    total_debit = sum(float(l.debit or 0) for l in voucher.lines)
    total_credit = sum(float(l.credit or 0) for l in voucher.lines)
    if total_debit or total_credit:
        return max(total_debit, total_credit)


    return 0.0


def _compute_voucher_origin(db: Session, company_id: int, voucher: models.Voucher) -> tuple[str | None, int | None]:
    """Determine the origin document of a voucher, if any.

    Currently supports:
    - PurchaseBill: origin_type='PURCHASE_BILL', origin_id=bill.id
    - SalesInvoice: origin_type='SALES_INVOICE', origin_id=invoice.id
    """

    # Check purchase bills first
    bill = (
        db.query(models.PurchaseBill)
        .filter(
            models.PurchaseBill.company_id == company_id,
            models.PurchaseBill.voucher_id == voucher.id,
        )
        .first()
    )
    if bill is not None:
        return "PURCHASE_BILL", bill.id

    # Then check sales invoices
    invoice = (
        db.query(models.SalesInvoice)
        .filter(
            models.SalesInvoice.company_id == company_id,
            models.SalesInvoice.voucher_id == voucher.id,
        )
        .first()
    )
    if invoice is not None:
        return "SALES_INVOICE", invoice.id

    return None, None


@router.get("/vouchers", response_model=list[schemas.VoucherRead])
def list_vouchers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    vouchers = (
        db.query(models.Voucher)
        .options(
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.department),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.project),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.segment),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.employee),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.department),
            joinedload(models.Voucher.project),
            joinedload(models.Voucher.segment),
            joinedload(models.Voucher.employee),
            joinedload(models.Voucher.sales_invoice).selectinload(models.SalesInvoice.lines).joinedload(models.SalesInvoiceLine.item),
            joinedload(models.Voucher.purchase_bill).selectinload(models.PurchaseBill.lines).joinedload(models.PurchaseBillLine.item),
        )
        .filter(models.Voucher.company_id == company_id)
        .order_by(models.Voucher.voucher_date.desc(), models.Voucher.id.desc())
        .all()
    )

    results: list[schemas.VoucherRead] = []
    for v in vouchers:
        total_amount = _compute_voucher_total(db, company_id, v)
        origin_type, origin_id = _compute_voucher_origin(db, company_id, v)
        allocations = _read_voucher_allocations(db, company_id=company_id, voucher_id=v.id)
        
        # Extract item details if available
        voucher_items = []
        if v.sales_invoice and v.sales_invoice.lines:
            for il in v.sales_invoice.lines:
                voucher_items.append(
                    schemas.VoucherItemRead(
                        item_id=il.item_id,
                        item_name=il.item.name if il.item else None,
                        quantity=float(il.quantity),
                        unit=getattr(il.item, 'unit', None),
                        rate=float(il.rate),
                        amount=float(il.quantity) * float(il.rate)
                    )
                )
        elif v.purchase_bill and v.purchase_bill.lines:
            for il in v.purchase_bill.lines:
                voucher_items.append(
                    schemas.VoucherItemRead(
                        item_id=il.item_id,
                        item_name=il.item.name if il.item else None,
                        quantity=float(il.quantity),
                        unit=getattr(il.item, 'unit', None),
                        rate=float(il.rate),
                        amount=float(il.quantity) * float(il.rate)
                    )
                )

        results.append(
            schemas.VoucherRead(
                id=v.id,
                company_id=v.company_id,
                voucher_date=v.voucher_date,
                voucher_date_bs=_voucher_date_bs_for_company(
                    db,
                    company_id=company_id,
                    voucher_date=v.voucher_date,
                ),
                voucher_type=v.voucher_type,
                narration=v.narration,
                payment_mode_id=v.payment_mode_id,
                department_id=v.department_id,
                project_id=v.project_id,
                segment_id=v.segment_id,
                employee_id=v.employee_id,
                bank_remark=v.bank_remark,
                payment_mode=(v.payment_mode.name if getattr(v, "payment_mode", None) is not None else None),
                department_name=(v.department.name if getattr(v, "department", None) is not None else None),
                project_name=(v.project.name if getattr(v, "project", None) is not None else None),
                segment_name=(v.segment.name if getattr(v, "segment", None) is not None else None),
                employee_name=(v.employee.full_name if getattr(v, "employee", None) is not None else None),
                fiscal_year=v.fiscal_year,
                voucher_sequence=v.voucher_sequence,
                voucher_number=v.voucher_number,
                created_at=v.created_at,
                updated_at=v.updated_at,
                lines=[
                    schemas.VoucherLineRead(
                        id=line.id,
                        ledger_id=line.ledger_id,
                        debit=float(line.debit),
                        credit=float(line.credit),
                        ledger_name=line.ledger.name if line.ledger is not None else None,
                        department_id=line.department_id,
                        project_id=line.project_id,
                        segment_id=line.segment_id,
                        employee_id=line.employee_id,
                        remarks=line.remarks,
                        department_name=(
                            line.department.name if getattr(line, "department", None) is not None else None
                        ),
                        project_name=(
                            line.project.name if getattr(line, "project", None) is not None else None
                        ),
                        segment_name=(
                            line.segment.name if getattr(line, "segment", None) is not None else None
                        ),
                        employee_name=(
                            line.employee.full_name if getattr(line, "employee", None) is not None else None
                        ),
                        related_ledgers=", ".join([
                            l.ledger.name for l in v.lines
                            if l.id != line.id and l.ledger is not None
                        ])
                    )
                    for line in v.lines
                ],
                total_amount=total_amount,
                origin_type=origin_type,
                origin_id=origin_id,
                allocations=allocations,
                items=voucher_items
            )
        )

    return results


def _create_voucher_impl(
    company_id: int,
    voucher_in: schemas.VoucherCreate,
    db: Session,
    current_user: models.User,
) -> schemas.VoucherRead:
    company = _get_company(db, company_id, current_user)
    _validate_lines(voucher_in.lines)

    # The Python VoucherType enum includes additional values such as
    # SALES_INVOICE, PURCHASE_BILL, etc., but the underlying PostgreSQL
    # enum used by the vouchers.voucher_type column may not yet have
    # been migrated to include them. When that happens, sending one of
    # those newer values causes a psycopg2 InvalidTextRepresentation
    # error when SQLAlchemy binds the enum value.
    #
    # To avoid leaking a 500 error, we explicitly restrict this endpoint
    # to the core voucher types that are known to be supported by the
    # current database schema.
    core_supported_types = {
        models.VoucherType.PAYMENT,
        models.VoucherType.RECEIPT,
        models.VoucherType.CONTRA,
        models.VoucherType.JOURNAL,
    }
    if voucher_in.voucher_type not in core_supported_types:
        raise HTTPException(
            status_code=400,
            detail=(
                "This server does not yet support creating manual vouchers "
                f"with voucher_type '{voucher_in.voucher_type.value}'. "
                "Use PAYMENT, RECEIPT, CONTRA, or JOURNAL for this endpoint."
            ),
        )

    voucher_date_ad = _resolve_voucher_date_for_company(
        db,
        company_id=company_id,
        voucher_date=voucher_in.voucher_date,
        voucher_date_bs=voucher_in.voucher_date_bs,
    )

    fiscal_year = _derive_fiscal_year(db, company_id=company_id, voucher_date=voucher_date_ad)

    # Validate payment_mode_id for cash/bank type vouchers
    if voucher_in.voucher_type in (
        models.VoucherType.PAYMENT,
        models.VoucherType.RECEIPT,
        models.VoucherType.CONTRA,
    ):
        if voucher_in.payment_mode_id is None:
            raise HTTPException(
                status_code=400,
                detail="payment_mode_id is required for this voucher type",
            )

    payment_mode: models.PaymentMode | None = None
    if voucher_in.payment_mode_id is not None:
        payment_mode = (
            db.query(models.PaymentMode)
            .filter(
                models.PaymentMode.id == voucher_in.payment_mode_id,
                models.PaymentMode.company_id == company_id,
                models.PaymentMode.is_active == True,
            )
            .first()
        )
        if not payment_mode:
            raise HTTPException(status_code=400, detail="Invalid payment_mode_id")

    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db, company_id, voucher_in.voucher_type, voucher_date_ad
    )

    voucher = models.Voucher(
        company_id=company_id,
        voucher_date=voucher_date_ad,
        voucher_type=voucher_in.voucher_type,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=voucher_in.narration,
        payment_mode_id=voucher_in.payment_mode_id,
        department_id=voucher_in.department_id,
        project_id=voucher_in.project_id,
        segment_id=voucher_in.segment_id,
        employee_id=voucher_in.employee_id,
        bank_remark=voucher_in.bank_remark,
        bill_date=voucher_in.bill_date,
    )
    db.add(voucher)
    db.flush()

    _log_voucher_action(
        db,
        tenant_id=company.tenant_id,
        company_id=company_id,
        voucher=voucher,
        action=models.VoucherAction.CREATED,
        actor=current_user.email,
        summary="Voucher created",
        diff_json=None,
    )

    header_employee_id = voucher_in.employee_id
    header_remarks = voucher_in.narration
    for line in voucher_in.lines:
        _validate_cost_centers(company, line)
        line_employee_id = (
            line.employee_id if line.employee_id is not None else header_employee_id
        )
        line_remarks = line.remarks if line.remarks not in (None, "") else header_remarks
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=line.ledger_id,
                debit=line.debit,
                credit=line.credit,
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line_employee_id,
                remarks=line_remarks,
            )
        )

    # Flush all pending line INSERTs so the subsequent joinedload query can see them.
    # Session uses autoflush=False, so an explicit flush is required here.
    db.flush()

    # Eagerly load lines with their relationships to ensure they're available in the response
    voucher = (
        db.query(models.Voucher)
        .options(
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.department),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.project),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.segment),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.employee),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.department),
            joinedload(models.Voucher.project),
            joinedload(models.Voucher.segment),
            joinedload(models.Voucher.employee),
        )
        .filter(models.Voucher.id == voucher.id)
        .first()
    )

    total_amount = _compute_voucher_total(db, company_id, voucher)
    allocations = _read_voucher_allocations(db, company_id=company_id, voucher_id=voucher.id)
    origin_type, origin_id = _compute_voucher_origin(db, company_id, voucher)

    return schemas.VoucherRead(
        id=voucher.id,
        company_id=voucher.company_id,
        voucher_date=voucher.voucher_date,
        voucher_date_bs=_voucher_date_bs_for_company(db, company_id=company_id, voucher_date=voucher.voucher_date),
        voucher_type=voucher.voucher_type,
        narration=voucher.narration,
        payment_mode_id=voucher.payment_mode_id,
        department_id=voucher.department_id,
        project_id=voucher.project_id,
        segment_id=voucher.segment_id,
        employee_id=voucher.employee_id,
        bank_remark=voucher.bank_remark,
        payment_mode=(voucher.payment_mode.name if getattr(voucher, "payment_mode", None) is not None else None),
        department_name=(voucher.department.name if getattr(voucher, "department", None) is not None else None),
        project_name=(voucher.project.name if getattr(voucher, "project", None) is not None else None),
        segment_name=(voucher.segment.name if getattr(voucher, "segment", None) is not None else None),
        employee_name=(voucher.employee.full_name if getattr(voucher, "employee", None) is not None else None),
        fiscal_year=voucher.fiscal_year,
        voucher_sequence=voucher.voucher_sequence,
        voucher_number=voucher.voucher_number,
        created_at=voucher.created_at,
        updated_at=voucher.updated_at,
        lines=[
            schemas.VoucherLineRead(
                id=line.id,
                ledger_id=line.ledger_id,
                debit=float(line.debit),
                credit=float(line.credit),
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line.employee_id,
                remarks=line.remarks,
                ledger_name=line.ledger.name if line.ledger is not None else None,
                department_name=(
                    line.department.name if getattr(line, "department", None) is not None else None
                ),
                project_name=(
                    line.project.name if getattr(line, "project", None) is not None else None
                ),
                segment_name=(
                    line.segment.name if getattr(line, "segment", None) is not None else None
                ),
                employee_name=(
                    line.employee.full_name if getattr(line, "employee", None) is not None else None
                ),
            )
            for line in voucher.lines
        ],
        total_amount=total_amount,
        origin_type=origin_type,
        origin_id=origin_id,
        allocations=allocations,
    )


@router.post("/vouchers", response_model=schemas.VoucherRead)
def create_voucher(
    company_id: int,
    voucher_in: schemas.VoucherCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        result = _create_voucher_impl(company_id, voucher_in, db, current_user)
        db.commit()
        
        # Trigger notification if it's a receipt
        if voucher_in.voucher_type == models.VoucherType.RECEIPT:
            background_tasks.add_task(notification_service.notify_payment_received, db, result.id)
            
        return result
    except Exception:
        db.rollback()
        raise


@router.get(
    "/vouchers/party-dues",
    response_model=schemas.PartyDuesResponse,
)
def list_party_dues(
    company_id: int,
    voucher_type: str = Query(...),
    counterparty_ledger_id: int = Query(...),
    status: str = Query("OUTSTANDING"),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    try:
        vt = models.VoucherType(str(voucher_type).strip().upper())
    except Exception:
        raise HTTPException(status_code=400, detail="voucher_type must be PAYMENT or RECEIPT")

    if vt not in (models.VoucherType.RECEIPT, models.VoucherType.PAYMENT):
        raise HTTPException(status_code=400, detail="voucher_type must be PAYMENT or RECEIPT")

    if str(status or "").strip().upper() not in ("OUTSTANDING", ""):
        raise HTTPException(status_code=400, detail="status must be OUTSTANDING")

    offset = (int(page) - 1) * int(page_size)

    # 1. Calculate true ledger balance for the requested counterparty ledger
    lid = int(counterparty_ledger_id)
    l = db.query(models.Ledger).filter(models.Ledger.id == lid).first()
    if not l:
        return schemas.PartyDuesResponse(results=[], count=0)
        
    vl_sum = (
        db.query(
            func.sum(models.VoucherLine.debit).label("total_debit"),
            func.sum(models.VoucherLine.credit).label("total_credit"),
        )
        .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
        .filter(
            models.VoucherLine.ledger_id == lid,
            models.Voucher.company_id == company_id
        )
        .first()
    )
    
    total_debit = float(vl_sum.total_debit or 0)
    total_credit = float(vl_sum.total_credit or 0)

    if vt == models.VoucherType.RECEIPT:
        ob = float(l.opening_balance or 0)
        if l.opening_balance_type == models.OpeningBalanceType.CREDIT:
            ob = -ob
        closing_balance = ob + total_debit - total_credit
        
        invoice_total = _compute_sales_invoice_totals_subquery().label("total_amount")
        paid_subq = (
            db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
            .filter(
                models.VoucherAllocation.company_id == company_id,
                models.VoucherAllocation.doc_type == models.AllocationDocType.SALES_INVOICE.value,
                models.VoucherAllocation.doc_id == models.SalesInvoice.id,
            )
            .correlate(models.SalesInvoice)
            .scalar_subquery()
        )

        base = (
            db.query(
                models.SalesInvoice.id.label("doc_id"),
                models.SalesInvoice.date.label("doc_date"),
                models.SalesInvoice.reference.label("doc_number"),
                models.Customer.name.label("party_name"),
                models.Customer.ledger_id.label("party_ledger_id"),
                invoice_total,
                paid_subq.label("explicit_paid_amount"),
            )
            .join(models.Customer, models.Customer.id == models.SalesInvoice.customer_id)
            .join(models.SalesInvoiceLine, models.SalesInvoiceLine.invoice_id == models.SalesInvoice.id)
            .filter(models.SalesInvoice.company_id == company_id)
            .filter(models.Customer.ledger_id == lid)
            .group_by(models.SalesInvoice.id, models.Customer.id)
            .order_by(models.SalesInvoice.date.asc(), models.SalesInvoice.id.asc())
        )
        if search:
            s = f"%{str(search).strip()}%"
            base = base.filter(models.SalesInvoice.reference.ilike(s))

        rows = base.all()
        
        total_billed = sum(float(r.total_amount) for r in rows)
        total_explicit = sum(float(r.explicit_paid_amount) for r in rows)
        unallocated_pool = max(0.0, (total_billed + ob) - closing_balance - total_explicit)

        dues = []
        for r in rows:
            total_amount = float(r.total_amount)
            explicit_paid = float(r.explicit_paid_amount)
            paid = explicit_paid
            remaining = max(0.0, total_amount - paid)
            
            if remaining > 0 and unallocated_pool > 0:
                applied = min(remaining, unallocated_pool)
                paid += applied
                unallocated_pool -= applied
                
            outstanding = total_amount - paid
            if outstanding <= 0:
                continue
                
            dues.append(
                schemas.PartyDueItem(
                    doc_type=models.AllocationDocType.SALES_INVOICE.value,
                    doc_id=int(r.doc_id),
                    doc_number=str(r.doc_number or f"SI-{int(r.doc_id)}"),
                    date=r.doc_date,
                    reference=None,
                    party_ledger_id=int(r.party_ledger_id),
                    party_name=str(r.party_name or ""),
                    total_amount=total_amount,
                    paid_amount=paid,
                    outstanding_amount=outstanding,
                    currency=getattr(company, "currency", None),
                )
            )

        count = len(dues)
        paged = dues[offset : offset + int(page_size)]
        return schemas.PartyDuesResponse(results=paged, count=count)

    # For PAYMENT (Purchases)
    ob = float(l.opening_balance or 0)
    if l.opening_balance_type == models.OpeningBalanceType.DEBIT:
        ob = -ob
    # Creditor balance: Credit increases, Debit decreases
    closing_balance = ob + total_credit - total_debit

    bill_total = _compute_purchase_bill_totals_subquery().label("total_amount")
    paid_subq = (
        db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
        .filter(
            models.VoucherAllocation.company_id == company_id,
            models.VoucherAllocation.doc_type == models.AllocationDocType.PURCHASE_BILL.value,
            models.VoucherAllocation.doc_id == models.PurchaseBill.id,
        )
        .correlate(models.PurchaseBill)
        .scalar_subquery()
    )

    base = (
        db.query(
            models.PurchaseBill.id.label("doc_id"),
            models.PurchaseBill.date.label("doc_date"),
            models.PurchaseBill.reference.label("doc_number"),
            models.Supplier.name.label("party_name"),
            models.Supplier.ledger_id.label("party_ledger_id"),
            bill_total,
            paid_subq.label("explicit_paid_amount"),
        )
        .join(models.Supplier, models.Supplier.id == models.PurchaseBill.supplier_id)
        .join(models.PurchaseBillLine, models.PurchaseBillLine.bill_id == models.PurchaseBill.id)
        .filter(models.PurchaseBill.company_id == company_id)
        .filter(models.Supplier.ledger_id == lid)
        .group_by(models.PurchaseBill.id, models.Supplier.id)
        .order_by(models.PurchaseBill.date.asc(), models.PurchaseBill.id.asc())
    )
    if search:
        s = f"%{str(search).strip()}%"
        base = base.filter(models.PurchaseBill.reference.ilike(s))

    rows = base.all()
    
    total_billed = sum(float(r.total_amount) for r in rows)
    total_explicit = sum(float(r.explicit_paid_amount) for r in rows)
    unallocated_pool = max(0.0, (total_billed + ob) - closing_balance - total_explicit)

    dues = []
    for r in rows:
        total_amount = float(r.total_amount)
        explicit_paid = float(r.explicit_paid_amount)
        paid = explicit_paid
        remaining = max(0.0, total_amount - paid)
        
        if remaining > 0 and unallocated_pool > 0:
            applied = min(remaining, unallocated_pool)
            paid += applied
            unallocated_pool -= applied
            
        outstanding = total_amount - paid
        if outstanding <= 0:
            continue
            
        dues.append(
            schemas.PartyDueItem(
                doc_type=models.AllocationDocType.PURCHASE_BILL.value,
                doc_id=int(r.doc_id),
                doc_number=str(r.doc_number or f"PB-{int(r.doc_id)}"),
                date=r.doc_date,
                reference=None,
                party_ledger_id=int(r.party_ledger_id),
                party_name=str(r.party_name or ""),
                total_amount=total_amount,
                paid_amount=paid,
                outstanding_amount=outstanding,
                currency=getattr(company, "currency", None),
            )
        )

    count = len(dues)
    paged = dues[offset : offset + int(page_size)]
    return schemas.PartyDuesResponse(results=paged, count=count)


@router.get(
    "/outstanding/purchase-bills",
    response_model=list[schemas.OutstandingDocumentRead],
)
def list_outstanding_purchase_bills(
    company_id: int,
    counterparty_ledger_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    lid = int(counterparty_ledger_id)
    l = db.query(models.Ledger).filter(models.Ledger.id == lid).first()
    if not l:
        return []
    
    ob = float(l.opening_balance or 0)
    if l.opening_balance_type == models.OpeningBalanceType.DEBIT:
        ob = -ob
        
    vl_sum = (
        db.query(
            func.sum(models.VoucherLine.debit).label("total_debit"),
            func.sum(models.VoucherLine.credit).label("total_credit"),
        )
        .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
        .filter(
            models.VoucherLine.ledger_id == lid,
            models.Voucher.company_id == company_id
        )
        .first()
    )
    closing_balance = ob + float(vl_sum.total_credit or 0) - float(vl_sum.total_debit or 0)

    bill_total = _compute_purchase_bill_totals_subquery().label("total_amount")
    paid_subq = (
        db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
        .filter(
            models.VoucherAllocation.company_id == company_id,
            models.VoucherAllocation.doc_type == models.AllocationDocType.PURCHASE_BILL.value,
            models.VoucherAllocation.doc_id == models.PurchaseBill.id,
        )
        .correlate(models.PurchaseBill)
        .scalar_subquery()
    )

    rows = (
        db.query(
            models.PurchaseBill.id.label("doc_id"),
            models.PurchaseBill.date.label("doc_date"),
            models.PurchaseBill.reference.label("doc_reference"),
            models.Supplier.id.label("party_id"),
            models.Supplier.name.label("party_name"),
            bill_total,
            paid_subq.label("explicit_paid_amount"),
            models.Voucher.voucher_number.label("v_number"),
        )
        .join(models.Supplier, models.Supplier.id == models.PurchaseBill.supplier_id)
        .join(models.PurchaseBillLine, models.PurchaseBillLine.bill_id == models.PurchaseBill.id)
        .outerjoin(models.Voucher, models.Voucher.id == models.PurchaseBill.voucher_id)
        .filter(models.PurchaseBill.company_id == company_id)
        .filter(models.Supplier.ledger_id == lid)
        .group_by(models.PurchaseBill.id, models.Supplier.id, models.Voucher.id)
        .order_by(models.PurchaseBill.date.asc(), models.PurchaseBill.id.asc())
        .all()
    )

    total_billed = sum(float(r.total_amount) for r in rows)
    total_explicit = sum(float(r.explicit_paid_amount) for r in rows)
    unallocated_pool = max(0.0, (total_billed + ob) - closing_balance - total_explicit)

    result: list[schemas.OutstandingDocumentRead] = []
    for r in rows:
        total_amount = float(r.total_amount)
        explicit_paid = float(r.explicit_paid_amount)
        
        paid = explicit_paid
        remaining = max(0.0, total_amount - paid)
        
        if remaining > 0 and unallocated_pool > 0:
            applied = min(remaining, unallocated_pool)
            paid += applied
            unallocated_pool -= applied
            
        outstanding = total_amount - paid
        
        if outstanding <= 0:
            continue
        
        doc_num = r.v_number if r.v_number else f"PB-{int(r.doc_id)}"
        
        result.append(
            schemas.OutstandingDocumentRead(
                doc_type=models.AllocationDocType.PURCHASE_BILL.value,
                id=int(r.doc_id),
                number=doc_num,
                reference=(str(r.doc_reference) if r.doc_reference else None),
                date=r.doc_date,
                party_id=int(r.party_id),
                party_name=str(r.party_name or ""),
                total_amount=total_amount,
                paid_amount=paid,
                outstanding_amount=outstanding,
                currency=getattr(company, "currency", None),
            )
        )
    return result


@router.get(
    "/outstanding/sales-invoices",
    response_model=list[schemas.OutstandingDocumentRead],
)
def list_outstanding_sales_invoices(
    company_id: int,
    counterparty_ledger_id: int = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    lid = int(counterparty_ledger_id)
    l = db.query(models.Ledger).filter(models.Ledger.id == lid).first()
    if not l:
        return []
        
    ob = float(l.opening_balance or 0)
    if l.opening_balance_type == models.OpeningBalanceType.CREDIT:
        ob = -ob

    vl_sum = (
        db.query(
            func.sum(models.VoucherLine.debit).label("total_debit"),
            func.sum(models.VoucherLine.credit).label("total_credit"),
        )
        .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
        .filter(
            models.VoucherLine.ledger_id == lid,
            models.Voucher.company_id == company_id
        )
        .first()
    )
    closing_balance = ob + float(vl_sum.total_debit or 0) - float(vl_sum.total_credit or 0)

    invoice_total = _compute_sales_invoice_totals_subquery().label("total_amount")
    paid_subq = (
        db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
        .filter(
            models.VoucherAllocation.company_id == company_id,
            models.VoucherAllocation.doc_type == models.AllocationDocType.SALES_INVOICE.value,
            models.VoucherAllocation.doc_id == models.SalesInvoice.id,
        )
        .correlate(models.SalesInvoice)
        .scalar_subquery()
    )

    rows = (
        db.query(
            models.SalesInvoice.id.label("doc_id"),
            models.SalesInvoice.date.label("doc_date"),
            models.SalesInvoice.reference.label("doc_reference"),
            models.Customer.id.label("party_id"),
            models.Customer.name.label("party_name"),
            invoice_total,
            paid_subq.label("explicit_paid_amount"),
            models.Voucher.voucher_number.label("v_number"),
        )
        .join(models.Customer, models.Customer.id == models.SalesInvoice.customer_id)
        .join(models.SalesInvoiceLine, models.SalesInvoiceLine.invoice_id == models.SalesInvoice.id)
        .outerjoin(models.Voucher, models.Voucher.id == models.SalesInvoice.voucher_id)
        .filter(models.SalesInvoice.company_id == company_id)
        .filter(models.Customer.ledger_id == lid)
        .group_by(models.SalesInvoice.id, models.Customer.id, models.Voucher.id)
        .order_by(models.SalesInvoice.date.asc(), models.SalesInvoice.id.asc())
        .all()
    )

    total_billed = sum(float(r.total_amount) for r in rows)
    total_explicit = sum(float(r.explicit_paid_amount) for r in rows)
    unallocated_pool = max(0.0, (total_billed + ob) - closing_balance - total_explicit)

    result: list[schemas.OutstandingDocumentRead] = []
    for r in rows:
        total_amount = float(r.total_amount)
        explicit_paid = float(r.explicit_paid_amount)
        
        paid = explicit_paid
        remaining = max(0.0, total_amount - paid)
        
        if remaining > 0 and unallocated_pool > 0:
            applied = min(remaining, unallocated_pool)
            paid += applied
            unallocated_pool -= applied
            
        outstanding = total_amount - paid
        if outstanding <= 0:
            continue
        
        doc_num = r.v_number if r.v_number else f"SI-{int(r.doc_id)}"
        
        result.append(
            schemas.OutstandingDocumentRead(
                doc_type=models.AllocationDocType.SALES_INVOICE.value,
                id=int(r.doc_id),
                number=doc_num,
                reference=(str(r.doc_reference) if r.doc_reference else None),
                date=r.doc_date,
                party_id=int(r.party_id),
                party_name=str(r.party_name or ""),
                total_amount=total_amount,
                paid_amount=paid,
                outstanding_amount=outstanding,
                currency=getattr(company, "currency", None),
            )
        )
    return result


@router.post(
    "/vouchers/{voucher_id}/allocations",
    response_model=list[schemas.VoucherAllocationRead],
)
def create_voucher_allocations(
    company_id: int,
    voucher_id: int,
    payload: schemas.VoucherAllocationsCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    voucher = _get_voucher_by_id_or_number(db, company_id=company_id, voucher_id=voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")

    resolved_voucher_id = int(voucher.id)

    expected_doc_type = _voucher_expected_allocation_doc_type(voucher.voucher_type)
    voucher_total = float(_compute_voucher_total(db, company_id, voucher))
    if voucher_total <= 0:
        raise HTTPException(status_code=400, detail="Voucher total amount must be greater than zero")

    counterparty_ledger_id = _get_voucher_counterparty_ledger_id(voucher=voucher)
    if counterparty_ledger_id is None:
        raise HTTPException(
            status_code=400,
            detail="Unable to determine voucher counterparty ledger; ensure the voucher has a single counterparty ledger line",
        )

    incoming = payload.allocations or []
    if not incoming:
        return _read_voucher_allocations(db, company_id=company_id, voucher_id=resolved_voucher_id)

    seen: set[tuple[str, int]] = set()
    alloc_sum = 0.0
    for a in incoming:
        dt = str(a.doc_type).strip().upper()
        if dt != expected_doc_type:
            raise HTTPException(status_code=400, detail="Invalid allocation doc_type for voucher_type")
        doc_id = int(a.doc_id)
        key = (dt, doc_id)
        if key in seen:
            raise HTTPException(status_code=400, detail="Duplicate allocation doc")
        seen.add(key)
        amt = float(a.amount)
        if amt <= 0:
            raise HTTPException(status_code=400, detail="Allocation amount must be greater than zero")
        alloc_sum += amt

    if alloc_sum - voucher_total > 1e-9:
        raise HTTPException(status_code=400, detail="sum(allocations.amount) cannot exceed voucher amount")

    tx = db.begin() if not db.in_transaction() else nullcontext()
    with tx:
        rows_to_insert: list[models.VoucherAllocation] = []
        for a in incoming:
            dt = str(a.doc_type).strip().upper()
            doc_id = int(a.doc_id)
            amt = float(a.amount)

            if dt == models.AllocationDocType.SALES_INVOICE.value:
                inv_total = (
                    db.query(_compute_sales_invoice_totals_subquery())
                    .select_from(models.SalesInvoiceLine)
                    .filter(models.SalesInvoiceLine.invoice_id == doc_id)
                    .scalar()
                )
                inv = (
                    db.query(models.SalesInvoice)
                    .filter(models.SalesInvoice.company_id == company_id, models.SalesInvoice.id == doc_id)
                    .with_for_update()
                    .first()
                )
                if not inv:
                    raise HTTPException(status_code=404, detail="Invoice not found")
                cust = (
                    db.query(models.Customer)
                    .filter(models.Customer.id == inv.customer_id, models.Customer.company_id == company_id)
                    .first()
                )
                if not cust or int(cust.ledger_id) != int(counterparty_ledger_id):
                    raise HTTPException(status_code=400, detail="Allocation document does not belong to voucher counterparty")
                already_paid = (
                    db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
                    .filter(
                        models.VoucherAllocation.company_id == company_id,
                        models.VoucherAllocation.doc_type == dt,
                        models.VoucherAllocation.doc_id == doc_id,
                    )
                    .scalar()
                )
                outstanding = float(inv_total or 0) - float(already_paid or 0)
            else:
                bill_total = (
                    db.query(_compute_purchase_bill_totals_subquery())
                    .select_from(models.PurchaseBillLine)
                    .filter(models.PurchaseBillLine.bill_id == doc_id)
                    .scalar()
                )
                bill = (
                    db.query(models.PurchaseBill)
                    .filter(models.PurchaseBill.company_id == company_id, models.PurchaseBill.id == doc_id)
                    .with_for_update()
                    .first()
                )
                if not bill:
                    raise HTTPException(status_code=404, detail="Bill not found")
                supp = (
                    db.query(models.Supplier)
                    .filter(models.Supplier.id == bill.supplier_id, models.Supplier.company_id == company_id)
                    .first()
                )
                if not supp or int(supp.ledger_id) != int(counterparty_ledger_id):
                    raise HTTPException(status_code=400, detail="Allocation document does not belong to voucher counterparty")
                already_paid = (
                    db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
                    .filter(
                        models.VoucherAllocation.company_id == company_id,
                        models.VoucherAllocation.doc_type == dt,
                        models.VoucherAllocation.doc_id == doc_id,
                    )
                    .scalar()
                )
                outstanding = float(bill_total or 0) - float(already_paid or 0)

            if amt - outstanding > 1e-9:
                raise HTTPException(status_code=400, detail="Cannot allocate more than outstanding amount")

            rows_to_insert.append(
                models.VoucherAllocation(
                    company_id=company_id,
                    voucher_id=resolved_voucher_id,
                    party_ledger_id=int(counterparty_ledger_id),
                    doc_type=dt,
                    doc_id=doc_id,
                    allocated_amount=amt,
                )
            )

        for row in rows_to_insert:
            db.add(row)

    return _read_voucher_allocations(db, company_id=company_id, voucher_id=resolved_voucher_id)


@router.post("/vouchers/cash-simple", response_model=schemas.VoucherRead)
def create_cash_voucher_simple(
    company_id: int,
    voucher_in: schemas.CashVoucherSimpleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Create a simple cash/bank PAYMENT or RECEIPT voucher.

    Frontend provides just date, type, amount, counterparty ledger, and
    payment_mode_id. We build the double-entry lines and delegate to the
    normal create_voucher logic so numbering and logs stay consistent.
    """

    if voucher_in.voucher_type not in (
        models.VoucherType.PAYMENT,
        models.VoucherType.RECEIPT,
        models.VoucherType.CONTRA,
    ):
        raise HTTPException(
            status_code=400,
            detail="cash-simple endpoint only supports PAYMENT and RECEIPT voucher types",
        )

    # Resolve payment mode and ensure it is valid/active for this company.
    payment_mode = (
        db.query(models.PaymentMode)
        .filter(
            models.PaymentMode.id == voucher_in.payment_mode_id,
            models.PaymentMode.company_id == company_id,
            models.PaymentMode.is_active == True,
        )
        .first()
    )
    if not payment_mode:
        raise HTTPException(status_code=400, detail="Invalid payment_mode_id")

    cash_ledger_id = voucher_in.ledger_id or payment_mode.ledger_id
    counterparty_ledger_id = voucher_in.counterparty_ledger_id

    amount = float(voucher_in.amount)

    # Build DR/CR based on voucher type
    if voucher_in.voucher_type == models.VoucherType.PAYMENT:
        # Payment: DR counterparty (supplier/expense), CR cash/bank
        debit_ledger_id = counterparty_ledger_id
        credit_ledger_id = cash_ledger_id
    elif voucher_in.voucher_type == models.VoucherType.RECEIPT:
        # Receipt: DR cash/bank, CR counterparty (customer/income)
        debit_ledger_id = cash_ledger_id
        credit_ledger_id = counterparty_ledger_id
    else:  # CONTRA
        # Contra (Bank Deposit/Withdrawal): 
        # By convention in this simple form:
        # payment_mode_id is the TARGET account (DR)
        # counterparty_ledger_id is the SOURCE account (CR)
        # e.g., Deposit: DR Bank, CR Cash
        debit_ledger_id = cash_ledger_id
        credit_ledger_id = counterparty_ledger_id

    voucher_date_ad = _resolve_voucher_date_for_company(
        db,
        company_id=company_id,
        voucher_date=voucher_in.voucher_date,
        voucher_date_bs=voucher_in.voucher_date_bs,
    )

    auto_voucher = schemas.VoucherCreate(
        voucher_date=voucher_date_ad,
        voucher_date_bs=voucher_in.voucher_date_bs,
        voucher_type=voucher_in.voucher_type,
        narration=voucher_in.narration,
        payment_mode_id=voucher_in.payment_mode_id,
        department_id=voucher_in.department_id,
        project_id=voucher_in.project_id,
        segment_id=voucher_in.segment_id,
        employee_id=voucher_in.employee_id,
        bank_remark=voucher_in.bank_remark,
        lines=[
            schemas.VoucherLineCreate(
                ledger_id=debit_ledger_id,
                debit=amount,
                credit=0,
                department_id=voucher_in.department_id,
                project_id=voucher_in.project_id,
                segment_id=voucher_in.segment_id,
                employee_id=voucher_in.employee_id,
                remarks=voucher_in.narration,
            ),
            schemas.VoucherLineCreate(
                ledger_id=credit_ledger_id,
                debit=0,
                credit=amount,
                department_id=voucher_in.department_id,
                project_id=voucher_in.project_id,
                segment_id=voucher_in.segment_id,
                employee_id=voucher_in.employee_id,
                remarks=voucher_in.narration,
            ),
        ],
    )

    allocations_in = voucher_in.allocations or []
    if not allocations_in:
        try:
            v = _create_voucher_impl(company_id, auto_voucher, db, current_user)
            db.commit()
            
            # Reload voucher with eager loading to ensure lines are in the response
            voucher_reloaded = (
                db.query(models.Voucher)
                .options(
                    joinedload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
                    joinedload(models.Voucher.lines).joinedload(models.VoucherLine.department),
                    joinedload(models.Voucher.lines).joinedload(models.VoucherLine.project),
                    joinedload(models.Voucher.lines).joinedload(models.VoucherLine.segment),
                    joinedload(models.Voucher.lines).joinedload(models.VoucherLine.employee),
                    joinedload(models.Voucher.payment_mode),
                    joinedload(models.Voucher.department),
                    joinedload(models.Voucher.project),
                    joinedload(models.Voucher.segment),
                    joinedload(models.Voucher.employee),
                )
                .filter(models.Voucher.id == v.id)
                .first()
            )
            
            # Build a fresh VoucherRead from the reloaded data
            total_amount = _compute_voucher_total(db, company_id, voucher_reloaded)
            allocations = _read_voucher_allocations(db, company_id=company_id, voucher_id=voucher_reloaded.id)
            origin_type, origin_id = _compute_voucher_origin(db, company_id, voucher_reloaded)
            
            return schemas.VoucherRead(
                id=voucher_reloaded.id,
                company_id=voucher_reloaded.company_id,
                voucher_date=voucher_reloaded.voucher_date,
                voucher_date_bs=_voucher_date_bs_for_company(db, company_id=company_id, voucher_date=voucher_reloaded.voucher_date),
                voucher_type=voucher_reloaded.voucher_type,
                narration=voucher_reloaded.narration,
                payment_mode_id=voucher_reloaded.payment_mode_id,
                department_id=voucher_reloaded.department_id,
                project_id=voucher_reloaded.project_id,
                segment_id=voucher_reloaded.segment_id,
                employee_id=voucher_reloaded.employee_id,
                bank_remark=voucher_reloaded.bank_remark,
                payment_mode=(voucher_reloaded.payment_mode.name if voucher_reloaded.payment_mode else None),
                fiscal_year=voucher_reloaded.fiscal_year,
                voucher_sequence=voucher_reloaded.voucher_sequence,
                voucher_number=voucher_reloaded.voucher_number,
                created_at=voucher_reloaded.created_at,
                updated_at=voucher_reloaded.updated_at,
                lines=[
                    schemas.VoucherLineRead(
                        id=line.id,
                        ledger_id=line.ledger_id,
                        debit=float(line.debit),
                        credit=float(line.credit),
                        department_id=line.department_id,
                        project_id=line.project_id,
                        segment_id=line.segment_id,
                        employee_id=line.employee_id,
                        remarks=line.remarks,
                        ledger_name=line.ledger.name if line.ledger else None,
                        department_name=line.department.name if line.department else None,
                        project_name=line.project.name if line.project else None,
                        segment_name=line.segment.name if line.segment else None,
                        employee_name=line.employee.full_name if line.employee else None,
                    )
                    for line in voucher_reloaded.lines
                ],
                total_amount=total_amount,
                origin_type=origin_type,
                origin_id=origin_id,
                allocations=allocations,
            )
        except Exception:
            db.rollback()
            raise

    # Atomic: voucher + allocations
    try:
        created = _create_voucher_impl(company_id, auto_voucher, db, current_user)

        expected_doc_type = (
            models.AllocationDocType.SALES_INVOICE.value
            if voucher_in.voucher_type == models.VoucherType.RECEIPT
            else models.AllocationDocType.PURCHASE_BILL.value
        )
        alloc_sum = 0.0
        seen: set[tuple[str, int]] = set()
        for a in allocations_in:
            dt = str(a.doc_type).strip().upper()
            if dt != expected_doc_type:
                raise HTTPException(status_code=400, detail="Invalid allocation doc_type for voucher_type")
            doc_id = int(a.doc_id)
            key = (dt, doc_id)
            if key in seen:
                raise HTTPException(status_code=400, detail="Duplicate allocation doc")
            seen.add(key)

            amount = float(a.amount)
            if amount <= 0:
                raise HTTPException(status_code=400, detail="Allocation amount must be greater than zero")

            if dt == models.AllocationDocType.SALES_INVOICE.value:
                inv_total = (
                    db.query(_compute_sales_invoice_totals_subquery())
                    .select_from(models.SalesInvoiceLine)
                    .filter(models.SalesInvoiceLine.invoice_id == doc_id)
                    .scalar()
                )
                inv = (
                    db.query(models.SalesInvoice)
                    .join(models.Customer, models.Customer.id == models.SalesInvoice.customer_id)
                    .filter(models.SalesInvoice.company_id == company_id, models.SalesInvoice.id == doc_id)
                    .with_for_update()
                    .first()
                )
                if not inv:
                    raise HTTPException(status_code=404, detail="Invoice not found")
                cust = (
                    db.query(models.Customer)
                    .filter(models.Customer.id == inv.customer_id, models.Customer.company_id == company_id)
                    .first()
                )
                if not cust or int(cust.ledger_id) != int(counterparty_ledger_id):
                    raise HTTPException(status_code=400, detail="Allocation document does not belong to selected counterparty")
                already_paid = (
                    db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
                    .filter(
                        models.VoucherAllocation.company_id == company_id,
                        models.VoucherAllocation.doc_type == dt,
                        models.VoucherAllocation.doc_id == doc_id,
                    )
                    .scalar()
                )
                outstanding = float(inv_total or 0) - float(already_paid or 0)
            else:
                bill_total = (
                    db.query(_compute_purchase_bill_totals_subquery())
                    .select_from(models.PurchaseBillLine)
                    .filter(models.PurchaseBillLine.bill_id == doc_id)
                    .scalar()
                )
                bill = (
                    db.query(models.PurchaseBill)
                    .join(models.Supplier, models.Supplier.id == models.PurchaseBill.supplier_id)
                    .filter(models.PurchaseBill.company_id == company_id, models.PurchaseBill.id == doc_id)
                    .with_for_update()
                    .first()
                )
                if not bill:
                    raise HTTPException(status_code=404, detail="Bill not found")
                supp = (
                    db.query(models.Supplier)
                    .filter(models.Supplier.id == bill.supplier_id, models.Supplier.company_id == company_id)
                    .first()
                )
                if not supp or int(supp.ledger_id) != int(counterparty_ledger_id):
                    raise HTTPException(status_code=400, detail="Allocation document does not belong to selected counterparty")
                already_paid = (
                    db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
                    .filter(
                        models.VoucherAllocation.company_id == company_id,
                        models.VoucherAllocation.doc_type == dt,
                        models.VoucherAllocation.doc_id == doc_id,
                    )
                    .scalar()
                )
                outstanding = float(bill_total or 0) - float(already_paid or 0)

            if amount - outstanding > 1e-9:
                raise HTTPException(status_code=400, detail="Cannot allocate more than outstanding amount")

            alloc_sum += amount
            db.add(
                models.VoucherAllocation(
                    company_id=company_id,
                    voucher_id=int(created.id),
                    party_ledger_id=int(counterparty_ledger_id),
                    doc_type=dt,
                    doc_id=doc_id,
                    allocated_amount=amount,
                )
            )

        if round(alloc_sum, 2) != round(float(voucher_in.amount), 2):
            raise HTTPException(status_code=400, detail="sum(allocations.amount) must equal voucher amount")

        db.commit()
    except Exception:
        db.rollback()
        raise

    # Reload voucher with eager loading to ensure lines and relationships are in the response
    voucher = (
        db.query(models.Voucher)
        .options(
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.department),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.project),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.segment),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.employee),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.department),
            joinedload(models.Voucher.project),
            joinedload(models.Voucher.segment),
            joinedload(models.Voucher.employee),
        )
        .filter(models.Voucher.company_id == company_id, models.Voucher.id == int(created.id))
        .first()
    )
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")

    total_amount = _compute_voucher_total(db, company_id, voucher)
    origin_type, origin_id = _compute_voucher_origin(db, company_id, voucher)
    allocations = _read_voucher_allocations(db, company_id=company_id, voucher_id=voucher.id)

    return schemas.VoucherRead(
        id=voucher.id,
        company_id=voucher.company_id,
        voucher_date=voucher.voucher_date,
        voucher_date_bs=_voucher_date_bs_for_company(db, company_id=company_id, voucher_date=voucher.voucher_date),
        voucher_type=voucher.voucher_type,
        narration=voucher.narration,
        payment_mode_id=voucher.payment_mode_id,
        department_id=voucher.department_id,
        project_id=voucher.project_id,
        segment_id=voucher.segment_id,
        employee_id=voucher.employee_id,
        bank_remark=voucher.bank_remark,
        payment_mode=(voucher.payment_mode.name if getattr(voucher, "payment_mode", None) is not None else None),
        department_name=(voucher.department.name if getattr(voucher, "department", None) is not None else None),
        project_name=(voucher.project.name if getattr(voucher, "project", None) is not None else None),
        segment_name=(voucher.segment.name if getattr(voucher, "segment", None) is not None else None),
        employee_name=(voucher.employee.full_name if getattr(voucher, "employee", None) is not None else None),
        fiscal_year=voucher.fiscal_year,
        voucher_sequence=voucher.voucher_sequence,
        voucher_number=voucher.voucher_number,
        created_at=voucher.created_at,
        updated_at=voucher.updated_at,
        lines=[
            schemas.VoucherLineRead(
                id=line.id,
                ledger_id=line.ledger_id,
                debit=float(line.debit),
                credit=float(line.credit),
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line.employee_id,
                remarks=line.remarks,
                ledger_name=line.ledger.name if line.ledger is not None else None,
                department_name=(line.department.name if getattr(line, "department", None) is not None else None),
                project_name=(line.project.name if getattr(line, "project", None) is not None else None),
                segment_name=(line.segment.name if getattr(line, "segment", None) is not None else None),
                employee_name=(line.employee.full_name if getattr(line, "employee", None) is not None else None),
            )
            for line in voucher.lines
        ],
        total_amount=total_amount,
        origin_type=origin_type,
        origin_id=origin_id,
        allocations=allocations,
    )


@router.get("/vouchers/{voucher_id}", response_model=schemas.VoucherRead)
def get_voucher(
    company_id: int,
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    voucher = (
        db.query(models.Voucher)
        .options(
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.department),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.project),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.segment),
            joinedload(models.Voucher.lines).joinedload(models.VoucherLine.employee),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.department),
            joinedload(models.Voucher.project),
            joinedload(models.Voucher.segment),
            joinedload(models.Voucher.employee),
        )
        .filter(
            models.Voucher.id == voucher_id,
            models.Voucher.company_id == company_id,
        )
        .first()
    )
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")

    total_amount = _compute_voucher_total(db, company_id, voucher)
    allocations = _read_voucher_allocations(db, company_id=company_id, voucher_id=voucher.id)

    return schemas.VoucherRead(
        id=voucher.id,
        company_id=voucher.company_id,
        voucher_date=voucher.voucher_date,
        voucher_date_bs=_voucher_date_bs_for_company(db, company_id=company_id, voucher_date=voucher.voucher_date),
        voucher_type=voucher.voucher_type,
        narration=voucher.narration,
        payment_mode_id=voucher.payment_mode_id,
        department_id=voucher.department_id,
        project_id=voucher.project_id,
        segment_id=voucher.segment_id,
        employee_id=voucher.employee_id,
        bank_remark=voucher.bank_remark,
        payment_mode=(voucher.payment_mode.name if getattr(voucher, "payment_mode", None) is not None else None),
        department_name=(voucher.department.name if getattr(voucher, "department", None) is not None else None),
        project_name=(voucher.project.name if getattr(voucher, "project", None) is not None else None),
        segment_name=(voucher.segment.name if getattr(voucher, "segment", None) is not None else None),
        employee_name=(voucher.employee.full_name if getattr(voucher, "employee", None) is not None else None),
        fiscal_year=voucher.fiscal_year,
        voucher_sequence=voucher.voucher_sequence,
        voucher_number=voucher.voucher_number,
        created_at=voucher.created_at,
        updated_at=voucher.updated_at,
        lines=[
            schemas.VoucherLineRead(
                id=line.id,
                ledger_id=line.ledger_id,
                debit=float(line.debit),
                credit=float(line.credit),
                ledger_name=line.ledger.name if line.ledger is not None else None,
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line.employee_id,
                remarks=line.remarks,
                department_name=(
                    line.department.name if getattr(line, "department", None) is not None else None
                ),
                project_name=(
                    line.project.name if getattr(line, "project", None) is not None else None
                ),
                segment_name=(
                    line.segment.name if getattr(line, "segment", None) is not None else None
                ),
                employee_name=(
                    line.employee.full_name if getattr(line, "employee", None) is not None else None
                ),
            )
            for line in voucher.lines
        ],
        total_amount=total_amount,
        allocations=allocations,
    )


@router.get(
    "/vouchers/{voucher_id}/allocations",
    response_model=list[schemas.VoucherAllocationRead],
)
def get_voucher_allocations(
    company_id: int,
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    voucher = _get_voucher_by_id_or_number(db, company_id=company_id, voucher_id=voucher_id)
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")
    return _read_voucher_allocations(db, company_id=company_id, voucher_id=int(voucher.id))


@router.put("/vouchers/{voucher_id}", response_model=schemas.VoucherRead)
def update_voucher(
    company_id: int,
    voucher_id: int,
    voucher_in: schemas.VoucherUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    voucher = (
        db.query(models.Voucher)
        .filter(
            models.Voucher.id == voucher_id,
            models.Voucher.company_id == company_id,
        )
        .first()
    )
    if not voucher:
        raise HTTPException(status_code=404, detail="Voucher not found")

    # Capture original state before applying updates so we can log a meaningful diff.
    old_state = {
        "voucher_date": voucher.voucher_date,
        "voucher_type": voucher.voucher_type,
        "narration": voucher.narration,
        "department_id": voucher.department_id,
        "project_id": voucher.project_id,
        "bank_remark": voucher.bank_remark,
    }

    if voucher_in.lines is not None:
        _validate_lines(voucher_in.lines)
        db.query(models.VoucherLine).filter(
            models.VoucherLine.voucher_id == voucher.id
        ).delete()
        effective_header_employee_id = (
            voucher_in.employee_id if voucher_in.employee_id is not None else voucher.employee_id
        )
        effective_header_remarks = (
            voucher_in.narration if voucher_in.narration not in (None, "") else voucher.narration
        )
        for line in voucher_in.lines:
            _validate_cost_centers(company, line)
            line_employee_id = (
                line.employee_id if line.employee_id is not None else effective_header_employee_id
            )
            line_remarks = (
                line.remarks if line.remarks not in (None, "") else effective_header_remarks
            )
            db.add(
                models.VoucherLine(
                    voucher_id=voucher.id,
                    ledger_id=line.ledger_id,
                    debit=line.debit,
                    credit=line.credit,
                    department_id=line.department_id,
                    project_id=line.project_id,
                    segment_id=line.segment_id,
                    employee_id=line_employee_id,
                    remarks=line_remarks,
                )
            )

    # Validate payment_mode_id for cash/bank type vouchers
    if voucher_in.voucher_type is not None and voucher.voucher_type in (
        models.VoucherType.PAYMENT,
        models.VoucherType.RECEIPT,
        models.VoucherType.CONTRA,
    ):
        # If client is changing voucher_type away from these, we allow payment_mode_id to be null.
        effective_type = voucher_in.voucher_type or voucher.voucher_type
        if effective_type in (
            models.VoucherType.PAYMENT,
            models.VoucherType.RECEIPT,
            models.VoucherType.CONTRA,
        ):
            if voucher_in.payment_mode_id is None and voucher.payment_mode_id is None:
                raise HTTPException(
                    status_code=400,
                    detail="payment_mode_id is required for this voucher type",
                )

    if voucher_in.payment_mode_id is not None:
        payment_mode = (
            db.query(models.PaymentMode)
            .filter(
                models.PaymentMode.id == voucher_in.payment_mode_id,
                models.PaymentMode.company_id == company_id,
                models.PaymentMode.is_active == True,
            )
            .first()
        )
        if not payment_mode:
            raise HTTPException(status_code=400, detail="Invalid payment_mode_id")

    # Prevent changes to fiscal_year, sequence, and number via API
    data = voucher_in.dict(exclude={"lines"}, exclude_unset=True)
    for protected in ["fiscal_year", "voucher_sequence", "voucher_number"]:
        data.pop(protected, None)

    # Voucher date: if company is in BS mode and bs date is provided, convert.
    if "voucher_date_bs" in data and data.get("voucher_date_bs"):
        resolved = _resolve_voucher_date_for_company(
            db,
            company_id=company_id,
            voucher_date=data.get("voucher_date"),
            voucher_date_bs=data.get("voucher_date_bs"),
        )
        data["voucher_date"] = resolved
        validate_transaction_date(company, resolved)
    elif "voucher_date" in data and data.get("voucher_date"):
        validate_transaction_date(company, data["voucher_date"])
    data.pop("voucher_date_bs", None)

    for field, value in data.items():
        setattr(voucher, field, value)

    new_state = {
        "voucher_date": voucher.voucher_date,
        "voucher_type": voucher.voucher_type,
        "narration": voucher.narration,
        "department_id": voucher.department_id,
        "project_id": voucher.project_id,
        "bank_remark": voucher.bank_remark,
    }

    summary, diff_json = _build_voucher_diff(old_state, new_state)

    _log_voucher_action(
        db,
        tenant_id=company.tenant_id,
        company_id=company_id,
        voucher=voucher,
        action=models.VoucherAction.UPDATED,
        actor=current_user.email,
        summary=summary,
        diff_json=diff_json,
    )

    db.commit()
    db.refresh(voucher)

    # Bidirectional Sync: Voucher -> Source Document (Invoice/Bill)
    if voucher.sales_invoice or voucher.purchase_bill:
        from .sales import recharge_stock_from_sales_invoice
        from .purchases import recharge_stock_from_purchase_bill

        if voucher.sales_invoice:
            invoice = voucher.sales_invoice
            invoice.date = voucher.voucher_date
            
            # Re-proportionalize rates if total amount changed
            # Calculate new total from the Customer DR leg (excluding settlement)
            # Find the line that matches the customer's ledger
            customer = db.query(models.Customer).filter(models.Customer.id == invoice.customer_id).first()
            if customer:
                customer_line = next((l for l in voucher.lines if l.ledger_id == customer.ledger_id and l.debit > 0), None)
                if customer_line:
                    new_total = float(customer_line.debit)
                    # We need the old total to calculate the ratio. 
                    # We can use the sum of existing invoice lines.
                    old_total = sum((float(l.quantity) * float(l.rate) * (1 + float(l.tax_rate)/100.0) - float(l.discount)) for l in invoice.lines)
                    
                    if old_total > 0 and abs(new_total - old_total) > 0.01:
                        ratio = new_total / old_total
                        for inv_line in invoice.lines:
                            inv_line.rate = float(inv_line.rate) * ratio
                    
                    # Update stock and movements
                    recharge_stock_from_sales_invoice(db, company_id, invoice, current_user.id)

        if voucher.purchase_bill:
            bill = voucher.purchase_bill
            bill.date = voucher.voucher_date
            
            # Re-proportionalize rates
            supplier = db.query(models.Supplier).filter(models.Supplier.id == bill.supplier_id).first()
            if supplier:
                supplier_line = next((l for l in voucher.lines if l.ledger_id == supplier.ledger_id and l.credit > 0), None)
                if supplier_line:
                    new_total = float(supplier_line.credit)
                    old_total = sum((float(l.quantity) * float(l.rate) * (1 + float(l.tax_rate)/100.0) - float(l.discount)) for l in bill.lines)
                    
                    if old_total > 0 and abs(new_total - old_total) > 0.01:
                        ratio = new_total / old_total
                        for bill_line in bill.lines:
                            bill_line.rate = float(bill_line.rate) * ratio
                    
                    # Update stock and movements
                    recharge_stock_from_purchase_bill(db, company_id, bill, current_user.id)
        
        db.commit()
        db.refresh(voucher)

    total_amount = _compute_voucher_total(db, company_id, voucher)
    allocations = _read_voucher_allocations(db, company_id=company_id, voucher_id=voucher.id)

    return schemas.VoucherRead(
        id=voucher.id,
        company_id=voucher.company_id,
        voucher_date=voucher.voucher_date,
        voucher_date_bs=_voucher_date_bs_for_company(
            db,
            company_id=company_id,
            voucher_date=voucher.voucher_date,
        ),
        voucher_type=voucher.voucher_type,
        narration=voucher.narration,
        payment_mode_id=voucher.payment_mode_id,
        department_id=voucher.department_id,
        project_id=voucher.project_id,
        segment_id=voucher.segment_id,
        employee_id=voucher.employee_id,
        bank_remark=voucher.bank_remark,
        payment_mode=(voucher.payment_mode.name if getattr(voucher, "payment_mode", None) is not None else None),
        department_name=(voucher.department.name if getattr(voucher, "department", None) is not None else None),
        project_name=(voucher.project.name if getattr(voucher, "project", None) is not None else None),
        segment_name=(voucher.segment.name if getattr(voucher, "segment", None) is not None else None),
        employee_name=(voucher.employee.full_name if getattr(voucher, "employee", None) is not None else None),
        fiscal_year=voucher.fiscal_year,
        voucher_sequence=voucher.voucher_sequence,
        voucher_number=voucher.voucher_number,
        created_at=voucher.created_at,
        updated_at=voucher.updated_at,
        lines=[
            schemas.VoucherLineRead(
                id=line.id,
                ledger_id=line.ledger_id,
                debit=float(line.debit),
                credit=float(line.credit),
                ledger_name=(line.ledger.name if line.ledger is not None else None),
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line.employee_id,
                remarks=line.remarks,
                department_name=(
                    line.department.name if getattr(line, "department", None) is not None else None
                ),
                project_name=(
                    line.project.name if getattr(line, "project", None) is not None else None
                ),
                segment_name=(
                    line.segment.name if getattr(line, "segment", None) is not None else None
                ),
                employee_name=(
                    line.employee.full_name if getattr(line, "employee", None) is not None else None
                ),
            )
            for line in voucher.lines
        ],
        total_amount=total_amount,
        allocations=allocations,
    )


@router.delete("/vouchers/{voucher_id}")
def delete_voucher(
    company_id: int,
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    def _delete_voucher_internal() -> None:
        voucher = (
            db.query(models.Voucher)
            .filter(
                models.Voucher.id == voucher_id,
                models.Voucher.company_id == company_id,
            )
            .first()
        )
        if not voucher:
            raise HTTPException(status_code=404, detail="Voucher not found")

        # Cascade behavior: if voucher is linked to a purchase bill or sales invoice,
        # delete the document (and its side-effects) before deleting the voucher.
        linked_bill = (
            db.query(models.PurchaseBill)
            .filter(
                models.PurchaseBill.company_id == company_id,
                models.PurchaseBill.voucher_id == voucher.id,
            )
            .first()
        )
        if linked_bill is not None:
            # Prevent bypassing inventory reversal: reuse purchases deletion logic.
            # Also avoid double-deleting the voucher (we're already deleting it below)
            # by clearing the FK before calling the internal deletion helper.
            linked_bill.voucher_id = None
            db.flush()
            purchases._delete_purchase_bill_internal(
                db=db,
                company_id=company_id,
                bill_id=linked_bill.id,
                actor_user_id=current_user.id,
                skip_consumption_check=False,
            )

        linked_invoice = (
            db.query(models.SalesInvoice)
            .filter(
                models.SalesInvoice.company_id == company_id,
                models.SalesInvoice.voucher_id == voucher.id,
            )
            .first()
        )
        if linked_invoice is not None:
            linked_order = (
                db.query(models.SalesOrder)
                .filter(
                    models.SalesOrder.company_id == company_id,
                    models.SalesOrder.converted_to_invoice_id == linked_invoice.id,
                )
                .first()
            )
            if linked_order is not None:
                linked_order.converted_to_invoice_id = None
                db.flush()

            db.query(models.StockMovement).filter(
                models.StockMovement.company_id == company_id,
                models.StockMovement.source_type == "SALES_INVOICE",
                models.StockMovement.source_id == linked_invoice.id,
            ).delete()

            linked_invoice.voucher_id = None
            db.flush()
            db.delete(linked_invoice)
            db.flush()

        # Standalone/manual voucher: safe to delete
        _log_voucher_action(
            db,
            tenant_id=company.tenant_id,
            company_id=company_id,
            voucher=voucher,
            action=models.VoucherAction.DELETED,
            actor=current_user.email,
            summary="Voucher deleted",
            diff_json=None,
        )
        db.delete(voucher)

    if db.in_transaction():
        _delete_voucher_internal()
    else:
        with db.begin():
            _delete_voucher_internal()

    return {"detail": "Deleted"}


@router.post("/vouchers/{voucher_id}/reverse", response_model=schemas.VoucherRead)
def reverse_voucher(
    company_id: int,
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    original = (
        db.query(models.Voucher)
        .filter(
            models.Voucher.id == voucher_id,
            models.Voucher.company_id == company_id,
        )
        .first()
    )
    if not original:
        raise HTTPException(status_code=404, detail="Voucher not found")

    validate_transaction_date(company, original.voucher_date)

    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db, company_id, original.voucher_type, original.voucher_date
    )

    reverse_narration = f"Reversal of {original.voucher_number}: {original.narration or ''}".strip()

    reversing_voucher = models.Voucher(
        company_id=company_id,
        voucher_date=original.voucher_date,
        voucher_type=original.voucher_type,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=reverse_narration,
        payment_mode_id=original.payment_mode_id,
        department_id=original.department_id,
        project_id=original.project_id,
        segment_id=original.segment_id,
        employee_id=original.employee_id,
        bank_remark=original.bank_remark,
    )
    db.add(reversing_voucher)
    db.flush()

    for line in original.lines:
        db.add(
            models.VoucherLine(
                voucher_id=reversing_voucher.id,
                ledger_id=line.ledger_id,
                debit=line.credit,
                credit=line.debit,
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line.employee_id,
                remarks=line.remarks,
            )
        )

    _log_voucher_action(
        db,
        tenant_id=company.tenant_id,
        company_id=company_id,
        voucher=reversing_voucher,
        action=models.VoucherAction.CREATED,
        actor=current_user.email,
        summary=f"Voucher created as reversal of {original.voucher_number}",
        diff_json=None,
    )

    db.commit()
    db.refresh(reversing_voucher)

    total_amount = _compute_voucher_total(db, company_id, reversing_voucher)
    origin_type, origin_id = _compute_voucher_origin(db, company_id, reversing_voucher)

    return schemas.VoucherRead(
        id=reversing_voucher.id,
        company_id=reversing_voucher.company_id,
        voucher_date=reversing_voucher.voucher_date,
        voucher_date_bs=_voucher_date_bs_for_company(
            db,
            company_id=company_id,
            voucher_date=reversing_voucher.voucher_date,
        ),
        voucher_type=reversing_voucher.voucher_type,
        narration=reversing_voucher.narration,
        payment_mode_id=reversing_voucher.payment_mode_id,
        department_id=reversing_voucher.department_id,
        project_id=reversing_voucher.project_id,
        segment_id=reversing_voucher.segment_id,
        employee_id=reversing_voucher.employee_id,
        bank_remark=reversing_voucher.bank_remark,
        fiscal_year=reversing_voucher.fiscal_year,
        voucher_sequence=reversing_voucher.voucher_sequence,
        voucher_number=reversing_voucher.voucher_number,
        created_at=reversing_voucher.created_at,
        updated_at=reversing_voucher.updated_at,
        lines=[
            schemas.VoucherLineRead(
                id=line.id,
                ledger_id=line.ledger_id,
                debit=float(line.debit),
                credit=float(line.credit),
                ledger_name=line.ledger.name if line.ledger is not None else None,
                department_id=line.department_id,
                project_id=line.project_id,
                segment_id=line.segment_id,
                employee_id=line.employee_id,
                remarks=line.remarks,
                department_name=(
                    line.department.name if getattr(line, "department", None) is not None else None
                ),
                project_name=(
                    line.project.name if getattr(line, "project", None) is not None else None
                ),
                segment_name=(
                    line.segment.name if getattr(line, "segment", None) is not None else None
                ),
                employee_name=(
                    line.employee.full_name if getattr(line, "employee", None) is not None else None
                ),
            )
            for line in reversing_voucher.lines
        ],
        total_amount=total_amount,
        origin_type=origin_type,
        origin_id=origin_id,
    )
