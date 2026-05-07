"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import type { TenantUser } from "@/lib/tasks/types";

export type AssigneeLite = { id: number; name?: string | null; email?: string | null };

export function TaskAssignees({
  assignees,
  users,
  canEdit,
  onAdd,
  onRemove,
}: {
  assignees: AssigneeLite[];
  users: TenantUser[];
  canEdit: boolean;
  onAdd: (userIds: number[]) => void;
  onRemove: (userId: number) => void;
}) {
  const [pendingAdd, setPendingAdd] = React.useState<string[]>([]);

  const activeUsers = React.useMemo(() => (users || []).filter((u) => u.active), [users]);
  const assignedIds = React.useMemo(() => new Set((assignees || []).map((a) => a.id)), [assignees]);

  const available = React.useMemo(() => {
    return activeUsers.filter((u) => !assignedIds.has(u.id));
  }, [activeUsers, assignedIds]);

  return (
    <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Assignees</div>
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            {assignees?.length ? `${assignees.length} assigned` : "No assignees"}
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(assignees || []).map((a) => (
          <div
            key={a.id}
            className="inline-flex items-center gap-2 rounded-full border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 px-3 py-1 text-xs text-slate-800 dark:text-slate-200"
          >
            <span className="max-w-[220px] truncate">
              {a.name || a.email || `User #${a.id}`}
            </span>
            {canEdit ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-critical-600"
                onClick={() => onRemove(a.id)}
              >
                Remove
              </Button>
            ) : null}
          </div>
        ))}

        {!assignees?.length ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">—</div>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Add assignees</div>
        <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]">
          <select
            multiple
            disabled={!canEdit}
            className="flex h-28 w-full rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:opacity-60"
            value={pendingAdd}
            onChange={(e) => {
              const vals = Array.from(e.target.selectedOptions).map((o) => o.value).filter(Boolean);
              setPendingAdd(vals);
            }}
          >
            {available.map((u) => (
              <option key={u.id} value={String(u.id)}>
                {u.name || u.email}
              </option>
            ))}
          </select>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              disabled={!canEdit || !pendingAdd.length}
              onClick={() => {
                const ids = pendingAdd.map((x) => Number(x)).filter((n) => Number.isFinite(n));
                if (!ids.length) return;
                onAdd(ids);
                setPendingAdd([]);
              }}
            >
              Add
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!pendingAdd.length}
              onClick={() => setPendingAdd([])}
            >
              Clear
            </Button>
          </div>
        </div>

        {!available.length ? (
          <div className="mt-2 text-xs text-slate-500">All active users are already assigned.</div>
        ) : null}
      </div>
    </div>
  );
}
