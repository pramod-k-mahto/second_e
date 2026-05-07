"use client";

import * as React from "react";
import useSWR from "swr";
import { api, getCurrentCompany } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  tasksListKey,
  listTasks,
  apiErrorMessage,
  createTask,
  uploadAttachment,
  addTaskAssignees,
  patchTask,
} from "@/lib/tasksApi";
import type { TaskStatus } from "@/types/task";
import { TaskCompactCard } from "@/components/tasks/TaskCompactCard";
import { TaskEmptyState, isDueToday, isTaskOverdue } from "@/components/tasks/TaskUI";
import { TaskListSkeleton } from "@/components/tasks/TaskSkeletons";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { usePermissions } from "@/components/PermissionsContext";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";

type StatusTab = "all" | TaskStatus;

type UserTab = "my" | "today" | "overdue" | "completed";

const userTabs: { key: UserTab; label: string }[] = [
  { key: "my", label: "My Tasks" },
  { key: "today", label: "Due Today" },
  { key: "overdue", label: "Overdue" },
  { key: "completed", label: "Completed" },
];

type TenantUser = {
  id: number;
  name: string;
  email: string;
  active: boolean;
};

type CompanySettings = {
  calendar_mode?: "AD" | "BS";
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function TasksPage() {
  const { showToast } = useToast();
  const permissions = usePermissions();
  const canCreateTask = permissions.isTenantAdmin || permissions.isSuperAdmin;
  const [companyId, setCompanyId] = React.useState<number | null>(null);

  const [tab, setTab] = React.useState<UserTab>("my");
  const [status, setStatus] = React.useState<StatusTab>("all");
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<"updated_desc" | "due_asc" | "created_desc">(
    "updated_desc"
  );

  const [createOpen, setCreateOpen] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [createTitle, setCreateTitle] = React.useState("");
  const [createDescription, setCreateDescription] = React.useState("");
  const [createDueDate, setCreateDueDate] = React.useState<string>("");
  const [createDueDateBS, setCreateDueDateBS] = React.useState<string>("");
  const [createPriority, setCreatePriority] = React.useState<"" | "low" | "medium" | "high">("");
  const [createAssigneeIds, setCreateAssigneeIds] = React.useState<number[]>([]);
  const [createAllowMulti, setCreateAllowMulti] = React.useState(false);
  const [assigneeSearch, setAssigneeSearch] = React.useState("");
  const [createFiles, setCreateFiles] = React.useState<File[]>([]);
  const createFilesInputRef = React.useRef<HTMLInputElement | null>(null);

  const { data: tenantUsers } = useSWR<TenantUser[]>("/tenants/self/users", fetcher);
  const activeUsers = React.useMemo(
    () => (tenantUsers || []).filter((u) => u.active),
    [tenantUsers]
  );

  const filteredUsers = React.useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return activeUsers;
    return activeUsers.filter((u) => {
      const label = `${u.name || ""} ${u.email || ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [activeUsers, assigneeSearch]);

  React.useEffect(() => {
    const cc = getCurrentCompany();
    setCompanyId(cc?.id ?? null);
  }, []);

  const { data: companySettings } = useSWR<CompanySettings>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );
  const isBS = companySettings?.calendar_mode === "BS";

  React.useEffect(() => {
    if (!isBS) {
      setCreateDueDateBS("");
      return;
    }
    setCreateDueDateBS(createDueDate ? safeADToBS(createDueDate) : "");
  }, [isBS, createDueDate]);

  const params = React.useMemo(() => {
    return {
      status: status === "all" ? undefined : status,
      q: q || undefined,
      sort,
      skip: 0,
      limit: 50,
    };
  }, [status, q, sort]);

  const key = companyId ? tasksListKey(companyId, params) : null;

  const { data, error, isLoading, mutate } = useSWR(
    key,
    async () => {
      if (!companyId) throw new Error("No company selected");
      return listTasks(companyId, params);
    },
    {
      onError: (err) => {
        showToast({
          variant: "error",
          title: "Failed to load tasks",
          description: apiErrorMessage(err, "Could not load tasks."),
        });
      },
    }
  );

  const tasks = React.useMemo(() => data?.results || [], [data]);

  const visibleTasks = React.useMemo(() => {
    const base = tasks;

    if (tab === "today") {
      return base.filter((t) => isDueToday(t.due_date || null) && t.status !== "done");
    }
    if (tab === "overdue") {
      return base.filter((t) => isTaskOverdue(t.due_date || null, t.status));
    }
    if (tab === "completed") {
      return base.filter((t) => t.status === "done");
    }
    return base;
  }, [tasks, tab]);

  const canMarkCompleted = true;

  const tabIcons: Record<UserTab, React.ReactNode> = {
    my: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
      </svg>
    ),
    today: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
      </svg>
    ),
    overdue: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
      </svg>
    ),
    completed: (
      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
      </svg>
    ),
  };

  const tabCounts: Record<UserTab, number> = React.useMemo(() => {
    const all = tasks;
    return {
      my: all.length,
      today: all.filter((t) => isDueToday(t.due_date || null) && t.status !== "done").length,
      overdue: all.filter((t) => isTaskOverdue(t.due_date || null, t.status)).length,
      completed: all.filter((t) => t.status === "done").length,
    };
  }, [tasks]);

  const tabColors: Record<UserTab, { active: string; badge: string }> = {
    my: {
      active: "bg-indigo-600 text-white border-indigo-600 shadow-indigo-200 dark:shadow-indigo-900/40",
      badge: "bg-indigo-500/20 text-indigo-100",
    },
    today: {
      active: "bg-amber-500 text-white border-amber-500 shadow-amber-200 dark:shadow-amber-900/40",
      badge: "bg-amber-500/20 text-amber-100",
    },
    overdue: {
      active: "bg-rose-600 text-white border-rose-600 shadow-rose-200 dark:shadow-rose-900/40",
      badge: "bg-rose-500/20 text-rose-100",
    },
    completed: {
      active: "bg-emerald-600 text-white border-emerald-600 shadow-emerald-200 dark:shadow-emerald-900/40",
      badge: "bg-emerald-500/20 text-emerald-100",
    },
  };

  if (!companyId) {
    return (
      <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 p-6 shadow-lg shadow-amber-100/50 dark:shadow-amber-900/20 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-800/30 mb-4">
            <svg className="h-7 w-7 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="text-base font-bold text-amber-900 dark:text-amber-200">Company not selected</div>
          <div className="mt-1.5 text-sm text-amber-700 dark:text-amber-300/80">Please open a company first to view your tasks.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50/80 via-white to-indigo-50/30 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950/20">
      <div className="p-4 sm:p-6 lg:p-8 space-y-5 max-w-7xl mx-auto">

        {/* ── Hero Header ─────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between px-5 py-4">
            <div className="flex items-center gap-3.5">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-200/50 dark:shadow-indigo-900/30">
                <svg className="w-5.5 h-5.5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                  Task Management
                </h1>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  View, track, and manage all tasks assigned to you
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              {!isLoading && !error && (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/40 text-xs font-medium text-slate-600 dark:text-slate-300">
                  <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  {visibleTasks.length} of {tasks.length} tasks
                </div>
              )}
              {canCreateTask && (
                <Button
                  type="button"
                  variant="primary"
                  onClick={() => setCreateOpen(true)}
                  className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-md shadow-indigo-200/50 dark:shadow-indigo-900/30 transition-all duration-200 active:scale-[0.97] text-xs px-4 py-2 h-auto rounded-xl font-semibold flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  New Task
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* ── Tab Navigation ──────────────────────────────────────── */}
        <div className="flex flex-wrap gap-2">
          {userTabs.map((t) => {
            const isActive = tab === t.key;
            const colors = tabColors[t.key];
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={[
                  "group relative flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-semibold transition-all duration-200",
                  isActive
                    ? `${colors.active} shadow-md`
                    : "border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm",
                ].join(" ")}
              >
                {tabIcons[t.key]}
                <span>{t.label}</span>
                <span
                  className={[
                    "ml-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-md px-1.5 text-[10px] font-bold tabular-nums",
                    isActive
                      ? colors.badge
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400",
                  ].join(" ")}
                >
                  {tabCounts[t.key]}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Search & Filters ────────────────────────────────────── */}
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/60 shadow-sm p-3.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-4 w-4 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
              </div>
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search tasks…"
                className="pl-9"
              />
            </div>
            <div className="w-44">
              <Select value={sort} onChange={(e) => setSort(e.target.value as any)}>
                <option value="updated_desc">Recently updated</option>
                <option value="due_asc">Due date</option>
                <option value="created_desc">Recently created</option>
              </Select>
            </div>
            <div className="w-44">
              <Select value={status} onChange={(e) => setStatus(e.target.value as any)}>
                <option value="all">All status</option>
                <option value="todo">Todo</option>
                <option value="in_progress">In progress</option>
                <option value="done">Done</option>
              </Select>
            </div>
          </div>
        </div>

        {/* ── Loading State ───────────────────────────────────────── */}
        {isLoading ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="animate-pulse rounded-2xl border border-slate-200/80 dark:border-slate-700/40 bg-white dark:bg-slate-900 p-5 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-3/4 rounded-lg bg-slate-200 dark:bg-slate-800" />
                    <div className="flex gap-1.5">
                      <div className="h-5 w-14 rounded-full bg-slate-100 dark:bg-slate-700" />
                      <div className="h-5 w-16 rounded-full bg-slate-100 dark:bg-slate-700" />
                    </div>
                  </div>
                  <div className="h-8 w-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between">
                    <div className="h-3 w-12 rounded bg-slate-100 dark:bg-slate-700" />
                    <div className="h-3 w-8 rounded bg-slate-100 dark:bg-slate-700" />
                  </div>
                  <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800" />
                </div>
                <div className="mt-4 flex gap-2 border-t border-slate-100 dark:border-slate-800 pt-3">
                  <div className="h-7 flex-1 rounded-lg bg-slate-100 dark:bg-slate-800" />
                  <div className="h-7 flex-1 rounded-lg bg-slate-100 dark:bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {/* ── Error State ─────────────────────────────────────────── */}
        {!isLoading && error ? (
          <div className="rounded-2xl border border-rose-200 dark:border-rose-800/40 bg-gradient-to-br from-rose-50 to-red-50 dark:from-rose-900/20 dark:to-red-900/20 p-6 shadow-sm text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 dark:bg-rose-800/30 mb-3">
              <svg className="h-6 w-6 text-rose-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="text-sm font-semibold text-rose-800 dark:text-rose-200">Failed to load tasks</div>
            <div className="mt-1 text-xs text-rose-600 dark:text-rose-300/80">Please check your connection and try again.</div>
          </div>
        ) : null}

        {/* ── Task Cards Grid ─────────────────────────────────────── */}
        {!isLoading && !error ? (
          visibleTasks.length ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleTasks.map((t) => (
                <TaskCompactCard
                  key={t.id}
                  href={`/tasks/${t.id}`}
                  title={t.title}
                  assigneeName={t.assignee_name}
                  status={t.status}
                  priority={(t as any).priority ?? null}
                  dueDate={t.due_date ?? null}
                  isBS={isBS}
                  progress={Number(t.progress || 0)}
                  createdAt={(t as any).created_at}
                  customerName={(t as any).customer_name}
                  departmentName={(t as any).department_name}
                  projectName={(t as any).project_name}
                  taskHeadName={(t as any).task_head_name}
                  footer={
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          window.location.href = `/tasks/${t.id}`;
                        }}
                        className="flex-1 rounded-lg text-xs font-medium"
                      >
                        <svg className="w-3.5 h-3.5 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M18 13V5a2 2 0 00-2-2H4a2 2 0 00-2 2v8a2 2 0 002 2h3l3 3 3-3h3a2 2 0 002-2zM5 7a1 1 0 011-1h8a1 1 0 110 2H6a1 1 0 01-1-1zm1 3a1 1 0 100 2h3a1 1 0 100-2H6z" clipRule="evenodd" />
                        </svg>
                        Comment
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        disabled={!canMarkCompleted || t.status === "done"}
                        onClick={async () => {
                          if (!companyId) return;
                          if (!canMarkCompleted) return;
                          if (t.status === "done") return;

                          const prev = data;
                          mutate(
                            (curr: any) => {
                              if (!curr) return curr;
                              return {
                                ...curr,
                                results: (curr.results || []).map((x: any) =>
                                  x.id === t.id ? { ...x, status: "done" } : x
                                ),
                              };
                            },
                            { revalidate: false }
                          );

                          try {
                            await patchTask(companyId, t.id, { status: "done" } as any);
                            await mutate();
                          } catch (err) {
                            if (prev) {
                              mutate(prev as any, { revalidate: false });
                            }
                            showToast({
                              variant: "error",
                              title: "Failed to mark completed",
                              description: apiErrorMessage(err, "Could not update task."),
                            });
                          }
                        }}
                        className={[
                          "flex-1 rounded-lg text-xs font-medium",
                          t.status === "done"
                            ? "bg-emerald-100 text-emerald-700 border-emerald-200 cursor-default"
                            : "bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 shadow-sm",
                        ].join(" ")}
                      >
                        {t.status === "done" ? (
                          <>
                            <svg className="w-3.5 h-3.5 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Completed
                          </>
                        ) : (
                          <>
                            <svg className="w-3.5 h-3.5 mr-1 inline-block" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                            Mark Completed
                          </>
                        )}
                      </Button>
                    </>
                  }
                />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/60 p-10 text-center shadow-sm">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-100 to-slate-50 dark:from-slate-800 dark:to-slate-800/50 mb-4 shadow-inner">
                <svg className="h-8 w-8 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
                </svg>
              </div>
              <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">No tasks found</h3>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Try changing the selected tab or adjusting your search and filters.
              </p>
            </div>
          )
        ) : null}

      <Modal
        open={createOpen && canCreateTask}
        title="Create task"
        onClose={() => {
          if (creating) return;
          setCreateOpen(false);
        }}
      >
        <form
          className="space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!companyId) return;
            if (!canCreateTask) {
              showToast({
                variant: "error",
                title: "Not allowed",
                description: "You cannot create tasks. Please contact your Tenant Admin.",
              });
              return;
            }
            const title = createTitle.trim();
            if (!title) {
              showToast({
                variant: "error",
                title: "Title required",
                description: "Please enter a task title.",
              });
              return;
            }

            if (!createDueDate) {
              showToast({
                variant: "error",
                title: "Due date required",
                description: "Please select a due date before creating the task.",
              });
              return;
            }

            if (!createPriority) {
              showToast({
                variant: "error",
                title: "Priority required",
                description: "Please select a priority before creating the task.",
              });
              return;
            }
            setCreating(true);
            try {
              const assigneeIds = Array.isArray(createAssigneeIds) ? createAssigneeIds : [];
              const primaryAssigneeId = assigneeIds.length === 1 ? assigneeIds[0] : null;

              const created = await createTask(companyId, {
                title,
                description: createDescription.trim() || null,
                due_date: createDueDate || null,
                assignee_id: primaryAssigneeId,
                priority: createPriority || null,
              });

              if (assigneeIds.length > 1) {
                await addTaskAssignees(companyId, created.id, assigneeIds);
              }

              if (createFiles.length) {
                for (const f of createFiles) {
                  try {
                    await uploadAttachment(companyId, created.id, f);
                  } catch (err) {
                    showToast({
                      variant: "error",
                      title: "Attachment upload failed",
                      description: apiErrorMessage(err, `Failed to upload ${f.name}`),
                    });
                  }
                }
              }

              setCreateTitle("");
              setCreateDescription("");
              setCreateDueDate("");
              setCreateDueDateBS("");
              setCreatePriority("");
              setCreateAssigneeIds([]);
              setCreateAllowMulti(false);
              setAssigneeSearch("");
              setCreateFiles([]);

              showToast({
                variant: "success",
                title: "Task created",
                description: "You can create another task now.",
              });

              await mutate();
            } catch (err) {
              showToast({
                variant: "error",
                title: "Failed to create task",
                description: apiErrorMessage(err, "Could not create task."),
              });
            } finally {
              setCreating(false);
            }
          }}
        >
          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Title</div>
            <Input value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} />
          </div>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Description</div>
            <textarea
              className="w-full rounded-md border border-border-light px-3 py-2 text-sm text-slate-900 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              rows={4}
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Due date</div>
              {isBS ? (
                <div className="relative z-50 overflow-visible">
                  <NepaliDatePicker
                    inputClassName="h-8 w-full rounded-md border border-border-light bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                    value={createDueDateBS}
                    onChange={(value: string) => {
                      setCreateDueDateBS(value);
                      const ad = safeBSToAD(value);
                      setCreateDueDate(ad);
                    }}
                    options={{ calenderLocale: "ne", valueLocale: "en" }}
                  />
                </div>
              ) : (
                <Input
                  type="date"
                  value={createDueDate}
                  onChange={(e) => setCreateDueDate(e.target.value)}
                />
              )}
            </div>

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Priority</div>
              <Select
                value={createPriority}
                onChange={(e) => setCreatePriority(e.target.value as "" | "low" | "medium" | "high")}
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </Select>
            </div>

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Assign to</div>
              <div className="space-y-2 rounded-md border border-border-light bg-white/70 p-2">
                <label className="flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={createAllowMulti}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCreateAllowMulti(checked);
                      if (!checked && createAssigneeIds.length > 1) {
                        setCreateAssigneeIds(createAssigneeIds.slice(0, 1));
                      }
                    }}
                  />
                  Assign to multiple users
                </label>

                <Input
                  value={assigneeSearch}
                  onChange={(e) => setAssigneeSearch(e.target.value)}
                  placeholder="Search user…"
                />

                <div className="max-h-40 overflow-auto rounded-md border border-border-light bg-white">
                  {filteredUsers.length ? (
                    filteredUsers.map((u) => {
                      const checked = createAssigneeIds.includes(u.id);
                      return (
                        <label
                          key={u.id}
                          className="flex cursor-pointer items-center gap-2 px-2 py-1 text-sm hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setCreateAssigneeIds((prev) => {
                                if (!createAllowMulti) {
                                  return isChecked ? [u.id] : [];
                                }
                                if (isChecked) {
                                  return prev.includes(u.id) ? prev : [...prev, u.id];
                                }
                                return prev.filter((id) => id !== u.id);
                              });
                            }}
                          />
                          <span className="truncate">{u.name || u.email}</span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="px-2 py-2 text-xs text-slate-500">No users found.</div>
                  )}
                </div>

                {createAssigneeIds.length ? (
                  <div className="text-xs text-slate-600">
                    Selected: {createAssigneeIds.length}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500">Unassigned</div>
                )}
              </div>
            </div>

            <div className="hidden sm:block" />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-700">Attachments</div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={creating}
                onClick={() => createFilesInputRef.current?.click()}
              >
                Add files
              </Button>
            </div>

            <input
              ref={createFilesInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setCreateFiles((prev) => [...prev, ...files]);
                e.currentTarget.value = "";
              }}
            />

            {createFiles.length ? (
              <div className="rounded-md border border-border-light bg-white/70 p-2 text-sm">
                {createFiles.map((f, idx) => (
                  <div key={`${f.name}-${f.size}-${idx}`} className="flex items-center justify-between gap-2 py-1">
                    <div className="min-w-0">
                      <div className="truncate text-slate-900">{f.name}</div>
                      <div className="text-[11px] text-slate-500">{(f.size / 1024).toFixed(1)} KB</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={creating}
                      onClick={() => setCreateFiles((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-critical-600"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">
                Attachments will upload after the task is created.
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" isLoading={creating}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
      </div>
    </div>
  );
}
