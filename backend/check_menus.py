from app.database import SessionLocal
from app import models

db = SessionLocal()
try:
    menus = db.query(models.Menu).all()
    print(f"Total menus: {len(menus)}")
    for m in menus[:10]:
        print(f"ID: {m.id}, Code: {m.code}, Label: {m.label}, Module: {m.module}")
finally:
    db.close()
