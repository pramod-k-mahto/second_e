import psycopg2

def check_and_fix_db():
    try:
        conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
        conn.autocommit = True
        cursor = conn.cursor()
        
        # Check purchase_bill_lines
        cursor.execute("SELECT column_name FROM information_schema.columns WHERE table_name='purchase_bill_lines';")
        existing_cols = [r[0] for r in cursor.fetchall()]
        print(f"Existing columns in purchase_bill_lines: {existing_cols}")
        
        needed_cols = [
            ('duty_tax_id', 'INTEGER REFERENCES duty_taxes(id) ON DELETE SET NULL'),
            ('remarks', 'TEXT')
        ]
        
        for col_name, col_def in needed_cols:
            if col_name not in existing_cols:
                print(f"Adding {col_name} to purchase_bill_lines...")
                cursor.execute(f"ALTER TABLE purchase_bill_lines ADD COLUMN {col_name} {col_def};")
                print(f"Added {col_name} successfully.")
            else:
                print(f"Column {col_name} already exists in purchase_bill_lines.")
        
        conn.close()
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_and_fix_db()
