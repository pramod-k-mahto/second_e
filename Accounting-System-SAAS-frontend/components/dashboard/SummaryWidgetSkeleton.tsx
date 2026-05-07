import { Card } from "../ui/Card";

export function SummaryWidgetSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="space-y-2">
        <div className="h-3 w-20 rounded bg-slate-200" />
        <div className="h-5 w-24 rounded bg-slate-200" />
        <div className="h-3 w-24 rounded bg-slate-100" />
      </div>
    </Card>
  );
}
