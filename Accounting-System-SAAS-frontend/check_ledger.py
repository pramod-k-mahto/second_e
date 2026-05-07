
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
    ledger = db.query(models.Ledger).filter(models.Ledger.name == "Business Owner").first()
    if ledger:
        print(f"Ledger: {ledger.name} (id: {ledger.id})")
        print(f"Group: {ledger.group.name} (id: {ledger.group_id})")
        if ledger.group.parent_group:
             print(f"Parent Group: {ledger.group.parent_group.name} (id: {ledger.group.parent_group_id})")
    else:
        print("Ledger 'Business Owner' not found.")
finally:
    db.close()
