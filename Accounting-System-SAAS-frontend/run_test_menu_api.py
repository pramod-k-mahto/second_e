
import os
import sys
from pathlib import Path

# Fix python path to allow imports from app
backend_dir = Path(r"d:\Accounting System\API\backend")
sys.path.append(str(backend_dir))

from app.database import SessionLocal
from app import models, main, schemas

db = SessionLocal()
try:
    # 1. Identify a recently active user (Superadmin ideally)
    user = db.query(models.User).filter(models.User.is_superuser == True).first()
    if not user:
        print("No Superuser found!")
        sys.exit(1)
    
    # 2. Get companies to find one to test
    company = db.query(models.Company).first()
    if not company:
        print("No Company found!")
        sys.exit(1)
        
    print(f"Testing for User: {user.username}, Company: {company.name} (ID: {company.id})")
    
    # 3. Call the internal menu function
    menu_groups = main.list_effective_company_menus(int(company.id), db, user)
    
    # 4. Check for is_sidebar_visible in the output
    found_hidden = False
    for group in menu_groups:
        print(f"Module: {group.module}")
        for item in group.items:
            # Recursive check function
            def check_item(it, indent="  "):
                vis = getattr(it, 'is_sidebar_visible', 'MISSING')
                print(f"{indent}- {it.label} ({it.code}): Vis={vis}")
                if vis is False:
                    nonlocal found_hidden
                    found_hidden = True
                for child in getattr(it, 'children', []):
                    check_item(child, indent + "    ")
            
            check_item(item)
            
    if not found_hidden:
        print("\nSUMMARY: No items are marked as hidden in this API response.")
    else:
        print("\nSUMMARY: FOUND HIDDEN ITEMS in API response.")
        
except Exception as e:
    print(f"Error: {e}")
finally:
    db.close()
