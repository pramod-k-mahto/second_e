from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.begin() as conn:
        print("Adding notification columns to company_settings...")
        
        # notify_on_dispatch
        try:
            conn.execute(text("ALTER TABLE company_settings ADD COLUMN notify_on_dispatch BOOLEAN DEFAULT FALSE"))
            print("Added notify_on_dispatch")
        except Exception:
            print("notify_on_dispatch already exists or error")

        # notify_on_delivery
        try:
            conn.execute(text("ALTER TABLE company_settings ADD COLUMN notify_on_delivery BOOLEAN DEFAULT FALSE"))
            print("Added notify_on_delivery")
        except Exception:
            print("notify_on_delivery already exists or error")

        # smtp_config
        try:
            conn.execute(text("ALTER TABLE company_settings ADD COLUMN smtp_config JSONB"))
            print("Added smtp_config")
        except Exception:
            print("smtp_config already exists or error")

        # whatsapp_config
        try:
            conn.execute(text("ALTER TABLE company_settings ADD COLUMN whatsapp_config JSONB"))
            print("Added whatsapp_config")
        except Exception:
            print("whatsapp_config already exists or error")

if __name__ == "__main__":
    migrate()
