"use client";

import * as React from "react";

export type ImportStepKey = "upload" | "mapping" | "validate" | "commit" | "results";

const TABS: { key: ImportStepKey; label: string }[] = [
  { key: "upload", label: "Upload" },
  { key: "mapping", label: "Mapping" },
  { key: "validate", label: "Validate" },
  { key: "commit", label: "Commit" },
  { key: "results", label: "Results & Errors" },
];

export function ImportStepperTabs({
  value,
  onChange,
}: {
  value: ImportStepKey;
  onChange: (v: ImportStepKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {TABS.map((t) => {
        const active = t.key === value;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={[
              "px-3 py-1.5 rounded-md text-xs border",
              active
                ? "bg-brand-600 text-white border-brand-600"
                : "bg-white dark:bg-slate-900 border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
