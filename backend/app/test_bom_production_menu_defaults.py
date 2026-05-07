from __future__ import annotations

from fastapi.testclient import TestClient
from sqlalchemy import JSON, create_engine
from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Monkeypatch JSONB for SQLite testing
postgresql.JSONB = JSON

from . import models
from .auth import get_current_user
from .database import Base
from .main import app
from .menu_defaults import (
    BASELINE_BOM_PRODUCTION_MENU_CODES,
    ensure_baseline_menus_on_assigned_templates,
    ensure_default_menu_template_assigned_to_all_tenants,
    ensure_default_menu_templates,
    ensure_default_menus_for_company,
    upsert_default_menus,
)


def _flatten_codes(menu_groups: list[dict]) -> set[str]:
    out: set[str] = set()

    def walk(items: list[dict]) -> None:
        for item in items or []:
            code = item.get("code")
            if code:
                out.add(str(code))
            walk(item.get("children") or [])

    for group in menu_groups or []:
        walk(group.get("items") or [])
    return out


def _make_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    return TestingSessionLocal


def test_menu_registry_contains_bom_and_production_codes():
    SessionLocal = _make_session()
    db = SessionLocal()
    try:
        upsert_default_menus(db)
        mfg_parent = db.query(models.Menu).filter(models.Menu.code == "MANUFACTURING_ERP").first()
        assert mfg_parent is not None

        bom = db.query(models.Menu).filter(models.Menu.code == "manufacturing.bom_master").first()
        prod = db.query(models.Menu).filter(models.Menu.code == "manufacturing.production_order").first()
        assert bom is not None
        assert prod is not None
        assert bom.label == "BOM Master"
        assert prod.label == "Production Order"
        assert bom.module == "Manufacturing"
        assert prod.module == "Manufacturing"
        assert bom.parent_id == mfg_parent.id
        assert prod.parent_id == mfg_parent.id
        assert bom.sort_order == 232
        assert prod.sort_order == 233
        assert bom.is_active is True
        assert prod.is_active is True
    finally:
        db.close()


def test_backfill_is_idempotent_and_preserves_existing_custom_template_entry():
    SessionLocal = _make_session()
    db = SessionLocal()
    try:
        upsert_default_menus(db)
        inventory_items = db.query(models.Menu).filter(models.Menu.code == "inventory.items").first()
        assert inventory_items is not None

        custom_template = models.MenuTemplate(name="Custom T", description=None, is_active=True)
        db.add(custom_template)
        db.flush()
        db.add(
            models.MenuTemplateMenu(
                template_id=int(custom_template.id),
                menu_id=int(inventory_items.id),
                group_name="My Custom Group",
                group_order=999,
                item_order=555,
                is_sidebar_visible=False,
            )
        )
        tenant = models.Tenant(name="Tenant1", menu_template_id=int(custom_template.id))
        db.add(tenant)
        db.commit()

        ensure_default_menu_templates(db)
        ensure_default_menu_template_assigned_to_all_tenants(db)
        ensure_baseline_menus_on_assigned_templates(db)
        ensure_baseline_menus_on_assigned_templates(db)

        custom_row = (
            db.query(models.MenuTemplateMenu)
            .filter(
                models.MenuTemplateMenu.template_id == int(custom_template.id),
                models.MenuTemplateMenu.menu_id == int(inventory_items.id),
            )
            .first()
        )
        assert custom_row is not None
        assert custom_row.group_name == "My Custom Group"
        assert custom_row.group_order == 999
        assert custom_row.item_order == 555
        assert custom_row.is_sidebar_visible is False

        for code in BASELINE_BOM_PRODUCTION_MENU_CODES:
            menu = db.query(models.Menu).filter(models.Menu.code == code).first()
            assert menu is not None
            links = (
                db.query(models.MenuTemplateMenu)
                .filter(
                    models.MenuTemplateMenu.template_id == int(custom_template.id),
                    models.MenuTemplateMenu.menu_id == int(menu.id),
                )
                .all()
            )
            assert len(links) == 1
    finally:
        db.close()


def test_company_and_tenant_menu_apis_include_new_codes_after_seed():
    SessionLocal = _make_session()

    def _get_db_override():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    from .database import get_db

    app.dependency_overrides[get_db] = _get_db_override
    client = TestClient(app)
    db = SessionLocal()
    try:
        upsert_default_menus(db)
        ensure_default_menu_templates(db)

        tenant = models.Tenant(name="TenantX")
        db.add(tenant)
        db.flush()

        tenant_admin = models.User(
            email="tenant-admin@example.com",
            full_name="Tenant Admin",
            password_hash="x",
            is_active=True,
            role=models.UserRole.admin,
            is_tenant_admin=True,
            tenant_id=tenant.id,
        )
        db.add(tenant_admin)
        db.flush()

        company = models.Company(owner_id=tenant_admin.id, tenant_id=tenant.id, name="Company X")
        db.add(company)
        db.flush()
        db.add(models.UserCompanyAccess(user_id=tenant_admin.id, company_id=company.id))
        db.commit()

        ensure_default_menu_template_assigned_to_all_tenants(db)
        ensure_default_menus_for_company(db, int(company.id))

        def _override_get_current_user():
            return tenant_admin

        app.dependency_overrides[get_current_user] = _override_get_current_user

        company_resp = client.get(f"/companies/{company.id}/menus")
        assert company_resp.status_code == 200
        company_codes = _flatten_codes(company_resp.json())
        assert "manufacturing.bom_master" in company_codes
        assert "manufacturing.production_order" in company_codes

        tenant_resp = client.get("/tenants/self/menus")
        assert tenant_resp.status_code == 200
        tenant_codes = _flatten_codes(tenant_resp.json())
        assert "manufacturing.bom_master" in tenant_codes
        assert "manufacturing.production_order" in tenant_codes
    finally:
        db.close()
        app.dependency_overrides.clear()


def test_existing_user_permission_behavior_remains_unchanged_for_new_codes():
    SessionLocal = _make_session()

    def _get_db_override():
        db = SessionLocal()
        try:
            yield db
        finally:
            db.close()

    from .database import get_db

    app.dependency_overrides[get_db] = _get_db_override
    client = TestClient(app)
    db = SessionLocal()
    try:
        upsert_default_menus(db)
        ensure_default_menu_templates(db)

        tenant = models.Tenant(name="TenantY")
        db.add(tenant)
        db.flush()

        tenant_admin = models.User(
            email="admin2@example.com",
            full_name="Admin2",
            password_hash="x",
            is_active=True,
            role=models.UserRole.admin,
            is_tenant_admin=True,
            tenant_id=tenant.id,
        )
        user = models.User(
            email="user2@example.com",
            full_name="User2",
            password_hash="x",
            is_active=True,
            role=models.UserRole.user,
            tenant_id=tenant.id,
        )
        db.add_all([tenant_admin, user])
        db.flush()

        company = models.Company(owner_id=tenant_admin.id, tenant_id=tenant.id, name="Company Y")
        db.add(company)
        db.flush()
        db.add(models.UserCompanyAccess(user_id=user.id, company_id=company.id))

        ensure_default_menu_template_assigned_to_all_tenants(db)
        ensure_default_menus_for_company(db, int(company.id))

        inventory_items = db.query(models.Menu).filter(models.Menu.code == "inventory.items").first()
        bom_menu = db.query(models.Menu).filter(models.Menu.code == "manufacturing.bom_master").first()
        prod_menu = db.query(models.Menu).filter(models.Menu.code == "manufacturing.production_order").first()
        assert inventory_items is not None
        assert bom_menu is not None
        assert prod_menu is not None

        db.add(
            models.UserMenuAccess(
                tenant_id=tenant.id,
                user_id=user.id,
                company_id=company.id,
                menu_id=inventory_items.id,
                access_level=models.MenuAccessLevel.read,
            )
        )
        db.commit()

        def _override_get_current_user():
            return user

        app.dependency_overrides[get_current_user] = _override_get_current_user
        resp = client.get(f"/companies/{company.id}/menus")
        assert resp.status_code == 200
        codes = _flatten_codes(resp.json())
        assert "inventory.items" in codes
        assert "manufacturing.bom_master" not in codes
        assert "manufacturing.production_order" not in codes
    finally:
        db.close()
        app.dependency_overrides.clear()
