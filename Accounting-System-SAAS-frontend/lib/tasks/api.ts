import { api } from "@/lib/api";
import type {
  Assignee,
  Attachment,
  ChecklistItem,
  Comment,
  Reaction,
  TaskDetailResponse,
  TaskListResponse,
  TaskStatus,
  TaskSummary,
  TenantUser,
  TaskHead,
  CollaboratorRole,
} from "@/lib/tasks/types";

export type TaskSort = "updated_desc" | "due_asc" | "created_desc";

export type ListTasksParams = {
  status?: TaskStatus;
  q?: string;
  sort?: TaskSort;
  skip?: number;
  limit?: number;
  customer_id?: number;
  customer_ids?: number[];
  department_id?: number;
  department_ids?: number[];
  project_id?: number;
  project_ids?: number[];
  task_head_id?: number;
  task_head_ids?: number[];
};

function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) {
      v.forEach(val => search.append(k, String(val)));
    } else {
      search.set(k, String(v));
    }
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export async function listTasks(companyId: number, params: ListTasksParams = {}): Promise<TaskListResponse> {
  const res = await api.get(`/companies/${companyId}/tasks${buildQuery(params)}`);
  return res.data;
}

export async function getTask(companyId: number, taskId: number): Promise<TaskDetailResponse> {
  const res = await api.get(`/companies/${companyId}/tasks/${taskId}`);

  const raw = res.data as any;

  const permissions = (raw && raw.permissions) || {};
  const normalized: TaskDetailResponse = {
    task: raw?.task ?? raw?.data?.task ?? raw?.task_detail ?? raw?.task_summary ?? raw?.task,
    checklist: Array.isArray(raw?.checklist) ? raw.checklist : [],
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
    comments: Array.isArray(raw?.comments) ? raw.comments : [],
    reactions: Array.isArray(raw?.reactions) ? raw.reactions : [],
    permissions: {
      can_assign: Boolean(permissions.can_assign),
      can_delete: Boolean(permissions.can_delete),
      can_update: Boolean(permissions.can_update),
      can_comment: Boolean(permissions.can_comment),
      can_upload: Boolean(permissions.can_upload),
    },
  };

  return normalized;
}

export async function createTask(
  companyId: number,
  payload: {
    title: string;
    description?: string | null;
    due_date?: string | null;
    assignee_id?: number | null;
    priority?: "low" | "medium" | "high" | null;
    customer_id?: number | null;
    department_id?: number | null;
    project_id?: number | null;
    task_head_id?: number | null;
  }
): Promise<TaskSummary> {
  const res = await api.post(`/companies/${companyId}/tasks`, payload);
  return res.data;
}

export async function patchTask(
  companyId: number,
  taskId: number,
  payload: Partial<{ status: TaskStatus; progress: number }>
): Promise<TaskSummary> {
  const res = await api.patch(`/companies/${companyId}/tasks/${taskId}`, payload);
  return res.data;
}

export async function assignTask(
  companyId: number,
  taskId: number,
  payload: { assignee_id: number | null }
): Promise<TaskSummary> {
  const res = await api.patch(`/companies/${companyId}/tasks/${taskId}/assign`, payload);
  return res.data;
}

export async function listTaskAssignees(companyId: number, taskId: number): Promise<Assignee[]> {
  const res = await api.get(`/companies/${companyId}/tasks/${taskId}/assignees`);
  return (res.data as { assignees: Assignee[] }).assignees || [];
}

export async function addTaskAssignees(
  companyId: number,
  taskId: number,
  user_ids: number[],
  role: CollaboratorRole = "EXECUTOR"
): Promise<Assignee[]> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/assignees`, { user_ids, role });
  return (res.data as { assignees: Assignee[] }).assignees || [];
}

export async function updateTaskAssigneeRole(
  companyId: number,
  taskId: number,
  userId: number,
  role: CollaboratorRole
): Promise<Assignee> {
  const res = await api.patch(`/companies/${companyId}/tasks/${taskId}/assignees/${userId}/role`, { role });
  return res.data;
}

export async function removeTaskAssignee(companyId: number, taskId: number, userId: number): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/${taskId}/assignees/${userId}`);
}

export async function uploadAttachment(
  companyId: number,
  taskId: number,
  file: File,
  opts?: { title?: string | null }
): Promise<{ attachment: Attachment }> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts?.title) {
    fd.append("title", opts.title);
  }
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/attachments`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return { attachment: (res.data as { attachment: Attachment }).attachment };
}

export async function deleteAttachment(companyId: number, taskId: number, attachmentId: number): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/${taskId}/attachments/${attachmentId}`);
}

export async function createChecklistItem(
  companyId: number,
  taskId: number,
  payload: { text: string; sort_order: number }
): Promise<ChecklistItem> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/checklist`, payload);
  return res.data;
}

export async function toggleChecklistItem(
  companyId: number,
  taskId: number,
  itemId: number,
  payload: { is_done: boolean }
): Promise<{ item: ChecklistItem; checklist_done: number; checklist_total: number }> {
  const res = await api.patch(`/companies/${companyId}/tasks/${taskId}/checklist/${itemId}`, payload);
  return res.data;
}

export async function deleteChecklistItem(companyId: number, taskId: number, itemId: number): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/${taskId}/checklist/${itemId}`);
}

export async function createComment(
  companyId: number,
  taskId: number,
  payload: { body: string }
): Promise<{ comment: Comment; reactions: Reaction[] }> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/comments`, payload);
  return res.data;
}

export async function toggleTaskReaction(
  companyId: number,
  taskId: number,
  payload: { emoji: string }
): Promise<{ reactions: Reaction[] }> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/reactions/toggle`, payload);
  return { reactions: (res.data as { reactions: Reaction[] }).reactions };
}

export async function toggleCommentReaction(
  companyId: number,
  taskId: number,
  commentId: number,
  payload: { emoji: string }
): Promise<{ reactions: Reaction[] }> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/comments/${commentId}/reactions/toggle`, payload);
  return { reactions: (res.data as { reactions: Reaction[] }).reactions };
}

export async function getTenantUsers(): Promise<TenantUser[]> {
  const res = await api.get(`/tenants/self/users`);
  return res.data;
}

export async function forwardTask(
  companyId: number,
  taskId: number,
  payload: { assignee_id: number }
): Promise<TaskSummary> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/forward`, payload);
  return res.data;
}

export async function listTaskHeads(companyId: number): Promise<TaskHead[]> {
  const res = await api.get(`/companies/${companyId}/tasks/heads`);
  return res.data;
}

export async function createTaskHead(
  companyId: number,
  payload: { name: string; description?: string }
): Promise<TaskHead> {
  const res = await api.post(`/companies/${companyId}/tasks/heads`, payload);
  return res.data;
}

export async function updateTaskHead(
  companyId: number,
  headId: number,
  payload: { name?: string; description?: string }
): Promise<TaskHead> {
  const res = await api.patch(`/companies/${companyId}/tasks/heads/${headId}`, payload);
  return res.data;
}

export async function deleteTaskHead(companyId: number, headId: number): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/heads/${headId}`);
}
