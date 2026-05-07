from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, aliased
from sqlalchemy import or_, func, case, and_
from datetime import date, datetime, timedelta

from .. import models, schemas
from ..auth import get_current_user, get_current_admin
from ..database import get_db
from ..voucher_service import get_next_voucher_number
from ..stock_service import StockValuationService
from ..dependencies import get_company_secure
from ..permissions import require_menu_access


router = APIRouter(prefix="/companies/{company_id}", tags=["inventory"])


def _get_effective_inventory_valuation_method(
    *,
    company: models.Company,
) -> models.InventoryValuationMethod | None:
    tenant_method = None
    if getattr(company, "tenant", None) is not None:
        tenant_method = getattr(company.tenant, "inventory_valuation_method", None)
    if tenant_method is not None:
        return tenant_method
    return getattr(company, "inventory_valuation_method", None)


def _get_default_stock_ledger_id(db: Session, *, company_id: int) -> int | None:
    Ledger = models.Ledger
    LedgerGroup = models.LedgerGroup

    ledger = (
        db.query(Ledger)
        .filter(
            Ledger.company_id == company_id,
            Ledger.code == "CLOSING_STOCK",
        )
        .first()
    )
    if ledger is not None:
        return ledger.id

    ledger = (
        db.query(Ledger)
        .filter(
            Ledger.company_id == company_id,
            Ledger.code == "OPENING_STOCK",
        )
        .first()
    )
    if ledger is not None:
        return ledger.id

    stock_group = (
        db.query(LedgerGroup)
        .filter(
            LedgerGroup.company_id == company_id,
            LedgerGroup.name == "Stock-in-Hand",
        )
        .first()
    )
    if stock_group is None:
        stock_group = LedgerGroup(
            company_id=company_id,
            name="Stock-in-Hand",
            group_type=models.LedgerGroupType.ASSET,
            parent_group_id=None,
        )
        db.add(stock_group)
        db.flush()

    ledger = (
        db.query(Ledger)
        .filter(
            Ledger.company_id == company_id,
            Ledger.group_id == stock_group.id,
            Ledger.name.in_(["Closing Stock", "Inventory", "Stock"]),
        )
        .first()
    )
    if ledger is not None:
        return ledger.id

    ledger = Ledger(
        company_id=company_id,
        group_id=stock_group.id,
        name="Closing Stock",
        code="CLOSING_STOCK",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    db.add(ledger)
    db.flush()
    return ledger.id


def _get_default_purchase_asset_ledger_id(db: Session, *, company_id: int) -> int | None:
    Ledger = models.Ledger
    LedgerGroup = models.LedgerGroup

    ledger = (
        db.query(Ledger)
        .filter(
            Ledger.company_id == company_id,
            Ledger.code == "PURCHASES_ASSET",
        )
        .first()
    )
    if ledger is not None:
        return ledger.id

    stock_group = (
        db.query(LedgerGroup)
        .filter(
            LedgerGroup.company_id == company_id,
            LedgerGroup.name == "Stock-in-Hand",
        )
        .first()
    )
    if stock_group is None:
        stock_group = LedgerGroup(
            company_id=company_id,
            name="Stock-in-Hand",
            group_type=models.LedgerGroupType.ASSET,
            parent_group_id=None,
        )
        db.add(stock_group)
        db.flush()

    ledger = (
        db.query(Ledger)
        .filter(
            Ledger.company_id == company_id,
            Ledger.group_id == stock_group.id,
            Ledger.name.in_(["Purchase", "Purchases", "Purchase (Inventory)"]),
        )
        .first()
    )
    if ledger is not None:
        return ledger.id

    ledger = Ledger(
        company_id=company_id,
        group_id=stock_group.id,
        name="Purchase",
        code="PURCHASES_ASSET",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    db.add(ledger)
    db.flush()
    return ledger.id


def _sync_item_units(
    *,
    db: Session,
    company_id: int,
    item: models.Item,
    units_in: list[schemas.ItemUnitCreate],
) -> None:
    if not units_in:
        return

    base_units = [u for u in units_in if u.is_base]
    if len(base_units) != 1:
        raise HTTPException(
            status_code=400,
            detail="Exactly one base unit (is_base=true) is required for Units & Conversions",
        )
    base_unit = base_units[0]
    if base_unit.factor_to_base != 1:
        raise HTTPException(
            status_code=400,
            detail="Base unit in Conversions must have factor = 1",
        )

    # Sync base unit code to the item model for legacy/convenience
    item.unit = base_unit.unit_code

    # Remove existing units
    db.query(models.ItemUnit).filter(
        models.ItemUnit.company_id == company_id,
        models.ItemUnit.item_id == item.id,
    ).delete()

    # Add new units
    for idx, unit_in in enumerate(units_in, start=1):
        db.add(
            models.ItemUnit(
                company_id=company_id,
                item_id=item.id,
                unit_code=unit_in.unit_code,
                is_base=unit_in.is_base,
                factor_to_base=unit_in.factor_to_base,
                decimals=unit_in.decimals,
                sort_order=unit_in.sort_order if unit_in.sort_order is not None else idx,
            )
        )
    db.flush()


def _compute_valuation_layers_fifo(
    *,
    db: Session,
    company_id: int,
    item_id: int,
    warehouse_id: int,
    as_of: datetime,
) -> list[list[float]]:
    Item = models.Item
    StockLedger = models.StockLedger

    item = (
        db.query(Item)
        .filter(Item.company_id == company_id, Item.id == item_id)
        .first()
    )
    if item is None:
        return []

    layers: list[list[float]] = []
    opening_qty = float(item.opening_stock or 0)
    if opening_qty > 0:
        opening_value = item.opening_value
        if opening_value is None:
            opening_rate = float(item.opening_rate or 0)
            opening_value = opening_qty * opening_rate
        opening_cost = (float(opening_value) / opening_qty) if opening_qty else 0.0
        layers.append([opening_qty, opening_cost])

    rows = (
        db.query(StockLedger.qty_delta, StockLedger.unit_cost)
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.item_id == item_id,
            StockLedger.warehouse_id == warehouse_id,
            StockLedger.reversed_at.is_(None),
            StockLedger.posted_at <= as_of,
        )
        .order_by(StockLedger.posted_at.asc(), StockLedger.id.asc())
        .all()
    )

    for qty_delta, unit_cost in rows:
        qty_delta_f = float(qty_delta or 0)
        if qty_delta_f > 0:
            layers.append([qty_delta_f, float(unit_cost) if unit_cost is not None else 0.0])
        elif qty_delta_f < 0:
            remaining = -qty_delta_f
            while remaining > 1e-9 and layers:
                layer_qty, layer_cost = layers[0]
                take = layer_qty if layer_qty <= remaining else remaining
                layer_qty -= take
                remaining -= take
                if layer_qty <= 1e-9:
                    layers.pop(0)
                else:
                    layers[0][0] = layer_qty

    return layers


def _compute_issue_unit_cost(
    *,
    db: Session,
    company: models.Company,
    company_id: int,
    item_id: int,
    warehouse_id: int,
    as_of: datetime,
    qty_out: float,
) -> float:
    method = _get_effective_inventory_valuation_method(company=company)

    if method == models.InventoryValuationMethod.FIFO:
        layers = _compute_valuation_layers_fifo(
            db=db,
            company_id=company_id,
            item_id=item_id,
            warehouse_id=warehouse_id,
            as_of=as_of,
        )
        remaining = float(qty_out or 0)
        if remaining <= 0:
            return 0.0
        total_cost = 0.0
        while remaining > 1e-9 and layers:
            layer_qty, layer_cost = layers[0]
            take = layer_qty if layer_qty <= remaining else remaining
            total_cost += take * layer_cost
            layer_qty -= take
            remaining -= take
            if layer_qty <= 1e-9:
                layers.pop(0)
            else:
                layers[0][0] = layer_qty
        return (total_cost / float(qty_out)) if float(qty_out) else 0.0

    Item = models.Item
    StockLedger = models.StockLedger

    item = (
        db.query(Item)
        .filter(Item.company_id == company_id, Item.id == item_id)
        .first()
    )
    if item is None:
        return 0.0

    opening_qty = float(item.opening_stock or 0)
    opening_value = item.opening_value
    if opening_value is None:
        opening_rate = getattr(item, "opening_rate", None)
        if opening_rate is None:
            # Opening quantity exists without any valuation. Do not include it
            # in the average-cost denominator; otherwise it dilutes unit cost
            # (e.g. purchase 500 becomes 125 when opening_qty=3).
            opening_qty = 0.0
            opening_value = 0.0
        else:
            opening_value = opening_qty * float(opening_rate or 0)
    opening_value_f = float(opening_value or 0)

    agg = (
        db.query(
            func.coalesce(
                func.sum(
                    case(
                        (
                            (StockLedger.unit_cost.is_not(None))
                            & (StockLedger.source_type.in_(["PURCHASE_BILL", "PURCHASE_RETURN"]))
                            ,
                            StockLedger.qty_delta,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (StockLedger.unit_cost.is_not(None))
                            & (StockLedger.source_type.in_(["PURCHASE_BILL", "PURCHASE_RETURN"]))
                            ,
                            StockLedger.qty_delta * StockLedger.unit_cost,
                        ),
                        else_=0,
                    )
                ),
                0,
            ),
        )
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.item_id == item_id,
            StockLedger.warehouse_id == warehouse_id,
            StockLedger.reversed_at.is_(None),
            StockLedger.posted_at <= as_of,
        )
        .first()
    )
    if agg is None:
        return (opening_value_f / opening_qty) if opening_qty else 0.0

    cost_qty_delta = float(agg[0] or 0)
    cost_value_delta = float(agg[1] or 0)
    denom_qty = opening_qty + cost_qty_delta
    return ((opening_value_f + cost_value_delta) / denom_qty) if denom_qty else 0.0


def _reverse_stock_ledger(
    *,
    db: Session,
    company_id: int,
    source_type: str,
    source_id: int,
    created_by: int | None,
) -> None:
    StockLedger = models.StockLedger
    now = datetime.utcnow()
    rows = (
        db.query(StockLedger)
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.source_type == source_type,
            StockLedger.source_id == source_id,
            StockLedger.reversed_at.is_(None),
        )
        .all()
    )
    if not rows:
        return

    for r in rows:
        r.reversed_at = now
        db.add(
            StockLedger(
                company_id=r.company_id,
                warehouse_id=r.warehouse_id,
                item_id=r.item_id,
                qty_delta=-float(r.qty_delta),
                unit_cost=r.unit_cost,
                source_type=r.source_type,
                source_id=r.source_id,
                source_line_id=r.source_line_id,
                posted_at=now,
                reversal_of_ledger_id=r.id,
                created_by=created_by,
            )
        )


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


# -------- Item Categories --------


@router.get("/categories", response_model=list[schemas.ItemCategoryRead])
def list_item_categories(
    company_id: int,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.categories", "read")),
):
    _get_company(db, company_id, current_user)

    query = db.query(models.ItemCategory).filter(models.ItemCategory.company_id == company_id)
    if is_active is not None:
        query = query.filter(models.ItemCategory.is_active == is_active)
    return query.order_by(models.ItemCategory.name).all()


@router.post("/categories", response_model=schemas.ItemCategoryRead)
def create_item_category(
    company_id: int,
    category_in: schemas.ItemCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.categories", "write")),
):
    _get_company(db, company_id, current_user)

    category = models.ItemCategory(company_id=company_id, **category_in.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


@router.get("/categories/{category_id}", response_model=schemas.ItemCategoryRead)
def get_item_category(
    company_id: int,
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.categories", "read")),
):
    _get_company(db, company_id, current_user)
    category = (
        db.query(models.ItemCategory)
        .filter(
            models.ItemCategory.id == category_id,
            models.ItemCategory.company_id == company_id,
        )
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    return category


@router.put("/categories/{category_id}", response_model=schemas.ItemCategoryRead)
def update_item_category(
    company_id: int,
    category_id: int,
    category_in: schemas.ItemCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.categories", "write")),
):
    _get_company(db, company_id, current_user)
    category = (
        db.query(models.ItemCategory)
        .filter(
            models.ItemCategory.id == category_id,
            models.ItemCategory.company_id == company_id,
        )
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for field, value in category_in.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
def delete_item_category(
    company_id: int,
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.categories", "write")),
):
    _get_company(db, company_id, current_user)
    category = (
        db.query(models.ItemCategory)
        .filter(
            models.ItemCategory.id == category_id,
            models.ItemCategory.company_id == company_id,
        )
        .first()
    )
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    db.delete(category)
    db.commit()
    return {"detail": "Deleted"}


# -------- Item Subcategories --------


@router.get("/subcategories", response_model=list[schemas.ItemSubCategoryRead])
def list_item_subcategories(
    company_id: int,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.subcategories", "read")),
):
    _get_company(db, company_id, current_user)

    query = db.query(models.ItemSubCategory).filter(models.ItemSubCategory.company_id == company_id)
    if is_active is not None:
        query = query.filter(models.ItemSubCategory.is_active == is_active)
    return query.order_by(models.ItemSubCategory.name).all()


@router.post("/subcategories", response_model=schemas.ItemSubCategoryRead)
def create_item_subcategory(
    company_id: int,
    subcategory_in: schemas.ItemSubCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.subcategories", "write")),
):
    _get_company(db, company_id, current_user)

    subcategory = models.ItemSubCategory(
        company_id=company_id,
        **subcategory_in.model_dump(),
    )
    db.add(subcategory)
    db.commit()
    db.refresh(subcategory)
    return subcategory


@router.get("/subcategories/{subcategory_id}", response_model=schemas.ItemSubCategoryRead)
def get_item_subcategory(
    company_id: int,
    subcategory_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.subcategories", "read")),
):
    _get_company(db, company_id, current_user)
    subcategory = (
        db.query(models.ItemSubCategory)
        .filter(
            models.ItemSubCategory.id == subcategory_id,
            models.ItemSubCategory.company_id == company_id,
        )
        .first()
    )
    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    return subcategory


@router.put("/subcategories/{subcategory_id}", response_model=schemas.ItemSubCategoryRead)
def update_item_subcategory(
    company_id: int,
    subcategory_id: int,
    subcategory_in: schemas.ItemSubCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.subcategories", "write")),
):
    _get_company(db, company_id, current_user)
    subcategory = (
        db.query(models.ItemSubCategory)
        .filter(
            models.ItemSubCategory.id == subcategory_id,
            models.ItemSubCategory.company_id == company_id,
        )
        .first()
    )
    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    for field, value in subcategory_in.model_dump(exclude_unset=True).items():
        setattr(subcategory, field, value)
    db.commit()
    db.refresh(subcategory)
    return subcategory


@router.delete("/subcategories/{subcategory_id}")
def delete_item_subcategory(
    company_id: int,
    subcategory_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.subcategories", "write")),
):
    _get_company(db, company_id, current_user)
    subcategory = (
        db.query(models.ItemSubCategory)
        .filter(
            models.ItemSubCategory.id == subcategory_id,
            models.ItemSubCategory.company_id == company_id,
        )
        .first()
    )
    if not subcategory:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    db.delete(subcategory)
    db.commit()
    return {"detail": "Deleted"}


# -------- Item Brands --------


@router.get("/brands", response_model=list[schemas.ItemBrandRead])
def list_item_brands(
    company_id: int,
    is_active: bool | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.brands", "read")),
):
    _get_company(db, company_id, current_user)

    query = db.query(models.ItemBrand).filter(models.ItemBrand.company_id == company_id)
    if is_active is not None:
        query = query.filter(models.ItemBrand.is_active == is_active)
    return query.order_by(models.ItemBrand.name).all()


@router.post("/brands", response_model=schemas.ItemBrandRead)
def create_company_brand(
    company_id: int,
    brand_in: schemas.ItemBrandCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.brands", "write")),
):
    _get_company(db, company_id, current_user)

    brand = models.ItemBrand(company_id=company_id, **brand_in.model_dump())
    db.add(brand)
    db.commit()
    db.refresh(brand)
    return brand


@router.get("/brands/{brand_id}", response_model=schemas.ItemBrandRead)
def get_company_brand(
    company_id: int,
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.brands", "read")),
):
    _get_company(db, company_id, current_user)
    brand = (
        db.query(models.ItemBrand)
        .filter(
            models.ItemBrand.id == brand_id,
            models.ItemBrand.company_id == company_id,
        )
        .first()
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    return brand


@router.put("/brands/{brand_id}", response_model=schemas.ItemBrandRead)
def update_company_brand(
    company_id: int,
    brand_id: int,
    brand_in: schemas.ItemBrandUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.brands", "write")),
):
    _get_company(db, company_id, current_user)
    brand = (
        db.query(models.ItemBrand)
        .filter(
            models.ItemBrand.id == brand_id,
            models.ItemBrand.company_id == company_id,
        )
        .first()
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    for field, value in brand_in.model_dump(exclude_unset=True).items():
        setattr(brand, field, value)
    db.commit()
    db.refresh(brand)
    return brand


@router.delete("/brands/{brand_id}")
def delete_company_brand(
    company_id: int,
    brand_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.brands", "write")),
):
    _get_company(db, company_id, current_user)
    brand = (
        db.query(models.ItemBrand)
        .filter(
            models.ItemBrand.id == brand_id,
            models.ItemBrand.company_id == company_id,
        )
        .first()
    )
    if not brand:
        raise HTTPException(status_code=404, detail="Brand not found")
    db.delete(brand)
    db.commit()
    return {"detail": "Deleted"}
@router.get("/items", response_model=list[schemas.ItemRead])
def list_items(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.items", "read")),
):
    _get_company(db, company_id, current_user)
    items = (
        db.query(models.Item)
        .filter(models.Item.company_id == company_id)
        .order_by(models.Item.name)
        .all()
    )
    return items
@router.get("/items/form-config", response_model=list[schemas.ItemFieldConfigRead])
def get_item_form_config(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Fetch the active industry-specific fields for the company's business type."""
    company = _get_company(db, company_id, current_user)
    
    # Priority 1: Company's dynamic business type
    type_code = None
    if company.business_type_id:
        biz_type = db.query(models.BusinessType).get(company.business_type_id)
        if biz_type:
            type_code = biz_type.code

    # Priority 2: Tenant's dynamic business type
    if not type_code and company.tenant_id:
        tenant = db.query(models.Tenant).get(company.tenant_id)
        if tenant and tenant.business_type_id:
            biz_type = db.query(models.BusinessType).get(tenant.business_type_id)
            if biz_type:
                type_code = biz_type.code
    
    # Priority 3: Company's legacy business_type string
    if not type_code:
        type_code = getattr(company, "business_type", "GENERAL") or "GENERAL"
    
    return db.query(models.ItemFieldConfig).filter(
        models.ItemFieldConfig.business_type == type_code,
        models.ItemFieldConfig.is_active == True
    ).order_by(models.ItemFieldConfig.sort_order).all()


@router.get("/warehouses", response_model=list[schemas.WarehouseRead])
def list_warehouses(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.warehouses", "read")),
):
    _get_company(db, company_id, current_user)
    warehouses = (
        db.query(models.Warehouse)
        .filter(
            models.Warehouse.company_id == company_id,
            models.Warehouse.is_active == True,
        )
        .order_by(models.Warehouse.code, models.Warehouse.name)
        .all()
    )
    return warehouses


@router.post("/warehouses", response_model=schemas.WarehouseRead)
def create_warehouse(
    company_id: int,
    warehouse_in: schemas.WarehouseCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.warehouses", "write")),
):
    _get_company(db, company_id, current_user)
    warehouse = models.Warehouse(
        company_id=company_id,
        code=warehouse_in.code,
        name=warehouse_in.name,
        is_active=warehouse_in.is_active,
    )
    db.add(warehouse)
    db.commit()
    db.refresh(warehouse)
    return warehouse


@router.post("/items", response_model=schemas.ItemRead)
def create_item(
    company_id: int,
    item_in: schemas.ItemCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    _perm: None = Depends(require_menu_access("inventory.items", "write")),
):
    company = _get_company(db, company_id, current_user)
    data = item_in.model_dump()

    # Apply company-level default ledgers when item-level bindings are not provided.
    # If company defaults are missing, enforce selection via a 422 validation error
    # so the frontend can show field warnings.

    if not data.get("income_ledger_id"):
        if getattr(company, "default_item_income_ledger_id", None) is not None:
            data["income_ledger_id"] = company.default_item_income_ledger_id
        else:
            sales_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code == "SALES",
                )
                .first()
            )
            if sales_ledger is not None:
                data["income_ledger_id"] = sales_ledger.id

    if not data.get("income_ledger_id"):
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
            data["income_ledger_id"] = named_income_ledger.id

    if not data.get("output_tax_ledger_id"):
        if getattr(company, "default_item_output_tax_ledger_id", None) is not None:
            data["output_tax_ledger_id"] = company.default_item_output_tax_ledger_id
        else:
            output_tax_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code.in_(["OUTPUT_TAX", "OUTPUT_VAT"]),
                )
                .first()
            )
            if output_tax_ledger is not None:
                data["output_tax_ledger_id"] = output_tax_ledger.id

    if not data.get("expense_ledger_id"):
        if getattr(company, "default_item_expense_ledger_id", None) is not None:
            data["expense_ledger_id"] = company.default_item_expense_ledger_id
        else:
            purchases_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code == "PURCHASES",
                )
                .first()
            )
            if purchases_ledger is not None:
                data["expense_ledger_id"] = purchases_ledger.id

    if not data.get("expense_ledger_id"):
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
            data["expense_ledger_id"] = stock_ledger.id

    if not data.get("input_tax_ledger_id"):
        if getattr(company, "default_item_input_tax_ledger_id", None) is not None:
            data["input_tax_ledger_id"] = company.default_item_input_tax_ledger_id
        else:
            input_tax_ledger = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company_id,
                    models.Ledger.code.in_(["INPUT_TAX", "INPUT_VAT"]),
                )
                .first()
            )
            if input_tax_ledger is not None:
                data["input_tax_ledger_id"] = input_tax_ledger.id

    # Auto-bind income ledger for service items if not explicitly provided.
    category = data.get("category")
    if category and category.strip().lower() == "service" and not data.get("income_ledger_id"):
        service_income_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.name == "Service Income",
            )
            .first()
        )
        if service_income_ledger is not None:
            data["income_ledger_id"] = service_income_ledger.id

    tax_type = data.get("tax_type")
    default_tax_rate = data.get("default_tax_rate")
    is_taxable = bool(tax_type) or (default_tax_rate is not None and float(default_tax_rate or 0) > 0)

    missing_fields: list[str] = []
    for field_name in (
        "income_ledger_id",
        "expense_ledger_id",
        "output_tax_ledger_id",
        "input_tax_ledger_id",
    ):
        if not data.get(field_name):
            missing_fields.append(field_name)

    if missing_fields:
        label_map = {
            "income_ledger_id": "Select income ledger",
            "expense_ledger_id": "Select expense/inventory ledger",
            "output_tax_ledger_id": "Select output tax ledger",
            "input_tax_ledger_id": "Select input tax ledger",
        }
        raise HTTPException(
            status_code=422,
            detail=[
                {
                    "loc": ["body", field],
                    "msg": label_map.get(field, "Field is required"),
                    "type": "value_error.missing",
                }
                for field in missing_fields
            ],
        )

    opening_qty = data.get("opening_stock")
    opening_rate = data.get("opening_rate")
    if opening_qty is not None and opening_rate is not None:
        try:
            data["opening_value"] = float(opening_qty) * float(opening_rate)
        except (TypeError, ValueError):
            data["opening_value"] = None

    if data.get("is_fixed_asset"):
        # We need a ledger under a "Fixed Assets" group.
        # Find a group named "Fixed Assets" for this company.
        group = db.query(models.LedgerGroup).filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.name.ilike("%Fixed Asset%")
        ).first()
        
        if group:
            # Find or create a default Fixed Asset ledger in this group.
            ledger = db.query(models.Ledger).filter(
                models.Ledger.company_id == company_id,
                models.Ledger.group_id == group.id
            ).first()
            
            if not ledger:
                ledger = models.Ledger(
                    company_id=company_id,
                    group_id=group.id,
                    name="General Fixed Assets",
                    code="FA-DEFAULT",
                    is_active=True,
                    opening_balance=0,
                    opening_balance_type=models.OpeningBalanceType.DEBIT
                )
                db.add(ledger)
                db.flush()
            
            data["expense_ledger_id"] = ledger.id
        # For fixed assets, we usually don't want them in standard Sales ledger if sold, 
        # but we'll focus on the purchase side (expense_ledger_id) as per request.

    data.pop("tax_type", None)
    
    # Handle dynamic industry fields: any key in data that is NOT in ItemBase schema
    # should be moved to field_metadata
    known_fields = set(schemas.ItemBase.model_fields.keys())
    industry_meta = {}
    
    # We create a copy of keys to iterate because we'll be popping from data
    for key in list(data.keys()):
        if key not in known_fields and key != "field_metadata":
            industry_meta[key] = data.pop(key)
    
    if industry_meta:
        existing_meta = data.get("field_metadata") or {}
        data["field_metadata"] = {**existing_meta, **industry_meta}

    units_in = data.pop("units", None)

    item = models.Item(company_id=company_id, **data)
    db.add(item)
    db.flush()

    if units_in:
        _sync_item_units(db=db, company_id=company_id, item=item, units_in=units_in)

    db.commit()
    db.refresh(item)
    return item


@router.get("/items/{item_id}", response_model=schemas.ItemRead)
def get_item(
    company_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
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
    return item


@router.put("/items/{item_id}", response_model=schemas.ItemRead)
def update_item(
    company_id: int,
    item_id: int,
    item_in: schemas.ItemUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
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
    data = item_in.model_dump(exclude_unset=True)

    # If the effective category is 'Service' and income_ledger_id is not explicitly
    # provided in the payload, auto-bind to the company's 'Service Income' ledger
    # (if it exists) so service sales hit that income account.
    effective_category = data.get("category", item.category)
    if (
        effective_category
        and isinstance(effective_category, str)
        and effective_category.strip().lower() == "service"
        and "income_ledger_id" not in data
        and not item.income_ledger_id
    ):
        service_income_ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company_id,
                models.Ledger.name == "Service Income",
            )
            .first()
        )
        if service_income_ledger is not None:
            data["income_ledger_id"] = service_income_ledger.id

    # If opening_stock or opening_rate is being updated, recompute opening_value
    if "opening_stock" in data or "opening_rate" in data:
        opening_qty = data.get("opening_stock", item.opening_stock)
        opening_rate = data.get("opening_rate", getattr(item, "opening_rate", None))
        if opening_qty is not None and opening_rate is not None:
            try:
                data["opening_value"] = float(opening_qty) * float(opening_rate)
            except (TypeError, ValueError):
                data["opening_value"] = None

    if data.get("is_fixed_asset"):
        group = db.query(models.LedgerGroup).filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.name.ilike("%Fixed Asset%")
        ).first()
        
        if group:
            ledger = db.query(models.Ledger).filter(
                models.Ledger.company_id == company_id,
                models.Ledger.group_id == group.id
            ).first()
            if not ledger:
                ledger = models.Ledger(
                    company_id=company_id,
                    group_id=group.id,
                    name="General Fixed Assets",
                    code="FA-DEFAULT",
                    is_active=True,
                    opening_balance=0,
                    opening_balance_type=models.OpeningBalanceType.DEBIT
                )
                db.add(ledger)
                db.flush()
            data["expense_ledger_id"] = ledger.id

    data.pop("tax_type", None)
    # Handle dynamic industry fields for update
    known_fields = set(schemas.ItemBase.model_fields.keys())
    industry_meta = {}
    
    for key in list(data.keys()):
        if key not in known_fields and key != "field_metadata":
            industry_meta[key] = data.pop(key)
            
    if industry_meta:
        existing_meta = item.field_metadata or {}
        data["field_metadata"] = {**existing_meta, **industry_meta}

    units_in = data.pop("units", None)

    for key, value in data.items():
        setattr(item, key, value)
    
    if units_in is not None:
        _sync_item_units(db=db, company_id=company_id, item=item, units_in=units_in)

    db.commit()
    db.refresh(item)
    return item


@router.delete("/items/{item_id}")
def delete_item(
    company_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
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
    db.delete(item)
    db.commit()
    return {"detail": "Deleted"}


@router.get(
    "/items/{item_id}/units",
    response_model=list[schemas.ItemUnitRead],
)
def list_item_units(
    company_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
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
    "/items/{item_id}/units",
    response_model=list[schemas.ItemUnitRead],
)
def replace_item_units(
    company_id: int,
    item_id: int,
    units_in: list[schemas.ItemUnitCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
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

    _sync_item_units(db=db, company_id=company_id, item=item, units_in=units_in)

    db.commit()
    return (
        db.query(models.ItemUnit)
        .filter(
            models.ItemUnit.company_id == company_id,
            models.ItemUnit.item_id == item_id,
        )
        .order_by(models.ItemUnit.is_base.desc(), models.ItemUnit.sort_order)
        .all()
    )

    db.commit()

    for unit in new_units:
        db.refresh(unit)

    return new_units


@router.get("/stock-summary", response_model=list[schemas.StockSummaryRow])
def stock_summary(
    company_id: int,
    warehouse_id: int | None = None,
    item_id: int | None = None,
    as_on_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return stock summary per item (optionally per warehouse) as of a given date."""

    company = _get_company(db, company_id, current_user)

    if as_on_date is None:
        as_on_date = date.today()

    Item = models.Item
    StockLedger = models.StockLedger
    Warehouse = models.Warehouse

    valuation_method = _get_effective_inventory_valuation_method(company=company)

    if valuation_method == models.InventoryValuationMethod.FIFO:
        # Basic FIFO valuation: build quantity layers (opening + in movements)
        # and consume them in FIFO order for out movements.
        ledger_q = (
            db.query(
                StockLedger.item_id,
                StockLedger.warehouse_id,
                StockLedger.qty_delta,
                StockLedger.unit_cost,
                StockLedger.posted_at,
                StockLedger.id,
                Item.name.label("item_name"),
                Item.opening_stock.label("opening_stock"),
                Item.opening_rate.label("opening_rate"),
                Item.opening_value.label("opening_value"),
                Item.is_fixed_asset,
                Warehouse.name.label("warehouse_name"),
                StockLedger.source_type,
            )
            .join(Item, (Item.id == StockLedger.item_id) & (Item.company_id == company_id))
            .join(Warehouse, Warehouse.id == StockLedger.warehouse_id)
            .filter(
                StockLedger.company_id == company_id,
                StockLedger.reversed_at.is_(None),
                StockLedger.posted_at < (as_on_date + timedelta(days=1)),
                Item.is_fixed_asset.isnot(True),
            )
            .order_by(StockLedger.posted_at.asc(), StockLedger.id.asc())
        )

        if warehouse_id is not None:
            ledger_q = ledger_q.filter(StockLedger.warehouse_id == warehouse_id)
        if item_id is not None:
            ledger_q = ledger_q.filter(StockLedger.item_id == item_id)

        rows = ledger_q.all()

        # If an item has no ledger rows yet, it won't appear in `rows`. Mirror
        # previous behavior by returning at least an entry for items when an
        # explicit item_id filter is used.
        if item_id is not None and not rows:
            item = (
                db.query(Item)
                .filter(Item.company_id == company_id, Item.id == item_id, Item.is_fixed_asset.isnot(True))
                .first()
            )
            if not item:
                return []
            return [
                schemas.StockSummaryRow(
                    item_id=item.id,
                    item_name=item.name,
                    warehouse_id=warehouse_id,
                    warehouse_name=None,
                    opening_stock=float(item.opening_stock or 0),
                    movement_in=0,
                    movement_out=0,
                    quantity_on_hand=float(item.opening_stock or 0),
                    closing_value=float(item.opening_value or (float(item.opening_stock or 0) * float(item.opening_rate or 0))),
                )
            ]

        # key -> layers, movement sums, metadata
        layers: dict[tuple[int, int], list[list[float]]] = {}
        meta: dict[tuple[int, int], dict] = {}
        movement_in_map: dict[tuple[int, int], float] = {}
        movement_out_map: dict[tuple[int, int], float] = {}
        purchase_qty_map: dict[tuple[int, int], float] = {}
        sales_qty_map: dict[tuple[int, int], float] = {}

        for r in rows:
            key = (int(r.item_id), int(r.warehouse_id))
            if key not in layers:
                layers[key] = []
                meta[key] = {
                    "item_name": r.item_name,
                    "warehouse_name": r.warehouse_name,
                    "opening_stock": float(r.opening_stock or 0),
                    "opening_rate": float(r.opening_rate or 0) if r.opening_rate is not None else None,
                    "opening_value": float(r.opening_value) if r.opening_value is not None else None,
                }
                movement_in_map[key] = 0.0
                movement_out_map[key] = 0.0
                purchase_qty_map[key] = 0.0
                sales_qty_map[key] = 0.0

                opening_qty = float(r.opening_stock or 0)
                if opening_qty > 0:
                    opening_value = meta[key]["opening_value"]
                    if opening_value is None:
                        opening_rate = meta[key]["opening_rate"] or 0.0
                        opening_value = opening_qty * float(opening_rate)
                    opening_cost = (float(opening_value) / opening_qty) if opening_qty else 0.0
                    layers[key].append([opening_qty, opening_cost])

            qty_delta = float(r.qty_delta or 0)
            if qty_delta > 0:
                movement_in_map[key] += qty_delta
                cost = float(r.unit_cost) if r.unit_cost is not None else 0.0
                layers[key].append([qty_delta, cost])
            elif qty_delta < 0:
                qty_out = -qty_delta
                movement_out_map[key] += qty_out
                remaining = qty_out
                while remaining > 1e-9 and layers[key]:
                    layer_qty, layer_cost = layers[key][0]
                    take = layer_qty if layer_qty <= remaining else remaining
                    layer_qty -= take
                    remaining -= take
                    if layer_qty <= 1e-9:
                        layers[key].pop(0)
                    else:
                        layers[key][0][0] = layer_qty

            if r.source_type in ("PURCHASE_BILL", "PURCHASE_RETURN"):
                purchase_qty_map[key] += qty_delta
                # Also include Purchase Qty from returns?
                # Usually: Net purchases = Purchases - Returns.
                # Purchases (+) are qty_delta > 0.
                # Purchase Returns (-) are qty_delta < 0.
                # Summing qty_delta gives Net Purchases.

            elif r.source_type in ("SALES_INVOICE", "SALES_RETURN"):
                # Net sales = Sales - Returns.
                # Sales (-) are qty_delta < 0.
                # Sales Returns (+) are qty_delta > 0.
                # Summing (-qty_delta) gives Net Sales (positive number usually).
                sales_qty_map[key] += (-qty_delta)

        results: list[schemas.StockSummaryRow] = []
        for (it_id, wh_id), layer_list in layers.items():
            opening = float(meta[(it_id, wh_id)]["opening_stock"] or 0)
            movement_in = float(movement_in_map[(it_id, wh_id)] or 0)
            movement_out = float(movement_out_map[(it_id, wh_id)] or 0)
            quantity_on_hand = opening + movement_in - movement_out
            closing_value = float(sum(q * c for q, c in layer_list))
            results.append(
                schemas.StockSummaryRow(
                    item_id=it_id,
                    item_name=meta[(it_id, wh_id)]["item_name"],
                    warehouse_id=wh_id,
                    warehouse_name=meta[(it_id, wh_id)]["warehouse_name"],
                    opening_stock=opening,
                    movement_in=movement_in,
                    movement_out=movement_out,
                    quantity_on_hand=quantity_on_hand,
                    closing_value=closing_value,
                    purchase_qty=purchase_qty_map.get((it_id, wh_id), 0.0),
                    sales_qty=sales_qty_map.get((it_id, wh_id), 0.0),
                )
            )

        return results

    # Default path: weighted-average valuation.
    query = (
        db.query(
            Item.id.label("item_id"),
            Item.name.label("item_name"),
            Warehouse.id.label("warehouse_id"),
            Warehouse.name.label("warehouse_name"),
            Item.opening_stock.label("opening_stock"),
            Item.opening_rate.label("opening_rate"),
            Item.opening_value.label("opening_value"),
            func.coalesce(
                func.sum(case((StockLedger.qty_delta > 0, StockLedger.qty_delta), else_=0)),
                0,
            ).label("movement_in"),
            func.coalesce(
                func.sum(case((StockLedger.qty_delta < 0, -StockLedger.qty_delta), else_=0)),
                0,
            ).label("movement_out"),
            # For weighted-average cost basis, include BOTH purchases and purchase
            # returns/reversals when they carry a unit_cost.
            func.coalesce(
                func.sum(
                    case(
                        (
                            (StockLedger.unit_cost.is_not(None))
                            & (StockLedger.source_type.in_(["PURCHASE_BILL", "PURCHASE_RETURN"])),
                            StockLedger.qty_delta,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("cost_qty_delta"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            (StockLedger.unit_cost.is_not(None))
                            & (StockLedger.source_type.in_(["PURCHASE_BILL", "PURCHASE_RETURN"])),
                            StockLedger.qty_delta * StockLedger.unit_cost,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("cost_value_delta"),
            func.coalesce(
                func.sum(
                    case(
                        (StockLedger.source_type.in_(["PURCHASE_BILL", "PURCHASE_RETURN"]), StockLedger.qty_delta),
                        else_=0,
                    )
                ),
                0,
            ).label("purchase_qty"),
            func.coalesce(
                func.sum(
                    case(
                        (StockLedger.source_type.in_(["SALES_INVOICE", "SALES_RETURN"]), -StockLedger.qty_delta),
                        else_=0,
                    )
                ),
                0,
            ).label("sales_qty"),
        )
        .outerjoin(
            StockLedger,
            (StockLedger.item_id == Item.id)
            & (StockLedger.company_id == company_id)
            & (StockLedger.reversed_at.is_(None))
            & (StockLedger.posted_at < (as_on_date + timedelta(days=1))),
        )
        .outerjoin(Warehouse, Warehouse.id == StockLedger.warehouse_id)
        .filter(Item.company_id == company_id, Item.is_fixed_asset.isnot(True))
    )

    if warehouse_id is not None:
        query = query.filter(StockLedger.warehouse_id == warehouse_id)

    if item_id is not None:
        query = query.filter(Item.id == item_id)

    query = query.group_by(
        Item.id,
        Item.name,
        Warehouse.id,
        Warehouse.name,
        Item.opening_stock,
    )

    rows = query.all()

    results: list[schemas.StockSummaryRow] = []
    for row in rows:
        opening = float(row.opening_stock or 0)
        movement_in = float(row.movement_in or 0)
        movement_out = float(row.movement_out or 0)
        quantity_on_hand = opening + movement_in - movement_out

        # Compute a basic weighted-average unit cost from opening + purchases.
        # This ensures purchase transactions (with unit_cost) affect closing stock value.
        opening_value = row.opening_value
        if opening_value is None:
            if row.opening_rate is not None:
                opening_value = float(opening) * float(row.opening_rate)
            else:
                opening_value = 0.0
        else:
            opening_value = float(opening_value)

        cost_value_delta = float(row.cost_value_delta or 0)
        cost_qty_delta = float(row.cost_qty_delta or 0)
        qty_available_for_cost = opening + cost_qty_delta
        if qty_available_for_cost:
            avg_unit_cost = (opening_value + cost_value_delta) / qty_available_for_cost
        else:
            avg_unit_cost = 0.0

        closing_value = quantity_on_hand * avg_unit_cost

        results.append(
            schemas.StockSummaryRow(
                item_id=row.item_id,
                item_name=row.item_name,
                warehouse_id=row.warehouse_id,
                warehouse_name=row.warehouse_name,
                opening_stock=opening,
                movement_in=movement_in,
                movement_out=movement_out,
                quantity_on_hand=quantity_on_hand,
                closing_value=closing_value,
                purchase_qty=float(getattr(row, "purchase_qty", 0) or 0),
                sales_qty=float(getattr(row, "sales_qty", 0) or 0),
            )
        )

    return results


@router.get("/stock/ledger", response_model=schemas.StockLedgerResponse)
def get_stock_ledger(
    company_id: int,
    item_id: int,
    warehouse_id: int | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=30)
 
    # Calculate Opening Balance (sum of qty_delta before from_date)
    opening_q = (
        db.query(
            func.coalesce(func.sum(models.StockLedger.qty_delta), 0).label("qty"),
        )
        .filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.item_id == item_id,
            models.StockLedger.reversed_at.is_(None),
            models.StockLedger.posted_at < datetime.combine(from_date, datetime.min.time()),
        )
    )
    if warehouse_id:
        opening_q = opening_q.filter(models.StockLedger.warehouse_id == warehouse_id)
    
    opening_qty = float(opening_q.scalar() or 0.0)
    
    # Get entries with voucher numbers
    VchS = aliased(models.Voucher)
    VchP = aliased(models.Voucher)
    VchSR = aliased(models.Voucher)
    VchPR = aliased(models.Voucher)

    entries_q = (
        db.query(
            models.StockLedger, 
            models.Warehouse.name.label("wh_name"),
            VchS.voucher_number.label("v_sales"),
            VchP.voucher_number.label("v_purch"),
            VchSR.voucher_number.label("v_sret"),
            VchPR.voucher_number.label("v_pret"),
            models.StockTransfer.transfer_number.label("transfer_no"),
        )
        .outerjoin(models.Warehouse, models.Warehouse.id == models.StockLedger.warehouse_id)
        .outerjoin(
            models.SalesInvoice,
            and_(
                models.StockLedger.source_type == "SALES_INVOICE",
                models.SalesInvoice.id == models.StockLedger.source_id,
            )
        )
        .outerjoin(VchS, VchS.id == models.SalesInvoice.voucher_id)
        .outerjoin(
            models.PurchaseBill,
            and_(
                models.StockLedger.source_type == "PURCHASE_BILL",
                models.PurchaseBill.id == models.StockLedger.source_id,
            )
        )
        .outerjoin(VchP, VchP.id == models.PurchaseBill.voucher_id)
        .outerjoin(
            models.SalesReturn,
            and_(
                models.StockLedger.source_type == "SALES_RETURN",
                models.SalesReturn.id == models.StockLedger.source_id,
            )
        )
        .outerjoin(VchSR, VchSR.id == models.SalesReturn.voucher_id)
        .outerjoin(
            models.PurchaseReturn,
            and_(
                models.StockLedger.source_type == "PURCHASE_RETURN",
                models.PurchaseReturn.id == models.StockLedger.source_id,
            )
        )
        .outerjoin(VchPR, VchPR.id == models.PurchaseReturn.voucher_id)
        .outerjoin(
            models.StockTransfer,
            and_(
                models.StockLedger.source_type == "STOCK_TRANSFER",
                models.StockTransfer.id == models.StockLedger.source_id,
            )
        )
        .filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.item_id == item_id,
            models.StockLedger.reversed_at.is_(None),
            models.StockLedger.posted_at >= datetime.combine(from_date, datetime.min.time()),
            models.StockLedger.posted_at < (datetime.combine(to_date, datetime.min.time()) + timedelta(days=1)),
        )
        .order_by(models.StockLedger.posted_at.asc(), models.StockLedger.id.asc())
    )
    if warehouse_id:
        entries_q = entries_q.filter(models.StockLedger.warehouse_id == warehouse_id)
        
    rows = entries_q.all()
    
    result_entries = []
    running_qty = opening_qty
    
    for r, wh_name, v_sales, v_purch, v_sret, v_pret, transfer_no in rows:
        qty = float(r.qty_delta)
        running_qty += qty
        
        qty_in = qty if qty > 0 else 0
        qty_out = -qty if qty < 0 else 0
        
        # Determine voucher number based on source type
        voucher_num = None
        if r.source_type == "SALES_INVOICE":
            voucher_num = v_sales
        elif r.source_type == "PURCHASE_BILL":
            voucher_num = v_purch
        elif r.source_type == "SALES_RETURN":
            voucher_num = v_sret
        elif r.source_type == "PURCHASE_RETURN":
            voucher_num = v_pret
        elif r.source_type == "STOCK_TRANSFER":
            voucher_num = transfer_no
        
        result_entries.append(schemas.StockLedgerEntry(
            id=r.id,
            posted_at=r.posted_at,
            source_type=r.source_type,
            source_id=r.source_id,
            voucher_number=voucher_num,
            warehouse_name=wh_name,
            qty_in=qty_in,
            qty_out=qty_out,
            balance=running_qty,
            unit_cost=float(r.unit_cost) if r.unit_cost is not None else None,
            item_value=None 
        ))
        
    item = db.query(models.Item).filter(models.Item.id == item_id).first()
    
    return schemas.StockLedgerResponse(
        item_id=item_id,
        item_name=item.name if item else "Unknown Item",
        warehouse_id=warehouse_id,
        from_date=from_date,
        to_date=to_date,
        opening_qty=opening_qty,
        opening_value=0.0, 
        entries=result_entries,
        closing_qty=running_qty,
        closing_value=0.0 
    )


@router.post(
    "/stock-summary/batch",
    response_model=schemas.StockSummaryBatchResponse,
)
def stock_summary_batch(
    company_id: int,
    payload: schemas.StockSummaryBatchRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    requests = payload.requests or []
    # If the client sends no pairs, treat it as "no stock checks requested" and
    # return an empty result set instead of a 400. This makes it safe for
    # frontends to call this endpoint opportunistically.
    if not requests:
        return schemas.StockSummaryBatchResponse(results=[])

    max_pairs = 5000
    if len(requests) > max_pairs:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "VALIDATION_ERROR",
                "message": f"Too many pairs in request. Maximum allowed is {max_pairs}.",
            },
        )

    # Deduplicate while preserving order of first occurrences
    unique_pairs: list[tuple[int, int]] = []
    seen: set[tuple[int, int]] = set()
    for req in requests:
        key = (req.itemId, req.warehouseId)
        if key not in seen:
            seen.add(key)
            unique_pairs.append(key)

    results = _compute_batch_stock(company_id=company_id, pairs=unique_pairs, db=db, original_requests=requests)

    return schemas.StockSummaryBatchResponse(results=results)


@router.get("/stock-report-period", response_model=list[schemas.StockPeriodReportRow])
def stock_report_period(
    company_id: int,
    from_date: date,
    to_date: date,
    warehouse_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    initial_date = from_date - timedelta(days=1)
    
    # 1. Get Initial states
    initial_rows = stock_summary(
        company_id=company_id,
        warehouse_id=warehouse_id,
        item_id=None,
        as_on_date=initial_date,
        db=db,
        current_user=current_user
    )
    initial_map = {r.item_id: r for r in initial_rows}

    # 2. Get Final states
    final_rows = stock_summary(
        company_id=company_id,
        warehouse_id=warehouse_id,
        item_id=None,
        as_on_date=to_date,
        db=db,
        current_user=current_user
    )
    
    # 3. Query StockLedger for Inwards/Outwards quantities and Inwards Value in the date range
    StockLedger = models.StockLedger
    Item = models.Item
    query = (
        db.query(
            StockLedger.item_id,
            func.coalesce(func.sum(case((StockLedger.qty_delta > 0, StockLedger.qty_delta), else_=0)), 0).label("inward_qty"),
            func.coalesce(func.sum(case((StockLedger.qty_delta > 0, StockLedger.qty_delta * StockLedger.unit_cost), else_=0)), 0).label("inward_value"),
            func.coalesce(func.sum(case((StockLedger.qty_delta < 0, -StockLedger.qty_delta), else_=0)), 0).label("outward_qty"),
        )
        .join(Item, Item.id == StockLedger.item_id)
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.reversed_at.is_(None),
            StockLedger.posted_at >= datetime.combine(from_date, datetime.min.time()),
            StockLedger.posted_at < (datetime.combine(to_date, datetime.min.time()) + timedelta(days=1)),
            Item.is_fixed_asset.isnot(True),
        )
    )
    
    if warehouse_id is not None:
        query = query.filter(StockLedger.warehouse_id == warehouse_id)
        
    query = query.group_by(StockLedger.item_id)
    movement_rows = query.all()
    
    movement_map = {
        row.item_id: {
            "inward_qty": float(row.inward_qty),
            "inward_value": float(row.inward_value),
            "outward_qty": float(row.outward_qty),
        }
        for row in movement_rows
    }
    
    # 4. Merge results
    results = []
    
    for final_row in final_rows:
        item_id = final_row.item_id
        
        init = initial_map.get(item_id)
        init_qty = init.quantity_on_hand if init else 0.0
        init_value = init.closing_value if init else 0.0
        
        mov = movement_map.get(item_id, {"inward_qty": 0.0, "inward_value": 0.0, "outward_qty": 0.0})
        inward_qty = mov["inward_qty"]
        inward_value = mov["inward_value"]
        
        outward_qty = mov["outward_qty"]
        
        balance_qty = final_row.quantity_on_hand
        balance_value = final_row.closing_value
        
        # Deduce outward value
        outward_value = init_value + inward_value - balance_value
        # Prevent negative tiny floats
        if abs(outward_value) < 1e-6:
            outward_value = 0.0
            
        # Rates
        init_rate = (init_value / init_qty) if init_qty else 0.0
        inward_rate = (inward_value / inward_qty) if inward_qty else 0.0
        outward_rate = (outward_value / outward_qty) if outward_qty else 0.0
        balance_rate = (balance_value / balance_qty) if balance_qty else 0.0
        
        results.append(
            schemas.StockPeriodReportRow(
                item_id=item_id,
                item_name=final_row.item_name,
                warehouse_id=final_row.warehouse_id,
                warehouse_name=final_row.warehouse_name,
                initial_qty=init_qty,
                initial_rate=init_rate,
                initial_value=init_value,
                inwards_qty=inward_qty,
                inwards_rate=inward_rate,
                inwards_value=inward_value,
                outwards_qty=outward_qty,
                outwards_rate=outward_rate,
                outwards_value=outward_value,
                balance_qty=balance_qty,
                balance_rate=balance_rate,
                balance_value=balance_value,
            )
        )
        
    return results


@router.get("/stock/summary")
def stock_summary_unified(
    company_id: int,
    as_on_date: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    if as_on_date is None:
        as_on_date = date.today()
    svc = StockValuationService(db)
    qty_map = svc.get_qty_on_hand_by_product(company_id=company.id, as_of=as_on_date, ignore_fixed_assets=True)
    return [{"product_id": pid, "qty_on_hand": qty} for pid, qty in sorted(qty_map.items())]


@router.get("/stock/valuation")
def stock_valuation_unified(
    company_id: int,
    as_on_date: date | None = None,
    ignore_fixed_assets: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    if as_on_date is None:
        as_on_date = date.today()
    svc = StockValuationService(db)
    method = svc.get_inventory_valuation_method(tenant_id=int(company.tenant_id))
    by_product = svc.get_valuation_by_product(company=company, as_of=as_on_date, ignore_fixed_assets=ignore_fixed_assets)
    total_value = sum(v.value for v in by_product.values())
    return {
        "valuation_method": method.value,
        "as_on_date": str(as_on_date),
        "total_value": total_value,
        "rows": [
            {
                "product_id": pid,
                "qty_on_hand": s.qty_on_hand,
                "value": s.value,
            }
            for pid, s in sorted(by_product.items())
        ],
    }


@router.get("/stock/ledger")
def stock_ledger_unified(
    company_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    svc = StockValuationService(db)
    method = svc.get_inventory_valuation_method(tenant_id=int(company.tenant_id))

    VchS = aliased(models.Voucher)
    VchP = aliased(models.Voucher)
    VchSR = aliased(models.Voucher)
    VchPR = aliased(models.Voucher)

    rows = (
        db.query(
            models.StockLedger,
            VchS.voucher_number.label("v_sales"),
            VchP.voucher_number.label("v_purch"),
            VchSR.voucher_number.label("v_sret"),
            VchPR.voucher_number.label("v_pret"),
            models.StockTransfer.transfer_number.label("transfer_no"),
        )
        .outerjoin(models.SalesInvoice, and_(models.StockLedger.source_type == "SALES_INVOICE", models.SalesInvoice.id == models.StockLedger.source_id))
        .outerjoin(VchS, VchS.id == models.SalesInvoice.voucher_id)
        .outerjoin(models.PurchaseBill, and_(models.StockLedger.source_type == "PURCHASE_BILL", models.PurchaseBill.id == models.StockLedger.source_id))
        .outerjoin(VchP, VchP.id == models.PurchaseBill.voucher_id)
        .outerjoin(models.SalesReturn, and_(models.StockLedger.source_type == "SALES_RETURN", models.SalesReturn.id == models.StockLedger.source_id))
        .outerjoin(VchSR, VchSR.id == models.SalesReturn.voucher_id)
        .outerjoin(models.PurchaseReturn, and_(models.StockLedger.source_type == "PURCHASE_RETURN", models.PurchaseReturn.id == models.StockLedger.source_id))
        .outerjoin(VchPR, VchPR.id == models.PurchaseReturn.voucher_id)
        .outerjoin(models.StockTransfer, and_(models.StockLedger.source_type == "STOCK_TRANSFER", models.StockTransfer.id == models.StockLedger.source_id))
        .filter(
            models.StockLedger.company_id == company.id,
            models.StockLedger.item_id == product_id,
            models.StockLedger.reversed_at.is_(None),
        )
        .order_by(models.StockLedger.posted_at.asc(), models.StockLedger.id.asc())
        .all()
    )

    running_qty = 0.0
    out = []
    for r, v_sales, v_purch, v_sret, v_pret, transfer_no in rows:
        qty_delta = float(r.qty_delta or 0)
        qty_in = qty_delta if qty_delta > 0 else 0.0
        qty_out = -qty_delta if qty_delta < 0 else 0.0
        running_qty += qty_delta
        
        voucher_num = None
        if r.source_type == "SALES_INVOICE":
            voucher_num = v_sales
        elif r.source_type == "PURCHASE_BILL":
            voucher_num = v_purch
        elif r.source_type == "SALES_RETURN":
            voucher_num = v_sret
        elif r.source_type == "PURCHASE_RETURN":
            voucher_num = v_pret
        elif r.source_type == "STOCK_TRANSFER":
            voucher_num = transfer_no

        out.append(
            {
                "at": r.posted_at.isoformat() if r.posted_at else None,
                "ref_type": r.source_type,
                "ref_id": r.source_id,
                "voucher_number": voucher_num,
                "qty_in": qty_in,
                "qty_out": qty_out,
                "qty_balance": running_qty,
            }
        )

    valuation = svc.get_valuation_by_product(company=company, product_ids=[product_id])
    summary = valuation.get(product_id)
    return {
        "valuation_method": method.value,
        "product_id": product_id,
        "qty_on_hand": summary.qty_on_hand if summary is not None else 0.0,
        "value": summary.value if summary is not None else 0.0,
        "rows": out,
    }


@router.get(
    "/items/{item_id}/effective-rate",
    response_model=schemas.ItemEffectiveRateResponse,
)
def get_item_effective_rate(
    company_id: int,
    item_id: int,
    warehouseId: int | None = None,
    date_param: date | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return a simple effective rate for an item.

    For now, this uses item-level fields only (opening_rate/default rates).
    It does not yet implement full FIFO/weighted-average costing because
    StockMovement does not carry rate/amount information.
    """

    _get_company(db, company_id, current_user)

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

    company = _get_company(db, company_id, current_user)
    if date_param is None:
        date_param = date.today()
    as_of = datetime.combine(date_param, datetime.max.time())

    if warehouseId is not None:
        rate = _compute_issue_unit_cost(
            db=db,
            company=company,
            company_id=company_id,
            item_id=item_id,
            warehouse_id=warehouseId,
            as_of=as_of,
            qty_out=1.0,
        )
        valuation_method = str(_get_effective_inventory_valuation_method(company=company) or "AVERAGE")
    else:
        rate = float(item.opening_rate or item.default_purchase_rate or item.default_sales_rate or 0)
        valuation_method = "NONE"

    return schemas.ItemEffectiveRateResponse(
        itemId=item_id,
        effectiveRate=rate,
        valuationMethod=valuation_method,
    )


def _compute_batch_stock(
    *,
    company_id: int,
    pairs: list[tuple[int, int]],
    db: Session,
    original_requests: list[schemas.StockSummaryBatchRequestItem] | None = None,
) -> list[schemas.StockSummaryBatchResult]:
    """Compute quantityOnHand per (item_id, warehouse_id) pair for a company.

    `pairs` must already be deduplicated. `original_requests` is optional and
    used only for error reporting (index of invalid pair) when provided.
    """

    if not pairs:
        return []

    item_ids = {item_id for item_id, _ in pairs}
    warehouse_ids = {warehouse_id for _, warehouse_id in pairs}

    Item = models.Item
    items = (
        db.query(Item.id, Item.opening_stock)
        .filter(Item.company_id == company_id, Item.id.in_(item_ids))
        .all()
    )
    valid_item_ids = {row.id for row in items}
    item_opening = {row.id: float(row.opening_stock or 0) for row in items}

    Warehouse = models.Warehouse
    warehouses = (
        db.query(Warehouse.id)
        .filter(
            Warehouse.company_id == company_id,
            Warehouse.id.in_(warehouse_ids),
        )
        .all()
    )
    valid_warehouse_ids = {row.id for row in warehouses}

    if original_requests is not None:
        for idx, req in enumerate(original_requests):
            if req.itemId not in valid_item_ids or req.warehouseId not in valid_warehouse_ids:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "VALIDATION_ERROR",
                        "message": "Invalid item or warehouse in request.",
                        "details": {
                            "index": idx,
                            "itemId": req.itemId,
                            "warehouseId": req.warehouseId,
                        },
                    },
                )

    StockLedger = models.StockLedger
    as_on_date = date.today()

    movement_rows = (
        db.query(
            StockLedger.item_id.label("item_id"),
            StockLedger.warehouse_id.label("warehouse_id"),
            func.coalesce(func.sum(StockLedger.qty_delta), 0).label("qty_delta"),
        )
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.item_id.in_(item_ids),
            StockLedger.warehouse_id.in_(warehouse_ids),
            StockLedger.reversed_at.is_(None),
            func.date(StockLedger.posted_at) <= as_on_date,
        )
        .group_by(StockLedger.item_id, StockLedger.warehouse_id)
        .all()
    )

    movement_map: dict[tuple[int, int], float] = {}
    for row in movement_rows:
        movement_map[(row.item_id, row.warehouse_id)] = float(row.qty_delta or 0)

    results: list[schemas.StockSummaryBatchResult] = []
    for item_id, warehouse_id in pairs:
        opening = item_opening.get(item_id, 0.0)
        movement_delta = movement_map.get((item_id, warehouse_id), 0.0)
        quantity_on_hand = opening + movement_delta
        results.append(
            schemas.StockSummaryBatchResult(
                itemId=item_id,
                warehouseId=warehouse_id,
                quantityOnHand=f"{quantity_on_hand:.6f}",
            )
        )

    return results


@router.get("/stock-transfers", response_model=schemas.StockTransferListResponse)
def list_stock_transfers(
    company_id: int,
    page: int = 1,
    pageSize: int = 20,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    if page < 1:
        page = 1
    if pageSize < 1:
        pageSize = 20

    query = db.query(models.StockTransfer).filter(
        models.StockTransfer.company_id == company_id
    )

    total_count = query.count()
    total_pages = (total_count + pageSize - 1) // pageSize if total_count else 0

    transfers = (
        query.order_by(models.StockTransfer.transfer_date.desc(), models.StockTransfer.id.desc())
        .offset((page - 1) * pageSize)
        .limit(pageSize)
        .all()
    )

    return schemas.StockTransferListResponse(
        data=transfers,
        page=page,
        page_size=pageSize,
        total_count=total_count,
        total_pages=total_pages,
    )


@router.get(
    "/stock-transfers/{transfer_id}",
    response_model=schemas.StockTransferDetailRead,
)
def get_stock_transfer(
    company_id: int,
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    transfer = (
        db.query(models.StockTransfer)
        .filter(
            models.StockTransfer.id == transfer_id,
            models.StockTransfer.company_id == company_id,
        )
        .first()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")

    lines = (
        db.query(models.StockTransferLine)
        .filter(models.StockTransferLine.transfer_id == transfer.id)
        .order_by(models.StockTransferLine.line_no)
        .all()
    )

    return schemas.StockTransferDetailRead(header=transfer, lines=lines)


@router.post("/rebuild-stock-balances")
def rebuild_stock_balances(
    company_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    _get_company(db, company_id, current_admin)

    # Rebuild legacy stock_movements from active stock_ledger so older parts of
    # the system remain consistent while the ledger is the source of truth.
    StockLedger = models.StockLedger
    StockMovement = models.StockMovement

    db.query(StockMovement).filter(StockMovement.company_id == company_id).delete()

    ledger_rows = (
        db.query(StockLedger)
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.reversed_at.is_(None),
        )
        .all()
    )

    for r in ledger_rows:
        qty_delta = float(r.qty_delta)
        qty_in = qty_delta if qty_delta > 0 else 0.0
        qty_out = -qty_delta if qty_delta < 0 else 0.0
        db.add(
            StockMovement(
                company_id=r.company_id,
                warehouse_id=r.warehouse_id,
                item_id=r.item_id,
                movement_date=r.posted_at.date(),
                source_type=r.source_type,
                source_id=r.source_id,
                qty_in=qty_in,
                qty_out=qty_out,
            )
        )

    db.commit()
    return {"detail": "Rebuilt stock movements from stock ledger."}


@router.post("/documents/{doc_type}/{doc_id}/repost")
def repost_document(
    company_id: int,
    doc_type: str,
    doc_id: int,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    _get_company(db, company_id, current_admin)

    company = (
        db.query(models.Company)
        .filter(models.Company.id == company_id)
        .first()
    )

    doc_type_norm = (doc_type or "").strip().upper()
    if doc_type_norm not in {"SALES_INVOICE", "PURCHASE_BILL", "STOCK_TRANSFER"}:
        raise HTTPException(status_code=400, detail="Unsupported document type")

    # Reverse any existing active ledger for this document, then re-post from current lines.
    _reverse_stock_ledger(
        db=db,
        company_id=company_id,
        source_type=doc_type_norm,
        source_id=doc_id,
        created_by=current_admin.id,
    )

    now = datetime.utcnow()

    if doc_type_norm == "SALES_INVOICE":
        invoice = (
            db.query(models.SalesInvoice)
            .filter(models.SalesInvoice.company_id == company_id, models.SalesInvoice.id == doc_id)
            .first()
        )
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")

        lines = (
            db.query(models.SalesInvoiceLine)
            .filter(models.SalesInvoiceLine.invoice_id == invoice.id)
            .all()
        )

        item_ids = {l.item_id for l in lines}
        item_flags = (
            db.query(models.Item.id, models.Item.allow_negative_stock, models.Item.category)
            .filter(models.Item.company_id == company_id, models.Item.id.in_(item_ids))
            .all()
        )
        allow_negative_map = {row.id: bool(row.allow_negative_stock) for row in item_flags}
        is_service_map = {row.id: (row.category and row.category.strip().lower() == "service") for row in item_flags}

        pair_quantities: dict[tuple[int, int], float] = {}
        for l in lines:
            if is_service_map.get(l.item_id):
                continue
            if not allow_negative_map.get(l.item_id):
                # Only validate if NOT allowed negative stock
                if l.warehouse_id is None:
                    raise HTTPException(status_code=400, detail="Invoice line missing warehouse_id")
            key = (l.item_id, l.warehouse_id)
            pair_quantities[key] = pair_quantities.get(key, 0.0) + float(l.quantity)

        if pair_quantities:
            pairs = list(pair_quantities.keys())
            batch_results = _compute_batch_stock(company_id=company_id, pairs=pairs, db=db)
            available_map: dict[tuple[int, int], float] = {}
            for res in batch_results:
                available_map[(res.itemId, res.warehouseId)] = float(res.quantityOnHand)
            for (item_id, warehouse_id), required_qty in pair_quantities.items():
                available = available_map.get((item_id, warehouse_id), 0.0)
                if required_qty > available:
                    raise HTTPException(
                        status_code=400,
                        detail={
                            "error": "INSUFFICIENT_STOCK",
                            "message": "Insufficient stock for invoice repost.",
                            "details": {
                                "item_id": item_id,
                                "warehouse_id": warehouse_id,
                                "required_quantity": required_qty,
                                "available_quantity": available,
                            },
                        },
                    )

        doc_posted_at = datetime.combine(invoice.date, datetime.min.time())
        for l in lines:
            if is_service_map.get(l.item_id):
                continue
            if l.warehouse_id is None:
                continue
            db.add(
                models.StockLedger(
                    company_id=company_id,
                    warehouse_id=l.warehouse_id,
                    item_id=l.item_id,
                    qty_delta=-float(l.quantity),
                    unit_cost=(
                        _compute_issue_unit_cost(
                            db=db,
                            company=company,
                            company_id=company_id,
                            item_id=l.item_id,
                            warehouse_id=l.warehouse_id,
                            as_of=doc_posted_at,
                            qty_out=float(l.quantity),
                        )
                        if company is not None
                        else None
                    ),
                    source_type="SALES_INVOICE",
                    source_id=invoice.id,
                    source_line_id=l.id,
                    posted_at=doc_posted_at,
                    created_by=current_admin.id,
                )
            )

    elif doc_type_norm == "PURCHASE_BILL":
        bill = (
            db.query(models.PurchaseBill)
            .filter(models.PurchaseBill.company_id == company_id, models.PurchaseBill.id == doc_id)
            .first()
        )
        if not bill:
            raise HTTPException(status_code=404, detail="Bill not found")

        lines = (
            db.query(models.PurchaseBillLine)
            .filter(models.PurchaseBillLine.bill_id == bill.id)
            .all()
        )
        item_ids = {l.item_id for l in lines}
        item_flags = (
            db.query(models.Item.id, models.Item.allow_negative_stock, models.Item.category)
            .filter(models.Item.company_id == company_id, models.Item.id.in_(item_ids))
            .all()
        )
        allow_negative_map = {row.id: bool(row.allow_negative_stock) for row in item_flags}
        is_service_map = {row.id: (row.category and row.category.strip().lower() == "service") for row in item_flags}

        posted_at = datetime.combine(bill.date, datetime.min.time())

        for l in lines:
            if is_service_map.get(l.item_id):
                continue
            if l.warehouse_id is None:
                raise HTTPException(status_code=400, detail="Bill line missing warehouse_id")
            db.add(
                models.StockLedger(
                    company_id=company_id,
                    warehouse_id=l.warehouse_id,
                    item_id=l.item_id,
                    qty_delta=float(l.quantity),
                    unit_cost=float(l.rate) if l.rate is not None else None,
                    source_type="PURCHASE_BILL",
                    source_id=bill.id,
                    source_line_id=l.id,
                    posted_at=posted_at,
                    created_by=current_admin.id,
                )
            )

    elif doc_type_norm == "STOCK_TRANSFER":
        transfer = (
            db.query(models.StockTransfer)
            .filter(models.StockTransfer.company_id == company_id, models.StockTransfer.id == doc_id)
            .first()
        )
        if not transfer:
            raise HTTPException(status_code=404, detail="Stock transfer not found")

        lines = (
            db.query(models.StockTransferLine)
            .filter(models.StockTransferLine.transfer_id == transfer.id)
            .all()
        )
        for l in lines:
            db.add(
                models.StockLedger(
                    company_id=company_id,
                    warehouse_id=transfer.from_warehouse_id,
                    item_id=l.item_id,
                    qty_delta=-float(l.quantity),
                    unit_cost=None,
                    source_type="STOCK_TRANSFER",
                    source_id=transfer.id,
                    source_line_id=l.id,
                    posted_at=now,
                    created_by=current_admin.id,
                )
            )
            db.add(
                models.StockLedger(
                    company_id=company_id,
                    warehouse_id=transfer.to_warehouse_id,
                    item_id=l.item_id,
                    qty_delta=float(l.quantity),
                    unit_cost=None,
                    source_type="STOCK_TRANSFER",
                    source_id=transfer.id,
                    source_line_id=l.id,
                    posted_at=now,
                    created_by=current_admin.id,
                )
            )

    db.commit()
    return {"detail": "Reposted."}


@router.post(
    "/stock-transfers/{transfer_id}/unpost",
    response_model=schemas.StockTransferDetailRead,
)
def unpost_stock_transfer(
    company_id: int,
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    transfer = (
        db.query(models.StockTransfer)
        .filter(
            models.StockTransfer.id == transfer_id,
            models.StockTransfer.company_id == company_id,
        )
        .first()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if transfer.status != models.StockTransferStatus.POSTED:
        raise HTTPException(status_code=409, detail="Only POSTED transfers can be unposted")

    lines = (
        db.query(models.StockTransferLine)
        .filter(models.StockTransferLine.transfer_id == transfer.id)
        .order_by(models.StockTransferLine.line_no)
        .all()
    )

    _reverse_stock_ledger(
        db=db,
        company_id=company_id,
        source_type="STOCK_TRANSFER",
        source_id=transfer.id,
        created_by=current_user.id,
    )

    db.query(models.StockMovement).filter(
        models.StockMovement.company_id == company_id,
        models.StockMovement.source_type == "STOCK_TRANSFER",
        models.StockMovement.source_id == transfer.id,
    ).delete()

    transfer.status = models.StockTransferStatus.DRAFT
    transfer.posted_at = None

    db.commit()
    db.refresh(transfer)
    for line in lines:
        db.refresh(line)

    return schemas.StockTransferDetailRead(header=transfer, lines=lines)


@router.post(
    "/stock-transfers",
    response_model=schemas.StockTransferDetailRead,
)
def create_stock_transfer(
    company_id: int,
    transfer_in: schemas.StockTransferCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    if transfer_in.fromWarehouseId == transfer_in.toWarehouseId:
        raise HTTPException(
            status_code=400,
            detail="from_warehouse_id and to_warehouse_id must be different",
        )
    if not transfer_in.lines:
        raise HTTPException(status_code=400, detail="At least one line is required")

    transfer = models.StockTransfer(
        company_id=company_id,
        transfer_date=transfer_in.transferDate,
        from_warehouse_id=transfer_in.fromWarehouseId,
        to_warehouse_id=transfer_in.toWarehouseId,
        remarks=transfer_in.remarks,
    )
    db.add(transfer)
    db.flush()

    lines: list[models.StockTransferLine] = []
    for idx, line_in in enumerate(transfer_in.lines, start=1):
        line = models.StockTransferLine(
            transfer_id=transfer.id,
            line_no=idx,
            item_id=line_in.itemId,
            unit=line_in.unit,
            quantity=line_in.quantity,
        )
        db.add(line)
        lines.append(line)

    db.commit()

    db.refresh(transfer)
    for line in lines:
        db.refresh(line)

    return schemas.StockTransferDetailRead(header=transfer, lines=lines)


@router.put(
    "/stock-transfers/{transfer_id}",
    response_model=schemas.StockTransferDetailRead,
)
def update_stock_transfer(
    company_id: int,
    transfer_id: int,
    transfer_in: schemas.StockTransferUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    transfer = (
        db.query(models.StockTransfer)
        .filter(
            models.StockTransfer.id == transfer_id,
            models.StockTransfer.company_id == company_id,
        )
        .first()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if transfer.status != models.StockTransferStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Cannot edit a POSTED transfer")

    data = transfer_in.model_dump(exclude_unset=True)
    lines_in = data.pop("lines", None)

    if (
        "fromWarehouseId" in data
        and "toWarehouseId" in data
        and data["fromWarehouseId"] == data["toWarehouseId"]
    ):
        raise HTTPException(
            status_code=400,
            detail="from_warehouse_id and to_warehouse_id must be different",
        )

    # Map camelCase fields to ORM attributes
    if "transferDate" in data:
        transfer.transfer_date = data["transferDate"]
    if "fromWarehouseId" in data:
        transfer.from_warehouse_id = data["fromWarehouseId"]
    if "toWarehouseId" in data:
        transfer.to_warehouse_id = data["toWarehouseId"]
    if "remarks" in data:
        transfer.remarks = data["remarks"]

    if lines_in is not None:
        db.query(models.StockTransferLine).filter(
            models.StockTransferLine.transfer_id == transfer.id
        ).delete()
        new_lines: list[models.StockTransferLine] = []
        for idx, line_in in enumerate(lines_in, start=1):
            # lines_in elements are dicts from model_dump
            item_id = line_in.get("itemId")
            unit = line_in.get("unit")
            quantity = line_in.get("quantity")
            line = models.StockTransferLine(
                transfer_id=transfer.id,
                line_no=idx,
                item_id=item_id,
                unit=unit,
                quantity=quantity,
            )
            db.add(line)
            new_lines.append(line)
        lines = new_lines
    else:
        lines = (
            db.query(models.StockTransferLine)
            .filter(models.StockTransferLine.transfer_id == transfer.id)
            .order_by(models.StockTransferLine.line_no)
            .all()
        )

    db.commit()

    db.refresh(transfer)
    for line in lines:
        db.refresh(line)

    return schemas.StockTransferDetailRead(header=transfer, lines=lines)


@router.post(
    "/stock-transfers/{transfer_id}/post",
    response_model=schemas.StockTransferDetailRead,
)
def post_stock_transfer(
    company_id: int,
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    transfer = (
        db.query(models.StockTransfer)
        .filter(
            models.StockTransfer.id == transfer_id,
            models.StockTransfer.company_id == company_id,
        )
        .first()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")

    if transfer.status == models.StockTransferStatus.POSTED:
        lines = (
            db.query(models.StockTransferLine)
            .filter(models.StockTransferLine.transfer_id == transfer.id)
            .order_by(models.StockTransferLine.line_no)
            .all()
        )
        return schemas.StockTransferDetailRead(header=transfer, lines=lines)

    lines = (
        db.query(models.StockTransferLine)
        .filter(models.StockTransferLine.transfer_id == transfer.id)
        .order_by(models.StockTransferLine.line_no)
        .all()
    )
    if not lines:
        raise HTTPException(status_code=400, detail="At least one line is required")

    company_obj = _get_company(db, company_id, current_user)

    # Validate stock availability and calculate unit costs
    pair_quantities: dict[tuple[int, int], float] = {}
    for line in lines:
        key = (line.item_id, transfer.from_warehouse_id)
        pair_quantities[key] = pair_quantities.get(key, 0.0) + float(line.quantity)

    if pair_quantities:
        pairs = list(pair_quantities.keys())
        batch_results = _compute_batch_stock(company_id=company_id, pairs=pairs, db=db)
        available_map: dict[tuple[int, int], float] = {}
        for res in batch_results:
            available_map[(res.itemId, res.warehouseId)] = float(res.quantityOnHand)

        for (item_id, warehouse_id), required_qty in pair_quantities.items():
            available = available_map.get((item_id, warehouse_id), 0.0)
            if required_qty > available:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "INSUFFICIENT_STOCK",
                        "message": "Insufficient stock for item in from warehouse.",
                        "details": {
                            "item_id": item_id,
                            "warehouse_id": warehouse_id,
                            "required_quantity": required_qty,
                            "available_quantity": available,
                        },
                    },
                )

    total_transfer_value = 0.0
    now = datetime.utcnow()

    from_warehouse = (
        db.query(models.Warehouse)
        .filter(models.Warehouse.id == transfer.from_warehouse_id)
        .first()
    )
    to_warehouse = (
        db.query(models.Warehouse)
        .filter(models.Warehouse.id == transfer.to_warehouse_id)
        .first()
    )

    for line in lines:
        # Calculate unit cost based on valuation method
        unit_cost = _compute_issue_unit_cost(
            db=db,
            company=company_obj,
            company_id=company_id,
            item_id=line.item_id,
            warehouse_id=transfer.from_warehouse_id,
            as_of=now,
            qty_out=float(line.quantity),
        )
        line.unit_cost = unit_cost
        line_value = unit_cost * float(line.quantity)
        total_transfer_value += line_value

        db.add(
            models.StockLedger(
                company_id=company_id,
                warehouse_id=transfer.from_warehouse_id,
                item_id=line.item_id,
                qty_delta=-float(line.quantity),
                unit_cost=unit_cost,
                source_type="STOCK_TRANSFER",
                source_id=transfer.id,
                source_line_id=line.id,
                posted_at=now,
                created_by=current_user.id,
            )
        )

        db.add(
            models.StockLedger(
                company_id=company_id,
                warehouse_id=transfer.to_warehouse_id,
                item_id=line.item_id,
                qty_delta=float(line.quantity),
                unit_cost=unit_cost,
                source_type="STOCK_TRANSFER",
                source_id=transfer.id,
                source_line_id=line.id,
                posted_at=now,
                created_by=current_user.id,
            )
        )

        movement_out = models.StockMovement(
            company_id=company_id,
            warehouse_id=transfer.from_warehouse_id,
            item_id=line.item_id,
            movement_date=transfer.transfer_date,
            source_type="STOCK_TRANSFER",
            source_id=transfer.id,
            qty_in=0,
            qty_out=line.quantity,
        )
        db.add(movement_out)

        movement_in = models.StockMovement(
            company_id=company_id,
            warehouse_id=transfer.to_warehouse_id,
            item_id=line.item_id,
            movement_date=transfer.transfer_date,
            source_type="STOCK_TRANSFER",
            source_id=transfer.id,
            qty_in=line.quantity,
            qty_out=0,
        )
        db.add(movement_in)

    # 4. Create automated accounting Voucher (Journal)
    if total_transfer_value > 0:
        ledger_id = _get_default_stock_ledger_id(db, company_id=company_id)
        if not ledger_id:
             # Fallback if no stock ledger found
             raise HTTPException(
                 status_code=400,
                 detail="Could not find or create a default 'Stock-in-Hand' ledger for accounting entry."
             )

        voucher_number, fiscal_year, next_seq = get_next_voucher_number(
            db, company_id, models.VoucherType.JOURNAL, transfer.transfer_date
        )
        
        voucher = models.Voucher(
            company_id=company_id,
            voucher_date=transfer.transfer_date,
            voucher_type=models.VoucherType.JOURNAL,
            fiscal_year=fiscal_year,
            voucher_sequence=next_seq,
            voucher_number=voucher_number,
            narration=f"Stock Transfer #{transfer.transfer_number or transfer.id}: From {from_warehouse.name} to {to_warehouse.name}",
        )
        db.add(voucher)
        db.flush()

        # DEBIT Destination Warehouse's Branch
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=ledger_id,
                debit=total_transfer_value,
                credit=0,
                department_id=to_warehouse.department_id,
                project_id=to_warehouse.project_id,
                remarks=f"Stock received at {to_warehouse.name}",
            )
        )

        # CREDIT Source Warehouse's Branch
        db.add(
            models.VoucherLine(
                voucher_id=voucher.id,
                ledger_id=ledger_id,
                debit=0,
                credit=total_transfer_value,
                department_id=from_warehouse.department_id,
                project_id=from_warehouse.project_id,
                remarks=f"Stock issued from {from_warehouse.name}",
            )
        )
        
        transfer.voucher_id = voucher.id

    transfer.status = models.StockTransferStatus.POSTED
    transfer.posted_at = now

    db.commit()

    db.refresh(transfer)
    for line in lines:
        db.refresh(line)

    return schemas.StockTransferDetailRead(header=transfer, lines=lines)


@router.delete("/stock-transfers/{transfer_id}")
def delete_stock_transfer(
    company_id: int,
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    transfer = (
        db.query(models.StockTransfer)
        .filter(
            models.StockTransfer.id == transfer_id,
            models.StockTransfer.company_id == company_id,
        )
        .first()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Stock transfer not found")
    if transfer.status != models.StockTransferStatus.DRAFT:
        raise HTTPException(status_code=409, detail="Cannot delete a POSTED transfer")

    db.delete(transfer)
    db.commit()

    return {"detail": "Deleted"}
