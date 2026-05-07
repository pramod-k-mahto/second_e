"use client";

export function TaskListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-l-[3px] border-slate-200/80 dark:border-slate-700/40 border-l-slate-300 dark:border-l-slate-600 bg-white dark:bg-slate-900 p-4 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-2 flex-1">
              <div className="h-4 w-3/4 rounded-lg bg-slate-200 dark:bg-slate-800" />
              <div className="flex gap-1.5">
                <div className="h-5 w-14 rounded-full bg-slate-100 dark:bg-slate-700" />
                <div className="h-5 w-16 rounded-full bg-slate-100 dark:bg-slate-700" />
              </div>
            </div>
            <div className="space-y-1.5 shrink-0">
              <div className="h-6 w-20 rounded-lg bg-slate-100 dark:bg-slate-800" />
              <div className="h-4 w-16 ml-auto rounded bg-slate-100 dark:bg-slate-700" />
            </div>
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
  );
}

export function TaskDetailSkeleton() {
  return (
    <div className="space-y-4">
      <div className="animate-pulse rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
        <div className="h-5 w-64 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-2 h-3 w-full max-w-xl rounded bg-slate-100 dark:bg-slate-700" />
        <div className="mt-4 h-8 w-full rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="animate-pulse rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
        <div className="h-4 w-28 rounded bg-slate-200 dark:bg-slate-800" />
        <div className="mt-3 h-3 w-3/4 rounded bg-slate-100 dark:bg-slate-700" />
        <div className="mt-2 h-3 w-2/3 rounded bg-slate-100 dark:bg-slate-700" />
      </div>
    </div>
  );
}
