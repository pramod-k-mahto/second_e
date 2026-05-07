
from sqlalchemy import create_engine, text
import os

# Use the same connection string logic as the app
DATABASE_URL = "sqlite:///./sql_app.db" # Adjust if different

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        result = conn.execute(text("PRAGMA table_info(menu_template_menus)"))
        cols = [row[1] for row in result]
        print(f"Columns: {cols}")
        if "is_sidebar_visible" in cols:
            print("is_sidebar_visible EXISTS")
        else:
            print("is_sidebar_visible DOES NOT EXIST")
    except Exception as e:
        print(f"Error: {e}")
