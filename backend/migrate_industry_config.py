# backend/migrate_industry_config.py

import os
import psycopg2
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost:5432/db")
if "postgresql+psycopg2://" in DATABASE_URL:
    DATABASE_URL = DATABASE_URL.replace("postgresql+psycopg2://", "postgresql://")

def migrate():
    print(f"Connecting to database at {DATABASE_URL}...")
    try:
        conn = psycopg2.connect(DATABASE_URL)
        cur = conn.cursor()

        # 1. Create business_types table
        print("Creating business_types table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS business_types (
                id SERIAL PRIMARY KEY,
                code VARCHAR(100) UNIQUE NOT NULL,
                name VARCHAR(255) NOT NULL,
                description TEXT,
                default_menu_template_id INTEGER REFERENCES menu_templates(id),
                is_active BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
        """)

        # Ensure default_menu_template_id column exists
        cur.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='business_types' AND column_name='default_menu_template_id') THEN
                    ALTER TABLE business_types ADD COLUMN default_menu_template_id INTEGER REFERENCES menu_templates(id);
                END IF;
            END $$;
        """)

        # 2. Create business_type_features table
        print("Creating business_type_features table...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS business_type_features (
                id SERIAL PRIMARY KEY,
                business_type_id INTEGER REFERENCES business_types(id) ON DELETE CASCADE,
                feature_code VARCHAR(100) NOT NULL,
                is_enabled BOOLEAN DEFAULT TRUE,
                config JSONB,
                UNIQUE(business_type_id, feature_code)
            );
        """)

        # 3. Add business_type_id to tenants
        print("Adding business_type_id to tenants...")
        cur.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tenants' AND column_name='business_type_id') THEN
                    ALTER TABLE tenants ADD COLUMN business_type_id INTEGER REFERENCES business_types(id);
                END IF;
            END $$;
        """)

        # 4. Add business_type_id to companies
        print("Adding business_type_id to companies...")
        cur.execute("""
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='companies' AND column_name='business_type_id') THEN
                    ALTER TABLE companies ADD COLUMN business_type_id INTEGER REFERENCES business_types(id);
                END IF;
            END $$;
        """)

        # 5. Seed initial business types
        print("Seeding initial business types...")
        initial_types = [
            ('GENERAL', 'General Business', 'Standard business accounting and inventory management.'),
            ('PHARMACY', 'Pharmacy', 'Industry-specific features for medical stores, drug tracking, and expiry management.'),
            ('RETAIL', 'Retail Shop', 'Point of Sale, inventory barcodes, and retail management.'),
            ('RESTAURANT', 'Restaurant / Cafe', 'Table management, KDS, and ingredient tracking.'),
            ('GARMENT', 'Garment Shop', 'Size, color, and textile variant management.')
        ]
        
        for code, name, desc in initial_types:
            cur.execute("""
                INSERT INTO business_types (code, name, description)
                VALUES (%s, %s, %s)
                ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
            """, (code, name, desc))

        conn.commit()
        print("Migration successful!")
        
        cur.close()
        conn.close()
    except Exception as e:
        print(f"Migration failed: {e}")

if __name__ == "__main__":
    migrate()
