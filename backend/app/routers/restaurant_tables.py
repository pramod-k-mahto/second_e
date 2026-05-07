from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}/restaurant-tables", tags=["restaurant_tables"])


@router.get("", response_model=list[schemas.RestaurantTableRead])
def list_restaurant_tables(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    rows = (
        db.query(models.RestaurantTable)
        .filter(models.RestaurantTable.company_id == company_id)
        .order_by(models.RestaurantTable.name)
        .all()
    )
    return rows


@router.post("", response_model=schemas.RestaurantTableRead)
def create_restaurant_table(
    company_id: int,
    table_in: schemas.RestaurantTableCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    table = models.RestaurantTable(
        company_id=company_id,
        name=table_in.name,
        code=table_in.code,
        is_active=table_in.is_active,
    )
    db.add(table)
    db.commit()
    db.refresh(table)
    return table


@router.get("/{table_id}", response_model=schemas.RestaurantTableRead)
def get_restaurant_table(
    company_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    table = (
        db.query(models.RestaurantTable)
        .filter(
            models.RestaurantTable.id == table_id,
            models.RestaurantTable.company_id == company_id,
        )
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return table


@router.put("/{table_id}", response_model=schemas.RestaurantTableRead)
def update_restaurant_table(
    company_id: int,
    table_id: int,
    table_in: schemas.RestaurantTableUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    table = (
        db.query(models.RestaurantTable)
        .filter(
            models.RestaurantTable.id == table_id,
            models.RestaurantTable.company_id == company_id,
        )
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    for field, value in table_in.model_dump(exclude_unset=True).items():
        setattr(table, field, value)

    db.commit()
    db.refresh(table)
    return table


@router.delete("/{table_id}")
def delete_restaurant_table(
    company_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    table = (
        db.query(models.RestaurantTable)
        .filter(
            models.RestaurantTable.id == table_id,
            models.RestaurantTable.company_id == company_id,
        )
        .first()
    )
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    db.delete(table)
    db.commit()
    return {"detail": "Deleted"}
