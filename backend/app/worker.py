import asyncio
from datetime import datetime, timezone
import logging
import traceback
from contextlib import asynccontextmanager
from typing import Callable

from .database import SessionLocal
from .services import notification_service

logger = logging.getLogger(__name__)

async def run_in_threadpool(func: Callable, *args, **kwargs):
    """Run a sync function in the executor to avoid blocking the asyncio event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, func, *args, **kwargs)

def _process_notifications_sync():
    """Synchronous function to process notifications from the background worker."""
    db = SessionLocal()
    try:
        # Process directly queued messages (if they were delayed/failed previously)
        notification_service.process_outbound_messages(db)

        # Process new overdue reminders (Checks invoices and queues messages)
        notification_service.schedule_overdue_reminders(db)

        db.commit()
    except Exception as e:
        logger.error(f"Error processing scheduled notifications: {e}")
        logger.error(traceback.format_exc())
        db.rollback()
    finally:
        db.close()


async def background_worker_loop():
    """Continuous loop running alongside FastAPI to process background tasks."""
    logger.info("Starting background worker loop...")
    
    # We run the loop every 5 minutes by default
    # But for testing immediacy, we'll try every 60 seconds
    interval_seconds = 60
    
    while True:
        try:
            # Run the synchronous DB operations in a threadpool
            await run_in_threadpool(_process_notifications_sync)
        except asyncio.CancelledError:
            logger.info("Background worker loop cancelled.")
            break
        except Exception as e:
            logger.error(f"Unexpected error in background worker loop: {e}")
            
        await asyncio.sleep(interval_seconds)

