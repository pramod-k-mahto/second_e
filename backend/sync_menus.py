import sys
import os

# Add the current directory to sys.path to allow importing 'app'
sys.path.append(os.getcwd())

from app.database import SessionLocal
from app.menu_defaults import (
    upsert_default_menus, 
    ensure_default_menu_templates, 
    ensure_standard_template_grouping, 
    REQUIRED_FRONTEND_MENU_CODES, 
    ensure_menu_template_has_required_menus, 
    get_default_menu_template_id
)

def main():
    db = SessionLocal()
    try:
        print("Upserting default menus...")
        upsert_default_menus(db)
        
        print("Ensuring standard template exists...")
        ensure_default_menu_templates(db)
        
        print("Ensuring standard template grouping...")
        ensure_standard_template_grouping(db)
        
        template_id = get_default_menu_template_id(db)
        if template_id:
            print(f"Adding/Updating required menus to template ID {template_id}...")
            ensure_menu_template_has_required_menus(
                db, 
                template_id=template_id, 
                required_menu_codes=REQUIRED_FRONTEND_MENU_CODES
            )
        
        db.commit()
        print("Menu synchronization complete!")
    except Exception as e:
        print(f"Error during synchronization: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    main()
