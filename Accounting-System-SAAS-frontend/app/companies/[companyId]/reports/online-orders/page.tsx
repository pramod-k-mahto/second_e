"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { openPrintWindow } from "@/lib/printReport";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import {
    CalendarDisplayMode,
    CalendarReportDisplayMode,
    readCalendarDisplayMode,
    readCalendarReportDisplayMode,
    writeCalendarReportDisplayMode,
    writeCalendarDisplayMode,
} from "@/lib/calendarMode";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import "nepali-datepicker-reactjs/dist/index.css";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const getPendingTime = (createdAt: string) => {
    const start = new Date(createdAt);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    if (diffMs < 0) return "0m";
    const diffMins = Math.floor(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
};

export default function OnlineOrdersReportPage() {
    const params = useParams();
    const router = useRouter();
    const companyId = params?.companyId as string;

    const { data: companyInfo } = useSWR<{ fiscal_year_start?: string }>(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );

    const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
    const startOfYearAD = useMemo(() => `${new Date().getFullYear()}-01-01`, []);
    const [fromDate, setFromDate] = useState(startOfYearAD);
    const [toDate, setToDate] = useState(todayStr);

    const [search, setSearch] = useState("");
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [notifying, setNotifying] = useState<number | null>(null);
    const printRef = useRef<HTMLDivElement>(null);

    const handlePrint = () => {
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Online Orders Report",
            period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
            orientation: "landscape",
        });
    };

    const handleManualNotify = async (order: any) => {
        if (!order.invoice_id) return;
        setNotifying(order.receipt_id);
        try {
            await api.post(`/companies/${companyId}/notifications/manual`, {
                type: order.package_status ? 'dispatch' : 'order_placed',
                id: order.package_status ? order.package_id : order.invoice_id
            });
            alert("Notification sent successfully!");
        } catch (err: any) {
            alert("Failed to send notification: " + (err.response?.data?.detail || "Unknown error"));
        } finally {
            setNotifying(null);
        }
    };

    const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: "AD" | "BS" }>(
        companyId ? `/companies/${companyId}/settings` : null,
        fetcher
    );
    const isBS = companySettings?.calendar_mode === "BS";

    // Sync dates with calendar mode once company settings are loaded
    useEffect(() => {
        if (isBS) {
            const bsToday = safeADToBS(todayStr);
            const bsStartOfYear = safeADToBS(startOfYearAD);
            
            if (fromDate === todayStr && bsToday) setFromDate(bsToday);
            else if (fromDate === startOfYearAD && bsStartOfYear) setFromDate(bsStartOfYear);
            
            if (toDate === todayStr && bsToday) setToDate(bsToday);
        }
    }, [isBS, todayStr, startOfYearAD]);

    const defaultDateDisplayMode: CalendarDisplayMode = isBS ? "BS" : "AD";
    const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(defaultDateDisplayMode);
    const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>(isBS ? "BS" : "AD");

    useEffect(() => {
        if (!companyId) return;
        const fallback: CalendarDisplayMode = isBS ? "BS" : "AD";
        const stored = readCalendarDisplayMode(companyId, fallback);
        setDateDisplayMode(stored);

        const reportFallback: CalendarReportDisplayMode = isBS ? "BS" : "AD";
        const reportStored = readCalendarReportDisplayMode(companyId, reportFallback);
        setReportDisplayMode(reportStored);
    }, [companyId, isBS]);

    const effectiveDisplayMode: CalendarReportDisplayMode =
        dateDisplayMode === "BOTH" ? reportDisplayMode : dateDisplayMode;

    // New Filters
    const [statusFilter, setStatusFilter] = useState("ALL");
    const [paymentFilter, setPaymentFilter] = useState("ALL");

    const { canRead } = useMenuAccess("reports.online_orders"); // we will default strictly to true if it does not exist

    const { data: report, error, isLoading } = useSWR(
        companyId && fromDate && toDate
            ? `/companies/${companyId}/reports/online-orders?from_date=${isBS ? safeBSToAD(fromDate) : fromDate}&to_date=${isBS ? safeBSToAD(toDate) : toDate}`
            : null,
        fetcher
    );

    const filteredOrders = useMemo(() => {
        if (!report?.orders) return [];

        let filtered = report.orders;

        // Apply Status Filter
        if (statusFilter !== "ALL") {
            filtered = filtered.filter((o: any) => o.order_status === statusFilter);
        }

        // Apply Payment Filter
        if (paymentFilter !== "ALL") {
            filtered = filtered.filter((o: any) => o.payment_status === paymentFilter);
        }

        // Apply Search Term Filter
        if (search) {
            const term = search.toLowerCase();
            filtered = filtered.filter((o: any) => {
                return (
                    o.order_id?.toString().includes(term) ||
                    o.reference?.toLowerCase().includes(term) ||
                    o.customer_name?.toLowerCase().includes(term) ||
                    o.phone?.toLowerCase().includes(term) ||
                    o.email?.toLowerCase().includes(term) ||
                    o.address?.toLowerCase().includes(term) ||
                    o.payment_status?.toLowerCase().includes(term) ||
                    o.package_status?.toLowerCase().includes(term) ||
                    o.transaction_id?.toLowerCase().includes(term)
                );
            });
        }

        return filtered;
    }, [report, search, statusFilter, paymentFilter]);

    if (!companyId) return null;

    if (!canRead) {
        return (
            <div className="space-y-4">
                <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
                    <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
                        <div className="flex items-center gap-4">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                                <svg className="w-6 h-6 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.001c-1.391 0-2.828.324-4.102 1.05A11.973 11.973 0 003.001 16.5m10.5-13.5v.001m-10.5 13.5h.001" />
                                </svg>
                            </div>
                            <div>
                                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Online Orders Report</h1>
                                <p className="text-xs text-slate-500 dark:text-slate-400 leading-tight">View website orders, payment and processing status</p>
                            </div>
                        </div>
                    </div>
                </div>
                <p className="text-sm text-slate-600">
                    You do not have permission to view the online orders report for this company.
                </p>
            </div>
        );
    }

    // Let's assume we allow reading this for anyone who has reports.read, if online orders isn't specifically mapped.
    // Actually, menu system handles this if it's there. 

    return (
        <div className="space-y-4 pb-10">
            {/* Header */}
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="h-[3px] w-full bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600" />
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between px-5 py-3">
                    <div className="flex items-center gap-4">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-950 border border-indigo-100 dark:border-indigo-900 shadow-sm transition-transform hover:scale-105">
                            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.001c-1.391 0-2.828.324-4.102 1.05A11.973 11.973 0 003.001 16.5m10.5-13.5v.001m-10.5 13.5h.001" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-black text-slate-800 dark:text-slate-100 tracking-tight leading-none uppercase">Online Orders</h1>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-bold uppercase tracking-wider">Live Order Management</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handlePrint}
                            className="no-print flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-black shadow-sm transition-all active:scale-95"
                        >
                            🖨 Print
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push('/dashboard')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-black shadow-sm transition-all active:scale-95"
                        >
                            <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                            EXIT
                        </button>
                    </div>
                </div>
            </div>

            <div ref={printRef} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4">
                <div className="flex flex-col gap-4">
                    {/* Aligned Filters Row */}
                    <div className="flex flex-wrap items-center gap-3 bg-slate-50/50 dark:bg-slate-800/30 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                        {/* Quick Toggle AD/BS */}
                        <div className="flex items-center gap-1 bg-white dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                            <button
                                onClick={() => { setDateDisplayMode('AD'); writeCalendarDisplayMode(companyId, 'AD'); }}
                                className={`px-2 py-1 rounded text-[10px] font-black transition-all ${dateDisplayMode === 'AD' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                            >AD</button>
                            <button
                                onClick={() => { setDateDisplayMode('BS'); writeCalendarDisplayMode(companyId, 'BS'); }}
                                className={`px-2 py-1 rounded text-[10px] font-black transition-all ${dateDisplayMode === 'BS' ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}
                            >BS</button>
                        </div>

                        {/* Integrated Date Inputs in one row */}
                        <div className="flex items-center gap-2">
                            {effectiveDisplayMode === "BS" ? (
                                <div className="flex items-center gap-2">
                                    <div className="w-28">
                                        <NepaliDatePicker
                                            inputClassName="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 w-full text-xs shadow-sm focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium h-[30px]"
                                            value={isBS ? fromDate : safeADToBS(fromDate) || ""}
                                            onChange={(val: string) => setFromDate(isBS ? val : safeBSToAD(val) || "")}
                                            options={{ calenderLocale: "en", valueLocale: "en" }}
                                        />
                                    </div>
                                    <span className="text-slate-400 font-bold text-xs">→</span>
                                    <div className="w-28">
                                        <NepaliDatePicker
                                            inputClassName="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 w-full text-xs shadow-sm focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium h-[30px]"
                                            value={isBS ? toDate : safeADToBS(toDate) || ""}
                                            onChange={(val: string) => setToDate(isBS ? val : safeBSToAD(val) || "")}
                                            options={{ calenderLocale: "en", valueLocale: "en" }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-xs shadow-sm focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium h-[30px]"
                                        value={isBS ? safeBSToAD(fromDate) || "" : fromDate}
                                        onChange={(e) => setFromDate(isBS ? safeADToBS(e.target.value) || "" : e.target.value)}
                                    />
                                    <span className="text-slate-400 font-bold text-xs">→</span>
                                    <input
                                        type="date"
                                        className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-900 text-xs shadow-sm focus:ring-2 focus:ring-indigo-500/10 transition-all font-medium h-[30px]"
                                        value={isBS ? safeBSToAD(toDate) || "" : toDate}
                                        onChange={(e) => setToDate(isBS ? safeADToBS(e.target.value) || "" : e.target.value)}
                                    />
                                </div>
                            )}
                        </div>

                        {/* Compact Preset Button */}
                        <button
                            type="button"
                            className="px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-300 text-[10px] font-black border border-slate-200 dark:border-slate-700 transition-all shadow-sm active:scale-95 h-[30px]"
                            onClick={() => {
                                let fiscalStart = "";
                                const todayBS = safeADToBS(todayStr) || "";
                                const parts = todayBS.split("-");
                                if (parts.length >= 2) {
                                    let currentBSYear = parseInt(parts[0], 10);
                                    const currentBSMonth = parseInt(parts[1], 10);
                                    if (currentBSMonth < 4) currentBSYear -= 1;
                                    const bsStart = `${currentBSYear}-04-01`;
                                    fiscalStart = isBS ? bsStart : safeBSToAD(bsStart) || "";
                                } else { fiscalStart = companyInfo?.fiscal_year_start || todayStr; }
                                setFromDate(fiscalStart); setToDate(isBS ? todayBS : todayStr);
                            }}
                        >
                            FISCAL YEAR
                        </button>

                        {/* Search aligned in same row */}
                        <div className="flex-1 min-w-[200px] relative">
                            <div className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none text-slate-400">
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                            </div>
                            <input
                                type="search"
                                placeholder="Search orders..."
                                className="border border-slate-200 dark:border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-xs w-full shadow-sm outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all bg-white dark:bg-slate-900 font-medium h-[30px]"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Compact Filter Options */}
                        <div className="flex items-center gap-2">
                            <select
                                className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[10px] font-black outline-none shadow-sm focus:ring-2 focus:ring-indigo-500/10 transition-all h-[30px]"
                                value={statusFilter}
                                onChange={(e) => setStatusFilter(e.target.value)}
                            >
                                <option value="ALL">All Status</option>
                                <option value="OPEN">Open</option>
                                <option value="CONVERTED">Converted</option>
                                <option value="COMPLETED">Completed</option>
                                <option value="CANCELLED">Cancelled</option>
                            </select>
                            <select
                                className="border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 text-[10px] font-black outline-none shadow-sm focus:ring-2 focus:ring-indigo-500/10 transition-all h-[30px]"
                                value={paymentFilter}
                                onChange={(e) => setPaymentFilter(e.target.value)}
                            >
                                <option value="ALL">All Payment</option>
                                <option value="Paid">Paid</option>
                                <option value="Pending Verification">Verifying</option>
                                <option value="Unpaid">Unpaid</option>
                                <option value="Failed">Failed</option>
                            </select>
                        </div>
                    </div>
                </div>


                {isLoading ? (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin" />
                        <p className="text-slate-500 font-black text-sm tracking-widest uppercase">Fetching Orders...</p>
                    </div>
                ) : error ? (
                    <div className="text-center py-12 text-rose-600 bg-rose-50 dark:bg-rose-950/20 rounded-2xl border border-rose-100 dark:border-rose-900/50 m-4">
                        <svg className="w-12 h-12 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                        <p className="font-bold">Failed to load online orders report.</p>
                        <p className="text-sm mt-1 opacity-70">Please check your connection and try again.</p>
                    </div>
                ) : filteredOrders.length === 0 ? (
                    <div className="text-center py-24 border-2 border-dashed border-slate-100 dark:border-slate-800 rounded-3xl m-4">
                        <div className="w-20 h-20 bg-slate-50 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6">
                            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                        </div>
                        <h3 className="text-slate-800 dark:text-slate-200 font-black text-lg">No orders found</h3>
                        <p className="text-slate-500 dark:text-slate-400 max-w-xs mx-auto mt-2 font-medium">Try adjusting your date range or filters to find what you&apos;re looking for.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto mt-2">
                        <table className="w-full text-left table-fixed border-separate border-spacing-0 min-w-[900px]">
                            <thead>
                                <tr className="text-slate-500 dark:text-slate-400 bg-slate-100/50 dark:bg-slate-800/50 uppercase text-[9px] font-black tracking-widest sticky top-0 z-20 backdrop-blur-md shadow-[0_1px_0_0_rgba(0,0,0,0.05)] text-center">
                                    <th className="py-2.5 px-4 w-[11%] text-left">Date / ID</th>
                                    <th className="py-2.5 px-2 w-[7%]">SO#</th>
                                    <th className="py-2.5 px-4 w-[24%] text-left">Customer</th>
                                    <th className="py-2.5 px-4 w-[12%] text-right">Amount</th>
                                    <th className="py-2.5 px-4 w-[12%] text-left">Payment</th>
                                    <th className="py-2.5 px-4 w-[10%]">Status</th>
                                    <th className="py-2.5 px-4 w-[24%] text-right">Package Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredOrders.map((o: any, idx: number) => (
                                    <tr key={o.receipt_id} className={`group transition-colors ${idx % 2 === 0 ? 'bg-white dark:bg-slate-900' : 'bg-slate-50/40 dark:bg-slate-800/20'} hover:bg-slate-100/60 dark:hover:bg-indigo-900/10`}>
                                        <td className="py-3 px-4 align-top">
                                            <div className="font-black text-slate-800 dark:text-slate-200 text-[11px]">
                                                {effectiveDisplayMode === "BS" ? (safeADToBS(o.date) || o.date) : o.date}
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-bold mt-1 uppercase flex items-center gap-1">
                                                <span className="bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">#{o.receipt_id}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-400 font-bold mt-1.5 flex items-center gap-1.5">
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                {new Date(o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </td>
                                        <td className="py-3 px-2 align-top text-center">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                                    router.push(`/companies/${companyId}/sales/orders/${o.order_id}?returnUrl=${returnUrl}`);
                                                }}
                                                className="px-2.5 py-1 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 text-[10px] font-black hover:bg-indigo-600 hover:text-white transition-all shadow-sm border border-indigo-100 dark:border-indigo-800/50"
                                            >
                                                SO-{o.order_id}
                                            </button>
                                        </td>
                                        <td className="py-3 px-4 align-top">
                                            <div className="font-black text-slate-900 dark:text-slate-100 text-[12px] leading-tight flex items-center gap-1.5 uppercase tracking-tight truncate max-w-[200px]" title={o.customer_name}>
                                                <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
                                                {o.customer_name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1.5 flex flex-col gap-1">
                                                <div className="flex items-center gap-1.5 font-bold">
                                                    <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                                                    {o.phone || 'N/A'}
                                                </div>
                                                {o.email && (
                                                    <div className="flex items-center gap-1.5 text-slate-400 font-bold truncate">
                                                        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                                                        {o.email}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 align-top text-right">
                                            <div className="font-black text-slate-900 dark:text-slate-50 text-[13px]">
                                                {o.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                            </div>
                                            <div className="text-[8px] text-slate-400 font-black uppercase tracking-widest mt-1 flex justify-end items-center gap-1">
                                                NPR
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 align-top">
                                            <div className="flex flex-col gap-2">
                                                <div className="text-[9px] font-black font-mono tracking-tighter text-slate-500 dark:text-slate-400 truncate max-w-[100px] bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded inline-block" title={o.transaction_id || ''}>
                                                    ID: {o.transaction_id || '-'}
                                                </div>
                                                {o.payment_screenshot && (
                                                    <button
                                                        type="button"
                                                        onClick={() => setPreviewImage(o.payment_screenshot)}
                                                        className="w-12 h-8 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden hover:scale-110 active:scale-90 transition-all shadow-sm bg-white dark:bg-slate-800 relative group/img"
                                                    >
                                                        <img src={o.payment_screenshot} className="w-full h-full object-cover grayscale group-hover/img:grayscale-0" />
                                                        <div className="absolute inset-0 bg-indigo-600/20 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                                            <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                                        </div>
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 align-top text-center border-r border-slate-100 dark:border-slate-800/50">
                                            <div className="flex flex-col items-center gap-1.5">
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border shadow-sm ${o.order_status === 'OPEN' ? 'bg-amber-50 text-amber-700 border-amber-200/50' : o.order_status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200/50' : 'bg-slate-50 text-slate-500 border-slate-200/50'}`}>
                                                    {o.order_status}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded text-[8px] font-black tracking-widest uppercase border shadow-sm ${o.payment_status === 'Paid' ? 'bg-indigo-50 text-indigo-700 border-indigo-200/50' : 'bg-rose-50 text-rose-700 border-rose-200/50'}`}>
                                                    {o.payment_status === 'Paid' ? 'PAID' : 'UNPAID'}
                                                </span>
                                                {o.order_status === 'OPEN' && (
                                                    <div className="text-[8px] font-black text-rose-600 mt-1 flex items-center gap-1.5 items-center w-full justify-center">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
                                                        {getPendingTime(o.created_at)}
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 align-top">
                                            <div className="flex flex-col items-end gap-2">
                                                {o.package_status ? (
                                                    <div className="flex flex-col items-end gap-1.5">
                                                        <span className={`text-[9px] font-black uppercase px-2.5 py-1 rounded-lg inline-flex items-center gap-1.5 border shadow-sm ${o.package_status === 'DELIVERED' ? 'bg-emerald-600 border-emerald-500 text-white' : o.package_status === 'DISPATCHED' ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-slate-900 border-slate-800 text-white'}`}>
                                                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                                                            {o.package_status}
                                                        </span>
                                                        {o.tracking_number && (
                                                            <div className="text-[8px] text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded font-bold tracking-tighter flex items-center gap-1">
                                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                                                                TRK: {o.tracking_number}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : o.invoice_id ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                                            router.push(`/companies/${companyId}/sales/invoices/${o.invoice_id}?dispatch=1&returnUrl=${returnUrl}`);
                                                        }}
                                                        className="group/btn flex items-center justify-center gap-1 h-8 w-28 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[9px] font-black shadow-sm transition-all active:scale-95 border border-indigo-500/20"
                                                    >
                                                        <svg className="w-3 h-3 group-hover/btn:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                                                        SHIP NOW
                                                    </button>
                                                ) : (
                                                    <div className="flex items-center gap-1 h-8 px-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-slate-400 italic text-[9px] font-black border border-slate-100 dark:border-slate-800 w-fit">
                                                        <svg className="w-2.5 h-2.5 opacity-40 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                                        NO INVOICE
                                                    </div>
                                                )}

                                                {o.invoice_id && (
                                                    <button
                                                        type="button"
                                                        disabled={notifying === o.receipt_id}
                                                        onClick={() => handleManualNotify(o)}
                                                        className={`flex items-center justify-center gap-1 h-8 w-28 rounded-lg border text-[9px] font-black transition-all active:scale-95 shadow-sm mt-1.5 ${notifying === o.receipt_id
                                                            ? 'bg-slate-50 border-slate-200 text-slate-400'
                                                            : 'bg-white dark:bg-slate-900 border-rose-200 dark:border-rose-900/40 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/20'
                                                            }`}
                                                    >
                                                        {notifying === o.receipt_id ? (
                                                            <div className="w-3 h-3 border-2 border-slate-300 border-t-slate-500 rounded-full animate-spin" />
                                                        ) : (
                                                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                                                        )}
                                                        {notifying === o.receipt_id ? 'NOTIFYING' : 'NOTIFY'}
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div >

            {/* Image Preview Modal */}
            {
                previewImage && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setPreviewImage(null)}>
                        <div className="bg-white dark:bg-slate-900 rounded-[2rem] overflow-hidden max-w-2xl w-full max-h-[90vh] flex flex-col items-center shadow-2xl border border-slate-200 dark:border-slate-800 relative scale-in-center animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
                            <div className="w-full flex justify-between items-center px-8 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <h3 className="font-black text-slate-800 dark:text-slate-100 text-lg uppercase tracking-wider">Payment Verification</h3>
                                <button
                                    type="button"
                                    className="w-10 h-10 flex items-center justify-center rounded-2xl hover:bg-rose-50 hover:text-rose-600 transition-all text-slate-400 active:scale-90"
                                    onClick={() => setPreviewImage(null)}
                                >
                                    <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                            </div>
                            <div className="p-8 overflow-auto max-h-full flex items-center justify-center bg-slate-100/30 dark:bg-black/20 w-full">
                                <img src={previewImage} alt="Payment Screenshot Preview" className="max-w-full rounded-2xl shadow-xl border-4 border-white dark:border-slate-800" />
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
}
