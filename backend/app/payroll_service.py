from __future__ import annotations

import ast
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
import re

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from . import models, schemas


@dataclass(frozen=True)
class PayrollComputeSummary:
    employees_processed: int


def apply_designation_template(
    db: Session,
    *,
    company_id: int,
    employee_id: int,
    designation: models.PayrollDesignation,
    effective_from: date,
) -> models.EmployeePayStructure:
    """Replace the active pay structure for employee with lines from designation template.

    GRADE amount per line will be calculated at payroll compute time as
    grade_number * designation.grade_rate. The template may include a GRADE payhead line
    with amount=0 as a placeholder; payroll_service overrides it during compute.
    """
    emp = (
        db.query(models.Employee)
        .filter(models.Employee.company_id == company_id, models.Employee.id == employee_id)
        .first()
    )
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Deactivate existing active structures
    existing_active = (
        db.query(models.EmployeePayStructure)
        .filter(
            models.EmployeePayStructure.company_id == company_id,
            models.EmployeePayStructure.employee_id == employee_id,
            models.EmployeePayStructure.is_active == True,
        )
        .all()
    )
    for s in existing_active:
        s.is_active = False
        s.effective_to = effective_from
        db.add(s)
    db.flush()

    # Create new structure from template
    new_structure = models.EmployeePayStructure(
        company_id=company_id,
        employee_id=employee_id,
        effective_from=effective_from,
        effective_to=None,
        is_active=True,
    )
    db.add(new_structure)
    db.flush()

    for tl in designation.template_lines:
        db.add(
            models.EmployeePayStructureLine(
                company_id=company_id,
                structure_id=int(new_structure.id),
                payhead_id=int(tl.payhead_id),
                amount=tl.amount,
                rate=tl.rate,
                formula=tl.formula,
            )
        )

    db.flush()
    return new_structure


def _company_weekoff_set(settings: models.PayrollSettings | None) -> set[str]:
    if settings is None:
        return {"SAT"}
    raw = str(getattr(settings, "weekoff_days", "SAT") or "SAT")
    parts = [p.strip().upper() for p in raw.split(",") if p.strip()]
    return set(parts) if parts else {"SAT"}


def _weekday_code(d: date) -> str:
    # Monday=0..Sunday=6
    return ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"][d.weekday()]


def resolve_shift_for_employee(
    db: Session,
    *,
    company_id: int,
    employee_id: int,
    work_date: date,
) -> models.PayrollShift | None:
    row = (
        db.query(models.EmployeeShiftAssignment)
        .filter(
            models.EmployeeShiftAssignment.company_id == company_id,
            models.EmployeeShiftAssignment.employee_id == employee_id,
            models.EmployeeShiftAssignment.effective_from <= work_date,
        )
        .order_by(models.EmployeeShiftAssignment.effective_from.desc(), models.EmployeeShiftAssignment.id.desc())
        .first()
    )
    if row is None:
        return None
    if row.effective_to is not None and row.effective_to < work_date:
        return None
    return row.shift


def _shift_window(
    *,
    work_date: date,
    shift: models.PayrollShift | None,
    tz_aware: bool = True,
) -> tuple[datetime, datetime, datetime | None]:
    start_dt = datetime.combine(work_date, time.min)
    end_dt = datetime.combine(work_date, time.max)
    expected_in = None

    if shift is not None:
        start_dt = datetime.combine(work_date, shift.start_time)
        end_dt = datetime.combine(work_date, shift.end_time)
        expected_in = start_dt
        # night shift crosses midnight
        if end_dt <= start_dt:
            end_dt = end_dt + timedelta(days=1)

    return start_dt, end_dt, expected_in


def upsert_attendance_from_raw_logs(
    db: Session,
    *,
    company_id: int,
    work_date: date,
    employee_ids: list[int] | None = None,
) -> int:
    Employee = models.Employee
    Raw = models.AttendanceRawLog
    Daily = models.AttendanceDaily

    q_emp = db.query(Employee.id).filter(Employee.company_id == company_id, Employee.is_active == True)
    if employee_ids is not None:
        q_emp = q_emp.filter(Employee.id.in_(employee_ids))
    employees = [int(eid) for (eid,) in q_emp.all()]
    if not employees:
        return 0

    settings = db.query(models.PayrollSettings).filter(models.PayrollSettings.company_id == company_id).first()
    weekoffs = _company_weekoff_set(settings)

    holiday = (
        db.query(models.Holiday)
        .filter(models.Holiday.company_id == company_id, models.Holiday.holiday_date == work_date)
        .first()
    )

    updated = 0
    for emp_id in employees:
        shift = resolve_shift_for_employee(db, company_id=company_id, employee_id=emp_id, work_date=work_date)
        start_dt, end_dt, expected_in = _shift_window(work_date=work_date, shift=shift)

        rows = (
            db.query(func.min(Raw.event_ts), func.max(Raw.event_ts), func.count(Raw.id))
            .filter(
                Raw.company_id == company_id,
                Raw.employee_id == emp_id,
                Raw.event_ts >= start_dt,
                Raw.event_ts <= end_dt,
            )
            .one()
        )
        first_in, last_out, cnt = rows

        # Determine status
        status = models.AttendanceStatus.PRESENT
        if holiday is not None:
            status = models.AttendanceStatus.HOLIDAY
        elif _weekday_code(work_date) in weekoffs:
            status = models.AttendanceStatus.WEEKOFF

        worked_minutes = 0
        late_minutes = 0
        overtime_minutes = 0

        if cnt is None or int(cnt) <= 0:
            if status in (models.AttendanceStatus.HOLIDAY, models.AttendanceStatus.WEEKOFF):
                pass
            else:
                # check approved leave
                leave = (
                    db.query(models.LeaveRequest)
                    .filter(
                        models.LeaveRequest.company_id == company_id,
                        models.LeaveRequest.employee_id == emp_id,
                        models.LeaveRequest.status == models.LeaveRequestStatus.APPROVED,
                        models.LeaveRequest.start_date <= work_date,
                        models.LeaveRequest.end_date >= work_date,
                    )
                    .first()
                )
                status = models.AttendanceStatus.LEAVE if leave is not None else models.AttendanceStatus.ABSENT
        else:
            if first_in is None or last_out is None or first_in == last_out:
                status = models.AttendanceStatus.INCOMPLETE
            else:
                diff = last_out - first_in
                worked_minutes = max(0, int(diff.total_seconds() // 60))

                expected_work = int(getattr(shift, "expected_work_minutes", 0) or 0) if shift is not None else 0
                if expected_work > 0:
                    overtime_minutes = max(0, worked_minutes - expected_work)

                grace = int(getattr(shift, "grace_minutes", 0) or 0)
                if settings is not None:
                    grace = max(grace, int(getattr(settings, "late_grace_minutes", 0) or 0))
                if expected_in is not None:
                    late_minutes = max(0, int((first_in - expected_in).total_seconds() // 60) - grace)

        existing = (
            db.query(Daily)
            .filter(Daily.company_id == company_id, Daily.employee_id == emp_id, Daily.work_date == work_date)
            .with_for_update()
            .first()
        )
        if existing is not None and bool(existing.is_manual):
            continue

        if existing is None:
            existing = Daily(company_id=company_id, employee_id=emp_id, work_date=work_date)
            db.add(existing)

        existing.shift_id = int(shift.id) if shift is not None else None
        existing.first_in = first_in
        existing.last_out = last_out
        existing.worked_minutes = int(worked_minutes)
        existing.late_minutes = int(late_minutes)
        existing.overtime_minutes = int(overtime_minutes)
        existing.status = status
        existing.is_manual = False
        existing.manual_reason = None
        db.add(existing)
        updated += 1

    return updated


def ingest_attendance_logs(
    db: Session,
    *,
    company_id: int,
    payload: schemas.AttendanceLogsIngestRequest,
) -> dict:
    inserted = 0
    deduped = 0
    unmapped: set[str] = set()

    device_users = (
        db.query(models.BiometricDeviceUser)
        .filter(models.BiometricDeviceUser.company_id == company_id)
        .all()
    )
    mapping: dict[tuple[int | None, str], int | None] = {}
    for du in device_users:
        mapping[(int(du.device_id), str(du.device_user_code))] = int(du.employee_id) if du.employee_id is not None else None

    for item in payload.logs:
        device_id = int(item.device_id) if item.device_id is not None else None
        code = str(item.device_user_code)
        employee_id = mapping.get((device_id, code))
        if employee_id is None:
            unmapped.add(code)

        row = models.AttendanceRawLog(
            company_id=company_id,
            device_id=device_id,
            device_user_code=code,
            employee_id=employee_id,
            event_ts=item.event_ts,
            event_type=item.event_type,
            source=str(payload.source or "PUSH"),
            payload_json=item.payload,
        )
        db.add(row)
        try:
            db.flush()
            inserted += 1
        except IntegrityError:
            db.rollback()
            deduped += 1

    return {
        "inserted": int(inserted),
        "deduped": int(deduped),
        "unmapped_device_users": sorted(list(unmapped)),
    }


def _date_range(start: date, end: date) -> list[date]:
    if end < start:
        return []
    out: list[date] = []
    cur = start
    while cur <= end:
        out.append(cur)
        cur = cur + timedelta(days=1)
    return out


_FORMULA_ALLOWED_FUNCS = {
    "ABS": abs,
    "MIN": min,
    "MAX": max,
    "ROUND": round,
}


def _formula_var_name(raw: str) -> str:
    s = re.sub(r"[^A-Za-z0-9_]", "_", str(raw or "").strip().upper())
    if not s:
        return ""
    if s[0].isdigit():
        s = f"_{s}"
    return s


def _safe_eval_formula(expr: str, variables: dict[str, float]) -> float:
    try:
        node = ast.parse(expr, mode="eval")
    except SyntaxError:
        return 0.0

    normalized_vars: dict[str, float] = {}
    for k, v in (variables or {}).items():
        key = str(k)
        val = float(v or 0)
        normalized_vars[key] = val
        normalized_vars[key.upper()] = val
        normalized_vars[key.lower()] = val

    def _eval(n: ast.AST) -> float:
        if isinstance(n, ast.Expression):
            return _eval(n.body)
        if isinstance(n, ast.Constant) and isinstance(n.value, (int, float)):
            return float(n.value)
        if isinstance(n, ast.Name):
            return float(normalized_vars.get(n.id, 0.0))
        if isinstance(n, ast.UnaryOp):
            v = _eval(n.operand)
            if isinstance(n.op, ast.UAdd):
                return +v
            if isinstance(n.op, ast.USub):
                return -v
            raise ValueError("Unsupported unary operator")
        if isinstance(n, ast.BinOp):
            l = _eval(n.left)
            r = _eval(n.right)
            if isinstance(n.op, ast.Add):
                return l + r
            if isinstance(n.op, ast.Sub):
                return l - r
            if isinstance(n.op, ast.Mult):
                return l * r
            if isinstance(n.op, ast.Div):
                return l / r if r != 0 else 0.0
            if isinstance(n.op, ast.Mod):
                return l % r if r != 0 else 0.0
            if isinstance(n.op, ast.Pow):
                return l ** r
            raise ValueError("Unsupported binary operator")
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name):
            fn = _FORMULA_ALLOWED_FUNCS.get(n.func.id.upper())
            if fn is None:
                raise ValueError("Unsupported function")
            args = [_eval(a) for a in n.args]
            return float(fn(*args))
        raise ValueError("Unsupported formula syntax")

    try:
        return float(_eval(node))
    except Exception:
        return 0.0


def preview_formula_amount(
    db: Session,
    *,
    company_id: int,
    formula: str,
    employee_id: int | None = None,
    structure_id: int | None = None,
    payable_days: float | None = None,
    absent_days: float | None = None,
    late_minutes: int | None = None,
    overtime_minutes: int | None = None,
    worked_minutes: int | None = None,
    variables: dict[str, float] | None = None,
) -> tuple[float, dict[str, float]]:
    emp = None
    if employee_id is not None:
        emp = (
            db.query(models.Employee)
            .filter(models.Employee.company_id == company_id, models.Employee.id == int(employee_id))
            .first()
        )

    if structure_id is not None:
        structure = (
            db.query(models.EmployeePayStructure)
            .filter(
                models.EmployeePayStructure.company_id == company_id,
                models.EmployeePayStructure.id == int(structure_id),
            )
            .first()
        )
    elif emp is not None:
        structure = (
            db.query(models.EmployeePayStructure)
            .filter(
                models.EmployeePayStructure.company_id == company_id,
                models.EmployeePayStructure.employee_id == int(emp.id),
                models.EmployeePayStructure.is_active == True,
            )
            .order_by(models.EmployeePayStructure.effective_from.desc(), models.EmployeePayStructure.id.desc())
            .first()
        )
    else:
        structure = None

    designation = None
    if emp is not None and getattr(emp, "designation_id", None) is not None:
        designation = (
            db.query(models.PayrollDesignation)
            .filter(
                models.PayrollDesignation.company_id == company_id,
                models.PayrollDesignation.id == int(emp.designation_id),
            )
            .first()
        )

    employee_base_monthly_salary = getattr(emp, "base_monthly_salary", None) if emp is not None else None
    designation_base_monthly_salary = getattr(designation, "base_monthly_salary", None) if designation is not None else None
    base_monthly_salary = float(
        employee_base_monthly_salary
        if employee_base_monthly_salary is not None
        else (designation_base_monthly_salary or 0)
    )
    base_daily_wage = float(getattr(emp, "base_daily_wage", 0) or 0) if emp is not None else 0.0
    base_hourly_rate = float(getattr(emp, "base_hourly_rate", 0) or 0) if emp is not None else 0.0

    _payable_days = float(payable_days if payable_days is not None else 30.0)
    _absent_days = float(absent_days if absent_days is not None else 0.0)
    _late_minutes = int(late_minutes if late_minutes is not None else 0)
    _overtime_minutes = int(overtime_minutes if overtime_minutes is not None else 0)
    _worked_minutes = int(worked_minutes if worked_minutes is not None else 0)
    days_in_period = 30.0

    per_day_rate = (base_monthly_salary / days_in_period) if days_in_period > 0 and base_monthly_salary > 0 else base_daily_wage
    if base_hourly_rate > 0:
        per_minute_rate = base_hourly_rate / 60.0
    elif base_monthly_salary > 0:
        per_minute_rate = (base_monthly_salary / days_in_period) / (8 * 60)
    else:
        per_minute_rate = 0.0

    preview_grade_number = int(getattr(emp, "grade_number", None) or 0) if emp is not None else 0
    preview_grade_rate = float(getattr(designation, "grade_rate", None) or 0) if designation is not None else 0.0
    preview_grade_amount = float(preview_grade_number * preview_grade_rate) if preview_grade_number > 0 and preview_grade_rate > 0 else preview_grade_rate

    formula_vars: dict[str, float] = {
        "PAYABLE_DAYS": float(_payable_days),
        "ABSENT_DAYS": float(_absent_days),
        "LATE_MINUTES": float(_late_minutes),
        "OVERTIME_MINUTES": float(_overtime_minutes),
        "WORKED_MINUTES": float(_worked_minutes),
        "WORKED_HOURS": float(_worked_minutes) / 60.0,
        "BASE_MONTHLY_SALARY": float(base_monthly_salary),
        "BASE_DAILY_WAGE": float(base_daily_wage),
        "BASE_HOURLY_RATE": float(base_hourly_rate),
        "PER_DAY_RATE": float(per_day_rate),
        "PER_MINUTE_RATE": float(per_minute_rate),
        "DAYS_IN_PERIOD": float(days_in_period),
        "GRADE": float(preview_grade_amount),
        "EARNINGS_SO_FAR": 0.0,
        "DEDUCTIONS_SO_FAR": 0.0,
        "NET_SO_FAR": 0.0,
    }

    payheads = (
        db.query(models.PayrollPayhead)
        .filter(models.PayrollPayhead.company_id == company_id, models.PayrollPayhead.is_active == True)
        .all()
    )
    payhead_by_id = {int(p.id): p for p in payheads}

    # Populate formula_vars from whichever pay lines are available:
    # per-employee structure first, designation template as fallback
    preview_lines: list[tuple] = []  # (amount, rate, formula, payhead_id)
    if structure is not None:
        preview_lines = [
            (getattr(l, "amount", None), getattr(l, "rate", None), getattr(l, "formula", None), int(l.payhead_id))
            for l in structure.lines
        ]
    elif designation is not None and getattr(designation, "template_lines", None):
        sorted_tlines = sorted(designation.template_lines, key=lambda l: int(getattr(l, "sort_order", 100) or 100))
        preview_lines = [
            (getattr(l, "amount", None), getattr(l, "rate", None), getattr(l, "formula", None), int(l.payhead_id))
            for l in sorted_tlines
        ]

    for (l_amount, l_rate, l_formula, ph_id) in preview_lines:
        ph = payhead_by_id.get(ph_id)
        if ph is None:
            continue
        ph_code = str(getattr(ph, "code", "") or "").strip().upper()
        basis = str(getattr(ph, "calculation_basis", "") or "").strip().upper()
        if ph_code == "GRADE":
            line_amt = float(preview_grade_amount)
        elif basis == "PER_DAY":
            line_amt = float(l_amount if l_amount is not None else (ph.default_amount or 0) or 0) * float(_payable_days)
        elif basis == "PER_HOUR":
            line_amt = float(l_rate if l_rate is not None else (ph.default_rate or 0) or 0) * (float(_worked_minutes) / 60.0)
        elif basis == "FORMULA":
            line_amt = 0.0
        else:
            line_amt = float(l_amount if l_amount is not None else (ph.default_amount or 0) or 0)
        line_amt = float(round(line_amt, 2))
        formula_vars[f"PH_{ph_id}"] = float(line_amt)
        code_var = _formula_var_name(getattr(ph, "code", ""))
        if code_var:
            formula_vars[code_var] = float(line_amt)

    # Also seed formula vars from employee's extra pay heads so formulas can reference them
    if emp is not None:
        extra_lines = (
            db.query(models.EmployeeExtraPayhead)
            .filter(
                models.EmployeeExtraPayhead.company_id == company_id,
                models.EmployeeExtraPayhead.employee_id == int(emp.id),
                models.EmployeeExtraPayhead.is_active == True,
            )
            .order_by(models.EmployeeExtraPayhead.sort_order.asc())
            .all()
        )
        for xline in extra_lines:
            ph = payhead_by_id.get(int(xline.payhead_id))
            if ph is None:
                continue
            ph_code = str(getattr(ph, "code", "") or "").strip().upper()
            basis = str(getattr(ph, "calculation_basis", "") or "").strip().upper()
            if ph_code == "GRADE":
                x_amt = float(preview_grade_amount)
            elif basis == "PER_DAY":
                x_amt = float(xline.amount if xline.amount is not None else (ph.default_amount or 0) or 0) * float(_payable_days)
            elif basis == "PER_HOUR":
                x_amt = float(xline.rate if xline.rate is not None else (ph.default_rate or 0) or 0) * (float(_worked_minutes) / 60.0)
            elif basis == "FORMULA":
                x_amt = 0.0
            else:
                x_amt = float(xline.amount if xline.amount is not None else (ph.default_amount or 0) or 0)
            x_amt = float(round(x_amt, 2))
            formula_vars[f"PH_{int(xline.payhead_id)}"] = x_amt
            code_var = _formula_var_name(getattr(ph, "code", ""))
            if code_var:
                formula_vars[code_var] = x_amt

    for k, v in (variables or {}).items():
        formula_vars[str(k)] = float(v or 0)

    amount = float(round(_safe_eval_formula(str(formula or ""), formula_vars), 2))
    return amount, formula_vars


def compute_payroll_run(
    db: Session,
    *,
    company_id: int,
    run: models.PayrollRun,
    employee_ids: list[int] | None = None,
    recompute_attendance: bool = False,
) -> PayrollComputeSummary:
    if bool(getattr(run, "locked", False)):
        raise HTTPException(status_code=409, detail="Payroll run is locked")

    if recompute_attendance:
        for d in _date_range(run.period_start, run.period_end):
            upsert_attendance_from_raw_logs(db, company_id=company_id, work_date=d, employee_ids=employee_ids)

    employees_q = db.query(models.Employee).filter(models.Employee.company_id == company_id, models.Employee.is_active == True)
    if employee_ids is not None:
        employees_q = employees_q.filter(models.Employee.id.in_(employee_ids))
    employees = employees_q.order_by(models.Employee.id.asc()).all()

    payheads = (
        db.query(models.PayrollPayhead)
        .filter(models.PayrollPayhead.company_id == company_id, models.PayrollPayhead.is_active == True)
        .all()
    )
    payhead_by_id = {int(p.id): p for p in payheads}
    payhead_by_code = {str(getattr(p, "code", "") or "").strip().upper(): p for p in payheads}

    settings = db.query(models.PayrollSettings).filter(models.PayrollSettings.company_id == company_id).first()

    late_penalty_rate = float(getattr(settings, "late_penalty_rate", 0) or 0)
    late_penalty_mode = getattr(settings, "late_penalty_mode", models.LatePenaltyMode.PER_MINUTE)
    overtime_multiplier = float(getattr(settings, "overtime_multiplier", 1.0) or 1.0)
    overtime_mode = getattr(settings, "overtime_mode", models.OvertimeMode.PER_MINUTE)

    processed = 0
    for emp in employees:
        emp_id = int(emp.id)

        daily_rows = (
            db.query(models.AttendanceDaily)
            .filter(
                models.AttendanceDaily.company_id == company_id,
                models.AttendanceDaily.employee_id == emp_id,
                models.AttendanceDaily.work_date >= run.period_start,
                models.AttendanceDaily.work_date <= run.period_end,
            )
            .all()
        )
        by_date = {r.work_date: r for r in daily_rows}

        payable_days = 0.0
        absent_days = 0.0
        late_minutes = 0
        overtime_minutes = 0
        worked_minutes_total = 0

        # Pro-rata window: join/end dates within the run
        effective_start = run.period_start
        effective_end = run.period_end
        join_date = getattr(emp, "join_date", None)
        end_date = getattr(emp, "end_date", None)
        if join_date is not None and join_date > effective_start:
            effective_start = join_date
        if end_date is not None and end_date < effective_end:
            effective_end = end_date
        if effective_end < effective_start:
            continue

        period_calendar_days = float((effective_end - effective_start).days + 1)
        salary_mode = getattr(emp, "salary_mode", models.SalaryMode.PRO_RATA) or models.SalaryMode.PRO_RATA

        if salary_mode == models.SalaryMode.FIXED:
            # Full base salary regardless of attendance — ignore all attendance records.
            payable_days = period_calendar_days

        elif salary_mode == models.SalaryMode.HYBRID:
            # Full base salary (payable_days = full month), but absent days are still
            # counted from attendance records so ABSENT_DED can be applied.
            payable_days = period_calendar_days
            for d in _date_range(effective_start, effective_end):
                r = by_date.get(d)
                if r is None:
                    continue
                if r.status == models.AttendanceStatus.ABSENT:
                    absent_days += 1.0
                late_minutes += int(r.late_minutes or 0)
                overtime_minutes += int(r.overtime_minutes or 0)
                worked_minutes_total += int(r.worked_minutes or 0)

        else:
            # PRO_RATA (default): payable_days from attendance.
            # If no records exist (employee not on machine) treat as full month.
            if not by_date:
                payable_days = period_calendar_days
            else:
                for d in _date_range(effective_start, effective_end):
                    r = by_date.get(d)
                    if r is None:
                        # Day not recorded → treat as payable (not penalised)
                        payable_days += 1.0
                        continue
                    st = r.status
                    if st in (
                        models.AttendanceStatus.PRESENT,
                        models.AttendanceStatus.LEAVE,
                        models.AttendanceStatus.HOLIDAY,
                        models.AttendanceStatus.WEEKOFF,
                    ):
                        payable_days += 1.0
                    elif st == models.AttendanceStatus.ABSENT:
                        absent_days += 1.0
                    late_minutes += int(r.late_minutes or 0)
                    overtime_minutes += int(r.overtime_minutes or 0)
                    worked_minutes_total += int(r.worked_minutes or 0)

        # pick active structure (effective as of period_end)
        structure = (
            db.query(models.EmployeePayStructure)
            .filter(
                models.EmployeePayStructure.company_id == company_id,
                models.EmployeePayStructure.employee_id == emp_id,
                models.EmployeePayStructure.is_active == True,
                models.EmployeePayStructure.effective_from <= run.period_end,
                (
                    (models.EmployeePayStructure.effective_to == None)
                    | (models.EmployeePayStructure.effective_to >= run.period_start)
                ),
            )
            .order_by(models.EmployeePayStructure.effective_from.desc(), models.EmployeePayStructure.id.desc())
            .first()
        )
        designation = None
        if getattr(emp, "designation_id", None) is not None:
            designation = (
                db.query(models.PayrollDesignation)
                .filter(
                    models.PayrollDesignation.company_id == company_id,
                    models.PayrollDesignation.id == int(emp.designation_id),
                )
                .first()
            )

        earnings_total = 0.0
        deductions_total = 0.0

        # Remove existing payslip+lines for recompute
        existing = (
            db.query(models.PayrollPayslip)
            .filter(
                models.PayrollPayslip.company_id == company_id,
                models.PayrollPayslip.payroll_run_id == int(run.id),
                models.PayrollPayslip.employee_id == emp_id,
            )
            .with_for_update()
            .first()
        )
        if existing is not None and bool(existing.is_manual_override):
            continue
        if existing is not None:
            db.query(models.PayrollPayslipLine).filter(models.PayrollPayslipLine.payslip_id == int(existing.id)).delete()
            db.delete(existing)
            db.flush()

        payslip = models.PayrollPayslip(
            company_id=company_id,
            payroll_run_id=int(run.id),
            employee_id=emp_id,
            payable_days=float(payable_days),
            absent_days=float(absent_days),
            late_minutes=int(late_minutes),
            overtime_minutes=int(overtime_minutes),
            earnings_total=0,
            deductions_total=0,
            net_pay=0,
            is_manual_override=False,
            override_reason=None,
        )
        db.add(payslip)
        db.flush()

        # Automatic components from attendance + employee base rates
        days_in_period = period_calendar_days  # already computed above
        employee_base_monthly_salary = getattr(emp, "base_monthly_salary", None)
        designation_base_monthly_salary = getattr(designation, "base_monthly_salary", None) if designation is not None else None
        base_monthly_salary = float(
            employee_base_monthly_salary
            if employee_base_monthly_salary is not None
            else (designation_base_monthly_salary or 0)
        )
        base_daily_wage = float(getattr(emp, "base_daily_wage", 0) or 0)
        base_hourly_rate = float(getattr(emp, "base_hourly_rate", 0) or 0)

        # Per-day rate for monthly mode
        per_day_rate = (base_monthly_salary / days_in_period) if days_in_period > 0 and base_monthly_salary > 0 else base_daily_wage

        # Per-minute rate for overtime in monthly mode
        per_minute_rate = 0.0
        if base_hourly_rate > 0:
            per_minute_rate = base_hourly_rate / 60.0
        elif base_monthly_salary > 0 and days_in_period > 0:
            # fallback using 8 hours/day equivalent
            per_minute_rate = (base_monthly_salary / days_in_period) / (8 * 60)

        # GRADE = grade_number * designation.grade_rate (computed early so formulas can reference it)
        emp_grade_number = int(getattr(emp, "grade_number", None) or 0)
        desg_grade_rate = float(getattr(designation, "grade_rate", None) or 0) if designation is not None else 0.0
        computed_grade_amount = float(emp_grade_number * desg_grade_rate) if emp_grade_number > 0 and desg_grade_rate > 0 else desg_grade_rate

        # Formula variables for "smart and easy" structure formulas.
        # Supports references such as PAYABLE_DAYS, BASE_MONTHLY_SALARY, BASIC, GRADE, PH_12, etc.
        formula_base_vars: dict[str, float] = {
            "PAYABLE_DAYS": float(payable_days),
            "ABSENT_DAYS": float(absent_days),
            "LATE_MINUTES": float(late_minutes),
            "OVERTIME_MINUTES": float(overtime_minutes),
            "WORKED_MINUTES": float(worked_minutes_total),
            "WORKED_HOURS": float(worked_minutes_total) / 60.0,
            "BASE_MONTHLY_SALARY": float(base_monthly_salary),
            "BASE_DAILY_WAGE": float(base_daily_wage),
            "BASE_HOURLY_RATE": float(base_hourly_rate),
            "PER_DAY_RATE": float(per_day_rate),
            "PER_MINUTE_RATE": float(per_minute_rate),
            "DAYS_IN_PERIOD": float(days_in_period),
            "GRADE": float(computed_grade_amount),
        }
        computed_formula_vars: dict[str, float] = {}

        # Helper: add a payhead line by code — skips silently if already written to this payslip
        def _add_or_accumulate_line(*, code: str, payhead_type: models.PayrollPayheadType, amount: float) -> None:
            nonlocal earnings_total, deductions_total
            amount = float(round(float(amount or 0), 2))
            if abs(amount) < 1e-9:
                return
            ph = payhead_by_code.get(str(code).strip().upper())
            if ph is None:
                return
            if ph.type != payhead_type:
                return
            ph_id = int(ph.id)
            if ph_id in payslip_payhead_ids:
                return  # already written — skip to avoid UniqueViolation
            payslip_payhead_ids.add(ph_id)
            if payhead_type == models.PayrollPayheadType.EARNING:
                earnings_total += amount
            else:
                deductions_total += amount
            db.add(
                models.PayrollPayslipLine(
                    company_id=company_id,
                    payslip_id=int(payslip.id),
                    payhead_id=ph_id,
                    type=ph.type,
                    amount=amount,
                )
            )
            # Keep formula vars updated so downstream formula payheads can reference auto-added lines
            computed_formula_vars[f"PH_{ph_id}"] = amount
            code_var = _formula_var_name(getattr(ph, "code", ""))
            if code_var:
                computed_formula_vars[code_var] = amount

        payslip_payhead_ids: set[int] = set()   # dedup guard — prevents UniqueViolation on payslip lines

        # Resolve which pay lines to use:
        #   1. Active EmployeePayStructure lines (per-employee override)
        #   2. Designation template lines (shared template, used when no per-employee structure)
        #   3. Nothing — BASIC and GRADE are still auto-computed regardless
        designation_template_lines = (
            list(designation.template_lines)
            if designation is not None and getattr(designation, "template_lines", None)
            else []
        )
        pay_lines = list(structure.lines) if structure is not None else []
        using_template = structure is None and len(designation_template_lines) > 0

        def _compute_line_amount(line_amount, line_rate, line_formula, ph) -> float:
            """Resolve a single pay line (from structure or template) to a rupee amount."""
            basis = str(getattr(ph, "calculation_basis", "") or "").strip().upper()
            amt = 0.0
            if basis == "PER_DAY":
                base_amt = float(line_amount if line_amount is not None else (ph.default_amount or 0) or 0)
                amt = base_amt * float(payable_days)
            elif basis == "PER_HOUR":
                rate = float(line_rate if line_rate is not None else (ph.default_rate or 0) or 0)
                hours = float(worked_minutes_total) / 60.0
                amt = rate * hours
            elif basis == "FORMULA":
                formula_text = str(line_formula or "").strip()
                if formula_text:
                    vars_for_formula = {
                        **formula_base_vars,
                        **computed_formula_vars,
                        "EARNINGS_SO_FAR": float(earnings_total),
                        "DEDUCTIONS_SO_FAR": float(deductions_total),
                        "NET_SO_FAR": float(earnings_total - deductions_total),
                    }
                    amt = _safe_eval_formula(formula_text, vars_for_formula)
                else:
                    amt = float(line_amount if line_amount is not None else (ph.default_amount or 0) or 0)
            else:
                # Fixed amount: prefer line amount, else payhead default
                amt = float(line_amount if line_amount is not None else (ph.default_amount or 0) or 0)
            return float(round(amt, 2))

        def _write_payslip_line(ph, amt: float) -> None:
            """Write one payslip line, updating totals and formula vars. Skips duplicates."""
            nonlocal earnings_total, deductions_total
            amt = float(round(amt, 2))
            if abs(amt) < 1e-9:
                return
            ph_id = int(ph.id)
            if ph_id in payslip_payhead_ids:
                return  # already written — skip to avoid UniqueViolation
            payslip_payhead_ids.add(ph_id)
            if ph.type == models.PayrollPayheadType.EARNING:
                earnings_total += amt
            else:
                deductions_total += amt
            db.add(
                models.PayrollPayslipLine(
                    company_id=company_id,
                    payslip_id=int(payslip.id),
                    payhead_id=ph_id,
                    type=ph.type,
                    amount=float(amt),
                )
            )
            computed_formula_vars[f"PH_{ph_id}"] = float(amt)
            code_var = _formula_var_name(getattr(ph, "code", ""))
            if code_var:
                computed_formula_vars[code_var] = float(amt)

        # Process per-employee structure lines
        if pay_lines:
            for line in pay_lines:
                ph = payhead_by_id.get(int(line.payhead_id))
                if ph is None:
                    continue
                amt = _compute_line_amount(
                    getattr(line, "amount", None),
                    getattr(line, "rate", None),
                    getattr(line, "formula", None),
                    ph,
                )
                _write_payslip_line(ph, amt)

        # Fall back to designation template lines when no per-employee structure exists
        elif using_template:
            sorted_lines = sorted(designation_template_lines, key=lambda l: int(getattr(l, "sort_order", 100) or 100))
            for line in sorted_lines:
                ph = payhead_by_id.get(int(line.payhead_id))
                if ph is None:
                    continue
                ph_code = str(getattr(ph, "code", "") or "").strip().upper()
                if ph_code == "GRADE":
                    # Always use the computed grade (grade_number × grade_rate) for GRADE payhead
                    amt = float(round(computed_grade_amount, 2))
                else:
                    amt = _compute_line_amount(
                        getattr(line, "amount", None),
                        getattr(line, "rate", None),
                        getattr(line, "formula", None),
                        ph,
                    )
                _write_payslip_line(ph, amt)

        # Derive BASIC / GRADE coverage from what was actually written (not from template declarations).
        # This prevents a template that declares BASIC with no amount from blocking the auto-add.
        _basic_ph = payhead_by_code.get("BASIC")
        _grade_ph = payhead_by_code.get("GRADE")
        has_basic_line = _basic_ph is not None and int(_basic_ph.id) in payslip_payhead_ids
        has_grade_line = _grade_ph is not None and int(_grade_ph.id) in payslip_payhead_ids

        # Auto-add GRADE if not already produced by any template/structure line
        if not has_grade_line and computed_grade_amount > 0:
            _add_or_accumulate_line(
                code="GRADE",
                payhead_type=models.PayrollPayheadType.EARNING,
                amount=float(computed_grade_amount),
            )

        # Auto-add BASIC if not already written with a non-zero amount.
        # FIXED / HYBRID → full base_monthly_salary (not prorated by payable_days)
        # PRO_RATA       → base_monthly_salary prorated by actual payable_days
        if not has_basic_line:
            if emp.payroll_mode == models.PayrollMode.MONTHLY:
                if salary_mode in (models.SalaryMode.FIXED, models.SalaryMode.HYBRID):
                    # Full salary regardless of attendance
                    if base_monthly_salary > 0:
                        _add_or_accumulate_line(
                            code="BASIC",
                            payhead_type=models.PayrollPayheadType.EARNING,
                            amount=float(round(base_monthly_salary, 2)),
                        )
                elif per_day_rate > 0:
                    # PRO_RATA: prorated by payable_days
                    _add_or_accumulate_line(
                        code="BASIC",
                        payhead_type=models.PayrollPayheadType.EARNING,
                        amount=float(round(per_day_rate * float(payable_days), 2)),
                    )
            elif emp.payroll_mode == models.PayrollMode.DAILY and base_daily_wage > 0:
                _add_or_accumulate_line(
                    code="BASIC",
                    payhead_type=models.PayrollPayheadType.EARNING,
                    amount=float(round(base_daily_wage * float(payable_days), 2)),
                )
            elif emp.payroll_mode == models.PayrollMode.HOURLY and base_hourly_rate > 0:
                hours = float(worked_minutes_total) / 60.0
                _add_or_accumulate_line(
                    code="BASIC",
                    payhead_type=models.PayrollPayheadType.EARNING,
                    amount=float(round(base_hourly_rate * hours, 2)),
                )

        # Employee-specific extra pay heads — always additive on top of template or structure
        extra_ph_lines = (
            db.query(models.EmployeeExtraPayhead)
            .filter(
                models.EmployeeExtraPayhead.company_id == company_id,
                models.EmployeeExtraPayhead.employee_id == emp_id,
                models.EmployeeExtraPayhead.is_active == True,
            )
            .order_by(models.EmployeeExtraPayhead.sort_order.asc(), models.EmployeeExtraPayhead.id.asc())
            .all()
        )
        for xline in extra_ph_lines:
            ph = payhead_by_id.get(int(xline.payhead_id))
            if ph is None:
                continue
            x_amt = _compute_line_amount(
                getattr(xline, "amount", None),
                getattr(xline, "rate", None),
                getattr(xline, "formula", None),
                ph,
            )
            _write_payslip_line(ph, x_amt)

        # Attendance-driven adjustments
        # FIXED mode: no absent deduction — salary is guaranteed regardless.
        # PRO_RATA / HYBRID: deduct for absent days recorded in attendance.
        if emp.payroll_mode == models.PayrollMode.MONTHLY and per_day_rate > 0 and salary_mode != models.SalaryMode.FIXED:
            _add_or_accumulate_line(
                code="ABSENT_DED",
                payhead_type=models.PayrollPayheadType.DEDUCTION,
                amount=per_day_rate * float(absent_days),
            )

        if overtime_minutes > 0 and per_minute_rate > 0:
            ot_amt = float(overtime_minutes) * per_minute_rate
            if overtime_mode == models.OvertimeMode.PER_HOUR:
                ot_amt = (float(overtime_minutes) / 60.0) * (per_minute_rate * 60.0)
            ot_amt = ot_amt * float(overtime_multiplier)
            _add_or_accumulate_line(code="OVERTIME", payhead_type=models.PayrollPayheadType.EARNING, amount=ot_amt)

        if late_minutes > 0 and late_penalty_rate > 0 and late_penalty_mode == models.LatePenaltyMode.PER_MINUTE:
            _add_or_accumulate_line(
                code="LATE_PENALTY",
                payhead_type=models.PayrollPayheadType.DEDUCTION,
                amount=float(late_minutes) * float(late_penalty_rate),
            )

        tds_amount = 0.0
        if bool(getattr(emp, "apply_tds", False)):
            tds_rate = float(getattr(emp, "tds_percent", 1.0) or 1.0)
            if tds_rate > 0 and earnings_total > 0:
                tds_amount = float(round(earnings_total * (tds_rate / 100.0), 2))
                deductions_total += tds_amount

        net_pay = float(earnings_total) - float(deductions_total)

        payslip.earnings_total = float(round(earnings_total, 2))
        payslip.deductions_total = float(round(deductions_total, 2))
        payslip.tds_amount = float(round(tds_amount, 2))
        payslip.net_pay = float(round(net_pay, 2))
        db.add(payslip)

        processed += 1

    run.status = models.PayrollRunStatus.COMPUTED
    run.computed_at = datetime.utcnow()
    db.add(run)

    return PayrollComputeSummary(employees_processed=int(processed))


def build_payroll_voucher_payload(
    db: Session,
    *,
    company_id: int,
    run: models.PayrollRun,
    post_date: date | None = None,
) -> schemas.VoucherCreate:
    if run.status not in (models.PayrollRunStatus.APPROVED, models.PayrollRunStatus.COMPUTED):
        raise HTTPException(status_code=409, detail="Payroll run must be computed/approved before posting")
    if run.voucher_id is not None:
        raise HTTPException(status_code=409, detail="Voucher already posted")

    settings = db.query(models.PayrollSettings).filter(models.PayrollSettings.company_id == company_id).first()
    default_expense_ledger_id = int(getattr(settings, "default_salary_expense_ledger_id", 0) or 0)

    if not default_expense_ledger_id:
        salary_ledger = (
            db.query(models.Ledger)
            .filter(models.Ledger.company_id == company_id, models.Ledger.name == "Salary Expense")
            .order_by(models.Ledger.id.asc())
            .first()
        )
        if salary_ledger is not None:
            default_expense_ledger_id = int(salary_ledger.id)

    if not default_expense_ledger_id:
        raise HTTPException(status_code=400, detail="Payroll settings missing default_salary_expense_ledger_id")

    payslips = (
        db.query(models.PayrollPayslip)
        .filter(models.PayrollPayslip.company_id == company_id, models.PayrollPayslip.payroll_run_id == int(run.id))
        .all()
    )

    if not payslips:
        raise HTTPException(status_code=400, detail="No payslips found for payroll run")

    lines_by_ledger: dict[tuple[int, int | None, int | None], dict[str, float]] = {}

    # Debit: total earnings to expense ledger (or payhead expense ledger if present)
    payslip_lines = (
        db.query(models.PayrollPayslipLine, models.PayrollPayhead, models.PayrollPayslip, models.Employee)
        .join(models.PayrollPayhead, models.PayrollPayhead.id == models.PayrollPayslipLine.payhead_id)
        .join(models.PayrollPayslip, models.PayrollPayslip.id == models.PayrollPayslipLine.payslip_id)
        .join(models.Employee, models.Employee.id == models.PayrollPayslip.employee_id)
        .filter(models.PayrollPayslip.company_id == company_id, models.PayrollPayslip.payroll_run_id == int(run.id))
        .all()
    )

    # credits: deductions payable + employee payable
    deduction_payable_totals: dict[int, float] = {}
    employee_net_totals: dict[int, float] = {}

    for slip in payslips:
        emp = db.query(models.Employee).filter(models.Employee.id == int(slip.employee_id)).first()
        if emp is None:
            continue
        emp_ledger_id = getattr(emp, "payable_ledger_id", None)
        if emp_ledger_id is None:
            raise HTTPException(status_code=400, detail=f"Employee {int(emp.id)} missing payable_ledger_id")
        employee_net_totals[int(emp_ledger_id)] = employee_net_totals.get(int(emp_ledger_id), 0.0) + float(slip.net_pay or 0)
        
        tds_val = float(getattr(slip, "tds_amount", 0.0) or 0.0)
        if tds_val > 0:
            tds_ledger_id = getattr(settings, "tds_payable_ledger_id", None)
            if tds_ledger_id is None:
                raise HTTPException(status_code=400, detail="Payroll settings missing tds_payable_ledger_id but TDS is applied.")
            deduction_payable_totals[int(tds_ledger_id)] = deduction_payable_totals.get(int(tds_ledger_id), 0.0) + tds_val

    for pl, ph, slip, emp in payslip_lines:
        amt = float(pl.amount or 0)
        if amt <= 0:
            continue
        dept_id = int(getattr(emp, "department_id", 0) or 0) or None
        proj_id = int(getattr(emp, "project_id", 0) or 0) or None

        if ph.type == models.PayrollPayheadType.EARNING:
            expense_ledger_id = int(getattr(ph, "expense_ledger_id", 0) or 0) or default_expense_ledger_id
            key = (expense_ledger_id, dept_id, proj_id)
            row = lines_by_ledger.get(key) or {"debit": 0.0, "credit": 0.0}
            row["debit"] = float(row["debit"]) + amt
            lines_by_ledger[key] = row
        else:
            payable_ledger_id = int(getattr(ph, "payable_ledger_id", 0) or 0)
            if not payable_ledger_id:
                continue
            deduction_payable_totals[payable_ledger_id] = deduction_payable_totals.get(payable_ledger_id, 0.0) + amt

    for payable_ledger_id, amt in deduction_payable_totals.items():
        key = (int(payable_ledger_id), None, None)
        row = lines_by_ledger.get(key) or {"debit": 0.0, "credit": 0.0}
        row["credit"] = float(row["credit"]) + float(amt)
        lines_by_ledger[key] = row

    for emp_ledger_id, amt in employee_net_totals.items():
        key = (int(emp_ledger_id), None, None)
        row = lines_by_ledger.get(key) or {"debit": 0.0, "credit": 0.0}
        row["credit"] = float(row["credit"]) + float(amt)
        lines_by_ledger[key] = row

    voucher_lines: list[schemas.VoucherLineCreate] = []
    for (ledger_id, dept_id, proj_id), dc in sorted(lines_by_ledger.items(), key=lambda x: (x[0][0], x[0][1] or 0, x[0][2] or 0)):
        debit = float(round(dc.get("debit", 0.0), 2))
        credit = float(round(dc.get("credit", 0.0), 2))
        if abs(debit) < 1e-9 and abs(credit) < 1e-9:
            continue
        voucher_lines.append(
            schemas.VoucherLineCreate(
                ledger_id=int(ledger_id),
                debit=debit if debit > 0 else 0,
                credit=credit if credit > 0 else 0,
                department_id=dept_id,
                project_id=proj_id,
            )
        )

    # Sanity
    total_debit = sum(float(l.debit or 0) for l in voucher_lines)
    total_credit = sum(float(l.credit or 0) for l in voucher_lines)
    if round(total_debit, 2) != round(total_credit, 2):
        raise HTTPException(status_code=400, detail="Voucher not balanced for payroll")

    narration = f"Payroll {int(run.period_year):04d}-{int(run.period_month):02d} (run_id={int(run.id)})"

    return schemas.VoucherCreate(
        voucher_date=post_date if post_date else run.period_end,
        voucher_date_bs=None,
        voucher_type=models.VoucherType.JOURNAL,
        narration=narration,
        payment_mode_id=None,
        lines=voucher_lines,
    )
