
from sqlalchemy import create_engine, text
import os

# Absolute path to the database
DATABASE_PATH = r"d:\Accounting System\API\backend\sql_app.db"
DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

print(f"Checking data in: {DATABASE_PATH}")

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        # Check all items in all templates that have is_sidebar_visible = False (0)
        result = conn.execute(text("SELECT template_id, menu_id, is_sidebar_visible FROM menu_template_menus WHERE is_sidebar_visible = 0"))
        rows = result.fetchall()
        if not rows:
            print("NO HIDDEN ITEMS FOUND IN THE DATABASE (everything is set to True).")
        else:
            print(f"Found {len(rows)} hidden items:")
            for tid, mid, vis in rows:
                print(f"Template: {tid}, Menu: {mid}, Visible: {vis}")
                
        # Check the template names
        result = conn.execute(text("SELECT id, name FROM menu_templates"))
        for tid, name in result:
             print(f"Available Template: {name} (ID: {tid})")
            
    except Exception as e:
        print(f"Error: {e}")
