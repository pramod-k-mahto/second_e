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
import { ArrowLeft, Printer, Download, X } from "lucide-react";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany, formatDateWithSuffix } from "@/lib/api";
import { openPrintWindow } from "@/lib/printReport";
import { 
  readCalendarReportDisplayMode, 
  writeCalendarReportDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
} from "@/lib/calendarMode";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

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

function fmt(value: number): string {
  return new Intl.NumberFormat(undefined, {
    style: "decimal",
    maximumFractionDigits: 2,
  }).format(value);
}

function fmtShort(value: number): string {
  if (value >= 1_00_00_000) return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  if (value >= 1_00_000) return `${(value / 1_00_000).toFixed(1)}L`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return `${value.toFixed(0)}`;
}

const CustomTooltip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-lg dark:border-slate-700 dark:bg-slate-900 text-xs">
      <p className="font-semibold text-slate-800 dark:text-slate-100">{d.name}</p>
      <p className="text-slate-600 dark:text-slate-300">{fmt(d.total)}</p>
      <p className="text-slate-400 dark:text-slate-500">{d.pct.toFixed(1)}% of sales</p>
    </div>
  );
};

export default function SalesMixReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const printRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Initialize state immediately from localStorage to prevent "AD date with BS label" flicker
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [reportType, setReportType] = useState<"sales" | "returns">("sales");
  const [mode, setMode] = useState<ToggleMode>("type");

  const { calendarMode, reportMode: settingsReportMode } = useCalendarSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

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

  const formatDateDisplay = (dateStr: string) => {
    if (!dateStr) return "";
    return formatDateWithSuffix(dateStr, effectiveDisplayMode);
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Sales Mix Report",
      period: fromDate && toDate ? `${formatDateDisplay(fromDate)} – ${formatDateDisplay(toDate)}` : "",
      calendarSystem: effectiveDisplayMode,
      orientation: "landscape",
    });
  };

  const handleToday = () => {
    const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, cc);
    setFromDate(from);
    setToDate(to);
  };

  const { data: invoices, isLoading: loadingInvoices } = useSWR(
    companyId ? `/sales/companies/${companyId}/invoices` : null,
    fetcher
  );
  const { data: items, isLoading: loadingItems } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const itemMap = useMemo(() => {
    const map: Record<string, any> = {};
    if (Array.isArray(items)) for (const it of items) map[String(it.id)] = it;
    return map;
  }, [items]);

  const { typeData, itemData, tableRows, grandTotal } = useMemo(() => {
    let serviceTotal = 0;
    let inventoryTotal = 0;
    const itemTotals: Record<
      string,
      { name: string; total: number; qty: number; isService: boolean; category: string }
    > = {};

    const isBS_in_use = effectiveDisplayMode === "BS";
    const fromAD = (isBS_in_use && fromDate) ? safeBSToAD(fromDate) : fromDate;
    const toAD = (isBS_in_use && toDate) ? safeBSToAD(toDate) : toDate;

    if (!Array.isArray(invoices)) {
      return { typeData: [], itemData: [], tableRows: [], grandTotal: 0 };
    }

    for (const inv of invoices) {
      if (fromAD && inv.date < fromAD) continue;
      if (toAD && inv.date > toAD) continue;
      for (const line of inv.lines ?? []) {
        const itemId = String(line.item_id);
        const item = itemMap[itemId];
        const name = item?.name || `Item #${itemId}`;
        const category = item?.category || "—";
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
          itemTotals[itemId] = { name, total: 0, qty: 0, isService: service, category };
        }
        itemTotals[itemId].total += lineTotal;
        itemTotals[itemId].qty += qty;
      }
    }

    const gt = serviceTotal + inventoryTotal;

    const tData = [
      { name: "Service Items", value: serviceTotal, total: serviceTotal, pct: gt ? (serviceTotal / gt) * 100 : 0 },
      { name: "Inventory Items", value: inventoryTotal, total: inventoryTotal, pct: gt ? (inventoryTotal / gt) * 100 : 0 },
    ].filter((d) => d.value > 0);

    const sorted = Object.values(itemTotals).sort((a, b) => b.total - a.total);
    const top10 = sorted.slice(0, 10);
    const iGt = top10.reduce((s, r) => s + r.total, 0);
    const iData = top10.map((r) => ({
      name: r.name,
      value: r.total,
      total: r.total,
      pct: iGt ? (r.total / iGt) * 100 : 0,
    }));

    const rows = sorted.map((r) => ({
      ...r,
      pct: gt ? (r.total / gt) * 100 : 0,
    }));

    return { typeData: tData, itemData: iData, tableRows: rows, grandTotal: gt };
  }, [invoices, itemMap, fromDate, toDate, cc]);

  const chartData = mode === "type" ? typeData : itemData;
  const colors = mode === "type" ? TYPE_COLORS : ITEM_COLORS;
  const isLoading = loadingInvoices || loadingItems;
  const isEmpty = chartData.length === 0;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 p-4 md:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
            <PieChart className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50">Sales Mix Report</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Revenue breakdown by item category</p>
          </div>
        </div>
        
        <div className="no-print flex items-center gap-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hover:shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" /> Print
          </button>
          <button
            onClick={() => {
              // Placeholder for download as CSV or PDF
              console.log("Download report");
            }}
            className="flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all hover:shadow-sm"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>
          <button
            onClick={() => router.back()}
            className="flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-slate-50 px-3 py-1.5 text-xs font-semibold text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-white transition-all shadow-md"
          >
            <X className="h-3.5 w-3.5" /> Close
          </button>
        </div>
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
              onClick={handleToday}
              className="mt-auto h-9 px-4 text-xs font-bold text-slate-600 bg-white dark:bg-slate-800 border border-slate-200 rounded-lg hover:bg-slate-50 transition-all shadow-sm"
            >
              Today
            </button>
          </>
        )}

        <div className="ml-auto flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-medium">
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

      {/* Main content */}
      <div ref={printRef} className="flex flex-col gap-5">
        {/* Pie chart - Centered at Top */}
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 space-y-6 shadow-sm">
          <div className="text-center">
            <div className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.3em] bg-indigo-50 dark:bg-indigo-900/20 py-1.5 px-4 rounded-full w-fit mx-auto mb-3">
              Market Penetration Analysis
            </div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight">
              {mode === "type" ? "Category-wise Sales Mix" : "Product Performance Distribution"}
            </h2>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">
              Analytical Period: {formatDateDisplay(fromDate)} — {formatDateDisplay(toDate)} 
              <span className="ml-2 px-2 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-[9px] text-slate-500 border border-slate-200 dark:border-slate-700">
                Logic: {effectiveDisplayMode} Calendar
              </span>
            </p>
          </div>

          {isLoading ? (
            <div className="flex h-72 items-center justify-center text-[10px] text-slate-400 font-black animate-pulse uppercase tracking-[0.3em]">Synthesizing Visual Intelligence…</div>
          ) : isEmpty ? (
            <div className="flex h-72 items-center justify-center rounded-[2rem] border-2 border-dashed border-slate-100 dark:border-slate-800 text-[10px] text-slate-400 font-black uppercase tracking-[0.3em]">
              No transactional data discovered in period.
            </div>
          ) : (
            <div className="chart-print-container">
              <div className="h-72 w-full max-w-[450px] mx-auto">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={chartData}
                      cx="50%"
                      cy="50%"
                      innerRadius="45%"
                      outerRadius="75%"
                      paddingAngle={4}
                      dataKey="value"
                      labelLine={false}
                    >
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={colors[i % colors.length]} stroke="transparent" />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Data Fields Legend - 1 or 2 Columns with Color */}
              <div className="legend-grid grid grid-cols-1 sm:grid-cols-2 gap-x-12 gap-y-3 mt-8 w-full max-w-[600px] mx-auto px-6 py-5 bg-slate-50/50 dark:bg-slate-800/10 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                {chartData.map((row, i) => (
                  <div key={row.name} className="legend-item flex items-center gap-4">
                    <span
                      className="legend-swatch w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.1)]"
                      style={{ backgroundColor: colors[i % colors.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-tight truncate">
                        {row.name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[11px] font-black text-slate-900 dark:text-slate-100 tabular-nums">
                          {row.pct.toFixed(1)}%
                        </span>
                        <span className="h-1 w-1 rounded-full bg-slate-300 dark:bg-slate-700" />
                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">
                          {fmtShort(row.total)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Detailed Analytical Breakdown Table */}
        <div className="rounded-[2rem] border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 flex flex-col gap-5 shadow-xl">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em] flex items-center gap-3">
                <div className="w-2 h-6 bg-indigo-500 rounded-full shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
                Granular Item Metrics
            </h3>
            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-50 dark:bg-slate-800/50 px-3 py-1 rounded-lg">
              Total Analytical Units: {tableRows.length}
            </div>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate border-spacing-y-1">
              <thead>
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">
                  <th className="py-4 pr-3 text-left">Item Reference</th>
                  <th className="py-4 pr-3 text-left">Classification</th>
                  <th className="py-4 pr-3 text-left">Status</th>
                  <th className="py-4 pr-3 text-right">Volume</th>
                  <th className="py-4 text-right">Monetary Value</th>
                  <th className="py-4 pl-3 text-right">Weight (%)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {!isLoading && tableRows.map((row, i) => {
                  const chartIdx = chartData.findIndex(cd => cd.name === row.name);
                  const swatchColor = chartIdx !== -1 ? colors[chartIdx % colors.length] : "#e2e8f0";

                  return (
                    <tr key={i} className="group hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-all duration-300">
                      <td className="py-3 pr-3 font-bold text-slate-900 dark:text-slate-100 uppercase tracking-tight flex items-center gap-3">
                        <span className="w-2 h-2 rounded-full ring-2 ring-white dark:ring-slate-900 shadow-sm" style={{ backgroundColor: swatchColor }} />
                        {row.name}
                      </td>
                      <td className="py-3 pr-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">{row.category}</td>
                      <td className="py-3 pr-3">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest ${
                          row.isService
                            ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400"
                            : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                        }`}>
                          {row.isService ? "Service" : "Inventory"}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-right tabular-nums text-slate-600 font-bold">{row.qty.toFixed(2)}</td>
                      <td className="py-3 text-right tabular-nums font-black text-slate-900 dark:text-slate-100">{fmt(row.total)}</td>
                      <td className="py-3 pl-3 text-right tabular-nums font-bold text-slate-400 group-hover:text-indigo-500 transition-colors">{row.pct.toFixed(1)}%</td>
                    </tr>
                  );
                })}
              </tbody>
              {tableRows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4} className="py-8 font-black text-[11px] text-slate-500 uppercase tracking-[0.3em]">Combined Analytical Result</td>
                    <td className="py-8 text-right tabular-nums font-black text-xl text-indigo-600 dark:text-indigo-400 border-t-2 border-indigo-100">{fmt(grandTotal)}</td>
                    <td className="py-8 pl-3 text-right font-black text-slate-300 text-[10px]">100%</td>
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
