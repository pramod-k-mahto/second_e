import sys
import os
from sqlalchemy import create_engine, text

# Add current directory to path so we can import app
sys.path.append(os.path.abspath(os.path.dirname(__file__)))

from app.config import get_settings

def add_columns():
    settings = get_settings()
    print(f"Connecting to DB: {settings.database_url}")
    engine = create_engine(settings.database_url)

    with engine.connect() as conn:
        try:
            # Add column to sales_invoices
            check_sales = text("SELECT column_name FROM information_schema.columns WHERE table_name='sales_invoices' AND column_name='payment_ledger_id'")
            if not conn.execute(check_sales).fetchone():
                print("Adding 'payment_ledger_id' to 'sales_invoices'...")
                conn.execute(text("ALTER TABLE sales_invoices ADD COLUMN payment_ledger_id INTEGER REFERENCES ledgers(id)"))
            else:
                print("'payment_ledger_id' already exists in 'sales_invoices'.")

            # Add column to purchase_bills
            check_purchases = text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_bills' AND column_name='payment_ledger_id'")
            if not conn.execute(check_purchases).fetchone():
                print("Adding 'payment_ledger_id' to 'purchase_bills'...")
                conn.execute(text("ALTER TABLE purchase_bills ADD COLUMN payment_ledger_id INTEGER REFERENCES ledgers(id)"))
            else:
                print("'payment_ledger_id' already exists in 'purchase_bills'.")

            # Add column to sales_returns
            check_sales_returns = text("SELECT column_name FROM information_schema.columns WHERE table_name='sales_returns' AND column_name='payment_ledger_id'")
            if not conn.execute(check_sales_returns).fetchone():
                print("Adding 'payment_ledger_id' to 'sales_returns'...")
                conn.execute(text("ALTER TABLE sales_returns ADD COLUMN payment_ledger_id INTEGER REFERENCES ledgers(id)"))
            else:
                print("'payment_ledger_id' already exists in 'sales_returns'.")

            # Add column to purchase_returns
            check_purchase_returns = text("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_returns' AND column_name='payment_ledger_id'")
            if not conn.execute(check_purchase_returns).fetchone():
                print("Adding 'payment_ledger_id' to 'purchase_returns'...")
                conn.execute(text("ALTER TABLE purchase_returns ADD COLUMN payment_ledger_id INTEGER REFERENCES ledgers(id)"))
            else:
                print("'payment_ledger_id' already exists in 'purchase_returns'.")

            conn.commit()
            print("Schema update completed successfully.")
        except Exception as e:
            print(f"Error updating schema: {e}")

if __name__ == "__main__":
    add_columns()
