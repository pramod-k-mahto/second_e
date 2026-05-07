import sys

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Update the report rows to include designation and grade
# I'll modify both the monthly and yearly aggregation logic.

updated_logic = '''
            row = {
                "employee_id": p.employee_id,
                "employee_name": p.employee.full_name,
                "designation": getattr(p.employee, "designation", ""),
                "grade": getattr(p.employee, "grade", ""),
                "department": p.employee.department.name if p.employee.department else "",
                "project": p.employee.project.name if p.employee.project else "",
                "segment": p.employee.segment.name if p.employee.segment else "",
'''

content = content.replace('row = {\n                "employee_id": p.employee_id,\n                "employee_name": p.employee.full_name,\n                "department": p.employee.department.name if p.employee.department else "",', updated_logic)

updated_agg_logic = '''
            if eid not in agg:
                agg[eid] = {
                    "employee_id": eid,
                    "employee_name": p.employee.full_name,
                    "designation": getattr(p.employee, "designation", ""),
                    "grade": getattr(p.employee, "grade", ""),
                    "department": p.employee.department.name if p.employee.department else "",
'''
content = content.replace('if eid not in agg:\n                agg[eid] = {\n                    "employee_id": eid,\n                    "employee_name": p.employee.full_name,\n                    "department": p.employee.department.name if p.employee.department else "",', updated_agg_logic)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated salary sheet report to include designation and grade')
