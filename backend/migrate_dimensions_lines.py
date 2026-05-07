
import sys
import os
from sqlalchemy import text

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from app.database import engine

def migrate():
    print("Starting migration for Purchase/Sales dimensions (Lines)...")
    with engine.connect() as connection:
        
        # 1. purchase_bill_lines
        print("Adding columns to purchase_bill_lines...")
        connection.execute(text("""
            ALTER TABLE purchase_bill_lines 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))

        # 2. purchase_return_lines
        print("Adding columns to purchase_return_lines...")
        connection.execute(text("""
            ALTER TABLE purchase_return_lines 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))

        # 3. sales_return_lines
        print("Adding columns to sales_return_lines...")
        connection.execute(text("""
            ALTER TABLE sales_return_lines 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))

        # 4. sales_invoice_lines
        print("Adding columns to sales_invoice_lines...")
        connection.execute(text("""
            ALTER TABLE sales_invoice_lines 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))

        connection.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
