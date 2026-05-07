import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add the backend directory to sys.path
sys.path.append(os.path.join(os.getcwd(), "backend"))

from app.database import DATABASE_URL
from app import models

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

def check_access(company_id, user_id, menu_code):
    print(f"--- Checking access for Company {company_id}, User {user_id}, Menu {menu_code} ---")
    
    company = db.query(models.Company).get(company_id)
    if not company:
        print("Company not found")
        return
    
    tenant_id = company.tenant_id
    print(f"Tenant ID: {tenant_id}")
    
    tenant = db.query(models.Tenant).get(tenant_id)
    if not tenant:
        print("Tenant not found")
        return
    
    print(f"Tenant Plan: {tenant.plan}, Menu Template ID: {tenant.menu_template_id}")
    
    menu = db.query(models.Menu).filter(models.Menu.code == menu_code).first()
    if not menu:
        print(f"Menu '{menu_code}' not found in database!")
        return
    
    print(f"Menu ID: {menu.id}")
    
    template_ids = []
    if tenant.menu_template_id:
        template_ids.append(tenant.menu_template_id)
    if tenant.plan:
        plan_obj = db.query(models.Plan).filter(models.Plan.code == tenant.plan).first()
        if plan_obj and plan_obj.menu_template_id:
            template_ids.append(plan_obj.menu_template_id)
            print(f"Plan '{tenant.plan}' Menu Template ID: {plan_obj.menu_template_id}")
    
    if not template_ids:
        print("No menu templates assigned to tenant or plan")
    else:
        print(f"Effective Template IDs: {template_ids}")
        in_template = db.query(models.MenuTemplateMenu).filter(
            models.MenuTemplateMenu.template_id.in_(template_ids),
            models.MenuTemplateMenu.menu_id == menu.id
        ).first()
        if in_template:
            print(f"Menu '{menu_code}' IS in template")
        else:
            print(f"Menu '{menu_code}' is NOT in template")

    user = db.query(models.User).get(user_id)
    if user:
        print(f"User Role: {user.role}, Tenant ID: {user.tenant_id}")
    
    access = db.query(models.UserMenuAccess).filter(
        models.UserMenuAccess.user_id == user_id,
        models.UserMenuAccess.company_id == company_id,
        models.UserMenuAccess.menu_id == menu.id
    ).first()
    if access:
        print(f"User explicit access: {access.access_level}")
    else:
        print("No explicit user menu access found")

if __name__ == "__main__":
    check_access(40, 23, "inventory.brands")
    check_access(40, 23, "inventory.categories")
    check_access(40, 23, "inventory.subcategories")
    print("\n" + "="*50 + "\n")
    check_access(6, 7, "inventory.brands")
    check_access(6, 7, "inventory.categories")
    check_access(6, 7, "inventory.subcategories")
    db.close()
