path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

old_code = '''        if slip is not None:
            db.query(models.PayrollPayslipLine).filter(models.PayrollPayslipLine.payslip_id == int(slip.id)).delete()
            db.delete(slip)
            db.flush()
            
        slip = models.PayrollPayslip(
            company_id=company_id,
            payroll_run_id=run_id,
            employee_id=emp_id,
            payable_days=payable_days,
            absent_days=0,
            late_minutes=0,
            overtime_minutes=0,
            is_manual_override=True,
            override_reason="Uploaded via Excel"
        )
        db.add(slip)
        db.flush()'''

new_code = '''        if slip is None:
            slip = models.PayrollPayslip(
                company_id=company_id,
                payroll_run_id=run_id,
                employee_id=emp_id,
            )
            db.add(slip)
            db.flush()
        else:
            db.query(models.PayrollPayslipLine).filter(models.PayrollPayslipLine.payslip_id == int(slip.id)).delete()
            
        slip.payable_days = payable_days
        slip.absent_days = 0
        slip.late_minutes = 0
        slip.overtime_minutes = 0
        slip.is_manual_override = True
        slip.override_reason = "Uploaded via Excel"'''

content = content.replace(old_code, new_code)
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated update instead of delete')
