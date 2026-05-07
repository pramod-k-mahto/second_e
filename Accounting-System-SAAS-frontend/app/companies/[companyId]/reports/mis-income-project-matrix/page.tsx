"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, getCurrentCompany, getSmartDefaultPeriod, formatDateWithSuffix, type CurrentCompany } from "@/lib/api";
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

const fetcher = (url: string) => api.get(url).then((res) => res.data);

interface IncomeExpenseRow {
    department_id: number | null;
    department_name: string | null;
    project_id: number | null;
    project_name: string | null;
    income: number;
    expense: number;
    net: number;
}

interface IncomeExpenseReport {
    from_date: string;
    to_date: string;
    rows: IncomeExpenseRow[];
    total_income: number;
    total_expense: number;
    total_net: number;
}

export default function IncomeExpenseMatrixPage() {
    const params = useParams();
    const companyId = params?.companyId as string;
    const router = useRouter();
    const printRef = useRef<HTMLDivElement | null>(null);

    const [mounted, setMounted] = useState(false);

    // Initialize state immediately from localStorage to prevent "AD date with BS label" flicker
    const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
    const initialMode = initialCC?.calendar_mode || "AD";
    const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

    const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);
    const [fromDate, setFromDate] = useState(initialFrom);
    const [toDate, setToDate] = useState(initialTo);

    useEffect(() => {
        setMounted(true);
    }, []);

    const { data: dbCompany } = useSWR<CurrentCompany>(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );

    const { data: currentUser } = useSWR(
        "/auth/me",
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

    const [segmentId, setSegmentId] = useState<string>("");
    const [showReport, setShowReport] = useState(false);
    const [displayType, setDisplayType] = useState<"net" | "both">("net");

    const { data: segments } = useSWR(
        companyId ? `/companies/${companyId}/segments` : null,
        fetcher
    );

    const { canRead } = useMenuAccess("reports.mis_income_expense_summary");

    const isBS = effectiveDisplayMode === "BS";
    const currentCompany = cc;
    // For legacy compatibility
    const dateDisplayMode = effectiveDisplayMode;

    const reportUrl = useMemo(() => {
        if (!showReport || !companyId || !fromDate || !toDate) return null;

        const fromAD = isBS ? safeBSToAD(fromDate) : fromDate;
        const toAD = isBS ? safeBSToAD(toDate) : toDate;

        let url = `/companies/${companyId}/reports/income-expense-summary?from_date=${fromAD}&to_date=${toAD}`;
        if (segmentId) {
            url += `&segment_id=${segmentId}`;
        }
        return url;
    }, [companyId, fromDate, toDate, segmentId, showReport, isBS]);

    const { data: reportData, error: reportError, isLoading } = useSWR<IncomeExpenseReport>(
        reportUrl,
        fetcher
    );

    const matrixData = useMemo(() => {
        if (!reportData?.rows) return null;

        const depts: { id: number | null, name: string }[] = [];
        const projs: { id: number | null, name: string }[] = [];
        const deptSet = new Set<string>();
        const projSet = new Set<string>();

        // Map for fast lookup: matrix[projectId][departmentId] = IncomeExpenseRow
        const matrix: Record<string, Record<string, IncomeExpenseRow>> = {};

        reportData.rows.forEach(row => {
            const dKey = row.department_id === null ? "null" : String(row.department_id);
            const pKey = row.project_id === null ? "null" : String(row.project_id);

            if (!deptSet.has(dKey)) {
                deptSet.add(dKey);
                depts.push({ id: row.department_id, name: row.department_name || "(No Department)" });
            }
            if (!projSet.has(pKey)) {
                projSet.add(pKey);
                projs.push({ id: row.project_id, name: row.project_name || "(No Project)" });
            }

            if (!matrix[pKey]) matrix[pKey] = {};
            matrix[pKey][dKey] = row;
        });

        // Sort departments and projects by name
        depts.sort((a, b) => a.name.localeCompare(b.name));
        projs.sort((a, b) => a.name.localeCompare(b.name));

        return { depts, projs, matrix };
    }, [reportData]);

    const handleApply = () => {
        if (!fromDate || !toDate) {
            alert("Please select both dates.");
            return;
        }
        setShowReport(true);
    };

    const handlePrint = () => {
        if (!printRef.current) return;
        const content = printRef.current.innerHTML;
        const win = window.open("", "_blank");
        if (!win) return;

        win.document.write(`
      <html>
        <head>
          <title>Income & Expense Matrix</title>
          <style>
            body { font-family: sans-serif; padding: 20px; color: #333; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 10px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: right; }
            th { background-color: #f5f5f5; color: #555; font-weight: bold; }
            .text-left { text-align: left; }
            .font-bold { font-weight: bold; }
            .header { text-align: center; margin-bottom: 30px; }
            .profit { color: #059669; }
            .loss { color: #dc2626; }
            .bg-gray-50 { background-color: #f9fafb; }
            @media print {
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; font-size: 18px;">${currentCompany?.name || ""}</h1>
            <p style="margin: 5px 0; font-size: 12px;">${currentCompany?.address || ""}</p>
            <h2 style="margin: 10px 0; font-size: 14px; text-decoration: underline;">Income & Expense Matrix Report</h2>
            <p style="margin: 0; font-size: 11px;">Period: ${formatDateWithSuffix(fromDate, effectiveDisplayMode)} to ${formatDateWithSuffix(toDate, effectiveDisplayMode)}</p>
          </div>
          ${content}
          <div style="margin-top: 40px; font-size: 10px; display: flex; justify-content: space-between;">
            <span>Printed on: ${new Date().toLocaleString()}</span>
            <span>Printed by: ${currentUser?.full_name || currentUser?.email || "User"}</span>
          </div>
        </body>
      </html>
    `);
        win.document.close();
        win.print();
    };

    const formatAmount = (val: number) => {
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(val);
    };

    // Date change handlers
    const handleFromChange = (v: string) => setFromDate(v);
    const handleToChange = (v: string) => setToDate(v);

    return (
        <div className="space-y-4 p-6 bg-slate-50/50 dark:bg-slate-950/20 min-h-screen">
            {/* Premium Header Card */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-xl shadow-slate-200/40 dark:shadow-none overflow-hidden transition-all hover:shadow-2xl hover:shadow-slate-300/50 dark:hover:shadow-none">
                <div className="h-[4px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 animate-gradient-x" />
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-6 py-4">
                    <div className="flex items-center gap-4">
                        <div className="group flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 transition-transform hover:scale-110 active:scale-95">
                            <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="3" width="7" height="7" rx="1" />
                                <rect x="14" y="3" width="7" height="7" rx="1" />
                                <rect x="3" y="14" width="7" height="7" rx="1" />
                                <rect x="14" y="14" width="7" height="7" rx="1" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none">Income & Expense Matrix</h1>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-medium bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full w-fit">Department & Project Cross-Analysis</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                         <button
                            onClick={() => router.back()}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 text-xs font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all active:scale-95"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            Back
                        </button>
                        <button
                            onClick={() => router.push(`/companies/${companyId}/reports`)}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold shadow-sm hover:shadow-md transition-all active:scale-95"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            Close
                        </button>
                    </div>
                </div>
            </div>

            {/* Glassmorphism Filters */}
            <div className="rounded-2xl border border-white/40 dark:border-slate-800 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl px-6 py-5 shadow-sm space-y-4">
                <div className="flex flex-wrap items-end gap-6 text-xs">
                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Calendar Mode</label>
                        <select
                            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                            value={effectiveDisplayMode}
                            onChange={(e) => {
                                if (!companyId) return;
                                const next = e.target.value as "AD" | "BS";
                                setEffectiveDisplayMode(next);
                                writeCalendarReportDisplayMode(companyId, next);
                            }}
                        >
                            <option value="AD">English (AD)</option>
                            <option value="BS">Nepali (BS)</option>
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">From Date ({effectiveDisplayMode})</label>
                        {!mounted ? (
                            <div className="h-10 w-44 rounded-xl animate-pulse bg-slate-100 dark:bg-slate-800" />
                        ) : effectiveDisplayMode === 'BS' ? (
                            <NepaliDatePicker
                                inputClassName="h-10 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-700 dark:text-slate-200 transition-all"
                                value={fromDate}
                                onChange={handleFromChange}
                                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                                // @ts-ignore
                                minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                // @ts-ignore
                                maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                            />
                        ) : (
                            <Input forceNative type="date"
                                className="h-10 w-44 rounded-xl border-slate-200"
                                value={fromDate}
                                min={currentCompany?.fiscal_year_start || ""}
                                max={currentCompany?.fiscal_year_end || ""}
                                onChange={(e) => handleFromChange(e.target.value)}
                            />
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">To Date ({effectiveDisplayMode})</label>
                        {!mounted ? (
                            <div className="h-10 w-44 rounded-xl animate-pulse bg-slate-100 dark:bg-slate-800" />
                        ) : effectiveDisplayMode === 'BS' ? (
                            <NepaliDatePicker
                                inputClassName="h-10 w-40 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-700 dark:text-slate-200 transition-all"
                                value={toDate}
                                onChange={handleToChange}
                                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                                // @ts-ignore
                                minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                // @ts-ignore
                                maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                            />
                        ) : (
                            <Input forceNative type="date"
                                className="h-10 w-44 rounded-xl border-slate-200"
                                value={toDate}
                                min={currentCompany?.fiscal_year_start || ""}
                                max={currentCompany?.fiscal_year_end || ""}
                                onChange={(e) => handleToChange(e.target.value)}
                            />
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Segment</label>
                        <select
                            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none min-w-[120px]"
                            value={segmentId}
                            onChange={(e) => setSegmentId(e.target.value)}
                        >
                            <option value="">All Segments</option>
                            {segments?.map((s: any) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-1">Display Mode</label>
                        <select
                            className="h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 font-semibold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                            value={displayType}
                            onChange={(e) => setDisplayType(e.target.value as any)}
                        >
                            <option value="net">Net Only</option>
                            <option value="both">Income / Expense / Net</option>
                        </select>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                        <button
                            onClick={handleApply}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 h-10 rounded-xl font-black text-xs shadow-lg shadow-indigo-600/30 transition-all active:scale-95 disabled:opacity-50"
                            disabled={isLoading}
                        >
                            {isLoading ? "Fetching..." : "GENERATE REPORT"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Results Area */}
            {!showReport ? (
                <div className="flex flex-col items-center justify-center py-20 rounded-3xl bg-white/40 dark:bg-slate-900/20 border-2 border-dashed border-slate-300 dark:border-slate-800">
                    <div className="h-20 w-20 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
                        <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                    </div>
                    <p className="text-slate-400 font-bold">Select dates and click Generate to view report</p>
                </div>
            ) : reportError ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold ring-4 ring-rose-500/5">
                    {reportError.message || "Failed to load report data"}
                </div>
            ) : matrixData ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                     <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <span className="flex h-2 w-2 rounded-full bg-indigo-500"></span>
                            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Report Results</span>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handlePrint}
                                className="h-9 px-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-50 transition-all flex items-center gap-2"
                            >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 00-2 2h2m2 4h10a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                                Print PDF
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden scrollbar-thin overflow-x-auto">
                        <div ref={printRef}>
                            <table className="w-full text-[11px] border-collapse min-w-[800px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                                        <th className="sticky left-0 bg-slate-100 dark:bg-slate-800 z-20 px-4 py-4 text-left border-r border-slate-200 dark:border-slate-700 min-w-[200px]">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1.5 h-6 bg-indigo-500 rounded-full" />
                                                <div className="flex flex-col">
                                                    <span className="text-slate-400 text-[8px] uppercase font-black tracking-widest">Rows \ Columns</span>
                                                    <span className="text-slate-700 dark:text-slate-100 font-black">Project \ Department</span>
                                                </div>
                                            </div>
                                        </th>
                                        {matrixData.depts.map(dept => (
                                            <th key={dept.id ?? 'null'} className="px-4 py-4 text-center border-r border-slate-200 dark:border-slate-700 min-w-[140px]">
                                                <span className="text-slate-700 dark:text-slate-200 font-black uppercase tracking-tight leading-tight block truncate max-w-[140px]" title={dept.name}>
                                                    {dept.name}
                                                </span>
                                            </th>
                                        ))}
                                        <th className="px-4 py-4 text-right bg-slate-100/50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 font-black uppercase tracking-tight min-w-[120px]">
                                            Project Total
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {matrixData.projs.map(proj => {
                                        let projTotalIncome = 0;
                                        let projTotalExpense = 0;
                                        
                                        return (
                                            <tr key={proj.id ?? 'null'} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="sticky left-0 bg-white dark:bg-slate-900 z-10 px-4 py-3 font-bold text-slate-800 dark:text-slate-200 border-r border-slate-200 dark:border-slate-700 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                    {proj.name}
                                                </td>
                                                {matrixData.depts.map(dept => {
                                                    const row = matrixData.matrix[proj.id ?? 'null']?.[dept.id ?? 'null'];
                                                    const income = row?.income || 0;
                                                    const expense = row?.expense || 0;
                                                    const net = row?.net || 0;
                                                    
                                                    projTotalIncome += income;
                                                    projTotalExpense += expense;

                                                    return (
                                                        <td key={`${proj.id}_${dept.id}`} className="px-4 py-3 text-right border-r border-slate-100 dark:border-slate-800/50 tabular-nums">
                                                            {displayType === "both" ? (
                                                                <div className="space-y-1">
                                                                    <div className="text-emerald-600 dark:text-emerald-400 font-medium">+{formatAmount(income)}</div>
                                                                    <div className="text-rose-500 dark:text-rose-400 font-medium">-{formatAmount(expense)}</div>
                                                                    <div className={`pt-1 border-t border-slate-100 dark:border-slate-800 font-black ${net >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-500 dark:text-orange-400'}`}>
                                                                        {formatAmount(net)}
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <span className={`font-black ${net >= 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-orange-600 dark:text-orange-400'}`}>
                                                                    {formatAmount(net)}
                                                                </span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td className="px-4 py-3 text-right bg-slate-50/50 dark:bg-slate-800/20 font-black tabular-nums">
                                                    {displayType === "both" ? (
                                                        <div className="space-y-1 text-slate-900 dark:text-slate-100">
                                                            <div>{formatAmount(projTotalIncome)}</div>
                                                            <div>{formatAmount(projTotalExpense)}</div>
                                                            <div className={`pt-1 border-t border-slate-200 dark:border-slate-700 ${projTotalIncome - projTotalExpense >= 0 ? 'text-indigo-700' : 'text-orange-700'}`}>
                                                                {formatAmount(projTotalIncome - projTotalExpense)}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className={projTotalIncome - projTotalExpense >= 0 ? 'text-indigo-700 dark:text-indigo-400' : 'text-orange-700 dark:text-orange-400'}>
                                                            {formatAmount(projTotalIncome - projTotalExpense)}
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}

                                    {/* Column Totals */}
                                    <tr className="bg-slate-100/30 dark:bg-indigo-900/10 font-black">
                                        <td className="sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 px-4 py-4 border-r border-slate-200 dark:border-slate-700 uppercase tracking-widest text-[10px]">
                                            Department Totals
                                        </td>
                                        {matrixData.depts.map(dept => {
                                            let colIncome = 0;
                                            let colExpense = 0;
                                            matrixData.projs.forEach(proj => {
                                                const r = matrixData.matrix[proj.id ?? 'null']?.[dept.id ?? 'null'];
                                                colIncome += r?.income || 0;
                                                colExpense += r?.expense || 0;
                                            });
                                            const colNet = colIncome - colExpense;

                                            return (
                                                <td key={`total_dept_${dept.id}`} className="px-4 py-4 text-right border-r border-slate-200 dark:border-slate-700 tabular-nums">
                                                    {displayType === "both" ? (
                                                         <div className="space-y-1">
                                                            <div className="text-emerald-700 dark:text-emerald-500 font-bold">{formatAmount(colIncome)}</div>
                                                            <div className="text-rose-700 dark:text-rose-500 font-bold">{formatAmount(colExpense)}</div>
                                                            <div className={`pt-1 border-t border-slate-200 dark:border-slate-700 ${colNet >= 0 ? 'text-indigo-800 dark:text-indigo-400' : 'text-orange-800 dark:text-orange-400'}`}>
                                                                {formatAmount(colNet)}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className={colNet >= 0 ? 'text-indigo-800 dark:text-indigo-400' : 'text-orange-800 dark:text-orange-400'}>
                                                            {formatAmount(colNet)}
                                                        </span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                        <td className="px-4 py-4 text-right bg-indigo-600 text-white shadow-[-4px_0_10px_rgba(79,70,229,0.1)]">
                                            <div className="flex flex-col">
                                                <span className="text-[8px] opacity-70 uppercase tracking-tighter leading-none mb-1">Grand Net</span>
                                                <span className="text-sm font-black tabular-nums">{formatAmount(reportData?.total_net || 0)}</span>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-4 mt-6">
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex-1 min-w-[200px] shadow-sm">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Period Income</h4>
                            <div className="text-2xl font-black text-emerald-600">{formatAmount(reportData?.total_income || 0)}</div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex-1 min-w-[200px] shadow-sm">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Period Expense</h4>
                            <div className="text-2xl font-black text-rose-500">{formatAmount(reportData?.total_expense || 0)}</div>
                        </div>
                        <div className="bg-indigo-600 rounded-2xl p-5 flex-1 min-w-[200px] shadow-xl shadow-indigo-500/10">
                            <h4 className="text-[10px] font-black text-indigo-100/70 uppercase tracking-widest mb-1">Net Period Performance</h4>
                            <div className={`text-2xl font-black flex items-center gap-2 ${(reportData?.total_net || 0) >= 0 ? 'text-white' : 'text-orange-300'}`}>
                                {formatAmount(reportData?.total_net || 0)}
                                <span className="text-sm opacity-70">{(reportData?.total_net || 0) >= 0 ? 'PROFIT' : 'LOSS'}</span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
            
            <style dangerouslySetInnerHTML={{ __html: `
                @keyframes gradient-x {
                    0% { background-position: 0% 50%; }
                    50% { background-position: 100% 50%; }
                    100% { background-position: 0% 50%; }
                }
                .animate-gradient-x {
                    background-size: 200% 200%;
                    animation: gradient-x 15s ease infinite;
                }
            ` }} />
        </div>
    );
}
