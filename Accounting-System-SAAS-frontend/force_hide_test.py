
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
from pathlib import Path

env_path = Path(r"d:\Accounting System\API\backend\.env")
load_dotenv(dotenv_path=env_path)
DATABASE_URL = os.getenv("DATABASE_URL")

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        # Pick the latest template
        res = conn.execute(text("SELECT id FROM menu_templates ORDER BY id DESC LIMIT 1"))
        tid = res.fetchone()[0]
        
        # Pick an item in that template
        res_item = conn.execute(text(f"SELECT menu_id FROM menu_template_menus WHERE template_id = {tid} LIMIT 1"))
        mid = res_item.fetchone()[0]
        
        print(f"Force-hiding item {mid} in template {tid}...")
        conn.execute(text(f"UPDATE menu_template_menus SET is_sidebar_visible = false WHERE template_id = {tid} AND menu_id = {mid}"))
        conn.commit()
        
        # Now verify it was saved
        res_verify = conn.execute(text(f"SELECT is_sidebar_visible FROM menu_template_menus WHERE template_id = {tid} AND menu_id = {mid}"))
        val = res_verify.fetchone()[0]
        print(f"Verification: is_sidebar_visible = {val}")
        
except Exception as e:
    print(f"Failed: {e}")
