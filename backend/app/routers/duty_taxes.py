from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

from .. import models
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["duty_taxes"])


class DutyTaxCreate(BaseModel):
    name: str
    rate: float
    purchase_rate: Optional[float] = None
    income_rate: Optional[float] = None
    tds_type: Optional[str] = None
    ledger_id: Optional[int] = None
    is_active: bool = True


class DutyTaxUpdate(BaseModel):
    name: Optional[str] = None
    rate: Optional[float] = None
    purchase_rate: Optional[float] = None
    income_rate: Optional[float] = None
    tds_type: Optional[str] = None
    ledger_id: Optional[int] = None
    is_active: Optional[bool] = None


class DutyTaxRead(BaseModel):
    id: int
    company_id: int
    name: str
    rate: float
    purchase_rate: Optional[float] = None
    income_rate: Optional[float] = None
    tds_type: Optional[str] = None
    ledger_id: Optional[int] = None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class TdsCategoryCreate(BaseModel):
    name: str
    is_active: bool = True

class TdsCategoryUpdate(BaseModel):
    name: Optional[str] = None
    is_active: Optional[bool] = None

class TdsCategoryRead(BaseModel):
    id: int
    company_id: int
    name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/tds-categories", response_model=list[TdsCategoryRead])
def list_tds_categories(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    return db.query(models.TdsCategory).filter(models.TdsCategory.company_id == company_id).order_by(models.TdsCategory.name).all()

@router.post("/tds-categories", response_model=TdsCategoryRead)
def create_tds_category(
    company_id: int,
    cat_in: TdsCategoryCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    existing = db.query(models.TdsCategory).filter(models.TdsCategory.company_id == company_id, models.TdsCategory.name == cat_in.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Category already exists")
    obj = models.TdsCategory(company_id=company_id, name=cat_in.name, is_active=cat_in.is_active)
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj

@router.put("/tds-categories/{category_id}", response_model=TdsCategoryRead)
def update_tds_category(
    company_id: int,
    category_id: int,
    cat_in: TdsCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    obj = db.query(models.TdsCategory).filter(models.TdsCategory.id == category_id, models.TdsCategory.company_id == company_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Category not found")
    
    if cat_in.name and cat_in.name != obj.name:
        existing = db.query(models.TdsCategory).filter(models.TdsCategory.company_id == company_id, models.TdsCategory.name == cat_in.name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Category already exists")
        
        # Optionally, update all DutyTaxes that use this old category name
        old_name = obj.name
        new_name = cat_in.name
        db.query(models.DutyTax).filter(models.DutyTax.company_id == company_id, models.DutyTax.tds_type == old_name).update({"tds_type": new_name})
        obj.name = new_name

    if cat_in.is_active is not None:
        obj.is_active = cat_in.is_active

    db.commit()
    db.refresh(obj)
    return obj

@router.delete("/tds-categories/{category_id}")
def delete_tds_category(
    company_id: int,
    category_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    obj = db.query(models.TdsCategory).filter(models.TdsCategory.id == category_id, models.TdsCategory.company_id == company_id).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Don't delete if it's currently used in active DutyTaxes
    in_use = db.query(models.DutyTax).filter(models.DutyTax.company_id == company_id, models.DutyTax.tds_type == obj.name).first()
    if in_use:
        raise HTTPException(status_code=400, detail="Category is in use by a Duty Tax and cannot be deleted")

    db.delete(obj)
    db.commit()
    return {"detail": "Deleted"}

@router.get("/duty-taxes", response_model=list[DutyTaxRead])
def list_duty_taxes(
    company_id: int,
    is_active: Optional[bool] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    query = db.query(models.DutyTax).filter(models.DutyTax.company_id == company_id)
    if is_active is not None:
        query = query.filter(models.DutyTax.is_active == is_active)
    return query.order_by(models.DutyTax.name).all()


@router.post("/duty-taxes", response_model=DutyTaxRead)
def create_duty_tax(
    company_id: int,
    dt_in: DutyTaxCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)

    existing = (
        db.query(models.DutyTax)
        .filter(models.DutyTax.company_id == company_id, models.DutyTax.name == dt_in.name)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="A tax with this name already exists")

    if dt_in.ledger_id:
        ledger = db.query(models.Ledger).filter(
            models.Ledger.id == dt_in.ledger_id,
            models.Ledger.company_id == company_id,
        ).first()
        if not ledger:
            raise HTTPException(status_code=400, detail="Ledger not found for this company")

    obj = models.DutyTax(
        company_id=company_id,
        name=dt_in.name,
        rate=dt_in.rate,
        purchase_rate=dt_in.purchase_rate,
        income_rate=dt_in.income_rate,
        tds_type=dt_in.tds_type,
        ledger_id=dt_in.ledger_id,
        is_active=dt_in.is_active,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return obj


@router.get("/duty-taxes/{duty_tax_id}", response_model=DutyTaxRead)
def get_duty_tax(
    company_id: int,
    duty_tax_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    obj = db.query(models.DutyTax).filter(
        models.DutyTax.id == duty_tax_id,
        models.DutyTax.company_id == company_id,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Duty tax not found")
    return obj


@router.put("/duty-taxes/{duty_tax_id}", response_model=DutyTaxRead)
def update_duty_tax(
    company_id: int,
    duty_tax_id: int,
    dt_in: DutyTaxUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    obj = db.query(models.DutyTax).filter(
        models.DutyTax.id == duty_tax_id,
        models.DutyTax.company_id == company_id,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Duty tax not found")

    data = dt_in.dict(exclude_unset=True)

    if "name" in data and data["name"] != obj.name:
        existing = db.query(models.DutyTax).filter(
            models.DutyTax.company_id == company_id,
            models.DutyTax.name == data["name"],
            models.DutyTax.id != obj.id,
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="A tax with this name already exists")

    if "ledger_id" in data and data["ledger_id"]:
        ledger = db.query(models.Ledger).filter(
            models.Ledger.id == data["ledger_id"],
            models.Ledger.company_id == company_id,
        ).first()
        if not ledger:
            raise HTTPException(status_code=400, detail="Ledger not found for this company")

    for field, value in data.items():
        setattr(obj, field, value)

    db.commit()
    db.refresh(obj)
    return obj


@router.delete("/duty-taxes/{duty_tax_id}")
def delete_duty_tax(
    company_id: int,
    duty_tax_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    obj = db.query(models.DutyTax).filter(
        models.DutyTax.id == duty_tax_id,
        models.DutyTax.company_id == company_id,
    ).first()
    if not obj:
        raise HTTPException(status_code=404, detail="Duty tax not found")

    obj.is_active = False
    db.commit()
    return {"detail": "Deactivated"}
