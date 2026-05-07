import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def check_audit_logs():
    settings = get_settings()
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        print("--- RECENT AUDIT LOGS ---")
        logs = conn.execute(text("SELECT id, user_id, action, message, created_at FROM audit_logs ORDER BY id DESC LIMIT 50")).fetchall()
        for l in logs:
            print(f"ID: {l.id}, User ID: {l.user_id}, Action: {l.action}, Message: {l.message}, Created At: {l.created_at}")

if __name__ == "__main__":
    check_audit_logs()
