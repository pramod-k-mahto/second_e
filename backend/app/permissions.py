from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session

from .database import get_db
from . import models
from .auth import get_current_user
from .menu_defaults import get_default_menu_template_id


_ALLOWED_BY_OPERATION = {
    "read": {
        models.MenuAccessLevel.read,
        models.MenuAccessLevel.update,
        models.MenuAccessLevel.full,
    },
    "write": {
        models.MenuAccessLevel.update,
        models.MenuAccessLevel.full,
    },
    "delete": {
        models.MenuAccessLevel.full,
    },
}


def require_menu_access(menu_code: str, operation: str):
    """FastAPI dependency to enforce per-menu access for a given company.

    - menu_code: code from the menus table (e.g. "inventory.brands").
    - operation: "read" | "write" | "delete".
    """

    if operation not in _ALLOWED_BY_OPERATION:
        raise ValueError(f"Invalid permission operation: {operation}")

    allowed_levels = _ALLOWED_BY_OPERATION[operation]

    def dependency(
        company_id: int,
        db: Session = Depends(get_db),
        current_user: models.User = Depends(get_current_user),
    ) -> None:
        menu = db.query(models.Menu).filter(models.Menu.code == menu_code).first()
        if not menu:
            # Backward-compatibility bridge while manufacturing menus are rolling out
            legacy_map = {
                "manufacturing.bom_master": "inventory.bom",
                "manufacturing.production_order": "inventory.production_orders",
                "manufacturing.material_issue": "inventory.production_orders",
                "manufacturing.wip": "inventory.production_orders",
                "manufacturing.production_entry": "inventory.production_orders",
                "manufacturing.finished_goods_receive": "inventory.production_orders",
                "manufacturing.wastage_scrap": "inventory.production_orders",
                "manufacturing.production_costing": "inventory.production_orders",
                "manufacturing.dashboard": "inventory.production_orders",
                "manufacturing.reports": "reports.quick_analysis",
                "manufacturing.settings": "settings.inventory_valuation",
                "manufacturing.ai_documents": "document.list",
                "manufacturing.fg_journal_entry": "accounting.voucher.journal",
            }
            legacy_code = legacy_map.get(menu_code)
            if legacy_code:
                menu = db.query(models.Menu).filter(models.Menu.code == legacy_code).first()
        if not menu:
            raise HTTPException(status_code=404, detail="Menu not found")

        company = db.query(models.Company).get(int(company_id))
        if not company:
            raise HTTPException(status_code=404, detail="Company not found")

        # Company tenant is the authoritative tenant boundary for menu templates.
        effective_tenant_id = int(getattr(company, "tenant_id", 0) or 0)
        if not effective_tenant_id:
            raise HTTPException(status_code=404, detail="Tenant not found for company")

        # 0) System-wide administrators (Superadmin & Ghost) bypass EVERYTHING
        role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
        if role == "superadmin" or role.startswith("ghost_"):
            return

        # 1) Tenant integrity check (for regular users)
        if current_user.tenant_id is not None and int(current_user.tenant_id) != int(effective_tenant_id):
            raise HTTPException(status_code=403, detail="Cannot access company outside your tenant")

        # 1) Enforce tenant-level menu template: ALL other users
        # must only access menus within the template when in a company context.
        tenant = db.query(models.Tenant).get(int(effective_tenant_id))
        
        # Get Template IDs from Union of Plan + Tenant
        template_ids = []
        if tenant:
            if tenant.menu_template_id:
                template_ids.append(int(tenant.menu_template_id))
            if tenant.plan:
                # Lookup plan by code
                plan_obj = db.query(models.Plan).filter(models.Plan.code == tenant.plan).first()
                if plan_obj and plan_obj.menu_template_id:
                    template_ids.append(int(plan_obj.menu_template_id))

        if not template_ids:
            # If no template is assigned, strictly deny access (fail-closed).
            raise HTTPException(status_code=403, detail="No menu template assigned for this tenant or plan")

        in_template = (
            db.query(models.MenuTemplateMenu.id)
            .filter(
                models.MenuTemplateMenu.template_id.in_(template_ids),
                models.MenuTemplateMenu.menu_id == int(menu.id),
            )
            .first()
        )
        if not in_template:
            raise HTTPException(status_code=403, detail="Menu not available for this tenant's current plan or template")


        # 2) Enforce per-user explicit access
        access = (
            db.query(models.UserMenuAccess)
            .filter(
                models.UserMenuAccess.user_id == int(current_user.id),
                models.UserMenuAccess.company_id == int(company_id),
                models.UserMenuAccess.menu_id == int(menu.id),
            )
            .first()
        )

        if access:
            if access.access_level == models.MenuAccessLevel.deny:
                raise HTTPException(status_code=403, detail="Access to this menu is denied.")
            
            # Check if operation is allowed by this level
            if access.access_level not in allowed_levels:
                raise HTTPException(status_code=403, detail=f"Insufficient permissions for {operation}")
            return

        # 3) Fallback for Tenant Admins if no explicit row
        if current_user.role in (models.UserRole.admin, models.UserRole.TENANT):
            return

        # 4) Normal users require an explicit row to access anything (deny-by-default)
        raise HTTPException(status_code=403, detail="Access to this menu is not authorized.")

    return dependency


def get_effective_menus_for_user(
    db: Session,
    user: models.User,
    company_id: int,
    base_query=None,
):
    """Return menus for a user+company.

    - ALL users (including superadmins) are restricted by the tenant's menu template
      when in a company context.
    - Superadmins then bypass further per-user access rows (UserMenuAccess table).
    - Others: enforce per-user access rows (deny-by-default).
    """

    import sqlalchemy

    query = base_query or db.query(models.Menu)

    company = db.query(models.Company).get(int(company_id))
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    effective_tenant_id = int(getattr(company, "tenant_id", 0) or 0)
    if not effective_tenant_id:
        raise HTTPException(status_code=404, detail="Tenant not found for company")

    # If user has an explicit tenant_id, disallow cross-tenant access.
    if user.tenant_id is not None and int(user.tenant_id) != int(effective_tenant_id):
        raise HTTPException(status_code=403, detail="Cannot access company outside your tenant")

    menus_query = query

    # System-wide administrators (Superadmin and Ghost roles) bypass internal menu restrictions
    role = str(user.role.value if hasattr(user.role, 'val') or hasattr(user.role, 'value') else user.role).lower()
    if role == "superadmin" or role.startswith("ghost_"):
        return menus_query.all()

    # 1) Enforce tenant menu template boundary for ALL other users.
    tenant = db.query(models.Tenant).get(int(effective_tenant_id))
    template_ids = []
    if tenant:
        if tenant.menu_template_id:
            template_ids.append(int(tenant.menu_template_id))
        if tenant.plan:
            plan_obj = db.query(models.Plan).filter(models.Plan.code == tenant.plan).first()
            if plan_obj and plan_obj.menu_template_id:
                template_ids.append(int(plan_obj.menu_template_id))

    if template_ids:
        menus_query = (
            menus_query.join(models.MenuTemplateMenu, models.MenuTemplateMenu.menu_id == models.Menu.id)
            .filter(models.MenuTemplateMenu.template_id.in_(template_ids))
            .distinct()
        )
    else:
        # If no template is assigned, fail closed.
        menus_query = menus_query.filter(sqlalchemy.sql.expression.false())


    # Tenant admins can see everything within the template boundary unless explicitly denied.
    if user.role in (models.UserRole.admin, models.UserRole.TENANT):
        denied_ids = (
            db.query(models.UserMenuAccess.menu_id)
            .filter(
                models.UserMenuAccess.user_id == int(user.id),
                models.UserMenuAccess.company_id == int(company_id),
                models.UserMenuAccess.access_level == models.MenuAccessLevel.deny,
            )
            .all()
        )
        denied_ids_list = [int(r[0]) for r in denied_ids]
        if denied_ids_list:
            menus_query = menus_query.filter(models.Menu.id.not_in(denied_ids_list))
        return menus_query.all()

    # 2) Apply explicit per-user menu access rows (deny-by-default).
    # Use an outerjoin to selectively preserve structural Menu Groups which don't have explicit user security rows.
    menus_query = (
        menus_query.outerjoin(
            models.UserMenuAccess,
            (models.UserMenuAccess.menu_id == models.Menu.id)
            & (models.UserMenuAccess.user_id == int(user.id))
            & (models.UserMenuAccess.company_id == int(company_id))
            & (models.UserMenuAccess.tenant_id == int(effective_tenant_id)),
        )
        .filter(
            sqlalchemy.or_(
                models.UserMenuAccess.id.is_not(None),    # Explicitly permitted
                models.Menu.module.ilike("Menu Group"),   # Always preserve Structural Group Scaffolding
                models.Menu.code.ilike("group.%")         # Always preserve Structural Group Scaffolding (Alternate marker)
            )
        )
        .filter(
            sqlalchemy.or_(
                models.UserMenuAccess.id.is_(None),
                models.UserMenuAccess.access_level != models.MenuAccessLevel.deny
            )
        )
    )

    base_menus = menus_query.all()

    # Auto-include ancestor menu items (e.g. "accounting.masters") that are within the
    # template boundary but lack explicit UserMenuAccess rows. Without this, parent
    # folders are missing from the tree even when their children are accessible, so
    # children appear orphaned at the root level and the parent folder is invisible.
    existing_ids = {int(m.id) for m in base_menus}
    for _ in range(5):  # max depth guard
        needed_parent_ids = {
            int(m.parent_id)
            for m in base_menus
            if m.parent_id is not None and int(m.parent_id) not in existing_ids
        }
        if not needed_parent_ids:
            break
        ancestor_q = (
            db.query(models.Menu)
            .filter(models.Menu.id.in_(needed_parent_ids), models.Menu.is_active.is_(True))
        )
        if template_ids:
            ancestor_q = (
                ancestor_q
                .join(models.MenuTemplateMenu, models.MenuTemplateMenu.menu_id == models.Menu.id)
                .filter(models.MenuTemplateMenu.template_id.in_(template_ids))
                .distinct()
            )
        new_ancestors = ancestor_q.all()
        if not new_ancestors:
            break
        base_menus = base_menus + new_ancestors
        existing_ids |= {int(m.id) for m in new_ancestors}

    return base_menus
