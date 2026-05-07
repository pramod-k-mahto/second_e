"use client";

import * as React from "react";

export function JsonEditor({
  value,
  onChange,
  error,
  height = 240,
}: {
  value: string;
  onChange: (v: string) => void;
  error?: string | null;
  height?: number;
}) {
  return (
    <div className="space-y-1">
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className={[
          "w-full rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
          error && "border-critical-500 focus-visible:ring-critical-500",
        ]
          .filter(Boolean)
          .join(" ")}
        style={{ height }}
      />
      {error && <div className="text-[11px] text-critical-600 dark:text-critical-400">{error}</div>}
    </div>
  );
}
