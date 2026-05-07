"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import type { ChecklistItem } from "@/types/task";

export function Checklist({
  items,
  canEdit,
  onToggle,
  onAdd,
  onDelete,
  busyIds,
}: {
  items: ChecklistItem[];
  canEdit: boolean;
  onToggle: (item: ChecklistItem, nextDone: boolean) => void;
  onAdd: (text: string) => void;
  onDelete: (item: ChecklistItem) => void;
  busyIds?: Set<number>;
}) {
  const [text, setText] = React.useState("");

  const sorted = React.useMemo(() => {
    return [...items].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [items]);

  return (
    <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Checklist</div>
      </div>

      <div className="space-y-2">
        {sorted.map((it) => {
          const busy = busyIds?.has(it.id) || false;
          return (
            <div key={it.id} className="flex items-center justify-between gap-3">
              <label className="flex min-w-0 items-center gap-2">
                <input
                  type="checkbox"
                  checked={!!it.is_done}
                  disabled={!canEdit || busy}
                  onChange={(e) => onToggle(it, e.target.checked)}
                />
                <span
                  className={[
                    "truncate text-sm",
                    it.is_done ? "line-through text-slate-500" : "text-slate-800 dark:text-slate-100",
                  ].join(" ")}
                >
                  {it.text}
                </span>
              </label>

              {canEdit ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onDelete(it)}
                  className="text-critical-600"
                >
                  Delete
                </Button>
              ) : null}
            </div>
          );
        })}

        {!sorted.length ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">No checklist items.</div>
        ) : null}
      </div>

      {canEdit ? (
        <div className="mt-4 flex items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add an item…"
          />
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              const trimmed = text.trim();
              if (!trimmed) return;
              onAdd(trimmed);
              setText("");
            }}
          >
            Add
          </Button>
        </div>
      ) : null}
    </div>
  );
}
