
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check what group 283 is
    res_g = conn.execute(text("SELECT id, name, company_id FROM ledger_groups WHERE id = 283"))
    group = res_g.fetchone()
    if group:
        print(f"Group 283: {group.name} (ID: {group.id}, Company ID: {group.company_id})")
        
        # Find all ledgers in this group
        res_l = conn.execute(text("SELECT id, name, code FROM ledgers WHERE group_id = 283"))
        rows = res_l.fetchall()
        print("\nLedgers in Group 283:")
        for r in rows:
            print(f"ID: {r.id}, Name: {r.name}, Code: {r.code}")
    else:
        print("Group 283 not found")
