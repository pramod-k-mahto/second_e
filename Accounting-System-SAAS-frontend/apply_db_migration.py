
from sqlalchemy import create_engine, text
import os

DATABASE_URL = "sqlite:///../API/backend/sql_app.db" # Adjusted path for frontend context

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        # Add column with default True
        conn.execute(text("ALTER TABLE menu_template_menus ADD COLUMN is_sidebar_visible BOOLEAN DEFAULT 1 NOT NULL"))
        conn.commit()
        print("Successfully added is_sidebar_visible column.")
    except Exception as e:
        print(f"Error adding column: {e}")
