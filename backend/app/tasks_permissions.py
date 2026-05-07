from __future__ import annotations

from fastapi import HTTPException, status

from . import models


TASK_PERMISSIONS = {
    "task.view",
    "task.create",
    "task.update",
    "task.assign",
    "task.delete",
    "task.comment",
    "task.attach",
    "task.react",
    # New smart permission codes
    "task.manage_all",
    "task.work_assigned",
    "task.view_reports",
}


def _permissions_from_user(user: models.User) -> set[str]:
    perms = getattr(user, "tenant_permissions", None) or {}

    if isinstance(perms, dict):
        direct = {k for k, v in perms.items() if bool(v) and isinstance(k, str)}
        nested = perms.get("tasks")
        if isinstance(nested, list):
            direct |= {str(p) for p in nested}
        return direct

    if isinstance(perms, list):
        return {str(p) for p in perms}

    return set()


def require_task_permission(user: models.User, permission: str) -> None:
    if permission not in TASK_PERMISSIONS:
        raise ValueError(f"Unknown permission: {permission}")

    _role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if _role in ("admin", "superadmin") or _role.startswith("ghost_"):
        return

    effective = _permissions_from_user(user)
    if permission not in effective:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def ensure_same_tenant(user: models.User, company: "models.Company | None" = None) -> int:
    """Return the effective tenant_id for a task operation.

    - For regular users/admins: must have a tenant_id on their account.
    - For Superadmin/Ghost roles: no tenant_id on the user, but we can fall back
      to the company's tenant_id when a company is provided.
    """
    tenant_id = getattr(user, "tenant_id", None)
    if tenant_id is not None:
        return int(tenant_id)

    # System-level roles (Superadmin / Ghost) have no user.tenant_id.
    # Use the company's tenant when available.
    _role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if _role == "superadmin" or _role.startswith("ghost_"):
        if company is not None:
            return int(company.tenant_id)
        # Caller didn't provide a company — raise a clear 400 so the dev knows
        # to pass the company.
        raise HTTPException(
            status_code=400,
            detail="System admin must provide a company context for task operations",
        )

    raise HTTPException(status_code=400, detail="User is not associated with any tenant")
