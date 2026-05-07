from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import FileResponse
from sqlalchemy import func, or_, exists
from sqlalchemy.orm import Session

from ..database import get_db
from ..auth import get_current_user
from .. import models
from ..tasks_models import (
    Task,
    TaskAssignee,
    TaskChecklistItem,
    TaskComment,
    TaskAttachment,
    TaskWatcher,
    TaskLabel,
    TaskTaskLabel,
    TaskReaction,
    TaskReactionTargetType,
    TaskHead,
)
from ..services import notification_service
from ..tasks_permissions import ensure_same_tenant, require_task_permission
from ..tasks_schemas import (
    Attachment,
    AttachmentCreateResponse,
    ChecklistItem,
    ChecklistItemCreateV2,
    ChecklistItemToggleV2,
    ChecklistToggleResponse,
    Comment,
    CommentCreateRequest,
    CommentCreateResponse,
    CommentWithReactions,
    Reaction,
    ReactionListResponse,
    ReactionToggleRequestV2,
    TaskAttachmentRead,
    TaskAssignRequestV2,
    TaskAssigneesAddRequest,
    TaskAssigneesResponse,
    TaskAssigneeDetail,
    TaskAssigneeSummary,
    TaskAssigneeRoleUpdate,
    TaskDetail,
    TaskDetailResponse,
    TaskListResponseV2,
    TaskLabelCreate,
    TaskLabelRead,
    TaskLabelUpdate,
    TaskPatchRequest,
    TaskSummary,
    TaskPermissions,
    TaskWatcherRead,
    TaskHeadRead,
    TaskHeadCreate,
    TaskHeadUpdate,
)
from ..tasks_storage import (
    task_upload_dir,
    validate_upload,
    generate_stored_filename,
    get_uploads_base_dir,
    ensure_path_within_base,
)

router = APIRouter(prefix="/companies/{company_id}/tasks", tags=["tasks"])


def _notify_task_interaction(*, db: Session, company_id: int, notif_type: str, task_id: int) -> None:
    db.add(
        models.Notification(
            company_id=int(company_id),
            type=str(notif_type),
            task_id=int(task_id),
        )
    )


def _is_admin(user: models.User) -> bool:
    return user.role in (models.UserRole.admin, models.UserRole.superadmin)


def _status_out(status: str | None) -> str:
    s = (status or "").strip().lower()
    if s in ("todo", "in_progress", "done"):
        return s
    if s == "open":
        return "todo"
    if s == "blocked":
        return "in_progress"
    if s in ("canceled", "cancelled"):
        return "done"
    return s or "todo"


def _status_in(status: str) -> str:
    s = (status or "").strip().lower()
    s = s.replace("-", "_").replace(" ", "_")
    if s in ("todo", "to_do", "open"):
        return "open"
    if s in ("in_progress", "inprogress", "blocked"):
        return "in_progress"
    if s in ("done", "completed", "complete", "canceled", "cancelled"):
        return "done"
    raise HTTPException(status_code=400, detail="Invalid status")


def _get_company_with_access(db: Session, company_id: int, user: models.User) -> models.Company:
    _role = str(user.role.value if hasattr(user.role, 'value') else user.role).lower()
    if _role == "superadmin" or _role.startswith("ghost_"):
        company = db.query(models.Company).filter(models.Company.id == company_id).first()
    elif user.role == models.UserRole.admin:
        company = (
            db.query(models.Company)
            .filter(models.Company.id == company_id, models.Company.tenant_id == user.tenant_id)
            .first()
        )
    else:
        company = (
            db.query(models.Company)
            .outerjoin(
                models.UserCompanyAccess,
                models.UserCompanyAccess.company_id == models.Company.id,
            )
            .filter(models.Company.id == company_id)
            .filter(
                (models.Company.owner_id == user.id)
                | (models.UserCompanyAccess.user_id == user.id)
            )
            .first()
        )

    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    return company


def _task_base_visibility_filter(query, *, user: models.User, tenant_id: int, company_id: int):
    query = query.filter(
        Task.tenant_id == tenant_id,
        Task.company_id == company_id,
        Task.deleted_at.is_(None),
    )
    if _is_admin(user):
        return query
    assigned_to_user = exists().where(
        TaskAssignee.task_id == Task.id,
        TaskAssignee.user_id == int(user.id),
    )
    # Normal users only see tasks assigned to them (exclude tasks created by them but not assigned)
    return query.filter(assigned_to_user)


def _load_task_or_404(*, db: Session, tenant_id: int, company_id: int, task_id: int) -> Task:
    task = (
        db.query(Task)
        .filter(
            Task.tenant_id == tenant_id,
            Task.company_id == company_id,
            Task.id == task_id,
            Task.deleted_at.is_(None),
        )
        .first()
    )
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


def _ensure_can_view_task(*, db: Session, user: models.User, tenant_id: int, task: Task) -> None:
    if _is_admin(user):
        return
    if int(task.created_by) == int(user.id):
        return
    is_assignee = (
        db.query(TaskAssignee.id)
        .filter(TaskAssignee.task_id == int(task.id), TaskAssignee.user_id == int(user.id))
        .first()
    )
    if not is_assignee:
        raise HTTPException(status_code=404, detail="Task not found")


def _is_task_assignee(*, db: Session, task: Task, user: models.User) -> bool:
    if _is_admin(user):
        return True
    return (
        db.query(TaskAssignee.id)
        .filter(TaskAssignee.task_id == int(task.id), TaskAssignee.user_id == int(user.id))
        .first()
        is not None
    )


def _ensure_can_update_task(*, user: models.User, task: Task) -> None:
    if _is_admin(user):
        return
    # Non-admins can only update tasks they are assigned to (e.g. status/progress)
    # but they cannot have "manage_all" actions.
    # We will refine update endpoints specifically to distinguish between status vs management update.
    pass


def _ensure_can_assign_task(*, user: models.User, task: Task) -> None:
    if _is_admin(user) or int(task.created_by) == int(user.id):
        return
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")


def _validate_assignee_id(*, db: Session, tenant_id: int, assignee_id: int | None) -> None:
    if assignee_id is None:
        return
    u = (
        db.query(models.User)
        .filter(
            models.User.id == int(assignee_id),
            models.User.tenant_id == int(tenant_id),
            models.User.is_active.is_(True),
        )
        .first()
    )
    if not u:
        raise HTTPException(status_code=400, detail="Invalid assignee_id")


def _task_assignees_summary(*, db: Session, tenant_id: int, task_id: int) -> list[TaskAssigneeSummary]:
    rows = (
        db.query(models.User, TaskAssignee.role)
        .join(TaskAssignee, TaskAssignee.user_id == models.User.id)
        .filter(TaskAssignee.task_id == int(task_id), models.User.tenant_id == int(tenant_id))
        .order_by(models.User.full_name.asc().nullslast(), models.User.id.asc())
        .all()
    )
    return [
        TaskAssigneeSummary(id=int(u.id), name=u.full_name, email=str(u.email), role=str(role or "EXECUTOR"))
        for u, role in rows
    ]


def _task_assignees_detail(*, db: Session, tenant_id: int, task_id: int) -> list[TaskAssigneeDetail]:
    rows = (
        db.query(models.User, TaskAssignee.role)
        .join(TaskAssignee, TaskAssignee.user_id == models.User.id)
        .filter(TaskAssignee.task_id == int(task_id), models.User.tenant_id == int(tenant_id))
        .order_by(models.User.full_name.asc().nullslast(), models.User.id.asc())
        .all()
    )
    return [
        TaskAssigneeDetail(
            id=int(u.id),
            name=u.full_name,
            email=str(u.email),
            active=bool(getattr(u, "is_active", False)),
            is_tenant_admin=bool(getattr(u, "is_tenant_admin", False)),
            role=str(role or "EXECUTOR"),
        )
        for u, role in rows
    ]


def _sync_legacy_assigned_to(*, task: Task, assignee_ids: list[int]) -> None:
    if len(assignee_ids) == 1:
        task.assigned_to = int(assignee_ids[0])
    else:
        task.assigned_to = None


def _ensure_can_react(*, user: models.User) -> None:
    if _is_admin(user):
        return
    try:
        require_task_permission(user, "task.comment")
        return
    except HTTPException:
        require_task_permission(user, "task.update")


def _reaction_list(
    *, db: Session, tenant_id: int, target_type: str, target_id: int, current_user_id: int
) -> list[Reaction]:
    rows = (
        db.query(TaskReaction.emoji, func.count(TaskReaction.id))
        .filter(
            TaskReaction.tenant_id == tenant_id,
            TaskReaction.target_type == target_type,
            TaskReaction.target_id == target_id,
        )
        .group_by(TaskReaction.emoji)
        .all()
    )

    my_emojis = {
        str(r[0])
        for r in (
            db.query(TaskReaction.emoji)
            .filter(
                TaskReaction.tenant_id == tenant_id,
                TaskReaction.user_id == current_user_id,
                TaskReaction.target_type == target_type,
                TaskReaction.target_id == target_id,
            )
            .all()
        )
    }

    return [
        Reaction(emoji=str(emoji), count=int(cnt), reacted_by_me=str(emoji) in my_emojis)
        for emoji, cnt in rows
    ]


def _task_counts(*, db: Session, tenant_id: int, task_id: int) -> tuple[int, int, int, int, int]:
    checklist_done = (
        db.query(func.count(TaskChecklistItem.id))
        .filter(
            TaskChecklistItem.tenant_id == tenant_id,
            TaskChecklistItem.task_id == task_id,
            TaskChecklistItem.is_completed.is_(True),
        )
        .scalar()
        or 0
    )
    checklist_total = (
        db.query(func.count(TaskChecklistItem.id))
        .filter(TaskChecklistItem.tenant_id == tenant_id, TaskChecklistItem.task_id == task_id)
        .scalar()
        or 0
    )
    comments = (
        db.query(func.count(TaskComment.id))
        .filter(
            TaskComment.tenant_id == tenant_id,
            TaskComment.task_id == task_id,
            TaskComment.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    attachments = (
        db.query(func.count(TaskAttachment.id))
        .filter(
            TaskAttachment.tenant_id == tenant_id,
            TaskAttachment.task_id == task_id,
            TaskAttachment.deleted_at.is_(None),
        )
        .scalar()
        or 0
    )
    reactions = (
        db.query(func.count(TaskReaction.id))
        .filter(
            TaskReaction.tenant_id == tenant_id,
            TaskReaction.target_type == TaskReactionTargetType.task.value,
            TaskReaction.target_id == task_id,
        )
        .scalar()
        or 0
    )
    return (
        int(checklist_total),
        int(checklist_done),
        int(comments),
        int(attachments),
        int(reactions),
    )


def _task_summary_dto(
    *,
    db: Session,
    tenant_id: int,
    company_id: int,
    task: Task,
    include_assignees: bool = False,
) -> TaskSummary:
    checklist_total, checklist_done, comments, attachments, reactions = _task_counts(
        db=db,
        tenant_id=tenant_id,
        task_id=int(task.id),
    )

    assignee_name = None
    assignee_id_out: int | None = None
    assignees_summary: list[TaskAssigneeSummary] | None = None
    if include_assignees:
        assignees_summary = _task_assignees_summary(db=db, tenant_id=tenant_id, task_id=int(task.id))

        if len(assignees_summary) == 1:
            assignee_id_out = int(assignees_summary[0].id)
            assignee_name = assignees_summary[0].name
        else:
            assignee_id_out = None
            assignee_name = None
    else:
        # Backwards-compatible fast path for list responses
        assignee_id_out = int(task.assigned_to) if task.assigned_to is not None else None
        if assignee_id_out is None:
            # Some tasks may have assignees stored in TaskAssignee table while legacy assigned_to
            # is NULL (e.g. older data or previously out-of-sync). If there is exactly one
            # assignee, expose it on list responses as well.
            ids = [
                int(r[0])
                for r in db.query(TaskAssignee.user_id)
                .filter(TaskAssignee.task_id == int(task.id))
                .all()
            ]
            if len(ids) == 1:
                assignee_id_out = int(ids[0])
            elif len(ids) > 1:
                # Multi-assignee: provide a human-friendly summary label.
                assignee_id_out = int(ids[0])
                users = (
                    db.query(models.User)
                    .filter(models.User.tenant_id == int(tenant_id), models.User.id.in_(ids))
                    .order_by(models.User.full_name.asc().nullslast(), models.User.id.asc())
                    .all()
                )
                names = [str(u.full_name or u.email) for u in users]
                if len(names) > 3:
                    assignee_name = ", ".join(names[i] for i in range(3)) + f" +{len(names) - 3}"
                else:
                    assignee_name = ", ".join(names)

        if assignee_id_out is not None:
            u = (
                db.query(models.User)
                .filter(models.User.id == int(assignee_id_out), models.User.tenant_id == tenant_id)
                .first()
            )
            if u:
                assignee_name = u.full_name

    completion_duration_hours = None
    if getattr(task, "assigned_at", None) is not None and getattr(task, "completed_at", None) is not None:
        try:
            completion_duration_hours = round((task.completed_at - task.assigned_at).total_seconds() / 3600, 2)
        except Exception:
            completion_duration_hours = None

    return TaskSummary(
        id=int(task.id),
        company_id=int(company_id),
        title=task.title,
        description=task.description,
        status=_status_out(str(task.status)),
        progress=int(getattr(task, "progress", 0) or 0),
        priority=task.priority,
        due_date=task.due_at.date() if task.due_at else None,
        assignee_id=assignee_id_out,
        assignee_name=assignee_name,
        created_by_id=int(task.created_by),
        assigned_at=getattr(task, "assigned_at", None),
        completed_at=getattr(task, "completed_at", None),
        completion_duration_hours=completion_duration_hours,
        created_at=task.created_at,
        updated_at=task.updated_at,
        checklist_total=checklist_total,
        checklist_done=checklist_done,
        comments=comments,
        attachments=attachments,
        reactions=reactions,
        assignees=assignees_summary,
        customer_id=task.customer_id,
        customer_name=task.customer.name if task.customer else None,
        department_id=task.department_id,
        department_name=task.department.name if task.department else None,
        project_id=task.project_id,
        project_name=task.project.name if task.project else None,
        task_head_id=task.task_head_id,
        task_head_name=task.task_head.name if task.task_head else None,
        forwarded_from_id=task.forwarded_from_id,
        forwarded_from_name=task.forwarded_from.full_name if task.forwarded_from else None,
    )


@router.get("", response_model=TaskListResponseV2)
def list_tasks(
    company_id: int,
    q: str | None = Query(None, description="Search by title"),
    status: str | None = Query(None),
    assignee_id: int | None = Query(None),
    assigned_to_me: bool | None = Query(None, description="Admins may toggle my-tasks filter"),
    sort: str | None = Query(None, description="updated_desc|due_asc|created_desc"),
    skip: int = 0,
    limit: int = 20,
    customer_id: int | None = Query(None),
    customer_ids: list[int] | None = Query(None),
    department_id: int | None = Query(None),
    department_ids: list[int] | None = Query(None),
    project_id: int | None = Query(None),
    project_ids: list[int] | None = Query(None),
    task_head_id: int | None = Query(None),
    task_head_ids: list[int] | None = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if current_user.role == models.UserRole.superadmin:
        tenant_id = int(company.tenant_id)
    elif str(current_user.role.value if hasattr(current_user.role, 'value') else current_user.role).lower().startswith("ghost_"):
        # Ghost admins have no tenant_id; derive it from the company they are accessing
        tenant_id = int(company.tenant_id)
    elif current_user.role == models.UserRole.admin:
        if getattr(current_user, "tenant_id", None) is not None and int(company.tenant_id) != int(
            current_user.tenant_id
        ):
            raise HTTPException(status_code=403, detail="Cannot access company outside your tenant")
        tenant_id = int(company.tenant_id)
    else:
        tenant_id = ensure_same_tenant(current_user)
        _get_company_with_access(db, company_id, current_user)

    query = _task_base_visibility_filter(db.query(Task), user=current_user, tenant_id=tenant_id, company_id=company_id)

    if q:
        like = f"%{q}%"
        query = query.filter(or_(Task.title.ilike(like), Task.description.ilike(like)))

    if status:
        query = query.filter(Task.status == _status_in(status))

    if _is_admin(current_user):
        if assigned_to_me is True:
            query = query.filter(
                exists().where(
                    TaskAssignee.task_id == Task.id,
                    TaskAssignee.user_id == int(current_user.id),
                )
            )
        elif assignee_id is not None:
            query = query.filter(
                exists().where(
                    TaskAssignee.task_id == Task.id,
                    TaskAssignee.user_id == int(assignee_id),
                )
            )

    # Filtering
    if customer_id is not None:
        query = query.filter(Task.customer_id == customer_id)
    elif customer_ids:
        query = query.filter(Task.customer_id.in_(customer_ids))

    if department_id is not None:
        query = query.filter(Task.department_id == department_id)
    elif department_ids:
        query = query.filter(Task.department_id.in_(department_ids))

    if project_id is not None:
        query = query.filter(Task.project_id == project_id)
    elif project_ids:
        query = query.filter(Task.project_id.in_(project_ids))

    if task_head_id is not None:
        query = query.filter(Task.task_head_id == task_head_id)
    elif task_head_ids:
        query = query.filter(Task.task_head_id.in_(task_head_ids))

    total = query.with_entities(func.count(Task.id)).scalar() or 0

    sort_key = sort or "updated_desc"
    if sort_key == "updated_desc":
        query = query.order_by(Task.updated_at.desc())
    elif sort_key == "due_asc":
        query = query.order_by(Task.due_at.asc().nulls_last(), Task.updated_at.desc())
    else:
        query = query.order_by(Task.created_at.desc())

    tasks = query.offset(skip).limit(limit).all()
    results = [_task_summary_dto(db=db, tenant_id=tenant_id, company_id=company_id, task=t) for t in tasks]
    return TaskListResponseV2(results=results, total=int(total), skip=skip, limit=limit)


@router.post("", response_model=TaskSummary, status_code=201)
async def create_task(
    company_id: int,
    payload: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    require_task_permission(current_user, "task.manage_all")

    company = db.query(models.Company).filter(models.Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    if current_user.role == models.UserRole.superadmin:
        tenant_id = int(company.tenant_id)
    elif current_user.role == models.UserRole.admin:
        if getattr(current_user, "tenant_id", None) is not None and int(company.tenant_id) != int(
            current_user.tenant_id
        ):
            raise HTTPException(status_code=403, detail="Cannot access company outside your tenant")
        tenant_id = int(company.tenant_id)
    else:
        tenant_id = ensure_same_tenant(current_user)
        _get_company_with_access(db, company_id, current_user)

    title = (payload.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="title is required")

    description = payload.get("description")
    priority = payload.get("priority")
    due_date = payload.get("due_date")
    assignee_id = payload.get("assignee_id")
    if assignee_id in ("", "null"):
        assignee_id = None
    if priority in ("", "null"):
        priority = None
    if due_date in ("", "null"):
        due_date = None

    if priority is not None:
        priority = str(priority).strip().lower()
        if priority not in {"low", "medium", "high"}:
            raise HTTPException(status_code=400, detail="Invalid priority")

    due_at = None
    if due_date is not None:
        try:
            due_at = datetime.fromisoformat(str(due_date)).replace(tzinfo=None)
        except Exception:
            try:
                due_at = datetime.fromisoformat(f"{str(due_date)}T00:00:00").replace(tzinfo=None)
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid due_date")

    if assignee_id is not None:
        try:
            assignee_id = int(assignee_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid assignee_id")

    _validate_assignee_id(db=db, tenant_id=tenant_id, assignee_id=assignee_id)

    now = datetime.now(timezone.utc)
    task = Task(
        tenant_id=tenant_id,
        company_id=company_id,
        title=title,
        description=description,
        status="open",
        progress=0,
        priority=priority,
        due_at=due_at,
        created_by=int(current_user.id),
        assigned_to=assignee_id,
        assigned_at=now if assignee_id is not None else None,
        customer_id=payload.get("customer_id"),
        department_id=payload.get("department_id"),
        project_id=payload.get("project_id"),
        task_head_id=payload.get("task_head_id"),
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    db.add(task)
    db.commit()
    db.refresh(task)

    if assignee_id is not None:
        db.add(TaskAssignee(task_id=int(task.id), user_id=int(assignee_id)))
        _sync_legacy_assigned_to(task=task, assignee_ids=[int(assignee_id)])
        task.updated_at = datetime.utcnow()
        db.add(task)
        db.commit()

    db.refresh(task)
    if task.assigned_to:
        await notification_service.notify_task_assigned(db, task.id)
    return _task_summary_dto(db=db, tenant_id=tenant_id, company_id=company_id, task=task, include_assignees=True)


# -------- Task Heads --------


@router.get("/heads", response_model=list[TaskHeadRead])
def list_task_heads(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)
    return (
        db.query(TaskHead)
        .filter(TaskHead.company_id == company_id, TaskHead.tenant_id == tenant_id)
        .order_by(TaskHead.name.asc())
        .all()
    )


@router.post("/heads", response_model=TaskHeadRead, status_code=201)
def create_task_head(
    company_id: int,
    payload: TaskHeadCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)
    
    head = TaskHead(
        tenant_id=tenant_id,
        company_id=company_id,
        **payload.model_dump(),
    )
    db.add(head)
    db.commit()
    db.refresh(head)
    return head


@router.patch("/heads/{head_id}", response_model=TaskHeadRead)
def update_task_head(
    company_id: int,
    head_id: int,
    payload: TaskHeadUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)
    
    head = (
        db.query(TaskHead)
        .filter(TaskHead.id == head_id, TaskHead.company_id == company_id, TaskHead.tenant_id == tenant_id)
        .first()
    )
    if not head:
        raise HTTPException(status_code=404, detail="Task Head not found")
        
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(head, k, v)
        
    db.commit()
    db.refresh(head)
    return head


@router.delete("/heads/{head_id}", status_code=204)
def delete_task_head(
    company_id: int,
    head_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)
    
    head = (
        db.query(TaskHead)
        .filter(TaskHead.id == head_id, TaskHead.company_id == company_id, TaskHead.tenant_id == tenant_id)
        .first()
    )
    if not head:
        raise HTTPException(status_code=404, detail="Task Head not found")
        
    db.delete(head)
    db.commit()
    return None

@router.get("/{task_id}", response_model=TaskDetailResponse)
def get_task(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    # Checklist
    checklist_rows = (
        db.query(TaskChecklistItem)
        .filter(TaskChecklistItem.tenant_id == tenant_id, TaskChecklistItem.task_id == task.id)
        .order_by(TaskChecklistItem.position.asc(), TaskChecklistItem.id.asc())
        .all()
    )
    checklist = [
        ChecklistItem(
            id=int(i.id),
            task_id=int(task.id),
            text=i.content,
            is_done=bool(i.is_completed),
            sort_order=int(i.position),
            created_at=i.created_at,
        )
        for i in checklist_rows
    ]

    # Attachments
    attachment_rows = (
        db.query(TaskAttachment)
        .filter(
            TaskAttachment.tenant_id == tenant_id,
            TaskAttachment.task_id == task.id,
            TaskAttachment.deleted_at.is_(None),
        )
        .order_by(TaskAttachment.created_at.desc())
        .all()
    )
    attachments = [
        Attachment(
            id=int(a.id),
            task_id=int(task.id),
            file_url=f"/companies/{company_id}/tasks/{task_id}/attachments/{int(a.id)}/download",
            file_name=a.original_filename,
            mime_type=a.content_type,
            size=int(a.size_bytes),
            uploaded_by_id=int(a.uploaded_by),
            created_at=a.created_at,
        )
        for a in attachment_rows
    ]

    # Comments + reactions
    comment_rows = (
        db.query(TaskComment)
        .filter(
            TaskComment.tenant_id == tenant_id,
            TaskComment.task_id == task.id,
            TaskComment.deleted_at.is_(None),
        )
        .order_by(TaskComment.created_at.asc())
        .all()
    )
    author_ids = {int(c.author_id) for c in comment_rows}
    authors = {}
    if author_ids:
        authors = {
            int(u.id): u.full_name
            for u in db.query(models.User).filter(models.User.id.in_(author_ids)).all()
        }

    comments: list[CommentWithReactions] = []
    for c in comment_rows:
        c_reactions = _reaction_list(
            db=db,
            tenant_id=tenant_id,
            target_type=TaskReactionTargetType.comment.value,
            target_id=int(c.id),
            current_user_id=int(current_user.id),
        )
        comments.append(
            CommentWithReactions(
                comment=Comment(
                    id=int(c.id),
                    task_id=int(task.id),
                    body=c.content,
                    author_id=int(c.author_id),
                    author_name=authors.get(int(c.author_id)),
                    created_at=c.created_at,
                ),
                reactions=c_reactions,
            )
        )

    # Task reactions
    task_reactions = _reaction_list(
        db=db,
        tenant_id=tenant_id,
        target_type=TaskReactionTargetType.task.value,
        target_id=int(task.id),
        current_user_id=int(current_user.id),
    )

    checklist_total, checklist_done, comments_count, attachments_count, reactions_count = _task_counts(
        db=db,
        tenant_id=tenant_id,
        task_id=int(task.id),
    )

    assignees_detail = _task_assignees_detail(db=db, tenant_id=tenant_id, task_id=int(task.id))
    assignee_name = None
    assignee_id_out: int | None = None
    if len(assignees_detail) == 1:
        assignee_id_out = int(assignees_detail[0].id)
        assignee_name = assignees_detail[0].name
    elif len(assignees_detail) > 1:
        assignee_id_out = int(assignees_detail[0].id)
        names = [str(a.name or a.email) for a in assignees_detail]
        if len(names) > 3:
            assignee_name = ", ".join(names[i] for i in range(3)) + f" +{len(names) - 3}"
        else:
            assignee_name = ", ".join(names)

    completion_duration_hours = None
    if getattr(task, "assigned_at", None) is not None and getattr(task, "completed_at", None) is not None:
        try:
            completion_duration_hours = round((task.completed_at - task.assigned_at).total_seconds() / 3600, 2)
        except Exception:
            completion_duration_hours = None

    detail = TaskDetail(
        id=int(task.id),
        company_id=int(company_id),
        title=task.title,
        description=task.description,
        status=_status_out(str(task.status)),
        progress=int(getattr(task, "progress", 0) or 0),
        priority=task.priority,
        due_date=task.due_at.date() if task.due_at else None,
        assignee_id=assignee_id_out,
        assignee_name=assignee_name,
        created_by_id=int(task.created_by),
        assigned_at=getattr(task, "assigned_at", None),
        completed_at=getattr(task, "completed_at", None),
        completion_duration_hours=completion_duration_hours,
        created_at=task.created_at,
        updated_at=task.updated_at,
        checklist_total=checklist_total,
        checklist_done=checklist_done,
        comments=comments_count,
        attachments=attachments_count,
        reactions=reactions_count,
        assignees=assignees_detail,
        customer_id=task.customer_id,
        department_id=task.department_id,
        project_id=task.project_id,
        task_head_id=task.task_head_id,
        forwarded_from_id=task.forwarded_from_id,
    )

    perms = TaskPermissions(
        can_assign=_is_admin(current_user) or int(task.created_by) == int(current_user.id),
        can_delete=_is_admin(current_user) or int(task.created_by) == int(current_user.id),
        can_update=(
            _is_admin(current_user)
            or int(task.created_by) == int(current_user.id)
            or _is_task_assignee(db=db, task=task, user=current_user)
        ),
        can_comment=True,
        can_upload=_is_admin(current_user) or int(task.created_by) == int(current_user.id),
    )

    # Interactions
    interaction_rows = (
        db.query(models.CustomerInteraction, models.Customer.name, models.Employee.full_name)
        .outerjoin(models.Customer, models.Customer.id == models.CustomerInteraction.customer_id)
        .outerjoin(models.Employee, models.Employee.id == models.CustomerInteraction.employee_id)
        .filter(models.CustomerInteraction.task_id == task.id)
        .order_by(models.CustomerInteraction.interaction_date.desc())
        .all()
    )
    interactions = [
        {
            "id": i.CustomerInteraction.id,
            "interaction_type": i.CustomerInteraction.interaction_type,
            "notes": i.CustomerInteraction.notes,
            "interaction_date": i.CustomerInteraction.interaction_date.isoformat() if i.CustomerInteraction.interaction_date else None,
            "customer_name": i.name,
            "employee_name": i.full_name,
            "task_id": i.CustomerInteraction.task_id
        }
        for i in interaction_rows
    ]

    return TaskDetailResponse(
        task=detail,
        checklist=checklist,
        attachments=attachments,
        comments=comments,
        reactions=task_reactions,
        permissions=perms,
        interactions=interactions
    )

@router.patch("/{task_id}", response_model=TaskSummary)
async def patch_task(
    company_id: int,
    task_id: int,
    payload: TaskPatchRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    is_privileged_editor = _is_admin(current_user) or int(task.created_by) == int(current_user.id)
    is_assignee = _is_task_assignee(db=db, task=task, user=current_user)

    data = payload.model_dump(exclude_unset=True)

    # Assignees may only update status/progress.
    if not is_privileged_editor:
        if not is_assignee:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")
        unexpected = {k for k in data.keys() if k not in {"status", "progress"}}
        if unexpected:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not enough permissions")

    if "progress" in data and data["progress"] is not None:
        try:
            p = int(data["progress"])
        except Exception:
            p = None
        if p is not None:
            if p < 0:
                p = 0
            if p > 100:
                p = 100
        task.progress = p

    if "status" in data and data["status"] is not None:
        raw_status = str(data["status"])
        try:
            new_status = _status_in(raw_status)
            task.status = new_status
            if new_status == "done" and getattr(task, "completed_at", None) is None:
                task.completed_at = datetime.now(timezone.utc)
        except HTTPException as e:
            if int(getattr(e, "status_code", 400) or 400) != 400:
                raise
            # Ignore invalid status updates from clients; keep current status.

    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()

    db.refresh(task)
    return _task_summary_dto(db=db, tenant_id=tenant_id, company_id=company_id, task=task, include_assignees=True)

@router.patch("/{task_id}/assign", response_model=TaskSummary)
async def assign_task(
    company_id: int,
    task_id: int,
    payload: TaskAssignRequestV2,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)

    require_task_permission(current_user, "task.assign")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)

    _ensure_can_assign_task(user=current_user, task=task)

    _validate_assignee_id(db=db, tenant_id=tenant_id, assignee_id=payload.assignee_id)

    had_any_assignees = (
        db.query(func.count(TaskAssignee.id))
        .filter(TaskAssignee.task_id == int(task.id))
        .scalar()
        or 0
    )

    db.query(TaskAssignee).filter(TaskAssignee.task_id == int(task.id)).delete(synchronize_session=False)

    new_ids: list[int] = []
    if payload.assignee_id is not None:
        new_ids = [int(payload.assignee_id)]
        db.add(TaskAssignee(task_id=int(task.id), user_id=int(payload.assignee_id)))

    if payload.assignee_id is not None and had_any_assignees == 0 and getattr(task, "assigned_at", None) is None:
        task.assigned_at = datetime.now(timezone.utc)

    _sync_legacy_assigned_to(task=task, assignee_ids=new_ids)
    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()

    db.refresh(task)
    return _task_summary_dto(db=db, tenant_id=tenant_id, company_id=company_id, task=task, include_assignees=True)


@router.get("/{task_id}/assignees", response_model=TaskAssigneesResponse)
def list_task_assignees(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    assignees = _task_assignees_detail(db=db, tenant_id=tenant_id, task_id=int(task.id))
    return TaskAssigneesResponse(assignees=assignees)


@router.post("/{task_id}/assignees", response_model=TaskAssigneesResponse)
def add_task_assignees(
    company_id: int,
    task_id: int,
    payload: TaskAssigneesAddRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.assign")
    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_assign_task(user=current_user, task=task)

    ids = [int(x) for x in (payload.user_ids or [])]
    ids = sorted({i for i in ids if i is not None})
    if not ids:
        assignees = _task_assignees_detail(db=db, tenant_id=tenant_id, task_id=int(task.id))
        return TaskAssigneesResponse(assignees=assignees)

    users = (
        db.query(models.User)
        .filter(
            models.User.id.in_(ids),
            models.User.tenant_id == int(tenant_id),
            models.User.is_active.is_(True),
        )
        .all()
    )
    found = {int(u.id) for u in users}
    missing = [i for i in ids if i not in found]
    if missing:
        raise HTTPException(status_code=400, detail="Invalid user_ids")

    had_any_assignees = (
        db.query(func.count(TaskAssignee.id))
        .filter(TaskAssignee.task_id == int(task.id))
        .scalar()
        or 0
    )

    existing = {
        int(r[0])
        for r in db.query(TaskAssignee.user_id)
        .filter(TaskAssignee.task_id == int(task.id), TaskAssignee.user_id.in_(ids))
        .all()
    }
    for uid in ids:
        if uid not in existing:
            db.add(TaskAssignee(task_id=int(task.id), user_id=int(uid), role=payload.role))

    all_ids = [
        int(r[0])
        for r in db.query(TaskAssignee.user_id)
        .filter(TaskAssignee.task_id == int(task.id))
        .all()
    ]

    if all_ids and had_any_assignees == 0 and getattr(task, "assigned_at", None) is None:
        task.assigned_at = datetime.utcnow()

    _sync_legacy_assigned_to(task=task, assignee_ids=all_ids)
    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()

    assignees = _task_assignees_detail(db=db, tenant_id=tenant_id, task_id=int(task.id))
    return TaskAssigneesResponse(assignees=assignees)


@router.patch("/{task_id}/assignees/{user_id}/role", response_model=TaskAssigneeDetail)
def update_task_assignee_role(
    company_id: int,
    task_id: int,
    user_id: int,
    payload: TaskAssigneeRoleUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.assign")
    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_assign_task(user=current_user, task=task)

    assignee = (
        db.query(TaskAssignee)
        .filter(TaskAssignee.task_id == int(task.id), TaskAssignee.user_id == int(user_id))
        .first()
    )
    if not assignee:
        raise HTTPException(status_code=404, detail="Assignee not found")

    assignee.role = payload.role
    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()
    db.refresh(assignee)

    return _task_assignees_detail(db=db, tenant_id=tenant_id, task_id=int(task.id))[0] # This is a bit hacky, but correctly fetches the user info with the new role


@router.delete("/{task_id}/assignees/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_task_assignee(
    company_id: int,
    task_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.assign")
    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_assign_task(user=current_user, task=task)

    db.query(TaskAssignee).filter(
        TaskAssignee.task_id == int(task.id),
        TaskAssignee.user_id == int(user_id),
    ).delete(synchronize_session=False)

    remaining = [
        int(r[0])
        for r in db.query(TaskAssignee.user_id)
        .filter(TaskAssignee.task_id == int(task.id))
        .all()
    ]
    _sync_legacy_assigned_to(task=task, assignee_ids=remaining)
    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()

    return

@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.delete")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    if not (_is_admin(current_user) or int(task.created_by) == int(current_user.id)):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    task.deleted_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()
    db.add(task)
    db.commit()
    return


@router.post("/{task_id}/checklist", response_model=ChecklistItem, status_code=201)
def create_checklist_item(
    company_id: int,
    task_id: int,
    payload: ChecklistItemCreateV2,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.update")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)
    _ensure_can_update_task(user=current_user, task=task)

    item = TaskChecklistItem(
        tenant_id=tenant_id,
        task_id=task.id,
        content=payload.text,
        position=payload.sort_order,
        created_by=current_user.id,
    )
    db.add(item)
    db.commit()
    db.refresh(item)

    return ChecklistItem(
        id=int(item.id),
        task_id=int(task.id),
        text=item.content,
        is_done=bool(item.is_completed),
        sort_order=int(item.position),
        created_at=item.created_at,
    )


@router.patch("/{task_id}/checklist/{item_id}", response_model=ChecklistToggleResponse)
def toggle_checklist_item(
    company_id: int,
    task_id: int,
    item_id: int,
    payload: ChecklistItemToggleV2,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.update")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)
    _ensure_can_update_task(user=current_user, task=task)

    item = (
        db.query(TaskChecklistItem)
        .filter(
            TaskChecklistItem.tenant_id == tenant_id,
            TaskChecklistItem.task_id == task.id,
            TaskChecklistItem.id == item_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    item.is_completed = bool(payload.is_done)
    item.updated_at = datetime.utcnow()
    db.add(item)
    db.commit()
    db.refresh(item)

    checklist_total, checklist_done, _, _, _ = _task_counts(db=db, tenant_id=tenant_id, task_id=int(task.id))
    return ChecklistToggleResponse(
        item=ChecklistItem(
            id=int(item.id),
            task_id=int(task.id),
            text=item.content,
            is_done=bool(item.is_completed),
            sort_order=int(item.position),
            created_at=item.created_at,
        ),
        checklist_done=int(checklist_done),
        checklist_total=int(checklist_total),
    )


@router.delete("/{task_id}/checklist/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_checklist_item(
    company_id: int,
    task_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.update")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)
    _ensure_can_update_task(user=current_user, task=task)

    item = (
        db.query(TaskChecklistItem)
        .filter(
            TaskChecklistItem.tenant_id == tenant_id,
            TaskChecklistItem.task_id == task.id,
            TaskChecklistItem.id == item_id,
        )
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    db.delete(item)
    db.commit()
    return


@router.post("/{task_id}/comments", response_model=CommentCreateResponse, status_code=201)
def create_comment(
    company_id: int,
    task_id: int,
    payload: CommentCreateRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    comment = TaskComment(
        tenant_id=tenant_id,
        task_id=task.id,
        author_id=current_user.id,
        content=payload.body,
    )
    db.add(comment)

    _notify_task_interaction(db=db, company_id=company_id, notif_type="TASK_COMMENT_CREATED", task_id=int(task.id))

    db.commit()
    db.refresh(comment)

    return CommentCreateResponse(
        comment=Comment(
            id=int(comment.id),
            task_id=int(task.id),
            body=comment.content,
            author_id=int(comment.author_id),
            author_name=current_user.full_name,
            created_at=comment.created_at,
        ),
        reactions=[],
    )

@router.post("/{task_id}/attachments", response_model=AttachmentCreateResponse, status_code=201)
def upload_attachment(
    company_id: int,
    task_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.attach")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    if not (_is_admin(current_user) or int(task.created_by) == int(current_user.id)):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    dest_dir = task_upload_dir(tenant_id=tenant_id, task_id=int(task.id))

    data = file.file.read()
    size_bytes = len(data)
    validate_upload(content_type=file.content_type, size_bytes=size_bytes)

    stored_filename = generate_stored_filename(file.filename or "file")
    dest_path = dest_dir / stored_filename
    dest_path.write_bytes(data)

    att = TaskAttachment(
        tenant_id=tenant_id,
        task_id=task.id,
        uploaded_by=current_user.id,
        original_filename=file.filename or stored_filename,
        stored_filename=stored_filename,
        content_type=file.content_type,
        size_bytes=size_bytes,
        storage_path=str(dest_path),
    )
    db.add(att)
    db.commit()
    db.refresh(att)

    return AttachmentCreateResponse(
        attachment=Attachment(
            id=int(att.id),
            task_id=int(task.id),
            file_url=f"/companies/{company_id}/tasks/{task_id}/attachments/{int(att.id)}/download",
            file_name=att.original_filename,
            mime_type=att.content_type,
            size=int(att.size_bytes),
            uploaded_by_id=int(att.uploaded_by),
            created_at=att.created_at,
        )
    )

@router.delete("/{task_id}/attachments/{attachment_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_attachment(
    company_id: int,
    task_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.attach")

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    if not (_is_admin(current_user) or int(task.created_by) == int(current_user.id)):
        raise HTTPException(status_code=403, detail="Not enough permissions")

    attachment = (
        db.query(TaskAttachment)
        .filter(
            TaskAttachment.tenant_id == tenant_id,
            TaskAttachment.task_id == task.id,
            TaskAttachment.id == attachment_id,
            TaskAttachment.deleted_at.is_(None),
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    attachment.deleted_at = datetime.utcnow()
    db.add(attachment)
    db.commit()
    return


@router.post("/{task_id}/watch", status_code=201, response_model=TaskWatcherRead)
def watch_task(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.view")

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    existing = (
        db.query(TaskWatcher)
        .filter(TaskWatcher.tenant_id == tenant_id, TaskWatcher.task_id == task.id, TaskWatcher.user_id == current_user.id)
        .first()
    )
    if existing:
        return TaskWatcherRead.model_validate(existing)

    watcher = TaskWatcher(tenant_id=tenant_id, task_id=task.id, user_id=current_user.id)
    db.add(watcher)
    db.commit()
    db.refresh(watcher)
    return TaskWatcherRead.model_validate(watcher)


@router.delete("/{task_id}/watch", status_code=204)
def unwatch_task(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.view")

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    db.query(TaskWatcher).filter(
        TaskWatcher.tenant_id == tenant_id,
        TaskWatcher.task_id == task.id,
        TaskWatcher.user_id == current_user.id,
    ).delete()
    db.commit()
    return


@router.get("/{task_id}/watchers", response_model=list[TaskWatcherRead])
def list_watchers(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.view")

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    watchers = (
        db.query(TaskWatcher)
        .filter(TaskWatcher.tenant_id == tenant_id, TaskWatcher.task_id == task.id)
        .order_by(TaskWatcher.created_at.asc())
        .all()
    )
    return [TaskWatcherRead.model_validate(w) for w in watchers]


# -------------------- Labels --------------------


@router.post("/labels", response_model=TaskLabelRead, status_code=201)
def create_label(
    company_id: int,
    payload: TaskLabelCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.update")

    label = TaskLabel(tenant_id=tenant_id, name=payload.name.strip(), color=payload.color)
    db.add(label)
    db.commit()
    db.refresh(label)
    return TaskLabelRead.model_validate(label)


@router.get("/labels", response_model=list[TaskLabelRead])
def list_labels(
    company_id: int,
    q: str | None = Query(None, description="Search labels by name"),
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.view")

    query = db.query(TaskLabel).filter(TaskLabel.tenant_id == tenant_id)
    if q:
        like = f"%{q}%"
        query = query.filter(TaskLabel.name.ilike(like))

    labels = query.order_by(TaskLabel.name.asc()).offset(skip).limit(limit).all()
    return [TaskLabelRead.model_validate(l) for l in labels]


@router.put("/labels/{label_id}", response_model=TaskLabelRead)
def update_label(
    company_id: int,
    label_id: int,
    payload: TaskLabelUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.update")

    label = db.query(TaskLabel).filter(TaskLabel.tenant_id == tenant_id, TaskLabel.id == label_id).first()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    data = payload.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(label, k, v)

    db.add(label)
    db.commit()
    db.refresh(label)
    return TaskLabelRead.model_validate(label)


@router.delete("/labels/{label_id}", status_code=204)
def delete_label(
    company_id: int,
    label_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)
    require_task_permission(current_user, "task.update")

    label = db.query(TaskLabel).filter(TaskLabel.tenant_id == tenant_id, TaskLabel.id == label_id).first()
    if not label:
        raise HTTPException(status_code=404, detail="Label not found")

    db.query(TaskTaskLabel).filter(TaskTaskLabel.tenant_id == tenant_id, TaskTaskLabel.label_id == label.id).delete()
    db.delete(label)
    db.commit()
    return


@router.get("/{task_id}/attachments", response_model=list[TaskAttachmentRead])
def list_attachments(
    company_id: int,
    task_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    attachments = (
        db.query(TaskAttachment)
        .filter(
            TaskAttachment.tenant_id == tenant_id,
            TaskAttachment.task_id == task.id,
            TaskAttachment.deleted_at.is_(None),
        )
        .order_by(TaskAttachment.created_at.desc())
        .all()
    )
    return [TaskAttachmentRead.model_validate(a) for a in attachments]


@router.get("/{task_id}/attachments/{attachment_id}/download")
def download_attachment(
    company_id: int,
    task_id: int,
    attachment_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    attachment = (
        db.query(TaskAttachment)
        .filter(
            TaskAttachment.tenant_id == tenant_id,
            TaskAttachment.task_id == task.id,
            TaskAttachment.id == attachment_id,
            TaskAttachment.deleted_at.is_(None),
        )
        .first()
    )
    if not attachment:
        raise HTTPException(status_code=404, detail="Attachment not found")

    base = get_uploads_base_dir()
    file_path = Path(attachment.storage_path)
    ensure_path_within_base(file_path, base)

    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="File not found")

    return FileResponse(
        path=str(file_path),
        filename=attachment.original_filename,
        media_type=attachment.content_type or "application/octet-stream",
    )


# -------------------- Reactions --------------------


@router.post("/{task_id}/reactions/toggle", response_model=ReactionListResponse)
def toggle_task_reaction(
    company_id: int,
    task_id: int,
    payload: ReactionToggleRequestV2,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    existing = (
        db.query(TaskReaction)
        .filter(
            TaskReaction.tenant_id == tenant_id,
            TaskReaction.user_id == current_user.id,
            TaskReaction.target_type == TaskReactionTargetType.task.value,
            TaskReaction.target_id == task.id,
            TaskReaction.emoji == payload.emoji,
        )
        .first()
    )

    if existing:
        db.delete(existing)
        db.commit()
    else:
        db.add(
            TaskReaction(
                tenant_id=tenant_id,
                user_id=current_user.id,
                target_type=TaskReactionTargetType.task.value,
                target_id=task.id,
                emoji=payload.emoji,
            )
        )

        _notify_task_interaction(db=db, company_id=company_id, notif_type="TASK_REACTION_ADDED", task_id=int(task.id))
        db.commit()

    reactions = _reaction_list(
        db=db,
        tenant_id=tenant_id,
        target_type=TaskReactionTargetType.task.value,
        target_id=int(task.id),
        current_user_id=int(current_user.id),
    )
    return ReactionListResponse(reactions=reactions)


@router.post("/{task_id}/comments/{comment_id}/reactions/toggle", response_model=ReactionListResponse)
def toggle_comment_reaction(
    company_id: int,
    task_id: int,
    comment_id: int,
    payload: ReactionToggleRequestV2,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    tenant_id = ensure_same_tenant(current_user)

    _get_company_with_access(db, company_id, current_user)

    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_view_task(db=db, user=current_user, tenant_id=tenant_id, task=task)

    comment = (
        db.query(TaskComment)
        .filter(
            TaskComment.tenant_id == tenant_id,
            TaskComment.task_id == task.id,
            TaskComment.id == comment_id,
            TaskComment.deleted_at.is_(None),
        )
        .first()
    )
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    existing = (
        db.query(TaskReaction)
        .filter(
            TaskReaction.tenant_id == tenant_id,
            TaskReaction.user_id == current_user.id,
            TaskReaction.target_type == TaskReactionTargetType.comment.value,
            TaskReaction.target_id == comment.id,
            TaskReaction.emoji == payload.emoji,
        )
        .first()
    )

    if existing:
        db.delete(existing)
        db.commit()
    else:
        db.add(
            TaskReaction(
                tenant_id=tenant_id,
                user_id=current_user.id,
                target_type=TaskReactionTargetType.comment.value,
                target_id=comment.id,
                emoji=payload.emoji,
            )
        )
        _notify_task_interaction(
            db=db,
            company_id=company_id,
            notif_type="TASK_COMMENT_REACTION_ADDED",
            task_id=int(task.id),
        )
        db.commit()


# -------- Task Handover & Forwarding --------


@router.post("/{task_id}/forward", response_model=TaskSummary)
def forward_task(
    company_id: int,
    task_id: int,
    payload: TaskAssignRequestV2,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    company = _get_company_with_access(db, company_id, current_user)
    tenant_id = ensure_same_tenant(current_user, company)
    
    task = _load_task_or_404(db=db, tenant_id=tenant_id, company_id=company_id, task_id=task_id)
    _ensure_can_assign_task(user=current_user, task=task)
    
    if not payload.assignee_id:
        raise HTTPException(status_code=400, detail="assignee_id is required")
        
    _validate_assignee_id(db=db, tenant_id=tenant_id, assignee_id=payload.assignee_id)
    
    # Store forwarding info
    task.forwarded_from_id = int(current_user.id)
    task.assigned_to = payload.assignee_id
    task.assigned_at = datetime.now(timezone.utc)
    task.updated_at = datetime.utcnow()
    
    # Add to assignees table
    existing_assignee = (
        db.query(TaskAssignee)
        .filter(TaskAssignee.task_id == task.id, TaskAssignee.user_id == payload.assignee_id)
        .first()
    )
    if not existing_assignee:
        db.add(TaskAssignee(task_id=int(task.id), user_id=int(payload.assignee_id)))
        
    # Add comment about forwarding
    db.add(
        TaskComment(
            tenant_id=tenant_id,
            task_id=task.id,
            author_id=current_user.id,
            content=f"Task forwarded to user {payload.assignee_id}",
        )
    )
    
    db.commit()
    db.refresh(task)
    return _task_summary_dto(db=db, tenant_id=tenant_id, company_id=company_id, task=task, include_assignees=True)


