
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
        # Get all templates to find the one we modified
        res = conn.execute(text("SELECT id, name FROM menu_templates ORDER BY id DESC LIMIT 5"))
        templates = res.fetchall()
        for tid, tname in templates:
            print(f"Template: {tname} (ID: {tid})")
            # Get items where visibility is False
            res_items = conn.execute(text(f"SELECT m.code, m.label, mtm.is_sidebar_visible FROM menu_template_menus mtm JOIN menus m ON m.id = mtm.menu_id WHERE mtm.template_id = {tid}"))
            items = res_items.fetchall()
            hidden_count = sum(1 for i in items if not i[2])
            total_count = len(items)
            print(f"  Total Items: {total_count}, Hidden Items: {hidden_count}")
            if hidden_count > 0:
                print("  Hidden Items:")
                for code, label, vis in items:
                    if not vis:
                        print(f"    - {label} ({code})")
except Exception as e:
    print(f"Failed: {e}")
