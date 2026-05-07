import os, sys
from sqlalchemy import create_engine
sys.path.append(os.path.join(os.getcwd(), "backend"))
from app.database import DATABASE_URL
from app import models
from sqlalchemy.orm import sessionmaker

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

menus = db.query(models.Menu.code).all()
for m in menus:
    print(m.code)
db.close()
