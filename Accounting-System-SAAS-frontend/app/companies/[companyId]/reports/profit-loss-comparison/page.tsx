"use client";

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useMemo, useRef } from 'react';
import useSWR from 'swr';
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from '@/lib/api';
import { openPrintWindow } from '@/lib/printReport';
import { ProfitLossComparisonClient, type ProfitAndLossComparison } from './ProfitLossComparisonClient';
import { ComparisonIdsSelector } from './ComparisonIdsSelector';
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type DepartmentRead = { id: number; name: string; is_active: boolean };
type ProjectRead = { id: number; name: string; is_active: boolean };

export default function ProfitLossComparisonPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const [mounted, setMounted] = useState(false);

  // 1. Immediate initialization from localStorage to prevent "AD date with BS label" flicker
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  // Stable submission state to drive SWR
  const [submittedFromDate, setSubmittedFromDate] = useState("");
  const [submittedToDate, setSubmittedToDate] = useState("");

  const [dimension, setDimension] = useState<'department' | 'project'>('department');
  const [level, setLevel] = useState<'group' | 'ledger'>('group');
  const [idsCsv, setIdsCsv] = useState("");

  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // 2. Fetch latest company settings to ensure UI stays in sync with DB
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
        
        // Also update submission state to refresh report immediately if user hasn't interacted yet
        if (initialWasFallback || !submittedFromDate) {
           setSubmittedFromDate(nextMode === "BS" ? safeBSToAD(from) || from : from);
           setSubmittedToDate(nextMode === "BS" ? safeBSToAD(to) || to : to);
        }
      }
    }
  }, [mounted, dbCompany?.id, dbCompany?.calendar_mode, dbCompany?.fiscal_year_start]);

  // Sync from URL params
  useEffect(() => {
    const from = searchParams.get('from_date');
    const to = searchParams.get('to_date');
    const dim = searchParams.get('dimension') as 'department' | 'project';
    const ids = searchParams.get('ids');
    const lvl = searchParams.get('level') as 'group' | 'ledger';

    if (from) setFromDate(from);
    if (to) setToDate(to);
    if (dim) setDimension(dim);
    if (ids) setIdsCsv(ids);
    if (lvl) setLevel(lvl);
  }, [searchParams]);

  const effectiveFromAD = effectiveDisplayMode === "BS" ? safeBSToAD(fromDate) || fromDate : fromDate;
  const effectiveToAD = effectiveDisplayMode === "BS" ? safeBSToAD(toDate) || toDate : toDate;

  const { data: departments } = useSWR<DepartmentRead[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );
  const { data: projects } = useSWR<ProjectRead[]>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );

  const reportUrl = useMemo(() => {
    if (!companyId || !effectiveFromAD || !effectiveToAD || !idsCsv.trim()) return null;
    return `/companies/${encodeURIComponent(companyId)}/reports/profit-and-loss-comparison?from_date=${encodeURIComponent(
      effectiveFromAD,
    )}&to_date=${encodeURIComponent(effectiveToAD)}&dimension=${encodeURIComponent(
      dimension,
    )}&ids=${encodeURIComponent(idsCsv)}&level=${encodeURIComponent(level)}`;
  }, [companyId, effectiveFromAD, effectiveToAD, dimension, idsCsv, level]);

  const { data: comparison, error: reportError, isLoading: loadingReport } = useSWR<ProfitAndLossComparison>(
    reportUrl,
    fetcher
  );

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    params.set("from_date", fromDate);
    params.set("to_date", toDate);
    params.set("dimension", dimension);
    params.set("level", level);
    params.set("ids", idsCsv);
    router.push(`?${params.toString()}`);
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "P&L Comparison Report",
      company: cc?.name || "",
      period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
      orientation: "landscape",
    });
  };

  const activeDepartments = (departments || []).filter((d) => d.is_active);
  const activeProjects = (projects || []).filter((p) => p.is_active);

  const isBS_Effective = effectiveDisplayMode === "BS";

  return (
    <div className="space-y-4 p-6 bg-slate-50 min-h-screen dark:bg-slate-950">
      {/* Premium Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden transition-all">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-5 py-3">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40 shadow-sm">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 14.25v2.25m3-4.5v4.5m3-6.75v6.75m3-9v9M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z" />
              </svg>
            </div>
            <div>
              <h1 className="text-base font-black text-slate-800 dark:text-slate-100 tracking-tight uppercase leading-none">P&L Comparison</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest mt-1">Cross-dimensional profit analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
             <button onClick={() => router.back()} className="px-4 py-2 text-xs font-bold border rounded-xl hover:bg-slate-50 transition-all bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm active:scale-95">Back</button>
             <button onClick={() => router.push(`/companies/${companyId}`)} className="px-4 py-2 text-xs font-bold border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-all bg-white dark:bg-slate-800 dark:border-rose-900 shadow-sm active:scale-95">Close</button>
          </div>
        </div>
      </div>

      <form
        onSubmit={handleApply}
        className="flex flex-wrap items-end gap-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 text-xs shadow-sm"
      >
        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calendar Mode</label>
          <select
            className="h-9 border border-indigo-500/20 rounded-xl px-3 text-xs bg-white dark:bg-slate-950 shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold text-indigo-700 border-t-2 border-t-indigo-500"
            value={effectiveDisplayMode}
            onChange={(e) => {
              const next = e.target.value as "AD" | "BS";
              setEffectiveDisplayMode(next);
              writeCalendarReportDisplayMode(companyId, next);
            }}
          >
            <option value="AD">AD (Gregorian)</option>
            <option value="BS">BS (Nepali)</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Start Date</label>
          {isBS_Effective ? (
            <NepaliDatePicker
              inputClassName="h-9 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all w-36 outline-none"
              value={isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) > 2000 ? fromDate : safeADToBS(fromDate) || ""}
              onChange={(value: string) => setFromDate(value)}
              options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              // @ts-ignore
              minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
              // @ts-ignore
              maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
            />
          ) : (
            <Input forceNative
              type="date"
              className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all w-44 outline-none font-medium"
              value={!isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) < 2000 ? fromDate : safeBSToAD(fromDate) || ""}
              min={cc?.fiscal_year_start || ""}
              max={cc?.fiscal_year_end || ""}
              onChange={(e) => setFromDate(e.target.value)}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">End Date</label>
          {isBS_Effective ? (
            <NepaliDatePicker
              inputClassName="h-9 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all w-36 outline-none"
              value={isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) > 2000 ? toDate : safeADToBS(toDate) || ""}
              onChange={(value: string) => setToDate(value)}
              options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              // @ts-ignore
              minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
              // @ts-ignore
              maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
            />
          ) : (
            <Input forceNative
              type="date"
              className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all w-44 outline-none font-medium"
              value={!isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) < 2000 ? toDate : safeBSToAD(toDate) || ""}
              min={cc?.fiscal_year_start || ""}
              max={cc?.fiscal_year_end || ""}
              onChange={(e) => setToDate(e.target.value)}
            />
          )}
        </div>

        <div className="flex flex-col gap-1.5 min-w-[140px]">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Analysis Axis</label>
          <select
            className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs bg-white dark:bg-slate-950 font-black transition-all outline-none"
            value={dimension}
            onChange={(e) => setDimension(e.target.value as any)}
          >
            <option value="department">Departments</option>
            <option value="project">Projects</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Detail Level</label>
          <select
            className="h-9 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs bg-white dark:bg-slate-950 font-black transition-all outline-none italic"
            value={level}
            onChange={(e) => setLevel(e.target.value as any)}
          >
            <option value="group">Groups</option>
            <option value="ledger">Ledgers</option>
          </select>
        </div>
        
        <div className="flex items-center gap-2 ml-auto">
            <button
              type="submit"
              className="h-9 rounded-xl px-8 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 transition-all shadow-lg active:scale-95 uppercase tracking-widest"
            >
              Run Report
            </button>
            <button type="button" onClick={handlePrint} className="h-9 w-10 flex items-center justify-center rounded-xl bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-600 hover:bg-slate-50 shadow-sm transition-all active:scale-95">🖨️</button>
        </div>
      </form>

      <ComparisonIdsSelector
        dimension={dimension}
        initialIdsCsv={idsCsv}
        departments={activeDepartments}
        projects={activeProjects}
        setSelectedIdsCsv={setIdsCsv}
      />

      <div ref={printRef} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/40 p-1 shadow-sm min-h-[400px] overflow-hidden">
        {loadingReport && (
          <div className="flex flex-col items-center justify-center py-40 text-indigo-500 animate-pulse gap-5">
            <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[11px] font-black uppercase tracking-[0.4em] italic">Comparing Dimension Data...</p>
          </div>
        )}

        {reportError && (
          <div className="p-20 text-center flex flex-col items-center gap-4">
             <div className="text-rose-500 text-4xl">⚠️</div>
             <p className="font-bold text-slate-800 dark:text-slate-200">Comparison Failed</p>
             <p className="text-xs text-rose-600 font-medium px-10">{reportError.message || "Failed to load comparison: ensure at least one dimension is selected."}</p>
          </div>
        )}

        {comparison && !loadingReport && !reportError && (
          <ProfitLossComparisonClient companyId={companyId} comparison={comparison} />
        )}

        {!comparison && !loadingReport && !reportError && (
          <div className="py-40 text-center flex flex-col items-center gap-5 text-slate-400 opacity-60">
             <div className="w-20 h-20 border-4 border-dashed border-slate-200 rounded-full flex items-center justify-center text-3xl">⚖️</div>
             <div className="text-center">
                <p className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest leading-none mb-1">Comparative Insights</p>
                <p className="text-[11px] max-w-[300px] mx-auto leading-relaxed mt-2 italic font-medium">Select multiple departments or projects above to run a side-by-side profit comparison.</p>
             </div>
          </div>
        )}
      </div>
    </div>
  );
}
