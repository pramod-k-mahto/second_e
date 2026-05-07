from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["ledgers"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


def _ensure_standard_party_groups(db: Session, company_id: int) -> None:
    required = [
        ("Sundry Debtors", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Sundry Creditors", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
    ]

    for name, group_type, preferred_parent_name in required:
        existing = (
            db.query(models.LedgerGroup.id)
            .filter(
                models.LedgerGroup.company_id == company_id,
                func.lower(models.LedgerGroup.name) == func.lower(name),
            )
            .first()
        )
        if existing is not None:
            continue

        parent_id = None
        if preferred_parent_name:
            parent = (
                db.query(models.LedgerGroup)
                .filter(
                    models.LedgerGroup.company_id == company_id,
                    func.lower(models.LedgerGroup.name)
                    == func.lower(preferred_parent_name),
                )
                .order_by(models.LedgerGroup.id.asc())
                .first()
            )
            if parent is not None:
                parent_id = parent.id

        group = models.LedgerGroup(
            company_id=company_id,
            name=name,
            group_type=group_type,
            parent_group_id=parent_id,
        )
        db.add(group)
        db.flush()


@router.get("/ledger-groups", response_model=list[schemas.LedgerGroupRead])
def list_ledger_groups(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    _ensure_standard_party_groups(db, company_id)
    db.commit()

    groups = (
        db.query(models.LedgerGroup)
        .filter(models.LedgerGroup.company_id == company_id)
        .order_by(models.LedgerGroup.name)
        .all()
    )
    return groups


@router.post("/ledger-groups", response_model=schemas.LedgerGroupRead)
def create_ledger_group(
    company_id: int,
    group_in: schemas.LedgerGroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    normalized_name = str(group_in.name).strip()

    existing = (
        db.query(models.LedgerGroup.id)
        .filter(
            models.LedgerGroup.company_id == company_id,
            func.lower(func.btrim(models.LedgerGroup.name))
            == func.lower(func.btrim(normalized_name)),
            models.LedgerGroup.parent_group_id == group_in.parent_group_id,
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(
            status_code=409,
            detail="Ledger group already exists with the same name under the selected parent.",
        )

    group = models.LedgerGroup(company_id=company_id, **group_in.dict())
    db.add(group)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ledger group already exists with the same name under the selected parent.",
        )
    db.refresh(group)
    return group


@router.put("/ledger-groups/{group_id}", response_model=schemas.LedgerGroupRead)
def update_ledger_group(
    company_id: int,
    group_id: int,
    group_in: schemas.LedgerGroupUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    group = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.id == group_id,
            models.LedgerGroup.company_id == company_id,
        )
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Ledger group not found")

    data = group_in.model_dump(exclude_unset=True)
    new_name = data.get("name", group.name)
    new_parent_id = data.get("parent_group_id", group.parent_group_id)

    if ("name" in data) or ("parent_group_id" in data):
        existing = (
            db.query(models.LedgerGroup.id)
            .filter(
                models.LedgerGroup.company_id == company_id,
                func.lower(func.btrim(models.LedgerGroup.name))
                == func.lower(func.btrim(str(new_name).strip())),
                models.LedgerGroup.parent_group_id == new_parent_id,
                models.LedgerGroup.id != group_id,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Ledger group already exists with the same name under the selected parent.",
            )

    for field, value in data.items():
        setattr(group, field, value)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ledger group already exists with the same name under the selected parent.",
        )
    db.refresh(group)
    return group


@router.delete("/ledger-groups/{group_id}")
def delete_ledger_group(
    company_id: int,
    group_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    group = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.id == group_id,
            models.LedgerGroup.company_id == company_id,
        )
        .first()
    )
    if not group:
        raise HTTPException(status_code=404, detail="Ledger group not found")

    # Prevent deleting a group that is still referenced by ledgers.
    # Ledger.group_id is NOT NULL, so allowing deletion would either violate the
    # constraint (if SQLAlchemy attempts to null it) or fail due to FK constraints.
    ledger_exists = (
        db.query(models.Ledger.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id == group_id,
        )
        .first()
    )
    if ledger_exists is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger group while it has ledgers. Move or delete the ledgers first.",
        )

    # Prevent deleting a group that still has child groups.
    child_exists = (
        db.query(models.LedgerGroup.id)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.parent_group_id == group_id,
        )
        .first()
    )
    if child_exists is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger group while it has child groups. Delete or reassign child groups first.",
        )

    # Prevent deleting a group that is referenced by payment modes.
    pm_exists = (
        db.query(models.PaymentMode.id)
        .filter(
            models.PaymentMode.company_id == company_id,
            models.PaymentMode.ledger_group_id == group_id,
        )
        .first()
    )
    if pm_exists is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger group because it is used by a payment mode.",
        )

    db.delete(group)
    db.commit()
    return {"detail": "Deleted"}


@router.get("/ledgers", response_model=list[schemas.LedgerRead])
def list_ledgers(
    company_id: int,
    group_id: int | None = Query(None, description="Filter by a single ledger_group id"),
    group_ids: str | None = Query(
        None,
        description="Comma separated list of ledger_group ids to include, e.g. '10,11,12'",
    ),
    group_type: models.LedgerGroupType | None = Query(
        None,
        description="Optional high-level group type filter: ASSET, LIABILITY, INCOME, EXPENSE",
    ),
    search: str | None = Query(
        None,
        description="Optional search on ledger name or code (case-insensitive substring)",
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    _ensure_standard_party_groups(db, company_id)
    db.commit()

    query = db.query(models.Ledger).join(models.LedgerGroup)

    query = query.filter(models.Ledger.company_id == company_id)

    # Filter by a single group_id, if provided
    if group_id is not None:
        query = query.filter(models.Ledger.group_id == group_id)

    # Filter by multiple group_ids, if provided
    if group_ids:
        try:
            parsed_group_ids = [int(gid.strip()) for gid in group_ids.split(",") if gid.strip()]
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid group_ids parameter")
        if parsed_group_ids:
            query = query.filter(models.Ledger.group_id.in_(parsed_group_ids))

    # Filter by high-level group type (ASSET / LIABILITY / INCOME / EXPENSE)
    if group_type is not None:
        # When asking for EXPENSE ledgers (commonly used for bill/invoice dropdowns),
        # also include standard tax ledgers even if they live under a different
        # group type (e.g. Duties & Taxes under LIABILITY). This ensures INPUT_TAX
        # / OUTPUT_TAX style ledgers appear alongside expense accounts.
        if group_type == models.LedgerGroupType.EXPENSE:
            tax_codes = [
                "INPUT_TAX",
                "INPUT_VAT",
                "OUTPUT_TAX",
                "OUTPUT_VAT",
                "TAX_PAYABLE",
                "TAX_RECEIVABLE",
                "DUTIES_TAXES",
            ]
            query = query.filter(
                (models.LedgerGroup.group_type == group_type)
                | (models.Ledger.code.in_(tax_codes))
            )
        else:
            query = query.filter(models.LedgerGroup.group_type == group_type)

    # Basic search on name/code for dropdowns
    if search:
        like_pattern = f"%{search.strip()}%"
        query = query.filter(
            (models.Ledger.name.ilike(like_pattern))
            | (models.Ledger.code.ilike(like_pattern))
        )

    ledgers = query.order_by(models.Ledger.name).all()
    return [
        schemas.LedgerRead(
            id=l.id,
            name=l.name,
            group_id=l.group_id,
            group_name=(l.group.name if getattr(l, "group", None) is not None else None),
            group_type=(l.group.group_type if getattr(l, "group", None) is not None else None),
            code=l.code,
            opening_balance=float(l.opening_balance),
            opening_balance_type=l.opening_balance_type,
            is_active=l.is_active,
        )
        for l in ledgers
    ]


@router.get("/default-ledgers")
def get_default_ledgers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    # Fetch all ledgers that have one of the known standard codes.
    # We normalize VAT aliases so that:
    # - INPUT_VAT is exposed under the canonical code INPUT_TAX
    # - OUTPUT_VAT is exposed under the canonical code OUTPUT_TAX
    codes = [
        "CASH",
        "PETTY_CASH",
        "DEFAULT_BANK",
        "CUSTOMERS",
        "SUPPLIERS",
        "INPUT_VAT",
        "OUTPUT_VAT",
        "VAT_PAYABLE",
        "VAT_RECEIVABLE",
        "TDS_PAYABLE",
        "TDS_RECEIVABLE",
        "INPUT_TAX",
        "OUTPUT_TAX",
        "TAX_PAYABLE",
        "TAX_RECEIVABLE",
        "DUTIES_TAXES",
        "SERVICE_CHARGE",
        "SALES",
        "PURCHASES",
        "SALES_RETURN",
        "PURCHASE_RETURN",
        "DISCOUNT_ALLOWED",
        "DISCOUNT_RECEIVED",
        "CAPITAL",
        "DRAWINGS",
        "RETAINED_EARNINGS",
    ]

    ledgers = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.code.in_(codes),
        )
        .all()
    )

    canonical: dict[str, dict[str, int | str | None]] = {}

    for ledger in ledgers:
        if ledger.code is None:
            continue

        raw_code = ledger.code.upper()

        # Normalize VAT aliases to canonical tax codes
        if raw_code == "INPUT_VAT":
            key = "INPUT_TAX"
        elif raw_code == "OUTPUT_VAT":
            key = "OUTPUT_TAX"
        else:
            key = raw_code

        # Prefer true canonical codes over aliases:
        # - If we see INPUT_TAX after INPUT_VAT, overwrite with INPUT_TAX.
        # - If we see INPUT_VAT and INPUT_TAX is already present, keep existing.
        if raw_code in {"INPUT_TAX", "OUTPUT_TAX"}:
            canonical[key] = {
                "id": ledger.id,
                "code": key,
                "name": ledger.name,
                "group_id": ledger.group_id,
            }
            continue

        if key not in canonical:
            canonical[key] = {
                "id": ledger.id,
                "code": key,
                "name": ledger.name,
                "group_id": ledger.group_id,
            }

    # Return as a map canonical_code -> basic ledger info
    return canonical


@router.post("/ledgers", response_model=schemas.LedgerRead)
def create_ledger(
    company_id: int,
    ledger_in: schemas.LedgerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    normalized_name = str(ledger_in.name).strip()

    existing = (
        db.query(models.Ledger.id)
        .filter(
            models.Ledger.company_id == company_id,
            func.lower(func.btrim(models.Ledger.name))
            == func.lower(func.btrim(normalized_name)),
        )
        .first()
    )
    if existing is not None:
        raise HTTPException(status_code=409, detail="Ledger already exists with the same name.")

    if ledger_in.code:
        existing_code = (
            db.query(models.Ledger.id)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code == ledger_in.code.strip(),
            )
            .first()
        )
        if existing_code is not None:
            raise HTTPException(
                status_code=409,
                detail="Ledger code already exists in this company. Please choose a different code.",
            )

    ledger = models.Ledger(company_id=company_id, **ledger_in.dict())
    db.add(ledger)
    try:
        db.commit()
    except IntegrityError as e:
        db.rollback()
        msg = str(getattr(e, "orig", e))
        if "uq_ledgers_company_code" in msg:
            raise HTTPException(
                status_code=409,
                detail="Ledger code already exists in this company. Please choose a different code.",
            )
        raise HTTPException(status_code=409, detail="Ledger already exists with the same name.")
    db.refresh(ledger)
    return ledger


@router.get("/ledgers/{ledger_id}", response_model=schemas.LedgerRead)
def get_ledger(
    company_id: int,
    ledger_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.id == ledger_id,
            models.Ledger.company_id == company_id,
        )
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=404, detail="Ledger not found")
    return ledger


@router.put("/ledgers/{ledger_id}", response_model=schemas.LedgerRead)
def update_ledger(
    company_id: int,
    ledger_id: int,
    ledger_in: schemas.LedgerUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.id == ledger_id,
            models.Ledger.company_id == company_id,
        )
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=404, detail="Ledger not found")
    protected_codes = {
        "CASH",
        "PETTY_CASH",
        "DEFAULT_BANK",
        "CUSTOMERS",
        "SUPPLIERS",
        "INPUT_VAT",
        "OUTPUT_VAT",
        "VAT_PAYABLE",
        "VAT_RECEIVABLE",
        "TDS_PAYABLE",
        "TDS_RECEIVABLE",
        "INPUT_TAX",
        "OUTPUT_TAX",
        "TAX_PAYABLE",
        "TAX_RECEIVABLE",
        "DUTIES_TAXES",
        "SERVICE_CHARGE",
        "SALES",
        "PURCHASES",
        "SALES_RETURN",
        "PURCHASE_RETURN",
        "DISCOUNT_ALLOWED",
        "DISCOUNT_RECEIVED",
        "CAPITAL",
        "DRAWINGS",
        "RETAINED_EARNINGS",
    }

    data = ledger_in.dict(exclude_unset=True)
    # Do not allow changing the code of protected standard ledgers
    if ledger.code in protected_codes and "code" in data:
        data.pop("code")

    if "name" in data:
        existing = (
            db.query(models.Ledger.id)
            .filter(
                models.Ledger.company_id == company_id,
                func.lower(models.Ledger.name) == func.lower(str(data["name"]).strip()),
                models.Ledger.id != ledger_id,
            )
            .first()
        )
        if existing is not None:
            raise HTTPException(
                status_code=409,
                detail="Another ledger already exists with the same name.",
            )

    if "code" in data and data.get("code"):
        existing_code = (
            db.query(models.Ledger.id)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code == str(data["code"]).strip(),
                models.Ledger.id != ledger_id,
            )
            .first()
        )
        if existing_code is not None:
            raise HTTPException(
                status_code=409,
                detail="Ledger code already exists in this company. Please choose a different code.",
            )

    for field, value in data.items():
        setattr(ledger, field, value)
    db.commit()
    db.refresh(ledger)
    return ledger


@router.delete("/ledgers/{ledger_id}")
def delete_ledger(
    company_id: int,
    ledger_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.id == ledger_id,
            models.Ledger.company_id == company_id,
        )
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=404, detail="Ledger not found")

    # Block deletion if the ledger is referenced by other records.
    # Several related FKs are NOT NULL (e.g., suppliers.ledger_id), so deleting
    # the ledger would crash with an IntegrityError.
    supplier_ref = (
        db.query(models.Supplier.id)
        .filter(models.Supplier.company_id == company_id, models.Supplier.ledger_id == ledger_id)
        .first()
    )
    if supplier_ref is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger because it is linked to a supplier.",
        )

    customer_ref = (
        db.query(models.Customer.id)
        .filter(models.Customer.company_id == company_id, models.Customer.ledger_id == ledger_id)
        .first()
    )
    if customer_ref is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger because it is linked to a customer.",
        )

    payment_mode_ref = (
        db.query(models.PaymentMode.id)
        .filter(models.PaymentMode.company_id == company_id, models.PaymentMode.ledger_id == ledger_id)
        .first()
    )
    if payment_mode_ref is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger because it is used by a payment mode.",
        )

    voucher_line_ref = (
        db.query(models.VoucherLine.id)
        .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
        .filter(models.Voucher.company_id == company_id, models.VoucherLine.ledger_id == ledger_id)
        .first()
    )
    if voucher_line_ref is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger because it is referenced by voucher entries.",
        )

    company_ref = (
        db.query(models.Company.id)
        .filter(
            models.Company.id == company_id,
            (
                (models.Company.default_purchase_ledger_id == ledger_id)
                | (models.Company.default_sales_ledger_id == ledger_id)
                | (models.Company.default_item_income_ledger_id == ledger_id)
                | (models.Company.default_item_expense_ledger_id == ledger_id)
                | (models.Company.default_input_tax_ledger_id == ledger_id)
                | (models.Company.default_output_tax_ledger_id == ledger_id)
                | (models.Company.default_item_input_tax_ledger_id == ledger_id)
                | (models.Company.default_item_output_tax_ledger_id == ledger_id)
            ),
        )
        .first()
    )
    if company_ref is not None:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete ledger because it is configured as a default ledger on the company.",
        )

    db.delete(ledger)
    db.commit()
    return {"detail": "Deleted"}
