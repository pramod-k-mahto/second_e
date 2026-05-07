import sys
import os
from sqlalchemy import create_engine, text
from passlib.context import CryptContext

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings
from app.auth import get_password_hash

def setup_test_data():
    settings = get_settings()
    engine = create_engine(settings.database_url)
    pwd_hash = get_password_hash("testpwd123")

    with engine.connect() as conn:
        # Create a test tenant
        conn.execute(text("INSERT INTO tenants (name) VALUES ('Test Tenant A') ON CONFLICT DO NOTHING"))
        conn.execute(text("INSERT INTO tenants (name) VALUES ('Test Tenant B') ON CONFLICT DO NOTHING"))
        
        tenant_a = conn.execute(text("SELECT id FROM tenants WHERE name='Test Tenant A'")).scalar()
        tenant_b = conn.execute(text("SELECT id FROM tenants WHERE name='Test Tenant B'")).scalar()
        
        # Create a test user in Tenant A
        conn.execute(text("""
            INSERT INTO users (email, full_name, password_hash, role, tenant_id, is_active)
            VALUES ('testuser@example.com', 'Test User', :pwd, 'superadmin', :tid, true)
            ON CONFLICT (email) DO UPDATE SET tenant_id = :tid, role = 'superadmin', password_hash = :pwd
        """), {"pwd": pwd_hash, "tid": tenant_a})
        
        conn.commit()
        print(f"Test user created: email=testuser@example.com, password=testpwd123, tenant_id={tenant_a}")
        print(f"Other tenant_id={tenant_b}")

if __name__ == "__main__":
    setup_test_data()
