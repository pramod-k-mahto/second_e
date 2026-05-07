import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  addTaskAssignees,
  assignTask,
  createChecklistItem,
  createComment,
  createTask,
  deleteAttachment,
  deleteChecklistItem,
  getTask,
  getTenantUsers,
  listTaskAssignees,
  listTasks,
  patchTask,
  removeTaskAssignee,
  updateTaskAssigneeRole,
  toggleChecklistItem,
  toggleCommentReaction,
  toggleTaskReaction,
  uploadAttachment,
  forwardTask,
  listTaskHeads,
  createTaskHead,
  updateTaskHead,
  deleteTaskHead,
} from "@/lib/tasks/api";
import type { ListTasksParams } from "@/lib/tasks/api";
import type { CollaboratorRole } from "@/lib/tasks/types";

export function tasksKey(companyId: number, filters: ListTasksParams) {
  return ["tasks", companyId, filters] as const;
}

export function taskKey(companyId: number, taskId: number) {
  return ["task", companyId, taskId] as const;
}

export function tenantUsersKey() {
  return ["tenant-users"] as const;
}

export function taskAssigneesKey(companyId: number, taskId: number) {
  return ["task-assignees", companyId, taskId] as const;
}

export function useTasks(companyId: number, filters: ListTasksParams) {
  return useQuery({
    queryKey: tasksKey(companyId, filters),
    queryFn: () => listTasks(companyId, filters),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useTask(companyId: number, taskId: number) {
  return useQuery({
    queryKey: taskKey(companyId, taskId),
    queryFn: () => getTask(companyId, taskId),
    enabled: Number.isFinite(companyId) && companyId > 0 && Number.isFinite(taskId) && taskId > 0,
    retry: (failureCount, error) => {
      const status = (error as AxiosError | undefined)?.response?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useTenantUsers() {
  return useQuery({
    queryKey: tenantUsersKey(),
    queryFn: () => getTenantUsers(),
  });
}

export function useTaskAssignees(companyId: number, taskId: number) {
  return useQuery({
    queryKey: taskAssigneesKey(companyId, taskId),
    queryFn: () => listTaskAssignees(companyId, taskId),
    enabled: Number.isFinite(companyId) && companyId > 0 && Number.isFinite(taskId) && taskId > 0,
  });
}

export function useAddTaskAssignees(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { userIds: number[]; role?: CollaboratorRole }) =>
      addTaskAssignees(companyId, taskId, args.userIds, args.role),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: taskAssigneesKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: ["tasks", companyId] }),
      ]);
    },
  });
}

export function useUpdateTaskAssigneeRole(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { userId: number; role: CollaboratorRole }) =>
      updateTaskAssigneeRole(companyId, taskId, args.userId, args.role),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: taskAssigneesKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: ["tasks", companyId] }),
      ]);
    },
  });
}

export function useRemoveTaskAssignee(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => removeTaskAssignee(companyId, taskId, userId),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: taskAssigneesKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: ["tasks", companyId] }),
      ]);
    },
  });
}

export function useCreateTask(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: {
      title: string;
      description?: string | null;
      due_date?: string | null;
      assignee_id?: number | null;
      priority?: "low" | "medium" | "high" | null;
      customer_id?: number | null;
      department_id?: number | null;
      project_id?: number | null;
      task_head_id?: number | null;
    }) =>
      createTask(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["tasks", companyId] });
    },
  });
}

export function usePatchTask(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: Partial<{ status: "todo" | "in_progress" | "done" | "verified"; progress: number }>) =>
      patchTask(companyId, taskId, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: ["tasks", companyId] }),
      ]);
    },
  });
}

export function useAssignTask(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { assignee_id: number | null }) => assignTask(companyId, taskId, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: ["tasks", companyId] }),
      ]);
    },
  });
}

export function useUploadAttachment(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAttachment(companyId, taskId, file),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });
}

export function useDeleteAttachment(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (attachmentId: number) => deleteAttachment(companyId, taskId, attachmentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });
}

export function useChecklistMutations(companyId: number, taskId: number) {
  const qc = useQueryClient();

  const createItem = useMutation({
    mutationFn: (payload: { text: string; sort_order: number }) => createChecklistItem(companyId, taskId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });

  const toggleItem = useMutation({
    mutationFn: (args: { itemId: number; is_done: boolean }) =>
      toggleChecklistItem(companyId, taskId, args.itemId, { is_done: args.is_done }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: number) => deleteChecklistItem(companyId, taskId, itemId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });

  return { createItem, toggleItem, deleteItem };
}

export function useCreateComment(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { body: string }) => createComment(companyId, taskId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });
}

export function useToggleReactions(companyId: number, taskId: number) {
  const qc = useQueryClient();

  const toggleTask = useMutation({
    mutationFn: (payload: { emoji: string }) => toggleTaskReaction(companyId, taskId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });

  const toggleComment = useMutation({
    mutationFn: (args: { commentId: number; emoji: string }) =>
      toggleCommentReaction(companyId, taskId, args.commentId, { emoji: args.emoji }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) });
    },
  });

  return { toggleTask, toggleComment };
}

export function useForwardTask(companyId: number, taskId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { assignee_id: number }) => forwardTask(companyId, taskId, payload),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: taskKey(companyId, taskId) }),
        qc.invalidateQueries({ queryKey: ["tasks", companyId] }),
      ]);
    },
  });
}

export function useTaskHeads(companyId: number) {
  return useQuery({
    queryKey: ["task-heads", companyId],
    queryFn: () => listTaskHeads(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateTaskHead(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { name: string; description?: string }) => createTaskHead(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["task-heads", companyId] });
    },
  });
}

export function useUpdateTaskHead(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { headId: number; payload: { name?: string; description?: string } }) =>
      updateTaskHead(companyId, args.headId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["task-heads", companyId] });
    },
  });
}

export function useDeleteTaskHead(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (headId: number) => deleteTaskHead(companyId, headId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["task-heads", companyId] });
    },
  });
}
