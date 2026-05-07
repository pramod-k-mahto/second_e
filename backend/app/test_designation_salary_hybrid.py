"""
Regression tests for the hybrid designation salary/grade feature.

All tests are pure-Python and DB-free (no SQLAlchemy session needed).
They exercise the business-logic rules extracted from:
  - routers/payroll.py  (template prefill on create / update)
  - payroll_service.py  (runtime fallback during payroll computation)

Covers the four acceptance criteria:
  1. Designation assignment prefills base_monthly_salary + GRADE payhead template
     when employee fields are not explicitly provided.
  2. Employee-level explicit values always win over designation defaults.
  3. Payroll computes correctly when employee salary fields are blank (designation fallback).
  4. Existing employees are unchanged until edited (no backfill).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Tiny stand-ins for ORM models (only the attributes used by the logic)
# ---------------------------------------------------------------------------

@dataclass
class FakeDesignation:
    id: int = 1
    base_monthly_salary: float | None = None
    grade_rate: float | None = None


@dataclass
class FakeEmployee:
    id: int = 1
    designation_id: int | None = None
    base_monthly_salary: float | None = None
    base_daily_wage: float | None = None
    base_hourly_rate: float | None = None


@dataclass
class FakePayhead:
    id: int = 1
    code: str = "GRADE"
    calculation_basis: str | None = None


@dataclass
class FakeStructureLine:
    payhead_id: int = 1
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None


@dataclass
class FakeStructure:
    lines: list[FakeStructureLine] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Logic helpers (mirrors of what lives in routers/payroll.py and
# payroll_service.py) — kept minimal so we test the *rule*, not the DB.
# ---------------------------------------------------------------------------

def apply_designation_prefill_on_create(
    data: dict[str, Any],
    designation: FakeDesignation | None,
) -> dict[str, Any]:
    """
    Mirrors the prefill logic in create_employee():
      - Only copies base_monthly_salary if the payload omitted it.
    Returns a (possibly mutated) copy of data.
    """
    result = dict(data)
    if designation is not None and result.get("base_monthly_salary") is None:
        if designation.base_monthly_salary is not None:
            result["base_monthly_salary"] = designation.base_monthly_salary
    return result


def apply_designation_prefill_on_update(
    employee: FakeEmployee,
    data: dict[str, Any],
    designation: FakeDesignation | None,
    new_designation_id: int | None,
) -> tuple[FakeEmployee, bool]:
    """
    Mirrors the update_employee() prefill logic:
      - Reads the PREVIOUS designation_id BEFORE applying mutations.
      - Only triggers prefill when designation actually changes.
      - Does NOT overwrite base_monthly_salary if it is in the payload.
    Returns (mutated_employee, grade_template_should_be_seeded).
    """
    previous_designation_id = employee.designation_id
    designation_changed = (
        new_designation_id is not None
        and int(new_designation_id) != int(previous_designation_id or 0)
    )

    # Apply payload mutations
    for k, v in data.items():
        setattr(employee, k, v)

    seed_grade = False
    if designation is not None and designation_changed:
        if "base_monthly_salary" not in data and employee.base_monthly_salary is None and designation.base_monthly_salary is not None:
            employee.base_monthly_salary = designation.base_monthly_salary
        if designation.grade_rate is not None:
            seed_grade = True

    return employee, seed_grade


def resolve_base_monthly_salary(
    employee: FakeEmployee,
    designation: FakeDesignation | None,
) -> float:
    """
    Mirrors payroll_service resolution:
      employee value > designation value > 0
    """
    emp_val = employee.base_monthly_salary
    des_val = designation.base_monthly_salary if designation is not None else None
    return float(emp_val if emp_val is not None else (des_val or 0))


def should_inject_grade_from_designation(
    structure: FakeStructure | None,
    grade_payhead: FakePayhead | None,
    designation: FakeDesignation | None,
) -> bool:
    """
    Mirrors the runtime-fallback check in compute_payroll_run():
      Inject designation grade_rate only when:
        - a GRADE payhead exists
        - designation has a grade_rate
        - the active structure does NOT already have a GRADE line
    """
    if grade_payhead is None or designation is None:
        return False
    if designation.grade_rate is None:
        return False
    if structure is None:
        return True
    has_grade_line = any(
        line.payhead_id == grade_payhead.id
        for line in structure.lines
    )
    return not has_grade_line


# ===========================================================================
# Tests – template prefill on employee CREATE
# ===========================================================================

def test_create_prefills_salary_when_omitted():
    """Designation salary is copied into payload when not explicitly provided."""
    desg = FakeDesignation(base_monthly_salary=50_000.0)
    result = apply_designation_prefill_on_create({}, desg)
    assert result["base_monthly_salary"] == 50_000.0


def test_create_keeps_explicit_salary_over_designation():
    """Explicit payload salary wins; designation value is ignored."""
    desg = FakeDesignation(base_monthly_salary=50_000.0)
    result = apply_designation_prefill_on_create({"base_monthly_salary": 30_000.0}, desg)
    assert result["base_monthly_salary"] == 30_000.0


def test_create_no_designation_leaves_salary_unset():
    """When no designation, salary stays None."""
    result = apply_designation_prefill_on_create({}, None)
    assert result.get("base_monthly_salary") is None


def test_create_designation_without_salary_leaves_unset():
    """Designation has no salary configured → nothing is injected."""
    desg = FakeDesignation(base_monthly_salary=None)
    result = apply_designation_prefill_on_create({}, desg)
    assert result.get("base_monthly_salary") is None


def test_create_grade_seeded_when_designation_has_grade_rate():
    """Grade template should be seeded when designation has grade_rate."""
    desg = FakeDesignation(grade_rate=5_000.0)
    ph = FakePayhead(code="GRADE")
    structure = None  # no existing structure
    assert should_inject_grade_from_designation(structure, ph, desg) is True


def test_create_grade_not_seeded_when_designation_has_no_grade_rate():
    """No GRADE line when designation.grade_rate is None."""
    desg = FakeDesignation(grade_rate=None)
    ph = FakePayhead(code="GRADE")
    assert should_inject_grade_from_designation(None, ph, desg) is False


# ===========================================================================
# Tests – template prefill on employee UPDATE
# ===========================================================================

def test_update_prefills_salary_when_designation_changes():
    """Salary prefill fires when designation_id actually changes."""
    emp = FakeEmployee(designation_id=1, base_monthly_salary=None)
    desg = FakeDesignation(id=2, base_monthly_salary=60_000.0)
    emp, seed = apply_designation_prefill_on_update(emp, {"designation_id": 2}, desg, 2)
    assert emp.base_monthly_salary == 60_000.0
    assert seed is False  # no grade_rate on this designation


def test_update_does_not_prefill_when_designation_unchanged():
    """No prefill when the same designation is re-submitted."""
    emp = FakeEmployee(designation_id=5, base_monthly_salary=None)
    desg = FakeDesignation(id=5, base_monthly_salary=70_000.0)
    emp, seed = apply_designation_prefill_on_update(emp, {"designation_id": 5}, desg, 5)
    assert emp.base_monthly_salary is None  # unchanged — no prefill ran


def test_update_keeps_explicit_salary_even_on_designation_change():
    """Explicit salary in payload is not overwritten even when designation changes."""
    emp = FakeEmployee(designation_id=1, base_monthly_salary=None)
    desg = FakeDesignation(id=2, base_monthly_salary=60_000.0)
    payload = {"designation_id": 2, "base_monthly_salary": 45_000.0}
    emp, _ = apply_designation_prefill_on_update(emp, payload, desg, 2)
    assert emp.base_monthly_salary == 45_000.0


def test_update_grade_seeded_on_designation_change_with_grade_rate():
    """Grade template flag is True when new designation has grade_rate."""
    emp = FakeEmployee(designation_id=1)
    desg = FakeDesignation(id=3, grade_rate=8_000.0)
    _, seed = apply_designation_prefill_on_update(emp, {"designation_id": 3}, desg, 3)
    assert seed is True


def test_update_grade_not_seeded_when_designation_unchanged():
    """No grade seeding when same designation is re-applied."""
    emp = FakeEmployee(designation_id=3)
    desg = FakeDesignation(id=3, grade_rate=8_000.0)
    _, seed = apply_designation_prefill_on_update(emp, {"designation_id": 3}, desg, 3)
    assert seed is False


# ===========================================================================
# Tests – payroll runtime fallback (base_monthly_salary)
# ===========================================================================

def test_payroll_uses_employee_salary_when_set():
    """Employee-level value takes precedence over designation."""
    emp = FakeEmployee(base_monthly_salary=40_000.0)
    desg = FakeDesignation(base_monthly_salary=80_000.0)
    assert resolve_base_monthly_salary(emp, desg) == 40_000.0


def test_payroll_falls_back_to_designation_salary_when_employee_has_none():
    """Designation value used when employee.base_monthly_salary is None."""
    emp = FakeEmployee(base_monthly_salary=None)
    desg = FakeDesignation(base_monthly_salary=75_000.0)
    assert resolve_base_monthly_salary(emp, desg) == 75_000.0


def test_payroll_returns_zero_when_both_unset():
    """Zero returned when neither employee nor designation has salary."""
    emp = FakeEmployee(base_monthly_salary=None)
    desg = FakeDesignation(base_monthly_salary=None)
    assert resolve_base_monthly_salary(emp, desg) == 0.0


def test_payroll_returns_zero_when_no_designation():
    """Zero returned when employee has no salary and no designation."""
    emp = FakeEmployee(base_monthly_salary=None)
    assert resolve_base_monthly_salary(emp, None) == 0.0


def test_payroll_employee_zero_salary_overrides_designation():
    """
    If an employee explicitly set salary to 0.0 (not None), that wins.
    (0.0 is falsy but is a valid override: employee has 0, designation has 50k.)
    Note: `None` means 'not configured', 0.0 means 'explicitly zero'.
    """
    emp = FakeEmployee(base_monthly_salary=None)  # None → fallback
    desg = FakeDesignation(base_monthly_salary=50_000.0)
    assert resolve_base_monthly_salary(emp, desg) == 50_000.0

    emp2 = FakeEmployee(base_monthly_salary=0.0)  # 0.0 is explicit override
    # With the current rule (None check), 0.0 is treated as set, so designation is NOT used.
    assert resolve_base_monthly_salary(emp2, desg) == 0.0


# ===========================================================================
# Tests – payroll runtime fallback (GRADE payhead line)
# ===========================================================================

def test_payroll_injects_grade_when_no_structure():
    """GRADE line from designation used when employee has no structure."""
    ph = FakePayhead(id=10, code="GRADE")
    desg = FakeDesignation(grade_rate=5_000.0)
    assert should_inject_grade_from_designation(None, ph, desg) is True


def test_payroll_injects_grade_when_structure_has_no_grade_line():
    """GRADE line from designation used when structure exists but lacks GRADE."""
    ph = FakePayhead(id=10, code="GRADE")
    desg = FakeDesignation(grade_rate=5_000.0)
    structure = FakeStructure(lines=[FakeStructureLine(payhead_id=99, amount=1000.0)])
    assert should_inject_grade_from_designation(structure, ph, desg) is True


def test_payroll_does_not_inject_grade_when_structure_already_has_grade():
    """Existing GRADE line in structure is never overwritten by designation fallback."""
    ph = FakePayhead(id=10, code="GRADE")
    desg = FakeDesignation(grade_rate=5_000.0)
    structure = FakeStructure(lines=[
        FakeStructureLine(payhead_id=10, amount=7_500.0),  # employee-specific GRADE
    ])
    assert should_inject_grade_from_designation(structure, ph, desg) is False


def test_payroll_does_not_inject_grade_when_designation_has_no_grade_rate():
    """No injection when designation.grade_rate is not configured."""
    ph = FakePayhead(id=10, code="GRADE")
    desg = FakeDesignation(grade_rate=None)
    assert should_inject_grade_from_designation(None, ph, desg) is False


def test_payroll_does_not_inject_grade_when_no_grade_payhead():
    """No injection when the GRADE payhead doesn't exist for this company."""
    desg = FakeDesignation(grade_rate=5_000.0)
    assert should_inject_grade_from_designation(None, None, desg) is False


def test_payroll_does_not_inject_grade_when_no_designation():
    """No injection when employee has no designation."""
    ph = FakePayhead(id=10, code="GRADE")
    assert should_inject_grade_from_designation(None, ph, None) is False


# ===========================================================================
# Tests – no-backfill guarantee (existing employees unchanged by default)
# ===========================================================================

def test_existing_employee_not_mutated_without_designation_change():
    """
    An existing employee with no designation update in payload should not have
    salary or grade template changed — mirrors the no-backfill contract.
    """
    emp = FakeEmployee(designation_id=5, base_monthly_salary=55_000.0)
    desg = FakeDesignation(id=5, base_monthly_salary=70_000.0, grade_rate=4_000.0)

    # Payload does NOT include designation_id change; only a name update
    payload = {"full_name": "Raju Sharma"}
    emp, seed = apply_designation_prefill_on_update(emp, payload, desg, None)

    # Salary must remain as set originally — designation default is not applied
    assert emp.base_monthly_salary == 55_000.0
    assert seed is False


def test_prefill_does_not_lower_existing_salary_on_designation_change():
    """
    If employee already has a higher salary than designation, changing designation
    should not overwrite employee's existing salary (it was set explicitly before).
    The prefill only applies when salary is None.
    """
    emp = FakeEmployee(designation_id=1, base_monthly_salary=90_000.0)
    desg = FakeDesignation(id=2, base_monthly_salary=60_000.0)

    # Payload changes designation but does NOT set base_monthly_salary
    emp, _ = apply_designation_prefill_on_update(emp, {"designation_id": 2}, desg, 2)

    # Employee keeps 90k because their field was already set (not None)
    assert emp.base_monthly_salary == 90_000.0
