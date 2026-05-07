from __future__ import annotations

from dataclasses import dataclass
from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models
from .stock_service import StockValuationService


@dataclass(frozen=True)
class FinalAccountLine:
    label: str
    amount: float
    ledger_id: int | None = None


@dataclass(frozen=True)
class FinalAccountBalancingEntry:
    label: str
    side: str  # "DEBIT" or "CREDIT"
    amount: float


@dataclass(frozen=True)
class FinalAccountResult:
    report_type: str  # "TRADING" or "PROFIT_LOSS"
    from_date: date
    to_date: date
    debit: list[FinalAccountLine]
    credit: list[FinalAccountLine]
    balancing_entry: FinalAccountBalancingEntry
    debit_total: float
    credit_total: float


def _round2(x: float) -> float:
    return float(round(float(x or 0.0), 2))


def _sum_voucher_lines(
    db: Session,
    *,
    company_id: int,
    ledger_ids: list[int],
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> tuple[float, float]:
    if not ledger_ids:
        return 0.0, 0.0

    q = (
        db.query(
            func.coalesce(func.sum(models.VoucherLine.debit), 0),
            func.coalesce(func.sum(models.VoucherLine.credit), 0),
        )
        .join(models.Voucher)
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
            models.VoucherLine.ledger_id.in_(ledger_ids),
        )
    )

    if department_id is not None:
        q = q.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        q = q.filter(models.VoucherLine.project_id == project_id)
    if segment_id is not None:
        q = q.filter(models.VoucherLine.segment_id == segment_id)
    if employee_id is not None:
        q = q.filter(models.VoucherLine.employee_id == employee_id)

    debits, credits = q.one()
    return float(debits or 0.0), float(credits or 0.0)


def _get_ledger_balances(
    db: Session,
    *,
    company_id: int,
    ledger_ids: list[int],
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> dict[int, tuple[float, float]]:
    """Returns a map of ledger_id -> (debit_sum, credit_sum) for the given criteria."""
    if not ledger_ids:
        return {}

    q = (
        db.query(
            models.VoucherLine.ledger_id,
            func.coalesce(func.sum(models.VoucherLine.debit), 0).label("debits"),
            func.coalesce(func.sum(models.VoucherLine.credit), 0).label("credits"),
        )
        .join(models.Voucher)
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.voucher_date >= from_date,
            models.Voucher.voucher_date <= to_date,
            models.VoucherLine.ledger_id.in_(ledger_ids),
        )
        .group_by(models.VoucherLine.ledger_id)
    )

    if department_id is not None:
        q = q.filter(models.VoucherLine.department_id == department_id)
    if project_id is not None:
        q = q.filter(models.VoucherLine.project_id == project_id)
    if segment_id is not None:
        q = q.filter(models.VoucherLine.segment_id == segment_id)
    if employee_id is not None:
        q = q.filter(models.VoucherLine.employee_id == employee_id)

    results = q.all()
    return {
        r.ledger_id: (float(r.debits or 0.0), float(r.credits or 0.0))
        for r in results
    }


def _exclude_tax_ledgers(company: models.Company) -> set[int]:
    excluded: set[int] = set()

    for attr in (
        "default_input_tax_ledger_id",
        "default_output_tax_ledger_id",
        "default_item_input_tax_ledger_id",
        "default_item_output_tax_ledger_id",
    ):
        v = getattr(company, attr, None)
        if v is not None:
            excluded.add(int(v))

    return excluded


def _inventory_value_as_of(
    db: Session,
    *,
    company: models.Company,
    as_on_date: date,
) -> float:
    svc = StockValuationService(db)
    by_product = svc.get_valuation_by_product(company=company, as_of=as_on_date, ignore_fixed_assets=True)
    return float(sum(v.value for v in by_product.values()))


def _stock_purchases_value(
    db: Session,
    company_id: int,
    from_date: date,
    to_date: date,
) -> float:
    """Calculates the total value of stock explicitly purchased in the period by reading the StockLedger."""
    purchases = (
        db.query(func.sum(models.StockLedger.qty_delta * models.StockLedger.unit_cost))
        .join(models.Item, models.Item.id == models.StockLedger.item_id)
        .filter(
            models.StockLedger.company_id == company_id,
            models.StockLedger.source_type == "PURCHASE_BILL",
            # We want positive inflows
            models.StockLedger.qty_delta > 0,
            models.StockLedger.reversed_at.is_(None),
            models.Item.is_fixed_asset.is_(False),
            # Date filtering - posted_at is usually datetime, so cast to date if needed,
            # or rely on Voucher date implicitly. For accuracy, we should join Voucher or PurchaseBill.
            # But StockLedger has `posted_at` which is a datetime.
            func.date(models.StockLedger.posted_at) >= from_date,
            func.date(models.StockLedger.posted_at) <= to_date,
        )
        .scalar()
    )
    return float(purchases or 0.0)



def _find_group_ledger_ids(db: Session, *, company_id: int, group_names: set[str], excluded_ledgers: set[int]) -> list[int]:
    if not group_names:
        return []

    # 1. Fetch all groups for the company to build an in-memory tree (usually small, <100 rows)
    all_groups = (
        db.query(models.LedgerGroup.id, models.LedgerGroup.parent_group_id, models.LedgerGroup.name)
        .filter(models.LedgerGroup.company_id == company_id)
        .all()
    )

    # 2. Identify root matches
    target_group_ids = set()
    for gid, pid, name in all_groups:
        if name in group_names:
            target_group_ids.add(gid)
    
    # 3. Find all descendants recursively
    # We loop until no new descendants are found (simple closure)
    found_any = True
    while found_any:
        found_any = False
        for gid, pid, name in all_groups:
            if pid in target_group_ids and gid not in target_group_ids:
                target_group_ids.add(gid)
                found_any = True

    if not target_group_ids:
        return []

    # 4. Fetch ledgers belonging to these groups
    rows = (
        db.query(models.Ledger.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.group_id.in_(list(target_group_ids)),
        )
        .all()
    )

    out = []
    for (lid,) in rows:
        if lid is None:
            continue
        lid_i = int(lid)
        if lid_i in excluded_ledgers:
            continue
        out.append(lid_i)
    return out


def _get_lines_from_ids(
    db: Session,
    company_id: int,
    ledger_ids: set[int],
    from_date: date,
    to_date: date,
    department_id: int | None,
    project_id: int | None,
    segment_id: int | None = None,
    employee_id: int | None = None,
    invert_sign: bool = False
) -> tuple[float, list[FinalAccountLine]]:
    """Helper to fetch balances and create FinalAccountLine objects for a set of ledgers."""
    if not ledger_ids:
        return 0.0, []

    balances = _get_ledger_balances(
        db, company_id=company_id, ledger_ids=sorted(list(ledger_ids)),
        from_date=from_date, to_date=to_date,
        department_id=department_id, project_id=project_id, segment_id=segment_id, employee_id=employee_id
    )
    
    # Fetch names
    names = {}
    if ledger_ids:
        rows = db.query(models.Ledger.id, models.Ledger.name).filter(models.Ledger.id.in_(list(ledger_ids))).all()
        names = {r.id: r.name for r in rows}
        
    lines = []
    total = 0.0
    for lid, (dr, cr) in balances.items():
        # if invert_sign (e.g. Expenses), Debit is positive so (dr - cr)
        # else (e.g. Income), Credit is positive so (cr - dr)
        net = (dr - cr) if invert_sign else (cr - dr)
        
        # Filter zero-balance lines to reduce clutter, though 
        # sometimes users want to see them if there was movement?
        # For P&L, usually only lines with net impact matter.
        if abs(net) > 0.001:
            total += net
            lines.append(FinalAccountLine(
                label=names.get(lid, f"Ledger #{lid}"),
                amount=_round2(net),
                ledger_id=lid
            ))
            
    lines.sort(key=lambda x: x.label)
    return total, lines


def compute_trading_account(
    db: Session,
    *,
    tenant_id: int,
    company_id: int,
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> FinalAccountResult:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    company = (
        db.query(models.Company)
        .filter(models.Company.id == company_id, models.Company.tenant_id == tenant_id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    excluded_tax_ledgers = _exclude_tax_ledgers(company)

    opening_as_of = from_date - timedelta(days=1)
    opening_stock = max(_inventory_value_as_of(db, company=company, as_on_date=opening_as_of), 0.0)
    closing_stock = max(_inventory_value_as_of(db, company=company, as_on_date=to_date), 0.0)

    # --- Purchases ---
    purchase_ledger_ids: set[int] = set()
    default_purchase = getattr(company, "default_purchase_ledger_id", None)
    if default_purchase is not None:
        purchase_ledger_ids.add(int(default_purchase))

    default_item_expense = getattr(company, "default_item_expense_ledger_id", None)
    if default_item_expense is not None:
        purchase_ledger_ids.add(int(default_item_expense))
    
    purchase_ledger_ids.update(
        _find_group_ledger_ids(
            db,
            company_id=company_id,
            group_names={"Purchase Accounts", "Purchases", "Cost of Goods Sold"},
            excluded_ledgers=excluded_tax_ledgers,
        )
    )
    purchase_ledger_ids.difference_update(excluded_tax_ledgers)
    
    purchases_total, purchase_lines = _get_lines_from_ids(
        db, company_id, purchase_ledger_ids, from_date, to_date, department_id, project_id, segment_id, employee_id, invert_sign=True
    )

    # --- Sales ---
    sales_ledger_ids: set[int] = set()
    default_sales = getattr(company, "default_sales_ledger_id", None)
    if default_sales is not None:
        sales_ledger_ids.add(int(default_sales))

    default_item_income = getattr(company, "default_item_income_ledger_id", None)
    if default_item_income is not None:
        sales_ledger_ids.add(int(default_item_income))
    
    sales_ledger_ids.update(
        _find_group_ledger_ids(
            db,
            company_id=company_id,
            group_names={"Sales Accounts", "Sales", "Direct Income", "Sales of Goods"},
            excluded_ledgers=excluded_tax_ledgers,
        )
    )
    sales_ledger_ids.difference_update(excluded_tax_ledgers)

    sales_total, sales_lines = _get_lines_from_ids(
        db, company_id, sales_ledger_ids, from_date, to_date, department_id, project_id, segment_id, employee_id, invert_sign=False
    )

    # --- Direct Expenses ---
    # We must EXCLUDE the specific COGS ledger from Direct Expenses to avoid double counting
    # because we are artificially showing Opening + Stock Purchases - Closing stock in Trading Account.
    cogs_ledger_ids = set(_find_group_ledger_ids(
        db,
        company_id=company_id,
        group_names={"Cost of Goods Sold", "COGS"},
        excluded_ledgers=set(),
    ))
    # Also explicitly find any ledger explicitly named 'Cost of Goods Sold' or 'COGS'
    cogs_by_name = db.query(models.Ledger.id).filter(
        models.Ledger.company_id == company_id,
        models.Ledger.name.in_(["Cost of Goods Sold", "COGS"])
    ).all()
    cogs_ledger_ids.update(r[0] for r in cogs_by_name)
    
    exclude_for_direct_exp = excluded_tax_ledgers.union(purchase_ledger_ids).union(cogs_ledger_ids)

    direct_exp_ledger_ids = set(_find_group_ledger_ids(
        db,
        company_id=company_id,
        group_names={"Direct Expenses"},
        excluded_ledgers=exclude_for_direct_exp,
    ))

    direct_expenses_total, direct_expense_lines = _get_lines_from_ids(
        db, company_id, direct_exp_ledger_ids, from_date, to_date, department_id, project_id, segment_id, employee_id, invert_sign=True
    )

    # --- Stock Purchases ---
    stock_purchases_val = _stock_purchases_value(db, company_id=company_id, from_date=from_date, to_date=to_date)

    # Construct Lines
    debit_lines: list[FinalAccountLine] = [
        FinalAccountLine(label="Opening Stock", amount=_round2(opening_stock)),
    ]
    if stock_purchases_val > 0.0:
        debit_lines.append(FinalAccountLine(label="Stock Purchases", amount=_round2(stock_purchases_val)))
        
    # Direct breakdown of financial purchases
    debit_lines.extend(purchase_lines)
        
    # Direct breakdown of direct expenses
    debit_lines.extend(direct_expense_lines)

    credit_lines: list[FinalAccountLine] = []
    # Detailed sales lines
    credit_lines.extend(sales_lines)
    
    credit_lines.append(FinalAccountLine(label="Closing Stock", amount=_round2(closing_stock)))

    debit_total = sum(l.amount for l in debit_lines)
    credit_total = sum(l.amount for l in credit_lines)

    gross = _round2(credit_total - debit_total)
    if gross >= 0:
        balancing = FinalAccountBalancingEntry(label="Gross Profit c/o", side="DEBIT", amount=_round2(gross))
        debit_total = _round2(debit_total + balancing.amount)
        credit_total = _round2(credit_total)
    else:
        balancing = FinalAccountBalancingEntry(label="Gross Loss c/o", side="CREDIT", amount=_round2(-gross))
        credit_total = _round2(credit_total + balancing.amount)
        debit_total = _round2(debit_total)

    if abs(debit_total - credit_total) > 0.01:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Trading account did not balance",
                "debit_total": debit_total,
                "credit_total": credit_total,
                "gross": gross,
            },
        )

    return FinalAccountResult(
        report_type="TRADING",
        from_date=from_date,
        to_date=to_date,
        debit=debit_lines,
        credit=credit_lines,
        balancing_entry=balancing,
        debit_total=debit_total,
        credit_total=credit_total,
    )


def compute_profit_and_loss(
    db: Session,
    *,
    tenant_id: int,
    company_id: int,
    from_date: date,
    to_date: date,
    department_id: int | None = None,
    project_id: int | None = None,
    segment_id: int | None = None,
    employee_id: int | None = None,
) -> FinalAccountResult:
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date cannot be after to_date")

    company = (
        db.query(models.Company)
        .filter(models.Company.id == company_id, models.Company.tenant_id == tenant_id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    excluded_tax_ledgers = _exclude_tax_ledgers(company)

    trading = compute_trading_account(
        db,
        tenant_id=tenant_id,
        company_id=company_id,
        from_date=from_date,
        to_date=to_date,
        department_id=department_id,
        project_id=project_id,
        segment_id=segment_id,
        employee_id=employee_id,
    )

    gp = float(trading.balancing_entry.amount)
    gp_is_profit = trading.balancing_entry.label.lower().startswith("gross profit")

    # To ensure consistency with the Details/Hierarchical view (which includes ALL Income/Expense ledgers),
    # we must capture all ledgers that were NOT used in the Trading Account as Indirects.
    # Otherwise, custom groups like "Office Expenses" (if not under "Indirect Expenses") are ignored.

    # 1. Identify Ledgers used in Trading Account (Purchase, Sales, Direct Expenses)
    # This logic must match compute_trading_account exactly.
    
    # 1a. Purchases
    purchase_ledger_ids: set[int] = set()
    default_purchase = getattr(company, "default_purchase_ledger_id", None)
    if default_purchase is not None:
        purchase_ledger_ids.add(int(default_purchase))

    default_item_expense = getattr(company, "default_item_expense_ledger_id", None)
    if default_item_expense is not None:
        purchase_ledger_ids.add(int(default_item_expense))

    purchase_ledger_ids.update(
        _find_group_ledger_ids(
            db,
            company_id=company_id,
            group_names={"Purchase Accounts", "Purchases", "Cost of Goods Sold"},
            excluded_ledgers=excluded_tax_ledgers,
        )
    )
    purchase_ledger_ids.difference_update(excluded_tax_ledgers)

    # 1b. Sales
    sales_ledger_ids: set[int] = set()
    default_sales = getattr(company, "default_sales_ledger_id", None)
    if default_sales is not None:
        sales_ledger_ids.add(int(default_sales))

    default_item_income = getattr(company, "default_item_income_ledger_id", None)
    if default_item_income is not None:
        sales_ledger_ids.add(int(default_item_income))

    sales_ledger_ids.update(
        _find_group_ledger_ids(
            db,
            company_id=company_id,
            group_names={"Sales Accounts", "Sales", "Direct Income", "Sales of Goods"},
            excluded_ledgers=excluded_tax_ledgers,
        )
    )
    sales_ledger_ids.difference_update(excluded_tax_ledgers)

    # 1c. Direct Expenses
    direct_exp_ledger_ids = set(
        _find_group_ledger_ids(
            db,
            company_id=company_id,
            group_names={"Direct Expenses"},
            excluded_ledgers=excluded_tax_ledgers,
        )
    )

    # 2. Identify ALL Expenses and Incomes (excluding Tax ledgers)
    all_expense_rows = (
        db.query(models.Ledger.id)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.LedgerGroup.group_type == models.LedgerGroupType.EXPENSE,
        )
        .all()
    )
    all_expense_ids = {int(lid) for (lid,) in all_expense_rows}
    all_expense_ids.difference_update(excluded_tax_ledgers)

    all_income_rows = (
        db.query(models.Ledger.id)
        .join(models.LedgerGroup, models.Ledger.group_id == models.LedgerGroup.id)
        .filter(
            models.Ledger.company_id == company_id,
            models.LedgerGroup.group_type == models.LedgerGroupType.INCOME,
        )
        .all()
    )
    all_income_ids = {int(lid) for (lid,) in all_income_rows}
    all_income_ids.difference_update(excluded_tax_ledgers)

    # 3. Calculate Indirects as Remainder
    # Indirect Expenses = All Expenses - (Purchases + Direct Expenses)
    indirect_exp_ledger_ids = all_expense_ids - purchase_ledger_ids - direct_exp_ledger_ids
    
    # Indirect Income = All Income - Sales (since Trading Account handles Sales/Direct Income)
    # Note: If there are "Direct Income" ledgers, they are collected in sales_ledger_ids above so they are excluded here.
    indirect_income_ledger_ids = all_income_ids - sales_ledger_ids

    # --- Indirect Expenses Breakdown ---
    indirect_expenses_total, indirect_expense_lines = _get_lines_from_ids(
        db, company_id, indirect_exp_ledger_ids, from_date, to_date, department_id, project_id, segment_id, employee_id, invert_sign=True
    )

    # --- Indirect Incomes Breakdown ---
    indirect_incomes_total, income_lines = _get_lines_from_ids(
        db, company_id, indirect_income_ledger_ids, from_date, to_date, department_id, project_id, segment_id, employee_id, invert_sign=False
    )

    debit_lines: list[FinalAccountLine] = []
    credit_lines: list[FinalAccountLine] = []

    if gp_is_profit:
        credit_lines.append(FinalAccountLine(label="Gross Profit b/f", amount=_round2(gp)))
    else:
        debit_lines.append(FinalAccountLine(label="Gross Loss b/f", amount=_round2(gp)))

    # Add detailed indirect expense lines
    debit_lines.extend(indirect_expense_lines)
    
    # Add detailed income lines
    credit_lines.extend(income_lines)

    debit_total = _round2(sum(l.amount for l in debit_lines))
    credit_total = _round2(sum(l.amount for l in credit_lines))

    net = _round2(credit_total - debit_total)
    if net >= 0:
        balancing = FinalAccountBalancingEntry(label="Net Profit", side="DEBIT", amount=_round2(net))
        debit_total = _round2(debit_total + balancing.amount)
    else:
        balancing = FinalAccountBalancingEntry(label="Net Loss", side="CREDIT", amount=_round2(-net))
        credit_total = _round2(credit_total + balancing.amount)

    if abs(debit_total - credit_total) > 0.01:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Profit & Loss did not balance",
                "debit_total": debit_total,
                "credit_total": credit_total,
                "net": net,
            },
        )

    return FinalAccountResult(
        report_type="PROFIT_LOSS",
        from_date=from_date,
        to_date=to_date,
        debit=debit_lines,
        credit=credit_lines,
        balancing_entry=balancing,
        debit_total=debit_total,
        credit_total=credit_total,
    )
