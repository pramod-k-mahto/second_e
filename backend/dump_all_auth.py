import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def check_all_access():
    settings = get_settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        print("--- ALL USERS ---")
        users = conn.execute(text("SELECT id, email, role, tenant_id FROM users")).fetchall()
        for u in users:
            print(f"ID: {u.id}, Email: {u.email}, Role: {u.role}, Tenant ID: {u.tenant_id}")

        print("\n--- ALL COMPANIES ---")
        companies = conn.execute(text("SELECT id, name, tenant_id, owner_id FROM companies")).fetchall()
        for c in companies:
            print(f"ID: {c.id}, Name: {c.name}, Tenant ID: {c.tenant_id}, Owner ID: {c.owner_id}")

        print("\n--- ALL USER COMPANY ACCESS ---")
        access = conn.execute(text("SELECT id, user_id, company_id FROM user_company_access")).fetchall()
        for a in access:
            print(f"ID: {a.id}, User ID: {a.user_id}, Company ID: {a.company_id}")

        print("\n--- ALL TENANTS ---")
        tenants = conn.execute(text("SELECT id, name FROM tenants")).fetchall()
        for t in tenants:
            print(f"ID: {t.id}, Name: {t.name}")

if __name__ == "__main__":
    check_all_access()
