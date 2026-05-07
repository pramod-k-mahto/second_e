
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Trace group 283 to root
    group_id = 283
    while group_id:
        res = conn.execute(text("SELECT id, name, parent_group_id FROM ledger_groups WHERE id = :gid"), {"gid": group_id})
        row = res.fetchone()
        if row:
            print(f"Group: {row.name} (ID: {row.id})")
            group_id = row.parent_group_id
        else:
            break
