from app.database import SessionLocal
from app.models import Item, SalesInvoice
db = SessionLocal()
item = db.query(Item).filter(Item.id == 16).first()
print('Item present:', bool(item))
print('Item online:', getattr(item, 'show_in_online_store', None))
