import smtplib
import json
import httpx
import re
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func
from datetime import datetime, timedelta
from .. import models, schemas
import logging

logger = logging.getLogger(__name__)

def render_template(template_str: str, context: dict) -> str:
    """Replaces {{key}} in template_str with values from context."""
    if not template_str:
        return ""
    def replace(match):
        key = match.group(1).strip()
        return str(context.get(key, match.group(0)))
    return re.sub(r'\{\{(.*?)\}\}', replace, template_str)

def create_outbound_message(
    db: Session,
    company_id: int,
    recipient: str,
    channel: str,
    subject: str | None,
    body: str,
    source_type: str | None = None,
    source_id: int | None = None,
    scheduled_for: datetime | None = None
) -> models.OutboundMessage:
    msg = models.OutboundMessage(
        company_id=company_id,
        recipient=recipient,
        channel=channel,
        subject=subject,
        body=body,
        status="PENDING",
        source_type=source_type,
        source_id=source_id,
        scheduled_for=scheduled_for
    )
    db.add(msg)
    db.flush()
    return msg

async def send_email(smtp_config: dict, recipient: str, subject: str, body: str):
    """Sends an email using SMTP configuration."""
    try:
        host = smtp_config.get("host")
        port = smtp_config.get("port", 587)
        user = smtp_config.get("user")
        password = smtp_config.get("password")
        from_email = smtp_config.get("from_email", user)

        if not all([host, port, user, password]):
            logger.error(f"Incomplete SMTP configuration")
            return False

        msg = MIMEMultipart()
        msg["From"] = from_email
        msg["To"] = recipient
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        server = smtplib.SMTP(host, int(port))
        server.starttls()
        server.login(user, password)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient}: {str(e)}")
        return False

async def send_whatsapp(whatsapp_config: dict, recipient: str, body: str):
    """Sends a WhatsApp message using configured REST API."""
    try:
        endpoint = whatsapp_config.get("api_endpoint")
        token = whatsapp_config.get("token")
        
        if not all([endpoint, token]):
            logger.error(f"Incomplete WhatsApp configuration")
            return False

        async with httpx.AsyncClient() as client:
            response = await client.post(
                endpoint,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json={"to": recipient, "body": body},
                timeout=10.0
            )
            return response.status_code < 300
    except Exception as e:
        logger.error(f"Failed to send WhatsApp to {recipient}: {str(e)}")
        return False

async def process_message(db: Session, msg: models.OutboundMessage, settings: models.CompanySettings):
    """Actually attempts to deliver a single OutboundMessage."""
    success = False
    if msg.channel == "EMAIL" and settings.smtp_config:
        success = await send_email(settings.smtp_config, msg.recipient, msg.subject, msg.body)
    elif msg.channel == "WHATSAPP" and settings.whatsapp_config:
        success = await send_whatsapp(settings.whatsapp_config, msg.recipient, msg.body)
    
    msg.status = "SENT" if success else "FAILED"
    msg.sent_at = datetime.utcnow() if success else None
    db.commit()
    return success

async def process_scheduled_queue(db: Session):
    """Processes pending messages that are due to be sent."""
    now = datetime.utcnow()
    messages = db.query(models.OutboundMessage).filter(
        models.OutboundMessage.status == "PENDING",
        or_(
            models.OutboundMessage.scheduled_for == None,
            models.OutboundMessage.scheduled_for <= now
        )
    ).all()

    for msg in messages:
        settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == msg.company_id).first()
        if settings:
            await process_message(db, msg, settings)

async def check_and_send_due_reminders(db: Session):
    """Scans for overdue invoices and queues reminders based on settings."""
    companies_with_overdue = db.query(models.CompanySettings).filter(models.CompanySettings.notify_on_overdue == True).all()
    
    for settings in companies_with_overdue:
        reminders = settings.overdue_reminders or [1, 7, 30] # Default reminders
        today = datetime.utcnow().date()
        
        for days in reminders:
            target_date = today - timedelta(days=days)
            # Find invoices that were due on exactly target_date and still have balance
            invoices = db.query(models.SalesInvoice).filter(
                models.SalesInvoice.company_id == settings.company_id,
                models.SalesInvoice.due_date == target_date,
                models.SalesInvoice.balance_amount > 0
            ).all()

            for inv in invoices:
                # Check if we already sent a reminder for this specific 'days' interval
                existing = db.query(models.OutboundMessage).filter(
                    models.OutboundMessage.company_id == settings.company_id,
                    models.OutboundMessage.source_type == "OVERDUE_REMINDER",
                    models.OutboundMessage.source_id == inv.id,
                    models.OutboundMessage.body.like(f"%{days} day%") # Simple check
                ).first()
                if existing: continue

                customer = db.query(models.Customer).get(inv.customer_id)
                if not customer: continue

                context = {
                    "customer_name": customer.name,
                    "invoice_number": inv.reference or str(inv.id),
                    "amount": f"{inv.balance_amount:,.2f}",
                    "due_date": inv.due_date.strftime("%Y-%m-%d"),
                    "days_overdue": days
                }
                
                tmpl = (settings.message_templates or {}).get("overdue", 
                    "Dear {{customer_name}}, your payment of {{amount}} for invoice {{invoice_number}} is {{days_overdue}} days overdue. Please pay as soon as possible.")
                body = render_template(tmpl, context)
                subject = f"Overdue Payment Reminder: {inv.reference or inv.id}"

                if customer.email:
                    create_outbound_message(db, settings.company_id, customer.email, "EMAIL", subject, body, "OVERDUE_REMINDER", inv.id)
                
                phone = customer.phone or customer.mobile
                if phone:
                    create_outbound_message(db, settings.company_id, str(phone), "WHATSAPP", None, body, "OVERDUE_REMINDER", inv.id)
        
        db.commit()

async def notify_package_status(db: Session, package_id: int, force: bool = False):
    """Sends notifications based on package status using templates."""
    package = db.query(models.Package).get(package_id)
    if not package: return

    settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == package.company_id).first()
    if not settings: return

    invoice = db.query(models.SalesInvoice).get(package.invoice_id)
    customer = db.query(models.Customer).get(invoice.customer_id) if invoice else None
    if not customer: return

    status = package.status.upper()
    event_key = ""
    if status == "DISPATCHED" and (settings.notify_on_dispatch or force): event_key = "dispatch"
    elif status == "DELIVERED" and (settings.notify_on_delivery or force): event_key = "delivery"

    if not event_key: return

    context = {
        "customer_name": customer.name,
        "invoice_number": invoice.reference or str(invoice.id),
        "tracking_number": package.tracking_number or "N/A",
        "status": status.lower()
    }

    default_tmpl = "Dear {{customer_name}}, your order {{invoice_number}} has been {{status}}."
    if event_key == "dispatch" and package.tracking_number:
        default_tmpl += " Tracking: {{tracking_number}}"

    tmpl = (settings.message_templates or {}).get(event_key, default_tmpl)
    body = render_template(tmpl, context)
    subject = f"Order {event_key.capitalize()}: {invoice.reference or invoice.id}"

    if customer.email and settings.smtp_config:
        msg = create_outbound_message(db, settings.company_id, customer.email, "EMAIL", subject, body, "PACKAGE", package_id)
        db.commit()
        await process_message(db, msg, settings)

    phone = customer.phone or customer.mobile
    if phone and settings.whatsapp_config:
        msg = create_outbound_message(db, settings.company_id, str(phone), "WHATSAPP", None, body, "PACKAGE", package_id)
        db.commit()
        await process_message(db, msg, settings)

async def notify_order_placed(db: Session, invoice_id: int, force: bool = False):
    """Sends notification when a new order/invoice is created."""
    invoice = db.query(models.SalesInvoice).get(invoice_id)
    if not invoice: return

    settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == invoice.company_id).first()
    if not settings or (not settings.notify_on_order_placed and not force): return

    customer = db.query(models.Customer).get(invoice.customer_id)
    if not customer: return

    context = {
        "customer_name": customer.name,
        "invoice_number": invoice.reference or str(invoice.id),
        "amount": f"{invoice.grand_total:,.2f}" if hasattr(invoice, 'grand_total') else "0.00",
        "date": invoice.date.strftime("%Y-%m-%d")
    }

    tmpl = (settings.message_templates or {}).get("order_placed", 
        "Dear {{customer_name}}, your order {{invoice_number}} for {{amount}} has been placed successfully.")
    body = render_template(tmpl, context)
    subject = f"Order Confirmation: {invoice.reference or invoice.id}"

    if customer.email and settings.smtp_config:
        msg = create_outbound_message(db, invoice.company_id, customer.email, "EMAIL", subject, body, "ORDER", invoice_id)
        db.commit()
        await process_message(db, msg, settings)

    phone = customer.phone or customer.mobile
    if phone and settings.whatsapp_config:
        msg = create_outbound_message(db, invoice.company_id, str(phone), "WHATSAPP", None, body, "ORDER", invoice_id)
        db.commit()
        await process_message(db, msg, settings)

async def notify_payment_received(db: Session, voucher_id: int, force: bool = False):
    """Sends notification when a payment (Receipt) is recorded."""
    voucher = db.query(models.Voucher).get(voucher_id)
    if not voucher or voucher.voucher_type != models.VoucherType.RECEIPT: return

    settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == voucher.company_id).first()
    if not settings or (not settings.notify_on_payment_received and not force): return

    # In a Receipt voucher, one of the lines usually belongs to a customer.
    customer_ledger_id = None
    amount = 0.0
    for line in voucher.lines:
        if line.credit > 0: # Customer is credited in a receipt
            customer_ledger_id = line.ledger_id
            amount = float(line.credit)
            break
    
    if not customer_ledger_id: return
    customer = db.query(models.Customer).filter(models.Customer.ledger_id == customer_ledger_id).first()
    if not customer: return

    context = {
        "customer_name": customer.name,
        "voucher_number": voucher.voucher_number,
        "amount": f"{amount:,.2f}",
        "date": voucher.voucher_date.strftime("%Y-%m-%d")
    }

    tmpl = (settings.message_templates or {}).get("payment_received", 
        "Dear {{customer_name}}, we have received your payment of {{amount}} via {{voucher_number}} on {{date}}. Thank you!")
    body = render_template(tmpl, context)
    subject = f"Payment Received: {voucher.voucher_number}"

    if customer.email and settings.smtp_config:
        msg = create_outbound_message(db, voucher.company_id, customer.email, "EMAIL", subject, body, "PAYMENT", voucher_id)
        db.commit()
        await process_message(db, msg, settings)

    phone = customer.phone or customer.mobile
    if phone and settings.whatsapp_config:
        msg = create_outbound_message(db, voucher.company_id, str(phone), "WHATSAPP", None, body, "PAYMENT", voucher_id)
        db.commit()
        await process_message(db, msg, settings)

async def notify_outstanding_balance(db: Session, invoice_id: int, force: bool = False):
    """Sends notification for outstanding balance on a sales invoice."""
    invoice = db.query(models.SalesInvoice).get(invoice_id)
    if not invoice: return

    settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == invoice.company_id).first()
    if not settings: return

    # If not forced, check the notify_on_overdue toggle
    if not force and not settings.notify_on_overdue:
        return

    customer = db.query(models.Customer).get(invoice.customer_id)
    if not customer: return

    # Use existing balance_amount from SalesInvoice if available, 
    # or calculate it if needed. For now we use the one on the model.
    balance = getattr(invoice, 'balance_amount', 0.0)
    
    context = {
        "customer_name": customer.name,
        "invoice_number": invoice.reference or str(invoice.id),
        "amount": f"{balance:,.2f}",
        "due_date": invoice.due_date.strftime("%Y-%m-%d") if invoice.due_date else "N/A"
    }

    tmpl = (settings.message_templates or {}).get("overdue", 
        "Dear {{customer_name}}, your payment of {{amount}} for invoice {{invoice_number}} is outstanding. Please pay your due by {{due_date}}.")
    body = render_template(tmpl, context)
    subject = f"Outstanding Payment: {invoice.reference or invoice.id}"

    if customer.email and settings.smtp_config:
        msg = create_outbound_message(db, invoice.company_id, customer.email, "EMAIL", subject, body, "OVERDUE_REMINDER", invoice_id)
        db.commit()
        await process_message(db, msg, settings)

    phone = customer.phone or customer.mobile
    if phone and settings.whatsapp_config:
        msg = create_outbound_message(db, invoice.company_id, str(phone), "WHATSAPP", None, body, "OVERDUE_REMINDER", invoice_id)
        db.commit()
        await process_message(db, msg, settings)

async def notify_customer_statement(db: Session, customer_id: int, force: bool = False):
    """Sends a general account statement/summary notification to a customer."""
    customer = db.query(models.Customer).get(customer_id)
    if not customer: return

    settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == customer.company_id).first()
    if not settings: return

    # For statement, we can calculate total outstanding
    # This is a bit more complex, but for now we can use a generic message
    
    context = {
        "customer_name": customer.name,
        "company_name": settings.company.name if settings.company else "Our Company"
    }

    tmpl = (settings.message_templates or {}).get("statement", 
        "Dear {{customer_name}}, please find your latest account statement from {{company_name}} attached. Thank you for your continued business.")
    body = render_template(tmpl, context)
    subject = f"Account Statement: {customer.name}"

    if customer.email and settings.smtp_config:
        msg = create_outbound_message(db, customer.company_id, customer.email, "EMAIL", subject, body, "CUSTOMER", customer_id)
        db.commit()
        await process_message(db, msg, settings)

    phone = customer.phone or customer.mobile
    if phone and settings.whatsapp_config:
        msg = create_outbound_message(db, customer.company_id, str(phone), "WHATSAPP", None, body, "CUSTOMER", customer_id)
        db.commit()
        await process_message(db, msg, settings)

async def notify_task_event(db: Session, task_id: int, event_type: str, force: bool = False):
    """Sends internal/employee notifications for task events."""
    task = db.query(models.Task).get(task_id)
    if not task: return

    settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == task.company_id).first()
    if not settings: return

    # For internal task notifications, we usually notify the assignee or creator
    # This logic depends on whether we want to notify customers or employees.
    # Usually Phase 8 is about Automation & Notifications (Internal/Employee).
    
    assignee = db.query(models.Employee).get(task.assignee_id) if task.assignee_id else None
    if not assignee or not assignee.email:
        return

    context = {
        "task_title": task.title,
        "task_id": task.id,
        "status": task.status,
        "assignee_name": assignee.full_name if assignee else "N/A",
        "due_date": task.due_date.strftime("%Y-%m-%d") if task.due_date else "N/A",
        "event_type": event_type.replace("_", " ").title()
    }

    tmpl = (settings.message_templates or {}).get(f"task_{event_type}", 
        "Task Notification: The task '{{task_title}}' (#{{task_id}}) has been {{event_type}}.")
    
    body = render_template(tmpl, context)
    subject = f"Task {context['event_type']}: {task.title}"

    # For now, we only notify via internal Notification model as well
    notification = models.Notification(
        company_id=task.company_id,
        type=f"TASK_{event_type.upper()}",
        task_id=task.id,
        read=False
    )
    db.add(notification)
    db.commit()

    if assignee.email and settings.smtp_config:
        msg = create_outbound_message(db, task.company_id, assignee.email, "EMAIL", subject, body, "TASK", task_id)
        db.commit()
        await process_message(db, msg, settings)

async def notify_task_assigned(db: Session, task_id: int):
    await notify_task_event(db, task_id, "assigned", force=True)

async def notify_task_completed(db: Session, task_id: int):
    await notify_task_event(db, task_id, "completed", force=True)


from datetime import timedelta, datetime, timezone
import asyncio

def schedule_overdue_reminders(db: Session):
    """
    Called by the background worker. Checks all companies with `notify_on_overdue == True`.
    If an invoice balance > 0 and the elapsed days past due_date matches an element
    in `overdue_reminders`, queues a new background message.
    """
    settings_list = db.query(models.CompanySettings).filter(models.CompanySettings.notify_on_overdue == True).all()

    for s in settings_list:
        reminders = s.overdue_reminders
        if not reminders or not isinstance(reminders, list):
            continue
            
        # Ensure list of ints
        try:
            reminders = sorted([int(r) for r in reminders])
        except ValueError:
            continue

        today = datetime.now(timezone.utc).date()
        
        # Find invoices that are overdue and haven't exhausted their reminders
        # Note: We rely on the fact that `overdue_reminders_sent` corresponds to the index in `reminders`
        invoices = (
            db.query(models.SalesInvoice)
            .filter(
                models.SalesInvoice.company_id == s.company_id,
                models.SalesInvoice.balance_amount > 0,
                models.SalesInvoice.due_date < today
            )
            .all()
        )

        for inv in invoices:
            if inv.overdue_reminders_sent >= len(reminders):
                continue # All reminders sent
                
            next_reminder_days = reminders[inv.overdue_reminders_sent]
            days_overdue = (today - inv.due_date).days
            
            if days_overdue >= next_reminder_days:
                # Need to send!
                # Since notify_outstanding_balance is async, we can wrap it or build it here.
                # Because we are in a synchronous background thread pool process, 
                # we will run it via asyncio loop.
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
                    
                loop.run_until_complete(notify_outstanding_balance(db, inv.id, force=True))
                
                # Update tracking
                inv.overdue_reminders_sent += 1
                inv.last_overdue_reminder_sent_at = datetime.utcnow()
                db.commit()


def process_outbound_messages(db: Session):
    """
    Called by the background worker to dispatch delayed/scheduled messages.
    Presently, the inline functions `process_message` dispatch immediately,
    but if they fail or defer, their status might stay PENDING.
    This sweeps through PENDING or FAILED items and retries them.
    """
    pending_msgs = (
        db.query(models.OutboundMessage)
        .filter(
            models.OutboundMessage.status == "PENDING",
            models.OutboundMessage.scheduled_for <= datetime.utcnow()
        )
        .limit(50)  # Batch process
        .all()
    )
    
    if not pending_msgs:
        return

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    for msg in pending_msgs:
        settings = db.query(models.CompanySettings).filter(models.CompanySettings.company_id == msg.company_id).first()
        if settings:
            # We bypass DB commit temporarily and use process_message
            loop.run_until_complete(process_message(db, msg, settings))
