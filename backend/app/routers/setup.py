"""
Setup router — Sales Incentive Rules & Depreciation Rules
CRUD for per-company setup configuration.
"""
from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company

router = APIRouter(
    prefix="/companies/{company_id}/setup",
    tags=["setup"],
)


# ── Pydantic Schemas ──────────────────────────────────────────────────────────

class IncentiveRuleCreate(BaseModel):
    name: str
    basis_type: str = "amount"
    threshold_min: float = 0
    threshold_max: Optional[float] = None
    incentive_type: str = "percentage"
    incentive_value: float = 0
    sales_person_id: Optional[int] = None
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    item_id: Optional[int] = None
    ledger_id: Optional[int] = None
    is_active: bool = True


class IncentiveRuleRead(IncentiveRuleCreate):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DepreciationRuleCreate(BaseModel):
    name: str
    category: Optional[str] = None
    method: str = "straight_line"
    rate_type: str = "percentage"
    rate_value: float = 0
    useful_life_years: Optional[int] = None
    is_active: bool = True


class DepreciationRuleRead(DepreciationRuleCreate):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


# ── Incentive Rules ────────────────────────────────────────────────────────────

@router.get("/incentives", response_model=List[IncentiveRuleRead])
def list_incentives(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    return (
        db.query(models.IncentiveRule)
        .filter(models.IncentiveRule.company_id == company.id)
        .order_by(models.IncentiveRule.id.asc())
        .all()
    )


@router.post("/incentives", response_model=IncentiveRuleRead, status_code=201)
def create_incentive(
    company_id: int,
    payload: IncentiveRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    rule = models.IncentiveRule(company_id=company.id, **payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/incentives/{rule_id}", response_model=IncentiveRuleRead)
def update_incentive(
    company_id: int,
    rule_id: int,
    payload: IncentiveRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    rule = (
        db.query(models.IncentiveRule)
        .filter(models.IncentiveRule.id == rule_id, models.IncentiveRule.company_id == company.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Incentive rule not found")
    for k, v in payload.model_dump().items():
        setattr(rule, k, v)
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/incentives/{rule_id}", status_code=204)
def delete_incentive(
    company_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    rule = (
        db.query(models.IncentiveRule)
        .filter(models.IncentiveRule.id == rule_id, models.IncentiveRule.company_id == company.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Incentive rule not found")
    db.delete(rule)
    db.commit()


# ── Depreciation Rules ─────────────────────────────────────────────────────────

@router.get("/depreciation", response_model=List[DepreciationRuleRead])
def list_depreciation(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    return (
        db.query(models.DepreciationRule)
        .filter(models.DepreciationRule.company_id == company.id)
        .order_by(models.DepreciationRule.id.asc())
        .all()
    )


@router.post("/depreciation", response_model=DepreciationRuleRead, status_code=201)
def create_depreciation(
    company_id: int,
    payload: DepreciationRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    rule = models.DepreciationRule(company_id=company.id, **payload.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/depreciation/{rule_id}", response_model=DepreciationRuleRead)
def update_depreciation(
    company_id: int,
    rule_id: int,
    payload: DepreciationRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    rule = (
        db.query(models.DepreciationRule)
        .filter(models.DepreciationRule.id == rule_id, models.DepreciationRule.company_id == company.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Depreciation rule not found")
    for k, v in payload.model_dump().items():
        setattr(rule, k, v)
    rule.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/depreciation/{rule_id}", status_code=204)
def delete_depreciation(
    company_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    rule = (
        db.query(models.DepreciationRule)
        .filter(models.DepreciationRule.id == rule_id, models.DepreciationRule.company_id == company.id)
        .first()
    )
    if not rule:
        raise HTTPException(status_code=404, detail="Depreciation rule not found")
    db.delete(rule)
    db.commit()
