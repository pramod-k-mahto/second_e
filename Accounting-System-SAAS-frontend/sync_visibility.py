
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
    
    # 1. Get hidden items from Template 5 (Restaurant)
    cur.execute("SELECT menu_id FROM menu_template_menus WHERE template_id = 5 AND is_sidebar_visible = FALSE")
    hidden_mids = [row[0] for row in cur.fetchall()]
    
    if hidden_mids:
        print(f"Found {len(hidden_mids)} hidden items in Template 5. Applying to Template 4 (Standard)...")
        # 2. Update Template 4 for these menu_ids
        for mid in hidden_mids:
            cur.execute("UPDATE menu_template_menus SET is_sidebar_visible = FALSE WHERE template_id = 4 AND menu_id = %s", (mid,))
        
        conn.commit()
        print("Successfully synchronized Template 4 visibility with Template 5.")
    else:
        print("No hidden items found in Template 5 to synchronize.")
        
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
