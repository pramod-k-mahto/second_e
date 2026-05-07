from datetime import date, datetime, time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_admin
from ..database import get_db
from . import admin_logs
from .seed import _seed_default_chart_for_company

router = APIRouter(
    prefix="/admin/maintenance",
    tags=["Admin Maintenance"],
    dependencies=[Depends(get_current_admin)],
)

ALLOWED_TASKS = {
    "reseed_demo_data",
    "cleanup_test_companies",
    "fix_purchase_bill_stock_posted_at",
    "repair_standard_ledgers",
    "reset_company_transactions",
    "sync_ghost_accounting",
}


def run_seed_demo(db: Session) -> None:
    # TODO: hook this into your existing seed logic if you want
    pass


def cleanup_test_companies(db: Session) -> None:
    # TODO: implement cleanup logic as needed
    pass


def fix_purchase_bill_stock_posted_at(
    db: Session,
    *,
    from_date: date | None,
    to_date: date | None,
    company_id: int | None,
    dry_run: bool,
) -> dict:
    PurchaseBill = models.PurchaseBill
    StockLedger = models.StockLedger
    StockMovement = models.StockMovement

    bills_q = db.query(PurchaseBill.id, PurchaseBill.company_id, PurchaseBill.date)
    if company_id is not None:
        bills_q = bills_q.filter(PurchaseBill.company_id == company_id)
    if from_date is not None:
        bills_q = bills_q.filter(PurchaseBill.date >= from_date)
    if to_date is not None:
        bills_q = bills_q.filter(PurchaseBill.date <= to_date)

    bill_rows = bills_q.all()
    bill_map: dict[tuple[int, int], date] = {
        (row.company_id, row.id): row.date for row in bill_rows
    }

    if not bill_map:
        return {
            "companies_processed": 0,
            "bills_considered": 0,
            "stock_ledger_rows_updated": 0,
            "stock_movement_rows_updated": 0,
        }

    keys_company_ids = {cid for cid, _ in bill_map.keys()}
    keys_bill_ids = {bid for _, bid in bill_map.keys()}

    ledger_rows = (
        db.query(StockLedger)
        .filter(
            StockLedger.company_id.in_(keys_company_ids),
            StockLedger.source_type == "PURCHASE_BILL",
            StockLedger.source_id.in_(keys_bill_ids),
        )
        .all()
    )

    movement_rows = (
        db.query(StockMovement)
        .filter(
            StockMovement.company_id.in_(keys_company_ids),
            StockMovement.source_type == "PURCHASE_BILL",
            StockMovement.source_id.in_(keys_bill_ids),
        )
        .all()
    )

    ledger_updates = 0
    for r in ledger_rows:
        bill_date = bill_map.get((r.company_id, int(r.source_id)))
        if bill_date is None:
            continue
        desired = datetime.combine(bill_date, time.min)
        current = r.posted_at
        if current is None or current.date() != bill_date:
            ledger_updates += 1
            if not dry_run:
                r.posted_at = desired

    movement_updates = 0
    for r in movement_rows:
        bill_date = bill_map.get((r.company_id, int(r.source_id)))
        if bill_date is None:
            continue
        if r.movement_date != bill_date:
            movement_updates += 1
            if not dry_run:
                r.movement_date = bill_date

    return {
        "companies_processed": len(keys_company_ids),
        "bills_considered": len(bill_map),
        "stock_ledger_rows_updated": ledger_updates,
        "stock_movement_rows_updated": movement_updates,
    }


def repair_standard_ledgers(
    db: Session,
    *,
    company_id: int | None,
) -> dict:
    companies_q = db.query(models.Company)
    if company_id is not None:
        companies_q = companies_q.filter(models.Company.id == company_id)
    companies = companies_q.order_by(models.Company.id.asc()).all()

    companies_processed = 0
    ledgers_created = 0
    payment_modes_created = 0
    failures: list[dict[str, int | str]] = []

    for company in companies:
        companies_processed += 1
        try:
            result = _seed_default_chart_for_company(db, company)
        except Exception as exc:
            failures.append({"company_id": int(company.id), "error": str(exc)})
            continue

        ledgers_created += int(result.get("ledgers_created", 0) or 0)
        payment_modes_created += int(result.get("payment_modes_created", 0) or 0)

    return {
        "companies_processed": companies_processed,
        "ledgers_created": ledgers_created,
        "payment_modes_created": payment_modes_created,
        "failures": failures,
    }


@router.post("/run")
def run_maintenance_task(
    payload: schemas.MaintenanceTask,
    db: Session = Depends(get_db),
    current_admin: models.User = Depends(get_current_admin),
):
    task = payload.task
    if task not in ALLOWED_TASKS:
        raise HTTPException(status_code=400, detail="Unknown task")

    if task in {"fix_purchase_bill_stock_posted_at", "repair_standard_ledgers", "reset_company_transactions"} and current_admin.role != models.UserRole.superadmin:
        raise HTTPException(status_code=403, detail="Superadmin role required")

    if task == "reseed_demo_data":
        run_seed_demo(db)
    elif task == "cleanup_test_companies":
        cleanup_test_companies(db)
    elif task == "fix_purchase_bill_stock_posted_at":
        result = fix_purchase_bill_stock_posted_at(
            db,
            from_date=payload.from_date,
            to_date=payload.to_date,
            company_id=payload.company_id,
            dry_run=bool(payload.dry_run),
        )
    elif task == "repair_standard_ledgers":
        result = repair_standard_ledgers(db, company_id=payload.company_id)
    elif task == "reset_company_transactions":
        if not payload.company_id:
            raise HTTPException(status_code=400, detail="company_id is required for this task")
        from ..maintenance_service import reset_company_transactions_impl
        reset_company_transactions_impl(db, payload.company_id)
        result = {"company_id": payload.company_id, "status": "reset_successful"}
    elif task == "sync_ghost_accounting":
        from .scripts.backfill_ghost_accounting import backfill
        result = backfill(db)

    admin_logs.log_event(
        db,
        user_id=current_admin.id,
        tenant_id=None,
        action=f"maintenance_{task}",
        message=f"Maintenance task {task} executed by admin {current_admin.id}",
    )
    db.commit()
    if task in {"fix_purchase_bill_stock_posted_at", "repair_standard_ledgers", "reset_company_transactions"}:
        return {"detail": f"Task {task} completed.", "result": result}
    return {"detail": f"Task {task} completed."}