import { api } from "@/lib/api";
import type {
  Attachment,
  ChecklistItem,
  Comment,
  Paginated,
  Reaction,
  TaskDetailResponse,
  TaskStatus,
  TaskSummary,
} from "@/types/task";

export type TaskSort = "updated_desc" | "due_asc" | "created_desc";

export type ListTasksParams = {
  status?: TaskStatus;
  assignee_id?: number;
  assigned_to_me?: boolean;
  q?: string;
  sort?: TaskSort;
  skip?: number;
  limit?: number;
};

function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    search.set(k, String(v));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function tasksListKey(companyId: number, params: ListTasksParams = {}) {
  return `/companies/${companyId}/tasks${buildQuery(params as Record<string, unknown>)}`;
}

export async function listTasks(
  companyId: number,
  params: ListTasksParams = {}
): Promise<Paginated<TaskSummary>> {
  const res = await api.get(tasksListKey(companyId, params));
  return res.data;
}

export async function getTaskDetail(
  companyId: number,
  taskId: number
): Promise<TaskDetailResponse> {
  const res = await api.get(`/companies/${companyId}/tasks/${taskId}`);
  return res.data;
}

export async function createTask(
  companyId: number,
  body: {
    title: string;
    description?: string | null;
    due_date?: string | null;
    assignee_id?: number | null;
    priority?: "low" | "medium" | "high" | null;
  }
): Promise<TaskSummary> {
  const res = await api.post(`/companies/${companyId}/tasks`, body);
  return res.data;
}

export async function patchTask(
  companyId: number,
  taskId: number,
  body: { status: TaskStatus } | { progress: number }
): Promise<TaskSummary> {
  const res = await api.patch(`/companies/${companyId}/tasks/${taskId}`, body);
  return res.data;
}

export async function assignTask(
  companyId: number,
  taskId: number,
  assigneeId: number | null
): Promise<TaskSummary> {
  const res = await api.patch(`/companies/${companyId}/tasks/${taskId}/assign`, {
    assignee_id: assigneeId,
  });
  return res.data;
}

export async function addTaskAssignees(
  companyId: number,
  taskId: number,
  userIds: number[]
): Promise<void> {
  if (!userIds.length) return;
  await api.post(`/companies/${companyId}/tasks/${taskId}/assignees`, {
    user_ids: userIds,
  });
}

export async function deleteTask(companyId: number, taskId: number): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/${taskId}`);
}

export async function toggleChecklistItem(
  companyId: number,
  taskId: number,
  itemId: number,
  isDone: boolean
): Promise<{ item: ChecklistItem; checklist_done: number; checklist_total: number }> {
  const res = await api.patch(
    `/companies/${companyId}/tasks/${taskId}/checklist/${itemId}`,
    {
      is_done: isDone,
    }
  );
  return res.data;
}

export async function createChecklistItem(
  companyId: number,
  taskId: number,
  body: { text: string; sort_order: number }
): Promise<ChecklistItem> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/checklist`, body);
  return res.data;
}

export async function deleteChecklistItem(
  companyId: number,
  taskId: number,
  itemId: number
): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/${taskId}/checklist/${itemId}`);
}

export async function uploadAttachment(
  companyId: number,
  taskId: number,
  file: File
): Promise<Attachment> {
  const fd = new FormData();
  fd.append("file", file);
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/attachments`, fd, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return (res.data as { attachment: Attachment }).attachment;
}

export async function deleteAttachment(
  companyId: number,
  taskId: number,
  attachmentId: number
): Promise<void> {
  await api.delete(`/companies/${companyId}/tasks/${taskId}/attachments/${attachmentId}`);
}

export async function createComment(
  companyId: number,
  taskId: number,
  body: { body: string }
): Promise<{ comment: Comment; reactions: Reaction[] }> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/comments`, body);
  return res.data;
}

export async function toggleTaskReaction(
  companyId: number,
  taskId: number,
  emoji: string
): Promise<Reaction[]> {
  const res = await api.post(`/companies/${companyId}/tasks/${taskId}/reactions/toggle`, {
    emoji,
  });
  return (res.data as { reactions: Reaction[] }).reactions;
}

export async function toggleCommentReaction(
  companyId: number,
  taskId: number,
  commentId: number,
  emoji: string
): Promise<Reaction[]> {
  const res = await api.post(
    `/companies/${companyId}/tasks/${taskId}/comments/${commentId}/reactions/toggle`,
    { emoji }
  );
  return (res.data as { reactions: Reaction[] }).reactions;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const maybeErr = err as { response?: { data?: { detail?: unknown } } } | null;
  const detail = maybeErr?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object" && "msg" in e) {
          const msg = (e as { msg?: unknown }).msg;
          return typeof msg === "string" ? msg : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("; ");
  }
  if (detail && typeof detail === "object" && "msg" in detail) {
    const msg = (detail as { msg?: unknown }).msg;
    if (typeof msg === "string") return msg;
  }
  try {
    return JSON.stringify(detail);
  } catch {
    return fallback;
  }
}
