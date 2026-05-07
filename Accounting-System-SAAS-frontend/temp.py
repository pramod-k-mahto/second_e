import sys, re

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Match the loop handling employees
pattern = re.compile(
    r"    for emp in employees:\r?\n        row = \[emp\.id, emp\.full_name, 30, 0\]\r?\n        for ph in payheads:\r?\n            row\.append\(0\)\r?\n        ws\.append\(row\)", 
    re.MULTILINE
)

replacement = """    payslips = db.query(models.PayrollPayslip).filter(models.PayrollPayslip.payroll_run_id == run_id).all()
    payslip_by_emp = {p.employee_id: p for p in payslips}
    
    payslip_lines = db.query(models.PayrollPayslipLine).join(models.PayrollPayslip).filter(models.PayrollPayslip.payroll_run_id == run_id).all()
    lines_by_slip = {}
    for l in payslip_lines:
        lines_by_slip.setdefault(l.payslip_id, {})[l.payhead_id] = float(l.amount or 0)

    for emp in employees:
        slip = payslip_by_emp.get(emp.id)
        if slip:
            row = [emp.id, emp.full_name, float(slip.payable_days or 0), float(getattr(slip, "tds_amount", 0) or 0)]
            slines = lines_by_slip.get(slip.id, {})
            for ph in payheads:
                row.append(slines.get(ph.id, 0.0))
        else:
            row = [emp.id, emp.full_name, 30, 0]
            for ph in payheads:
                row.append(0.0)
        ws.append(row)"""

new_content = pattern.sub(replacement, content)

with open(path, 'w', encoding='utf-8', newline='') as f:
    f.write(new_content)

print("Done")
