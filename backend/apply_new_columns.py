import psycopg2

conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
cur = conn.cursor()

# Migration 1: delivery_charge on items
try:
    cur.execute("ALTER TABLE items ADD COLUMN delivery_charge NUMERIC(14,2) NULL;")
    print("Added items.delivery_charge")
except Exception as e:
    print("items.delivery_charge:", e)
    conn.rollback()

# Migration 2: payment_qr_url on company_settings
try:
    cur.execute("ALTER TABLE company_settings ADD COLUMN payment_qr_url VARCHAR(500) NULL;")
    print("Added company_settings.payment_qr_url")
except Exception as e:
    print("company_settings.payment_qr_url:", e)
    conn.rollback()

conn.commit()
cur.close()
conn.close()
print("Done.")
