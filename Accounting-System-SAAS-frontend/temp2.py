import re

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_headers = 'headers = ["Employee ID", "Employee Name", "Payable Days", "TDS Amount"]'
new_headers = 'headers = ["Employee ID", "Employee Name", "Department", "Project", "Segment", "Payable Days", "TDS Amount"]'

content = content.replace(old_headers, new_headers)

# Find the row appending
old_row1 = 'row = [emp.id, emp.full_name, float(slip.payable_days or 0), float(getattr(slip, "tds_amount", 0) or 0)]'
new_row1 = '''dept = emp.department.name if emp.department else ""
            proj = emp.project.name if emp.project else ""
            seg = emp.segment.name if emp.segment else ""
            row = [emp.id, emp.full_name, dept, proj, seg, float(slip.payable_days or 0), float(getattr(slip, "tds_amount", 0) or 0)]'''

content = content.replace(old_row1, new_row1)

old_row2 = 'row = [emp.id, emp.full_name, 30, 0]'
new_row2 = '''dept = emp.department.name if emp.department else ""
            proj = emp.project.name if emp.project else ""
            seg = emp.segment.name if emp.segment else ""
            row = [emp.id, emp.full_name, dept, proj, seg, 30, 0]'''

content = content.replace(old_row2, new_row2)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print('Updated payroll.py')
