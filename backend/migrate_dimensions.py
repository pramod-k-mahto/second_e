
import sys
import os
from sqlalchemy import text

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from app.database import engine

def migrate():
    print("Starting migration for Purchase/Sales dimensions...")
    with engine.connect() as connection:
        # Add columns to purchase_bills
        print("Adding columns to purchase_bills...")
        connection.execute(text("""
            ALTER TABLE purchase_bills 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))

        # Add columns to purchase_returns
        print("Adding columns to purchase_returns...")
        connection.execute(text("""
            ALTER TABLE purchase_returns 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))
        
        # Add columns to sales_returns
        print("Adding columns to sales_returns...")
        connection.execute(text("""
            ALTER TABLE sales_returns 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))
        
        # Add columns to sales_invoices (just to be safe, though not in error)
        print("Adding columns to sales_invoices...")
        connection.execute(text("""
            ALTER TABLE sales_invoices 
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
