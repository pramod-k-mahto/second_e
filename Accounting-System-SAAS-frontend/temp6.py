import sys

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoint = '''
@router.get("/reports/salary-sheet")
def get_salary_sheet_report(
    company_id: int,
    year: int = Query(...),
    month: int = Query(None),
    employee_id: int = Query(None),
    department_id: int = Query(None),
    project_id: int = Query(None),
    segment_id: int = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    
    query = db.query(models.PayrollPayslip).join(models.PayrollRun).filter(
        models.PayrollPayslip.company_id == company_id,
        models.PayrollRun.period_year == year
    )
    
    if month is not None:
        query = query.filter(models.PayrollRun.period_month == month)
    
    if employee_id:
        query = query.filter(models.PayrollPayslip.employee_id == employee_id)
        
    payslips = query.all()
    
    if department_id or project_id or segment_id:
        filtered = []
        for p in payslips:
            emp = p.employee
            if department_id and emp.department_id != department_id: continue
            if project_id and emp.project_id != project_id: continue
            if segment_id and emp.segment_id != segment_id: continue
            filtered.append(p)
        payslips = filtered

    payhead_ids = set()
    for p in payslips:
        for line in p.lines:
            payhead_ids.add(line.payhead_id)
            
    payheads = db.query(models.PayrollPayhead).filter(models.PayrollPayhead.id.in_(payhead_ids)).all() if payhead_ids else []
    payheads.sort(key=lambda x: x.sort_order)
    
    if month is None:
        agg = {}
        for p in payslips:
            eid = p.employee_id
            if eid not in agg:
                agg[eid] = {
                    "employee_id": eid,
                    "employee_name": p.employee.full_name,
                    "department": p.employee.department.name if p.employee.department else "",
                    "project": p.employee.project.name if p.employee.project else "",
                    "segment": p.employee.segment.name if p.employee.segment else "",
                    "payable_days": 0.0,
                    "earnings_total": 0.0,
                    "deductions_total": 0.0,
                    "tds_amount": 0.0,
                    "net_pay": 0.0,
                }
            
            agg[eid]["payable_days"] += float(p.payable_days)
            agg[eid]["earnings_total"] += float(p.earnings_total)
            agg[eid]["deductions_total"] += float(p.deductions_total)
            agg[eid]["tds_amount"] += float(p.tds_amount)
            agg[eid]["net_pay"] += float(p.net_pay)
            
            for line in p.lines:
                key = f"ph_{line.payhead_id}"
                agg[eid][key] = agg[eid].get(key, 0.0) + float(line.amount)
        report_rows = list(agg.values())
    else:
        report_rows = []
        for p in payslips:
            row = {
                "employee_id": p.employee_id,
                "employee_name": p.employee.full_name,
                "department": p.employee.department.name if p.employee.department else "",
                "project": p.employee.project.name if p.employee.project else "",
                "segment": p.employee.segment.name if p.employee.segment else "",
                "month": p.run.period_month,
                "year": p.run.period_year,
                "payable_days": float(p.payable_days),
                "earnings_total": float(p.earnings_total),
                "deductions_total": float(p.deductions_total),
                "tds_amount": float(p.tds_amount),
                "net_pay": float(p.net_pay),
            }
            for line in p.lines:
                row[f"ph_{line.payhead_id}"] = float(line.amount)
            report_rows.append(row)
            
    return {
        "payheads": [{"id": ph.id, "name": ph.name, "type": ph.type.value if hasattr(ph.type, 'value') else str(ph.type)} for ph in payheads],
        "rows": report_rows
    }
'''

content = content + "\n" + new_endpoint
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Added salary sheet report endpoint')
