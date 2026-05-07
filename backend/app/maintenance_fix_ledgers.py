# maintenance_fix_ledgers.py
from sqlalchemy.orm import Session
from fastapi import HTTPException

from .database import SessionLocal  # or your actual session factory
from . import models
from .routers import (
    purchases,
    sales,
    admin_logs,  # for recording maintenance issues in the admin log
)  # to reuse _build_purchase_voucher / _build_sales_voucher


def resolve_company_sales_defaults(db: Session, company_id: int):
    """Return (sales_ledger_id, output_tax_ledger_id) for a company."""
    sales_ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.code == "SALES",
        )
        .first()
    )
    output_tax_ledger = (
        db.query(models.Ledger)
        .filter(
            models.Ledger.company_id == company_id,
            models.Ledger.code.in_(["OUTPUT_TAX", "OUTPUT_VAT"]),
        )
        .first()
    )
    return (
        sales_ledger.id if sales_ledger is not None else None,
        output_tax_ledger.id if output_tax_ledger is not None else None,
    )


def backfill_purchase_bills_and_rebuild_vouchers(db: Session):
    companies = db.query(models.Company).all()
    for company in companies:
        company_id = company.id
        print(f"[PURCHASE] Company {company_id}")

        bills = (
            db.query(models.PurchaseBill)
            .filter(models.PurchaseBill.company_id == company_id)
            .all()
        )

        for bill in bills:
            changed = False

            # Backfill header-level ledgers from company defaults if missing
            if bill.purchase_ledger_id is None:
                bill.purchase_ledger_id = company.default_purchase_ledger_id
                changed = True

            if bill.input_tax_ledger_id is None:
                bill.input_tax_ledger_id = company.default_input_tax_ledger_id
                changed = True

            # Rebuild voucher if one exists or if we have lines and want one
            if bill.lines:
                # If there is an existing voucher, delete it first
                if bill.voucher_id is not None:
                    v = (
                        db.query(models.Voucher)
                        .filter(
                            models.Voucher.id == bill.voucher_id,
                            models.Voucher.company_id == company_id,
                        )
                        .first()
                    )
                    if v is not None:
                        print(f"  Deleting old voucher {v.id} for bill {bill.id}")
                        bill.voucher_id = None
                        db.flush()
                        db.delete(v)
                        db.flush()
                        changed = True

                # Build fresh voucher using current bill lines and header ledgers.
                # During maintenance we want to be tolerant of legacy data issues
                # (e.g. bill lines pointing to deleted items). If voucher
                # construction fails with an HTTPException, log and skip this
                # bill so the rest of the backfill can continue.
                try:
                    voucher = purchases._build_purchase_voucher(
                        db,
                        company_id,
                        bill,
                        payment_mode_id=None,  # or derive from your own rules
                        purchase_ledger_id=bill.purchase_ledger_id,
                        input_tax_ledger_id=bill.input_tax_ledger_id,
                    )
                except HTTPException as exc:
                    # Log to stdout for immediate visibility during script run.
                    print(
                        f"  Skipping voucher rebuild for bill {bill.id} due to error: {exc.detail}"
                    )

                    # Also write an admin audit log entry so these legacy data
                    # issues can be reviewed later from the admin UI.
                    admin_logs.log_event(
                        db,
                        user_id=None,
                        tenant_id=None,
                        action="maintenance_purchase_voucher_skip",
                        message=(
                            f"Skipped voucher rebuild for purchase bill {bill.id} "
                            f"in company {company_id}: {exc.detail}"
                        ),
                    )
                else:
                    bill.voucher_id = voucher.id
                    print(f"  Rebuilt voucher {voucher.id} for bill {bill.id}")
                    changed = True

            if changed:
                db.flush()

        db.commit()


def backfill_sales_invoices_and_rebuild_vouchers(db: Session):
    companies = db.query(models.Company).all()
    for company in companies:
        company_id = company.id
        print(f"[SALES] Company {company_id}")

        default_sales_ledger_id, default_output_tax_ledger_id = resolve_company_sales_defaults(
            db, company_id
        )

        invoices = (
            db.query(models.SalesInvoice)
            .filter(models.SalesInvoice.company_id == company_id)
            .all()
        )

        for invoice in invoices:
            changed = False

            # Backfill header-level ledgers from defaults if missing
            if invoice.sales_ledger_id is None:
                invoice.sales_ledger_id = default_sales_ledger_id
                changed = True

            if invoice.output_tax_ledger_id is None:
                invoice.output_tax_ledger_id = default_output_tax_ledger_id
                changed = True

            if invoice.lines:
                # If there is an existing voucher, delete it first
                if invoice.voucher_id is not None:
                    v = (
                        db.query(models.Voucher)
                        .filter(
                            models.Voucher.id == invoice.voucher_id,
                            models.Voucher.company_id == company_id,
                        )
                        .first()
                    )
                    if v is not None:
                        print(f"  Deleting old voucher {v.id} for invoice {invoice.id}")
                        invoice.voucher_id = None
                        db.flush()
                        db.delete(v)
                        db.flush()
                        changed = True

                # Build fresh voucher using current invoice lines and header ledgers.
                # As with purchases, be tolerant of legacy configuration issues
                # (e.g. items missing income/output tax ledgers) during this
                # one-off maintenance run. If voucher construction fails with
                # an HTTPException, log the error and skip this invoice so the
                # rest of the backfill can continue.
                try:
                    voucher = sales._build_sales_voucher(
                        db,
                        company_id,
                        invoice,
                        payment_mode_id=None,  # or derive from your own rules
                        sales_ledger_id=invoice.sales_ledger_id,
                        output_tax_ledger_id=invoice.output_tax_ledger_id,
                    )
                except HTTPException as exc:
                    # Log to stdout for immediate visibility during script run.
                    print(
                        f"  Skipping voucher rebuild for invoice {invoice.id} due to error: {exc.detail}"
                    )

                    # Also write an admin audit log entry so these legacy data
                    # issues can be reviewed later from the admin UI.
                    admin_logs.log_event(
                        db,
                        user_id=None,
                        tenant_id=None,
                        action="maintenance_sales_voucher_skip",
                        message=(
                            f"Skipped voucher rebuild for sales invoice {invoice.id} "
                            f"in company {company_id}: {exc.detail}"
                        ),
                    )
                else:
                    invoice.voucher_id = voucher.id
                    print(f"  Rebuilt voucher {voucher.id} for invoice {invoice.id}")
                    changed = True

            if changed:
                db.flush()

        db.commit()


def main():
    db: Session = SessionLocal()
    try:
        backfill_purchase_bills_and_rebuild_vouchers(db)
        backfill_sales_invoices_and_rebuild_vouchers(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()