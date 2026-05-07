import os
import sys
from sqlalchemy import MetaData

# Ensure 'app' is in PYTHONPATH if run directly
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

from app.database import engine
from app.models import DeliveryPlace, DeliveryPartner, Package

def create_tables():
    print("Creating Delivery Management tables if they don't exist...")
    
    # Using specific table creation to avoid accidentally dropping/recreating others
    DeliveryPlace.__table__.create(engine, checkfirst=True)
    print("Created delivery_places table.")
    
    DeliveryPartner.__table__.create(engine, checkfirst=True)
    print("Created delivery_partners table.")
    
    Package.__table__.create(engine, checkfirst=True)
    print("Created packages table.")
    
    print("All delivery tables have been verified/created.")

if __name__ == "__main__":
    create_tables()
