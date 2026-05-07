
import sys
import os
from sqlalchemy import text

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from app.database import engine

def migrate():
    print("Starting migration for Central Stock Management...")
    with engine.connect() as connection:
        
        # 1. Update warehouses
        print("Updating warehouses table...")
        connection.execute(text("""
            ALTER TABLE warehouses 
            ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id INTEGER REFERENCES projects(id);
        """))

        # 2. Update stock_transfers
        print("Updating stock_transfers table...")
        connection.execute(text("""
            ALTER TABLE stock_transfers 
            ADD COLUMN IF NOT EXISTS voucher_id INTEGER REFERENCES vouchers(id);
        """))

        # 3. Update stock_transfer_lines
        print("Updating stock_transfer_lines table...")
        connection.execute(text("""
            ALTER TABLE stock_transfer_lines 
            ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(18, 6);
        """))

        connection.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
