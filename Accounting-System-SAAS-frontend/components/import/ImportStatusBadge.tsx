"use client";

import * as React from "react";

export function ImportStatusBadge({ status }: { status?: string | null }) {
  const s = String(status || "").toUpperCase();

  const cls = React.useMemo(() => {
    if (s === "COMPLETED") return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (s === "FAILED") return "bg-red-50 text-red-700 border-red-200";
    if (s === "VALIDATED") return "bg-blue-50 text-blue-700 border-blue-200";
    if (s === "VALIDATING" || s === "COMMITTING")
      return "bg-amber-50 text-amber-700 border-amber-200";
    if (s === "MAPPED" || s === "UPLOADED") return "bg-slate-50 text-slate-700 border-slate-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  }, [s]);

  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        cls,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {s || "UNKNOWN"}
    </span>
  );
}
