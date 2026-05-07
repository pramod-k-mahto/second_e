# backend/app/routers/admin_plans.py

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_user, get_current_admin, get_billing_admin
from ..menu_defaults import ensure_menu_template_assignable_to_tenant

router = APIRouter(
    prefix="/admin/plans",
    tags=["admin-plans"],
)


@router.get("", response_model=List[schemas.PlanRead])
def list_plans(
    q: Optional[str] = Query(None, description="Search by code or name"),
    is_active: Optional[bool] = Query(None),
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Plan)

    if q:
        like = f"%{q}%"
        query = query.filter(
            (models.Plan.code.ilike(like)) | (models.Plan.name.ilike(like))
        )

    if is_active is not None:
        query = query.filter(models.Plan.is_active == is_active)

    plans = query.order_by(models.Plan.created_at.desc()).offset(skip).limit(limit).all()
    return plans


@router.get("/{plan_id}", response_model=schemas.PlanRead)
def get_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    plan = db.query(models.Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    return plan


@router.post("", response_model=schemas.PlanRead, status_code=201)
def create_plan(
    plan_in: schemas.PlanCreate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_billing_admin),
):
    existing = (
        db.query(models.Plan)
        .filter(models.Plan.code == plan_in.code)
        .first()
    )
    if existing:
        raise HTTPException(status_code=400, detail="Plan code already exists")

    features_text = ",".join(plan_in.features) if plan_in.features else None

    if plan_in.menu_template_id is not None:
        tpl = db.query(models.MenuTemplate).get(int(plan_in.menu_template_id))
        ensure_menu_template_assignable_to_tenant(tpl)

    plan = models.Plan(
        code=plan_in.code,
        name=plan_in.name,
        price_monthly=plan_in.price_monthly,
        price_yearly=plan_in.price_yearly,
        max_companies=plan_in.max_companies,
        max_users=plan_in.max_users,
        menu_template_id=plan_in.menu_template_id,
        features=features_text,
        is_active=plan_in.is_active,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=schemas.PlanRead)
def update_plan(
    plan_id: int,
    plan_in: schemas.PlanUpdate,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_billing_admin),
):
    plan = db.query(models.Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")

    if plan_in.code is not None:
        existing = (
            db.query(models.Plan)
            .filter(models.Plan.code == plan_in.code, models.Plan.id != plan.id)
            .first()
        )
        if existing:
            raise HTTPException(status_code=400, detail="Plan code already exists")
        plan.code = plan_in.code

    if plan_in.name is not None:
        plan.name = plan_in.name
    if plan_in.price_monthly is not None:
        plan.price_monthly = plan_in.price_monthly
    if plan_in.price_yearly is not None:
        plan.price_yearly = plan_in.price_yearly
    if plan_in.max_companies is not None:
        plan.max_companies = plan_in.max_companies
    if plan_in.max_users is not None:
        plan.max_users = plan_in.max_users
    if plan_in.features is not None:
        plan.features = ",".join(plan_in.features) if plan_in.features else None
    if plan_in.menu_template_id is not None:
        tpl = db.query(models.MenuTemplate).get(int(plan_in.menu_template_id))
        ensure_menu_template_assignable_to_tenant(tpl)
        plan.menu_template_id = plan_in.menu_template_id
    if plan_in.is_active is not None:
        plan.is_active = plan_in.is_active

    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
def delete_plan(
    plan_id: int,
    db: Session = Depends(get_db),
    admin: models.User = Depends(get_billing_admin),
):
    plan = db.query(models.Plan).get(plan_id)
    if not plan:
        raise HTTPException(status_code=404, detail="Plan not found")
    db.delete(plan)
    db.commit()
    return
