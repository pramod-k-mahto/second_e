"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import "nepali-datepicker-reactjs/dist/index.css";
import { getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import {
    CalendarDisplayMode,
    CalendarReportDisplayMode,
    readCalendarDisplayMode,
    readCalendarReportDisplayMode,
    writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";

type Props = {
    companyId: string;
    departments: { id: number; name: string; is_active: boolean }[];
    projects: { id: number; name: string; is_active: boolean }[];
    segments: { id: number; name: string; is_active: boolean }[];
    employees: { id: number; full_name: string; is_active: boolean }[];
    currentFrom?: string;
    currentTo?: string;
};

export function ProfitLossFilters({ companyId, departments, projects, segments, employees, currentFrom, currentTo }: Props) {
    const router = useRouter();
    const [downloadFormat, setDownloadFormat] = useState<"PDF" | "Excel" | "Send">("PDF");
    const cc = getCurrentCompany();

    const handlePrint = () => {
        if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("trigger-pnl-print"));
        }
    };

    const handleDownload = () => {
        if (downloadFormat === "PDF") { handlePrint(); return; }
        if (downloadFormat === "Excel") {
            const rows = ["Profit & Loss Report", `Date: ${currentFrom} to ${currentTo}`];
            const blob = new Blob([rows.join("\n")], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a"); a.href = url; a.download = "profit-loss.csv";
            document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
        }
    };

    const searchParams = useSearchParams();

    const [fromDate, setFromDate] = useState("");
    const [toDate, setToDate] = useState("");
    const [onDate, setOnDate] = useState("");
    const [departmentId, setDepartmentId] = useState("");
    const [projectId, setProjectId] = useState("");
    const [segmentId, setSegmentId] = useState("");
    const [employeeId, setEmployeeId] = useState("");
    const [view, setView] = useState("summary");
    const [activeMode, setActiveMode] = useState<"range" | "specific" | "today" | null>("today");

    const [mounted, setMounted] = useState(false);
    const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
    const initialMode = initialCC?.calendar_mode || "AD";
    
    const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
        const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
        return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
    });

    useEffect(() => {
        setMounted(true);
    }, []);

    // Sync with database if available
    useEffect(() => {
        if (mounted) {
            const cc = getCurrentCompany();
            if (cc?.calendar_mode && cc.calendar_mode !== effectiveDisplayMode) {
                setEffectiveDisplayMode(cc.calendar_mode as any);
            }
        }
    }, [mounted]);

    const isBS = effectiveDisplayMode === "BS";

    useEffect(() => {
        const p_from = searchParams.get("from_date") || "";
        const p_to = searchParams.get("to_date") || "";
        const p_on = searchParams.get("on_date") || "";
        const p_preset = searchParams.get("preset");
        const p_dept = searchParams.get("department_id") || "";
        const p_proj = searchParams.get("project_id") || "";
        const p_seg = searchParams.get("segment_id") || "";
        const p_emp = searchParams.get("employee_id") || "";
        const p_view = searchParams.get("view") || "summary";

        // Convert currentFrom/currentTo (AD) to BS if needed
        const initialFromProp = isBS ? (safeADToBS(currentFrom || "") || "") : currentFrom;
        const initialToProp = isBS ? (safeADToBS(currentTo || "") || "") : currentTo;

        setFromDate(p_from || initialFromProp || "");
        setToDate(p_to || initialToProp || "");
        setOnDate(p_on);
        setDepartmentId(p_dept);
        setProjectId(p_proj);
        setSegmentId(p_seg);
        setEmployeeId(p_emp);
        setView(p_view);

        if (p_preset === "today") {
            setActiveMode("today");
            if (!p_from && !p_to && initialFromProp && initialToProp) {
                setFromDate(initialFromProp);
                setToDate(initialToProp);
            }
        } else if (p_on || (p_preset === "on_date")) {
            setActiveMode("specific");
            setFromDate("");
            setToDate("");
        } else if (p_from || p_to) {
            setActiveMode("range");
            setOnDate("");
        } else {
            // No URL params: default to Smart Default (FY start -> today/FY end)
            setActiveMode("today");
            const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(effectiveDisplayMode, initialCC);
            setFromDate(smartFrom);
            setToDate(smartTo);
        }
    }, [searchParams, effectiveDisplayMode, currentFrom, currentTo]);

    const applyFilters = (overrides?: { mode?: "range" | "specific" | "today"; view?: string }) => {
        const params = new URLSearchParams();
        const mode = overrides?.mode ?? activeMode;
        const nextView = overrides?.view ?? view;

        params.set("view", nextView);
        if (departmentId) params.set("department_id", departmentId);
        if (projectId) params.set("project_id", projectId);
        if (segmentId) params.set("segment_id", segmentId);
        if (employeeId) params.set("employee_id", employeeId);

        if (mode === "today") {
            params.set("preset", "today");
        } else if (mode === "specific") {
            if (onDate) {
                params.set("on_date", onDate);
                params.set("preset", "on_date");
            }
        } else if (mode === "range") {
            if (fromDate) params.set("from_date", fromDate);
            if (toDate) params.set("to_date", toDate);
        }

        router.push(`?${params.toString()}`);
    };

    const handleFromChange = (val: string) => {
        const stored = (effectiveDisplayMode === "BS" && !isBS) ? safeBSToAD(val)
            : (effectiveDisplayMode === "AD" && isBS) ? safeADToBS(val)
                : val;
        setFromDate(stored);
        if (val) { setActiveMode("range"); setOnDate(""); }
    };

    const handleToChange = (val: string) => {
        const stored = (effectiveDisplayMode === "BS" && !isBS) ? safeBSToAD(val)
            : (effectiveDisplayMode === "AD" && isBS) ? safeADToBS(val)
                : val;
        setToDate(stored);
        if (val) { setActiveMode("range"); setOnDate(""); }
    };

    const handleDeptChange = (val: string) => {
        setDepartmentId(val);
        const params = new URLSearchParams(searchParams);
        params.set("department_id", val);
        router.push(`?${params.toString()}`);
    };

    const handleProjChange = (val: string) => {
        setProjectId(val);
        const params = new URLSearchParams(searchParams);
        params.set("project_id", val);
        router.push(`?${params.toString()}`);
    };

    const handleSegChange = (val: string) => {
        setSegmentId(val);
        const params = new URLSearchParams(searchParams);
        params.set("segment_id", val);
        router.push(`?${params.toString()}`);
    };
    
    const handleEmpChange = (val: string) => {
        setEmployeeId(val);
        const params = new URLSearchParams(searchParams);
        params.set("employee_id", val);
        router.push(`?${params.toString()}`);
    };



    const handleTodayClick = () => {
        setActiveMode("today");
        const { from, to } = getSmartDefaultPeriod(isBS ? "BS" : "AD");
        setFromDate(from);
        setToDate(to);
        setOnDate("");
        applyFilters({ mode: "today" });
    };

    const handleViewChange = (v: string) => {
        setView(v);
        applyFilters({ view: v });
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter") { e.preventDefault(); applyFilters(); }
    };

    const isRangeActive = activeMode === "range" && (fromDate || toDate);
    const isTodayActive = activeMode === "today";

    const inputBase = "h-9 rounded-lg border px-3 py-1 text-sm focus:outline-none focus:ring-2 transition-all duration-150";
    const rangeInputCls = `${inputBase} ${isRangeActive
        ? "border-indigo-400 bg-indigo-50 text-indigo-800 focus:ring-indigo-300"
        : "border-slate-300 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-slate-400 focus:ring-slate-200"
        }`;

    const handleBack = () => router.push(`/companies/${companyId}`);
    const handleClose = () => router.push(`/companies/${companyId}`);

    const views = ["summary", "details", "hierarchical"] as const;
    const viewColors: Record<string, string> = {
        summary: "bg-indigo-600 text-white shadow-sm shadow-indigo-100",
        details: "bg-emerald-600 text-white shadow-sm shadow-emerald-100",
        hierarchical: "bg-violet-600 text-white shadow-sm shadow-violet-100",
    };

    return (
        <div className="relative z-[60] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-50/50 dark:bg-slate-900/50 overflow-visible">
            {/* Unified Compact Header */}
            <div className="px-4 py-2 flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-t-2xl">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                        <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
                        </svg>
                    </div>
                    <div>
                        <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none">Profit &amp; Loss</h1>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">Report &amp; Filters</p>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 ml-auto print-hidden">
                    {/* View Switcher */}
                    <div className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200 dark:border-slate-700 mr-2">
                        {views.map((v) => (
                            <button
                                key={v}
                                type="button"
                                onClick={() => handleViewChange(v)}
                                className={`rounded-lg px-2.5 py-1 text-[10px] font-bold transition-all duration-200 ${view === v
                                    ? viewColors[v]
                                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-700"
                                    }`}
                            >
                                {v.charAt(0).toUpperCase() + v.slice(1)}
                            </button>
                        ))}
                    </div>

                    {/* Print */}
                    <button
                        type="button"
                        onClick={handlePrint}
                        className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                    >
                        🖨️ Print
                    </button>

                    {/* Download split-button */}
                    <div className="flex items-center h-8">
                        <select
                            className="h-8 rounded-l-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-300 border-r-0"
                            value={downloadFormat}
                            onChange={(e) => setDownloadFormat(e.target.value as any)}
                        >
                            <option value="PDF">PDF</option>
                            <option value="Excel">Excel</option>
                            <option value="Send">Send</option>
                        </select>
                        <button
                            type="button"
                            onClick={handleDownload}
                            className="h-8 rounded-r-lg px-3 text-xs font-semibold text-white transition-all shadow-sm bg-indigo-600 hover:bg-indigo-700"
                        >
                            ↓ Download
                        </button>
                    </div>

                    <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

                    {/* Back */}
                    <button
                        type="button"
                        onClick={handleBack}
                        className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-semibold border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 transition-all shadow-sm"
                    >
                        <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
                        Back
                    </button>

                    {/* Close */}
                    <button
                        type="button"
                        onClick={handleClose}
                        className="flex items-center justify-center h-8 w-8 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-red-50 dark:hover:bg-red-900/30 text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-all shadow-sm"
                        title="Close"
                    >
                        <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    </button>
                </div>
            </div>

            <div className="px-4 py-3">
                <div className="flex flex-wrap items-end gap-3 text-sm">
                    {/* Date Display Control */}
                    <div className="min-w-[110px]">
                        <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Display
                        </label>
                        <select
                            className="h-9 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm text-slate-700 dark:text-slate-200 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all disabled:opacity-50"
                            value={effectiveDisplayMode}
                            onChange={(e) => {
                                const next = e.target.value as "AD" | "BS";
                                setEffectiveDisplayMode(next);
                                writeCalendarReportDisplayMode(companyId, next);
                                const { from, to } = getSmartDefaultPeriod(next, cc);
                                setFromDate(from);
                                setToDate(to);
                                setOnDate(to);
                            }}
                        >
                            <option value="AD">AD</option>
                            <option value="BS">BS</option>
                        </select>
                    </div>

                    {/* From - To Range */}
                    <div className="flex items-end gap-1.5">
                        <div className="relative z-50">
                            <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                From Date ({effectiveDisplayMode})
                            </label>
                            {effectiveDisplayMode === "BS" ? (
                                <div className="relative z-50">
                                    <NepaliDatePicker
                                        inputClassName={rangeInputCls}
                                        value={isBS ? fromDate : safeADToBS(fromDate)}
                                        onChange={(value: string) => handleFromChange(value)}
                                        options={{ calenderLocale: "ne", valueLocale: "en" }}
                                        // @ts-ignore
                                        minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                                        // @ts-ignore
                                        maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                                    />
                                </div>
                            ) : (
                                <input
                                    type="date"
                                    value={isBS ? safeBSToAD(fromDate) : fromDate}
                                    min={cc?.fiscal_year_start || ""}
                                    max={cc?.fiscal_year_end || ""}
                                    onChange={(e) => handleFromChange(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className={rangeInputCls}
                                />
                            )}
                        </div>
                        <span className="text-slate-400 font-bold mb-2">—</span>
                        <div className="relative z-50">
                            <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                                To Date ({effectiveDisplayMode})
                            </label>
                            {effectiveDisplayMode === "BS" ? (
                                <div className="relative z-50">
                                    <NepaliDatePicker
                                        inputClassName={rangeInputCls}
                                        value={isBS ? toDate : safeADToBS(toDate)}
                                        onChange={(value: string) => handleToChange(value)}
                                        options={{ calenderLocale: "ne", valueLocale: "en" }}
                                        // @ts-ignore
                                        minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                                        // @ts-ignore
                                        maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                                    />
                                </div>
                            ) : (
                                <input
                                    type="date"
                                    value={isBS ? safeBSToAD(toDate) : toDate}
                                    min={cc?.fiscal_year_start || ""}
                                    max={cc?.fiscal_year_end || ""}
                                    onChange={(e) => handleToChange(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    className={rangeInputCls}
                                />
                            )}
                        </div>
                    </div>

                    {/* Today button */}
                    <button
                        type="button"
                        onClick={handleTodayClick}
                        className={`h-9 rounded-lg px-4 text-sm font-semibold transition-all duration-200 border ${isTodayActive
                            ? "bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-transparent shadow-lg shadow-indigo-100"
                            : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-indigo-300"
                            }`}
                    >
                        📅 Today
                    </button>

                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 self-center mx-1" />

                    {/* Department */}
                    <div>
                        <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Department
                        </label>
                        <select
                            value={departmentId}
                            onChange={(e) => handleDeptChange(e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm text-slate-700 dark:text-slate-200 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[140px] transition-all"
                        >
                            <option value="">All departments</option>
                            {departments.map((d) => (
                                <option key={d.id} value={d.id}>
                                    {d.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Project */}
                    <div>
                        <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Project
                        </label>
                        <select
                            value={projectId}
                            onChange={(e) => handleProjChange(e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm text-slate-700 dark:text-slate-200 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[140px] transition-all"
                        >
                            <option value="">All projects</option>
                            {projects.map((p) => (
                                <option key={p.id} value={p.id}>
                                    {p.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Segment */}
                    <div>
                        <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Segment
                        </label>
                        <select
                            value={segmentId}
                            onChange={(e) => handleSegChange(e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm text-slate-700 dark:text-slate-200 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[140px] transition-all"
                        >
                            <option value="">All segments</option>
                            {segments.map((s) => (
                                <option key={s.id} value={s.id}>
                                    {s.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Employee */}
                    <div>
                        <label className="mb-0.5 block text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            Employee
                        </label>
                        <select
                            value={employeeId}
                            onChange={(e) => handleEmpChange(e.target.value)}
                            className="h-9 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1 text-sm text-slate-700 dark:text-slate-200 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 min-w-[140px] transition-all"
                        >
                            <option value="">All employees</option>
                            {employees.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.full_name}
                                </option>
                            ))}
                        </select>
                    </div>

                </div>
            </div>
        </div>
    );
}

