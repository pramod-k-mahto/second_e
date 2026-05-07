
import psycopg2
import os

# Database connection details
DB_URL = "postgresql://postgres:admin@localhost:5432/account_system"

def migrate():
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        
        # Add columns if they don't exist
        cur.execute("""
            ALTER TABLE items 
            ADD COLUMN IF NOT EXISTS depreciation_rate NUMERIC(5, 2),
            ADD COLUMN IF NOT EXISTS depreciation_method VARCHAR(50);
        """)
        
        conn.commit()
        print("Migration successful: added depreciation_rate and depreciation_method to items table.")
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
