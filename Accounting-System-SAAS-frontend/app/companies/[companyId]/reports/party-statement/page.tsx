"use client";

import { useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  useCustomerLedgerMapping,
  useCustomerStatement,
  useSupplierLedgerMapping,
  useSupplierStatement,
} from "@/lib/api/partyStatements";
import { PartySelector, type PartyOption, type PartyType } from "@/components/ledger/PartySelector";
import { PartyStatementTable } from "@/components/ledger/PartyStatementTable";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { useEffect } from "react";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function PartyStatementPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string | undefined;

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: "AD" | "BS" }>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";

  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(() => {
    return readCalendarDisplayMode(companyId ? String(companyId) : '', initialMode);
  });
  const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>(() => {
    return readCalendarReportDisplayMode(companyId ? String(companyId) : '', initialMode);
  });

  const effectiveDisplayMode: CalendarReportDisplayMode =
    dateDisplayMode === "BOTH" ? reportDisplayMode : dateDisplayMode;

  const displayDate = (d: string): string => {
    if (!d) return "";
    // Backend always returns dates in AD (ISO) format.
    if (effectiveDisplayMode === "BS") {
      return safeADToBS(d) || d;
    }
    return d;
  };

  const [mounted, setMounted] = useState(false);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  useEffect(() => {
    setMounted(true);
    const cc = getCurrentCompany();
    const { from, to } = getSmartDefaultPeriod(cc?.calendar_mode || "AD", cc);
    setFromDate(from);
    setToDate(to);
  }, []);

  // Sync state if cc OR dbCompany changes after mount
  useEffect(() => {
    if (mounted) {
      const activeCo = dbCompany || getCurrentCompany();
      if (activeCo) {
        const { from, to } = getSmartDefaultPeriod(activeCo.calendar_mode || "AD", activeCo);
        setFromDate(from);
        setToDate(to);
        if (activeCo.calendar_mode) {
          setReportDisplayMode(activeCo.calendar_mode as any);
          setDateDisplayMode(activeCo.calendar_mode as any);
        }
      }
    }
  }, [mounted, dbCompany?.id, dbCompany?.fiscal_year_start, dbCompany?.calendar_mode]);
  const [partyType, setPartyType] = useState<PartyType>("customer");
  const [partyId, setPartyId] = useState<string>("");
  const printRef = useRef<HTMLDivElement | null>(null);

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

  const isBS = effectiveDisplayMode === "BS";
  const effectiveFromDate = isBS ? safeBSToAD(fromDate) : fromDate;
  const effectiveToDate = isBS ? safeBSToAD(toDate) : toDate;

  const [loadKey, setLoadKey] = useState<number>(0);

  const {
    data: customerMappings,
    isLoading: loadingCustomers,
    isError: customerMapError,
    error: customerMapErr,
  } = useCustomerLedgerMapping(companyId);

  const {
    data: supplierMappings,
    isLoading: loadingSuppliers,
    isError: supplierMapError,
    error: supplierMapErr,
  } = useSupplierLedgerMapping(companyId);

  const customerOptions: PartyOption[] = useMemo(() => {
    return (customerMappings || []).map((m) => ({
      id: m.customer_id,
      name: m.customer_name,
    }));
  }, [customerMappings]);

  const supplierOptions: PartyOption[] = useMemo(() => {
    return (supplierMappings || []).map((m) => ({
      id: m.supplier_id,
      name: m.supplier_name,
    }));
  }, [supplierMappings]);

  const shouldFetchStatement = !!companyId && !!partyId && !!fromDate && !!toDate && loadKey > 0;

  const {
    report: customerReport,
    isLoading: loadingCustomerStatement,
    isError: errorCustomerStatement,
    error: customerStatementError,
  } = useCustomerStatement(
    shouldFetchStatement && partyType === "customer" ? companyId : undefined,
    shouldFetchStatement && partyType === "customer" ? partyId : undefined,
    effectiveFromDate,
    effectiveToDate,
  );

  const {
    report: supplierReport,
    isLoading: loadingSupplierStatement,
    isError: errorSupplierStatement,
    error: supplierStatementError,
  } = useSupplierStatement(
    shouldFetchStatement && partyType === "supplier" ? companyId : undefined,
    shouldFetchStatement && partyType === "supplier" ? partyId : undefined,
    effectiveFromDate,
    effectiveToDate,
  );

  const report = partyType === "customer" ? customerReport : supplierReport;
  const isLoadingStatement = partyType === "customer" ? loadingCustomerStatement : loadingSupplierStatement;
  const isErrorStatement = partyType === "customer" ? errorCustomerStatement : errorSupplierStatement;
  const statementError = partyType === "customer" ? customerStatementError : supplierStatementError;

  if (!companyId) return null;

  return (
    <div className="space-y-5">
      {/* Compact Header - matching voucher page style */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Party Statement</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Customer &amp; supplier account statements</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-sm transition-all"
            >
              <span>🖨️</span>
              Print
            </button>
            <button
              onClick={() => router.push(`/companies/${companyId}/reports`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-rose-600 text-xs font-semibold shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <div
        className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-slate-50/50 dark:bg-slate-900/50"
      >
        <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide">🔍 Party & Date Filters</span>
        </div>
        <div className="p-5 flex flex-wrap items-end gap-4">
          {/* Party Type Toggle */}
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Party Type</label>
            <div className="inline-flex rounded-xl overflow-hidden border border-violet-300 shadow-sm">
              <button
                type="button"
                className={`px-5 py-2 text-sm font-semibold transition-all ${partyType === "customer"
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-inner"
                  : "bg-white text-slate-600 hover:bg-violet-50"
                  }`}
                onClick={() => {
                  setPartyType("customer");
                  setPartyId("");
                }}
              >
                🛋 Customer
              </button>
              <button
                type="button"
                className={`px-5 py-2 text-sm font-semibold transition-all border-l border-violet-300 ${partyType === "supplier"
                  ? "bg-gradient-to-r from-violet-600 to-purple-600 text-white shadow-inner"
                  : "bg-white text-slate-600 hover:bg-violet-50"
                  }`}
                onClick={() => {
                  setPartyType("supplier");
                  setPartyId("");
                }}
              >
                🏭 Supplier
              </button>
            </div>
          </div>

          <PartySelector
            partyType={partyType}
            value={partyId}
            onChange={setPartyId}
            customerOptions={customerOptions}
            supplierOptions={supplierOptions}
            isLoading={partyType === "customer" ? loadingCustomers : loadingSuppliers}
          />

          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date Display</label>
            <select
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all shadow-sm disabled:opacity-50"
              value={effectiveDisplayMode}
              onChange={(e) => {
                if (!companyId) return;
                const next = e.target.value as CalendarReportDisplayMode;
                setReportDisplayMode(next);
                writeCalendarReportDisplayMode(companyId, next);
                const { from, to } = getSmartDefaultPeriod(next, dbCompany || getCurrentCompany());
                setFromDate(from);
                setToDate(to);
              }}
              disabled={dateDisplayMode !== "BOTH"}
            >
              {dateDisplayMode === "BOTH" ? (
                <>
                  <option value="AD">AD</option>
                  <option value="BS">BS</option>
                </>
              ) : (
                <option value={effectiveDisplayMode}>{effectiveDisplayMode}</option>
              )}
            </select>
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
            {!mounted ? (
              <div className="h-9 w-[120px] rounded-lg animate-pulse bg-slate-100 dark:bg-slate-800" />
            ) : effectiveDisplayMode === 'BS' ? (
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all w-[120px]"
                value={isBS ? fromDate : safeADToBS(fromDate)}
                onChange={(value: string) => setFromDate(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                // @ts-ignore
                minDate={getCurrentCompany()?.fiscal_year_start ? (safeADToBS(getCurrentCompany()?.fiscal_year_start || "") || "") : ""}
                // @ts-ignore
                maxDate={getCurrentCompany()?.fiscal_year_end ? (safeADToBS(getCurrentCompany()?.fiscal_year_end || "") || "") : ""}
              />
            ) : (
              <Input forceNative type="date"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all"
                value={isBS ? safeBSToAD(fromDate) : fromDate}
                min={getCurrentCompany()?.fiscal_year_start || ""}
                max={getCurrentCompany()?.fiscal_year_end || ""}
                onChange={(e) => setFromDate(e.target.value)}
              />
            )}
          </div>

          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
            {!mounted ? (
              <div className="h-9 w-[120px] rounded-lg animate-pulse bg-slate-100 dark:bg-slate-800" />
            ) : effectiveDisplayMode === 'BS' ? (
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all w-[120px]"
                value={isBS ? toDate : safeADToBS(toDate)}
                onChange={(value: string) => setToDate(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                // @ts-ignore
                minDate={getCurrentCompany()?.fiscal_year_start ? (safeADToBS(getCurrentCompany()?.fiscal_year_start || "") || "") : ""}
                // @ts-ignore
                maxDate={getCurrentCompany()?.fiscal_year_end ? (safeADToBS(getCurrentCompany()?.fiscal_year_end || "") || "") : ""}
              />
            ) : (
              <Input forceNative type="date"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-xs text-slate-700 hover:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-300 transition-all"
                value={isBS ? safeBSToAD(toDate) : toDate}
                min={getCurrentCompany()?.fiscal_year_start || ""}
                max={getCurrentCompany()?.fiscal_year_end || ""}
                onChange={(e) => setToDate(e.target.value)}
              />
            )}
          </div>

          <button
            type="button"
            className="h-9 rounded-lg px-6 text-sm font-semibold text-white transition-all duration-200 shadow-sm hover:shadow active:scale-95 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!partyId || !fromDate || !toDate}
            onClick={() => setLoadKey((k) => k + 1)}
          >
            ➔ Load Statement
          </button>
        </div>
      </div>

      {(customerMapError || supplierMapError) && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <span>
            {(customerMapErr as any)?.response?.data?.detail || (supplierMapErr as any)?.response?.data?.detail || "Failed to load parties."}
          </span>
        </div>
      )}

      {/* Statement Content */}
      <div ref={printRef} className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-white dark:bg-slate-950">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-slate-700 text-sm font-semibold">{partyType === "customer" ? "🛋 Customer" : "🏭 Supplier"} Statement</span>
        </div>
        <div className="p-4">
          {isLoadingStatement && (
            <div className="flex items-center gap-3 text-sm text-violet-700 py-4">
              <div className="w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
              Loading statement...
            </div>
          )}

          {isErrorStatement && (
            <div className="text-sm text-red-600 py-2">
              {(statementError as any)?.response?.data?.detail || "Failed to load statement."}
            </div>
          )}

          {!isLoadingStatement && !isErrorStatement && report && (
            <PartyStatementTable report={report} displayDate={displayDate} mode={effectiveDisplayMode} />
          )}

          {!isLoadingStatement && !isErrorStatement && !report && (
            <div className="flex items-center gap-3 text-sm text-slate-500 py-6">
              <span className="text-2xl">📎</span>
              <span>Select party and dates, then click <strong>Load Statement</strong>.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
