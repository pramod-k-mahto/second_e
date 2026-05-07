from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime

from .. import models, schemas
from ..auth import get_current_admin
from ..database import get_db

router = APIRouter(
    prefix="/admin/logs",
    tags=["Admin Logs"],
    dependencies=[Depends(get_current_admin)],
)


def log_event(
    db: Session,
    *,
    user_id: int | None,
    tenant_id: int | None,
    action: str,
    message: str,
) -> None:
    log = models.AuditLog(
        user_id=user_id,
        tenant_id=tenant_id,
        action=action,
        message=message,
    )
    db.add(log)


@router.get("", response_model=list[schemas.ActivityLogOut])
def list_logs(
    skip: int = 0,
    limit: int = 100,
    action: str | None = None,
    tenant_id: int | None = None,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    q = (
        db.query(models.AuditLog, models.User.email)
        .outerjoin(models.User, models.AuditLog.user_id == models.User.id)
        .order_by(models.AuditLog.created_at.desc())
    )
    if action:
        q = q.filter(models.AuditLog.action == action)
    if tenant_id is not None:
        q = q.filter(models.AuditLog.tenant_id == tenant_id)
    rows = q.offset(skip).limit(limit).all()

    logs: list[schemas.ActivityLogOut] = []
    for log, user_email in rows:
        logs.append(
            schemas.ActivityLogOut(
                id=log.id,
                timestamp=log.created_at,
                actor=user_email,
                type=log.action,
                description=log.message,
                tenant_id=log.tenant_id,
            )
        )

    return logs


@router.get("/voucher-logs", response_model=list[schemas.VoucherLogRead])
def list_voucher_logs(
    tenant_id: int | None = None,
    company_id: int | None = None,
    voucher_number: str | None = None,
    action: schemas.VoucherAction | None = None,
    from_: datetime | None = Query(None, alias="from"),
    to: datetime | None = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    q = db.query(models.VoucherLog, models.User.email).outerjoin(
        models.User, models.VoucherLog.actor == models.User.email
    )

    if tenant_id is not None:
        q = q.filter(models.VoucherLog.tenant_id == tenant_id)
    if company_id is not None:
        q = q.filter(models.VoucherLog.company_id == company_id)
    if voucher_number:
        q = q.filter(models.VoucherLog.voucher_number.ilike(f"%{voucher_number}%"))
    if action is not None:
        q = q.filter(models.VoucherLog.action == action)
    if from_ is not None:
        q = q.filter(models.VoucherLog.created_at >= from_)
    if to is not None:
        q = q.filter(models.VoucherLog.created_at <= to)

    rows = (
        q.order_by(models.VoucherLog.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

    logs: list[schemas.VoucherLogRead] = []
    for log, user_email in rows:
        logs.append(
            schemas.VoucherLogRead(
                id=log.id,
                timestamp=log.created_at,
                tenant_id=log.tenant_id,
                company_id=log.company_id,
                voucher_id=log.voucher_id,
                voucher_number=log.voucher_number,
                actor=log.actor or user_email,
                action=log.action,
                summary=log.summary,
            )
        )

    return logs