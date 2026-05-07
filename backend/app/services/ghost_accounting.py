from sqlalchemy.orm import Session
from datetime import datetime
from .. import models, schemas
from ..voucher_service import get_next_voucher_number
import logging

logger = logging.getLogger(__name__)

def _ensure_ledger(db: Session, company_id: int, tenant_id: int | None, code: str, name: str, group_name: str, group_type: models.LedgerGroupType):
    """Ensures a ledger with the given code exists in the company, creating it and its group if necessary."""
    ledger = db.query(models.Ledger).filter(
        models.Ledger.company_id == company_id,
        models.Ledger.code == code
    ).first()
    
    if ledger:
        # Update name if it's different (e.g. from ID to Plan Name)
        if ledger.name != name:
            ledger.name = name
            db.flush()
        return ledger

    # Ensure Group exists
    group = db.query(models.LedgerGroup).filter(
        models.LedgerGroup.company_id == company_id,
        models.LedgerGroup.name == group_name
    ).first()
    
    if not group:
        group = models.LedgerGroup(
            company_id=company_id,
            name=group_name,
            group_type=group_type
        )
        db.add(group)
        db.flush()

    ledger = models.Ledger(
        company_id=company_id,
        group_id=group.id,
        name=name,
        code=code,
        opening_balance=0,
        opening_balance_type=models.OpeningBalanceType.DEBIT if group_type in [models.LedgerGroupType.ASSET, models.LedgerGroupType.EXPENSE] else models.OpeningBalanceType.CREDIT,
        is_active=True
    )
    db.add(ledger)
    db.flush()
    return ledger

def _ensure_item(db: Session, company_id: int, code: str, name: str, income_ledger_id: int):
    """Ensures a service item exists in the company for accounting purposes."""
    item = db.query(models.Item).filter(
        models.Item.company_id == company_id,
        models.Item.code == code
    ).first()
    
    if item:
        return item
        
    item = models.Item(
        company_id=company_id,
        code=code,
        name=name,
        income_ledger_id=income_ledger_id,
        is_active=True,
        is_fixed_asset=False,
        unit="NOS" # Standard unit
    )
    db.add(item)
    db.flush()
    return item

def sync_subscription_to_accounting(db: Session, subscription: models.TenantSubscription):
    """
    Automagically creates a Sales Invoice and Receipt in the Ghost Administrative Company
    whenever a SaaS subscription is recorded.
    """
    # 1. Get Ghost Config
    settings = db.query(models.AppSettings).filter(models.AppSettings.id == 1).first()
    if not settings or not settings.ghost_company_id:
        logger.info("Ghost accounting skipped: No ghost_company_id configured in AppSettings.")
        return

    ghost_company_id = settings.ghost_company_id
    ghost_tenant_id = settings.ghost_tenant_id

    # 1b. Prevent duplicates
    existing_invoice = db.query(models.SalesInvoice).filter(
        models.SalesInvoice.company_id == ghost_company_id,
        models.SalesInvoice.reference == f"SUBS-#{subscription.id}"
    ).first()
    if existing_invoice:
        logger.info(f"Ghost accounting skipped: Subscription #{subscription.id} already synced.")
        return
    
    # 2. Ensure Customer exists in Ghost Company for this Tenant
    tenant = subscription.tenant
    customer = db.query(models.Customer).filter(
        models.Customer.company_id == ghost_company_id,
        models.Customer.name == tenant.name
    ).first()

    if not customer:
        # Resolve or create the default 'CUSTOMERS' ledger
        customer_ledger = _ensure_ledger(
            db, ghost_company_id, ghost_tenant_id, 
            "CUSTOMERS", "SaaS Customers", "Sundry Debtors", 
            models.LedgerGroupType.ASSET
        )

        customer = models.Customer(
            company_id=ghost_company_id,
            tenant_id=ghost_tenant_id,
            name=tenant.name,
            ledger_id=customer_ledger.id
        )
        db.add(customer)
        db.flush()

    # 3. Create Sales Invoice (Service Invoice)
    # Ensure SaaS Subscription Item exists
    sub_item = _ensure_item(
        db, ghost_company_id, "SAAS_SUB", "SaaS Subscription", 0
    )

    # 2. Ensure Revenue Ledger for specific Plan
    pid = str(subscription.plan_code)
    plan_obj = db.query(models.Plan).filter(
        (models.Plan.code == pid) | 
        (models.Plan.id == (int(pid) if pid.isdigit() else -1))
    ).first()
    plan_name = plan_obj.name if plan_obj else pid.replace('_', ' ').title()
    
    rev_code = f"SAAS_REV_{subscription.plan_code.upper()}"
    rev_name = f"SaaS Revenue - {plan_name}"
    revenue_ledger = _ensure_ledger(
        db, ghost_company_id, ghost_tenant_id,
        rev_code, rev_name, "Sales",
        models.LedgerGroupType.INCOME
    )

    # 3. Handle Accounting Entry based on Payment Method
    pm_name = subscription.payment_method.value if hasattr(subscription.payment_method, "value") else str(subscription.payment_method)
    is_credit = pm_name.upper() == "CREDIT"
    period_desc = f"From {subscription.period_start.date()} To {subscription.period_end.date()}"
    
    # a. Create Sales Invoice Header (For tracking/printing)
    invoice = models.SalesInvoice(
        company_id=ghost_company_id,
        customer_id=customer.id,
        date=subscription.payment_date.date() if subscription.payment_date else datetime.utcnow().date(),
        due_date=subscription.payment_date.date() if subscription.payment_date else datetime.utcnow().date(),
        invoice_type="SERVICE",
        reference=f"SUBS-#{subscription.id}",
        narration=f"SaaS {subscription.plan_code.title()} Subscription: {tenant.name} ({period_desc})",
        status="PAID" if not is_credit else "UNPAID"
    )
    db.add(invoice)
    db.flush()

    # Create Invoice Line
    db.add(models.SalesInvoiceLine(
        invoice_id=invoice.id,
        item_id=sub_item.id,
        remarks=f"Subscription: {subscription.plan_code}",
        quantity=1,
        rate=subscription.amount_paid,
        tax_rate=0
    ))
    db.flush()

    # b. Determine Accounting Voucher
    v_type = models.VoucherType.SALES_INVOICE
    v_num, v_fy, v_seq = get_next_voucher_number(db, ghost_company_id, v_type, invoice.date)
    
    voucher = models.Voucher(
        company_id=ghost_company_id,
        voucher_date=invoice.date,
        voucher_type=v_type,
        fiscal_year=v_fy,
        voucher_sequence=v_seq,
        voucher_number=v_num,
        narration=f"SaaS Revenue ({subscription.plan_code}): {tenant.name} ({period_desc})" + (f" Ref: {subscription.reference_no}" if subscription.reference_no else "")
    )
    db.add(voucher)
    db.flush()
    invoice.voucher_id = voucher.id

    if is_credit:
        # Standard Credit Sale: DR Customer, CR Revenue
        db.add(models.VoucherLine(voucher_id=voucher.id, ledger_id=customer.ledger_id, debit=subscription.amount_paid, credit=0))
        db.add(models.VoucherLine(voucher_id=voucher.id, ledger_id=revenue_ledger.id, debit=0, credit=subscription.amount_paid))
    else:
        # Cash/Bank Sale: DR Bank/Cash, CR Revenue (Skip Customer Ledger)
        payment_mode = None
        if pm_name.upper() == "BANK" and getattr(subscription, "bank_name", None):
            # Try to find specific bank
            payment_mode = db.query(models.PaymentMode).filter(
                models.PaymentMode.company_id == ghost_company_id,
                models.PaymentMode.name.ilike(f"%{subscription.bank_name.strip()}%")
            ).first()

        if not payment_mode:
            payment_mode = db.query(models.PaymentMode).filter(
                models.PaymentMode.company_id == ghost_company_id,
                models.PaymentMode.name.ilike(pm_name)
            ).first()

        if not payment_mode:
            payment_mode = db.query(models.PaymentMode).filter(
                models.PaymentMode.company_id == ghost_company_id,
                models.PaymentMode.is_active == True
            ).first()

        if payment_mode:
            voucher.payment_mode_id = payment_mode.id
            # DR Cash/Bank directly
            db.add(models.VoucherLine(voucher_id=voucher.id, ledger_id=payment_mode.ledger_id, debit=subscription.amount_paid, credit=0))
            # CR Revenue
            db.add(models.VoucherLine(voucher_id=voucher.id, ledger_id=revenue_ledger.id, debit=0, credit=subscription.amount_paid))
            
            # Since it's fully paid and not on credit, we mark it paid
            invoice.status = "PAID"
        else:
            # Fallback to credit if no payment mode found
            db.add(models.VoucherLine(voucher_id=voucher.id, ledger_id=customer.ledger_id, debit=subscription.amount_paid, credit=0))
            db.add(models.VoucherLine(voucher_id=voucher.id, ledger_id=revenue_ledger.id, debit=0, credit=subscription.amount_paid))

    db.commit()
    logger.info(f"Ghost accounting sync complete for subscription #{subscription.id} ({pm_name})")
