
import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Load .env
env_path = Path(r"d:\Accounting System\API\backend\.env")
load_dotenv(dotenv_path=env_path)

DATABASE_URL = os.getenv("DATABASE_URL")
import re
match = re.match(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^:]+):(\d+)/(.+)", DATABASE_URL)
if not match: match = re.match(r"postgresql\+psycopg2://([^:]+):([^@]+)@([^/]+)/(.+)", DATABASE_URL)
user, password, host, port, dbname = match.groups()

try:
    conn = psycopg2.connect(dbname=dbname, user=user, password=password, host=host, port=port)
    cur = conn.cursor()
    
    # 1. Templates with hidden items
    cur.execute("SELECT mt.id, mt.name, (SELECT count(*) FROM menu_template_menus WHERE template_id = mt.id AND is_sidebar_visible = FALSE) FROM menu_templates mt")
    for tid, tname, hcount in cur.fetchall():
        if hcount > 0:
            print(f"Template ID {tid} ('{tname}') has {hcount} hidden items.")
        else:
            print(f"Template ID {tid} ('{tname}') has 0 hidden items.")
            
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
