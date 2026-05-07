"use client";

import { useMemo, useState } from "react";

type Item = { id: number; name: string };

type Props = {
  dimension: "department" | "project";
  initialIdsCsv: string;
  departments: Item[];
  projects: Item[];
  setSelectedIdsCsv?: (csv: string) => void;
};

export function ComparisonIdsSelector({
  dimension,
  initialIdsCsv,
  departments,
  projects,
  setSelectedIdsCsv,
}: Props) {
  const initialIds = useMemo(
    () =>
      (initialIdsCsv || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    [initialIdsCsv],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(initialIds);

  const items = dimension === "department" ? departments : projects;

  const toggleId = (idStr: string) => {
    const next = selectedIds.includes(idStr)
      ? selectedIds.filter((x) => x !== idStr)
      : [...selectedIds, idStr];
    setSelectedIds(next);
    if (setSelectedIdsCsv) setSelectedIdsCsv(next.join(","));
  };

  return (
    <div className="rounded border border-slate-200 bg-white p-3 text-xs">
      <input
        type="hidden"
        name="ids"
        value={selectedIds.join(",")}
      />
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {dimension === "department" ? "Departments" : "Projects"} to compare
      </div>
      <div className="flex flex-wrap gap-4">
        {items.map((item) => {
          const idStr = String(item.id);
          const checked = selectedIds.includes(idStr);
          return (
            <label
              key={item.id}
              className="flex items-center gap-1 text-xs text-slate-700"
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleId(idStr)}
              />
              <span>
                {item.name} (ID: {item.id})
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
