
import sys
import os
# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app import models
from app.services.ghost_accounting import sync_subscription_to_accounting
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def backfill(db=None):
    close_db = False
    if db is None:
        db = SessionLocal()
        close_db = True
        
    try:
        # Find all PAID subscriptions (using status='PAID' as per models.py)
        subscriptions = db.query(models.TenantSubscription).filter(
            models.TenantSubscription.status == "PAID"
        ).all()
        
        logger.info(f"Found {len(subscriptions)} paid subscriptions to backfill.")
        
        count = 0
        skipped = 0
        for sub in subscriptions:
            try:
                # Check for existing sync via reference
                settings = db.query(models.AppSettings).get(1)
                if not settings or not settings.ghost_company_id:
                    logger.error("Ghost Company ID not configured in settings.")
                    break
                    
                existing = db.query(models.SalesInvoice).filter(
                    models.SalesInvoice.company_id == settings.ghost_company_id,
                    models.SalesInvoice.reference == f"SUBS-#{sub.id}"
                ).first()
                
                if existing:
                    skipped += 1
                    continue
                    
                sync_subscription_to_accounting(db, sub)
                count += 1
            except Exception as e:
                logger.error(f"Failed to sync subscription #{sub.id}: {e}")
                db.rollback()
        
        logger.info(f"Backfill complete: Processes {count} new, skipped {skipped} duplicates.")
        return {"processed": count, "skipped": skipped}
    finally:
        if close_db:
            db.close()

if __name__ == "__main__":
    backfill()
