"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, getCurrentCompany, type CurrentCompany, getSmartDefaultPeriod, formatDateWithSuffix } from "@/lib/api";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import {
    CalendarDisplayMode,
    CalendarReportDisplayMode,
    readCalendarDisplayMode,
    readCalendarReportDisplayMode,
    writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { openPrintWindow } from '@/lib/printReport';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

interface IncomeExpenseRow {
    group_type: "INCOME" | "EXPENSE";
    group_name: string;
    ledger_name: string;
    amount: number;
    department_name?: string;
    project_name?: string;
}

export default function IncomeExpenseSummaryPage() {
    const params = useParams();
    const companyId = params?.companyId as string;
    const router = useRouter();
    const printRef = useRef<HTMLDivElement | null>(null);

    const [mounted, setMounted] = useState(false);

    // 1. Immediate initialization from localStorage to prevent "AD date with BS label" flicker
    const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
    const initialMode = initialCC?.calendar_mode || "AD";
    const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

    const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);
    const [fromDate, setFromDate] = useState(initialFrom);
    const [toDate, setToDate] = useState(initialTo);
    const [groupBy, setGroupBy] = useState<"" | "department" | "project">("");
    const [viewType, setViewType] = useState<"detailed" | "summary">("detailed");
    const [departmentFilter, setDepartmentFilter] = useState<string>("");
    const [projectFilter, setProjectFilter] = useState<string>("");

    const [appliedParams, setAppliedParams] = useState<{from: string, to: string, dep: string, proj: string, grp: string} | null>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch latest company settings to ensure UI stays in sync with DB
    const { data: dbCompany } = useSWR<CurrentCompany>(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );

    const { data: currentUser } = useSWR(
        "/auth/me",
        fetcher
    );

    const cc = mounted ? getCurrentCompany() : initialCC;

    // Reactively sync calendar mode if it changes in database
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
          
          // Auto-trigger if not yet applied
          if (!appliedParams) {
             setAppliedParams({
                 from: nextMode === "BS" ? safeBSToAD(from) || from : from,
                 to: nextMode === "BS" ? safeBSToAD(to) || to : to,
                 dep: "", proj: "", grp: ""
             });
          }
        }
      }
    }, [mounted, dbCompany?.id, dbCompany?.calendar_mode]);

    const { data: departments } = useSWR(
        companyId ? `/companies/${companyId}/departments` : null,
        fetcher
    );

    const { data: projects } = useSWR(
        companyId ? `/companies/${companyId}/projects` : null,
        fetcher
    );

    const { canRead } = useMenuAccess("reports.income_expense_summary");

    const handleShow = () => {
        const isBS = effectiveDisplayMode === "BS";
        setAppliedParams({
            from: isBS ? safeBSToAD(fromDate) || fromDate : fromDate,
            to: isBS ? safeBSToAD(toDate) || toDate : toDate,
            dep: departmentFilter,
            proj: projectFilter,
            grp: groupBy
        });
    };

    const handleToday = () => {
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, cc);
        setFromDate(from);
        setToDate(to);
        const isBS = effectiveDisplayMode === "BS";
        setAppliedParams({
            from: isBS ? safeBSToAD(from) || from : from,
            to: isBS ? safeBSToAD(to) || to : to,
            dep: departmentFilter,
            proj: projectFilter,
            grp: groupBy
        });
    };

    const handleReset = () => {
        setDepartmentFilter(""); setProjectFilter(""); setGroupBy(""); setViewType("detailed");
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode);
        setFromDate(from); setToDate(to);
        setAppliedParams(null);
    };

    const isBS_Effective = effectiveDisplayMode === "BS";
    const displayDate = (ad: string) => isBS_Effective ? (safeADToBS(ad) || ad) : ad;

    const reportUrl = useMemo(() => {
        if (!companyId || !appliedParams) return null;
        let url = `/companies/${companyId}/reports/income-expense-summary?from_date=${appliedParams.from}&to_date=${appliedParams.to}`;
        if (appliedParams.dep) url += `&department_id=${appliedParams.dep}`;
        if (appliedParams.proj) url += `&project_id=${appliedParams.proj}`;
        if (appliedParams.grp) url += `&group_by=${appliedParams.grp}`;
        return url;
    }, [companyId, appliedParams]);

    const { data: reportData, error: reportError, isLoading: loadingReport } = useSWR<{ data: IncomeExpenseRow[] }>(reportUrl, fetcher);

    const mappedData = useMemo(() => {
        if (!reportData?.data) return { income: [], expense: [], incomeTotal: 0, expenseTotal: 0, netTotal: 0 };
        
        const incomeMap: Record<string, { group: string, ledgers: Record<string, number>, total: number }> = {};
        const expenseMap: Record<string, { group: string, ledgers: Record<string, number>, total: number }> = {};
        
        let iTotal = 0, eTotal = 0;

        reportData.data.forEach(item => {
            const isInc = item.group_type === "INCOME";
            const targetMap = isInc ? incomeMap : expenseMap;
            const gn = item.group_name || "Uncategorized";
            const ln = (groupBy === "department" ? item.department_name : (groupBy === "project" ? item.project_name : item.ledger_name)) || "(None)";

            if (!targetMap[gn]) targetMap[gn] = { group: gn, ledgers: {}, total: 0 };
            targetMap[gn].ledgers[ln] = (targetMap[gn].ledgers[ln] || 0) + item.amount;
            targetMap[gn].total += item.amount;

            if (isInc) iTotal += item.amount; else eTotal += item.amount;
        });

        const sortFn = (a: any, b: any) => b.total - a.total;
        const process = (map: any) => Object.values(map).sort(sortFn).map((g: any) => ({
            ...g,
            ledgers: Object.entries(g.ledgers as Record<string, number>)
                .map(([name, amt]) => ({ name, amount: amt }))
                .sort((a: any, b: any) => b.amount - a.amount)
        }));

        return { 
            income: process(incomeMap), 
            expense: process(expenseMap), 
            incomeTotal: iTotal, 
            expenseTotal: eTotal, 
            netTotal: iTotal - eTotal 
        };
    }, [reportData, groupBy]);

    const handlePrint = () => {
        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Income & Expense Summary",
            company: cc?.name || "",
            period: appliedParams ? `Period: ${appliedParams.from} – ${appliedParams.to}` : "",
            orientation: "portrait",
        });
    };

    if (!canRead) return <div className="p-12 text-center text-slate-400 font-black uppercase tracking-[0.2em] italic">Access Denied</div>;



    return (
        <div className="flex flex-col gap-4 p-4 min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all">
                <div className="flex items-center gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40 shadow-sm group">
                         <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400 group-hover:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2v20m-9-6a9 9 0 0 1 18 0" /><path d="M16.5 8.5a4.5 4.5 0 0 0-9 0" /></svg>
                    </div>
                    <div>
                        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 italic tracking-tight uppercase">Income & Expense Summary</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">Comprehensive P&L overview and analytics</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => router.back()} className="px-4 py-2 text-xs font-bold border rounded-xl hover:bg-slate-50 transition-all bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm active:scale-95">Back</button>
                    <button onClick={() => router.push(`/companies/${companyId}/reports`)} className="px-4 py-2 text-xs font-bold border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-all bg-white dark:bg-slate-800 dark:border-rose-900 ml-1 shadow-sm active:scale-95 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12"/></svg>
                        Close
                    </button>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-slate-100/40 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-end">
                    <div className="flex items-end gap-3 flex-1 min-w-0">
                        <div className="flex flex-col gap-1.5 flex-1 max-w-[140px]">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Calendar</label>
                            <select value={effectiveDisplayMode} onChange={(e) => {
                                const next = e.target.value as "AD" | "BS";
                                setEffectiveDisplayMode(next);
                                writeCalendarReportDisplayMode(companyId, next);
                                const { from, to } = getSmartDefaultPeriod(next, cc);
                                setFromDate(from);
                                setToDate(to);
                            }} className="h-10 border border-indigo-500/20 rounded-xl px-3 text-xs bg-white dark:bg-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold text-indigo-700 border-t-4 border-t-indigo-500">
                                <option value="AD">AD (Gregorian)</option>
                                <option value="BS">BS (Nepali)</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5 flex-[2]">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">From Date</label>
                            {isBS_Effective ? (
                                <NepaliDatePicker 
                                    inputClassName="h-10 w-full border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-3 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                    value={isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) > 2000 ? fromDate : safeADToBS(fromDate) || ""} 
                                    onChange={(val)=>setFromDate(val)} 
                                    options={{calenderLocale:'ne', valueLocale:'en'}} 
                                />
                            ) : (
                                <Input forceNative
                                    type="date" 
                                    className="h-10 w-full border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-3 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                    value={!isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) < 2000 ? fromDate : safeBSToAD(fromDate) || ""} 
                                    onChange={(e)=>setFromDate(e.target.value)} 
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex items-end gap-3 flex-1 min-w-0">
                         <div className="flex flex-col gap-1.5 flex-1">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">To Date</label>
                            {isBS_Effective ? (
                                <NepaliDatePicker 
                                    inputClassName="h-10 w-full border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-3 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                    value={isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) > 2000 ? toDate : safeADToBS(toDate) || ""} 
                                    onChange={(val)=>setToDate(val)} 
                                    options={{calenderLocale:'ne', valueLocale:'en'}} 
                                />
                            ) : (
                                <Input forceNative
                                    type="date" 
                                    className="h-10 w-full border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-3 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                    value={!isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) < 2000 ? toDate : safeBSToAD(toDate) || ""} 
                                    onChange={(e)=>setToDate(e.target.value)} 
                                />
                            )}
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                        <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Dimension Analysis</label>
                         <div className="flex gap-2">
                             <select value={groupBy} onChange={(e)=>setGroupBy(e.target.value as any)} className="h-10 flex-1 border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs bg-white dark:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold">
                                <option value="">Account Groups</option>
                                <option value="department">By Department</option>
                                <option value="project">By Project</option>
                            </select>
                            <select value={viewType} onChange={(e)=>setViewType(e.target.value as any)} className="h-10 w-[100px] border border-slate-200 dark:border-slate-700 rounded-xl px-3 text-xs bg-white dark:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 outline-none italic">
                                <option value="detailed">Details</option>
                                <option value="summary">Totals</option>
                            </select>
                         </div>
                    </div>

                    <div className="flex items-center gap-2 justify-end">
                         <button onClick={handleToday} className="h-10 px-4 text-xs font-bold text-slate-500 border-2 rounded-xl hover:bg-slate-50 transition-all active:scale-95">Yearly</button>
                         <button onClick={handleShow} className="h-10 px-8 text-xs font-black text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 transition-all active:scale-95 uppercase tracking-widest flex items-center gap-2">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24"><path d="M21 21l-4.35-4.35M19 11a8 8 0 11-16 0 8 8 0 0116 0z" /></svg>
                            Generate
                         </button>
                    </div>
                </div>
            </div>

            {/* Main Report Render */}
            <div ref={printRef} className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm p-8 min-h-[600px] relative overflow-hidden">
                {!appliedParams ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4 opacity-70">
                         <div className="w-20 h-20 rounded-full border-4 border-dashed border-slate-200 flex items-center justify-center text-3xl">📊</div>
                         <div className="text-center">
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">Ready for Analysis</p>
                            <p className="text-xs max-w-[250px] mx-auto leading-relaxed mt-1 italic">Pick your parameters above and click &apos;Generate&apos; to load the summary.</p>
                         </div>
                    </div>
                ) : loadingReport ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-500 gap-5">
                         <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                         <p className="text-[10px] font-black uppercase tracking-[0.3em] animate-pulse italic">Consolidating Financial Ledgers...</p>
                    </div>
                ) : reportError ? (
                    <div className="p-20 text-center flex flex-col items-center gap-3">
                         <div className="text-rose-500 text-4xl">⚠️</div>
                         <p className="font-bold text-slate-800 dark:text-slate-200">Processing Failed</p>
                         <p className="text-xs text-rose-600 font-medium">{reportError.message || ""}</p>
                         <button onClick={handleShow} className="mt-4 text-xs font-black text-indigo-600 border-b-2 border-indigo-600 pb-1 uppercase">Try again</button>
                    </div>
                ) : (
                    <div className="flex flex-col gap-10 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-2 duration-700">
                        <div className="text-center border-b-2 border-dashed border-slate-100 dark:border-slate-800 pb-8">
                             <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tight leading-none mb-1">{cc?.name}</h2>
                             <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.4em] mb-4">Statement of Income & Expenditures</p>
                             <div className="inline-flex items-center bg-slate-100 dark:bg-slate-800 px-6 py-2 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm">
                                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                                     PERIOD: <FormattedDate date={appliedParams.from} mode={effectiveDisplayMode} /> - <FormattedDate date={appliedParams.to} mode={effectiveDisplayMode} />
                                </span>
                             </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            {/* INCOME SECTION */}
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between border-b-4 border-emerald-500 pb-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Total Income / Revenue</h3>
                                    <div className="h-6 w-6 rounded-lg bg-emerald-50 flex items-center justify-center text-emerald-600">↑</div>
                                </div>
                                <div className="space-y-4">
                                    {mappedData.income.map((g: any) => (
                                        <div key={g.group} className="group transition-all">
                                            <div className="flex items-center justify-between py-1.5 font-black text-[11px] uppercase text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 group-hover:text-emerald-600 transition-colors">
                                                <span>{g.group}</span>
                                                <span className="tabular-nums">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(g.total)}</span>
                                            </div>
                                            {viewType === 'detailed' && (
                                                <div className="mt-2 space-y-1">
                                                    {g.ledgers.map((l: any) => (
                                                        <div key={l.name} className="flex items-center justify-between pl-4 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors italic">
                                                            <span>{l.name}</span>
                                                            <span className="tabular-nums opacity-80">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(l.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {mappedData.income.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-4">No income recorded for this period.</p>}
                                </div>
                            </div>

                             {/* EXPENSE SECTION */}
                             <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between border-b-4 border-rose-500 pb-2">
                                    <h3 className="text-sm font-black uppercase tracking-widest text-rose-700 dark:text-rose-400">Total Expenditures</h3>
                                    <div className="h-6 w-6 rounded-lg bg-rose-50 flex items-center justify-center text-rose-600">↓</div>
                                </div>
                                <div className="space-y-4">
                                    {mappedData.expense.map((g: any) => (
                                        <div key={g.group} className="group transition-all">
                                            <div className="flex items-center justify-between py-1.5 font-black text-[11px] uppercase text-slate-800 dark:text-slate-200 border-b border-slate-100 dark:border-slate-800 group-hover:text-rose-600 transition-colors">
                                                <span>{g.group}</span>
                                                <span className="tabular-nums">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(g.total)}</span>
                                            </div>
                                            {viewType === 'detailed' && (
                                                <div className="mt-2 space-y-1">
                                                    {g.ledgers.map((l: any) => (
                                                        <div key={l.name} className="flex items-center justify-between pl-4 py-0.5 text-[10px] font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 transition-colors italic">
                                                            <span>{l.name}</span>
                                                            <span className="tabular-nums opacity-80">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(l.amount)}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {mappedData.expense.length === 0 && <p className="text-[10px] text-slate-400 italic text-center py-4">No expenditures recorded for this period.</p>}
                                </div>
                            </div>
                        </div>

                        {/* SUMMARY TOTALS */}
                        <div className="mt-12 bg-slate-950 text-white rounded-3xl p-10 shadow-2xl relative overflow-hidden group">
                             <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                                <svg width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 2v20m-9-6a9 9 0 0 1 18 0" /><path d="M16.5 8.5a4.5 4.5 0 0 0-9 0" /></svg>
                             </div>
                             <div className="grid grid-cols-1 md:grid-cols-3 gap-10 divide-x divide-slate-800">
                                <div className="text-center space-y-2">
                                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gross Income</p>
                                     <p className="text-2xl font-black tabular-nums text-emerald-400">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(mappedData.incomeTotal)}</p>
                                </div>
                                <div className="text-center space-y-2 border-none md:border-solid">
                                     <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Gross Expense</p>
                                     <p className="text-2xl font-black tabular-nums text-rose-400">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(mappedData.expenseTotal)}</p>
                                </div>
                                <div className="text-center space-y-2 border-none md:border-solid">
                                     <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.3em] font-black">Net Position</p>
                                     <div className="flex flex-col items-center">
                                        <p className={`text-4xl font-black tabular-nums tracking-tighter ${mappedData.netTotal >= 0 ? 'text-emerald-500' : 'text-rose-500 underline decoration-rose-500/30'}`}>
                                            {new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(mappedData.netTotal)}
                                        </p>
                                        <div className={`mt-2 px-3 py-0.5 rounded-full text-[9px] font-black uppercase ${mappedData.netTotal >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'}`}>
                                            {mappedData.netTotal >= 0 ? 'Surplus' : 'Deficit'}
                                        </div>
                                     </div>
                                </div>
                             </div>
                        </div>

                        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] pt-6 border-t border-slate-100 dark:border-slate-800 italic">
                             <div>Snapshot Generation: {new Date().toLocaleString()}</div>
                             <div>Authorized: {currentUser?.full_name || currentUser?.name || "System"}</div>
                             <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Database-Direct (Sync Locked)</div>
                        </div>
                    </div>
                )}

                {/* Print Action Overlay (Hidden in print) */}
                <button onClick={handlePrint} className="absolute bottom-6 right-6 h-12 w-12 rounded-full bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-xl flex items-center justify-center hover:scale-110 active:scale-95 transition-all print:hidden">🖨️</button>
            </div>
        </div>
    );
}
