
import sys
import os

sys.path.append(os.path.join(os.getcwd(), "..", "API", "backend"))

try:
    from app.database import SessionLocal
    from app import models
except ImportError as e:
    print(f"ImportError: {e}")
    sys.exit(1)

db = SessionLocal()
try:
    g = db.query(models.LedgerGroup).filter(models.LedgerGroup.name == "Business Owner").first()
    if g:
        print(f"Group: {g.name} (id: {g.id})")
        print(f"Parent ID: {g.parent_group_id}")
        if g.parent_group:
             print(f"Parent Group: {g.parent_group.name}")
finally:
    db.close()
