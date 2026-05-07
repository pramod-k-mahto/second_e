import sys
import os

# Add the parent directory to sys.path to allow importing from the 'app' package
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '.')))

from app.database import engine
from sqlalchemy import text

def migrate():
    print("Starting migration: Add warehouse_id to purchase_return_lines...")
    
    with engine.connect() as conn:
        # Check if warehouse_id column exists in purchase_return_lines using information_schema
        check_col_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='purchase_return_lines' AND column_name='warehouse_id'
        """)
        result = conn.execute(check_col_query).fetchone()
        
        if not result:
            print("Adding warehouse_id column to purchase_return_lines...")
            conn.execute(text("ALTER TABLE purchase_return_lines ADD COLUMN warehouse_id INTEGER REFERENCES warehouses(id)"))
            conn.commit()
            print("Successfully added warehouse_id column.")
        else:
            print("warehouse_id column already exists in purchase_return_lines.")

    print("Migration completed.")

if __name__ == "__main__":
    migrate()
