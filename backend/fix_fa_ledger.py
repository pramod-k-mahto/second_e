
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    with conn.begin():
        company_id = 14
        group_id = 283
        
        # 1. Check if ledger exists in this group
        res = conn.execute(text("SELECT id FROM ledgers WHERE company_id = :cid AND group_id = :gid LIMIT 1"), {"cid": company_id, "gid": group_id})
        row = res.fetchone()
        
        if row:
            ledger_id = row[0]
            print(f"Existing Ledger ID: {ledger_id}")
        else:
            # 2. Create a generic ledger
            res_ins = conn.execute(text("""
                INSERT INTO ledgers (company_id, group_id, name, code, opening_balance, opening_balance_type, is_active)
                VALUES (:cid, :gid, 'Fixed Assets Ledger', 'FA-DEFAULT', 0, 'DEBIT', true)
                RETURNING id
            """), {"cid": company_id, "gid": group_id})
            ledger_id = res_ins.fetchone()[0]
            print(f"Created New Ledger ID: {ledger_id}")
        
        # 3. Update all items marked as fixed assets for this company
        res_upd = conn.execute(text("""
            UPDATE items 
            SET expense_ledger_id = :lid 
            WHERE company_id = :cid AND is_fixed_asset = true
        """), {"cid": company_id, "lid": ledger_id})
        print(f"Updated {res_upd.rowcount} items.")
