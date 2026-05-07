from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from .database import Base
from .main import app
from . import models
from .auth import get_current_user


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    def _get_db_override():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    from .database import get_db

    app.dependency_overrides[get_db] = _get_db_override

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        app.dependency_overrides.clear()


@pytest.fixture()
def client(db_session):
    return TestClient(app)


def _override_user(user: models.User) -> None:
    def _override_get_current_user():
        return user

    app.dependency_overrides[get_current_user] = _override_get_current_user


def _seed_company_with_parties(db_session):
    tenant = models.Tenant(name="T1")
    db_session.add(tenant)
    db_session.flush()

    user = models.User(
        email="u@example.com",
        full_name="U",
        password_hash="x",
        is_active=True,
        role=models.UserRole.admin,
        tenant_id=tenant.id,
    )
    db_session.add(user)
    db_session.flush()

    company = models.Company(owner_id=user.id, tenant_id=tenant.id, name="C1", currency="NPR")
    db_session.add(company)
    db_session.flush()

    asset_group = models.LedgerGroup(
        company_id=company.id,
        name="Current Assets",
        group_type=models.LedgerGroupType.ASSET,
    )
    liab_group = models.LedgerGroup(
        company_id=company.id,
        name="Current Liabilities",
        group_type=models.LedgerGroupType.LIABILITY,
    )
    bank_group = models.LedgerGroup(
        company_id=company.id,
        name="Bank Accounts",
        group_type=models.LedgerGroupType.ASSET,
        parent_group_id=None,
    )
    debtors = models.LedgerGroup(
        company_id=company.id,
        name="Sundry Debtors",
        group_type=models.LedgerGroupType.ASSET,
        parent_group_id=None,
    )
    creditors = models.LedgerGroup(
        company_id=company.id,
        name="Sundry Creditors",
        group_type=models.LedgerGroupType.LIABILITY,
        parent_group_id=None,
    )
    db_session.add_all([asset_group, liab_group, bank_group, debtors, creditors])
    db_session.flush()

    bank_ledger = models.Ledger(
        company_id=company.id,
        group_id=bank_group.id,
        name="Bank",
        code="BANK",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    customer_ledger = models.Ledger(
        company_id=company.id,
        group_id=debtors.id,
        name="Customer A",
        code=None,
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    supplier_ledger = models.Ledger(
        company_id=company.id,
        group_id=creditors.id,
        name="Supplier A",
        code=None,
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.CREDIT,
        is_active=True,
    )
    db_session.add_all([bank_ledger, customer_ledger, supplier_ledger])
    db_session.flush()

    pm_bank = models.PaymentMode(
        company_id=company.id,
        tenant_id=tenant.id,
        name="BANK",
        ledger_id=bank_ledger.id,
        is_active=True,
    )
    db_session.add(pm_bank)
    db_session.flush()

    customer = models.Customer(
        company_id=company.id,
        tenant_id=tenant.id,
        name="Customer A",
        ledger_id=customer_ledger.id,
    )
    supplier = models.Supplier(
        company_id=company.id,
        tenant_id=tenant.id,
        name="Supplier A",
        ledger_id=supplier_ledger.id,
    )
    db_session.add_all([customer, supplier])
    db_session.flush()

    income_group = models.LedgerGroup(
        company_id=company.id,
        name="Income",
        group_type=models.LedgerGroupType.INCOME,
        parent_group_id=None,
    )
    expense_group = models.LedgerGroup(
        company_id=company.id,
        name="Expenses",
        group_type=models.LedgerGroupType.EXPENSE,
        parent_group_id=None,
    )
    db_session.add_all([income_group, expense_group])
    db_session.flush()

    income_ledger = models.Ledger(
        company_id=company.id,
        group_id=income_group.id,
        name="Sales",
        code="SALES",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.CREDIT,
        is_active=True,
    )
    expense_ledger = models.Ledger(
        company_id=company.id,
        group_id=expense_group.id,
        name="Purchase",
        code="PURCHASE",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    db_session.add_all([income_ledger, expense_ledger])
    db_session.flush()

    item = models.Item(
        company_id=company.id,
        name="Item",
        income_ledger_id=income_ledger.id,
        expense_ledger_id=expense_ledger.id,
    )
    db_session.add(item)
    db_session.flush()

    db_session.commit()

    return {
        "tenant": tenant,
        "user": user,
        "company": company,
        "payment_mode": pm_bank,
        "bank_ledger": bank_ledger,
        "customer": customer,
        "supplier": supplier,
        "customer_ledger": customer_ledger,
        "supplier_ledger": supplier_ledger,
        "item": item,
    }


def _create_sales_invoice(db_session, *, company_id: int, customer_id: int, item_id: int):
    inv = models.SalesInvoice(
        company_id=company_id,
        customer_id=customer_id,
        date=date(2025, 12, 24),
        reference="SI-1",
    )
    db_session.add(inv)
    db_session.flush()
    line = models.SalesInvoiceLine(
        invoice_id=inv.id,
        item_id=item_id,
        quantity=1,
        rate=1000,
        discount=0,
        tax_rate=0,
    )
    db_session.add(line)
    db_session.flush()
    return inv


def _create_purchase_bill(db_session, *, company_id: int, supplier_id: int, item_id: int):
    bill = models.PurchaseBill(
        company_id=company_id,
        supplier_id=supplier_id,
        date=date(2025, 12, 24),
        reference="PB-1",
    )
    db_session.add(bill)
    db_session.flush()
    line = models.PurchaseBillLine(
        bill_id=bill.id,
        item_id=item_id,
        quantity=1,
        rate=1000,
        discount=0,
        tax_rate=0,
    )
    db_session.add(line)
    db_session.flush()
    return bill


def test_receipt_can_allocate_partially_and_outstanding_updates(client, db_session):
    ctx = _seed_company_with_parties(db_session)
    _override_user(ctx["user"])

    inv = _create_sales_invoice(
        db_session,
        company_id=ctx["company"].id,
        customer_id=ctx["customer"].id,
        item_id=ctx["item"].id,
    )

    resp = client.post(
        f"/companies/{ctx['company'].id}/vouchers",
        json={
            "voucher_date": "2025-12-24",
            "voucher_type": "RECEIPT",
            "payment_mode_id": ctx["payment_mode"].id,
            "lines": [
                {"ledger_id": ctx["bank_ledger"].id, "debit": 600, "credit": 0},
                {"ledger_id": ctx["customer_ledger"].id, "debit": 0, "credit": 600},
            ],
        },
    )
    assert resp.status_code == 200
    voucher_id = resp.json()["id"]

    out = client.get(
        f"/companies/{ctx['company'].id}/outstanding/sales-invoices",
        params={"counterparty_ledger_id": ctx["customer_ledger"].id},
    )
    assert out.status_code == 200
    assert out.json()[0]["outstanding_amount"] == 1000.0

    alloc = client.post(
        f"/companies/{ctx['company'].id}/vouchers/{voucher_id}/allocations",
        json={
            "allocations": [
                {"doc_type": "SALES_INVOICE", "doc_id": inv.id, "amount": 500}
            ]
        },
    )
    assert alloc.status_code == 200
    assert alloc.json()[0]["amount"] == 500.0

    out2 = client.get(
        f"/companies/{ctx['company'].id}/outstanding/sales-invoices",
        params={"counterparty_ledger_id": ctx["customer_ledger"].id},
    )
    assert out2.status_code == 200
    assert out2.json()[0]["paid_amount"] == 500.0
    assert out2.json()[0]["outstanding_amount"] == 500.0


def test_payment_wrong_doc_type_rejected(client, db_session):
    ctx = _seed_company_with_parties(db_session)
    _override_user(ctx["user"])

    bill = _create_purchase_bill(
        db_session,
        company_id=ctx["company"].id,
        supplier_id=ctx["supplier"].id,
        item_id=ctx["item"].id,
    )

    resp = client.post(
        f"/companies/{ctx['company'].id}/vouchers",
        json={
            "voucher_date": "2025-12-24",
            "voucher_type": "PAYMENT",
            "payment_mode_id": ctx["payment_mode"].id,
            "lines": [
                {"ledger_id": ctx["supplier_ledger"].id, "debit": 600, "credit": 0},
                {"ledger_id": ctx["bank_ledger"].id, "debit": 0, "credit": 600},
            ],
        },
    )
    assert resp.status_code == 200
    voucher_id = resp.json()["id"]

    alloc = client.post(
        f"/companies/{ctx['company'].id}/vouchers/{voucher_id}/allocations",
        json={
            "allocations": [
                {"doc_type": "SALES_INVOICE", "doc_id": bill.id, "amount": 100}
            ]
        },
    )
    assert alloc.status_code == 400


def test_over_allocation_rejected(client, db_session):
    ctx = _seed_company_with_parties(db_session)
    _override_user(ctx["user"])

    inv = _create_sales_invoice(
        db_session,
        company_id=ctx["company"].id,
        customer_id=ctx["customer"].id,
        item_id=ctx["item"].id,
    )

    resp = client.post(
        f"/companies/{ctx['company'].id}/vouchers",
        json={
            "voucher_date": "2025-12-24",
            "voucher_type": "RECEIPT",
            "payment_mode_id": ctx["payment_mode"].id,
            "lines": [
                {"ledger_id": ctx["bank_ledger"].id, "debit": 800, "credit": 0},
                {"ledger_id": ctx["customer_ledger"].id, "debit": 0, "credit": 800},
            ],
        },
    )
    assert resp.status_code == 200
    voucher_id = resp.json()["id"]

    alloc = client.post(
        f"/companies/{ctx['company'].id}/vouchers/{voucher_id}/allocations",
        json={
            "allocations": [
                {"doc_type": "SALES_INVOICE", "doc_id": inv.id, "amount": 1200}
            ]
        },
    )
    assert alloc.status_code == 400
