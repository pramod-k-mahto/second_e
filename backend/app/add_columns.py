import psycopg2

try:
    conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("ALTER TABLE website_order_receipts ADD COLUMN transaction_id VARCHAR(255);")
    cursor.execute("ALTER TABLE website_order_receipts ADD COLUMN payment_screenshot TEXT;")
    print("Columns added successfully")
except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
