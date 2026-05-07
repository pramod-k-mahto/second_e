# backend/app/routers/admin_users.py

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
import sqlalchemy
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_admin, get_current_user, get_password_hash
from ..menu_defaults import get_default_menu_template_id

router = APIRouter(
    prefix="/admin/users",
    tags=["admin-users"],
    dependencies=[Depends(get_current_admin)],
)


@router.get("", response_model=List[schemas.UserRead])
def list_users(
    q: Optional[str] = Query(None, description="Search by email or full_name"),
    role: Optional[str] = Query(None),
    tenant_id: Optional[int] = Query(None),  # kept for future
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    query = db.query(models.User)

    if q:
        like = f"%{q}%"
        query = query.filter(
            (models.User.email.ilike(like))
            | (models.User.full_name.ilike(like))
        )

    # Only apply a role filter if the provided value matches a valid UserRole enum member.
    if role:
        try:
            valid_role = models.UserRole(role)
        except ValueError:
            valid_role = None

        if valid_role is not None:
            query = query.filter(models.User.role == valid_role)

    # Superadmin can see all users; admin restricted to its own tenant
    if current_user.role == models.UserRole.admin:
        query = query.filter(models.User.tenant_id == current_user.tenant_id)
    elif tenant_id is not None:
        query = query.filter(models.User.tenant_id == tenant_id)

    users = query.order_by(models.User.created_at.desc()).offset(skip).limit(limit).all()
    return users


@router.get("/menus")
def list_menus(
    request: Request,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in (models.UserRole.admin, models.UserRole.superadmin, models.UserRole.TENANT):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    query = db.query(models.Menu)

    # Read include_inactive from the raw query params so we never 422 on odd values.
    include_inactive_values = request.query_params.getlist("include_inactive")

    truthy_values = {"1", "true", "yes", "on"}
    should_include_inactive = False
    for val in include_inactive_values:
        if isinstance(val, str) and val.strip().lower() in truthy_values:
            should_include_inactive = True
            break

    if not should_include_inactive:
        query = query.filter(models.Menu.is_active.is_(True))

    # Filter by company_id or tenant_id if provided (useful for per-user permission UI)
    filter_tenant_id = request.query_params.get("tenant_id")
    filter_company_id = request.query_params.get("company_id")

    # If we have a company_id, it takes precedence for finding the tenant boundary
    if filter_company_id:
        company_id_int = int(filter_company_id)
        company = db.query(models.Company).get(company_id_int)
        if company:
            # Security: if not superadmin, must belong to current tenant
            if current_user.role != models.UserRole.superadmin and company.tenant_id != current_user.tenant_id:
                raise HTTPException(status_code=403, detail="Cannot access companies from another tenant")
            filter_tenant_id = str(company.tenant_id)

    # Fallback to current user's tenant if they are not superadmin
    if current_user.role != models.UserRole.superadmin:
        filter_tenant_id = str(current_user.tenant_id)

    if filter_tenant_id:
        tenant_id_int = int(filter_tenant_id)
        # Security: double check for non-superadmin
        if current_user.role != models.UserRole.superadmin and tenant_id_int != current_user.tenant_id:
             raise HTTPException(status_code=403, detail="Cannot access another tenant's menus")
        
        # Superadmins get to see all active menus regardless of template assignments.
        # This allows them to manage permissions for any module across any tenant.
        if current_user.role != models.UserRole.superadmin:
            tenant = db.query(models.Tenant).get(tenant_id_int)
            template_id = int(getattr(tenant, "menu_template_id", 0) or 0) if tenant else 0
            
            if template_id:
                # Filter by template using a subquery for reliability.
                template_menu_ids = db.query(models.MenuTemplateMenu.menu_id).filter(
                    models.MenuTemplateMenu.template_id == int(template_id)
                )
                query = query.filter(models.Menu.id.in_(template_menu_ids))
            else:
                # If no template is assigned, return no menus (strict isolation).
                query = query.filter(sqlalchemy.sql.expression.false())

    menus = query.order_by(models.Menu.module, models.Menu.sort_order, models.Menu.id).all()
    return menus


@router.get("/{user_id}", response_model=schemas.UserRead)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    # Admin can only access users within the same tenant
    if current_user.role == models.UserRole.admin and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Cannot access users from another tenant")
    return user


@router.post("", response_model=schemas.UserRead, status_code=201)
def create_user(
    user_in: schemas.UserCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered to another user")

    # Security: Jail non-superadmins. They can only create regular 'user' roles within their own tenant.
    if current_user.role != models.UserRole.superadmin:
        role = models.UserRole.user
        tenant_id = current_user.tenant_id
    else:
        # Superadmin logic:
        role = user_in.role or models.UserRole.user
        tenant_id = user_in.tenant_id
        
        # Enforce tenant_id for tenant-level roles.
        if role in (models.UserRole.admin, models.UserRole.user, models.UserRole.TENANT) and tenant_id is None:
            raise HTTPException(
                status_code=400,
                detail="tenant_id is mandatory for tenant-level roles (admin, user, TENANT)."
            )

        # GHOST REFINEMENT: Auto-assign Ghost roles to system ghost tenant if missing
        is_ghost = role in (models.UserRole.ghost_billing, models.UserRole.ghost_support, models.UserRole.ghost_tech)
        if is_ghost and tenant_id is None:
            settings = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()
            if settings and settings.ghost_tenant_id:
                tenant_id = settings.ghost_tenant_id

    user = models.User(
        email=user_in.email,
        full_name=user_in.full_name,
        role=role,
        tenant_id=tenant_id,
        password_hash=get_password_hash(user_in.password),
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    # Auto-assign company access for this user's tenant so /companies is not empty.
    if tenant_id is not None:
        tenant_companies = (
            db.query(models.Company)
            .filter(models.Company.tenant_id == tenant_id)
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

    # GHOST REFINEMENT: Ensure Ghost users get access to the system ghost company too
    is_ghost = user.role in (models.UserRole.ghost_billing, models.UserRole.ghost_support, models.UserRole.ghost_tech)
    if is_ghost:
        settings = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()
        if settings and settings.ghost_company_id:
            existing_access = (
                db.query(models.UserCompanyAccess)
                .filter(
                    models.UserCompanyAccess.user_id == user.id,
                    models.UserCompanyAccess.company_id == settings.ghost_company_id,
                )
                .first()
            )
            if not existing_access:
                access = models.UserCompanyAccess(
                    user_id=user.id,
                    company_id=settings.ghost_company_id,
                )
                db.add(access)

    db.commit()
    return user


@router.put("/{user_id}", response_model=schemas.UserRead)
def update_user(
    user_id: int,
    user_in: schemas.UserUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin can only update users within the same tenant and cannot promote roles or move tenants.
    # Additionally, only Superadmin can change the role of tenant-admin users.
    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot modify users from another tenant")

        is_target_tenant_admin = bool(getattr(user, "is_tenant_admin", False)) or user.role in (
            models.UserRole.admin,
            models.UserRole.TENANT,
        )

        if is_target_tenant_admin and user_in.role is not None:
            raise HTTPException(
                status_code=403,
                detail="Only Superadmin can change tenant admin users.",
            )

        if user_in.role is not None and user_in.role != models.UserRole.user:
            raise HTTPException(status_code=403, detail="Admin cannot change user role to admin/superadmin")

    if user_in.email is not None and user_in.email != user.email:
        # Prevent duplicate email across the system
        existing = db.query(models.User).filter(models.User.email == user_in.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered to another user")
        user.email = user_in.email
    if user_in.full_name is not None:
        user.full_name = user_in.full_name
    if user_in.role is not None:
        user.role = user_in.role
        # Sync is_tenant_admin with role for consistency
        if user.role in (models.UserRole.admin, models.UserRole.superadmin, models.UserRole.TENANT):
            user.is_tenant_admin = True
        elif user.role == models.UserRole.user:
            user.is_tenant_admin = False

    if user_in.is_tenant_admin is not None:
        user.is_tenant_admin = user_in.is_tenant_admin

    # Strict Tenant Immutability:
    # 1. If user already has a tenant_id, it can NEVER be changed.
    # 2. If user has no tenant_id (None), only a Superadmin can assign it.
    if user_in.tenant_id is not None:
        if user.tenant_id is not None:
            if user_in.tenant_id != user.tenant_id:
                raise HTTPException(
                    status_code=403,
                    detail="Tenant ID is immutable once set and cannot be changed."
                )
        else:
            # Current tenant_id is None, check permission to assign
            if current_user.role != models.UserRole.superadmin:
                raise HTTPException(
                    status_code=403,
                    detail="Only a Superadmin can assign a Tenant ID to a user."
                )
            user.tenant_id = user_in.tenant_id
    if user_in.is_active is not None:
        user.is_active = user_in.is_active
    if user_in.password:
        user.password_hash = get_password_hash(user_in.password)

    db.commit()
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin can only delete users within the same tenant
    if current_user.role == models.UserRole.admin and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Cannot delete users from another tenant")

    # Prevent deleting a user that still owns companies, because Company.owner_id is NOT NULL
    if user.companies:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete user who owns companies. Reassign or delete their companies first.",
        )

    db.delete(user)
    db.commit()
    return


# -------------------- User Company Access Management --------------------


@router.get("/{user_id}/companies", response_model=List[schemas.UserCompanyAccessRead])
def list_user_company_access(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Admin can only manage users within the same tenant
    if current_user.role == models.UserRole.admin and user.tenant_id != current_user.tenant_id:
        raise HTTPException(status_code=403, detail="Cannot manage users from another tenant")

    access_list = (
        db.query(models.UserCompanyAccess)
        .join(models.Company)
        .filter(models.UserCompanyAccess.user_id == user_id)
    )

    # Admin: restrict to companies within their tenant
    if current_user.role == models.UserRole.admin:
        access_list = access_list.filter(models.Company.tenant_id == current_user.tenant_id)

    return access_list.all()


@router.post(
    "/{user_id}/companies",
    response_model=schemas.UserCompanyAccessRead,
    status_code=201,
)
def create_user_company_access(
    user_id: int,
    payload: schemas.UserCompanyAccessCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    if payload.user_id != user_id:
        raise HTTPException(status_code=400, detail="user_id mismatch in payload")

    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = db.query(models.Company).get(payload.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Admin can only manage users and companies within the same tenant
    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage access outside your tenant")
    elif current_user.role not in (
        models.UserRole.superadmin,
        models.UserRole.TENANT,
    ):
        # Non-admin regular users can only view their own menu access for companies
        # within their own tenant.
        if user.id != current_user.id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Not enough permissions to view these menus")

    existing = (
        db.query(models.UserCompanyAccess)
        .filter(
            models.UserCompanyAccess.user_id == user_id,
            models.UserCompanyAccess.company_id == payload.company_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Access already exists for this company")

    access = models.UserCompanyAccess(
        user_id=user_id,
        company_id=payload.company_id,
        can_sales=payload.can_sales,
        can_purchases=payload.can_purchases,
        can_inventory=payload.can_inventory,
        can_reports=payload.can_reports,
    )
    db.add(access)
    db.commit()
    db.refresh(access)
    return access


@router.put(
    "/{user_id}/companies/{company_id}",
    response_model=schemas.UserCompanyAccessRead,
)
def update_user_company_access(
    user_id: int,
    company_id: int,
    payload: schemas.UserCompanyAccessUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Admin can only manage users and companies within the same tenant
    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage access outside your tenant")

    access = (
        db.query(models.UserCompanyAccess)
        .filter(
            models.UserCompanyAccess.user_id == user_id,
            models.UserCompanyAccess.company_id == company_id,
        )
        .first()
    )
    if not access:
        raise HTTPException(status_code=404, detail="Access entry not found")

    if payload.can_sales is not None:
        access.can_sales = payload.can_sales
    if payload.can_purchases is not None:
        access.can_purchases = payload.can_purchases
    if payload.can_inventory is not None:
        access.can_inventory = payload.can_inventory
    if payload.can_reports is not None:
        access.can_reports = payload.can_reports

    db.commit()
    db.refresh(access)
    return access


@router.delete(
    "/{user_id}/companies/{company_id}",
    status_code=204,
)
def delete_user_company_access(
    user_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Admin can only manage users and companies within the same tenant
    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage access outside your tenant")

    access = (
        db.query(models.UserCompanyAccess)
        .filter(
            models.UserCompanyAccess.user_id == user_id,
            models.UserCompanyAccess.company_id == company_id,
        )
        .first()
    )
    if not access:
        raise HTTPException(status_code=404, detail="Access entry not found")

    db.delete(access)
    db.commit()
    return


# -------------------- Per-menu access & menus --------------------




@router.get(
    "/{user_id}/companies/{company_id}/menus",
    response_model=List[schemas.UserMenuAccessRead],
)
def list_user_menu_access(
    user_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage access outside your tenant")

    access_list = (
        db.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == company.tenant_id,
            models.UserMenuAccess.user_id == user_id,
            models.UserMenuAccess.company_id == company_id,
        )
        .all()
    )
    return access_list


@router.put(
    "/{user_id}/companies/{company_id}/menus/{menu_id}",
    response_model=List[schemas.UserMenuAccessRead],
)
def upsert_user_menu_access(
    user_id: int,
    company_id: int,
    menu_id: int,
    payload: schemas.UserMenuAccessUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in (models.UserRole.admin, models.UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    menu = db.query(models.Menu).get(menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    # Enforce tenant-level menu template boundary: only non-superadmins are restricted.
    if current_user.role != models.UserRole.superadmin:
        effective_tenant_id = int(company.tenant_id)
        tenant = db.query(models.Tenant).get(effective_tenant_id)
        template_id = int(getattr(tenant, "menu_template_id", 0) or 0) if tenant else 0
        if not template_id:
            from ..menu_defaults import get_default_menu_template_id
            template_id = int(get_default_menu_template_id(db) or 0)
        
        if not template_id:
            raise HTTPException(status_code=403, detail="No menu template assigned for this tenant")

        in_template = (
            db.query(models.MenuTemplateMenu.id)
            .filter(
                models.MenuTemplateMenu.template_id == template_id,
                models.MenuTemplateMenu.menu_id == int(menu.id),
            )
            .first()
        )
        if not in_template:
            raise HTTPException(status_code=403, detail="Menu not available for this tenant's template")

    # Only Superadmin can change menu access for tenant-admin users. Tenant admins
    # can manage regular tenant users but not other tenant-admins (including themselves).
    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage access outside your tenant")

        is_target_tenant_admin = bool(getattr(user, "is_tenant_admin", False)) or user.role in (
            models.UserRole.admin,
            models.UserRole.TENANT,
        )
        if is_target_tenant_admin:
            raise HTTPException(
                status_code=403,
                detail="Only Superadmin can change menu access for tenant admin users.",
            )

    access = (
        db.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == company.tenant_id,
            models.UserMenuAccess.user_id == user_id,
            models.UserMenuAccess.company_id == company_id,
            models.UserMenuAccess.menu_id == menu_id,
        )
        .first()
    )

    if access is None:
        access = models.UserMenuAccess(
            tenant_id=company.tenant_id,
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
    return [access]


@router.post(
    "/{user_id}/companies/{company_id}/menus/seed-defaults",
    response_model=List[schemas.UserMenuAccessRead],
)
def seed_default_user_menu_access(
    user_id: int,
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.role not in (models.UserRole.admin, models.UserRole.superadmin):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    """Create default per-menu access rows for a user+company.

    - Scans the global menus table.
    - For each menu, if there is **no** UserMenuAccess row for (user, company, menu),
      it creates one with access_level=full.
    - Existing UserMenuAccess rows are **never** modified, so this is safe to call
      after new menus are added without overwriting prior decisions.
    """

    user = db.query(models.User).get(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # Admin can only manage users and companies within the same tenant.
    if current_user.role == models.UserRole.admin:
        if user.tenant_id != current_user.tenant_id or company.tenant_id != current_user.tenant_id:
            raise HTTPException(status_code=403, detail="Cannot manage access outside your tenant")

    # Seed defaults within the tenant's effective menu template boundary.
    # We intentionally default to deny-by-default so tenant users do not see
    # every menu in the sidebar unless explicitly assigned.
    effective_tenant_id = int(getattr(company, "tenant_id", 0) or 0)
    tenant = db.query(models.Tenant).get(int(effective_tenant_id)) if effective_tenant_id else None
    template_id = int(getattr(tenant, "menu_template_id", 0) or 0) if tenant else 0
    if not template_id:
        template_id = int(get_default_menu_template_id(db) or 0)

    menus_query = db.query(models.Menu).filter(models.Menu.is_active.is_(True))
    if template_id:
        menus_query = (
            menus_query.join(models.MenuTemplateMenu, models.MenuTemplateMenu.menu_id == models.Menu.id)
            .filter(models.MenuTemplateMenu.template_id == int(template_id))
        )
    else:
        menus_query = menus_query.filter(sqlalchemy.sql.expression.false())

    menus = menus_query.order_by(models.Menu.module, models.Menu.sort_order, models.Menu.id).all()

    # Find existing access rows for this user+company so we don't overwrite.
    existing_access = (
        db.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == company.tenant_id,
            models.UserMenuAccess.user_id == user_id,
            models.UserMenuAccess.company_id == company_id,
        )
        .all()
    )
    existing_by_menu_id = {row.menu_id for row in existing_access}

    dashboard_menu_id: int | None = None
    for m in menus:
        if str(getattr(m, "code", "") or "") == "DASHBOARD":
            dashboard_menu_id = int(m.id)
            break

    created_any = False
    for menu in menus:
        if menu.id in existing_by_menu_id:
            continue

        default_level = models.MenuAccessLevel.deny
        if dashboard_menu_id is not None and int(menu.id) == int(dashboard_menu_id):
            default_level = models.MenuAccessLevel.read

        access = models.UserMenuAccess(
            tenant_id=company.tenant_id,
            user_id=user_id,
            company_id=company_id,
            menu_id=menu.id,
            access_level=default_level,
        )
        db.add(access)
        created_any = True

    if created_any:
        db.commit()

    # Return the full, up-to-date list of access rows for this user+company.
    access_list = (
        db.query(models.UserMenuAccess)
        .filter(
            models.UserMenuAccess.tenant_id == company.tenant_id,
            models.UserMenuAccess.user_id == user_id,
            models.UserMenuAccess.company_id == company_id,
        )
        .all()
    )
    return access_list
