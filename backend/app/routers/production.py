from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, time, timezone
from typing import Any

import io

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from fastapi.responses import StreamingResponse
from sqlalchemy import and_, func, or_, text
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure
from ..permissions import require_menu_access
from ..voucher_service import get_next_voucher_number


router = APIRouter(prefix="/companies/{company_id}", tags=["production"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


def _as_of_point_for_lookup(as_of: date | None) -> datetime:
    if as_of is None:
        return datetime.now(timezone.utc)
    return datetime.combine(as_of, time(12, 0, 0), tzinfo=timezone.utc)


def _bom_effective_predicate(as_of_point: datetime):
    return and_(
        or_(
            models.BOMMaster.effective_from.is_(None),
            models.BOMMaster.effective_from <= as_of_point,
        ),
        or_(
            models.BOMMaster.effective_to.is_(None),
            models.BOMMaster.effective_to >= as_of_point,
        ),
    )


def _validate_bom_effective_window(
    effective_from: datetime | None, effective_to: datetime | None
) -> None:
    if effective_from is not None and effective_to is not None and effective_from > effective_to:
        raise HTTPException(
            status_code=400,
            detail="effective_from must be on or before effective_to",
        )


def _resolve_component_unit_cost(db: Session, *, company_id: int, product_id: int) -> float:
    item = (
        db.query(models.Item)
        .filter(models.Item.company_id == company_id, models.Item.id == product_id)
        .first()
    )
    if item is None:
        return 0.0

    if item.default_purchase_rate is not None:
        return float(item.default_purchase_rate or 0)

    latest_purchase_rate = (
        db.query(models.PurchaseBillLine.rate)
        .join(models.PurchaseBill, models.PurchaseBill.id == models.PurchaseBillLine.bill_id)
        .filter(
            models.PurchaseBill.company_id == company_id,
            models.PurchaseBillLine.item_id == product_id,
        )
        .order_by(models.PurchaseBill.date.desc(), models.PurchaseBill.id.desc(), models.PurchaseBillLine.id.desc())
        .limit(1)
        .scalar()
    )
    if latest_purchase_rate is not None:
        return float(latest_purchase_rate or 0)

    if item.opening_rate is not None:
        return float(item.opening_rate or 0)
    return 0.0


def _resolve_component_standard_unit_cost(db: Session, *, company_id: int, product_id: int) -> float:
    item = (
        db.query(models.Item)
        .filter(models.Item.company_id == company_id, models.Item.id == product_id)
        .first()
    )
    if item is None:
        return 0.0
    if item.standard_cost is not None:
        return float(item.standard_cost or 0)
    return _resolve_component_unit_cost(db, company_id=company_id, product_id=product_id)


def _get_latest_bom_for_product(
    db: Session, *, company_id: int, product_id: int, as_of: date | None = None
) -> models.BOMMaster | None:
    point = _as_of_point_for_lookup(as_of)
    return (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(
            models.BOMMaster.company_id == company_id,
            models.BOMMaster.product_id == product_id,
            _bom_effective_predicate(point),
        )
        .order_by(models.BOMMaster.version.desc(), models.BOMMaster.id.desc())
        .first()
    )


def _get_bom_by_id(db: Session, *, company_id: int, bom_id: int) -> models.BOMMaster | None:
    return (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(models.BOMMaster.company_id == company_id, models.BOMMaster.id == bom_id)
        .first()
    )


def _resolve_bom_for_production(
    db: Session,
    *,
    company_id: int,
    product_id: int,
    bom_id: int | None,
    bom_as_of: date | None,
) -> models.BOMMaster:
    if bom_id is not None:
        bom = _get_bom_by_id(db, company_id=company_id, bom_id=bom_id)
        if bom is None:
            raise HTTPException(status_code=404, detail="BOM not found")
        if int(bom.product_id) != int(product_id):
            raise HTTPException(status_code=400, detail="BOM does not belong to the finished product")
        if not bom.items:
            raise HTTPException(status_code=400, detail="BOM has no lines")
        return bom
    bom = _get_latest_bom_for_product(db, company_id=company_id, product_id=product_id, as_of=bom_as_of)
    if bom is None or not bom.items:
        raise HTTPException(status_code=400, detail="No BOM configured for finished product")
    return bom


def _build_active_bom_graph(db: Session, *, company_id: int, as_of: date | None = None) -> dict[int, set[int]]:
    pids = [
        int(r[0])
        for r in db.query(models.BOMMaster.product_id)
        .filter(models.BOMMaster.company_id == company_id)
        .distinct()
        .all()
    ]
    graph: dict[int, set[int]] = {}
    for pid in pids:
        bom = _get_latest_bom_for_product(db, company_id=company_id, product_id=pid, as_of=as_of)
        if bom and bom.items:
            graph[int(pid)] = {int(x.component_product_id) for x in bom.items}
    return graph


def _has_path(graph: dict[int, set[int]], start: int, target: int) -> bool:
    visited: set[int] = set()
    stack = [start]
    while stack:
        node = stack.pop()
        if node == target:
            return True
        if node in visited:
            continue
        visited.add(node)
        for nxt in graph.get(node, set()):
            if nxt not in visited:
                stack.append(nxt)
    return False


def _validate_no_circular_bom(
    db: Session,
    *,
    company_id: int,
    product_id: int,
    component_ids: list[int],
) -> None:
    if product_id in component_ids:
        raise HTTPException(status_code=400, detail="Circular BOM reference detected")

    graph = _build_active_bom_graph(db, company_id=company_id, as_of=None)
    graph[int(product_id)] = {int(x) for x in component_ids}

    for component_id in component_ids:
        if _has_path(graph, int(component_id), int(product_id)):
            raise HTTPException(status_code=400, detail="Circular BOM reference detected")


def _validate_products_exist(db: Session, *, company_id: int, product_ids: set[int]) -> None:
    rows = (
        db.query(models.Item.id)
        .filter(models.Item.company_id == company_id, models.Item.id.in_(list(product_ids)))
        .all()
    )
    existing = {int(r.id) for r in rows}
    missing = sorted(product_ids - existing)
    if missing:
        raise HTTPException(status_code=400, detail=f"Invalid product ids: {missing}")


def _get_bom_cost(db: Session, *, company_id: int, bom: models.BOMMaster) -> float:
    total = 0.0
    for row in bom.items:
        req_qty = float(row.quantity or 0)
        waste_factor = 1.0 + (float(row.wastage_percent or 0) / 100.0)
        unit_cost = _resolve_component_unit_cost(
            db, company_id=company_id, product_id=int(row.component_product_id)
        )
        total += req_qty * waste_factor * unit_cost
    return float(total)


def _explode_component_requirements(
    db: Session,
    *,
    company_id: int,
    bom: models.BOMMaster,
    order_qty: float,
    expand_sub: bool,
    bom_as_of: date | None,
    path: tuple[int, ...],
) -> dict[int, float]:
    fg = int(bom.product_id)
    if fg in path:
        raise HTTPException(status_code=400, detail="Circular BOM detected during multi-level explosion")
    new_path = path + (fg,)
    out: dict[int, float] = defaultdict(float)
    for row in bom.items:
        req_qty = float(order_qty) * float(row.quantity or 0)
        req_qty *= 1.0 + (float(row.wastage_percent or 0) / 100.0)
        cid = int(row.component_product_id)
        if not expand_sub:
            out[cid] += req_qty
            continue
        sub = _get_latest_bom_for_product(db, company_id=company_id, product_id=cid, as_of=bom_as_of)
        if sub is not None and sub.items:
            inner = _explode_component_requirements(
                db,
                company_id=company_id,
                bom=sub,
                order_qty=req_qty,
                expand_sub=True,
                bom_as_of=bom_as_of,
                path=new_path,
            )
            for pid, q in inner.items():
                out[pid] += q
        else:
            out[cid] += req_qty
    return dict(out)


def _get_stock_on_hand(
    db: Session,
    *,
    company_id: int,
    warehouse_id: int,
    item_id: int,
) -> float:
    opening = (
        db.query(models.Item.opening_stock)
        .filter(models.Item.company_id == company_id, models.Item.id == item_id)
        .scalar()
    )
    delta = (
        db.query(func.coalesce(func.sum(models.StockLedger.qty_delta), 0))
        .filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.warehouse_id == warehouse_id,
            models.StockLedger.item_id == item_id,
            models.StockLedger.reversed_at.is_(None),
        )
        .scalar()
    )
    return float(opening or 0) + float(delta or 0)


def _get_default_warehouse(db: Session, *, company_id: int) -> models.Warehouse:
    warehouse = (
        db.query(models.Warehouse)
        .filter(
            models.Warehouse.company_id == company_id,
            models.Warehouse.name == "Main",
            models.Warehouse.is_active.is_(True),
        )
        .first()
    )
    if warehouse is None:
        warehouse = (
            db.query(models.Warehouse)
            .filter(models.Warehouse.company_id == company_id, models.Warehouse.is_active.is_(True))
            .order_by(models.Warehouse.id.asc())
            .first()
        )
    if warehouse is None:
        raise HTTPException(status_code=400, detail="No active warehouse found")
    return warehouse


def _resolve_warehouse(db: Session, *, company_id: int, warehouse_id: int | None) -> models.Warehouse:
    if warehouse_id is not None:
        w = (
            db.query(models.Warehouse)
            .filter(
                models.Warehouse.company_id == company_id,
                models.Warehouse.id == warehouse_id,
                models.Warehouse.is_active.is_(True),
            )
            .first()
        )
        if w is None:
            raise HTTPException(status_code=400, detail="Invalid or inactive warehouse_id")
        return w
    return _get_default_warehouse(db, company_id=company_id)


def _validate_cost_center(
    db: Session,
    *,
    company_id: int,
    model_cls: type[models.Department] | type[models.Project] | type[models.Segment],
    value: int | None,
    field_name: str,
) -> int | None:
    if value is None:
        return None
    row = (
        db.query(model_cls)
        .filter(
            model_cls.company_id == company_id,
            model_cls.id == int(value),
            model_cls.is_active.is_(True),
        )
        .first()
    )
    if row is None:
        raise HTTPException(status_code=400, detail=f"Invalid or inactive {field_name}")
    return int(value)


def _resolve_dimension_override(
    db: Session,
    *,
    company_id: int,
    warehouse: models.Warehouse,
    requested_department_id: int | None,
    requested_project_id: int | None,
    requested_segment_id: int | None,
) -> tuple[int | None, int | None, int | None]:
    department_id = _validate_cost_center(
        db,
        company_id=company_id,
        model_cls=models.Department,
        value=requested_department_id if requested_department_id is not None else warehouse.department_id,
        field_name="department_id",
    )
    project_id = _validate_cost_center(
        db,
        company_id=company_id,
        model_cls=models.Project,
        value=requested_project_id if requested_project_id is not None else warehouse.project_id,
        field_name="project_id",
    )
    segment_id = _validate_cost_center(
        db,
        company_id=company_id,
        model_cls=models.Segment,
        value=requested_segment_id if requested_segment_id is not None else warehouse.segment_id,
        field_name="segment_id",
    )
    return department_id, project_id, segment_id


def _parse_production_status(raw: str | None) -> models.ProductionOrderStatus:
    if not raw:
        return models.ProductionOrderStatus.COMPLETED
    key = raw.strip().upper()
    allowed = {s.name for s in models.ProductionOrderStatus}
    if key not in allowed:
        raise HTTPException(status_code=400, detail=f"Invalid production order status: {raw}")
    return models.ProductionOrderStatus[key]


def _next_prefixed_number(db: Session, *, company_id: int, table: str, column: str, prefix: str) -> str:
    like = f"{prefix}-%"
    rows = db.execute(
        text(
            f"SELECT {column} FROM {table} WHERE company_id=:company_id AND {column} LIKE :like ORDER BY id DESC LIMIT 1"
        ),
        {"company_id": company_id, "like": like},
    ).fetchall()
    seq = 1
    if rows:
        raw = str(rows[0][0] or "")
        try:
            seq = int(raw.split("-")[-1]) + 1
        except Exception:
            seq = 1
    return f"{prefix}-{seq:05d}"


def _ensure_stock_group(db: Session, *, company_id: int) -> models.LedgerGroup:
    group = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.name == "Stock-in-Hand",
        )
        .first()
    )
    if group is not None:
        return group
    group = models.LedgerGroup(
        company_id=company_id,
        name="Stock-in-Hand",
        group_type=models.LedgerGroupType.ASSET,
        parent_group_id=None,
    )
    db.add(group)
    db.flush()
    return group


def _get_or_create_inventory_ledger(
    db: Session,
    *,
    company_id: int,
    code: str,
    name: str,
    group_id: int,
) -> models.Ledger:
    ledger = (
        db.query(models.Ledger)
        .filter(models.Ledger.company_id == company_id, models.Ledger.code == code)
        .first()
    )
    if ledger is not None:
        return ledger
    ledger = models.Ledger(
        company_id=company_id,
        group_id=group_id,
        name=name,
        code=code,
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    db.add(ledger)
    db.flush()
    return ledger


def _get_or_create_wip_ledger(db: Session, *, company_id: int, group_id: int) -> models.Ledger:
    """Return (or create) the WIP ledger for manufacturing journal entries."""
    settings = db.query(models.ManufacturingSettings).filter(
        models.ManufacturingSettings.company_id == company_id
    ).first()
    if settings and settings.default_wip_ledger_id:
        ledger = db.query(models.Ledger).filter(models.Ledger.id == settings.default_wip_ledger_id).first()
        if ledger:
            return ledger
    return _get_or_create_inventory_ledger(
        db, company_id=company_id, code="WIP_STOCK", name="Work In Progress", group_id=group_id
    )


def _post_material_issue_voucher(
    db: Session,
    *,
    company_id: int,
    production_order: models.ProductionOrder,
    voucher_date: date,
    amount: float,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
) -> None:
    """Post Dr WIP / Cr Raw Material when material is issued to production."""
    if float(amount or 0) <= 0:
        return
    stock_group = _ensure_stock_group(db, company_id=company_id)
    rm_ledger = _get_or_create_inventory_ledger(
        db, company_id=company_id, code="RAW_MATERIAL_STOCK", name="Raw Material Stock", group_id=stock_group.id
    )
    wip_ledger = _get_or_create_wip_ledger(db, company_id=company_id, group_id=stock_group.id)
    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db, company_id, models.VoucherType.JOURNAL, voucher_date
    )
    effective_dept = department_id if department_id is not None else production_order.department_id
    effective_proj = project_id if project_id is not None else production_order.project_id
    effective_seg = segment_id if segment_id is not None else production_order.segment_id
    voucher = models.Voucher(
        company_id=company_id,
        voucher_date=voucher_date,
        voucher_type=models.VoucherType.JOURNAL,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=f"Material issue for production order #{production_order.id} (item {production_order.product_id})",
        department_id=effective_dept,
        project_id=effective_proj,
        segment_id=effective_seg,
    )
    db.add(voucher)
    db.flush()
    db.add(models.VoucherLine(
        voucher_id=voucher.id, ledger_id=wip_ledger.id,
        debit=float(amount), credit=0.0,
        department_id=effective_dept, project_id=effective_proj, segment_id=effective_seg,
        remarks=f"WIP: material issued for order #{production_order.id}",
    ))
    db.add(models.VoucherLine(
        voucher_id=voucher.id, ledger_id=rm_ledger.id,
        debit=0.0, credit=float(amount),
        department_id=effective_dept, project_id=effective_proj, segment_id=effective_seg,
        remarks=f"RM consumed: issued for order #{production_order.id}",
    ))


def _post_production_accounting_voucher(
    db: Session,
    *,
    company_id: int,
    production_order: models.ProductionOrder,
    voucher_date: date,
    amount: float,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
) -> None:
    """Post Dr Finished Goods / Cr WIP when FG is received from production."""
    if float(amount or 0) <= 0:
        production_order.voucher_id = None
        return
    stock_group = _ensure_stock_group(db, company_id=company_id)
    wip_ledger = _get_or_create_wip_ledger(db, company_id=company_id, group_id=stock_group.id)
    fg_ledger = _get_or_create_inventory_ledger(
        db,
        company_id=company_id,
        code="FINISHED_GOODS_STOCK",
        name="Finished Goods Stock",
        group_id=stock_group.id,
    )
    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db, company_id, models.VoucherType.JOURNAL, voucher_date
    )
    effective_department_id = (
        department_id if department_id is not None else production_order.department_id
    )
    effective_project_id = (
        project_id if project_id is not None else production_order.project_id
    )
    effective_segment_id = (
        segment_id if segment_id is not None else production_order.segment_id
    )
    voucher = models.Voucher(
        company_id=company_id,
        voucher_date=voucher_date,
        voucher_type=models.VoucherType.JOURNAL,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=(
            f"Production order #{production_order.id}: FG received, transfer WIP to FG "
            f"(item {production_order.product_id})"
        ),
        department_id=effective_department_id,
        project_id=effective_project_id,
        segment_id=effective_segment_id,
    )
    db.add(voucher)
    db.flush()
    db.add(
        models.VoucherLine(
            voucher_id=voucher.id,
            ledger_id=fg_ledger.id,
            debit=float(amount),
            credit=0.0,
            department_id=effective_department_id,
            project_id=effective_project_id,
            segment_id=effective_segment_id,
            remarks=f"FG received for production order #{production_order.id}",
        )
    )
    db.add(
        models.VoucherLine(
            voucher_id=voucher.id,
            ledger_id=wip_ledger.id,
            debit=0.0,
            credit=float(amount),
            department_id=effective_department_id,
            project_id=effective_project_id,
            segment_id=effective_segment_id,
            remarks=f"WIP cleared: FG received for order #{production_order.id}",
        )
    )
    db.query(models.ProductionOrder).filter(
        models.ProductionOrder.id == production_order.id
    ).update({"voucher_id": voucher.id}, synchronize_session=False)


def _production_order_to_read(
    db: Session, *, company_id: int, order: models.ProductionOrder
) -> schemas.ProductionOrderRead:
    out = schemas.ProductionOrderRead.model_validate(order)
    out.produced_qty = float(order.quantity or 0)
    actual = 0.0
    standard = 0.0
    for li in order.items:
        pid = int(li.product_id)
        q = float(li.consumed_qty or 0)
        actual += q * _resolve_component_unit_cost(db, company_id=company_id, product_id=pid)
        standard += q * _resolve_component_standard_unit_cost(db, company_id=company_id, product_id=pid)
    out.actual_material_cost = float(actual)
    out.standard_material_cost = float(standard)
    return out


def _validate_component_stock(
    db: Session,
    *,
    company_id: int,
    warehouse_id: int,
    component_map: dict[int, float],
) -> tuple[float, dict[int, models.Item]]:
    items_by_id: dict[int, models.Item] = {}
    component_total_cost = 0.0
    for comp_id, req_qty in component_map.items():
        component = (
            db.query(models.Item)
            .filter(models.Item.company_id == company_id, models.Item.id == comp_id)
            .first()
        )
        if component is None:
            raise HTTPException(status_code=400, detail=f"Component item not found: {comp_id}")
        items_by_id[comp_id] = component
        available = _get_stock_on_hand(
            db,
            company_id=company_id,
            warehouse_id=warehouse_id,
            item_id=comp_id,
        )
        if (not bool(component.allow_negative_stock)) and req_qty > available:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for component {comp_id}",
            )
        component_total_cost += req_qty * _resolve_component_unit_cost(
            db, company_id=company_id, product_id=comp_id
        )
    return component_total_cost, items_by_id


def _persist_completed_production(
    db: Session,
    *,
    company_id: int,
    current_user: models.User,
    product_id: int,
    order_qty: float,
    warehouse: models.Warehouse,
    component_map: dict[int, float],
    component_total_cost: float,
    header: dict[str, Any],
) -> models.ProductionOrder:
    now = datetime.utcnow()
    warehouse_id = int(warehouse.id)
    finished_unit_cost = (component_total_cost / float(order_qty)) if float(order_qty) else 0.0

    def body() -> models.ProductionOrder:
        production_order = models.ProductionOrder(**header)
        db.add(production_order)
        db.flush()
        for comp_id, req_qty in component_map.items():
            db.add(
                models.ProductionItem(
                    production_order_id=production_order.id,
                    product_id=comp_id,
                    consumed_qty=req_qty,
                )
            )
            component_cost = _resolve_component_unit_cost(
                db, company_id=company_id, product_id=comp_id
            )
            db.add(
                models.StockLedger(
                    company_id=company_id,
                    warehouse_id=warehouse_id,
                    item_id=comp_id,
                    qty_delta=-req_qty,
                    unit_cost=component_cost,
                    source_type="PRODUCTION_ORDER",
                    source_id=production_order.id,
                    source_line_id=None,
                    posted_at=now,
                    created_by=current_user.id,
                )
            )
            db.add(
                models.StockMovement(
                    company_id=company_id,
                    warehouse_id=warehouse_id,
                    item_id=comp_id,
                    movement_date=now.date(),
                    source_type="PRODUCTION_ORDER",
                    source_id=production_order.id,
                    qty_in=0,
                    qty_out=req_qty,
                )
            )
        db.add(
            models.StockLedger(
                company_id=company_id,
                warehouse_id=warehouse_id,
                item_id=product_id,
                qty_delta=float(order_qty),
                unit_cost=finished_unit_cost,
                source_type="PRODUCTION_ORDER",
                source_id=production_order.id,
                source_line_id=None,
                posted_at=now,
                created_by=current_user.id,
            )
        )
        db.add(
            models.StockMovement(
                company_id=company_id,
                warehouse_id=warehouse_id,
                item_id=product_id,
                movement_date=now.date(),
                source_type="PRODUCTION_ORDER",
                source_id=production_order.id,
                qty_in=float(order_qty),
                qty_out=0,
            )
        )
        _post_production_accounting_voucher(
            db,
            company_id=company_id,
            production_order=production_order,
            voucher_date=now.date(),
            amount=float(component_total_cost or 0.0),
        )
        db.flush()
        return production_order

    if db.in_transaction():
        return body()
    with db.begin():
        return body()


@router.post("/bom", response_model=schemas.BOMRead)
def create_bom(
    company_id: int,
    bom_in: schemas.BOMCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    if not bom_in.items:
        raise HTTPException(status_code=400, detail="BOM must contain at least one component")

    _validate_bom_effective_window(bom_in.effective_from, bom_in.effective_to)

    product_ids = {int(bom_in.product_id)} | {int(x.component_product_id) for x in bom_in.items}
    _validate_products_exist(db, company_id=company_id, product_ids=product_ids)
    _validate_no_circular_bom(
        db,
        company_id=company_id,
        product_id=int(bom_in.product_id),
        component_ids=[int(x.component_product_id) for x in bom_in.items],
    )

    max_version = (
        db.query(func.max(models.BOMMaster.version))
        .filter(
            models.BOMMaster.company_id == company_id,
            models.BOMMaster.product_id == bom_in.product_id,
        )
        .scalar()
    )
    version = int(bom_in.version or 0)
    if version <= 0:
        version = int(max_version or 0) + 1
    warehouse = _resolve_warehouse(db, company_id=company_id, warehouse_id=bom_in.warehouse_id)
    department_id, project_id, segment_id = _resolve_dimension_override(
        db,
        company_id=company_id,
        warehouse=warehouse,
        requested_department_id=bom_in.department_id,
        requested_project_id=bom_in.project_id,
        requested_segment_id=bom_in.segment_id,
    )

    bom = models.BOMMaster(
        company_id=company_id,
        product_id=bom_in.product_id,
        version=version,
        bom_code=bom_in.bom_code,
        batch_size=bom_in.batch_size,
        status=bom_in.status or "ACTIVE",
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        effective_from=bom_in.effective_from,
        effective_to=bom_in.effective_to,
        labor_cost=bom_in.labor_cost or 0,
        machine_cost=bom_in.machine_cost or 0,
        electricity_cost=bom_in.electricity_cost or 0,
        packing_cost=bom_in.packing_cost or 0,
        overhead_cost=bom_in.overhead_cost or 0,
    )
    db.add(bom)
    db.flush()

    for row in bom_in.items:
        db.add(
            models.BOMItem(
                bom_id=bom.id,
                component_product_id=row.component_product_id,
                quantity=row.quantity,
                unit=row.unit,
                wastage_percent=row.wastage_percent or 0,
                remarks=row.remarks,
            )
        )
    db.commit()
    db.refresh(bom)
    bom = (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(models.BOMMaster.id == bom.id)
        .first()
    )
    data = schemas.BOMRead.model_validate(bom)
    data.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=bom)
    return data


@router.put("/bom/{bom_id}", response_model=schemas.BOMRead)
def update_bom(
    company_id: int,
    bom_id: int,
    bom_in: schemas.BOMUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    bom = (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(models.BOMMaster.company_id == company_id, models.BOMMaster.id == bom_id)
        .first()
    )
    if bom is None:
        raise HTTPException(status_code=404, detail="BOM not found")

    eff_from = bom_in.effective_from if bom_in.effective_from is not None else bom.effective_from
    eff_to = bom_in.effective_to if bom_in.effective_to is not None else bom.effective_to
    if bom_in.effective_from is not None or bom_in.effective_to is not None:
        _validate_bom_effective_window(eff_from, eff_to)
        bom.effective_from = bom_in.effective_from if bom_in.effective_from is not None else bom.effective_from
        bom.effective_to = bom_in.effective_to if bom_in.effective_to is not None else bom.effective_to

    if bom_in.version is not None and int(bom_in.version) > 0:
        bom.version = int(bom_in.version)
    if bom_in.bom_code is not None:
        bom.bom_code = bom_in.bom_code
    if bom_in.batch_size is not None:
        bom.batch_size = bom_in.batch_size
    if bom_in.status is not None:
        bom.status = bom_in.status
    if bom_in.approval_status is not None:
        bom.approval_status = bom_in.approval_status
    if bom_in.labor_cost is not None:
        bom.labor_cost = bom_in.labor_cost
    if bom_in.machine_cost is not None:
        bom.machine_cost = bom_in.machine_cost
    if bom_in.electricity_cost is not None:
        bom.electricity_cost = bom_in.electricity_cost
    if bom_in.packing_cost is not None:
        bom.packing_cost = bom_in.packing_cost
    if bom_in.overhead_cost is not None:
        bom.overhead_cost = bom_in.overhead_cost

    bom_patch = bom_in.model_dump(exclude_unset=True)
    if any(k in bom_patch for k in ("warehouse_id", "department_id", "project_id", "segment_id")):
        warehouse = _resolve_warehouse(
            db,
            company_id=company_id,
            warehouse_id=bom_patch.get("warehouse_id"),
        )
        if "department_id" in bom_patch:
            department_id, _, _ = _resolve_dimension_override(
                db,
                company_id=company_id,
                warehouse=warehouse,
                requested_department_id=bom_patch.get("department_id"),
                requested_project_id=bom.project_id,
                requested_segment_id=bom.segment_id,
            )
            bom.department_id = department_id
        if "project_id" in bom_patch:
            _, project_id, _ = _resolve_dimension_override(
                db,
                company_id=company_id,
                warehouse=warehouse,
                requested_department_id=bom.department_id,
                requested_project_id=bom_patch.get("project_id"),
                requested_segment_id=bom.segment_id,
            )
            bom.project_id = project_id
        if "segment_id" in bom_patch:
            _, _, segment_id = _resolve_dimension_override(
                db,
                company_id=company_id,
                warehouse=warehouse,
                requested_department_id=bom.department_id,
                requested_project_id=bom.project_id,
                requested_segment_id=bom_patch.get("segment_id"),
            )
            bom.segment_id = segment_id

    if bom_in.items is not None:
        if not bom_in.items:
            raise HTTPException(status_code=400, detail="BOM must contain at least one component")
        product_ids = {int(bom.product_id)} | {int(x.component_product_id) for x in bom_in.items}
        _validate_products_exist(db, company_id=company_id, product_ids=product_ids)
        _validate_no_circular_bom(
            db,
            company_id=company_id,
            product_id=int(bom.product_id),
            component_ids=[int(x.component_product_id) for x in bom_in.items],
        )

        db.query(models.BOMItem).filter(models.BOMItem.bom_id == bom.id).delete()
        for row in bom_in.items:
            db.add(
                models.BOMItem(
                    bom_id=bom.id,
                    component_product_id=row.component_product_id,
                    quantity=row.quantity,
                    unit=row.unit,
                    wastage_percent=row.wastage_percent or 0,
                    remarks=row.remarks,
                )
            )
    db.commit()

    bom = (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(models.BOMMaster.id == bom_id)
        .first()
    )
    data = schemas.BOMRead.model_validate(bom)
    data.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=bom)
    return data


@router.get("/bom/product/{product_id}", response_model=schemas.BOMRead)
def get_bom_by_product(
    company_id: int,
    product_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    as_of: date | None = Query(None, description="Resolve BOM effective on this calendar date (UTC)"),
):
    _get_company(db, company_id, current_user)
    bom = _get_latest_bom_for_product(db, company_id=company_id, product_id=product_id, as_of=as_of)
    if bom is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    data = schemas.BOMRead.model_validate(bom)
    data.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=bom)
    return data


@router.get("/bom/{bom_id}", response_model=schemas.BOMRead)
def get_bom_by_id(
    company_id: int,
    bom_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    bom = _get_bom_by_id(db, company_id=company_id, bom_id=bom_id)
    if bom is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    data = schemas.BOMRead.model_validate(bom)
    data.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=bom)
    return data


@router.delete("/bom/{bom_id}")
def delete_bom(
    company_id: int,
    bom_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    bom = (
        db.query(models.BOMMaster)
        .filter(models.BOMMaster.company_id == company_id, models.BOMMaster.id == bom_id)
        .first()
    )
    if bom is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    db.delete(bom)
    db.commit()
    return {"detail": "Deleted"}


@router.post("/production-orders", response_model=schemas.ProductionOrderRead)
def create_production_order(
    company_id: int,
    order_in: schemas.ProductionOrderCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    if float(order_in.quantity) <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be greater than zero")

    finished_item = (
        db.query(models.Item)
        .filter(models.Item.company_id == company_id, models.Item.id == order_in.product_id)
        .first()
    )
    if finished_item is None:
        raise HTTPException(status_code=400, detail="Finished product not found")

    status = _parse_production_status(order_in.status)
    if status not in (
        models.ProductionOrderStatus.COMPLETED,
        models.ProductionOrderStatus.DRAFT,
        models.ProductionOrderStatus.RELEASED,
    ):
        raise HTTPException(
            status_code=400,
            detail="Only COMPLETED, DRAFT, or RELEASED may be set on create",
        )

    warehouse = _resolve_warehouse(db, company_id=company_id, warehouse_id=order_in.warehouse_id)
    department_id, project_id, segment_id = _resolve_dimension_override(
        db,
        company_id=company_id,
        warehouse=warehouse,
        requested_department_id=order_in.department_id,
        requested_project_id=order_in.project_id,
        requested_segment_id=order_in.segment_id,
    )
    bom = _resolve_bom_for_production(
        db,
        company_id=company_id,
        product_id=int(order_in.product_id),
        bom_id=order_in.bom_id,
        bom_as_of=order_in.bom_as_of,
    )
    component_map = _explode_component_requirements(
        db,
        company_id=company_id,
        bom=bom,
        order_qty=float(order_in.quantity),
        expand_sub=bool(order_in.expand_sub_assemblies),
        bom_as_of=order_in.bom_as_of,
        path=(),
    )

    header: dict[str, Any] = {
        "company_id": company_id,
        "order_no": order_in.order_no or _next_prefixed_number(db, company_id=company_id, table="production_orders", column="order_no", prefix="PO"),
        "order_date": order_in.order_date or date.today(),
        "product_id": order_in.product_id,
        "quantity": order_in.quantity,
        "planned_qty": order_in.planned_qty if order_in.planned_qty is not None else order_in.quantity,
        "status": status,
        "warehouse_id": int(warehouse.id),
        "bom_id": int(bom.id),
        "department_id": department_id,
        "project_id": project_id,
        "segment_id": segment_id,
        "bom_as_of": order_in.bom_as_of,
        "expand_sub_assemblies": bool(order_in.expand_sub_assemblies),
        "options": order_in.options,
        "priority": order_in.priority,
        "supervisor_name": order_in.supervisor_name,
        "expected_completion_date": order_in.expected_completion_date,
        "operator": order_in.operator,
        "machine": order_in.machine,
    }

    if status in (models.ProductionOrderStatus.DRAFT, models.ProductionOrderStatus.RELEASED):
        production_order = models.ProductionOrder(**header)
        db.add(production_order)
        db.commit()
        db.refresh(production_order)
        order = (
            db.query(models.ProductionOrder)
            .options(joinedload(models.ProductionOrder.items))
            .filter(models.ProductionOrder.id == production_order.id)
            .first()
        )
        return _production_order_to_read(db, company_id=company_id, order=order)

    component_total_cost, _ = _validate_component_stock(
        db,
        company_id=company_id,
        warehouse_id=int(warehouse.id),
        component_map=component_map,
    )
    header["status"] = models.ProductionOrderStatus.COMPLETED
    production_order = _persist_completed_production(
        db,
        company_id=company_id,
        current_user=current_user,
        product_id=int(order_in.product_id),
        order_qty=float(order_in.quantity),
        warehouse=warehouse,
        component_map=component_map,
        component_total_cost=component_total_cost,
        header=header,
    )
    db.refresh(production_order)
    order = (
        db.query(models.ProductionOrder)
        .options(joinedload(models.ProductionOrder.items))
        .filter(models.ProductionOrder.id == production_order.id)
        .first()
    )
    return _production_order_to_read(db, company_id=company_id, order=order)


@router.post("/production-orders/{production_order_id}/complete", response_model=schemas.ProductionOrderRead)
def complete_production_order(
    company_id: int,
    production_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = (
        db.query(models.ProductionOrder)
        .options(joinedload(models.ProductionOrder.items))
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status not in (models.ProductionOrderStatus.DRAFT, models.ProductionOrderStatus.RELEASED):
        raise HTTPException(status_code=400, detail="Only DRAFT or RELEASED orders can be completed")
    if order.items:
        raise HTTPException(status_code=400, detail="Order already has consumption lines")

    warehouse = _resolve_warehouse(db, company_id=company_id, warehouse_id=order.warehouse_id)
    department_id, project_id, segment_id = _resolve_dimension_override(
        db,
        company_id=company_id,
        warehouse=warehouse,
        requested_department_id=order.department_id,
        requested_project_id=order.project_id,
        requested_segment_id=order.segment_id,
    )
    bom = _resolve_bom_for_production(
        db,
        company_id=company_id,
        product_id=int(order.product_id),
        bom_id=order.bom_id,
        bom_as_of=order.bom_as_of,
    )
    component_map = _explode_component_requirements(
        db,
        company_id=company_id,
        bom=bom,
        order_qty=float(order.quantity),
        expand_sub=bool(order.expand_sub_assemblies),
        bom_as_of=order.bom_as_of,
        path=(),
    )
    component_total_cost, _ = _validate_component_stock(
        db,
        company_id=company_id,
        warehouse_id=int(warehouse.id),
        component_map=component_map,
    )

    def body() -> None:
        order.status = models.ProductionOrderStatus.COMPLETED
        order.warehouse_id = int(warehouse.id)
        order.bom_id = int(bom.id)
        order.department_id = department_id
        order.project_id = project_id
        order.segment_id = segment_id
        now = datetime.utcnow()
        warehouse_id = int(warehouse.id)
        order_qty = float(order.quantity)
        finished_unit_cost = (component_total_cost / order_qty) if order_qty else 0.0
        for comp_id, req_qty in component_map.items():
            db.add(
                models.ProductionItem(
                    production_order_id=order.id,
                    product_id=comp_id,
                    consumed_qty=req_qty,
                )
            )
            component_cost = _resolve_component_unit_cost(
                db, company_id=company_id, product_id=comp_id
            )
            db.add(
                models.StockLedger(
                    company_id=company_id,
                    warehouse_id=warehouse_id,
                    item_id=comp_id,
                    qty_delta=-req_qty,
                    unit_cost=component_cost,
                    source_type="PRODUCTION_ORDER",
                    source_id=order.id,
                    source_line_id=None,
                    posted_at=now,
                    created_by=current_user.id,
                )
            )
            db.add(
                models.StockMovement(
                    company_id=company_id,
                    warehouse_id=warehouse_id,
                    item_id=comp_id,
                    movement_date=now.date(),
                    source_type="PRODUCTION_ORDER",
                    source_id=order.id,
                    qty_in=0,
                    qty_out=req_qty,
                )
            )
        db.add(
            models.StockLedger(
                company_id=company_id,
                warehouse_id=warehouse_id,
                item_id=int(order.product_id),
                qty_delta=order_qty,
                unit_cost=finished_unit_cost,
                source_type="PRODUCTION_ORDER",
                source_id=order.id,
                source_line_id=None,
                posted_at=now,
                created_by=current_user.id,
            )
        )
        db.add(
            models.StockMovement(
                company_id=company_id,
                warehouse_id=warehouse_id,
                item_id=int(order.product_id),
                movement_date=now.date(),
                source_type="PRODUCTION_ORDER",
                source_id=order.id,
                qty_in=order_qty,
                qty_out=0,
            )
        )
        _post_production_accounting_voucher(
            db,
            company_id=company_id,
            production_order=order,
            voucher_date=now.date(),
            amount=float(component_total_cost or 0.0),
        )

    if db.in_transaction():
        body()
        db.commit()
    else:
        with db.begin():
            body()

    db.refresh(order)
    order = (
        db.query(models.ProductionOrder)
        .options(joinedload(models.ProductionOrder.items))
        .filter(models.ProductionOrder.id == production_order_id)
        .first()
    )
    return _production_order_to_read(db, company_id=company_id, order=order)


@router.post("/production-orders/{production_order_id}/cancel", response_model=schemas.ProductionOrderRead)
def cancel_production_order(
    company_id: int,
    production_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = (
        db.query(models.ProductionOrder)
        .options(joinedload(models.ProductionOrder.items))
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status not in (models.ProductionOrderStatus.DRAFT, models.ProductionOrderStatus.RELEASED):
        raise HTTPException(status_code=400, detail="Only DRAFT or RELEASED orders can be cancelled")
    order.status = models.ProductionOrderStatus.CANCELLED
    db.commit()
    db.refresh(order)
    return _production_order_to_read(db, company_id=company_id, order=order)


@router.get("/production-orders/{production_order_id}", response_model=schemas.ProductionOrderRead)
def get_production_order(
    company_id: int,
    production_order_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = (
        db.query(models.ProductionOrder)
        .options(joinedload(models.ProductionOrder.items))
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    return _production_order_to_read(db, company_id=company_id, order=order)


@router.get("/manufacturing/dashboard")
def manufacturing_dashboard(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.dashboard", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    today = date.today()
    start_of_month = today.replace(day=1)
    today_production = db.query(func.coalesce(func.sum(models.ProductionEntry.produced_qty), 0)).filter(
        models.ProductionEntry.company_id == company_id,
        models.ProductionEntry.entry_date == today,
    ).scalar()
    monthly_output = db.query(func.coalesce(func.sum(models.ProductionEntry.produced_qty), 0)).filter(
        models.ProductionEntry.company_id == company_id,
        models.ProductionEntry.entry_date >= start_of_month,
    ).scalar()
    pending_statuses = [
        models.ProductionOrderStatus.DRAFT,
        models.ProductionOrderStatus.APPROVED,
        models.ProductionOrderStatus.RUNNING,
        models.ProductionOrderStatus.RELEASED,
    ]
    pending = db.query(func.count(models.ProductionOrder.id)).filter(
        models.ProductionOrder.company_id == company_id,
        models.ProductionOrder.status.in_(pending_statuses),
    ).scalar()
    scrap_total = db.query(func.coalesce(func.sum(models.ProductionScrap.qty), 0)).filter(
        models.ProductionScrap.company_id == company_id
    ).scalar()
    # Count pending orders where any component has insufficient stock
    material_shortage = 0
    try:
        pending_orders = db.query(models.ProductionOrder).filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.status.in_(pending_statuses),
        ).limit(50).all()
        for po in pending_orders:
            if po.warehouse_id is None:
                continue
            bom = _get_latest_bom_for_product(
                db, company_id=company_id, product_id=int(po.product_id), as_of=None
            )
            if bom is None or not bom.items:
                continue
            component_map = _explode_component_requirements(
                db,
                company_id=company_id,
                bom=bom,
                order_qty=float(po.quantity),
                expand_sub=False,
                bom_as_of=None,
                path=(),
            )
            for cid, req_qty in component_map.items():
                avail = _get_stock_on_hand(
                    db, company_id=company_id, warehouse_id=int(po.warehouse_id), item_id=cid
                )
                if req_qty > avail:
                    material_shortage += 1
                    break
    except Exception:
        material_shortage = 0
    return {
        "today_production": float(today_production or 0),
        "pending_orders": int(pending or 0),
        "wastage_qty": float(scrap_total or 0),
        "monthly_output": float(monthly_output or 0),
        "material_shortage": int(material_shortage),
    }


@router.get("/bom", response_model=list[schemas.BOMRead])
def list_bom(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.bom_master", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = (
        db.query(models.BOMMaster)
        .options(joinedload(models.BOMMaster.items))
        .filter(models.BOMMaster.company_id == company_id)
        .order_by(models.BOMMaster.id.desc())
        .all()
    )
    out: list[schemas.BOMRead] = []
    for row in rows:
        dto = schemas.BOMRead.model_validate(row)
        dto.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=row)
        out.append(dto)
    return out


@router.post("/bom/{bom_id}/duplicate", response_model=schemas.BOMRead)
def duplicate_bom(
    company_id: int,
    bom_id: int,
    _: None = Depends(require_menu_access("manufacturing.bom_master", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    source = _get_bom_by_id(db, company_id=company_id, bom_id=bom_id)
    if source is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    version = int(source.version or 0) + 1
    clone = models.BOMMaster(
        company_id=company_id,
        product_id=source.product_id,
        version=version,
        bom_code=f"{source.bom_code or 'BOM'}-V{version}",
        batch_size=source.batch_size,
        status=source.status,
        approval_status="DRAFT",
        department_id=source.department_id,
        project_id=source.project_id,
        segment_id=source.segment_id,
        effective_from=source.effective_from,
        effective_to=source.effective_to,
        labor_cost=source.labor_cost,
        machine_cost=source.machine_cost,
        electricity_cost=source.electricity_cost,
        packing_cost=source.packing_cost,
        overhead_cost=source.overhead_cost,
    )
    db.add(clone)
    db.flush()
    for item in source.items:
        db.add(models.BOMItem(
            bom_id=clone.id,
            component_product_id=item.component_product_id,
            quantity=item.quantity,
            unit=item.unit,
            wastage_percent=item.wastage_percent,
            remarks=item.remarks,
        ))
    db.commit()
    db.refresh(clone)
    payload = schemas.BOMRead.model_validate(clone)
    payload.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=clone)
    return payload


@router.post("/bom/{bom_id}/approve", response_model=schemas.BOMRead)
def approve_bom(
    company_id: int,
    bom_id: int,
    _: None = Depends(require_menu_access("manufacturing.bom_master", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    bom = _get_bom_by_id(db, company_id=company_id, bom_id=bom_id)
    if bom is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    bom.approval_status = "APPROVED"
    bom.approved_by = current_user.id
    bom.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(bom)
    payload = schemas.BOMRead.model_validate(bom)
    payload.estimated_cost = _get_bom_cost(db, company_id=company_id, bom=bom)
    return payload


@router.get("/production-orders", response_model=list[schemas.ProductionOrderRead])
def list_production_orders(
    company_id: int,
    q: str | None = Query(None, description="Search by order_no"),
    status: str | None = Query(None, description="Filter by status"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    _: None = Depends(require_menu_access("manufacturing.production_order", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    query = (
        db.query(models.ProductionOrder)
        .options(joinedload(models.ProductionOrder.items))
        .filter(models.ProductionOrder.company_id == company_id)
    )
    if q:
        query = query.filter(models.ProductionOrder.order_no.ilike(f"%{q.strip()}%"))
    if status:
        parsed = _parse_production_status(status)
        query = query.filter(models.ProductionOrder.status == parsed)
    if from_date:
        query = query.filter(func.coalesce(models.ProductionOrder.order_date, models.ProductionOrder.created_at.cast(Date)) >= from_date)
    if to_date:
        query = query.filter(func.coalesce(models.ProductionOrder.order_date, models.ProductionOrder.created_at.cast(Date)) <= to_date)
    rows = query.order_by(models.ProductionOrder.id.desc()).all()
    return [_production_order_to_read(db, company_id=company_id, order=r) for r in rows]


@router.post("/production-orders/{production_order_id}/approve", response_model=schemas.ProductionOrderRead)
def approve_production_order(
    company_id: int,
    production_order_id: int,
    _: None = Depends(require_menu_access("manufacturing.production_order", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = db.query(models.ProductionOrder).filter(
        models.ProductionOrder.company_id == company_id,
        models.ProductionOrder.id == production_order_id,
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status != models.ProductionOrderStatus.DRAFT:
        raise HTTPException(status_code=400, detail="Only DRAFT order can be approved")
    order.status = models.ProductionOrderStatus.APPROVED
    db.commit()
    db.refresh(order)
    return _production_order_to_read(db, company_id=company_id, order=order)


@router.post("/manufacturing/material-issue", response_model=schemas.ProductionIssueRead)
def create_material_issue(
    company_id: int,
    payload: schemas.ProductionIssueCreate,
    _: None = Depends(require_menu_access("manufacturing.material_issue", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = db.query(models.ProductionOrder).filter(
        models.ProductionOrder.company_id == company_id,
        models.ProductionOrder.id == payload.production_order_id,
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    warehouse = _resolve_warehouse(db, company_id=company_id, warehouse_id=payload.warehouse_id or order.warehouse_id)
    bom = _resolve_bom_for_production(db, company_id=company_id, product_id=int(order.product_id), bom_id=order.bom_id, bom_as_of=order.bom_as_of)
    component_map = _explode_component_requirements(
        db, company_id=company_id, bom=bom, order_qty=float(order.quantity), expand_sub=bool(order.expand_sub_assemblies), bom_as_of=order.bom_as_of, path=()
    )
    total, _ = _validate_component_stock(db, company_id=company_id, warehouse_id=int(warehouse.id), component_map=component_map)
    issue = models.ProductionIssue(
        company_id=company_id,
        issue_no=_next_prefixed_number(db, company_id=company_id, table="production_issue", column="issue_no", prefix="MI"),
        production_order_id=order.id,
        issue_date=payload.issue_date or date.today(),
        warehouse_id=warehouse.id,
        issued_by=current_user.id,
        notes=payload.notes,
        total_value=total,
        created_by=current_user.id,
        updated_by=current_user.id,
    )
    db.add(issue)
    wip = db.query(models.ProductionWIP).filter(
        models.ProductionWIP.company_id == company_id, models.ProductionWIP.production_order_id == order.id
    ).first()
    if wip is None:
        wip = models.ProductionWIP(company_id=company_id, production_order_id=order.id, current_stage="MATERIAL_ISSUED")
        db.add(wip)
    wip.issued_material_value = float(wip.issued_material_value or 0) + float(total or 0)
    wip.total_wip_cost = float(wip.issued_material_value or 0) + float(wip.labor_added or 0) + float(wip.overhead_added or 0)
    # Post Dr WIP / Cr Raw Material journal entry
    _post_material_issue_voucher(
        db,
        company_id=company_id,
        production_order=order,
        voucher_date=payload.issue_date or date.today(),
        amount=float(total or 0),
    )
    order.status = models.ProductionOrderStatus.RUNNING
    db.commit()
    db.refresh(issue)
    return schemas.ProductionIssueRead.model_validate(issue)


@router.get("/manufacturing/wip")
def list_wip(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.wip", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = db.query(models.ProductionWIP).filter(models.ProductionWIP.company_id == company_id).order_by(models.ProductionWIP.id.desc()).all()
    return [
        {
            "id": int(r.id),
            "production_order_id": int(r.production_order_id),
            "current_stage": r.current_stage,
            "issued_material_value": float(r.issued_material_value or 0),
            "labor_added": float(r.labor_added or 0),
            "overhead_added": float(r.overhead_added or 0),
            "total_wip_cost": float(r.total_wip_cost or 0),
            "updated_at": r.updated_at,
        }
        for r in rows
    ]


@router.post("/manufacturing/production-entry", response_model=schemas.ProductionEntryRead)
def create_production_entry(
    company_id: int,
    payload: schemas.ProductionEntryCreate,
    _: None = Depends(require_menu_access("manufacturing.production_entry", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    entry = models.ProductionEntry(
        company_id=company_id,
        production_order_id=payload.production_order_id,
        entry_date=payload.entry_date or date.today(),
        produced_qty=payload.produced_qty,
        rejected_qty=payload.rejected_qty,
        damaged_qty=payload.damaged_qty,
        extra_consumption=payload.extra_consumption,
        stage=payload.stage,
        notes=payload.notes,
        created_by=current_user.id,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return schemas.ProductionEntryRead.model_validate(entry)


@router.get("/manufacturing/production-entry", response_model=list[schemas.ProductionEntryRead])
def list_production_entry(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.production_entry", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = db.query(models.ProductionEntry).filter(models.ProductionEntry.company_id == company_id).order_by(models.ProductionEntry.id.desc()).all()
    return [schemas.ProductionEntryRead.model_validate(x) for x in rows]


@router.post("/manufacturing/finished-goods-receive", response_model=schemas.FinishedGoodsReceiveRead)
def receive_finished_goods(
    company_id: int,
    payload: schemas.FinishedGoodsReceiveCreate,
    _: None = Depends(require_menu_access("manufacturing.finished_goods_receive", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = db.query(models.ProductionOrder).filter(
        models.ProductionOrder.company_id == company_id, models.ProductionOrder.id == payload.production_order_id
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    component_cost = sum(float(x.consumed_qty or 0) * _resolve_component_unit_cost(db, company_id=company_id, product_id=int(x.product_id)) for x in order.items)
    qty = float(payload.received_qty or 0)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="received_qty must be greater than zero")
    unit_cost = component_cost / qty if qty else 0
    receive_date = payload.receive_date or date.today()
    fg = models.ProductionFinishedGoods(
        company_id=company_id,
        production_order_id=order.id,
        receive_date=receive_date,
        warehouse_id=payload.warehouse_id or order.warehouse_id,
        received_qty=qty,
        unit_cost=unit_cost,
        total_cost=component_cost,
        created_by=current_user.id,
    )
    db.add(fg)
    if order.voucher_id is None:
        _post_production_accounting_voucher(
            db,
            company_id=company_id,
            production_order=order,
            voucher_date=receive_date,
            amount=component_cost,
            department_id=payload.department_id,
            project_id=payload.project_id,
            segment_id=payload.segment_id,
        )
    db.flush()
    db.refresh(order)
    fg.voucher_id = order.voucher_id
    order.status = models.ProductionOrderStatus.COMPLETED
    db.commit()
    db.refresh(fg)
    return schemas.FinishedGoodsReceiveRead.model_validate(fg)


@router.get("/manufacturing/finished-goods-receive", response_model=list[schemas.FinishedGoodsReceiveRead])
def list_finished_goods_receive(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.finished_goods_receive", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = db.query(models.ProductionFinishedGoods).filter(
        models.ProductionFinishedGoods.company_id == company_id
    ).order_by(models.ProductionFinishedGoods.id.desc()).all()
    return [schemas.FinishedGoodsReceiveRead.model_validate(x) for x in rows]


@router.post("/manufacturing/scrap", response_model=schemas.ProductionScrapRead)
def create_scrap(
    company_id: int,
    payload: schemas.ProductionScrapCreate,
    _: None = Depends(require_menu_access("manufacturing.wastage_scrap", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rec = models.ProductionScrap(
        company_id=company_id,
        production_order_id=payload.production_order_id,
        scrap_type=payload.scrap_type,
        qty=payload.qty,
        reason=payload.reason,
        recoverable=payload.recoverable,
        saleable=payload.saleable,
        created_by=current_user.id,
    )
    db.add(rec)
    db.commit()
    db.refresh(rec)
    return schemas.ProductionScrapRead.model_validate(rec)


@router.get("/manufacturing/scrap", response_model=list[schemas.ProductionScrapRead])
def list_scrap(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.wastage_scrap", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = db.query(models.ProductionScrap).filter(models.ProductionScrap.company_id == company_id).order_by(models.ProductionScrap.id.desc()).all()
    return [schemas.ProductionScrapRead.model_validate(x) for x in rows]


@router.post("/manufacturing/costing", response_model=schemas.ProductionCostingRead)
def calculate_costing(
    company_id: int,
    payload: schemas.ProductionCostingCalc,
    _: None = Depends(require_menu_access("manufacturing.production_costing", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    order = db.query(models.ProductionOrder).options(joinedload(models.ProductionOrder.items)).filter(
        models.ProductionOrder.company_id == company_id, models.ProductionOrder.id == payload.production_order_id
    ).first()
    if order is None:
        raise HTTPException(status_code=404, detail="Production order not found")
    material_cost = sum(float(x.consumed_qty or 0) * _resolve_component_unit_cost(db, company_id=company_id, product_id=int(x.product_id)) for x in order.items)
    total = material_cost + payload.labor_cost + payload.machine_cost + payload.electricity_cost + payload.packing_cost + payload.overhead_cost
    qty = float(order.quantity or 0)
    cpu = total / qty if qty else 0
    variance = total - material_cost
    margin = ((float(payload.sales_value or 0) - total) / float(payload.sales_value or 1)) * 100 if float(payload.sales_value or 0) > 0 else 0
    row = db.query(models.ProductionCosting).filter(
        models.ProductionCosting.company_id == company_id, models.ProductionCosting.production_order_id == order.id
    ).first()
    if row is None:
        row = models.ProductionCosting(company_id=company_id, production_order_id=order.id, created_by=current_user.id)
        db.add(row)
    row.material_cost = material_cost
    row.labor_cost = payload.labor_cost
    row.machine_cost = payload.machine_cost
    row.electricity_cost = payload.electricity_cost
    row.packing_cost = payload.packing_cost
    row.overhead_cost = payload.overhead_cost
    row.total_batch_cost = total
    row.cost_per_unit = cpu
    row.variance_cost = variance
    row.profit_margin = margin
    db.commit()
    db.refresh(row)
    return schemas.ProductionCostingRead.model_validate(row)


@router.get("/manufacturing/costing", response_model=list[schemas.ProductionCostingRead])
def list_costing(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.production_costing", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = db.query(models.ProductionCosting).filter(
        models.ProductionCosting.company_id == company_id
    ).order_by(models.ProductionCosting.id.desc()).all()
    return [schemas.ProductionCostingRead.model_validate(x) for x in rows]


def _build_bom_product_profit(
    db: Session,
    *,
    company_id: int,
    orders: list,
    costing: list,
    item_map: dict,
    from_date,
    to_date,
) -> list[dict]:
    """Build a product-wise profit report comparing production cost vs sales revenue."""
    from collections import defaultdict

    # Index costing by production_order_id
    costing_by_order: dict[int, models.ProductionCosting] = {
        int(c.production_order_id): c for c in costing
    }

    # Aggregate per product_id
    product_cost: dict[int, float] = defaultdict(float)
    product_qty: dict[int, float] = defaultdict(float)

    for order in orders:
        pid = int(order.product_id)
        c = costing_by_order.get(int(order.id))
        if c:
            product_cost[pid] += float(c.total_batch_cost or 0)
        product_qty[pid] += float(order.quantity or 0)

    # Fetch sales revenue per item from SalesInvoiceLine filtered by date
    # Revenue = rate * quantity - discount  (net line value before tax)
    line_revenue = (
        models.SalesInvoiceLine.rate * models.SalesInvoiceLine.quantity
        - models.SalesInvoiceLine.discount
    )
    sales_q = (
        db.query(
            models.SalesInvoiceLine.item_id,
            func.sum(line_revenue).label("revenue"),
            func.sum(models.SalesInvoiceLine.quantity).label("sold_qty"),
        )
        .join(models.SalesInvoice, models.SalesInvoice.id == models.SalesInvoiceLine.invoice_id)
        .filter(models.SalesInvoice.company_id == company_id)
    )
    if from_date:
        sales_q = sales_q.filter(models.SalesInvoice.date >= from_date)
    if to_date:
        sales_q = sales_q.filter(models.SalesInvoice.date <= to_date)
    sales_q = sales_q.group_by(models.SalesInvoiceLine.item_id)

    revenue_map: dict[int, float] = {}
    sold_qty_map: dict[int, float] = {}
    for row in sales_q.all():
        revenue_map[int(row.item_id)] = float(row.revenue or 0)
        sold_qty_map[int(row.item_id)] = float(row.sold_qty or 0)

    result = []
    for pid in sorted({int(o.product_id) for o in orders}):
        total_cost = product_cost.get(pid, 0.0)
        total_revenue = revenue_map.get(pid, 0.0)
        produced = product_qty.get(pid, 0.0)
        sold = sold_qty_map.get(pid, 0.0)
        profit = total_revenue - total_cost
        margin_pct = round((profit / total_revenue * 100.0), 2) if total_revenue > 0 else 0.0
        result.append({
            "product_id": pid,
            "product_name": item_map.get(pid, f"Item #{pid}"),
            "produced_qty": produced,
            "sold_qty": sold,
            "total_production_cost": round(total_cost, 2),
            "total_sales_revenue": round(total_revenue, 2),
            "gross_profit": round(profit, 2),
            "margin_pct": margin_pct,
        })

    result.sort(key=lambda x: x["gross_profit"], reverse=True)
    return result


@router.get("/manufacturing/reports")
def manufacturing_reports(
    company_id: int,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    _: None = Depends(require_menu_access("manufacturing.reports", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    order_q = db.query(models.ProductionOrder).filter(models.ProductionOrder.company_id == company_id)
    if from_date:
        order_q = order_q.filter(func.coalesce(models.ProductionOrder.order_date, models.ProductionOrder.created_at.cast(Date)) >= from_date)
    if to_date:
        order_q = order_q.filter(func.coalesce(models.ProductionOrder.order_date, models.ProductionOrder.created_at.cast(Date)) <= to_date)
    orders = order_q.order_by(models.ProductionOrder.id.desc()).all()

    entries_q = db.query(models.ProductionEntry).filter(models.ProductionEntry.company_id == company_id)
    if from_date:
        entries_q = entries_q.filter(models.ProductionEntry.entry_date >= from_date)
    if to_date:
        entries_q = entries_q.filter(models.ProductionEntry.entry_date <= to_date)
    entries = entries_q.order_by(models.ProductionEntry.id.desc()).all()

    scrap_q = db.query(models.ProductionScrap).filter(models.ProductionScrap.company_id == company_id)
    if from_date:
        scrap_q = scrap_q.filter(models.ProductionScrap.created_at >= datetime.combine(from_date, time.min))
    if to_date:
        scrap_q = scrap_q.filter(models.ProductionScrap.created_at <= datetime.combine(to_date, time.max))
    scrap = scrap_q.order_by(models.ProductionScrap.id.desc()).all()

    costing_q = db.query(models.ProductionCosting).filter(models.ProductionCosting.company_id == company_id)
    costing = costing_q.order_by(models.ProductionCosting.id.desc()).all()

    item_ids = {int(x.product_id) for x in orders}
    item_map = {
        int(x.id): x.name
        for x in db.query(models.Item).filter(
            models.Item.company_id == company_id, models.Item.id.in_(list(item_ids) if item_ids else [0])
        ).all()
    }
    dept_map = {int(x.id): x.name for x in db.query(models.Department).filter(models.Department.company_id == company_id).all()}
    project_map = {int(x.id): x.name for x in db.query(models.Project).filter(models.Project.company_id == company_id).all()}
    segment_map = {int(x.id): x.name for x in db.query(models.Segment).filter(models.Segment.company_id == company_id).all()}
    order_map = {int(x.id): x for x in orders}
    user_ids = {int(x.created_by) for x in scrap if x.created_by}
    user_map = {
        int(x.id): (x.full_name or x.email or f"User #{x.id}")
        for x in db.query(models.User).filter(models.User.id.in_(list(user_ids) if user_ids else [0])).all()
    }

    total_output = sum(float(x.produced_qty or 0) for x in entries)
    total_scrap = sum(float(x.qty or 0) for x in scrap)
    wastage_percent = (total_scrap / total_output * 100.0) if total_output > 0 else 0.0
    pending = sum(1 for x in orders if x.status in (models.ProductionOrderStatus.DRAFT, models.ProductionOrderStatus.APPROVED, models.ProductionOrderStatus.RUNNING, models.ProductionOrderStatus.RELEASED))

    return {
        "kpis": {
            "today_production": float(
                db.query(func.coalesce(func.sum(models.ProductionEntry.produced_qty), 0))
                .filter(models.ProductionEntry.company_id == company_id, models.ProductionEntry.entry_date == date.today())
                .scalar()
                or 0
            ),
            "pending_orders": int(pending),
            "monthly_output": float(total_output),
            "material_shortage": 0,
            "wastage_percent": float(round(wastage_percent, 3)),
        },
        "production_register": [
            {
                "id": int(x.id),
                "order_no": x.order_no,
                "order_date": x.order_date,
                "product_id": int(x.product_id),
                "product_name": item_map.get(int(x.product_id), f"Item #{int(x.product_id)}"),
                "qty": float(x.quantity or 0),
                "department": dept_map.get(int(x.department_id), "") if x.department_id else "",
                "project": project_map.get(int(x.project_id), "") if x.project_id else "",
                "segment": segment_map.get(int(x.segment_id), "") if x.segment_id else "",
                "status": x.status.value if hasattr(x.status, "value") else str(x.status),
            }
            for x in orders
        ],
        "material_consumption": [
            {
                "production_order_id": int(x.production_order_id),
                "order_no": order_map.get(int(x.production_order_id)).order_no if order_map.get(int(x.production_order_id)) else None,
                "produced_qty": float(x.produced_qty or 0),
                "extra_consumption": float(x.extra_consumption or 0),
                "entry_date": x.entry_date,
            }
            for x in entries
        ],
        "wip_report": list_wip(company_id=company_id, db=db, current_user=current_user),
        "finished_goods_report": [
            {
                "production_order_id": int(x.production_order_id),
                "order_no": order_map.get(int(x.production_order_id)).order_no if order_map.get(int(x.production_order_id)) else None,
                "receive_date": x.receive_date,
                "received_qty": float(x.received_qty or 0),
                "total_cost": float(x.total_cost or 0),
            }
            for x in db.query(models.ProductionFinishedGoods).filter(models.ProductionFinishedGoods.company_id == company_id).all()
        ],
        "scrap_report": [
            {
                "id": int(x.id),
                "production_order_id": int(x.production_order_id) if x.production_order_id else None,
                "order_no": order_map.get(int(x.production_order_id)).order_no if x.production_order_id and order_map.get(int(x.production_order_id)) else None,
                "scrap_type": x.scrap_type,
                "qty": float(x.qty or 0),
                "recoverable": bool(x.recoverable),
                "saleable": bool(x.saleable),
                "created_by": user_map.get(int(x.created_by), "") if x.created_by else "",
            }
            for x in scrap
        ],
        "costing_report": [
            {
                "production_order_id": int(x.production_order_id),
                "order_no": order_map.get(int(x.production_order_id)).order_no if order_map.get(int(x.production_order_id)) else None,
                "product_name": item_map.get(int(order_map[int(x.production_order_id)].product_id), f"Item #{order_map[int(x.production_order_id)].product_id}") if order_map.get(int(x.production_order_id)) else "—",
                "total_batch_cost": float(x.total_batch_cost or 0),
                "cost_per_unit": float(x.cost_per_unit or 0),
                "profit_margin": float(x.profit_margin or 0),
            }
            for x in costing
        ],
        "bom_product_profit": _build_bom_product_profit(db, company_id=company_id, orders=orders, costing=costing, item_map=item_map, from_date=from_date, to_date=to_date),
    }


@router.get("/manufacturing/reports/export")
def export_manufacturing_report(
    company_id: int,
    report: str = Query("production_register"),
    format: str = Query("csv", pattern="^(csv|excel)$"),
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    _: None = Depends(require_menu_access("manufacturing.reports", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    payload = manufacturing_reports(
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        _=None,
        db=db,
        current_user=current_user,
    )
    rows = payload.get(report)
    if not isinstance(rows, list):
        raise HTTPException(status_code=400, detail="Unsupported report key")

    if not rows:
        csv_data = "No data\n"
    else:
        keys = list(rows[0].keys())
        lines = [",".join([f"\"{str(k).replace('\"', '\"\"')}\"" for k in keys])]
        for row in rows:
            vals = [f"\"{str(row.get(k, '')).replace('\"', '\"\"')}\"" for k in keys]
            lines.append(",".join(vals))
        csv_data = "\n".join(lines)

    if format == "csv":
        filename = f"manufacturing_{report}.csv"
        return Response(
            content=csv_data,
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}"},
        )

    from openpyxl import Workbook

    wb = Workbook()
    ws = wb.active
    ws.title = "Manufacturing Report"
    if rows:
        keys = list(rows[0].keys())
        ws.append(keys)
        for row in rows:
            ws.append([row.get(k) for k in keys])
    else:
        ws.append(["No data"])

    out = io.BytesIO()
    wb.save(out)
    out.seek(0)
    return StreamingResponse(
        out,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=manufacturing_{report}.xlsx"},
    )


@router.get("/manufacturing/material-issue", response_model=list[schemas.ProductionIssueRead])
def list_material_issues(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.material_issue", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = (
        db.query(models.ProductionIssue)
        .filter(models.ProductionIssue.company_id == company_id)
        .order_by(models.ProductionIssue.id.desc())
        .all()
    )
    return [schemas.ProductionIssueRead.model_validate(x) for x in rows]


@router.get("/manufacturing/settings", response_model=schemas.ManufacturingSettingsRead | None)
def get_manufacturing_settings(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.settings", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    row = db.query(models.ManufacturingSettings).filter(models.ManufacturingSettings.company_id == company_id).first()
    if row is None:
        return None
    return schemas.ManufacturingSettingsRead.model_validate(row)


@router.put("/manufacturing/settings", response_model=schemas.ManufacturingSettingsRead)
def upsert_manufacturing_settings(
    company_id: int,
    payload: schemas.ManufacturingSettingsUpsert,
    _: None = Depends(require_menu_access("manufacturing.settings", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    row = db.query(models.ManufacturingSettings).filter(models.ManufacturingSettings.company_id == company_id).first()
    if row is None:
        row = models.ManufacturingSettings(company_id=company_id, created_by=current_user.id, updated_by=current_user.id)
        db.add(row)
    row.default_wip_ledger_id = payload.default_wip_ledger_id
    row.default_fg_ledger_id = payload.default_fg_ledger_id
    row.default_rm_ledger_id = payload.default_rm_ledger_id
    row.default_warehouse_id = payload.default_warehouse_id
    row.costing_method = payload.costing_method
    row.approval_required = payload.approval_required
    row.ai_predictions_enabled = payload.ai_predictions_enabled
    row.updated_by = current_user.id
    db.commit()
    db.refresh(row)
    return schemas.ManufacturingSettingsRead.model_validate(row)


# ---------------------------------------------------------------------------
# AI / Analytics helpers
# ---------------------------------------------------------------------------

@router.get("/manufacturing/ai/analytics")
def manufacturing_ai_analytics(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.ai_documents", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return reorder alerts, wastage anomalies and product profitability."""
    _get_company(db, company_id, current_user)

    # ── 1. Reorder Alerts ────────────────────────────────────────────────────
    # Collect all component item IDs used in ANY active BOM for this company
    bom_item_rows = (
        db.query(models.BOMItem.component_product_id)
        .join(models.BOMMaster, models.BOMMaster.id == models.BOMItem.bom_id)
        .filter(models.BOMMaster.company_id == company_id)
        .distinct()
        .all()
    )
    component_ids = [int(r[0]) for r in bom_item_rows]

    reorder_alerts: list[dict] = []
    if component_ids:
        items_q = (
            db.query(models.Item)
            .filter(models.Item.company_id == company_id, models.Item.id.in_(component_ids))
            .all()
        )
        for item in items_q:
            # Aggregate stock across all warehouses
            total_stock_delta = (
                db.query(func.coalesce(func.sum(models.StockLedger.qty_delta), 0))
                .filter(
                    models.StockLedger.company_id == company_id,
                    models.StockLedger.item_id == item.id,
                    models.StockLedger.reversed_at.is_(None),
                )
                .scalar()
            )
            on_hand = float(item.opening_stock or 0) + float(total_stock_delta or 0)
            reorder_threshold = float(item.reorder_level or 0)

            # Monthly avg consumption from production orders (last 90 days)
            ninety_days_ago = date.today().replace(
                day=max(1, date.today().day - 90 % 31)
            )
            consumed_90d = (
                db.query(func.coalesce(func.sum(models.ProductionItem.consumed_qty), 0))
                .join(
                    models.ProductionOrder,
                    models.ProductionOrder.id == models.ProductionItem.production_order_id,
                )
                .filter(
                    models.ProductionOrder.company_id == company_id,
                    models.ProductionItem.product_id == item.id,
                )
                .scalar()
            )
            monthly_avg = float(consumed_90d or 0) / 3.0

            effective_threshold = max(reorder_threshold, monthly_avg * 2)

            if on_hand <= effective_threshold:
                reorder_alerts.append(
                    {
                        "item_id": int(item.id),
                        "item_name": item.name or f"Item #{item.id}",
                        "item_code": item.code,
                        "on_hand": round(on_hand, 3),
                        "reorder_level": round(reorder_threshold, 3),
                        "monthly_avg_consumption": round(monthly_avg, 3),
                        "suggested_reorder_qty": round(max(monthly_avg * 2 - on_hand, 0), 3),
                        "urgency": (
                            "CRITICAL" if on_hand <= 0
                            else "HIGH" if on_hand < monthly_avg
                            else "MEDIUM"
                        ),
                    }
                )
    reorder_alerts.sort(key=lambda x: (0 if x["urgency"] == "CRITICAL" else 1 if x["urgency"] == "HIGH" else 2))

    # ── 2. Wastage Anomalies ─────────────────────────────────────────────────
    wastage_anomalies: list[dict] = []
    scrap_by_order: dict[int, float] = {}
    for s in (
        db.query(models.ProductionScrap.production_order_id, models.ProductionScrap.qty)
        .filter(
            models.ProductionScrap.company_id == company_id,
            models.ProductionScrap.production_order_id.isnot(None),
        )
        .all()
    ):
        scrap_by_order[int(s[0])] = scrap_by_order.get(int(s[0]), 0.0) + float(s[1] or 0)

    orders_with_scrap = []
    if scrap_by_order:
        orders_with_scrap = (
            db.query(models.ProductionOrder)
            .options(joinedload(models.ProductionOrder.items))
            .filter(
                models.ProductionOrder.company_id == company_id,
                models.ProductionOrder.id.in_(list(scrap_by_order.keys())),
            )
            .all()
        )

    item_map_for_scrap: dict[int, str] = {}
    if orders_with_scrap:
        pid_set = {int(o.product_id) for o in orders_with_scrap}
        item_map_for_scrap = {
            int(x.id): (x.name or f"Item #{x.id}")
            for x in db.query(models.Item)
            .filter(models.Item.company_id == company_id, models.Item.id.in_(list(pid_set)))
            .all()
        }

    for order in orders_with_scrap:
        produced = float(order.quantity or 0)
        if produced <= 0:
            continue
        actual_scrap = scrap_by_order.get(int(order.id), 0.0)
        actual_pct = (actual_scrap / produced) * 100.0

        # Expected wastage from BOM
        bom = _get_bom_by_id(db, company_id=company_id, bom_id=int(order.bom_id)) if order.bom_id else None
        expected_pct = 0.0
        if bom and bom.items:
            total_qty = sum(float(x.quantity or 0) for x in bom.items)
            weighted_waste = sum(
                float(x.quantity or 0) * float(x.wastage_percent or 0) for x in bom.items
            )
            expected_pct = (weighted_waste / total_qty) if total_qty > 0 else 0.0

        if actual_pct > max(expected_pct * 1.5, expected_pct + 5.0):
            wastage_anomalies.append(
                {
                    "order_id": int(order.id),
                    "order_no": order.order_no,
                    "product_id": int(order.product_id),
                    "product_name": item_map_for_scrap.get(int(order.product_id), f"Item #{order.product_id}"),
                    "produced_qty": round(produced, 3),
                    "actual_scrap_qty": round(actual_scrap, 3),
                    "actual_wastage_pct": round(actual_pct, 2),
                    "expected_wastage_pct": round(expected_pct, 2),
                    "excess_pct": round(actual_pct - expected_pct, 2),
                }
            )
    wastage_anomalies.sort(key=lambda x: x["excess_pct"], reverse=True)

    # ── 3. Product Profitability ─────────────────────────────────────────────
    profitability: list[dict] = []
    costing_rows = (
        db.query(models.ProductionCosting)
        .filter(models.ProductionCosting.company_id == company_id)
        .all()
    )

    order_product_map: dict[int, int] = {}
    if costing_rows:
        order_ids = [int(r.production_order_id) for r in costing_rows]
        for row in (
            db.query(models.ProductionOrder.id, models.ProductionOrder.product_id)
            .filter(
                models.ProductionOrder.company_id == company_id,
                models.ProductionOrder.id.in_(order_ids),
            )
            .all()
        ):
            order_product_map[int(row[0])] = int(row[1])

    all_product_ids = set(order_product_map.values())
    item_name_map: dict[int, str] = {}
    if all_product_ids:
        item_name_map = {
            int(x.id): (x.name or f"Item #{x.id}")
            for x in db.query(models.Item)
            .filter(models.Item.company_id == company_id, models.Item.id.in_(list(all_product_ids)))
            .all()
        }

    # Average selling price from sales invoices
    avg_sale_price_map: dict[int, float] = {}
    if all_product_ids:
        for row in (
            db.query(
                models.SalesInvoiceLine.item_id,
                func.avg(models.SalesInvoiceLine.rate).label("avg_rate"),
            )
            .join(models.SalesInvoice, models.SalesInvoice.id == models.SalesInvoiceLine.invoice_id)
            .filter(
                models.SalesInvoice.company_id == company_id,
                models.SalesInvoiceLine.item_id.in_(list(all_product_ids)),
            )
            .group_by(models.SalesInvoiceLine.item_id)
            .all()
        ):
            avg_sale_price_map[int(row[0])] = float(row[1] or 0)

    # Group costing by product
    product_costs: dict[int, list[dict]] = defaultdict(list)
    for cr in costing_rows:
        pid = order_product_map.get(int(cr.production_order_id))
        if pid:
            product_costs[pid].append(
                {
                    "cpu": float(cr.cost_per_unit or 0),
                    "total": float(cr.total_batch_cost or 0),
                    "margin": float(cr.profit_margin or 0),
                }
            )

    for pid, cost_entries in product_costs.items():
        avg_cpu = sum(e["cpu"] for e in cost_entries) / len(cost_entries)
        avg_margin = sum(e["margin"] for e in cost_entries) / len(cost_entries)
        avg_sale = avg_sale_price_map.get(pid, 0.0)
        computed_margin = ((avg_sale - avg_cpu) / avg_sale * 100.0) if avg_sale > 0 else avg_margin
        profitability.append(
            {
                "product_id": pid,
                "product_name": item_name_map.get(pid, f"Item #{pid}"),
                "avg_cost_per_unit": round(avg_cpu, 4),
                "avg_selling_price": round(avg_sale, 4),
                "profit_margin_pct": round(computed_margin, 2),
                "production_runs": len(cost_entries),
                "recommendation": (
                    "INCREASE VOLUME" if computed_margin >= 30
                    else "REVIEW PRICING" if 10 <= computed_margin < 30
                    else "REVIEW COSTS"
                ),
            }
        )
    profitability.sort(key=lambda x: x["profit_margin_pct"], reverse=True)

    return {
        "reorder_alerts": reorder_alerts,
        "wastage_anomalies": wastage_anomalies,
        "product_profitability": profitability,
    }


# ---------------------------------------------------------------------------
# Manufacturing role preset assignment
# ---------------------------------------------------------------------------

_MFG_ROLE_PRESETS: dict[str, dict[str, str]] = {
    "factory_manager": {
        "manufacturing.dashboard": "full",
        "manufacturing.bom_master": "full",
        "manufacturing.production_order": "full",
        "manufacturing.material_issue": "full",
        "manufacturing.wip": "full",
        "manufacturing.production_entry": "full",
        "manufacturing.finished_goods_receive": "full",
        "manufacturing.wastage_scrap": "full",
        "manufacturing.production_costing": "update",
        "manufacturing.reports": "read",
        "manufacturing.settings": "update",
        "manufacturing.ai_documents": "update",
    },
    "storekeeper": {
        "manufacturing.dashboard": "read",
        "manufacturing.bom_master": "read",
        "manufacturing.production_order": "read",
        "manufacturing.material_issue": "full",
        "manufacturing.wip": "read",
        "manufacturing.production_entry": "update",
        "manufacturing.finished_goods_receive": "full",
        "manufacturing.wastage_scrap": "full",
        "manufacturing.production_costing": "read",
        "manufacturing.reports": "read",
        "manufacturing.settings": "read",
        "manufacturing.ai_documents": "read",
    },
    "accountant": {
        "manufacturing.dashboard": "read",
        "manufacturing.bom_master": "read",
        "manufacturing.production_order": "read",
        "manufacturing.material_issue": "read",
        "manufacturing.wip": "read",
        "manufacturing.production_entry": "read",
        "manufacturing.finished_goods_receive": "read",
        "manufacturing.wastage_scrap": "read",
        "manufacturing.production_costing": "full",
        "manufacturing.reports": "full",
        "manufacturing.settings": "read",
        "manufacturing.ai_documents": "read",
    },
    "viewer": {
        "manufacturing.dashboard": "read",
        "manufacturing.bom_master": "read",
        "manufacturing.production_order": "read",
        "manufacturing.material_issue": "read",
        "manufacturing.wip": "read",
        "manufacturing.production_entry": "read",
        "manufacturing.finished_goods_receive": "read",
        "manufacturing.wastage_scrap": "read",
        "manufacturing.production_costing": "read",
        "manufacturing.reports": "read",
        "manufacturing.settings": "deny",
        "manufacturing.ai_documents": "read",
    },
}


@router.get("/manufacturing/roles/presets")
def list_manufacturing_role_presets(
    company_id: int,
    _: None = Depends(require_menu_access("manufacturing.settings", "read")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    return {
        "presets": list(_MFG_ROLE_PRESETS.keys()),
        "details": _MFG_ROLE_PRESETS,
    }


@router.post("/manufacturing/roles/assign")
def assign_manufacturing_role(
    company_id: int,
    payload: schemas.MfgRoleAssign,
    _: None = Depends(require_menu_access("manufacturing.settings", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Assign a manufacturing role preset to a user by upserting their menu access rows."""
    company = _get_company(db, company_id, current_user)
    role_key = payload.role_name.lower().replace(" ", "_")
    
    if payload.custom_permissions:
        preset = payload.custom_permissions
    else:
        preset = _MFG_ROLE_PRESETS.get(role_key)
        if preset is None:
            raise HTTPException(
                status_code=400,
                detail=f"Unknown role '{payload.role_name}'. Available: {list(_MFG_ROLE_PRESETS.keys())}",
            )
            
    target_user = db.query(models.User).filter(models.User.id == payload.user_id).first()
    if target_user is None:
        raise HTTPException(status_code=404, detail="User not found")

    level_map = {
        "deny": models.MenuAccessLevel.deny,
        "read": models.MenuAccessLevel.read,
        "update": models.MenuAccessLevel.update,
        "full": models.MenuAccessLevel.full,
    }

    applied: list[str] = []
    for menu_code, level_str in preset.items():
        menu = db.query(models.Menu).filter(models.Menu.code == menu_code).first()
        if menu is None:
            continue
        access_level = level_map.get(level_str, models.MenuAccessLevel.read)
        existing = (
            db.query(models.UserMenuAccess)
            .filter(
                models.UserMenuAccess.user_id == payload.user_id,
                models.UserMenuAccess.menu_id == menu.id,
                models.UserMenuAccess.company_id == company_id,
            )
            .first()
        )
        if existing:
            existing.access_level = access_level
        else:
            db.add(
                models.UserMenuAccess(
                    user_id=payload.user_id,
                    tenant_id=company.tenant_id,
                    company_id=company_id,
                    menu_id=menu.id,
                    access_level=access_level,
                )
            )
        applied.append(menu_code)

    db.commit()
    return {
        "status": "success",
        "role": payload.role_name,
        "user_id": payload.user_id,
        "menus_configured": len(applied),
        "applied": applied,
    }


@router.put("/production-orders/{production_order_id}", response_model=schemas.ProductionOrderRead)
def update_production_order(
    company_id: int,
    production_order_id: int,
    data: schemas.ProductionOrderUpdate,
    _: None = Depends(require_menu_access("manufacturing.production_order", "write")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = (
        db.query(models.ProductionOrder)
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    locked = {models.ProductionOrderStatus.COMPLETED, models.ProductionOrderStatus.CANCELLED}
    if order.status in locked:
        raise HTTPException(status_code=400, detail="Cannot update completed or cancelled orders")

    update_data = data.dict(exclude_unset=True)

    # Convert status string → enum so SQLAlchemy doesn't send a raw string
    # to the native DB enum column (prevents InvalidTextRepresentation errors).
    if "status" in update_data and update_data["status"] is not None:
        try:
            update_data["status"] = models.ProductionOrderStatus(update_data["status"])
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid status value: {update_data['status']}")

    for k, v in update_data.items():
        setattr(order, k, v)

    db.commit()
    db.refresh(order)
    return order

@router.delete("/production-orders/{production_order_id}", status_code=204)
def delete_production_order(
    company_id: int,
    production_order_id: int,
    _: None = Depends(require_menu_access("manufacturing.production_order", "delete")),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    order = (
        db.query(models.ProductionOrder)
        .filter(
            models.ProductionOrder.company_id == company_id,
            models.ProductionOrder.id == production_order_id,
        )
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Production order not found")
    if order.status not in ("DRAFT",):
        raise HTTPException(status_code=400, detail="Only DRAFT orders can be deleted")
        
    # Delete related ProductionItems first (if they exist)
    db.query(models.ProductionItem).filter(models.ProductionItem.production_order_id == order.id).delete()
    
    db.delete(order)
    db.commit()
    return None
