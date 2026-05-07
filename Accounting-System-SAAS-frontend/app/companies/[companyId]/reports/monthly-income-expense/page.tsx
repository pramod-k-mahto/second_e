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
import { safeADToBS, safeBSToAD, isIsoDateString } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { openPrintWindow } from '@/lib/printReport';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const toNepaliDigits = (num: number | string) => {
    const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
    return num.toString().replace(/\d/g, (d) => nepaliDigits[parseInt(d, 10)]);
};

interface MonthlyIncomeExpenseRow {
    group_name: string;
    group_type: "INCOME" | "EXPENSE";
    ledger_name: string;
    month_key: string;
    amount: number;
    dimension_name?: string;
}

export default function MonthlyIncomeExpenseSummaryPage() {
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
        if (mounted && dbCompany) {
            const modeChanged = dbCompany.calendar_mode && dbCompany.calendar_mode !== effectiveDisplayMode;
            const initialWasFallback = !initialCC?.fiscal_year_start && dbCompany.fiscal_year_start;

            if (modeChanged || initialWasFallback) {
                const nextMode = (dbCompany.calendar_mode || effectiveDisplayMode) as "AD" | "BS";
                setEffectiveDisplayMode(nextMode);
                const { from, to } = getSmartDefaultPeriod(nextMode, dbCompany);
                setFromDate(from);
                setToDate(to);
            }
        }
    }, [mounted, dbCompany?.id, dbCompany?.calendar_mode, dbCompany?.fiscal_year_start]);

    const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
    const [showReport, setShowReport] = useState(false);
    const [groupBy, setGroupBy] = useState<"" | "department" | "project">("");
    const [viewType, setViewType] = useState<"detailed" | "summary">("detailed");
    const [filterMode, setFilterMode] = useState<"MONTH" | "PERIOD">("MONTH");
    const [departmentFilter, setDepartmentFilter] = useState<string>("");
    const [projectFilter, setProjectFilter] = useState<string>("");

    const { data: departments } = useSWR(
        companyId ? `/companies/${companyId}/departments` : null,
        fetcher
    );

    const { data: projects } = useSWR(
        companyId ? `/companies/${companyId}/projects` : null,
        fetcher
    );

    const { canRead } = useMenuAccess("reports.income_expense_summary");

    const isBS = effectiveDisplayMode === "BS";

    const presetMonths = useMemo(() => {
        const result: { value: string, label: string }[] = [];
        const activeCo = dbCompany || cc;
        
        const today = new Date();
        const todayAd = today.toISOString().slice(0, 10);

        let sY = today.getFullYear();
        let sM = 1;

        if (effectiveDisplayMode === "BS") {
            if (activeCo?.fiscal_year_start) {
                let ts = activeCo.fiscal_year_start;
                if (isIsoDateString(ts)) {
                    ts = safeADToBS(ts) || ts;
                }
                const parts = ts.split('-');
                if (parts.length >= 2) {
                    sY = parseInt(parts[0], 10);
                    sM = parseInt(parts[1], 10);
                }
            } else {
                const todayBS = safeADToBS(todayAd) || "";
                const parts = todayBS.split('-');
                let currentBS_Y = 2080;
                let currentBS_M = 1;
                if (parts.length >= 2) {
                    currentBS_Y = parseInt(parts[0], 10);
                    currentBS_M = parseInt(parts[1], 10);
                }
                if (currentBS_M >= 4) sY = currentBS_Y;
                else sY = currentBS_Y - 1;
                sM = 4;
            }
        } else {
            if (activeCo?.fiscal_year_start) {
                let ts = activeCo.fiscal_year_start;
                if (!isIsoDateString(ts)) {
                    ts = safeBSToAD(ts) || ts;
                }
                const parts = ts.split('-');
                if (parts.length >= 2) {
                    sY = parseInt(parts[0], 10);
                    sM = parseInt(parts[1], 10);
                } else {
                    sM = 1;
                }
            } else {
                sY = today.getFullYear();
                sM = 1;
            }
        }

        let currentY = sY;
        let currentM = sM;

        for (let i = 0; i < 12; i++) {
            const monthStr = currentM.toString().padStart(2, "0");
            const val = `${currentY}-${monthStr}`;
            let label = val;

            if (effectiveDisplayMode === "BS") {
                const bsMonths = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
                label = `${bsMonths[currentM - 1]} ${toNepaliDigits(currentY)}`;
            } else {
                const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                label = `${adMonths[currentM - 1]} ${currentY}`;
            }

            result.push({ value: val, label });
            currentM++;
            if (currentM > 12) {
                currentM = 1;
                currentY++;
            }
        }
        return result;
    }, [cc, dbCompany, effectiveDisplayMode]);

    const activeMonthKeys = useMemo(() => {
        if (!fromDate || !toDate) return [];
        if (filterMode === "MONTH" && selectedMonths.length > 0) {
            return [...selectedMonths].sort();
        }
        return presetMonths.map(m => m.value).filter(v => {
            const fromKey = fromDate.substring(0, 7);
            const toKey = toDate.substring(0, 7);
            return v >= fromKey && v <= toKey;
        });
    }, [filterMode, selectedMonths, fromDate, toDate, presetMonths]);

    const computeDatesFromMonths = (months: string[]) => {
        if (months.length === 0) return;
        const sorted = [...months].sort();
        const startMonthVal = sorted[0];
        const endMonthVal = sorted[sorted.length - 1];

        const firstDay = `${startMonthVal}-01`;
        let lastDay = `${endMonthVal}-30`;

        if (effectiveDisplayMode !== "BS") {
            const [yStr, mStr] = endMonthVal.split('-');
            const y = parseInt(yStr, 10);
            const m = parseInt(mStr, 10);
            const dDate = new Date(y, m, 0);
            lastDay = `${y}-${mStr}-${dDate.getDate().toString().padStart(2, "0")}`;
        } else {
            const [yStr, mStr] = endMonthVal.split('-');
            const mStrPad = mStr.padStart(2, '0');
            for (let d = 32; d >= 29; d--) {
                const testVal = `${yStr}-${mStrPad}-${d.toString().padStart(2, '0')}`;
                if (safeBSToAD(testVal) !== '') {
                    lastDay = testVal;
                    break;
                }
            }
        }

        setFromDate(firstDay);
        setToDate(lastDay);
    };

    const handleMonthToggle = (val: string) => {
        let next: string[];
        if (val === "ALL") {
            if (selectedMonths.length === presetMonths.length) {
                next = [];
            } else {
                next = presetMonths.map(p => p.value);
            }
        } else {
            next = selectedMonths.includes(val)
                ? selectedMonths.filter(m => m !== val)
                : [...selectedMonths, val];
        }
        setSelectedMonths(next);
    };

    const handleShow = () => {
        if (filterMode === "MONTH") {
            if (selectedMonths.length === 0) return;
            computeDatesFromMonths(selectedMonths);
        } else {
            if (!fromDate || !toDate) return;
        }
        setShowReport(true);
    };

    const handleToday = () => {
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, cc);
        setFromDate(from);
        setToDate(to);
        setShowReport(true);
    };

    const handleReset = () => {
        setDepartmentFilter(""); setProjectFilter(""); setGroupBy(""); setViewType("detailed");
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode);
        setFromDate(from); setToDate(to); setSelectedMonths([]); setShowReport(false);
    };

    const reportUrl = useMemo(() => {
        if (!companyId || !fromDate || !toDate) return null;
        const fromAD = isBS ? safeBSToAD(fromDate) : fromDate;
        const toAD = isBS ? safeBSToAD(toDate) : toDate;
        if (!fromAD || !toAD) return null;
        
        let url = `/companies/${companyId}/reports/monthly-income-expense?from_date=${fromAD}&to_date=${toAD}&calendar_mode=${effectiveDisplayMode}`;
        if (departmentFilter) url += `&department_id=${departmentFilter}`;
        if (projectFilter) url += `&project_id=${projectFilter}`;
        if (groupBy) url += `&group_by=${groupBy}`;
        return url;
    }, [companyId, fromDate, toDate, departmentFilter, projectFilter, groupBy, isBS, effectiveDisplayMode]);

    const { data: reportData, error: reportError } = useSWR<{ data: MonthlyIncomeExpenseRow[] }>(reportUrl, fetcher);

    const mappedData = useMemo(() => {
        if (!showReport || !reportData?.data || activeMonthKeys.length === 0) {
            return { months: [], rows: { income: [], expense: [] }, totals: { INCOME: {}, EXPENSE: {}, NET: {}, OVERALL_INCOME: 0, OVERALL_EXPENSE: 0, OVERALL_NET: 0 } };
        }
        const monthList = activeMonthKeys;
        const formatMonth = (key: string) => {
            const parts = key.split("-");
            if (parts.length !== 2) return key;
            const mIdx = parseInt(parts[1], 10) - 1;
            if (effectiveDisplayMode === "BS") {
                const bsMonths = ["वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज", "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"];
                return `${bsMonths[mIdx]} ${toNepaliDigits(parts[0])}`;
            } else {
                const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return `${adMonths[mIdx]} ${parts[0]}`;
            }
        };
        const monthCols = monthList.map(m => ({ key: m, label: formatMonth(m) }));
        const incomeGroups: any = {}, expenseGroups: any = {};
        const monthlyTotals: any = { INCOME: {}, EXPENSE: {}, NET: {}, OVERALL_INCOME: 0, OVERALL_EXPENSE: 0, OVERALL_NET: 0 };
        monthList.forEach(m => { monthlyTotals.INCOME[m] = 0; monthlyTotals.EXPENSE[m] = 0; monthlyTotals.NET[m] = 0; });

        reportData.data.forEach(item => {
            if (!activeMonthKeys.includes(item.month_key)) return;
            const target = item.group_type === "INCOME" ? incomeGroups : expenseGroups;
            if (!target[item.group_name]) target[item.group_name] = {};
            if (!target[item.group_name][item.ledger_name]) target[item.group_name][item.ledger_name] = {};
            target[item.group_name][item.ledger_name][item.month_key] = (target[item.group_name][item.ledger_name][item.month_key] || 0) + item.amount;

            if (item.group_type === "INCOME") {
                monthlyTotals.INCOME[item.month_key] += item.amount;
                monthlyTotals.NET[item.month_key] += item.amount;
                monthlyTotals.OVERALL_INCOME += item.amount;
                monthlyTotals.OVERALL_NET += item.amount;
            } else {
                monthlyTotals.EXPENSE[item.month_key] += item.amount;
                monthlyTotals.NET[item.month_key] -= item.amount;
                monthlyTotals.OVERALL_EXPENSE += item.amount;
                monthlyTotals.OVERALL_NET -= item.amount;
            }
        });

        const buildSection = (groups: any) => {
            const res = [];
            for (const gName in groups) {
                const leds = [];
                let gTot = 0; const gMon: any = {}; monthList.forEach(m => gMon[m] = 0);
                for (const lName in groups[gName]) {
                    let lTot = 0;
                    for (const m of monthList) {
                        const v = groups[gName][lName][m] || 0;
                        lTot += v; gMon[m] += v;
                    }
                    gTot += lTot;
                    leds.push({ name: lName, monthly: groups[gName][lName], total: lTot });
                }
                leds.sort((a,b) => b.total - a.total);
                res.push({ name: gName, ledgers: leds, monthly: gMon, total: gTot });
            }
            res.sort((a,b) => b.total - a.total);
            return res;
        };

        return { months: monthCols, rows: { income: buildSection(incomeGroups), expense: buildSection(expenseGroups) }, totals: monthlyTotals };
    }, [reportData, effectiveDisplayMode, activeMonthKeys, showReport]);

    const formatNumber = (num: number) => {
        if (!num || num === 0) return "-";
        return new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
    };

    const handlePrint = () => {
        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Monthly Income & Expense Summary",
            company: cc?.name || "",
            period: fromDate && toDate ? `${formatDateWithSuffix(fromDate, effectiveDisplayMode)} – ${formatDateWithSuffix(toDate, effectiveDisplayMode)}` : "",
            orientation: "landscape",
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
                        <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 italic tracking-tight uppercase leading-none">Monthly Summary</h1>
                        <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">Month-on-Month comparative performance</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => router.back()} className="px-4 py-2 text-xs font-bold border rounded-xl hover:bg-slate-50 transition-all bg-white dark:bg-slate-800 dark:border-slate-700 shadow-sm active:scale-95">Back</button>
                    <button onClick={() => router.push(`/companies/${companyId}/reports`)} className="px-4 py-2 text-xs font-bold border border-rose-200 text-rose-600 rounded-xl hover:bg-rose-50 transition-all bg-white dark:bg-slate-800 dark:border-rose-900 ml-1 shadow-sm active:scale-95">Close</button>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-slate-100/40 dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                <div className="flex flex-col gap-6">
                    {/* Row 1: Primary Controls */}
                    <div className="flex flex-wrap items-end gap-5 pb-5 border-b border-white dark:border-slate-800/50">
                        <div className="flex flex-col gap-2 min-w-[120px]">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Date Mode</label>
                            <select value={effectiveDisplayMode} onChange={(e) => {
                                const next = e.target.value as "AD" | "BS";
                                setEffectiveDisplayMode(next);
                                writeCalendarReportDisplayMode(companyId, next);
                                const { from, to } = getSmartDefaultPeriod(next, cc);
                                setFromDate(from);
                                setToDate(to);
                            }} className="h-10 border border-indigo-500/20 rounded-xl px-4 text-xs bg-white dark:bg-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold text-indigo-700 border-t-4 border-t-indigo-500 transition-all">
                                <option value="AD">AD (Gregorian)</option>
                                <option value="BS">BS (Nepali)</option>
                            </select>
                        </div>
                        <div className="flex flex-col gap-2 min-w-[150px]">
                            <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">View Mode</label>
                            <select value={filterMode} onChange={(e) => setFilterMode(e.target.value as any)} className="h-10 border border-slate-200 dark:border-slate-700 rounded-xl px-4 text-xs bg-white dark:bg-slate-900 shadow-sm focus:ring-4 focus:ring-indigo-500/10 outline-none font-bold transition-all">
                                <option value="MONTH">Comparison View</option>
                                <option value="PERIOD">Date Range View</option>
                            </select>
                        </div>

                        {filterMode === "MONTH" ? (
                            <div className="flex flex-col gap-2 flex-1 min-w-0">
                                <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Select comparison months</label>
                                <div className="flex flex-wrap items-center gap-3 h-10">
                                    <label className="flex items-center gap-2 cursor-pointer bg-slate-200/50 dark:bg-slate-800 px-3 py-1.5 rounded-xl h-full hover:bg-slate-200 transition-all border border-slate-200 dark:border-slate-700 select-none">
                                        <input type="checkbox" className="w-4 h-4 rounded-md accent-indigo-600 cursor-pointer" checked={selectedMonths.length === presetMonths.length} onChange={() => handleMonthToggle("ALL")} />
                                        <span className="text-[11px] font-black text-slate-700 dark:text-slate-300 uppercase tracking-tighter">ALL</span>
                                    </label>
                                    <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
                                        {presetMonths.map(m => (
                                            <label key={m.value} className={`flex items-center gap-2 cursor-pointer px-3 py-1.5 rounded-xl h-9 transition-all select-none border-2 ${selectedMonths.includes(m.value) ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-200/60 dark:border-indigo-800' : 'bg-white dark:bg-slate-900 border-transparent hover:border-slate-200'}`}>
                                                <input type="checkbox" className="w-3.5 h-3.5 rounded accent-indigo-600 cursor-pointer" checked={selectedMonths.includes(m.value)} onChange={() => handleMonthToggle(m.value)} />
                                                <span className={`text-[10px] font-bold ${selectedMonths.includes(m.value) ? 'text-indigo-700 dark:text-indigo-300 font-black' : 'text-slate-500'}`}>{m.label.split(' ')[0]}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="flex items-end gap-4">
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">Start Date</label>
                                    {isBS ? (
                                        <NepaliDatePicker 
                                            inputClassName="h-10 w-36 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                            value={fromDate} 
                                            onChange={(val)=>setFromDate(val)} 
                                            options={{calenderLocale:'ne', valueLocale:'en'}} 
                                        />
                                    ) : (
                                        <Input forceNative
                                            type="date" 
                                            className="h-10 w-44 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                            value={fromDate} 
                                            min={cc?.fiscal_year_start || ""}
                                            max={cc?.fiscal_year_end || ""}
                                            onChange={(e)=>setFromDate(e.target.value)} 
                                        />
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    <label className="text-[10px] uppercase font-black text-slate-500 tracking-wider">End Date</label>
                                    {isBS ? (
                                        <NepaliDatePicker 
                                            inputClassName="h-10 w-36 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                            value={toDate} 
                                            onChange={(val)=>setToDate(val)} 
                                            options={{calenderLocale:'ne', valueLocale:'en'}} 
                                        />
                                    ) : (
                                        <Input forceNative
                                            type="date" 
                                            className="h-10 w-44 border border-slate-200 dark:border-slate-700 rounded-xl text-xs px-4 bg-white dark:bg-slate-950 focus:ring-4 focus:ring-indigo-500/10 transition-all" 
                                            value={toDate} 
                                            min={cc?.fiscal_year_start || ""}
                                            max={cc?.fiscal_year_end || ""}
                                            onChange={(e)=>setToDate(e.target.value)} 
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Row 2: Actions */}
                    <div className="flex flex-wrap items-end gap-4 justify-between">
                        <div className="flex flex-wrap gap-4">
                            <div className="flex flex-col gap-2 min-w-[160px]">
                                <label className="text-[10px] uppercase font-black text-slate-400">Layout</label>
                                <select value={viewType} onChange={(e)=>setViewType(e.target.value as any)} className="h-9 text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 bg-white dark:bg-slate-900 font-bold transition-all">
                                    <option value="detailed">Detailed Matrix</option>
                                    <option value="summary">Summary Comparison</option>
                                </select>
                            </div>
                            <div className="flex flex-col gap-2 min-w-[160px]">
                                <label className="text-[10px] uppercase font-black text-slate-400">Dimension Analysis</label>
                                <select value={groupBy} onChange={(e)=>setGroupBy(e.target.value as any)} className="h-9 text-xs border border-slate-200 dark:border-slate-700 rounded-xl px-3 bg-white dark:bg-slate-900 font-bold transition-all border-t-4 border-t-slate-400">
                                    <option value="">Default (Ledger Groups)</option>
                                    <option value="department">Analyze by Department</option>
                                    <option value="project">Analyze by Project</option>
                                </select>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                           <button onClick={handleReset} className="h-10 px-5 text-xs font-black text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 rounded-xl transition-all uppercase tracking-widest">Reset</button>
                           <button onClick={handleToday} className="h-10 px-5 text-xs font-black text-slate-600 bg-white dark:bg-slate-800 border rounded-xl hover:bg-slate-50 transition-all shadow-sm">This Year</button>
                           <button onClick={handlePrint} className="h-10 w-10 flex items-center justify-center border border-indigo-200 rounded-xl hover:bg-indigo-50 transition-all shadow-sm text-indigo-600">🖨️</button>
                           <button onClick={handleShow} className="h-10 px-10 text-xs font-black text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-xl shadow-indigo-500/20 transition-all active:scale-95 uppercase tracking-widest">Generate Matrix</button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Report Rendering Section */}
            <div ref={printRef} className="flex-1 bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 shadow-sm min-h-[600px] relative overflow-hidden backdrop-blur-sm">
                {!showReport ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-5 opacity-60">
                         <div className="w-24 h-24 border-4 border-dashed border-slate-200 rounded-full flex items-center justify-center text-4xl">🗓️</div>
                         <div className="text-center">
                            <p className="text-sm font-black text-slate-700 dark:text-slate-300 uppercase tracking-widest">Matrix Report Ready</p>
                            <p className="text-[11px] max-w-[280px] mx-auto leading-relaxed mt-2 italic font-medium">Configure comparison months or a custom period to see comparative financial performance.</p>
                         </div>
                    </div>
                ) : !reportData ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-indigo-500 gap-6">
                         <div className="w-14 h-14 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                         <p className="text-[11px] font-black uppercase tracking-[0.4em] animate-pulse italic">Aggregating Monthly Ledgers...</p>
                    </div>
                ) : (
                    <div className="flex flex-col gap-10">
                        <div className="text-center border-b-2 border-dashed border-slate-100 dark:border-slate-800 pb-10">
                             <h2 className="text-3xl font-black text-slate-900 dark:text-slate-100 uppercase tracking-tighter leading-none mb-1">{cc?.name}</h2>
                             <p className="text-[11px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-[0.5em] mb-5">Comparative Monthly Analysis</p>
                             <div className="inline-flex items-center bg-indigo-50/50 dark:bg-indigo-950/20 px-8 py-3 rounded-full border border-indigo-100 dark:border-indigo-900/60 shadow-inner">
                                <span className="text-[10px] font-black text-indigo-800 dark:text-indigo-300 uppercase tracking-widest">
                                     PERIOD: {formatDateWithSuffix(fromDate, effectiveDisplayMode)} – {formatDateWithSuffix(toDate, effectiveDisplayMode)}
                                </span>
                             </div>
                        </div>

                        <div className="overflow-x-auto custom-scrollbar-horizontal">
                            <table className="w-full border-collapse text-[10px]">
                                <thead className="sticky top-0 z-20 shadow-sm border-b-2 border-slate-200 dark:border-slate-800">
                                    <tr className="bg-slate-900 text-slate-200 uppercase tracking-widest leading-none">
                                        <th className="p-4 text-left sticky left-0 bg-slate-900 z-30 min-w-[280px] font-black border-r border-slate-800">Account Particulars</th>
                                        {mappedData.months.map(m => (
                                            <th key={m.key} className="p-4 text-right bg-slate-900 border-l border-slate-800 font-bold tabular-nums italic text-[9px] min-w-[110px]">{m.label}</th>
                                        ))}
                                        <th className="p-4 text-right bg-black text-white font-black border-l border-slate-700 min-w-[140px] tracking-tight">CUMULATIVE TOTAL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* INCOMES */}
                                    {mappedData.rows.income.length > 0 && <tr className="bg-emerald-600 text-white font-black text-[9px] uppercase tracking-[0.3em]"><td className="p-2 px-5 sticky left-0 bg-emerald-600 font-black" colSpan={100}>Revenue Stream Matrix</td></tr>}
                                    {mappedData.rows.income.map(g => (
                                        <React.Fragment key={g.name}>
                                            <tr className="bg-emerald-50/60 dark:bg-emerald-950/20 group font-bold border-b border-emerald-100 dark:border-emerald-900/40 hover:bg-emerald-100/50 transition-colors">
                                               <td className="p-3.5 px-6 sticky left-0 bg-[#f8fafc] dark:bg-emerald-950/90 font-black border-r border-emerald-100/50 uppercase text-slate-800 dark:text-slate-200">{g.name}</td>
                                               {mappedData.months.map(m => <td key={m.key} className="p-3.5 text-right border-l border-emerald-100/20 tabular-nums italic font-medium">{formatNumber(g.monthly[m.key])}</td>)}
                                               <td className="p-3.5 text-right bg-emerald-100/40 dark:bg-emerald-900/40 font-black text-emerald-800 dark:text-emerald-300 border-l-2 border-emerald-200/50 text-[11px] tabular-nums">{formatNumber(g.total)}</td>
                                            </tr>
                                            {viewType === 'detailed' && g.ledgers.map((l:any) => (
                                                <tr key={l.name} className="border-b border-slate-50 dark:border-slate-800/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                                                   <td className="p-2.5 pl-12 sticky left-0 bg-white dark:bg-slate-900/90 italic text-slate-600 dark:text-slate-400 border-r border-slate-50 font-medium">{l.name}</td>
                                                   {mappedData.months.map(m => <td key={m.key} className="p-2.5 text-right opacity-60 tabular-nums font-medium border-l border-slate-50/30">{formatNumber(l.monthly[m.key])}</td>)}
                                                   <td className="p-2.5 text-right font-bold text-slate-700 dark:text-slate-300 border-l border-slate-100 tabular-nums">{formatNumber(l.total)}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                    {mappedData.rows.income.length > 0 && (
                                        <tr className="bg-emerald-100 dark:bg-emerald-900/60 font-black border-t-2 border-emerald-400 shadow-sm relative z-10">
                                            <td className="p-4 px-6 sticky left-0 bg-emerald-100 dark:bg-emerald-900/90 uppercase text-[9px] tracking-[0.2em] font-black">Gross Income Position</td>
                                            {mappedData.months.map(m => <td key={m.key} className="p-4 text-right tabular-nums text-emerald-800 dark:text-emerald-300">{formatNumber(mappedData.totals.INCOME[m.key])}</td>)}
                                            <td className="p-4 text-right bg-emerald-200 dark:bg-emerald-800 text-base text-emerald-900 dark:text-white tabular-nums tracking-tighter">{formatNumber(mappedData.totals.OVERALL_INCOME)}</td>
                                        </tr>
                                    )}

                                    {/* EXPENSES */}
                                    {mappedData.rows.expense.length > 0 && <tr className="bg-rose-500 text-white font-black text-[9px] uppercase tracking-[0.3em] border-t-[12px] border-white dark:border-slate-950"><td className="p-2 px-5 sticky left-0 bg-rose-500 font-black" colSpan={100}>Expenditure / Costs Matrix</td></tr>}
                                    {mappedData.rows.expense.map(g => (
                                        <React.Fragment key={g.name}>
                                            <tr className="bg-rose-50/60 dark:bg-rose-950/20 font-bold border-b border-rose-100 dark:border-rose-900/40 hover:bg-rose-100/50 transition-colors">
                                               <td className="p-3.5 px-6 sticky left-0 bg-[#fef2f2] dark:bg-rose-950/90 font-black border-r border-rose-100/50 uppercase text-slate-800 dark:text-slate-200">{g.name}</td>
                                               {mappedData.months.map(m => <td key={m.key} className="p-3.5 text-right border-l border-rose-100/20 tabular-nums italic font-medium">{formatNumber(g.monthly[m.key])}</td>)}
                                               <td className="p-3.5 text-right bg-rose-100/40 dark:bg-rose-900/40 font-black text-rose-800 dark:text-rose-300 border-l-2 border-rose-200/50 text-[11px] tabular-nums">{formatNumber(g.total)}</td>
                                            </tr>
                                            {viewType === 'detailed' && g.ledgers.map((l:any) => (
                                                <tr key={l.name} className="border-b border-slate-50 dark:border-slate-800/20 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                                                   <td className="p-2.5 pl-12 sticky left-0 bg-white dark:bg-slate-900/90 italic text-slate-600 dark:text-slate-400 border-r border-slate-50 font-medium">{l.name}</td>
                                                   {mappedData.months.map(m => <td key={m.key} className="p-2.5 text-right opacity-60 tabular-nums font-medium border-l border-slate-50/30">{formatNumber(l.monthly[m.key])}</td>)}
                                                   <td className="p-2.5 text-right font-bold text-slate-700 dark:text-slate-300 border-l border-slate-100 tabular-nums">{formatNumber(l.total)}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                    {mappedData.rows.expense.length > 0 && (
                                        <tr className="bg-rose-100 dark:bg-rose-900/60 font-black border-t-2 border-rose-400 shadow-sm relative z-10">
                                            <td className="p-4 px-6 sticky left-0 bg-rose-100 dark:bg-rose-900/90 uppercase text-[9px] tracking-[0.2em] font-black">Gross Expenditure Position</td>
                                            {mappedData.months.map(m => <td key={m.key} className="p-4 text-right tabular-nums text-rose-800 dark:text-rose-300">{formatNumber(mappedData.totals.EXPENSE[m.key])}</td>)}
                                            <td className="p-4 text-right bg-rose-200 dark:bg-rose-800 text-base text-rose-900 dark:text-white tabular-nums tracking-tighter">{formatNumber(mappedData.totals.OVERALL_EXPENSE)}</td>
                                        </tr>
                                    )}

                                    {/* FINAL NET POSITION */}
                                    <tr className="bg-slate-900 text-white font-black border-t-8 border-white dark:border-slate-950 shadow-2xl relative z-20">
                                        <td className="p-6 px-10 sticky left-0 bg-slate-900 italic tracking-[0.3em] font-black text-xs">CASH FLOW NET SURPLUS / (DEFICIT)</td>
                                        {mappedData.months.map(m => (
                                            <td key={m.key} className={`p-6 text-right text-lg border-l border-slate-800 tabular-nums ${mappedData.totals.NET[m.key] < 0 ? 'text-rose-400' : 'text-emerald-400 font-black'}`}>
                                                {formatNumber(mappedData.totals.NET[m.key])}
                                            </td>
                                        ))}
                                        <td className={`p-6 text-right text-3xl border-l-2 border-slate-700 bg-black tabular-nums tracking-tighter ${mappedData.totals.OVERALL_NET < 0 ? 'text-rose-500 underline decoration-rose-500/20' : 'text-emerald-500'}`}>
                                            {formatNumber(mappedData.totals.OVERALL_NET)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        <div className="flex justify-between items-center text-[9px] font-black text-slate-400 uppercase tracking-[0.3em] border-t border-slate-100 dark:border-slate-800 pt-8 pb-4 italic">
                             <div className="flex items-center gap-2">Report Authored: {new Date().toLocaleString()} &nbsp; • &nbsp; Signed By: {currentUser?.full_name || currentUser?.name || "System Controller"}</div>
                             <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-600" /> SWR Cache Active</div>
                                <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-600" /> Sync Locked</div>
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
