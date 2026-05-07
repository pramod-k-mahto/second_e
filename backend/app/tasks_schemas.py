from __future__ import annotations

from datetime import date
from datetime import datetime
import enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator


class TaskUserInfo(BaseModel):
    id: int
    email: str
    full_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CollaboratorRole(str, enum.Enum):
    OBSERVER = "OBSERVER"
    CONTRIBUTOR = "CONTRIBUTOR"
    EXECUTOR = "EXECUTOR"
    APPROVER = "APPROVER"


class TaskAssigneeSummary(BaseModel):
    id: int
    name: str | None = None
    email: str
    role: str | None = None


class TaskAssigneeDetail(BaseModel):
    id: int
    name: str | None = None
    email: str
    active: bool
    is_tenant_admin: bool
    role: str | None = None


class TaskChecklistProgress(BaseModel):
    total: int
    completed: int


class TaskReactionSummaryItem(BaseModel):
    emoji: str
    count: int


class TaskBase(BaseModel):
    title: str = Field(min_length=1)
    description: str | None = None
    priority: str | None = None
    due_at: datetime | None = None


class TaskCreate(TaskBase):
    assigned_to: int | None = None
    label_ids: list[int] | None = None
    customer_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    task_head_id: int | None = None


class TaskUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    priority: str | None = None
    due_at: datetime | None = None
    assigned_to: int | None = None
    label_ids: list[int] | None = None
    customer_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    task_head_id: int | None = None


class TaskStatusUpdate(BaseModel):
    status: str = Field(min_length=1)


class TaskAssignRequest(BaseModel):
    assigned_to: Optional[int] = None


class TaskRead(BaseModel):
    id: int
    tenant_id: int
    company_id: int | None = None
    title: str
    description: str | None
    status: str
    progress: int | None = None
    priority: str | None
    due_at: datetime | None

    created_by: int
    assigned_to: int | None

    created_at: datetime
    updated_at: datetime

    assigned_user: TaskUserInfo | None = None

    checklist_progress: TaskChecklistProgress
    reaction_summary: list[TaskReactionSummaryItem]
    attachments_count: int

    label_ids: list[int]
    is_watching: bool

    customer_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    task_head_id: int | None = None
    forwarded_from_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class TaskListResponse(BaseModel):
    items: list[TaskRead]
    total: int
    skip: int
    limit: int


class TaskStatus(str):
    pass


class TaskPriority(str):
    pass


class TaskSummary(BaseModel):
    id: int
    company_id: int
    title: str
    description: str | None = None
    status: str
    progress: int
    priority: str | None = None
    due_date: date | None = None
    assignee_id: int | None = None
    assignee_name: str | None = None
    created_by_id: int
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
    completion_duration_hours: float | None = None
    created_at: datetime
    updated_at: datetime
    checklist_total: int
    checklist_done: int
    comments: int
    attachments: int
    reactions: int

    customer_id: int | None = None
    customer_name: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    task_head_id: int | None = None
    task_head_name: str | None = None
    forwarded_from_id: int | None = None
    forwarded_from_name: str | None = None

    assignees: list[TaskAssigneeSummary] | None = None


class TaskHeadBase(BaseModel):
    name: str = Field(min_length=1)
    description: str | None = None


class TaskHeadCreate(TaskHeadBase):
    pass


class TaskHeadUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class TaskHeadRead(TaskHeadBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskListResponseV2(BaseModel):
    results: list[TaskSummary]
    total: int
    skip: int
    limit: int


class ChecklistItem(BaseModel):
    id: int
    task_id: int
    text: str
    is_done: bool
    sort_order: int
    created_at: datetime


class ChecklistItemCreateV2(BaseModel):
    text: str = Field(min_length=1)
    sort_order: int = 0


class ChecklistItemToggleV2(BaseModel):
    is_done: bool


class ChecklistToggleResponse(BaseModel):
    item: ChecklistItem
    checklist_done: int
    checklist_total: int


class Attachment(BaseModel):
    id: int
    task_id: int
    file_url: str
    file_name: str
    mime_type: str | None = None
    size: int
    uploaded_by_id: int
    created_at: datetime


class AttachmentCreateResponse(BaseModel):
    attachment: Attachment


class Comment(BaseModel):
    id: int
    task_id: int
    body: str
    author_id: int
    author_name: str | None = None
    created_at: datetime


class CommentCreateRequest(BaseModel):
    body: str = Field(min_length=1)


class Reaction(BaseModel):
    emoji: str
    count: int
    reacted_by_me: bool


class CommentWithReactions(BaseModel):
    comment: Comment
    reactions: list[Reaction]


class CommentCreateResponse(BaseModel):
    comment: Comment
    reactions: list[Reaction]


class ReactionToggleRequestV2(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


class ReactionListResponse(BaseModel):
    reactions: list[Reaction]


class TaskPermissions(BaseModel):
    can_assign: bool
    can_delete: bool
    can_update: bool
    can_comment: bool
    can_upload: bool


class TaskDetail(BaseModel):
    id: int
    company_id: int
    title: str
    description: str | None = None
    status: str
    progress: int
    priority: str | None = None
    due_date: date | None = None
    assignee_id: int | None = None
    assignee_name: str | None = None
    created_by_id: int
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
    completion_duration_hours: float | None = None
    created_at: datetime
    updated_at: datetime
    checklist_total: int
    checklist_done: int
    comments: int
    attachments: int
    reactions: int

    customer_id: int | None = None
    customer_name: str | None = None
    department_id: int | None = None
    department_name: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    task_head_id: int | None = None
    task_head_name: str | None = None
    forwarded_from_id: int | None = None
    forwarded_from_name: str | None = None

    assignees: list[TaskAssigneeDetail] = []


class TaskDetailResponse(BaseModel):
    task: TaskDetail
    checklist: list[ChecklistItem]
    attachments: list[Attachment]
    comments: list[CommentWithReactions]
    reactions: list[Reaction]
    permissions: TaskPermissions
    interactions: list[dict] = []


class TaskPatchRequest(BaseModel):
    status: str | None = None
    progress: int | None = Field(default=None, ge=0, le=100)

    model_config = ConfigDict(extra="ignore")

    @field_validator("status", mode="before")
    @classmethod
    def _coerce_status(cls, v):
        if v is None:
            return None

        if isinstance(v, str):
            s = v.strip()
            return s or None

        if isinstance(v, dict):
            for key in ("value", "status", "key", "id", "label"):
                if key in v and v[key] is not None:
                    s = str(v[key]).strip()
                    return s or None
            return None

        return str(v).strip() or None

    @field_validator("progress", mode="before")
    @classmethod
    def _coerce_progress(cls, v):
        if v is None:
            return None
        if isinstance(v, bool):
            return None
        if isinstance(v, int):
            return v
        if isinstance(v, float):
            return int(v)
        if isinstance(v, str):
            s = v.strip()
            if s == "" or s.lower() in ("null", "none", "nan"):
                return None
            if s.endswith("%"):
                s = s[:-1].strip()
            try:
                return int(float(s))
            except Exception:
                return None
        return None


class TaskAssignRequestV2(BaseModel):
    assignee_id: int | None = None


class TaskAssigneesResponse(BaseModel):
    assignees: list[TaskAssigneeDetail]


class TaskAssigneesAddRequest(BaseModel):
    user_ids: list[int]
    role: str | None = "EXECUTOR"


class TaskAssigneeRoleUpdate(BaseModel):
    role: str


class ChecklistItemCreate(BaseModel):
    content: str = Field(min_length=1)
    position: int = 0


class ChecklistItemUpdate(BaseModel):
    content: str | None = None
    is_completed: bool | None = None
    position: int | None = None


class ChecklistItemRead(BaseModel):
    id: int
    tenant_id: int
    task_id: int
    content: str
    is_completed: bool
    position: int
    created_by: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskCommentCreate(BaseModel):
    content: str = Field(min_length=1)


class TaskCommentUpdate(BaseModel):
    content: str = Field(min_length=1)


class TaskCommentRead(BaseModel):
    id: int
    tenant_id: int
    task_id: int
    author_id: int
    content: str
    created_at: datetime
    updated_at: datetime

    reaction_summary: list[TaskReactionSummaryItem] = []

    model_config = ConfigDict(from_attributes=True)


class TaskAttachmentRead(BaseModel):
    id: int
    tenant_id: int
    task_id: int
    uploaded_by: int
    original_filename: str
    content_type: str | None
    size_bytes: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ReactionToggleRequest(BaseModel):
    emoji: str = Field(min_length=1, max_length=32)


class TaskLabelCreate(BaseModel):
    name: str = Field(min_length=1)
    color: str | None = None


class TaskLabelUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TaskLabelRead(BaseModel):
    id: int
    tenant_id: int
    name: str
    color: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskWatcherRead(BaseModel):
    id: int
    tenant_id: int
    task_id: int
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TaskPerformanceReportItem(BaseModel):
    employee_id: int
    employee_name: str
    role: str | None = None
    assigned_count: int
    completed_count: int
    completion_rate: float
    avg_completion_time_hours: float | None = None


class TaskPerformanceReportDetail(BaseModel):
    task_id: int
    title: str
    status: str
    assigned_at: datetime | None = None
    completed_at: datetime | None = None
    due_at: datetime | None = None
    priority: str | None = None
    employee_name: str | None = None
    role: str | None = None


class TaskPerformanceReport(BaseModel):
    summary: list[TaskPerformanceReportItem]
    details: list[TaskPerformanceReportDetail] | None = None
    period: str
    start_date: date
    end_date: date
