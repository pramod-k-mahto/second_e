import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def check_mismatches():
    settings = get_settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        print("--- Companies with Bank Account Mismatch or Multiple Banks ---")
        companies = conn.execute(text("SELECT id, name FROM companies")).fetchall()
        for c in companies:
            cid = c.id
            company_name = c.name
            
            # Find Bank account ledgers for this company
            bank_ledgers = conn.execute(text("""
                SELECT l.id, l.name, l.code 
                FROM ledgers l
                JOIN ledger_groups lg ON l.group_id = lg.id
                WHERE l.company_id = :cid AND (lg.name ILIKE '%Bank%' OR l.name ILIKE '%Bank%')
            """), {"cid": cid}).fetchall()
            
            # Find Payment Modes for this company
            payment_modes = conn.execute(text("""
                SELECT id, name, ledger_id FROM payment_modes WHERE company_id = :cid
            """), {"cid": cid}).fetchall()
            
            if bank_ledgers:
                print(f"\nCompany: {company_name} (ID: {cid})")
                print("  Bank Ledgers:")
                for bl in bank_ledgers:
                    print(f"    - ID: {bl.id}, Name: {bl.name}, Code: {bl.code}")
                
                print("  Payment Modes:")
                for pm in payment_modes:
                    ledger_name = conn.execute(text("SELECT name FROM ledgers WHERE id = :lid"), {"lid": pm.ledger_id}).scalar()
                    print(f"    - ID: {pm.id}, Name: {pm.name}, Ledger: {ledger_name} (ID: {pm.ledger_id})")

if __name__ == "__main__":
    check_mismatches()
