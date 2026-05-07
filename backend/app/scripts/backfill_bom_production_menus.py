from __future__ import annotations

import os
import sys

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app.menu_defaults import (
    ensure_default_menu_templates,
    ensure_default_menu_template_assigned_to_all_tenants,
    ensure_baseline_menus_on_assigned_templates,
    upsert_default_menus,
)


def backfill() -> dict[str, str]:
    db = SessionLocal()
    try:
        upsert_default_menus(db)
        ensure_default_menu_templates(db)
        ensure_default_menu_template_assigned_to_all_tenants(db)
        ensure_baseline_menus_on_assigned_templates(db)
        db.commit()
        return {"status": "ok", "detail": "BOM/Production menus backfilled."}
    finally:
        db.close()


if __name__ == "__main__":
    result = backfill()
    print(result)
