import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def check_tenants():
    settings = get_settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        print("--- USER INFO ---")
        user = conn.execute(text("SELECT id, email, role, tenant_id FROM users WHERE id = 8")).fetchone()
        if user:
            print(f"User ID: {user.id}, Email: {user.email}, Role: {user.role}, Tenant ID: {user.tenant_id}")
        else:
            print("User 8 not found.")

        print("\n--- COMPANY INFO ---")
        companies = conn.execute(text("SELECT id, name, tenant_id, owner_id FROM companies WHERE id IN (6, 14)")).fetchall()
        for c in companies:
            print(f"Company ID: {c.id}, Name: {c.name}, Tenant ID: {c.tenant_id}, Owner ID: {c.owner_id}")

        print("\n--- USER COMPANY ACCESS ---")
        access = conn.execute(text("SELECT id, user_id, company_id FROM user_company_access WHERE user_id = 8")).fetchall()
        for a in access:
            print(f"Access ID: {a.id}, User ID: {a.user_id}, Company ID: {a.company_id}")

if __name__ == "__main__":
    check_tenants()
