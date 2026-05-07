import { Card } from "../ui/Card";
import { ReactNode } from "react";

interface TableCardProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

export function TableCard({ title, subtitle, children }: TableCardProps) {
  return (
    <Card className="space-y-3">
      <div>
        <div className="text-sm font-semibold text-slate-900">{title}</div>
        {subtitle && (
          <div className="text-xs text-slate-500">{subtitle}</div>
        )}
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-100 px-1">
        <table className="min-w-full divide-y divide-slate-100 text-xs">
          {children}
        </table>
      </div>
    </Card>
  );
}
