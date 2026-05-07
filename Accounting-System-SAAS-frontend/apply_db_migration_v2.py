
from sqlalchemy import create_engine, text
import os

# Use absolute path to avoid ambiguity
DATABASE_PATH = r"d:\Accounting System\API\backend\sql_app.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

print(f"Connecting to: {DATABASE_URL}")

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        # Check if table exists first
        result = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='menu_template_menus'"))
        if not result.fetchone():
            print("ERROR: Table 'menu_template_menus' not found in this database.")
        else:
            # Check if column already exists
            result = conn.execute(text("PRAGMA table_info(menu_template_menus)"))
            cols = [row[1] for row in result]
            if "is_sidebar_visible" in cols:
                print("Column 'is_sidebar_visible' already exists.")
            else:
                conn.execute(text("ALTER TABLE menu_template_menus ADD COLUMN is_sidebar_visible BOOLEAN DEFAULT 1 NOT NULL"))
                conn.commit()
                print("Successfully added is_sidebar_visible column.")
    except Exception as e:
        print(f"Error: {e}")
