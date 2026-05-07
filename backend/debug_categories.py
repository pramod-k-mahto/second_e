
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
import sys
import os

# Add the backend app to the path so we can import models
sys.path.append(os.path.abspath(os.path.join(os.getcwd(), "API", "backend")))

from app.database import SQLALCHEMY_DATABASE_URL
from app import models

engine = create_engine(SQLALCHEMY_DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
db = SessionLocal()

try:
    items = db.query(models.Item.id, models.Item.name, models.Item.category).all()
    print("Items and Categories:")
    for item in items:
        print(f"ID: {item.id}, Name: {item.name}, Category: '{item.category}'")
finally:
    db.close()
