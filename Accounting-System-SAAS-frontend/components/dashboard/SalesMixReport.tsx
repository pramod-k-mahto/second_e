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

interface SalesMixReportProps {
  invoices: any[];
  items: any[];
  fromDate: string;
  toDate: string;
}

type ToggleMode = "type" | "item";

const TYPE_COLORS = ["#6366f1", "#10b981"];
const ITEM_COLORS = [
  "#6366f1", "#10b981", "#f59e0b", "#ef4444", "#3b82f6",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#84cc16",
];

function isServiceItem(item: any): boolean {
  return (
    typeof item?.category === "string" &&
    item.category.trim().toLowerCase() === "service"
  );
}

function formatNumberShort(value: number): string {
  if (value >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
}

const CustomTooltip = memo(({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  const total = p?.total ?? value;
  const pct = p?.pct ?? 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">{name}</p>
      <p className="text-xs text-slate-600 dark:text-slate-300">
        {new Intl.NumberFormat(undefined, {
          maximumFractionDigits: 2,
        }).format(total)}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500">{pct.toFixed(1)}% of sales</p>
    </div>
  );
});

CustomTooltip.displayName = "CustomTooltip";

export const SalesMixReport = memo(function SalesMixReport({
  invoices,
  items,
  fromDate,
  toDate,
}: SalesMixReportProps) {
  const [mode, setMode] = useState<ToggleMode>("type");

  const itemMap = useMemo(() => {
    const map: Record<string, any> = {};
    if (Array.isArray(items)) {
      for (const it of items) map[String(it.id)] = it;
    }
    return map;
  }, [items]);

  const { typeData, itemData } = useMemo(() => {
    let serviceTotal = 0;
    let inventoryTotal = 0;
    const itemTotals: Record<string, { name: string; total: number; isService: boolean }> = {};

    if (!Array.isArray(invoices)) {
      return { typeData: [], itemData: [] };
    }

    for (const inv of invoices) {
      if (fromDate && inv.date < fromDate) continue;
      if (toDate && inv.date > toDate) continue;

      for (const line of inv.lines ?? []) {
        const itemId = String(line.item_id);
        const item = itemMap[itemId];
        const name = item?.name || `Item #${itemId}`;
        const qty = Number(line.quantity || 0);
        const rate = Number(line.rate || 0);
        const disc = Number(line.discount || 0);
        const taxRate = Number(line.tax_rate || 0);
        const base = qty * rate - disc;
        const lineTotal = base + (base * taxRate) / 100;

        const service = isServiceItem(item);
        if (service) serviceTotal += lineTotal;
        else inventoryTotal += lineTotal;

        if (!itemTotals[itemId]) {
          itemTotals[itemId] = { name, total: 0, isService: service };
        }
        itemTotals[itemId].total += lineTotal;
      }
    }

    const grandTotal = serviceTotal + inventoryTotal;

    const tData = [
      { name: "Service Items", value: serviceTotal, total: serviceTotal, pct: grandTotal ? (serviceTotal / grandTotal) * 100 : 0 },
      { name: "Inventory Items", value: inventoryTotal, total: inventoryTotal, pct: grandTotal ? (inventoryTotal / grandTotal) * 100 : 0 },
    ].filter((d) => d.value > 0);

    const sorted = Object.values(itemTotals)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
    const itemGrandTotal = sorted.reduce((s, r) => s + r.total, 0);
    const iData = sorted.map((r) => ({
      name: r.name,
      value: r.total,
      total: r.total,
      pct: itemGrandTotal ? (r.total / itemGrandTotal) * 100 : 0,
    }));

    return { typeData: tData, itemData: iData };
  }, [invoices, itemMap, fromDate, toDate]);

  const chartData = mode === "type" ? typeData : itemData;
  const colors = mode === "type" ? TYPE_COLORS : ITEM_COLORS;
  const isEmpty = chartData.length === 0;

  return (
    <Card className="space-y-3 border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
            Sales Mix Report
          </div>
          <div className="text-xs text-muted-light dark:text-muted-dark">
            Revenue breakdown for selected period
          </div>
        </div>

        {/* Toggle */}
        <div className="flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
          <button
            onClick={() => setMode("type")}
            className={`px-3 py-1.5 transition-colors ${
              mode === "type"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            By Type
          </button>
          <button
            onClick={() => setMode("item")}
            className={`px-3 py-1.5 border-l border-slate-200 dark:border-slate-700 transition-colors ${
              mode === "item"
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            By Item
          </button>
        </div>
      </div>

      {/* Chart — fixed height, no internal Legend so it never overlaps */}
      {isEmpty ? (
        <div className="flex h-48 items-center justify-center rounded-md border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400 dark:text-slate-500">
          No sales data in selected range.
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
                    fill={colors[index % colors.length]}
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
                  style={{ backgroundColor: colors[i % colors.length] }}
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
        </div>
      )}
    </Card>
  );
});
