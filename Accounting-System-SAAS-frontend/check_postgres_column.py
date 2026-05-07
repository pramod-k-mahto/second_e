
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from pathlib import Path

# Load .env from backend
env_path = Path(r"d:\Accounting System\API\backend\.env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
print(f"Connecting to: {DATABASE_URL}")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        result = conn.execute(text("SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' AND tablename = 'menu_template_menus'"))
        row = result.fetchone()
        if row:
            print("Table 'menu_template_menus' EXISTS in Postgres")
            # Check column
            res = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name='menu_template_menus' AND column_name='is_sidebar_visible'"))
            if res.fetchone():
                print("Column 'is_sidebar_visible' EXISTS")
            else:
                print("Column 'is_sidebar_visible' DOES NOT EXIST")
        else:
            print("Table 'menu_template_menus' NOT FOUND in Postgres")
except Exception as e:
    print(f"Connection Failed: {e}")
