import os
import sys
from sqlalchemy import create_engine, text

# Database URL from .env
DATABASE_URL = "postgresql://postgres:admin@localhost/account_system"

def fix_ghost_admins():
    engine = create_engine(DATABASE_URL)
    try:
        with engine.connect() as conn:
            print("Connecting to database...")
            # Update existing ghost users
            result = conn.execute(text("UPDATE users SET is_system_admin = True WHERE role::text LIKE 'ghost_%';"))
            print(f"Updated {result.rowcount} ghost users.")
            
            # Ensure superadmin also has the flag
            result = conn.execute(text("UPDATE users SET is_system_admin = True WHERE role::text = 'superadmin';"))
            print(f"Updated superadmin flag: {result.rowcount} rows.")
            
            conn.commit()
            print("Changes committed successfully.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    fix_ghost_admins()
