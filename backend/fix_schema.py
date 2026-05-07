import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def fix_schema():
    settings = get_settings()
    print(f"Connecting to DB: {settings.database_url}")
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        try:
            # Check if column exists (PostgreSQL specific query)
            check_sql = text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='payment_mode_id'")
            result = conn.execute(check_sql)
            if result.fetchone():
                print("Column 'payment_mode_id' already exists in 'purchase_bills'. No action needed.")
            else:
                print("Column 'payment_mode_id' missing. Adding it...")
                alter_sql = text("ALTER TABLE purchase_bills ADD COLUMN payment_mode_id INTEGER REFERENCES payment_modes(id)")
                conn.execute(alter_sql)
                conn.commit()
                print("Successfully added 'payment_mode_id' column to 'purchase_bills'.")
        except Exception as e:
            print(f"Error updating schema: {e}")

if __name__ == "__main__":
    fix_schema()
