from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company_secure


router = APIRouter(prefix="/companies/{company_id}", tags=["notifications"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


@router.get("/notifications", response_model=list[schemas.NotificationRead])
def list_notifications(
    company_id: int,
    unread_only: bool = True,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    q = db.query(models.Notification).filter(models.Notification.company_id == company_id)
    if unread_only:
        q = q.filter(models.Notification.read.is_(False))

    notifications = q.order_by(models.Notification.created_at.desc()).all()
    return notifications


@router.post("/notifications/{notification_id}/mark-read")
def mark_notification_read(
    company_id: int,
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)

    notif = (
        db.query(models.Notification)
        .filter(
            models.Notification.id == notification_id,
            models.Notification.company_id == company_id,
        )
        .first()
    )
    if not notif:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif.read = True
    db.commit()
    return {"detail": "Notification marked as read"}


@router.post("/notifications/manual")
async def send_manual_notification(
    company_id: int,
    payload: dict, # { type: 'order_placed' | 'dispatch', id: number }
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from ..services import notification_service
    _get_company(db, company_id, current_user)

    msg_type = payload.get("type")
    entity_id = payload.get("id")

    if not msg_type or not entity_id:
        raise HTTPException(status_code=400, detail="Missing type or id")

    try:
        if msg_type == "order_placed":
            await notification_service.notify_order_placed(db, entity_id, force=True)
        elif msg_type == "dispatch":
            await notification_service.notify_package_status(db, entity_id, force=True)
        elif msg_type == "payment_received":
            await notification_service.notify_payment_received(db, entity_id, force=True)
        elif msg_type == "outstanding_balance":
            await notification_service.notify_outstanding_balance(db, entity_id, force=True)
        elif msg_type == "customer_statement":
            await notification_service.notify_customer_statement(db, entity_id, force=True)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported notification type: {msg_type}")


        
        return {"detail": f"Manual notification '{msg_type}' triggered successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
