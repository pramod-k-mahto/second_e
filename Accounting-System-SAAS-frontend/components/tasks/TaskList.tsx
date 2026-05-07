"use client";

import type { TaskSummary } from "@/types/task";
import { TaskCard } from "@/components/tasks/TaskCard";

export function TaskList({ tasks }: { tasks: TaskSummary[] }) {
  if (!tasks.length) {
    return (
      <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-6 text-sm text-slate-600 dark:text-slate-300">
        No tasks found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-3">
      {tasks.map((t) => (
        <TaskCard key={t.id} task={t} />
      ))}
    </div>
  );
}
