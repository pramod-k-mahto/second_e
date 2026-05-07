import psycopg2

try:
    conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
    conn.autocommit = True
    cursor = conn.cursor()
    
    # Check if table exists (items)
    cursor.execute("SELECT to_regclass('public.items');")
    if cursor.fetchone()[0]:
        # Check if column exists
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='items' AND column_name='duty_tax_id';")
        if not cursor.fetchone():
            print("Adding duty_tax_id to items table...")
            cursor.execute("ALTER TABLE items ADD COLUMN duty_tax_id INTEGER REFERENCES duty_taxes(id) ON DELETE SET NULL;")
            print("Successfully added duty_tax_id to items table.")
        else:
            print("Column duty_tax_id already exists in items table.")
    else:
        print("Table items does not exist.")

except Exception as e:
    print(f"Error: {e}")
finally:
    if 'conn' in locals() and conn:
        conn.close()
