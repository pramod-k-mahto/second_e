
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # Check items marked as fixed assets
    result = conn.execute(text("SELECT id, name, company_id, is_fixed_asset, expense_ledger_id FROM items WHERE is_fixed_asset = true ORDER BY id DESC LIMIT 10"))
    rows = result.fetchall()
    print("Items marked as Fixed Assets:")
    for r in rows:
        print(f"ID: {r.id}, Name: {r.name}, Company ID: {r.company_id}, Expense Ledger ID: {r.expense_ledger_id}")
