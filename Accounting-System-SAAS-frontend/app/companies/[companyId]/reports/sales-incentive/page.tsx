"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import "nepali-datepicker-reactjs/dist/index.css";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

type CompanySettings = { calendar_mode: "AD" | "BS" };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtN = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);

type InvoiceRow = {
  id: number; date: string; reference: string | null;
  voucher_no: string | null; ledger_name: string | null; booked_ledger_name?: string | null; remarks: string | null;
  customer_id: number; total_amount: number; total_qty: number;
  incentive_amount: number; post_method: string;
  department_id: number | null; project_id: number | null;
};
type AppliedRule = { rule_id: number; rule_name: string; incentive_value: number };
type PersonRow = {
  sales_person_id: number | null; sales_person_name: string;
  sales_amount: number; total_qty: number; invoice_count: number;
  invoices: InvoiceRow[]; incentive_amount: number;
  applicable_rules: AppliedRule[];
};
type ReportData = {
  from_date: string; to_date: string;
  total_sales_amount: number; total_incentive_amount: number;
  total_invoices: number; persons: PersonRow[]; rules_count: number;
};
type Employee = { id: number; full_name: string };
type Department = { id: number; name: string };
type Project = { id: number; name: string };
type Segment = { id: number; name: string };
type IncentiveRule = { id: number; name: string; basis_type: string; incentive_type: string; incentive_value: number; threshold_min: number; threshold_max: number | null };

export default function SalesIncentiveReportPage() {
  const { companyId } = useParams() as { companyId: string };
  const router = useRouter();

  const { data: companyInfo } = useSWR<{ fiscal_year_start?: string }>(companyId ? `/companies/${companyId}` : null, fetcher);

  const { data: companySettings } = useSWR<CompanySettings>(companyId ? `/companies/${companyId}/settings` : null, fetcher);

  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>("AD");
  const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>("AD");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const isBS = dateDisplayMode === "BOTH" ? reportDisplayMode === "BS" : dateDisplayMode === "BS";
  const effectiveDisplayMode = dateDisplayMode === "BOTH" ? reportDisplayMode : dateDisplayMode;

  useEffect(() => {
    if (!companyId) return;
    const disp = readCalendarDisplayMode(companyId);
    setDateDisplayMode(disp);
    const rep = readCalendarReportDisplayMode(companyId);
    setReportDisplayMode(rep);

    const isCurrentlyBS = disp === "BOTH" ? rep === "BS" : disp === "BS";
    if (!fromDate || !toDate) {
      const todayStr = new Date().toISOString().slice(0, 10);
      let fiscalStartAd = companyInfo?.fiscal_year_start;

      if (!fiscalStartAd) {
        const todayBS = safeADToBS(todayStr) || "";
        const parts = todayBS.split("-");
        if (parts.length >= 2) {
          const y = parseInt(parts[0], 10);
          const m = parseInt(parts[1], 10);
          const fyYear = m >= 4 ? y : y - 1;
          const bsStart = `${fyYear}-04-01`;
          fiscalStartAd = safeBSToAD(bsStart) || todayStr;
        } else {
          fiscalStartAd = todayStr;
        }
      }

      setFromDate(isCurrentlyBS ? safeADToBS(fiscalStartAd) || "" : fiscalStartAd);
      setToDate(isCurrentlyBS ? safeADToBS(todayStr) || "" : todayStr);
    }
  }, [companyId, companyInfo]);

  const [filterPerson, setFilterPerson] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterSegment, setFilterSegment] = useState("");
  const [viewMode, setViewMode] = useState<"summary" | "detail" | "invoice">("summary");
  const [expandedPerson, setExpandedPerson] = useState<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (typeof window === 'undefined' || !printRef.current) return;
    const printContents = printRef.current.innerHTML;
    const originalHead = document.head.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(
      `<!doctype html><html><head>${originalHead}<style>.print-hidden{display:none !important;} table{border-collapse:collapse;width:100%;font-size:10px;} th,td{border:1px solid #e2e8f0;padding:3px 5px;} .print-toolbar{padding:8px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;font-family:sans-serif;background:#f8fafc;} .print-toolbar button{padding:4px 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;font-weight:600;} .print-toolbar button:hover{background:#f1f5f9;} .print-toolbar .primary{background:#4f46e5;color:#fff;border-color:#4f46e5;} .print-toolbar .primary:hover{background:#4338ca;} @media print{.print-toolbar{display:none !important;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} table{page-break-inside:auto;} tr{page-break-inside:avoid;} thead{display:table-header-group;}} @page{size:landscape;margin:6mm;}</style></head><body><div class="print-toolbar"><button class="primary" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${printContents}<script>(function(){var st=document.createElement('style');st.textContent='@page{size:landscape;margin:6mm;}';document.head.appendChild(st);window.onload=function(){var b=document.body,pw=b.clientWidth,sw=b.scrollWidth;if(sw>pw+5){var s=pw/sw;b.style.transform=\"scale(\"+s+\")\";b.style.transformOrigin=\"top left\";b.style.width=(100/s)+\"%\";}};})()</script></body></html>`
    );
    win.document.close();
    win.focus();
  };

  const displayDate = (d: string): string => {
    if (!d) return "";
    if (effectiveDisplayMode === "BS") return safeADToBS(d) || d;
    return d;
  };

  // Dropdown data
  const { data: salesPersons = [] } = useSWR<any[]>(companyId ? `/companies/${companyId}/sales-persons?is_active=true` : null, fetcher);
  const { data: departments = [] } = useSWR<Department[]>(companyId ? `/companies/${companyId}/departments` : null, fetcher);
  const { data: projects = [] } = useSWR<Project[]>(companyId ? `/companies/${companyId}/projects` : null, fetcher);
  const { data: segments = [] } = useSWR<Segment[]>(companyId ? `/companies/${companyId}/segments` : null, fetcher);
  const { data: rules = [] } = useSWR<IncentiveRule[]>(companyId ? `/companies/${companyId}/setup/incentives` : null, fetcher);

  // Build query string
  const qs = useMemo(() => {
    const effectiveFromAD = isBS ? safeBSToAD(fromDate) || fromDate : fromDate;
    const effectiveToAD = isBS ? safeBSToAD(toDate) || toDate : toDate;
    const p = new URLSearchParams({ from_date: effectiveFromAD, to_date: effectiveToAD });
    if (filterPerson) p.set("sales_person_id", filterPerson);
    if (filterDept) p.set("department_id", filterDept);
    if (filterProject) p.set("project_id", filterProject);
    if (filterSegment) p.set("segment_id", filterSegment);
    return p.toString();
  }, [fromDate, toDate, filterPerson, filterDept, filterProject, filterSegment, isBS]);

  const reportUrl = companyId ? `/companies/${companyId}/reports/sales-incentive?${qs}` : null;
  const { data: report, error, isLoading, mutate } = useSWR<ReportData>(reportUrl, fetcher);

  const sel = "border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all";

  const hasRules = rules.length > 0;
  const totalIncentiveRate = report && report.total_sales_amount > 0
    ? ((report.total_incentive_amount / report.total_sales_amount) * 100).toFixed(2)
    : "0.00";

  return (
    <div className="space-y-3" ref={printRef}>
      {/* ── Header ─────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden print:hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500" />
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 border border-violet-100 text-base">💰</div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Incentive Report</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">Incentive calculation per sales person</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-sm">🖨️ Print</button>
            <button onClick={() => router.push(`/companies/${companyId}/settings/setup`)} className="px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 hover:bg-violet-100 text-violet-700 text-xs font-semibold shadow-sm">⚙️ Setup Rules</button>
            <button onClick={() => router.back()} className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-sm transition-all">
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-violet-500 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
              </svg>
              Back
            </button>
            <button onClick={() => router.push(`/companies/${companyId}`)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-transparent hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold shadow-sm transition-all active:scale-95">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      {/* ── No rules warning ───────────────────────────── */}
      {!hasRules && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 flex items-start gap-3">
          <span className="text-lg shrink-0">⚠️</span>
          <div>
            <p className="text-xs font-semibold text-amber-800">No Incentive Rules Configured</p>
            <p className="text-[11px] text-amber-600 mt-0.5">
              The report will show sales data but incentive amounts will be ₹ 0.
              <button onClick={() => router.push(`/companies/${companyId}/settings/setup`)} className="underline font-semibold ml-1">Set up incentive rules →</button>
            </p>
          </div>
        </div>
      )}

      {/* ── Filters ────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm p-3 print:hidden">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Date Display</label>
            <select
              className={sel}
              value={effectiveDisplayMode}
              onChange={(e) => {
                if (dateDisplayMode !== "BOTH") return;
                const next = e.target.value as CalendarReportDisplayMode;
                setReportDisplayMode(next);
                writeCalendarReportDisplayMode(companyId, next);
              }}
              disabled={dateDisplayMode !== "BOTH"}
            >
              {dateDisplayMode === "BOTH" ? (
                <>
                  <option value="AD">AD (Gregorian)</option>
                  <option value="BS">BS (Nepali)</option>
                </>
              ) : (
                <option value={effectiveDisplayMode}>{effectiveDisplayMode}</option>
              )}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-500 text-[10px] font-semibold uppercase">From</label>
            {effectiveDisplayMode === "BS" ? (
              <NepaliDatePicker
                inputClassName={sel}
                value={isBS ? fromDate : safeADToBS(fromDate)}
                onChange={(bs: string) => setFromDate(isBS ? bs : safeBSToAD(bs))}
                options={{ calenderLocale: "ne", valueLocale: "en" }}
              />
            ) : (
              <input
                type="date"
                className={sel}
                value={isBS ? safeBSToAD(fromDate) : fromDate}
                onChange={(e) => setFromDate(isBS ? safeADToBS(e.target.value) : e.target.value)}
              />
            )}
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-500 text-[10px] font-semibold uppercase">To</label>
            {effectiveDisplayMode === "BS" ? (
              <NepaliDatePicker
                inputClassName={sel}
                value={isBS ? toDate : safeADToBS(toDate)}
                onChange={(bs: string) => setToDate(isBS ? bs : safeBSToAD(bs))}
                options={{ calenderLocale: "ne", valueLocale: "en" }}
              />
            ) : (
              <input
                type="date"
                className={sel}
                value={isBS ? safeBSToAD(toDate) : toDate}
                onChange={(e) => setToDate(isBS ? safeADToBS(e.target.value) : e.target.value)}
              />
            )}
          </div>
          <button
            onClick={() => {
              const todayStr = new Date().toISOString().slice(0, 10);
              let fiscalStartAd = companyInfo?.fiscal_year_start;

              if (!fiscalStartAd) {
                const todayBS = safeADToBS(todayStr) || "";
                const parts = todayBS.split("-");
                if (parts.length >= 2) {
                  const y = parseInt(parts[0], 10);
                  const m = parseInt(parts[1], 10);
                  const fyYear = m >= 4 ? y : y - 1;
                  const bsStart = `${fyYear}-04-01`;
                  fiscalStartAd = safeBSToAD(bsStart) || todayStr;
                } else {
                  fiscalStartAd = todayStr;
                }
              }

              const todayPrimary = isBS ? safeADToBS(todayStr) || "" : todayStr;
              const fromPrimary = isBS ? safeADToBS(fiscalStartAd) || "" : fiscalStartAd;
              setFromDate(fromPrimary);
              setToDate(todayPrimary);
            }}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-all shadow-sm"
          >
            Today
          </button>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Sales Person</label>
            <select className={sel} value={filterPerson} onChange={(e) => setFilterPerson(e.target.value)}>
              <option value="">All Persons</option>
              {salesPersons.map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Department</label>
            <select className={sel} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
              <option value="">All Departments</option>
              {(departments as Department[]).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Project</label>
            <select className={sel} value={filterProject} onChange={(e) => setFilterProject(e.target.value)}>
              <option value="">All Projects</option>
              {(projects as Project[]).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Segment</label>
            <select className={sel} value={filterSegment} onChange={(e) => setFilterSegment(e.target.value)}>
              <option value="">All Segments</option>
              {(segments as Segment[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <button onClick={() => mutate()} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-all">🔄 Refresh</button>

          {/* View mode toggle */}
          <div className="ml-auto flex gap-1 bg-slate-100 p-1 rounded-lg">
            {(["summary", "detail", "invoice"] as const).map((m) => (
              <button key={m} onClick={() => setViewMode(m)}
                className={`px-3 py-1 rounded text-xs font-semibold transition-all ${viewMode === m ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                {m === "summary" ? "📊 Summary" : m === "detail" ? "📋 Detail" : "🧾 Invoices"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── KPI Summary Cards ──────────────────────────── */}
      {report && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Total Sales", value: `₹ ${fmt(report.total_sales_amount)}`, icon: "💼", bg: "bg-indigo-50 border-indigo-100", text: "text-indigo-700", sub: "In selected period" },
            { label: "Total Incentive", value: `₹ ${fmt(report.total_incentive_amount)}`, icon: "🎯", bg: "bg-violet-50 border-violet-100", text: "text-violet-700", sub: `${totalIncentiveRate}% of sales` },
            { label: "Sales Persons", value: String(report.persons.length), icon: "👤", bg: "bg-amber-50 border-amber-100", text: "text-amber-700", sub: "Active this period" },
            { label: "Total Invoices", value: String(report.total_invoices), icon: "🧾", bg: "bg-emerald-50 border-emerald-100", text: "text-emerald-700", sub: `Rules applied: ${report.rules_count}` },
          ].map((card) => (
            <div key={card.label} className={`rounded-xl border p-3 ${card.bg}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-base">{card.icon}</span>
                <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{card.label}</span>
              </div>
              <div className={`text-lg font-bold ${card.text}`}>{card.value}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">{card.sub}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Rules Quick Reference ──────────────────────── */}
      {hasRules && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100 bg-slate-50">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Active Incentive Rules ({rules.length})</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50/50 border-b border-slate-100 text-[10px] text-slate-500 uppercase">
                  <th className="text-left px-3 py-1.5 font-semibold">Rule Name</th>
                  <th className="text-left px-3 py-1.5 font-semibold">Basis</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Min</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Max</th>
                  <th className="text-right px-3 py-1.5 font-semibold">Incentive</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(rules as IncentiveRule[]).map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{r.name}</td>
                    <td className="px-3 py-1.5 text-slate-500 capitalize">{r.basis_type.replace(/_/g, " ")}</td>
                    <td className="px-3 py-1.5 text-right text-slate-500">{fmtN(r.threshold_min)}</td>
                    <td className="px-3 py-1.5 text-right text-slate-400">{r.threshold_max != null ? fmtN(r.threshold_max) : "∞"}</td>
                    <td className="px-3 py-1.5 text-right font-semibold text-violet-700">
                      {r.incentive_type === "fixed" ? `₹ ${fmtN(r.incentive_value)}` : `${r.incentive_value}%`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Main Report Table ──────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
            <div className="w-4 h-4 border-2 border-slate-200 border-t-violet-500 rounded-full animate-spin" />
            Calculating incentives...
          </div>
        ) : error ? (
          <div className="py-10 text-center text-xs text-red-500">Failed to load report. Please try again.</div>
        ) : !report?.persons?.length ? (
          <div className="py-10 text-center">
            <div className="text-2xl mb-2">💰</div>
            <p className="text-xs font-semibold text-slate-600">No Sales Data Found</p>
            <p className="text-[11px] text-slate-400 mt-1">No invoices found for the selected period and filters.</p>
          </div>
        ) : (
          <>
            {/* Print header */}
            <div className="hidden print:block text-center pt-4 pb-2">
              <p className="font-bold text-base">Sales Incentive Report</p>
              <p className="text-xs text-slate-500">Period: {displayDate(report.from_date)} to {displayDate(report.to_date)}</p>
            </div>

            <div className="overflow-x-auto">
              {viewMode === "invoice" ? (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">Date</th>
                      <th className="text-left px-3 py-2 font-semibold">Bill No.</th>
                       <th className="text-left px-3 py-2 font-semibold">Voucher No.</th>
                      <th className="text-left px-3 py-2 font-semibold">Sales Person</th>
                      <th className="text-left px-3 py-2 font-semibold">Ledger (Customer)</th>
                      <th className="text-left px-3 py-2 font-semibold">Ledger (Expense)</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Amount</th>
                      <th className="text-right px-3 py-2 font-semibold">Incentive</th>
                      <th className="text-center px-3 py-2 font-semibold">Post Method</th>
                      <th className="text-left px-3 py-2 font-semibold">Details (Remarks)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(report.persons as PersonRow[]).flatMap(person => 
                      person.invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                          onClick={() => {
                            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                            router.push(`/companies/${companyId}/sales/invoices/${inv.id}?returnUrl=${returnUrl}`);
                          }}>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{displayDate(inv.date)}</td>
                          <td className="px-3 py-2 font-mono text-indigo-600 underline">{inv.reference || `INV-${inv.id}`}</td>
                          <td className="px-3 py-2 text-slate-600">{inv.voucher_no || "-"}</td>
                          <td className="px-3 py-2 font-medium text-slate-800">{person.sales_person_name}</td>
                          <td className="px-3 py-2 text-slate-700 font-medium">{inv.ledger_name || "-"}</td>
                          <td className="px-3 py-2 text-violet-700 font-medium">{inv.booked_ledger_name || "-"}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{fmtN(inv.total_qty)}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">{fmt(inv.total_amount)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-emerald-700">{fmt(inv.incentive_amount || 0)}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                              inv.post_method === 'Manual' ? 'bg-amber-100 text-amber-600 border border-amber-200' : 
                              'bg-indigo-100 text-indigo-600 border border-indigo-200'
                            }`}>
                              {inv.post_method || 'Auto'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-slate-500 italic max-w-[200px] truncate" title={inv.remarks || ""}>{inv.remarks || "-"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-[11px] text-slate-700">
                      <td className="px-3 py-2" colSpan={6}>Totals ({report.total_invoices} invoices)</td>
                      <td className="px-3 py-2 text-right">{fmtN(report.persons.reduce((s, p) => s + p.total_qty, 0))}</td>
                      <td className="px-3 py-2 text-right">{fmt(report.total_sales_amount)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(report.total_incentive_amount)}</td>
                      <td className="px-3 py-2" colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">Sales Person</th>
                      <th className="text-right px-3 py-2 font-semibold">Invoices</th>
                      <th className="text-right px-3 py-2 font-semibold">Total Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Sales Amount</th>
                      <th className="text-right px-3 py-2 font-semibold">Incentive %</th>
                      <th className="text-right px-3 py-2 font-semibold">Incentive Amount</th>
                      <th className="text-left px-3 py-2 font-semibold">Applied Rules</th>
                      {(viewMode === "summary" || viewMode === "detail") && <th className="text-center px-3 py-2 font-semibold">Details</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(report.persons as PersonRow[]).map((person) => {
                      const pKey = person.sales_person_id ? String(person.sales_person_id) : "unassigned";
                      const isExpanded = expandedPerson === pKey;
                      const incRate = person.sales_amount > 0
                        ? ((person.incentive_amount / person.sales_amount) * 100).toFixed(1)
                        : "0.0";
                      const barPct = report.total_sales_amount > 0
                        ? Math.round((person.sales_amount / report.total_sales_amount) * 100)
                        : 0;

                      return (
                        <>
                          <tr key={pKey}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                            onClick={() => setExpandedPerson(isExpanded ? null : pKey)}>
                            <td className="px-3 py-2 font-semibold text-slate-800 dark:text-slate-100">
                              <div className="flex items-center gap-2">
                                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-violet-100 text-violet-700 text-[10px] font-bold shrink-0">
                                  {person.sales_person_name.charAt(0).toUpperCase()}
                                </span>
                                <div>
                                  <div>{person.sales_person_name}</div>
                                  {/* Mini bar */}
                                  <div className="mt-0.5 h-1 w-24 bg-slate-100 rounded-full overflow-hidden">
                                    <div className="h-full bg-violet-400 rounded-full" style={{ width: `${barPct}%` }} />
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">{person.invoice_count}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmtN(person.total_qty)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-indigo-700">{fmt(person.sales_amount)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{incRate}%</td>
                            <td className="px-3 py-2 text-right">
                              <span className={`font-bold text-[12px] px-2 py-0.5 rounded ${person.incentive_amount > 0 ? "text-violet-700 bg-violet-50 border border-violet-100" : "text-slate-400"}`}>
                                {fmt(person.incentive_amount)}
                              </span>
                            </td>
                            <td className="px-3 py-2">
                              {person.applicable_rules.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {person.applicable_rules.map((r) => (
                                    <span key={r.rule_id} className="text-[9px] bg-violet-100 text-violet-700 rounded px-1.5 py-0.5 font-medium">
                                      {r.rule_name}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-[10px] text-slate-300 italic">No rule matched</span>
                              )}
                            </td>
                             {(viewMode === "summary" || viewMode === "detail") && (
                              <td className="px-3 py-2 text-center">
                                <button 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (viewMode === "summary") {
                                      setViewMode("detail");
                                      setExpandedPerson(pKey);
                                    } else {
                                      setExpandedPerson(isExpanded ? null : pKey);
                                    }
                                  }}
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded border transition-all ${isExpanded && viewMode === "detail" ? "bg-violet-500 text-white border-violet-500" : "border-slate-200 text-slate-500 hover:bg-slate-50"}`}>
                                  {isExpanded && viewMode === "detail" ? "▲ Hide Details" : "▼ Show Details"}
                                </button>
                              </td>
                            )}
                          </tr>

                          {/* Expanded invoice rows */}
                          {viewMode === "detail" && isExpanded && (
                            <tr key={`${pKey}-detail`}>
                              <td colSpan={8} className="px-0 py-0 bg-slate-50 dark:bg-slate-800/30">
                                <table className="w-full text-[10px]">
                                  <thead>
                                    <tr className="border-b border-slate-200 text-slate-500 uppercase tracking-wide">
                                      <th className="text-left px-6 py-1.5 font-semibold pl-14">Bill No.</th>
                                      <th className="text-left px-3 py-1.5 font-semibold">Voucher No.</th>
                                      <th className="text-left px-3 py-1.5 font-semibold">Date</th>
                                      <th className="text-left px-3 py-1.5 font-semibold">Ledger (Customer)</th>
                                      <th className="text-left px-3 py-1.5 font-semibold">Ledger (Expense)</th>
                                      <th className="text-right px-3 py-1.5 font-semibold">Qty</th>
                                      <th className="text-right px-3 py-1.5 font-semibold">Amount</th>
                                      <th className="text-left px-3 py-1.5 font-semibold">Details (Remarks)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100">
                                    {person.invoices.map((inv) => (
                                      <tr key={inv.id} className="hover:bg-white cursor-pointer text-[9px]"
                                        onClick={(e) => { 
                                          e.stopPropagation(); 
                                          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                          router.push(`/companies/${companyId}/sales/invoices/${inv.id}?returnUrl=${returnUrl}`); 
                                        }}>
                                        <td className="pl-14 pr-3 py-1.5 font-mono text-indigo-600 underline">{inv.reference || `INV-${inv.id}`}</td>
                                        <td className="px-3 py-1.5 text-slate-600">{inv.voucher_no || "-"}</td>
                                        <td className="px-3 py-1.5 text-slate-500">{displayDate(inv.date)}</td>
                                        <td className="px-3 py-1.5 text-slate-700 font-medium">{inv.ledger_name || "-"}</td>
                                        <td className="px-3 py-1.5 text-violet-700 font-medium">{inv.booked_ledger_name || "-"}</td>
                                        <td className="px-3 py-2 text-right text-slate-600">{fmtN(inv.total_qty)}</td>
                                        <td className="px-3 py-2 text-right font-medium text-slate-700">{fmt(inv.total_amount)}</td>
                                        <td className="px-3 py-1.5 text-slate-500 italic max-w-[150px] truncate" title={inv.remarks || ""}>{inv.remarks || "-"}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </td>
                            </tr>
                          )}
                        </>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 font-bold text-[11px] text-slate-700">
                      <td className="px-3 py-2">Total ({report.persons.length} persons)</td>
                      <td className="px-3 py-2 text-right">{report.total_invoices}</td>
                      <td className="px-3 py-2 text-right">{fmtN(report.persons.reduce((s, p) => s + p.total_qty, 0))}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{fmt(report.total_sales_amount)}</td>
                      <td className="px-3 py-2 text-right">{totalIncentiveRate}%</td>
                      <td className="px-3 py-2 text-right text-violet-700">{fmt(report.total_incentive_amount)}</td>
                      <td className="px-3 py-2" colSpan={viewMode === "summary" ? 2 : (viewMode === "detail" ? 2 : 1)} />
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}