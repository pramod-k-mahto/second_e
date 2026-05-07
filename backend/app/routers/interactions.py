from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import select, join
from typing import List, Optional

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas

router = APIRouter(prefix="/companies/{companyId}/interactions", tags=["interactions"])

@router.post("/", response_model=schemas.CustomerInteractionRead)
def log_interaction(
    companyId: int,
    interaction: schemas.CustomerInteractionCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Verify customer and employee belong to company
    customer = db.query(models.Customer).filter(
        models.Customer.id == interaction.customer_id,
        models.Customer.company_id == companyId
    ).first()
    if not customer:
        raise HTTPException(status_code=404, detail="Customer not found")

    employee = db.query(models.Employee).filter(
        models.Employee.id == interaction.employee_id,
        models.Employee.company_id == companyId
    ).first()
    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")

    if interaction.task_id:
        task = db.query(models.Task).filter(
            models.Task.id == interaction.task_id,
            models.Task.company_id == companyId
        ).first()
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")

    db_interaction = models.CustomerInteraction(
        **interaction.model_dump(),
        company_id=companyId
    )
    db.add(db_interaction)
    db.commit()
    db_interaction = db.query(models.CustomerInteraction).filter(
        models.CustomerInteraction.id == db_interaction.id
    ).first()

    # Pre-populate names for response
    read_obj = schemas.CustomerInteractionRead.model_validate(db_interaction)
    read_obj.customer_name = customer.name
    read_obj.employee_name = employee.full_name
    return read_obj

@router.get("/", response_model=List[schemas.CustomerInteractionRead])
def list_interactions(
    companyId: int,
    customer_id: Optional[int] = None,
    employee_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    query = db.query(
        models.CustomerInteraction,
        models.Customer.name.label("customer_name"),
        models.Employee.full_name.label("employee_name")
    ).join(
        models.Customer, models.Customer.id == models.CustomerInteraction.customer_id
    ).join(
        models.Employee, models.Employee.id == models.CustomerInteraction.employee_id
    ).filter(models.CustomerInteraction.company_id == companyId)

    if customer_id:
        query = query.filter(models.CustomerInteraction.customer_id == customer_id)
    if employee_id:
        query = query.filter(models.CustomerInteraction.employee_id == employee_id)

    results = []
    for interaction, customer_name, employee_name in query.order_by(models.CustomerInteraction.interaction_date.desc()).all():
        read_obj = schemas.CustomerInteractionRead.model_validate(interaction)
        read_obj.customer_name = customer_name
        read_obj.employee_name = employee_name
        results.append(read_obj)
    
    return results
