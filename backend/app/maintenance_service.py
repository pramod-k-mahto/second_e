from sqlalchemy import delete
from sqlalchemy.orm import Session
from . import models

def reset_company_transactions_impl(db: Session, company_id: int) -> None:
    """
    Clears all transactional data for the specified company.
    Master data (Ledgers, Items, Warehouses, etc.) is preserved.
    """
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        return

    # 1. Payroll
    db.execute(delete(models.PayrollPayslipLine).where(models.PayrollPayslipLine.company_id == company_id))
    db.execute(delete(models.PayrollOverrideLog).where(models.PayrollOverrideLog.company_id == company_id))
    db.execute(delete(models.PayrollPayslip).where(models.PayrollPayslip.company_id == company_id))
    db.execute(delete(models.PayrollRun).where(models.PayrollRun.company_id == company_id))
    db.execute(delete(models.AttendanceDaily).where(models.AttendanceDaily.company_id == company_id))
    db.execute(delete(models.AttendanceRawLog).where(models.AttendanceRawLog.company_id == company_id))
    db.execute(delete(models.LeaveRequest).where(models.LeaveRequest.company_id == company_id))
    
    # 2. Inventory & Stock
    db.execute(delete(models.StockTransferLine).where(models.StockTransferLine.id.in_(
        db.query(models.StockTransferLine.id).join(models.StockTransfer).filter(models.StockTransfer.company_id == company_id)
    )))
    db.execute(delete(models.StockTransfer).where(models.StockTransfer.company_id == company_id))
    db.execute(delete(models.StockLedger).where(models.StockLedger.company_id == company_id))
    db.execute(delete(models.StockMovement).where(models.StockMovement.company_id == company_id))
    db.execute(delete(models.StockBatch).where(models.StockBatch.tenant_id == company.tenant_id).where(models.StockBatch.product_id.in_(
        db.query(models.Item.id).filter(models.Item.company_id == company_id)
    )))
    
    # 3. Sales & Purchases (Lines first)
    db.execute(delete(models.SalesReturnLine).where(models.SalesReturnLine.return_id.in_(
        db.query(models.SalesReturn.id).filter(models.SalesReturn.company_id == company_id)
    )))
    db.execute(delete(models.SalesReturn).where(models.SalesReturn.company_id == company_id))
    
    db.execute(delete(models.PurchaseReturnLine).where(models.PurchaseReturnLine.return_id.in_(
        db.query(models.PurchaseReturn.id).filter(models.PurchaseReturn.company_id == company_id)
    )))
    db.execute(delete(models.PurchaseReturn).where(models.PurchaseReturn.company_id == company_id))
    
    db.execute(delete(models.SalesInvoiceLine).where(models.SalesInvoiceLine.invoice_id.in_(
        db.query(models.SalesInvoice.id).filter(models.SalesInvoice.company_id == company_id)
    )))
    db.execute(delete(models.SalesInvoice).where(models.SalesInvoice.company_id == company_id))
    
    db.execute(delete(models.PurchaseBillLine).where(models.PurchaseBillLine.bill_id.in_(
        db.query(models.PurchaseBill.id).filter(models.PurchaseBill.company_id == company_id)
    )))
    db.execute(delete(models.PurchaseBill).where(models.PurchaseBill.company_id == company_id))
    
    db.execute(delete(models.SalesOrderLine).where(models.SalesOrderLine.order_id.in_(
        db.query(models.SalesOrder.id).filter(models.SalesOrder.company_id == company_id)
    )))
    db.execute(delete(models.SalesOrder).where(models.SalesOrder.company_id == company_id))
    
    db.execute(delete(models.PurchaseOrderLine).where(models.PurchaseOrderLine.order_id.in_(
        db.query(models.PurchaseOrder.id).filter(models.PurchaseOrder.company_id == company_id)
    )))
    db.execute(delete(models.PurchaseOrder).where(models.PurchaseOrder.company_id == company_id))
    
    # 4. Vouchers
    db.execute(delete(models.VoucherAllocation).where(models.VoucherAllocation.company_id == company_id))
    db.execute(delete(models.VoucherLog).where(models.VoucherLog.company_id == company_id))
    # Delete VoucherLines first because they reference Vouchers
    db.execute(delete(models.VoucherLine).where(models.VoucherLine.id.in_(
        db.query(models.VoucherLine.id).join(models.Voucher).filter(models.Voucher.company_id == company_id)
    )))
    # Vouchers themselves
    db.execute(delete(models.Voucher).where(models.Voucher.company_id == company_id))
    
    # 5. System data
    db.execute(delete(models.Notification).where(models.Notification.company_id == company_id))
    db.execute(delete(models.OutboundMessage).where(models.OutboundMessage.company_id == company_id))
    db.execute(delete(models.WebsiteOrderReceipt).where(models.WebsiteOrderReceipt.company_id == company_id))
    db.execute(delete(models.ImportJob).where(models.ImportJob.company_id == company_id))
    
    db.flush()
