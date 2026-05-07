import os, sys
from sqlalchemy import create_engine
sys.path.append(os.path.join(os.getcwd(), "backend"))
from app.database import DATABASE_URL
from app import models
from sqlalchemy.orm import sessionmaker

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

def fix_template(template_id, source_template_id=None):
    print(f"--- Fixing Template {template_id} ---")
    
    # Target menus to ensure are present
    target_menu_codes = [
        "inventory.categories",
        "inventory.brands",
        "inventory.subcategories"
    ]
    
    for code in target_menu_codes:
        menu = db.query(models.Menu).filter(models.Menu.code == code).first()
        if not menu:
            print(f"Warning: Menu '{code}' not found in DB.")
            continue
            
        existing = db.query(models.MenuTemplateMenu).filter(
            models.MenuTemplateMenu.template_id == template_id,
            models.MenuTemplateMenu.menu_id == menu.id
        ).first()
        
        if not existing:
            print(f"Adding Menu '{code}' (ID {menu.id}) to Template {template_id}...")
            new_entry = models.MenuTemplateMenu(
                template_id=template_id,
                menu_id=menu.id
            )
            db.add(new_entry)
        else:
            print(f"Menu '{code}' already present in Template {template_id}.")
            
    db.commit()
    print(f"Template {template_id} fixed.")

if __name__ == "__main__":
    # Fix Template 5 (used by Tenant 24 / Company 40)
    fix_template(5)
    db.close()
