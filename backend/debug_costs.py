from app.database import SessionLocal
from app import models
from app.routers.sales import _compute_issue_unit_cost
from datetime import datetime

def debug_costs():
    db = SessionLocal()
    company_id = 14
    invoice_id = 96  # ID from previous command output
    
    print(f"Checking Invoice {invoice_id} for Company {company_id}")
    
    invoice = db.query(models.SalesInvoice).filter(models.SalesInvoice.id == invoice_id).first()
    if not invoice:
        print("Invoice not found")
        return

    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    
    print(f"Date: {invoice.date}")
    print(f"Voucher ID: {invoice.voucher_id}")
    
    # Check Stock Ledger entries
    ledgers = db.query(models.StockLedger).filter(
        models.StockLedger.source_type == "SALES_INVOICE",
        models.StockLedger.source_id == invoice_id,
        models.StockLedger.reversed_at.is_(None)
    ).all()
    
    print(f"\nStock Ledger Entries: {len(ledgers)}")
    for l in ledgers:
        print(f"  Item {l.item_id} Warehouse {l.warehouse_id}: Qty={l.qty_delta}, Cost={l.unit_cost}")

    print("\nRecalculating Costs:")
    for line in invoice.lines:
        posted_at = datetime.combine(invoice.date, datetime.min.time())
        cost = _compute_issue_unit_cost(
            db=db,
            company=company,
            company_id=company_id,
            item_id=line.item_id,
            warehouse_id=line.warehouse_id,
            as_of=posted_at,
            qty_out=float(line.quantity)
        )
        print(f"  Item {line.item_id}: Calculated Cost = {cost}")
        
    from app.routers.sales import _build_sales_voucher

    print(f"\nTesting _build_sales_voucher logic:")
    
    # We need to simulate the voucher build
    # Note: This will NOT commit, just print what it WOULD add
    # But _build_sales_voucher adds to DB session. We can inspect session.new
    
    # Remove existing lines from session awareness for cleanliness
    # actually, we just want to see if it generates lines.
    
    try:
        # Mocking or using NULL payment mode if needed
        pm_id = invoice.voucher.payment_mode_id if invoice.voucher else None
        
        # We need to fetch the voucher to pass it in, or let it create new one.
        # Let's pass the existing voucher.
        voucher = db.query(models.Voucher).filter(models.Voucher.id == int(invoice.voucher_id)).first()
        
        # Call the function
        # We need to be careful not to actually commit changes to DB in this debug script unless we want to.
        # Helper function modifies the DB session.
        
        # Let's ROLLBACK session first to ensure clean state
        db.rollback()
        # Re-fetch objects after rollback
        invoice = db.query(models.SalesInvoice).filter(models.SalesInvoice.id == invoice_id).first()
        voucher = db.query(models.Voucher).filter(models.Voucher.id == int(invoice.voucher_id)).first()
        
        print(f"Calling _build_sales_voucher for Invoice {invoice.id} Voucher {voucher.id}")
        
        updated_voucher = _build_sales_voucher(
            db,
            company_id,
            invoice,
            payment_mode_id=voucher.payment_mode_id,
            sales_ledger_id=invoice.sales_ledger_id,
            output_tax_ledger_id=invoice.output_tax_ledger_id,
            existing_voucher=voucher
        )
        
        print("Function returned.")
        
        # Inspect session.new or the voucher lines
        # Since _build_sales_voucher deletes existing lines and adds new ones
        # We should check what's in the session.
        
        print("\nSession Objects (New/Dirty):")
        for obj in db.new:
            if isinstance(obj, models.VoucherLine):
                lname = obj.ledger.name if obj.ledger else f"LedgerID={obj.ledger_id}"
                print(f"  [NEW] {lname}: Dr {obj.debit} Cr {obj.credit}")
        
        # Also check lines attached to voucher object
        print("\nVoucher Lines (in memory):")
        for line in updated_voucher.lines:
             print(f"  LedgerID={line.ledger_id}: Dr {line.debit} Cr {line.credit}")
             
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_costs()
