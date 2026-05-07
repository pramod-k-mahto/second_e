from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from .database import Base
from .main import app
from . import models


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


def _seed_website_company(db_session):
    tenant = models.Tenant(name="T1")
    db_session.add(tenant)
    db_session.flush()

    owner = models.User(
        email="owner@example.com",
        full_name="Owner",
        password_hash="x",
        is_active=True,
        role=models.UserRole.admin,
        tenant_id=tenant.id,
    )
    db_session.add(owner)
    db_session.flush()

    company = models.Company(owner_id=owner.id, tenant_id=tenant.id, name="C1", currency="NPR")
    db_session.add(company)
    db_session.flush()

    # Ledger groups
    debtors = models.LedgerGroup(
        company_id=company.id,
        name="Sundry Debtors",
        group_type=models.LedgerGroupType.ASSET,
        parent_group_id=None,
    )
    bank_group = models.LedgerGroup(
        company_id=company.id,
        name="Bank Accounts",
        group_type=models.LedgerGroupType.ASSET,
        parent_group_id=None,
    )
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
    tax_group = models.LedgerGroup(
        company_id=company.id,
        name="Duties & Taxes",
        group_type=models.LedgerGroupType.LIABILITY,
        parent_group_id=None,
    )
    db_session.add_all([debtors, bank_group, income_group, expense_group, tax_group])
    db_session.flush()

    customers_ledger = models.Ledger(
        company_id=company.id,
        group_id=debtors.id,
        name="Customers",
        code="CUSTOMERS",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
    bank_ledger = models.Ledger(
        company_id=company.id,
        group_id=bank_group.id,
        name="Bank",
        code="BANK",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT,
        is_active=True,
    )
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
    output_tax_ledger = models.Ledger(
        company_id=company.id,
        group_id=tax_group.id,
        name="Output Tax",
        code="OUTPUT_TAX",
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.CREDIT,
        is_active=True,
    )
    db_session.add_all([
        customers_ledger,
        bank_ledger,
        income_ledger,
        expense_ledger,
        output_tax_ledger,
    ])
    db_session.flush()

    # Payment mode used for receipt voucher.
    payment_mode = models.PaymentMode(
        company_id=company.id,
        tenant_id=tenant.id,
        name="BANK",
        ledger_id=bank_ledger.id,
        is_active=True,
    )
    db_session.add(payment_mode)
    db_session.flush()

    item = models.Item(
        company_id=company.id,
        name="Item",
        income_ledger_id=income_ledger.id,
        expense_ledger_id=expense_ledger.id,
        output_tax_ledger_id=output_tax_ledger.id,
        allow_negative_stock=True,
    )
    db_session.add(item)
    db_session.flush()

    # Company settings for website integration.
    settings = models.CompanySettings(
        company_id=company.id,
        calendar_mode="AD",
        website_api_key="PUBLIC_KEY_123",
        website_api_secret="SECRET_456",
    )
    db_session.add(settings)
    db_session.commit()

    return {
        "tenant": tenant,
        "owner": owner,
        "company": company,
        "item": item,
        "payment_mode": payment_mode,
        "api_key": settings.website_api_key,
        "api_secret": settings.website_api_secret,
    }


def _signed_headers(*, api_key: str, api_secret: str, idempotency_key: str, raw_body: bytes) -> dict[str, str]:
    signature = hmac.new(api_secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return {
        "Content-Type": "application/json",
        "X-Website-Api-Key": api_key,
        "X-Website-Signature": signature,
        "Idempotency-Key": idempotency_key,
    }


def test_valid_signed_request_creates_order_created(client, db_session):
    ctx = _seed_website_company(db_session)

    payload = {
        "reference": "WEB-1",
        "customer": {"name": "John", "email": "john@example.com", "phone": "9800000000"},
        "lines": [
            {
                "item_id": int(ctx["item"].id),
                "quantity": 1,
                "rate": 100,
                "discount": 0,
                "tax_rate": 0,
            }
        ],
        "options": {"auto_invoice": False},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = _signed_headers(
        api_key=ctx["api_key"],
        api_secret=ctx["api_secret"],
        idempotency_key="idem-1",
        raw_body=raw,
    )

    resp = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw, headers=headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "CREATED"
    assert isinstance(data["order_id"], int)


def test_retry_same_idempotency_key_returns_exists_same_ids(client, db_session):
    ctx = _seed_website_company(db_session)

    payload = {
        "reference": "WEB-2",
        "customer": {"name": "John", "email": "john@example.com", "phone": "9800000000"},
        "lines": [{"item_id": int(ctx["item"].id), "quantity": 1, "rate": 100, "tax_rate": 0}],
        "options": {"auto_invoice": True},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = _signed_headers(
        api_key=ctx["api_key"],
        api_secret=ctx["api_secret"],
        idempotency_key="idem-2",
        raw_body=raw,
    )

    r1 = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw, headers=headers)
    assert r1.status_code == 200
    d1 = r1.json()
    assert d1["status"] == "CREATED"
    assert d1.get("invoice_id") is not None

    r2 = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw, headers=headers)
    assert r2.status_code == 200
    d2 = r2.json()
    assert d2["status"] == "EXISTS"
    assert d2["order_id"] == d1["order_id"]
    assert d2.get("invoice_id") == d1.get("invoice_id")


def test_same_idempotency_key_different_body_returns_409(client, db_session):
    ctx = _seed_website_company(db_session)

    payload1 = {
        "reference": "WEB-3",
        "customer": {"name": "John"},
        "lines": [{"item_id": int(ctx["item"].id), "quantity": 1, "rate": 100, "tax_rate": 0}],
        "options": {"auto_invoice": False},
    }
    raw1 = json.dumps(payload1, separators=(",", ":")).encode("utf-8")
    headers1 = _signed_headers(
        api_key=ctx["api_key"],
        api_secret=ctx["api_secret"],
        idempotency_key="idem-3",
        raw_body=raw1,
    )

    r1 = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw1, headers=headers1)
    assert r1.status_code == 200

    payload2 = {
        "reference": "WEB-3-CHANGED",
        "customer": {"name": "John"},
        "lines": [{"item_id": int(ctx["item"].id), "quantity": 1, "rate": 100, "tax_rate": 0}],
        "options": {"auto_invoice": False},
    }
    raw2 = json.dumps(payload2, separators=(",", ":")).encode("utf-8")
    headers2 = _signed_headers(
        api_key=ctx["api_key"],
        api_secret=ctx["api_secret"],
        idempotency_key="idem-3",
        raw_body=raw2,
    )

    r2 = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw2, headers=headers2)
    assert r2.status_code == 409


def test_invalid_signature_rejected(client, db_session):
    ctx = _seed_website_company(db_session)

    payload = {
        "reference": "WEB-4",
        "customer": {"name": "John"},
        "lines": [{"item_id": int(ctx["item"].id), "quantity": 1, "rate": 100, "tax_rate": 0}],
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "X-Website-Api-Key": ctx["api_key"],
        "X-Website-Signature": "bad-signature",
        "Idempotency-Key": "idem-4",
    }

    resp = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw, headers=headers)
    assert resp.status_code in (401, 403)


def test_record_payment_requires_auto_invoice(client, db_session):
    ctx = _seed_website_company(db_session)

    payload = {
        "reference": "WEB-5",
        "customer": {"name": "John"},
        "lines": [{"item_id": int(ctx["item"].id), "quantity": 1, "rate": 100, "tax_rate": 0}],
        "options": {"auto_invoice": False, "record_payment": True, "receipt_payment_mode_id": int(ctx["payment_mode"].id)},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = _signed_headers(
        api_key=ctx["api_key"],
        api_secret=ctx["api_secret"],
        idempotency_key="idem-5",
        raw_body=raw,
    )

    resp = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw, headers=headers)
    assert resp.status_code == 400


def test_record_payment_requires_receipt_payment_mode_id(client, db_session):
    ctx = _seed_website_company(db_session)

    payload = {
        "reference": "WEB-6",
        "customer": {"name": "John"},
        "lines": [{"item_id": int(ctx["item"].id), "quantity": 1, "rate": 100, "tax_rate": 0}],
        "options": {"auto_invoice": True, "record_payment": True},
    }
    raw = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    headers = _signed_headers(
        api_key=ctx["api_key"],
        api_secret=ctx["api_secret"],
        idempotency_key="idem-6",
        raw_body=raw,
    )

    resp = client.post(f"/website/companies/{ctx['company'].id}/orders", data=raw, headers=headers)
    assert resp.status_code == 400
