"use client";

import * as React from "react";
import type { TaskSummary } from "@/lib/tasks/types";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import {
  TaskPriorityBadge,
  TaskProgressBar,
  TaskStatusBadge,
  formatDueDate,
  formatDateTime,
  isTaskOverdue,
  normalizePriority,
} from "@/components/tasks/TaskUI";

export function TaskTable({
  tasks,
  onOpen,
  isBS,
}: {
  tasks: TaskSummary[];
  onOpen: (taskId: number) => void;
  isBS?: boolean;
}) {
  const columns = React.useMemo<DataTableColumn<TaskSummary>[]>(
    () => [
      {
        id: "title",
        header: "Task",
        accessor: (t) => (
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{t.title}</div>
            {t.forwarded_from_name && (
              <div className="text-[10px] text-indigo-500 font-medium truncate">
                Forwarded from {t.forwarded_from_name}
              </div>
            )}
          </div>
        ),
        className: "w-[15%] px-2",
      },
      {
        id: "customer",
        header: "Customer",
        accessor: (t) => (
          <div className="truncate text-slate-700">{t.customer_name || "—"}</div>
        ),
        className: "w-[10%] px-2",
      },
      {
        id: "handover",
        header: "Context",
        accessor: (t) => (
          <div className="text-[11px] leading-tight space-y-0.5">
            {t.department_name && (
              <div className="text-slate-600 truncate" title="Department">
                D: {t.department_name}
              </div>
            )}
            {t.project_name && (
              <div className="text-slate-600 truncate" title="Project">
                P: {t.project_name}
              </div>
            )}
            {t.task_head_name && (
              <div className="text-indigo-600 font-medium truncate" title="Category">
                H: {t.task_head_name}
              </div>
            )}
            {!t.department_name && !t.project_name && !t.task_head_name && "—"}
          </div>
        ),
        className: "w-[12%] px-2",
      },
      {
        id: "assigned",
        header: "Assigned",
        accessor: (t) => (
          <div className="truncate text-slate-700">{t.assignee_name || "—"}</div>
        ),
        className: "w-[10%] px-2",
      },
      {
        id: "priority",
        header: "Priority",
        accessor: (t) => {
          const anyT = t as any;
          const raw =
            anyT.priority ??
            anyT.priority_level ??
            anyT.priorityLevel ??
            anyT.task_priority ??
            anyT.taskPriority ??
            anyT.task?.priority ??
            anyT.task?.priority_level ??
            anyT.task?.priorityLevel ??
            null;
          return <TaskPriorityBadge priority={normalizePriority(raw)} />;
        },
        className: "w-[8%] px-2",
      },
      {
        id: "status",
        header: "Status",
        accessor: (t) => (
          <TaskStatusBadge status={t.status} overdue={isTaskOverdue(t.due_date, t.status)} />
        ),
        className: "w-[8%] px-2",
      },
      {
        id: "created",
        header: "Created",
        accessor: (t) => (
          <div className="text-[10px] text-slate-500 font-medium leading-tight">
            {formatDateTime(t.created_at)}
          </div>
        ),
        className: "w-[12%] px-2",
      },
      {
        id: "due",
        header: "Due",
        accessor: (t) => (
          <span
            className={[
              "tabular-nums whitespace-nowrap",
              isTaskOverdue(t.due_date, t.status) ? "text-rose-700" : "text-slate-700",
            ].join(" ")}
          >
            {formatDueDate(t.due_date, isBS)}
          </span>
        ),
        className: "w-[8%] px-2",
      },
      {
        id: "progress",
        header: "Progress",
        accessor: (t) => <TaskProgressBar value={Number(t.progress || 0)} />,
        className: "w-[10%] px-2",
      },
      {
        id: "actions",
        header: "",
        accessor: (t) => (
          <div className="flex justify-end">
            <button
              type="button"
              className="group flex items-center justify-center h-7 w-7 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 dark:hover:border-indigo-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 transition-colors shadow-sm"
              onClick={() => onOpen(t.id)}
              aria-label="Open Task"
              title="Open Task"
            >
              <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ),
        justify: "right",
        className: "w-[5%] px-1",
      },
    ],
    [onOpen, isBS]
  );

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 shadow-sm bg-white dark:bg-slate-900 overflow-hidden">
      <DataTable
        columns={columns}
        data={tasks}
        getRowKey={(row) => row.id}
        emptyMessage="No tasks found."
        className="text-sm"
      />
    </div>
  );
}
