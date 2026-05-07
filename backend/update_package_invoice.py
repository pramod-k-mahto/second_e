from app.database import engine
from sqlalchemy import text

with engine.begin() as conn:
    print("Dropping constraint...")
    conn.execute(text("ALTER TABLE packages DROP CONSTRAINT IF EXISTS packages_invoice_id_fkey;"))

    print("Adding cascade constraint...")
    conn.execute(text("ALTER TABLE packages ADD CONSTRAINT packages_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES sales_invoices(id) ON DELETE CASCADE;"))
    
    print("Done")
