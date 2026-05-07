export type TaskStatus = "todo" | "in_progress" | "done" | "verified";

export type TaskPriority = "low" | "medium" | "high" | null;

export type TaskSummary = {
  id: number;
  company_id: number;
  title: string;
  description?: string | null;
  status: TaskStatus;
  progress: number;
  priority?: TaskPriority;
  due_date?: string | null;
  assigned_at?: string | null;
  completed_at?: string | null;
  completion_duration_hours?: number | null;
  assignee_id?: number | null;
  assignee_name?: string | null;
  created_by_id: number;
  created_at: string;
  updated_at: string;
  checklist_total: number;
  checklist_done: number;
  comments: number;
  attachments: number;
  reactions: number;
  customer_id?: number | null;
  customer_name?: string | null;
  department_id?: number | null;
  department_name?: string | null;
  project_id?: number | null;
  project_name?: string | null;
  task_head_id?: number | null;
  task_head_name?: string | null;
  forwarded_from_id?: number | null;
  forwarded_from_name?: string | null;
};

export type Reaction = {
  emoji: string;
  count: number;
  reacted_by_me: boolean;
};

export type ChecklistItem = {
  id: number;
  task_id: number;
  text: string;
  is_done: boolean;
  sort_order: number;
  created_at: string;
};

export type Attachment = {
  id: number;
  task_id: number;
  file_url: string;
  file_name: string;
  mime_type: string;
  size: number;
  uploaded_by_id: number;
  created_at: string;
};

export type Comment = {
  id: number;
  task_id: number;
  body: string;
  author_id: number;
  author_name: string;
  created_at: string;
};

export type TaskPermissions = {
  can_assign: boolean;
  can_delete: boolean;
  can_update: boolean;
  can_comment: boolean;
  can_upload: boolean;
};

export type TaskDetailResponse = {
  task: TaskSummary;
  checklist: ChecklistItem[];
  attachments: Attachment[];
  comments: { comment: Comment; reactions: Reaction[] }[];
  reactions: Reaction[];
  permissions: TaskPermissions;
};

export type Paginated<T> = {
  results: T[];
  total: number;
  skip: number;
  limit: number;
};
