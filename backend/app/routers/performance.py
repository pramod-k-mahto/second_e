from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select, and_, or_
from sqlalchemy.orm import Session
from typing import List
import calendar

from ..database import get_db
from ..auth import get_current_user
from .. import models, schemas, tasks_models, tasks_schemas

router = APIRouter(prefix="/companies/{companyId}/performance", tags=["performance"])


@router.get("/employees", response_model=List[schemas.EmployeePerformanceRead])
def get_all_performance(
    companyId: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # Fetch all employees for the company
    employees = db.query(models.Employee).filter(models.Employee.company_id == companyId).all()
    results = []

    for emp in employees:
        # Task metrics
        # If employee has a user_id, check tasks assigned to that user_id
        task_query = db.query(
            func.count(tasks_models.Task.id).label("total"),
            func.count(func.nullif(tasks_models.Task.status != "done", True)).label("completed")
        ).filter(
            tasks_models.Task.company_id == companyId,
            tasks_models.Task.assigned_to == emp.user_id
        ).first() if emp.user_id else (0, 0)

        total_tasks = task_query[0] or 0
        completed_tasks = task_query[1] or 0
        completion_rate = (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0

        # Revenue metrics (from SalesInvoice)
        revenue_query = db.query(
            func.sum(models.VoucherLine.credit - models.VoucherLine.debit)
        ).select_from(models.SalesInvoice).join(
            models.Voucher, models.SalesInvoice.voucher_id == models.Voucher.id
        ).join(
            models.VoucherLine, models.Voucher.id == models.VoucherLine.voucher_id
        ).filter(
            models.SalesInvoice.company_id == companyId,
            models.SalesInvoice.sales_person_id == emp.id
        ).scalar() or 0

        # Rewards metrics
        rewards_summary = db.query(
            func.sum(models.Reward.points).label("points"),
            func.sum(models.Reward.amount).label("amount")
        ).filter(
            models.Reward.company_id == companyId,
            models.Reward.employee_id == emp.id
        ).first()

        results.append(schemas.EmployeePerformanceRead(
            employee_id=emp.id,
            full_name=emp.full_name,
            total_tasks=total_tasks,
            completed_tasks=completed_tasks,
            completion_rate=completion_rate,
            total_revenue=float(revenue_query),
            total_points=rewards_summary.points or 0,
            total_rewards_amount=float(rewards_summary.amount or 0)
        ))

    return results


@router.get("/tasks/report", response_model=tasks_schemas.TaskPerformanceReport)
def get_task_performance_report(
    companyId: int,
    period: str = Query("monthly", enum=["daily", "weekly", "monthly", "yearly"]),
    start_date: date | None = Query(None),
    end_date: date | None = Query(None),
    employee_id: int | None = Query(None),
    employee_type_id: int | None = Query(None),
    include_details: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    from ..tasks_permissions import require_task_permission
    require_task_permission(current_user, "task.view_reports")
    
    today = date.today()
    
    # Ensure start_date and end_date are set
    if start_date is None or end_date is None:
        today_val = date.today()
        if period == "daily":
            start_date = today_val
            end_date = today_val
        elif period == "weekly":
            start_date = today_val - timedelta(days=today_val.weekday())
            end_date = start_date + timedelta(days=6)
        elif period == "monthly":
            start_date = today_val.replace(day=1)
            last_day = calendar.monthrange(today_val.year, today_val.month)[1]
            end_date = today_val.replace(day=last_day)
        elif period == "yearly":
            start_date = today_val.replace(month=1, day=1)
            end_date = today_val.replace(month=12, day=31)
        else:
            # Default to monthly if no period provided
            start_date = today_val.replace(day=1)
            last_day = calendar.monthrange(today_val.year, today_val.month)[1]
            end_date = today_val.replace(day=last_day)

    # Cast for type checker
    assert start_date is not None
    assert end_date is not None

    # Convert date to datetime for query range
    start_dt = datetime.combine(start_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end_dt = datetime.combine(end_date, datetime.max.time()).replace(tzinfo=timezone.utc)

    # Base query for tasks in the period
    # We define "Assigned in period" as created_at in period
    # We define "Performed in period" as completed_at in period
    
    employees_query = db.query(models.Employee).outerjoin(models.EmployeeType).filter(models.Employee.company_id == companyId)
    if employee_id:
        employees_query = employees_query.filter(models.Employee.id == employee_id)
    if employee_type_id:
        employees_query = employees_query.filter(models.Employee.employee_type_id == employee_type_id)
    
    employees = employees_query.all()
    summary_results = []
    
    for emp in employees:
        if not emp.user_id:
            continue
            
        assigned_count = db.query(func.count(tasks_models.Task.id)).filter(
            tasks_models.Task.company_id == companyId,
            tasks_models.Task.assigned_to == emp.user_id,
            tasks_models.Task.created_at >= start_dt,
            tasks_models.Task.created_at <= end_dt
        ).scalar() or 0
        
        completed_query = db.query(
            func.count(tasks_models.Task.id),
            func.avg(
                func.extract('epoch', tasks_models.Task.completed_at - tasks_models.Task.created_at) / 3600
            )
        ).filter(
            tasks_models.Task.company_id == companyId,
            tasks_models.Task.assigned_to == emp.user_id,
            tasks_models.Task.status == "done",
            tasks_models.Task.completed_at >= start_dt,
            tasks_models.Task.completed_at <= end_dt
        ).first()
        
        completed_count = completed_query[0] or 0
        avg_time = float(completed_query[1]) if completed_query[1] else None
        
        rate = (completed_count / assigned_count * 100) if assigned_count > 0 else 0
        
        summary_results.append(tasks_schemas.TaskPerformanceReportItem(
            employee_id=emp.id,
            employee_name=emp.full_name,
            role=emp.employee_type.name if emp.employee_type else None,
            assigned_count=assigned_count,
            completed_count=completed_count,
            completion_rate=rate,
            avg_completion_time_hours=avg_time
        ))

    details = None
    if include_details:
        # Get tasks that were either created or completed in this period for these employees
        user_ids = [emp.user_id for emp in employees if emp.user_id]
        if user_ids:
            tasks = db.query(tasks_models.Task).filter(
                tasks_models.Task.company_id == companyId,
                tasks_models.Task.assigned_to.in_(user_ids),
                or_(
                    and_(tasks_models.Task.created_at >= start_dt, tasks_models.Task.created_at <= end_dt),
                    and_(tasks_models.Task.completed_at >= start_dt, tasks_models.Task.completed_at <= end_dt)
                )
            ).all()
            
            # Map user_id to employee name and role
            name_map = {emp.user_id: emp.full_name for emp in employees if emp.user_id}
            role_map = {emp.user_id: (emp.employee_type.name if emp.employee_type else None) for emp in employees if emp.user_id}
            
            details = [
                tasks_schemas.TaskPerformanceReportDetail(
                    task_id=t.id,
                    title=t.title,
                    status=t.status,
                    assigned_at=t.created_at,
                    completed_at=t.completed_at,
                    due_at=t.due_at,
                    priority=t.priority,
                    employee_name=name_map.get(t.assigned_to),
                    role=role_map.get(t.assigned_to)
                ) for t in tasks
            ]

    return tasks_schemas.TaskPerformanceReport(
        summary=summary_results,
        details=details,
        period=period,
        start_date=start_date,
        end_date=end_date
    )
