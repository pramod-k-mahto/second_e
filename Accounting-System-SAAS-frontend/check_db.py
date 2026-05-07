
import os
import sys

# Add the API folder to sys.path
sys.path.append(r"d:\Accounting System\API")

from backend.app.database import SessionLocal
from backend.app import models

db = SessionLocal()
try:
    orders = db.query(models.ProductionOrder).all()
    print(f"Total Production Orders: {len(orders)}")
    for o in orders:
        print(f"ID: {o.id}, Company ID: {o.company_id}, Status: {o.status}")
    
    menus = db.query(models.Menu).filter(models.Menu.code == "manufacturing.production_costing").first()
    print(f"Menu 'manufacturing.production_costing' exists: {menus is not None}")
finally:
    db.close()
