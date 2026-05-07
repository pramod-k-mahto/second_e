"use client";

import * as React from "react";
import { safeADToBS } from "@/lib/bsad";

export type TaskUiStatus = "todo" | "in_progress" | "review" | "completed" | "blocked";

export function toUiStatus(status: string): TaskUiStatus {
  if (status === "todo") return "todo";
  if (status === "in_progress") return "in_progress";
  if (status === "verified") return "review";
  if (status === "done") return "completed";
  return "todo";
}

export function formatDueDate(dueDate: string | null | undefined, isBS?: boolean): string {
  if (!dueDate) return "—";
  if (isBS) {
    const bs = safeADToBS(dueDate);
    return bs || "—";
  }
  return dueDate;
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export function formatDurationHours(n?: number | null): string {
  if (n === null || n === undefined) return "—";
  if (!Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}h`;
}

export function isTaskOverdue(dueDate: string | null | undefined, status: string): boolean {
  if (!dueDate) return false;
  const ui = toUiStatus(status);
  if (ui === "completed") return false;

  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dd = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return dd.getTime() < today.getTime();
}

export function isDueToday(dueDate: string | null | undefined): boolean {
  if (!dueDate) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function normalizePriority(value: unknown): "low" | "medium" | "high" | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (v === "low" || v === "l") return "low";
    if (v === "medium" || v === "med" || v === "m") return "medium";
    if (v === "high" || v === "h" || v === "urgent") return "high";
    if (v === "1") return "low";
    if (v === "2") return "medium";
    if (v === "3") return "high";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value === 1) return "low";
    if (value === 2) return "medium";
    if (value === 3) return "high";
  }
  return null;
}

export function clampPct(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, n));
}

function statusClasses(uiStatus: TaskUiStatus) {
  if (uiStatus === "todo") return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-400 shadow-sm";
  if (uiStatus === "in_progress") return "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800/40 dark:bg-indigo-900/20 dark:text-indigo-300 shadow-sm";
  if (uiStatus === "review") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300 shadow-sm";
  if (uiStatus === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800/40 dark:bg-emerald-900/20 dark:text-emerald-300 shadow-sm";
  return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300 shadow-sm";
}


function statusLabel(uiStatus: TaskUiStatus) {
  if (uiStatus === "todo") return "Todo";
  if (uiStatus === "in_progress") return "In Progress";
  if (uiStatus === "review") return "Review";
  if (uiStatus === "completed") return "Completed";
  return "Blocked";
}

export function TaskStatusBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  const uiStatus = overdue ? "blocked" : toUiStatus(status);

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium",
        statusClasses(uiStatus),
      ].join(" ")}
    >
      {overdue ? "Overdue" : statusLabel(uiStatus)}
    </span>
  );
}

function priorityClasses(priority: string | null | undefined) {
  if (priority === "high") return "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-800/40 dark:bg-rose-900/20 dark:text-rose-300 shadow-sm";
  if (priority === "medium") return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800/40 dark:bg-amber-900/20 dark:text-amber-300 shadow-sm";
  if (priority === "low") return "border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-400 shadow-sm";
  return "border-dashed border-slate-200 bg-slate-50/50 text-slate-500 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-400";
}

function priorityLabel(priority: string | null | undefined) {
  if (priority === "high") return "High";
  if (priority === "medium") return "Medium";
  if (priority === "low") return "Low";
  return "—";
}

export function TaskPriorityBadge({ priority }: { priority: string | null | undefined }) {
  const p = normalizePriority(priority);
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-medium",
        priorityClasses(p),
      ].join(" ")}
    >
      {priorityLabel(p)}
    </span>
  );
}

export function TaskProgressBar({ value }: { value: number }) {
  const pct = clampPct(value);

  const barColor =
    pct >= 100
      ? "bg-gradient-to-r from-emerald-500 to-emerald-400 dark:from-emerald-400 dark:to-emerald-300"
      : pct >= 50
        ? "bg-gradient-to-r from-indigo-500 to-purple-500 dark:from-indigo-400 dark:to-purple-400"
        : pct > 0
          ? "bg-gradient-to-r from-amber-500 to-orange-400 dark:from-amber-400 dark:to-orange-300"
          : "bg-slate-300 dark:bg-slate-600";

  return (
    <div className="min-w-[6rem]">
      <div className="flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 font-medium font-sans">
        <span>Progress</span>
        <span className={[
          "tabular-nums font-bold",
          pct >= 100 ? "text-emerald-600 dark:text-emerald-400" : "",
        ].join(" ")}>{pct}%</span>
      </div>
      <div className="mt-1 h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200/50 dark:border-slate-700/50 overflow-hidden shadow-inner flex items-center">
        <div className={["h-full rounded-full transition-all duration-500 ease-out", barColor].join(" ")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TaskEmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 border-dashed dark:border-slate-700/60 bg-white/50 dark:bg-slate-900/50 p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
        <svg className="h-6 w-6 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
          <line x1="16" y1="2" x2="16" y2="6"></line>
          <line x1="8" y1="2" x2="8" y2="6"></line>
          <line x1="3" y1="10" x2="21" y2="10"></line>
        </svg>
      </div>
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      {description ? (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-sm mx-auto">{description}</p>
      ) : null}
    </div>
  );
}

export function useMediaQuery(query: string) {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mq = window.matchMedia(query);
    const update = () => setMatches(Boolean(mq.matches));
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [query]);

  return matches;
}
