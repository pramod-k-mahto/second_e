import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def add_column():
    settings = get_settings()
    print(f"Connecting to DB: {settings.database_url}")
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        try:
            # Add ledger_group_id to payment_modes
            check_column = text("SELECT column_name FROM information_schema.columns WHERE table_name='payment_modes' AND column_name='ledger_group_id'")
            if not conn.execute(check_column).fetchone():
                print("Adding 'ledger_group_id' to 'payment_modes'...")
                conn.execute(text("ALTER TABLE payment_modes ADD COLUMN ledger_group_id INTEGER REFERENCES ledger_groups(id)"))
            else:
                print("'ledger_group_id' already exists in 'payment_modes'.")

            conn.commit()
            print("Schema update completed successfully.")
        except Exception as e:
            print(f"Error updating schema: {e}")

if __name__ == "__main__":
    add_column()
