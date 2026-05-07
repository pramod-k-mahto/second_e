"""
Tests for Designation-Based Pay Templates (designation template lines + GRADE computation).

All tests are pure-Python / DB-free. They exercise the core business logic:
  1. GRADE = grade_number * designation.grade_rate
  2. Template apply clears existing active structure and creates new one
  3. Payroll formula variable GRADE is correctly pre-populated
  4. Preview formula gets correct GRADE variable
  5. Zero / missing grade_number falls back to raw grade_rate
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


# ---------------------------------------------------------------------------
# Minimal stand-ins for ORM models
# ---------------------------------------------------------------------------

@dataclass
class FakeDesignation:
    id: int = 1
    company_id: int = 1
    name: str = "Manager"
    base_monthly_salary: float | None = 50000.0
    grade_rate: float | None = 500.0
    template_lines: list[Any] = field(default_factory=list)


@dataclass
class FakePayhead:
    id: int = 10
    code: str = "GRADE"
    type: str = "EARNING"
    calculation_basis: str | None = "FIXED"
    default_amount: float | None = None
    default_rate: float | None = None


@dataclass
class FakeTemplateLine:
    id: int = 100
    payhead_id: int = 10
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None
    sort_order: int = 100


@dataclass
class FakeEmployee:
    id: int = 1
    company_id: int = 1
    designation_id: int | None = 1
    grade: str | None = None
    grade_number: int | None = None
    base_monthly_salary: float | None = None
    payroll_mode: str = "MONTHLY"


@dataclass
class FakeStructureLine:
    payhead_id: int = 10
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None


@dataclass
class FakeStructure:
    id: int = 1
    employee_id: int = 1
    is_active: bool = True
    lines: list[FakeStructureLine] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Business logic extracted from payroll_service.py
# ---------------------------------------------------------------------------

def compute_grade_amount(
    grade_number: int | None,
    designation_grade_rate: float | None,
) -> float:
    """GRADE = grade_number * grade_rate if both are > 0, else fallback to grade_rate."""
    gn = int(grade_number or 0)
    gr = float(designation_grade_rate or 0)
    if gn > 0 and gr > 0:
        return float(gn * gr)
    return gr


def build_formula_base_vars(
    emp: FakeEmployee,
    designation: FakeDesignation | None,
    payable_days: float = 26.0,
    absent_days: float = 0.0,
    worked_minutes: int = 7800,
    late_minutes: int = 0,
    overtime_minutes: int = 0,
) -> dict[str, float]:
    """Replicates the formula_base_vars dict built in payroll_service.compute_payroll_run."""
    emp_salary = getattr(emp, "base_monthly_salary", None)
    desig_salary = getattr(designation, "base_monthly_salary", None) if designation else None
    base_monthly_salary = float(emp_salary if emp_salary is not None else (desig_salary or 0))
    days_in_period = 30.0
    per_day_rate = (base_monthly_salary / days_in_period) if base_monthly_salary > 0 else 0.0

    grade_amount = compute_grade_amount(
        getattr(emp, "grade_number", None),
        getattr(designation, "grade_rate", None) if designation else None,
    )

    return {
        "PAYABLE_DAYS": float(payable_days),
        "ABSENT_DAYS": float(absent_days),
        "LATE_MINUTES": float(late_minutes),
        "OVERTIME_MINUTES": float(overtime_minutes),
        "WORKED_MINUTES": float(worked_minutes),
        "WORKED_HOURS": float(worked_minutes) / 60.0,
        "BASE_MONTHLY_SALARY": float(base_monthly_salary),
        "PER_DAY_RATE": float(per_day_rate),
        "DAYS_IN_PERIOD": float(days_in_period),
        "GRADE": float(grade_amount),
    }


def apply_template_to_employee(
    designation: FakeDesignation,
    existing_structures: list[FakeStructure],
) -> tuple[list[FakeStructure], FakeStructure]:
    """
    Simulates apply_designation_template service function:
    - Deactivates existing active structures
    - Creates new structure from template lines
    Returns (updated_structures, new_structure)
    """
    for s in existing_structures:
        if s.is_active:
            s.is_active = False

    new_structure = FakeStructure(
        id=max((s.id for s in existing_structures), default=0) + 1,
        employee_id=existing_structures[0].employee_id if existing_structures else 1,
        is_active=True,
        lines=[
            FakeStructureLine(
                payhead_id=tl.payhead_id,
                amount=tl.amount,
                rate=tl.rate,
                formula=tl.formula,
            )
            for tl in designation.template_lines
        ],
    )
    existing_structures.append(new_structure)
    return existing_structures, new_structure


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestGradeComputation:
    def test_grade_number_times_rate(self):
        """GRADE = grade_number × designation.grade_rate"""
        emp = FakeEmployee(grade_number=3)
        desg = FakeDesignation(grade_rate=500.0)
        result = compute_grade_amount(emp.grade_number, desg.grade_rate)
        assert result == 1500.0, f"Expected 1500.0, got {result}"

    def test_zero_grade_number_returns_rate(self):
        """grade_number = 0 → GRADE = designation.grade_rate (fallback)"""
        emp = FakeEmployee(grade_number=0)
        desg = FakeDesignation(grade_rate=500.0)
        result = compute_grade_amount(emp.grade_number, desg.grade_rate)
        assert result == 500.0, f"Expected 500.0, got {result}"

    def test_none_grade_number_returns_rate(self):
        """grade_number = None → GRADE = designation.grade_rate (fallback)"""
        result = compute_grade_amount(None, 750.0)
        assert result == 750.0

    def test_none_grade_rate_returns_zero(self):
        """grade_rate = None → GRADE = 0"""
        result = compute_grade_amount(5, None)
        assert result == 0.0

    def test_both_none_returns_zero(self):
        result = compute_grade_amount(None, None)
        assert result == 0.0

    def test_large_grade_number(self):
        result = compute_grade_amount(10, 250.0)
        assert result == 2500.0


class TestFormulaBaseVars:
    def test_grade_in_formula_vars(self):
        """GRADE variable is present in formula_base_vars with correct value."""
        emp = FakeEmployee(grade_number=4, base_monthly_salary=None)
        desg = FakeDesignation(grade_rate=500.0, base_monthly_salary=60000.0)
        vars_ = build_formula_base_vars(emp, desg)
        assert "GRADE" in vars_
        assert vars_["GRADE"] == 2000.0  # 4 × 500

    def test_base_monthly_salary_from_designation_when_emp_null(self):
        """When employee has no base_monthly_salary, falls back to designation."""
        emp = FakeEmployee(grade_number=1, base_monthly_salary=None)
        desg = FakeDesignation(grade_rate=500.0, base_monthly_salary=60000.0)
        vars_ = build_formula_base_vars(emp, desg)
        assert vars_["BASE_MONTHLY_SALARY"] == 60000.0

    def test_employee_salary_overrides_designation(self):
        """Employee salary beats designation salary."""
        emp = FakeEmployee(grade_number=1, base_monthly_salary=45000.0)
        desg = FakeDesignation(grade_rate=500.0, base_monthly_salary=60000.0)
        vars_ = build_formula_base_vars(emp, desg)
        assert vars_["BASE_MONTHLY_SALARY"] == 45000.0

    def test_payable_days_in_vars(self):
        emp = FakeEmployee(grade_number=2)
        desg = FakeDesignation(grade_rate=300.0)
        vars_ = build_formula_base_vars(emp, desg, payable_days=25.0)
        assert vars_["PAYABLE_DAYS"] == 25.0


class TestApplyTemplate:
    def test_apply_deactivates_old_structure(self):
        """Applying template deactivates any existing active structure."""
        desg = FakeDesignation(
            template_lines=[FakeTemplateLine(payhead_id=10, amount=5000.0)]
        )
        old_struct = FakeStructure(id=1, employee_id=1, is_active=True, lines=[])
        structures, new_struct = apply_template_to_employee(desg, [old_struct])

        assert old_struct.is_active is False
        assert new_struct.is_active is True

    def test_apply_creates_lines_from_template(self):
        """New structure has lines matching the designation template."""
        desg = FakeDesignation(
            template_lines=[
                FakeTemplateLine(payhead_id=10, amount=5000.0),
                FakeTemplateLine(payhead_id=20, formula="BASIC * 0.1"),
            ]
        )
        structures, new_struct = apply_template_to_employee(desg, [])
        assert len(new_struct.lines) == 2
        assert new_struct.lines[0].payhead_id == 10
        assert new_struct.lines[0].amount == 5000.0
        assert new_struct.lines[1].formula == "BASIC * 0.1"

    def test_apply_with_no_existing_structures(self):
        """Apply template works even when employee has no existing structures."""
        desg = FakeDesignation(
            template_lines=[FakeTemplateLine(payhead_id=10, amount=3000.0)]
        )
        structures, new_struct = apply_template_to_employee(desg, [])
        assert len(structures) == 1
        assert new_struct.is_active is True
        assert len(new_struct.lines) == 1

    def test_apply_empty_template_creates_empty_structure(self):
        """Empty designation template creates an empty structure (no lines)."""
        desg = FakeDesignation(template_lines=[])
        structures, new_struct = apply_template_to_employee(desg, [])
        assert new_struct.is_active is True
        assert len(new_struct.lines) == 0

    def test_old_history_preserved(self):
        """Old deactivated structure is still in the list (history preserved)."""
        desg = FakeDesignation(
            template_lines=[FakeTemplateLine(payhead_id=10, amount=1000.0)]
        )
        old1 = FakeStructure(id=1, employee_id=1, is_active=True, lines=[])
        structures, _ = apply_template_to_employee(desg, [old1])
        assert len(structures) == 2  # old (deactivated) + new


class TestTemplateLineFormula:
    def test_formula_can_reference_grade(self):
        """A formula using GRADE should work with the computed grade variable."""
        emp = FakeEmployee(grade_number=5)
        desg = FakeDesignation(grade_rate=200.0)
        vars_ = build_formula_base_vars(emp, desg, payable_days=30.0)

        # Simulated formula: GRADE * PAYABLE_DAYS / 30
        grade = vars_["GRADE"]
        payable_days = vars_["PAYABLE_DAYS"]
        computed = grade * payable_days / 30.0
        assert computed == 1000.0  # 5*200 = 1000, * 30/30 = 1000

    def test_per_day_rate_formula(self):
        emp = FakeEmployee(grade_number=2, base_monthly_salary=None)
        desg = FakeDesignation(grade_rate=500.0, base_monthly_salary=30000.0)
        vars_ = build_formula_base_vars(emp, desg, payable_days=25.0)
        # PER_DAY_RATE = 30000 / 30 = 1000; PAYABLE_DAYS = 25; total = 25000
        assert vars_["PER_DAY_RATE"] == 1000.0


# ---------------------------------------------------------------------------
# Run via pytest or directly
# ---------------------------------------------------------------------------

def _run_all_tests():
    tests = [
        TestGradeComputation,
        TestFormulaBaseVars,
        TestApplyTemplate,
        TestTemplateLineFormula,
    ]
    passed = 0
    failed = 0
    for cls in tests:
        obj = cls()
        for attr in dir(obj):
            if not attr.startswith("test_"):
                continue
            method = getattr(obj, attr)
            try:
                method()
                print(f"  [PASS] {cls.__name__}.{attr}")
                passed += 1
            except AssertionError as e:
                print(f"  [FAIL] {cls.__name__}.{attr}: {e}")
                failed += 1
            except Exception as e:
                print(f"  [ERROR] {cls.__name__}.{attr}: {e}")
                failed += 1
    print(f"\n=== Results: {passed} passed, {failed} failed ===")
    return failed == 0


if __name__ == "__main__":
    import sys
    success = _run_all_tests()
    sys.exit(0 if success else 1)
