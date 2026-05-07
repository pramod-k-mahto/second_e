from __future__ import annotations
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from typing import List, Optional

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/companies/{companyId}/rewards", tags=["rewards"])


@router.post("/", response_model=schemas.RewardRead)
def grant_reward(
    companyId: int,
    reward: schemas.RewardCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Check if employee belongs to company
    employee = db.query(models.Employee).filter(
        models.Employee.id == reward.employee_id,
        models.Employee.company_id == companyId
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found in this company")

    db_reward = models.Reward(
        **reward.model_dump(),
        company_id=companyId
    )
    db.add(db_reward)
    db.commit()
    db.refresh(db_reward)
    return db_reward


@router.get("/", response_model=List[schemas.RewardRead])
def list_rewards(
    companyId: int,
    employee_id: Optional[int] = None,
    reward_type: Optional[models.RewardType] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(models.Reward).filter(models.Reward.company_id == companyId)
    if employee_id:
        query = query.filter(models.Reward.employee_id == employee_id)
    if reward_type:
        query = query.filter(models.Reward.reward_type == reward_type)
    
    return query.order_by(models.Reward.given_at.desc()).all()


@router.delete("/{rewardId}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_reward(
    companyId: int,
    rewardId: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_reward = db.query(models.Reward).filter(
        models.Reward.id == rewardId,
        models.Reward.company_id == companyId
    ).first()
    if not db_reward:
        raise HTTPException(status_code=404, detail="Reward not found")
    
    db.delete(db_reward)
    db.commit()
    return None
