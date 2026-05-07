from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["payment_modes"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


@router.post("/payment-modes", response_model=schemas.PaymentModeRead)
def create_payment_mode(
    company_id: int,
    pm_in: schemas.PaymentModeCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    # Ensure ledger belongs to this company
    ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.id == pm_in.ledger_id,
            models.Ledger.company_id == company_id,
        )
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=400, detail="Ledger not found for this company")

    # Ensure ledger group belongs to this company if provided
    if pm_in.ledger_group_id:
        group = (
            db.query(models.LedgerGroup)
            .filter(
                models.LedgerGroup.id == pm_in.ledger_group_id,
                models.LedgerGroup.company_id == company_id,
            )
            .first()
        )
        if not group:
            raise HTTPException(status_code=400, detail="Ledger Group not found for this company")

    # Enforce unique (company_id, name)
    existing = (
        db.query(models.PaymentMode)
        .filter(
            models.PaymentMode.company_id == company_id,
            models.PaymentMode.name == pm_in.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Payment mode name already exists")

    pm = models.PaymentMode(
        company_id=company_id,
        tenant_id=company.tenant_id,
        name=pm_in.name,
        ledger_id=pm_in.ledger_id,
        ledger_group_id=pm_in.ledger_group_id,
        is_active=pm_in.is_active,
    )
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return pm


@router.get("/payment-modes", response_model=list[schemas.PaymentModeRead])
def list_payment_modes(
    company_id: int,
    is_active: bool | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    query = db.query(models.PaymentMode).filter(models.PaymentMode.company_id == company_id)
    if is_active is not None:
        query = query.filter(models.PaymentMode.is_active == is_active)
    if search:
        like = f"%{search}%"
        query = query.filter(models.PaymentMode.name.ilike(like))
    return query.order_by(models.PaymentMode.name).all()


@router.get("/payment-modes/{payment_mode_id}", response_model=schemas.PaymentModeRead)
def get_payment_mode(
    company_id: int,
    payment_mode_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    pm = (
        db.query(models.PaymentMode)
        .filter(
            models.PaymentMode.id == payment_mode_id,
            models.PaymentMode.company_id == company_id,
        )
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment mode not found")
    return pm


@router.put("/payment-modes/{payment_mode_id}", response_model=schemas.PaymentModeRead)
def update_payment_mode(
    company_id: int,
    payment_mode_id: int,
    pm_in: schemas.PaymentModeUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    pm = (
        db.query(models.PaymentMode)
        .filter(
            models.PaymentMode.id == payment_mode_id,
            models.PaymentMode.company_id == company_id,
        )
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment mode not found")

    data = pm_in.dict(exclude_unset=True)

    # If name is changing, enforce uniqueness
    new_name = data.get("name")
    if new_name and new_name != pm.name:
        existing = (
            db.query(models.PaymentMode)
            .filter(
                models.PaymentMode.company_id == company_id,
                models.PaymentMode.name == new_name,
                models.PaymentMode.id != pm.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Payment mode name already exists")

    # If ledger is changing, ensure it belongs to this company
    new_ledger_id = data.get("ledger_id")
    if new_ledger_id is not None:
        ledger = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.id == new_ledger_id,
                models.Ledger.company_id == company_id,
            )
            .first()
        )
        if not ledger:
            raise HTTPException(status_code=400, detail="Ledger not found for this company")

    # If ledger group is changing, ensure it belongs to this company
    new_group_id = data.get("ledger_group_id")
    if new_group_id is not None:
        group = (
            db.query(models.LedgerGroup)
            .filter(
                models.LedgerGroup.id == new_group_id,
                models.LedgerGroup.company_id == company_id,
            )
            .first()
        )
        if not group:
            raise HTTPException(status_code=400, detail="Ledger Group not found for this company")

    for field, value in data.items():
        setattr(pm, field, value)

    db.commit()
    db.refresh(pm)
    return pm


@router.delete("/payment-modes/{payment_mode_id}")
def delete_payment_mode(
    company_id: int,
    payment_mode_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    pm = (
        db.query(models.PaymentMode)
        .filter(
            models.PaymentMode.id == payment_mode_id,
            models.PaymentMode.company_id == company_id,
        )
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment mode not found")

    # Soft delete: mark inactive instead of physical delete
    pm.is_active = False
    db.commit()
    return {"detail": "Deactivated"}
