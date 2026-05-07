import os
import sys
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Add the current directory to sys.path to allow imports from app
sys.path.append(os.getcwd())

from app import models
from app.config import get_settings

def verify_bank_mappings():
    settings = get_settings()
    engine = create_engine(settings.database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        companies = db.query(models.Company).order_by(models.Company.id).all()
        print(f"{'Company ID':<12} | {'Company Name':<30} | {'Payment Mode':<15} | {'Mapped Ledger ID':<15} | {'Ledger Name'}")
        print("-" * 100)

        for company in companies:
            # Focus on Payment Modes that contain "Bank" or are named "Bank"
            bank_pms = db.query(models.PaymentMode).filter(
                models.PaymentMode.company_id == company.id,
                models.PaymentMode.name.ilike("%Bank%")
            ).all()

            for pm in bank_pms:
                ledger = db.query(models.Ledger).filter(models.Ledger.id == pm.ledger_id).first()
                ledger_name = ledger.name if ledger else "NOT FOUND"
                print(f"{company.id:<12} | {company.name[:30]:<30} | {pm.name:<15} | {pm.ledger_id:<15} | {ledger_name}")

        print("\nVerification complete.")

    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    verify_bank_mappings()
