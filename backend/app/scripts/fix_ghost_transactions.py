
import sys
import os
# Add the parent directory to sys.path to allow imports from app
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.database import SessionLocal
from app import models
from app.voucher_service import get_next_voucher_number
from app.services.ghost_accounting import _ensure_ledger
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def fix_transactions():
    db = SessionLocal()
    try:
        settings = db.query(models.AppSettings).get(1)
        if not settings or not settings.ghost_company_id:
            logger.error("Ghost Company ID not configured.")
            return

        ghost_company_id = settings.ghost_company_id
        ghost_tenant_id = settings.ghost_tenant_id

        # Find all subscription invoices in ghost company
        invoices = db.query(models.SalesInvoice).filter(
            models.SalesInvoice.company_id == ghost_company_id,
            models.SalesInvoice.reference.like("SUBS-#%")
        ).all()

        logger.info(f"Refining {len(invoices)} subscription invoices with plan-wise details...")

        fixed_count = 0
        for inv in invoices:
            # 1. Get Subscription ID from reference
            try:
                sub_id_str = inv.reference.split("#")[-1]
                sub_id = int(sub_id_str)
            except:
                logger.warning(f"Could not parse sub_id from reference: {inv.reference}")
                continue

            # 2. Fetch Subscription
            sub = db.query(models.TenantSubscription).get(sub_id)
            if not sub:
                logger.warning(f"Subscription {sub_id} not found for invoice {inv.id}")
                continue

            tenant = db.query(models.Tenant).get(sub.tenant_id)
            period_desc = f"From {sub.period_start.date()} To {sub.period_end.date()}"
            
            # 3. Ensure Plan-Specific Revenue Ledger
            pid = str(sub.plan_code)
            plan_obj = db.query(models.Plan).filter(
                (models.Plan.code == pid) | 
                (models.Plan.id == (int(pid) if pid.isdigit() else -1))
            ).first()
            plan_name = plan_obj.name if plan_obj else pid.replace('_', ' ').title()
            
            rev_code = f"SAAS_REV_{sub.plan_code.upper()}"
            rev_name = f"SaaS Revenue - {plan_name}"
            revenue_ledger = _ensure_ledger(
                db, ghost_company_id, ghost_tenant_id,
                rev_code, rev_name, "Sales",
                models.LedgerGroupType.INCOME
            )

            # 4. Update Invoice Narration
            inv.narration = f"SaaS {sub.plan_code.title()} Subscription: {tenant.name} ({period_desc})"

            # 5. Fix Sales Voucher (Revenue Recognition)
            # Find the Sales Voucher linked to this invoice
            sales_voucher = db.query(models.Voucher).get(inv.voucher_id) if inv.voucher_id else None
            if sales_voucher and sales_voucher.voucher_type == models.VoucherType.SALES_INVOICE:
                sales_voucher.narration = f"SaaS Revenue: {sub.plan_code} for {tenant.name} ({period_desc})"
                
                # Update Voucher Lines
                for line in sales_voucher.lines:
                    if line.credit > 0:
                        # This is the revenue line
                        line.ledger_id = revenue_ledger.id
                        logger.info(f"Updated Revenue Ledger for Invoice {inv.reference} to {rev_code}")

            # 6. Fix Receipt Voucher (Optional: Bank Matching)
            # Find the Receipt Voucher that allocates this invoice
            allocation = db.query(models.VoucherAllocation).filter(
                models.VoucherAllocation.doc_id == inv.id,
                models.VoucherAllocation.doc_type == models.AllocationDocType.SALES_INVOICE.value
            ).first()
            
            if allocation:
                receipt_voucher = db.query(models.Voucher).get(allocation.voucher_id)
                if receipt_voucher:
                    receipt_voucher.narration = f"Subscription payment from {tenant.name} (Ref: {sub.reference_no or 'N/A'}) - {period_desc}"
                    
                    # Smart Bank Matching
                    pm_name = sub.payment_method.value if hasattr(sub.payment_method, 'value') else str(sub.payment_method)
                    if pm_name.upper() == "BANK" and sub.reference_no:
                        best_bank = db.query(models.PaymentMode).filter(
                            models.PaymentMode.company_id == ghost_company_id,
                            models.PaymentMode.name.ilike(f"%{sub.reference_no.strip()}%")
                        ).first()
                        
                        if best_bank:
                            receipt_voucher.payment_mode_id = best_bank.id
                            # Also update the VoucherLine for Cash/Bank
                            for vl in receipt_voucher.lines:
                                if vl.debit > 0:
                                    vl.ledger_id = best_bank.ledger_id
                            logger.info(f"Matched Bank for Invoice {inv.reference}: {best_bank.name}")

            fixed_count += 1
                
        db.commit()
        logger.info(f"Successfully refined {fixed_count} transactions.")
        
    except Exception as e:
        logger.error(f"Error during refinement: {e}")
        db.rollback()
    finally:
        db.close()

if __name__ == "__main__":
    fix_transactions()
