"use client";

import type { ChecklistItem } from "@/lib/tasks/types";
import { Checklist } from "@/components/tasks/Checklist";

export function TaskChecklist({
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
  return (
    <Checklist
      items={items as any}
      canEdit={canEdit}
      onToggle={(it, next) => onToggle(it as any, next)}
      onAdd={onAdd}
      onDelete={(it) => onDelete(it as any)}
      busyIds={busyIds}
    />
  );
}
