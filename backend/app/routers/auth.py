import logging
import time

from fastapi import APIRouter, Depends, HTTPException, Header, Request, Response, status
from datetime import timedelta
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from .. import models, schemas
from .seed import _seed_default_chart_for_company
from ..menu_defaults import ensure_default_menus_for_company
from ..auth import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
    validate_password_policy,
    get_current_user,
    blacklist_token,
)
from ..config import get_settings
from ..database import get_db

logger = logging.getLogger(__name__)

# One single router, no prefix here (prefix will be added in main.py)
router = APIRouter(tags=["Authentication"])

settings = get_settings()


# ---------------------------------------------------------------------------
# In-memory rate limiting (per-IP for login/register, per-user for pwd change)
# In production, replace with Redis-backed counters.
# ---------------------------------------------------------------------------

_LOGIN_WINDOW_SECONDS = 60
_LOGIN_MAX_ATTEMPTS = 5
_LOGIN_LOCKOUT_THRESHOLD = 10
_LOGIN_LOCKOUT_SECONDS = 15 * 60
_login_attempts: dict[str, list[float]] = {}
_login_lockouts: dict[str, float] = {}

_REGISTER_WINDOW_SECONDS = 60 * 60  # 1 hour
_REGISTER_MAX_ATTEMPTS = 5
_register_attempts: dict[str, list[float]] = {}

_CHANGE_PASSWORD_WINDOW_SECONDS = 15 * 60
_CHANGE_PASSWORD_MAX_ATTEMPTS = 5
_change_password_attempts: dict[int, list[float]] = {}


def _get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _rate_limit_login(request: Request) -> None:
    ip = _get_client_ip(request)
    now = time.time()

    # Check lockout
    lockout_until = _login_lockouts.get(ip, 0)
    if now < lockout_until:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Account temporarily locked due to too many failed attempts. Try again later.",
        )

    window_start = now - _LOGIN_WINDOW_SECONDS
    attempts = [ts for ts in _login_attempts.get(ip, []) if ts >= window_start]
    if len(attempts) >= _LOGIN_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Please try again later.",
        )


def _record_login_attempt(request: Request, *, success: bool) -> None:
    ip = _get_client_ip(request)
    now = time.time()
    window_start = now - _LOGIN_WINDOW_SECONDS
    attempts = [ts for ts in _login_attempts.get(ip, []) if ts >= window_start]
    attempts.append(now)
    _login_attempts[ip] = attempts

    if not success:
        # Check if we should lock out
        lockout_window = now - _LOGIN_LOCKOUT_SECONDS
        all_attempts = [ts for ts in _login_attempts.get(ip, []) if ts >= lockout_window]
        if len(all_attempts) >= _LOGIN_LOCKOUT_THRESHOLD:
            _login_lockouts[ip] = now + _LOGIN_LOCKOUT_SECONDS
    else:
        # Clear on success
        _login_attempts.pop(ip, None)
        _login_lockouts.pop(ip, None)


def _rate_limit_register(request: Request) -> None:
    ip = _get_client_ip(request)
    now = time.time()
    window_start = now - _REGISTER_WINDOW_SECONDS
    attempts = [ts for ts in _register_attempts.get(ip, []) if ts >= window_start]
    if len(attempts) >= _REGISTER_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many registration attempts. Please try again later.",
        )
    attempts.append(now)
    _register_attempts[ip] = attempts


def _rate_limit_change_password(user_id: int) -> None:
    now = time.time()
    window_start = now - _CHANGE_PASSWORD_WINDOW_SECONDS
    attempts = _change_password_attempts.get(user_id, [])
    attempts = [ts for ts in attempts if ts >= window_start]
    if len(attempts) >= _CHANGE_PASSWORD_MAX_ATTEMPTS:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many password change attempts. Please try again later.",
        )
    attempts.append(now)
    _change_password_attempts[user_id] = attempts


@router.post("/register", response_model=schemas.UserRead)
def register(user_in: schemas.UserCreate, request: Request, db: Session = Depends(get_db)):
    _rate_limit_register(request)

    # Server-side password policy enforcement (don't rely on frontend/schema alone)
    validate_password_policy(user_in.password)

    existing = db.query(models.User).filter(models.User.email == user_in.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered to another user")

    # Create the initial tenant owner user. This user should be treated as a tenant-level admin.
    user = models.User(
        email=user_in.email,
        full_name=user_in.full_name,
        password_hash=get_password_hash(user_in.password),
        role=models.UserRole.TENANT,
        is_tenant_admin=True,
    )
    db.add(user)
    db.flush()

    tenant = models.Tenant(
        name=user_in.full_name or user_in.email,
        status="active",
        plan="standard",
    )
    db.add(tenant)
    db.flush()

    # Link user to this tenant
    user.tenant_id = tenant.id

    company = models.Company(
        owner_id=user.id,
        tenant_id=tenant.id,
        name=f"{tenant.name} Company",
    )
    db.add(company)

    # Persist tenant, user, and company
    db.commit()
    db.refresh(company)

    # Seed default chart of accounts for this company
    _seed_default_chart_for_company(db, company)

    ensure_default_menus_for_company(db, company.id)

    # Ensure the tenant owner also has explicit company access so /me/companies-access is not empty
    existing_access = (
        db.query(models.UserCompanyAccess)
        .filter(
            models.UserCompanyAccess.user_id == user.id,
            models.UserCompanyAccess.company_id == company.id,
        )
        .first()
    )
    if not existing_access:
        # Create a basic company access row; per-menu permissions now control
        # actual access, so we do not use the can_* flags for authorization.
        access = models.UserCompanyAccess(
            user_id=user.id,
            company_id=company.id,
        )
        db.add(access)
        db.commit()

    logger.info("New user registered: user_id=%s", user.id)

    db.refresh(user)
    return user


@router.post("/login", response_model=schemas.Token)
def login(
    request: Request,
    response: Response,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
    x_tenant_id: str | None = Header(None, alias="X-Tenant-Id"),
):
    _rate_limit_login(request)

    # Use a generic error to avoid leaking whether user/email exists
    bad_credentials = HTTPException(status_code=401, detail="Incorrect email or password")

    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user:
        # Run a dummy hash to prevent timing-based user enumeration
        get_password_hash("dummy-timing-equalize")
        _record_login_attempt(request, success=False)
        logger.warning("Login failed: unknown email from IP %s", _get_client_ip(request))
        raise bad_credentials

    if not user.is_active:
        _record_login_attempt(request, success=False)
        logger.warning("Login failed: inactive user_id=%s from IP %s", user.id, _get_client_ip(request))
        raise bad_credentials

    if not verify_password(form_data.password, user.password_hash):
        _record_login_attempt(request, success=False)
        logger.warning("Login failed: bad password for user_id=%s from IP %s", user.id, _get_client_ip(request))
        raise bad_credentials

    # X-Tenant-Id Header Verification
    # If provided, ensure it matches the user's assigned tenant_id.
    client_ip = _get_client_ip(request)
    if x_tenant_id is not None:
        try:
            requested_tenant_id = int(x_tenant_id)
            if user.tenant_id is not None and user.tenant_id != requested_tenant_id:
                # Log the mismatch attempt
                log = models.AuditLog(
                    user_id=user.id,
                    tenant_id=user.tenant_id,
                    action="login_tenant_mismatch",
                    message=f"Login blocked: User {user.email} attempted to login to tenant {requested_tenant_id} from IP {client_ip}."
                )
                db.add(log)
                db.commit()
                
                _record_login_attempt(request, success=False)
                logger.warning("Login blocked: tenant mismatch for user_id=%s from IP %s", user.id, client_ip)
                raise HTTPException(
                    status_code=401, 
                    detail="User does not belong to this tenant"
                )
        except ValueError:
            pass # Ignore invalid header values

    _record_login_attempt(request, success=True)
    logger.info("Login success: user_id=%s from IP %s", user.id, client_ip)

    # Success Audit Log
    log = models.AuditLog(
        user_id=user.id,
        tenant_id=user.tenant_id,
        action="login_success",
        message=f"User {user.email} logged in successfully from IP {client_ip}."
    )
    db.add(log)
    db.commit()

    # Short-lived access token
    access_token = create_access_token(data={"sub": str(user.id)})

    # Longer-lived refresh token
    refresh_token = create_refresh_token(data={"sub": str(user.id)})

    # Set HttpOnly cookie for access token (short-lived)
    access_max_age = settings.access_token_expire_minutes * 60
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=not settings.debug,
        max_age=access_max_age,
        expires=access_max_age,
        samesite="lax",
    )

    # Set HttpOnly cookie for refresh token (longer-lived)
    refresh_max_age = settings.refresh_token_expire_minutes * 60
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=not settings.debug,
        max_age=refresh_max_age,
        expires=refresh_max_age,
        samesite="lax",
        path="/auth/refresh",
    )

    license_warning = None
    if user.tenant_id:
        from ..license import get_tenant_expiration
        from datetime import datetime, timezone
        tenant = db.query(models.Tenant).filter(models.Tenant.id == user.tenant_id).first()
        if tenant:
            expires_at = get_tenant_expiration(tenant)
            if expires_at:
                now = datetime.now(timezone.utc)
                if expires_at > now and (expires_at - now).days <= 15:
                    days_left = (expires_at - now).days
                    license_warning = f"Your license will expire in {days_left} days. Please contact our marketing team to renew."

    return schemas.Token(
        access_token=access_token,
        refresh_token=refresh_token,
        license_warning=license_warning
    )


@router.post("/refresh", response_model=schemas.Token)
def refresh_access_token(
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
):
    """Exchange a valid refresh token for a new access token."""
    from jose import JWTError, jwt as jose_jwt

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
    )

    # Read refresh token from cookie or Authorization header
    refresh_tok: str | None = request.cookies.get("refresh_token")
    if not refresh_tok:
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            refresh_tok = auth_header.split(" ", 1)[1].strip()

    if not refresh_tok:
        raise credentials_exception

    from ..auth import is_token_blacklisted
    if is_token_blacklisted(refresh_tok):
        raise credentials_exception

    try:
        payload = jose_jwt.decode(refresh_tok, settings.secret_key, algorithms=[settings.algorithm])
        if payload.get("type") != "refresh":
            raise credentials_exception
        user_id = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = db.query(models.User).filter(models.User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise credentials_exception

    # Issue new access token
    new_access_token = create_access_token(data={"sub": str(user.id)})
    access_max_age = settings.access_token_expire_minutes * 60
    response.set_cookie(
        key="access_token",
        value=new_access_token,
        httponly=True,
        secure=not settings.debug,
        max_age=access_max_age,
        expires=access_max_age,
        samesite="lax",
    )

    return schemas.Token(access_token=new_access_token)


@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    current_user: models.User = Depends(get_current_user),
):
    """Invalidate the current access & refresh tokens server-side."""
    # Blacklist access token
    token: str | None = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get("access_token")
    if token:
        blacklist_token(token)

    # Blacklist refresh token
    refresh_tok = request.cookies.get("refresh_token")
    if refresh_tok:
        blacklist_token(refresh_tok)

    # Clear cookies
    response.delete_cookie("access_token")
    response.delete_cookie("refresh_token", path="/auth/refresh")

    logger.info("Logout: user_id=%s from IP %s", current_user.id, _get_client_ip(request))
    return {"detail": "Logged out successfully."}


@router.get("/me", response_model=schemas.UserRead)
async def read_me(
    current_user: models.User = Depends(get_current_user),
):
    return current_user


@router.get("/me/companies-access", response_model=list[schemas.UserCompanyAccessRead])
async def read_my_company_access(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    access_list = (
        db.query(models.UserCompanyAccess)
        .filter(models.UserCompanyAccess.user_id == current_user.id)
        .all()
    )

    # If the user has no explicit company access but belongs to a tenant,
    # auto-create entries for all companies in that tenant so the Companies
    # page is not empty for existing users.
    if not access_list and current_user.tenant_id is not None:
        tenant_companies = (
            db.query(models.Company)
            .filter(models.Company.tenant_id == current_user.tenant_id)
            .all()
        )
        for company in tenant_companies:
            existing = (
                db.query(models.UserCompanyAccess)
                .filter(
                    models.UserCompanyAccess.user_id == current_user.id,
                    models.UserCompanyAccess.company_id == company.id,
                )
                .first()
            )
            if existing:
                continue
            # Placeholders; will be normalized below based on permissions.
            access = models.UserCompanyAccess(
                user_id=current_user.id,
                company_id=company.id,
            )
            db.add(access)
        db.commit()

        access_list = (
            db.query(models.UserCompanyAccess)
            .filter(models.UserCompanyAccess.user_id == current_user.id)
            .all()
        )

    # Previously, access flags were normalized from tenant_permissions.
    # In per-menu permissions mode we keep these rows only for listing
    # companies; actual authorization is enforced via UserMenuAccess.
    return access_list


@router.post("/change-password")
async def change_password(
    request: Request,
    payload: schemas.ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _rate_limit_change_password(current_user.id)

    if not verify_password(payload.current_password, current_user.password_hash):
        logger.warning(
            "Password change failed: bad current password for user_id=%s from IP %s",
            current_user.id, _get_client_ip(request),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect.",
        )

    # Server-side password policy enforcement
    validate_password_policy(payload.new_password)

    current_user.password_hash = get_password_hash(payload.new_password)
    db.add(current_user)
    db.commit()
    db.refresh(current_user)

    # Blacklist the current access token so old sessions are invalidated
    token: str | None = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    if not token:
        token = request.cookies.get("access_token")
    if token:
        blacklist_token(token)

    # Blacklist refresh token too
    refresh_tok = request.cookies.get("refresh_token")
    if refresh_tok:
        blacklist_token(refresh_tok)

    logger.info("Password changed: user_id=%s from IP %s", current_user.id, _get_client_ip(request))

    return {"detail": "Password updated successfully."}
