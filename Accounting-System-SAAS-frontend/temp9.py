import sys

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the "Year Compile" logic to handle BS <-> AD translation
new_filter_logic = '''
    if month is None:
        # For year compile, if calendars differ, we need a range
        if calendar_mode != company_mode:
            if calendar_mode == "BS" and company_mode == "AD":
                # BS year Y roughly spans AD year Y-57 (Apr-Dec) and Y-56 (Jan-Apr)
                ad_y1 = year - 57
                ad_y2 = year - 56
                # We can be more precise: 
                # BS 2081-01-01 is 2024-04-13
                # BS 2081-12-31 is 2025-04-13
                query = query.filter(
                    ((models.PayrollRun.period_year == ad_y1) & (models.PayrollRun.period_month >= 4)) |
                    ((models.PayrollRun.period_year == ad_y2) & (models.PayrollRun.period_month <= 4))
                )
            elif calendar_mode == "AD" and company_mode == "BS":
                # AD year Y spans BS year Y+56 (Poush-Chaitra) and Y+57 (Baisakh-Mangsir)
                bs_y1 = year + 56
                bs_y2 = year + 57
                query = query.filter(
                    ((models.PayrollRun.period_year == bs_y1) & (models.PayrollRun.period_month >= 9)) |
                    ((models.PayrollRun.period_year == bs_y2) & (models.PayrollRun.period_month <= 9))
                )
            else:
                query = query.filter(models.PayrollRun.period_year == year)
        else:
            query = query.filter(models.PayrollRun.period_year == year)
    else:
'''

import re
pattern = r'if month is None:.*?else:'
content = re.sub(pattern, new_filter_logic, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated salary sheet report Year Compile logic for BS/AD translation')
