"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, getCurrentCompany, getSmartDefaultPeriod, formatDateWithSuffix, type CurrentCompany } from "@/lib/api";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { Plus, Trash2, Printer, FileText, Download, X } from "lucide-react";
import { 
    writeCalendarReportDisplayMode 
} from "@/lib/calendarMode";
import { openPrintWindow } from "@/lib/printReport";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

interface AvailableFunds {
    cash_and_bank: Record<string, { ledger_name: string; amount: number }[]>;
    receivables: { ledger_name: string; amount: number }[];
}

interface PayableFunds {
    payables: { ledger_name: string; amount: number }[];
    employee_payables: { ledger_name: string; amount: number }[];
}

interface FundManagementData {
    available_funds: AvailableFunds;
    payable_funds: PayableFunds;
}

interface ManualExpense {
    id: string;
    name: string;
    amount: number;
}

export default function FundManagementReportPage() {
    const params = useParams();
    const companyId = params?.companyId as string;
    const router = useRouter();
    const printRef = useRef<HTMLDivElement>(null);

    const [mounted, setMounted] = useState(false);

    // Initialize state immediately from localStorage to prevent "AD date with BS label" flicker
    const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
    const initialMode = initialCC?.calendar_mode || "AD";
    const { to: initialAsOn } = getSmartDefaultPeriod(initialMode, initialCC);

    const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(initialMode);
    const [asOnDate, setAsOnDate] = useState(initialAsOn);

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
            const { to } = getSmartDefaultPeriod(activeCo.calendar_mode as any, activeCo);
            setAsOnDate(to);
          }
        }
      }
    }, [mounted, dbCompany?.id, cc?.calendar_mode]);

    const [showReport, setShowReport] = useState(false);
    const [manualExpenses, setManualExpenses] = useState<ManualExpense[]>([]);
    const [manualReceivables, setManualReceivables] = useState<ManualExpense[]>([]);
    const [departmentFilter, setDepartmentFilter] = useState<string>("");
    const [projectFilter, setProjectFilter] = useState<string>("");
    const [downloadFormat, setDownloadFormat] = useState<"PDF" | "CSV" | "XLS">("PDF");

    const isBS = effectiveDisplayMode === "BS";
    const currentCompany = cc;
    const dateDisplayMode = effectiveDisplayMode;

    const { data: departments } = useSWR(
        companyId ? `/companies/${companyId}/departments` : null,
        fetcher
    );

    const { data: projects } = useSWR(
        companyId ? `/companies/${companyId}/projects` : null,
        fetcher
    );

    const { canRead } = useMenuAccess("reports.mis_fund_management");

    // Legacy effects replaced by immediate initialization and synced effect above

    const asOnDateAD = isBS ? safeBSToAD(asOnDate) || asOnDate : asOnDate;

    const reportUrl = useMemo(() => {
        if (!showReport || !companyId || !asOnDateAD) return null;
        let url = `/companies/${companyId}/reports/mis-fund-management?as_on_date=${asOnDateAD}`;
        if (departmentFilter) url += `&department_id=${departmentFilter}`;
        if (projectFilter) url += `&project_id=${projectFilter}`;
        return url;
    }, [showReport, companyId, asOnDateAD, departmentFilter, projectFilter]);

    const { data: reportData, error: reportError } = useSWR<FundManagementData>(reportUrl, fetcher);

    // Helper: get department/project label for display
    const selectedDeptName = useMemo(() => {
        if (!departmentFilter || !Array.isArray(departments)) return "";
        const d = departments.find((x: any) => String(x.id) === String(departmentFilter));
        return d ? d.name : "";
    }, [departmentFilter, departments]);

    const selectedProjName = useMemo(() => {
        if (!projectFilter || !Array.isArray(projects)) return "";
        const p = projects.find((x: any) => String(x.id) === String(projectFilter));
        return p ? p.name : "";
    }, [projectFilter, projects]);

    const reportSubtitle = useMemo(() => {
        const parts = [];
        if (selectedDeptName) parts.push(`Department: ${selectedDeptName}`);
        if (selectedProjName) parts.push(`Project: ${selectedProjName}`);
        return parts.join(" | ");
    }, [selectedDeptName, selectedProjName]);

    const formatNumber = (num: number) => {
        if (num === 0) return "–";
        return new Intl.NumberFormat("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(num);
    };

    const handleAddExpense = () => {
        setManualExpenses([...manualExpenses, { id: Math.random().toString(36).slice(2), name: "", amount: 0 }]);
    };

    const handleRemoveExpense = (id: string) => {
        setManualExpenses(manualExpenses.filter((e) => e.id !== id));
    };

    const handleUpdateExpenseName = (id: string, name: string) => {
        setManualExpenses(manualExpenses.map((e) => (e.id === id ? { ...e, name } : e)));
    };

    const handleUpdateExpenseAmount = (id: string, val: string) => {
        const amount = parseFloat(val) || 0;
        setManualExpenses(manualExpenses.map((e) => (e.id === id ? { ...e, amount } : e)));
    };

    const handleAddReceivable = () => {
        setManualReceivables([...manualReceivables, { id: Math.random().toString(36).slice(2), name: "", amount: 0 }]);
    };

    const handleRemoveReceivable = (id: string) => {
        setManualReceivables(manualReceivables.filter((e) => e.id !== id));
    };

    const handleUpdateReceivableName = (id: string, name: string) => {
        setManualReceivables(manualReceivables.map((e) => (e.id === id ? { ...e, name } : e)));
    };

    const handleUpdateReceivableAmount = (id: string, val: string) => {
        const amount = parseFloat(val) || 0;
        setManualReceivables(manualReceivables.map((e) => (e.id === id ? { ...e, amount } : e)));
    };

    const handleAsOnDateChange = (val: string) => {
        setAsOnDate(val);
    };

    const toNepaliDigits = (num: number | string) => {
        const nepaliDigits = ['०', '१', '२', '३', '४', '५', '६', '७', '८', '९'];
        return num.toString().replace(/\d/g, (d) => nepaliDigits[parseInt(d, 10)]);
    };

    const formatDateDisplay = (dateStr: string) => {
        if (!dateStr) return "";
        return formatDateWithSuffix(dateStr, effectiveDisplayMode);
    };

    const handleToday = () => {
        const { to } = getSmartDefaultPeriod(isBS ? "BS" : "AD");
        handleAsOnDateChange(to);
        setShowReport(true);
    };

    const handlePrint = () => {
        if (!showReport || !reportData) {
            alert("Please show the report first.");
            return;
        }

        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Fund Management Report",
            company: currentCompany?.name || "",
            period: asOnDate ? `As On ${asOnDate}` : "",
            orientation: "portrait",
        });
    };

    const handleExportCSV = () => {
        if (!showReport || !reportData) {
            alert("Please show the report first.");
            return;
        }

        const csvRows: string[] = [];
        csvRows.push(`Company: ${currentCompany?.name || ""}`);
        csvRows.push(`Fund Management Report`);
        if (reportSubtitle) csvRows.push(`${reportSubtitle}`);
        csvRows.push(`As On ${formatDateDisplay(asOnDate)}`);
        csvRows.push("");

        csvRows.push(`Category / Ledger,"Amount (As On ${formatDateDisplay(asOnDate)})"`);

        // Available
        csvRows.push(`"A. AVAILABLE FUNDS",`);
        Object.entries(reportData.available_funds?.cash_and_bank || {}).forEach(([group, ledgers]) => {
            csvRows.push(`"  ${group}",`);
            ledgers.forEach(l => {
                csvRows.push(`"    ${l.ledger_name}",${l.amount}`);
            });
        });
        (reportData.available_funds?.receivables || []).forEach(l => {
            csvRows.push(`"  Receivables: ${l.ledger_name}",${l.amount}`);
        });
        manualReceivables.forEach(e => {
            csvRows.push(`"  Targeted Receivable (Manual): ${e.name}",${e.amount}`);
        });
        csvRows.push(`"TOTAL AVAILABLE FUNDS (A)",${totalAvailable}`);
        csvRows.push("");

        // Payable
        csvRows.push(`"B. PAYABLE FUNDS",`);
        (reportData.payable_funds?.payables || []).forEach(l => {
            csvRows.push(`"  ${l.ledger_name}",${l.amount}`);
        });
        (reportData.payable_funds?.employee_payables || []).forEach(l => {
            csvRows.push(`"  Employee: ${l.ledger_name}",${l.amount}`);
        });
        manualExpenses.forEach(e => {
            csvRows.push(`"  Targeted Expense (Manual): ${e.name}",${e.amount}`);
        });
        csvRows.push(`"TOTAL PAYABLE FUNDS (B)",${totalPayable}`);
        csvRows.push("");

        csvRows.push(`"NET FUND STATUS (A – B)",${netFund}`);

        const csvContent = csvRows.join("\n");
        const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const ext = downloadFormat === "XLS" ? "xls" : "csv";
        a.download = `fund-management-report.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const totalAvailable = useMemo(() => {
        const cb = Object.values(reportData?.available_funds?.cash_and_bank || {})
            .flat()
            .reduce((s, l) => s + (l.amount || 0), 0);
        const rec = (reportData?.available_funds?.receivables || []).reduce((s, l) => s + (l.amount || 0), 0);
        const man = manualReceivables.reduce((s, e) => s + (e.amount || 0), 0);
        return cb + rec + man;
    }, [reportData, manualReceivables]);

    const totalPayable = useMemo(() => {
        const pay = (reportData?.payable_funds?.payables || []).reduce((s, l) => s + (l.amount || 0), 0);
        const emp = (reportData?.payable_funds?.employee_payables || []).reduce((s, l) => s + (l.amount || 0), 0);
        const man = manualExpenses.reduce((s, e) => s + (e.amount || 0), 0);
        return pay + emp + man;
    }, [reportData, manualExpenses]);

    const netFund = totalAvailable - totalPayable;

    const handleReset = () => {
        const { to } = getSmartDefaultPeriod(effectiveDisplayMode, currentCompany);
        setAsOnDate(to);
        setDepartmentFilter("");
        setProjectFilter("");
        setShowReport(false);
        setManualExpenses([]);
        setManualReceivables([]);
    };

    if (!canRead) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden">
                    <div className="h-[3px] w-full bg-gradient-to-r from-green-500 via-teal-500 to-blue-500" />
                    <div className="px-4 py-3">
                        <h1 className="text-sm font-bold text-slate-800">Fund Management Report</h1>
                        <p className="text-sm text-slate-600 mt-2">You do not have permission to view this report.</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden no-print">
                <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
                <div className="flex items-center justify-between px-4 py-2 hover:bg-slate-50/50 transition-colors">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-emerald-50 rounded-lg">
                            <FileText className="w-4 h-4 text-emerald-600" />
                        </div>
                        <div>
                            <h1 className="text-sm font-bold text-slate-800">Fund Management Report</h1>
                            <p className="text-[10px] text-slate-500">Point-in-time fund position analysis</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 print-hidden">
                        <button
                            onClick={() => router.back()}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all ml-1"
                            title="Back"
                        >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                            Back
                        </button>
                        <button
                            onClick={() => router.push(`/companies/${companyId}/reports`)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold shadow-sm transition-all ml-1"
                            title="Close"
                        >
                            <X className="w-3.5 h-3.5" /> Close
                        </button>
                    </div>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="rounded-2xl border border-slate-200 shadow-sm bg-slate-50/50 no-print">
                <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-200 bg-white rounded-t-2xl">
                    <div className="flex items-center gap-2">
                        <span className="p-1 bg-indigo-50 rounded text-indigo-600">
                            <Download className="w-3.5 h-3.5 rotate-180" />
                        </span>
                        <span className="text-slate-800 text-sm font-semibold italic">Report Filters</span>
                    </div>
                    <div className="flex items-center gap-2 ml-auto print-hidden">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
                        >
                            <Printer className="w-3.5 h-3.5" /> Print
                        </button>
                        <div className="flex items-center h-8">
                            <select
                                className="h-8 rounded-l-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 border-r-0"
                                value={downloadFormat}
                                onChange={(e) => setDownloadFormat(e.target.value as any)}
                            >
                                <option value="PDF">PDF</option>
                                <option value="XLS">Excel (.xls)</option>
                                <option value="CSV">Excel (.csv)</option>
                            </select>
                            <button
                                type="button"
                                onClick={() => downloadFormat === 'PDF' ? handlePrint() : handleExportCSV()}
                                className="h-8 rounded-r-lg px-3 text-xs font-semibold text-white transition-all shadow-sm bg-indigo-600 hover:bg-indigo-700"
                            >
                                ↓ Download
                            </button>
                        </div>
                    </div>
                </div>
                <div className="px-4 py-4">
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
                        <div>
                            <label className="block mb-1 text-xs font-medium text-slate-700">Date Display</label>
                            <select
                                className="border border-slate-200 rounded px-2 py-1 bg-white text-slate-900 text-xs h-9 w-full"
                                value={effectiveDisplayMode}
                                onChange={(e) => {
                                    if (!companyId) return;
                                    const next = e.target.value as "AD" | "BS";
                                    setEffectiveDisplayMode(next);
                                    writeCalendarReportDisplayMode(companyId, next);
                                }}
                            >
                                <option value="AD">AD</option>
                                <option value="BS">BS</option>
                            </select>
                        </div>

                        <div>
                            <label className="block mb-1 text-xs font-medium text-slate-700">As On Date ({effectiveDisplayMode})</label>
                            {effectiveDisplayMode === "BS" ? (
                                <NepaliDatePicker
                                    inputClassName="border border-slate-200 rounded px-2 py-1 text-xs h-9 bg-white text-slate-900 w-full"
                                    value={asOnDate}
                                    onChange={(v: string) => handleAsOnDateChange(v)}
                                    options={{ calenderLocale: "ne", valueLocale: "en" }}
                                    // @ts-ignore
                                    minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                                    // @ts-ignore
                                    maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                                />
                            ) : (
                                <Input forceNative type="date"
                                    className="border border-slate-200 rounded px-2 py-1 text-xs h-9 w-full"
                                    value={asOnDate}
                                    min={currentCompany?.fiscal_year_start || ""}
                                    max={currentCompany?.fiscal_year_end || ""}
                                    onChange={(e) => handleAsOnDateChange(e.target.value)}
                                />
                            )}
                        </div>

                        <div>
                            <label className="block mb-1 text-xs font-medium text-slate-600">Department Filter</label>
                            <Select
                                value={departmentFilter}
                                onChange={(e) => setDepartmentFilter(e.target.value)}
                                className="h-9 text-xs"
                            >
                                <option value="">All Departments</option>
                                {Array.isArray(departments) && departments.map((d: any) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </Select>
                        </div>

                        <div>
                            <label className="block mb-1 text-xs font-medium text-slate-600">Project Filter</label>
                            <Select
                                value={projectFilter}
                                onChange={(e) => setProjectFilter(e.target.value)}
                                className="h-9 text-xs"
                            >
                                <option value="">All Projects</option>
                                {Array.isArray(projects) && projects.map((p: any) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </Select>
                        </div>

                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowReport(true)}
                                className="flex-1 px-5 py-1 h-9 rounded-lg border border-emerald-300 text-white bg-emerald-600 hover:bg-emerald-700 text-xs font-bold shadow-sm transition-all active:scale-95 flex items-center justify-center gap-1.5"
                            >
                                <FileText className="w-3.5 h-3.5" /> SHOW
                            </button>
                            <button
                                onClick={handleToday}
                                className="px-3 py-1 h-9 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-medium shadow-sm transition-all"
                            >
                                Today
                            </button>
                            <button
                                onClick={handleReset}
                                className="px-3 py-1 h-9 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-medium shadow-sm transition-all"
                            >
                                Reset
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Report Table */}
            {showReport && (
                <div ref={printRef} className="rounded-2xl border border-slate-200 shadow-sm bg-white overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50">
                        <div className="flex flex-col gap-0.5">
                            <div className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Analysis Snapshot</div>
                            <div className="text-xs font-bold text-slate-700 flex items-center gap-2">
                                <span>{currentCompany?.name}</span>
                                <span className="text-slate-300">|</span>
                                <span className="text-indigo-600">Fund Position As On {formatDateDisplay(asOnDate)}</span>
                            </div>
                            {reportSubtitle && (
                                <div className="text-[x-small] text-slate-500 font-medium italic mt-0.5">
                                    {reportSubtitle}
                                </div>
                            )}
                        </div>
                    </div>

                    {reportError && (
                        <div className="p-4 text-red-600 text-sm">Error loading report: {reportError?.message || "Unknown error"}</div>
                    )}

                    {!reportData && !reportError && (
                        <div className="p-8 flex flex-col items-center justify-center gap-3">
                            <div className="w-8 h-8 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                            <div className="text-slate-500 text-xs font-medium">Crunching fund analytics...</div>
                        </div>
                    )}

                    {reportData && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0">
                                    <tr className="border-b border-slate-200">
                                        <th className="p-3 text-left font-bold text-slate-700 text-xs uppercase tracking-tight">Category / Ledger</th>
                                        <th className="p-3 text-right font-bold text-slate-700 text-xs uppercase tracking-tight min-w-[200px]">Amount (${formatDateDisplay(asOnDate)})</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {/* AVAILABLE FUNDS */}
                                    <tr className="bg-green-50/70 border-b border-green-100">
                                        <td colSpan={2} className="p-3 font-bold text-green-800 text-sm">
                                            A. AVAILABLE FUNDS
                                        </td>
                                    </tr>

                                    {/* Cash & Bank */}
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={2} className="py-1.5 pl-6 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">
                                            Cash & Bank Balances
                                        </td>
                                    </tr>
                                    {Object.entries(reportData.available_funds?.cash_and_bank || {}).map(([group, ledgers]) => (
                                        <React.Fragment key={group}>
                                            {ledgers.map((l, idx) => (
                                                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/30">
                                                    <td className="py-2.5 pl-10 text-slate-600 font-medium">
                                                        {l.ledger_name}
                                                        <span className="ml-2 text-[10px] text-slate-400 font-normal px-1.5 py-0.5 bg-slate-100 rounded">
                                                            {group}
                                                        </span>
                                                    </td>
                                                    <td className="py-2.5 pr-4 text-right font-mono text-slate-800 font-semibold">{formatNumber(l.amount)}</td>
                                                </tr>
                                            ))}
                                        </React.Fragment>
                                    ))}
                                    {Object.keys(reportData.available_funds?.cash_and_bank || {}).length === 0 && (
                                        <tr>
                                            <td colSpan={2} className="py-3 pl-10 text-slate-400 text-xs italic">
                                                No cash/bank balances found for selected filters
                                            </td>
                                        </tr>
                                    )}

                                    {/* Receivables */}
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={2} className="py-1.5 pl-6 font-semibold text-slate-500 text-[10px] uppercase tracking-wider border-t border-slate-100">
                                            Receivables (Sundry Debtors)
                                        </td>
                                    </tr>
                                    {(reportData.available_funds?.receivables || []).map((l, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/30">
                                            <td className="py-2.5 pl-10 text-slate-600 font-medium">{l.ledger_name}</td>
                                            <td className="py-2.5 pr-4 text-right font-mono text-slate-800 font-semibold">{formatNumber(l.amount)}</td>
                                        </tr>
                                    ))}
                                    {(reportData.available_funds?.receivables || []).length === 0 && (
                                        <tr>
                                            <td colSpan={2} className="py-3 pl-10 text-slate-400 text-xs italic">
                                                No receivables found for selected filters
                                            </td>
                                        </tr>
                                    )}

                                    {/* Manual / Targeted Receivables Section A */}
                                    <tr className="bg-purple-50/50 border-t border-purple-100 no-print">
                                        <td className="py-2 pl-6">
                                            <div className="flex items-center justify-between pr-4">
                                                <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Targeted Receivable Fund (Manual Input)</span>
                                                <button
                                                    onClick={handleAddReceivable}
                                                    className="flex items-center gap-1 text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm active:scale-95"
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> ADD RECEIVABLE LINE
                                                </button>
                                            </div>
                                        </td>
                                        <td />
                                    </tr>
                                    {manualReceivables.map((exp) => (
                                        <tr key={exp.id} className="border-b border-purple-100 bg-purple-50/20 no-print">
                                            <td className="py-2.5 pl-10">
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => handleRemoveReceivable(exp.id)} className="text-red-400 hover:text-red-600 flex-shrink-0 p-1 hover:bg-red-50 rounded transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <input
                                                        type="text"
                                                        placeholder="Receivable description..."
                                                        value={exp.name}
                                                        onChange={(e) => handleUpdateReceivableName(exp.id, e.target.value)}
                                                        className="border-b border-purple-200 bg-transparent text-sm w-full focus:outline-none focus:border-purple-500 placeholder:text-slate-400 font-medium text-slate-700"
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-4 text-right">
                                                <input
                                                     type="number"
                                                     placeholder="0.00"
                                                     value={exp.amount || ""}
                                                     onChange={(e) => handleUpdateReceivableAmount(exp.id, e.target.value)}
                                                     className="border-b border-purple-200 bg-transparent text-sm w-full text-right focus:outline-none focus:border-purple-500 font-mono font-semibold text-indigo-600"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Print View for Targeted Receivables */}
                                    {manualReceivables.map((exp) => (
                                        <tr key={`print-rec-${exp.id}`} className="border-b border-slate-100 hidden print-table-row">
                                            <td className="py-2.5 pl-10 text-slate-600 font-medium italic">
                                                Targeted Receivable: {exp.name || "Unnamed"}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono text-indigo-600 font-semibold">
                                                {formatNumber(exp.amount)}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Total Available */}
                                    <tr className="bg-green-100/50 border-t-2 border-green-300 border-b-2">
                                        <td className="p-3 pl-4 font-bold text-green-900">TOTAL AVAILABLE FUNDS (A)</td>
                                        <td className="p-3 pr-4 text-right font-bold font-mono text-green-900 text-base">{formatNumber(totalAvailable)}</td>
                                    </tr>

                                    <tr className="h-4" />

                                    {/* PAYABLE FUNDS */}
                                    <tr className="bg-red-50/70 border-b border-red-100">
                                        <td colSpan={2} className="p-3 font-bold text-red-800 text-sm">
                                            B. PAYABLE FUNDS
                                        </td>
                                    </tr>

                                    {/* Payables */}
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={2} className="py-1.5 pl-6 font-semibold text-slate-500 text-[10px] uppercase tracking-wider">
                                            Payables (Sundry Creditors)
                                        </td>
                                    </tr>
                                    {(reportData.payable_funds?.payables || []).map((l, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/30">
                                            <td className="py-2.5 pl-10 text-slate-600 font-medium">{l.ledger_name}</td>
                                            <td className="py-2.5 pr-4 text-right font-mono text-slate-800 font-semibold">{formatNumber(l.amount)}</td>
                                        </tr>
                                    ))}
                                    {(reportData.payable_funds?.payables || []).length === 0 && (
                                        <tr>
                                            <td colSpan={2} className="py-3 pl-10 text-slate-400 text-xs italic">
                                                No creditor payables found for selected filters
                                            </td>
                                        </tr>
                                    )}

                                    {/* Employee Payables */}
                                    <tr className="bg-slate-50/50">
                                        <td colSpan={2} className="py-1.5 pl-6 font-semibold text-slate-500 text-[10px] uppercase tracking-wider border-t border-slate-100">
                                            Employee Payables
                                        </td>
                                    </tr>
                                    {(reportData.payable_funds?.employee_payables || []).map((l, idx) => (
                                        <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/30">
                                            <td className="py-2.5 pl-10 text-slate-600 font-medium">{l.ledger_name}</td>
                                            <td className="py-2.5 pr-4 text-right font-mono text-slate-800 font-semibold">{formatNumber(l.amount)}</td>
                                        </tr>
                                    ))}
                                    {(reportData.payable_funds?.employee_payables || []).length === 0 && (
                                        <tr>
                                            <td colSpan={2} className="py-3 pl-10 text-slate-400 text-xs italic">
                                                No employee payables found for selected filters
                                            </td>
                                        </tr>
                                    )}

                                    {/* Manual / Targeted Expenses Section B */}
                                    <tr className="bg-purple-50/50 border-t border-purple-100 no-print">
                                        <td className="py-2 pl-6">
                                            <div className="flex items-center justify-between pr-4">
                                                <span className="font-semibold text-slate-500 text-[10px] uppercase tracking-wider">Targeted Expense Fund (Manual input)</span>
                                                <button
                                                    onClick={handleAddExpense}
                                                    className="flex items-center gap-1 text-purple-700 hover:text-purple-900 bg-purple-100 hover:bg-purple-200 px-2 py-1 rounded-md text-[10px] font-bold transition-all shadow-sm active:scale-95"
                                                >
                                                    <Plus className="w-3.5 h-3.5" /> ADD EXPENSE LINE
                                                </button>
                                            </div>
                                        </td>
                                        <td />
                                    </tr>
                                    {manualExpenses.map((exp) => (
                                        <tr key={exp.id} className="border-b border-purple-100 bg-purple-50/20 no-print">
                                            <td className="py-2.5 pl-10">
                                                <div className="flex items-center gap-3">
                                                    <button onClick={() => handleRemoveExpense(exp.id)} className="text-red-400 hover:text-red-600 flex-shrink-0 p-1 hover:bg-red-50 rounded transition-colors">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                    <input
                                                        type="text"
                                                        placeholder="Expense description..."
                                                        value={exp.name}
                                                        onChange={(e) => handleUpdateExpenseName(exp.id, e.target.value)}
                                                        className="border-b border-purple-200 bg-transparent text-sm w-full focus:outline-none focus:border-purple-500 placeholder:text-slate-400 font-medium text-slate-700"
                                                    />
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-4 text-right">
                                                <input
                                                     type="number"
                                                     placeholder="0.00"
                                                     value={exp.amount || ""}
                                                     onChange={(e) => handleUpdateExpenseAmount(exp.id, e.target.value)}
                                                     className="border-b border-purple-200 bg-transparent text-sm w-full text-right focus:outline-none focus:border-purple-500 font-mono font-semibold text-red-600"
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Print View for Targeted Expenses */}
                                    {manualExpenses.map((exp) => (
                                        <tr key={`print-exp-${exp.id}`} className="border-b border-slate-100 hidden print-table-row">
                                            <td className="py-2.5 pl-10 text-slate-600 font-medium italic">
                                                Targeted Expense: {exp.name || "Unnamed"}
                                            </td>
                                            <td className="py-2.5 pr-4 text-right font-mono text-red-600 font-semibold">
                                                {formatNumber(exp.amount)}
                                            </td>
                                        </tr>
                                    ))}

                                    {/* Total Payable */}
                                    <tr className="bg-red-100/50 border-t-2 border-red-300 border-b-2">
                                        <td className="p-3 pl-4 font-bold text-red-900">TOTAL PAYABLE FUNDS (B)</td>
                                        <td className="p-3 pr-4 text-right font-bold font-mono text-red-900 text-base">{formatNumber(totalPayable)}</td>
                                    </tr>

                                    <tr className="h-4" />

                                    {/* NET FUND STATUS */}
                                    <tr className={`border-t-4 shadow-sm ${netFund >= 0 ? "bg-emerald-50 border-emerald-500" : "bg-orange-50 border-orange-500"}`}>
                                        <td className="p-4 font-black text-slate-900 text-base tracking-tight italic uppercase">NET FUND STATUS (A – B)</td>
                                        <td className={`p-4 pr-4 text-right font-black font-mono text-xl ${netFund >= 0 ? "text-emerald-700 font-bold" : "text-orange-700 font-bold underline"}`}>
                                            {formatNumber(netFund)}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
            <style jsx>{`
                @media print {
                    .no-print { display: none !important; }
                    .print-table-row { display: table-row !important; }
                }
            `}</style>
        </div>
    );
}
