from datetime import time

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import get_current_user
from ..database import get_db
from ..dependencies import get_company


router = APIRouter(prefix="/companies/{company_id}/seed", tags=["seed"])


def _seed_default_chart_for_company(db: Session, company: models.Company) -> dict:
    # Define hierarchical default groups (primary + secondary)
    # (name, group_type, parent_group_name)
    group_specs = [
        # Assets
        ("Assets", models.LedgerGroupType.ASSET, None),
        ("Current Assets", models.LedgerGroupType.ASSET, "Assets"),
        ("Cash-in-Hand", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Bank Accounts", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Sundry Debtors", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Loans & Advances (Assets)", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Deposits (Assets)", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Stock-in-Hand", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Prepaid Expenses", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Input Tax Credits", models.LedgerGroupType.ASSET, "Current Assets"),
        ("TDS Receivable", models.LedgerGroupType.ASSET, "Current Assets"),
        ("VAT Receivable", models.LedgerGroupType.ASSET, "Current Assets"),
        ("Fixed Assets", models.LedgerGroupType.ASSET, "Assets"),
        ("Furniture & Fixtures", models.LedgerGroupType.ASSET, "Fixed Assets"),
        ("Plant & Machinery", models.LedgerGroupType.ASSET, "Fixed Assets"),
        ("Computers", models.LedgerGroupType.ASSET, "Fixed Assets"),
        ("Office Equipment", models.LedgerGroupType.ASSET, "Fixed Assets"),
        ("Land & Building", models.LedgerGroupType.ASSET, "Fixed Assets"),
        ("Vehicles", models.LedgerGroupType.ASSET, "Fixed Assets"),
        ("Accumulated Depreciation", models.LedgerGroupType.ASSET, "Fixed Assets"),

        # Liabilities
        ("Liabilities", models.LedgerGroupType.LIABILITY, None),
        ("Current Liabilities", models.LedgerGroupType.LIABILITY, "Liabilities"),
        ("Sundry Creditors", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("Duties & Taxes", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("TDS Payable", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("VAT Payable", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("GST Payable", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("Payroll Payables", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("Expenses Payable", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("Advances from Customers", models.LedgerGroupType.LIABILITY, "Current Liabilities"),
        ("Long Term Liabilities", models.LedgerGroupType.LIABILITY, "Liabilities"),
        ("Secured Loans", models.LedgerGroupType.LIABILITY, "Long Term Liabilities"),
        ("Unsecured Loans", models.LedgerGroupType.LIABILITY, "Long Term Liabilities"),
        ("Owner’s Equity", models.LedgerGroupType.LIABILITY, "Liabilities"),
        ("Capital Account", models.LedgerGroupType.LIABILITY, "Owner’s Equity"),
        ("Drawings", models.LedgerGroupType.LIABILITY, "Owner’s Equity"),
        ("Retained Earnings / Reserves & Surplus", models.LedgerGroupType.LIABILITY, "Owner’s Equity"),

        # Income
        ("Income", models.LedgerGroupType.INCOME, None),
        ("Sales Accounts", models.LedgerGroupType.INCOME, "Income"),
        ("Indirect Income", models.LedgerGroupType.INCOME, "Income"),
        ("Direct Income", models.LedgerGroupType.INCOME, "Income"),
        ("Discount Received", models.LedgerGroupType.INCOME, "Income"),
        ("Commission Received", models.LedgerGroupType.INCOME, "Income"),

        # Expenses
        ("Expenses", models.LedgerGroupType.EXPENSE, None),
        ("Direct Expenses", models.LedgerGroupType.EXPENSE, "Expenses"),
        ("Purchase Accounts", models.LedgerGroupType.EXPENSE, "Direct Expenses"),
        ("Freight / Carriage Inwards", models.LedgerGroupType.EXPENSE, "Direct Expenses"),
        ("Import Duty", models.LedgerGroupType.EXPENSE, "Direct Expenses"),
        ("Manufacturing Expenses", models.LedgerGroupType.EXPENSE, "Direct Expenses"),
        ("Indirect Expenses", models.LedgerGroupType.EXPENSE, "Expenses"),
        ("Salary Expense", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Office Rent", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Utilities", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Repair & Maintenance", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Fuel Expenses", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Travel Expenses", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Advertising Expenses", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Telephone/Internet Expense", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Miscellaneous Expenses", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Discount Allowed", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
        ("Commission Paid", models.LedgerGroupType.EXPENSE, "Indirect Expenses"),
    ]

    groups: dict[str, models.LedgerGroup] = {}

    # Create or reuse groups; parents must already exist in this list order
    for name, gtype, parent_name in group_specs:
        parent_group = groups.get(parent_name) if parent_name else None
        normalized_name = str(name).strip()
        query = db.query(models.LedgerGroup).filter(
            models.LedgerGroup.company_id == company.id,
            func.lower(func.btrim(models.LedgerGroup.name))
            == func.lower(func.btrim(normalized_name)),
        )
        if parent_group is not None:
            query = query.filter(models.LedgerGroup.parent_group_id == parent_group.id)
        group = query.first()
        if not group:
            group = models.LedgerGroup(
                company_id=company.id,
                name=normalized_name,
                group_type=gtype,
                parent_group_id=parent_group.id if parent_group is not None else None,
            )
            db.add(group)
            try:
                db.flush()
            except IntegrityError:
                db.rollback()
                group = query.first()
                if not group:
                    raise
        groups[name] = group

    # Choose default ledgers based on company country (tax structure differences)
    country = getattr(company, "country", None)

    # (ledger_name, group_name)
    if country == "NP":
        ledger_specs = [
            # Cash & Bank
            ("Cash", "Cash-in-Hand"),
            ("Petty Cash", "Cash-in-Hand"),
            ("Bank A/C (Placeholder)", "Bank Accounts"),

            # Inventory / Stock
            ("Opening Stock", "Stock-in-Hand"),
            ("Closing Stock", "Stock-in-Hand"),

            # Parties
            ("Customers", "Sundry Debtors"),
            ("Suppliers", "Sundry Creditors"),

            # Tax Ledgers (VAT/TDS)
            ("Input VAT", "Input Tax Credits"),
            ("Output VAT", "Duties & Taxes"),
            ("VAT Payable", "VAT Payable"),
            ("VAT Receivable", "VAT Receivable"),
            ("Duties & Taxes", "Duties & Taxes"),
            ("Service Charge", "Indirect Income"),
            ("TDS Payable", "TDS Payable"),
            ("TDS Receivable", "TDS Receivable"),

            # Sales & Purchase
            ("Sales (Goods/Service)", "Sales Accounts"),
            ("Purchase (Goods/Service)", "Purchase Accounts"),
            ("Sales Return", "Sales Accounts"),
            ("Purchase Return", "Purchase Accounts"),
            ("Discount Allowed", "Discount Allowed"),
            ("Discount Received", "Discount Received"),

            # Expenses (Default)
            ("Salary Expense", "Salary Expense"),
            ("Office Rent", "Office Rent"),
            ("Electricity Expense", "Utilities"),
            ("Internet Expense", "Telephone/Internet Expense"),
            ("Travel Expense", "Travel Expenses"),
            ("Printing & Stationery", "Indirect Expenses"),
            ("Repair & Maintenance", "Repair & Maintenance"),
            ("Miscellaneous Expense", "Miscellaneous Expenses"),

            # Income (Default)
            ("Commission Income", "Commission Received"),
            ("Interest Income", "Indirect Income"),
            ("Service Income", "Direct Income"),

            # Fixed Assets & Depreciation
            ("Depreciation Expense", "Indirect Expenses"),
            ("Accumulated Depreciation", "Accumulated Depreciation"),

            # Capital & Equity
            ("Capital Account", "Capital Account"),
            ("Drawings", "Drawings"),
            ("Retained Earnings", "Retained Earnings / Reserves & Surplus"),
        ]
    else:
        # Generic template for other countries (simpler tax naming)
        ledger_specs = [
            # Cash & Bank
            ("Cash", "Cash-in-Hand"),
            ("Petty Cash", "Cash-in-Hand"),
            ("Bank A/C (Placeholder)", "Bank Accounts"),

            # Parties
            ("Customers", "Sundry Debtors"),
            ("Suppliers", "Sundry Creditors"),

            # Generic Tax Ledgers
            ("Input Tax", "Input Tax Credits"),
            ("Output Tax", "Duties & Taxes"),
            ("Tax Payable", "Duties & Taxes"),
            ("Tax Receivable", "Input Tax Credits"),
            ("Service Charge", "Indirect Income"),

            # Sales & Purchase
            ("Sales (Goods/Service)", "Sales Accounts"),
            ("Purchase (Goods/Service)", "Purchase Accounts"),
            ("Sales Return", "Sales Accounts"),
            ("Purchase Return", "Purchase Accounts"),
            ("Discount Allowed", "Discount Allowed"),
            ("Discount Received", "Discount Received"),

            # Expenses (Default)
            ("Salary Expense", "Salary Expense"),
            ("Office Rent", "Office Rent"),
            ("Electricity Expense", "Utilities"),
            ("Internet Expense", "Telephone/Internet Expense"),
            ("Travel Expense", "Travel Expenses"),
            ("Printing & Stationery", "Indirect Expenses"),
            ("Repair & Maintenance", "Repair & Maintenance"),
            ("Miscellaneous Expense", "Miscellaneous Expenses"),

            # Income (Default)
            ("Commission Income", "Commission Received"),
            ("Interest Income", "Indirect Income"),
            ("Service Income", "Direct Income"),

            # Fixed Assets & Depreciation
            ("Depreciation Expense", "Indirect Expenses"),
            ("Accumulated Depreciation", "Accumulated Depreciation"),

            # Capital & Equity
            ("Capital Account", "Capital Account"),
            ("Drawings", "Drawings"),
            ("Retained Earnings", "Retained Earnings / Reserves & Surplus"),
        ]

    # Stable codes for key default ledgers
    ledger_codes: dict[str, str] = {
        # Cash & Bank
        "Cash": "CASH",
        "Petty Cash": "PETTY_CASH",
        "Bank A/C (Placeholder)": "DEFAULT_BANK",

        # Inventory / Stock
        "Opening Stock": "OPENING_STOCK",
        "Closing Stock": "CLOSING_STOCK",

        # Parties
        "Customers": "CUSTOMERS",
        "Suppliers": "SUPPLIERS",

        # Nepal VAT/TDS
        "Input VAT": "INPUT_VAT",
        "Output VAT": "OUTPUT_VAT",
        "VAT Payable": "VAT_PAYABLE",
        "VAT Receivable": "VAT_RECEIVABLE",
        "TDS Payable": "TDS_PAYABLE",
        "TDS Receivable": "TDS_RECEIVABLE",

        # Generic tax
        "Input Tax": "INPUT_TAX",
        "Output Tax": "OUTPUT_TAX",
        "Tax Payable": "TAX_PAYABLE",
        "Tax Receivable": "TAX_RECEIVABLE",

        # Common
        "Duties & Taxes": "DUTIES_TAXES",
        "Service Charge": "SERVICE_CHARGE",

        # Sales & Purchase
        "Sales (Goods/Service)": "SALES",
        "Purchase (Goods/Service)": "PURCHASES",
        "Sales Return": "SALES_RETURN",
        "Purchase Return": "PURCHASE_RETURN",
        "Discount Allowed": "DISCOUNT_ALLOWED",
        "Discount Received": "DISCOUNT_RECEIVED",

        # Fixed Assets & Depreciation
        "Depreciation Expense": "DEPRECIATION_EXPENSE",
        "Accumulated Depreciation": "ACCUM_DEPRECIATION",

        # Capital & Equity
        "Capital Account": "CAPITAL",
        "Drawings": "DRAWINGS",
        "Retained Earnings": "RETAINED_EARNINGS",
    }

    ledgers_created = 0
    for ledger_name, group_name in ledger_specs:
        group = groups.get(group_name)
        if group is None:
            continue
        normalized_ledger_name = str(ledger_name).strip()
        existing = (
            db.query(models.Ledger)
            .filter(
                models.Ledger.company_id == company.id,
                func.lower(func.btrim(models.Ledger.name))
                == func.lower(func.btrim(normalized_ledger_name)),
            )
            .first()
        )
        if existing:
            standard_code = ledger_codes.get(ledger_name)
            if standard_code and getattr(existing, "code", None) is None:
                existing.code = standard_code
                db.add(existing)
            continue

        # Default opening balance type based on group type
        if group.group_type in (models.LedgerGroupType.ASSET, models.LedgerGroupType.EXPENSE):
            ob_type = models.OpeningBalanceType.DEBIT
        else:
            ob_type = models.OpeningBalanceType.CREDIT

        ledger = models.Ledger(
            company_id=company.id,
            group_id=group.id,
            name=normalized_ledger_name,
            code=ledger_codes.get(ledger_name),
            opening_balance=0,
            opening_balance_type=ob_type,
            is_active=True,
        )
        db.add(ledger)
        try:
            db.flush()
            ledgers_created += 1
        except IntegrityError:
            db.rollback()
            existing = (
                db.query(models.Ledger)
                .filter(
                    models.Ledger.company_id == company.id,
                    func.lower(func.btrim(models.Ledger.name))
                    == func.lower(func.btrim(normalized_ledger_name)),
                )
                .first()
            )
            if existing is None:
                raise

    db.commit()

    # Seed default payment modes for this company based on standard ledgers
    # Map payment mode names to standard ledger codes
    
    # User requested removal of hard-coded payment modes from seed.
    # Companies should configure their own payment modes via the settings page.
    payment_modes_created = 0

    # Fetch existing standard ledgers by code
    from ..models import Ledger, PaymentMode  # local import to avoid circulars at module import time

    code_to_ledger: dict[str, Ledger] = {
        l.code: l
        for l in db.query(Ledger)
        .filter(Ledger.company_id == company.id, Ledger.code.isnot(None))
        .all()
    }

    # Wire company-level defaults for purchase and input tax ledgers from seeded codes
    if company.default_purchase_ledger_id is None:
        # Prioritize the Purchases (Expense) ledger for the company-wide default.
        # This ensures purchase transactions hit the 'Purchases' ledger by default,
        # making them visible in the standard Purchase ledger report.
        purchases_ledger = code_to_ledger.get("PURCHASES")
        if purchases_ledger is not None:
            company.default_purchase_ledger_id = purchases_ledger.id
        
        if company.default_purchase_ledger_id is None:
            for stock_code in ("CLOSING_STOCK", "OPENING_STOCK"):
                stock_ledger = code_to_ledger.get(stock_code)
                if stock_ledger is not None:
                    company.default_purchase_ledger_id = stock_ledger.id
                    break

    if company.default_sales_ledger_id is None:
        sales_ledger = code_to_ledger.get("SALES")
        if sales_ledger is not None:
            company.default_sales_ledger_id = sales_ledger.id

    # Wire item-level defaults separately from header defaults.
    if company.default_item_income_ledger_id is None:
        named_income_ledger = (
            db.query(Ledger)
            .filter(
                Ledger.company_id == company.id,
                Ledger.is_active == True,
                Ledger.name == "Sales (Goods/Service)",
            )
            .order_by(Ledger.id.asc())
            .first()
        )
        if named_income_ledger is not None:
            company.default_item_income_ledger_id = named_income_ledger.id
        elif company.default_sales_ledger_id is not None:
            company.default_item_income_ledger_id = company.default_sales_ledger_id

    if company.default_item_expense_ledger_id is None and company.default_purchase_ledger_id is not None:
        company.default_item_expense_ledger_id = company.default_purchase_ledger_id

    if company.default_input_tax_ledger_id is None:
        for tax_code in ("INPUT_TAX", "INPUT_VAT"):
            input_tax_ledger = code_to_ledger.get(tax_code)
            if input_tax_ledger is not None:
                company.default_input_tax_ledger_id = input_tax_ledger.id
                break

    if company.default_item_input_tax_ledger_id is None and company.default_input_tax_ledger_id is not None:
        company.default_item_input_tax_ledger_id = company.default_input_tax_ledger_id

    if company.default_output_tax_ledger_id is None:
        for tax_code in ("OUTPUT_TAX", "OUTPUT_VAT"):
            output_tax_ledger = code_to_ledger.get(tax_code)
            if output_tax_ledger is not None:
                company.default_output_tax_ledger_id = output_tax_ledger.id
                break

    if company.default_item_output_tax_ledger_id is None and company.default_output_tax_ledger_id is not None:
        company.default_item_output_tax_ledger_id = company.default_output_tax_ledger_id

    db.commit()

    salary_expense_ledger_id = None
    salary_expense = (
        db.query(Ledger)
        .filter(Ledger.company_id == company.id, Ledger.name == "Salary Expense")
        .order_by(Ledger.id.asc())
        .first()
    )
    if salary_expense is not None:
        salary_expense_ledger_id = int(salary_expense.id)

    tds_payable_ledger_id = None
    tds_ledger = code_to_ledger.get("TDS_PAYABLE")
    if tds_ledger is not None:
        tds_payable_ledger_id = int(tds_ledger.id)

    settings = (
        db.query(models.PayrollSettings)
        .filter(models.PayrollSettings.company_id == company.id)
        .first()
    )
    if settings is None:
        settings = models.PayrollSettings(company_id=company.id)
        db.add(settings)

    if salary_expense_ledger_id is not None and getattr(settings, "default_salary_expense_ledger_id", None) is None:
        settings.default_salary_expense_ledger_id = int(salary_expense_ledger_id)
    if tds_payable_ledger_id is not None and getattr(settings, "tds_payable_ledger_id", None) is None:
        settings.tds_payable_ledger_id = int(tds_payable_ledger_id)
    db.add(settings)
    db.commit()

    default_shift = (
        db.query(models.PayrollShift)
        .filter(models.PayrollShift.company_id == company.id, models.PayrollShift.code == "DAY")
        .first()
    )
    if default_shift is None:
        default_shift = models.PayrollShift(
            company_id=company.id,
            code="DAY",
            name="Day Shift",
            start_time=time(10, 0, 0),
            end_time=time(17, 0, 0),
            expected_work_minutes=420,
            grace_minutes=0,
            allow_night_shift=False,
        )
        db.add(default_shift)
        db.commit()

    payhead_specs = [
        ("BASIC", "Basic", models.PayrollPayheadType.EARNING, salary_expense_ledger_id, None),
        ("GRADE", "Grade", models.PayrollPayheadType.EARNING, salary_expense_ledger_id, None),
        ("ALLOWANCE", "Allowance", models.PayrollPayheadType.EARNING, salary_expense_ledger_id, None),
        ("OVERTIME", "Overtime", models.PayrollPayheadType.EARNING, salary_expense_ledger_id, None),
        ("BONUS", "Bonus", models.PayrollPayheadType.EARNING, salary_expense_ledger_id, None),
        ("INCENTIVE", "Incentive", models.PayrollPayheadType.EARNING, salary_expense_ledger_id, None),
        ("TDS", "TDS/Tax", models.PayrollPayheadType.DEDUCTION, None, tds_payable_ledger_id),
        ("SSF", "SSF", models.PayrollPayheadType.DEDUCTION, None, None),
        ("LOAN", "Loan", models.PayrollPayheadType.DEDUCTION, None, None),
        ("ADVANCE", "Advance", models.PayrollPayheadType.DEDUCTION, None, None),
        ("LATE_PENALTY", "Late Penalty", models.PayrollPayheadType.DEDUCTION, None, None),
        ("ABSENT_DED", "Absent Deduction", models.PayrollPayheadType.DEDUCTION, None, None),
    ]

    for code, name, ptype, exp_ledger_id, pay_ledger_id in payhead_specs:
        existing_ph = (
            db.query(models.PayrollPayhead)
            .filter(models.PayrollPayhead.company_id == company.id, models.PayrollPayhead.code == code)
            .first()
        )
        if existing_ph is None:
            existing_ph = models.PayrollPayhead(
                company_id=company.id,
                code=code,
                name=name,
                type=ptype,
                taxable=(True if code == "TDS" else False),
                default_amount=None,
                default_rate=None,
                calculation_basis=None,
                sort_order=100,
                expense_ledger_id=exp_ledger_id,
                payable_ledger_id=pay_ledger_id,
                is_active=True,
            )
            db.add(existing_ph)
    db.commit()

    leave_specs = [
        ("CL", "Casual Leave", True),
        ("SL", "Sick Leave", True),
        ("AL", "Annual Leave", True),
    ]
    for code, name, paid in leave_specs:
        existing_lt = (
            db.query(models.LeaveType)
            .filter(models.LeaveType.company_id == company.id, models.LeaveType.code == code)
            .first()
        )
        if existing_lt is None:
            db.add(
                models.LeaveType(
                    company_id=company.id,
                    code=code,
                    name=name,
                    paid=paid,
                    annual_quota=None,
                    carry_forward=False,
                    is_active=True,
                )
            )
    db.commit()

    return {
        "detail": "Default chart seeded",
        "groups": list(groups.keys()),
        "ledgers_created": ledgers_created,
        "payment_modes_created": payment_modes_created,
    }


@router.post("/default-chart")
def seed_default_chart(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
    company: models.Company = Depends(get_company),
):
    """Seed a basic chart of accounts for the given company.

    Creates standard ledger groups and a few common ledgers under each.
    If a group/ledger with the same name already exists for this company,
    it will be reused and not duplicated.
    """

    # Ensure the company belongs to the current user via get_company dependency
    _ = current_user  # only to satisfy type-checkers; enforced via dependency

    return _seed_default_chart_for_company(db, company)
