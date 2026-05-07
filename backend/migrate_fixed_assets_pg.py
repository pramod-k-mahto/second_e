import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables if any
load_dotenv()

# Get connection string from environment or use default
database_url = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:admin@localhost:5432/account_system"
)

def migrate():
    print(f"Connecting to database at {database_url}...")
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()

        # Check if column already exists
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='items' AND column_name='is_fixed_asset';
        """)
        
        if not cursor.fetchone():
            print("Adding is_fixed_asset column to items table...")
            cursor.execute("ALTER TABLE items ADD COLUMN is_fixed_asset BOOLEAN DEFAULT FALSE")
            print("Column added successfully.")
        else:
            print("Column is_fixed_asset already exists.")
            
        conn.commit()
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    migrate()
