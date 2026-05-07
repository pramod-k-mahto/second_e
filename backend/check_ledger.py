
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check Ledger 283 and its group
    result = conn.execute(text("""
        SELECT l.id, l.name, g.id as group_id, g.name as group_name, g.parent_group_id
        FROM ledgers l
        JOIN ledger_groups g ON l.group_id = g.id
        WHERE l.id = 283
    """))
    row = result.fetchone()
    if row:
        print(f"Ledger: {row.name} (ID: {row.id})")
        print(f"Group: {row.group_name} (ID: {row.group_id})")
        print(f"Parent Group ID: {row.parent_group_id}")
        
        # Trace up to root
        parent_id = row.parent_group_id
        while parent_id:
            res_p = conn.execute(text("SELECT id, name, parent_group_id FROM ledger_groups WHERE id = :pid"), {"pid": parent_id})
            row_p = res_p.fetchone()
            if row_p:
                print(f"  Parent: {row_p.name} (ID: {row_p.id})")
                parent_id = row_p.parent_group_id
            else:
                break
    else:
        print("Ledger 283 not found")
