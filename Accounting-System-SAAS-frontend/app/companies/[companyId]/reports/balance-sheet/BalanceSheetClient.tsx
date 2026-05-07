"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from "@/lib/api";
import { getStockValuation, type StockValuationResponse } from "@/lib/api/inventory";
import { safeADToBS, safeBSToAD, isIsoDateString } from "@/lib/bsad";
import { Input } from "@/components/ui/Input";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { 
  readCalendarReportDisplayMode, 
  writeCalendarReportDisplayMode,
  CalendarReportDisplayMode 
} from "@/lib/calendarMode";
import { openPrintWindow } from "@/lib/printReport";

export type LedgerGroupType = "ASSET" | "LIABILITY";

// Flat summary report (existing API)
export type BalanceSheetRow = {
  group_name: string;
  amount: number;
  group_type: LedgerGroupType;
};

export type BalanceSheetReport = {
  as_on_date: string;
  rows: BalanceSheetRow[];
};

// Hierarchical detailed report (new API)
export type BalanceSheetHierarchicalRow = {
  row_type?: "GROUP" | "SUB_GROUP" | "LEDGER" | "TOTAL";
  level?: number;
  is_group?: boolean;
  is_ledger?: boolean;
  group_id?: number | null;
  group_name?: string | null;
  primary_group?: string | null;
  group_path?: string[];
  parent_group_id?: number | null;
  parent_group_name?: string | null;
  sort_order?: number | null;

  ledger_id?: number | null;
  ledger_name: string;
  amount: number;
};

export type BalanceSheetHierarchicalReport = {
  as_on_date: string;
  liabilities: BalanceSheetHierarchicalRow[];
  assets: BalanceSheetHierarchicalRow[];
  totals: {
    liabilities_total: number;
    assets_total: number;
  };
};

export type BalanceSheetClientProps = {
  companyId: string;
  asOn: string;
  view: "summary" | "details" | "hierarchical";
  fromDate: string;
  toDate: string;
  onDate: string;
  preset?: "on_date" | "today";
  fiscalYearStart?: string;
  hierarchical: BalanceSheetHierarchicalReport | null;
  summary: BalanceSheetReport | null;
  error: string | null;
};

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAmountWithBrackets(n: number): string {
  const abs = Math.abs(n);
  const formatted = abs.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `(${formatted})` : formatted;
}

export function BalanceSheetClient({
  companyId,
  asOn,
  view,
  fromDate,
  toDate,
  onDate,
  preset,
  fiscalYearStart,
  hierarchical,
  summary,
  error,
}: BalanceSheetClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const printRef = useRef<HTMLDivElement | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"PDF" | "Excel" | "Send">("PDF");
  const [mounted, setMounted] = useState(false);
  
  useEffect(() => {
    setMounted(true);
  }, []);

  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  
  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);

  const cc = mounted ? getCurrentCompany() : null;

  // Sync with database if available
  useEffect(() => {
    if (mounted) {
      if (cc?.calendar_mode && cc.calendar_mode !== effectiveDisplayMode) {
        setEffectiveDisplayMode(cc.calendar_mode as any);
      }
    }
  }, [mounted, cc?.calendar_mode]);

  const toggleGroup = (groupId: number) => {
    const next = new Set(collapsedIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setCollapsedIds(next);
  };


  const isBS = effectiveDisplayMode === "BS";

  const [fromPrimary, setFromPrimary] = useState<string>(isBS ? (safeADToBS(fromDate) || "") : fromDate);
  const [toPrimary, setToPrimary] = useState<string>(isBS ? (safeADToBS(toDate) || "") : toDate);
  const [onPrimary, setOnPrimary] = useState<string>(isBS ? (safeADToBS(onDate) || "") : onDate);
  const [viewMode, setViewMode] = useState<"summary" | "details" | "hierarchical">(view);
  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());
  const [printDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [printTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));

  useEffect(() => {
    setFromPrimary(isBS ? (safeADToBS(fromDate) || "") : fromDate);
    setToPrimary(isBS ? (safeADToBS(toDate) || "") : toDate);
    setOnPrimary(isBS ? (safeADToBS(onDate) || "") : onDate);
    setViewMode(view);
  }, [fromDate, toDate, onDate, view, isBS]);

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: stockValuation } = useSWR<StockValuationResponse>(
    companyId && asOn ? ["stock-valuation", companyId, asOn] : null,
    async () => {
      return await getStockValuation(Number(companyId), asOn);
    }
  );

  const shouldOverrideInventoryStockValue = (label: string): boolean => {
    const s = String(label || "").toLowerCase();
    // More robust detection: "Stock in Hand", "Closing Stock", "Inventory", etc.
    return (s.includes("stock") && (s.includes("hand") || s.includes("closing"))) || s.includes("inventory");
  };

  // cc (Current Company) is already hydration-safe and available via mounted check

  // displayDate replaced by <FormattedDate /> in JSX

  const handleFromChangeAD = (ad: string) => {
    if (!ad) {
      setFromPrimary("");
      return;
    }
    setFromPrimary(isBS ? safeADToBS(ad) || "" : ad);
  };

  const handleFromChangeBS = (bs: string) => {
    if (!bs) {
      setFromPrimary("");
      return;
    }
    setFromPrimary(isBS ? bs : safeBSToAD(bs) || "");
  };

  const handleToChangeAD = (ad: string) => {
    if (!ad) {
      setToPrimary("");
      return;
    }
    setToPrimary(isBS ? safeADToBS(ad) || "" : ad);
  };

  const handleToChangeBS = (bs: string) => {
    if (!bs) {
      setToPrimary("");
      return;
    }
    setToPrimary(isBS ? bs : safeBSToAD(bs) || "");
  };

  const handleOnChangeAD = (ad: string) => {
    if (!ad) {
      setOnPrimary("");
      return;
    }
    setOnPrimary(isBS ? safeADToBS(ad) || "" : ad);
  };

  const handleOnChangeBS = (bs: string) => {
    if (!bs) {
      setOnPrimary("");
      return;
    }
    setOnPrimary(isBS ? bs : safeBSToAD(bs) || "");
  };

  const submitWithParams = (next: {
    preset?: "on_date" | "today";
    view?: "summary" | "details" | "hierarchical";
    from_date?: string;
    to_date?: string;
    on_date?: string;
  }) => {
    const params = new URLSearchParams();
    if (next.view) params.set("view", next.view);
    if (next.preset) params.set("preset", next.preset);
    if (next.from_date) params.set("from_date", next.from_date);
    if (next.to_date) params.set("to_date", next.to_date);
    if (next.on_date) params.set("on_date", next.on_date);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  };

  const handleBack = () => {
    if (companyId) {
      router.push(`/companies/${companyId}`);
    } else {
      router.back();
    }
  };

  const handleClose = () => {
    if (companyId) {
      router.push(`/companies/${companyId}`);
    }
  };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Balance Sheet",
      company: cc?.name || "",
      period: onDate ? `As on ${onDate}` : (fromDate && toDate ? `${fromDate} – ${toDate}` : ""),
      orientation: "portrait",
    });
  };

  const handleOpenPdfView = handlePrint;

  const handleExportCsv = () => {
    const rows: string[] = [];

    const getFormattedDateStr = (d: string) => {
      if (!d) return "";
      if (effectiveDisplayMode === "BS") return safeADToBS(d) || d;
      return d;
    };
    rows.push(`Company: ${companyId}`);
    rows.push(`As on: ${getFormattedDateStr(asOn)}`);
    rows.push(`View: ${view}`);

    if ((view === "details" || view === "hierarchical") && hierarchical) {
      rows.push("");
      rows.push("Liabilities");
      rows.push("Label,Amount");
      [...hierarchical.liabilities]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((r) => {
          const label = String(r.ledger_name ?? "").replace(/"/g, '\\"');
          rows.push(`"${label}",${r.amount.toFixed(2)}`);
        });
      rows.push(`"Total",${hierarchical.totals.liabilities_total.toFixed(2)}`);

      rows.push("");
      rows.push("Assets");
      rows.push("Label,Amount");
      [...hierarchical.assets]
        .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
        .forEach((r) => {
          const label = String(r.ledger_name ?? "").replace(/"/g, '\\"');
          rows.push(`"${label}",${r.amount.toFixed(2)}`);
        });
      rows.push(`"Total",${hierarchical.totals.assets_total.toFixed(2)}`);
    } else if (view === "summary" && summary) {
      rows.push("");
      rows.push("Type,Group,Amount");
      summary.rows.forEach((r) => {
        const kind = r.group_type === "ASSET" ? "ASSET" : "LIABILITY";
        const name = String(r.group_name ?? "").replace(/"/g, '\\"');
        rows.push(`"${kind}","${name}",${r.amount.toFixed(2)}`);
      });
    }

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      view === "summary" ? "balance-sheet-summary.csv" : "balance-sheet-details.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (downloadFormat === "PDF") {
      handleOpenPdfView();
      return;
    }
    if (downloadFormat === "Excel") {
      handleExportCsv();
      return;
    }
    if (downloadFormat === "Send") {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        (navigator as any)
          .share({
            title: "Balance Sheet Report",
            text: "Sharing Balance Sheet report.",
          })
          .catch(() => {
            // ignore
          });
      } else if (typeof window !== "undefined") {
        window.alert("Sharing is not supported on this browser.");
      }
    }
  };

  if (error) {
    return null;
  }

  return (
    <>
      {/* Premium Modular Page Header */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl overflow-hidden print:hidden mb-1">
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-black text-slate-900 dark:text-white tracking-tight uppercase">Balance Sheet</h1>
              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Asset, Liability & Equity Analysis</p>
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 transition-all shadow-sm uppercase tracking-wider"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0110.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0l.229 2.523a1.125 1.125 0 01-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0021 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 00-1.913-.247M6.34 18H5.25A2.25 2.25 0 013 15.75V9.456c0-1.081.768-2.015 1.837-2.175a48.041 48.041 0 011.913-.247m10.5 0a48.536 48.536 0 00-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5zm-3 0h.008v.008H15V10.5z" />
              </svg>
              Print
            </button>
            <button
              onClick={handleBack}
              className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg hover:bg-slate-800 transition-all shadow-md uppercase tracking-wider"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" />
              </svg>
              Exit
            </button>
          </div>
        </div>
      </div>

      {/* Harmonized Filter Bar */}
      <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl p-3 flex flex-wrap items-end gap-3 shadow-sm print:hidden">
        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Calendar</label>
          <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
            <button
              onClick={() => {
                setEffectiveDisplayMode("AD");
                writeCalendarReportDisplayMode(companyId, "AD");
                const { from, to } = getSmartDefaultPeriod("AD", cc);
                setFromPrimary(from); setToPrimary(to); setOnPrimary(to);
              }}
              className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${!isBS ? 'bg-slate-100 dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-400'}`}
            >AD</button>
            <button
              onClick={() => {
                setEffectiveDisplayMode("BS");
                writeCalendarReportDisplayMode(companyId, "BS");
                const { from, to } = getSmartDefaultPeriod("BS", cc);
                setFromPrimary(from); setToPrimary(to); setOnPrimary(to);
              }}
              className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${isBS ? 'bg-slate-100 dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-400'}`}
            >BS</button>
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">From Date</label>
          {effectiveDisplayMode === "BS" ? (
            <div className="relative z-50">
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-[110px]"
                value={isBS ? fromPrimary : safeADToBS(fromPrimary)}
                onChange={(value: string) => handleFromChangeBS(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              />
            </div>
          ) : (
            <Input forceNative
              type="date"
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-[130px]"
              value={isBS ? safeBSToAD(fromPrimary) : fromPrimary}
              onChange={(e) => handleFromChangeAD(e.target.value)}
            />
          )}
        </div>

        <div className="space-y-1">
          <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">To Date</label>
          {effectiveDisplayMode === "BS" ? (
            <div className="relative z-50">
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-[110px]"
                value={isBS ? toPrimary : safeADToBS(toPrimary)}
                onChange={(value: string) => handleToChangeBS(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              />
            </div>
          ) : (
            <Input forceNative
              type="date"
              className="h-9 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none w-[130px]"
              value={isBS ? safeBSToAD(toPrimary) : toPrimary}
              onChange={(e) => handleToChangeAD(e.target.value)}
            />
          )}
        </div>

        <div className="flex gap-1">
          <button
            type="button"
            className="h-9 px-4 bg-indigo-600 text-white rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-indigo-700 transition-colors shadow-sm"
            onClick={() => submitWithParams({ view: viewMode, from_date: fromPrimary || undefined, to_date: toPrimary || undefined })}
          >Apply</button>
          <button
            type="button"
            className="h-9 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 rounded-lg text-[11px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-colors"
            onClick={() => {
              const { from, to } = getSmartDefaultPeriod(isBS ? "BS" : "AD");
              setFromPrimary(from); setToPrimary(to); setOnPrimary(to);
              submitWithParams({ view: viewMode, preset: "today", on_date: to, from_date: from, to_date: to });
            }}
          >Today</button>
        </div>

        <div className="ml-auto space-y-1">
           <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">Report View</label>
           <div className="flex bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
             {["summary", "details", "hierarchical"].map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setViewMode(m as any);
                    submitWithParams({ view: m as any, from_date: fromPrimary || undefined, to_date: toPrimary || undefined });
                  }}
                  className={`px-3 py-1 rounded-md text-[9px] font-black uppercase transition-all ${viewMode === m ? 'bg-slate-100 dark:bg-slate-700 shadow-sm text-indigo-600' : 'text-slate-400'}`}
                >{m}</button>
             ))}
           </div>
        </div>
      </div>


      <div ref={printRef}>
        {(view === "details" || view === "hierarchical") && hierarchical && (
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "4px",
              padding: "8px 10px",
            }}
          >
            <div className="mb-2">
              <div
                style={{
                  textAlign: "center",
                  fontSize: "16px",
                  fontWeight: 800,
                  paddingBottom: "2px",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                {cc?.name || ""}
              </div>
              {cc && (cc as any).address && (
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "14px",
                    color: "#475569",
                    paddingTop: "2px",
                    paddingBottom: "2px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {(cc as any).address}
                </div>
              )}
              <div
                style={{
                  marginTop: "4px",
                  fontSize: "14px",
                  fontWeight: 600,
                  textAlign: "left",
                  paddingBottom: "2px",
                  borderBottom: "1px solid #e2e8f0",
                }}
              >
                Balance Sheet
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "10px",
                  color: "#64748b",
                  paddingTop: "2px",
                }}
              >
                <span>{hierarchical.as_on_date ? <>As on: <FormattedDate date={hierarchical.as_on_date} mode={effectiveDisplayMode} /></> : ""}</span>
                <div style={{ marginLeft: "auto", display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                  {printDate ? <div>Print Date: <FormattedDate date={printDate} mode={effectiveDisplayMode} /></div> : ""}
                  <div>Print Time: {printTime}</div>
                </div>
              </div>
            </div>

            <div className="px-2">
              {(() => {

                const getVisibleRows = (rows: any[]) => {
                  if (view !== "hierarchical") return rows;

                  const visible: any[] = [];
                  // Stack of levels that are currently collapsing their descendants.
                  // If we are deeper (level > stack.top), we are hidden.
                  const hiddenStack: number[] = [];

                  for (const row of rows) {
                    const level = row.level ?? 0;

                    // Check if we are inside a hidden block
                    // We must be deeper than the level that initiated the hide.
                    // If current level <= hiddenStack.top, we've popped out.
                    while (hiddenStack.length > 0 && level <= hiddenStack[hiddenStack.length - 1]) {
                      hiddenStack.pop();
                    }

                    if (hiddenStack.length > 0) {
                      // Still hidden
                      continue;
                    }

                    visible.push(row);

                    // If this row is a group and is collapsed, start hiding children
                    if ((row.is_group || row.row_type === "GROUP" || row.row_type === "SUB_GROUP") && row.group_id) {
                      if (collapsedIds.has(row.group_id)) {
                        hiddenStack.push(level);
                      }
                    }
                  }
                  return visible;
                };

                const sortRows = (rows: any[]) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
                  .map(row => ({
                    ...row,
                    amountToDisplay: shouldOverrideInventoryStockValue(row.ledger_name || row.group_name) ? (stockValuation?.total_value ?? row.amount) : row.amount
                  }))
                  .filter(row => {
                    const label = (row.ledger_name || row.group_name || "").toLowerCase();
                    const isCapital = label.includes("capital") || label.includes("equity") || label.includes("proprietor") || label.includes("owner") || label.includes("drawing");
                    // Always show root groups (level 0) and anything related to Capital/Equity, even if 0
                    return row.amountToDisplay !== 0 || row.level === 0 || isCapital;
                  });

                const L_ALL = sortRows(hierarchical.liabilities);
                const A_ALL = sortRows(hierarchical.assets);

                // Move Capital Account items from Assets side to Liabilities side (e.g. Drawings, Debit Capital)
                const isCapRow = (row: any) => {
                  const label = String(row.ledger_name || row.group_name || "").toLowerCase().trim();
                  return label.includes("capital") || label.includes("equity") || label.includes("drawing") || label.includes("proprietor") || label.includes("owner") || label.includes("partner") || label.includes("members");
                };
                const movedA = A_ALL.filter(isCapRow);
                const L = getVisibleRows([...L_ALL, ...movedA]);
                const A = getVisibleRows(A_ALL.filter((r) => !isCapRow(r)));

                const totalL = hierarchical.totals.liabilities_total;
                const totalA = hierarchical.totals.assets_total;
                const sideTotal = Math.max(totalL, totalA);

                // Section priority maps (plain objects, no TS generics here)
                const PL = {
                  "capital account": 1, "owner's equity": 1, "equity": 1, "shares capital": 1, "share capital": 1,
                  "proprietor's capital": 1, "proprietor": 1, "drawings": 1, "drawing account": 1,
                  "business owner": 1, "business owner capital": 1, "owner": 1,
                  "partner's capital": 1, "reserves & surplus": 1, "reserves and surplus": 1,
                  "long term liabilities": 2, "long-term liabilities": 2, "secured loans": 2, "unsecured loans": 2,
                  "current liabilities": 3, "sundry creditors": 3, "duties & taxes": 3, "tds payable": 3,
                  "vat payable": 3, "gst payable": 3, "payroll payables": 3, "expenses payable": 3,
                  "advances from customers": 3, "provisions": 4,
                };
                const PA = {
                  "fixed assets": 1, "intangible assets": 2, "investments": 3,
                  "current assets": 4, "cash-in-hand": 4, "bank accounts": 4, "sundry debtors": 4,
                  "loans & advances (assets)": 4, "deposits (assets)": 4, "stock-in-hand": 4,
                  "prepaid expenses": 4, "input tax credits": 4, "tds receivable": 4, "vat receivable": 4,
                };
                const LL = { 1: "Capital Account", 2: "Long-Term Liabilities", 3: "Current Liabilities", 4: "Provisions" };
                const LA = { 1: "Fixed Assets", 2: "Intangible Assets", 3: "Investments", 4: "Current Assets" };

                const getPriority = (row: any, map: any, isL: boolean) => {
                  const label = String(row.ledger_name || row.group_name || "").toLowerCase().trim();
                  // Highest priority manual check for Business Owner and Capital
                  if (isL && (label === "business owner" || label.includes("business owner"))) return 1;

                  const path = Array.isArray(row.group_path) ? row.group_path : [];
                  for (const p of path) {
                    const k = String(p).toLowerCase().trim();
                    if (map[k] !== undefined) return map[k];
                  }
                  if (map[label] !== undefined) return map[label];
                  
                  // Fuzzy matches for Capital Account (if not explicitly mapped)
                  if (isL && (label.includes("capital") || label.includes("equity") || label.includes("drawing") || label.includes("proprietor") || label.includes("owner") || label.includes("partner") || label.includes("members") || label.includes("net profit") || label.includes("net loss") || label.includes("profit & loss") || label.includes("profit and loss"))) {
                    return 1;
                  }
                  
                  return 99;
                };

                const buildRows = (rows: any[], pm: any, lm: any, isL: boolean) => {
                  const sorted = [...rows].sort((a, b) => {
                    const pa = getPriority(a, pm, isL); const pb = getPriority(b, pm, isL);
                    if (pa !== pb) return pa - pb;
                    // For the same priority (especially Section 1), put specific keywords first
                    if (pa === 1) {
                      const an = String(a.ledger_name || a.group_name || "").toLowerCase();
                      const bn = String(b.ledger_name || b.group_name || "").toLowerCase();
                      const aHasCap = an.includes("capital");
                      const bHasCap = bn.includes("capital");
                      if (aHasCap && !bHasCap) return -1;
                      if (!aHasCap && bHasCap) return 1;
                    }
                    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
                  });
                  const out: any[] = [];
                  let cur = -1;
                  for (const row of sorted) {
                    const pri = getPriority(row, pm, isL);
                    if (pri !== cur) {
                      if (cur !== -1) out.push({ kind: "div" });
                      cur = pri;
                      const lbl = lm[pri];
                      if (lbl && pri !== 99) {
                        // Calculate total for this section - sum ONLY ledgers to avoid double-counting groups and sub-items
                        const sectionTotal = sorted.filter(r => {
                          const rp = getPriority(r, pm, isL);
                          // Must be a ledger or a row with no further breakdown provided in this list
                          return rp === pri && (r.is_ledger || r.row_type === "LEDGER");
                        }).reduce((acc, r) => acc + (r.amountToDisplay ?? r.amount ?? 0), 0);
                        
                        // Always push the header with total
                        out.push({ kind: "sec", label: lbl, total: sectionTotal });
                      }
                    }
                    
                    // Skip the root group if its name matches the header, 
                    // so we only see the header and its children.
                    const isPrioritySection = pri >= 1 && pri <= 10; // Applies to main sections
                    if (isPrioritySection && row.level === 0 && row.is_group) {
                      const rName = String(row.ledger_name || row.group_name || "").toLowerCase();
                      const lblLower = lm[pri]?.toLowerCase() || "";
                      if (lblLower && (rName.includes(lblLower) || lblLower.includes(rName))) {
                        continue;
                      }
                    }
                    
                    out.push({ kind: "row", row });
                  }
                  if (cur !== -1) out.push({ kind: "div" });
                  return out;
                };

                const LD = buildRows(L, PL, LL, true);
                const AD = buildRows(A, PA, LA, false);
                const maxD = Math.max(LD.length, AD.length);

                const renderSideCell = (item: any, isL: any) => {
                  const bordR = isL ? "border-r border-slate-300" : "";
                  if (!item) return (
                    <>
                      <td className={`px-3 py-[3px] ${isL ? "border-r border-slate-100" : ""}`}></td>
                      <td className={`px-3 py-[3px] ${bordR}`}></td>
                    </>
                  );
                  if (item.kind === "sec") return (
                    <>
                      <td className={`px-3 py-1.5 font-bold uppercase text-[12px] tracking-wide text-slate-700 bg-slate-100 border-y border-slate-200`}>
                        {item.label}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-bold text-[12px] text-slate-700 bg-slate-100 border-y border-slate-200 ${bordR}`}>
                        {item.total !== undefined ? formatAmountWithBrackets(item.total) : ""}
                      </td>
                    </>
                  );
                  if (item.kind === "div") return (
                    <>
                      <td className={`px-2 py-0 ${isL ? "border-r border-slate-100" : ""}`}><div className="border-t border-dashed border-slate-300"></div></td>
                      <td className={`px-2 py-0 ${bordR}`}><div className="border-t border-dashed border-slate-300"></div></td>
                    </>
                  );
                  const r = item.row;
                  const isG = r.is_group || r.row_type === "GROUP" || r.row_type === "SUB_GROUP";
                  const isLed = r.is_ledger || r.row_type === "LEDGER";
                  const isRoot = r.level === 0;
                  const canTog = view === "hierarchical" && isG && r.group_id;
                  const isCol = canTog && collapsedIds.has(r.group_id);
                  const indent = (r.level ?? 0) * 14;
                  const amt = r.amountToDisplay ?? r.amount ?? 0;
                  const lbl = canTog ? (
                    <button type="button" onClick={() => toggleGroup(r.group_id)} className="hover:text-blue-600 flex items-center gap-1 w-full text-left">
                      <span className="text-[9px] w-3 h-3 shrink-0 inline-flex items-center justify-center border border-slate-400 rounded-sm">{isCol ? "+" : "−"}</span>
                      <span>{r.ledger_name || r.group_name}</span>
                    </button>
                  ) : isLed && r.ledger_id ? (
                    <span role="button" className="cursor-pointer underline text-blue-600 hover:text-blue-800 text-left w-full" onClick={() => {
                      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                      router.push(`/companies/${companyId}/reports/ledger?ledger_id=${r.ledger_id}&from_date=${asOn}&to_date=${asOn}&returnUrl=${returnUrl}`);
                    }}>{r.ledger_name}</span>
                  ) : (r.ledger_name === "Closing Stock" || r.group_name === "Closing Stock") ? (
                    <span role="button" className="cursor-pointer underline text-blue-600 hover:text-blue-800 text-left" onClick={() => router.push(`/companies/${companyId}/reports/items`)}>{r.ledger_name || r.group_name}</span>
                  ) : (r.ledger_name || r.group_name);
                  return (
                    <>
                      <td className={`py-[3px] overflow-hidden text-ellipsis whitespace-nowrap ${isL ? "border-r border-slate-100" : ""} ${isRoot ? "bg-slate-50/40" : ""}`} style={{ paddingLeft: `${indent + 10}px`, paddingRight: "4px" }}>
                        <span className={isG ? (isRoot ? "font-bold text-slate-900 uppercase tracking-tight text-[11px]" : "font-semibold text-slate-800") : "text-slate-600"}>{lbl}</span>
                      </td>
                      <td className={`px-3 py-[3px] text-right tabular-nums ${bordR} ${isG ? (isRoot ? "font-bold text-slate-900 bg-slate-50/50" : "font-bold text-slate-800") : "text-slate-700"}`}>
                        {formatAmountWithBrackets(amt)}
                      </td>
                    </>
                  );
                };

                return (
                  <div className="bg-white shadow-sm border border-slate-300 overflow-hidden rounded-sm">
                    <table className="w-full text-[11px] border-collapse table-fixed">
                      <thead>
                        <tr className="bg-slate-800 text-white uppercase font-bold tracking-wider text-[11px]">
                          <th colSpan={2} className="px-3 py-2.5 text-center border-r border-slate-600">LIABILITIES</th>
                          <th colSpan={2} className="px-3 py-2.5 text-center">ASSETS</th>
                        </tr>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 font-semibold uppercase text-[9px]">
                          <th className="px-3 py-1 text-left w-[35%] border-r border-slate-200">Particulars</th>
                          <th className="px-3 py-1 text-right w-[15%] border-r border-slate-300">Amount</th>
                          <th className="px-3 py-1 text-left w-[35%] border-r border-slate-200">Particulars</th>
                          <th className="px-3 py-1 text-right w-[15%]">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxD }).map((_, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors h-7">
                            {renderSideCell(LD[i], true)}
                            {renderSideCell(AD[i], false)}
                          </tr>
                        ))}
                        {Math.abs(totalL - totalA) > 0.01 && (
                          <tr className="h-8 bg-amber-50/50 border-t border-slate-200 font-medium italic">
                            {totalL < totalA ? (
                              <>
                                <td className="px-3 py-1.5 text-amber-800 border-r border-slate-100">Difference in Opening Balance</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-amber-800 border-r border-slate-300">{formatAmount(totalA - totalL)}</td>
                                <td className="px-3 py-1.5 border-r border-slate-100"></td>
                                <td className="px-3 py-1.5 text-right"></td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-1.5 border-r border-slate-100"></td>
                                <td className="px-3 py-1.5 border-r border-slate-300 text-right"></td>
                                <td className="px-3 py-1.5 text-amber-800 border-r border-slate-100">Difference in Opening Balance</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-amber-800">{formatAmount(totalL - totalA)}</td>
                              </>
                            )}
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold text-slate-950 uppercase text-[12px]">
                        <tr className="h-10">
                          <td className="px-3 py-3 border-r border-slate-100">Total</td>
                          <td className="px-3 py-3 text-right tabular-nums border-r border-slate-300">{formatAmountWithBrackets(sideTotal)}</td>
                          <td className="px-3 py-3 border-r border-slate-100">Total</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatAmountWithBrackets(sideTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </div>


            <div
              style={{
                marginTop: "24px",
                fontSize: "10px",
                color: "#475569",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span>
                {"Print by: "}
                {(cc as any)?.contact_person || (cc as any)?.email || ""}
              </span>
              <span style={{ margin: "6px auto", padding: "6px", textAlign: "center", width: "50%" }}>
                Approved by: ..............................
              </span>
            </div>
          </div>
        )}

        {view === "summary" && summary && (
          <div
            style={{
              border: "1px solid #e2e8f0",
              borderRadius: "4px",
              padding: "16px",
              backgroundColor: "#fff",
            }}
          >
            <div className="mb-6 text-center">
              <div className="text-xl font-bold text-slate-900 border-b border-slate-200 pb-2 mb-1">
                {cc?.name || ""}
              </div>
              {cc && (cc as any).address && (
                <div className="text-xs text-slate-500 mb-2">
                  {(cc as any).address}
                </div>
              )}
              <div className="text-lg font-bold text-slate-800 uppercase tracking-wide">
                Balance Sheet (Summary)
              </div>
              <div className="text-xs text-slate-500 mt-1 flex justify-center gap-4">
                <span>{summary.as_on_date ? <>As on: <FormattedDate date={summary.as_on_date} mode={effectiveDisplayMode} /></> : ""}</span>
                <span>{printDate ? `Printed: ${printDate}` : ""}</span>
              </div>
            </div>

            <div className="space-y-8">
              {(() => {
                const liabilities = summary.rows.filter(r => r.group_type === "LIABILITY");
                const assets = summary.rows.filter(r => r.group_type === "ASSET");

                // Move Capital Account items from Assets side to Liabilities side for summary view
                const isSCapRow = (row: any) => {
                  const label = String(row.group_name || "").toLowerCase().trim();
                  return label.includes("capital") || label.includes("equity") || label.includes("drawing") || label.includes("proprietor") || label.includes("owner") || label.includes("partner") || label.includes("members");
                };
                const movedSA = assets.filter(isSCapRow);
                const sLiab = [...liabilities, ...movedSA];
                const sAsst = assets.filter((r) => !isSCapRow(r));

                const totalLiabilities = sLiab.reduce((s, r) => s + r.amount, 0);
                const totalAssets = sAsst.reduce((s, r) => s + r.amount, 0);
                const summarySideTotal = Math.max(totalLiabilities, totalAssets);

                // Same section priority maps as the details view
                const SPL = {
                  "capital account": 1, "owner's equity": 1, "equity": 1, "shares capital": 1, "share capital": 1,
                  "proprietor's capital": 1, "proprietor": 1, "drawings": 1, "drawing account": 1,
                  "business owner": 1, "business owner capital": 1, "owner": 1,
                  "partner's capital": 1, "reserves & surplus": 1, "reserves and surplus": 1,
                  "long term liabilities": 2, "long-term liabilities": 2, "secured loans": 2, "unsecured loans": 2,
                  "current liabilities": 3, "sundry creditors": 3, "duties & taxes": 3, "tds payable": 3,
                  "vat payable": 3, "gst payable": 3, "payroll payables": 3, "expenses payable": 3,
                  "advances from customers": 3, "provisions": 4,
                };
                const SPA = {
                  "fixed assets": 1, "intangible assets": 2, "investments": 3,
                  "current assets": 4, "cash-in-hand": 4, "bank accounts": 4, "sundry debtors": 4,
                  "loans & advances (assets)": 4, "deposits (assets)": 4, "stock-in-hand": 4,
                  "prepaid expenses": 4, "input tax credits": 4, "tds receivable": 4, "vat receivable": 4,
                };
                const SLL = { 1: "Capital Account", 2: "Long-Term Liabilities", 3: "Current Liabilities", 4: "Provisions" };
                const SLA = { 1: "Fixed Assets", 2: "Intangible Assets", 3: "Investments", 4: "Current Assets" };

                const sPriority = (name: any, map: any, isL: boolean) => {
                  const k = String(name || "").toLowerCase().trim();
                  // Manual priority override for Business Owner
                  if (isL && (k === "business owner" || k.includes("business owner"))) return 1;
                  if (map[k] !== undefined) return map[k];
                  
                  // Fuzzy matches for Capital Account
                  if (k.includes("capital") || k.includes("equity") || k.includes("drawing") || k.includes("proprietor") || k.includes("owner") || k.includes("partner") || k.includes("members") || k.includes("net profit") || k.includes("net loss") || k.includes("profit & loss") || k.includes("profit and loss")) {
                    return 1;
                  }
                  
                  return 99;
                };

                const sBuildRows = (rows: any[], pm: any, lm: any, isL: boolean) => {
                  const sorted = [...rows].sort((a, b) => {
                    const pa = sPriority(a.group_name, pm, isL); const pb = sPriority(b.group_name, pm, isL);
                    if (pa !== pb) return pa - pb;
                    // Put "Capital Account" groups before "Business Owner" within Section 1
                    if (pa === 1) {
                      const an = String(a.group_name || "").toLowerCase();
                      const bn = String(b.group_name || "").toLowerCase();
                      const aHasCap = an.includes("capital");
                      const bHasCap = bn.includes("capital");
                      if (aHasCap && !bHasCap) return -1;
                      if (!aHasCap && bHasCap) return 1;
                    }
                    return 0;
                  });
                  const out: any[] = [];
                  let cur = -1;
                  for (const row of sorted) {
                    const pri = sPriority(row.group_name, pm, isL);
                    if (pri !== cur) {
                      if (cur !== -1) out.push({ kind: "div" });
                      cur = pri;
                      const lbl = lm[pri];
                      if (lbl && pri !== 99) {
                        // For summary view, rows are already flat groups, so we sum them directly
                        const sectionTotal = sorted.filter(r => sPriority(r.group_name, pm, isL) === pri).reduce((acc, r) => acc + (r.amount ?? 0), 0);

                        // Always push the header with total
                        out.push({ kind: "sec", label: lbl, total: sectionTotal });
                      }
                    }
                    // In summary view:
                    // - Section 1 (Capital): Hide individual capital rows, but SHOW the Profit & Loss separately
                    // - Section 3 (Liabilities): Roll up completely
                    const k = String(row.group_name || "").toLowerCase();
                    const isPandL = k.includes("profit & loss") || k.includes("profit and loss");
                    const shouldRollup = (pri === 1 && !isPandL) || pri === 3;
                    
                    if (!shouldRollup) {
                      out.push({ kind: "srow", row });
                    }
                  }
                  if (cur !== -1) out.push({ kind: "div" });
                  return out;
                };

                const SLD = sBuildRows(liabilities, SPL, SLL, true);
                const SAD = sBuildRows(assets, SPA, SLA, false);
                const maxSD = Math.max(SLD.length, SAD.length);

                const renderSummaryCell = (item: any, isL: any) => {
                  const bordR = isL ? "border-r border-slate-300" : "";
                  if (!item) return (
                    <>
                      <td className={`px-3 py-[3px] ${isL ? "border-r border-slate-100" : ""}`}></td>
                      <td className={`px-3 py-[3px] ${bordR}`}></td>
                    </>
                  );
                  if (item.kind === "sec") return (
                    <>
                      <td className={`px-3 py-1.5 font-bold uppercase text-[12px] tracking-wide text-slate-700 bg-slate-100 border-y border-slate-200`}>
                        {item.label}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-bold text-[12px] text-slate-700 bg-slate-100 border-y border-slate-200 ${bordR}`}>
                        {item.total !== undefined ? formatAmountWithBrackets(item.total) : ""}
                      </td>
                    </>
                  );
                  if (item.kind === "div") return (
                    <>
                      <td className={`px-2 py-0 ${isL ? "border-r border-slate-100" : ""}`}><div className="border-t border-dashed border-slate-300"></div></td>
                      <td className={`px-2 py-0 ${bordR}`}><div className="border-t border-dashed border-slate-300"></div></td>
                    </>
                  );
                  const r = item.row;
                  return (
                    <>
                      <td className={`px-3 py-[3px] text-xs text-slate-700 truncate ${isL ? "border-r border-slate-100" : ""}`} title={r.group_name ?? ""}>{r.group_name}</td>
                      <td className={`px-3 py-[3px] text-right tabular-nums text-xs font-medium text-slate-800 ${bordR}`}>{formatAmountWithBrackets(r.amount)}</td>
                    </>
                  );
                };

                return (
                  <div className="bg-white shadow-sm border border-slate-300 overflow-hidden rounded-sm">
                    <table className="w-full text-[11px] border-collapse table-fixed">
                      <thead>
                        <tr className="bg-slate-800 text-white uppercase font-bold tracking-wider text-[11px]">
                          <th colSpan={2} className="px-3 py-2.5 text-center border-r border-slate-600">LIABILITIES</th>
                          <th colSpan={2} className="px-3 py-2.5 text-center">ASSETS</th>
                        </tr>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 font-semibold uppercase text-[9px]">
                          <th className="px-3 py-1 text-left w-[35%] border-r border-slate-200">Particulars</th>
                          <th className="px-3 py-1 text-right w-[15%] border-r border-slate-300">Amount</th>
                          <th className="px-3 py-1 text-left w-[35%] border-r border-slate-200">Particulars</th>
                          <th className="px-3 py-1 text-right w-[15%]">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxSD }).map((_, i) => (
                          <tr key={i} className="hover:bg-slate-50/50 transition-colors h-7">
                            {renderSummaryCell(SLD[i], true)}
                            {renderSummaryCell(SAD[i], false)}
                          </tr>
                        ))}
                        {Math.abs(totalLiabilities - totalAssets) > 0.01 && (
                          <tr className="h-8 bg-amber-50/50 border-t border-slate-200 font-medium italic">
                            {totalLiabilities < totalAssets ? (
                              <>
                                <td className="px-3 py-1.5 text-amber-800 border-r border-slate-100 text-xs">Difference in Opening Balance</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-amber-800 border-r border-slate-300 text-xs">{formatAmount(totalAssets - totalLiabilities)}</td>
                                <td className="px-3 py-1.5 border-r border-slate-100"></td>
                                <td className="px-3 py-1.5 text-right"></td>
                              </>
                            ) : (
                              <>
                                <td className="px-3 py-1.5 border-r border-slate-100"></td>
                                <td className="px-3 py-1.5 border-r border-slate-300 text-right"></td>
                                <td className="px-3 py-1.5 text-amber-800 border-r border-slate-100 text-xs">Difference in Opening Balance</td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-amber-800 text-xs">{formatAmount(totalLiabilities - totalAssets)}</td>
                              </>
                            )}
                          </tr>
                        )}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold text-slate-950 uppercase text-[12px]">
                        <tr className="h-10">
                          <td className="px-3 py-3 border-r border-slate-100">Total</td>
                          <td className="px-3 py-3 text-right tabular-nums border-r border-slate-300">{formatAmountWithBrackets(summarySideTotal)}</td>
                          <td className="px-3 py-3 border-r border-slate-100">Total</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatAmountWithBrackets(summarySideTotal)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })()}
            </div>


            <div
              style={{
                marginTop: "32px",
                fontSize: "10px",
                color: "#475569",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderTop: "1px solid #e2e8f0",
                paddingTop: "16px",
              }}
            >
              <span>
                {"Printed by: "}
                {(cc as any)?.contact_person || (cc as any)?.email || "System User"}
              </span>
              <div className="text-center w-1/3">
                <span className="block mb-6 font-bold">Approved By</span>
                <span className="border-t border-slate-400 block w-full"></span>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
