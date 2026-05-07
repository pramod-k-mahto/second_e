import { Card } from "../ui/Card";

export function ChartSkeleton() {
  return (
    <Card className="animate-pulse">
      <div className="mb-3 flex items-center justify-between">
        <div className="h-4 w-32 rounded bg-slate-200" />
        <div className="h-8 w-32 rounded bg-slate-100" />
      </div>
      <div className="h-40 rounded bg-slate-100" />
    </Card>
  );
}
