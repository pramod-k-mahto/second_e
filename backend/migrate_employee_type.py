import sys
import os

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from sqlalchemy import text
from app.database import engine

def migrate():
    print("Starting migration for Employee Type...")
    with engine.connect() as connection:
        # Create employee_types table
        print("Creating employee_types table...")
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS employee_types (
                id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
                company_id BIGINT NOT NULL REFERENCES companies(id),
                name TEXT NOT NULL,
                code TEXT,
                description TEXT,
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """))
        
        # Add column to employees table
        print("Adding employee_type_id to employees table...")
        # Check if column exists first to avoid error
        result = connection.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='employees' AND column_name='employee_type_id';
        """))
        if not result.fetchone():
            connection.execute(text("""
                ALTER TABLE employees 
                ADD COLUMN employee_type_id BIGINT REFERENCES employee_types(id);
            """))
            print("Column added.")
        else:
            print("Column employee_type_id already exists.")

        connection.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
