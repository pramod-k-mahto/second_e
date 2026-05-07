from __future__ import annotations
from datetime import datetime
import enum
from typing import Optional, TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    BigInteger,
    String,
    Text,
    UniqueConstraint,
    Index,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

if TYPE_CHECKING:
    from .models import Customer, Department, Project, User


class TaskStatus(str, enum.Enum):
    open = "open"
    in_progress = "in_progress"
    blocked = "blocked"
    done = "done"
    canceled = "canceled"


class CollaboratorRole(str, enum.Enum):
    OBSERVER = "OBSERVER"
    CONTRIBUTOR = "CONTRIBUTOR"
    EXECUTOR = "EXECUTOR"
    APPROVER = "APPROVER"


class TaskReactionTargetType(str, enum.Enum):
    task = "task"
    comment = "comment"


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(50), nullable=False, default=TaskStatus.open.value)
    progress: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    priority: Mapped[str | None] = mapped_column(String(50), nullable=True)
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    assigned_to: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    # Handover & Performance additions
    customer_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("customers.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("projects.id"), nullable=True)
    task_head_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("task_heads.id"), nullable=True)
    
    # Forwarding
    forwarded_from_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)

    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    customer: Mapped[Optional["Customer"]] = relationship("Customer", foreign_keys=[customer_id])
    department: Mapped[Optional["Department"]] = relationship("Department", foreign_keys=[department_id])
    project: Mapped[Optional["Project"]] = relationship("Project", foreign_keys=[project_id])
    task_head: Mapped[Optional["TaskHead"]] = relationship("TaskHead", foreign_keys=[task_head_id])
    forwarded_from: Mapped[Optional["User"]] = relationship("User", foreign_keys=[forwarded_from_id])

    checklist_items: Mapped[list[TaskChecklistItem]] = relationship(
        "TaskChecklistItem",
        back_populates="task",
        cascade="all, delete-orphan",
    )

    comments: Mapped[list[TaskComment]] = relationship(
        "TaskComment",
        back_populates="task",
        cascade="all, delete-orphan",
    )

    attachments: Mapped[list[TaskAttachment]] = relationship(
        "TaskAttachment",
        back_populates="task",
        cascade="all, delete-orphan",
    )

    assignees: Mapped[list[TaskAssignee]] = relationship(
        "TaskAssignee",
        back_populates="task",
        cascade="all, delete-orphan",
    )


class TaskAssignee(Base):
    __tablename__ = "task_assignees"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role: Mapped[CollaboratorRole] = mapped_column(
        String(50),
        nullable=False,
        default=CollaboratorRole.EXECUTOR.value,
        server_default=CollaboratorRole.EXECUTOR.value,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    task: Mapped[Task] = relationship("Task", back_populates="assignees")

    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignees_task_user"),
        Index("ix_task_assignees_task_id", "task_id"),
        Index("ix_task_assignees_user_id", "user_id"),
    )


class TaskChecklistItem(Base):
    __tablename__ = "task_checklist_items"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    task: Mapped[Task] = relationship("Task", back_populates="checklist_items")

    __table_args__ = (
        Index("ix_task_checklist_items_tenant_task", "tenant_id", "task_id"),
    )


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task: Mapped[Task] = relationship("Task", back_populates="comments")

    __table_args__ = (
        Index("ix_task_comments_tenant_task", "tenant_id", "task_id"),
    )


class TaskAttachment(Base):
    __tablename__ = "task_attachments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    uploaded_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    original_filename: Mapped[str] = mapped_column(Text, nullable=False)
    stored_filename: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_path: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    task: Mapped[Task] = relationship("Task", back_populates="attachments")

    __table_args__ = (
        Index("ix_task_attachments_tenant_task", "tenant_id", "task_id"),
    )


class TaskWatcher(Base):
    __tablename__ = "task_watchers"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "task_id", "user_id", name="uq_task_watchers_tenant_task_user"),
        Index("ix_task_watchers_tenant_user", "tenant_id", "user_id"),
    )


class TaskLabel(Base):
    __tablename__ = "task_labels"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    color: Mapped[str | None] = mapped_column(String(32), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "name", name="uq_task_labels_tenant_name"),
    )


class TaskTaskLabel(Base):
    __tablename__ = "task_task_labels"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    task_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("tasks.id"), nullable=False)
    label_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("task_labels.id"), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "task_id", "label_id", name="uq_task_task_labels_tenant_task_label"),
        Index("ix_task_task_labels_tenant_task", "tenant_id", "task_id"),
        Index("ix_task_task_labels_tenant_label", "tenant_id", "label_id"),
    )


class TaskReaction(Base):
    __tablename__ = "task_reactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)

    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_id: Mapped[int] = mapped_column(BigInteger, nullable=False)

    emoji: Mapped[str] = mapped_column(String(32), nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("tenant_id", "user_id", "target_type", "target_id", "emoji", name="uq_task_reactions_toggle"),
        Index("ix_task_reactions_tenant_target", "tenant_id", "target_type", "target_id"),
    )


class TaskHead(Base):
    __tablename__ = "task_heads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    tenant_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)
    company_id: Mapped[int] = mapped_column(Integer, index=True, nullable=False)

    name: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_task_heads_company_name"),
    )
