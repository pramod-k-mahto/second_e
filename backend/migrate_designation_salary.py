import sys
import os

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from sqlalchemy import text
from app.database import engine

def migrate():
    print("Starting migration for Payroll Designation Salary fields...")
    with engine.connect() as connection:
        table_name = 'payroll_designations'
        columns_to_add = [
            ('base_monthly_salary', 'NUMERIC(14, 2)'),
            ('grade_rate', 'NUMERIC(14, 2)')
        ]
        
        for col_name, col_type in columns_to_add:
            print(f"Checking column {col_name} in {table_name} table...")
            result = connection.execute(text(f"""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='{table_name}' AND column_name='{col_name}';
            """))
            if not result.fetchone():
                print(f"Adding column {col_name}...")
                connection.execute(text(f"""
                    ALTER TABLE {table_name} 
                    ADD COLUMN {col_name} {col_type};
                """))
                print(f"Column {col_name} added.")
            else:
                print(f"Column {col_name} already exists.")

        connection.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
