
import os
import psycopg2
from dotenv import load_dotenv
from pathlib import Path

# Load .env to get the Postgres URL
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
    
    # 1. Get all templates and their hidden items count
    cur.execute("SELECT mt.id, mt.name, (SELECT count(*) FROM menu_template_menus WHERE template_id = mt.id AND is_sidebar_visible = FALSE) FROM menu_templates mt")
    templates = cur.fetchall()
    print("Templates and Hidden Items:")
    for tid, tname, hcount in templates:
        print(f"  ID: {tid}, Name: {tname}, Hidden: {hcount}")
        
    # 2. Get all companies and their assigned template (via tenant)
    cur.execute("""
        SELECT c.id, c.name, t.menu_template_id, mt.name 
        FROM companies c 
        JOIN tenants t ON c.tenant_id = t.id 
        LEFT JOIN menu_templates mt ON t.menu_template_id = mt.id
    """)
    companies = cur.fetchall()
    print("\nCompanies and their Assigned Templates:")
    for cid, cname, tid, tname in companies:
        print(f"  CompID: {cid}, Name: {cname}, Template: {tname or 'DEFAULT'} (ID: {tid or 'N/A'})")
        
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
