from app.database import SessionLocal
from app import models

def fix_all_templates():
    db = SessionLocal()
    try:
        # Mandatory menu codes for the system shell and core modules
        required_codes = [
            "inventory.categories",
            "inventory.subcategories",
            "inventory.brands",
            "inventory.warehouses",
            "settings.company",
            "INVENTORY",
            "settings",
        ]
        
        # 1. Fetch the menu objects for these codes
        menus = db.query(models.Menu).filter(models.Menu.code.in_(required_codes)).all()
        if not menus:
            print("No required menus found in the database. Please check menu_defaults.py seeding.")
            return

        found_codes = [m.code for m in menus]
        print(f"Found {len(menus)} mandatory menus: {found_codes}")

        # 2. Iterate through ALL Templates
        templates = db.query(models.MenuTemplate).all()
        print(f"Checking {len(templates)} templates for missing menus...")

        total_added = 0
        for template in templates:
            # Fetch existing menu IDs for this template
            existing_tm = db.query(models.MenuTemplateMenu).filter(
                models.MenuTemplateMenu.template_id == template.id
            ).all()
            existing_menu_ids = {tm.menu_id for tm in existing_tm}

            template_added = 0
            for m in menus:
                if m.id not in existing_menu_ids:
                    db.add(models.MenuTemplateMenu(
                        template_id=template.id,
                        menu_id=m.id,
                        is_sidebar_visible=True
                    ))
                    template_added += 1
            
            if template_added > 0:
                print(f"Added {template_added} menus to template {template.id} ({template.name})")
                total_added += template_added

        db.commit()
        print(f"Successfully added {total_added} menu links across all templates.")

    except Exception as e:
        db.rollback()
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_all_templates()
