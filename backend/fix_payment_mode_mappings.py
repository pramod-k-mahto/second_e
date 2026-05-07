import os
import sys
from sqlalchemy import create_engine, or_, not_
from sqlalchemy.orm import sessionmaker

# Add the current directory to sys.path to allow imports from app
sys.path.append(os.getcwd())

from app import models
from app.config import get_settings

def fix_payment_mode_mappings():
    settings = get_settings()
    engine = create_engine(settings.database_url)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = SessionLocal()

    try:
        # 1. Get all companies
        companies = db.query(models.Company).all()
        print(f"Checking {len(companies)} companies...")

        for company in companies:
            # 2. Find the "Bank" payment mode for this company
            bank_pms = db.query(models.PaymentMode).filter(
                models.PaymentMode.company_id == company.id,
                models.PaymentMode.name.ilike("%Bank%")
            ).all()

            for bank_pm in bank_pms:
                # 3. Check if it points to a placeholder or invalid ledger
                current_ledger = db.query(models.Ledger).filter(models.Ledger.id == bank_pm.ledger_id).first()
                if current_ledger and "Placeholder" not in current_ledger.name:
                    # Already points to a real bank (presumably)
                    continue

                print(f"Company: {company.name} (ID: {company.id}) has '{bank_pm.name}' pointing to placeholder '{current_ledger.name if current_ledger else 'NULL'}'")

                # 4. Find potential "real" bank ledgers (ignore placeholder)
                real_banks = db.query(models.Ledger).filter(
                    models.Ledger.company_id == company.id,
                    models.Ledger.name.ilike("%Bank%"),
                    not_(models.Ledger.name.ilike("%Placeholder%"))
                ).all()

                if len(real_banks) == 0:
                    print("  - No real bank accounts (with 'Bank' in name) found yet.")
                elif len(real_banks) == 1:
                    real_bank = real_banks[0]
                    print(f"  - FIXED: Re-linking '{bank_pm.name}' PaymentMode to '{real_bank.name}' (ID: {real_bank.id})")
                    bank_pm.ledger_id = real_bank.id
                    db.add(bank_pm)
                else:
                    # If multiple, try to find one that doesn't say "A/C" or sounds more specific
                    print(f"  - MULTIPLE banks found ({[b.name for b in real_banks]}). Manual selection required via UI.")

        db.commit()
        print("\nMigration completed successfully.")

    except Exception as e:
        db.rollback()
        print(f"Error during migration: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    fix_payment_mode_mappings()
