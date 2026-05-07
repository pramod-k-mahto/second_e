import sqlite3
import os

db_path = r'd:\Accounting System\API\backend\accounting.db'
if not os.path.exists(db_path):
    print(f"DB not found at {db_path}")
    exit(1)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute("SELECT id, email, role, is_active FROM users")
rows = cursor.fetchall()
for row in rows:
    print(row)
conn.close()
