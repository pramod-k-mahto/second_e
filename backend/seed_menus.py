from app.database import SessionLocal
from app.menu_defaults import upsert_default_menus

db = SessionLocal()
try:
    print("Seeding menus...")
    upsert_default_menus(db)
    print("Done!")
finally:
    db.close()
