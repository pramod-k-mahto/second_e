
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    parent_id = 271
    res = conn.execute(text("SELECT id, name FROM ledger_groups WHERE parent_group_id = :pid"), {"pid": parent_id})
    rows = res.fetchall()
    print(f"Children of Assets (ID: {parent_id}):")
    for r in rows:
        print(f"ID: {r.id}, Name: {r.name}")
