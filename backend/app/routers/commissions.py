from datetime import date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from .. import models, schemas
from ..database import get_db
from ..auth import get_current_user
from ..dependencies import get_company_secure

router = APIRouter(prefix="/companies/{company_id}/commissions", tags=["commissions"])


def _get_company(db: Session, company_id: int, user: models.User) -> models.Company:
    return get_company_secure(db, company_id, user)


# --- Rules CRUD ---

@router.get("/rules", response_model=List[schemas.CommissionRuleRead])
def list_commission_rules(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    return db.query(models.CommissionRule).filter(
        models.CommissionRule.company_id == company_id,
        models.CommissionRule.is_active == True
    ).all()

@router.post("/rules", response_model=schemas.CommissionRuleRead)
def create_commission_rule(
    company_id: int,
    rule_in: schemas.CommissionRuleCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rule = models.CommissionRule(**rule_in.model_dump(), company_id=company_id)
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule

@router.put("/rules/{rule_id}", response_model=schemas.CommissionRuleRead)
def update_commission_rule(
    company_id: int,
    rule_id: int,
    rule_in: schemas.CommissionRuleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rule = db.query(models.CommissionRule).filter(
        models.CommissionRule.company_id == company_id,
        models.CommissionRule.id == rule_id
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    for field, value in rule_in.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    
    db.commit()
    db.refresh(rule)
    return rule

@router.delete("/rules/{rule_id}")
def delete_commission_rule(
    company_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_company(db, company_id, current_user)
    rule = db.query(models.CommissionRule).filter(
        models.CommissionRule.company_id == company_id,
        models.CommissionRule.id == rule_id
    ).first()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    
    # Soft delete
    rule.is_active = False
    db.commit()
    return {"ok": True}

# --- Calculation Report ---

@router.get("/report")
def get_commission_report(
    company_id: int,
    start_date: date,
    end_date: date,
    department_id: Optional[int] = Query(None),
    project_id: Optional[int] = Query(None),
    segment_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    print(f"DEBUG: get_commission_report - company_id={company_id}, dates: {start_date} to {end_date}")
    _get_company(db, company_id, current_user)
    rules = db.query(models.IncentiveRule).filter(
        models.IncentiveRule.company_id == company_id,
        models.IncentiveRule.is_active == True
    ).all()

    # Load company for default ledger
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    default_ledger_id = company.default_incentive_expense_ledger_id if company else None

    # Load ledger names for mapping
    ledger_ids = set()
    if default_ledger_id: ledger_ids.add(default_ledger_id)
    for r in rules:
        if r.ledger_id: ledger_ids.add(r.ledger_id)
    
    ledger_names = {}
    if ledger_ids:
        ledger_names = {
            l.id: l.name 
            for l in db.query(models.Ledger.id, models.Ledger.name)
            .filter(models.Ledger.id.in_(list(ledger_ids)))
            .all()
        }

    # 2. Fetch Invoices in period
    # Only considering finalized invoices (assuming they have specific status, or just all for now)
    # Checking SalesInvoice model... no status field? Wait...
    # SalesOrder has status. SalesInvoice is usually final.
    # Let's assume all SalesInvoices in range are valid.
    invoices = db.query(models.SalesInvoice).options(
        joinedload(models.SalesInvoice.incentives).joinedload(models.SalesInvoiceIncentive.sales_person),
        joinedload(models.SalesInvoice.voucher).joinedload(models.Voucher.payment_mode),
        joinedload(models.SalesInvoice.sales_person),
        joinedload(models.SalesInvoice.customer).joinedload(models.Customer.ledger),
        joinedload(models.SalesInvoice.lines)
    ).filter(
        models.SalesInvoice.company_id == company_id,
        models.SalesInvoice.date >= start_date,
        models.SalesInvoice.date <= end_date
    ).all()

    # 3. Calculate
    # Structure: { employee_id: { employee: ..., total_sales: 0, commission: 0, details: [] } }
    report_data = {}

    for inv in invoices:
        # Get all unique sales persons involved in this invoice.
        # Priority: Stored incentives > Primary sales_person_id
        involved_persons = []
        if inv.incentives:
            for inc in inv.incentives:
                if inc.sales_person and inc.sales_person_id not in [p.id for p in involved_persons]:
                    involved_persons.append(inc.sales_person)
        elif inv.sales_person:
            involved_persons.append(inv.sales_person)

        if not involved_persons:
            continue

        for emp in involved_persons:
            if emp.id not in report_data:
                report_data[emp.id] = {
                    "employee_id": emp.id,
                    "employee_name": getattr(emp, "name", getattr(emp, "full_name", "Unknown")),
                    "employee_code": getattr(emp, "code", None),
                    "total_sales": 0.0,
                    "commission_amount": 0.0,
                    "invoices": []
                }
            
            # Calculate Invoice Total
            inv_total = sum(float(line.quantity * line.rate) for line in inv.lines) # Simplified: ignoring tax/discount for base?
            # Typically commission is on Net Sales (amount - discount). 
            # Let's refine: (qty * rate) - discount
            inv_net = sum(float(line.quantity * line.rate - (line.discount or 0)) for line in inv.lines)
            
            # Determine Context
            # Effective Project: Invoice > SalesPerson (fallback to None as SalesPerson doesn't have project/dept)
            eff_project_id = inv.project_id or getattr(emp, "project_id", None)
            eff_dept_id = inv.department_id or getattr(emp, "department_id", None)
            eff_segment_id = getattr(inv, "segment_id", None) or getattr(emp, "segment_id", None)
            emp_type_id = getattr(emp, "employee_type_id", None)

            # Optional report filters by cost center dimensions
            if department_id is not None and int(department_id) != int(eff_dept_id or 0):
                continue
            if project_id is not None and int(project_id) != int(eff_project_id or 0):
                continue
            if segment_id is not None and int(segment_id) != int(eff_segment_id or 0):
                continue

            # Find Matching Rules
            matched_rules = []
            total_rate = 0.0
            post_method = "Auto"

            # Try to find stored incentive by ID or Name (since SalesPerson and Employee might have mismatched IDs)
            # Try to find stored incentive by ID or Name
            stored_inc = next((inc for inc in inv.incentives if inc.sales_person_id == emp.id or (inc.sales_person and inc.sales_person.name == getattr(emp, "name", getattr(emp, "full_name", "")))), None)
            
            if stored_inc:
                comm_amt = float(stored_inc.incentive_amount)
                # Robustly check if it was manual (checking flag OR legacy strings)
                if stored_inc.is_manual or stored_inc.post_method in ["Manual", "Manual Override"]:
                    post_method = "Manual"
                else:
                    post_method = "Auto"
                # If not manual, we can still try to show which rules would have applied or just use a generic label
            else:
                # Fallback: legacy calculation based on IncentiveRule
                total_fixed = 0.0
                total_rate_val = 0.0
                has_fixed_rule = False
                has_rate_rule = False
                has_individual_rule = False

                for r in rules:
                    matches = False
                    
                    # IncentiveRule matching logic
                    if r.sales_person_id is not None:
                        if r.sales_person_id != emp.id:
                            continue
                    
                    # Cost center dimensions
                    dept_match = (r.department_id is None) or (r.department_id == eff_dept_id)
                    proj_match = (r.project_id is None) or (r.project_id == eff_project_id)
                    # seg_match = ... (segment_id not in IncentiveRule model?)
                    
                    if dept_match and proj_match:
                        matches = True
                    
                    if matches:
                        matched_rules.append({
                            "name": r.name,
                            "ledger_id": r.ledger_id or default_ledger_id,
                            "ledger_name": ledger_names.get(r.ledger_id or default_ledger_id) if (r.ledger_id or default_ledger_id) else "Unmapped"
                        })
                        if r.incentive_type.lower() == "fixed":
                            total_fixed += float(r.incentive_value)
                            has_fixed_rule = True
                        else:
                            total_rate_val += float(r.incentive_value)
                            has_rate_rule = True
                        
                        if r.sales_person_id is not None:
                            has_individual_rule = True

                comm_amt = (inv_net * (total_rate_val / 100.0)) + total_fixed
                total_rate = total_rate_val # for display
                
                post_method = "Auto"

            report_data[emp.id]["total_sales"] += inv_net
            report_data[emp.id]["commission_amount"] += comm_amt
            report_data[emp.id]["invoices"].append({
                "id": inv.id,
                "date": inv.date,
                "number": inv.reference,
                "voucher_date": inv.voucher.voucher_date if inv.voucher else inv.date,
                "voucher_no": inv.voucher.voucher_number if inv.voucher else inv.reference,
                "post_method": post_method,
                "amount": inv_net,
                "ledger_name": inv.customer.ledger.name if inv.customer and inv.customer.ledger else (inv.customer.name if inv.customer else "-"),
                "remarks": (inv.voucher.narration if inv.voucher and inv.voucher.narration else inv.narration) or "-",
                "rate_applied": total_rate if not stored_inc else 0, # Rate might not be easily available if stored
                "commission": comm_amt,
                "rules": matched_rules,
                "project_id": eff_project_id,
                "department_id": eff_dept_id,
                "segment_id": eff_segment_id,
            })

    return list(report_data.values())
