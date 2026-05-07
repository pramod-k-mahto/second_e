
import sys
import os

# Add the backend app directory to sys.path
sys.path.append('d:/Accounting System/API/backend')

from app.database import SessionLocal
from app import models
from sqlalchemy.orm import selectinload

db = SessionLocal()
try:
    tenants = db.query(models.Tenant).options(selectinload(models.Tenant.users)).all()
    print(f"Total Tenants: {len(tenants)}")
    for t in tenants:
        print(f"Tenant: {t.name} (ID: {t.id})")
        print(f"  Companies Count (property): {t.companies_count}")
        print(f"  Users Count (relationship len): {len(t.users)}")
        print(f"  Users Count (property): {t.users_count}")
        for u in t.users:
            print(f"    User: {u.email} (ID: {u.id})")
finally:
    db.close()
