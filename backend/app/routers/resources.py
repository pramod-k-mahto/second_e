from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/companies/{companyId}/resources", tags=["resources"])

@router.post("/groups", response_model=schemas.ResourceGroupRead)
def create_resource_group(
    companyId: int,
    group: schemas.ResourceGroupCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_group = models.ResourceGroup(**group.model_dump(), company_id=companyId)
    db.add(db_group)
    db.commit()
    db.refresh(db_group)
    return db_group

@router.get("/groups", response_model=List[schemas.ResourceGroupRead])
def list_resource_groups(
    companyId: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return db.query(models.ResourceGroup).filter(
        models.ResourceGroup.company_id == companyId
    ).all()

@router.post("/", response_model=schemas.ResourceRead)
def create_resource(
    companyId: int,
    resource: schemas.ResourceCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify group belongs to company
    group = db.query(models.ResourceGroup).filter(
        models.ResourceGroup.id == resource.group_id,
        models.ResourceGroup.company_id == companyId
    ).first()
    if not group:
        raise HTTPException(status_code=404, detail="Resource group not found")

    db_resource = models.Resource(**resource.model_dump(), company_id=companyId)
    db.add(db_resource)
    db.commit()
    db.refresh(db_resource)
    return db_resource

@router.delete("/{resourceId}", status_code=status.HTTP_204_NO_CONTENT)
def delete_resource(
    companyId: int,
    resourceId: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db_resource = db.query(models.Resource).filter(
        models.Resource.id == resourceId,
        models.Resource.company_id == companyId
    ).first()
    if not db_resource:
        raise HTTPException(status_code=404, detail="Resource not found")
    
    db.delete(db_resource)
    db.commit()
    return None
