from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from datetime import datetime
from sqlalchemy import or_, text

from ..database import get_db
from ..models import SystemAnnouncement, User
from ..schemas import SystemAnnouncementRead
from ..auth import get_current_user

router = APIRouter(prefix="/announcements", tags=["Announcements"])

@router.get("/active", response_model=list[SystemAnnouncementRead])
def get_active_announcements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    now = datetime.utcnow()
    
    tenant_id = current_user.tenant_id
    
    # Base query for active announcements
    query = db.query(SystemAnnouncement).filter(
        SystemAnnouncement.is_active == True,
        or_(SystemAnnouncement.start_date == None, SystemAnnouncement.start_date <= now),
        or_(SystemAnnouncement.end_date == None, SystemAnnouncement.end_date >= now)
    )
    
    # Target tenant checking
    # SQLAlchemy over JSONB can be tricky for testing a specific element inside an array.
    # We can either fetch all and filter in Python, or use a JSON containment filter.
    # For safety across DB dialects (SQLite vs Postgres), we'll fetch active ones 
    # and filter in Python if JSON containment isn't supported, 
    # but since target_tenant_ids is JSONB in Postgres, we can do it in memory for max compatibility.
    
    announcements = query.all()
    
    active_for_user = []
    for ann in announcements:
        # If target_tenant_ids is None or empty, it applies to all tenants
        if not ann.target_tenant_ids or len(ann.target_tenant_ids) == 0:
            active_for_user.append(ann)
        elif tenant_id in ann.target_tenant_ids:
            active_for_user.append(ann)
            
    return active_for_user
