import psycopg2

conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE items ALTER COLUMN image_url TYPE TEXT;")
    print("Widened items.image_url to TEXT")
except Exception as e:
    print("image_url widen:", e)
    conn.rollback()

conn.commit()
cur.close()
conn.close()
print("Done.")
