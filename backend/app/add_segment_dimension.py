import psycopg2

try:
    conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
    conn.autocommit = True
    cursor = conn.cursor()
    
    print("Starting migration: Adding Segment dimension...")

    # 1. Create segments table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS segments (
            id SERIAL PRIMARY KEY,
            company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
            name TEXT NOT NULL,
            code TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        );
    """)
    print("Created table: segments")

    # 2. Add segment_id to relevant tables
    tables = [
        "vouchers",
        "voucher_lines",
        "warehouses",
        "sales_invoices",
        "sales_invoice_lines",
        "purchase_bills",
        "purchase_bill_lines",
        "sales_returns",
        "sales_return_lines",
        "purchase_returns",
        "purchase_return_lines",
        "employees"
    ]

    for table in tables:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN segment_id INTEGER REFERENCES segments(id) ON DELETE SET NULL;")
            print(f"Added segment_id to table: {table}")
        except psycopg2.errors.DuplicateColumn:
            print(f"Column segment_id already exists in table: {table}")
        except Exception as e:
            print(f"Error adding column to {table}: {e}")

    print("Migration completed successfully.")

except Exception as e:
    print(f"Migration Error: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
