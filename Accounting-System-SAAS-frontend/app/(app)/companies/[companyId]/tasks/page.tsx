"use client";

import * as React from "react";
import useSWR from "swr";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import { X } from "lucide-react";
import { Select } from "@/components/ui/Select";
import { Drawer } from "@/components/ui/Drawer";
import { Card } from "@/components/ui/Card";
import { DateRangePicker, type DateRangeValue } from "@/components/ui/DateRangePicker";
import { TaskFilters, type TaskFiltersValue, MultiFilterSelect } from "@/components/tasks/TaskFilters";
import { usePermissions } from "@/components/PermissionsContext";
import { TaskDetail } from "@/components/tasks/TaskDetail";
import { TaskTable } from "@/components/tasks/TaskTable";
import { TaskCompactCard } from "@/components/tasks/TaskCompactCard";
import { TaskEmptyState, isDueToday, isTaskOverdue, useMediaQuery } from "@/components/tasks/TaskUI";
import { normalizePriority } from "@/components/tasks/TaskUI";
import { addTaskAssignees, forwardTask, uploadAttachment } from "@/lib/tasks/api";
import type { TaskSort } from "@/lib/tasks/api";
import { api } from "@/lib/api";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  useAddTaskAssignees,
  useAssignTask,
  useChecklistMutations,
  useCreateComment,
  useCreateTask,
  useDeleteAttachment,
  useForwardTask,
  usePatchTask,
  useRemoveTaskAssignee,
  useUpdateTaskAssigneeRole,
  useTask,
  useToggleReactions,
  useUploadAttachment,
  useTasks,
  useTenantUsers,
} from "@/lib/tasks/queries";

type CompanySettings = {
  company_id: number;
  calendar_mode: "AD" | "BS";
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type CreateAttachment = {
  id: string;
  file: File;
  selected: boolean;
  title: string;
};

export default function CompanyTasksPage({
  params,
}: {
  params: Promise<{ companyId: string }>;
}) {
  const { companyId: companyIdParam } = React.use(params);
  const companyId = Number(companyIdParam);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const permissions = usePermissions();
  const canCreateTask = permissions.isTenantAdmin || permissions.isSuperAdmin;

  const canVerifyTask =
    permissions.isTenantAdmin || permissions.isSuperAdmin || String(permissions.role || "").toLowerCase() === "admin";

  const canManageAssignments = permissions.isTenantAdmin || permissions.isSuperAdmin;

  const statusToProgress = React.useCallback((status: "todo" | "in_progress" | "done" | "verified") => {
    if (status === "todo") return 0;
    if (status === "in_progress") return 50;
    return 100;
  }, []);

  const selectedTaskIdParam = searchParams.get("taskId");
  const selectedTaskId = selectedTaskIdParam ? Number(selectedTaskIdParam) : null;

  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const [filters, setFilters] = React.useState<TaskFiltersValue>({
    q: "",
    status: "all",
    sort: "updated_desc",
    skip: 0,
    limit: 25,
  });

  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [priority, setPriority] = React.useState<string>("");
  const [dateRange, setDateRange] = React.useState<DateRangeValue>({ from: null, to: null });
  const [todayOnly, setTodayOnly] = React.useState(false);
  const prevDateRangeRef = React.useRef<DateRangeValue | null>(null);
  const [overdueOnly, setOverdueOnly] = React.useState(false);

  const { data: companySettings } = useSWR<CompanySettings>(
    Number.isFinite(companyId) && companyId > 0 ? `/companies/${companyId}/settings` : null,
    fetcher
  );
  const isBS = companySettings?.calendar_mode === "BS";

  const listParams = React.useMemo(
    () => ({
      q: filters.q || undefined,
      status: filters.status === "all" ? undefined : filters.status,
      sort: filters.sort as TaskSort,
      skip: filters.skip,
      limit: filters.limit,
      customer_ids: filters.customer_ids,
      department_ids: filters.department_ids,
      project_ids: filters.project_ids,
      task_head_ids: filters.task_head_ids,
    }),
    [filters]
  );

  const tasksQuery = useTasks(companyId, listParams);
  const tenantUsersQuery = useTenantUsers();

  const createTaskMutation = useCreateTask(companyId);
  const [createOpen, setCreateOpen] = React.useState(false);

  const [createTitle, setCreateTitle] = React.useState("");
  const [createDescription, setCreateDescription] = React.useState("");
  const [createDueDate, setCreateDueDate] = React.useState<string>("");
  const [createDueDateBS, setCreateDueDateBS] = React.useState<string>("");

  React.useEffect(() => {
    if (!isBS) {
      setCreateDueDateBS("");
      return;
    }
    setCreateDueDateBS(createDueDate ? safeADToBS(createDueDate) : "");
  }, [isBS, createDueDate]);

  const [createPriority, setCreatePriority] = React.useState<"" | "low" | "medium" | "high">("");
  const [createAssigneeId, setCreateAssigneeId] = React.useState<string>("");
  const [createAssigneeIds, setCreateAssigneeIds] = React.useState<string[]>([]);
  const [createAllowMulti, setCreateAllowMulti] = React.useState(false);
  const [assigneeSearch, setAssigneeSearch] = React.useState("");
  const [createAttachmentsEnabled, setCreateAttachmentsEnabled] = React.useState(false);
  const [createFiles, setCreateFiles] = React.useState<CreateAttachment[]>([]);
  const [createCustomerIds, setCreateCustomerIds] = React.useState<number[]>([]);
  const [createDepartmentIds, setCreateDepartmentIds] = React.useState<number[]>([]);
  const [createProjectIds, setCreateProjectIds] = React.useState<number[]>([]);
  const [createTaskHeadIds, setCreateTaskHeadIds] = React.useState<number[]>([]);
  const createFilesInputRef = React.useRef<HTMLInputElement | null>(null);
  const [createFilesDragOver, setCreateFilesDragOver] = React.useState(false);

  const [createTitlePickerOpen, setCreateTitlePickerOpen] = React.useState(false);
  const [templateSearch, setTemplateSearch] = React.useState("");

  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewItem, setPreviewItem] = React.useState<CreateAttachment | null>(null);
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null);
  const previewUrlRef = React.useRef<string | null>(null);

  const addCreateFiles = React.useCallback((files: File[]) => {
    if (!files.length) return;
    setCreateFiles((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
        file,
        selected: true,
        title: "",
      })),
    ]);
  }, []);

  React.useEffect(() => {
    if (previewUrlRef.current) {
      try {
        URL.revokeObjectURL(previewUrlRef.current);
      } catch {
        // ignore
      }
      previewUrlRef.current = null;
    }

    if (!previewOpen || !previewItem) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(previewItem.file);
    previewUrlRef.current = url;
    setPreviewUrl(url);

    return () => {
      if (previewUrlRef.current) {
        try {
          URL.revokeObjectURL(previewUrlRef.current);
        } catch {
          // ignore
        }
        previewUrlRef.current = null;
      }
    };
  }, [previewOpen, previewItem]);

  React.useEffect(() => {
    if (tasksQuery.error) {
      showToast({
        variant: "error",
        title: "Failed to load tasks",
        description: "Could not load tasks.",
      });
    }
  }, [tasksQuery.error, showToast]);

  const tasks = React.useMemo(() => tasksQuery.data?.results || [], [tasksQuery.data]);
  const total = React.useMemo(() => tasksQuery.data?.total || 0, [tasksQuery.data]);
  const canPrev = filters.skip > 0;
  const canNext = filters.skip + filters.limit < total;

  const users = tenantUsersQuery.data || [];
  const activeUsers = users.filter((u) => u.active);

  const desktopSidebarUsers = React.useMemo(() => {
    return activeUsers
      .map((u) => ({ id: String(u.id), label: u.name || u.email }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activeUsers]);

  const filteredTasks = React.useMemo(() => {
    const from = dateRange.from ? new Date(dateRange.from) : null;
    const to = dateRange.to ? new Date(dateRange.to) : null;

    return tasks.filter((t) => {
      if (todayOnly) {
        if (!isDueToday(t.due_date ?? null)) return false;
      }

      if (employeeId) {
        const assigneeIdStr = t.assignee_id != null ? String(t.assignee_id) : "";
        const inAssignees = Array.isArray((t as any).assignees)
          ? (t as any).assignees.some((a: any) => String(a?.id) === employeeId)
          : false;
        if (!(assigneeIdStr === employeeId || inAssignees)) return false;
      }

      if (priority) {
        const raw = (t as any).priority ?? (t as any).priority_level ?? (t as any).priorityLevel ?? null;
        if (normalizePriority(raw) !== priority) return false;
      }

      if (from || to) {
        if (!t.due_date) return false;
        const d = new Date(t.due_date);
        if (Number.isNaN(d.getTime())) return false;
        if (from && d < from) return false;
        if (to) {
          const toEnd = new Date(to.getFullYear(), to.getMonth(), to.getDate(), 23, 59, 59, 999);
          if (d > toEnd) return false;
        }
      }

      if (overdueOnly && !isTaskOverdue(t.due_date, t.status)) return false;

      return true;
    });
  }, [tasks, employeeId, priority, dateRange.from, dateRange.to, overdueOnly, todayOnly]);

  const titleHistory = React.useMemo(() => {
    const byTitle = new Map<
      string,
      { title: string; description: string | null; updated_at: string | null }
    >();
    for (const t of tasks) {
      const title = String((t as any)?.title || "").trim();
      if (!title) continue;
      const key = title.toLowerCase();
      const prev = byTitle.get(key);
      const updated = ((t as any)?.updated_at as string | undefined) || null;
      if (!prev || (updated && (!prev.updated_at || updated > prev.updated_at))) {
        byTitle.set(key, {
          title,
          description: ((t as any)?.description as string | undefined) || null,
          updated_at: updated,
        });
      }
    }
    return Array.from(byTitle.values())
      .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, 50);
  }, [tasks]);

  const filteredTemplates = React.useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return titleHistory;
    return titleHistory.filter((t) => {
      const label = `${t.title || ""} ${t.description || ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [titleHistory, templateSearch]);

  const filteredUsers = React.useMemo(() => {
    const q = assigneeSearch.trim().toLowerCase();
    if (!q) return activeUsers;
    return activeUsers.filter((u) => {
      const label = `${u.name || ""} ${u.email || ""}`.toLowerCase();
      return label.includes(q);
    });
  }, [activeUsers, assigneeSearch]);

  const selectedTaskQuery = useTask(companyId, selectedTaskId || 0);
  const patchMutation = usePatchTask(companyId, selectedTaskId || 0);
  const assignMutation = useAssignTask(companyId, selectedTaskId || 0);
  const addAssigneesMutation = useAddTaskAssignees(companyId, selectedTaskId || 0);
  const updateRoleMutation = useUpdateTaskAssigneeRole(companyId, selectedTaskId || 0);
  const removeAssigneeMutation = useRemoveTaskAssignee(companyId, selectedTaskId || 0);
  const uploadMutation = useUploadAttachment(companyId, selectedTaskId || 0);
  const deleteAttachmentMutation = useDeleteAttachment(companyId, selectedTaskId || 0);
  const checklist = useChecklistMutations(companyId, selectedTaskId || 0);
  const commentMutation = useCreateComment(companyId, selectedTaskId || 0);
  const reactions = useToggleReactions(companyId, selectedTaskId || 0);
  const forwardMutation = useForwardTask(companyId, selectedTaskId || 0);

  const [deletingAttachmentIds, setDeletingAttachmentIds] = React.useState<Set<number>>(() => new Set());
  const [busyChecklistIds, setBusyChecklistIds] = React.useState<Set<number>>(() => new Set());

  const extractErrorMessage = React.useCallback((err: any, fallback: string) => {
    const detail = err?.response?.data?.detail ?? err?.response?.data?.message ?? err?.message;
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    try {
      return JSON.stringify(detail);
    } catch {
      return fallback;
    }
  }, []);

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-slate-50/40">
      <div className="p-4 sm:p-6 space-y-4">
        {/* ── Hero Header ────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          {/* top accent line - indigo for tasks */}
          <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

            {/* Left: icon + text */}
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
              </div>
              <div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-0.5 flex items-center gap-1">
                  <Link href={`/companies/${companyId}`} className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">
                    Company
                  </Link>
                  <span>/</span>
                  <span className="text-slate-700 dark:text-slate-300 font-medium">Tasks</span>
                </div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Task Management</h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  Manage, assign, and track progress on all company tasks.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {canCreateTask && (
                <Button type="button" variant="primary" onClick={() => setCreateOpen(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all duration-150 active:scale-95 text-xs px-3 py-1.5 h-auto rounded-lg font-semibold flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                  </svg>
                  New Task
                </Button>
              )}
              <Link href={`/companies/${companyId}`}>
                <Button variant="outline" className="text-xs px-3 py-1.5 h-auto rounded-lg font-semibold flex items-center gap-1.5 border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/80">
                  <X className="w-3.5 h-3.5" />
                  Close
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="md:hidden sticky top-0 z-20 -mx-4 px-4 py-3 bg-slate-50/90 backdrop-blur border-b border-border-light">
          <div className="flex flex-wrap items-center gap-2">
            <TaskFilters companyId={companyId} value={filters} onChange={setFilters} />
            <Button
              type="button"
              variant={overdueOnly ? "primary" : "outline"}
              size="sm"
              onClick={() => setOverdueOnly((v) => !v)}
            >
              Overdue
            </Button>
          </div>
        </div>

        {tasksQuery.isLoading ? <TaskEmptyState title="Loading tasks…" /> : null}

        {!tasksQuery.isLoading && tasksQuery.isError ? (
          <div className="rounded-lg border border-critical-500/30 bg-critical-500/5 p-4 text-sm text-critical-600">
            Failed to load tasks.
          </div>
        ) : null}

        <div className="hidden md:block">
          <Card className="p-4 overflow-visible rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm bg-white dark:bg-slate-900 border-l-[3px] border-l-indigo-400 dark:border-l-indigo-500">
            <div className="flex items-center gap-2 mb-4">
              <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 3a1 1 0 011-1h12a1 1 0 011 1v3a1 1 0 01-.293.707L12 11.414V15a1 1 0 01-.293.707l-2 2A1 1 0 018 17v-5.586L3.293 6.707A1 1 0 013 6V3z" clipRule="evenodd" />
              </svg>
              <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">Advanced Filters</div>
            </div>
            <div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-8">
                  <TaskFilters companyId={companyId} value={filters} onChange={setFilters} />
                </div>

                <div className="md:col-span-2">
                  <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
                    <option value="">All Employees</option>
                    {desktopSidebarUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
                    <option value="">All Priority</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </div>

                <div className="md:col-span-8">
                  {isBS ? (
                    <div className="relative z-30 grid grid-cols-2 gap-2 overflow-visible">
                      <div className="relative z-50 min-w-0 overflow-visible">
                        <NepaliDatePicker
                          inputClassName="h-8 w-full rounded-md border border-border-light bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          value={safeADToBS(dateRange.from || "")}
                          onChange={(value: string) => {
                            const ad = safeBSToAD(value);
                            setDateRange((p) => ({ ...p, from: ad || null }));
                          }}
                          options={{ calenderLocale: "ne", valueLocale: "en" }}
                        />
                      </div>
                      <div className="relative z-50 min-w-0 overflow-visible">
                        <NepaliDatePicker
                          inputClassName="h-8 w-full rounded-md border border-border-light bg-white px-2 py-1 text-xs text-slate-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                          value={safeADToBS(dateRange.to || "")}
                          onChange={(value: string) => {
                            const ad = safeBSToAD(value);
                            setDateRange((p) => ({ ...p, to: ad || null }));
                          }}
                          options={{ calenderLocale: "ne", valueLocale: "en" }}
                        />
                      </div>
                    </div>
                  ) : (
                    <DateRangePicker value={dateRange} onChange={setDateRange} />
                  )}
                </div>

                <div className="md:col-span-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={todayOnly ? "primary" : "outline"}
                    className="w-full"
                    onClick={() => {
                      const today = new Date();
                      const todayStr = today.toISOString().slice(0, 10);
                      setTodayOnly((v) => {
                        const next = !v;
                        if (next) {
                          prevDateRangeRef.current = dateRange;
                          setDateRange({ from: todayStr, to: todayStr });
                        } else {
                          const prev = prevDateRangeRef.current;
                          if (prev) setDateRange(prev);
                        }
                        return next;
                      });
                    }}
                  >
                    Today
                  </Button>
                </div>

                <div className="md:col-span-1">
                  <label className="flex h-8 items-center justify-center gap-2 rounded-md border border-border-light bg-white px-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={overdueOnly}
                      onChange={(e) => setOverdueOnly(e.target.checked)}
                    />
                    Overdue
                  </label>
                </div>

                <div className="md:col-span-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setEmployeeId("");
                      setPriority("");
                      setDateRange({ from: null, to: null });
                      setOverdueOnly(false);
                    }}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {!tasksQuery.isLoading && !tasksQuery.isError ? (
          <>
            <div className="hidden lg:block">
              <TaskTable
                tasks={filteredTasks}
                onOpen={(taskId) => router.push(`/companies/${companyId}/tasks?taskId=${taskId}`)}
                isBS={isBS}
              />
            </div>

            <div className="lg:hidden grid grid-cols-1 gap-3">
              {filteredTasks.length ? (
                filteredTasks.map((t) => (
                  <TaskCompactCard
                    key={t.id}
                    title={t.title}
                    assigneeName={t.assignee_name}
                    status={t.status}
                    priority={normalizePriority(
                      (t as any).priority ?? (t as any).priority_level ?? (t as any).priorityLevel ?? null
                    )}
                    dueDate={t.due_date ?? null}
                    isBS={isBS}
                    progress={Number(t.progress || 0)}
                    createdAt={t.created_at}
                    customerName={t.customer_name}
                    departmentName={t.department_name}
                    projectName={t.project_name}
                    taskHeadName={t.task_head_name}
                    onClick={() => router.push(`/companies/${companyId}/tasks?taskId=${t.id}`)}
                  />
                ))
              ) : (
                <TaskEmptyState title="No tasks found" description="Try adjusting filters or search." />
              )}
            </div>
          </>
        ) : null}
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canPrev}
            onClick={() => setFilters((p) => ({ ...p, skip: Math.max(0, p.skip - p.limit) }))}
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={!canNext}
            onClick={() => setFilters((p) => ({ ...p, skip: p.skip + p.limit }))}
          >
            Next
          </Button>
        </div>
      </div>

      <Modal
        open={createOpen && canCreateTask}
        title="Create New Task"
        className="max-w-4xl"
        onClose={() => {
          if (createTaskMutation.isPending) return;
          setCreateOpen(false);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
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

            try {
              const description = createDescription.trim() || null;
              const due_date = createDueDate || null;

              const selectedRaw = createAssigneeIds.length
                ? createAssigneeIds
                : createAssigneeId
                  ? [createAssigneeId]
                  : [];
              const selected = selectedRaw.map((x) => Number(x)).filter((n) => Number.isFinite(n));

              const customerList = createCustomerIds.length ? createCustomerIds : [null];
              const departmentList = createDepartmentIds.length ? createDepartmentIds : [null];
              const projectList = createProjectIds.length ? createProjectIds : [null];
              const headList = createTaskHeadIds.length ? createTaskHeadIds : [null];

              for (const cid of customerList) {
                for (const did of departmentList) {
                  for (const pid of projectList) {
                    for (const hid of headList) {
                      const created = await createTaskMutation.mutateAsync({
                        title,
                        description,
                        due_date,
                        assignee_id: null,
                        priority: createPriority || null,
                        customer_id: cid,
                        department_id: did,
                        project_id: pid,
                        task_head_id: hid,
                      });

                      if (selected.length) {
                        await addTaskAssignees(companyId, created.id, selected, "EXECUTOR");
                      }

                      if (createAttachmentsEnabled && createFiles.length) {
                        for (const f of createFiles.filter((x) => x.selected)) {
                          try {
                            await uploadAttachment(companyId, created.id, f.file, {
                              title: f.title.trim() || null,
                            });
                          } catch {
                            // ignore individual fail
                          }
                        }
                      }
                    }
                  }
                }
              }


              setCreateTitle("");
              setCreateDescription("");
              setCreateDueDate("");
              setCreateDueDateBS("");
              setCreatePriority("");
              setCreateCustomerIds([]);
              setCreateDepartmentIds([]);
              setCreateProjectIds([]);
              setCreateTaskHeadIds([]);
              setCreateAssigneeId("");
              setCreateAssigneeIds([]);
              setCreateAllowMulti(false);
              setAssigneeSearch("");
              setCreateAttachmentsEnabled(false);
              setCreateFiles([]);

              setPreviewOpen(false);
              setPreviewItem(null);

              showToast({
                variant: "success",
                title: "Tasks Created",
                description: `Created ${customerList.length * departmentList.length * projectList.length * headList.length} task(s) successfully.`,
              });

              tasksQuery.refetch();

            } catch {
              showToast({
                variant: "error",
                title: "Failed to create task",
                description: "Could not create task.",
              });
            }
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
            <div className="md:col-span-12 space-y-0.5">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Task Title</div>
                <div className="relative">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[10px] px-1.5 text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                    disabled={createTaskMutation.isPending || !titleHistory.length}
                    onClick={() => setCreateTitlePickerOpen((v) => !v)}
                  >
                    Use Template
                  </Button>
                  {createTitlePickerOpen ? (
                    <div className="absolute right-0 z-50 mt-1 w-80 max-w-[85vw] overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl ring-1 ring-black/5">
                      <div className="p-2 border-b border-slate-100 bg-slate-50/30">
                        <Input
                          value={templateSearch}
                          onChange={(e) => setTemplateSearch(e.target.value)}
                          placeholder="Search themes..."
                          className="h-7 text-[10px] border-slate-200 bg-white"
                          autoFocus
                        />
                      </div>
                      <div className="max-h-56 overflow-auto py-1">
                        {filteredTemplates.length ? (
                          filteredTemplates.map((t) => (
                            <button
                              key={t.title}
                              type="button"
                              className="block w-full px-2 py-1.5 text-left text-xs hover:bg-slate-50 border-b border-slate-50 last:border-0"
                              onClick={() => {
                                setCreateTitle(t.title);
                                setCreateDescription(t.description || "");
                                setCreateTitlePickerOpen(false);
                                setTemplateSearch("");
                              }}
                            >
                              <div className="truncate font-semibold text-slate-800">{t.title}</div>
                              {t.description ? (
                                <div className="truncate text-[10px] text-slate-400 italic">{t.description}</div>
                              ) : null}
                            </button>
                          ))
                        ) : (
                          <div className="px-2 py-4 text-center text-[10px] text-slate-400 italic">No templates found</div>
                        )}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
              <Input 
                value={createTitle} 
                onChange={(e) => setCreateTitle(e.target.value)}
                placeholder="Brief title..."
                className="text-sm font-semibold h-8 border-slate-200 focus:border-indigo-500"
              />
            </div>

            <div className="md:col-span-6 space-y-3">
              <div className="space-y-0.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Description</div>
                <textarea
                  className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus-visible:outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all min-h-[60px]"
                  rows={2}
                  placeholder="Task details..."
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Customers</div>
                  <MultiFilterSelect
                    placeholder="None"
                    value={createCustomerIds}
                    companyId={companyId}
                    fetchFn={listCustomers}
                    onChange={(ids) => setCreateCustomerIds(ids as number[])}
                    className="h-8 text-[11px]"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Dept</div>
                  <MultiFilterSelect
                    placeholder="None"
                    value={createDepartmentIds}
                    companyId={companyId}
                    fetchFn={listDepartments}
                    onChange={(ids) => setCreateDepartmentIds(ids as number[])}
                    className="h-8 text-[11px]"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Projects</div>
                  <MultiFilterSelect
                    placeholder="None"
                    value={createProjectIds}
                    companyId={companyId}
                    fetchFn={listProjects}
                    onChange={(ids) => setCreateProjectIds(ids as number[])}
                    className="h-8 text-[11px]"
                  />
                </div>
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Categories</div>
                  <MultiFilterSelect
                    placeholder="None"
                    value={createTaskHeadIds}
                    companyId={companyId}
                    fetchFn={listTaskHeads}
                    onChange={(ids) => setCreateTaskHeadIds(ids as number[])}
                    className="h-8 text-[11px]"
                  />
                </div>
              </div>
            </div>

            <div className="md:col-span-6 space-y-3 bg-slate-50/40 p-3 rounded-lg border border-slate-100">
              <div className="grid grid-cols-1 gap-2.5">
                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Due Date</div>
                  {isBS ? (
                    <div className="relative z-50 overflow-visible">
                      <NepaliDatePicker
                        inputClassName="h-9 w-full rounded-md border border-slate-200 bg-white px-3 py-1 text-[12px] text-slate-900 !text-left shadow-sm focus:outline-none focus:ring-1 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
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
                      className="h-9 text-[12px] border-slate-200 !text-left px-3 cursor-pointer"
                      value={createDueDate}
                      onChange={(e) => setCreateDueDate(e.target.value)}
                      onClick={(e) => {
                        try {
                          (e.currentTarget as any).showPicker();
                        } catch (err) {
                        }
                      }}
                    />
                  )}
                </div>

                <div className="space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight text-left">Priority</div>
                  <Select
                    value={createPriority}
                    className="h-9 text-[12px] border-slate-200 !text-left px-3 cursor-pointer"
                    onChange={(e) => setCreatePriority(e.target.value as "" | "low" | "medium" | "high")}
                  >
                    <option value="">None</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Assign To</div>
                  <label className="flex items-center gap-1.5 text-[9px] font-bold text-indigo-600/70 cursor-pointer hover:text-indigo-600 transition-colors">
                    <input
                      type="checkbox"
                      className="rounded-sm w-3 h-3 text-indigo-600 focus:ring-indigo-500 border-indigo-200"
                      checked={createAllowMulti}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setCreateAllowMulti(checked);
                        if (!checked && createAssigneeIds.length > 1) {
                          const first = createAssigneeIds[0];
                          setCreateAssigneeIds(first ? [first] : []);
                          setCreateAssigneeId(first || "");
                        }
                      }}
                    />
                    Multiple
                  </label>
                </div>
                
                <div className="space-y-1 rounded-md border border-slate-200 bg-white p-1.5 shadow-sm">
                  <Input
                    value={assigneeSearch}
                    onChange={(e) => setAssigneeSearch(e.target.value)}
                    placeholder="Search..."
                    className="h-7 text-[10px] px-2 border-slate-100 bg-slate-50/50"
                  />

                  <div className="max-h-24 overflow-auto rounded border border-slate-50 bg-slate-50/20">
                    {filteredUsers.length ? (
                      filteredUsers.map((u) => {
                        const idStr = String(u.id);
                        const checked = createAssigneeIds.includes(idStr);
                        return (
                          <label
                            key={u.id}
                            className="flex cursor-pointer items-center gap-1.5 px-1.5 py-1 text-[11px] hover:bg-indigo-50/50 transition-colors border-b border-white last:border-0"
                          >
                            <input
                              type="checkbox"
                              className="rounded-sm text-indigo-600 h-3 w-3"
                              checked={checked}
                              onChange={(e) => {
                                const isChecked = e.target.checked;
                                setCreateAssigneeIds((prev) => {
                                  if (!createAllowMulti) {
                                    const next = isChecked ? [idStr] : [];
                                    setCreateAssigneeId(next.length === 1 ? next[0] : "");
                                    return next;
                                  }
                                  if (isChecked) {
                                    const next = prev.includes(idStr) ? prev : [...prev, idStr];
                                    if (next.length === 1) setCreateAssigneeId(next[0]);
                                    if (next.length !== 1) setCreateAssigneeId("");
                                    return next;
                                  }
                                  const next = prev.filter((x) => x !== idStr);
                                  if (next.length === 1) setCreateAssigneeId(next[0]);
                                  if (next.length !== 1) setCreateAssigneeId("");
                                  return next;
                                });
                              }}
                            />
                            <span className="truncate text-slate-600">{u.name || u.email}</span>
                          </label>
                        );
                      })
                    ) : (
                      <div className="py-2 text-[9px] text-slate-400 text-center italic">None found</div>
                    )}
                  </div>

                  <div className="flex items-center justify-between px-0.5">
                    <div className="text-[9px] font-bold text-slate-400">
                      {createAssigneeIds.length > 0 ? `${createAssigneeIds.length} users` : 'Unassigned'}
                    </div>
                    {createAssigneeIds.length > 0 && (
                      <button
                        type="button"
                        className="text-[9px] text-red-500 hover:text-red-600 font-bold"
                        onClick={() => {
                          setCreateAssigneeIds([]);
                          setCreateAssigneeId("");
                        }}
                      >
                        Reset
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-3 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 cursor-pointer group">
                <input
                  type="checkbox"
                  className="rounded-sm w-3.5 h-3.5 text-indigo-600 border-slate-300"
                  checked={createAttachmentsEnabled}
                  disabled={createTaskMutation.isPending}
                  onChange={(e) => setCreateAttachmentsEnabled(e.target.checked)}
                />
                <span className="text-[10px] font-bold text-slate-500 group-hover:text-indigo-600 uppercase tracking-tight">Attachments</span>
              </label>
              {createAttachmentsEnabled && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-6 text-[9px] px-2 bg-white"
                  disabled={createTaskMutation.isPending}
                  onClick={() => createFilesInputRef.current?.click()}
                >
                  Attach Files
                </Button>
              )}
            </div>

            <input
              ref={createFilesInputRef}
              type="file"
              className="hidden"
              multiple
              onChange={(e) => {
                if (!createAttachmentsEnabled) return;
                const files = Array.from(e.target.files || []);
                addCreateFiles(files);
                e.currentTarget.value = "";
              }}
            />

            {createAttachmentsEnabled && (
              <div className="space-y-1.5">
                {!createFiles.length ? (
                  <div
                    className={[
                      "rounded border border-dashed p-2 text-center transition-all cursor-pointer",
                      createFilesDragOver
                        ? "border-indigo-300 bg-indigo-50/30"
                        : "border-slate-200 bg-slate-50/20 hover:border-slate-300",
                    ].join(" ")}
                    onClick={() => !createTaskMutation.isPending && createFilesInputRef.current?.click()}
                  >
                    <div className="text-[9px] font-medium text-slate-400">
                      Drop files here or click to browse
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 max-h-32 overflow-auto pr-1">
                    {createFiles.map((f) => (
                      <div key={f.id} className="flex items-center gap-1.5 p-1.5 rounded border border-slate-100 bg-white group hover:border-indigo-100 shadow-sm">
                        <input
                          type="checkbox"
                          className="rounded-sm text-indigo-600 h-2.5 w-2.5"
                          checked={f.selected}
                          disabled={createTaskMutation.isPending}
                          onChange={(e) =>
                            setCreateFiles((prev) =>
                              prev.map((x) => (x.id === f.id ? { ...x, selected: e.target.checked } : x))
                            )
                          }
                        />
                        <div className="flex-1 min-w-0">
                          <div className="truncate text-[9px] font-bold text-slate-600 leading-tight">{f.file.name}</div>
                        </div>
                        <button
                          type="button"
                          className="text-slate-300 hover:text-red-500 transition-colors"
                          disabled={createTaskMutation.isPending}
                          onClick={() => setCreateFiles((prev) => prev.filter((x) => x.id !== f.id))}
                        >
                          <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="text-[9px] text-slate-400 font-medium italic">
              All tasks follow role-based visibility.
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                className="h-8 px-3 text-[10px] font-bold text-slate-500 hover:bg-slate-50"
                onClick={() => setCreateOpen(false)}
                disabled={createTaskMutation.isPending}
              >
                Discard
              </Button>
              <Button 
                type="submit" 
                variant="primary" 
                className="h-8 px-5 text-[10px] font-bold bg-indigo-600 hover:bg-indigo-700 shadow shadow-indigo-600/10 transition-all active:scale-[0.98]"
                isLoading={createTaskMutation.isPending}
              >
                Create Tasks
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      <Modal
        open={previewOpen}
        title={previewItem?.file.name || "Preview"}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewItem(null);
        }}
      >
        <div className="space-y-3">
          {previewItem ? (
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {previewItem.title ? previewItem.title : "(no title)"}
            </div>
          ) : null}

          {previewItem && previewUrl ? (
            previewItem.file.type.startsWith("image/") ? (
              <img
                src={previewUrl}
                alt={previewItem.file.name}
                className="max-h-[60vh] w-full rounded border border-border-light object-contain"
              />
            ) : previewItem.file.type === "application/pdf" ? (
              <iframe
                src={previewUrl}
                className="h-[60vh] w-full rounded border border-border-light"
                title={previewItem.file.name}
              />
            ) : (
              <div className="rounded-md border border-border-light bg-white/70 p-3 text-sm">
                <div className="text-slate-900">Preview not available for this file type.</div>
                <div className="mt-2">
                  <a href={previewUrl} target="_blank" rel="noreferrer" className="underline">
                    Open file
                  </a>
                </div>
              </div>
            )
          ) : (
            <div className="text-sm text-slate-600 dark:text-slate-300">No file selected.</div>
          )}

          {previewUrl ? (
            <div className="flex justify-end">
              <a href={previewUrl} download={previewItem?.file.name || undefined}>
                <Button type="button" variant="outline">
                  Download
                </Button>
              </a>
            </div>
          ) : null}
        </div>
      </Modal>

      <Drawer
        open={Boolean(selectedTaskId)}
        side={isDesktop ? "right" : "left"}
        widthClassName={isDesktop ? "max-w-2xl w-full" : "max-w-full w-full"}
        title="Task"
        onClose={() => router.push(`/companies/${companyId}/tasks`)}
      >
        {!selectedTaskId ? null : selectedTaskQuery.isLoading ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">Loading…</div>
        ) : selectedTaskQuery.isError || !selectedTaskQuery.data ? (
          <div className="text-sm text-critical-600">Could not load task.</div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Link
                href={`/companies/${companyId}/tasks/${selectedTaskId}`}
                className="text-xs text-slate-600 dark:text-slate-300 hover:underline"
              >
                Open full page
              </Link>
            </div>

            <TaskDetail
              data={selectedTaskQuery.data}
              tenantUsers={users}
              canVerify={canVerifyTask}
              canManageAssignments={canManageAssignments}
              deletingAttachmentIds={deletingAttachmentIds}
              busyChecklistIds={busyChecklistIds}
              onForward={(userId) => {
                if (!selectedTaskId) return;
                forwardMutation.mutate(
                  { assignee_id: userId },
                  {
                    onSuccess: () => {
                      showToast({
                        variant: "success",
                        title: "Task forwarded",
                        description: "Task has been forwarded successfully.",
                      });
                      router.push(`/companies/${companyId}/tasks`);
                    },
                    onError: (err) => {
                      showToast({
                        variant: "error",
                        title: "Forwarding failed",
                        description: extractErrorMessage(err, "Could not forward task."),
                      });
                    },
                  }
                );
              }}
              onStatus={(next) => {
                patchMutation.mutate(
                  { status: next, progress: statusToProgress(next) },
                  {
                    onError: (err) => {
                      showToast({
                        variant: "error",
                        title: "Failed to update task status",
                        description: extractErrorMessage(err, "Could not update task status."),
                      });
                    },
                  }
                );
              }}
              onProgress={(next) => {
                patchMutation.mutate(
                  { progress: next },
                  {
                    onError: (err) => {
                      showToast({
                        variant: "error",
                        title: "Failed to update task",
                        description: extractErrorMessage(err, "Could not update task."),
                      });
                    },
                  }
                );
              }}
              onAssign={(assigneeId) => {
                if (!canManageAssignments) return;

                const taskAny = selectedTaskQuery.data?.task as any;
                const due = taskAny?.due_date;
                const pr = normalizePriority(
                  taskAny?.priority ?? taskAny?.priority_level ?? taskAny?.priorityLevel ?? null
                );
                if (!due || !pr) {
                  showToast({
                    variant: "error",
                    title: "Cannot assign task",
                    description: "Please set Due date and Priority before assigning.",
                  });
                  return;
                }

                assignMutation.mutate({ assignee_id: assigneeId });
              }}
              onAssigneesAdd={(userIds, role) => {
                if (!canManageAssignments) return;
                if (!selectedTaskQuery.data?.permissions.can_assign) return;
                
                const taskAny = selectedTaskQuery.data?.task as any;
                const due = taskAny?.due_date;
                const pr = normalizePriority(taskAny?.priority ?? taskAny?.priority_level ?? taskAny?.priorityLevel ?? null);
                if (!due || !pr) {
                  showToast({
                    variant: "error",
                    title: "Cannot assign task",
                    description: "Please set Due date and Priority before assigning.",
                  });
                  return;
                }

                addAssigneesMutation.mutate({ userIds, role });
              }}
              onAssigneeRoleUpdate={(userId, role) => {
                if (!canManageAssignments) return;
                if (!selectedTaskQuery.data?.permissions.can_assign) return;
                updateRoleMutation.mutate({ userId, role });
              }}
              onAssigneeRemove={(userId) => {
                if (!canManageAssignments) return;
                if (!selectedTaskQuery.data?.permissions.can_assign) return;
                removeAssigneeMutation.mutate(userId);
              }}
              onUpload={async (files) => {
                if (!selectedTaskQuery.data?.permissions.can_upload) return;
                for (const f of files) {
                  await uploadMutation.mutateAsync(f);
                }
              }}
              onDeleteAttachment={async (attachmentId) => {
                if (!selectedTaskQuery.data?.permissions.can_upload) return;
                setDeletingAttachmentIds((prev) => new Set(prev).add(attachmentId));
                try {
                  await deleteAttachmentMutation.mutateAsync(attachmentId);
                } finally {
                  setDeletingAttachmentIds((prev) => {
                    const next = new Set(prev);
                    next.delete(attachmentId);
                    return next;
                  });
                }
              }}
              onChecklistAdd={(text) => {
                if (!selectedTaskQuery.data?.permissions.can_update) return;
                const nextOrder = (selectedTaskQuery.data.checklist || []).reduce(
                  (m, it) => Math.max(m, it.sort_order || 0),
                  0
                ) + 1;
                checklist.createItem.mutate({ text, sort_order: nextOrder });
              }}
              onChecklistToggle={(itemId, nextDone) => {
                if (!selectedTaskQuery.data?.permissions.can_update) return;
                setBusyChecklistIds((prev) => new Set(prev).add(itemId));
                checklist.toggleItem.mutate(
                  { itemId, is_done: nextDone },
                  {
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
                if (!selectedTaskQuery.data?.permissions.can_update) return;
                setBusyChecklistIds((prev) => new Set(prev).add(itemId));
                checklist.deleteItem.mutate(itemId, {
                  onSettled: () =>
                    setBusyChecklistIds((prev) => {
                      const next = new Set(prev);
                      next.delete(itemId);
                      return next;
                    }),
                });
              }}
              onAddComment={async (body) => {
                if (!selectedTaskQuery.data?.permissions.can_comment) return;
                await commentMutation.mutateAsync({ body });
              }}
              onToggleTaskReaction={(emoji) => {
                if (!(selectedTaskQuery.data?.permissions.can_comment || selectedTaskQuery.data?.permissions.can_update)) return;
                reactions.toggleTask.mutate({ emoji });
              }}
              onToggleCommentReaction={(commentId, emoji) => {
                if (!(selectedTaskQuery.data?.permissions.can_comment || selectedTaskQuery.data?.permissions.can_update)) return;
                reactions.toggleComment.mutate({ commentId, emoji });
              }}
            />
          </div>
        )}
      </Drawer>
    </div>
  );
}

// Reuse FilterSelect from TaskFilters if possible, or redefine if internal
import { listCustomers, listDepartments, listProjects } from "@/lib/api";
import { listTaskHeads } from "@/lib/tasks/api";
import { useQuery } from "@tanstack/react-query";

function FilterSelect({
  placeholder,
  value,
  companyId,
  fetchFn,
  onChange,
}: {
  placeholder: string;
  value?: number;
  companyId: number;
  fetchFn: (companyId: number) => Promise<any[]>;
  onChange: (id: number | null) => void;
}) {
  const { data } = useQuery({
    queryKey: [placeholder.toLowerCase().replace(" ", "-") + "-list", companyId],
    queryFn: () => fetchFn(companyId),
    enabled: !!companyId,
  });

  return (
    <Select
      value={value?.toString() || ""}
      onChange={(e) => {
        const val = e.target.value;
        onChange(val ? parseInt(val) : null);
      }}
    >
      <option value="">None</option>
      {data?.map((item) => (
        <option key={item.id} value={item.id}>
          {item.name}
        </option>
      ))}
    </Select>
  );
}
