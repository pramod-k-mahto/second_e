import psycopg2

conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
cur = conn.cursor()

# Widen payment_qr_url to support base64-encoded image data URLs.
try:
    cur.execute("ALTER TABLE company_settings ALTER COLUMN payment_qr_url TYPE TEXT;")
    print("Widened company_settings.payment_qr_url to TEXT")
except Exception as e:
    print("payment_qr_url widen:", e)
    conn.rollback()

conn.commit()
cur.close()
conn.close()
print("Done.")
