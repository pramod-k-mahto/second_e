"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import type { TenantUser, CollaboratorRole } from "@/lib/tasks/types";

export type CollaboratorLite = { 
  id: number; 
  name?: string | null; 
  email?: string | null; 
  role?: CollaboratorRole | null;
};

const ROLES: CollaboratorRole[] = ["OBSERVER", "CONTRIBUTOR", "EXECUTOR", "APPROVER"];

export function TaskCollaborators({
  collaborators,
  users,
  canEdit,
  onAdd,
  onRemove,
  onUpdateRole,
}: {
  collaborators: CollaboratorLite[];
  users: TenantUser[];
  canEdit: boolean;
  onAdd: (userIds: number[], role: CollaboratorRole) => void;
  onRemove: (userId: number) => void;
  onUpdateRole: (userId: number, role: CollaboratorRole) => void;
}) {
  const [pendingAdd, setPendingAdd] = React.useState<string[]>([]);
  const [pendingRole, setPendingRole] = React.useState<CollaboratorRole>("EXECUTOR");

  const activeUsers = React.useMemo(() => (users || []).filter((u) => u.active), [users]);
  const assignedIds = React.useMemo(() => new Set((collaborators || []).map((a) => a.id)), [collaborators]);

  const available = React.useMemo(() => {
    return activeUsers.filter((u) => !assignedIds.has(u.id));
  }, [activeUsers, assignedIds]);

  return (
    <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Task Collaborators
            <span className="px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] uppercase tracking-wider font-bold">New</span>
          </div>
          <div className="mt-0.5 text-xs text-slate-600 dark:text-slate-300">
            {collaborators?.length ? `${collaborators.length} collaborators` : "No collaborators"}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {(collaborators || []).map((a) => (
          <div
            key={a.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border-light dark:border-border-dark bg-white/50 dark:bg-slate-950/20 p-2 text-sm"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                {a.name || a.email || `User #${a.id}`}
              </span>
              <span className="text-[10px] text-slate-500 uppercase tracking-tighter">
                {a.email}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <select
                disabled={!canEdit}
                className="h-7 rounded border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-2 py-0 text-[11px] font-semibold text-slate-700 dark:text-slate-300 shadow-sm transition-colors focus:ring-1 focus:ring-brand-500 disabled:opacity-60"
                value={a.role || "EXECUTOR"}
                onChange={(e) => onUpdateRole(a.id, e.target.value as CollaboratorRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>

              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 text-critical-600 hover:bg-critical-50 dark:hover:bg-critical-900/20"
                  onClick={() => onRemove(a.id)}
                  title="Remove collaborator"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                </Button>
              ) : null}
            </div>
          </div>
        ))}

        {!collaborators?.length ? (
          <div className="py-4 text-center text-xs italic text-slate-500">
            No collaborators assigned yet. Use the tool below to invite team members.
          </div>
        ) : null}
      </div>

      <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
        <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Add Collaborators
        </label>
        
        <div className="mt-2 space-y-3">
          <select
            multiple
            disabled={!canEdit}
            className="flex h-32 w-full rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-1 disabled:opacity-60"
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

          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Assign as:</span>
              <select
                disabled={!canEdit || !pendingAdd.length}
                className="h-8 rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-0 text-xs font-medium text-slate-900 dark:text-slate-100 shadow-sm transition-colors focus:ring-2 focus:ring-brand-500 disabled:opacity-60"
                value={pendingRole}
                onChange={(e) => setPendingRole(e.target.value as CollaboratorRole)}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                disabled={!pendingAdd.length}
                onClick={() => {
                  setPendingAdd([]);
                  setPendingRole("EXECUTOR");
                }}
              >
                Clear
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                className="h-8 bg-brand-600 hover:bg-brand-700"
                disabled={!canEdit || !pendingAdd.length}
                onClick={() => {
                  const ids = pendingAdd.map((x) => Number(x)).filter((n) => Number.isFinite(n));
                  if (!ids.length) return;
                  onAdd(ids, pendingRole);
                  setPendingAdd([]);
                  setPendingRole("EXECUTOR");
                }}
              >
                Add Selected
              </Button>
            </div>
          </div>
        </div>

        {!available.length && activeUsers.length > 0 ? (
          <div className="mt-3 text-[10px] text-slate-500 text-center">
            All active team members are already collaborators.
          </div>
        ) : null}
      </div>
    </div>
  );
}
