from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["sales_persons"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


@router.post("/sales-persons", response_model=schemas.SalesPersonRead)
def create_sales_person(
    company_id: int,
    sp_in: schemas.SalesPersonCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)

    existing = (
        db.query(models.SalesPerson)
        .filter(
            models.SalesPerson.company_id == company_id,
            models.SalesPerson.name == sp_in.name,
        )
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Sales person name already exists")

    sp = models.SalesPerson(
        company_id=company_id,
        tenant_id=company.tenant_id,
        name=sp_in.name,
        phone=sp_in.phone,
        email=sp_in.email,
        commission_rate=sp_in.commission_rate,
        notes=sp_in.notes,
        is_active=sp_in.is_active,
    )
    db.add(sp)
    db.commit()
    db.refresh(sp)
    return sp


@router.get("/sales-persons", response_model=list[schemas.SalesPersonRead])
def list_sales_persons(
    company_id: int,
    is_active: bool | None = None,
    search: str | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    query = db.query(models.SalesPerson).filter(models.SalesPerson.company_id == company_id)
    if is_active is not None:
        query = query.filter(models.SalesPerson.is_active == is_active)
    if search:
        like = f"%{search}%"
        query = query.filter(
            models.SalesPerson.name.ilike(like)
            | models.SalesPerson.phone.ilike(like)
            | models.SalesPerson.email.ilike(like)
        )
    return query.order_by(models.SalesPerson.name).all()


@router.get("/sales-persons/{sales_person_id}", response_model=schemas.SalesPersonRead)
def get_sales_person(
    company_id: int,
    sales_person_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    sp = (
        db.query(models.SalesPerson)
        .filter(
            models.SalesPerson.id == sales_person_id,
            models.SalesPerson.company_id == company_id,
        )
        .first()
    )
    if not sp:
        raise HTTPException(status_code=404, detail="Sales person not found")
    return sp


@router.put("/sales-persons/{sales_person_id}", response_model=schemas.SalesPersonRead)
def update_sales_person(
    company_id: int,
    sales_person_id: int,
    sp_in: schemas.SalesPersonUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    sp = (
        db.query(models.SalesPerson)
        .filter(
            models.SalesPerson.id == sales_person_id,
            models.SalesPerson.company_id == company_id,
        )
        .first()
    )
    if not sp:
        raise HTTPException(status_code=404, detail="Sales person not found")

    data = sp_in.dict(exclude_unset=True)

    new_name = data.get("name")
    if new_name and new_name != sp.name:
        existing = (
            db.query(models.SalesPerson)
            .filter(
                models.SalesPerson.company_id == company_id,
                models.SalesPerson.name == new_name,
                models.SalesPerson.id != sp.id,
            )
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Sales person name already exists")

    for field, value in data.items():
        setattr(sp, field, value)

    db.commit()
    db.refresh(sp)
    return sp


@router.delete("/sales-persons/{sales_person_id}")
def delete_sales_person(
    company_id: int,
    sales_person_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    sp = (
        db.query(models.SalesPerson)
        .filter(
            models.SalesPerson.id == sales_person_id,
            models.SalesPerson.company_id == company_id,
        )
        .first()
    )
    if not sp:
        raise HTTPException(status_code=404, detail="Sales person not found")

    sp.is_active = False
    db.commit()
    return {"detail": "Deactivated"}
