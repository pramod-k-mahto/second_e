"""
Backfill / migration script: Designation Template Lines

This script is safe to run multiple times (idempotent). It:
  1. Ensures the designation_template_lines table and grade_number column exist
     (runs the SQL migration if needed).
  2. For each designation that has a grade_rate but no template lines, adds a
     GRADE payhead template line so existing designations get the template treatment.

Run from the API directory:
    python migrate_designation_templates.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine
from app import models
from sqlalchemy import text


def run_sql_migration(conn) -> None:
    migration_file = os.path.join(
        os.path.dirname(__file__),
        "..",
        "db",
        "migrations",
        "20260422_01_designation_template_lines.sql",
    )
    migration_file = os.path.normpath(migration_file)
    if not os.path.exists(migration_file):
        print(f"[WARN] Migration file not found: {migration_file}. Skipping SQL step.")
        return

    with open(migration_file, "r", encoding="utf-8") as f:
        sql = f.read()

    try:
        conn.execute(text(sql))
        conn.commit()
        print("[OK] SQL migration applied.")
    except Exception as e:
        conn.rollback()
        print(f"[WARN] SQL migration error (may already be applied): {e}")


def backfill_designation_templates(db) -> None:
    """For each designation that has grade_rate set but no template lines,
    add a GRADE payhead template line."""
    designations = db.query(models.PayrollDesignation).all()
    total_added = 0

    for desig in designations:
        if desig.grade_rate is None:
            continue

        # Check if template lines already exist
        existing = (
            db.query(models.DesignationTemplateLine)
            .filter(models.DesignationTemplateLine.designation_id == desig.id)
            .first()
        )
        if existing:
            continue  # already has template lines

        # Find GRADE payhead for this company
        ph_grade = (
            db.query(models.PayrollPayhead)
            .filter(
                models.PayrollPayhead.company_id == desig.company_id,
                models.PayrollPayhead.code == "GRADE",
            )
            .first()
        )
        if ph_grade is None:
            print(
                f"[SKIP] Designation {desig.id} ({desig.name}, company {desig.company_id}): "
                f"no GRADE payhead found."
            )
            continue

        tl = models.DesignationTemplateLine(
            company_id=desig.company_id,
            designation_id=desig.id,
            payhead_id=ph_grade.id,
            amount=None,
            rate=None,
            formula=None,
            sort_order=100,
        )
        db.add(tl)
        total_added += 1
        print(
            f"[ADDED] GRADE template line for designation {desig.id} "
            f"({desig.name}, grade_rate={desig.grade_rate})"
        )

    if total_added:
        db.commit()
        print(f"[DONE] Added {total_added} GRADE template lines.")
    else:
        print("[DONE] No new template lines needed.")


def backfill_employee_grade_number(db) -> None:
    """Try to parse employee.grade (text) into grade_number (int) where not set.
    This is best-effort — only migrates simple numeric grade strings."""
    employees = db.query(models.Employee).all()
    updated = 0
    for emp in employees:
        if getattr(emp, "grade_number", None) is not None:
            continue
        grade_str = str(getattr(emp, "grade", "") or "").strip()
        if not grade_str:
            continue
        try:
            gn = int(grade_str)
            emp.grade_number = gn
            db.add(emp)
            updated += 1
        except ValueError:
            pass

    if updated:
        db.commit()
        print(f"[DONE] Backfilled grade_number for {updated} employee(s).")
    else:
        print("[DONE] No employee grade_number backfill needed.")


def main():
    print("=== Designation Template Migration / Backfill ===")

    with engine.connect() as conn:
        run_sql_migration(conn)

    db = SessionLocal()
    try:
        backfill_designation_templates(db)
        backfill_employee_grade_number(db)
    finally:
        db.close()

    print("=== Done ===")


if __name__ == "__main__":
    main()
