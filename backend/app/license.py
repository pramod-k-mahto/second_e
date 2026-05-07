from datetime import datetime, timezone
import json
import logging as _logging
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.orm import Session
from cryptography.fernet import Fernet

from .database import get_db
from .config import get_settings
from .models import Tenant, User, UserRole
from .auth import get_current_user

_logger = _logging.getLogger(__name__)

settings = get_settings()

def validate_tenant_status(tenant: Tenant):
    """
    Validates a Tenant's offline license.
    If the license is expired, it raises an HTTP 402 Payment Required
    for any mutation requests (POST/PUT/DELETE/PATCH), but allows GET.
    """
    if settings.debug:
        return True
    # If no license_key is present, we fall back to raw expires_at (if using cloud SaaS mode)
    if not tenant.license_key:
        if tenant.expires_at and datetime.now(timezone.utc) > tenant.expires_at:
             return False
        return True
        
    try:
        # Strip the "PRIXNA-" prefix
        raw_key = tenant.license_key.removeprefix("PRIXNA-")
        fernet = Fernet(settings.license_secret.encode())
        decrypted_bytes = fernet.decrypt(raw_key.encode())
        payload = json.loads(decrypted_bytes.decode('utf-8'))
        
        # Verify expiration
        expires_at = datetime.fromisoformat(payload["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
            
        if datetime.now(timezone.utc) > expires_at:
            return False
            
    except Exception as e:
        # If decryption fails (tampered key), treat as expired
        _logger.warning("License decoding error: %s", e)
        return False
        
    return True

def get_tenant_expiration(tenant: Tenant) -> datetime | None:
    if not tenant.license_key:
        return tenant.expires_at
    try:
        raw_key = tenant.license_key.removeprefix("PRIXNA-")
        fernet = Fernet(settings.license_secret.encode())
        decrypted_bytes = fernet.decrypt(raw_key.encode())
        payload = json.loads(decrypted_bytes.decode('utf-8'))
        expires_at = datetime.fromisoformat(payload["expires_at"])
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return expires_at
    except Exception:
        return None

async def require_active_license(
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    FastAPI Dependency to enforce license expiration.
    Allows read operations (GET, OPTIONS) even if expired,
    but blocks write operations (POST, PUT, DELETE, PATCH).
    """
    # Robust role check
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    
    # Superadmin and Ghost roles are exempt from tenant license locks
    if role == "superadmin" or role.startswith("ghost_"):
        return user
        
    if not user.tenant_id:
        return user
        
    tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")
        
    # Check if this is a mutation request
    if request.method not in ["GET", "OPTIONS", "HEAD"]:
        is_valid = validate_tenant_status(tenant)
        if not is_valid:
            detail = "Your license has expired. The system is in read-only mode. Please contact our marketing team to renew or get a new license key."
            if tenant.plan and tenant.plan.upper() == "DEMO":
                detail = "Your demo plan has expired. Please contact our marketing team to get a full version license key."
            
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=detail
            )
            
    return user
