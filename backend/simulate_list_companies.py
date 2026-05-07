import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def simulate_list_companies(user_id):
    settings = get_settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        print(f"--- SIMULATING list_companies FOR USER {user_id} ---")
        query = text("""
            SELECT DISTINCT c.id, c.name, c.tenant_id, c.owner_id
            FROM companies c
            LEFT JOIN user_company_access uca ON uca.company_id = c.id
            WHERE c.owner_id = :uid OR uca.user_id = :uid
        """)
        companies = conn.execute(query, {"uid": user_id}).fetchall()
        for c in companies:
            print(f"ID: {c.id}, Name: {c.name}, Tenant ID: {c.tenant_id}, Owner ID: {c.owner_id}")
        if not companies:
            print("No companies found.")

if __name__ == "__main__":
    simulate_list_companies(8)
