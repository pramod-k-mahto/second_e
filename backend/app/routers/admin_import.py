from __future__ import annotations

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from .. import models
from ..auth import get_current_admin
from ..database import get_db
from ..import_schemas import (
    ImportColumnsResponse,
    ImportCommitResponse,
    ImportFileRead,
    ImportJobCreate,
    ImportJobErrorsResponse,
    ImportJobErrorsRow,
    ImportJobRead,
    ImportJobStatusResponse,
    ImportMappingRead,
    ImportMappingUpsertRequest,
    ImportValidateResponse,
)
from ..import_service import ImportEngine


router = APIRouter(
    prefix="/admin/import",
    tags=["admin-import"],
    dependencies=[Depends(get_current_admin)],
)


@router.post("/jobs", response_model=ImportJobRead)
def create_import_job(
    payload: ImportJobCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.create_job(
        tenant_id=int(payload.tenant_id),
        company_id=int(payload.company_id),
        source_type=str(payload.source_type),
        data_type=str(payload.data_type),
        created_by=int(current_user.id) if current_user is not None else None,
        current_user=current_user,
    )
    return job


@router.post("/jobs/{job_id}/upload", response_model=list[ImportFileRead])
def upload_import_file(
    job_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)

    file_rec = svc.store_upload(job=job, upload=file)
    table = svc.parse_file_to_table(file_rec=file_rec)
    svc.stage_rows(job=job, table=table)

    db.refresh(job)

    files = (
        db.query(models.ImportFile)
        .filter(models.ImportFile.import_job_id == int(job.id))
        .order_by(models.ImportFile.uploaded_at.desc())
        .all()
    )
    return files


@router.get("/jobs/{job_id}/columns", response_model=ImportColumnsResponse)
def detected_columns(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)
    cols = svc.detect_columns(job=job)
    return ImportColumnsResponse(columns=cols)


@router.post("/jobs/{job_id}/mapping", response_model=ImportMappingRead)
def save_mapping(
    job_id: int,
    payload: ImportMappingUpsertRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)

    mapping_name = (payload.mapping_name or "default").strip() or "default"

    mapping = svc.upsert_mapping(
        tenant_id=int(job.tenant_id),
        company_id=int(job.company_id),
        source_type=str(job.source_type),
        data_type=str(job.data_type),
        mapping_name=mapping_name,
        mapping_json=payload.mapping_json,
    )

    job.status = "MAPPED"
    db.add(job)
    db.commit()

    return mapping


@router.get("/jobs/{job_id}", response_model=ImportJobStatusResponse)
def get_job_status(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)

    files = (
        db.query(models.ImportFile)
        .filter(models.ImportFile.import_job_id == int(job.id))
        .order_by(models.ImportFile.uploaded_at.desc())
        .all()
    )

    result = (
        db.query(models.ImportResult)
        .filter(models.ImportResult.import_job_id == int(job.id))
        .first()
    )

    return ImportJobStatusResponse(
        job=ImportJobRead.model_validate(job),
        files=[ImportFileRead.model_validate(f) for f in files],
        result=(result.summary if result is not None else None),
    )


@router.get("/jobs/{job_id}/errors", response_model=ImportJobErrorsResponse)
def list_job_errors(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)

    rows = (
        db.query(models.ImportStagingRow)
        .filter(
            models.ImportStagingRow.import_job_id == int(job.id),
            models.ImportStagingRow.status == "ERROR",
        )
        .order_by(models.ImportStagingRow.row_no.asc())
        .all()
    )

    return ImportJobErrorsResponse(
        job_id=int(job.id),
        errors=[ImportJobErrorsRow.model_validate(r) for r in rows],
    )


@router.post("/jobs/{job_id}/validate", response_model=ImportValidateResponse)
def validate_job_rows(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)
    result = svc.validate_job(job=job, current_user=current_user)
    return ImportValidateResponse(**result)


@router.post("/jobs/{job_id}/commit", response_model=ImportCommitResponse)
def commit_job_rows(
    job_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_admin),
):
    svc = ImportEngine(db)
    job = svc.get_job(job_id=int(job_id), current_user=current_user)
    result = svc.commit_job(job=job, current_user=current_user)
    return ImportCommitResponse(**result)
