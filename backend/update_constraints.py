from app.database import engine
from sqlalchemy import text

with engine.begin() as conn:
    print("Dropping constraints...")
    conn.execute(text("ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_converted_to_invoice_id_fkey;"))
    conn.execute(text("ALTER TABLE purchase_orders DROP CONSTRAINT IF EXISTS purchase_orders_converted_to_bill_id_fkey;"))
    conn.execute(text("ALTER TABLE sales_returns DROP CONSTRAINT IF EXISTS sales_returns_source_invoice_id_fkey;"))
    conn.execute(text("ALTER TABLE purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_source_bill_id_fkey;"))

    print("Adding constraints...")
    conn.execute(text("ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_converted_to_invoice_id_fkey FOREIGN KEY (converted_to_invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL;"))
    conn.execute(text("ALTER TABLE purchase_orders ADD CONSTRAINT purchase_orders_converted_to_bill_id_fkey FOREIGN KEY (converted_to_bill_id) REFERENCES purchase_bills(id) ON DELETE SET NULL;"))
    conn.execute(text("ALTER TABLE sales_returns ADD CONSTRAINT sales_returns_source_invoice_id_fkey FOREIGN KEY (source_invoice_id) REFERENCES sales_invoices(id) ON DELETE SET NULL;"))
    conn.execute(text("ALTER TABLE purchase_returns ADD CONSTRAINT purchase_returns_source_bill_id_fkey FOREIGN KEY (source_bill_id) REFERENCES purchase_bills(id) ON DELETE SET NULL;"))
    
    print("Done")
