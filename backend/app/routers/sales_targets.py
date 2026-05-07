from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure

router = APIRouter(prefix="/companies/{company_id}/sales-targets", tags=["sales-targets"])

@router.get("/", response_model=list[schemas.SalesTargetRead])
def list_sales_targets(
    company_id: int,
    fiscal_year: str,
    department_id: int | None = None,
    project_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    
    query = db.query(models.SalesTarget).filter(
        models.SalesTarget.company_id == company_id,
        models.SalesTarget.fiscal_year == fiscal_year
    )
    if department_id is not None:
        query = query.filter(models.SalesTarget.department_id == department_id)
    if project_id is not None:
        query = query.filter(models.SalesTarget.project_id == project_id)
        
    targets = query.all()
    
    # Enrich with names
    results = []
    for t in targets:
        # Use from_orm/model_validate
        tr = schemas.SalesTargetRead.model_validate(t)
        tr.ledger_name = t.ledger.name if t.ledger else None
        tr.department_name = t.department.name if t.department else None
        tr.project_name = t.project.name if t.project else None
        results.append(tr)
    return results

@router.post("/batch")
def update_batch_sales_targets(
    company_id: int,
    payload: list[schemas.SalesTargetCreate],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    
    for item in payload:
        # Check if already exists for this unique combination
        existing = db.query(models.SalesTarget).filter(
            models.SalesTarget.company_id == company_id,
            models.SalesTarget.fiscal_year == item.fiscal_year,
            models.SalesTarget.ledger_id == item.ledger_id,
            models.SalesTarget.department_id == item.department_id,
            models.SalesTarget.project_id == item.project_id
        ).first()
        
        if existing:
            # Update
            for field, value in item.model_dump(exclude_unset=True).items():
                setattr(existing, field, value)
        else:
            # Create
            target = models.SalesTarget(company_id=company_id, **item.model_dump())
            db.add(target)
            
    db.commit()
    return {"detail": "Targets updated successfully"}

@router.delete("/{target_id}")
def delete_sales_target(
    company_id: int,
    target_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    get_company_secure(db, company_id, current_user)
    
    target = db.query(models.SalesTarget).filter(
        models.SalesTarget.id == target_id,
        models.SalesTarget.company_id == company_id
    ).first()
    
    if not target:
        raise HTTPException(status_code=404, detail="Target not found")
        
    db.delete(target)
    db.commit()
    return {"detail": "Target deleted"}
