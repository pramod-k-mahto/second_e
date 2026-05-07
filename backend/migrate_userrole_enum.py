import os
import psycopg2
from dotenv import load_dotenv
from urllib.parse import urlparse

# Load .env to get DATABASE_URL
env_path = r"d:\Accounting System\API\backend\.env"
load_dotenv(dotenv_path=env_path)
database_url = os.getenv("DATABASE_URL")

def migrate():
    if not database_url:
        print("DATABASE_URL not found in .env")
        return

    print("Connecting to database...")
    # Parse URL
    res = urlparse(database_url)
    db = res.path[1:]
    user = res.username
    pw = res.password
    host = res.hostname
    port = res.port

    try:
        conn = psycopg2.connect(database=db, user=user, password=pw, host=host, port=port)
        # ALTER TYPE ... ADD VALUE cannot be executed in a transaction block
        conn.autocommit = True
        cur = conn.cursor()

        new_roles = ['TENANT', 'ghost_billing', 'ghost_support', 'ghost_tech']

        for role in new_roles:
            print(f"Adding value '{role}' to 'userrole' enum...")
            try:
                # Using a single-quoted string safely for the value
                cur.execute(f"ALTER TYPE userrole ADD VALUE %s;", (role,))
                print(f"Added '{role}' successfully.")
            except psycopg2.Error as e:
                # Check for "already exists" error (42710 in Postgres)
                if "already exists" in str(e).lower():
                    print(f"Value '{role}' already exists, skipping.")
                else:
                    print(f"Error adding '{role}': {e}")

        cur.close()
        conn.close()
        print("Migration finished.")
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
