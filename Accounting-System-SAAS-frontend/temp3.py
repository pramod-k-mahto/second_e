import re

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code = '''    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]: continue
        try:
            emp_id = int(row[0])
            payable_days = float(row[2] or 0)
            tds_amount = float(row[3] or 0)
        except (ValueError, TypeError):'''

new_code = '''    payable_idx = headers.index("Payable Days") if "Payable Days" in headers else 2
    tds_idx = headers.index("TDS Amount") if "TDS Amount" in headers else 3
    for row in ws.iter_rows(min_row=2, values_only=True):
        if not row[0]: continue
        try:
            emp_id = int(row[0])
            payable_days = float(row[payable_idx] if len(row) > payable_idx and row[payable_idx] is not None else 0)
            tds_amount = float(row[tds_idx] if len(row) > tds_idx and row[tds_idx] is not None else 0)
        except (ValueError, TypeError):'''

content = content.replace(old_code, new_code)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated parser indices in payroll.py')
