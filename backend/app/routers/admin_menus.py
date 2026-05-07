from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_admin, get_current_superadmin, get_tech_admin
from ..menu_defaults import upsert_default_menus as upsert_default_menus_service

router = APIRouter(
    prefix="/admin/menus",
    tags=["admin-menus"],
    dependencies=[Depends(get_current_admin)],
)


def upsert_default_menus(db: Session) -> List[models.Menu]:
    return upsert_default_menus_service(db)


@router.get("", response_model=List[schemas.MenuRead])
def list_menus(
    include_inactive: Optional[bool] = Query(
        False,
        description="If true, include inactive menus as well.",
    ),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    query = db.query(models.Menu)
    if not include_inactive:
        query = query.filter(models.Menu.is_active.is_(True))

    menus = query.order_by(models.Menu.module, models.Menu.sort_order, models.Menu.id).all()
    return menus


@router.post("", response_model=schemas.MenuRead, status_code=201)
def create_menu(
    payload: schemas.MenuCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    existing = db.query(models.Menu).filter(models.Menu.code == payload.code).first()
    if existing:
        raise HTTPException(status_code=400, detail="Menu code must be unique")

    parent = None
    if payload.parent_id is not None:
        parent = db.query(models.Menu).get(payload.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail="parent_id must reference an existing menu")

    menu = models.Menu(
        code=payload.code,
        label=payload.label,
        module=payload.module,
        parent_id=payload.parent_id,
        sort_order=payload.sort_order,
        is_active=payload.is_active,
    )
    db.add(menu)
    db.commit()
    db.refresh(menu)
    return menu


@router.put("/{menu_id}", response_model=schemas.MenuRead)
def update_menu(
    menu_id: int,
    payload: schemas.MenuUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    menu = db.query(models.Menu).get(menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    if payload.code is not None and payload.code != menu.code:
        existing = (
            db.query(models.Menu)
            .filter(models.Menu.code == payload.code, models.Menu.id != menu_id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Menu code must be unique")
        menu.code = payload.code

    if payload.label is not None:
        menu.label = payload.label
    if payload.module is not None:
        menu.module = payload.module

    if payload.parent_id is not None:
        if payload.parent_id == menu_id:
            raise HTTPException(status_code=400, detail="Menu cannot be its own parent")
        parent = db.query(models.Menu).get(payload.parent_id)
        if not parent:
            raise HTTPException(status_code=400, detail="parent_id must reference an existing menu")
        menu.parent_id = payload.parent_id

    if payload.sort_order is not None:
        menu.sort_order = payload.sort_order

    if payload.is_active is not None:
        menu.is_active = payload.is_active

    db.add(menu)
    db.commit()
    db.refresh(menu)
    return menu


@router.delete("/{menu_id}", status_code=204)
def delete_menu(
    menu_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    menu = db.query(models.Menu).get(menu_id)
    if not menu:
        raise HTTPException(status_code=404, detail="Menu not found")

    child_exists = (
        db.query(models.Menu)
        .filter(models.Menu.parent_id == menu_id, models.Menu.is_active.is_(True))
        .first()
    )
    if child_exists:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete menu while it has active child menus. Delete or reassign them first.",
        )

    menu.is_active = False
    db.add(menu)
    db.commit()
    return


@router.post("/seed", response_model=List[schemas.MenuRead])
def seed_default_menus(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_tech_admin),
):
    return upsert_default_menus_service(db)
