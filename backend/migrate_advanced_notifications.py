from sqlalchemy import text
from app.database import engine

def migrate():
    with engine.begin() as conn:
        print("Adding advanced notification columns...")
        
        # OutboundMessage scheduling
        try:
            conn.execute(text("ALTER TABLE outbound_messages ADD COLUMN scheduled_for TIMESTAMP WITH TIME ZONE"))
            print("Added scheduled_for to outbound_messages")
        except Exception:
            print("scheduled_for already exists or error")

        # CompanySettings advanced fields
        cols = [
            ("notify_on_order_placed", "BOOLEAN DEFAULT FALSE"),
            ("notify_on_payment_received", "BOOLEAN DEFAULT FALSE"),
            ("notify_on_overdue", "BOOLEAN DEFAULT FALSE"),
            ("overdue_reminders", "JSONB"),
            ("message_templates", "JSONB")
        ]
        
        for col, col_type in cols:
            try:
                conn.execute(text(f"ALTER TABLE company_settings ADD COLUMN {col} {col_type}"))
                print(f"Added {col} to company_settings")
            except Exception:
                print(f"{col} already exists or error")

if __name__ == "__main__":
    migrate()
