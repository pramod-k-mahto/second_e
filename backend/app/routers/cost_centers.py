from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["cost_centers"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


# -------- Departments --------


@router.get("/departments", response_model=list[schemas.DepartmentRead])
def list_departments(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = (
        db.query(models.Department)
        .filter(models.Department.company_id == company_id)
        .order_by(models.Department.name)
        .all()
    )
    return rows


@router.post("/departments", response_model=schemas.DepartmentRead)
def create_department(
    company_id: int,
    dept_in: schemas.DepartmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    dept = models.Department(
        company_id=company_id,
        name=dept_in.name,
        code=dept_in.code,
        is_active=dept_in.is_active,
    )
    db.add(dept)
    db.commit()
    db.refresh(dept)
    return dept


@router.get("/departments/{department_id}", response_model=schemas.DepartmentRead)
def get_department(
    company_id: int,
    department_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    dept = (
        db.query(models.Department)
        .filter(
            models.Department.id == department_id,
            models.Department.company_id == company_id,
        )
        .first()
    )
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


@router.put("/departments/{department_id}", response_model=schemas.DepartmentRead)
def update_department(
    company_id: int,
    department_id: int,
    dept_in: schemas.DepartmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    dept = (
        db.query(models.Department)
        .filter(
            models.Department.id == department_id,
            models.Department.company_id == company_id,
        )
        .first()
    )
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    for field, value in dept_in.model_dump(exclude_unset=True).items():
        setattr(dept, field, value)

    db.commit()
    db.refresh(dept)
    return dept


@router.delete("/departments/{department_id}")
def delete_department(
    company_id: int,
    department_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    dept = (
        db.query(models.Department)
        .filter(
            models.Department.id == department_id,
            models.Department.company_id == company_id,
        )
        .first()
    )
    if not dept:
        raise HTTPException(status_code=404, detail="Department not found")

    db.delete(dept)
    db.commit()
    return {"detail": "Deleted"}


# -------- Projects --------


@router.get("/projects", response_model=list[schemas.ProjectRead])
def list_projects(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = (
        db.query(models.Project)
        .filter(models.Project.company_id == company_id)
        .order_by(models.Project.name)
        .all()
    )
    return rows


@router.post("/projects", response_model=schemas.ProjectRead)
def create_project(
    company_id: int,
    proj_in: schemas.ProjectCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    proj = models.Project(
        company_id=company_id,
        name=proj_in.name,
        code=proj_in.code,
        is_active=proj_in.is_active,
    )
    db.add(proj)
    db.commit()
    db.refresh(proj)
    return proj


@router.get("/projects/{project_id}", response_model=schemas.ProjectRead)
def get_project(
    company_id: int,
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    proj = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id,
            models.Project.company_id == company_id,
        )
        .first()
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")
    return proj


@router.put("/projects/{project_id}", response_model=schemas.ProjectRead)
def update_project(
    company_id: int,
    project_id: int,
    proj_in: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    proj = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id,
            models.Project.company_id == company_id,
        )
        .first()
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    for field, value in proj_in.model_dump(exclude_unset=True).items():
        setattr(proj, field, value)

    db.commit()
    db.refresh(proj)
    return proj


@router.delete("/projects/{project_id}")
def delete_project(
    company_id: int,
    project_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    proj = (
        db.query(models.Project)
        .filter(
            models.Project.id == project_id,
            models.Project.company_id == company_id,
        )
        .first()
    )
    if not proj:
        raise HTTPException(status_code=404, detail="Project not found")

    db.delete(proj)
    db.commit()
    return {"detail": "Deleted"}


# -------- Segments --------


@router.get("/segments", response_model=list[schemas.SegmentRead])
def list_segments(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rows = (
        db.query(models.Segment)
        .filter(models.Segment.company_id == company_id)
        .order_by(models.Segment.name)
        .all()
    )
    return rows


@router.post("/segments", response_model=schemas.SegmentRead)
def create_segment(
    company_id: int,
    seg_in: schemas.SegmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    seg = models.Segment(
        company_id=company_id,
        name=seg_in.name,
        code=seg_in.code,
        is_active=seg_in.is_active,
    )
    db.add(seg)
    db.commit()
    db.refresh(seg)
    return seg


@router.get("/segments/{segment_id}", response_model=schemas.SegmentRead)
def get_segment(
    company_id: int,
    segment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    seg = (
        db.query(models.Segment)
        .filter(
            models.Segment.id == segment_id,
            models.Segment.company_id == company_id,
        )
        .first()
    )
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")
    return seg


@router.put("/segments/{segment_id}", response_model=schemas.SegmentRead)
def update_segment(
    company_id: int,
    segment_id: int,
    seg_in: schemas.SegmentUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    seg = (
        db.query(models.Segment)
        .filter(
            models.Segment.id == segment_id,
            models.Segment.company_id == company_id,
        )
        .first()
    )
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    for field, value in seg_in.model_dump(exclude_unset=True).items():
        setattr(seg, field, value)

    db.commit()
    db.refresh(seg)
    return seg


@router.delete("/segments/{segment_id}")
def delete_segment(
    company_id: int,
    segment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    seg = (
        db.query(models.Segment)
        .filter(
            models.Segment.id == segment_id,
            models.Segment.company_id == company_id,
        )
        .first()
    )
    if not seg:
        raise HTTPException(status_code=404, detail="Segment not found")

    db.delete(seg)
    db.commit()
    return {"detail": "Deleted"}
