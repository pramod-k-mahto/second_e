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
import * as paymentModesApi from "@/lib/payment-modes";
import { openPrintWindow } from '@/lib/printReport';

const fetcher = (url: string) => api.get(url).then((res) => res.data);
const VOUCHER_TYPES = [
    { label: "Payment", value: "PAYMENT" },
    { label: "Receipt", value: "RECEIPT" },
    { label: "Contra", value: "CONTRA" },
    { label: "Journal", value: "JOURNAL" },
    { label: "Sales Invoice", value: "SALES_INVOICE" },
    { label: "Purchase Invoice", value: "PURCHASE_BILL" },
    { label: "Sales Return", value: "SALES_RETURN" },
    { label: "Purchase Return", value: "PURCHASE_RETURN" },
];

interface DaybookEntry {
    date: string;
    voucher_number: string;
    voucher_type: string;
    ledger_name: string;
    description: string;
    debit: number;
    credit: number;
    reference?: string;
    id: number;
}

export default function DaybookPage() {
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

    // Stable submission state to drive SWR
    const [submittedFromDate, setSubmittedFromDate] = useState("");
    const [submittedToDate, setSubmittedToDate] = useState("");

    const [departmentId, setDepartmentId] = useState("");
    const [projectId, setProjectId] = useState("");
    const [segmentId, setSegmentId] = useState("");
    const [paymentModeId, setPaymentModeId] = useState("");
    const [submittedDept, setSubmittedDept] = useState("");
    const [submittedProj, setSubmittedProj] = useState("");
    const [submittedSeg, setSubmittedSeg] = useState("");
    const [submittedPayMode, setSubmittedPayMode] = useState("");
    const [voucherType, setVoucherType] = useState("");
    const [submittedVoucherType, setSubmittedVoucherType] = useState("");

    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        setMounted(true);
    }, []);

    // Fetch latest company settings to ensure UI stays in sync with DB
    const { data: dbCompany } = useSWR<CurrentCompany>(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );

    const { data: departments } = useSWR(
        companyId ? `/companies/${companyId}/departments` : null,
        fetcher
    );

    const { data: projects } = useSWR(
        companyId ? `/companies/${companyId}/projects` : null,
        fetcher
    );

    const { data: segments } = useSWR(
        companyId ? `/companies/${companyId}/segments` : null,
        fetcher
    );
    
    const { data: paymentModes } = useSWR(
        companyId ? ["payment-modes", companyId] : null,
        () => paymentModesApi.list(companyId as string, { isActive: true })
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

                // Auto-trigger load if it hasn't been triggered yet
                if (initialWasFallback || !submittedFromDate) {
                    setSubmittedFromDate(nextMode === "BS" ? safeBSToAD(from) || from : from);
                    setSubmittedToDate(nextMode === "BS" ? safeBSToAD(to) || to : to);
                }
            }
        }
    }, [mounted, dbCompany?.id, dbCompany?.calendar_mode, dbCompany?.fiscal_year_start]);

    // Initial load trigger
    useEffect(() => {
        if (mounted && !submittedFromDate && fromDate && toDate) {
            const isBS = effectiveDisplayMode === "BS";
            setSubmittedFromDate(isBS ? safeBSToAD(fromDate) || fromDate : fromDate);
            setSubmittedToDate(isBS ? safeBSToAD(toDate) || toDate : toDate);
        }
    }, [mounted, fromDate, toDate, effectiveDisplayMode]);

    const { canRead } = useMenuAccess("reports.daybook");

    const handleShow = () => {
        const isBS = effectiveDisplayMode === "BS";
        setSubmittedFromDate(isBS ? safeBSToAD(fromDate) || fromDate : fromDate);
        setSubmittedToDate(isBS ? safeBSToAD(toDate) || toDate : toDate);
        setSubmittedDept(departmentId);
        setSubmittedProj(projectId);
        setSubmittedSeg(segmentId);
        setSubmittedPayMode(paymentModeId);
        setSubmittedVoucherType(voucherType);
    };

    const handleToday = () => {
        const { from, to } = getSmartDefaultPeriod(effectiveDisplayMode, cc);
        setFromDate(from);
        setToDate(to);
        const isBS = effectiveDisplayMode === "BS";
        setSubmittedFromDate(isBS ? safeBSToAD(from) || from : from);
        setSubmittedToDate(isBS ? safeBSToAD(to) || to : to);
        setSubmittedDept(departmentId);
        setSubmittedProj(projectId);
        setSubmittedSeg(segmentId);
        setSubmittedPayMode(paymentModeId);
        setSubmittedVoucherType(voucherType);
    };

    const reportUrl = useMemo(() => {
        if (!companyId || !submittedFromDate || !submittedToDate) return null;
        const p = new URLSearchParams({ from_date: submittedFromDate, to_date: submittedToDate });
        if (submittedDept) p.set("department_id", submittedDept);
        if (submittedProj) p.set("project_id", submittedProj);
        if (submittedSeg) p.set("segment_id", submittedSeg);
        if (submittedPayMode) p.set("payment_mode_id", submittedPayMode);
        if (submittedVoucherType) p.set("voucher_type", submittedVoucherType);
        return `/companies/${companyId}/reports/daybook?${p.toString()}`;
    }, [companyId, submittedFromDate, submittedToDate, submittedDept, submittedProj, submittedSeg, submittedPayMode, submittedVoucherType]);

    const { data: reportData, error: reportError, isLoading } = useSWR<{ vouchers: DaybookEntry[] }>(reportUrl, fetcher);

    const filteredData = useMemo(() => {
        if (!reportData?.vouchers) return [];
        const term = searchTerm.toLowerCase().trim();
        if (!term) return reportData.vouchers;
        return reportData.vouchers.filter(item => 
            item.ledger_name.toLowerCase().includes(term) ||
            item.voucher_number.toLowerCase().includes(term) ||
            item.description.toLowerCase().includes(term) ||
            item.voucher_type.toLowerCase().includes(term)
        );
    }, [reportData, searchTerm]);

    const totals = useMemo(() => {
        return filteredData.reduce((acc, curr) => ({
            debit: acc.debit + (curr.debit || 0),
            credit: acc.credit + (curr.credit || 0)
        }), { debit: 0, credit: 0 });
    }, [filteredData]);

    const handlePrint = () => {
        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Daybook Report",
            company: cc?.name || "",
            period: submittedFromDate && submittedToDate ? `Period: ${submittedFromDate} – ${submittedToDate}` : "",
            orientation: "portrait",
        });
    };

    if (!canRead) return <div className="p-8 text-center font-bold text-slate-500 uppercase tracking-widest">Access Denied</div>;

    const isBS_Effective = effectiveDisplayMode === "BS";

    return (
        <div className="flex flex-col gap-4 p-4 min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/40">
                         <svg className="w-5 h-5 text-orange-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>
                    </div>
                    <div>
                        <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Daybook</h1>
                        <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.1em]">Daily transaction journal</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => router.push(`/companies/${companyId}`)} className="px-3 py-1.5 text-xs font-semibold border rounded-lg hover:bg-slate-50 transition-colors bg-white dark:bg-slate-800 dark:border-slate-700">Back</button>
                    <button onClick={handlePrint} className="px-3 py-1.5 text-xs font-semibold bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-all shadow-md active:scale-95">🖨️ Print</button>
                    <button onClick={() => router.push(`/companies/${companyId}`)} className="px-3 py-1.5 text-xs font-semibold border border-rose-200 text-rose-600 rounded-lg hover:bg-rose-50 transition-colors bg-white dark:bg-slate-800 dark:border-rose-900 ml-2">Close</button>
                </div>
            </div>

            {/* Filter Panel */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
                <div className="flex flex-wrap items-end gap-6 justify-between">
                    <div className="flex flex-wrap items-end gap-4">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Date Mode</label>
                            <select value={effectiveDisplayMode} onChange={(e) => {
                                const next = e.target.value as "AD" | "BS";
                                setEffectiveDisplayMode(next);
                                writeCalendarReportDisplayMode(companyId, next);
                                const { from, to } = getSmartDefaultPeriod(next, cc);
                                setFromDate(from);
                                setToDate(to);
                            }} className="h-9 border border-indigo-500/30 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 shadow-sm border-t-2 border-t-indigo-500 outline-none w-32 font-bold text-indigo-700">
                                <option value="AD">AD (Gregorian)</option>
                                <option value="BS">BS (Bikram Sambat)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">From Date</label>
                            {isBS_Effective ? (
                                <NepaliDatePicker 
                                    inputClassName="h-9 w-32 border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-3 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 transition-all" 
                                    value={isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) > 2000 ? fromDate : safeADToBS(fromDate) || ""} 
                                    onChange={(val)=>setFromDate(val)} 
                                    options={{calenderLocale:'ne', valueLocale:'en'}} 
                                />
                            ) : (
                                <Input forceNative
                                    type="date" 
                                    className="h-9 w-40 border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-3 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 transition-all" 
                                    value={!isBS_Effective && fromDate.includes('-') && fromDate.split('-')[0].length === 4 && parseInt(fromDate.split('-')[0]) < 2000 ? fromDate : safeBSToAD(fromDate) || ""} 
                                    onChange={(e)=>setFromDate(e.target.value)} 
                                />
                            )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">To Date</label>
                            {isBS_Effective ? (
                                <NepaliDatePicker 
                                    inputClassName="h-9 w-32 border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-3 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 transition-all" 
                                    value={isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) > 2000 ? toDate : safeADToBS(toDate) || ""} 
                                    onChange={(val)=>setToDate(val)} 
                                    options={{calenderLocale:'ne', valueLocale:'en'}} 
                                />
                            ) : (
                                <Input forceNative
                                    type="date" 
                                    className="h-9 w-40 border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-3 bg-white dark:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 transition-all" 
                                    value={!isBS_Effective && toDate.includes('-') && toDate.split('-')[0].length === 4 && parseInt(toDate.split('-')[0]) < 2000 ? toDate : safeBSToAD(toDate) || ""} 
                                    onChange={(e)=>setToDate(e.target.value)} 
                                />
                            )}
                        </div>

                        <div className="flex items-center gap-2">
                             <button onClick={handleToday} className="h-9 px-4 text-xs font-bold text-slate-600 bg-slate-50 dark:bg-slate-800 border rounded-lg hover:bg-slate-100 transition-all">This Year</button>
                             <button onClick={handleShow} className="h-9 px-6 text-xs font-black text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-md transition-all active:scale-95">Load Data</button>
                        </div>
                    </div>

                    <div className="flex flex-col gap-1.5 w-full md:w-64">
                         <label className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Search Transactions</label>
                         <div className="relative">
                            <input 
                                type="text" 
                                placeholder="Search ledger, voucher, narration..." 
                                className="h-9 w-full border border-slate-200 dark:border-slate-700 rounded-lg text-xs pl-8 pr-3 bg-slate-50/50 dark:bg-slate-800 focus:ring-2 focus:ring-indigo-500/20 outline-none transition-all"
                                value={searchTerm}
                                onChange={(e)=>setSearchTerm(e.target.value)}
                            />
                            <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
                         </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-end gap-4 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 w-full sm:w-auto">
                        🏢 Cost Centers:
                    </div>
                    <div className="flex gap-4 flex-wrap">
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Department</label>
                            <select
                                className="h-8 w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-300"
                                value={departmentId}
                                onChange={(e) => setDepartmentId(e.target.value)}
                            >
                                <option value="">All</option>
                                {((departments || []) as any[]).map((d) => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Project</label>
                            <select
                                className="h-8 w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-300"
                                value={projectId}
                                onChange={(e) => setProjectId(e.target.value)}
                            >
                                <option value="">All</option>
                                {((projects || []) as any[]).map((p) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Segment</label>
                            <select
                                className="h-8 w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-300"
                                value={segmentId}
                                onChange={(e) => setSegmentId(e.target.value)}
                            >
                                <option value="">All</option>
                                {((segments || []) as any[]).map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Payment Mode</label>
                            <select
                                className="h-8 w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-300"
                                value={paymentModeId}
                                onChange={(e) => setPaymentModeId(e.target.value)}
                            >
                                <option value="">All</option>
                                <option value="0">Credit (None)</option>
                                {((paymentModes || []) as any[]).map((m) => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase">Voucher Type</label>
                            <select
                                className="h-8 w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] bg-slate-50 dark:bg-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-slate-700 dark:text-slate-300"
                                value={voucherType}
                                onChange={(e) => setVoucherType(e.target.value)}
                            >
                                <option value="">All</option>
                                {VOUCHER_TYPES.map((t) => (
                                    <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div ref={printRef} className="flex-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm min-h-[500px]">
                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-32 text-indigo-500 animate-pulse gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">Gathering journal entries...</p>
                    </div>
                ) : reportError ? (
                    <div className="p-20 text-center flex flex-col items-center gap-4">
                        <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-900/20 text-rose-500 flex items-center justify-center text-2xl font-bold">!</div>
                        <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Failed to load daybook entries. {reportError.message || ""}</p>
                        <button onClick={handleShow} className="text-xs text-indigo-600 hover:underline font-bold">Try Refreshing</button>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="p-32 text-center flex flex-col items-center gap-3 text-slate-400 opacity-60">
                        <div className="text-5xl">📖</div>
                        <p className="text-sm font-medium">No transactions match your current filters.</p>
                    </div>
                ) : (
                    <div className="flex flex-col h-full">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs border-collapse">
                                <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 z-10 border-b border-slate-200 dark:border-slate-700">
                                    <tr className="uppercase text-[9px] font-black text-slate-400 dark:text-slate-500 tracking-widest leading-none">
                                        <th className="p-3 text-left w-24">Date</th>
                                        <th className="p-3 text-left">Voucher Details</th>
                                        <th className="p-3 text-left">Ledger / Particulars</th>
                                        <th className="p-3 text-right w-28">Debit</th>
                                        <th className="p-3 text-right w-28 border-r border-slate-100 dark:border-slate-700/50">Credit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredData.map((item, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition-colors group">
                                            <td className="p-3 text-slate-500 font-medium tabular-nums align-top">
                                                 <FormattedDate date={item.date} mode={effectiveDisplayMode} className="text-slate-600 dark:text-slate-300 font-bold" />
                                            </td>
                                            <td className="p-3 align-top min-w-[150px]">
                                                <div className="font-black text-slate-900 dark:text-slate-100 uppercase text-[10px] tracking-tight">{item.voucher_type}</div>
                                                <div 
                                                    className="text-indigo-600 dark:text-indigo-400 font-bold mt-0.5 cursor-pointer hover:underline"
                                                    onClick={() => {
                                                        const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                                        router.push(`/companies/${companyId}/vouchers/${item.id}?returnUrl=${returnUrl}`);
                                                    }}
                                                >
                                                    {item.voucher_number}
                                                </div>
                                                {item.reference && <div className="text-[9px] text-slate-400 mt-1 italic">Ref: {item.reference}</div>}
                                            </td>
                                            <td className="p-3 align-top">
                                                <div className="font-bold text-slate-800 dark:text-slate-200">{item.ledger_name}</div>
                                                <div className="text-[10px] text-slate-500 mt-1 max-w-md italic whitespace-pre-wrap leading-relaxed">{item.description}</div>
                                            </td>
                                            <td className="p-3 text-right tabular-nums align-top font-bold text-slate-700 dark:text-slate-300">
                                                {item.debit > 0 ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.debit) : ""}
                                            </td>
                                            <td className="p-3 text-right tabular-nums align-top font-bold text-slate-700 dark:text-slate-300 border-r border-slate-50 dark:border-slate-800/50">
                                                {item.credit > 0 ? new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(item.credit) : ""}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot className="bg-slate-900 text-white font-black text-[11px] sticky bottom-0 z-10 uppercase tracking-widest shadow-[0_-4px_10px_rgba(0,0,0,0.1)]">
                                    <tr>
                                        <td className="p-4" colSpan={3}>Report Totals ({filteredData.length} records)</td>
                                        <td className="p-4 text-right border-l border-slate-800">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(totals.debit)}</td>
                                        <td className="p-4 text-right border-l border-slate-800">{new Intl.NumberFormat('en-US', { minimumFractionDigits: 2 }).format(totals.credit)}</td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
                <div>Generated: {new Date().toLocaleString()}</div>
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> SWR Ready</div>
                    <div className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> Fiscal {cc?.fiscal_year_start?.slice(0, 4)}</div>
                </div>
            </div>
        </div>
    );
}
