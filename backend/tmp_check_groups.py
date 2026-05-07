from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app import models

# assuming backend/app is the path
DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/accounting_db"
engine = create_engine(DATABASE_URL)
Session = sessionmaker(bind=engine)
db = Session()

groups = db.query(models.LedgerGroup).all()
for g in groups:
    print(f"ID: {g.id}, Name: {g.name}, Type: {g.group_type}, Parent: {g.parent_group_id}")

ledgers = db.query(models.Ledger).filter(models.Ledger.name.ilike('%Capital%')).all()
for l in ledgers:
    print(f"Ledger ID: {l.id}, Name: {l.name}, Group ID: {l.group_id}")
