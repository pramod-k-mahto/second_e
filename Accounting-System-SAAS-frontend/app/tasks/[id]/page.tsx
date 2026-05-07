"use client";

import * as React from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api, getCurrentCompany } from "@/lib/api";
import {
  apiErrorMessage,
  assignTask,
  createChecklistItem,
  createComment,
  deleteTask,
  deleteAttachment,
  deleteChecklistItem,
  getTaskDetail,
  patchTask,
  toggleChecklistItem,
  toggleCommentReaction,
  toggleTaskReaction,
  uploadAttachment,
} from "@/lib/tasksApi";
import type {
  Attachment,
  ChecklistItem,
  Reaction,
  TaskDetailResponse,
  TaskStatus,
} from "@/types/task";
import { TaskDetailHeader } from "@/components/tasks/TaskDetailHeader";
import { Checklist } from "@/components/tasks/Checklist";
import {
  AttachmentDropzone,
  makeUploadingAttachment,
} from "@/components/tasks/AttachmentDropzone";
import {
  CommentTimeline,
  makePendingComment,
} from "@/components/tasks/CommentTimeline";
import { ReactionsBar } from "@/components/tasks/ReactionsBar";
import { TaskDetailSkeleton } from "@/components/tasks/TaskSkeletons";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Select } from "@/components/ui/Select";

type TenantUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function optimisticToggle(reactions: Reaction[], emoji: string): Reaction[] {
  const next = [...(reactions || [])];
  const idx = next.findIndex((r) => r.emoji === emoji);
  if (idx === -1) {
    next.push({ emoji, count: 1, reacted_by_me: true });
    return next;
  }
  const r = next[idx];
  const reacted = !r.reacted_by_me;
  const count = Math.max(0, r.count + (reacted ? 1 : -1));
  if (count === 0) {
    next.splice(idx, 1);
    return next;
  }
  next[idx] = { ...r, count, reacted_by_me: reacted };
  return next;
}

export default function TaskDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();

  const taskId = Number(params.id);
  const [companyId, setCompanyId] = React.useState<number | null>(null);

  React.useEffect(() => {
    const cc = getCurrentCompany();
    setCompanyId(cc?.id ?? null);
  }, []);

  const swrKey = companyId && taskId ? ["task", companyId, taskId] : null;

  const { data, error, isLoading, mutate } = useSWR<TaskDetailResponse>(
    swrKey,
    async () => {
      if (!companyId) throw new Error("No company selected");
      return getTaskDetail(companyId, taskId);
    },
    {
      revalidateOnFocus: false,
    }
  );

  const { data: tenantUsers } = useSWR<TenantUser[]>("/tenants/self/users", fetcher);
  const activeUsers = React.useMemo(
    () => (tenantUsers || []).filter((u) => u.active),
    [tenantUsers]
  );

  const [checklistBusy, setChecklistBusy] = React.useState<Set<number>>(new Set());
  const [deletingChecklistBusy, setDeletingChecklistBusy] = React.useState<Set<number>>(new Set());

  const [uploading, setUploading] = React.useState<
    { id: string; file: File; previewUrl: string | null }[]
  >([]);
  const [deletingAttachmentIds, setDeletingAttachmentIds] = React.useState<Set<number>>(new Set());

  const [pendingComments, setPendingComments] = React.useState<
    { id: string; body: string; created_at: string }[]
  >([]);

  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);
  const [deletingTask, setDeletingTask] = React.useState(false);

  const notFound = (error as any)?.response?.status === 404;

  if (!companyId) {
    return (
      <div className="p-6">
        <div className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="text-sm font-semibold">Company not selected</div>
          <div className="mt-1 text-sm">Please open a company first.</div>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <TaskDetailSkeleton />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="p-6">
        <div className="max-w-2xl rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-5">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Task not found</div>
          <div className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            This task may have been deleted or you may not be assigned to it.
          </div>
          <div className="mt-4">
            <Button type="button" variant="outline" onClick={() => router.push("/tasks")}
            >
              Back to tasks
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-critical-500/30 bg-critical-500/5 p-4 text-sm text-critical-600">
          Failed to load task.
        </div>
      </div>
    );
  }

  const canUpdate = !!data.permissions?.can_update;
  const canUpload = !!data.permissions?.can_upload;
  const canComment = !!data.permissions?.can_comment;
  const canDelete = !!data.permissions?.can_delete;

  const setTask = (patch: Partial<TaskDetailResponse["task"]>) => {
    mutate({ ...data, task: { ...data.task, ...patch } }, { revalidate: false });
  };

  const handleAssign = async (nextAssigneeId: number | null) => {
    if (!canUpdate) return;
    const prev = data.task;
    setTask({
      assignee_id: nextAssigneeId,
      assignee_name:
        nextAssigneeId == null
          ? null
          : activeUsers.find((u) => u.id === nextAssigneeId)?.name || prev.assignee_name,
    });
    try {
      const updated = await assignTask(companyId, taskId, nextAssigneeId);
      setTask(updated);
    } catch (err) {
      setTask({ assignee_id: prev.assignee_id ?? null, assignee_name: prev.assignee_name ?? null });
      showToast({
        variant: "error",
        title: "Failed to assign task",
        description: apiErrorMessage(err, "Could not assign task."),
      });
    }
  };

  const handleStatus = async (next: TaskStatus) => {
    if (!canUpdate) return;
    const prev = data.task.status;
    setTask({ status: next });
    try {
      const updated = await patchTask(companyId, taskId, { status: next });
      setTask(updated);
    } catch (err) {
      setTask({ status: prev });
      showToast({
        variant: "error",
        title: "Failed to update status",
        description: apiErrorMessage(err, "Could not update status."),
      });
    }
  };

  const handleProgress = async (next: number) => {
    if (!canUpdate) return;
    const prev = data.task.progress;
    setTask({ progress: next });
    try {
      const updated = await patchTask(companyId, taskId, { progress: next });
      setTask(updated);
    } catch (err) {
      setTask({ progress: prev });
      showToast({
        variant: "error",
        title: "Failed to update progress",
        description: apiErrorMessage(err, "Could not update progress."),
      });
    }
  };

  const handleToggleChecklist = async (item: ChecklistItem, nextDone: boolean) => {
    if (!canUpdate) return;

    const prevData = data;
    setChecklistBusy((s) => new Set([...s, item.id]));

    mutate(
      {
        ...data,
        checklist: data.checklist.map((it) => (it.id === item.id ? { ...it, is_done: nextDone } : it)),
      },
      { revalidate: false }
    );

    try {
      const res = await toggleChecklistItem(companyId, taskId, item.id, nextDone);
      mutate(
        {
          ...data,
          checklist: data.checklist.map((it) => (it.id === item.id ? res.item : it)),
          task: {
            ...data.task,
            checklist_done: res.checklist_done,
            checklist_total: res.checklist_total,
          },
        },
        { revalidate: false }
      );
    } catch (err) {
      mutate(prevData, { revalidate: false });
      showToast({
        variant: "error",
        title: "Failed to update checklist",
        description: apiErrorMessage(err, "Could not update checklist."),
      });
    } finally {
      setChecklistBusy((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  const handleAddChecklist = async (text: string) => {
    if (!canUpdate) return;

    const prevData = data;
    const maxOrder = Math.max(0, ...data.checklist.map((i) => i.sort_order || 0));
    const tempId = -Math.floor(Math.random() * 1_000_000);
    const optimistic: ChecklistItem = {
      id: tempId,
      task_id: taskId,
      text,
      is_done: false,
      sort_order: maxOrder + 1,
      created_at: new Date().toISOString(),
    };

    mutate(
      {
        ...data,
        checklist: [...data.checklist, optimistic],
        task: {
          ...data.task,
          checklist_total: data.task.checklist_total + 1,
        },
      },
      { revalidate: false }
    );

    try {
      const created = await createChecklistItem(companyId, taskId, {
        text,
        sort_order: optimistic.sort_order,
      });
      mutate(
        {
          ...data,
          checklist: [...data.checklist.filter((i) => i.id !== tempId), created],
        },
        { revalidate: false }
      );
    } catch (err) {
      mutate(prevData, { revalidate: false });
      showToast({
        variant: "error",
        title: "Failed to add item",
        description: apiErrorMessage(err, "Could not add checklist item."),
      });
    }
  };

  const handleDeleteChecklist = async (item: ChecklistItem) => {
    if (!canUpdate) return;
    if (item.id < 0) return;

    const prevData = data;
    setDeletingChecklistBusy((s) => new Set([...s, item.id]));

    mutate(
      {
        ...data,
        checklist: data.checklist.filter((i) => i.id !== item.id),
        task: {
          ...data.task,
          checklist_total: Math.max(0, data.task.checklist_total - 1),
          checklist_done: item.is_done ? Math.max(0, data.task.checklist_done - 1) : data.task.checklist_done,
        },
      },
      { revalidate: false }
    );

    try {
      await deleteChecklistItem(companyId, taskId, item.id);
    } catch (err) {
      mutate(prevData, { revalidate: false });
      showToast({
        variant: "error",
        title: "Failed to delete item",
        description: apiErrorMessage(err, "Could not delete checklist item."),
      });
    } finally {
      setDeletingChecklistBusy((s) => {
        const n = new Set(s);
        n.delete(item.id);
        return n;
      });
    }
  };

  const handleUpload = async (files: File[]) => {
    if (!canUpload) return;

    const created = files.map(makeUploadingAttachment);
    setUploading((u) => [...u, ...created]);

    for (const u of created) {
      try {
        const attachment = await uploadAttachment(companyId, taskId, u.file);
        mutate(
          {
            ...data,
            attachments: [attachment, ...data.attachments],
            task: {
              ...data.task,
              attachments: data.task.attachments + 1,
            },
          },
          { revalidate: false }
        );
      } catch (err) {
        showToast({
          variant: "error",
          title: "Upload failed",
          description: apiErrorMessage(err, `Failed to upload ${u.file.name}`),
        });
      } finally {
        setUploading((prev) => {
          const next = prev.filter((x) => x.id !== u.id);
          return next;
        });
        if (u.previewUrl) {
          try {
            URL.revokeObjectURL(u.previewUrl);
          } catch {
            // ignore
          }
        }
      }
    }
  };

  const handleDeleteAttachment = async (a: Attachment) => {
    if (!canUpload) return;

    const prevData = data;
    setDeletingAttachmentIds((s) => new Set([...s, a.id]));

    mutate(
      {
        ...data,
        attachments: data.attachments.filter((x) => x.id !== a.id),
        task: {
          ...data.task,
          attachments: Math.max(0, data.task.attachments - 1),
        },
      },
      { revalidate: false }
    );

    try {
      await deleteAttachment(companyId, taskId, a.id);
    } catch (err) {
      mutate(prevData, { revalidate: false });
      showToast({
        variant: "error",
        title: "Failed to delete attachment",
        description: apiErrorMessage(err, "Could not delete attachment."),
      });
    } finally {
      setDeletingAttachmentIds((s) => {
        const n = new Set(s);
        n.delete(a.id);
        return n;
      });
    }
  };

  const handleAddComment = async (body: string) => {
    if (!canComment) return;

    const pending = makePendingComment(body);
    setPendingComments((p) => [pending, ...p]);

    try {
      const res = await createComment(companyId, taskId, { body });
      mutate(
        {
          ...data,
          comments: [{ comment: res.comment, reactions: res.reactions }, ...data.comments],
          task: {
            ...data.task,
            comments: data.task.comments + 1,
          },
        },
        { revalidate: false }
      );
    } catch (err) {
      showToast({
        variant: "error",
        title: "Failed to add comment",
        description: apiErrorMessage(err, "Could not add comment."),
      });
    } finally {
      setPendingComments((p) => p.filter((x) => x.id !== pending.id));
    }
  };

  const handleToggleTaskReaction = async (emoji: string) => {
    if (!canComment && !canUpdate) return;

    const prev = data.reactions;
    mutate({ ...data, reactions: optimisticToggle(data.reactions, emoji) }, { revalidate: false });

    try {
      const reactions = await toggleTaskReaction(companyId, taskId, emoji);
      mutate({ ...data, reactions }, { revalidate: false });
    } catch (err) {
      mutate({ ...data, reactions: prev }, { revalidate: false });
      showToast({
        variant: "error",
        title: "Reaction failed",
        description: apiErrorMessage(err, "Could not update reaction."),
      });
    }
  };

  const handleToggleCommentReaction = async (commentId: number, emoji: string) => {
    if (!canComment) return;

    const prevData = data;
    mutate(
      {
        ...data,
        comments: data.comments.map((c) =>
          c.comment.id === commentId
            ? { ...c, reactions: optimisticToggle(c.reactions, emoji) }
            : c
        ),
      },
      { revalidate: false }
    );

    try {
      const reactions = await toggleCommentReaction(companyId, taskId, commentId, emoji);
      mutate(
        {
          ...data,
          comments: data.comments.map((c) =>
            c.comment.id === commentId ? { ...c, reactions } : c
          ),
        },
        { revalidate: false }
      );
    } catch (err) {
      mutate(prevData, { revalidate: false });
      showToast({
        variant: "error",
        title: "Reaction failed",
        description: apiErrorMessage(err, "Could not update comment reaction."),
      });
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/tasks")}
        >
          Back
        </Button>

        {canDelete ? (
          <Button
            type="button"
            variant="danger"
            onClick={() => setConfirmDeleteOpen(true)}
            disabled={deletingTask}
          >
            Delete
          </Button>
        ) : null}
      </div>

      <TaskDetailHeader
        task={data.task}
        canUpdate={canUpdate}
        onStatus={handleStatus}
        onProgress={handleProgress}
      />

      <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assignee</div>
          <div className="text-xs text-slate-600 dark:text-slate-300">
            {data.task.assignee_name || "Unassigned"}
          </div>
        </div>

        <Select
          disabled={!canUpdate}
          value={data.task.assignee_id != null ? String(data.task.assignee_id) : ""}
          onChange={(e) => {
            const v = e.target.value;
            handleAssign(v ? Number(v) : null);
          }}
        >
          <option value="">Unassigned</option>
          {activeUsers.map((u) => (
            <option key={u.id} value={String(u.id)}>
              {u.name || u.email}
            </option>
          ))}
        </Select>
      </div>

      <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
        <div className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Reactions</div>
        <ReactionsBar reactions={data.reactions} onToggle={handleToggleTaskReaction} disabled={!canComment && !canUpdate} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Checklist
          items={data.checklist}
          canEdit={canUpdate}
          onToggle={handleToggleChecklist}
          onAdd={handleAddChecklist}
          onDelete={handleDeleteChecklist}
          busyIds={new Set([...checklistBusy, ...deletingChecklistBusy])}
        />

        <AttachmentDropzone
          attachments={data.attachments}
          uploading={uploading}
          canUpload={canUpload}
          onUpload={handleUpload}
          onDelete={handleDeleteAttachment}
          deletingIds={deletingAttachmentIds}
        />
      </div>

      <CommentTimeline
        comments={data.comments}
        pending={pendingComments}
        canComment={canComment}
        onAddComment={handleAddComment}
        onToggleReaction={handleToggleCommentReaction}
      />

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete task?"
        description="This action cannot be undone."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isConfirming={deletingTask}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={async () => {
          if (!canDelete) return;
          setDeletingTask(true);
          try {
            await deleteTask(companyId, taskId);
            router.push("/tasks");
          } catch (err) {
            showToast({
              variant: "error",
              title: "Delete failed",
              description: apiErrorMessage(err, "Could not delete task."),
            });
          } finally {
            setDeletingTask(false);
            setConfirmDeleteOpen(false);
          }
        }}
      />
    </div>
  );
}
