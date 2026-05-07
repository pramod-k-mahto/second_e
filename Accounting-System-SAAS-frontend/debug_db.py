import sys
from sqlalchemy import create_engine, text

db_url = "postgresql://postgres:admin@localhost:5432/account_system"

try:
    engine = create_engine(db_url)
    with engine.connect() as conn:
        print("--- Users ---")
        result = conn.execute(text("SELECT id, email, role, tenant_id, is_tenant_admin FROM users"))
        for row in result:
            print(row)
        
        print("\n--- Tenants ---")
        result = conn.execute(text("SELECT id, name FROM tenants"))
        for row in result:
            print(row)

        print("\n--- Companies ---")
        result = conn.execute(text("SELECT id, name, owner_id, tenant_id FROM companies"))
        for row in result:
            print(row)

        print("\n--- Companies with NULL tenant_id ---")
        result = conn.execute(text("SELECT id, name FROM companies WHERE tenant_id IS NULL"))
        for row in result:
            print(row)

except Exception as e:
    print(f"Error: {e}")
