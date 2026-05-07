import pandas as pd
from sqlalchemy import create_engine, inspect
import os

DATABASE_URL = "postgresql+psycopg2://postgres:admin@localhost:5432/account_system"
engine = create_engine(DATABASE_URL)
inspector = inspect(engine)
tables = inspector.get_table_names()

output_dir = "supabase_csv_exports"
if not os.path.exists(output_dir):
    os.makedirs(output_dir)

for table in tables:
    try:
        print(f"Exporting {table}...")
        df = pd.read_sql_table(table, engine)
        df.to_csv(os.path.join(output_dir, f"{table}.csv"), index=False)
        print(f"Successfully exported {table}.csv")
    except Exception as e:
        print(f"Error exporting {table}: {e}")
print(f"All exports completed. Check the {output_dir} folder.")
