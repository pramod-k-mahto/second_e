
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
        res = conn.execute(text("SELECT id, name, menu_template_id FROM tenants"))
        tenants = res.fetchall()
        print("Tenants and Assigned Templates:")
        for tid, name, mtid in tenants:
            if mtid:
                res_mt = conn.execute(text(f"SELECT name FROM menu_templates WHERE id = {mtid}"))
                mt_name = res_mt.fetchone()[0]
                print(f"  Tenant: {name} (ID: {tid}) -> Template: {mt_name} (ID: {mtid})")
            else:
                print(f"  Tenant: {name} (ID: {tid}) -> Template: DEFAULT")
except Exception as e:
    print(f"Failed: {e}")
