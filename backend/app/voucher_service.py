from datetime import date
from sqlalchemy import MetaData, Table, func
from sqlalchemy.orm import Session
from . import models
from .nepali_date import get_nepali_fiscal_year

def get_company_calendar_mode(db: Session, *, company_id: int) -> str:
    """Return 'BS' or 'AD' from company_settings table."""
    bind = db.get_bind()
    md = MetaData()
    try:
        table = Table("company_settings", md, autoload_with=bind)
    except Exception:
        return "AD"

    if "company_id" not in table.c or "calendar_mode" not in table.c:
        return "AD"

    row = (
        db.execute(
            table.select()
            .with_only_columns(table.c.calendar_mode)
            .where(table.c.company_id == int(company_id))
            .limit(1)
        )
        .first()
    )
    if not row or not row[0]:
        return "AD"
    return str(row[0]).upper()

def derive_fiscal_year(db: Session, *, company_id: int, voucher_date: date) -> str:
    """Derive fiscal year in YY-YY format (e.g., 81-82)."""
    calendar_mode = get_company_calendar_mode(db, company_id=company_id)
    if calendar_mode == "BS":
        return get_nepali_fiscal_year(voucher_date)
    
    # AD Fiscal Year Range (YY-YY format)
    # Nepali FY (July-July cycle) in AD context
    if voucher_date.month > 7 or (voucher_date.month == 7 and voucher_date.day >= 16):
        start = voucher_date.year
        end = voucher_date.year + 1
    else:
        start = voucher_date.year - 1
        end = voucher_date.year
    return f"{str(start)[-2:]}-{str(end)[-2:]}"

def get_voucher_type_prefix(voucher_type: models.VoucherType) -> str:
    """Map voucher type to its designated prefix."""
    mapping = {
        models.VoucherType.PAYMENT: "PAY",
        models.VoucherType.RECEIPT: "REC",
        models.VoucherType.CONTRA: "CON",
        models.VoucherType.JOURNAL: "JRN",
        models.VoucherType.SALES_INVOICE: "SAL",
        models.VoucherType.PURCHASE_BILL: "PUR",
        models.VoucherType.SALES_RETURN: "SRT",
        models.VoucherType.PURCHASE_RETURN: "PRT",
    }
    return mapping.get(voucher_type, voucher_type.value[:3].upper())

def get_next_voucher_number(db: Session, company_id: int, voucher_type: models.VoucherType, voucher_date: date) -> tuple[str, str, int]:
    """Generate the next voucher number, fiscal year, and sequence globally for a tenant.
    Format: VCH{PREFIX}{FY}-{SEQUENCE:03d}
    Example: VCHSAL81-82-001
    """
    fiscal_year = derive_fiscal_year(db, company_id=company_id, voucher_date=voucher_date)

    # Generate next sequence per (company, fiscal_year, voucher_type)
    last_seq = (
        db.query(func.coalesce(func.max(models.Voucher.voucher_sequence), 0))
        .filter(
            models.Voucher.company_id == company_id,
            models.Voucher.fiscal_year == fiscal_year,
            models.Voucher.voucher_type == voucher_type,
        )
        .scalar()
    )
    next_seq = int(last_seq) + 1

    prefix = get_voucher_type_prefix(voucher_type)
    voucher_number = f"VCH{prefix}{fiscal_year}-{next_seq:03d}"
    
    return voucher_number, fiscal_year, next_seq
