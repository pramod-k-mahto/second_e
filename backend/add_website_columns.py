import psycopg2

conn = psycopg2.connect("postgresql://postgres:admin@localhost:5432/account_system")
cur = conn.cursor()

try:
    cur.execute("ALTER TABLE company_settings ADD COLUMN website_api_key VARCHAR(255) NULL;")
    print("Added website_api_key")
except Exception as e:
    print(e)
    conn.rollback()

try:
    cur.execute("ALTER TABLE company_settings ADD COLUMN website_api_secret VARCHAR(255) NULL;")
    print("Added website_api_secret")
except Exception as e:
    print(e)
    conn.rollback()

conn.commit()
cur.close()
conn.close()
