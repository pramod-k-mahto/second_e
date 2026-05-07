
import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Load .env to get the Postgres URL
env_path = Path(r"d:\Accounting System\API\backend\.env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    print("DATABASE_URL not found in .env")
    exit(1)

# Convert SQLAlchemy URL to psycopg2 connect string
# postgresql+psycopg2://postgres:admin@localhost:5432/account_system
import re
match = re.match(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)", DATABASE_URL)
if not match:
     # try simpler if no port
     match = re.match(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^/]+)/(.+)", DATABASE_URL)

if match:
    groups = match.groups()
    user, password, host, port, dbname = groups[0], groups[1], groups[2], groups[3], groups[4]
else:
    # Manual fallback if regex fails
    print(f"Regex failed on: {DATABASE_URL}")
    exit(1)

print(f"Connecting to Postgres: {dbname} on {host}:{port}")

try:
    conn = psycopg2.connect(dbname=dbname, user=user, password=password, host=host, port=port)
    cur = conn.cursor()
    
    # 1. Check if column exists
    cur.execute("SELECT column_name FROM information_schema.columns WHERE table_name='menu_template_menus' AND column_name='is_sidebar_visible'")
    if not cur.fetchone():
        print("Column 'is_sidebar_visible' DOES NOT EXIST in Postgres!")
        # 2. Add the column
        cur.execute("ALTER TABLE menu_template_menus ADD COLUMN is_sidebar_visible BOOLEAN DEFAULT TRUE NOT NULL")
        conn.commit()
        print("Column 'is_sidebar_visible' successfully added to Postgres.")
    else:
        print("Column 'is_sidebar_visible' ALREADY EXISTS in Postgres.")
        
    # 3. Check for any hidden items
    cur.execute("SELECT count(*) FROM menu_template_menus WHERE is_sidebar_visible = FALSE")
    count = cur.fetchone()[0]
    print(f"Found {count} hidden items in the database.")
    
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
