import sys
import os
from sqlalchemy import create_engine, text

# Add the app directory to path
sys.path.append(r"d:\Accounting System\API\backend")

# Try to get DB URL from env or use default
# Assuming postgres on localhost:54322 from the previous session summary
db_url = "postgresql://postgres:postgres@localhost:54322/postgres"

engine = create_engine(db_url)
with engine.connect() as conn:
    print("Listing user roles and tenant IDs:")
    result = conn.execute(text("SELECT email, role, tenant_id, is_tenant_admin FROM users LIMIT 10"))
    for row in result:
        print(row)

    print("\nListing companies and their tenants:")
    result = conn.execute(text("SELECT name, tenant_id FROM companies LIMIT 10"))
    for row in result:
        print(row)
