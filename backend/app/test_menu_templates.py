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


def test_tenant_template_limits_user_menu_visibility_and_granting(client, db_session):
    tenant = models.Tenant(name="T1")
    db_session.add(tenant)
    db_session.flush()

    tenant_admin = models.User(
        email="admin@example.com",
        full_name="Admin",
        password_hash="x",
        is_active=True,
        role=models.UserRole.admin,
        is_tenant_admin=True,
        tenant_id=tenant.id,
    )
    db_session.add(tenant_admin)
    db_session.flush()

    target_user = models.User(
        email="user@example.com",
        full_name="User",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
    )
    db_session.add(target_user)
    db_session.flush()

    company = models.Company(owner_id=tenant_admin.id, tenant_id=tenant.id, name="C1")
    db_session.add(company)
    db_session.flush()

    # User must have company access to call /companies/{company_id}/menus
    db_session.add(models.UserCompanyAccess(user_id=target_user.id, company_id=company.id))

    menu_allowed = models.Menu(code="sales.invoices", label="Sales", module="Sales", is_active=True)
    menu_blocked = models.Menu(code="inventory.items", label="Inventory", module="Inventory", is_active=True)
    db_session.add_all([menu_allowed, menu_blocked])
    db_session.flush()

    template = models.MenuTemplate(name="Template1", description=None, is_active=True)
    db_session.add(template)
    db_session.flush()
    db_session.add(models.MenuTemplateMenu(template_id=int(template.id), menu_id=int(menu_allowed.id)))

    tenant.menu_template_id = int(template.id)
    db_session.add(tenant)
    db_session.commit()

    # Tenant admin sees all menus in template
    _override_user(tenant_admin)
    resp_admin_menus = client.get(f"/companies/{company.id}/menus")
    assert resp_admin_menus.status_code == 200
    ids = {
        int(item["id"])
        for group in resp_admin_menus.json()
        for item in (group.get("items") or [])
    }
    assert int(menu_allowed.id) in ids
    assert int(menu_blocked.id) not in ids

    # Tenant admin can grant allowed menu to user
    resp_grant_ok = client.put(
        f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus/{menu_allowed.id}",
        json={"access_level": "read"},
    )
    assert resp_grant_ok.status_code == 200

    # Tenant admin cannot grant blocked menu
    resp_grant_bad = client.put(
        f"/tenants/self/users/{target_user.id}/companies/{company.id}/menus/{menu_blocked.id}",
        json={"access_level": "read"},
    )
    assert resp_grant_bad.status_code == 403

    # Normal user sees only explicitly granted menus (within template)
    _override_user(target_user)
    resp_user_menus = client.get(f"/companies/{company.id}/menus")
    assert resp_user_menus.status_code == 200
    user_ids = {
        int(item["id"])
        for group in resp_user_menus.json()
        for item in (group.get("items") or [])
    }
    assert int(menu_allowed.id) in user_ids
    assert int(menu_blocked.id) not in user_ids
