import psycopg2

conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
conn.autocommit = True
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE items ADD COLUMN field_metadata JSONB NULL;")
    print("Added field_metadata (JSONB) to items table.")
except Exception as e:
    print("Error:", e)

cur.close()
conn.close()
