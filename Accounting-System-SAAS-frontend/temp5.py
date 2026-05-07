import sys

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

new_endpoints = '''
@router.get("/runs/{run_id}/salary-sheet-data")
def get_salary_sheet_data(
    company_id: int,
    run_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    run = db.query(models.PayrollRun).filter(models.PayrollRun.id == run_id, models.PayrollRun.company_id == company_id).first()
    if not run: raise HTTPException(404, "Run not found")
    
    employees = db.query(models.Employee).filter(models.Employee.company_id == company_id, models.Employee.is_active == True).all()
    payheads = db.query(models.PayrollPayhead).filter(models.PayrollPayhead.company_id == company_id, models.PayrollPayhead.is_active == True).all()
    
    headers = ["Employee ID", "Employee Name", "Department", "Project", "Segment", "Payable Days", "TDS Amount"]
    for ph in payheads:
        headers.append(f"[{ph.id}] {ph.name}")
        
    payslips = db.query(models.PayrollPayslip).filter(models.PayrollPayslip.payroll_run_id == run_id).all()
    payslip_by_emp = {p.employee_id: p for p in payslips}
    
    payslip_lines = db.query(models.PayrollPayslipLine).join(models.PayrollPayslip).filter(models.PayrollPayslip.payroll_run_id == run_id).all()
    lines_by_slip = {}
    for l in payslip_lines:
        lines_by_slip.setdefault(l.payslip_id, {})[l.payhead_id] = float(l.amount or 0)

    rows = []
    for emp in employees:
        dept = emp.department.name if emp.department else ""
        proj = emp.project.name if emp.project else ""
        seg = emp.segment.name if emp.segment else ""
        
        slip = payslip_by_emp.get(emp.id)
        if slip:
            row = [emp.id, emp.full_name, dept, proj, seg, float(slip.payable_days or 0), float(getattr(slip, "tds_amount", 0) or 0)]
            slines = lines_by_slip.get(slip.id, {})
            for ph in payheads:
                row.append(slines.get(ph.id, 0.0))
        else:
            row = [emp.id, emp.full_name, dept, proj, seg, 30, 0]
            for ph in payheads:
                row.append(0.0)
        rows.append(row)
        
    return {"headers": headers, "rows": rows}

@router.post("/runs/{run_id}/upload-salary-json")
def upload_salary_json(
    company_id: int,
    run_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    run = db.query(models.PayrollRun).filter(models.PayrollRun.id == run_id, models.PayrollRun.company_id == company_id).first()
    if not run: raise HTTPException(404, "Run not found")
    if run.locked: raise HTTPException(400, "Run is locked")
    
    headers = payload.get("headers", [])
    rows = payload.get("rows", [])
    if not headers or headers[0] != "Employee ID":
        raise HTTPException(400, "Invalid template format")
        
    payheads = {ph.id: ph for ph in db.query(models.PayrollPayhead).filter(models.PayrollPayhead.company_id == company_id).all()}
    
    payhead_cols = {}
    for idx, h in enumerate(headers):
        h_str = str(h or "").strip()
        if h_str.startswith("[") and "]" in h_str:
            try:
                pid = int(h_str.split("]")[0].strip("["))
                if pid in payheads:
                    payhead_cols[idx] = pid
            except:
                pass
                
    payable_idx = headers.index("Payable Days") if "Payable Days" in headers else 2
    tds_idx = headers.index("TDS Amount") if "TDS Amount" in headers else 3
    
    for row in rows:
        if not row or not row[0]: continue
        try:
            emp_id = int(row[0])
            payable_days = float(row[payable_idx] if len(row) > payable_idx and row[payable_idx] is not None else 0)
            tds_amount = float(row[tds_idx] if len(row) > tds_idx and row[tds_idx] is not None else 0)
        except (ValueError, TypeError):
            continue
            
        slip = db.query(models.PayrollPayslip).filter(models.PayrollPayslip.payroll_run_id == run_id, models.PayrollPayslip.employee_id == emp_id).with_for_update().first()
        
        if slip is None:
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
        slip.override_reason = "Updated via Preview Grid"
        
        earnings_total = 0.0
        deductions_total = tds_amount
        
        for idx, pid in payhead_cols.items():
            if idx < len(row):
                val = row[idx]
                if val is not None and val != "":
                    try:
                        amt = float(val)
                        if amt <= 0: continue
                        ph = payheads[pid]
                        if ph.type == models.PayrollPayheadType.EARNING:
                            earnings_total += amt
                        else:
                            deductions_total += amt
                            
                        db.add(models.PayrollPayslipLine(
                            company_id=company_id,
                            payslip_id=int(slip.id),
                            payhead_id=pid,
                            type=ph.type,
                            amount=amt
                        ))
                    except (ValueError, TypeError):
                        pass
                        
        slip.earnings_total = float(round(earnings_total, 2))
        slip.deductions_total = float(round(deductions_total, 2))
        slip.tds_amount = float(round(tds_amount, 2))
        slip.net_pay = float(round(earnings_total - deductions_total, 2))
        db.add(slip)
        
    run.status = models.PayrollRunStatus.COMPUTED
    run.computed_at = datetime.utcnow()
    db.commit()
    return {"detail": "Salary data updated successfully"}
'''

content = content + "\n" + new_endpoints
with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Added new endpoints for preview sheet')
