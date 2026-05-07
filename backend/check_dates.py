import nepali_datetime
from datetime import date

dates = [
    date(2023, 7, 15),
    date(2023, 7, 16),
    date(2023, 7, 17),
    date(2024, 7, 15),
    date(2024, 7, 16),
]

for d in dates:
    bs = nepali_datetime.date.from_datetime_date(d)
    print(f"{d} -> {bs} (Month: {bs.month})")
