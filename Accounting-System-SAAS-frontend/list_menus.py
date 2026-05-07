from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)

def list_menus():
    with engine.connect() as conn:
        print("--- Menu List ---")
        result = conn.execute(text("SELECT id, code, label, module, is_active FROM menus ORDER BY module, sort_order"))
        for row in result:
            print(row)

if __name__ == "__main__":
    list_menus()
