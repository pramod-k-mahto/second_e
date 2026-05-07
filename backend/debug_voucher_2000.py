import sys
import os

# Add the backend directory to sys.path
sys.path = ["d:\\Accounting System\\API\\backend"] + sys.path

from app.database import SessionLocal
from app import models
from sqlalchemy.orm import joinedload

def debug_voucher_lines():
    db = SessionLocal()
    try:
        # We found Invoice 96 -> Voucher 329 in previous step
        voucher_id = 329 
        
        voucher = db.query(models.Voucher).filter(models.Voucher.id == voucher_id).options(joinedload(models.Voucher.lines).joinedload(models.VoucherLine.ledger)).first()
        
        if not voucher:
             # Fallback if hardcoded ID doesn't exist (e.g. different DB)
             voucher = db.query(models.Voucher).order_by(models.Voucher.id.desc()).first()
             print(f"Using last voucher: {voucher.id}")

        print(f"Voucher ID: {voucher.id}")
        print(f"Date: {voucher.voucher_date}")
        print(f"Type: {voucher.voucher_type}")
        print("-" * 60)
        print(f"{'Ledger':<30} | {'Debit':<10} | {'Credit':<10} | {'Group':<20}")
        print("-" * 60)
        
        for line in voucher.lines:
            ledger_name = line.ledger.name
            group_name = line.ledger.group.name if line.ledger.group else "N/A"
            print(f"{ledger_name:<30} | {float(line.debit):<10} | {float(line.credit):<10} | {group_name:<20}")

    finally:
        db.close()

if __name__ == "__main__":
    debug_voucher_lines()
