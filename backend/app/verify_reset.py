import sys
from datetime import date
from sqlalchemy import text
from sqlalchemy.orm import Session

# Add the parent directory to sys.path so we can import app
import os
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app import models, schemas
from app.database import SessionLocal, engine
from app.routers.maintenance import reset_company_data
from app.routers.vouchers import create_voucher

def verify_reset():
    db = SessionLocal()
    try:
        # 1. Create a dummy tenant and company if none exist, or use existing
        tenant = db.query(models.Tenant).first()
        if not tenant:
            tenant = models.Tenant(name="Test Tenant", plan="trial")
            db.add(tenant)
            db.commit()
            db.refresh(tenant)
        
        user = db.query(models.User).filter(models.User.tenant_id == tenant.id).first()
        if not user:
            user = models.User(
                email="test_reset@example.com",
                full_name="Test User",
                password_hash="...",
                role=models.UserRole.superadmin,
                tenant_id=tenant.id
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            user.role = models.UserRole.superadmin
            db.add(user)
            db.commit()
            db.refresh(user)

        company = models.Company(
            name="Testing Reset Co",
            tenant_id=tenant.id,
            owner_id=user.id
        )
        db.add(company)
        db.commit()
        db.refresh(company)
        
        print(f"Created company {company.id} for testing.")

        # 2. Seed some master data
        group = models.LedgerGroup(company_id=company.id, name="Test Assets", group_type=models.LedgerGroupType.ASSET)
        db.add(group)
        db.commit()
        db.refresh(group)
        
        ledger1 = models.Ledger(company_id=company.id, group_id=group.id, name="Cash", opening_balance=0)
        ledger2 = models.Ledger(company_id=company.id, group_id=group.id, name="Sales", opening_balance=0)
        db.add_all([ledger1, ledger2])
        db.commit()
        db.refresh(ledger1)
        db.refresh(ledger2)

        # 3. Create transactional data (Voucher)
        v_in = schemas.VoucherCreate(
            voucher_date=date.today(),
            voucher_type=models.VoucherType.JOURNAL,
            lines=[
                schemas.VoucherLineCreate(ledger_id=ledger1.id, debit=100.0, credit=0.0),
                schemas.VoucherLineCreate(ledger_id=ledger2.id, debit=0.0, credit=100.0),
            ],
            narration="Test Voucher"
        )
        create_voucher(company.id, v_in, db, user)
        print("Created test voucher.")

        # Verify voucher exists
        count = db.query(models.Voucher).filter(models.Voucher.company_id == company.id).count()
        assert count > 0, "Voucher should exist before reset"

        # 4. Perform Reset
        reset_payload = schemas.CompanyResetRequest(confirm=True)
        print("Executing reset...")
        reset_company_data(company.id, reset_payload, db, user, company)

        # 5. Verify Cleanup
        voucher_count = db.query(models.Voucher).filter(models.Voucher.company_id == company.id).count()
        log_count = db.query(models.VoucherLog).filter(models.VoucherLog.company_id == company.id).count()
        ledger_count = db.query(models.Ledger).filter(models.Ledger.company_id == company.id).count()
        
        print(f"Vouchers after reset: {voucher_count}")
        print(f"Voucher Logs after reset: {log_count}")
        print(f"Ledgers after reset: {ledger_count}")
        
        assert voucher_count == 0, "All vouchers should be deleted"
        assert log_count == 0, "All voucher logs should be deleted"
        assert ledger_count > 0, "Master data (ledgers) should be preserved"
        
        print("Verification Successful!")

    finally:
        # Cleanup test company
        if company.id:
            # Delete everything referencing the company to avoid constraint errors in test script
            db.execute(text(f"DELETE FROM voucher_logs WHERE company_id = {company.id}"))
            db.execute(text(f"DELETE FROM vouchers WHERE company_id = {company.id}"))
            db.execute(text(f"DELETE FROM ledgers WHERE company_id = {company.id}"))
            db.execute(text(f"DELETE FROM ledger_groups WHERE company_id = {company.id}"))
            db.execute(text(f"DELETE FROM companies WHERE id = {company.id}"))
            db.commit()
        db.close()

if __name__ == "__main__":
    verify_reset()
