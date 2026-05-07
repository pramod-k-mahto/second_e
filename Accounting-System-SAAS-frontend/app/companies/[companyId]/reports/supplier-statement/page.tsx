"use client";

import { useParams, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSupplierStatement } from "@/lib/api/partyStatements";
import { PartyStatementTable } from "@/components/ledger/PartyStatementTable";
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from "@/lib/api";
import useSWR from "swr";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
  readCalendarDisplayMode,
} from "@/lib/calendarMode";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function SupplierStatementReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const companyId = params?.companyId as string | undefined;

  const [mounted, setMounted] = useState(false);

  // 1. Immediate initialization from localStorage to prevent hydration flicker
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);
  const [supplierId, setSupplierId] = useState<string>("");

  // 2. Stable submission state to drive SWR
  const [submittedFromDate, setSubmittedFromDate] = useState("");
  const [submittedToDate, setSubmittedToDate] = useState("");
  const [submittedSupplierId, setSubmittedSupplierId] = useState("");

  const printRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 3. Fetch latest company settings to ensure UI stays in sync with DB
  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const cc = mounted ? getCurrentCompany() : initialCC;

  // Reactively sync calendar mode if it changes in the database
  useEffect(() => {
    if (mounted && dbCompany) {
      const modeChanged = dbCompany.calendar_mode && dbCompany.calendar_mode !== effectiveDisplayMode;
      const initialWasFallback = !initialCC?.fiscal_year_start && dbCompany.fiscal_year_start;

      if (modeChanged || initialWasFallback) {
        const nextMode = (dbCompany.calendar_mode || effectiveDisplayMode) as "AD" | "BS";
        setEffectiveDisplayMode(nextMode);
        const { from, to } = getSmartDefaultPeriod(nextMode, dbCompany);
        setFromDate(from);
        setToDate(to);
        
        // Update submission state to refresh report immediately if it was just a fallback
        if (initialWasFallback || !submittedFromDate) {
           setSubmittedFromDate(nextMode === "BS" ? safeBSToAD(from) || from : from);
           setSubmittedToDate(nextMode === "BS" ? safeBSToAD(to) || to : to);
        }
      }
    }
  }, [mounted, dbCompany?.id, dbCompany?.calendar_mode, dbCompany?.fiscal_year_start]);

  // Sync from URL params
  useEffect(() => {
    const sid = searchParams.get("supplier_id");
    const from = searchParams.get("from_date");
    const to = searchParams.get("to_date");

    if (sid) {
      setSupplierId(sid);
      setSubmittedSupplierId(sid);
    }
    if (from && to) {
      setFromDate(from);
      setToDate(to);
      const isBS = effectiveDisplayMode === "BS";
      setSubmittedFromDate(isBS ? safeBSToAD(from) || from : from);
      setSubmittedToDate(isBS ? safeBSToAD(to) || to : to);
    } else if (!submittedFromDate && fromDate && toDate) {
      // Default to smart period if not yet submitted
      const isBS = effectiveDisplayMode === "BS";
      setSubmittedFromDate(isBS ? safeBSToAD(fromDate) || fromDate : fromDate);
      setSubmittedToDate(isBS ? safeBSToAD(toDate) || toDate : toDate);
    }
  }, [searchParams, effectiveDisplayMode, fromDate, toDate]);

  const { report, isLoading, error } = useSupplierStatement(
    companyId,
    submittedSupplierId,
    submittedFromDate,
    submittedToDate,
  );

  const handleApply = (e?: React.FormEvent) => {
    e?.preventDefault();
    const isBS = effectiveDisplayMode === "BS";
    setSubmittedFromDate(isBS ? safeBSToAD(fromDate) || fromDate : fromDate);
    setSubmittedToDate(isBS ? safeBSToAD(toDate) || toDate : toDate);
    setSubmittedSupplierId(supplierId);
  };

  const isBS_Effective = effectiveDisplayMode === "BS";

  const displayDate = (d: string): string => {
    if (!d) return "";
    if (effectiveDisplayMode === "BS") {
      return safeADToBS(d) || d;
    }
    return d;
  };

  const handlePrint = () => {
    if (typeof window === 'undefined' || !printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const originalHead = document.head.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(
      `<!doctype html><html><head>${originalHead}<style>
        .print-hidden{display:none !important;} 
        table{border-collapse:collapse;width:100%;font-size:10px;} 
        th,td{border:1px solid #e2e8f0;padding:2px 3px;} 
        .print-toolbar {
          position: fixed; top: 0; left: 0; right: 0;
          padding: 12px 20px; background: #fff; border-bottom: 2px solid #e2e8f0;
          display: flex; gap: 12px; align-items: center; justify-content: flex-start;
          z-index: 99999; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .print-toolbar button {
          display: flex; align-items: center; gap: 8px;
          padding: 8px 18px; border-radius: 8px; font-size: 13px; font-weight: 700;
          cursor: pointer; transition: all 0.2s; border: 1px solid #cbd5e1; background: #fff; color: #334155;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .print-toolbar button:hover { background: #f8fafc; border-color: #94a3b8; transform: translateY(-1px); }
        .print-toolbar .primary { background: #4f46e5 !important; color: #fff !important; border-color: #4f46e5 !important; }
        .print-toolbar .primary:hover { background: #4338ca !important; border-color: #4338ca !important; }
        @media print {
          .print-toolbar { display: none !important; }
          body { padding: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; }
          thead { display: table-header-group; }
          @page { margin: 8mm; }
        }
      </style></head><body style="padding-top: 70px;">
      <div class="print-toolbar">
        <button class="primary" onclick="window.print()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
          Print Report
        </button>
        <button onclick="window.close()">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Close Preview
        </button>
      </div>
      ${printContents}<script>window.onload=function(){var b=document.body,pw=b.clientWidth,sw=b.scrollWidth;if(sw>pw+5){var s=pw/sw;b.style.transform='scale('+s+')';b.style.transformOrigin='top left';b.style.width=(100/s)+'%';}}</script></body></html>`
    );
    win.document.close();
    win.focus();
  };

  if (!companyId) return null;

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
              </svg>
            </div>
            <button 
              onClick={() => router.push(`/companies/${companyId}`)}
              className="group flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-all shadow-sm mr-1"
              title="Back to Dashboard"
            >
              <svg className="w-4 h-4 text-slate-500 group-hover:text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
            </button>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Supplier Statement</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Supplier account outstanding & purchase history</p>
            </div>
          </div>
          <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-sm transition-all active:scale-95">🖨️ Print</button>
        </div>
      </div>

      <form onSubmit={handleApply} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 text-xs shadow-sm flex flex-wrap items-end gap-4 mt-1">
        <div className="flex flex-col gap-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Supplier ID</label>
          <input
            type="text"
            placeholder="Enter ID..."
            className="h-9 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all w-40"
            value={supplierId}
            onChange={(e) => setSupplierId(e.target.value)}
          />
        </div>
        
        <div className="flex flex-col gap-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">Date Display</label>
          <select
            className="h-9 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
            value={effectiveDisplayMode}
            onChange={(e) => {
              const next = e.target.value as CalendarReportDisplayMode;
              setEffectiveDisplayMode(next);
              if (companyId) {
                writeCalendarReportDisplayMode(companyId, next);
                const { from, to } = getSmartDefaultPeriod(next, cc);
                setFromDate(from);
                setToDate(to);
              }
            }}
          >
            <option value="AD">AD (Gregorian)</option>
            <option value="BS (Nepali)">BS (Bikram Sambat)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">From Date</label>
          {isBS_Effective ? (
            <NepaliDatePicker
              inputClassName="h-9 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm w-36 outline-none"
              value={isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) > 2000 ? fromDate : safeADToBS(fromDate) || ""}
              onChange={(value: string) => setFromDate(value)}
              options={{ calenderLocale: 'ne', valueLocale: 'en' }}
            />
          ) : (
            <Input forceNative
              type="date"
              className="h-9 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm w-40 outline-none"
              value={!isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) < 2000 ? fromDate : safeBSToAD(fromDate) || ""}
              onChange={(e) => setFromDate(e.target.value)}
            />
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wide">To Date</label>
          {isBS_Effective ? (
            <NepaliDatePicker
              inputClassName="h-9 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm w-36 outline-none"
              value={isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) > 2000 ? toDate : safeADToBS(toDate) || ""}
              onChange={(value: string) => setToDate(value)}
              options={{ calenderLocale: 'ne', valueLocale: 'en' }}
            />
          ) : (
            <Input forceNative
              type="date"
              className="h-9 border border-slate-300 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm w-40 outline-none"
              value={!isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) < 2000 ? toDate : safeBSToAD(toDate) || ""}
              onChange={(e) => setToDate(e.target.value)}
            />
          )}
        </div>

        <button
          type="submit"
          disabled={isLoading}
          className="h-9 px-6 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50"
        >
          {isLoading ? "Loading..." : "Show Statement"}
        </button>
      </form>

      <div ref={printRef} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm mt-1 min-h-[400px]">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-center gap-2">
            <span>⚠️</span>
            <span>{error?.response?.data?.detail || "Failed to load statement. Please verify the Supplier ID."}</span>
          </div>
        )}
        
        {!isLoading && !error && report && report.transactions && report.transactions.length > 0 && (
          <PartyStatementTable 
            report={report} 
            displayDate={displayDate} 
            companyAddress={(cc as any)?.address}
            mode={effectiveDisplayMode}
          />
        )}
        
        {!isLoading && !error && report && (!report.transactions || report.transactions.length === 0) && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-2">
            <span className="text-4xl">📭</span>
            <p className="font-medium text-sm">No transactions found for the selected period.</p>
          </div>
        )}
        
        {!isLoading && !error && !report && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-4 opacity-70">
            <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-2xl">🚛</div>
            <div className="text-center">
              <p className="font-bold text-slate-600 dark:text-slate-300">Supplier Statement Viewer</p>
              <p className="text-xs mt-1">Enter a valid Supplier ID and select your date range to begin.</p>
            </div>
          </div>
        )}
        
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-20 text-emerald-500 animate-pulse gap-4">
            <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em]">Retrieving Transaction History...</p>
          </div>
        )}
      </div>
    </div>
  );
}
