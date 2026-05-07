
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Find all ledgers containing "Fixed"
    result = conn.execute(text("SELECT id, name, code FROM ledgers WHERE name ILIKE '%Fixed%' OR code ILIKE '%283%'"))
    rows = result.fetchall()
    print("Found Ledgers:")
    for r in rows:
        print(f"ID: {r.id}, Name: {r.name}, Code: {r.code}")

    # Find all groups containing "Fixed"
    result = conn.execute(text("SELECT id, name FROM ledger_groups WHERE name ILIKE '%Fixed%'"))
    rows = result.fetchall()
    print("\nFound Groups:")
    for r in rows:
        print(f"ID: {r.id}, Name: {r.name}")
