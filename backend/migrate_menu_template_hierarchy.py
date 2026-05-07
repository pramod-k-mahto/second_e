import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get connection string from environment or use default
database_url = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:admin@localhost:5432/account_system"
)

# Fix connection string for psycopg2 (replace postgresql+psycopg2 with postgresql)
if database_url.startswith("postgresql+psycopg2://"):
    database_url = database_url.replace("postgresql+psycopg2://", "postgresql://", 1)

def migrate():
    print(f"Connecting to database at {database_url}...")
    try:
        conn = psycopg2.connect(database_url)
        cursor = conn.cursor()

        # Check if parent_id column exists in menu_template_menus
        cursor.execute("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='menu_template_menus' AND column_name='parent_id';
        """)
        
        if not cursor.fetchone():
            print("Adding parent_id column to menu_template_menus table...")
            cursor.execute("ALTER TABLE menu_template_menus ADD COLUMN parent_id INTEGER REFERENCES menus(id)")
            print("Column parent_id added successfully.")
        else:
            print("Column parent_id already exists in menu_template_menus.")
            
        conn.commit()
    except Exception as e:
        print(f"Error during migration: {e}")
    finally:
        if 'conn' in locals() and conn:
            conn.close()

if __name__ == "__main__":
    migrate()
