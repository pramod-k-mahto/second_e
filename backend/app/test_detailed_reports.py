import pytest
from datetime import date, datetime
from sqlalchemy import create_engine, JSON
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects import postgresql

# Monkeypatch JSONB for SQLite testing
postgresql.JSONB = JSON

from .database import Base
from . import models
from .final_accounts_service import compute_profit_and_loss, compute_trading_account
from .routers import production, reports


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


def _mk_ledger(db, *, company_id: int, group: models.LedgerGroup, name: str) -> models.Ledger:
    l = models.Ledger(
        company_id=company_id,
        group_id=group.id,
        name=name,
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


def _seed_company_for_bom_cc_report(db):
    tenant = models.Tenant(name="Tenant BOM CC")
    db.add(tenant)
    db.flush()

    admin = models.User(
        email="superadmin-bom-cc@example.com",
        full_name="Superadmin",
        password_hash="x",
        role=models.UserRole.superadmin,
        tenant_id=tenant.id,
    )
    db.add(admin)
    db.flush()

    company = models.Company(owner_id=admin.id, tenant_id=tenant.id, name="Company BOM CC")
    db.add(company)
    db.flush()

    dept_default = models.Department(company_id=company.id, name="Default Dept", is_active=True)
    dept_override = models.Department(company_id=company.id, name="Override Dept", is_active=True)
    db.add_all([dept_default, dept_override])

    project_default = models.Project(company_id=company.id, name="Default Project", is_active=True)
    db.add(project_default)

    seg_default = models.Segment(company_id=company.id, name="Default Segment", is_active=True)
    seg_override = models.Segment(company_id=company.id, name="Override Segment", is_active=True)
    db.add_all([seg_default, seg_override])
    db.flush()

    warehouse = models.Warehouse(
        company_id=company.id,
        code="MAIN",
        name="Main",
        is_active=True,
        department_id=dept_default.id,
        project_id=project_default.id,
        segment_id=seg_default.id,
    )
    db.add(warehouse)

    finished = models.Item(
        company_id=company.id,
        code="FG-1",
        name="Finished Good",
        unit="pcs",
        opening_stock=0,
        opening_rate=0,
        default_purchase_rate=0,
        default_sales_rate=0,
        default_tax_rate=0,
        allow_negative_stock=False,
        is_active=True,
    )
    component = models.Item(
        company_id=company.id,
        code="RM-1",
        name="Raw Material",
        unit="pcs",
        opening_stock=100,
        opening_rate=5,
        default_purchase_rate=5,
        default_sales_rate=0,
        default_tax_rate=0,
        allow_negative_stock=False,
        is_active=True,
    )
    db.add_all([finished, component])
    db.commit()

    return {
        "admin": admin,
        "company": company,
        "warehouse": warehouse,
        "finished": finished,
        "component": component,
        "dept_default": dept_default,
        "dept_override": dept_override,
        "project_default": project_default,
        "seg_default": seg_default,
        "seg_override": seg_override,
    }


def test_detailed_report_breakdown(db_session):
    # Setup Tenant and Company
    tenant = models.Tenant(name="T_Detailed")
    db_session.add(tenant)
    db_session.flush()

    user = models.User(email="u_detailed@example.com", full_name="User", password_hash="x", role=models.UserRole.user, tenant_id=tenant.id)
    db_session.add(user)
    db_session.flush()

    company = models.Company(owner_id=user.id, tenant_id=tenant.id, name="C_Detailed")
    db_session.add(company)
    db_session.flush()

    # Groups
    g_sales = _mk_group(db_session, company_id=company.id, name="Sales Accounts", group_type=models.LedgerGroupType.INCOME)
    g_other_income = _mk_group(db_session, company_id=company.id, name="Indirect Income", group_type=models.LedgerGroupType.INCOME)
    g_assets = _mk_group(db_session, company_id=company.id, name="Current Assets", group_type=models.LedgerGroupType.ASSET)

    # Ledgers
    product_sales = _mk_ledger(db_session, company_id=company.id, group=g_sales, name="Product Sales")
    service_sales = _mk_ledger(db_session, company_id=company.id, group=g_sales, name="Service Sales")
    
    consulting_income = _mk_ledger(db_session, company_id=company.id, group=g_other_income, name="Consulting Income")
    interest_income = _mk_ledger(db_session, company_id=company.id, group=g_other_income, name="Interest Income")
    
    cash = _mk_ledger(db_session, company_id=company.id, group=g_assets, name="Cash")

    # Transactions
    # 1. Product Sales: Cash Dr 1000, Product Sales Cr 1000
    _post_voucher(db_session, company_id=company.id, when=date(2025, 1, 1), lines=[
        (cash.id, 1000, 0),
        (product_sales.id, 0, 1000)
    ])

    # 2. Service Sales: Cash Dr 500, Service Sales Cr 500
    _post_voucher(db_session, company_id=company.id, when=date(2025, 1, 2), lines=[
        (cash.id, 500, 0),
        (service_sales.id, 0, 500)
    ])

    # 3. Consulting Income: Cash Dr 200, Consulting Income Cr 200
    _post_voucher(db_session, company_id=company.id, when=date(2025, 1, 3), lines=[
        (cash.id, 200, 0),
        (consulting_income.id, 0, 200)
    ])
    
    # 4. Interest Income: Cash Dr 50, Interest Income Cr 50
    _post_voucher(db_session, company_id=company.id, when=date(2025, 1, 4), lines=[
        (cash.id, 50, 0),
        (interest_income.id, 0, 50)
    ])

    # Generate Reports
    trading = compute_trading_account(
        db_session,
        tenant_id=tenant.id,
        company_id=company.id,
        from_date=date(2025, 1, 1),
        to_date=date(2025, 1, 31)
    )

    # Verify Trading Account (Sales Breakdown)
    sales_labels = [row.label for row in trading.credit if "Stock" not in row.label]
    assert "Product Sales" in sales_labels
    assert "Service Sales" in sales_labels
    
    prod_row = next(r for r in trading.credit if r.label == "Product Sales")
    assert prod_row.amount == 1000.0
    
    serv_row = next(r for r in trading.credit if r.label == "Service Sales")
    assert serv_row.amount == 500.0

    # Generate P&L
    pl = compute_profit_and_loss(
        db_session,
        tenant_id=tenant.id,
        company_id=company.id,
        from_date=date(2025, 1, 1),
        to_date=date(2025, 1, 31)
    )

    # Verify P&L (Indirect Income Breakdown)
    income_labels = [row.label for row in pl.credit if "Gross Profit" not in row.label]
    assert "Consulting Income" in income_labels
    assert "Interest Income" in income_labels

    cons_row = next(r for r in pl.credit if r.label == "Consulting Income")
    assert cons_row.amount == 200.0

    int_row = next(r for r in pl.credit if r.label == "Interest Income")
    assert int_row.amount == 50.0


def test_bom_transactions_show_only_user_overrides(db_session):
    seeded = _seed_company_for_bom_cc_report(db_session)
    admin = seeded["admin"]
    company = seeded["company"]
    warehouse = seeded["warehouse"]
    finished = seeded["finished"]
    component = seeded["component"]
    dept_default = seeded["dept_default"]
    dept_override = seeded["dept_override"]
    project_default = seeded["project_default"]
    seg_override = seeded["seg_override"]

    order_default = models.ProductionOrder(
        company_id=company.id,
        product_id=finished.id,
        quantity=1,
        status=models.ProductionOrderStatus.COMPLETED,
        warehouse_id=warehouse.id,
        department_id=dept_default.id,
        project_id=project_default.id,
        segment_id=seeded["seg_default"].id,
        created_at=datetime.utcnow(),
    )
    order_override = models.ProductionOrder(
        company_id=company.id,
        product_id=finished.id,
        quantity=1,
        status=models.ProductionOrderStatus.COMPLETED,
        warehouse_id=warehouse.id,
        department_id=dept_override.id,
        project_id=project_default.id,  # same as warehouse default -> hidden
        segment_id=seg_override.id,
        created_at=datetime.utcnow(),
    )
    db_session.add_all([order_default, order_override])
    db_session.flush()
    db_session.add_all(
        [
            models.ProductionItem(
                production_order_id=order_default.id,
                product_id=component.id,
                consumed_qty=1,
            ),
            models.ProductionItem(
                production_order_id=order_override.id,
                product_id=component.id,
                consumed_qty=1,
            ),
        ]
    )
    db_session.commit()

    report = reports.bom_transactions_report(
        company_id=company.id,
        from_date=date(2020, 1, 1),
        to_date=date(2030, 12, 31),
        kind="production",
        warehouse_id=None,
        product_id=finished.id,
        department_id=None,
        project_id=None,
        segment_id=None,
        db=db_session,
        current_user=admin,
    )
    consume_rows = [r for r in report.rows if r.row_type == "production_consume"]
    by_ref = {r.ref_id: r for r in consume_rows}

    default_row = by_ref[int(order_default.id)]
    assert default_row.department_id is None
    assert default_row.project_id is None
    assert default_row.segment_id is None

    override_row = by_ref[int(order_override.id)]
    assert override_row.department_id == dept_override.id
    assert override_row.project_id is None
    assert override_row.segment_id == seg_override.id

    report_default_dept = reports.bom_transactions_report(
        company_id=company.id,
        from_date=date(2020, 1, 1),
        to_date=date(2030, 12, 31),
        kind="production",
        warehouse_id=None,
        product_id=finished.id,
        department_id=dept_default.id,
        project_id=None,
        segment_id=None,
        db=db_session,
        current_user=admin,
    )
    assert int(order_default.id) in {
        r.ref_id for r in report_default_dept.rows if r.row_type == "production_consume"
    }

    report_override_dept = reports.bom_transactions_report(
        company_id=company.id,
        from_date=date(2020, 1, 1),
        to_date=date(2030, 12, 31),
        kind="production",
        warehouse_id=None,
        product_id=finished.id,
        department_id=dept_override.id,
        project_id=None,
        segment_id=None,
        db=db_session,
        current_user=admin,
    )
    assert int(order_override.id) in {
        r.ref_id for r in report_override_dept.rows if r.row_type == "production_consume"
    }


def test_production_accounting_voucher_created_with_dimensions(db_session):
    seeded = _seed_company_for_bom_cc_report(db_session)
    admin = seeded["admin"]
    company = seeded["company"]
    warehouse = seeded["warehouse"]
    finished = seeded["finished"]

    class _OrderStub:
        def __init__(self):
            self.id = 999
            self.product_id = finished.id
            self.department_id = seeded["dept_default"].id
            self.project_id = seeded["project_default"].id
            self.segment_id = seeded["seg_default"].id

    order = _OrderStub()

    production._post_production_accounting_voucher(
        db_session,
        company_id=company.id,
        production_order=order,
        voucher_date=date(2026, 4, 20),
        amount=120.0,
    )
    db_session.commit()
    created_voucher = (
        db_session.query(models.Voucher)
        .filter(
            models.Voucher.company_id == company.id,
            models.Voucher.voucher_type == models.VoucherType.JOURNAL,
            models.Voucher.narration.like(f"Production order #{order.id}%"),
        )
        .first()
    )
    assert created_voucher is not None

    voucher_lines = (
        db_session.query(models.VoucherLine)
        .filter(models.VoucherLine.voucher_id == created_voucher.id)
        .all()
    )
    assert len(voucher_lines) == 2
    rm_line = next((x for x in voucher_lines if float(x.credit or 0) > 0), None)
    fg_line = next((x for x in voucher_lines if float(x.debit or 0) > 0), None)
    assert rm_line is not None
    assert fg_line is not None
    assert float(rm_line.credit) == 120.0
    assert float(fg_line.debit) == 120.0
    assert fg_line.department_id == seeded["dept_default"].id
    assert fg_line.project_id == seeded["project_default"].id
    assert fg_line.segment_id == seeded["seg_default"].id
