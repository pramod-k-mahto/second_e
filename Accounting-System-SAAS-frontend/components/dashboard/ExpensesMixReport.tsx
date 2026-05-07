"use client";

import { memo, useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "../ui/Card";

// Expense groups that represent COGS/stock, not operating expenses — excluded from mix
const COGS_GROUPS = ["purchase accounts", "opening stock", "closing stock", "direct expenses"];

interface ExpensesMixReportProps {
  /** rows from plData.expenses (profit-and-loss-hierarchical) */
  expenseRows: any[];
  fromDate: string;
  toDate: string;
}

type ToggleMode = "group" | "ledger";

const GROUP_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#64748b", "#10b981",
];

function formatNumberShort(value: number): string {
  if (value >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

const CustomTooltip = memo(({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{d.name}</p>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 2,
        }).format(d.total)}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{d.pct.toFixed(1)}% of expenses</p>
    </div>
  );
});

CustomTooltip.displayName = "CustomTooltip";

export const ExpensesMixReport = memo(function ExpensesMixReport({
  expenseRows,
  fromDate,
  toDate,
}: ExpensesMixReportProps) {
  const [mode, setMode] = useState<ToggleMode>("group");

  const { groupData, ledgerData, grandTotal } = useMemo(() => {
    if (!Array.isArray(expenseRows) || expenseRows.length === 0) {
      return { groupData: [], ledgerData: [], grandTotal: 0 };
    }

    // Top-level groups (level 0, row_type GROUP) — exclude COGS
    const groupMap: Record<string, number> = {};
    const ledgerMap: Record<string, number> = {};

    for (const row of expenseRows) {
      const name: string = row.group_name || row.ledger_name || "Unknown";
      const amount = Number(row.amount || 0);
      if (amount <= 0) continue;

      const nameLower = name.toLowerCase();
      const isCogs = COGS_GROUPS.some((g) => nameLower.includes(g));
      if (isCogs) continue;

      if (row.row_type === "GROUP" && row.level === 0) {
        groupMap[name] = (groupMap[name] || 0) + amount;
      }
      if (row.row_type === "LEDGER") {
        // Only include if not under a COGS parent
        const parentName = (row.parent_group_name || "").toLowerCase();
        const isCOGSParent = COGS_GROUPS.some((g) => parentName.includes(g));
        if (!isCOGSParent) {
          ledgerMap[name] = (ledgerMap[name] || 0) + amount;
        }
      }
    }

    const gt = Object.values(groupMap).reduce((s, v) => s + v, 0);

    const gData = Object.entries(groupMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => ({
        name,
        value: total,
        total,
        pct: gt ? (total / gt) * 100 : 0,
      }));

    const lGt = Object.values(ledgerMap).reduce((s, v) => s + v, 0);
    const lData = Object.entries(ledgerMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => ({
        name,
        value: total,
        total,
        pct: lGt ? (total / lGt) * 100 : 0,
      }));

    return { groupData: gData, ledgerData: lData, grandTotal: gt };
  }, [expenseRows]);

  const chartData = mode === "group" ? groupData : ledgerData;
  const isEmpty = chartData.length === 0;

  return (
    <Card className="space-y-3 border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Expenses Mix Report
          </div>
          <div className="text-xs text-muted-light dark:text-muted-dark">
            Operating expense breakdown for selected period
          </div>
        </div>

        {/* Toggle */}
        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode("group")}
            className={`px-3 py-1.5 transition-colors ${
              mode === "group"
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            By Group
          </button>
          <button
            onClick={() => setMode("ledger")}
            className={`px-3 py-1.5 border-l border-slate-200 dark:border-slate-700 transition-colors ${
              mode === "ledger"
                ? "bg-rose-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            By Ledger
          </button>
        </div>
      </div>

      {/* Chart — fixed height, no internal Legend so it never overlaps */}
      {isEmpty ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500">
          No expense data in selected range.
        </div>
      ) : (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius="42%"
                outerRadius="70%"
                paddingAngle={3}
                dataKey="value"
                labelLine={false}
              >
                {chartData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={GROUP_COLORS[index % GROUP_COLORS.length]}
                    stroke="transparent"
                  />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Legend rows — always below chart, never inside it */}
      {!isEmpty && (
        <div className="space-y-1.5">
          {chartData.map((row, i) => (
            <div
              key={row.name}
              className="flex items-center justify-between gap-2 rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: GROUP_COLORS[i % GROUP_COLORS.length] }}
                />
                <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                  {row.name}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs tabular-nums flex-shrink-0">
                <span className="text-slate-500 dark:text-slate-400">
                  {row.pct.toFixed(1)}%
                </span>
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {formatNumberShort(row.total)}
                </span>
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-md border-t border-slate-100 dark:border-slate-700/50 px-3 pt-2 mt-1">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">Total Operating Expenses</span>
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 tabular-nums">
              {formatNumberShort(grandTotal)}
            </span>
          </div>
        </div>
      )}
    </Card>
  );
});
