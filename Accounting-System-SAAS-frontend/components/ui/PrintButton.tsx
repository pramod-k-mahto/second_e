"use client";

import { Printer } from "lucide-react";

interface PrintButtonProps {
  onClick: () => void;
  label?: string;
  className?: string;
}

export function PrintButton({ onClick, label = "Print", className = "" }: PrintButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`no-print flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 shadow-sm transition-all ${className}`}
    >
      <Printer className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
