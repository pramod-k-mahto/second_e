"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import type { TaskStatus, TaskSummary } from "@/types/task";
import { formatDateTime, formatDurationHours } from "@/components/tasks/TaskUI";

const STATUSES: TaskStatus[] = ["todo", "in_progress", "done"];

function statusToProgress(status: TaskStatus): number {
  if (status === "todo") return 0;
  if (status === "in_progress") return 50;
  return 100;
}

function label(status: TaskStatus) {
  if (status === "todo") return "Todo";
  if (status === "in_progress") return "In progress";
  if (status === "done") return "Done";
  return "Verified";
}

export function TaskDetailHeader({
  task,
  canUpdate,
  canVerify,
  onStatus,
  onProgress,
}: {
  task: TaskSummary;
  canUpdate: boolean;
  canVerify?: boolean;
  onStatus: (next: TaskStatus) => void;
  onProgress: (next: number) => void;
}) {
  const lockedByVerify = task.status === "verified";
  const effectivePct = statusToProgress(task.status);

  return (
    <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-lg font-semibold text-slate-900 dark:text-slate-100 truncate">
            {task.title}
          </div>
          {task.description ? (
            <div className="mt-1 text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
              {task.description}
            </div>
          ) : null}
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <span className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
              Status: {label(task.status)}
            </span>
            <span className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
              Due: {task.due_date || "—"}
            </span>
            <span className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
              Assignee: {task.assignee_name || "Unassigned"}
            </span>
            <span className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
              Assigned: {formatDateTime(task.assigned_at)}
            </span>
            <span className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
              Completed: {formatDateTime(task.completed_at)}
            </span>
            <span className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
              Duration: {formatDurationHours(task.completion_duration_hours)}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {task.customer_name && (
              <div className="flex items-center gap-2 text-xs">
                 <span className="text-slate-500">Customer:</span>
                 <span className="font-medium text-slate-900 dark:text-slate-100">{task.customer_name}</span>
              </div>
            )}
            {(task.department_name || task.project_name || task.task_head_name) && (
              <div className="flex flex-col gap-1.5 text-xs">
                {task.department_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Department:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{task.department_name}</span>
                  </div>
                )}
                {task.project_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Project:</span>
                    <span className="font-medium text-slate-700 dark:text-slate-200">{task.project_name}</span>
                  </div>
                )}
                {task.task_head_name && (
                  <div className="flex items-center gap-2">
                    <span className="text-slate-500">Task Head:</span>
                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{task.task_head_name}</span>
                  </div>
                )}
              </div>
            )}
            {task.forwarded_from_name && (
              <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium col-span-full">
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                  <path d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                </svg>
                <span>Forwarded from {task.forwarded_from_name}</span>
              </div>
            )}
          </div>
        </div>

        <div className="w-full sm:w-[420px]">
          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-300">
            <span>Progress</span>
            <span>{effectivePct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={effectivePct}
            disabled
            onChange={(e) => onProgress(Number(e.target.value))}
            className="mt-2 w-full h-3"
          />

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            {STATUSES.map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={task.status === s ? "primary" : "outline"}
                disabled={!canUpdate || lockedByVerify}
                onClick={() => onStatus(s)}
                className="min-w-0 px-2.5"
              >
                <span className="block truncate">{label(s)}</span>
              </Button>
            ))}

            <Button
              key="verified"
              type="button"
              size="sm"
              variant={task.status === "verified" ? "primary" : "outline"}
              disabled={!canVerify}
              onClick={() => onStatus(task.status === "verified" ? "done" : "verified")}
              className="min-w-0 px-2.5"
            >
              <span className="block truncate">Verified</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
