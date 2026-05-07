"use client";

import * as React from "react";
import type { AxiosError } from "axios";
import Link from "next/link";
import { useToast } from "@/components/ui/Toast";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import {
  useAddTaskAssignees,
  useAssignTask,
  useChecklistMutations,
  useCreateComment,
  useDeleteAttachment,
  usePatchTask,
  useRemoveTaskAssignee,
  useUpdateTaskAssigneeRole,
  useTask,
  useTenantUsers,
  useToggleReactions,
  useUploadAttachment,
} from "@/lib/tasks/queries";

function httpStatus(err: unknown): number | undefined {
  return (err as AxiosError | undefined)?.response?.status;
}

export default function CompanyTaskDetailPage({
  params,
}: {
  params: { companyId: string; taskId: string };
}) {
  const companyId = Number(params.companyId);
  const taskId = Number(params.taskId);
  const { showToast } = useToast();

  const taskQuery = useTask(companyId, taskId);
  const usersQuery = useTenantUsers();

  const patchMutation = usePatchTask(companyId, taskId);
  const assignMutation = useAssignTask(companyId, taskId);
  const addAssigneesMutation = useAddTaskAssignees(companyId, taskId);
  const updateRoleMutation = useUpdateTaskAssigneeRole(companyId, taskId);
  const removeAssigneeMutation = useRemoveTaskAssignee(companyId, taskId);
  const uploadMutation = useUploadAttachment(companyId, taskId);
  const deleteAttachmentMutation = useDeleteAttachment(companyId, taskId);
  const checklist = useChecklistMutations(companyId, taskId);
  const commentMutation = useCreateComment(companyId, taskId);
  const reactions = useToggleReactions(companyId, taskId);

  const [deletingAttachmentIds, setDeletingAttachmentIds] = React.useState<Set<number>>(
    () => new Set()
  );
  const [busyChecklistIds, setBusyChecklistIds] = React.useState<Set<number>>(() => new Set());

  const status = httpStatus(taskQuery.error);

  React.useEffect(() => {
    if (!taskQuery.error) return;
    if (status === 403) {
      showToast({ variant: "error", title: "You don’t have permission" });
      return;
    }
    if (status === 404) {
      return;
    }
    showToast({ variant: "error", title: "Failed to load task", description: "Could not load task." });
  }, [taskQuery.error, showToast, status]);

  if (taskQuery.isLoading) {
    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300">
          Loading…
        </div>
      </div>
    );
  }

  if (taskQuery.isError) {
    if (status === 404) {
      return (
        <div className="p-4 sm:p-6">
          <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300">
            Task not found
          </div>
        </div>
      );
    }

    if (status === 403) {
      return (
        <div className="p-4 sm:p-6">
          <div className="rounded-lg border border-critical-500/30 bg-critical-500/5 p-4 text-sm text-critical-600">
            You don’t have permission
          </div>
        </div>
      );
    }

    return (
      <div className="p-4 sm:p-6">
        <div className="rounded-lg border border-critical-500/30 bg-critical-500/5 p-4 text-sm text-critical-600">
          Failed to load task.
        </div>
      </div>
    );
  }

  const data = taskQuery.data;
  if (!data) return null;

  return (
    <div className="p-4 sm:p-6">
      <div className="mb-3 text-xs text-slate-600 dark:text-slate-300">
        <Link href={`/companies/${companyId}/tasks`} className="hover:underline">
          Tasks
        </Link>
        <span className="mx-1">/</span>
        <span className="text-slate-900 dark:text-slate-100">Task #{taskId}</span>
      </div>
      <TaskDetail
        data={data}
        tenantUsers={usersQuery.data || []}
        deletingAttachmentIds={deletingAttachmentIds}
        busyChecklistIds={busyChecklistIds}
        onStatus={(next) => {
          patchMutation.mutate(
            { status: next },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to update status",
                  description: "Could not update task.",
                }),
            }
          );
        }}
        onProgress={(next) => {
          patchMutation.mutate(
            { progress: next },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to update progress",
                  description: "Could not update task.",
                }),
            }
          );
        }}
        onAssign={(assigneeId) => {
          assignMutation.mutate(
            { assignee_id: assigneeId },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to assign",
                  description: "Could not assign task.",
                }),
            }
          );
        }}
        onAssigneesAdd={(userIds, role) => {
          if (!data.permissions.can_assign) return;
          addAssigneesMutation.mutate({ userIds, role }, {
            onError: () =>
              showToast({
                variant: "error",
                title: "Failed to add collaborators",
                description: "Could not update collaborators.",
              }),
          });
        }}
        onAssigneeRemove={(userId) => {
          if (!data.permissions.can_assign) return;
          removeAssigneeMutation.mutate(userId, {
            onError: () =>
              showToast({
                variant: "error",
                title: "Failed to remove collaborator",
                description: "Could not update collaborators.",
              }),
          });
        }}
        onAssigneeRoleUpdate={(userId, role) => {
          if (!data.permissions.can_assign) return;
          updateRoleMutation.mutate({ userId, role }, {
            onError: () =>
              showToast({
                variant: "error",
                title: "Failed to update role",
                description: "Could not update collaborator role.",
              }),
          });
        }}
        onUpload={async (files) => {
          if (!data.permissions.can_upload) return;
          for (const f of files) {
            try {
              await uploadMutation.mutateAsync(f);
            } catch {
              showToast({
                variant: "error",
                title: "Upload failed",
                description: "Could not upload attachment.",
              });
            }
          }
        }}
        onDeleteAttachment={async (attachmentId) => {
          if (!data.permissions.can_upload) return;
          setDeletingAttachmentIds((prev) => new Set(prev).add(attachmentId));
          try {
            await deleteAttachmentMutation.mutateAsync(attachmentId);
          } catch {
            showToast({
              variant: "error",
              title: "Delete failed",
              description: "Could not delete attachment.",
            });
          } finally {
            setDeletingAttachmentIds((prev) => {
              const next = new Set(prev);
              next.delete(attachmentId);
              return next;
            });
          }
        }}
        onChecklistAdd={(text) => {
          if (!data.permissions.can_update) return;
          const nextOrder = (data.checklist || []).reduce((m, it) => Math.max(m, it.sort_order || 0), 0) + 1;
          checklist.createItem.mutate(
            { text, sort_order: nextOrder },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to add item",
                  description: "Could not update checklist.",
                }),
            }
          );
        }}
        onChecklistToggle={(itemId, nextDone) => {
          if (!data.permissions.can_update) return;
          setBusyChecklistIds((prev) => new Set(prev).add(itemId));
          checklist.toggleItem.mutate(
            { itemId, is_done: nextDone },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to update item",
                  description: "Could not update checklist.",
                }),
              onSettled: () =>
                setBusyChecklistIds((prev) => {
                  const next = new Set(prev);
                  next.delete(itemId);
                  return next;
                }),
            }
          );
        }}
        onChecklistDelete={(itemId) => {
          if (!data.permissions.can_update) return;
          setBusyChecklistIds((prev) => new Set(prev).add(itemId));
          checklist.deleteItem.mutate(itemId, {
            onError: () =>
              showToast({
                variant: "error",
                title: "Failed to delete item",
                description: "Could not update checklist.",
              }),
            onSettled: () =>
              setBusyChecklistIds((prev) => {
                const next = new Set(prev);
                next.delete(itemId);
                return next;
              }),
          });
        }}
        onAddComment={async (body) => {
          if (!data.permissions.can_comment) return;
          try {
            await commentMutation.mutateAsync({ body });
          } catch {
            showToast({
              variant: "error",
              title: "Failed to post comment",
              description: "Could not post comment.",
            });
          }
        }}
        onToggleTaskReaction={(emoji) => {
          if (!(data.permissions.can_comment || data.permissions.can_update)) return;
          reactions.toggleTask.mutate(
            { emoji },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to react",
                  description: "Could not toggle reaction.",
                }),
            }
          );
        }}
        onToggleCommentReaction={(commentId, emoji) => {
          if (!(data.permissions.can_comment || data.permissions.can_update)) return;
          reactions.toggleComment.mutate(
            { commentId, emoji },
            {
              onError: () =>
                showToast({
                  variant: "error",
                  title: "Failed to react",
                  description: "Could not toggle reaction.",
                }),
            }
          );
        }}
      />
    </div>
  );
}
