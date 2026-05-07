import sys
import os
from datetime import date

# Add the parent directory to sys.path to import app modules
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    from app.nepali_date import get_nepali_fiscal_year
    from app.models import VoucherType
    from app.voucher_service import get_voucher_type_prefix
except ImportError as e:
    print(f"Import error: {e}")
    sys.exit(1)

def test_nepali_fy():
    print("Testing Nepali Fiscal Year Derivation...")
    test_cases = [
        (date(2023, 7, 16), "79-80"),  # Last day of FY 79/80 (Ashad 31, 2080)
        (date(2023, 7, 17), "80-81"),  # First day of FY 80/81 (Shrawan 1, 2080)
        (date(2024, 7, 15), "80-81"),  # Last day of FY 80/81 (Ashad 31, 2081)
        (date(2024, 7, 16), "81-82"),  # First day of FY 81/82 (Shrawan 1, 2081)
        (date(2025, 1, 1), "81-82"),   # Middle of FY 81/82
    ]
    
    for ad_date, expected in test_cases:
        actual = get_nepali_fiscal_year(ad_date)
        status = "PASS" if actual == expected else f"FAIL (Expected {expected}, got {actual})"
        print(f"  {ad_date} -> {actual} : {status}")

def test_voucher_prefixes():
    print("\nTesting Voucher Type Prefixes...")
    mapping = {
        VoucherType.PAYMENT: "PAY",
        VoucherType.RECEIPT: "REC",
        VoucherType.CONTRA: "CON",
        VoucherType.JOURNAL: "JRN",
        VoucherType.SALES_INVOICE: "SAL",
        VoucherType.PURCHASE_BILL: "PUR",
        VoucherType.SALES_RETURN: "SRT",
        VoucherType.PURCHASE_RETURN: "PRT",
    }
    
    for v_type, expected in mapping.items():
        actual = get_voucher_type_prefix(v_type)
        status = "PASS" if actual == expected else f"FAIL (Expected {expected}, got {actual})"
        print(f"  {v_type.name} -> {actual} : {status}")

if __name__ == "__main__":
    test_nepali_fy()
    test_voucher_prefixes()
