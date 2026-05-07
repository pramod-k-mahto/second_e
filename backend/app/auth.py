import logging
import secrets
import threading
import time
from datetime import datetime, timedelta

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .config import get_settings
from .database import get_db
from .models import User, UserRole
from .schemas import TokenData


logger = logging.getLogger(__name__)

settings = get_settings()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")
# Explicit bcrypt rounds=12 (minimum recommended)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=12)


# ---------------------------------------------------------------------------
# In-process user cache — avoids one DB round-trip per authenticated request.
# TTL of 60 s means a deactivated account is blocked within a minute at most.
# ---------------------------------------------------------------------------

_USER_CACHE_TTL = 60  # seconds
_user_cache: dict[int, tuple[User, float]] = {}  # user_id -> (user, expires_at)
_user_cache_lock = threading.Lock()


def _get_cached_user(user_id: int) -> User | None:
    with _user_cache_lock:
        entry = _user_cache.get(user_id)
        if entry and time.monotonic() < entry[1]:
            return entry[0]
        _user_cache.pop(user_id, None)
    return None


def _set_cached_user(user: User) -> None:
    with _user_cache_lock:
        _user_cache[user.id] = (user, time.monotonic() + _USER_CACHE_TTL)


def invalidate_user_cache(user_id: int) -> None:
    """Call this whenever a user record is mutated (deactivated, role changed, etc.)."""
    with _user_cache_lock:
        _user_cache.pop(user_id, None)


# ---------------------------------------------------------------------------
# Password helpers
# ---------------------------------------------------------------------------

def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def validate_password_policy(password: str) -> None:
    """Enforce minimum 8 chars, at least 1 letter and 1 digit."""
    pwd = password or ""
    errors: list[str] = []
    if len(pwd) < 8:
        errors.append("Password must be at least 8 characters long.")
    if not any(c.isalpha() for c in pwd):
        errors.append("Password must contain at least one letter.")
    if not any(c.isdigit() for c in pwd):
        errors.append("Password must contain at least one number.")
    if errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=" ".join(errors),
        )


# ---------------------------------------------------------------------------
# Token blacklist (in-memory; swap for Redis/DB in production for multi-proc)
# ---------------------------------------------------------------------------

_blacklisted_tokens: set[str] = set()
_blacklist_lock = threading.Lock()


def blacklist_token(token: str) -> None:
    """Add a token (or its JTI) to the blacklist so it cannot be reused."""
    with _blacklist_lock:
        _blacklisted_tokens.add(token)


def is_token_blacklisted(token: str) -> bool:
    with _blacklist_lock:
        return token in _blacklisted_tokens


def _cleanup_expired_blacklist() -> None:
    """Remove expired tokens from the blacklist to prevent unbounded growth."""
    now = datetime.utcnow()
    to_remove: list[str] = []
    with _blacklist_lock:
        for tok in _blacklisted_tokens:
            try:
                payload = jwt.decode(tok, settings.secret_key, algorithms=[settings.algorithm], options={"verify_exp": False})
                exp = payload.get("exp")
                if exp and datetime.utcfromtimestamp(exp) < now:
                    to_remove.append(tok)
            except JWTError:
                to_remove.append(tok)
        for tok in to_remove:
            _blacklisted_tokens.discard(tok)


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------

def create_access_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.access_token_expire_minutes))
    to_encode.update({"exp": expire, "type": "access", "jti": secrets.token_hex(16)})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


def create_refresh_token(data: dict, expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=settings.refresh_token_expire_minutes))
    to_encode.update({"exp": expire, "type": "refresh", "jti": secrets.token_hex(16)})
    return jwt.encode(to_encode, settings.secret_key, algorithm=settings.algorithm)


# ---------------------------------------------------------------------------
# Current-user dependency
# ---------------------------------------------------------------------------

async def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # Try to read token from the Authorization header first.
    token: str | None = None
    auth_header = request.headers.get("Authorization")
    if auth_header and isinstance(auth_header, str) and auth_header.lower().startswith("bearer "):
        token = auth_header.split(" ", 1)[1].strip()

    # Fallback to HttpOnly cookie if Authorization header is not present.
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        raise credentials_exception

    # Check blacklist
    if is_token_blacklisted(token):
        raise credentials_exception

    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        # Only accept access tokens (not refresh tokens) for API calls
        if payload.get("type") not in ("access", None):
            raise credentials_exception
        user_id: int | None = payload.get("sub")
        if user_id is None:
            raise credentials_exception
        token_data = TokenData(user_id=user_id)
    except JWTError:
        raise credentials_exception

    # Cached ORM instances become detached when their Session closes; never use them
    # without attaching to the current Session (otherwise DetachedInstanceError on lazy/expired attrs).
    cached = _get_cached_user(token_data.user_id)
    if cached is None:
        user = db.query(User).filter(User.id == token_data.user_id).first()
        if user is None:
            raise credentials_exception
        _set_cached_user(user)
    else:
        user = db.merge(cached)

    if not user.is_active:
        raise credentials_exception
    return user


# ---------------------------------------------------------------------------
# Role-based dependencies
# ---------------------------------------------------------------------------

async def get_current_admin(user: User = Depends(get_current_user)) -> User:
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if role not in ("admin", "superadmin", "tenant") and not role.startswith("ghost_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user


async def get_current_superadmin(user: User = Depends(get_current_user)) -> User:
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if role != "superadmin" and not role.startswith("ghost_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Superadmin role required",
        )
    return user


async def get_billing_admin(user: User = Depends(get_current_user)) -> User:
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if role != "superadmin" and role != "ghost_billing" and not role.startswith("ghost_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Billing admin privileges required",
        )
    return user


async def get_support_admin(user: User = Depends(get_current_user)) -> User:
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if role != "superadmin" and role != "ghost_support" and not role.startswith("ghost_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Support admin privileges required",
        )
    return user


async def get_tech_admin(user: User = Depends(get_current_user)) -> User:
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if role != "superadmin" and role != "ghost_tech" and not role.startswith("ghost_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Technical admin privileges required",
        )
    return user
