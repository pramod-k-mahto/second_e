# maintenance_repost_vouchers.py
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.database import SessionLocal
from app import models
from app.routers import sales

def repost_sales_vouchers(db: Session):
    companies = db.query(models.Company).all()
    for company in companies:
        company_id = company.id
        print(f"[SALES REPOST] Processing Company {company_id} - {company.name}")

        invoices = (
            db.query(models.SalesInvoice)
            .filter(models.SalesInvoice.company_id == company_id)
            .all()
        )

        for invoice in invoices:
            if not invoice.voucher_id:
                continue

            voucher = db.query(models.Voucher).get(invoice.voucher_id)
            if not voucher:
                continue

            print(f"  Re-posting Invoice {invoice.id} (Voucher {voucher.id})")
            
            # Re-build voucher using the NEW logic (which prioritizes Item Ledger)
            try:
                sales._build_sales_voucher(
                    db,
                    company_id,
                    invoice,
                    payment_mode_id=voucher.payment_mode_id,
                    sales_ledger_id=invoice.sales_ledger_id,
                    output_tax_ledger_id=invoice.output_tax_ledger_id,
                    existing_voucher=voucher 
                )
                db.flush()
            except HTTPException as exc:
                print(f"    FAILED to repost invoice {invoice.id}: {exc.detail}")
            except Exception as e:
                print(f"    ERROR reposting invoice {invoice.id}: {e}")

        db.commit()
    print("Reposting complete.")

if __name__ == "__main__":
    db = SessionLocal()
    try:
        repost_sales_vouchers(db)
    finally:
        db.close()
