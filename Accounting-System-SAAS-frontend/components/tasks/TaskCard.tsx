"use client";

import Link from "next/link";
import type { TaskSummary } from "@/types/task";
import { formatDateTime, formatDurationHours } from "@/components/tasks/TaskUI";

function statusLabel(status: TaskSummary["status"]) {
  if (status === "todo") return "Todo";
  if (status === "in_progress") return "In progress";
  if (status === "done") return "Done";
  return "Verified";
}

function statusPillClasses(status: TaskSummary["status"]) {
  if (status === "verified") return "bg-indigo-100 text-indigo-800 border-indigo-200";
  if (status === "done") return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (status === "in_progress") return "bg-amber-100 text-amber-800 border-amber-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

export function TaskCard({ task }: { task: TaskSummary }) {
  const pct = Math.max(0, Math.min(100, Number(task.progress || 0)));
  const due = task.due_date || null;

  return (
    <Link
      href={`/tasks/${task.id}`}
      className="block rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {task.title}
            </div>
            <span
              className={[
                "shrink-0 rounded-full border px-2 py-0.5 text-[10px]",
                statusPillClasses(task.status),
              ].join(" ")}
            >
              {statusLabel(task.status)}
            </span>
          </div>
          {task.description ? (
            <div className="mt-1 line-clamp-2 text-xs text-slate-600 dark:text-slate-300">
              {task.description}
            </div>
          ) : null}
        </div>
        <div className="shrink-0 text-right">
          {due ? (
            <div className="text-[11px] text-slate-600 dark:text-slate-300">Due {due}</div>
          ) : (
            <div className="text-[11px] text-slate-400">No due date</div>
          )}
          <div className="mt-1 text-[11px] text-slate-600 dark:text-slate-300">
            {task.assignee_name ? `@${task.assignee_name}` : "Unassigned"}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="flex items-center justify-between text-[11px] text-slate-600 dark:text-slate-300">
          <span>Progress</span>
          <span>{pct}%</span>
        </div>
        <div className="mt-1 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-2 rounded-full bg-brand-600"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600 dark:text-slate-300 sm:grid-cols-4">
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Checklist {task.checklist_done}/{task.checklist_total}
        </div>
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Comments {task.comments}
        </div>
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Files {task.attachments}
        </div>
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Reactions {task.reactions}
        </div>
      </div>

      <div className="mt-2 grid grid-cols-1 gap-2 text-[11px] text-slate-600 dark:text-slate-300 sm:grid-cols-3">
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Assigned: {formatDateTime(task.assigned_at)}
        </div>
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Completed: {formatDateTime(task.completed_at)}
        </div>
        <div className="rounded border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-2 py-1">
          Duration: {formatDurationHours(task.completion_duration_hours)}
        </div>
      </div>
    </Link>
  );
}
