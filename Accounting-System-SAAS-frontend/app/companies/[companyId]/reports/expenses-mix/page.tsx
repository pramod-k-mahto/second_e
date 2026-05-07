"use client";

import { useMemo, useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ArrowLeft, Printer } from "lucide-react";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany, formatDateWithSuffix } from "@/lib/api";
import { openPrintWindow } from "@/lib/printReport";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { 
  readCalendarReportDisplayMode, 
  writeCalendarReportDisplayMode,
  CalendarReportDisplayMode 
} from "@/lib/calendarMode";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

type ToggleMode = "group" | "ledger";

const COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#84cc16",
  "#14b8a6", "#3b82f6", "#8b5cf6", "#ec4899",
  "#64748b", "#10b981",
];

const COGS_GROUPS = ["purchase accounts", "opening stock", "closing stock", "direct expenses"];

function isCogs(name: string): boolean {
  const n = name.toLowerCase();
  return COGS_GROUPS.some((g) => n.includes(g));
}

function fmt(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtShort(value: number): string {
  if (value >= 1_00_00_000) return `₹${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `₹${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `₹${(value / 1_000).toFixed(1)}K`;
  return `₹${value.toFixed(0)}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 text-xs">
      <p className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</p>
      <p className="text-slate-600 dark:text-slate-300">{fmt(d.total)}</p>
      <p className="text-slate-400 dark:text-slate-500">{d.pct.toFixed(1)}% of expenses</p>
    </div>
  );
};

export default function ExpensesMixReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const printRef = useRef<HTMLDivElement>(null);
  
  const [mounted, setMounted] = useState(false);
  
  // Initialize state immediately from localStorage to prevent "AD date with BS label" flicker
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [mode, setMode] = useState<ToggleMode>("group");

  const { calendarMode, reportMode: settingsReportMode } = useCalendarSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    // If we're in BS mode but the date string looks like AD (year < 2060)
    // or if we just want to be safe, use formatDateWithSuffix which converts AD->BS
    return formatDateWithSuffix(dateStr, effectiveDisplayMode);
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Expenses Mix Report",
      period: fromDate && toDate ? `${formatDateDisplay(fromDate)} – ${formatDateDisplay(toDate)}` : "",
      orientation: "landscape",
    });
  };

  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const cc = mounted ? getCurrentCompany() : initialCC;

  // Sync state if settings change or dbCompany loads
  useEffect(() => {
    if (mounted) {
      const activeCo = dbCompany || cc;
      if (activeCo) {
        if (activeCo.calendar_mode && activeCo.calendar_mode !== effectiveDisplayMode) {
           setEffectiveDisplayMode(activeCo.calendar_mode as any);
           const { from, to } = getSmartDefaultPeriod(activeCo.calendar_mode as any, activeCo);
           setFromDate(from);
           setToDate(to);
        }
      }
    }
  }, [mounted, dbCompany?.id, cc?.calendar_mode]);

  const isBS = effectiveDisplayMode === "BS";
  const fromAD = (isBS && fromDate) ? safeBSToAD(fromDate) : fromDate;
  const toAD = (isBS && toDate) ? safeBSToAD(toDate) : toDate;

  const { data: plData, isLoading } = useSWR(
    companyId && fromAD && toAD
      ? `/companies/${companyId}/reports/profit-and-loss-hierarchical?from_date=${fromAD}&to_date=${toAD}`
      : null,
    fetcher
  );

  const expenseRows: any[] = useMemo(() => plData?.expenses ?? [], [plData]);

  const { groupData, ledgerData, tableRows, grandTotal } = useMemo(() => {
    const groupMap: Record<string, number> = {};
    const ledgerMap: Record<string, { total: number; parentGroup: string }> = {};

    for (const row of expenseRows) {
      const name: string = row.group_name || row.ledger_name || "Unknown";
      const amount = Number(row.amount || 0);
      if (amount <= 0) continue;
      if (isCogs(name)) continue;

      if (row.row_type === "GROUP" && row.level === 0) {
        groupMap[name] = (groupMap[name] || 0) + amount;
      }
      if (row.row_type === "LEDGER") {
        const parentName = row.parent_group_name || "";
        if (!isCogs(parentName)) {
          if (!ledgerMap[name]) ledgerMap[name] = { total: 0, parentGroup: parentName };
          ledgerMap[name].total += amount;
        }
      }
    }

    const gt = Object.values(groupMap).reduce((s, v) => s + v, 0);

    const gData = Object.entries(groupMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, total]) => ({
        name, value: total, total, pct: gt ? (total / gt) * 100 : 0,
      }));

    const lGt = Object.values(ledgerMap).reduce((s, v) => s + v.total, 0);
    const lData = Object.entries(ledgerMap)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10)
      .map(([name, { total }]) => ({
        name, value: total, total, pct: lGt ? (total / lGt) * 100 : 0,
      }));

    // Full table rows: all groups at level 0
    const rows = Object.entries(groupMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name, total]) => ({ name, total, pct: gt ? (total / gt) * 100 : 0 }));

    // Also include ledger breakdown for each group
    const ledgerRows = Object.entries(ledgerMap)
      .sort((a, b) => b[1].total - a[1].total)
      .map(([name, { total, parentGroup }]) => ({
        name,
        total,
        parentGroup,
        pct: gt ? (total / gt) * 100 : 0,
        isLedger: true,
      }));

    return { groupData: gData, ledgerData: lData, tableRows: rows, ledgerTableRows: ledgerRows, grandTotal: gt };
  }, [expenseRows]);

  const chartData = mode === "group" ? groupData : ledgerData;
  const isEmpty = chartData.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </button>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-50">Expenses Mix Report</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Operating expense breakdown by group and ledger</p>
          </div>
        </div>
        <button
          onClick={handlePrint}
          className="no-print flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" /> Print
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 relative z-10 no-print">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Period {effectiveDisplayMode === 'BS' ? '(BS)' : '(AD)'}</span>
        {!mounted ? (
          <div className="h-9 w-64 animate-pulse bg-slate-100 dark:bg-slate-800 rounded-md" />
        ) : (
          <>
            <div className="flex flex-col gap-1.5 min-w-[100px]">
              <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider px-1">Date Display</label>
              <select 
                value={effectiveDisplayMode} 
                onChange={(e) => {
                  const next = e.target.value as "AD" | "BS";
                  setEffectiveDisplayMode(next);
                  writeCalendarReportDisplayMode(companyId, next);
                }} 
                className="h-9 border border-indigo-500/30 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm border-t-2 border-t-indigo-500 outline-none"
              >
                <option value="AD">AD (Gregorian)</option>
                <option value="BS">BS (Bikram Sambat)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Date Range ({effectiveDisplayMode})</label>
              <div className="flex items-center gap-1.5 h-10 group px-1">
                {effectiveDisplayMode === "BS" ? (
                  <>
                    <NepaliDatePicker 
                      inputClassName="h-9 w-32 border border-slate-200 rounded-lg text-xs px-2" 
                      value={fromDate} 
                      onChange={(v) => setFromDate(v)} 
                      options={{calenderLocale:'ne', valueLocale:'en'}} 
                      // @ts-ignore
                      minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                      // @ts-ignore
                      maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <NepaliDatePicker 
                      inputClassName="h-9 w-32 border border-slate-200 rounded-lg text-xs px-2" 
                      value={toDate} 
                      onChange={(v) => setToDate(v)} 
                      options={{calenderLocale:'ne', valueLocale:'en'}} 
                      // @ts-ignore
                      minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                      // @ts-ignore
                      maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                    />
                  </>
                ) : (
                  <>
                    <Input forceNative
                      type="date"
                      value={fromDate}
                      min={cc?.fiscal_year_start || ""}
                      max={cc?.fiscal_year_end || ""}
                      onChange={(e) => setFromDate(e.target.value)}
                      className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-[140px]"
                    />
                    <span className="text-xs text-slate-400">to</span>
                    <Input forceNative
                      type="date"
                      value={toDate}
                      min={cc?.fiscal_year_start || ""}
                      max={cc?.fiscal_year_end || ""}
                      onChange={(e) => setToDate(e.target.value)}
                      className="h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-[140px]"
                    />
                  </>
                )}
              </div>
            </div>

            <button
              onClick={() => {
                const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, cc);
                setFromDate(from);
                setToDate(to);
              }}
              className="mt-auto h-9 px-4 text-xs font-bold text-slate-600 bg-white dark:bg-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
            >
              Today
            </button>
          </>
        )}

        <div className="ml-auto flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
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

      {/* Main content */}
      <div ref={printRef} className="grid gap-5 lg:grid-cols-2 items-start">
        {/* Pie chart */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-50">
              {mode === "group" ? "Expense Groups" : "Top 10 Ledgers"}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {formatDateDisplay(fromDate)} — {formatDateDisplay(toDate)} · Total: {fmtShort(grandTotal)}
            </p>
          </div>

          {isLoading ? (
            <div className="flex h-64 items-center justify-center text-xs text-slate-400">Loading…</div>
          ) : isEmpty ? (
            <div className="flex h-64 items-center justify-center rounded-md border border-dashed border-slate-200 dark:border-slate-700 text-xs text-slate-400">
              No expense data in selected range.
            </div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius="40%"
                    outerRadius="68%"
                    paddingAngle={3}
                    dataKey="value"
                    labelLine={false}
                  >
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Legend rows — separate from chart so they never overlap */}
          {!isEmpty && (
            <div className="space-y-1.5 pt-1">
              {chartData.map((row, i) => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-md bg-slate-50 dark:bg-slate-800/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <span className="text-xs text-slate-700 dark:text-slate-300 truncate">
                      {row.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs tabular-nums flex-shrink-0 ml-2">
                    <span className="text-slate-400 dark:text-slate-500">{row.pct.toFixed(1)}%</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-100">{fmtShort(row.total)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Detail table */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 flex flex-col gap-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-50 flex-shrink-0">Group-wise Breakdown</p>
          <div className="overflow-x-auto overflow-y-auto max-h-[520px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="py-2 pr-3 text-left font-medium text-slate-500 dark:text-slate-400">Expense Group</th>
                  <th className="py-2 text-right font-medium text-slate-500 dark:text-slate-400">Amount</th>
                  <th className="py-2 pl-3 text-right font-medium text-slate-500 dark:text-slate-400">% Share</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {isLoading && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">Loading…</td>
                  </tr>
                )}
                {!isLoading && tableRows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">No data in selected range.</td>
                  </tr>
                )}
                {tableRows.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 pr-3 flex items-center gap-2">
                      <span
                        className="inline-block h-2 w-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200">{row.name}</span>
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium text-slate-800 dark:text-slate-200">
                      {fmt(row.total)}
                    </td>
                    <td className="py-2.5 pl-3 text-right tabular-nums">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-slate-500 dark:text-slate-400">{row.pct.toFixed(1)}%</span>
                        <span className="inline-block h-1.5 rounded-full bg-rose-100 dark:bg-rose-900/30 overflow-hidden w-16">
                          <span
                            className="block h-full rounded-full bg-rose-500"
                            style={{ width: `${Math.min(row.pct, 100)}%` }}
                          />
                        </span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
              {tableRows.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 dark:border-slate-700">
                    <td className="py-2.5 font-semibold text-slate-800 dark:text-slate-100">Total Operating Expenses</td>
                    <td className="py-2.5 text-right tabular-nums font-bold text-rose-600 dark:text-rose-400">
                      {fmt(grandTotal)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-semibold text-slate-800 dark:text-slate-100">100%</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
