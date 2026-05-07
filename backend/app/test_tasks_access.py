from __future__ import annotations

import io
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from .database import Base
from .main import app
from . import models
from .auth import get_current_user
from .tasks_models import Task
from .tasks_models import TaskAssignee
from .tasks_models import TaskAttachment


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    Base.metadata.create_all(bind=engine)

    next_attachment_id = {"value": 2001}
    next_task_id = {"value": 10000}
    next_task_assignee_id = {"value": 30000}

    @event.listens_for(TestingSessionLocal, "before_flush")
    def _assign_bigint_ids(session, flush_context, instances):
        for obj in session.new:
            if isinstance(obj, Task) and getattr(obj, "id", None) is None:
                obj.id = next_task_id["value"]
                next_task_id["value"] += 1
            if isinstance(obj, TaskAssignee) and getattr(obj, "id", None) is None:
                obj.id = next_task_assignee_id["value"]
                next_task_assignee_id["value"] += 1
            if isinstance(obj, TaskAttachment) and getattr(obj, "id", None) is None:
                obj.id = next_attachment_id["value"]
                next_attachment_id["value"] += 1

    def _get_db_override():
        db = TestingSessionLocal()
        try:
            yield db
        finally:
            db.close()

    from .database import get_db

    app.dependency_overrides[get_db] = _get_db_override

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        app.dependency_overrides.clear()


@pytest.fixture()
def client(db_session):
    return TestClient(app)


def _override_user(user: models.User) -> None:
    def _override_get_current_user():
        return user

    app.dependency_overrides[get_current_user] = _override_get_current_user


def _seed_company_context(db_session):
    tenant = models.Tenant(name="T1")
    db_session.add(tenant)
    db_session.flush()

    admin = models.User(
        email="admin@example.com",
        full_name="Admin",
        password_hash="x",
        is_active=True,
        role=models.UserRole.admin,
        tenant_id=tenant.id,
    )
    db_session.add(admin)
    db_session.flush()

    creator = models.User(
        email="creator@example.com",
        full_name="Creator",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
        tenant_permissions={"tasks": ["task.view", "task.create", "task.update", "task.assign", "task.attach", "task.comment"]},
    )
    db_session.add(creator)
    db_session.flush()

    other = models.User(
        email="other@example.com",
        full_name="Other",
        password_hash="x",
        is_active=True,
        role=models.UserRole.user,
        tenant_id=tenant.id,
        tenant_permissions={"tasks": ["task.view", "task.comment"]},
    )
    db_session.add(other)
    db_session.flush()

    company = models.Company(owner_id=admin.id, tenant_id=tenant.id, name="C1")
    db_session.add(company)
    db_session.flush()

    # Allow employees to access the company (router enforces via owner or explicit access)
    db_session.add(models.UserCompanyAccess(user_id=creator.id, company_id=company.id))
    db_session.add(models.UserCompanyAccess(user_id=other.id, company_id=company.id))

    # Tasks
    task_assigned_to_creator = Task(
        id=1001,
        tenant_id=tenant.id,
        company_id=company.id,
        title="Assigned to creator",
        description=None,
        status="open",
        progress=0,
        created_by=admin.id,
        assigned_to=creator.id,
    )

    task_created_by_creator_unassigned = Task(
        id=1002,
        tenant_id=tenant.id,
        company_id=company.id,
        title="Created by creator",
        description=None,
        status="open",
        progress=0,
        created_by=creator.id,
        assigned_to=None,
    )

    task_for_other = Task(
        id=1003,
        tenant_id=tenant.id,
        company_id=company.id,
        title="For other",
        description=None,
        status="open",
        progress=0,
        created_by=admin.id,
        assigned_to=other.id,
    )

    db_session.add_all([task_assigned_to_creator, task_created_by_creator_unassigned, task_for_other])
    db_session.flush()

    db_session.add(TaskAssignee(task_id=task_assigned_to_creator.id, user_id=creator.id))
    db_session.add(TaskAssignee(task_id=task_for_other.id, user_id=other.id))
    db_session.commit()

    return {
        "tenant": tenant,
        "company": company,
        "admin": admin,
        "creator": creator,
        "other": other,
        "task_assigned_to_creator": task_assigned_to_creator,
        "task_created_by_creator_unassigned": task_created_by_creator_unassigned,
        "task_for_other": task_for_other,
    }


def test_admin_can_list_all_company_tasks(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["admin"])

    resp = client.get(f"/companies/{ctx['company'].id}/tasks")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["results"]) == 3


def test_employee_only_sees_assigned_or_created_tasks(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["creator"])

    resp = client.get(f"/companies/{ctx['company'].id}/tasks")
    assert resp.status_code == 200
    data = resp.json()

    # creator should see:
    # - assigned to them
    # - created by them (even if unassigned)
    ids = {t["id"] for t in data["results"]}
    assert ctx["task_assigned_to_creator"].id in ids
    assert ctx["task_created_by_creator_unassigned"].id in ids
    assert ctx["task_for_other"].id not in ids


def test_employee_cannot_view_unrelated_task_detail(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["creator"])

    resp = client.get(f"/companies/{ctx['company'].id}/tasks/{ctx['task_for_other'].id}")
    assert resp.status_code == 404


def test_creator_can_patch_own_task(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["creator"])

    resp = client.patch(
        f"/companies/{ctx['company'].id}/tasks/{ctx['task_created_by_creator_unassigned'].id}",
        json={"status": "done"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "done"


def test_non_creator_cannot_patch_task(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["other"])

    resp = client.patch(
        f"/companies/{ctx['company'].id}/tasks/{ctx['task_created_by_creator_unassigned'].id}",
        json={"status": "done"},
    )
    assert resp.status_code in (403, 404)


def test_admin_can_assign_task(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["admin"])

    resp = client.patch(
        f"/companies/{ctx['company'].id}/tasks/{ctx['task_created_by_creator_unassigned'].id}/assign",
        json={"assignee_id": ctx["other"].id},
    )
    assert resp.status_code == 200
    assert resp.json()["assignee_id"] == ctx["other"].id


def test_non_creator_employee_cannot_assign_task(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["other"])

    resp = client.patch(
        f"/companies/{ctx['company'].id}/tasks/{ctx['task_created_by_creator_unassigned'].id}/assign",
        json={"assignee_id": ctx["other"].id},
    )
    assert resp.status_code == 403


def test_task_assigned_completed_timestamps_and_duration(client, db_session):
    ctx = _seed_company_context(db_session)
    _override_user(ctx["admin"])

    create_resp = client.post(
        f"/companies/{ctx['company'].id}/tasks",
        json={"title": "T", "due_date": "2025-12-25", "priority": "high"},
    )
    assert create_resp.status_code == 201
    created = create_resp.json()
    assert created.get("assigned_at") is None
    assert created.get("completed_at") is None
    assert created.get("completion_duration_hours") is None

    task_id = created["id"]

    assign_resp = client.patch(
        f"/companies/{ctx['company'].id}/tasks/{task_id}/assign",
        json={"assignee_id": ctx["other"].id},
    )
    assert assign_resp.status_code == 200
    assigned = assign_resp.json()
    assert assigned.get("assigned_at") is not None
    assert assigned.get("completed_at") is None
    assert assigned.get("completion_duration_hours") is None

    # Backdate assigned_at so duration is deterministic and survives rounding to 2 decimals.
    task = db_session.query(Task).filter(Task.id == int(task_id)).first()
    assert task is not None
    task.assigned_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.add(task)
    db_session.commit()

    done_resp = client.patch(
        f"/companies/{ctx['company'].id}/tasks/{task_id}",
        json={"status": "done"},
    )
    assert done_resp.status_code == 200
    done = done_resp.json()
    assert done.get("assigned_at") is not None
    assert done.get("completed_at") is not None
    assert done.get("completion_duration_hours") is not None
    assert float(done["completion_duration_hours"]) > 0


def test_attachment_upload_only_creator_or_admin(client, db_session):
    ctx = _seed_company_context(db_session)

    # other user shouldn't be able to upload to a task created by creator
    _override_user(ctx["other"])
    resp = client.post(
        f"/companies/{ctx['company'].id}/tasks/{ctx['task_created_by_creator_unassigned'].id}/attachments",
        files={"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp.status_code in (403, 404)

    # creator can upload
    _override_user(ctx["creator"])
    resp2 = client.post(
        f"/companies/{ctx['company'].id}/tasks/{ctx['task_created_by_creator_unassigned'].id}/attachments",
        files={"file": ("note.txt", io.BytesIO(b"hello"), "text/plain")},
    )
    assert resp2.status_code == 201
    body = resp2.json()
    assert "attachment" in body
    assert body["attachment"]["file_name"] == "note.txt"
