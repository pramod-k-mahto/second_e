from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from datetime import datetime

from ..database import get_db
from ..models import SystemAnnouncement, User, UserRole
from ..schemas import SystemAnnouncementCreate, SystemAnnouncementRead, SystemAnnouncementUpdate
from ..auth import get_current_user

router = APIRouter(prefix="/admin/announcements", tags=["Admin Announcements"])

def require_support_admin(current_user: User = Depends(get_current_user)):
    if not current_user.role or current_user.role not in (UserRole.superadmin, UserRole.ghost_support):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Requires Support Admin privileges",
        )
    return current_user

@router.get("", response_model=list[SystemAnnouncementRead])
def get_announcements(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_support_admin)
):
    return db.query(SystemAnnouncement).order_by(SystemAnnouncement.created_at.desc()).all()

@router.post("", response_model=SystemAnnouncementRead)
def create_announcement(
    announcement: SystemAnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_support_admin)
):
    db_ann = SystemAnnouncement(**announcement.model_dump())
    db.add(db_ann)
    db.commit()
    db.refresh(db_ann)
    return db_ann

@router.put("/{announcement_id}", response_model=SystemAnnouncementRead)
def update_announcement(
    announcement_id: int,
    announcement: SystemAnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_support_admin)
):
    db_ann = db.query(SystemAnnouncement).filter(SystemAnnouncement.id == announcement_id).first()
    if not db_ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    
    update_data = announcement.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_ann, key, value)
        
    db.commit()
    db.refresh(db_ann)
    return db_ann

@router.delete("/{announcement_id}")
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_support_admin)
):
    db_ann = db.query(SystemAnnouncement).filter(SystemAnnouncement.id == announcement_id).first()
    if not db_ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    db.delete(db_ann)
    db.commit()
    return {"detail": "Announcement deleted successfully"}
