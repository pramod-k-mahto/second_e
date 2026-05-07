from __future__ import annotations

from datetime import date

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from .database import Base
from .main import app
from . import models
from .auth import get_current_user


@pytest.fixture()
def db_session(monkeypatch):
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


def _seed_minimal(db, *, valuation_method: models.InventoryValuationMethod):
    tenant = models.Tenant(name="T1")
    db.add(tenant)
    db.flush()

    db.add(
        models.TenantSettings(
            tenant_id=tenant.id,
            inventory_valuation_method=valuation_method,
            allow_negative_stock=False,
        )
    )

    user = models.User(
        email=f"user_{valuation_method.value.lower()}@example.com",
        full_name="User",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
    )
    db.add(user)
    db.flush()

    # Bypass auth for API calls in this test module.
    seeded_user = user

    def _override_get_current_user():
        return seeded_user

    app.dependency_overrides[get_current_user] = _override_get_current_user

    company = models.Company(owner_id=user.id, tenant_id=tenant.id, name="C1")
    db.add(company)
    db.flush()

    wh = models.Warehouse(company_id=company.id, code="MAIN", name="Main", is_active=True)
    db.add(wh)
    db.flush()

    item = models.Item(company_id=company.id, name="P1", allow_negative_stock=False)
    db.add(item)
    db.flush()

    return tenant, user, company, wh, item


def _post_purchase(db, *, company_id: int, warehouse_id: int, item_id: int, qty: float, rate: float, tenant_id: int):
    # Minimal posting: mimic purchase router side-effects
    posted_at = date.today()
    next_id = int(db.query(func.coalesce(func.max(models.StockLedger.id), 0)).scalar() or 0) + 1
    db.add(
        models.StockLedger(
            id=next_id,
            company_id=company_id,
            warehouse_id=warehouse_id,
            item_id=item_id,
            qty_delta=qty,
            unit_cost=rate,
            source_type="PURCHASE_BILL",
            source_id=1,
            source_line_id=None,
        )
    )
    db.flush()
    db.add(
        models.StockBatch(
            tenant_id=tenant_id,
            product_id=item_id,
            ref_type="PURCHASE",
            ref_id=1,
            qty_in=qty,
            qty_out=0,
            rate=rate,
        )
    )


def _post_sale_fifo(db, *, company_id: int, warehouse_id: int, item_id: int, qty: float):
    # Consume FIFO batches
    batches = (
        db.query(models.StockBatch)
        .filter(models.StockBatch.product_id == item_id, (models.StockBatch.qty_in - models.StockBatch.qty_out) > 0)
        .order_by(models.StockBatch.created_at.asc(), models.StockBatch.id.asc())
        .all()
    )
    remaining = qty
    total_cost = 0.0
    for b in batches:
        if remaining <= 1e-9:
            break
        avail = float(b.qty_in) - float(b.qty_out)
        take = avail if avail <= remaining else remaining
        b.qty_out = float(b.qty_out) + take
        total_cost += take * float(b.rate)
        remaining -= take
        db.add(b)
    assert remaining <= 1e-9

    unit_cost = total_cost / qty
    next_id = int(db.query(func.coalesce(func.max(models.StockLedger.id), 0)).scalar() or 0) + 1
    db.add(
        models.StockLedger(
            id=next_id,
            company_id=company_id,
            warehouse_id=warehouse_id,
            item_id=item_id,
            qty_delta=-qty,
            unit_cost=unit_cost,
            source_type="SALES_INVOICE",
            source_id=1,
            source_line_id=None,
        )
    )
    db.flush()


def _post_sale_avg(db, *, company_id: int, warehouse_id: int, item_id: int, qty: float, avg_unit_cost: float):
    next_id = int(db.query(func.coalesce(func.max(models.StockLedger.id), 0)).scalar() or 0) + 1
    db.add(
        models.StockLedger(
            id=next_id,
            company_id=company_id,
            warehouse_id=warehouse_id,
            item_id=item_id,
            qty_delta=-qty,
            unit_cost=avg_unit_cost,
            source_type="SALES_INVOICE",
            source_id=1,
            source_line_id=None,
        )
    )
    db.flush()


@pytest.mark.parametrize(
    "method, expected_value",
    [
        (models.InventoryValuationMethod.FIFO, 700.0),
        (models.InventoryValuationMethod.AVERAGE, 600.0),
    ],
)
def test_stock_endpoints_consistent_fifo_vs_average(client, db_session, method, expected_value):
    tenant, user, company, wh, item = _seed_minimal(db_session, valuation_method=method)

    _post_purchase(db_session, company_id=company.id, warehouse_id=wh.id, item_id=item.id, qty=1, rate=500, tenant_id=tenant.id)
    _post_purchase(db_session, company_id=company.id, warehouse_id=wh.id, item_id=item.id, qty=1, rate=700, tenant_id=tenant.id)

    if method == models.InventoryValuationMethod.FIFO:
        _post_sale_fifo(db_session, company_id=company.id, warehouse_id=wh.id, item_id=item.id, qty=1)
    else:
        _post_sale_avg(db_session, company_id=company.id, warehouse_id=wh.id, item_id=item.id, qty=1, avg_unit_cost=600)

    db_session.commit()

    # All endpoints should agree
    r1 = client.get(f"/inventory/companies/{company.id}/stock/summary")
    assert r1.status_code == 200
    qty_row = next(x for x in r1.json() if x["product_id"] == item.id)
    assert float(qty_row["qty_on_hand"]) == pytest.approx(1.0)

    r2 = client.get(f"/inventory/companies/{company.id}/stock/valuation")
    assert r2.status_code == 200
    rows = r2.json()["rows"]
    vrow = next(x for x in rows if x["product_id"] == item.id)
    assert float(vrow["qty_on_hand"]) == pytest.approx(1.0)
    assert float(vrow["value"]) == pytest.approx(expected_value)

    r3 = client.get(
        f"/inventory/companies/{company.id}/stock/ledger",
        params={"product_id": item.id},
    )
    assert r3.status_code == 200
    ledger = r3.json()
    assert float(ledger["qty_on_hand"]) == pytest.approx(1.0)
    assert float(ledger["value"]) == pytest.approx(expected_value)
