"use client";

import { ReactNode } from "react";
import { Card } from "../ui/Card";
import { Input } from "../ui/Input";

interface ChartCardProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
  dateFilterLabel?: string;
  chart?: ReactNode;
}

export function ChartCard({
  title,
  subtitle,
  children,
  dateFilterLabel = "Period",
  chart,
}: ChartCardProps) {
  return (
    <Card className="space-y-4 border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{title}</div>
          {subtitle && <div className="text-xs text-muted-light dark:text-muted-dark">{subtitle}</div>}
        </div>
      </div>

      {chart ? (
        <div className="h-60">{chart}</div>
      ) : (
        <div className="flex h-52 items-center justify-center rounded-md border border-dashed border-border-light dark:border-border-dark bg-surface-muted dark:bg-slate-800">
          <div className="text-xs text-muted-light dark:text-slate-200">
            Chart placeholder – integrate chart library here
          </div>
        </div>
      )}

      {children}
    </Card>
  );
}
