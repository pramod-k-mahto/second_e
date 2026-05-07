
import sys
import os
from sqlalchemy import text

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from app.database import engine

def migrate():
    print("Starting migration for Voucher dimensions...")
    with engine.connect() as connection:
        
        # 1. vouchers
        print("Adding columns to vouchers...")
        connection.execute(text("""
            ALTER TABLE vouchers 
            ADD COLUMN IF NOT EXISTS department_id BIGINT REFERENCES departments(id),
            ADD COLUMN IF NOT EXISTS project_id BIGINT REFERENCES projects(id);
        """))

        # 2. voucher_lines
        print("Adding columns to voucher_lines...")
        connection.execute(text("""
            ALTER TABLE voucher_lines 
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
