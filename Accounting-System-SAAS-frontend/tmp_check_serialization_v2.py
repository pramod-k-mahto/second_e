
import sys
import os

# Add the backend app directory to sys.path
sys.path.append('d:/Accounting System/API/backend')

from app.database import SessionLocal
from app import models, schemas
from sqlalchemy.orm import selectinload
from typing import List

db = SessionLocal()
try:
    # Mimic list_tenants logic
    query = db.query(models.Tenant).options(
        selectinload(models.Tenant.companies),
        selectinload(models.Tenant.business_type),
        selectinload(models.Tenant.users)
    )
    tenants = query.order_by(models.Tenant.created_at.desc()).limit(1).all()
    
    # Serialize to schemas.TenantRead
    print("SERIALIZED DATA:")
    for t in tenants:
        read = schemas.TenantRead.model_validate(t)
        print(f"Tenant: {read.name} (ID: {read.id})")
        print(f"  Users Count (plural): {read.users_count}")
        print(f"  User Count (singular): {read.user_count}")
finally:
    db.close()
