from __future__ import annotations

from datetime import date

import nepali_datetime


def bs_to_ad_date(bs_date: str) -> date:
    bs_date = (bs_date or "").strip()
    parts = bs_date.split("-")
    if len(parts) != 3:
        raise ValueError("Invalid BS date format. Expected YYYY-MM-DD")

    try:
        y, m, d = (int(parts[0]), int(parts[1]), int(parts[2]))
    except ValueError as exc:
        raise ValueError("Invalid BS date format. Expected YYYY-MM-DD") from exc

    try:
        return nepali_datetime.date(y, m, d).to_datetime_date()
    except Exception as exc:
        raise ValueError("Invalid BS date") from exc


def ad_to_bs_str(ad_date: date) -> str:
    bs = nepali_datetime.date.from_datetime_date(ad_date)
    return f"{bs.year:04d}-{bs.month:02d}-{bs.day:02d}"


def get_nepali_fiscal_year(ad_date: date) -> str:
    """Return Nepali Fiscal Year in YY-YY format.
    Nepali FY starts on July 16 and ends on July 15.
    Example: 2024-07-16 falls in FY 81-82 (BS).
    """
    bs_date = nepali_datetime.date.from_datetime_date(ad_date)
    # July 16 is approximately Shrawan 1st.
    # We should use the BS calendar logic to be precise.
    # In BS, Shrawan 1st is the start of the fiscal year.
    
    if bs_date.month >= 4:  # Shrawan is month 4
        start_year = bs_date.year
        end_year = bs_date.year + 1
    else:
        start_year = bs_date.year - 1
        end_year = bs_date.year
        
    return f"{str(start_year)[-2:]}-{str(end_year)[-2:]}"
