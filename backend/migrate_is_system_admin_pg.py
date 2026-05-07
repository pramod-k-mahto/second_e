import os
import psycopg2
from dotenv import load_dotenv
from urllib.parse import urlparse

# Load .env
env_path = r"d:\Accounting System\API\backend\.env"
load_dotenv(dotenv_path=env_path)
database_url = os.getenv("DATABASE_URL")

def migrate():
    if not database_url:
        print("DATABASE_URL not found in .env")
        return

    print(f"Connecting to database...")
    
    # Parse the URL
    result = urlparse(database_url)
    username = result.username
    password = result.password
    database = result.path[1:]
    hostname = result.hostname
    port = result.port
    
    conn = None
    try:
        conn = psycopg2.connect(
            database=database,
            user=username,
            password=password,
            host=hostname,
            port=port
        )
        cur = conn.cursor()
        
        # 1. Add the column
        print("Adding is_system_admin column to users table...")
        try:
            cur.execute("ALTER TABLE users ADD COLUMN is_system_admin BOOLEAN DEFAULT FALSE;")
            conn.commit()
            print("Column added successfully.")
        except psycopg2.Error as e:
            conn.rollback()
            if "already exists" in str(e):
                print("Column already exists, skipping.")
            else:
                print(f"Error adding column: {e}")
                return

        # 2. Update existing superadmins
        print("Setting is_system_admin = TRUE for all existing superadmins and system tenant users...")
        try:
            # Set for superadmins
            cur.execute("UPDATE users SET is_system_admin = TRUE WHERE role = 'superadmin';")
            # Set for any admin in the system tenant (ID 1)
            cur.execute("UPDATE users SET is_system_admin = TRUE WHERE tenant_id = 1;")
            conn.commit()
            print("Users updated successfully.")
        except Exception as e:
            conn.rollback()
            print(f"Error updating users: {e}")

        print("Migration completed.")
        
        cur.close()
    except Exception as e:
        print(f"Migration failed: {e}")
    finally:
        if conn:
            conn.close()

if __name__ == "__main__":
    migrate()
