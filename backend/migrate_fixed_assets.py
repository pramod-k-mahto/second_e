import sqlite3
import os

db_path = r"d:\Accounting System\API\db\accounting.db"

def migrate():
    if not os.path.exists(db_path):
        print(f"Database not found at {db_path}")
        return

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # Check if column already exists
        cursor.execute("PRAGMA table_info(items)")
        columns = [column[1] for column in cursor.fetchall()]
        
        if "is_fixed_asset" not in columns:
            print("Adding is_fixed_asset column to items table...")
            cursor.execute("ALTER TABLE items ADD COLUMN is_fixed_asset BOOLEAN DEFAULT 0")
            print("Column added successfully.")
        else:
            print("Column is_fixed_asset already exists.")
            
        conn.commit()
    except Exception as e:
        print(f"Error during migration: {e}")
        conn.rollback()
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
