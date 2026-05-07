import os
import sys

sys.path.append(os.path.abspath('.'))

from app.database import SessionLocal
from app import models

def main():
    db = SessionLocal()
    try:
        total_orders = db.query(models.SalesOrder).count()
        total_receipts = db.query(models.WebsiteOrderReceipt).count()
        print(f"Total Orders: {total_orders}")
        print(f"Total Receipts: {total_receipts}")

        for r in db.query(models.WebsiteOrderReceipt).all():
            print(f"Receipt ID: {r.id}, Company ID: {r.company_id}, Sales Order ID: {r.sales_order_id}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
