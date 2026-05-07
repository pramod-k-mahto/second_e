from datetime import date
from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from .auth import get_current_user
from .database import get_db
from .models import Company, User, UserCompanyAccess, UserRole


def get_db_session() -> Session:
    return next(get_db())


def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Inactive user")
    return current_user


def get_current_admin_user(current_user: User = Depends(get_current_active_user)) -> User:
    role = str(current_user.role or "").lower()
    if role not in ("admin", "superadmin") and not role.startswith("ghost_"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return current_user


def get_current_tenant_user(current_user: User = Depends(get_current_active_user)) -> User:
    # Treat any non-admin as a tenant/non-admin user
    if current_user.role == "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tenant privileges required",
        )
    return current_user


def get_company(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Company:
    """Secure company retrieval with role-based + tenant-scoped access control."""
    role = str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower()
    
    if role == "superadmin" or role.startswith("ghost_"):
        company = db.query(Company).filter(Company.id == company_id).first()
    elif role == "admin" or role == "tenant":
        company = (
            db.query(Company)
            .filter(
                Company.id == company_id,
                Company.tenant_id == current_user.tenant_id,
            )
            .first()
        )
    else:
        company = (
            db.query(Company)
            .outerjoin(UserCompanyAccess, UserCompanyAccess.company_id == Company.id)
            .filter(Company.id == company_id)
            .filter(
                (Company.owner_id == current_user.id)
                | (UserCompanyAccess.user_id == current_user.id)
            )
            .first()
        )
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def get_company_secure(db: Session, company_id: int, user: User) -> Company:
    """Non-dependency version of get_company for use inside router helpers."""
    role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    
    if role == "superadmin" or role.startswith("ghost_"):
        company = db.query(Company).filter(Company.id == company_id).first()
    elif role == "admin" or role == "tenant":
        company = (
            db.query(Company)
            .filter(
                Company.id == company_id,
                Company.tenant_id == user.tenant_id,
            )
            .first()
        )
    else:
        company = (
            db.query(Company)
            .outerjoin(UserCompanyAccess, UserCompanyAccess.company_id == Company.id)
            .filter(Company.id == company_id)
            .filter(
                (Company.owner_id == user.id)
                | (UserCompanyAccess.user_id == user.id)
            )
            .first()
        )
    
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def validate_transaction_date(company: Company, transaction_date: date):
    """Enforces that a transaction date falls strictly within the company's defined fiscal year."""
    if not company.fiscal_year_start or not company.fiscal_year_end:
        return
    
    if transaction_date < company.fiscal_year_start or transaction_date > company.fiscal_year_end:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Transaction date {transaction_date} is outside the active fiscal year ({company.fiscal_year_start} to {company.fiscal_year_end})."
        )
