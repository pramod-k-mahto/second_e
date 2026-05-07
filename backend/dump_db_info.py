import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def dump_info():
    settings = get_settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        print("--- Payment Modes ---")
        p_modes = conn.execute(text("SELECT id, name, ledger_id FROM payment_modes")).fetchall()
        for pm in p_modes:
            ledger_name = conn.execute(text("SELECT name FROM ledgers WHERE id = :lid"), {"lid": pm.ledger_id}).scalar()
            print(f"ID: {pm.id}, Name: {pm.name}, LedgerID: {pm.ledger_id} ({ledger_name})")

        print("\n--- Bank Ledgers ---")
        # Identify bank group ID (usually named 'Bank Accounts' or similar)
        bank_group_id = conn.execute(text("SELECT id FROM ledger_groups WHERE name ILIKE '%Bank%'")).scalar()
        if bank_group_id:
            bank_ledgers = conn.execute(text("SELECT id, name, code FROM ledgers WHERE group_id = :gid"), {"gid": bank_group_id}).fetchall()
            for bl in bank_ledgers:
                print(f"ID: {bl.id}, Name: {bl.name}, Code: {bl.code}")
        else:
            print("Bank group not found.")

if __name__ == "__main__":
    dump_info()
