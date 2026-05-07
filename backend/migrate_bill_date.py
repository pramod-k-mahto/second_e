import psycopg2

def migrate():
    # Database connection string from add_columns.py
    # Change if your local environment is different
    db_url = "postgresql://postgres:admin@localhost:5432/account_system"
    
    try:
        print(f"Connecting to {db_url}...")
        conn = psycopg2.connect(db_url)
        conn.autocommit = True
        cursor = conn.cursor()
        
        tables = ["sales_invoices", "purchase_bills", "vouchers"]
        
        for table in tables:
            print(f"Migrating table: {table}")
            try:
                # Add bill_date column if it doesn't already exist
                # PostgreSQL support for ADD COLUMN IF NOT EXISTS requires PG 9.6+
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS bill_date DATE;")
                print(f"  Successfully added bill_date to {table} (or it already existed).")
            except Exception as table_err:
                print(f"  Error migrating {table}: {table_err}")
                
        cursor.close()
        conn.close()
        print("\nMigration completed successfully.")
        
    except Exception as e:
        print(f"Failed to connect or migrate: {e}")

if __name__ == "__main__":
    migrate()
