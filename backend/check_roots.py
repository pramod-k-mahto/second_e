
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    company_id = 14
    # Find all top-level groups (parent_group_id is NULL or not in asset_liability groups)
    result = conn.execute(text("""
        SELECT id, name, parent_group_id 
        FROM ledger_groups 
        WHERE company_id = :cid AND (parent_group_id IS NULL OR parent_group_id NOT IN (SELECT id FROM ledger_groups WHERE company_id = :cid))
    """), {"cid": company_id})
    rows = result.fetchall()
    print("Top Level Groups:")
    for r in rows:
        print(f"ID: {r.id}, Name: {r.name}, Parent ID: {r.parent_group_id}")
