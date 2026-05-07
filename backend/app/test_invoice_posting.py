from datetime import date
import pytest
from sqlalchemy import create_engine, JSON
from sqlalchemy.orm import sessionmaker
from sqlalchemy.dialects import postgresql
from fastapi import HTTPException

# Monkeypatch JSONB for SQLite testing
postgresql.JSONB = JSON

# Mocking the database setup
from .database import Base
from . import models
from .routers.sales import _build_sales_voucher

@pytest.fixture()
def db_session():
    engine = create_engine("sqlite+pysqlite:///:memory:", future=True)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

def test_invoice_ledger_override(db_session):
    # Setup
    company_id = 1
    
    # Ledger Group
    group = models.LedgerGroup(company_id=company_id, name="Sales Group", group_type=models.LedgerGroupType.INCOME)
    db_session.add(group)
    db_session.flush()
    
    # Ledgers
    l_sales_header = models.Ledger(company_id=company_id, group_id=group.id, name="Header Sales", opening_balance=0, opening_balance_type=models.OpeningBalanceType.DEBIT)
    l_item_income = models.Ledger(company_id=company_id, group_id=group.id, name="Item Income", opening_balance=0, opening_balance_type=models.OpeningBalanceType.DEBIT)
    l_customer = models.Ledger(company_id=company_id, group_id=group.id, name="Customer", opening_balance=0, opening_balance_type=models.OpeningBalanceType.DEBIT)
    
    db_session.add_all([l_sales_header, l_item_income, l_customer])
    db_session.flush()
    
    # Customer
    customer = models.Customer(company_id=company_id, name="Cust", ledger_id=l_customer.id)
    db_session.add(customer)
    
    # Item with specific income ledger
    item = models.Item(
        company_id=company_id, 
        name="Service Item", 
        income_ledger_id=l_item_income.id,
        default_purchase_rate=0,
        allow_negative_stock=True # Service item
    )
    db_session.add(item)
    db_session.flush()
    
    # Invoice Line
    line = models.SalesInvoiceLine(
        item_id=item.id,
        quantity=1,
        rate=100,
        discount=0,
        tax_rate=0,
    )
    
    # Invoice
    invoice = models.SalesInvoice(
        company_id=company_id,
        customer_id=customer.id,
        date=date.today(),
        sales_ledger_id=l_sales_header.id, # Header specifies "Header Sales"
        lines=[line]
    )
    db_session.add(invoice)
    db_session.flush()
    
    # Build Voucher
    voucher = _build_sales_voucher(
        db=db_session,
        company_id=company_id,
        invoice=invoice,
        payment_mode_id=None,
        sales_ledger_id=l_sales_header.id
    )
    db_session.flush()
    db_session.refresh(voucher)
    
    # Inspect Voucher Lines
    # Expected: Credit to l_item_income.id (if we want separation)
    # Current Behavior: Credit to l_sales_header.id (because header overrides)
    
    credit_lines = [vl for vl in voucher.lines if vl.credit > 0]
    assert len(credit_lines) == 1
    
    posted_ledger_id = credit_lines[0].ledger_id
    
    # Asserting the NEW behavior (Item Income takes priority)
    assert posted_ledger_id == l_item_income.id
    
    print(f"Posted to Ledger ID: {posted_ledger_id} (Header: {l_sales_header.id}, Item: {l_item_income.id})")
