from datetime import date, datetime, timedelta
import nepali_datetime
from contextlib import nullcontext
from itertools import count, groupby

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, case, or_, and_, extract, desc, text
from sqlalchemy.orm import Session, joinedload, selectinload, aliased, contains_eager

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..final_accounts_service import compute_profit_and_loss, compute_trading_account, _stock_purchases_value, _inventory_value_as_of
from ..stock_service import StockValuationService
from ..dependencies import get_company_secure
import logging as _logging

_logger = _logging.getLogger(__name__)

router = APIRouter(prefix="/companies/{company_id}/reports", tags=["reports"])


public_router = APIRouter(prefix="/reports", tags=["reports"])


def _ensure_party_group(db: Session, *, company_id: int, group_name: str, group_type: models.LedgerGroupType) -> models.LedgerGroup:
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


@public_router.get("/trading-account")
def trading_account_public(
    company_id: int,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tx = db.begin() if not db.in_transaction() else nullcontext()
    with tx:
        company = _get_company(db, company_id, current_user)
        result = compute_trading_account(
            db,
            tenant_id=int(company.tenant_id),
            company_id=company_id,
            from_date=from_date,
            to_date=to_date,
            department_id=department_id,
            project_id=project_id,
        )

    return {
        "type": "TRADING",
        "period": {"from": from_date, "to": to_date},
        "debit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.debit],
        "credit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.credit],
        "balancing_entry": {
            "label": result.balancing_entry.label,
            "side": result.balancing_entry.side,
            "amount": result.balancing_entry.amount,
        },
        "totals": {"debit_total": result.debit_total, "credit_total": result.credit_total},
    }


@public_router.get("/profit-loss")
def profit_loss_public(
    company_id: int,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tx = db.begin() if not db.in_transaction() else nullcontext()
    with tx:
        company = _get_company(db, company_id, current_user)
        result = compute_profit_and_loss(
            db,
            tenant_id=int(company.tenant_id),
            company_id=company_id,
            from_date=from_date,
            to_date=to_date,
            department_id=department_id,
            project_id=project_id,
        )

    return {
        "type": "PROFIT_LOSS",
        "period": {"from": from_date, "to": to_date},
        "debit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.debit],
        "credit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.credit],
        "balancing_entry": {
            "label": result.balancing_entry.label,
            "side": result.balancing_entry.side,
            "amount": result.balancing_entry.amount,
        },
        "totals": {"debit_total": result.debit_total, "credit_total": result.credit_total},
    }


@public_router.get("/final-accounts")
def final_accounts_public(
    company_id: int,
    from_date: date = Query(..., alias="from"),
    to_date: date = Query(..., alias="to"),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tx = db.begin() if not db.in_transaction() else nullcontext()
    with tx:
        company = _get_company(db, company_id, current_user)

        trading = compute_trading_account(
            db,
            tenant_id=int(company.tenant_id),
            company_id=company_id,
            from_date=from_date,
            to_date=to_date,
            department_id=department_id,
            project_id=project_id,
            segment_id=segment_id,
            employee_id=employee_id,
        )

        pl = compute_profit_and_loss(
            db,
            tenant_id=int(company.tenant_id),
            company_id=company_id,
            from_date=from_date,
            to_date=to_date,
            department_id=department_id,
            project_id=project_id,
            segment_id=segment_id,
            employee_id=employee_id,
        )

    def _shape(res):
        # Prepare balancing entry object
        be_obj = {
            "label": res.balancing_entry.label,
            "amount": res.balancing_entry.amount,
        }

        return {
            "from_date": res.from_date,
            "to_date": res.to_date,
            "debit": {
                "rows": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in res.debit],
                "total": res.debit_total,
                "balancing_entry": be_obj if res.balancing_entry.side == "DEBIT" else None,
            },
            "credit": {
                "rows": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in res.credit],
                "total": res.credit_total,
                "balancing_entry": be_obj if res.balancing_entry.side == "CREDIT" else None,
            },
        }

    return {
        "period": {"from": from_date, "to": to_date},
        "trading": _shape(trading),
        "profit_loss": _shape(pl),
    }


@public_router.get("/employee-cost", response_model=schemas.EmployeeCostReport)
def get_employee_cost_report(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    employee_id: int | None = Query(None),
    ledger_id: int | None = Query(None),
    employee_type_id: int | None = Query(None),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    group_by: str | None = Query("TRANSACTION"), # TRANSACTION, LEDGER, MONTH
    calendar: str | None = Query("AD"), # AD, BS
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    # Base query for VoucherLines
    query = db.query(models.VoucherLine).join(models.Voucher)

    # Filter by date and company
    query = query.filter(
        models.Voucher.company_id == company_id,
        models.Voucher.voucher_date >= from_date,
        models.Voucher.voucher_date <= to_date
    )

    # Filter for lines related to employees
    if employee_id:
        query = query.filter(
            or_(
                models.VoucherLine.employee_id == employee_id,
                models.Voucher.employee_id == employee_id
            )
        )
    else:
        query = query.filter(
            or_(
                models.VoucherLine.employee_id.isnot(None),
                models.Voucher.employee_id.isnot(None)
            )
        )

    # Optional filters
    if ledger_id:
        query = query.filter(models.VoucherLine.ledger_id == ledger_id)
    if department_id:
        query = query.filter(models.VoucherLine.department_id == department_id)
    if project_id:
        query = query.filter(models.VoucherLine.project_id == project_id)
    if segment_id:
        query = query.filter(models.VoucherLine.segment_id == segment_id)

    # Execute query with necessary loads
    print(f"DEBUG: get_employee_cost_report - ledger_id={ledger_id}, employee_id={employee_id}, date range: {from_date} to {to_date}")
    
    lines = (
        query.options(
            joinedload(models.VoucherLine.employee),
            joinedload(models.VoucherLine.ledger),
            joinedload(models.VoucherLine.voucher).joinedload(models.Voucher.employee)
        )
        .order_by(models.Voucher.voucher_date, models.Voucher.id)
        .all()
    )
    
    print(f"DEBUG: Found {len(lines)} lines before grouping")
    if len(lines) > 0:
        ledger_ids = [l.ledger_id for l in lines]
        print(f"DEBUG: Ledger IDs in results: {set(ledger_ids)}")

    rows = []
    total_debit = 0.0
    total_credit = 0.0

    # Helper to get the effective employee from a line
    def get_effective_emp(line):
        if line.employee:
            return line.employee
        if line.voucher and line.voucher.employee:
            return line.voucher.employee
        return None

    if group_by == "LEDGER":
        grouped_data = {}
        for line in lines:
            emp = get_effective_emp(line)
            # If we are filtering by employee_id, ensure this line belongs to them
            if employee_id and emp and emp.id != employee_id:
                continue
            if employee_type_id and emp and emp.employee_type_id != employee_type_id:
                continue
            
            emp_id = emp.id if emp else None
            emp_name = emp.full_name if emp else "N/A"
            
            key = (emp_id, line.ledger_id)
            if key not in grouped_data:
                grouped_data[key] = {
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "ledger_id": line.ledger_id,
                    "ledger_name": line.ledger.name if line.ledger else "N/A",
                    "debit": 0.0,
                    "credit": 0.0,
                }
            grouped_data[key]["debit"] += float(line.debit)
            grouped_data[key]["credit"] += float(line.credit)
            total_debit += float(line.debit)
            total_credit += float(line.credit)
        
        for val in grouped_data.values():
            rows.append(schemas.EmployeeCostReportRow(**val))

    elif group_by == "MONTH":
        grouped_data = {}
        for line in lines:
            emp = get_effective_emp(line)
            if employee_id and emp and emp.id != employee_id:
                continue
            if employee_type_id and emp and emp.employee_type_id != employee_type_id:
                continue

            d = line.voucher.voucher_date
            emp_id = emp.id if emp else None
            emp_name = emp.full_name if emp else "N/A"
            
            if calendar == "BS":
                nd = nepali_datetime.date.from_datetime_date(d)
                y = nd.year
                m = nd.month
                m_name = nd.strftime("%B")
            else:
                y = d.year
                m = d.month
                m_name = d.strftime("%B")

            key = (y, m, emp_id)
            if key not in grouped_data:
                grouped_data[key] = {
                    "employee_id": emp_id,
                    "employee_name": emp_name,
                    "year": y,
                    "month_name": m_name,
                    "debit": 0.0,
                    "credit": 0.0,
                }
            grouped_data[key]["debit"] += float(line.debit)
            grouped_data[key]["credit"] += float(line.credit)
            total_debit += float(line.debit)
            total_credit += float(line.credit)
        
        sorted_keys = sorted(grouped_data.keys(), key=lambda x: (x[0], x[1], grouped_data[x]["employee_name"]))
        for key in sorted_keys:
            rows.append(schemas.EmployeeCostReportRow(**grouped_data[key]))

    else:
        # Transaction Wise (Default)
        for line in lines:
            emp = get_effective_emp(line)
            if employee_id and emp and emp.id != employee_id:
                continue
            if employee_type_id and emp and emp.employee_type_id != employee_type_id:
                continue

            total_debit += float(line.debit)
            total_credit += float(line.credit)
            rows.append(
                schemas.EmployeeCostReportRow(
                    employee_id=emp.id if emp else None,
                    employee_name=emp.full_name if emp else "N/A",
                    ledger_id=line.ledger_id,
                    ledger_name=line.ledger.name if line.ledger else "N/A",
                    date=line.voucher.voucher_date,
                    voucher_id=line.voucher_id,
                    voucher_number=line.voucher.voucher_number,
                    debit=float(line.debit),
                    credit=float(line.credit),
                    remarks=line.remarks,
                )
            )

    return schemas.EmployeeCostReport(
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        rows=rows,
        total_debit=total_debit,
        total_credit=total_credit,
    )


@router.get("/trading-account")
def trading_account(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    result = compute_trading_account(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    return {
        "type": "TRADING",
        "period": {"from": from_date, "to": to_date},
        "debit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.debit],
        "credit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.credit],
        "balancing_entry": {
            "label": result.balancing_entry.label,
            "side": result.balancing_entry.side,
            "amount": result.balancing_entry.amount,
        },
        "totals": {"debit_total": result.debit_total, "credit_total": result.credit_total},
    }


@router.get("/profit-loss")
def profit_loss(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    result = compute_profit_and_loss(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    return {
        "type": "PROFIT_LOSS",
        "period": {"from": from_date, "to": to_date},
        "debit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.debit],
        "credit": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in result.credit],
        "balancing_entry": {
            "label": result.balancing_entry.label,
            "side": result.balancing_entry.side,
            "amount": result.balancing_entry.amount,
        },
        "totals": {"debit_total": result.debit_total, "credit_total": result.credit_total},
    }


@router.get("/final-accounts")
def final_accounts(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    trading = compute_trading_account(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    pl = compute_profit_and_loss(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    def _shape(res):
        # Prepare balancing entry object
        be_obj = {
            "label": res.balancing_entry.label,
            "amount": res.balancing_entry.amount,
        }

        return {
            "from_date": res.from_date,
            "to_date": res.to_date,
            "debit": {
                "rows": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in res.debit],
                "total": res.debit_total,
                "balancing_entry": be_obj if res.balancing_entry.side == "DEBIT" else None,
            },
            "credit": {
                "rows": [{"label": l.label, "amount": l.amount, "ledger_id": l.ledger_id} for l in res.credit],
                "total": res.credit_total,
                "balancing_entry": be_obj if res.balancing_entry.side == "CREDIT" else None,
            },
        }

    return {
        "period": {"from": from_date, "to": to_date},
        "trading": _shape(trading),
        "profit_loss": _shape(pl),
    }


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


def _inventory_value_as_of(
    db: Session,
    *,
    company_id: int,
    as_on_date: date,
    ignore_fixed_assets: bool = True,
) -> float:
    """Compute total inventory value as of a given date.

    This is used by Balance Sheet (Stock in Hand) and Profit & Loss (opening/
    closing stock). It must reflect reversals and new transactions.

    Valuation rules:
    - FIFO: build layers from opening stock + purchase-related StockLedger rows
      and consume on any stock-out movements.
    - AVERAGE: compute weighted-average cost basis from opening value +
      purchase-related StockLedger rows (PURCHASE_BILL/PURCHASE_RETURN) and
      apply it to qty on hand.
    """
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        _logger.debug("Company %s not found", company_id)
        return 0.0

    _logger.debug("_inventory_value_as_of company=%s date=%s", company_id, as_on_date)
    svc = StockValuationService(db)
    by_product = svc.get_valuation_by_product(company=company, as_of=as_on_date, ignore_fixed_assets=ignore_fixed_assets)
    val = float(sum(v.value for v in by_product.values()))
    _logger.debug("_inventory_value_as_of result=%s", val)
    return val


@router.get("/inventory-valuation", response_model=schemas.InventoryValuationReport)
def inventory_valuation(
    company_id: int,
    as_on_date: date = Query(...),
    include_zero: bool = Query(False),
    ignore_fixed_assets: bool = Query(True),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    company = (
        db.query(models.Company)
        .filter(models.Company.id == company_id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    Item = models.Item
    StockLedger = models.StockLedger

    items_query = (
        db.query(
            Item.id,
            Item.name,
            Item.opening_stock,
            Item.opening_rate,
            Item.opening_value,
            Item.default_purchase_rate,
            Item.default_sales_rate,
        )
        .filter(Item.company_id == company_id)
    )
    if ignore_fixed_assets:
        items_query = items_query.filter(Item.is_fixed_asset.isnot(True))
    
    items = items_query.all()
    item_ids = [it.id for it in items]

    if not item_ids:
         return schemas.InventoryValuationReport(
            as_on_date=as_on_date,
            rows=[],
            total_value=0.0,
        )

    movement_rows = (
        db.query(
            StockLedger.item_id.label("item_id"),
            func.coalesce(func.sum(StockLedger.qty_delta), 0).label("movement_delta"),
        )
        .filter(
            StockLedger.company_id == company_id,
            StockLedger.item_id.in_(item_ids),
            StockLedger.reversed_at.is_(None),
            func.date(StockLedger.posted_at) <= as_on_date,
        )
        .group_by(StockLedger.item_id)
        .all()
    )
    movement_map: dict[int, float] = {r.item_id: float(r.movement_delta or 0) for r in movement_rows}

    valuation_method = None
    if getattr(company, "tenant", None) is not None:
        valuation_method = getattr(company.tenant, "inventory_valuation_method", None)
    if valuation_method is None:
        valuation_method = getattr(company, "inventory_valuation_method", None)

    # For weighted-average report rows we need a per-item cost basis.
    cost_map: dict[int, tuple[float, float]] = {}
    if valuation_method != models.InventoryValuationMethod.FIFO:
        cost_rows = (
            db.query(
                StockLedger.item_id.label("item_id"),
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
            )
            .filter(
                StockLedger.company_id == company_id,
                StockLedger.reversed_at.is_(None),
                func.date(StockLedger.posted_at) <= as_on_date,
            )
            .group_by(StockLedger.item_id)
            .all()
        )
        cost_map = {
            int(r.item_id): (float(r.cost_qty_delta or 0), float(r.cost_value_delta or 0))
            for r in cost_rows
        }

    # For FIFO report rows, we compute per-item value by summing remaining layers.
    fifo_layers_by_item: dict[int, list[list[float]]] = {}
    if valuation_method == models.InventoryValuationMethod.FIFO:
        ledger_rows = (
            db.query(
                StockLedger.item_id,
                StockLedger.qty_delta,
                StockLedger.unit_cost,
                StockLedger.posted_at,
                StockLedger.id,
            )
            .filter(
                StockLedger.company_id == company_id,
                StockLedger.item_id.in_(item_ids),
                StockLedger.reversed_at.is_(None),
                func.date(StockLedger.posted_at) <= as_on_date,
            )
            .order_by(StockLedger.posted_at.asc(), StockLedger.id.asc())
            .all()
        )

        opening_by_item: dict[int, tuple[float, float]] = {}
        for it in items:
            opening_qty = float(it.opening_stock or 0)
            opening_value = it.opening_value
            if opening_value is None:
                if it.opening_rate is not None:
                    opening_value = opening_qty * float(it.opening_rate)
                elif it.default_purchase_rate is not None:
                    opening_value = opening_qty * float(it.default_purchase_rate)
                elif it.default_sales_rate is not None:
                    opening_value = opening_qty * float(it.default_sales_rate)
                else:
                    opening_value = 0.0
            opening_cost = (float(opening_value) / opening_qty) if opening_qty else 0.0
            opening_by_item[int(it.id)] = (opening_qty, opening_cost)

        for item_id, (oq, oc) in opening_by_item.items():
            if oq > 0:
                fifo_layers_by_item[item_id] = [[oq, oc]]
            else:
                fifo_layers_by_item[item_id] = []

        for r in ledger_rows:
            item_id = int(r.item_id)
            fifo_layers_by_item.setdefault(item_id, [])
            qty_delta = float(r.qty_delta or 0)
            if qty_delta > 0:
                fifo_layers_by_item[item_id].append([qty_delta, float(r.unit_cost) if r.unit_cost is not None else 0.0])
            elif qty_delta < 0:
                remaining = -qty_delta
                layers = fifo_layers_by_item[item_id]
                while remaining > 1e-9 and layers:
                    layer_qty, layer_cost = layers[0]
                    take = layer_qty if layer_qty <= remaining else remaining
                    layer_qty -= take
                    remaining -= take
                    if layer_qty <= 1e-9:
                        layers.pop(0)
                    else:
                        layers[0][0] = layer_qty

    rows: list[schemas.InventoryValuationRow] = []
    total_value = 0.0

    for it in items:
        opening = float(it.opening_stock or 0)
        movement_delta = float(movement_map.get(it.id, 0.0))
        qty_on_hand = opening + movement_delta
        if (not include_zero) and qty_on_hand == 0:
            continue

        if valuation_method == models.InventoryValuationMethod.FIFO:
            layers = fifo_layers_by_item.get(it.id, [])
            closing_value = float(sum(q * c for q, c in layers))
            rate = (closing_value / qty_on_hand) if qty_on_hand else 0.0
        else:
            opening_value = it.opening_value
            if opening_value is None:
                if it.opening_rate is not None:
                    opening_value = opening * float(it.opening_rate)
                elif it.default_purchase_rate is not None:
                    opening_value = opening * float(it.default_purchase_rate)
                elif it.default_sales_rate is not None:
                    opening_value = opening * float(it.default_sales_rate)
                else:
                    opening = 0.0
                    opening_value = 0.0

            cost_qty_delta, cost_value_delta = cost_map.get(it.id, (0.0, 0.0))
            denom_qty = opening + float(cost_qty_delta)
            rate = ((float(opening_value or 0) + float(cost_value_delta)) / denom_qty) if denom_qty else 0.0
            closing_value = qty_on_hand * rate

        total_value += closing_value

        rows.append(
            schemas.InventoryValuationRow(
                item_id=it.id,
                item_name=it.name,
                opening_stock=opening,
                movement_delta=movement_delta,
                quantity_on_hand=qty_on_hand,
                rate=rate,
                value=closing_value,
            )
        )

    rows.sort(key=lambda r: abs(r.value), reverse=True)

    return schemas.InventoryValuationReport(
        as_on_date=as_on_date,
        rows=rows,
        total_value=float(total_value),
    )




def _get_ledger_report(
    db: Session,
    *,
    company_id: int,
    ledger_id: int,
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> schemas.LedgerReport:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    ledger = (
        db.query(models.Ledger)
        .filter(models.Ledger.id == ledger_id, models.Ledger.company_id == company_id)
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=404, detail="Ledger not found")

    opening_q = (
        db.query(
            func.coalesce(func.sum(models.VoucherLine.debit), 0),
            func.coalesce(func.sum(models.VoucherLine.credit), 0),
        )
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date < from_date,
        )
    )
    if department_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.project_id == project_id)
    if segment_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.segment_id == segment_id)
    if employee_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.employee_id == employee_id)
    
    opening_debits, opening_credits = opening_q.one()

    if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT:
        opening = float(ledger.opening_balance) + float(opening_debits) - float(opening_credits)
    else:
        opening = float(ledger.opening_balance) - float(opening_debits) + float(opening_credits)

    opening_type = (
        models.OpeningBalanceType.DEBIT if opening >= 0 else models.OpeningBalanceType.CREDIT
    )
    opening_abs = abs(opening)

    lines_q = (
        db.query(models.VoucherLine, models.Voucher)
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
        )
    )
    if department_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.project_id == project_id)
    if segment_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.segment_id == segment_id)
    if employee_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.employee_id == employee_id)

    lines = (
        lines_q.options(
            joinedload(models.VoucherLine.department),
            joinedload(models.VoucherLine.project),
            joinedload(models.VoucherLine.segment),
            joinedload(models.VoucherLine.employee),
            selectinload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.sales_invoice).selectinload(models.SalesInvoice.lines).joinedload(models.SalesInvoiceLine.item),
            joinedload(models.Voucher.purchase_bill).selectinload(models.PurchaseBill.lines).joinedload(models.PurchaseBillLine.item),
            joinedload(models.Voucher.sales_return).selectinload(models.SalesReturn.lines).joinedload(models.SalesReturnLine.item),
            joinedload(models.Voucher.purchase_return).selectinload(models.PurchaseReturn.lines).joinedload(models.PurchaseReturnLine.item),
        )
        .order_by(models.Voucher.voucher_date, models.Voucher.id)
        .all()
    )

    # Collect all needed ledger IDs for reliable name fetching
    all_ledger_ids = set()
    for _, voucher in lines:
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                all_ledger_ids.add(vl.ledger_id)

    # Bulk fetch names to ensure we have them even if lazy loading fails
    ledger_name_map = {ledger_id: ledger.name}
    if all_ledger_ids:
        rows = (
            db.query(models.Ledger.id, models.Ledger.name)
            .filter(models.Ledger.id.in_(list(all_ledger_ids)))
            .all()
        )
        ledger_name_map = {r.id: r.name for r in rows}

    transactions: list[schemas.LedgerTransaction] = []
    balance = opening

    # Group lines by voucher so that multiple entries for the same ledger in one voucher
    # appear as a single row in the ledger report.
    for voucher_id, group in groupby(lines, key=lambda x: x[1].id):
        group_list = list(group)
        # All lines in group share the same voucher
        _, voucher = group_list[0]
        
        # Aggregate debit/credit and remarks across all matching lines in this voucher
        total_debit = sum(float(line.debit) for line, _ in group_list)
        total_credit = sum(float(line.credit) for line, _ in group_list)
        combined_remarks = ", ".join(filter(None, [line.remarks for line, _ in group_list]))

        # Aggregate cost center names
        depts = ", ".join(sorted(list(set(filter(None, [line.department.name if line.department else None for line, _ in group_list])))))
        projs = ", ".join(sorted(list(set(filter(None, [line.project.name if line.project else None for line, _ in group_list])))))
        segs = ", ".join(sorted(list(set(filter(None, [line.segment.name if line.segment else None for line, _ in group_list])))))
        emps = ", ".join(sorted(list(set(filter(None, [line.employee.full_name if line.employee else None for line, _ in group_list])))))
        b_dates = [voucher.bill_date] if voucher.bill_date else []

        balance += total_debit - total_credit
        balance_type = (
            models.OpeningBalanceType.DEBIT if balance >= 0 else models.OpeningBalanceType.CREDIT
        )

        # Determine the "other" ledger involved in this transaction
        related_ledger_names = set()
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                # Use the pre-fetched map, fallback to relationship access
                name = ledger_name_map.get(vl.ledger_id)
                if not name and vl.ledger:
                    name = vl.ledger.name
                
                if name:
                    related_ledger_names.add(name)
        
        related_ledger_name_str = None
        if len(related_ledger_names) > 0:
            related_ledger_name_str = ", ".join(sorted(list(related_ledger_names)))

        source_id = None
        if voucher.sales_invoice:
            source_id = voucher.sales_invoice.id
        elif voucher.purchase_bill:
            source_id = voucher.purchase_bill.id

        all_lines = []
        for vl in voucher.lines:
            ln = ledger_name_map.get(vl.ledger_id)
            if not ln and vl.ledger:
                ln = vl.ledger.name
            
            all_lines.append(
                schemas.VoucherLineRead(
                    id=vl.id,
                    ledger_id=vl.ledger_id,
                    ledger_name=ln,
                    debit=float(vl.debit),
                    credit=float(vl.credit),
                    remarks=vl.remarks,
                    department_id=vl.department_id,
                    project_id=vl.project_id,
                    segment_id=vl.segment_id,
                    employee_id=vl.employee_id,
                )
            )

        transactions.append(
            schemas.LedgerTransaction(
                date=voucher.voucher_date,
                voucher_id=voucher.id,
                voucher_type=voucher.voucher_type,
                voucher_number=voucher.voucher_number,
                reference=(
                    voucher.sales_invoice.reference if voucher.sales_invoice else
                    voucher.purchase_bill.reference if voucher.purchase_bill else
                    voucher.sales_return.reference if voucher.sales_return else
                    voucher.purchase_return.reference if voucher.purchase_return else
                    None
                ),
                narration=voucher.narration,
                payment_mode=(
                    voucher.payment_mode.name
                    if voucher.payment_mode
                    else (
                        "Credit"
                        if voucher.voucher_type in [
                            models.VoucherType.SALES_INVOICE,
                            models.VoucherType.PURCHASE_BILL,
                        ]
                        else None
                    )
                ),
                item_name=(
                    ", ".join([ln.item.name for ln in voucher.sales_invoice.lines if ln.item])
                    if voucher.sales_invoice and voucher.sales_invoice.lines
                    else (
                        ", ".join([ln.item.name for ln in voucher.purchase_bill.lines if ln.item])
                        if voucher.purchase_bill and voucher.purchase_bill.lines
                        else (
                            ", ".join([ln.item.name for ln in voucher.sales_return.lines if ln.item])
                            if voucher.sales_return and voucher.sales_return.lines
                            else (
                                ", ".join([ln.item.name for ln in voucher.purchase_return.lines if ln.item])
                                if voucher.purchase_return and voucher.purchase_return.lines
                                else None
                            )
                        )
                    )
                ),
                remarks=combined_remarks if combined_remarks else None,
                department_name=depts if depts else None,
                project_name=projs if projs else None,
                segment_name=segs if segs else None,
                employee_name=emps if emps else None,
                bill_date=b_dates[0] if b_dates else (voucher.bill_date or voucher.voucher_date),
                debit=total_debit,
                credit=total_credit,
                balance=abs(balance),
                balance_type=balance_type,
                related_ledger_name=related_ledger_name_str,
                source_id=source_id,
                all_lines=all_lines,
            )
        )

    closing = balance
    closing_type = (
        models.OpeningBalanceType.DEBIT if closing >= 0 else models.OpeningBalanceType.CREDIT
    )

    return schemas.LedgerReport(
        ledger_id=ledger.id,
        ledger_name=ledger.name,
        opening_balance=opening_abs,
        opening_balance_type=opening_type,
        transactions=transactions,
        closing_balance=abs(closing),
        closing_balance_type=closing_type,
    )


def _get_supplier_ledger_report(
    db: Session,
    *,
    company_id: int,
    supplier: models.Supplier,
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> schemas.SupplierLedgerReport:
    """Approximate supplier-specific ledger report.

    This narrows the generic ledger logic to only include vouchers that
    originate from PurchaseBill records for the given supplier.
    It will NOT include manual journal entries or payments posted directly
    to the supplier control ledger, but is sufficient for per-supplier
    bill-based statements when all suppliers share one control ledger.
    """

    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    ledger_id = supplier.ledger_id

    # Opening: all bill-linked vouchers for this supplier before from_date
    opening_q = (
        db.query(
            func.coalesce(func.sum(models.VoucherLine.debit), 0),
            func.coalesce(func.sum(models.VoucherLine.credit), 0),
        )
        .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
        .join(
            models.PurchaseBill,
            models.PurchaseBill.voucher_id == models.Voucher.id,
        )
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.PurchaseBill.supplier_id == supplier.id,
            models.Voucher.voucher_date < from_date,
        )
    )
    if department_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.project_id == project_id)
    if segment_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.segment_id == segment_id)
    if employee_id is not None:
        opening_q = opening_q.filter(models.VoucherLine.employee_id == employee_id)
    
    opening_debits, opening_credits = opening_q.one()

    # Start from the ledger's configured opening balance and adjust it with
    # supplier-specific bill-linked movement up to from_date.
    ledger = (
        db.query(models.Ledger)
        .filter(models.Ledger.id == ledger_id, models.Ledger.company_id == company_id)
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=404, detail="Ledger not found")

    if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT:
        opening = float(ledger.opening_balance) + float(opening_debits) - float(opening_credits)
    else:
        opening = float(ledger.opening_balance) - float(opening_debits) + float(opening_credits)

    opening_type = (
        models.OpeningBalanceType.DEBIT if opening >= 0 else models.OpeningBalanceType.CREDIT
    )
    opening_abs = abs(opening)

    # Period transactions: bill-linked vouchers for this supplier in range
    # Period transactions: bill-linked vouchers for this supplier in range
    lines_q = (
        db.query(models.VoucherLine, models.Voucher)
        .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
        .join(
            models.PurchaseBill,
            models.PurchaseBill.voucher_id == models.Voucher.id,
        )
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.PurchaseBill.supplier_id == supplier.id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
        )
    )
    if department_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.project_id == project_id)
    if segment_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.segment_id == segment_id)
    if employee_id is not None:
        lines_q = lines_q.filter(models.VoucherLine.employee_id == employee_id)

    lines = (
        lines_q.options(
            joinedload(models.VoucherLine.department),
            joinedload(models.VoucherLine.project),
            joinedload(models.VoucherLine.segment),
            joinedload(models.VoucherLine.employee),
            selectinload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.purchase_bill).selectinload(models.PurchaseBill.lines).joinedload(models.PurchaseBillLine.item),
            joinedload(models.Voucher.purchase_return).selectinload(models.PurchaseReturn.lines).joinedload(models.PurchaseReturnLine.item),
        )
        .order_by(models.Voucher.voucher_date, models.Voucher.id)
        .all()
    )

    # Collect all needed ledger IDs for reliable name fetching
    all_ledger_ids = set()
    for _, voucher in lines:
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                all_ledger_ids.add(vl.ledger_id)

    # Bulk fetch names to ensure we have them even if lazy loading fails
    ledger_name_map = {ledger_id: ledger.name}
    if all_ledger_ids:
        rows = (
            db.query(models.Ledger.id, models.Ledger.name)
            .filter(models.Ledger.id.in_(list(all_ledger_ids)))
            .all()
        )
        ledger_name_map = {r.id: r.name for r in rows}

    transactions: list[schemas.LedgerTransaction] = []
    balance = opening

    # Group lines by voucher
    for voucher_id, group in groupby(lines, key=lambda x: x[1].id):
        group_list = list(group)
        _, voucher = group_list[0]
        
        total_debit = sum(float(line.debit) for line, _ in group_list)
        total_credit = sum(float(line.credit) for line, _ in group_list)
        combined_remarks = ", ".join(filter(None, [line.remarks for line, _ in group_list]))

        # Aggregate cost center names and bill dates
        depts = ", ".join(sorted(list(set(filter(None, [line.department.name if line.department else None for line, _ in group_list])))))
        projs = ", ".join(sorted(list(set(filter(None, [line.project.name if line.project else None for line, _ in group_list])))))
        segs = ", ".join(sorted(list(set(filter(None, [line.segment.name if line.segment else None for line, _ in group_list])))))
        emps = ", ".join(sorted(list(set(filter(None, [line.employee.full_name if line.employee else None for line, _ in group_list])))))
        b_dates = [voucher.bill_date] if voucher.bill_date else []

        balance += total_debit - total_credit
        balance_type = (
            models.OpeningBalanceType.DEBIT if balance >= 0 else models.OpeningBalanceType.CREDIT
        )

        # Determine the "other" ledger involved in this transaction
        related_ledger_names = set()
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                # Use the pre-fetched map, fallback to relationship access
                name = ledger_name_map.get(vl.ledger_id)
                if not name and vl.ledger:
                    name = vl.ledger.name
                
                if name:
                    related_ledger_names.add(name)
        
        related_ledger_name_str = None
        if len(related_ledger_names) > 0:
            related_ledger_name_str = ", ".join(sorted(list(related_ledger_names)))

        all_lines = []
        for vl in voucher.lines:
            ln = ledger_name_map.get(vl.ledger_id)
            if not ln and vl.ledger:
                ln = vl.ledger.name
            
            all_lines.append(
                schemas.VoucherLineRead(
                    id=vl.id,
                    ledger_id=vl.ledger_id,
                    ledger_name=ln,
                    debit=float(vl.debit),
                    credit=float(vl.credit),
                    remarks=vl.remarks,
                    department_id=vl.department_id,
                    project_id=vl.project_id,
                    segment_id=vl.segment_id,
                    employee_id=vl.employee_id,
                )
            )

        transactions.append(
            schemas.LedgerTransaction(
                date=voucher.voucher_date,
                voucher_id=voucher.id,
                voucher_type=voucher.voucher_type,
                voucher_number=voucher.voucher_number,
                reference=(
                    voucher.purchase_bill.reference if voucher.purchase_bill else
                    voucher.purchase_return.reference if voucher.purchase_return else
                    None
                ),
                narration=voucher.narration,
                payment_mode=(
                    voucher.payment_mode.name
                    if voucher.payment_mode
                    else (
                        "Credit"
                        if voucher.voucher_type in [
                            models.VoucherType.SALES_INVOICE,
                            models.VoucherType.PURCHASE_BILL,
                        ]
                        else None
                    )
                ),
                remarks=combined_remarks if combined_remarks else None,
                department_name=depts if depts else None,
                project_name=projs if projs else None,
                segment_name=segs if segs else None,
                employee_name=emps if emps else None,
                bill_date=b_dates[0] if b_dates else (voucher.bill_date or voucher.voucher_date),
                debit=total_debit,
                credit=total_credit,
                balance=abs(balance),
                balance_type=balance_type,
                related_ledger_name=related_ledger_name_str,
                item_name=(
                    ", ".join([ln.item.name for ln in voucher.purchase_bill.lines if ln.item])
                    if voucher.purchase_bill and voucher.purchase_bill.lines
                    else (
                        ", ".join([ln.item.name for ln in voucher.purchase_return.lines if ln.item])
                        if voucher.purchase_return and voucher.purchase_return.lines
                        else None
                    )
                ),
                all_lines=all_lines,
            )
        )

    closing = balance
    closing_type = (
        models.OpeningBalanceType.DEBIT if closing >= 0 else models.OpeningBalanceType.CREDIT
    )

    total_debit = sum(t.debit for t in transactions)
    total_credit = sum(t.credit for t in transactions)

    return schemas.SupplierLedgerReport(
        company_id=company_id,
        company_name=None,
        supplier_id=supplier.id,
        supplier_name=supplier.name,
        from_date=from_date,
        to_date=to_date,
        ledger_id=ledger.id,
        ledger_name=ledger.name,
        opening_balance=opening_abs,
        opening_balance_type=opening_type,
        transactions=transactions,
        total_debit=total_debit,
        total_credit=total_credit,
        closing_balance=abs(closing),
        closing_balance_type=closing_type,
    )


@router.get("/ledger", response_model=schemas.LedgerReport)
def ledger_report(
    company_id: int,
    ledger_id: int = Query(...),
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    return _get_ledger_report(
        db,
        company_id=company_id,
        ledger_id=ledger_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )


@router.get("/customer-ledger", response_model=schemas.CustomerLedgerReport)
def customer_ledger_report(
    company_id: int,
    customer_id: int = Query(...),
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

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

    if not customer.ledger_id:
        raise HTTPException(
            status_code=400,
            detail="This customer does not have an associated ledger_id configured.",
        )

    ledger_report_data = _get_ledger_report(
        db,
        company_id=company_id,
        ledger_id=customer.ledger_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    total_debit = sum(t.debit for t in ledger_report_data.transactions)
    total_credit = sum(t.credit for t in ledger_report_data.transactions)

    return schemas.CustomerLedgerReport(
        company_id=company_id,
        company_name=company.name,
        customer_id=customer.id,
        customer_name=customer.name,
        from_date=from_date,
        to_date=to_date,
        ledger_id=ledger_report_data.ledger_id,
        ledger_name=ledger_report_data.ledger_name,
        opening_balance=ledger_report_data.opening_balance,
        opening_balance_type=ledger_report_data.opening_balance_type,
        transactions=ledger_report_data.transactions,
        total_debit=total_debit,
        total_credit=total_credit,
        closing_balance=ledger_report_data.closing_balance,
        closing_balance_type=ledger_report_data.closing_balance_type,
    )


@router.get("/supplier-ledger", response_model=schemas.SupplierLedgerReport)
def supplier_ledger_report(
    company_id: int,
    supplier_id: int = Query(...),
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    supplier = (
        db.query(models.Supplier)
        .filter(
            models.Supplier.id == supplier_id,
            models.Supplier.company_id == company_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if not supplier.ledger_id:
        raise HTTPException(
            status_code=400,
            detail="This supplier does not have an associated ledger_id configured.",
        )

    report = _get_supplier_ledger_report(
        db,
        company_id=company_id,
        supplier=supplier,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    # Fill in company_name for convenience on the API response
    report.company_name = company.name
    return report


@router.get("/customer-ledger-mapping", response_model=list[schemas.CustomerLedgerMappingItem])
def customer_ledger_mapping(
    company_id: int,
    has_ledger: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all customers for the company with their linked ledger (if any).

    If has_ledger=true, only customers with a non-null ledger_id are included.
    """
    _get_company(db, company_id, current_user)

    debtor_group = _ensure_party_group(
        db,
        company_id=company_id,
        group_name="Sundry Debtors",
        group_type=models.LedgerGroupType.ASSET,
    )

    customers = db.query(models.Customer).filter(models.Customer.company_id == company_id).all()
    changed = False
    for customer in customers:
        ledger_ok = False
        if customer.ledger_id is not None:
            ledger_ok = (
                db.query(models.Ledger.id)
                .filter(
                    models.Ledger.id == customer.ledger_id,
                    models.Ledger.company_id == company_id,
                )
                .first()
                is not None
            )

        if not ledger_ok:
            ledger = _ensure_party_ledger(
                db,
                company_id=company_id,
                party_name=customer.name,
                group=debtor_group,
            )
            customer.ledger_id = ledger.id
            db.add(customer)
            changed = True

    if changed:
        db.commit()

    Customer = models.Customer
    Ledger = models.Ledger

    query = (
        db.query(
            Customer.id.label("customer_id"),
            Customer.name.label("customer_name"),
            Ledger.id.label("ledger_id"),
            Ledger.name.label("ledger_name"),
        )
        .outerjoin(Ledger, Customer.ledger_id == Ledger.id)
        .filter(Customer.company_id == company_id)
    )

    if has_ledger:
        query = query.filter(Customer.ledger_id.is_not(None))

    rows = query.order_by(Customer.name).all()

    return [
        schemas.CustomerLedgerMappingItem(
            customer_id=row.customer_id,
            customer_name=row.customer_name,
            ledger_id=row.ledger_id,
            ledger_name=row.ledger_name,
        )
        for row in rows
    ]


@router.get("/supplier-ledger-mapping", response_model=list[schemas.SupplierLedgerMappingItem])
def supplier_ledger_mapping(
    company_id: int,
    has_ledger: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return all suppliers for the company with their linked ledger (if any).

    If has_ledger=true, only suppliers with a non-null ledger_id are included.
    """
    _get_company(db, company_id, current_user)

    creditor_group = _ensure_party_group(
        db,
        company_id=company_id,
        group_name="Sundry Creditors",
        group_type=models.LedgerGroupType.LIABILITY,
    )

    suppliers = db.query(models.Supplier).filter(models.Supplier.company_id == company_id).all()
    changed = False
    for supplier in suppliers:
        ledger_ok = False
        if supplier.ledger_id is not None:
            ledger_ok = (
                db.query(models.Ledger.id)
                .filter(
                    models.Ledger.id == supplier.ledger_id,
                    models.Ledger.company_id == company_id,
                )
                .first()
                is not None
            )

        if not ledger_ok:
            ledger = _ensure_party_ledger(
                db,
                company_id=company_id,
                party_name=supplier.name,
                group=creditor_group,
            )
            supplier.ledger_id = ledger.id
            db.add(supplier)
            changed = True

    if changed:
        db.commit()

    Supplier = models.Supplier
    Ledger = models.Ledger

    query = (
        db.query(
            Supplier.id.label("supplier_id"),
            Supplier.name.label("supplier_name"),
            Ledger.id.label("ledger_id"),
            Ledger.name.label("ledger_name"),
        )
        .outerjoin(Ledger, Supplier.ledger_id == Ledger.id)
        .filter(Supplier.company_id == company_id)
    )

    if has_ledger:
        query = query.filter(Supplier.ledger_id.is_not(None))

    rows = query.order_by(Supplier.name).all()

    return [
        schemas.SupplierLedgerMappingItem(
            supplier_id=row.supplier_id,
            supplier_name=row.supplier_name,
            ledger_id=row.ledger_id,
            ledger_name=row.ledger_name,
        )
        for row in rows
    ]


@router.get("/customer-statement", response_model=schemas.PartyStatementReport)
def customer_statement(
    company_id: int,
    customer_id: int = Query(...),
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

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

    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    ledger_id = customer.ledger_id
    if not ledger_id:
        raise HTTPException(status_code=400, detail="Customer has no associated ledger.")

    # 1) Calculate Opening Balance safely considering ALL transactions
    ledger = db.query(models.Ledger).filter(models.Ledger.id == ledger_id).first()
    base_opening = float(ledger.opening_balance)
    if ledger.opening_balance_type == models.OpeningBalanceType.CREDIT:
        base_opening = -base_opening

    pre_period_movement = (
        db.query(
            func.coalesce(func.sum(models.VoucherLine.debit), 0),
            func.coalesce(func.sum(models.VoucherLine.credit), 0),
        )
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date < from_date,
        )
        .one()
    )
    pre_dr, pre_cr = pre_period_movement
    opening_signed = base_opening + float(pre_dr) - float(pre_cr)
    
    # 2) Fetch ALL transactions in range for this ledger
    lines = (
        db.query(models.VoucherLine, models.Voucher)
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
        )
        .options(
            selectinload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.purchase_bill).joinedload(models.PurchaseBill.lines),
            joinedload(models.Voucher.sales_invoice).joinedload(models.SalesInvoice.lines),
        )
        .order_by(models.Voucher.voucher_date, models.Voucher.id)
        .all()
    )

    # Pre-fetch helper for related ledger names
    all_ledger_ids = set()
    for _, voucher in lines:
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                all_ledger_ids.add(vl.ledger_id)
    
    ledger_name_map = {}
    if all_ledger_ids:
        l_rows = db.query(models.Ledger.id, models.Ledger.name).filter(models.Ledger.id.in_(list(all_ledger_ids))).all()
        ledger_name_map = {r.id: r.name for r in l_rows}

    # 3) Build Rows
    rows: list[schemas.PartyStatementRow] = []
    balance = opening_signed

    # Group rows by voucher
    for voucher_id, group in groupby(lines, key=lambda x: x[1].id):
        group_list = list(group)
        _, voucher = group_list[0]
        
        total_debit = sum(float(line.debit) for line, _ in group_list)
        total_credit = sum(float(line.credit) for line, _ in group_list)
        combined_remarks = ", ".join(filter(None, [line.remarks for line, _ in group_list]))

        # Aggregate cost center names
        depts = ", ".join(sorted(list(set(filter(None, [line.department.name if line.department else None for line, _ in group_list])))))
        projs = ", ".join(sorted(list(set(filter(None, [line.project.name if line.project else None for line, _ in group_list])))))
        segs = ", ".join(sorted(list(set(filter(None, [line.segment.name if line.segment else None for line, _ in group_list])))))
        emps = ", ".join(sorted(list(set(filter(None, [line.employee.full_name if line.employee else None for line, _ in group_list])))))
        balance += total_debit - total_credit

        doc_type = "VOUCHER"
        doc_id = voucher.id
        doc_number = voucher.voucher_number
        reference = voucher.voucher_number
        items = []

        if voucher.sales_invoice:
            doc_type = "INVOICE"
            doc_id = voucher.sales_invoice.id
            doc_number = voucher.sales_invoice.reference
            reference = voucher.sales_invoice.reference
            
            for idx, pl in enumerate(voucher.sales_invoice.lines or [], start=1):
                subtotal = float(pl.quantity) * float(pl.rate) - float(pl.discount)
                tax = subtotal * float(pl.tax_rate)
                items.append(
                    schemas.PartyStatementItem(
                        line_no=idx,
                        item_id=pl.item_id,
                        item_name=pl.item_name,
                        quantity=float(pl.quantity),
                        rate=float(pl.rate),
                        discount=float(pl.discount),
                        tax_rate=float(pl.tax_rate),
                        line_total=subtotal + tax,
                    )
                )

        elif voucher.purchase_bill:
             doc_type = "BILL"
             doc_id = voucher.purchase_bill.id
             doc_number = voucher.purchase_bill.reference

        elif voucher.voucher_type == models.VoucherType.PAYMENT:
            doc_type = "PAYMENT"
        elif voucher.voucher_type == models.VoucherType.RECEIPT:
             doc_type = "RECEIPT"
        elif voucher.voucher_type == models.VoucherType.JOURNAL:
            doc_type = "JOURNAL"
        elif voucher.voucher_type == models.VoucherType.CONTRA:
            doc_type = "CONTRA"
        
        payment_mode_name = voucher.payment_mode.name if voucher.payment_mode else None
        
        related_names = []
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                name = ledger_name_map.get(vl.ledger_id)
                if not name and vl.ledger:
                    name = vl.ledger.name
                if name:
                    related_names.append(name)
        
        particulars_str = ", ".join(sorted(list(set(related_names)))) if related_names else None

        if not reference and related_names:
            reference = particulars_str

        rows.append(
            schemas.PartyStatementRow(
                date=voucher.voucher_date,
                doc_type=doc_type,
                doc_id=doc_id,
                doc_number=doc_number,
                reference=reference,
                particulars=particulars_str,
                payment_mode=payment_mode_name,
                paid_amount=None,
                debit=total_debit,
                credit=total_credit,
                balance=balance,
                remarks=combined_remarks if combined_remarks else None,
                department_name=depts if depts else None,
                project_name=projs if projs else None,
                segment_name=segs if segs else None,
                employee_name=emps if emps else None,
                items=items,
            )
        )

    return schemas.PartyStatementReport(
        company_id=company_id,
        company_name=company.name,
        party_id=customer.id,
        party_name=customer.name,
        from_date=from_date,
        to_date=to_date,
        opening_balance=opening_signed,
        transactions=rows,
        closing_balance=balance,
    )


@router.get("/supplier-statement", response_model=schemas.PartyStatementReport)
def supplier_statement(
    company_id: int,
    supplier_id: int = Query(...),
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    supplier = (
        db.query(models.Supplier)
        .filter(
            models.Supplier.id == supplier_id,
            models.Supplier.company_id == company_id,
        )
        .first()
    )
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    ledger_id = supplier.ledger_id
    if not ledger_id:
        raise HTTPException(status_code=400, detail="Supplier has no associated ledger.")

    # 1) Calculate Opening Balance safely considering ALL transactions
    # Default opening balance from Ledger config
    ledger = db.query(models.Ledger).filter(models.Ledger.id == ledger_id).first()
    base_opening = float(ledger.opening_balance)
    if ledger.opening_balance_type == models.OpeningBalanceType.CREDIT:
        base_opening = -base_opening

    # Sum of all movements before from_date
    pre_period_movement = (
        db.query(
            func.coalesce(func.sum(models.VoucherLine.debit), 0),
            func.coalesce(func.sum(models.VoucherLine.credit), 0),
        )
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date < from_date,
        )
        .one()
    )
    pre_dr, pre_cr = pre_period_movement
    opening_signed = base_opening + float(pre_dr) - float(pre_cr)
    
    # 2) Fetch ALL transactions in range for this ledger (Bills, Payments, Journals, etc.)
    lines = (
        db.query(models.VoucherLine, models.Voucher)
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id == ledger_id,
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
        )
        .options(
            selectinload(models.Voucher.lines).joinedload(models.VoucherLine.ledger),
            joinedload(models.Voucher.payment_mode),
            joinedload(models.Voucher.purchase_bill).joinedload(models.PurchaseBill.lines),
            joinedload(models.Voucher.sales_invoice).joinedload(models.SalesInvoice.lines),
        )
        .order_by(models.Voucher.voucher_date, models.Voucher.id)
        .all()
    )

    # Pre-fetch helper for related ledger names
    all_ledger_ids = set()
    for _, voucher in lines:
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                all_ledger_ids.add(vl.ledger_id)
    
    ledger_name_map = {}
    if all_ledger_ids:
        l_rows = db.query(models.Ledger.id, models.Ledger.name).filter(models.Ledger.id.in_(list(all_ledger_ids))).all()
        ledger_name_map = {r.id: r.name for r in l_rows}

    # 3) Build Rows
    rows: list[schemas.PartyStatementRow] = []
    balance = opening_signed

    # Group rows by voucher
    for voucher_id, group in groupby(lines, key=lambda x: x[1].id):
        group_list = list(group)
        _, voucher = group_list[0]
        
        total_debit = sum(float(line.debit) for line, _ in group_list)
        total_credit = sum(float(line.credit) for line, _ in group_list)
        combined_remarks = ", ".join(filter(None, [line.remarks for line, _ in group_list]))

        # Aggregate cost center names
        depts = ", ".join(sorted(list(set(filter(None, [line.department.name if line.department else None for line, _ in group_list])))))
        projs = ", ".join(sorted(list(set(filter(None, [line.project.name if line.project else None for line, _ in group_list])))))
        segs = ", ".join(sorted(list(set(filter(None, [line.segment.name if line.segment else None for line, _ in group_list])))))
        emps = ", ".join(sorted(list(set(filter(None, [line.employee.full_name if line.employee else None for line, _ in group_list])))))
        balance += total_debit - total_credit

        # Determine doc type / number
        doc_type = "VOUCHER"
        doc_id = voucher.id
        doc_number = voucher.voucher_number
        reference = voucher.voucher_number
        items = []

        if voucher.purchase_bill:
            doc_type = "BILL"
            doc_id = voucher.purchase_bill.id
            doc_number = voucher.purchase_bill.reference
            reference = voucher.purchase_bill.reference
            # Extract items if needed for statement display
            # We can reuse the breakdown logic if we want details
            # For brevity/safety, let's just map minimal info or skip if heavy
            # _purchase_doc_breakdown logic could be inline
            for idx, pl in enumerate(voucher.purchase_bill.lines or [], start=1):
                subtotal = float(pl.quantity) * float(pl.rate) - float(pl.discount)
                tax = subtotal * float(pl.tax_rate)
                items.append(
                    schemas.PartyStatementItem(
                        line_no=idx,
                        item_id=pl.item_id,
                        item_name=pl.item_name,
                        quantity=float(pl.quantity),
                        rate=float(pl.rate),
                        discount=float(pl.discount),
                        tax_rate=float(pl.tax_rate),
                        line_total=subtotal + tax,
                    )
                )

        elif voucher.sales_invoice:
             # Unlikely for supplier but possible handling
            doc_type = "INVOICE"
            doc_id = voucher.sales_invoice.id
            doc_number = voucher.sales_invoice.reference

        elif voucher.voucher_type == models.VoucherType.PAYMENT:
            doc_type = "PAYMENT"
        elif voucher.voucher_type == models.VoucherType.JOURNAL:
            doc_type = "JOURNAL"
        elif voucher.voucher_type == models.VoucherType.CONTRA:
            doc_type = "CONTRA"
        
        # Payment Mode
        payment_mode_name = voucher.payment_mode.name if voucher.payment_mode else None
        
        # Related Ledger Name logic for "Payment" row clarity
        related_names = []
        for vl in voucher.lines:
            if vl.ledger_id != ledger_id:
                name = ledger_name_map.get(vl.ledger_id)
                if not name and vl.ledger:
                    name = vl.ledger.name
                if name:
                    related_names.append(name)
        
        # If it's a generic voucher/payment, maybe use the related ledger as reference/description override?
        # For now, we stick to the schema. 
        # But we can append it to doc_number or reference if frontend lacks a column?
        # The schema has 'reference'. We can put it there if null.
        particulars_str = ", ".join(sorted(list(set(related_names)))) if related_names else None

        if not reference and related_names:
            reference = particulars_str

        rows.append(
            schemas.PartyStatementRow(
                date=voucher.voucher_date,
                doc_type=doc_type,
                doc_id=doc_id,
                doc_number=doc_number,
                reference=reference,
                particulars=particulars_str,
                payment_mode=payment_mode_name,
                paid_amount=None, # Logic for specific paid_amount is brittle if mixed, leaving flexible
                debit=total_debit,
                credit=total_credit,
                balance=balance,
                remarks=combined_remarks if combined_remarks else None,
                department_name=depts if depts else None,
                project_name=projs if projs else None,
                segment_name=segs if segs else None,
                employee_name=emps if emps else None,
                items=items,
            )
        )

    return schemas.PartyStatementReport(
        company_id=company_id,
        company_name=company.name,
        party_id=supplier.id,
        party_name=supplier.name,
        from_date=from_date,
        to_date=to_date,
        opening_balance=opening_signed,
        transactions=rows,
        closing_balance=balance,
    )


def _compute_ledger_balances(
    db: Session,
    *,
    company_id: int,
    from_date: date,
    to_date: date,
    fiscal_year_start: date | None = None,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
) -> dict[int, dict[str, float]]:
    balances: dict[int, dict[str, float]] = {}

    ledgers = (
        db.query(models.Ledger)
        .filter(models.Ledger.company_id == company_id)
        .all()
    )

    # Cumulative approach to satisfy user request:
    # Opening = Manual Value (from start of year)
    # Period = All vouchers from Year Start to to_date (cumulative)
    # Closing = Opening + Period
    # This ensures Opening matches user's manual input and math balances.
    
    # Determine actual start date for vouchers (Fiscal start or Jan 1)
    start_date = fiscal_year_start or date(to_date.year, 1, 1)

    for ledger in ledgers:
        if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT:
            opening_balance = float(ledger.opening_balance)
        else:
            opening_balance = -float(ledger.opening_balance)

        opening_debit = opening_balance if opening_balance > 0 else 0.0
        opening_credit = -opening_balance if opening_balance < 0 else 0.0

        # Period movement = transactions from year start to to_date
        # (To ensure math works with fixed manual Opening balance)
        period_q = (
            db.query(
                func.coalesce(func.sum(models.VoucherLine.debit), 0),
                func.coalesce(func.sum(models.VoucherLine.credit), 0),
            )
            .join(models.Voucher)
            .filter(
                models.VoucherLine.ledger_id == ledger.id,
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date >= start_date,
                models.Voucher.voucher_date <= to_date,
            )
        )
        if department_id is not None:
            period_q = period_q.filter(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            period_q = period_q.filter(models.VoucherLine.project_id == project_id)
        if segment_id is not None:
            period_q = period_q.filter(models.VoucherLine.segment_id == segment_id)
        
        period_debits, period_credits = period_q.one()

        period_debit = float(period_debits)
        period_credit = float(period_credits)

        # Closing = manually set opening + period movement
        closing_balance = opening_balance + period_debit - period_credit
        closing_debit = closing_balance if closing_balance > 0 else 0.0
        closing_credit = -closing_balance if closing_balance < 0 else 0.0

        balances[ledger.id] = dict(
            opening_debit=opening_debit,
            opening_credit=opening_credit,
            period_debit=period_debit,
            period_credit=period_credit,
            closing_debit=closing_debit,
            closing_credit=closing_credit,
        )

    return balances


def _build_trial_balance_rows(
    db: Session,
    *,
    company_id: int,
    ledger_balances: dict[int, dict[str, float]],
) -> list[schemas.TrialBalanceRow]:
    groups = (
        db.query(models.LedgerGroup)
        .filter(models.LedgerGroup.company_id == company_id)
        .all()
    )
    ledgers = (
        db.query(models.Ledger)
        .filter(models.Ledger.company_id == company_id)
        .all()
    )

    children_by_parent: dict[int | None, list[models.LedgerGroup]] = {}
    for g in groups:
        children_by_parent.setdefault(g.parent_group_id, []).append(g)

    ledgers_by_group: dict[int, list[models.Ledger]] = {}
    for l in ledgers:
        ledgers_by_group.setdefault(l.group_id, []).append(l)

    for child_list in children_by_parent.values():
        child_list.sort(key=lambda g: g.name)

    # 4) Intelligent Re-parenting for reporting (e.g., Capital Account heads)
    # The user may have created 'Business Owner' or 'Drawings' as root groups or under other heads.
    # We force them under 'Capital Account' if available.
    target_capital_group = next((g for g in groups if g.name.lower().strip() == "capital account"), None)
    if target_capital_group:
        FORCE_CAPITAL_NAMES = {
            "business owner", "drawings", "owner's capital", "owner’s capital", 
            "proprietor's capital", "proprietor’s capital", "partner's capital", 
            "partner’s capital", "profit & loss", "profit and loss"
        }
        
        # a) Reparent groups
        for g in groups:
            if g.id == target_capital_group.id:
                continue
            if g.name.lower().strip() in FORCE_CAPITAL_NAMES:
                # Remove from current parent
                old_list = children_by_parent.get(g.parent_group_id, [])
                if g in old_list:
                    old_list.remove(g)
                # Reparent to Capital Account
                g.parent_group_id = target_capital_group.id
                children_by_parent.setdefault(target_capital_group.id, []).append(g)
        
        # b) Reparent ledgers (that might be outside any forced groups)
        for l in ledgers:
            if l.name.lower().strip() in FORCE_CAPITAL_NAMES:
                if l.group_id != target_capital_group.id:
                    # Remove from old group
                    old_list = ledgers_by_group.get(l.group_id, [])
                    if l in old_list:
                        old_list.remove(l)
                    # Move into Capital Account
                    l.group_id = target_capital_group.id
                    ledgers_by_group.setdefault(target_capital_group.id, []).append(l)

    seq = count(1)

    def walk_group(
        group: models.LedgerGroup,
        level: int,
        parent_group_id: int | None,
        parent_group_name: str | None,
        path: list[str],
    ) -> tuple[list[schemas.TrialBalanceRow], dict[str, float]]:
        group_sort_order = next(seq)  # Reserve sort order for the head
        rows: list[schemas.TrialBalanceRow] = []

        totals = dict(
            opening_debit=0.0,
            opening_credit=0.0,
            period_debit=0.0,
            period_credit=0.0,
            closing_debit=0.0,
            closing_credit=0.0,
        )

        for child in children_by_parent.get(group.id, []):
            child_rows, child_totals = walk_group(
                child,
                level + 1,
                group.id,
                group.name,
                path + [child.name],
            )
            rows.extend(child_rows)
            for k in totals:
                totals[k] += child_totals[k]

        for ledger in ledgers_by_group.get(group.id, []):
            b = ledger_balances.get(ledger.id)
            if not b:
                continue
            # Skip pure zero-balance ledgers so they do not appear in the report
            if all(
                (b[key] == 0.0)
                for key in (
                    "opening_debit",
                    "opening_credit",
                    "period_debit",
                    "period_credit",
                    "closing_debit",
                    "closing_credit",
                )
            ):
                continue

            is_pl_group = group.group_type in (
                models.LedgerGroupType.INCOME,
                models.LedgerGroupType.EXPENSE,
            )

            row_balances = b.copy()
            if is_pl_group:
                # P&L accounts (Income/Expense) should not have opening balances in Trial Balance
                row_balances["opening_debit"] = 0.0
                row_balances["opening_credit"] = 0.0
                # Closing balance for P&L accounts should only reflect period movement
                row_balances["closing_debit"] = row_balances["period_debit"]
                row_balances["closing_credit"] = row_balances["period_credit"]

            for k in totals:
                totals[k] += row_balances[k]

            rows.append(
                schemas.TrialBalanceRow(
                    row_type=schemas.TrialBalanceRowType.LEDGER,
                    level=level + 1,
                    is_group=False,
                    is_ledger=True,
                    group_id=group.id,
                    group_name=group.name,
                    primary_group=(path[0] if path else group.name),
                    group_path=path,
                    parent_group_id=group.id,
                    parent_group_name=group.name,
                    sort_order=next(seq),
                    ledger_id=ledger.id,
                    ledger_name=ledger.name,
                    **row_balances,
                )
            )

        # If this group (and all descendants) contributes nothing, hide the head as well
        # UNLESS it's an important structural group requested by the user.
        PRESERVE_NAMES = {
            # Equity / Capital
            "capital account", "equity", "share capital", "reserves & surplus",
            "owner's equity", "owner\u2019s equity", "capital accounts",
            # Asset heads
            "current assets", "fixed assets", "non-current assets", "fixed asset", "current asset",
            "stock-in-hand", "inventory", "sundry debtors", "stock in hand",
            "cash & bank", "cash and bank", "bank accounts", "cash in hand",
            "loans & advances (asset)", "investments", "opening stock",
            # Liability heads
            "current liabilities", "sundry creditors", "current liability",
            "loans & liabilities", "provisions", "opening balance difference",
        }
        group_name_norm = group.name.lower().strip()
        is_preserved = group_name_norm in PRESERVE_NAMES or "assets" in group_name_norm or "stock" in group_name_norm or "capital" in group_name_norm

        if not rows and all(value == 0.0 for value in totals.values()) and not is_preserved:
            return [], totals

        group_row = schemas.TrialBalanceRow(
            row_type=(
                schemas.TrialBalanceRowType.GROUP
                if parent_group_id is None
                else schemas.TrialBalanceRowType.SUB_GROUP
            ),
            level=level,
            is_group=True,
            is_ledger=False,
            group_id=group.id,
            group_name=group.name,
            primary_group=(path[0] if path else group.name),
            group_path=path,
            parent_group_id=parent_group_id,
            parent_group_name=parent_group_name,
            sort_order=group_sort_order, # Use the reserved sort order
            ledger_id=None,
            ledger_name=group.name,
            **totals,
        )

        return [group_row] + rows, totals

    all_rows: list[schemas.TrialBalanceRow] = []

    # Identify the top-level container groups (usually "Assets", "Liabilities")
    # that we want to flatten. This promotes "Fixed Assets", "Capital Account", etc. to the top level.
    CONTAINER_NAMES = {"assets", "liabilities", "owner's equity", "owner’s equity", "equity"}
    final_roots = []
    processed_roots = set()

    def collect_roots(g_list):
        # Sort roots to keep a consistent order
        for g in sorted(g_list, key=lambda x: x.name):
            if g.id in processed_roots:
                continue
            if g.name.lower().strip() in CONTAINER_NAMES:
                processed_roots.add(g.id)
                collect_roots(children_by_parent.get(g.id, []))
            else:
                final_roots.append(g)
                processed_roots.add(g.id)

    collect_roots(children_by_parent.get(None, []))

    for root in final_roots:
        rows, _ = walk_group(
            root,
            level=0,
            parent_group_id=None,
            parent_group_name=None,
            path=[root.name],
        )
        all_rows.extend(rows)

    return all_rows


@router.get("/trial-balance", response_model=schemas.TrialBalanceReport)
def trial_balance(
    company_id: int,
    from_date: date | None = Query(None),
    to_date: date | None = Query(None),
    as_on_date: date | None = Query(None),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    if as_on_date is not None and from_date is None and to_date is None:
        from_date = as_on_date
        to_date = as_on_date

    if from_date is None or to_date is None:
        raise HTTPException(status_code=422, detail="from_date and to_date (or as_on_date) are required")

    ledger_balances = _compute_ledger_balances(
        db,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        fiscal_year_start=company.fiscal_year_start,
    )


    # --- Synthetic Injection for Opening Stock (Inventory) ---
    # If the user has inventory with opening values, we show it as a line item
    # to ensure Assets are correctly represented.
    fiscal_start = company.fiscal_year_start or date(to_date.year, 1, 1)
    opening_stock_val = _inventory_value_as_of(
        db, company_id=company_id, as_on_date=fiscal_start, ignore_fixed_assets=True
    )
    
    rows = _build_trial_balance_rows(
        db,
        company_id=company_id,
        ledger_balances=ledger_balances,
    )

    if opening_stock_val > 0:
        # Identify the Stock-in-Hand group or Current Assets to nest under
        all_groups = db.query(models.LedgerGroup).filter(models.LedgerGroup.company_id == company_id).all()
        stock_group = next((g for g in all_groups if "stock" in g.name.lower()), None)
        parent_group = stock_group or next((g for g in all_groups if "current asset" in g.name.lower()), None)
        
        # Create synthetic row
        # Note: We don't want to double count if there's already a ledger named "Opening Stock"
        existing_opening = any(r.ledger_name.lower() == "opening stock" for r in rows if r.is_ledger)
        if not existing_opening:
            # Find the parent group in the existing rows to get the correct level
            parent_row = next((r for r in rows if r.is_group and parent_group and r.group_id == parent_group.id), None)
            row_level = (parent_row.level + 1 if parent_row else 1)

            new_row = schemas.TrialBalanceRow(
                row_type=schemas.TrialBalanceRowType.LEDGER,
                level=row_level,
                is_group=False,
                is_ledger=True,
                group_id=(parent_group.id if parent_group else None),
                group_name=(parent_group.name if parent_group else "Current Assets"),
                primary_group="Assets",
                group_path=([parent_group.name] if parent_group else ["Assets"]),
                parent_group_id=(parent_group.id if parent_group else None),
                parent_group_name=(parent_group.name if parent_group else "Assets"),
                sort_order=(max((r.sort_order for r in rows), default=0) + 1),
                ledger_id=None,
                ledger_name="Opening Stock (Inventory)",
                opening_debit=float(opening_stock_val),
                opening_credit=0.0,
                period_debit=0.0,
                period_credit=0.0,
                closing_debit=float(opening_stock_val),
                closing_credit=0.0
            )
            rows.append(new_row)
            
            # Update totals for parent groups in the list
            if parent_group:
                for r in rows:
                    if r.is_group and (r.group_id == parent_group.id or (r.group_path and parent_group.name in r.group_path)):
                        r.opening_debit += float(opening_stock_val)
                        r.closing_debit += float(opening_stock_val)

    return schemas.TrialBalanceReport(from_date=from_date, to_date=to_date, rows=rows)


def _compute_ledger_closing_amounts(
    db: Session,
    *,
    company_id: int,
    as_on_date: date,
    fiscal_year_start: date | None = None,
) -> dict[int, float]:
    """Compute closing amount for each ledger as of as_on_date.

    The ledger.opening_balance is treated as the balance at the START of the
    fiscal year. Only vouchers from fiscal_year_start (inclusive) through
    as_on_date (inclusive) are accumulated on top of that opening balance.

    Positive amount means debit balance for assets, credit balance for liabilities,
    following the same sign convention as balance_sheet.
    """

    ledgers = (
        db.query(models.Ledger)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.ASSET,
                models.LedgerGroupType.LIABILITY,
            ]),
        )
        .all()
    )

    amounts: dict[int, float] = {}

    for ledger in ledgers:
        query = (
            db.query(
                func.coalesce(func.sum(models.VoucherLine.debit), 0),
                func.coalesce(func.sum(models.VoucherLine.credit), 0),
            )
            .join(models.Voucher)
            .filter(
                models.VoucherLine.ledger_id == ledger.id,
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date <= as_on_date,
            )
        )
        # Only include vouchers within the current fiscal year
        if fiscal_year_start is not None:
            query = query.filter(models.Voucher.voucher_date >= fiscal_year_start)

        debits, credits = query.one()

        if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT:
            opening = float(ledger.opening_balance)
        else:
            opening = -float(ledger.opening_balance)

        balance = opening + float(debits) - float(credits)

        # Assets: natural debit; Liabilities: natural credit
        if ledger.group.group_type == models.LedgerGroupType.ASSET:
            amount = balance
        else:
            amount = -balance

        amounts[ledger.id] = float(amount)

    return amounts


def _build_balance_sheet_hierarchical(
    db: Session,
    *,
    company_id: int,
    ledger_amounts: dict[int, float],
) -> tuple[list[schemas.BalanceSheetHierRow], list[schemas.BalanceSheetHierRow]]:
    groups = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.ASSET,
                models.LedgerGroupType.LIABILITY,
            ]),
        )
        .all()
    )
    ledgers = (
        db.query(models.Ledger)
        .filter(models.Ledger.company_id == company_id)
        .all()
    )

    children_by_parent: dict[int | None, list[models.LedgerGroup]] = {}
    for g in groups:
        children_by_parent.setdefault(g.parent_group_id, []).append(g)

    ledgers_by_group: dict[int, list[models.Ledger]] = {}
    for l in ledgers:
        ledgers_by_group.setdefault(l.group_id, []).append(l)

    for child_list in children_by_parent.values():
        child_list.sort(key=lambda g: g.name)

    # Re-parent capital-related items for the balance sheet as well
    target_capital_group = next((g for g in groups if g.name.lower().strip() == "capital account"), None)
    if target_capital_group:
        FORCE_CAPITAL_NAMES = {
            "business owner", "drawings", "owner's capital", "owner’s capital", 
            "proprietor's capital", "proprietor’s capital", "partner's capital", 
            "partner’s capital", "profit & loss", "profit and loss"
        }
        for g in groups:
            if g.id == target_capital_group.id: continue
            if g.name.lower().strip() in FORCE_CAPITAL_NAMES:
                old_list = children_by_parent.get(g.parent_group_id, [])
                if g in old_list: old_list.remove(g)
                g.parent_group_id = target_capital_group.id
                children_by_parent.setdefault(target_capital_group.id, []).append(g)
        for l in ledgers:
            if l.name.lower().strip() in FORCE_CAPITAL_NAMES:
                if l.group_id != target_capital_group.id:
                    old_list = ledgers_by_group.get(l.group_id, [])
                    if l in old_list: old_list.remove(l)
                    l.group_id = target_capital_group.id
                    ledgers_by_group.setdefault(target_capital_group.id, []).append(l)

    seq = count(1)

    def walk_group(
        group: models.LedgerGroup,
        level: int,
        parent_group_id: int | None,
        parent_group_name: str | None,
        path: list[str],
    ) -> tuple[list[schemas.BalanceSheetHierRow], float]:
        rows: list[schemas.BalanceSheetHierRow] = []
        total_amount = 0.0
        
        # Classification logic same as structured
        classification = _get_basic_classification(group)
        
        # Generate sort order for group row FIRST
        group_row_sort_order = next(seq)

        for ledger in ledgers_by_group.get(group.id, []):
            amount = ledger_amounts.get(ledger.id)
            
            # Special case: Always include inventory/stock-related ledgers so frontend can override 
            # them with real-time valuation, even if trial balance shows zero.
            ledger_name_lower = ledger.name.lower()
            group_name_lower = group.name.lower()
            
            # If this is a stock group, we will skip its actual ledgers and rely on the
            # calculated inventory value injected later.
            if "stock" in group_name_lower or "inventory" in group_name_lower:
                continue

            is_inventory = "stock" in ledger_name_lower or "inventory" in ledger_name_lower
            
            if not is_inventory:
                if amount is None or amount == 0.0:
                    continue

            amount_val = amount if amount is not None else 0.0
            total_amount += amount_val

            rows.append(
                schemas.BalanceSheetHierRow(
                    row_type=schemas.TrialBalanceRowType.LEDGER,
                    level=level + 1,
                    is_group=False,
                    is_ledger=True,
                    group_id=group.id,
                    group_name=group.name,
                    primary_group=path[0] if path else group.group_type.name.title(),
                    group_path=path,
                    parent_group_id=group.id,
                    parent_group_name=group.name,
                    sort_order=next(seq),
                    ledger_id=ledger.id,
                    ledger_name=ledger.name,
                    amount=amount_val,
                    classification=classification,
                )
            )

        for child in children_by_parent.get(group.id, []):
            child_rows, child_total = walk_group(
                child,
                level + 1,
                group.id,
                group.name,
                path + [child.name],
            )
            rows.extend(child_rows)
            total_amount += child_total

        # Hide empty groups that have no non-zero descendants, 
        # UNLESS they are important structural groups.
        PRESERVE_NAMES = {"capital account", "equity", "share capital", "reserves & surplus", "owner's equity", "owner’s equity"}
        if not rows and total_amount == 0.0 and group.name.lower().strip() not in PRESERVE_NAMES:
            return [], 0.0

        group_row = schemas.BalanceSheetHierRow(
            row_type=(
                schemas.TrialBalanceRowType.GROUP
                if parent_group_id is None
                else schemas.TrialBalanceRowType.SUB_GROUP
            ),
            level=level,
            is_group=True,
            is_ledger=False,
            group_id=group.id,
            group_name=group.name,
            primary_group=path[0] if path else group.group_type.name.title(),
            group_path=path,
            parent_group_id=parent_group_id,
            parent_group_name=parent_group_name,
            sort_order=group_row_sort_order,
            ledger_id=None,
            ledger_name=group.name,
            amount=total_amount,
            classification=classification,
        )

        return [group_row] + rows, total_amount

    liabilities_rows: list[schemas.BalanceSheetHierRow] = []
    assets_rows: list[schemas.BalanceSheetHierRow] = []

    # Identify the top-level container groups (usually "Assets", "Liabilities")
    # that we want to flatten.
    CONTAINER_NAMES = {"assets", "liabilities", "owner's equity", "owner’s equity", "equity"}
    
    asset_liability_group_ids = {g.id for g in groups}
    base_roots = [g for g in groups if g.parent_group_id not in asset_liability_group_ids]
    
    # Roots: groups with no parent, OR children of generic container groups.
    # This promotes "Fixed Assets", "Capital Account", etc. to the top level.
    final_roots = []
    processed_roots = set()
    
    def collect_roots(g_list):
        for g in g_list:
            if g.id in processed_roots:
                continue
            if g.name.lower().strip() in CONTAINER_NAMES:
                processed_roots.add(g.id)
                collect_roots(children_by_parent.get(g.id, []))
            else:
                final_roots.append(g)
                processed_roots.add(g.id)

    collect_roots(base_roots)
    roots = final_roots

    for root in roots:
        rows, total = walk_group(
            root,
            level=0,
            parent_group_id=None,
            parent_group_name=None,
            path=[root.name],
        )
        if root.group_type == models.LedgerGroupType.LIABILITY:
            liabilities_rows.extend(rows)
        else:
            assets_rows.extend(rows)

    return liabilities_rows, assets_rows


@router.get("/balance-sheet-hierarchical", response_model=schemas.BalanceSheetHierarchicalReport)
def balance_sheet_hierarchical(
    company_id: int,
    as_on_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    # Determine fiscal year boundaries from company settings
    fiscal_year_start: date | None = company.fiscal_year_start
    fiscal_year_end: date | None = company.fiscal_year_end

    # Cap as_on_date at fiscal year end if set
    effective_to = as_on_date
    if fiscal_year_end is not None and effective_to > fiscal_year_end:
        effective_to = fiscal_year_end

    ledger_amounts = _compute_ledger_closing_amounts(
        db,
        company_id=company_id,
        as_on_date=effective_to,
        fiscal_year_start=fiscal_year_start,
    )

    liabilities, assets = _build_balance_sheet_hierarchical(
        db,
        company_id=company_id,
        ledger_amounts=ledger_amounts,
    )

    # Keep hierarchical report consistent with the summary balance sheet by
    # injecting the same inventory valuation row.
    inventory_value = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=effective_to,
    )

    # Try to find "Current Assets" group to nest under
    current_assets_group = next((r for r in assets if r.group_name == "Current Assets" and r.is_group), None)
    
    if current_assets_group:
        parent_id = current_assets_group.group_id
        parent_name = current_assets_group.group_name
        level = (current_assets_group.level or 0) + 1
        path = (current_assets_group.group_path or []) + ["Closing Stock"]
    else:
        parent_id = None
        parent_name = None
        level = 1
        path = ["Assets", "Closing Stock"]

    assets.append(
        schemas.BalanceSheetHierRow(
            row_type=schemas.TrialBalanceRowType.LEDGER,
            level=level,
            is_group=False,
            is_ledger=True,
            group_id=parent_id, # Link to parent group so it collapses with it
            group_name=None,
            primary_group=parent_name or "Assets",
            group_path=path,
            parent_group_id=parent_id,
            parent_group_name=parent_name,
            sort_order=(max((r.sort_order for r in assets), default=0) + 1),
            ledger_id=None,
            ledger_name="Closing Stock",
            amount=float(inventory_value),
        )
    )

    # Update the totals of the parent groups (e.g. Current Assets) to reflect the added stock value
    if parent_id:
        def update_parent_chain(pid):
             for r in assets:
                 if r.is_group and r.group_id == pid:
                     r.amount += float(inventory_value)
                     if r.parent_group_id:
                         update_parent_chain(r.parent_group_id)
                     break
        update_parent_chain(parent_id)

    # 3. Inject Profit & Loss A/c (Current Year)
    # Use the company's fiscal year start; fall back to Jan 1 of the current year
    pl_from = fiscal_year_start or date(effective_to.year, 1, 1)
    pl_result = compute_profit_and_loss(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=pl_from,
        to_date=effective_to,
        department_id=None,
        project_id=None,
    )
    if pl_result.balancing_entry.label.lower().startswith("net profit"):
        net_profit = pl_result.balancing_entry.amount
    else:
        net_profit = -pl_result.balancing_entry.amount

    if net_profit != 0:
        is_profit = net_profit > 0
        
        # Determine side and group to nest under
        side_rows = liabilities if is_profit else assets
        primary_group_label = "Liabilities" if is_profit else "Assets"
        
        # Common equity/reserve group names
        target_group_names = ["Capital Account", "Reserves & Surplus", "Equity"]
        target_group = next((r for r in side_rows if r.group_name in target_group_names and r.is_group), None)
        
        if target_group:
            parent_id = target_group.group_id
            parent_name = target_group.group_name
            level = (target_group.level or 0) + 1
            path = (target_group.group_path or []) + ["Profit & Loss A/c (Current Year)"]
        else:
            parent_id = None
            parent_name = None
            level = 1
            path = [primary_group_label, "Profit & Loss A/c (Current Year)"]

        pl_row = schemas.BalanceSheetHierRow(
            row_type=schemas.TrialBalanceRowType.LEDGER,
            level=level,
            is_group=False,
            is_ledger=True,
            group_id=parent_id,
            group_name=None,
            primary_group=parent_name or primary_group_label,
            group_path=path,
            parent_group_id=parent_id,
            parent_group_name=parent_name,
            sort_order=(max((r.sort_order for r in side_rows), default=0) + 1),
            ledger_id=None,
            ledger_name="Profit & Loss A/c (Current Year)",
            amount=float(abs(net_profit)),
        )
        side_rows.append(pl_row)
        
        if parent_id:
            def update_parent_chain_hier(pid, rows_list, val):
                for r in rows_list:
                    if r.is_group and r.group_id == pid:
                        r.amount += float(val)
                        if r.parent_group_id:
                            update_parent_chain_hier(r.parent_group_id, rows_list, val)
                        break
            update_parent_chain_hier(parent_id, side_rows, abs(net_profit))

    liabilities_total = sum(row.amount for row in liabilities if row.is_ledger)
    assets_total = sum(row.amount for row in assets if row.is_ledger)

    totals = schemas.BalanceSheetTotals(
        liabilities_total=liabilities_total,
        assets_total=assets_total,
        difference_in_opening_balance=_compute_opening_balance_difference(db, company_id)
    )

    return schemas.BalanceSheetHierarchicalReport(
        as_on_date=as_on_date,
        liabilities=liabilities,
        assets=assets,
        totals=totals,
    )


@router.get("/fixed-assets-depreciation", response_model=schemas.FixedAssetReport)
def get_fixed_assets_report(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    category: str | None = Query(None),
    sub_category: str | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    
    # 1. Fetch all items marked as fixed assets
    asset_q = db.query(models.Item).filter(
        models.Item.company_id == company_id,
        models.Item.is_fixed_asset == True
    )
    if category:
        asset_q = asset_q.filter(models.Item.category == category)
    if sub_category:
        asset_q = asset_q.filter(models.Item.sub_category == sub_category)

    # If dept/project filter: restrict to assets that have stock movements
    # in warehouses belonging to that department/project
    if department_id or project_id:
        matching_wh_q = db.query(models.Warehouse.id).filter(
            models.Warehouse.company_id == company_id
        )
        if department_id:
            matching_wh_q = matching_wh_q.filter(models.Warehouse.department_id == department_id)
        if project_id:
            matching_wh_q = matching_wh_q.filter(models.Warehouse.project_id == project_id)
        matching_wh_ids = [r[0] for r in matching_wh_q.all()]

        if matching_wh_ids:
            # Only include assets that have had stock movements in these warehouses
            asset_ids_with_movements = [
                r[0] for r in db.query(models.StockLedger.item_id).filter(
                    models.StockLedger.company_id == company_id,
                    models.StockLedger.warehouse_id.in_(matching_wh_ids),
                    models.StockLedger.reversed_at.is_(None),
                ).distinct().all()
            ]
            asset_q = asset_q.filter(models.Item.id.in_(asset_ids_with_movements))
        else:
            # No warehouse matches → return empty
            return schemas.FixedAssetReport(
                company_name=company.name,
                from_date=from_date,
                to_date=to_date,
                assets=[],
                total_purchase_cost=0,
                total_depreciation=0,
                total_book_value=0,
            )

    assets = asset_q.all()
    
    report_items = []
    total_cost = 0.0
    total_dep_for_period = 0.0
    total_book_value = 0.0
    
    for asset in assets:
        # Sum purchase cost from StockLedger (qty_delta > 0) or opening value
        opening_value = float(asset.opening_value or 0)
        
        # Calculate purchase cost before to_date
        # Join with item to get default_purchase_rate if unit_cost is null
        purchase_rows = db.query(
            func.sum(models.StockLedger.qty_delta * func.coalesce(models.StockLedger.unit_cost, models.Item.default_purchase_rate, 0))
        ).join(models.Item, models.Item.id == models.StockLedger.item_id).filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.item_id == asset.id,
            models.StockLedger.qty_delta > 0,
            func.date(models.StockLedger.posted_at) <= to_date,
            models.StockLedger.reversed_at.is_(None)
        ).scalar() or 0.0
        
        cost = float(purchase_rows) + opening_value
        
        # Calculate depreciation
        rate = float(asset.depreciation_rate or 0)
        method = asset.depreciation_method or "Straight Line"
        
        # Simple annual calculation for demonstration (pro-rated by days in period)
        days_in_period = (to_date - from_date).days + 1
        if days_in_period < 0: days_in_period = 0
        
        # Annual depreciation amount
        annual_dep = cost * (rate / 100)
        dep_for_period = annual_dep * (days_in_period / 365.25)
        
        # Accumulated depreciation (total since purchase/opening up to to_date)
        # We'll use the earlier of opening_date or the first purchase date in StockLedger
        first_purchase = db.query(func.min(models.StockLedger.posted_at)).filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.item_id == asset.id,
            models.StockLedger.qty_delta > 0,
            models.StockLedger.reversed_at.is_(None)
        ).scalar()
        
        # Calculate quantity on hand
        opening_qty = float(asset.opening_stock or 0)
        qty_rows = db.query(
            func.sum(models.StockLedger.qty_delta)
        ).filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.item_id == asset.id,
            func.date(models.StockLedger.posted_at) <= to_date,
            models.StockLedger.reversed_at.is_(None)
        ).scalar() or 0.0
        quantity_on_hand = opening_qty + float(qty_rows)
        
        asset_start_date = asset.opening_date
        if first_purchase:
            if not asset_start_date or first_purchase.date() < asset_start_date:
                asset_start_date = first_purchase.date()
        
        if not asset_start_date:
            asset_start_date = company.fiscal_year_start or date(to_date.year, 1, 1)
        
        total_days_life = (to_date - asset_start_date).days + 1
        if total_days_life < 0: total_days_life = 0
        
        accumulated_dep = annual_dep * (total_days_life / 365.25)
        # Cap accumulated_dep at cost
        if accumulated_dep > cost: accumulated_dep = cost
        
        book_val = cost - accumulated_dep
        
        report_items.append(schemas.FixedAssetReportItem(
            id=asset.id,
            name=asset.name,
            code=asset.code,
            category=asset.category,
            sub_category=asset.sub_category,
            purchase_date=asset_start_date,
            purchase_cost=cost,
            opening_balance=opening_value,
            quantity_on_hand=quantity_on_hand,
            depreciation_rate=rate,
            depreciation_method=method,
            depreciation_for_period=dep_for_period,
            accumulated_depreciation=accumulated_dep,
            book_value=book_val
        ))
        
        total_cost += cost
        total_dep_for_period += dep_for_period
        total_book_value += book_val

    return schemas.FixedAssetReport(
        company_name=company.name,
        from_date=from_date,
        to_date=to_date,
        assets=report_items,
        total_purchase_cost=total_cost,
        total_depreciation=total_dep_for_period,
        total_book_value=total_book_value
    )


@router.post("/fixed-assets-depreciation/post", response_model=schemas.VoucherRead)
def post_fixed_assets_depreciation(
    company_id: int,
    request: schemas.PostDepreciationRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from ..voucher_service import get_next_voucher_number

    company = _get_company(db, company_id, current_user)
    
    # 1. Fetch the report to calculate depreciation
    report = get_fixed_assets_report(
        company_id=company_id,
        from_date=request.from_date,
        to_date=request.to_date,
        department_id=None,
        project_id=None,
        category=None,
        sub_category=None,
        db=db,
        current_user=current_user,
    )

    if report.total_depreciation <= 0:
        raise HTTPException(status_code=400, detail="No depreciation amount to post for this period.")

    # 2. Validate ledgers
    expense_ledger = db.query(models.Ledger).filter(models.Ledger.id == request.expense_ledger_id, models.Ledger.company_id == company_id).first()
    accum_dep_ledger = db.query(models.Ledger).filter(models.Ledger.id == request.accumulated_dep_ledger_id, models.Ledger.company_id == company_id).first()
    if not expense_ledger or not accum_dep_ledger:
        raise HTTPException(status_code=400, detail="Invalid ledger selected.")

    # 3. Create voucher number
    voucher_number, fiscal_year, next_seq = get_next_voucher_number(
        db=db,
        company_id=company_id,
        voucher_type=models.VoucherType.JOURNAL,
        voucher_date=request.voucher_date
    )

    # 4. Create voucher
    voucher = models.Voucher(
        company_id=company_id,
        voucher_date=request.voucher_date,
        voucher_type=models.VoucherType.JOURNAL,
        fiscal_year=fiscal_year,
        voucher_sequence=next_seq,
        voucher_number=voucher_number,
        narration=request.narration,
    )
    db.add(voucher)
    db.flush()

    # 5. Create voucher lines
    lines = []

    # Debit Depreciation Expense and Credit Accumulated Depreciation (Per Asset)
    for asset in report.assets:
        if asset.depreciation_for_period > 0:
            method_lbl = str(asset.depreciation_method).upper()
            if method_lbl == "STRAIGHT_LINE":
                method_lbl = "SLM"
            elif method_lbl == "REDUCING_BALANCE":
                method_lbl = "WDV"

            code_str = f" [{asset.code}]" if asset.code else ""
            cat_str = f" | {asset.category}" if asset.category else ""
            
            detailed_remarks = f"{asset.name}{code_str}{cat_str} | Rate: {asset.depreciation_rate}% ({method_lbl})"
            
            # Debit line
            lines.append(
                models.VoucherLine(
                    voucher_id=voucher.id,
                    ledger_id=request.expense_ledger_id,
                    debit=asset.depreciation_for_period,
                    credit=0,
                    remarks=detailed_remarks,
                )
            )
            # Credit line
            lines.append(
                models.VoucherLine(
                    voucher_id=voucher.id,
                    ledger_id=request.accumulated_dep_ledger_id,
                    debit=0,
                    credit=asset.depreciation_for_period,
                    remarks=detailed_remarks,
                )
            )

    db.bulk_save_objects(lines)
    db.commit()
    db.refresh(voucher)

    # Populate required fields for serialization
    # Calculate total amount
    voucher.total_amount = report.total_depreciation
    return voucher




def _compute_pl_ledger_amounts(
    db: Session,
    *,
    company_id: int,
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> dict[int, float]:
    """Compute period amounts for income/expense ledgers between from_date and to_date.

    Income ledgers: credits - debits.
    Expense ledgers: debits - credits.
    """

    special_ledger_ids = set()
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if company:
        for attr in ["default_purchase_ledger_id", "default_item_expense_ledger_id", "default_sales_ledger_id", "default_item_income_ledger_id"]:
            lid = getattr(company, attr, None)
            if lid:
                special_ledger_ids.add(int(lid))

    ledgers = (
        db.query(models.Ledger)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(
            models.Ledger.company_id == company_id,
            (models.LedgerGroup.group_type.in_(
                [models.LedgerGroupType.INCOME, models.LedgerGroupType.EXPENSE]
            )) | (models.Ledger.id.in_(special_ledger_ids))
        )
        .all()
    )

    amounts: dict[int, float] = {}

    for ledger in ledgers:
        query = (
            db.query(
                func.coalesce(func.sum(models.VoucherLine.debit), 0),
                func.coalesce(func.sum(models.VoucherLine.credit), 0),
            )
            .join(models.Voucher)
            .filter(
                models.VoucherLine.ledger_id == ledger.id,
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date >= from_date,
                models.Voucher.voucher_date <= to_date,
            )
        )

        # Optional cost center filters at voucher line level
        if department_id is not None:
            query = query.filter(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            query = query.filter(models.VoucherLine.project_id == project_id)
        if segment_id is not None:
            query = query.filter(models.VoucherLine.segment_id == segment_id)
        if employee_id is not None:
            query = query.filter(models.VoucherLine.employee_id == employee_id)

        debits, credits = query.one()

        if ledger.group.group_type == models.LedgerGroupType.INCOME:
            amount = float(credits) - float(debits)
        else:
            amount = float(debits) - float(credits)

        # Zero out COGS because we will artificially construct Trading Account
        # using Opening Stock + Stock Purchases - Closing Stock
        g_name = (ledger.group.name or "").lower()
        l_name = (ledger.name or "").lower()
        if g_name in ("cost of goods sold", "cogs") or l_name in ("cost of goods sold", "cogs"):
            amount = 0.0

        amounts[ledger.id] = float(amount)

    return amounts


def _build_profit_and_loss_hierarchical(
    db: Session,
    *,
    company_id: int,
    ledger_amounts: dict[int, float],
) -> tuple[list[schemas.ProfitLossHierRow], list[schemas.ProfitLossHierRow]]:
    groups = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.group_type.in_(
                [models.LedgerGroupType.INCOME, models.LedgerGroupType.EXPENSE]
            ),
        )
        .all()
    )
    ledgers = (
        db.query(models.Ledger)
        .filter(models.Ledger.company_id == company_id)
        .all()
    )

    children_by_parent: dict[int | None, list[models.LedgerGroup]] = {}
    for g in groups:
        children_by_parent.setdefault(g.parent_group_id, []).append(g)

    ledgers_by_group: dict[int, list[models.Ledger]] = {}
    for l in ledgers:
        ledgers_by_group.setdefault(l.group_id, []).append(l)

    for child_list in children_by_parent.values():
        child_list.sort(key=lambda g: g.name)

    seq = count(1)

    visited_ledger_ids = set()

    def walk_group(
        group: models.LedgerGroup,
        level: int,
        parent_group_id: int | None,
        parent_group_name: str | None,
        path: list[str],
    ) -> tuple[list[schemas.ProfitLossHierRow], float]:
        # Reserve sort order for the group header so it appears before children
        group_sort_order = next(seq)

        rows: list[schemas.ProfitLossHierRow] = []
        total_amount = 0.0

        for child in children_by_parent.get(group.id, []):
            child_rows, child_total = walk_group(
                child,
                level + 1,
                group.id,
                group.name,
                path + [child.name],
            )
            rows.extend(child_rows)
            total_amount += child_total

        for ledger in ledgers_by_group.get(group.id, []):
            amount = ledger_amounts.get(ledger.id)
            if amount is None:
                continue
            if amount == 0.0:
                continue
            
            visited_ledger_ids.add(ledger.id)
            total_amount += amount

            rows.append(
                schemas.ProfitLossHierRow(
                    row_type=schemas.TrialBalanceRowType.LEDGER,
                    level=level + 1,
                    is_group=False,
                    is_ledger=True,
                    group_id=group.id,
                    group_name=group.name,
                    primary_group=group.group_type.name,
                    group_path=path,
                    parent_group_id=group.id,
                    parent_group_name=group.name,
                    sort_order=next(seq),
                    ledger_id=ledger.id,
                    ledger_name=ledger.name,
                    amount=amount,
                )
            )

        if not rows and total_amount == 0.0:
            return [], 0.0

        group_row = schemas.ProfitLossHierRow(
            row_type=(
                schemas.TrialBalanceRowType.GROUP
                if parent_group_id is None
                else schemas.TrialBalanceRowType.SUB_GROUP
            ),
            level=level,
            is_group=True,
            is_ledger=False,
            group_id=group.id,
            group_name=group.name,
            primary_group=group.group_type.name,
            group_path=path,
            parent_group_id=parent_group_id,
            parent_group_name=parent_group_name,
            sort_order=group_sort_order,
            ledger_id=None,
            ledger_name=group.name,
            amount=total_amount,
        )

        return [group_row] + rows, total_amount

    income_rows: list[schemas.ProfitLossHierRow] = []
    expense_rows: list[schemas.ProfitLossHierRow] = []

    for root in children_by_parent.get(None, []):
        root_primary = root.group_type.name  # "INCOME" or "EXPENSE"
        base_path = [root_primary, root.name]
        rows, _ = walk_group(
            root,
            level=0,
            parent_group_id=None,
            parent_group_name=None,
            path=base_path,
        )
        if root.group_type == models.LedgerGroupType.INCOME:
            income_rows.extend(rows)
        else:
            expense_rows.extend(rows)

    # Handle orphaned ledgers (e.g. Asset ledgers used for Purchases)
    orphan_ids = set(ledger_amounts.keys()) - visited_ledger_ids
    if orphan_ids:
        company = db.query(models.Company).filter(models.Company.id == company_id).first()
        # Identify default Sales/Income ledgers to classify as INCOME, rest as EXPENSE
        income_ledger_ids = set()
        if company and company.default_sales_ledger_id:
            income_ledger_ids.add(company.default_sales_ledger_id)
        if company and company.default_item_income_ledger_id:
            income_ledger_ids.add(company.default_item_income_ledger_id)

        # Get ledger details for orphans
        orphan_ledgers = db.query(models.Ledger).filter(models.Ledger.id.in_(list(orphan_ids))).all()
        
        for ledger in orphan_ledgers:
            amount = ledger_amounts.get(ledger.id, 0.0)
            if amount == 0.0:
                continue

            # Determine category
            is_income = ledger.id in income_ledger_ids
            primary_group_name = "INCOME" if is_income else "EXPENSE"
            
            # Use a synthetic group name like "Other Income" or "Purchases/Direct Expenses" 
            # or simply list them at top level.
            # "Purchases" is a safe bet for Expenses usually, but "Direct Expenses" is also used.
            # Let's use "Other Income/Expenses" to be safe or "Unclassified".
            # Better: if it matches default purchase ledger, call it "Purchases".
            
            synthetic_group_name = "Direct Income" if is_income else "Direct Expenses" # Default bucket
            
            # Refine name if matches defaults
            if company:
                if ledger.id == company.default_purchase_ledger_id:
                    synthetic_group_name = "Purchases"
                elif ledger.id == company.default_sales_ledger_id:
                    synthetic_group_name = "Sales"

            row = schemas.ProfitLossHierRow(
                row_type=schemas.TrialBalanceRowType.LEDGER,
                level=1,
                is_group=False,
                is_ledger=True,
                group_id=None,
                group_name=synthetic_group_name,
                primary_group=primary_group_name,
                group_path=[primary_group_name, synthetic_group_name],
                parent_group_id=None,
                parent_group_name=None,
                sort_order=next(seq),
                ledger_id=ledger.id,
                ledger_name=ledger.name,
                amount=amount,
            )

            if is_income:
                income_rows.append(row)
            else:
                expense_rows.append(row)

    return income_rows, expense_rows


@router.get("/profit-and-loss-hierarchical", response_model=schemas.ProfitLossHierarchicalReport)
def profit_and_loss_hierarchical(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    employee_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    ledger_amounts = _compute_pl_ledger_amounts(
        db,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    company = _get_company(db, company_id, current_user)
    opening_as_of = from_date - timedelta(days=1)
    opening_stock = max(_inventory_value_as_of(db, company_id=company_id, as_on_date=opening_as_of), 0.0)
    closing_stock = max(_inventory_value_as_of(db, company_id=company_id, as_on_date=to_date), 0.0)

    income_rows, expense_rows = _build_profit_and_loss_hierarchical(
        db,
        company_id=company_id,
        ledger_amounts=ledger_amounts,
    )

    if opening_stock > 0:
        os_row = schemas.ProfitLossHierRow(
            row_type=schemas.TrialBalanceRowType.LEDGER,
            level=1,
            is_group=False,
            is_ledger=True,
            group_id=None,
            group_name="Opening Stock",
            primary_group="EXPENSE",
            group_path=["EXPENSE", "Opening Stock"],
            parent_group_id=None,
            parent_group_name=None,
            sort_order=0,  # Ensure it appears first
            ledger_id=None,
            ledger_name="Opening Stock",
            amount=float(opening_stock),
        )
        expense_rows = [os_row] + expense_rows

    stock_purchases = _stock_purchases_value(db, company_id=company_id, from_date=from_date, to_date=to_date)
    if stock_purchases > 0:
        sp_row = schemas.ProfitLossHierRow(
            row_type=schemas.TrialBalanceRowType.LEDGER,
            level=1,
            is_group=False,
            is_ledger=True,
            group_id=None,
            group_name="Stock Purchases",
            primary_group="EXPENSE",
            group_path=["EXPENSE", "Stock Purchases"],
            parent_group_id=None,
            parent_group_name=None,
            sort_order=1,  # Ensure it appears right after Opening Stock
            ledger_id=None,
            ledger_name="Stock Purchases",
            amount=float(stock_purchases),
        )
        # Insert after Opening Stock if it exists, otherwise at the start
        insert_idx = 1 if opening_stock > 0 else 0
        expense_rows.insert(insert_idx, sp_row)


    if closing_stock > 0:
        cs_row = schemas.ProfitLossHierRow(
            row_type=schemas.TrialBalanceRowType.LEDGER,
            level=1,
            is_group=False,
            is_ledger=True,
            group_id=None,
            group_name="Closing Stock",
            primary_group="INCOME",
            group_path=["INCOME", "Closing Stock"],
            parent_group_id=None,
            parent_group_name=None,
            sort_order=999999,  # Ensure it appears last
            ledger_id=None,
            ledger_name="Closing Stock",
            amount=float(closing_stock),
        )
        income_rows = income_rows + [cs_row]

    income_total = sum(r.amount for r in income_rows if r.is_ledger)
    expenses_total = sum(r.amount for r in expense_rows if r.is_ledger)
    net_profit_or_loss = income_total - expenses_total

    # Add an explicit balancing row so a two-column UI can show both sides balanced.
    # Keep the original totals meaning intact (raw income_total/expenses_total and net_profit_or_loss).
    balancing_row: schemas.ProfitLossHierRow | None = None
    if net_profit_or_loss > 0:
        balancing_row = schemas.ProfitLossHierRow(
            row_type=schemas.TrialBalanceRowType.TOTAL,
            level=0,
            is_group=False,
            is_ledger=False,
            group_id=None,
            group_name=None,
            primary_group="EXPENSE",
            group_path=["BALANCING"],
            parent_group_id=None,
            parent_group_name=None,
            sort_order=10**9,
            ledger_id=None,
            ledger_name="Net Profit",
            amount=float(net_profit_or_loss),
        )
        expense_rows = [*expense_rows, balancing_row]
    elif net_profit_or_loss < 0:
        balancing_row = schemas.ProfitLossHierRow(
            row_type=schemas.TrialBalanceRowType.TOTAL,
            level=0,
            is_group=False,
            is_ledger=False,
            group_id=None,
            group_name=None,
            primary_group="INCOME",
            group_path=["BALANCING"],
            parent_group_id=None,
            parent_group_name=None,
            sort_order=10**9,
            ledger_id=None,
            ledger_name="Net Loss",
            amount=float(-net_profit_or_loss),
        )
        income_rows = [*income_rows, balancing_row]

    balanced_income_total = sum(r.amount for r in income_rows if r.row_type != schemas.TrialBalanceRowType.TOTAL and r.is_group is False)
    # The above balanced_total logic is tricky because we just added a TOTAL row.
    # But wait, logic for totals was:
    
    # totals = {
    #     "income_total": income_total,
    #     # ...
    # }
    
    # We want accurate totals.
    
    # But wait, checking logic for `balanced_income_total`.
    # It seems unused or just for display?
    # Original code:
    # balanced_income_total = sum(r.amount for r in income_rows)
    
    # If we added `balancing_row`, then `balanced_income_total` will include it.
    # And it should equal `balanced_expenses_total`.
    
    # But we CANNOT sum groups.
    
    balanced_income_total = sum(r.amount for r in income_rows if r.is_ledger or r.row_type == schemas.TrialBalanceRowType.TOTAL)
    balanced_expenses_total = sum(r.amount for r in expense_rows if r.is_ledger or r.row_type == schemas.TrialBalanceRowType.TOTAL)

    totals = {
        "income_total": income_total,
        "expenses_total": expenses_total,
        "net_profit_or_loss": net_profit_or_loss,
        "balanced_income_total": balanced_income_total,
        "balanced_expenses_total": balanced_expenses_total,
    }

    return schemas.ProfitLossHierarchicalReport(
        from_date=from_date,
        to_date=to_date,
        income=income_rows,
        expenses=expense_rows,
        totals=totals,
    )


@router.get("/profit-and-loss", response_model=schemas.ProfitAndLossReport)
def profit_and_loss(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    rows: list[schemas.ProfitAndLossRow] = []

    groups = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.INCOME,
                models.LedgerGroupType.EXPENSE,
            ]),
        )
        .all()
    )

    # Track which groups/ledgers are already covered
    processed_group_ids = {g.id for g in groups}

    for group in groups:
        ledger_ids = [l.id for l in group.ledgers]
        if not ledger_ids:
            continue

        query = (
            db.query(
                func.coalesce(func.sum(models.VoucherLine.debit), 0),
                func.coalesce(func.sum(models.VoucherLine.credit), 0),
            )
            .join(models.Voucher)
            .filter(
                models.VoucherLine.ledger_id.in_(ledger_ids),
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date >= from_date,
                models.Voucher.voucher_date <= to_date,
            )
        )

        # Optional cost center filters at voucher line level
        if department_id is not None:
            query = query.filter(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            query = query.filter(models.VoucherLine.project_id == project_id)

        debits, credits = query.one()

        amount = (
            float(credits) - float(debits)
            if group.group_type == models.LedgerGroupType.INCOME
            else float(debits) - float(credits)
        )

        rows.append(
            schemas.ProfitAndLossRow(
                group_name=group.name,
                amount=amount,
                group_type=group.group_type,
            )
        )

    # Hande distinct default ledgers that might be in Asset/Liability groups (e.g. Stock Items mapped to Current Assets)
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if company:
        special_ledgers_map = {} # ledger_id -> (target_group_name, target_group_type)
        if company.default_purchase_ledger_id:
            special_ledgers_map[company.default_purchase_ledger_id] = ("Purchase Accounts", models.LedgerGroupType.EXPENSE)
        if company.default_item_expense_ledger_id:
            special_ledgers_map[company.default_item_expense_ledger_id] = ("Direct Expenses", models.LedgerGroupType.EXPENSE)
        if company.default_sales_ledger_id:
            special_ledgers_map[company.default_sales_ledger_id] = ("Sales Accounts", models.LedgerGroupType.INCOME)
        if company.default_item_income_ledger_id:
            special_ledgers_map[company.default_item_income_ledger_id] = ("Direct Income", models.LedgerGroupType.INCOME)
        
        # Check if they are already processed (i.e., their group was INCOME or EXPENSE)
        # We need to look up their group.
        special_ids = list(special_ledgers_map.keys())
        if special_ids:
            orphans = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.id.in_(special_ids),
                    models.Ledger.company_id == company_id
                )
                .all()
            )
            
            for ledger in orphans:
                if ledger.group_id in processed_group_ids:
                    continue # Already handled in the main loop
                
                # If not processed, it means the ledger is likely in Asset/Liability group.
                # calculate its amount and add a synthetic row.
                q_special = (
                    db.query(
                        func.coalesce(func.sum(models.VoucherLine.debit), 0),
                        func.coalesce(func.sum(models.VoucherLine.credit), 0),
                    )
                    .join(models.Voucher)
                    .filter(
                        models.VoucherLine.ledger_id == ledger.id,
                        models.Voucher.company_id == company_id,
                        models.Voucher.voucher_date >= from_date,
                        models.Voucher.voucher_date <= to_date,
                    )
                )
                if department_id is not None:
                    q_special = q_special.filter(models.VoucherLine.department_id == department_id)
                if project_id is not None:
                    q_special = q_special.filter(models.VoucherLine.project_id == project_id)
                
                s_debits, s_credits = q_special.one()
                
                target_name, target_type = special_ledgers_map[ledger.id]
                
                if target_type == models.LedgerGroupType.INCOME:
                    s_amount = float(s_credits) - float(s_debits)
                else:
                    s_amount = float(s_debits) - float(s_credits)
                
                if s_amount != 0:
                     rows.append(
                        schemas.ProfitAndLossRow(
                            group_name=target_name, # Use standard name so it hits GROSS PROFIT logic
                            amount=s_amount,
                            group_type=target_type,
                        )
                    )

    # Compute totals from rows
    total_income = sum(
        r.amount
        for r in rows
        if r.group_type == models.LedgerGroupType.INCOME
    )
    total_expense = sum(
        r.amount
        for r in rows
        if r.group_type == models.LedgerGroupType.EXPENSE
    )

    # Define which groups count as Sales/Revenue and base COGS for gross profit
    SALES_GROUPS = {
        "sales accounts",
        "direct income",
        "sales of goods",
        "sales",
    }
    COGS_GROUPS = {
        "direct expenses",
        "purchase accounts",
        "purchases",
        "cost of goods sold",
    }

    sales_income = sum(
        r.amount
        for r in rows
        if r.group_type == models.LedgerGroupType.INCOME
        and (r.group_name or "").lower() in SALES_GROUPS
    )
    base_cogs = sum(
        r.amount
        for r in rows
        if r.group_type == models.LedgerGroupType.EXPENSE
        and (r.group_name or "").lower() in COGS_GROUPS
    )

    # Trading-style adjustment using inventory valuation instead of stock ledgers.
    # Opening Stock = inventory value as of the day before from_date
    # Closing Stock = inventory value as of to_date
    opening_as_of = from_date - timedelta(days=1)
    opening_stock = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=opening_as_of,
    )
    closing_stock = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=to_date,
    )
    
    stock_purchases = _stock_purchases_value(db, company_id=company_id, from_date=from_date, to_date=to_date)

    effective_cogs = base_cogs + stock_purchases + max(opening_stock, 0.0) - max(closing_stock, 0.0)

    gross_profit = sales_income - effective_cogs
    # Net Profit: Total Ledger Income - Total Ledger Expense + (Closing Stock - Opening Stock) - stock_purchases
    # This aligns the calculation with the standard P&L format where Net Profit reflects inventory changes and explicit stock purchases.
    net_profit = (total_income - total_expense) + (max(closing_stock, 0.0) - max(opening_stock, 0.0)) - stock_purchases

    # Append explicit Gross Profit and Net Profit rows for UI/reporting convenience.
    rows.append(
        schemas.ProfitAndLossRow(
            group_name="Gross Profit",
            amount=gross_profit,
            group_type=models.LedgerGroupType.INCOME,
        )
    )
    rows.append(
        schemas.ProfitAndLossRow(
            group_name="Net Profit",
            amount=net_profit,
            group_type=models.LedgerGroupType.INCOME,
        )
    )

    return schemas.ProfitAndLossReport(
        from_date=from_date,
        to_date=to_date,
        rows=rows,
        gross_profit=gross_profit,
        net_profit=net_profit,
    )


@router.get("/profit-and-loss-structured")
def profit_and_loss_structured(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return a simple Tally-style two-column Profit & Loss summary.

    This is a thin wrapper around the existing profit_and_loss logic that
    reshapes the data into debit/credit sides for the frontend.
    """

    pl = profit_and_loss(
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        db=db,
        current_user=current_user,
    )

    # Opening and closing stock directly from inventory valuation.
    opening_as_of = from_date - timedelta(days=1)
    opening_stock = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=opening_as_of,
    )
    closing_stock = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=to_date,
    )

    # Aggregators
    purchase_accounts = 0.0
    direct_expenses = 0.0
    indirect_expenses = 0.0
    sales_accounts = 0.0
    indirect_incomes = 0.0

    # Classify groups
    TRADING_PURCHASE_GROUPS = {"purchase accounts", "purchases"}
    TRADING_DIRECT_EXP_GROUPS = {"direct expenses", "cost of goods sold"}
    TRADING_SALES_GROUPS = {"sales accounts", "sales", "direct income", "sales of goods"}

    for r in pl.rows:
        if r.group_name in ["Gross Profit", "Net Profit"]:
            continue # Skip synthetic summary rows from the base report to avoid double-counting

        amount = float(r.amount)
        g_name_lower = (r.group_name or "").lower()

        if r.group_type == models.LedgerGroupType.EXPENSE:
            if g_name_lower in TRADING_PURCHASE_GROUPS:
                purchase_accounts += amount
            elif g_name_lower in TRADING_DIRECT_EXP_GROUPS:
                direct_expenses += amount
            else:
                indirect_expenses += amount
        elif r.group_type == models.LedgerGroupType.INCOME:
            if g_name_lower in TRADING_SALES_GROUPS:
                sales_accounts += amount
            else:
                indirect_incomes += amount

    # Build debit side rows (left)
    debit_rows = []
    # Always include Opening Stock row; clamp negative values to zero for display.
    debit_rows.append({"label": "Opening Stock", "amount": max(opening_stock, 0.0)})

    stock_purchases = _stock_purchases_value(db, company_id=company_id, from_date=from_date, to_date=to_date)
    if stock_purchases > 0:
        debit_rows.append({"label": "Stock Purchases", "amount": stock_purchases})

    if purchase_accounts != 0:
        debit_rows.append({"label": "Purchase Accounts", "amount": purchase_accounts})
    if direct_expenses != 0:
        debit_rows.append({"label": "Direct Expenses", "amount": direct_expenses})

    # Build credit side rows (right)
    credit_rows = []
    if sales_accounts != 0:
        credit_rows.append({"label": "Sales Accounts", "amount": sales_accounts})
    # Always include Closing Stock row; clamp negative values to zero for display.
    credit_rows.append({"label": "Closing Stock", "amount": max(closing_stock, 0.0)})

    # 1) Trading section balancing (Gross Profit / Gross Loss)
    debit_total = float(sum(r["amount"] for r in debit_rows))
    credit_total = float(sum(r["amount"] for r in credit_rows))
    gross = float(credit_total - debit_total)

    if gross > 0:
        debit_rows.append({"label": "Gross Profit c/o", "amount": gross})
        credit_rows.append({"label": "Gross Profit b/f", "amount": gross})
    elif gross < 0:
        gross_loss = float(-gross)
        credit_rows.append({"label": "Gross Loss c/o", "amount": gross_loss})
        debit_rows.append({"label": "Gross Loss b/f", "amount": gross_loss})

    # 2) Add indirect items (P&L section)
    if indirect_expenses != 0:
        debit_rows.append({"label": "Indirect Expenses", "amount": indirect_expenses})
    if indirect_incomes != 0:
        credit_rows.append({"label": "Indirect Incomes", "amount": indirect_incomes})

    # 3) Net balancing (Net Profit / Net Loss)
    debit_total = float(sum(r["amount"] for r in debit_rows))
    credit_total = float(sum(r["amount"] for r in credit_rows))
    net = float(credit_total - debit_total)

    if net > 0:
        debit_rows.append({"label": "Nett Profit", "amount": net})
    elif net < 0:
        credit_rows.append({"label": "Nett Loss", "amount": float(-net)})

    debit_total = float(sum(r["amount"] for r in debit_rows))
    credit_total = float(sum(r["amount"] for r in credit_rows))

    return {
        "from_date": from_date,
        "to_date": to_date,
        "debit": {"title": "Debit", "rows": debit_rows, "total": debit_total},
        "credit": {"title": "Credit", "rows": credit_rows, "total": credit_total},
    }


@router.get("/profit-and-loss-comparison")
def profit_and_loss_comparison(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    dimension: str = Query(..., regex="^(department|project)$"),
    ids: str = Query(..., description="CSV of numeric IDs, e.g. '1,2,5'"),
    level: str = Query("group", regex="^(group|ledger)$"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Compare P&L across multiple departments/projects side-by-side.

    Returns one row per group/ledger with columns per selected cost center and
    per-cost-center / overall income, expense, and net_profit totals.
    """

    _get_company(db, company_id, current_user)

    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    # Parse and validate ids CSV
    try:
        raw_ids = [s.strip() for s in ids.split(",") if s.strip()]
        id_list = [int(s) for s in raw_ids]
    except ValueError:
        raise HTTPException(status_code=400, detail="ids must be a comma-separated list of integers")

    if not id_list:
        raise HTTPException(status_code=400, detail="ids cannot be empty")

    # Optional hard limit to prevent huge comparison tables
    if len(id_list) > 10:
        raise HTTPException(status_code=400, detail="You can compare at most 10 cost centers at once")

    # Load labels from master tables
    labels: dict[str, str] = {}
    if dimension == "department":
        rows = (
            db.query(models.Department.id, models.Department.name)
            .filter(
                models.Department.company_id == company_id,
                models.Department.id.in_(id_list),
            )
            .all()
        )
    else:  # dimension == "project"
        rows = (
            db.query(models.Project.id, models.Project.name)
            .filter(
                models.Project.company_id == company_id,
                models.Project.id.in_(id_list),
            )
            .all()
        )

    found_ids = {row.id for row in rows}
    missing_ids = [i for i in id_list if i not in found_ids]
    if missing_ids:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown {dimension} ids: {missing_ids}",
        )

    for row in rows:
        labels[str(row.id)] = row.name

    # Preload ledgers with their groups so we can aggregate by group or ledger
    ledgers = (
        db.query(models.Ledger)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(models.Ledger.company_id == company_id)
        .all()
    )

    # rows_map[(kind, key_id)] -> accumulator
    rows_map: dict[tuple[str, int], dict] = {}

    # Initialize per-cost-center totals
    per_cc_totals: dict[str, dict[str, float]] = {
        str(cc_id): {"income": 0.0, "expense": 0.0, "net_profit": 0.0}
        for cc_id in id_list
    }

    for cc_id in id_list:
        if dimension == "department":
            ledger_amounts = _compute_pl_ledger_amounts(
                db,
                company_id=company_id,
                from_date=from_date,
                to_date=to_date,
                department_id=cc_id,
                project_id=None,
            )
        else:
            ledger_amounts = _compute_pl_ledger_amounts(
                db,
                company_id=company_id,
                from_date=from_date,
                to_date=to_date,
                department_id=None,
                project_id=cc_id,
            )

        cc_key = str(cc_id)

        for ledger in ledgers:
            amount = ledger_amounts.get(ledger.id)
            if amount is None or amount == 0.0:
                continue

            group = ledger.group
            group_type = group.group_type  # INCOME or EXPENSE

            if level == "group":
                row_key = ("group", group.id)
                key_value = group.id
                label = group.name
            else:  # level == "ledger"
                row_key = ("ledger", ledger.id)
                key_value = ledger.id
                label = ledger.name

            if row_key not in rows_map:
                rows_map[row_key] = {
                    "key": str(key_value),
                    "label": label,
                    "group_type": group_type,
                    "values": {str(i): 0.0 for i in id_list},
                    "total": 0.0,
                }

            row_acc = rows_map[row_key]
            row_acc["values"][cc_key] += float(amount)
            row_acc["total"] += float(amount)

            # Update per-cost-center income/expense totals
            if group_type == models.LedgerGroupType.INCOME:
                per_cc_totals[cc_key]["income"] += float(amount)
            else:
                per_cc_totals[cc_key]["expense"] += float(amount)

    # Compute net_profit per cost center and overall totals
    overall_income = 0.0
    overall_expense = 0.0
    for cc_key, t in per_cc_totals.items():
        t["net_profit"] = t["income"] - t["expense"]
        overall_income += t["income"]
        overall_expense += t["expense"]

    overall_totals = {
        "income": overall_income,
        "expense": overall_expense,
        "net_profit": overall_income - overall_expense,
    }

    # Normalize rows list in a stable order (by label)
    rows_out = sorted(rows_map.values(), key=lambda r: r["label"])

    return {
        "from_date": from_date,
        "to_date": to_date,
        "dimension": dimension,
        "ids": id_list,
        "labels": labels,
        "level": level,
        "rows": rows_out,
        "totals": {
            "per_cost_center": per_cc_totals,
            "overall": overall_totals,
        },
    }


def _get_basic_classification(group: models.LedgerGroup) -> str:
    name = group.name.lower()
    if group.group_type == models.LedgerGroupType.ASSET:
        if any(x in name for x in ["fixed", "investment", "long-term", "non-current"]):
            return "Non-Current"
        return "Current"
    else:
        if any(x in name for x in ["capital", "reserve", "surplus", "equity"]):
            return "Equity"
        if any(x in name for x in ["long-term", "loan (secured)", "unsecured"]):
            return "Non-Current"
        return "Current"


def _compute_opening_balance_difference(db: Session, company_id: int) -> float:
    all_ledgers = db.query(models.Ledger).filter(models.Ledger.company_id == company_id).all()
    opening_debit_total = 0.0
    opening_credit_total = 0.0
    for l in all_ledgers:
        if l.opening_balance_type == models.OpeningBalanceType.DEBIT:
            opening_debit_total += float(l.opening_balance)
        else:
            opening_credit_total += float(l.opening_balance)
    return opening_debit_total - opening_credit_total


@router.get("/balance-sheet", response_model=schemas.BalanceSheetReport)
def balance_sheet(
    company_id: int,
    as_on_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    # Fiscal year boundaries from company settings.
    # opening_balance on each ledger represents the balance AS OF fiscal_year_start.
    # Only vouchers from fiscal_year_start onwards are added to that opening balance.
    fiscal_year_start: date | None = company.fiscal_year_start
    fiscal_year_end: date | None = company.fiscal_year_end

    # Cap the effective date at fiscal year end (if configured)
    effective_to = as_on_date
    if fiscal_year_end is not None and effective_to > fiscal_year_end:
        effective_to = fiscal_year_end

    # ------------------------------------------------------------------
    # Step 1: Fetch all ASSET / LIABILITY ledgers with their groups
    # ------------------------------------------------------------------
    ledgers = (
        db.query(models.Ledger)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.ASSET,
                models.LedgerGroupType.LIABILITY,
            ]),
        )
        .all()
    )

    # ------------------------------------------------------------------
    # Step 2: Build a map from group_id -> root group (for display)
    #         so we can aggregate ledgers under their top-level group.
    # ------------------------------------------------------------------
    all_groups = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.ASSET,
                models.LedgerGroupType.LIABILITY,
            ]),
        )
        .all()
    )
    group_by_id = {g.id: g for g in all_groups}
    asset_liability_ids = {g.id for g in all_groups}

    def get_root_group(group: models.LedgerGroup) -> models.LedgerGroup:
        """Walk up the parent chain to find the group at the display root (e.g. Fixed Assets, Capital Account)."""
        CONTAINER_NAMES = {"assets", "liabilities", "owner's equity", "owner’s equity", "equity"}
        current = group
        while current.parent_group_id and current.parent_group_id in asset_liability_ids:
            parent = group_by_id.get(current.parent_group_id)
            if not parent:
                break
            # If parent is a container (Assets/Liabilities) or a root, stop here so 'current' is the visible root.
            if not parent.parent_group_id or parent.parent_group_id not in asset_liability_ids or parent.name.lower().strip() in CONTAINER_NAMES:
                break
            current = parent
        return current

    # ------------------------------------------------------------------
    # Step 3: Identify ledgers to SKIP (Stock/Inventory groups — replaced
    #         by real-time inventory valuation)
    # ------------------------------------------------------------------
    skip_group_ids: set[int] = set()
    for g in all_groups:
        name_lower = g.name.lower()
        if "stock" in name_lower or "inventory" in name_lower:
            skip_group_ids.add(g.id)

    # ------------------------------------------------------------------
    # Step 4: Per-ledger balance calculation, aggregated by root group
    # ------------------------------------------------------------------
    # group_id -> {"amount": float, "group": LedgerGroup}
    group_totals: dict[int, dict] = {}

    for ledger in ledgers:
        # Skip stock/inventory groups (handled separately)
        if ledger.group_id in skip_group_ids:
            continue

        voucher_query = (
            db.query(
                func.coalesce(func.sum(models.VoucherLine.debit), 0),
                func.coalesce(func.sum(models.VoucherLine.credit), 0),
            )
            .join(models.Voucher)
            .filter(
                models.VoucherLine.ledger_id == ledger.id,
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date <= effective_to,
            )
        )
        # Only include vouchers within the current fiscal year
        if fiscal_year_start is not None:
            voucher_query = voucher_query.filter(models.Voucher.voucher_date >= fiscal_year_start)

        debits, credits = voucher_query.one()

        if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT:
            opening = float(ledger.opening_balance)
        else:
            opening = -float(ledger.opening_balance)

        # Raw balance: debit-positive, credit-positive for asset ledger
        balance = opening + float(debits) - float(credits)

        group = group_by_id.get(ledger.group_id)
        if not group:
            continue

        root = get_root_group(group)

        # Sign convention: for Asset groups, positive balance = asset amount.
        # For Liability groups, positive balance = credit = liability amount.
        if root.group_type == models.LedgerGroupType.ASSET:
            amount = balance        # debit balance = positive asset
        else:
            amount = -balance       # credit balance = positive liability

        if root.id not in group_totals:
            group_totals[root.id] = {"amount": 0.0, "group": root}
        group_totals[root.id]["amount"] += amount

    # ------------------------------------------------------------------
    # Step 5: Build rows from aggregated group totals
    # ------------------------------------------------------------------
    rows: list[schemas.BalanceSheetRow] = []
    for entry in group_totals.values():
        grp = entry["group"]
        amt = entry["amount"]
        PRESERVE_NAMES = {"capital account", "equity", "share capital", "reserves & surplus", "owner's equity", "owner’s equity"}
        if amt == 0 and grp.name.lower().strip() not in PRESERVE_NAMES:
            continue
        rows.append(
            schemas.BalanceSheetRow(
                group_name=grp.name,
                amount=amt,
                group_type=grp.group_type,
                classification=_get_basic_classification(grp),
            )
        )

    # ------------------------------------------------------------------
    # Step 6: Inject Closing Stock (inventory valuation)
    # ------------------------------------------------------------------
    inventory_value = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=effective_to,
    )
    if inventory_value != 0:
        rows.append(
            schemas.BalanceSheetRow(
                group_name="Closing Stock",
                amount=inventory_value,
                group_type=models.LedgerGroupType.ASSET,
                classification="Current",
            )
        )

    # ------------------------------------------------------------------
    # Step 7: Inject Net Profit / Net Loss from P&L
    #   Profit is a LIABILITY (credit to retained earnings / capital)
    #   Loss   is an ASSET    (debit against retained earnings)
    # ------------------------------------------------------------------
    # Use the company's fiscal year start; fall back to Jan 1 of the current year
    pl_from = fiscal_year_start or date(effective_to.year, 1, 1)
    pl_result = compute_profit_and_loss(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=pl_from,
        to_date=effective_to,
        department_id=None,
        project_id=None,
    )
    # balancing_entry.label is "Net Profit" or "Net Loss"
    if pl_result.balancing_entry.label.lower().startswith("net profit"):
        net_profit = pl_result.balancing_entry.amount     # positive profit
    else:
        net_profit = -pl_result.balancing_entry.amount    # negative = loss

    if net_profit != 0:
        if net_profit > 0:
            rows.append(
                schemas.BalanceSheetRow(
                    group_name="Profit & Loss A/c (Current Year)",
                    amount=net_profit,
                    group_type=models.LedgerGroupType.LIABILITY,
                    classification="Equity",
                )
            )
        else:
            rows.append(
                schemas.BalanceSheetRow(
                    group_name="Profit & Loss A/c (Current Year)",
                    amount=-net_profit,
                    group_type=models.LedgerGroupType.ASSET,
                    classification="Current",
                )
            )

    return schemas.BalanceSheetReport(as_on_date=as_on_date, rows=rows)


@router.get("/balance-sheet-structured", response_model=schemas.BalanceSheetTallyStyleReport)
def balance_sheet_structured(
    company_id: int,
    as_on_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    # Fiscal year boundaries from company settings.
    # opening_balance on each ledger represents the balance AS OF fiscal_year_start.
    fiscal_year_start: date | None = company.fiscal_year_start
    fiscal_year_end: date | None = company.fiscal_year_end

    # Cap the effective date at fiscal year end (if configured)
    effective_to = as_on_date
    if fiscal_year_end is not None and effective_to > fiscal_year_end:
        effective_to = fiscal_year_end

    # ------------------------------------------------------------------
    # Step 1: Fetch all ASSET / LIABILITY ledgers
    # ------------------------------------------------------------------
    ledgers = (
        db.query(models.Ledger)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.ASSET,
                models.LedgerGroupType.LIABILITY,
            ]),
        )
        .all()
    )

    all_groups = (
        db.query(models.LedgerGroup)
        .filter(
            models.LedgerGroup.company_id == company_id,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.ASSET,
                models.LedgerGroupType.LIABILITY,
            ]),
        )
        .all()
    )
    group_by_id = {g.id: g for g in all_groups}
    asset_liability_ids = {g.id for g in all_groups}

    def get_root_group_s(group: models.LedgerGroup) -> models.LedgerGroup:
        """Walk up to the first-level breakdown under Assets/Liabilities."""
        current = group
        while current.parent_group_id and current.parent_group_id in asset_liability_ids:
            parent = group_by_id.get(current.parent_group_id)
            if not parent:
                break
            if not parent.parent_group_id or parent.parent_group_id not in asset_liability_ids:
                break
            current = parent
        return current

    # Skip stock/inventory groups — replaced by inventory valuation
    skip_group_ids: set[int] = set()
    for g in all_groups:
        name_lower = g.name.lower()
        if "stock" in name_lower or "inventory" in name_lower:
            skip_group_ids.add(g.id)

    # ------------------------------------------------------------------
    # Step 2: Per-ledger balance, aggregated by root group
    # ------------------------------------------------------------------
    group_totals: dict[int, dict] = {}

    for ledger in ledgers:
        if ledger.group_id in skip_group_ids:
            continue

        voucher_query = (
            db.query(
                func.coalesce(func.sum(models.VoucherLine.debit), 0),
                func.coalesce(func.sum(models.VoucherLine.credit), 0),
            )
            .join(models.Voucher)
            .filter(
                models.VoucherLine.ledger_id == ledger.id,
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date <= effective_to,
            )
        )
        # Only include vouchers within the current fiscal year
        if fiscal_year_start is not None:
            voucher_query = voucher_query.filter(models.Voucher.voucher_date >= fiscal_year_start)

        debits, credits = voucher_query.one()

        if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT:
            opening = float(ledger.opening_balance)
        else:
            opening = -float(ledger.opening_balance)

        balance = opening + float(debits) - float(credits)

        group = group_by_id.get(ledger.group_id)
        if not group:
            continue
        root = get_root_group_s(group)

        if root.group_type == models.LedgerGroupType.ASSET:
            amount = balance
        else:
            amount = -balance

        if root.id not in group_totals:
            group_totals[root.id] = {"amount": 0.0, "group": root}
        group_totals[root.id]["amount"] += amount

    # ------------------------------------------------------------------
    # Step 3: Build flat rows from aggregated root-group totals
    # ------------------------------------------------------------------
    def _classify(g: models.LedgerGroup) -> str:
        name = g.name.lower()
        if g.group_type == models.LedgerGroupType.ASSET:
            if any(x in name for x in ["fixed", "investment", "long-term", "non-current"]):
                return "Non-Current"
            return "Current"
        else:
            if any(x in name for x in ["capital", "reserve", "surplus", "equity"]):
                return "Equity"
            if any(x in name for x in ["long-term", "loan (secured)", "unsecured"]):
                return "Non-Current"
            return "Current"

    rows: list[schemas.BalanceSheetRow] = []
    for entry in group_totals.values():
        grp = entry["group"]
        amt = entry["amount"]
        if abs(amt) < 1e-9:
            continue
        rows.append(
            schemas.BalanceSheetRow(
                group_name=grp.name,
                amount=amt,
                group_type=grp.group_type,
                classification=_classify(grp),
            )
        )

    # ------------------------------------------------------------------
    # Step 4: Inject Closing Stock (inventory valuation)
    # ------------------------------------------------------------------
    inventory_value = _inventory_value_as_of(
        db,
        company_id=company_id,
        as_on_date=effective_to,
    )
    if inventory_value != 0:
        rows.append(
            schemas.BalanceSheetRow(
                group_name="Stock in Hand (Inventory)",
                amount=inventory_value,
                group_type=models.LedgerGroupType.ASSET,
                classification="Current",
            )
        )

    # ------------------------------------------------------------------
    # Step 5: Inject Net Profit / Net Loss
    # ------------------------------------------------------------------
    # Use the company's fiscal year start; fall back to Jan 1 of the current year
    pl_from = fiscal_year_start or date(effective_to.year, 1, 1)
    pl_result = compute_profit_and_loss(
        db,
        tenant_id=int(company.tenant_id),
        company_id=company_id,
        from_date=pl_from,
        to_date=effective_to,
        department_id=None,
        project_id=None,
    )
    if pl_result.balancing_entry.label.lower().startswith("net profit"):
        net_profit = pl_result.balancing_entry.amount
    else:
        net_profit = -pl_result.balancing_entry.amount

    if net_profit != 0:
        if net_profit > 0:
            rows.append(
                schemas.BalanceSheetRow(
                    group_name="Profit & Loss A/c (Current Year)",
                    amount=net_profit,
                    group_type=models.LedgerGroupType.LIABILITY,
                    classification="Equity",
                )
            )
        else:
            rows.append(
                schemas.BalanceSheetRow(
                    group_name="Profit & Loss A/c (Current Year)",
                    amount=-net_profit,
                    group_type=models.LedgerGroupType.ASSET,
                    classification="Current",
                )
            )

    # ------------------------------------------------------------------
    # Step 6: Split into liability/asset sides
    # ------------------------------------------------------------------
    liability_rows: list[schemas.BalanceSheetSideRow] = []
    asset_rows: list[schemas.BalanceSheetSideRow] = []

    for row in rows:
        label = row.group_name
        if row.classification:
            label = f"{label} ({row.classification})"
        if row.group_type == models.LedgerGroupType.LIABILITY:
            liability_rows.append(schemas.BalanceSheetSideRow(group_name=label, amount=row.amount))
        else:
            asset_rows.append(schemas.BalanceSheetSideRow(group_name=label, amount=row.amount))

    liabilities_total = sum(r.amount for r in liability_rows)
    assets_total = sum(r.amount for r in asset_rows)

    # Opening balance difference (for reference only, doesn't affect totals)
    all_ledgers_ob = db.query(models.Ledger).filter(models.Ledger.company_id == company_id).all()
    ob_debit = sum(float(l.opening_balance) for l in all_ledgers_ob if l.opening_balance_type == models.OpeningBalanceType.DEBIT)
    ob_credit = sum(float(l.opening_balance) for l in all_ledgers_ob if l.opening_balance_type == models.OpeningBalanceType.CREDIT)
    opening_diff = ob_debit - ob_credit

    return schemas.BalanceSheetTallyStyleReport(
        as_on_date=as_on_date,
        liabilities=schemas.BalanceSheetSide(title="Liabilities", rows=liability_rows, total=liabilities_total),
        assets=schemas.BalanceSheetSide(title="Assets", rows=asset_rows, total=assets_total),
        totals=schemas.BalanceSheetTotals(
            liabilities_total=liabilities_total,
            assets_total=assets_total,
            difference_in_opening_balance=opening_diff,
        ),
    )


@router.get("/income-expense-summary", response_model=schemas.IncomeExpenseReport)
def income_expense_summary(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get income and expense summary grouped by department and project.
    
    This report aggregates voucher lines within the date range and categorizes
    them as income or expense based on their ledger's group type.
    
    Filters:
    - date range (required)
    - department_id (optional) - filter to specific department
    - project_id (optional) - filter to specific project
    """
    _get_company(db, company_id, current_user)
    
    # Build base query for voucher lines with joins
    query = (
        db.query(
            models.VoucherLine.department_id,
            models.Department.name.label("department_name"),
            models.VoucherLine.project_id,
            models.Project.name.label("project_name"),
            models.LedgerGroup.group_type,
            func.coalesce(func.sum(models.VoucherLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(models.VoucherLine.credit), 0).label("total_credit"),
        )
        .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
        .join(models.Ledger, models.Ledger.id == models.VoucherLine.ledger_id)
        .join(models.LedgerGroup, models.LedgerGroup.id == models.Ledger.group_id)
        .outerjoin(models.Department, models.Department.id == models.VoucherLine.department_id)
        .outerjoin(models.Project, models.Project.id == models.VoucherLine.project_id)
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
            models.LedgerGroup.group_type.in_([
                models.LedgerGroupType.INCOME,
                models.LedgerGroupType.EXPENSE
            ])
        )
    )
    
    # Apply optional filters
    if department_id is not None:
        query = query.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        query = query.filter(models.VoucherLine.project_id == project_id)
    
    # Group by department, project, and ledger group type
    results = query.group_by(
        models.VoucherLine.department_id,
        models.Department.name,
        models.VoucherLine.project_id,
        models.Project.name,
        models.LedgerGroup.group_type,
    ).all()
    
    # Aggregate by department/project combination
    aggregated: dict[tuple[int | None, int | None], dict] = {}
    
    for row in results:
        key = (row.department_id, row.project_id)
        
        if key not in aggregated:
            aggregated[key] = {
                "department_id": row.department_id,
                "department_name": row.department_name,
                "project_id": row.project_id,
                "project_name": row.project_name,
                "income": 0.0,
                "expense": 0.0,
            }
        
        # Categorize as income or expense based on group type
        if row.group_type == models.LedgerGroupType.INCOME:
            # Income groups: credit increases income
            aggregated[key]["income"] += float(row.total_credit or 0) - float(row.total_debit or 0)
        elif row.group_type == models.LedgerGroupType.EXPENSE:
            # Expense groups: debit increases expense
            aggregated[key]["expense"] += float(row.total_debit or 0) - float(row.total_credit or 0)
    
    # Convert to list of rows and calculate totals
    rows: list[schemas.IncomeExpenseCategoryRow] = []
    total_income = 0.0
    total_expense = 0.0
    
    for data in aggregated.values():
        income = data["income"]
        expense = data["expense"]
        net = income - expense
        
        total_income += income
        total_expense += expense
        
        rows.append(
            schemas.IncomeExpenseCategoryRow(
                department_id=data["department_id"],
                department_name=data["department_name"],
                project_id=data["project_id"],
                project_name=data["project_name"],
                income=income,
                expense=expense,
                net=net,
            )
        )
    
    # Sort by net (highest to lowest)
    rows.sort(key=lambda r: r.net, reverse=True)
    

    return schemas.IncomeExpenseReport(
        from_date=from_date,
        to_date=to_date,
        rows=rows,
        total_income=total_income,
        total_expense=total_expense,
        total_net=total_income - total_expense,
    )

@router.get("/monthly-income-expense")
def monthly_income_expense(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    group_by: str | None = Query(None),  # "department" or "project"
    calendar_mode: str = Query("AD"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    import nepali_datetime

    # ------------------------------------------------------------------ #
    # When group_by is set, add department/project as extra dimension     #
    # ------------------------------------------------------------------ #
    if group_by in ("department", "project"):
        if group_by == "project":
            dimension_col = models.VoucherLine.project_id
            dimension_name_col = models.Project.name.label("dimension_name")
            join_target = (models.Project, models.VoucherLine.project_id == models.Project.id)
        else:
            dimension_col = models.VoucherLine.department_id
            dimension_name_col = models.Department.name.label("dimension_name")
            join_target = (models.Department, models.VoucherLine.department_id == models.Department.id)

        query = (
            db.query(
                models.Voucher.voucher_date,
                models.LedgerGroup.name.label("group_name"),
                models.LedgerGroup.group_type,
                models.Ledger.name.label("ledger_name"),
                models.VoucherLine.department_id,
                models.Department.name.label("department_name"),
                models.VoucherLine.project_id,
                models.Project.name.label("project_name"),
                dimension_col.label("dimension_id"),
                dimension_name_col,
                func.sum(models.VoucherLine.debit).label("total_debit"),
                func.sum(models.VoucherLine.credit).label("total_credit"),
            )
            .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
            .join(models.Ledger, models.VoucherLine.ledger_id == models.Ledger.id)
            .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
            .outerjoin(models.Department, models.VoucherLine.department_id == models.Department.id)
            .outerjoin(models.Project, models.VoucherLine.project_id == models.Project.id)
            .filter(
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date >= from_date,
                models.Voucher.voucher_date <= to_date,
                models.LedgerGroup.group_type.in_([models.LedgerGroupType.INCOME, models.LedgerGroupType.EXPENSE])
            )
        )

        if department_id is not None:
            query = query.filter(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            query = query.filter(models.VoucherLine.project_id == project_id)

        query = query.group_by(
            models.Voucher.voucher_date,
            models.LedgerGroup.name,
            models.LedgerGroup.group_type,
            models.Ledger.name,
            models.VoucherLine.department_id,
            models.Department.name,
            models.VoucherLine.project_id,
            models.Project.name,
            dimension_col,
            dimension_name_col,
        )

        results = query.all()
        rows = []
        for row in results:
            d = row.voucher_date
            if calendar_mode == "BS":
                bs_date = nepali_datetime.date.from_datetime_date(d)
                month_key = f"{bs_date.year:04d}-{bs_date.month:02d}"
            else:
                month_key = f"{d.year:04d}-{d.month:02d}"

            grp_type = row.group_type
            amount = 0.0
            if grp_type == models.LedgerGroupType.INCOME:
                amount = float(row.total_credit or 0) - float(row.total_debit or 0)
            elif grp_type == models.LedgerGroupType.EXPENSE:
                amount = float(row.total_debit or 0) - float(row.total_credit or 0)

            if amount != 0:
                rows.append({
                    "group_name": row.group_name,
                    "group_type": grp_type.name,
                    "ledger_name": row.ledger_name,
                    "month_key": month_key,
                    "department_id": row.department_id,
                    "department_name": row.department_name,
                    "project_id": row.project_id,
                    "project_name": row.project_name,
                    "dimension_name": row.dimension_name or f"(No {group_by.title()})",
                    "amount": amount,
                })

        return {"data": rows}

    # ------------------------------------------------------------------ #
    # Normal mode: no dimension breakdown                                 #
    # ------------------------------------------------------------------ #
    query = (
        db.query(
            models.Voucher.voucher_date,
            models.LedgerGroup.name.label("group_name"),
            models.LedgerGroup.group_type,
            models.Ledger.name.label("ledger_name"),
            models.VoucherLine.department_id,
            models.Department.name.label("department_name"),
            models.VoucherLine.project_id,
            models.Project.name.label("project_name"),
            func.sum(models.VoucherLine.debit).label("total_debit"),
            func.sum(models.VoucherLine.credit).label("total_credit"),
        )
        .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
        .join(models.Ledger, models.VoucherLine.ledger_id == models.Ledger.id)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .outerjoin(models.Department, models.VoucherLine.department_id == models.Department.id)
        .outerjoin(models.Project, models.VoucherLine.project_id == models.Project.id)
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
            models.LedgerGroup.group_type.in_([models.LedgerGroupType.INCOME, models.LedgerGroupType.EXPENSE])
        )
    )

    if department_id is not None:
        query = query.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        query = query.filter(models.VoucherLine.project_id == project_id)

    query = query.group_by(
        models.Voucher.voucher_date,
        models.LedgerGroup.name,
        models.LedgerGroup.group_type,
        models.Ledger.name,
        models.VoucherLine.department_id,
        models.Department.name,
        models.VoucherLine.project_id,
        models.Project.name,
    )

    results = query.all()

    rows = []

    for row in results:
        d = row.voucher_date
        if calendar_mode == "BS":
            bs_date = nepali_datetime.date.from_datetime_date(d)
            month_key = f"{bs_date.year:04d}-{bs_date.month:02d}"
        else:
            month_key = f"{d.year:04d}-{d.month:02d}"

        group_type = row.group_type
        amount = 0.0
        if group_type == models.LedgerGroupType.INCOME:
            amount = float(row.total_credit or 0) - float(row.total_debit or 0)
        elif group_type == models.LedgerGroupType.EXPENSE:
            amount = float(row.total_debit or 0) - float(row.total_credit or 0)

        if amount != 0:
            rows.append({
                "group_name": row.group_name,
                "group_type": group_type.name,
                "ledger_name": row.ledger_name,
                "month_key": month_key,
                "department_id": row.department_id,
                "department_name": row.department_name,
                "project_id": row.project_id,
                "project_name": row.project_name,
                "amount": amount
            })

    return {"data": rows}

@router.get("/mis-cash-flow")
def mis_cash_flow(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    group_by: str | None = Query(None),
    calendar_mode: str = Query("AD"),
    account_type: str = Query("all"),  # "all", "cash", "bank"
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    import nepali_datetime

    # Filter by group names: Cash in Hand, Bank Accounts
    allowed_groups = []
    if account_type in ("all", "cash"):
        allowed_groups.extend(["CASH IN HAND", "CASH-IN-HAND", "CASH"])
    if account_type in ("all", "bank"):
        allowed_groups.extend(["BANK ACCOUNTS", "BANK ACCOUNT", "BANK"])

    # Fallback if empty (should not happen from UI)
    if not allowed_groups:
        allowed_groups = ["CASH IN HAND", "CASH-IN-HAND", "BANK ACCOUNTS", "BANK ACCOUNT"]

    # Retrieve group IDs
    target_groups = db.query(models.LedgerGroup.id, models.LedgerGroup.name).filter(
        models.LedgerGroup.company_id == company_id,
        func.upper(models.LedgerGroup.name).in_(allowed_groups)
    ).all()
    
    target_group_ids = [g.id for g in target_groups]
    target_group_names = {g.id: g.name for g in target_groups}

    if not target_group_ids:
        return {"data": [], "opening_balance": 0.0, "opening_ledger_breakdown": []}

    SourceLine = aliased(models.VoucherLine)
    SourceLedger = aliased(models.Ledger)

    # Calculate opening balance for cash/bank as of from_date.
    # Single batched query instead of one query per ledger (was N+1).
    all_cash_ledgers = db.query(models.Ledger).filter(
        models.Ledger.company_id == company_id,
        models.Ledger.group_id.in_(target_group_ids)
    ).all()

    cash_ledger_ids = [l.id for l in all_cash_ledgers]
    cash_ledger_map = {l.id: l for l in all_cash_ledgers}

    # One aggregated query grouped by ledger_id replaces the per-ledger loop.
    movement_rows = (
        db.query(
            models.VoucherLine.ledger_id,
            func.coalesce(func.sum(models.VoucherLine.debit), 0).label("total_debit"),
            func.coalesce(func.sum(models.VoucherLine.credit), 0).label("total_credit"),
        )
        .join(models.Voucher)
        .filter(
            models.VoucherLine.ledger_id.in_(cash_ledger_ids),
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date < from_date,
        )
        .group_by(models.VoucherLine.ledger_id)
        .all()
    )
    movements = {row.ledger_id: (float(row.total_debit), float(row.total_credit)) for row in movement_rows}

    initial_opening = 0.0
    opening_ledger_breakdown = []
    for l in all_cash_ledgers:
        debits, credits = movements.get(l.id, (0.0, 0.0))
        ob = float(l.opening_balance) if l.opening_balance_type == models.OpeningBalanceType.DEBIT else -float(l.opening_balance)
        bal = ob + debits - credits
        initial_opening += bal

        if bal != 0:
            opening_ledger_breakdown.append({
                "ledger_name": l.name,
                "amount": bal
            })

    # Identify voucher IDs that involve these cash/bank groups
    cash_vouchers_sub = db.query(models.VoucherLine.voucher_id).join(models.Voucher).join(models.Ledger).filter(
        models.Voucher.company_id == company_id,
        models.Ledger.group_id.in_(target_group_ids)
    ).distinct().subquery()

    # Helper for building the core query
    def build_query(with_dimension=False):
        if with_dimension:
            if group_by == "project":
                dim_col = models.VoucherLine.project_id
                dim_name_col = models.Project.name.label("dimension_name")
                join_target = (models.Project, models.VoucherLine.project_id == models.Project.id)
            else:
                dim_col = models.VoucherLine.department_id
                dim_name_col = models.Department.name.label("dimension_name")
                join_target = (models.Department, models.VoucherLine.department_id == models.Department.id)

            select_cols = [
                models.Voucher.voucher_date,
                models.LedgerGroup.name.label("group_name"),
                models.Ledger.name.label("ledger_name"),
                SourceLedger.name.label("bank_name"),
                dim_col.label("dimension_id"),
                dim_name_col,
                func.sum(models.VoucherLine.debit).label("total_debit"),
                func.sum(models.VoucherLine.credit).label("total_credit"),
            ]
        else:
            select_cols = [
                models.Voucher.voucher_date,
                models.LedgerGroup.name.label("group_name"),
                models.Ledger.name.label("ledger_name"),
                SourceLedger.name.label("bank_name"),
                func.sum(models.VoucherLine.debit).label("total_debit"),
                func.sum(models.VoucherLine.credit).label("total_credit"),
            ]

        q = (
            db.query(*select_cols)
            .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
            .join(models.Ledger, models.VoucherLine.ledger_id == models.Ledger.id)
            .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
            .join(SourceLine, SourceLine.voucher_id == models.VoucherLine.voucher_id)
            .join(SourceLedger, SourceLine.ledger_id == SourceLedger.id)
            .filter(
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date >= from_date,
                models.Voucher.voucher_date <= to_date,
                models.Voucher.id.in_(cash_vouchers_sub),
                ~models.Ledger.group_id.in_(target_group_ids), # Party side
                SourceLedger.group_id.in_(target_group_ids)    # Cash/Bank side
            )
        )

        if with_dimension:
            q = q.outerjoin(*join_target)

        if department_id is not None:
            q = q.filter(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            q = q.filter(models.VoucherLine.project_id == project_id)

        # Group by all selected
        if with_dimension:
            q = q.group_by(models.Voucher.voucher_date, models.LedgerGroup.name, models.Ledger.name, SourceLedger.name, dim_col, dim_name_col)
        else:
            q = q.group_by(models.Voucher.voucher_date, models.LedgerGroup.name, models.Ledger.name, SourceLedger.name)

        return q

    # Run query based on grouping
    with_dim = group_by in ("department", "project")
    results = build_query(with_dimension=with_dim).all()

    rows = []
    for r in results:
        d = r.voucher_date
        if calendar_mode == "BS":
            bs_date = nepali_datetime.date.from_datetime_date(d)
            month_key = f"{bs_date.year:04d}-{bs_date.month:02d}"
        else:
            month_key = f"{d.year:04d}-{d.month:02d}"

        # In the context of contra-ledgers in a Cash Flow report:
        # A Debit on the contra-side means a Credit on the cash-side -> OUTFLOW
        # A Credit on the contra-side means a Debit on the cash-side -> INFLOW
        
        debit = float(r.total_debit or 0)
        credit = float(r.total_credit or 0)
        
        group_name = r.group_name
        dim_name = r.dimension_name if with_dim else None

        if credit > 0:
            rows.append({
                "group_name": group_name,
                "group_type": "INFLOW",
                "ledger_name": f"{r.ledger_name} ( {r.bank_name} )",
                "month_key": month_key,
                "amount": credit,
                "dimension_name": dim_name or f"(No {group_by.title()} )" if with_dim else None
            })

        if debit > 0:
            rows.append({
                "group_name": group_name,
                "group_type": "OUTFLOW",
                "ledger_name": f"{r.ledger_name} ( {r.bank_name} )",
                "month_key": month_key,
                "amount": debit,
                "dimension_name": dim_name or f"(No {group_by.title()} )" if with_dim else None
            })
    return {
        "data": rows, 
        "opening_balance": initial_opening,
        "opening_ledger_breakdown": opening_ledger_breakdown
    }


@router.get("/mis-fund-management")
def mis_fund_management(
    company_id: int,
    as_on_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    # 1. Available Funds: Cash, Bank
    cash_bank_groups = db.query(models.LedgerGroup.id, models.LedgerGroup.name).filter(
        models.LedgerGroup.company_id == company_id,
        func.upper(models.LedgerGroup.name).in_(["CASH IN HAND", "CASH-IN-HAND", "CASH", "BANK ACCOUNTS", "BANK ACCOUNT", "BANK"])
    ).all()
    cb_group_ids = [g.id for g in cash_bank_groups]
    
    cash_bank_balances = {}
    if cb_group_ids:
        # Get closing balances
        ledgers = db.query(models.Ledger).filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id.in_(cb_group_ids)
        ).all()
        
        for ledger in ledgers:
            voucher_query = (
                db.query(
                    func.coalesce(func.sum(models.VoucherLine.debit), 0),
                    func.coalesce(func.sum(models.VoucherLine.credit), 0),
                )
                .join(models.Voucher)
                .filter(
                    models.VoucherLine.ledger_id == ledger.id,
                    models.Voucher.company_id == company_id,
                    models.Voucher.voucher_date <= as_on_date,
                )
            )
            
            if department_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.department_id == department_id)
            if project_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.project_id == project_id)
                
            debits, credits = voucher_query.one()
            
            ob = float(ledger.opening_balance) if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT else -float(ledger.opening_balance)
            
            # Opening balance is usually NOT filtered by department/project unless we have a specific way to track it.
            # For most systems, opening balance is global. If filtering, we should decide if we include OB.
            # Usually, reports with dimension filters ONLY show movements for those dimensions.
            # But "Fund Management" is about actual cash in hand.
            # If we filter by department, we probably only want to see cash movements for that department.
            
            balance = ob + float(debits) - float(credits)
            
            # If department or project is selected, we might want to skip the opening balance if it's not dimension-aware.
            # However, if it's a "snapshot" of fund position, it's tricky.
            # Usually, these reports use OB only for global view.
            if department_id is not None or project_id is not None:
                balance = float(debits) - float(credits)

            if abs(balance) > 0.01:
                group_name = next(g.name for g in cash_bank_groups if g.id == ledger.group_id)
                if group_name not in cash_bank_balances:
                    cash_bank_balances[group_name] = []
                cash_bank_balances[group_name].append({
                    "ledger_name": ledger.name,
                    "amount": balance
                })

    # 2. Receivables (Sundry Debtors with Debit Balance)
    debtors_groups = db.query(models.LedgerGroup.id).filter(
        models.LedgerGroup.company_id == company_id,
        models.LedgerGroup.group_type == models.LedgerGroupType.ASSET,
        func.upper(models.LedgerGroup.name).like("%DEBTOR%")
    ).all()
    debtors_group_ids = [g.id for g in debtors_groups]
    
    receivables = []
    if debtors_group_ids:
        ledgers = db.query(models.Ledger).filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id.in_(debtors_group_ids)
        ).all()
        
        for ledger in ledgers:
            voucher_query = (
                db.query(
                    func.coalesce(func.sum(models.VoucherLine.debit), 0),
                    func.coalesce(func.sum(models.VoucherLine.credit), 0),
                )
                .join(models.Voucher)
                .filter(
                    models.VoucherLine.ledger_id == ledger.id,
                    models.Voucher.company_id == company_id,
                    models.Voucher.voucher_date <= as_on_date,
                )
            )

            if department_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.department_id == department_id)
            if project_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.project_id == project_id)

            debits, credits = voucher_query.one()
            
            ob = float(ledger.opening_balance) if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT else -float(ledger.opening_balance)
            
            balance = ob + float(debits) - float(credits)
            if department_id is not None or project_id is not None:
                balance = float(debits) - float(credits)

            if balance > 0.01: # Only positive debit balances are true receivables
                receivables.append({
                    "ledger_name": ledger.name,
                    "amount": balance
                })

    # 3. Payables (Sundry Creditors with Credit Balance)
    creditors_groups = db.query(models.LedgerGroup.id).filter(
        models.LedgerGroup.company_id == company_id,
        models.LedgerGroup.group_type == models.LedgerGroupType.LIABILITY,
        func.upper(models.LedgerGroup.name).like("%CREDITOR%")
    ).all()
    creditors_group_ids = [g.id for g in creditors_groups]
    
    payables = []
    if creditors_group_ids:
        ledgers = db.query(models.Ledger).filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id.in_(creditors_group_ids)
        ).all()
        
        for ledger in ledgers:
            voucher_query = (
                db.query(
                    func.coalesce(func.sum(models.VoucherLine.debit), 0),
                    func.coalesce(func.sum(models.VoucherLine.credit), 0),
                )
                .join(models.Voucher)
                .filter(
                    models.VoucherLine.ledger_id == ledger.id,
                    models.Voucher.company_id == company_id,
                    models.Voucher.voucher_date <= as_on_date,
                )
            )

            if department_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.department_id == department_id)
            if project_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.project_id == project_id)

            debits, credits = voucher_query.one()
            
            ob = float(ledger.opening_balance) if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT else -float(ledger.opening_balance)
            
            balance = ob + float(debits) - float(credits)
            if department_id is not None or project_id is not None:
                balance = float(debits) - float(credits)

            if balance < -0.01: # Negative overall signifies a Credit balance (Payable)
                payables.append({
                    "ledger_name": ledger.name,
                    "amount": abs(balance)
                })

    # 4. Employee Payables
    emp_groups = db.query(models.LedgerGroup.id).filter(
        models.LedgerGroup.company_id == company_id,
        models.LedgerGroup.group_type == models.LedgerGroupType.LIABILITY,
        func.upper(models.LedgerGroup.name).like("%EMPLOYEE%")
    ).all()
    emp_group_ids = [g.id for g in emp_groups]
    
    employee_payables = []
    if emp_group_ids:
        ledgers = db.query(models.Ledger).filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id.in_(emp_group_ids)
        ).all()
        
        for ledger in ledgers:
            voucher_query = (
                db.query(
                    func.coalesce(func.sum(models.VoucherLine.debit), 0),
                    func.coalesce(func.sum(models.VoucherLine.credit), 0),
                )
                .join(models.Voucher)
                .filter(
                    models.VoucherLine.ledger_id == ledger.id,
                    models.Voucher.company_id == company_id,
                    models.Voucher.voucher_date <= as_on_date,
                )
            )

            if department_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.department_id == department_id)
            if project_id is not None:
                voucher_query = voucher_query.filter(models.VoucherLine.project_id == project_id)

            debits, credits = voucher_query.one()

            ob = float(ledger.opening_balance) if ledger.opening_balance_type == models.OpeningBalanceType.DEBIT else -float(ledger.opening_balance)
            balance = ob + float(debits) - float(credits)
            
            if balance < -0.01:
                employee_payables.append({
                    "ledger_name": ledger.name,
                    "amount": abs(balance)
                })

    # Return structured snapshot
    return {
        "available_funds": {
            "cash_and_bank": cash_bank_balances,
            "receivables": sorted(receivables, key=lambda x: x['amount'], reverse=True)
        },
        "payable_funds": {
            "payables": sorted(payables, key=lambda x: x['amount'], reverse=True),
            "employee_payables": sorted(employee_payables, key=lambda x: x['amount'], reverse=True)
        }
    }

@router.get("/mis-target-vs-actual")
def mis_target_vs_actual(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    group_by: str | None = Query(None),
    calendar_mode: str = Query("AD"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    import nepali_datetime

    # 1. ACTUAL SALES
    # Broaden the search for sales groups
    all_company_groups = db.query(models.LedgerGroup).filter(
        models.LedgerGroup.company_id == company_id
    ).all()
    
    # Target vs Actual report should show all ledgers that have Targets.
    # Typically, these are INCOME and EXPENSE group types.
    roots = [
        g for g in all_company_groups 
        if g.group_type in (models.LedgerGroupType.INCOME, models.LedgerGroupType.EXPENSE)
    ]

    # For any explicit names users might have created incorrectly
    for g in all_company_groups:
        uname = (g.name or "").upper()
        if g not in roots and ("SALES" in uname or "REVENUE" in uname or "EXPENSE" in uname or "PURCHASE" in uname):
            roots.append(g)

    # 4. Final fallback: all groups
    if not roots:
        roots = all_company_groups
    # 2. Recursive check for all child groups to build sg_ids
    sg_ids = set()
    sg_types = {}  # Map group ID to type (Income/Expense)

    def collect_children(gid):
        if gid not in sg_ids:
            sg_ids.add(gid)
            group_obj = next((g for g in all_company_groups if g.id == gid), None)
            if group_obj:
                sg_types[gid] = group_obj.group_type
                # Find children in the pre-fetched list
                children = [g.id for g in all_company_groups if g.parent_group_id == gid]
                for cid in children:
                    collect_children(cid)

    for r in roots:
        collect_children(r.id)

    sg_names = {g.id: g.name for g in all_company_groups if g.id in sg_ids}

    # 4. ALSO IDENTIFY ALL LEDGERS IN THESE GROUPS
    sg_ledger_ids = [l.id for l in db.query(models.Ledger).filter(models.Ledger.company_id == company_id, models.Ledger.group_id.in_(sg_ids)).all()]

    if not sg_ids:
        return {"data": []}


    def build_query(with_dimension=False):
        if with_dimension:
            if group_by == "project":
                dim_col = models.VoucherLine.project_id
                dim_name_col = models.Project.name.label("dimension_name")
                join_target = (models.Project, models.VoucherLine.project_id == models.Project.id)
            else:
                dim_col = models.VoucherLine.department_id
                dim_name_col = models.Department.name.label("dimension_name")
                join_target = (models.Department, models.VoucherLine.department_id == models.Department.id)

            select_cols = [
                models.Voucher.voucher_date,
                models.Ledger.group_id,
                models.Ledger.name.label("ledger_name"),
                dim_col.label("dimension_id"),
                dim_name_col,
                func.sum(models.VoucherLine.credit).label("total_credit"),
                func.sum(models.VoucherLine.debit).label("total_debit"),
            ]
        else:
            select_cols = [
                models.Voucher.voucher_date,
                models.Ledger.group_id,
                models.Ledger.name.label("ledger_name"),
                func.sum(models.VoucherLine.credit).label("total_credit"),
                func.sum(models.VoucherLine.debit).label("total_debit"),
            ]

        q = (
            db.query(*select_cols)
            .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
            .join(models.Ledger, models.VoucherLine.ledger_id == models.Ledger.id)
            .filter(
                models.Voucher.company_id == company_id,
                models.Voucher.voucher_date >= from_date,
                models.Voucher.voucher_date <= to_date,
                models.Ledger.group_id.in_(sg_ids)
            )
        )

        if with_dimension:
            q = q.outerjoin(*join_target)

        if department_id is not None:
            q = q.filter(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            q = q.filter(models.VoucherLine.project_id == project_id)

        if with_dimension:
            q = q.group_by(models.Voucher.voucher_date, models.Ledger.group_id, models.Ledger.name, dim_col, dim_name_col)
        else:
            q = q.group_by(models.Voucher.voucher_date, models.Ledger.group_id, models.Ledger.name)

        return q

    with_dim = group_by in ("department", "project")
    results = build_query(with_dimension=with_dim).all()

    rows = []
    for r in results:
        d = r.voucher_date
        month_key = f"{d.year:04d}-{d.month:02d}"
        if calendar_mode == "BS":
            try:
                import nepali_datetime
                bs_date = nepali_datetime.date.from_datetime_date(d)
                month_key = f"{bs_date.year:04d}-{bs_date.month:02d}"
            except:
                pass

        
        group_id_val = getattr(r, 'group_id', None)
        g_type = sg_types.get(group_id_val)
        is_income = g_type == models.LedgerGroupType.INCOME
        
        # Report actuals as positive values, but handle the sign based on category
        # For Income: Credit - Debit. For Expense: Debit - Credit.
        if is_income:
            actual_amount = float(r.total_credit or 0) - float(r.total_debit or 0)
        else:
            actual_amount = float(r.total_debit or 0) - float(r.total_credit or 0)

        group_name = sg_names.get(group_id_val, "Income" if is_income else "Expense")
        
        # Safe access to dimension_name
        dim_name = getattr(r, 'dimension_name', None) if with_dim else None

        if actual_amount != 0:
            rows.append({
                "group_name": group_name,
                "group_type": "ACTUAL",
                "ledger_name": r.ledger_name,
                "month_key": month_key,
                "amount": actual_amount,
                "is_income": is_income,
                "dimension_name": dim_name or (f"(No {group_by.title()} )" if with_dim else None)
            })

    # Fetch real targets
    # Guess fiscal year from from_date - try to match what the frontend saves
    def build_fy_variants(year_part_1: int, year_part_2: int) -> list:
        """Return multiple possible fiscal year string formats to maximise match chances."""
        short = f"{year_part_1}/{str(year_part_2)[-2:]}"
        long_ = f"{year_part_1}/{year_part_2}"
        return [short, long_]

    fy_year_1 = from_date.year
    fy_year_2 = from_date.year + 1
    fy_variants = build_fy_variants(fy_year_1, fy_year_2)

    if calendar_mode == "BS":
        try:
           bs_from = nepali_datetime.date.from_datetime_date(from_date)
           fy_year_1 = bs_from.year
           fy_year_2 = bs_from.year + 1
           fy_variants = build_fy_variants(fy_year_1, fy_year_2)
        except:
           pass

    # Also try the alternate year in case from_date falls at the fiscal year boundary
    alt_fy_year_1 = fy_year_1 - 1
    alt_fy_year_2 = fy_year_1
    fy_variants += build_fy_variants(alt_fy_year_1, alt_fy_year_2)

    fiscal_year_guess = fy_variants[0]  # used for display in debug only

    # Fetch targets: match any of the FY variants, don't restrict by department/project
    # so that "all-company" targets (null dept/project) still appear even when a filter is active
    targets = (
        db.query(models.SalesTarget)
        .filter(
            models.SalesTarget.company_id == company_id,
            models.SalesTarget.fiscal_year.in_(fy_variants),
        )
        .all()
    )

    
    # Get Fiscal Year start month
    fy_start_month = 1
    if calendar_mode == "BS":
        fy_start_month = 4
    else:
        if company.fiscal_year_start:
            ts = company.fiscal_year_start
            if isinstance(ts, str):
                try:
                    from dateutil.parser import parse
                    d_obj = parse(ts).date()
                    fy_start_month = d_obj.month
                except:
                    import datetime
                    d_obj = datetime.date.today()
                    fy_start_month = d_obj.month
            else:
                fy_start_month = ts.month

    for t in targets:
        for i in range(1, 13):
            month_val = getattr(t, f"month_{i}", 0)
            if month_val == 0:
                continue
            
            # Simple assumption: i is the literal month number (1-12)
            # We need to decide the YEAR. 
            # If t.fiscal_year is "2081/82" and fy_start_month is 4 (Shrawan)
            # Shrawan (4) to Chaitra (12) are in part 1 (2081).
            # Baisakh (1) to Asadh (3) are in part 2 (2082).
            # Same for AD: if FY starts in July (7) for 2024/25.
            # July (7) to Dec (12) in 2024. Jan (1) to June (6) in 2025.
            
            fy_parts = t.fiscal_year.split('/')
            year_part_1 = fy_parts[0] # e.g. "2081"
            
            t_month_year = year_part_1
            if i < fy_start_month:
                # If the month is before the FY start month, it belongs to the second calendar year of the FY
                if len(fy_parts) > 1:
                    if len(fy_parts[1]) == 4: # Full year like 2081/2082
                         t_month_year = fy_parts[1]
                    else: # Short year like 2081/82
                         t_month_year = year_part_1[:2] + fy_parts[1]
            
            t_month_key = f"{int(t_month_year):04d}-{i:02d}"
            
            group_name = "Target"
            is_income = False
            if t.ledger and t.ledger.group_id:
                group_name = sg_names.get(t.ledger.group_id, "Target")
                g_type = sg_types.get(t.ledger.group_id)
                is_income = g_type == models.LedgerGroupType.INCOME
            


            rows.append({
                "group_name": group_name,
                "group_type": "TARGET",
                "ledger_name": t.ledger.name if t.ledger else "Unknown Ledger",
                "month_key": t_month_key,
                "amount": float(month_val),
                "is_income": is_income,
                "dimension_name": t.department.name if t.department else (t.project.name if t.project else None)
            })

    # FINAL FALLBACK: If absolutely no sales found, search EVERYTHING to confirm DB connection
    if not rows:
        # Re-run query without group filter
        def build_fallback_query(with_dimension=False):
            if with_dimension:
                if group_by == "project":
                    dim_col = models.VoucherLine.project_id
                    dim_name_col = models.Project.name.label("dimension_name")
                    join_target = (models.Project, models.VoucherLine.project_id == models.Project.id)
                else:
                    dim_col = models.VoucherLine.department_id
                    dim_name_col = models.Department.name.label("dimension_name")
                    join_target = (models.Department, models.VoucherLine.department_id == models.Department.id)
                select_cols = [
                    models.Voucher.voucher_date,
                    models.Ledger.group_id,
                    models.Ledger.name.label("ledger_name"),
                    dim_col.label("dimension_id"),
                    dim_name_col,
                    func.sum(models.VoucherLine.credit).label("total_credit"),
                    func.sum(models.VoucherLine.debit).label("total_debit"),
                ]
            else:
                select_cols = [
                    models.Voucher.voucher_date,
                    models.Ledger.group_id,
                    models.Ledger.name.label("ledger_name"),
                    func.sum(models.VoucherLine.credit).label("total_credit"),
                    func.sum(models.VoucherLine.debit).label("total_debit"),
                ]
            q = (
                db.query(*select_cols)
                .join(models.Voucher, models.VoucherLine.voucher_id == models.Voucher.id)
                .join(models.Ledger, models.VoucherLine.ledger_id == models.Ledger.id)
                .filter(
                    models.Voucher.company_id == company_id,
                    models.Voucher.voucher_date >= from_date,
                    models.Voucher.voucher_date <= to_date
                )
            )
            if with_dimension: q = q.outerjoin(*join_target)
            if department_id is not None: q = q.filter(models.VoucherLine.department_id == department_id)
            if project_id is not None: q = q.filter(models.VoucherLine.project_id == project_id)
            if with_dimension:
                q = q.group_by(models.Voucher.voucher_date, models.Ledger.group_id, models.Ledger.name, dim_col, dim_name_col)
            else:
                q = q.group_by(models.Voucher.voucher_date, models.Ledger.group_id, models.Ledger.name)
            return q

        fallback_results = build_fallback_query(with_dimension=with_dim).limit(20).all()
        for r in fallback_results:
            d = r.voucher_date
            month_key = f"{d.year:04d}-{d.month:02d}"
            if calendar_mode == "BS":
                try:
                    import nepali_datetime
                    bs_d = nepali_datetime.date.from_datetime_date(d)
                    month_key = f"{bs_d.year:04d}-{bs_d.month:02d}"
                except: pass
            
            amt = float(r.total_credit or 0) - float(r.total_debit or 0)
            if amt != 0:
                rows.append({
                    "group_name": "Diagnostic (All Transactions)",
                    "group_type": "ACTUAL",
                    "ledger_name": f"{r.ledger_name} (Verify Link)",
                    "month_key": month_key,
                    "amount": amt,
                    "dimension_name": getattr(r, 'dimension_name', None) or (f"(No {group_by.title()} )" if with_dim else None)
                })
                rows.append({
                    "group_name": "Diagnostic (All Transactions)",
                    "group_type": "TARGET",
                    "ledger_name": "Auto Target",
                    "month_key": month_key,
                    "amount": amt * 1.1,
                    "dimension_name": getattr(r, 'dimension_name', None) or (f"(No {group_by.title()} )" if with_dim else None)
                })

    return {"data": rows}


@router.get("/daybook", response_model=schemas.DaybookReport)
def get_daybook_report(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    segment_id: int | None = Query(None),
    payment_mode_id: int | None = Query(None),
    voucher_type: models.VoucherType | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Retrieve all vouchers for a given company within a date range."""
    company = _get_company(db, company_id, current_user)

    # Fetch vouchers with lines and ledgers joined to determine groups
    vouchers_q = (
        db.query(models.Voucher)
        .options(
            selectinload(models.Voucher.lines).selectinload(models.VoucherLine.ledger).selectinload(models.Ledger.group)
        )
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
        )
    )

    if payment_mode_id is not None:
        if payment_mode_id == 0:
            vouchers_q = vouchers_q.filter(models.Voucher.payment_mode_id.is_(None))
        else:
            vouchers_q = vouchers_q.filter(models.Voucher.payment_mode_id == payment_mode_id)
    if voucher_type is not None:
        vouchers_q = vouchers_q.filter(models.Voucher.voucher_type == voucher_type)

    if department_id is not None or project_id is not None or segment_id is not None:
        # Filter vouchers where at least one line matches the selected cost centers
        cc_filters = []
        if department_id is not None:
            cc_filters.append(models.VoucherLine.department_id == department_id)
        if project_id is not None:
            cc_filters.append(models.VoucherLine.project_id == project_id)
        if segment_id is not None:
            cc_filters.append(models.VoucherLine.segment_id == segment_id)
        
        vouchers_q = vouchers_q.filter(models.Voucher.lines.any(and_(*cc_filters)))

    vouchers = (
        vouchers_q
        .order_by(models.Voucher.voucher_date, models.Voucher.id)
        .all()
    )

    daybook_rows = []
    seen_voucher_ids = set()
    total_report_debit = 0.0
    total_report_credit = 0.0

    for v in vouchers:
        if v.id in seen_voucher_ids:
            continue
        seen_voucher_ids.add(v.id)

        # Net debits and credits per ledger within the same voucher.
        # This handles doubling in cash transactions (Invoice + Receipt in one voucher)
        # by cancelling out the transitory party ledger legs.
        ledger_nets: dict[int, float] = {}
        for line in v.lines:
            lid = line.ledger_id
            net = float(line.debit or 0) - float(line.credit or 0)
            ledger_nets[lid] = ledger_nets.get(lid, 0.0) + net
            
        # Sum of all positive net balances gives the true transaction amount of a balanced voucher.
        # We round to 2 decimals to prevent floating point artifacts.
        row_debit = sum(round(net, 2) for net in ledger_nets.values() if round(net, 2) > 0)
        row_credit = sum(round(-net, 2) for net in ledger_nets.values() if round(net, 2) < 0)
        
        # Determine a primary ledger name for the summary view
        primary_ledger_name = "Multiple Ledgers"
        if v.lines:
            # Try to find a 'Party' ledger (Sundry Debtors/Creditors or Cash/Bank)
            party_lines = [line for line in v.lines if line.ledger and line.ledger.group and line.ledger.group.name in ["Sundry Debtors", "Sundry Creditors", "Cash-in-Hand", "Bank Accounts"]]
            if party_lines:
                primary_ledger_name = party_lines[0].ledger.name
            else:
                primary_ledger_name = v.lines[0].ledger.name if v.lines[0].ledger else "N/A"

        daybook_rows.append(
            schemas.DaybookRow(
                date=v.voucher_date,
                id=v.id,
                voucher_type=v.voucher_type,
                voucher_number=v.voucher_number,
                ledger_name=primary_ledger_name,
                description=v.narration,
                debit=row_debit,
                credit=row_credit,
            )
        )
        total_report_debit += row_debit
        total_report_credit += row_credit

    return schemas.DaybookReport(
        company_id=company_id,
        company_name=company.name,
        from_date=from_date,
        to_date=to_date,
        vouchers=daybook_rows,
        total_debit=total_report_debit,
        total_credit=total_report_credit,
    )


@router.get("/online-orders", response_model=schemas.OnlineOrderReport)
def get_online_orders_report(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Returns a report of all online (website) orders within the selected date range.
    Joins WebsiteOrderReceipt with SalesOrder and Customer.
    """
    company = _get_company(db, company_id, current_user)

    # We need to query website_order_receipts and join sales_orders to get date filtering
    query = (
        db.query(
            models.WebsiteOrderReceipt,
            models.SalesOrder,
            models.Customer,
            func.coalesce(func.sum(models.SalesOrderLine.rate * models.SalesOrderLine.quantity), 0).label("amount_subtotal"),
            func.coalesce(func.sum(models.SalesOrderLine.quantity * models.SalesOrderLine.rate * models.SalesOrderLine.tax_rate / 100), 0).label("tax_total"),
            models.Package.status.label("package_status"),
            models.Package.id.label("package_id"),
            models.Package.updated_at.label("package_updated_at")
        )
        .join(models.SalesOrder, models.WebsiteOrderReceipt.sales_order_id == models.SalesOrder.id)
        .join(models.Customer, models.SalesOrder.customer_id == models.Customer.id)
        .outerjoin(models.Package, models.Package.invoice_id == models.SalesOrder.converted_to_invoice_id)
        .outerjoin(models.SalesOrderLine, models.SalesOrder.id == models.SalesOrderLine.order_id)
        .filter(
            models.WebsiteOrderReceipt.company_id == company_id,
            models.SalesOrder.date >= from_date,
            models.SalesOrder.date <= to_date,
        )
        .group_by(models.WebsiteOrderReceipt.id, models.SalesOrder.id, models.Customer.id, models.Package.id)
        .order_by(models.WebsiteOrderReceipt.created_at.desc())
    )

    results = query.all()

    report_rows = []
    for receipt, order, customer, amount_subtotal, tax_total, pkg_status, pkg_id, pkg_updated_at in results:
        # Determine payment status
        # If it has a receipt_voucher_id, it is paid.
        # Alternatively, check response_json for "Pay Now" info.
        payment_status = "Unpaid (COD)"
        if receipt.receipt_voucher_id:
            payment_status = "Paid"
        elif receipt.transaction_id or receipt.payment_screenshot:
            payment_status = "Paid"
        else:
            # Check if there is an idempotency key hinting at pay_now
            if receipt.response_json and isinstance(receipt.response_json, dict):
                options = receipt.response_json.get("options", {})
                if isinstance(options, dict) and options.get("record_payment"):
                    payment_status = "Pending Verification"

        total_amount = float(amount_subtotal) + float(tax_total)
        # Add delivery charge from the first item if available, or just rely on what is saved.
        # Actually simplest is just to take amount_subtotal + tax_total

        report_rows.append(
            schemas.OnlineOrderReportRow(
                receipt_id=receipt.id,
                order_id=order.id,
                created_at=receipt.created_at,
                date=order.date,
                reference=order.reference,
                customer_name=customer.name,
                phone=customer.phone,
                contact_no=customer.mobile,
                email=customer.email,
                address=customer.address,
                amount=total_amount,
                order_status=order.status,
                invoice_id=order.converted_to_invoice_id,
                receipt_voucher_id=receipt.receipt_voucher_id,
                transaction_id=receipt.transaction_id,
                payment_screenshot=receipt.payment_screenshot,
                payment_status=payment_status,
                package_id=pkg_id,
                package_status=pkg_status,
                dispatched_at=pkg_updated_at if pkg_status in ("DISPATCHED", "DELIVERED") else None,
            )
        )

    return schemas.OnlineOrderReport(
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        orders=report_rows,
    )


@router.get("/receivables", response_model=list[schemas.PartyDueItem])
def receivables(
    company_id: int,
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get all outstanding receivables (Sundry Debtors).
    Automatically applies FIFO allocation for unallocated receipts so the 
    total outstanding matches the true ledger balance.
    """
    _get_company(db, company_id, current_user)

    # Subquery for sales invoice totals
    invoice_total = _compute_sales_invoice_totals_subquery(db).label("total_amount")
    
    # Subquery for explicitly allocated amounts
    explicit_paid_subq = (
        db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
        .filter(
            models.VoucherAllocation.company_id == company_id,
            models.VoucherAllocation.doc_type == models.AllocationDocType.SALES_INVOICE.value,
            models.VoucherAllocation.doc_id == models.SalesInvoice.id,
        )
        .correlate(models.SalesInvoice)
        .scalar_subquery()
    )

    query = (
        db.query(
            models.SalesInvoice.id.label("doc_id"),
            models.SalesInvoice.date.label("doc_date"),
            models.SalesInvoice.reference.label("doc_reference"),
            models.Customer.id.label("party_id"),
            models.Customer.name.label("party_name"),
            models.Customer.ledger_id.label("party_ledger_id"),
            invoice_total,
            explicit_paid_subq.label("explicit_paid_amount"),
            models.Voucher.voucher_number.label("v_number"),
        )
        .join(models.Customer, models.Customer.id == models.SalesInvoice.customer_id)
        .join(models.SalesInvoiceLine, models.SalesInvoiceLine.invoice_id == models.SalesInvoice.id)
        .outerjoin(models.Voucher, models.Voucher.id == models.SalesInvoice.voucher_id)
        .filter(models.SalesInvoice.company_id == company_id)
    )
    
    if department_id:
        query = query.filter(models.SalesInvoice.department_id == department_id)
    if project_id:
        query = query.filter(models.SalesInvoice.project_id == project_id)

    rows = (
        query.group_by(models.SalesInvoice.id, models.Customer.id, models.Voucher.id)
        .order_by(models.SalesInvoice.date.asc(), models.SalesInvoice.id.asc())
        .all()
    )

    # Calculate true ledger balance for each customer to find unallocated receipts
    ledger_balances: dict[int, float] = {}
    total_billed: dict[int, float] = {}
    
    # Get all debtor ledgers
    party_ledger_ids = {r.party_ledger_id for r in rows}
    
    if party_ledger_ids:
        # Opening balances
        ledgers = db.query(models.Ledger).filter(models.Ledger.id.in_(party_ledger_ids)).all()
        for l in ledgers:
            ob = float(l.opening_balance or 0)
            if l.opening_balance_type == models.OpeningBalanceType.CREDIT:
                ob = -ob
            ledger_balances[l.id] = ob
            total_billed[l.id] = 0.0

        # Ledger Transactions
        vl_sums = (
            db.query(
                models.VoucherLine.ledger_id,
                func.sum(models.VoucherLine.debit).label("total_debit"),
                func.sum(models.VoucherLine.credit).label("total_credit"),
            )
            .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
            .filter(
                models.VoucherLine.ledger_id.in_(party_ledger_ids),
                models.Voucher.company_id == company_id
            )
            .group_by(models.VoucherLine.ledger_id)
            .all()
        )
        for vl in vl_sums:
            ledger_balances[vl.ledger_id] += float(vl.total_debit or 0) - float(vl.total_credit or 0)

    # Group invoices by party
    party_invoices: dict[int, list] = {}
    for r in rows:
        lid = int(r.party_ledger_id)
        if lid not in party_invoices:
            party_invoices[lid] = []
        party_invoices[lid].append(r)
        total_billed[lid] += float(r.total_amount)

    result: list[schemas.PartyDueItem] = []

    for lid, invoices in party_invoices.items():
        # Total Valid Receipts = Total Billed + Opening Balance - Ledger Closing Balance
        # (Assuming positive balance is Debit / Receivable)
        ob = 0.0
        l = next((x for x in ledgers if x.id == lid), None)
        if l:
            ob = float(l.opening_balance or 0)
            if l.opening_balance_type == models.OpeningBalanceType.CREDIT:
                ob = -ob
        
        closing_balance = ledger_balances.get(lid, 0.0)
        unallocated_pool = (total_billed[lid] + ob) - closing_balance

        # Subtract explicit allocations from the pool so we don't double count
        total_explicit = sum(float(inv.explicit_paid_amount) for inv in invoices)
        unallocated_pool = max(0.0, unallocated_pool - total_explicit)

        for r in invoices:
            total_amount = float(r.total_amount)
            explicit_paid = float(r.explicit_paid_amount)
            
            # Apply explicit allocation first
            paid = explicit_paid
            remaining_to_pay = max(0.0, total_amount - paid)
            
            # Apply unallocated pool (FIFO)
            if remaining_to_pay > 0 and unallocated_pool > 0:
                applied = min(remaining_to_pay, unallocated_pool)
                paid += applied
                unallocated_pool -= applied
                
            outstanding = total_amount - paid
            
            if outstanding <= 0.001:  # Hide fully paid
                continue
            
            doc_num = r.v_number if r.v_number else f"SI-{int(r.doc_id)}"
            
            result.append(
                schemas.PartyDueItem(
                    doc_type="SALES_INVOICE",
                    doc_id=int(r.doc_id),
                    doc_number=doc_num,
                    reference=(str(r.doc_reference) if r.doc_reference else None),
                    date=r.doc_date,
                    party_ledger_id=lid,
                    party_name=str(r.party_name or ""),
                    total_amount=total_amount,
                    paid_amount=paid,
                    outstanding_amount=outstanding,
                    currency=None,
                )
            )

    return result


@router.get("/payables", response_model=list[schemas.PartyDueItem])
def payables(
    company_id: int,
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Get all outstanding payables (Sundry Creditors).
    Automatically applies FIFO allocation for unallocated payments so the 
    total outstanding matches the true ledger balance.
    """
    _get_company(db, company_id, current_user)

    # Subquery for purchase bill totals
    bill_total = _compute_purchase_bill_totals_subquery(db).label("total_amount")
    
    # Subquery for explicitly allocated amounts
    explicit_paid_subq = (
        db.query(func.coalesce(func.sum(models.VoucherAllocation.allocated_amount), 0))
        .filter(
            models.VoucherAllocation.company_id == company_id,
            models.VoucherAllocation.doc_type == models.AllocationDocType.PURCHASE_BILL.value,
            models.VoucherAllocation.doc_id == models.PurchaseBill.id,
        )
        .correlate(models.PurchaseBill)
        .scalar_subquery()
    )

    query = (
        db.query(
            models.PurchaseBill.id.label("doc_id"),
            models.PurchaseBill.date.label("doc_date"),
            models.PurchaseBill.reference.label("doc_reference"),
            models.Supplier.id.label("party_id"),
            models.Supplier.name.label("party_name"),
            models.Supplier.ledger_id.label("party_ledger_id"),
            bill_total,
            explicit_paid_subq.label("explicit_paid_amount"),
            models.Voucher.voucher_number.label("v_number"),
        )
        .join(models.Supplier, models.Supplier.id == models.PurchaseBill.supplier_id)
        .join(models.PurchaseBillLine, models.PurchaseBillLine.bill_id == models.PurchaseBill.id)
        .outerjoin(models.Voucher, models.Voucher.id == models.PurchaseBill.voucher_id)
        .filter(models.PurchaseBill.company_id == company_id)
    )

    if department_id:
        query = query.filter(models.PurchaseBill.department_id == department_id)
    if project_id:
        query = query.filter(models.PurchaseBill.project_id == project_id)

    rows = (
        query.group_by(models.PurchaseBill.id, models.Supplier.id, models.Voucher.id)
        .order_by(models.PurchaseBill.date.asc(), models.PurchaseBill.id.asc())
        .all()
    )

    # Calculate true ledger balance for each supplier to find unallocated payments
    ledger_balances: dict[int, float] = {}
    total_billed: dict[int, float] = {}
    
    party_ledger_ids = {r.party_ledger_id for r in rows}
    
    if party_ledger_ids:
        # Opening balances
        ledgers = db.query(models.Ledger).filter(models.Ledger.id.in_(party_ledger_ids)).all()
        for l in ledgers:
            ob = float(l.opening_balance or 0)
            if l.opening_balance_type == models.OpeningBalanceType.DEBIT:
                ob = -ob
            # For creditors, standard is Credit balance. We store positive as Credit logic here.
            ledger_balances[l.id] = ob
            total_billed[l.id] = 0.0

        # Ledger Transactions
        vl_sums = (
            db.query(
                models.VoucherLine.ledger_id,
                func.sum(models.VoucherLine.debit).label("total_debit"),
                func.sum(models.VoucherLine.credit).label("total_credit"),
            )
            .join(models.Voucher, models.Voucher.id == models.VoucherLine.voucher_id)
            .filter(
                models.VoucherLine.ledger_id.in_(party_ledger_ids),
                models.Voucher.company_id == company_id
            )
            .group_by(models.VoucherLine.ledger_id)
            .all()
        )
        for vl in vl_sums:
            # Creditor balance: Credit increases, Debit decreases
            ledger_balances[vl.ledger_id] += float(vl.total_credit or 0) - float(vl.total_debit or 0)

    # Group bills by party
    party_bills: dict[int, list] = {}
    for r in rows:
        lid = int(r.party_ledger_id)
        if lid not in party_bills:
            party_bills[lid] = []
        party_bills[lid].append(r)
        total_billed[lid] += float(r.total_amount)

    result: list[schemas.PartyDueItem] = []

    for lid, bills in party_bills.items():
        # Total Valid Payments = Total Billed + Opening Balance - Ledger Closing Balance
        ob = 0.0
        l = next((x for x in ledgers if x.id == lid), None)
        if l:
            ob = float(l.opening_balance or 0)
            if l.opening_balance_type == models.OpeningBalanceType.DEBIT:
                ob = -ob
                
        closing_balance = ledger_balances.get(lid, 0.0)
        unallocated_pool = (total_billed[lid] + ob) - closing_balance

        # Subtract explicit allocations from the pool
        total_explicit = sum(float(b.explicit_paid_amount) for b in bills)
        unallocated_pool = max(0.0, unallocated_pool - total_explicit)

        for r in bills:
            total_amount = float(r.total_amount)
            explicit_paid = float(r.explicit_paid_amount)
            
            paid = explicit_paid
            remaining_to_pay = max(0.0, total_amount - paid)
            
            # Apply unallocated pool (FIFO)
            if remaining_to_pay > 0 and unallocated_pool > 0:
                applied = min(remaining_to_pay, unallocated_pool)
                paid += applied
                unallocated_pool -= applied
                
            outstanding = total_amount - paid
            
            if outstanding <= 0.001:
                continue
            
            doc_num = r.v_number if r.v_number else f"PB-{int(r.doc_id)}"
            
            result.append(
                schemas.PartyDueItem(
                    doc_type="PURCHASE_BILL",
                    doc_id=int(r.doc_id),
                    doc_number=doc_num,
                    reference=(str(r.doc_reference) if r.doc_reference else None),
                    date=r.doc_date,
                    party_ledger_id=lid,
                    party_name=str(r.party_name or ""),
                    total_amount=total_amount,
                    paid_amount=paid,
                    outstanding_amount=outstanding,
                    currency=None,
                )
            )

    return result


def _compute_sales_invoice_totals_subquery(db: Session):
    """
    Compute total amount for each sales invoice.
    Subtotal = (qty * rate) - discount
    Tax = subtotal * (tax_rate / 100)
    Total = subtotal + Tax
    """
    Subtotal = (models.SalesInvoiceLine.quantity * models.SalesInvoiceLine.rate - models.SalesInvoiceLine.discount)
    # Most common pattern: tax_rate is 13 for 13%. If it's 0.13, this will be wrong, 
    # but 13 is standard in this codebase based on other VAT implementations.
    LineTotal = Subtotal * (1 + models.SalesInvoiceLine.tax_rate / 100)
    
    return (
        db.query(func.coalesce(func.sum(LineTotal), 0))
        .filter(models.SalesInvoiceLine.invoice_id == models.SalesInvoice.id)
        .correlate(models.SalesInvoice)
        .scalar_subquery()
    )


def _compute_purchase_bill_totals_subquery(db: Session):
    """
    Compute total amount for each purchase bill.
    Subtotal = (qty * rate) - discount
    Tax = subtotal * (tax_rate / 100)
    Total = subtotal + Tax
    """
    Subtotal = (models.PurchaseBillLine.quantity * models.PurchaseBillLine.rate - models.PurchaseBillLine.discount)
    LineTotal = Subtotal * (1 + models.PurchaseBillLine.tax_rate / 100)
    
    return (
        db.query(func.coalesce(func.sum(LineTotal), 0))
        .filter(models.PurchaseBillLine.bill_id == models.PurchaseBill.id)
        .correlate(models.PurchaseBill)
        .scalar_subquery()
    )


# ── Sales Incentive Report ────────────────────────────────────────────────────

@router.get("/sales-incentive")
def sales_incentive_report(
    company_id: int,
    from_date: str = Query(...),
    to_date: str = Query(...),
    sales_person_id: int | None = Query(None),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    item_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """
    Sales Incentive report.
    Returns per-sales-person sales totals and computed incentive amounts
    based on matching IncentiveRules for the given company and date range.
    """
    try:
        from_dt = date.fromisoformat(from_date)
        to_dt = date.fromisoformat(to_date)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")

    # --- Load active incentive rules for this company ---
    rules = (
        db.query(models.IncentiveRule)
        .filter(
            models.IncentiveRule.company_id == company_id,
            models.IncentiveRule.is_active == True,
        )
        .all()
    )
    
    # Load company for default ledger
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    default_ledger_id = company.default_incentive_expense_ledger_id if company else None

    # Load ledger names for mapping
    ledger_ids = set()
    if default_ledger_id: ledger_ids.add(default_ledger_id)
    for r in rules:
        if r.ledger_id: ledger_ids.add(r.ledger_id)
    
    ledger_names = {}
    if ledger_ids:
        ledger_names = {
            l.id: l.name 
            for l in db.query(models.Ledger.id, models.Ledger.name)
            .filter(models.Ledger.id.in_(list(ledger_ids)))
            .all()
        }

    # --- Fetch invoices in date range ---
    # Line-level subquery for total
    line = models.SalesInvoiceLine
    subtotal_expr = (line.quantity * line.rate) - line.discount
    line_total_expr = subtotal_expr + (subtotal_expr * (line.tax_rate / 100.0))

    invoice_total_subq = (
        db.query(func.coalesce(func.sum(line_total_expr), 0))
        .filter(line.invoice_id == models.SalesInvoice.id)
        .correlate(models.SalesInvoice)
        .scalar_subquery()
    )
    invoice_qty_subq = (
        db.query(func.coalesce(func.sum(line.quantity), 0))
        .filter(line.invoice_id == models.SalesInvoice.id)
        .correlate(models.SalesInvoice)
        .scalar_subquery()
    )

    invoice_q = (
        db.query(
            models.SalesInvoice,
            models.SalesPerson.name.label("sales_person_name"),
            models.Customer.name.label("customer_name"),
            models.Voucher.voucher_number.label("voucher_no"),
            models.Voucher.narration.label("voucher_remarks"),
            invoice_total_subq.label("total_amount"),
            invoice_qty_subq.label("total_qty"),
        )
        .outerjoin(models.SalesPerson, models.SalesPerson.id == models.SalesInvoice.sales_person_id)
        .outerjoin(models.Customer, models.Customer.id == models.SalesInvoice.customer_id)
        .outerjoin(models.Voucher, models.Voucher.id == models.SalesInvoice.voucher_id)
        .options(
            selectinload(models.SalesInvoice.incentives)
        )
        .filter(
            models.SalesInvoice.company_id == company_id,
            models.SalesInvoice.date >= from_dt,
            models.SalesInvoice.date <= to_dt,
        )
    )

    if sales_person_id is not None:
        invoice_q = invoice_q.filter(models.SalesInvoice.sales_person_id == sales_person_id)
    if department_id is not None:
        invoice_q = invoice_q.filter(models.SalesInvoice.department_id == department_id)
    if project_id is not None:
        invoice_q = invoice_q.filter(models.SalesInvoice.project_id == project_id)

    invoices = invoice_q.order_by(models.SalesInvoice.date.desc()).all()

    def _apply_rule(rule: models.IncentiveRule, amount: float, qty: float) -> float:
        """Apply a single incentive rule and return the incentive amount."""
        if rule.basis_type in ("amount", "target_amount"):
            basis_val = amount
        else:
            basis_val = qty

        lo = float(rule.threshold_min or 0)
        hi = float(rule.threshold_max) if rule.threshold_max is not None else float("inf")
        if not (lo <= basis_val <= hi):
            return 0.0

        if rule.incentive_type == "fixed":
            return float(rule.incentive_value)
        else:
            return round(amount * float(rule.incentive_value) / 100.0, 2)

    # --- Group by sales person and compute incentives ---
    # person_id → {name, sales_amount, total_qty, invoices, incentive_breakdown}
    persons: dict[str, dict] = {}

    for inv, sp_name, cust_name, v_no, v_rem, total_amount, total_qty in invoices:
        sp_id = inv.sales_person_id
        sp_key = str(sp_id) if sp_id else "unassigned"
        sp_display = sp_name or "Unassigned"

        amt = float(total_amount or 0)
        qty = float(total_qty or 0)

        # Check for stored incentive for this sales person
        stored_inc = next((inc for inc in inv.incentives if inc.sales_person_id == sp_id), None)
        inc_amt = 0.0
        post_method = "Auto"
        
        if stored_inc:
            inc_amt = float(stored_inc.incentive_amount)
            post_method = "Manual" if (stored_inc.is_manual or stored_inc.post_method in ["Manual", "Manual Override"]) else "Auto"
        else:
            print(f"DEBUG: No stored_inc found for inv={inv.id}, sp_id={sp_id}. Available IDs: {[i.sales_person_id for i in inv.incentives]}")
            # Re-calculate using legacy logic for this invoice
            best_inc = 0.0
            for rule in rules:
                if rule.sales_person_id and rule.sales_person_id != sp_id:
                    continue
                rule_inc = _apply_rule(rule, amt, qty)
                if rule_inc > 0:
                    best_inc += rule_inc
            inc_amt = best_inc
            post_method = "Auto"

        # Determine Booked Expense Ledger
        matched_ledger_names = []
        for rule in rules:
            if rule.sales_person_id and rule.sales_person_id != sp_id:
                continue
            rule_inc = _apply_rule(rule, amt, qty)
            if rule_inc > 0:
                l_id = rule.ledger_id or default_ledger_id
                if l_id and l_id in ledger_names:
                    ln = ledger_names[l_id]
                    if ln not in matched_ledger_names:
                        matched_ledger_names.append(ln)
        
        booked_ledger_name = ", ".join(matched_ledger_names) if matched_ledger_names else (ledger_names.get(default_ledger_id) if default_ledger_id else None)

        if sp_key not in persons:
            persons[sp_key] = {
                "sales_person_id": sp_id,
                "sales_person_name": sp_display,
                "sales_amount": 0.0,
                "total_qty": 0.0,
                "invoice_count": 0,
                "invoices": [],
                "incentive_amount": 0.0,
                "applicable_rules": [],
            }

        persons[sp_key]["sales_amount"] += amt
        persons[sp_key]["total_qty"] += qty
        persons[sp_key]["invoice_count"] += 1
        persons[sp_key]["incentive_amount"] += inc_amt
        persons[sp_key]["invoices"].append({
            "id": inv.id,
            "date": str(inv.date),
            "reference": inv.reference,
            "voucher_no": v_no or inv.reference,
            "ledger_name": cust_name or "Unknown Customer",
            "booked_ledger_name": booked_ledger_name or ledger_names.get(default_ledger_id) or "-",
            "remarks": v_rem or inv.narration or "-",
            "customer_id": inv.customer_id,
            "total_amount": amt,
            "total_qty": qty,
            "incentive_amount": inc_amt,
            "post_method": post_method,
            "department_id": inv.department_id,
            "project_id": inv.project_id,
        })

    # After grouping, populate applicable rules for the whole period if needed
    for sp_key, person in persons.items():
        sp_id = person["sales_person_id"]
        total_sales = person["sales_amount"]
        total_qty = person["total_qty"]

        matched_rules = []
        for rule in rules:
            if rule.sales_person_id and rule.sales_person_id != sp_id:
                continue
            incentive_val = _apply_rule(rule, total_sales, total_qty)
            if incentive_val > 0:
                rule_ledger_id = rule.ledger_id or default_ledger_id
                matched_rules.append({
                    "rule_id": rule.id,
                    "rule_name": rule.name,
                    "incentive_value": incentive_val,
                    "ledger_id": rule_ledger_id,
                    "ledger_name": ledger_names.get(rule_ledger_id) if rule_ledger_id else "Unmapped",
                })
        person["applicable_rules"] = matched_rules

    persons_list = sorted(
        persons.values(),
        key=lambda p: p["sales_amount"],
        reverse=True,
    )

    total_sales_amount = sum(p["sales_amount"] for p in persons_list)
    total_incentive = sum(p["incentive_amount"] for p in persons_list)
    total_invoices = sum(p["invoice_count"] for p in persons_list)

    return {
        "from_date": from_date,
        "to_date": to_date,
        "total_sales_amount": round(total_sales_amount, 2),
        "total_incentive_amount": round(total_incentive, 2),
        "total_invoices": total_invoices,
        "persons": persons_list,
        "rules_count": len(rules),
    }


@router.get("/item-wise-profit")
def get_item_wise_profit(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    department_id: int | None = Query(None),
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    
    # We need to get sales data with revenue and qtys
    sales_qs = db.query(
        models.SalesInvoiceLine.item_id,
        func.sum(models.SalesInvoiceLine.quantity).label("qty_sold"),
        func.sum(models.SalesInvoiceLine.quantity * models.SalesInvoiceLine.rate - models.SalesInvoiceLine.discount).label("revenue")
    ).join(
        models.SalesInvoice, models.SalesInvoice.id == models.SalesInvoiceLine.invoice_id
    ).filter(
        models.SalesInvoice.company_id == company_id,
        models.SalesInvoice.date >= from_date,
        models.SalesInvoice.date <= to_date,
    )
    if department_id:
        sales_qs = sales_qs.filter(models.SalesInvoice.department_id == department_id)
    if project_id:
        sales_qs = sales_qs.filter(models.SalesInvoice.project_id == project_id)
        
    sales_qs = sales_qs.group_by(models.SalesInvoiceLine.item_id)
    sales_data = sales_qs.all()
    
    # A positive qty_delta is stock in. For sales invoice, stock goes out so qty_delta is negative.
    cost_qs = db.query(
        models.StockLedger.item_id,
        func.sum(-models.StockLedger.qty_delta * models.StockLedger.unit_cost).label("cost")
    ).join(
        models.SalesInvoice, models.SalesInvoice.id == models.StockLedger.source_id
    ).filter(
        models.StockLedger.company_id == company_id,
        models.StockLedger.source_type == "SALES_INVOICE",
        models.StockLedger.reversed_at.is_(None),
        models.SalesInvoice.date >= from_date,
        models.SalesInvoice.date <= to_date,
    )
    if department_id:
        cost_qs = cost_qs.filter(models.SalesInvoice.department_id == department_id)
    if project_id:
        cost_qs = cost_qs.filter(models.SalesInvoice.project_id == project_id)
        
    cost_qs = cost_qs.group_by(models.StockLedger.item_id)
    cost_data = cost_qs.all()
    
    # Sales returns decrease revenue and cost
    return_sales_qs = db.query(
        models.SalesReturnLine.item_id,
        func.sum(models.SalesReturnLine.quantity).label("qty_returned"),
        func.sum(models.SalesReturnLine.quantity * models.SalesReturnLine.rate - models.SalesReturnLine.discount).label("revenue_returned")
    ).join(
        models.SalesReturn, models.SalesReturn.id == models.SalesReturnLine.return_id
    ).filter(
        models.SalesReturn.company_id == company_id,
        models.SalesReturn.date >= from_date,
        models.SalesReturn.date <= to_date,
    )
    if department_id:
        return_sales_qs = return_sales_qs.filter(models.SalesReturn.department_id == department_id)
    if project_id:
        return_sales_qs = return_sales_qs.filter(models.SalesReturn.project_id == project_id)
        
    return_sales_qs = return_sales_qs.group_by(models.SalesReturnLine.item_id)
    return_sales_data = return_sales_qs.all()
    
    return_cost_qs = db.query(
        models.StockLedger.item_id,
        func.sum(models.StockLedger.qty_delta * models.StockLedger.unit_cost).label("cost_returned")
    ).join(
        models.SalesReturn, models.SalesReturn.id == models.StockLedger.source_id
    ).filter(
        models.StockLedger.company_id == company_id,
        models.StockLedger.source_type == "SALES_RETURN",
        models.StockLedger.reversed_at.is_(None),
        models.SalesReturn.date >= from_date,
        models.SalesReturn.date <= to_date,
    )
    if department_id:
        return_cost_qs = return_cost_qs.filter(models.SalesReturn.department_id == department_id)
    if project_id:
        return_cost_qs = return_cost_qs.filter(models.SalesReturn.project_id == project_id)
        
    return_cost_qs = return_cost_qs.group_by(models.StockLedger.item_id)
    return_cost_data = return_cost_qs.all()
    
    item_map = {}
    def get_item(item_id):
        if item_id not in item_map:
            item_map[item_id] = {"qty_sold": 0, "revenue": 0.0, "cost": 0.0}
        return item_map[item_id]
        
    for r in sales_data:
        it = get_item(r.item_id)
        it["qty_sold"] += float(r.qty_sold or 0)
        it["revenue"] += float(r.revenue or 0)
        
    for r in cost_data:
        it = get_item(r.item_id)
        it["cost"] += float(r.cost or 0)
        
    for r in return_sales_data:
        it = get_item(r.item_id)
        it["qty_sold"] -= float(r.qty_returned or 0)
        it["revenue"] -= float(r.revenue_returned or 0)
        
    for r in return_cost_data:
        it = get_item(r.item_id)
        it["cost"] -= float(r.cost_returned or 0)
        
    if not item_map:
        return {"success": True, "data": []}
        
    items = db.query(
        models.Item.id, models.Item.name, models.Item.sku, models.Item.category
    ).filter(
        models.Item.id.in_(list(item_map.keys()))
    ).all()
    
    results = []
    for item in items:
        stats = get_item(item.id)
        revenue = stats["revenue"]
        cost = stats["cost"]
        profit = revenue - cost
        margin = (profit / revenue * 100) if revenue > 0 else 0
        
        results.append({
            "id": item.id,
            "name": item.name,
            "sku": item.sku,
            "category": item.category,
            "qty_sold": stats["qty_sold"],
            "revenue": revenue,
            "cost": cost,
            "profit": profit,
            "margin": margin
        })
        
    results.sort(key=lambda x: x["profit"], reverse=True)
    return {"success": True, "data": results}




@router.get("/inventory-history", response_model=schemas.ItemHistoryReport)
def inventory_history_report(
    company_id: int,
    from_date: date = Query(...),
    to_date: date = Query(...),
    party_name: str | None = Query(None),
    item_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    
    rows = []
    
    # 1. Sales Invoices
    sales_query = (
        db.query(
            models.SalesInvoiceLine.item_id,
            models.Item.name.label("item_name"),
            models.SalesInvoice.date.label("date"),
            models.SalesInvoice.reference.label("voucher_number"),
            models.Customer.name.label("party_name"),
            models.SalesInvoiceLine.quantity.label("qty"),
            models.SalesInvoiceLine.rate,
            ((models.SalesInvoiceLine.quantity * models.SalesInvoiceLine.rate) - models.SalesInvoiceLine.discount).label("amount")
        )
        .join(models.SalesInvoice, models.SalesInvoiceLine.invoice_id == models.SalesInvoice.id)
        .join(models.Item, models.SalesInvoiceLine.item_id == models.Item.id)
        .outerjoin(models.Customer, models.SalesInvoice.customer_id == models.Customer.id)
        .filter(
            models.SalesInvoice.company_id == company_id,
            models.SalesInvoice.date >= from_date,
            models.SalesInvoice.date <= to_date
        )
    )
    if item_id:
        sales_query = sales_query.filter(models.SalesInvoiceLine.item_id == item_id)
    if party_name:
        sales_query = sales_query.filter(models.Customer.name.ilike(f"%{party_name}%"))
        
    for r in sales_query.all():
        qty  = float(r.qty  or 0)
        rate = float(r.rate or 0)
        amount = float(r.amount) if r.amount is not None else qty * rate
        rows.append(schemas.ItemHistoryRow(
            date=r.date,
            voucher_type="Sales Invoice",
            voucher_number=r.voucher_number,
            party_name=r.party_name,
            item_id=r.item_id,
            item_name=r.item_name,
            qty=qty,
            rate=rate,
            amount=amount,
        ))
        
    # 2. Purchase Bills
    purchases_query = (
        db.query(
            models.PurchaseBillLine.item_id,
            models.Item.name.label("item_name"),
            models.PurchaseBill.date.label("date"),
            models.PurchaseBill.reference.label("voucher_number"),
            models.Supplier.name.label("party_name"),
            models.PurchaseBillLine.quantity.label("qty"),
            models.PurchaseBillLine.rate,
            ((models.PurchaseBillLine.quantity * models.PurchaseBillLine.rate) - models.PurchaseBillLine.discount).label("amount")
        )
        .join(models.PurchaseBill, models.PurchaseBillLine.bill_id == models.PurchaseBill.id)
        .join(models.Item, models.PurchaseBillLine.item_id == models.Item.id)
        .outerjoin(models.Supplier, models.PurchaseBill.supplier_id == models.Supplier.id)
        .filter(
            models.PurchaseBill.company_id == company_id,
            models.PurchaseBill.date >= from_date,
            models.PurchaseBill.date <= to_date
        )
    )
    if item_id:
        purchases_query = purchases_query.filter(models.PurchaseBillLine.item_id == item_id)
    if party_name:
        purchases_query = purchases_query.filter(models.Supplier.name.ilike(f"%{party_name}%"))
        
    for r in purchases_query.all():
        qty  = float(r.qty  or 0)
        rate = float(r.rate or 0)
        amount = float(r.amount) if r.amount is not None else qty * rate
        rows.append(schemas.ItemHistoryRow(
            date=r.date,
            voucher_type="Purchase Invoice",
            voucher_number=r.voucher_number,
            party_name=r.party_name,
            item_id=r.item_id,
            item_name=r.item_name,
            qty=qty,
            rate=rate,
            amount=amount,
        ))
        
    # 3. Sales Returns
    sales_ret_query = (
        db.query(
            models.SalesReturnLine.item_id,
            models.Item.name.label("item_name"),
            models.SalesReturn.date.label("date"),
            models.SalesReturn.reference.label("voucher_number"),
            models.Customer.name.label("party_name"),
            models.SalesReturnLine.quantity.label("qty"),
            models.SalesReturnLine.rate,
            ((models.SalesReturnLine.quantity * models.SalesReturnLine.rate) - models.SalesReturnLine.discount).label("amount")
        )
        .join(models.SalesReturn, models.SalesReturnLine.return_id == models.SalesReturn.id)
        .join(models.Item, models.SalesReturnLine.item_id == models.Item.id)
        .outerjoin(models.Customer, models.SalesReturn.customer_id == models.Customer.id)
        .filter(
            models.SalesReturn.company_id == company_id,
            models.SalesReturn.date >= from_date,
            models.SalesReturn.date <= to_date
        )
    )
    if item_id:
        sales_ret_query = sales_ret_query.filter(models.SalesReturnLine.item_id == item_id)
    if party_name:
        sales_ret_query = sales_ret_query.filter(models.Customer.name.ilike(f"%{party_name}%"))
        
    for r in sales_ret_query.all():
        qty  = float(r.qty  or 0)
        rate = float(r.rate or 0)
        amount = float(r.amount) if r.amount is not None else qty * rate
        rows.append(schemas.ItemHistoryRow(
            date=r.date,
            voucher_type="Sales Return",
            voucher_number=r.voucher_number,
            party_name=r.party_name,
            item_id=r.item_id,
            item_name=r.item_name,
            qty=qty,
            rate=rate,
            amount=amount,
        ))
        
    # 4. Purchase Returns
    purc_ret_query = (
        db.query(
            models.PurchaseReturnLine.item_id,
            models.Item.name.label("item_name"),
            models.PurchaseReturn.date.label("date"),
            models.PurchaseReturn.reference.label("voucher_number"),
            models.Supplier.name.label("party_name"),
            models.PurchaseReturnLine.quantity.label("qty"),
            models.PurchaseReturnLine.rate,
            ((models.PurchaseReturnLine.quantity * models.PurchaseReturnLine.rate) - models.PurchaseReturnLine.discount).label("amount")
        )
        .join(models.PurchaseReturn, models.PurchaseReturnLine.return_id == models.PurchaseReturn.id)
        .join(models.Item, models.PurchaseReturnLine.item_id == models.Item.id)
        .outerjoin(models.Supplier, models.PurchaseReturn.supplier_id == models.Supplier.id)
        .filter(
            models.PurchaseReturn.company_id == company_id,
            models.PurchaseReturn.date >= from_date,
            models.PurchaseReturn.date <= to_date
        )
    )
    if item_id:
        purc_ret_query = purc_ret_query.filter(models.PurchaseReturnLine.item_id == item_id)
    if party_name:
        purc_ret_query = purc_ret_query.filter(models.Supplier.name.ilike(f"%{party_name}%"))
        
    for r in purc_ret_query.all():
        qty  = float(r.qty  or 0)
        rate = float(r.rate or 0)
        amount = float(r.amount) if r.amount is not None else qty * rate
        rows.append(schemas.ItemHistoryRow(
            date=r.date,
            voucher_type="Purchase Return",
            voucher_number=r.voucher_number,
            party_name=r.party_name,
            item_id=r.item_id,
            item_name=r.item_name,
            qty=qty,
            rate=rate,
            amount=amount,
        ))
        
    # Sort by date desc
    rows.sort(key=lambda x: x.date, reverse=True)
    
    return schemas.ItemHistoryReport(
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        rows=rows
    )


@router.get("/bom-transactions", response_model=schemas.BOMTransactionsReport)
def bom_transactions_report(
    company_id: int,
    from_date: date = Query(..., description="Inclusive AD start date"),
    to_date: date = Query(..., description="Inclusive AD end date"),
    kind: str = Query("all", description="all | production | kit_sales"),
    warehouse_id: int | None = Query(None),
    product_id: int | None = Query(None, description="Filter by finished / kit parent item id"),
    department_id: int | None = Query(None, description="Filter by department"),
    project_id: int | None = Query(None, description="Filter by project"),
    segment_id: int | None = Query(None, description="Filter by segment"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Production BOM consumption/output and phantom kit sale component issues."""
    _get_company(db, company_id, current_user)

    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be on or before to_date")

    k = (kind or "all").strip().lower()
    if k not in ("all", "production", "kit_sales"):
        raise HTTPException(status_code=400, detail="kind must be all, production, or kit_sales")

    out_rows: list[schemas.BOMTransactionRow] = []

    if k in ("all", "production"):
        orders = (
            db.query(models.ProductionOrder)
            .options(
                joinedload(models.ProductionOrder.product),
                joinedload(models.ProductionOrder.warehouse),
                joinedload(models.ProductionOrder.items).joinedload(models.ProductionItem.product),
            )
            .filter(
                models.ProductionOrder.company_id == company_id,
                models.ProductionOrder.status == models.ProductionOrderStatus.COMPLETED,
                func.date(models.ProductionOrder.created_at) >= from_date,
                func.date(models.ProductionOrder.created_at) <= to_date,
            )
        )
        if department_id is not None or project_id is not None or segment_id is not None:
            orders = orders.outerjoin(
                models.Warehouse,
                models.Warehouse.id == models.ProductionOrder.warehouse_id,
            )
            if department_id is not None:
                orders = orders.filter(
                    func.coalesce(
                        models.ProductionOrder.department_id,
                        models.Warehouse.department_id,
                    )
                    == int(department_id)
                )
            if project_id is not None:
                orders = orders.filter(
                    func.coalesce(
                        models.ProductionOrder.project_id,
                        models.Warehouse.project_id,
                    )
                    == int(project_id)
                )
            if segment_id is not None:
                orders = orders.filter(
                    func.coalesce(
                        models.ProductionOrder.segment_id,
                        models.Warehouse.segment_id,
                    )
                    == int(segment_id)
                )
        if warehouse_id is not None:
            orders = orders.filter(models.ProductionOrder.warehouse_id == int(warehouse_id))
        if product_id is not None:
            orders = orders.filter(models.ProductionOrder.product_id == int(product_id))
        orders = orders.all()

        order_ids = [int(o.id) for o in orders]
        ledger_by_order_item: dict[tuple[int, int], models.StockLedger] = {}
        if order_ids:
            ledgers = (
                db.query(models.StockLedger)
                .filter(
                    models.StockLedger.company_id == company_id,
                    models.StockLedger.source_type == "PRODUCTION_ORDER",
                    models.StockLedger.source_id.in_(order_ids),
                    models.StockLedger.reversed_at.is_(None),
                )
                .all()
            )
            for sl in ledgers:
                ledger_by_order_item[(int(sl.source_id), int(sl.item_id))] = sl

        for order in orders:
            txn_d = order.created_at.date() if order.created_at else from_date
            wh_id = int(order.warehouse_id) if order.warehouse_id is not None else None
            wh_name = order.warehouse.name if order.warehouse else None
            # Display only explicit user overrides on rows. If the persisted value
            # equals the warehouse default, treat it as auto-defaulted and hide it.
            wh_dept_id = int(order.warehouse.department_id) if order.warehouse and order.warehouse.department_id is not None else None
            wh_project_id = int(order.warehouse.project_id) if order.warehouse and order.warehouse.project_id is not None else None
            wh_segment_id = int(order.warehouse.segment_id) if order.warehouse and order.warehouse.segment_id is not None else None
            order_dept_id = int(order.department_id) if order.department_id is not None else None
            order_project_id = int(order.project_id) if order.project_id is not None else None
            order_segment_id = int(order.segment_id) if order.segment_id is not None else None
            override_dept_id = order_dept_id if order_dept_id is not None and order_dept_id != wh_dept_id else None
            override_project_id = order_project_id if order_project_id is not None and order_project_id != wh_project_id else None
            override_segment_id = order_segment_id if order_segment_id is not None and order_segment_id != wh_segment_id else None
            parent = order.product
            pid = int(order.product_id)

            for pi in order.items or []:
                comp = pi.product
                cid = int(pi.product_id)
                qty = float(pi.consumed_qty or 0)
                sl = ledger_by_order_item.get((int(order.id), cid))
                uc = float(sl.unit_cost) if sl and sl.unit_cost is not None else None
                amt = abs(float(sl.qty_delta or 0)) * uc if (sl and uc is not None) else None
                out_rows.append(
                    schemas.BOMTransactionRow(
                        row_type="production_consume",
                        txn_date=txn_d,
                        ref_id=int(order.id),
                        ref_label=f"Production #{order.id}",
                        parent_item_id=pid,
                        parent_item_code=getattr(parent, "code", None),
                        parent_item_name=getattr(parent, "name", None),
                        component_item_id=cid,
                        component_item_code=getattr(comp, "code", None),
                        component_item_name=getattr(comp, "name", None),
                        qty=qty,
                        warehouse_id=wh_id,
                        warehouse_name=wh_name,
                        department_id=override_dept_id,
                        project_id=override_project_id,
                        segment_id=override_segment_id,
                        unit_cost=uc,
                        amount=amt,
                        bom_id=int(order.bom_id) if order.bom_id is not None else None,
                    )
                )

            sl_out = ledger_by_order_item.get((int(order.id), pid))
            if sl_out and float(sl_out.qty_delta or 0) > 0:
                qo = float(sl_out.qty_delta or 0)
                uc = float(sl_out.unit_cost) if sl_out.unit_cost is not None else None
                amt = qo * uc if uc is not None else None
                out_rows.append(
                    schemas.BOMTransactionRow(
                        row_type="production_output",
                        txn_date=txn_d,
                        ref_id=int(order.id),
                        ref_label=f"Production #{order.id}",
                        parent_item_id=pid,
                        parent_item_code=getattr(parent, "code", None),
                        parent_item_name=getattr(parent, "name", None),
                        component_item_id=None,
                        component_item_code=None,
                        component_item_name=None,
                        qty=qo,
                        warehouse_id=wh_id,
                        warehouse_name=wh_name,
                        department_id=override_dept_id,
                        project_id=override_project_id,
                        segment_id=override_segment_id,
                        unit_cost=uc,
                        amount=amt,
                        bom_id=int(order.bom_id) if order.bom_id is not None else None,
                    )
                )

    if k in ("all", "kit_sales"):
        KitItem = aliased(models.Item)
        CompItem = aliased(models.Item)
        q = (
            db.query(
                models.SalesInvoice.date.label("txn_date"),
                models.SalesInvoice.id.label("invoice_id"),
                models.SalesInvoice.reference.label("inv_ref"),
                models.SalesInvoiceLine.item_id.label("kit_item_id"),
                KitItem.code.label("kit_code"),
                KitItem.name.label("kit_name"),
                models.StockLedger.item_id.label("comp_id"),
                CompItem.code.label("comp_code"),
                CompItem.name.label("comp_name"),
                models.StockLedger.qty_delta.label("qty_delta"),
                models.StockLedger.unit_cost.label("unit_cost"),
                models.StockLedger.warehouse_id.label("wh_id"),
                models.Warehouse.name.label("wh_name"),
                models.SalesInvoiceLine.department_id.label("department_id"),
                models.SalesInvoiceLine.project_id.label("project_id"),
                models.SalesInvoiceLine.segment_id.label("segment_id"),
            )
            .select_from(models.StockLedger)
            .join(
                models.SalesInvoiceLine,
                models.SalesInvoiceLine.id == models.StockLedger.source_line_id,
            )
            .join(models.SalesInvoice, models.SalesInvoice.id == models.SalesInvoiceLine.invoice_id)
            .join(KitItem, KitItem.id == models.SalesInvoiceLine.item_id)
            .join(CompItem, CompItem.id == models.StockLedger.item_id)
            .outerjoin(models.Warehouse, models.Warehouse.id == models.StockLedger.warehouse_id)
            .filter(
                models.StockLedger.company_id == company_id,
                models.StockLedger.source_type == "SALES_INVOICE",
                models.StockLedger.reversed_at.is_(None),
                KitItem.sell_as_kit.is_(True),
                models.StockLedger.item_id != models.SalesInvoiceLine.item_id,
                models.SalesInvoice.company_id == company_id,
                models.SalesInvoice.date >= from_date,
                models.SalesInvoice.date <= to_date,
            )
        )
        if warehouse_id is not None:
            q = q.filter(models.StockLedger.warehouse_id == int(warehouse_id))
        if product_id is not None:
            q = q.filter(models.SalesInvoiceLine.item_id == int(product_id))
        if department_id is not None:
            q = q.filter(models.SalesInvoiceLine.department_id == int(department_id))
        if project_id is not None:
            q = q.filter(models.SalesInvoiceLine.project_id == int(project_id))
        if segment_id is not None:
            q = q.filter(models.SalesInvoiceLine.segment_id == int(segment_id))

        for r in q.all():
            q_qty = abs(float(r.qty_delta or 0))
            uc = float(r.unit_cost) if r.unit_cost is not None else None
            amt = q_qty * uc if uc is not None else None
            ref = (r.inv_ref or "").strip() if r.inv_ref else None
            out_rows.append(
                schemas.BOMTransactionRow(
                    row_type="kit_sale_component",
                    txn_date=r.txn_date,
                    ref_id=int(r.invoice_id),
                    ref_label=ref or f"Sales invoice #{r.invoice_id}",
                    parent_item_id=int(r.kit_item_id),
                    parent_item_code=r.kit_code,
                    parent_item_name=r.kit_name,
                    component_item_id=int(r.comp_id),
                    component_item_code=r.comp_code,
                    component_item_name=r.comp_name,
                    qty=q_qty,
                    warehouse_id=int(r.wh_id) if r.wh_id is not None else None,
                    warehouse_name=r.wh_name,
                    department_id=int(r.department_id) if r.department_id is not None else None,
                    project_id=int(r.project_id) if r.project_id is not None else None,
                    segment_id=int(r.segment_id) if r.segment_id is not None else None,
                    unit_cost=uc,
                    amount=amt,
                    bom_id=None,
                )
            )

    type_order = {"production_consume": 0, "production_output": 1, "kit_sale_component": 2}
    out_rows.sort(
        key=lambda x: (
            x.txn_date,
            type_order.get(x.row_type, 9),
            x.ref_id,
            x.component_item_id or 0,
        )
    )

    return schemas.BOMTransactionsReport(
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        rows=out_rows,
    )

