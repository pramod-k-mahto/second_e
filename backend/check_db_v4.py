import psycopg2
import sys

try:
    conn = psycopg2.connect("postgresql://postgres@127.0.0.1:54322/postgres")
    cur = conn.cursor()
    cur.execute("SELECT id, email, role, tenant_id FROM users;")
    rows = cur.fetchall()
    print("ID | Email | Role | Tenant ID")
    print("---|---|---|---")
    for row in rows:
        print(f"{row[0]} | {row[1]} | {row[2]} | {row[3]}")
    cur.close()
    conn.close()
except Exception as e:
    print(f"Error: {e}")
    sys.exit(1)
