import sys
import os

# Add the backend directory to sys.path
sys.path.append(r"d:\Accounting System\API\backend")

from app.database import SessionLocal
from app.menu_defaults import upsert_default_menus, ensure_default_menu_templates, normalize_all_template_groupings

def main():
    db = SessionLocal()
    try:
        print("Upserting default menus...")
        upsert_default_menus(db)
        print("Ensuring default menu templates have required menus...")
        ensure_default_menu_templates(db)
        print("Normalizing all template groupings...")
        normalize_all_template_groupings(db)
        print("Seeding completed successfully.")
    except Exception as e:
        print(f"Error during seeding: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
