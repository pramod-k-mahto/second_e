from fastapi import APIRouter, Depends, HTTPException, Query, Request, status, BackgroundTasks, File, UploadFile
from sqlalchemy import func
from sqlalchemy import insert, update
from sqlalchemy import MetaData, Table
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..permissions import require_menu_access
from ..database import get_db
from ..menu_defaults import ensure_default_menus_for_company
from .seed import _seed_default_chart_for_company


router = APIRouter(prefix="/companies", tags=["companies"])


def _reflect_table(db: Session, table_name: str) -> Table:
    bind = db.get_bind()
    md = MetaData()
    return Table(table_name, md, autoload_with=bind)


def _get_company_with_access(db: Session, company_id: int, user: models.User) -> models.Company:
    """Return a company if the user is either the owner or has explicit access via UserCompanyAccess."""
    # Robust role check for ghost/superadmin
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if role == "superadmin" or role.startswith("ghost_"):
        company = db.query(models.Company).filter(models.Company.id == company_id).first()
    elif role == "admin":
        company = (
            db.query(models.Company)
            .filter(
                models.Company.id == company_id,
                models.Company.tenant_id == user.tenant_id,
            )
            .first()
        )
    else:
        company = (
            db.query(models.Company)
            .outerjoin(
                models.UserCompanyAccess,
                models.UserCompanyAccess.company_id == models.Company.id,
            )
            .filter(models.Company.id == company_id)
            .filter(
                (models.Company.owner_id == user.id)
                | (models.UserCompanyAccess.user_id == user.id)
            )
            .first()
        )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _ensure_can_manage_company(current_user: models.User, company: models.Company) -> None:
    """Enforce role-based rules for managing companies.

    - Superadmin can manage any company.
    - Admin can manage only companies within their own tenant.
    - Normal users (and any other roles) cannot manage companies.
    """

    # Superadmin: can manage any company
    if current_user.role == models.UserRole.superadmin:
        return

    # Tenant admin: only companies in their own tenant
    if current_user.role == models.UserRole.admin:
        if company.tenant_id == current_user.tenant_id:
            return
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant admin can only manage companies in their own tenant.",
        )

    # Normal users (and other roles): no company management allowed
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You are not allowed to manage companies.",
    )


def _get_or_create_company_settings(
    db: Session,
    *,
    company_id: int,
) -> dict:
    table = _reflect_table(db, "company_settings")
    if "company_id" not in table.c:
        raise HTTPException(status_code=500, detail="company_settings table missing company_id")

    row = (
        db.execute(table.select().where(table.c.company_id == int(company_id)).limit(1))
        .mappings()
        .first()
    )
    if row is None:
        payload: dict = {"company_id": int(company_id)}
        if "calendar_mode" in table.c:
            payload["calendar_mode"] = "AD"
        db.execute(insert(table).values(**payload))
        db.commit()
        row = (
            db.execute(table.select().where(table.c.company_id == int(company_id)).limit(1))
            .mappings()
            .first()
        )
        if row is None:
            raise HTTPException(status_code=500, detail="Failed to create company settings")

    # Return only fields expected by schema; tolerate missing columns.
    return {
        "company_id": int(row.get("company_id")),
        "calendar_mode": str(row.get("calendar_mode") or "AD"),
        "website_api_key": row.get("website_api_key"),
        "website_api_secret": row.get("website_api_secret"),
        "payment_qr_url": row.get("payment_qr_url"),
        "notify_on_dispatch": bool(row.get("notify_on_dispatch", False)),
        "notify_on_delivery": bool(row.get("notify_on_delivery", False)),
        "notify_on_order_placed": bool(row.get("notify_on_order_placed", False)),
        "notify_on_payment_received": bool(row.get("notify_on_payment_received", False)),
        "notify_on_overdue": bool(row.get("notify_on_overdue", False)),
        "overdue_reminders": row.get("overdue_reminders"),
        "message_templates": row.get("message_templates"),
        "smtp_config": row.get("smtp_config"),
        "whatsapp_config": row.get("whatsapp_config"),
        "ai_provider": row.get("ai_provider"),
        "ai_model": row.get("ai_model"),
        "ai_api_key": row.get("ai_api_key"),
        "ai_temperature": row.get("ai_temperature"),
        "ai_max_tokens": row.get("ai_max_tokens"),
        "ai_system_prompt": row.get("ai_system_prompt"),
        "ai_permissions": row.get("ai_permissions"),
        "ai_chatbot_config": row.get("ai_chatbot_config"),
    }


@router.get("/{company_id}/settings", response_model=schemas.CompanySettingsRead)
def get_company_settings(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("settings.company", "read")),
):
    _get_company_with_access(db, company_id, current_user)
    return _get_or_create_company_settings(db, company_id=company_id)




@router.patch("/{company_id}/settings", response_model=schemas.CompanySettingsRead)
def update_company_settings(
    company_id: int,
    payload: schemas.CompanySettingsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("settings.company", "write")),
):
    company = _get_company_with_access(db, company_id, current_user)
    _ensure_can_manage_company(current_user, company)

    # Use schema-reflected updates to avoid ORM selecting missing columns.
    _get_or_create_company_settings(db, company_id=company_id)
    table = _reflect_table(db, "company_settings")
    data = payload.model_dump(exclude_unset=True)
    updates: dict = {}
    if "calendar_mode" in data and data["calendar_mode"] is not None:
        mode = str(data["calendar_mode"]).upper()
        if mode not in ("AD", "BS"):
            raise HTTPException(status_code=400, detail="calendar_mode must be AD or BS")
        if "calendar_mode" in table.c:
            updates["calendar_mode"] = mode

    if "website_api_key" in data and "website_api_key" in table.c:
        updates["website_api_key"] = data["website_api_key"]

    if "website_api_secret" in data and "website_api_secret" in table.c:
        updates["website_api_secret"] = data["website_api_secret"]

    if "payment_qr_url" in data and "payment_qr_url" in table.c:
        updates["payment_qr_url"] = data["payment_qr_url"]

    if "notify_on_dispatch" in data and "notify_on_dispatch" in table.c:
        updates["notify_on_dispatch"] = bool(data["notify_on_dispatch"])

    if "notify_on_delivery" in data and "notify_on_delivery" in table.c:
        updates["notify_on_delivery"] = bool(data["notify_on_delivery"])

    if "notify_on_order_placed" in data and "notify_on_order_placed" in table.c:
        updates["notify_on_order_placed"] = bool(data["notify_on_order_placed"])

    if "notify_on_payment_received" in data and "notify_on_payment_received" in table.c:
        updates["notify_on_payment_received"] = bool(data["notify_on_payment_received"])

    if "notify_on_overdue" in data and "notify_on_overdue" in table.c:
        updates["notify_on_overdue"] = bool(data["notify_on_overdue"])

    if "overdue_reminders" in data and "overdue_reminders" in table.c:
        updates["overdue_reminders"] = data["overdue_reminders"]

    if "message_templates" in data and "message_templates" in table.c:
        updates["message_templates"] = data["message_templates"]

    if "smtp_config" in data and "smtp_config" in table.c:
        updates["smtp_config"] = data["smtp_config"]

    if "whatsapp_config" in data and "whatsapp_config" in table.c:
        updates["whatsapp_config"] = data["whatsapp_config"]

    if "ai_provider" in data and "ai_provider" in table.c:
        updates["ai_provider"] = data["ai_provider"]

    if "ai_model" in data and "ai_model" in table.c:
        updates["ai_model"] = data["ai_model"]

    if "ai_api_key" in data and "ai_api_key" in table.c:
        updates["ai_api_key"] = data["ai_api_key"]

    if "ai_temperature" in data and "ai_temperature" in table.c:
        updates["ai_temperature"] = data["ai_temperature"]

    if "ai_max_tokens" in data and "ai_max_tokens" in table.c:
        updates["ai_max_tokens"] = data["ai_max_tokens"]

    if "ai_system_prompt" in data and "ai_system_prompt" in table.c:
        updates["ai_system_prompt"] = data["ai_system_prompt"]

    if "ai_permissions" in data and "ai_permissions" in table.c:
        updates["ai_permissions"] = data["ai_permissions"]

    if "ai_chatbot_config" in data and "ai_chatbot_config" in table.c:
        updates["ai_chatbot_config"] = data["ai_chatbot_config"]

    if updates:
        db.execute(
            update(table)
            .where(table.c.company_id == int(company_id))
            .values(**updates)
        )
        db.commit()

    return _get_or_create_company_settings(db, company_id=company_id)


@router.get("/", response_model=list[schemas.CompanyRead])
def list_companies(
    db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)
):
    role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    
    # Base query
    query = db.query(models.Company).outerjoin(
        models.UserCompanyAccess,
        models.UserCompanyAccess.company_id == models.Company.id,
    )

    # Filtering logic:
    # 1. Company owner
    # 2. Explicitly granted access
    # 3. Same tenant (if user is Admin)
    # 4. ALL companies (if user is Superadmin or Ghost and NOT constrained by a tenant)
    
    if role == "superadmin" or role.startswith("ghost_"):
        if current_user.tenant_id is None:
            # Superadmin without a tenant sees EVERYTHING
            return query.distinct().all()
        else:
            # Superadmin constrained to a tenant
            return query.filter(models.Company.tenant_id == current_user.tenant_id).distinct().all()

    filter_conditions = [
        models.Company.owner_id == current_user.id,
        models.UserCompanyAccess.user_id == current_user.id
    ]
    
    if current_user.tenant_id is not None:
        if role == "admin" or role == "tenant":
            filter_conditions.append(models.Company.tenant_id == current_user.tenant_id)

    from sqlalchemy import or_
    companies = query.filter(or_(*filter_conditions)).distinct().all()
    
    return companies


@router.post("/", response_model=schemas.CompanyRead)
def create_company(
    company_in: schemas.CompanyCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(status_code=400, detail="User is not associated with any tenant")

    # Check for duplicate company name in this tenant
    existing = db.query(models.Company).filter(
        models.Company.name == company_in.name,
        models.Company.tenant_id == current_user.tenant_id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Company name already exists in this tenant")

    tenant = db.query(models.Tenant).get(current_user.tenant_id)

    # Prepare data and avoid duplicate business_type_id conflict
    company_data = company_in.model_dump()
    bt_id = company_data.pop("business_type_id", None)
    if bt_id is None and tenant:
        bt_id = tenant.business_type_id

    company = models.Company(
        **company_data,
        owner_id=current_user.id,
        tenant_id=current_user.tenant_id,
        business_type_id=bt_id
    )
    db.add(company)
    db.commit()
    db.refresh(company)

    # Auto-create per-company settings row.
    settings_table = _reflect_table(db, "company_settings")
    if "company_id" in settings_table.c:
        payload: dict = {"company_id": int(company.id)}
        if "calendar_mode" in settings_table.c:
            payload["calendar_mode"] = "AD"
        db.execute(insert(settings_table).values(**payload))
        db.commit()
    _seed_default_chart_for_company(db, company)
    ensure_default_menus_for_company(db, company.id)
    return company


@router.get("/{company_id}", response_model=schemas.CompanyRead)
def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _get_company_with_access(db, company_id, current_user)


@router.put("/{company_id}", response_model=schemas.CompanyRead)
@router.patch("/{company_id}", response_model=schemas.CompanyRead)
def update_company(
    company_id: int,
    company_in: schemas.CompanyUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)

    _ensure_can_manage_company(current_user, company)
    # Check for duplicate company name in this tenant if name is being changed
    new_data = company_in.model_dump(exclude_unset=True)
    if "name" in new_data and new_data["name"] != company.name:
        existing = db.query(models.Company).filter(
            models.Company.name == new_data["name"],
            models.Company.tenant_id == company.tenant_id,
            models.Company.id != company_id
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="Company name already exists in this tenant")

    for field, value in new_data.items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    return company


@router.delete("/{company_id}")
def delete_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = (
        db.query(models.Company)
        .filter(models.Company.id == company_id, models.Company.owner_id == current_user.id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    db.delete(company)
    db.commit()
    return {"detail": "Deleted"}



# Inventory Master (Categories, Subcategories, Brands) routes removed; 
# they are now handled by inventory.py under the same paths.



@router.get(
    "/{company_id}/items/{item_id}/units",
    response_model=list[schemas.ItemUnitRead],
)
def list_item_units_compat(
    company_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    item = (
        db.query(models.Item)
        .filter(
            models.Item.id == item_id,
            models.Item.company_id == company_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    units = (
        db.query(models.ItemUnit)
        .filter(
            models.ItemUnit.company_id == company_id,
            models.ItemUnit.item_id == item_id,
        )
        .order_by(models.ItemUnit.is_base.desc(), models.ItemUnit.sort_order)
        .all()
    )
    return units


@router.put(
    "/{company_id}/items/{item_id}/units",
    response_model=list[schemas.ItemUnitRead],
)
def replace_item_units_compat(
    company_id: int,
    item_id: int,
    units_in: list[schemas.ItemUnitCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    item = (
        db.query(models.Item)
        .filter(
            models.Item.id == item_id,
            models.Item.company_id == company_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")

    if not units_in:
        raise HTTPException(status_code=400, detail="At least one unit is required")

    base_units = [u for u in units_in if u.is_base]
    if len(base_units) != 1:
        raise HTTPException(
            status_code=400,
            detail="Exactly one base unit (is_base=true) is required",
        )
    base_unit = base_units[0]
    if base_unit.factor_to_base != 1:
        raise HTTPException(
            status_code=400,
            detail="Base unit must have factor_to_base = 1",
        )

    item.unit = base_unit.unit_code

    db.query(models.ItemUnit).filter(
        models.ItemUnit.company_id == company_id,
        models.ItemUnit.item_id == item_id,
    ).delete()

    new_units: list[models.ItemUnit] = []
    for idx, unit_in in enumerate(units_in, start=1):
        unit = models.ItemUnit(
            company_id=company_id,
            item_id=item_id,
            unit_code=unit_in.unit_code,
            is_base=unit_in.is_base,
            factor_to_base=unit_in.factor_to_base,
            decimals=unit_in.decimals,
            sort_order=unit_in.sort_order if unit_in.sort_order is not None else idx,
        )
        db.add(unit)
        new_units.append(unit)

    db.commit()

    for unit in new_units:
        db.refresh(unit)

    return new_units


@router.get("/{company_id}/vouchers", response_model=list[schemas.VoucherRead])
def list_company_vouchers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    vouchers = (
        db.query(models.Voucher)
        .filter(models.Voucher.company_id == company_id)
        .order_by(models.Voucher.voucher_date.desc(), models.Voucher.id.desc())
        .all()
    )

    # Reuse the core vouchers router helpers so total_amount and origin
    # semantics stay consistent.
    from .vouchers import (
        _compute_voucher_total,
        _compute_voucher_origin,
        _voucher_date_bs_for_company,
    )  # type: ignore

    results: list[schemas.VoucherRead] = []
    for v in vouchers:
        total_amount = _compute_voucher_total(db, company_id, v)
        origin_type, origin_id = _compute_voucher_origin(db, company_id, v)
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
                department_name=(v.department.name if getattr(v, "department", None) is not None else None),
                project_name=(v.project.name if getattr(v, "project", None) is not None else None),
                bank_remark=v.bank_remark,
                payment_mode=(v.payment_mode.name if getattr(v, "payment_mode", None) is not None else None),
                segment_id=v.segment_id,
                employee_id=v.employee_id,
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
                    )
                    for line in v.lines
                ],

                total_amount=total_amount,
                origin_type=origin_type,
                origin_id=origin_id,
            )
        )

    return results


@router.post("/{company_id}/vouchers", response_model=schemas.VoucherRead)
def create_company_voucher(
    company_id: int,
    voucher_in: schemas.VoucherCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint matching POST /companies/{company_id}/vouchers.

    Delegates to the core vouchers.create_voucher logic so numbering,
    validation, and logging stay centralized.
    """

    from .vouchers import create_voucher as _create_voucher_internal  # type: ignore

    return _create_voucher_internal(
        company_id,
        voucher_in,
        background_tasks,
        db,
        current_user,
    )


@router.post("/{company_id}/vouchers/cash-simple", response_model=schemas.VoucherRead)
def create_company_cash_voucher_simple(
    company_id: int,
    voucher_in: schemas.CashVoucherSimpleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint for one-click cash/bank PAYMENT/RECEIPT vouchers.

    Frontend calls /companies/{company_id}/vouchers/cash-simple with a very
    small payload; internally we delegate to the vouchers router so that
    numbering, validation, and logging all stay centralized.
    """

    from .vouchers import create_cash_voucher_simple as _create_cash_voucher_internal  # type: ignore

    return _create_cash_voucher_internal(
        company_id,
        voucher_in,
        db,
        current_user,
    )


@router.post("/{company_id}/vouchers/simple", response_model=schemas.VoucherRead)
def create_company_voucher_simple(
    company_id: int,
    voucher_in: schemas.VoucherCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint that forwards to the core voucher creation logic.

    Frontend calls /companies/{company_id}/vouchers/simple; internally we
    delegate to the vouchers router's create_voucher so all validation,
    numbering, and logging stay in one place.
    """

    from .vouchers import create_voucher as _create_voucher_internal  # type: ignore

    return _create_voucher_internal(
        company_id,
        voucher_in,
        background_tasks,
        db,
        current_user,
    )


@router.get(
    "/{company_id}/vouchers/counterparty-ledgers",
    response_model=list[schemas.LedgerCounterpartyRead],
)
def list_company_counterparty_ledgers(
    company_id: int,
    request: Request,
    voucher_type: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint for /companies/{company_id}/vouchers/counterparty-ledgers.

    This must exist because /companies/{company_id}/vouchers/{voucher_id} would
    otherwise treat 'counterparty-ledgers' as voucher_id and trigger a 422.
    """

    from .vouchers import list_counterparty_ledgers as _list_counterparty_ledgers  # type: ignore

    return _list_counterparty_ledgers(
        company_id=company_id,
        request=request,
        voucher_type=voucher_type,
        db=db,
        current_user=current_user,
    )


@router.get("/{company_id}/vouchers/{voucher_id}", response_model=schemas.VoucherRead)
def get_company_voucher(
    company_id: int,
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)

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

    # Reuse the core vouchers router helpers so total_amount and origin
    # semantics stay consistent.
    from .vouchers import (
        _compute_voucher_total,
        _compute_voucher_origin,
        _voucher_date_bs_for_company,
    )  # type: ignore
    
    total_amount = _compute_voucher_total(db, company_id, voucher)
    origin_type, origin_id = _compute_voucher_origin(db, company_id, voucher)
    voucher_date_bs = _voucher_date_bs_for_company(db, company_id=company_id, voucher_date=voucher.voucher_date)

    return schemas.VoucherRead(
        id=voucher.id,
        company_id=voucher.company_id,
        voucher_date=voucher.voucher_date,
        voucher_date_bs=voucher_date_bs,
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
        origin_type=origin_type,
        origin_id=origin_id,
    )


@router.get("/{company_id}/debug/vouchers/sample", response_model=list[schemas.VoucherRead])
def debug_sample_vouchers(
    company_id: int,
    only_sales_invoices: bool = False,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return a small sample of vouchers for quick debugging.

    This is intended to help verify that payment_mode and voucher lines for
    sales-invoice-origin vouchers look correct without needing any frontend
    changes.
    """

    _get_company_with_access(db, company_id, current_user)

    query = db.query(models.Voucher).filter(models.Voucher.company_id == company_id)
    if only_sales_invoices:
        query = query.filter(models.Voucher.voucher_type == models.VoucherType.SALES_INVOICE)

    vouchers = (
        query.order_by(models.Voucher.voucher_date.desc(), models.Voucher.id.desc())
        .limit(max(1, min(limit, 100)))
        .all()
    )

    from .vouchers import (
        _compute_voucher_total,
        _compute_voucher_origin,
        _voucher_date_bs_for_company,
    )  # type: ignore

    results: list[schemas.VoucherRead] = []
    for v in vouchers:
        total_amount = _compute_voucher_total(db, company_id, v)
        origin_type, origin_id = _compute_voucher_origin(db, company_id, v)
        voucher_date_bs = _voucher_date_bs_for_company(db, company_id=company_id, voucher_date=v.voucher_date)
        
        results.append(
            schemas.VoucherRead(
                id=v.id,
                company_id=v.company_id,
                voucher_date=v.voucher_date,
                voucher_date_bs=voucher_date_bs,
                voucher_type=v.voucher_type,
                narration=v.narration,
                payment_mode_id=v.payment_mode_id,
                department_id=v.department_id,
                project_id=v.project_id,
                bank_remark=v.bank_remark,
                payment_mode=(v.payment_mode.name if getattr(v, "payment_mode", None) is not None else None),
                segment_id=v.segment_id,
                employee_id=v.employee_id,
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
                    )
                    for line in v.lines
                ],
                total_amount=total_amount,
                origin_type=origin_type,
                origin_id=origin_id,
            )
        )

    return results


@router.put("/{company_id}/vouchers/{voucher_id}", response_model=schemas.VoucherRead)
def update_company_voucher(
    company_id: int,
    voucher_id: int,
    voucher_in: schemas.VoucherUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint for PUT /companies/{company_id}/vouchers/{voucher_id}.

    Delegates to the core vouchers.update_voucher logic so validation,
    logging, and numbering rules stay centralized.
    """

    from .vouchers import update_voucher as _update_voucher_internal  # type: ignore

    return _update_voucher_internal(
        company_id,
        voucher_id,
        voucher_in,
        db,
        current_user,
    )


@router.delete("/{company_id}/vouchers/{voucher_id}")
def delete_company_voucher(
    company_id: int,
    voucher_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint for DELETE /companies/{company_id}/vouchers/{voucher_id}.

    Delegates to the core vouchers.delete_voucher logic, keeping all
    voucher deletion side-effects in a single place.
    """

    from .vouchers import delete_voucher as _delete_voucher_internal  # type: ignore

    return _delete_voucher_internal(
        company_id,
        voucher_id,
        db,
        current_user,
    )


@router.get("/{company_id}/bills", response_model=list[schemas.PurchaseBillRead])
def list_company_bills(
    company_id: int,
    voucher_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    query = db.query(models.PurchaseBill).filter(models.PurchaseBill.company_id == company_id)
    if voucher_id is not None:
        query = query.filter(models.PurchaseBill.voucher_id == voucher_id)
    bills = query.order_by(models.PurchaseBill.date.desc(), models.PurchaseBill.id.desc()).all()
    return bills


@router.get("/{company_id}/header-ledger-defaults")
def get_header_ledger_defaults(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return effective header-level default ledgers for bills and invoices.

    This exposes the exact ledger IDs the backend will use when header-level
    ledger fields are omitted on create, so the frontend can initialize
    dropdowns without guessing.
    """

    company = _get_company_with_access(db, company_id, current_user)

    # Purchase defaults come from company-level fields wired during seeding.
    purchase_ledger_id = company.default_purchase_ledger_id
    input_tax_ledger_id = company.default_input_tax_ledger_id

    # Sales defaults: prefer company-level defaults when configured.
    sales_ledger_id = company.default_sales_ledger_id
    output_tax_ledger_id = company.default_output_tax_ledger_id

    # Fall back to standard seeded codes only if company-level values are missing.
    sales_ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.code == "SALES",
        )
        .first()
    )
    output_tax_ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.code.in_(["OUTPUT_TAX", "OUTPUT_VAT"]),
        )
        .first()
    )

    return {
        "purchase_ledger_id": purchase_ledger_id,
        "input_tax_ledger_id": input_tax_ledger_id,
        "sales_ledger_id": (
            sales_ledger_id
            if sales_ledger_id is not None
            else (sales_ledger.id if sales_ledger is not None else None)
        ),
        "output_tax_ledger_id": (
            output_tax_ledger_id
            if output_tax_ledger_id is not None
            else (output_tax_ledger.id if output_tax_ledger is not None else None)
        ),
    }


@router.get("/{company_id}/item-ledger-defaults")
def get_item_ledger_defaults(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return effective item-level default ledgers.

    This endpoint exposes the exact ledger IDs the backend will apply during
    item creation when the client omits item-level ledger bindings.
    """

    company = _get_company_with_access(db, company_id, current_user)

    income_ledger_id = company.default_item_income_ledger_id
    sales_ledger_id = company.default_sales_ledger_id
    expense_ledger_id = company.default_item_expense_ledger_id
    purchase_ledger_id = company.default_purchase_ledger_id
    output_tax_ledger_id = company.default_item_output_tax_ledger_id
    input_tax_ledger_id = company.default_item_input_tax_ledger_id

    if sales_ledger_id is None:
        sales_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code == "SALES",
            )
            .first()
        )
        if sales_ledger is not None:
            sales_ledger_id = sales_ledger.id

    if income_ledger_id is None:
        named_income_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.is_active == True,
                models.Ledger.name == "Sales (Goods/Service)",
            )
            .order_by(models.Ledger.id.asc())
            .first()
        )
        if named_income_ledger is not None:
            income_ledger_id = named_income_ledger.id

    if purchase_ledger_id is None:
        purchases_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code == "PURCHASES",
            )
            .first()
        )
        if purchases_ledger is not None:
            purchase_ledger_id = purchases_ledger.id

    if expense_ledger_id is None:
        stock_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code == "CLOSING_STOCK",
            )
            .first()
        )
        if stock_ledger is None:
            stock_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code == "OPENING_STOCK",
                )
                .first()
            )
        if stock_ledger is not None:
            expense_ledger_id = stock_ledger.id

    if output_tax_ledger_id is None:
        output_tax_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code.in_(["OUTPUT_TAX", "OUTPUT_VAT"]),
            )
            .first()
        )
        if output_tax_ledger is not None:
            output_tax_ledger_id = output_tax_ledger.id

    if output_tax_ledger_id is None:
        fallback_output_tax_ledger = (
            db.query(models.Ledger)
            .join(models.LedgerGroup, models.LedgerGroup.id == models.Ledger.group_id)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.is_active == True,
                models.LedgerGroup.name == "Duties & Taxes",
            )
            .order_by(models.Ledger.id.asc())
            .first()
        )
        if fallback_output_tax_ledger is not None:
            output_tax_ledger_id = fallback_output_tax_ledger.id

    if input_tax_ledger_id is None:
        input_tax_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.code.in_(["INPUT_TAX", "INPUT_VAT"]),
            )
            .first()
        )
        if input_tax_ledger is not None:
            input_tax_ledger_id = input_tax_ledger.id

    if input_tax_ledger_id is None:
        fallback_input_tax_ledger = (
            db.query(models.Ledger)
            .join(models.LedgerGroup, models.LedgerGroup.id == models.Ledger.group_id)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.is_active == True,
                models.LedgerGroup.name == "Input Tax Credits",
            )
            .order_by(models.Ledger.id.asc())
            .first()
        )
        if fallback_input_tax_ledger is not None:
            input_tax_ledger_id = fallback_input_tax_ledger.id

    updated = False
    if company.default_sales_ledger_id is None and sales_ledger_id is not None:
        company.default_sales_ledger_id = sales_ledger_id
        updated = True
    if company.default_purchase_ledger_id is None and purchase_ledger_id is not None:
        company.default_purchase_ledger_id = purchase_ledger_id
        updated = True
    if company.default_item_income_ledger_id is None and income_ledger_id is not None:
        company.default_item_income_ledger_id = income_ledger_id
        updated = True
    if company.default_item_expense_ledger_id is None and expense_ledger_id is not None:
        company.default_item_expense_ledger_id = expense_ledger_id
        updated = True
    if company.default_item_output_tax_ledger_id is None and output_tax_ledger_id is not None:
        company.default_item_output_tax_ledger_id = output_tax_ledger_id
        updated = True
    if company.default_item_input_tax_ledger_id is None and input_tax_ledger_id is not None:
        company.default_item_input_tax_ledger_id = input_tax_ledger_id
        updated = True

    if updated:
        db.add(company)
        db.commit()

    return {
        "income_ledger_id": income_ledger_id,
        "sales_ledger_id": sales_ledger_id,
        "expense_ledger_id": expense_ledger_id,
        "purchase_ledger_id": purchase_ledger_id,
        "output_tax_ledger_id": output_tax_ledger_id,
        "input_tax_ledger_id": input_tax_ledger_id,
    }


@router.put("/{company_id}/item-ledger-defaults")
def update_item_ledger_defaults(
    company_id: int,
    payload: schemas.ItemLedgerDefaultsUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    _ensure_can_manage_company(current_user, company)

    data = payload.model_dump(exclude_unset=True)

    incoming_income = data.get("income_ledger_id")
    incoming_sales = data.get("sales_ledger_id")
    incoming_expense = data.get("expense_ledger_id")
    incoming_purchase = data.get("purchase_ledger_id")
    incoming_output_tax = data.get("output_tax_ledger_id")
    incoming_input_tax = data.get("input_tax_ledger_id")

    ledger_ids_to_check: list[int] = [
        v
        for v in (
            incoming_income,
            incoming_sales,
            incoming_expense,
            incoming_purchase,
            incoming_output_tax,
            incoming_input_tax,
        )
        if v is not None
    ]
    if ledger_ids_to_check:
        count = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.id.in_(ledger_ids_to_check),
            )
            .count()
        )
        if count != len(set(ledger_ids_to_check)):
            raise HTTPException(status_code=400, detail="One or more ledger IDs are invalid for this company")

    if "sales_ledger_id" in data:
        company.default_sales_ledger_id = incoming_sales
    if "purchase_ledger_id" in data:
        company.default_purchase_ledger_id = incoming_purchase
    if "income_ledger_id" in data:
        company.default_item_income_ledger_id = incoming_income
    if "expense_ledger_id" in data:
        company.default_item_expense_ledger_id = incoming_expense
    if "output_tax_ledger_id" in data:
        company.default_item_output_tax_ledger_id = incoming_output_tax
    if "input_tax_ledger_id" in data:
        company.default_item_input_tax_ledger_id = incoming_input_tax

    db.add(company)
    db.commit()
    db.refresh(company)

    return {
        "income_ledger_id": company.default_item_income_ledger_id,
        "sales_ledger_id": company.default_sales_ledger_id,
        "expense_ledger_id": company.default_item_expense_ledger_id,
        "purchase_ledger_id": company.default_purchase_ledger_id,
        "output_tax_ledger_id": company.default_item_output_tax_ledger_id,
        "input_tax_ledger_id": company.default_item_input_tax_ledger_id,
    }


@router.post("/{company_id}/bills", response_model=schemas.PurchaseBillRead)
def create_company_bill(
    company_id: int,
    bill_in: schemas.PurchaseBillCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Compatibility endpoint.
    # Delegate to the canonical purchases router implementation so inventory
    # purchases post stock movements/ledger rows consistently.
    from .purchases import create_bill as _create_bill_internal  # type: ignore

    return _create_bill_internal(
        company_id,
        bill_in,
        db,
        current_user,
    )


@router.get("/{company_id}/bills/export-template")
def export_purchase_bill_template_compat(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Compatibility endpoint.
    from .purchases import export_purchase_bill_template as _export_internal  # type: ignore

    return _export_internal(
        company_id,
        db,
        current_user,
    )


@router.post("/{company_id}/bills/parse-excel")
async def parse_purchase_bills_excel_compat(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Compatibility endpoint.
    from .purchases import parse_purchase_bills_excel as _parse_internal  # type: ignore

    return await _parse_internal(
        company_id,
        file,
        db,
        current_user,
    )


@router.post("/{company_id}/bills/confirm-import")
def confirm_purchase_bills_import_compat(
    company_id: int,
    bills_in: list[dict],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Compatibility endpoint.
    from .purchases import confirm_purchase_bills_import as _confirm_internal  # type: ignore

    return _confirm_internal(
        company_id,
        bills_in,
        db,
        current_user,
    )


@router.put("/{company_id}/bills/{bill_id}", response_model=schemas.PurchaseBillRead)
def update_company_bill(
    company_id: int,
    bill_id: int,
    bill_in: schemas.PurchaseBillUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Compatibility endpoint.
    # Delegate to the canonical purchases router implementation so edits
    # properly reverse/repost stock ledger rows.
    from .purchases import update_bill as _update_bill_internal  # type: ignore

    return _update_bill_internal(
        company_id,
        bill_id,
        bill_in,
        db,
        current_user,
    )


@router.get("/{company_id}/bills/{bill_id}", response_model=schemas.PurchaseBillRead)
def get_company_bill(
    company_id: int,
    bill_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Compatibility endpoint.
    # Delegate to the canonical purchases router implementation.
    from .purchases import get_bill as _get_bill_internal  # type: ignore

    return _get_bill_internal(
        company_id,
        bill_id,
        db,
        current_user,
    )


@router.get("/{company_id}/invoices", response_model=list[schemas.SalesInvoiceRead])
def list_company_invoices(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    invoices = (
        db.query(models.SalesInvoice)
        .filter(models.SalesInvoice.company_id == company_id)
        .order_by(models.SalesInvoice.date.desc(), models.SalesInvoice.id.desc())
        .all()
    )
    return invoices


@router.get("/{company_id}/sales/invoices/export-template")
def export_sales_invoice_template_compat(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint: /companies/{company_id}/sales/invoices/export-template."""
    from .sales import export_sales_invoice_template as _export_internal  # type: ignore

    return _export_internal(
        company_id,
        db,
        current_user,
    )


@router.post("/{company_id}/sales/invoices/parse-excel")
async def parse_sales_invoices_excel_compat(
    company_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint: /companies/{company_id}/sales/invoices/parse-excel."""
    from .sales import parse_sales_invoices_excel as _parse_internal  # type: ignore

    return await _parse_internal(
        company_id,
        file,
        db,
        current_user,
    )


@router.post("/{company_id}/sales/invoices/confirm-import")
def confirm_sales_invoices_import_compat(
    company_id: int,
    invoices_in: list[dict],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint: /companies/{company_id}/sales/invoices/confirm-import."""
    from .sales import confirm_sales_invoices_import as _confirm_internal  # type: ignore

    return _confirm_internal(
        company_id,
        invoices_in,
        db,
        current_user,
    )


@router.post("/{company_id}/invoices", response_model=schemas.SalesInvoiceRead)
def create_company_invoice(
    company_id: int,
    invoice_in: schemas.SalesInvoiceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compatibility endpoint that forwards to the core sales.create_invoice.

    Frontend calls /companies/{company_id}/invoices; internally we delegate to
    the sales router so that voucher creation and validation stay centralized.
    """

    from .sales import create_invoice as _create_invoice_internal  # type: ignore

    return _create_invoice_internal(
        company_id,
        invoice_in,
        db,
        current_user,
    )


@router.get("/{company_id}/customers", response_model=list[schemas.CustomerRead])
def list_company_customers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    customers = (
        db.query(models.Customer)
        .filter(models.Customer.company_id == company_id)
        .order_by(models.Customer.name)
        .all()
    )
    return customers


@router.get("/{company_id}/customers/{customer_id}", response_model=schemas.CustomerRead)
def get_company_customer(
    company_id: int,
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    customer = (
        db.query(models.Customer)
        .filter(
            models.Customer.id == customer_id,
            models.Customer.company_id == company_id,
        )
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    return customer


@router.put("/{company_id}/customers/{customer_id}", response_model=schemas.CustomerRead)
def update_company_customer(
    company_id: int,
    customer_id: int,
    customer_in: schemas.CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    customer = (
        db.query(models.Customer)
        .filter(
            models.Customer.id == customer_id,
            models.Customer.company_id == company_id,
        )
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    update_data = customer_in.model_dump(exclude_unset=True)
    # Do not allow changing company_id or ledger_id via this endpoint
    update_data.pop("company_id", None)
    update_data.pop("ledger_id", None)

    for field, value in update_data.items():
        setattr(customer, field, value)
    db.commit()
    db.refresh(customer)
    return customer


@router.delete("/{company_id}/customers/{customer_id}")
def delete_company_customer(
    company_id: int,
    customer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    customer = (
        db.query(models.Customer)
        .filter(
            models.Customer.id == customer_id,
            models.Customer.company_id == company_id,
        )
        .first()
    )
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")
    db.delete(customer)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/{company_id}/customers", response_model=schemas.CustomerRead)
def create_company_customer(
    company_id: int,
    customer_in: schemas.CustomerCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)
    # Automatically create a dedicated ledger for this customer under
    # the company's "Sundry Debtors" group so each customer has its
    # own ledger instead of sharing a single CUSTOMERS ledger.

    debtor_group = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.name == "Sundry Debtors",
        )
        .first()
    )
    if not debtor_group:
        raise HTTPException(
            status_code=400,
            detail="Ledger group 'Sundry Debtors' not found for this company",
        )

    # Default opening balance type based on group type: assets/debtors are
    # debit by nature, liabilities are credit, mirroring seeding logic.
    if debtor_group.group_type in (models.LedgerGroupType.ASSET, models.LedgerGroupType.EXPENSE):
        ob_type = models.OpeningBalanceType.DEBIT
    else:
        ob_type = models.OpeningBalanceType.CREDIT

    customer_data = customer_in.model_dump(exclude={"ledger_id"})

    normalized_ledger_name = str(customer_data.get("name", "Customer")).strip()

    existing_ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            func.lower(func.btrim(models.Ledger.name))
            == func.lower(func.btrim(normalized_ledger_name)),
        )
        .first()
    )
    if existing_ledger is not None:
        raise HTTPException(
            status_code=409,
            detail="Ledger already exists with the same name. Please use a different customer name.",
        )

    customer_ledger = models.Ledger(
        company_id=company_id,
        group_id=debtor_group.id,
        name=normalized_ledger_name,
        code=None,
        opening_balance=customer_data.get("opening_balance") or 0,
        opening_balance_type=customer_data.get("balance_type") or ob_type,
        is_active=True,
    )
    db.add(customer_ledger)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Ledger already exists with the same name. Please use a different customer name.",
        )

    customer = models.Customer(
        company_id=company_id,
        ledger_id=customer_ledger.id,
        **customer_data,
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)
    return customer


@router.get("/{company_id}/default-ledgers")
def get_company_default_ledgers(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company_with_access(db, company_id, current_user)

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

    return {
        ledger.code: {
            "id": ledger.id,
            "name": ledger.name,
            "group_id": ledger.group_id,
        }
        for ledger in ledgers
        if ledger.code is not None
    }
