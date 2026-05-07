"use client";

import * as React from "react";
import Link from "next/link";
import { TaskPriorityBadge, TaskProgressBar, TaskStatusBadge, formatDueDate, formatDateTime, isTaskOverdue } from "@/components/tasks/TaskUI";

export function TaskCompactCard({
  href,
  title,
  assigneeName,
  status,
  priority,
  dueDate,
  isBS,
  progress,
  onClick,
  selected,
  createdAt,
  customerName,
  departmentName,
  projectName,
  taskHeadName,
  footer,
}: {
  href?: string;
  title: string;
  assigneeName?: string | null;
  status: string;
  priority?: string | null;
  dueDate?: string | null;
  isBS?: boolean;
  progress: number;
  onClick?: () => void;
  selected?: boolean;
  createdAt?: string | null;
  customerName?: string | null;
  departmentName?: string | null;
  projectName?: string | null;
  taskHeadName?: string | null;
  footer?: React.ReactNode;
}) {
  const overdue = isTaskOverdue(dueDate, status);

  const accentBorder = overdue
    ? "border-l-rose-500"
    : status === "done"
      ? "border-l-emerald-500"
      : status === "in_progress"
        ? "border-l-indigo-500"
        : "border-l-slate-300 dark:border-l-slate-600";

  const content = (
    <div
      className={[
        "group/card rounded-2xl border border-l-[3px] bg-white dark:bg-slate-900 p-4 transition-all duration-200 shadow-sm hover:shadow-lg hover:-translate-y-0.5",
        accentBorder,
        overdue
          ? "border-rose-200/80 dark:border-rose-800/40 bg-gradient-to-br from-white to-rose-50/30 dark:from-slate-900 dark:to-rose-950/10"
          : "border-slate-200/80 dark:border-slate-700/60 hover:border-indigo-200 dark:hover:border-indigo-800/60",
        selected ? "ring-2 ring-indigo-500 ring-offset-1 border-transparent" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-bold text-slate-800 dark:text-slate-100 group-hover/card:text-indigo-700 dark:group-hover/card:text-indigo-300 transition-colors">{title}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <TaskPriorityBadge priority={priority ?? null} />
            <TaskStatusBadge status={status} overdue={overdue} />
            <div className="text-[10px] text-slate-400 font-medium ml-0.5 whitespace-nowrap">
               {formatDateTime(createdAt)}
            </div>
          </div>
          {(customerName || departmentName || projectName || taskHeadName) && (
            <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 border-t border-slate-50 dark:border-slate-800/50 pt-2 text-[10px] text-slate-500">
               {customerName && (
                 <div className="flex items-center gap-1">
                   <span className="font-bold text-slate-400 uppercase tracking-tighter">C:</span>
                   <span className="truncate max-w-[80px]">{customerName}</span>
                 </div>
               )}
               {departmentName && (
                 <div className="flex items-center gap-1">
                   <span className="font-bold text-slate-400 uppercase tracking-tighter">D:</span>
                   <span className="truncate max-w-[80px]">{departmentName}</span>
                 </div>
               )}
               {projectName && (
                 <div className="flex items-center gap-1">
                   <span className="font-bold text-slate-400 uppercase tracking-tighter">P:</span>
                   <span className="truncate max-w-[80px]">{projectName}</span>
                 </div>
               )}
               {taskHeadName && (
                 <div className="flex items-center gap-1">
                   <span className="font-bold text-indigo-400 uppercase tracking-tighter">H:</span>
                   <span className="truncate max-w-[80px] text-indigo-600 dark:text-indigo-400">{taskHeadName}</span>
                 </div>
               )}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right space-y-1.5">
          <div className={[
            "text-[10px] font-semibold tracking-wide uppercase px-2.5 py-1 rounded-lg inline-flex items-center gap-1",
            overdue
              ? "bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300 border border-rose-100 dark:border-rose-800/30"
              : "bg-slate-50 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-100 dark:border-slate-700/40",
          ].join(" ")}
          >
            <svg className="w-3 h-3 opacity-60" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
            {formatDueDate(dueDate, isBS)}
          </div>
          <div className="flex items-center justify-end gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            <div className={[
              "flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold",
              assigneeName
                ? "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400"
                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500",
            ].join(" ")}>
              {assigneeName ? assigneeName.charAt(0).toUpperCase() : "?"}
            </div>
            <span className="truncate max-w-[90px]">{assigneeName ? assigneeName : "Unassigned"}</span>
          </div>
        </div>
      </div>

      <div className="mt-3.5">
        <TaskProgressBar value={progress} />
      </div>

      {footer ? (
        <div
          className="mt-3.5 flex items-center gap-2 border-t border-slate-100 dark:border-slate-800 pt-3"
          onClick={(e) => e.stopPropagation()}
        >
          {footer}
        </div>
      ) : null}
    </div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left">
        {content}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} className="block">
        {content}
      </Link>
    );
  }

  return content;
}
