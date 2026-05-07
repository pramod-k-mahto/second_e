from app.routers.reports import mis_target_vs_actual
from app.database import SessionLocal
from datetime import date

db = SessionLocal()
try:
    # Testing for company 14, standard FY 2081/82 start (roughly 2024-07-16)
    result = mis_target_vs_actual(
        company_id=14,
        from_date=date(2024, 7, 16),
        to_date=date(2025, 7, 15),
        calendar_mode="BS",
        db=db,
        current_user=None # It might fail if Depends(get_current_user) is actually called in the function body
    )
    print("Result data count:", len(result.get("data", [])))
    targets = [d for d in result.get("data", []) if d.get("group_type") == "TARGET"]
    print("Target rows count:", len(targets))
    for t in targets[:5]:
        print(f"  Target: {t.get('ledger_name')} - {t.get('month_key')} - {t.get('amount')}")
except Exception as e:
    print("Error:", e)
finally:
    db.close()
