from __future__ import annotations

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


def _seed_tenant_admin_context(db_session, *, is_tenant_admin: bool):
    tenant = models.Tenant(name="T1")
    db_session.add(tenant)
    db_session.flush()

    # Create a tenant admin (or normal user) for auth override
    role = models.UserRole.TENANT if is_tenant_admin else models.UserRole.user
    current_user = models.User(
        email="admin@example.com" if is_tenant_admin else "user@example.com",
        full_name="Admin" if is_tenant_admin else "User",
        password_hash="x",
        is_active=True,
        role=role,
        is_tenant_admin=is_tenant_admin,
        tenant_id=tenant.id,
    )
    db_session.add(current_user)
    db_session.flush()

    # Target user to manage
    target_user = models.User(
        email="target@example.com",
        full_name="Target",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
    )
    db_session.add(target_user)
    db_session.flush()

    company = models.Company(owner_id=current_user.id, tenant_id=tenant.id, name="C1")
    db_session.add(company)
    db_session.flush()

    menu = models.Menu(code="settings.company", label="Company", module="Settings", is_active=True)
    db_session.add(menu)
    db_session.flush()

    db_session.commit()

    seeded_user = current_user

    def _override_get_current_user():
        return seeded_user

    app.dependency_overrides[get_current_user] = _override_get_current_user

    return tenant, current_user, target_user, company, menu


def test_list_user_menu_access_empty_returns_empty_list(client, db_session):
    _, _, target_user, company, _ = _seed_tenant_admin_context(db_session, is_tenant_admin=True)

    resp = client.get(f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus")
    assert resp.status_code == 200
    assert resp.json() == []


def test_put_creates_and_updates_user_menu_access_row(client, db_session):
    tenant, _, target_user, company, menu = _seed_tenant_admin_context(db_session, is_tenant_admin=True)

    # Create
    resp = client.put(
        f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus/{menu.id}",
        json={"access_level": "read"},
    )
    assert resp.status_code == 200
    rows = resp.json()
    assert any(r["menu_id"] == menu.id and r["access_level"] == "read" for r in rows)

    # Ensure tenant_id stored correctly
    row = (
        db_session.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == tenant.id,
            models.UserMenuAccess.user_id == target_user.id,
            models.UserMenuAccess.company_id == company.id,
            models.UserMenuAccess.menu_id == menu.id,
        )
        .first()
    )
    assert row is not None

    # Update
    resp2 = client.put(
        f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus/{menu.id}",
        json={"access_level": "update"},
    )
    assert resp2.status_code == 200
    rows2 = resp2.json()
    assert any(r["menu_id"] == menu.id and r["access_level"] == "update" for r in rows2)


def test_unauthorized_non_admin_cannot_list_or_edit(client, db_session):
    _, _, target_user, company, menu = _seed_tenant_admin_context(db_session, is_tenant_admin=False)

    resp = client.get(f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus")
    assert resp.status_code == 403

    resp2 = client.put(
        f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus/{menu.id}",
        json={"access_level": "read"},
    )
    assert resp2.status_code == 403
