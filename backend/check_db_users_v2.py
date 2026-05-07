from sqlalchemy import create_engine, text
import json
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:admin@localhost:5432/account_system")

def check_users():
    print(f"Connecting to {DATABASE_URL}")
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT id, email, role, tenant_id FROM users"))
        users = [dict(row._mapping) for row in result.fetchall()]
        print(json.dumps(users, indent=2))
        
        result = conn.execute(text("SELECT id, name FROM tenants"))
        tenants = [dict(row._mapping) for row in result.fetchall()]
        print("\nTenants:")
        print(json.dumps(tenants, indent=2))

if __name__ == "__main__":
    check_users()
