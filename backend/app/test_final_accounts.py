from __future__ import annotations

from datetime import date, datetime

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy import create_engine, JSON
from sqlalchemy.orm import sessionmaker

# Monkeypatch JSONB for SQLite testing
postgresql.JSONB = JSON

from .database import Base
from . import models
from .final_accounts_service import compute_profit_and_loss, compute_trading_account


@pytest.fixture()
def db_session():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


def _mk_group(db, *, company_id: int, name: str, group_type: models.LedgerGroupType) -> models.LedgerGroup:
    g = models.LedgerGroup(company_id=company_id, name=name, group_type=group_type)
    db.add(g)
    db.flush()
    return g


def _mk_ledger(db, *, company_id: int, group: models.LedgerGroup, name: str, code: str | None = None) -> models.Ledger:
    l = models.Ledger(
        company_id=company_id,
        group_id=group.id,
        name=name,
        code=code,
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
    )
    db.add(l)
    db.flush()
    return l


def _post_voucher(db, *, company_id: int, when: date, lines: list[tuple[int, float, float]]):
    v = models.Voucher(company_id=company_id, voucher_date=when, voucher_type=models.VoucherType.JOURNAL)
    db.add(v)
    db.flush()

    for ledger_id, debit, credit in lines:
        db.add(models.VoucherLine(voucher_id=v.id, ledger_id=ledger_id, debit=debit, credit=credit))


def test_trading_and_profit_loss_balance_and_classification(db_session):
    # Tenant + settings
    tenant = models.Tenant(name="T1")
    db_session.add(tenant)
    db_session.flush()

    db_session.add(
        models.TenantSettings(
            tenant_id=tenant.id,
            inventory_valuation_method=models.InventoryValuationMethod.AVERAGE,
            allow_negative_stock=False,
        )
    )

    user = models.User(
        email="u@example.com",
        full_name="User",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
    )
    db_session.add(user)
    db_session.flush()

    company = models.Company(owner_id=user.id, tenant_id=tenant.id, name="C1")
    db_session.add(company)
    db_session.flush()

    # Ledger groups
    g_sales = _mk_group(db_session, company_id=company.id, name="Sales Accounts", group_type=models.LedgerGroupType.INCOME)
    g_purchase = _mk_group(db_session, company_id=company.id, name="Purchase Accounts", group_type=models.LedgerGroupType.EXPENSE)
    g_direct_exp = _mk_group(db_session, company_id=company.id, name="Direct Expenses", group_type=models.LedgerGroupType.EXPENSE)
    g_indirect_exp = _mk_group(db_session, company_id=company.id, name="Indirect Expenses", group_type=models.LedgerGroupType.EXPENSE)
    g_indirect_inc = _mk_group(db_session, company_id=company.id, name="Indirect Income", group_type=models.LedgerGroupType.INCOME)

    # Utility ledgers to balance vouchers
    g_asset = _mk_group(db_session, company_id=company.id, name="Sundry Debtors", group_type=models.LedgerGroupType.ASSET)
    debtor = _mk_ledger(db_session, company_id=company.id, group=g_asset, name="Debtor")
    cash = _mk_ledger(db_session, company_id=company.id, group=g_asset, name="Cash")

    # Report ledgers
    sales = _mk_ledger(db_session, company_id=company.id, group=g_sales, name="Sales")
    purchases = _mk_ledger(db_session, company_id=company.id, group=g_purchase, name="Purchases")
    direct_exp = _mk_ledger(db_session, company_id=company.id, group=g_direct_exp, name="Freight")
    indirect_exp = _mk_ledger(db_session, company_id=company.id, group=g_indirect_exp, name="Rent")
    indirect_inc = _mk_ledger(db_session, company_id=company.id, group=g_indirect_inc, name="Interest")

    # Tax ledgers (must be excluded from sales/purchases)
    tax_out = _mk_ledger(db_session, company_id=company.id, group=g_sales, name="Output VAT", code="OUTPUT_VAT")
    tax_in = _mk_ledger(db_session, company_id=company.id, group=g_purchase, name="Input VAT", code="INPUT_VAT")

    company.default_sales_ledger_id = sales.id
    company.default_purchase_ledger_id = purchases.id
    company.default_output_tax_ledger_id = tax_out.id
    company.default_input_tax_ledger_id = tax_in.id
    db_session.add(company)

    # Minimal inventory for opening/closing stock valuation
    wh = models.Warehouse(company_id=company.id, code="MAIN", name="Main", is_active=True)
    db_session.add(wh)
    db_session.flush()

    item = models.Item(
        company_id=company.id,
        name="P1",
        opening_stock=10,
        opening_value=1000,
        allow_negative_stock=False,
    )
    db_session.add(item)
    db_session.flush()

    # Stock movements during period: +5 purchase @120, -7 sale
    db_session.add(
        models.StockLedger(
            id=1,
            company_id=company.id,
            warehouse_id=wh.id,
            item_id=item.id,
            qty_delta=5,
            unit_cost=120,
            source_type="PURCHASE_BILL",
            source_id=1,
            source_line_id=None,
            posted_at=datetime(2025, 12, 10, 0, 0, 0),
        )
    )
    db_session.add(
        models.StockLedger(
            id=2,
            company_id=company.id,
            warehouse_id=wh.id,
            item_id=item.id,
            qty_delta=-7,
            unit_cost=110,
            source_type="SALES_INVOICE",
            source_id=1,
            source_line_id=None,
            posted_at=datetime(2025, 12, 20, 0, 0, 0),
        )
    )

    # Period vouchers
    from_date = date(2025, 12, 1)
    to_date = date(2025, 12, 31)

    # Sales: Debtor Dr 2260; Sales Cr 2000; Output VAT Cr 260
    _post_voucher(
        db_session,
        company_id=company.id,
        when=date(2025, 12, 15),
        lines=[
            (debtor.id, 2260, 0),
            (sales.id, 0, 2000),
            (tax_out.id, 0, 260),
        ],
    )

    # Purchases: Purchases Dr 1200; Input VAT Dr 156; Cash Cr 1356
    _post_voucher(
        db_session,
        company_id=company.id,
        when=date(2025, 12, 12),
        lines=[
            (purchases.id, 1200, 0),
            (tax_in.id, 156, 0),
            (cash.id, 0, 1356),
        ],
    )

    # Direct expense Dr 100; Cash Cr 100
    _post_voucher(
        db_session,
        company_id=company.id,
        when=date(2025, 12, 18),
        lines=[
            (direct_exp.id, 100, 0),
            (cash.id, 0, 100),
        ],
    )

    # Indirect expense Dr 300; Cash Cr 300
    _post_voucher(
        db_session,
        company_id=company.id,
        when=date(2025, 12, 22),
        lines=[
            (indirect_exp.id, 300, 0),
            (cash.id, 0, 300),
        ],
    )

    # Indirect income: Cash Dr 50; Interest Cr 50
    _post_voucher(
        db_session,
        company_id=company.id,
        when=date(2025, 12, 25),
        lines=[
            (cash.id, 50, 0),
            (indirect_inc.id, 0, 50),
        ],
    )

    db_session.commit()

    trading = compute_trading_account(
        db_session,
        tenant_id=tenant.id,
        company_id=company.id,
        from_date=from_date,
        to_date=to_date,
    )

    assert trading.debit_total == pytest.approx(trading.credit_total, abs=0.01)
    assert trading.balancing_entry.label in ("Gross Profit c/o", "Gross Loss c/o")

    # Opening stock = 1000.00
    opening_row = next(r for r in trading.debit if r.label == "Opening Stock")
    assert opening_row.amount == pytest.approx(1000.00, abs=0.01)

    # Closing stock from weighted-average:
    # qty_on_hand = 10 + 5 - 7 = 8
    # avg_cost = (1000 + 5*120) / (10+5) = 106.6667
    # closing_value = 853.33
    closing_row = next(r for r in trading.credit if r.label == "Closing Stock")
    assert closing_row.amount == pytest.approx(853.33, abs=0.02)

    # Sales should be 2000 (Output VAT excluded)
    sales_row = next(r for r in trading.credit if r.label == "Sales")
    assert sales_row.amount == pytest.approx(2000.00, abs=0.01)

    # Purchases should be 1200 (Input VAT excluded)
    purchases_row = next(r for r in trading.debit if r.label == "Purchases")
    assert purchases_row.amount == pytest.approx(1200.00, abs=0.01)

    pl = compute_profit_and_loss(
        db_session,
        tenant_id=tenant.id,
        company_id=company.id,
        from_date=from_date,
        to_date=to_date,
    )

    assert pl.debit_total == pytest.approx(pl.credit_total, abs=0.01)
    assert pl.balancing_entry.label in ("Net Profit", "Net Loss")

    # Indirect expenses/incomes should appear
    assert any(r.label == "Indirect Expenses" for r in pl.debit)
    # Indirect incomes are shown as individual ledger names, like "Interest"
    assert any(r.label == "Interest" for r in pl.credit)


def test_balance_sheet_structured_enhancements(db_session):
    # Setup similar to above, but focusing on balance sheet
    tenant = models.Tenant(name="T2")
    db_session.add(tenant)
    db_session.flush()

    user = models.User(
        email="bs@example.com",
        full_name="BS User",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
    )
    db_session.add(user)
    db_session.flush()

    company = models.Company(owner_id=user.id, tenant_id=tenant.id, name="BS Company")
    db_session.add(company)
    db_session.flush()

    # Create groups with names that trigger classification logic
    g_fixed = _mk_group(db_session, company_id=company.id, name="Fixed Assets", group_type=models.LedgerGroupType.ASSET)
    g_current_asset = _mk_group(db_session, company_id=company.id, name="Current Assets", group_type=models.LedgerGroupType.ASSET)
    g_capital = _mk_group(db_session, company_id=company.id, name="Capital Account", group_type=models.LedgerGroupType.LIABILITY)
    g_loans = _mk_group(db_session, company_id=company.id, name="Long-term Loans", group_type=models.LedgerGroupType.LIABILITY)
    g_creditors = _mk_group(db_session, company_id=company.id, name="Sundry Creditors", group_type=models.LedgerGroupType.LIABILITY)

    # Create ledgers
    l_machinery = _mk_ledger(db_session, company_id=company.id, group=g_fixed, name="Machinery")
    l_bank = _mk_ledger(db_session, company_id=company.id, group=g_current_asset, name="Bank")
    l_capital = _mk_ledger(db_session, company_id=company.id, group=g_capital, name="Owner Capital")
    l_loan = _mk_ledger(db_session, company_id=company.id, group=g_loans, name="HBL Loan")
    
    # Opening balances
    l_machinery.opening_balance = 500000
    l_machinery.opening_balance_type = models.OpeningBalanceType.DEBIT
    l_capital.opening_balance = 400000
    l_capital.opening_balance_type = models.OpeningBalanceType.CREDIT
    l_loan.opening_balance = 100000
    l_loan.opening_balance_type = models.OpeningBalanceType.CREDIT
    
    db_session.commit()

    # Test opening balance difference helper
    from .routers.reports import _compute_opening_balance_difference, _get_basic_classification, balance_sheet_structured
    
    diff = _compute_opening_balance_difference(db_session, company.id)
    assert diff == 0 # (500,000 - (400,000 + 100,000))

    # Test classification helper
    assert _get_basic_classification(g_fixed) == "Non-Current"
    assert _get_basic_classification(g_current_asset) == "Current"
    assert _get_basic_classification(g_capital) == "Equity"
    assert _get_basic_classification(g_loans) == "Non-Current"

    # Add a transaction to verify balance computation
    _post_voucher(
        db_session,
        company_id=company.id,
        when=date(2026, 1, 15),
        lines=[
            (l_bank.id, 50000, 0),
            (l_capital.id, 0, 50000),
        ]
    )
    db_session.commit()

    # Mock the Profit & Loss call within structured balance sheet if necessary
    # or just let it run if it's simple. 
    # The balance_sheet_structured endpoint returns a Tally Style report.
    
    report = balance_sheet_structured(
        company_id=company.id,
        as_on_date=date(2026, 1, 31),
        db=db_session,
        current_user=user
    )

    # Verify classifications are in rows (we added it to the labels in SideRow)
    found_fixed = False
    for row in report.assets.rows:
        if "Fixed Assets" in row.group_name and "Non-Current" in row.group_name:
            found_fixed = True
            assert row.amount == 500000
    assert found_fixed

    found_capital = False
    for row in report.liabilities.rows:
        if "Capital Account" in row.group_name and "Equity" in row.group_name:
            found_capital = True
            assert row.amount == 450000 # 400,000 opening + 50,000 from voucher
    assert found_capital

    assert report.totals.difference_in_opening_balance == 0
