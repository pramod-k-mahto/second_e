
import sys
import os
from sqlalchemy import text

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from app.database import engine

def migrate():
    print("Starting migration for Return vouchers...")
    with engine.connect() as connection:
        
        # 1. sales_returns
        print("Adding voucher_id to sales_returns...")
        connection.execute(text("""
            ALTER TABLE sales_returns 
            ADD COLUMN IF NOT EXISTS voucher_id INTEGER REFERENCES vouchers(id);
        """))

        # 2. purchase_returns
        print("Adding voucher_id to purchase_returns...")
        connection.execute(text("""
            ALTER TABLE purchase_returns 
            ADD COLUMN IF NOT EXISTS voucher_id INTEGER REFERENCES vouchers(id);
        """))

        connection.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
