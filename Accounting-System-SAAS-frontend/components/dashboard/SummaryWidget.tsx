import { Card } from "../ui/Card";
import Link from "next/link";

interface SummaryWidgetProps {
  label: string;
  value: string | React.ReactNode;
  subLabel?: string;
  trendLabel?: string;
  trendDirection?: "up" | "down" | "flat";
  href?: string;
}

export function SummaryWidget({
  label,
  value,
  subLabel,
  trendLabel,
  trendDirection = "flat",
  href,
}: SummaryWidgetProps) {
  const trendColor =
    trendDirection === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trendDirection === "down"
        ? "text-red-600 dark:text-red-400"
        : "text-muted-light dark:text-muted-dark";

  const content = (
    <div className="relative flex flex-col gap-1 pt-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-light dark:text-muted-dark">
        {label}
      </div>
      <div className="text-xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
        {value}
      </div>
      {subLabel && <div className="text-xs text-muted-light dark:text-muted-dark">{subLabel}</div>}
      {trendLabel && (
        <div className={`mt-1 flex items-center gap-1 text-xs ${trendColor}`}>
          <span>
            {trendDirection === "up" && "▲"}
            {trendDirection === "down" && "▼"}
            {trendDirection === "flat" && "●"}
          </span>
          <span>{trendLabel}</span>
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href}>
        <Card className="relative overflow-hidden border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 transition group hover:-translate-y-0.5 hover:border-brand-500/70 hover:shadow-md cursor-pointer">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-400/70 via-brand-500 to-brand-600/80 opacity-80 dark:from-brand-400 dark:via-brand-500 dark:to-brand-400 group-hover:h-1.5 transition-all" />
          {content}
        </Card>
      </Link>
    );
  }

  return (
    <Card className="relative overflow-hidden border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 transition group hover:-translate-y-0.5 hover:border-brand-500/70 hover:shadow-md">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-brand-400/70 via-brand-500 to-brand-600/80 opacity-80 dark:from-brand-400 dark:via-brand-500 dark:to-brand-400" />
      {content}
    </Card>
  );
}
