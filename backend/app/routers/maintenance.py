from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import delete

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company

router = APIRouter(prefix="/companies/{company_id}/maintenance", tags=["Maintenance"])

@router.post("/reset", status_code=status.HTTP_200_OK)
def reset_company_data(
    company_id: int,
    payload: schemas.CompanyResetRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    """
    Clears all transactional data for the specified company.
    Master data (Ledgers, Items, Warehouses, etc.) is preserved.
    """
    if not payload.confirm:
        raise HTTPException(status_code=400, detail="Confirmation required")

    # Only a superadmin (system admin) can reset data
    if current_user.role != models.UserRole.superadmin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only superadmins can reset company data"
        )

    try:
        from ..maintenance_service import reset_company_transactions_impl
        reset_company_transactions_impl(db, company_id)
        db.commit()
        return {"detail": "Company transactional data has been reset successfully."}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to reset company data: {str(e)}")
