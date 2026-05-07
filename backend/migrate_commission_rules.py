
import sys
import os

# Ensure backend directory is in python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, current_dir)

from sqlalchemy import text
from app.database import engine

def migrate():
    print("Starting migration for Commission Rules...")
    with engine.connect() as connection:
        # Create enum types if not exists
        connection.execute(text("""
            DO $$ BEGIN
                CREATE TYPE commission_basis AS ENUM ('TURNOVER');
            EXCEPTION
                WHEN duplicate_object THEN null;
            END $$;
        """))

        # Create table
        print("Creating commission_rules table...")
        connection.execute(text("""
            CREATE TABLE IF NOT EXISTS commission_rules (
                id SERIAL PRIMARY KEY,
                company_id BIGINT NOT NULL REFERENCES companies(id),
                name VARCHAR(255) NOT NULL,
                
                employee_type_id BIGINT REFERENCES employee_types(id),
                department_id BIGINT REFERENCES departments(id),
                project_id BIGINT REFERENCES projects(id),
                
                is_global_default BOOLEAN DEFAULT FALSE,
                basis commission_basis DEFAULT 'TURNOVER',
                rate_percent NUMERIC(14, 2) NOT NULL DEFAULT 0,
                
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
        """))
        
        # Indexes
        print("Creating indexes...")
        connection.execute(text("""
            CREATE INDEX IF NOT EXISTS ix_commission_rules_company_active 
            ON commission_rules (company_id, is_active);
        """))

        connection.commit()
    print("Migration completed successfully.")

if __name__ == "__main__":
    try:
        migrate()
    except Exception as e:
        print(f"Migration failed: {e}")
