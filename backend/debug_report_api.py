from app.routers.reports import mis_target_vs_actual
from app.database import SessionLocal
from datetime import date
from unittest.mock import MagicMock
from app.models import UserRole

db = SessionLocal()
try:
    # Mock current_user as superadmin to bypass company access checks
    current_user = MagicMock()
    current_user.role = UserRole.superadmin
    current_user.id = 1
    
    # Testing for company 14, standard FY 2081/82 start (roughly 2024-07-16)
    result = mis_target_vs_actual(
        company_id=14,
        from_date=date(2024, 7, 16),
        to_date=date(2025, 7, 15),
        department_id=None,
        project_id=None,
        group_by=None,
        calendar_mode="BS",
        db=db,
        current_user=current_user
    )
    print("Result data count:", len(result.get("data", [])))
    targets = [d for d in result.get("data", []) if d.get("group_type") == "TARGET"]
    print("Target rows count:", len(targets))
    for t in targets[:10]:
         print(f"  Target: {t.get('ledger_name')} - {t.get('month_key')} - {t.get('amount')}")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
