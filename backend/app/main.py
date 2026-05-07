 # backend/app/main.py
# Trigger reload 3
import os
from collections import defaultdict
from fastapi import FastAPI, Body, Depends, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text, func
from sqlalchemy.orm import Session

from pathlib import Path

from .database import Base, engine, get_db
from . import models, schemas
from . import tasks_models
from .tasks_storage import get_uploads_base_dir
from .permissions import get_effective_menus_for_user
from .menu_defaults import (
    ensure_default_menu_templates,
    ensure_default_menus_for_company,
    ensure_menu_template_has_required_menus,
    ensure_menu_template_assignable_to_tenant,
    ensure_default_menu_template_assigned_to_all_tenants,
    normalize_all_template_groupings,
    get_default_menu_template_id,
    REQUIRED_FRONTEND_MENU_CODES,
)
from .auth import get_password_hash, get_current_user, get_current_admin
from .config import get_settings
import logging as _logging

_logger = _logging.getLogger(__name__)
_settings = get_settings()

# Only the core routers for now
from .routers import (
    admin_logs,
    admin_maintenance,
    admin_menu_templates,
    admin_menus,
    admin_plans,
    admin_settings,
    admin_tenants,
    admin_import,
    admin_users,
    auth,
    companies,
    inventory,
    ledgers,
    notifications,
    orders,
    payment_modes,
    purchases,
    reports,
    sales,
    seed,
    vouchers,
    cost_centers,
    tasks,
    payroll,
    website,
    commissions,
    maintenance,
    delivery,
    setup,
    sales_targets,
    restaurant_tables,
    performance,
    rewards,
    interactions,
    resources,
    chatbot,
    admin_announcements,
    announcements,
    duty_taxes,
    production,
    documents,
    sales_persons,
)
from .license import require_active_license
from .services import notification_service
import asyncio
from contextlib import asynccontextmanager

from .worker import background_worker_loop

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start the background worker task
    worker_task = asyncio.create_task(background_worker_loop())
    
    yield  # Run FastAPI
    
    # Cancel the task on shutdown
    worker_task.cancel()
    try:
        await worker_task
    except asyncio.CancelledError:
        pass


_MENU_MODULE_ORDER = {
    "General": 1,
    "POS": 2,
    "Vouchers": 3,
    "Document": 4,
    "Payroll": 5,
    "Delivery": 6,
    "Performance": 7,
    "Resources": 8,
    "Tasks": 9,
    "Master": 10,
    "Reports": 11,
    "Settings": 12,
}

_MENU_MODULE_ORDERED = [
    "General", "POS", "Vouchers", "Document", "Payroll", "Delivery",
    "Performance", "Resources", "Tasks", "Master", "Reports", "Settings"
]

app = FastAPI(
    title="Accounting API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if _settings.debug else None,
    redoc_url="/redoc" if _settings.debug else None,
)

# Serve uploaded files (tasks/documents) under /uploads
app.mount("/uploads", StaticFiles(directory=str(get_uploads_base_dir())), name="uploads")



@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    _logger.debug("Validation Error: %s", exc.errors())
    return JSONResponse(
        status_code=422,
        content={"detail": jsonable_encoder(exc.errors())},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception):
    """Catch-all: never expose stack traces to clients."""
    _logger.exception("Unhandled exception on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
    )


@app.get("/health", tags=["ops"])
def health_live() -> dict[str, str]:
    """Liveness: process is responding (use for load balancers / Docker)."""
    return {"status": "ok"}


@app.get("/health/ready", tags=["ops"])
def health_ready(db: Session = Depends(get_db)) -> dict[str, str]:
    """Readiness: database connection works."""
    db.execute(text("SELECT 1"))
    return {"status": "ready"}


def _sql_migrations_dir() -> Path | None:
    """Resolve db/migrations for local checkout and Docker (/app/db/migrations)."""
    raw = os.getenv("MIGRATIONS_DIR", "").strip()
    if raw:
        p = Path(raw)
        if p.is_dir():
            return p
        _logger.warning("MIGRATIONS_DIR is set but is not a directory: %s", raw)
        return None
    here = Path(__file__).resolve()
    for candidate in (
        here.parents[2] / "db" / "migrations",
        here.parents[1] / "db" / "migrations",
    ):
        if candidate.is_dir():
            return candidate
    return None


def _apply_sql_migrations() -> None:
    migrations_dir = _sql_migrations_dir()
    if not migrations_dir:
        _logger.warning(
            "SQL migrations directory not found; set MIGRATIONS_DIR or ship db/migrations next to the app. "
            "Schema may be incomplete versus SQLAlchemy create_all alone."
        )
        return

    migration_files = sorted(migrations_dir.glob("*.sql"))
    if not migration_files:
        return

    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS schema_migrations (
                  filename TEXT PRIMARY KEY,
                  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
                );
                """
            )
        )

        applied = {
            row[0]
            for row in conn.execute(text("SELECT filename FROM schema_migrations")).fetchall()
        }

        for path in migration_files:
            if path.name in applied:
                continue

            sql = path.read_text(encoding="utf-8")
            if sql.strip():
                conn.execute(text(sql))
            conn.execute(
                text("INSERT INTO schema_migrations (filename) VALUES (:filename)"),
                {"filename": path.name},
            )


# ------------ CORS ------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=_settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)

if _settings.trust_proxy_headers:
    from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware

    app.add_middleware(ProxyHeadersMiddleware, trusted_hosts="*")

# ------------ DB init ------------

Base.metadata.create_all(bind=engine)

# Apply SQL migrations (idempotent). This complements create_all() by handling
# ALTER TABLE / data backfills that SQLAlchemy won't perform.
_apply_sql_migrations()

# ------------ Startup: ensure admin user ------------

@app.on_event("startup")
def init_admin_user() -> None:
    import os as _os
    db: Session = next(get_db())
    admin_email = _os.getenv("ADMIN_EMAIL", "admin@prixna.com")
    admin_password = _os.getenv("ADMIN_PASSWORD", "Admin@123")
    admin = db.query(models.User).filter(models.User.email == admin_email).first()
    if not admin:
        admin_user = models.User(
            email=admin_email,
            full_name="Admin",
            role="admin",
            password_hash=get_password_hash(admin_password),
            is_active=True,
        )
        db.add(admin_user)
        db.commit()
        _logger.info("[INIT] Admin user created: %s", admin_email)
    else:
        _logger.info("[INIT] Admin user already exists: %s", admin_email)

    # Ensure default menus exist (idempotent by code). This is required so
    # /admin/users/menus always returns the full menu catalog for per-menu permissions.
    try:
        admin_menus.upsert_default_menus(db)
        ensure_default_menu_templates(db)
        normalize_all_template_groupings(db)
        ensure_default_menu_template_assigned_to_all_tenants(db)

        # Backfill the default template with any new frontend-required menus.
        # This is safe: it only INSERTs missing template-menu links.
        template_id = int(get_default_menu_template_id(db) or 0)
        # Note: We no longer automatically inflate the default template with REQUIRED_FRONTEND_MENU_CODES
        # to ensure that Superadmin configurations are strictly followed.
    except Exception as exc:
        # Fail-fast on startup if the menu catalog cannot be initialized.
        # This prevents confusing downstream auth/UI behavior.
        db.close()
        raise exc
    db.close()

# ------------ Root ------------

@app.get("/")
def read_root():
    return {"message": "Accounting API running. See /docs for documentation."}


@app.get("/favicon.ico", include_in_schema=False)
async def favicon() -> Response:
    # Return an empty 204 so browsers stop logging a 404 for /favicon.ico
    return Response(status_code=204)

# ------------ Tenant (self) ------------

@app.get("/tenants/self", response_model=schemas.TenantRead)
def get_tenant_self(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        role_str = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
        if role_str == "superadmin" or role_str.startswith("ghost_"):
            # Return a pseudo-tenant for system-level users who are not tied to a specific tenant.
            return {
                "id": 0,
                "name": "System Infrastructure",
                "status": "active",
                "plan": "enterprise",
                "plan_name": "System Infrastructure",
                "companies_count": 0,
                "users_count": 0,
                "user_count": 0,
                "user_full_name": current_user.full_name,
                "user_email": current_user.email,
                "user_role": role_str.replace("ghost_", "").capitalize()
            }
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    tenant = db.query(models.Tenant).filter(models.Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")
    
    # Attach plan name for UI display
    plan_obj = db.query(models.Plan).filter(models.Plan.code == tenant.plan).first()
    setattr(tenant, "plan_name", plan_obj.name if plan_obj else tenant.plan.capitalize())
    
    return tenant


@app.put("/tenants/self/plan", response_model=schemas.TenantRead, status_code=202)
def update_tenant_self_plan(
    payload: schemas.TenantUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    data = payload.model_dump(exclude_unset=True)

    # Superadmin may update any tenant fields handled by this endpoint.
    # Tenant admins may only update menu_template_id for their own tenant.
    if current_user.role != models.UserRole.superadmin:
        _ensure_tenant_admin(current_user)
        disallowed_fields = [
            k for k, v in (data or {}).items() if k != "menu_template_id" and v is not None
        ]
        if disallowed_fields:
            raise HTTPException(status_code=403, detail="Not enough permissions")

    tenant = db.query(models.Tenant).filter(models.Tenant.id == current_user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    changed = False

    # Allow tenant admins to set the menu template for their own tenant.
    # This is used by the "Modules (optional)" selection in the UI.
    if payload.menu_template_id is not None:
        template_id = int(payload.menu_template_id) if payload.menu_template_id is not None else None
        if template_id:
            template = db.query(models.MenuTemplate).get(template_id)
            if not template or not bool(getattr(template, "is_active", True)):
                raise HTTPException(status_code=400, detail="Invalid menu_template_id")
            ensure_menu_template_assignable_to_tenant(template)
            if int(getattr(tenant, "menu_template_id", 0) or 0) != int(template_id):
                tenant.menu_template_id = int(template_id)
                changed = True
            ensure_menu_template_has_required_menus(
                db,
                template_id=int(template_id),
                required_menu_codes=["DASHBOARD"],
            )
        else:
            if tenant.menu_template_id is not None:
                tenant.menu_template_id = None
                changed = True

    # Only log a request for plan change; do not update tenant.plan directly
    if payload.plan is not None and payload.plan != tenant.plan:
        log = models.AuditLog(
            user_id=current_user.id,
            tenant_id=tenant.id,
            action="tenant_plan_change_request",
            message=f"Requested plan change from '{tenant.plan}' to '{payload.plan}'",
        )
        db.add(log)

    if changed:
        db.add(tenant)

    if changed or (payload.plan is not None and payload.plan != tenant.plan):
        db.commit()

    # Refresh tenant so we return up-to-date data (unchanged plan)
    db.refresh(tenant)

    # Attach plan name for UI display
    plan_obj = db.query(models.Plan).filter(models.Plan.code == tenant.plan).first()
    setattr(tenant, "plan_name", plan_obj.name if plan_obj else tenant.plan.capitalize())

    return tenant


def _ensure_tenant_admin(current_user: models.User) -> None:
    if current_user.role not in (models.UserRole.admin, models.UserRole.superadmin, models.UserRole.TENANT):
        raise HTTPException(status_code=403, detail="Not enough permissions")


def _validate_tenant_user_password(password: str, confirm_password: str) -> None:
    if password != confirm_password:
        raise HTTPException(
            status_code=400,
            detail="Password and confirm password do not match.",
        )
    pwd = password or ""
    if len(pwd) < 8 or not any(c.isalpha() for c in pwd) or not any(c.isdigit() for c in pwd):
        raise HTTPException(
            status_code=400,
            detail="Password must be at least 8 characters long and contain both letters and numbers.",
        )


@app.get("/tenants/self/users")
def list_tenant_users(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        if current_user.role == models.UserRole.superadmin:
            return []
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    _ensure_tenant_admin(current_user)

    users = (
        db.query(models.User)
        .filter(models.User.tenant_id == current_user.tenant_id)
        .order_by(models.User.id)
        .all()
    )

    result = []
    for u in users:
        result.append(
            {
                "id": u.id,
                "name": u.full_name or u.email,
                "email": u.email,
                "is_tenant_admin": bool(getattr(u, "is_tenant_admin", False)) or u.role in (
                    models.UserRole.admin,
                    models.UserRole.superadmin,
                    models.UserRole.TENANT,
                ),
                "active": bool(u.is_active),
            }
        )
    return result


@app.post("/tenants/self/users")
def create_tenant_user(
    payload: schemas.TenantUserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    _ensure_tenant_admin(current_user)

    name = payload.name.strip()
    email = payload.email.strip().lower()

    existing = db.query(models.User).filter(models.User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered to another user")

    tenant_record = db.query(models.Tenant).filter(models.Tenant.id == current_user.tenant_id).first()
    if tenant_record:
        current_user_count = db.query(models.User).filter(
            models.User.tenant_id == current_user.tenant_id,
            models.User.is_active == True
        ).count()
        if current_user_count >= getattr(tenant_record, "max_users", 5):
            raise HTTPException(status_code=400, detail=f"License limits reached: Maximum {getattr(tenant_record, 'max_users', 5)} users allowed.")

    role = models.UserRole.admin if payload.is_tenant_admin else models.UserRole.user

    user = models.User(
        email=email,
        full_name=name,
        password_hash=get_password_hash(payload.password),
        is_active=payload.active,
        role=role,
        tenant_id=current_user.tenant_id,
        is_tenant_admin=payload.is_tenant_admin,
        tenant_permissions=payload.permissions or None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-assign company access for this tenant's companies so /companies is not
    # empty. In per-menu permissions mode, can_* flags are not used for
    # authorization; we only need the linkage rows.
    if current_user.tenant_id is not None:
        tenant_companies = (
            db.query(models.Company)
            .filter(models.Company.tenant_id == current_user.tenant_id)
            .all()
        )
        for company in tenant_companies:
            existing_access = (
                db.query(models.UserCompanyAccess)
                .filter(
                    models.UserCompanyAccess.user_id == user.id,
                    models.UserCompanyAccess.company_id == company.id,
                )
                .first()
            )
            if existing_access:
                continue
            access = models.UserCompanyAccess(
                user_id=user.id,
                company_id=company.id,
            )
            db.add(access)
        db.commit()

    return {
        "id": user.id,
        "name": user.full_name or user.email,
        "email": user.email,
        "is_tenant_admin": bool(getattr(user, "is_tenant_admin", False)),
        "active": bool(user.is_active),
        "permissions": getattr(user, "tenant_permissions", None) or {},
    }


@app.put("/tenants/self/users/{user_id}")
def update_tenant_user(
    user_id: int,
    payload: schemas.TenantUserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    _ensure_tenant_admin(current_user)

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id, models.User.tenant_id == current_user.tenant_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Only Superadmin can change menu access for tenant-admin users (including themselves).
    is_target_tenant_admin = bool(getattr(user, "is_tenant_admin", False)) or user.role in (
        models.UserRole.admin,
        models.UserRole.TENANT,
    )
    if current_user.role != models.UserRole.superadmin and is_target_tenant_admin:
        raise HTTPException(
            status_code=403,
            detail="Only Superadmin can change menu access for tenant admin users.",
        )

    # Only Superadmin can modify tenant-admin users' own admin flag or
    # permissions. Tenant admins can manage regular tenant users but not
    # other tenant-admins (including themselves).
    if current_user.role != models.UserRole.superadmin and is_target_tenant_admin:
        if payload.is_tenant_admin is not None:
            raise HTTPException(
                status_code=403,
                detail="Only Superadmin can change tenant admin status.",
            )
        if payload.permissions is not None:
            raise HTTPException(
                status_code=403,
                detail="Only Superadmin can change tenant admin permissions.",
            )

    if payload.name is not None:
        name = payload.name.strip()
        if not name:
            raise HTTPException(status_code=400, detail="Name is required.")
        user.full_name = name

    if payload.email is not None:
        email = payload.email.strip().lower()
        if not email:
            raise HTTPException(status_code=400, detail="Email is required.")
        existing = (
            db.query(models.User)
            .filter(models.User.email == email, models.User.id != user.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered to another user")
        user.email = email

    if payload.active is not None:
        user.is_active = bool(payload.active)

    if payload.is_tenant_admin is not None:
        is_admin_flag = bool(payload.is_tenant_admin)
        user.role = models.UserRole.admin if is_admin_flag else models.UserRole.user
        user.is_tenant_admin = is_admin_flag

    if payload.permissions is not None:
        user.tenant_permissions = payload.permissions or None

    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "name": user.full_name or user.email,
        "email": user.email,
        "is_tenant_admin": user.role in (
            models.UserRole.admin,
            models.UserRole.superadmin,
            models.UserRole.TENANT,
        ),
        "active": bool(user.is_active),
        "permissions": payload.permissions or {},
    }


@app.delete("/tenants/self/users/{user_id}")
def delete_tenant_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    _ensure_tenant_admin(current_user)

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id, models.User.tenant_id == current_user.tenant_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.is_active = False
    db.add(user)
    db.commit()

    return {"detail": "User deleted"}


@app.get("/tenants/self/menus", response_model=list[schemas.CompanyMenuModuleGroup])
def list_tenant_self_menus(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Return effective menus for the tenant context (no specific company).
    
    This follows the same visibility/template logic as company menus 
    but ignores per-company UserMenuAccess overrides.
    """
    if current_user.tenant_id is None:
        role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
        if role == "superadmin" or role.startswith("ghost_"):
            # System administrators without a tenant: show all registry menus
            registry = db.query(models.Menu).filter(models.Menu.is_active.is_(True)).all()
            # Still use the grouping logic to maintain UI consistency
            return _group_and_build_menu_tree(db, registry, None)
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    tenant = db.query(models.Tenant).get(int(current_user.tenant_id))
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant record not found")

    # 1) Aggregate Template IDs (Union)
    template_ids = []
    if tenant.menu_template_id:
        template_ids.append(int(tenant.menu_template_id))
    if tenant.plan:
        plan_obj = db.query(models.Plan).filter(models.Plan.code == tenant.plan).first()
        if plan_obj and plan_obj.menu_template_id:
            template_ids.append(int(plan_obj.menu_template_id))

    if not template_ids:
        # Fallback: identify the Standard template if nothing is assigned
        tid = get_default_menu_template_id(db)
        if tid:
            template_ids.append(int(tid))

    # 2) Fetch authorized menus
    query = db.query(models.Menu).filter(models.Menu.is_active.is_(True))
    
    # System-wide admins (Superadmin & Ghost) see all active menus regardless of template links
    role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    if role != "superadmin" and not role.startswith("ghost_"):
        if template_ids:
            query = (
                query.join(models.MenuTemplateMenu, models.MenuTemplateMenu.menu_id == models.Menu.id)
                .filter(models.MenuTemplateMenu.template_id.in_(template_ids))
                .distinct()
            )
        else:
            # Fail closed if no templates found for normal users
            return []

    effective_menus = query.all()

    # 3) Group and build tree using the primary template for priority
    primary_template_id = int(tenant.menu_template_id) if tenant.menu_template_id else None
    if not primary_template_id and template_ids:
        primary_template_id = template_ids[0]
    
    return _group_and_build_menu_tree(db, effective_menus, primary_template_id)


def _group_and_build_menu_tree(db: Session, menus: list[models.Menu], template_id: int | None) -> list[schemas.CompanyMenuModuleGroup]:
    # 1. Map all template entries for grouping/ordering
    template_meta_by_id: dict[int, models.MenuTemplateMenu] = {}
    template_meta_by_code: dict[str, models.MenuTemplateMenu] = {}
    if template_id:
        rows = db.query(models.MenuTemplateMenu).filter_by(template_id=int(template_id)).all()
        template_meta_by_id = {int(r.menu_id): r for r in rows}
        
        # Robust fallback for ID mismatches
        template_menus = db.query(models.Menu).filter(models.Menu.id.in_(template_meta_by_id.keys())).all()
        template_meta_by_code = {m.code: template_meta_by_id[m.id] for m in template_menus}

    def _get_link(item: models.Menu) -> models.MenuTemplateMenu | None:
        return template_meta_by_id.get(int(item.id)) or template_meta_by_code.get(item.code)

    def _group_name_for_menu(item: models.Menu) -> str:
        link = _get_link(item)
        name = str(getattr(link, "group_name", "") or "").strip() if link else ""
        return name if name else str(getattr(item, "module", "") or "General")

    def _group_order_for_menu(item: models.Menu) -> int:
        link = _get_link(item)
        order = getattr(link, "group_order", None) if link else None
        return int(order) if order is not None else 10_000

    def _item_order_for_menu(item: models.Menu) -> int:
        link = _get_link(item)
        order = getattr(link, "item_order", None) if link else None
        return int(order) if order is not None else (int(getattr(item, "sort_order", 0) or 0) or 10_000)

    def _sort_key(item: models.Menu):
        return (
            _group_order_for_menu(item),
            _item_order_for_menu(item),
            str(item.label or "").casefold(),
            int(item.id),
        )

    # Dedup and sort
    seen_ids = set()
    deduped = []
    for m in menus:
        if m.id in seen_ids: continue
        seen_ids.add(m.id)
        deduped.append(m)
    deduped.sort(key=_sort_key)

    # Nesting build
    by_id = {int(m.id): m for m in deduped}
    by_parent = defaultdict(list)
    for m in deduped:
        link = _get_link(m)
        pid = int(link.parent_id) if link and link.parent_id is not None else (int(m.parent_id) if m.parent_id is not None else None)
        by_parent[pid].append(m)

    def _build_node(menu: models.Menu) -> schemas.CompanyMenuTreeItem:
        children = by_parent.get(int(menu.id), [])
        children.sort(key=_sort_key)
        link = _get_link(menu)
        
        # Essential Fix: Override parent_id with the template override if it exists, 
        # so frontend Layout.tsx correctly maintains hierarchy for Tenant users.
        pid_override = int(link.parent_id) if link and link.parent_id is not None else (int(menu.parent_id) if menu.parent_id is not None else None)

        return schemas.CompanyMenuTreeItem(
            id=int(menu.id),
            label=str(menu.label or ""),
            code=str(menu.code or ""),
            module=str(menu.module or ""),
            parent_id=pid_override,
            sort_order=_item_order_for_menu(menu),  # Use template item_order, not raw DB sort_order
            is_active=bool(menu.is_active),
            is_sidebar_visible=bool(getattr(link, "is_sidebar_visible", True)),
            children=[_build_node(child) for child in children],
        )

    # Final grouping
    group_to_items = defaultdict(list)
    group_orders = {}
    for m in deduped:
        link = _get_link(m)
        pid = int(link.parent_id) if link and link.parent_id is not None else (int(m.parent_id) if m.parent_id is not None else None)
        if pid is None or pid not in by_id:
            group = _group_name_for_menu(m)
            group_to_items[group].append(_build_node(m))
            group_orders[group] = min(group_orders.get(group, 10_000), _group_order_for_menu(m))

    ordered_groups = sorted(group_to_items.keys(), key=lambda g: (group_orders.get(g, 10_000), str(g).casefold()))
    return [schemas.CompanyMenuModuleGroup(module=g, items=group_to_items[g]) for g in ordered_groups]


@app.get("/tenants/self/users/{user_id}/companies/{company_id}/menus", response_model=list[schemas.UserMenuAccessRead])

def list_tenant_user_menu_access(
    user_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Check if the current user is a system-level admin (Superadmin or Ghost)
    _role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    _is_system_admin = _role == "superadmin" or _role.startswith("ghost_")

    if current_user.tenant_id is None and not _is_system_admin:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    # Allow a user to list their own menus; otherwise require tenant admin or system admin.
    if current_user.id != user_id and not _is_system_admin:
        _ensure_tenant_admin(current_user)

    user_query = db.query(models.User).filter(models.User.id == user_id)
    if not _is_system_admin:
        user_query = user_query.filter(models.User.tenant_id == current_user.tenant_id)
    user = user_query.first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company_query = db.query(models.Company).filter(models.Company.id == company_id)
    if not _is_system_admin:
        company_query = company_query.filter(models.Company.tenant_id == current_user.tenant_id)
    company = company_query.first()

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Enforce strict isolation boundary check for non-system-admins.
    if not _is_system_admin:
        tenant = db.query(models.Tenant).get(int(current_user.tenant_id))
        template_id = int(getattr(tenant, "menu_template_id", 0) or 0) if tenant else 0

        access_list = []
        if template_id:
            # Filter permissions by the tenant's menu template
            access_list = (
                db.query(models.UserMenuAccess)
                .join(models.MenuTemplateMenu, models.MenuTemplateMenu.menu_id == models.UserMenuAccess.menu_id)
                .filter(
                    models.UserMenuAccess.tenant_id == current_user.tenant_id,
                    models.UserMenuAccess.user_id == user_id,
                    models.UserMenuAccess.company_id == company_id,
                    models.MenuTemplateMenu.template_id == int(template_id)
                )
                .all()
            )
    else:
        # Superadmin and Ghost roles bypass the template boundary check.
        access_list = (
            db.query(models.UserMenuAccess)
            .filter(
                models.UserMenuAccess.user_id == user_id,
                models.UserMenuAccess.company_id == company_id,
            )
            .all()
        )
    return access_list


@app.get(
    "/companies/{company_id}/menus",
    response_model=list[schemas.CompanyMenuModuleGroup],
)
def list_effective_company_menus(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Robust role check
    role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    if role == "superadmin" or role.startswith("ghost_"):
        # Superadmin and Ghost roles see any company they want
        pass
    elif role == "admin":
        if company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot access company outside your tenant")
    else:
        # normal users: must be owner or have access row
        has_access = (
            db.query(models.UserCompanyAccess.id)
            .filter(
                models.UserCompanyAccess.user_id == current_user.id,
                models.UserCompanyAccess.company_id == int(company_id),
            )
            .first()
        )
        if not has_access and int(company.owner_id) != int(current_user.id):
            raise HTTPException(status_code=403, detail="Not enough permissions")

    ensure_default_menus_for_company(db, int(company_id))

    base_query = db.query(models.Menu).filter(models.Menu.is_active.is_(True))
    effective_menus = get_effective_menus_for_user(
        db=db,
        user=current_user,
        company_id=int(company_id),
        base_query=base_query,
    )

    # 3) Group and build tree using the tenant's primary template for priority
    tenant = db.query(models.Tenant).get(int(company.tenant_id))
    primary_template_id = int(tenant.menu_template_id) if tenant and tenant.menu_template_id else None

    # Fallback for system-wide admins: ensure they always get the structured "Standard"
    # view even if the ghost/internal tenant has no template assigned.
    if not primary_template_id and (role == "superadmin" or role.startswith("ghost_")):
        primary_template_id = get_default_menu_template_id(db)

    return _group_and_build_menu_tree(db, effective_menus, primary_template_id)


@app.put(
    "/tenants/self/users/{user_id}/companies/{company_id}/menus/{menu_id}",
    response_model=list[schemas.UserMenuAccessRead],
)
def upsert_tenant_user_menu_access(
    user_id: int,
    company_id: int,
    menu_id: int,
    payload: schemas.UserMenuAccessUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.tenant_id is None:
        raise HTTPException(status_code=404, detail="Tenant not found for current user")

    _ensure_tenant_admin(current_user)

    user = (
        db.query(models.User)
        .filter(models.User.id == user_id, models.User.tenant_id == current_user.tenant_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = (
        db.query(models.Company)
        .filter(models.Company.id == company_id, models.Company.tenant_id == current_user.tenant_id)
        .first()
    )
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    menu = db.query(models.Menu).get(menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    tenant = db.query(models.Tenant).get(int(current_user.tenant_id))
    template_id = int(getattr(tenant, "menu_template_id", 0) or 0) if tenant else 0
    if template_id:
        in_template = (
            db.query(models.MenuTemplateMenu.id)
            .filter(
                models.MenuTemplateMenu.template_id == template_id,
                models.MenuTemplateMenu.menu_id == int(menu.id),
            )
            .first()
        )
        if not in_template:
            raise HTTPException(status_code=403, detail="Menu not available for this tenant")

    access = (
        db.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == current_user.tenant_id,
            models.UserMenuAccess.user_id == user_id,
            models.UserMenuAccess.company_id == company_id,
            models.UserMenuAccess.menu_id == menu_id,
        )
        .first()
    )

    if access is None:
        access = models.UserMenuAccess(
            tenant_id=current_user.tenant_id,
            user_id=user_id,
            company_id=company_id,
            menu_id=menu_id,
            access_level=models.MenuAccessLevel(payload.access_level.value),
        )
        db.add(access)
    else:
        access.access_level = models.MenuAccessLevel(payload.access_level.value)

    db.commit()
    db.refresh(access)

    access_list = (
        db.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == current_user.tenant_id,
            models.UserMenuAccess.user_id == user_id,
            models.UserMenuAccess.company_id == company_id,
        )
        .all()
    )
    return access_list


@app.get("/admin/stats", response_model=schemas.AdminStats)
def get_admin_stats(
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    if current_admin.role != models.UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Superadmin role required")

    total_tenants = db.query(models.Tenant).count()
    active_tenants = db.query(models.Tenant).filter(models.Tenant.status == "active").count()
    total_companies = db.query(models.Company).count()
    total_users = db.query(models.User).count()

    return schemas.AdminStats(
        total_tenants=total_tenants,
        active_tenants=active_tenants,
        total_companies=total_companies,
        total_users=total_users
    )


# ------------ Routers ------------

# Auth under /auth
app.include_router(auth.router, prefix="/auth", tags=["auth"])

# Tasks
app.include_router(tasks.router, dependencies=[Depends(require_active_license)])

# Core business routers
app.include_router(companies.router, dependencies=[Depends(require_active_license)])                       # /companies/...
app.include_router(cost_centers.router, dependencies=[Depends(require_active_license)])                    # /companies/{company_id}/departments, /projects
app.include_router(ledgers.router, prefix="/ledgers", dependencies=[Depends(require_active_license)])      # /ledgers/companies/{company_id}/...
app.include_router(payment_modes.router, prefix="/payment-modes", dependencies=[Depends(require_active_license)])  # /payment-modes/companies/{company_id}/...
app.include_router(sales_persons.router, dependencies=[Depends(require_active_license)])                            # /companies/{company_id}/sales-persons/...
app.include_router(vouchers.router, prefix="/vouchers", dependencies=[Depends(require_active_license)])    # /vouchers/companies/{company_id}/...
app.include_router(vouchers.router, dependencies=[Depends(require_active_license)])                        # /companies/{company_id}/vouchers/...
app.include_router(sales.router, prefix="/sales", dependencies=[Depends(require_active_license)])          # /sales/companies/{company_id}/...
app.include_router(purchases.router, prefix="/purchases", dependencies=[Depends(require_active_license)])  # /purchases/companies/{company_id}/...
app.include_router(inventory.router, prefix="/inventory", dependencies=[Depends(require_active_license)])
app.include_router(inventory.router, dependencies=[Depends(require_active_license)])                        # /inventory/companies/{company_id}/...
app.include_router(production.router, prefix="/production", dependencies=[Depends(require_active_license)])
app.include_router(documents.router, dependencies=[Depends(require_active_license)])
app.include_router(seed.router, dependencies=[Depends(require_active_license)])                            # /companies/{company_id}/seed/...
app.include_router(orders.router, prefix="/orders", dependencies=[Depends(require_active_license)])        # /orders/companies/{company_id}/...
app.include_router(orders.router, dependencies=[Depends(require_active_license)])                        # /companies/{company_id}/orders/...
app.include_router(notifications.router, prefix="/notifications", dependencies=[Depends(require_active_license)])  # /notifications/companies/{company_id}/...
app.include_router(payroll.router, dependencies=[Depends(require_active_license)])
app.include_router(commissions.router, dependencies=[Depends(require_active_license)])
app.include_router(website.router, prefix="/website")
app.include_router(delivery.router, dependencies=[Depends(require_active_license)])


@app.get("/companies/{company_id}/ledgers", response_model=list[schemas.LedgerRead])
def list_company_ledgers_alias(
    company_id: int,
    group_id: int | None = Query(None, description="Filter by a single ledger_group id"),
    group_ids: str | None = Query(
        None,
        description="Comma separated list of ledger_group ids to include, e.g. '10,11,12'",
    ),
    group_type: models.LedgerGroupType | None = Query(
        None,
        description="Optional high-level group type filter: ASSET, LIABILITY, INCOME, EXPENSE",
    ),
    search: str | None = Query(
        None,
        description="Optional search on ledger name or code (case-insensitive substring)",
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return ledgers.list_ledgers(
        company_id=company_id,
        group_id=group_id,
        group_ids=group_ids,
        group_type=group_type,
        search=search,
        db=db,
        current_user=current_user,
    )


@app.get("/companies/{company_id}/suppliers", response_model=list[schemas.SupplierRead])
def list_company_suppliers_alias(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return purchases.list_suppliers(
        company_id=company_id,
        db=db,
        current_user=current_user,
    )


@app.post("/companies/{company_id}/suppliers", response_model=schemas.SupplierRead)
def create_company_supplier_alias(
    company_id: int,
    supplier_in: schemas.SupplierCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return purchases.create_supplier(
        company_id=company_id,
        supplier_in=supplier_in,
        db=db,
        current_user=current_user,
    )


@app.get("/companies/{company_id}/suppliers/{supplier_id}", response_model=schemas.SupplierRead)
def get_company_supplier_alias(
    company_id: int,
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return purchases.get_supplier(
        company_id=company_id,
        supplier_id=supplier_id,
        db=db,
        current_user=current_user,
    )


@app.put("/companies/{company_id}/suppliers/{supplier_id}", response_model=schemas.SupplierRead)
def update_company_supplier_alias(
    company_id: int,
    supplier_id: int,
    supplier_in: schemas.SupplierUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return purchases.update_supplier(
        company_id=company_id,
        supplier_id=supplier_id,
        supplier_in=supplier_in,
        db=db,
        current_user=current_user,
    )


@app.delete("/companies/{company_id}/suppliers/{supplier_id}")
def delete_company_supplier_alias(
    company_id: int,
    supplier_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return purchases.delete_supplier(
        company_id=company_id,
        supplier_id=supplier_id,
        db=db,
        current_user=current_user,
    )


@app.delete("/companies/{company_id}/bills/{bill_id}")
def delete_company_bill_alias(
    company_id: int,
    bill_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return purchases.delete_bill(
        company_id=company_id,
        bill_id=bill_id,
        db=db,
        current_user=current_user,
    )


@app.post(
    "/companies/{company_id}/bills/{bill_id}/reverse",
    response_model=schemas.PurchaseReturnRead,
)
async def reverse_company_bill_alias(
    company_id: int,
    bill_id: int,
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return await purchases.reverse_bill(
        company_id=company_id,
        bill_id=bill_id,
        request=request,
        db=db,
        current_user=current_user,
    )



# Admin sections currently working
app.include_router(admin_plans.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_users.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_tenants.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_logs.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_settings.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_maintenance.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_menus.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_menu_templates.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_import.router, dependencies=[Depends(require_active_license)])
app.include_router(maintenance.router, dependencies=[Depends(require_active_license)])
app.include_router(setup.router, dependencies=[Depends(require_active_license)])
app.include_router(sales_targets.router, dependencies=[Depends(require_active_license)])
app.include_router(restaurant_tables.router, dependencies=[Depends(require_active_license)])
app.include_router(performance.router, dependencies=[Depends(require_active_license)])
app.include_router(rewards.router, dependencies=[Depends(require_active_license)])
app.include_router(resources.router, dependencies=[Depends(require_active_license)])
app.include_router(interactions.router, dependencies=[Depends(require_active_license)])
app.include_router(chatbot.router, dependencies=[Depends(require_active_license)])
app.include_router(admin_announcements.router, dependencies=[Depends(require_active_license)])
app.include_router(announcements.router, dependencies=[Depends(require_active_license)])
app.include_router(duty_taxes.router, dependencies=[Depends(require_active_license)])

# Reports: keep existing /reports/companies/{company_id}/reports/... paths
# and also expose /companies/{company_id}/reports/... for convenience.
app.include_router(reports.router, prefix="/reports", dependencies=[Depends(require_active_license)])
app.include_router(reports.router, dependencies=[Depends(require_active_license)])

# Public final accounts endpoints: /reports/trading-account, /reports/profit-loss, /reports/final-accounts
app.include_router(reports.public_router)

@app.on_event("startup")
async def startup_event():
    # Sync default menus and templates
    db = next(get_db())
    try:
        from .menu_defaults import ensure_default_menu_templates
        ensure_default_menu_templates(db)
    finally:
        db.close()
    # Start background notification worker
    async def notification_worker():
        while True:
            try:
                db = next(get_db())
                await notification_service.process_scheduled_queue(db)
                await notification_service.check_and_send_due_reminders(db)
                db.close()
            except Exception as e:
                _logger.exception("Notification worker error: %s", e)
            await asyncio.sleep(600)  # Every 10 minutes

    asyncio.create_task(notification_worker())

if __name__ == "__main__":
    import uvicorn
    import multiprocessing
    multiprocessing.freeze_support()
    uvicorn.run(app, host="0.0.0.0", port=8000)
