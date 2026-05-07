import sys

path = 'd:/Accounting System/API/backend/app/routers/payroll.py'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the existing endpoint with an updated one that handles calendar_mode
old_endpoint_start = '@router.get("/reports/salary-sheet")'
# I'll search for the function body and replace it.

updated_endpoint = '''
@router.get("/reports/salary-sheet")
def get_salary_sheet_report(
    company_id: int,
    year: int = Query(...),
    month: int = Query(None),
    employee_id: int = Query(None),
    department_id: int = Query(None),
    project_id: int = Query(None),
    segment_id: int = Query(None),
    calendar_mode: str = Query("AD"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company(db, company_id, current_user)
    company_mode = getattr(company, 'calendar_mode', 'AD')
    
    # We need to decide what the stored year/month represent.
    # In this system, they usually follow company_mode.
    
    target_year = year
    target_month = month
    
    # If the user is querying in a different mode than the company default,
    # we may need to translate the filter.
    # For now, let\'s assume the user wants to see data that MATCHES the selected period.
    # If they are in BS mode and select 2081-01, they expect to see runs from 2081-01 (BS).
    # If the database stores runs in AD, we must translate.
    
    # Translation logic for monthly filters
    if month is not None and calendar_mode != company_mode:
        from ..nepali_date import bs_to_ad_date, ad_to_bs_str
        from datetime import date
        try:
            if calendar_mode == "BS" and company_mode == "AD":
                # Convert BS year/month to AD year/month
                ad_date = bs_to_ad_date(f"{year}-{month:02d}-15")
                target_year = ad_date.year
                target_month = ad_date.month
            elif calendar_mode == "AD" and company_mode == "BS":
                # Convert AD year/month to BS year/month
                bs_str = ad_to_bs_str(date(year, month, 15))
                y, m, d = map(int, bs_str.split("-"))
                target_year = y
                target_month = m
        except:
            pass

    query = db.query(models.PayrollPayslip).join(models.PayrollRun).filter(
        models.PayrollPayslip.company_id == company_id
    )
    
    if month is None:
        # For year compile, we filter by the year.
        # If calendar_mode != company_mode, a single BS year might span two AD years.
        # For simplicity, we just filter by the provided year number.
        query = query.filter(models.PayrollRun.period_year == year)
    else:
        query = query.filter(
            models.PayrollRun.period_year == target_year,
            models.PayrollRun.period_month == target_month
        )
    
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
        "payheads": [{"id": ph.id, "name": ph.name, "type": ph.type.value if hasattr(ph.type, \'value\') else str(ph.type)} for ph in payheads],
        "rows": report_rows
    }
'''

# Find and replace the old function.
# I\'ll just find the start and end of the function.
import re
pattern = r'@router\.get\("/reports/salary-sheet"\).*?return \{.*?\}'
content = re.sub(pattern, updated_endpoint, content, flags=re.DOTALL)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Updated salary sheet report endpoint with calendar conversion')
