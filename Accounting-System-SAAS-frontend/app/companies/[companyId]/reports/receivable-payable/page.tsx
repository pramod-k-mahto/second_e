"use client";

import React, { useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useMenuAccess } from '@/components/MenuPermissionsContext';
import { PageHeader } from '@/components/ui/PageHeader';
import { ExportButtons } from '@/components/ui/ExportButtons';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { Modal } from '@/components/ui/Modal';
import { safeADToBS } from '@/lib/bsad';
import {
    CalendarDisplayMode,
    CalendarReportDisplayMode,
    readCalendarDisplayMode,
    readCalendarReportDisplayMode,
    writeCalendarReportDisplayMode,
} from '@/lib/calendarMode';
import { openPrintWindow } from '@/lib/printReport';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type PartyDueItem = {
    doc_type: string;
    doc_id: number;
    doc_number: string;
    date: string;
    reference: string | null;
    party_ledger_id: number;
    party_name: string;
    total_amount: number | null;
    paid_amount: number | null;
    outstanding_amount: number | null;
    currency: string | null;
};

export default function ReceivablePayableReportPage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();
    const companyId = params?.companyId as string;

    const initialType = searchParams?.get('type') as 'receivable' | 'payable' | null;
    const [reportType, setReportType] = useState<'receivable' | 'payable'>(initialType || 'receivable');
    const [viewMode, setViewMode] = useState<'summary' | 'details' | 'ageing'>('summary');
    const [partySearch, setPartySearch] = useState('');
    const [departmentId, setDepartmentId] = useState<string>('all');
    const [projectId, setProjectId] = useState<string>('all');
    const [segmentId, setSegmentId] = useState<string>('all');
    const [notifyingId, setNotifyingId] = useState<number | null>(null);
    const [notifyingPartyId, setNotifyingPartyId] = useState<number | null>(null);
    const [showPrintPreview, setShowPrintPreview] = useState(false);
    const printRef = useRef<HTMLDivElement | null>(null);

    // Printable component for professional document layout
    const PrintableReport = () => (
        <div className="print-report-container bg-white text-black font-sans origin-top overflow-visible">
            {/* Formal Stacked Header - Mirroring Balance Sheet standard */}
            <div className="mb-4">
                <div className="text-center py-2 border-b border-slate-200">
                    <h2 className="text-xl font-bold uppercase tracking-tight text-slate-900 leading-none">{currentCompany?.name}</h2>
                </div>
                {currentCompany?.address && (
                    <div className="text-center py-1 border-b border-slate-200 text-[11px] text-slate-600 font-medium">
                        {currentCompany.address}
                    </div>
                )}
                {currentCompany?.pan_number && (
                    <div className="text-center py-1 border-b border-slate-200 text-[10px] text-slate-500 font-bold">
                        PAN/VAT: {currentCompany.pan_number}
                    </div>
                )}
                <div className="text-left py-2 border-b-2 border-slate-800 mt-2 flex justify-between items-center">
                    <h1 className="text-sm font-black uppercase tracking-widest text-slate-800">
                        {reportType === 'receivable' ? "Statement of Accounts Receivable" : "Statement of Accounts Payable"}
                    </h1>
                    <span className="text-[9px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200 font-bold text-slate-500">
                        {viewMode.toUpperCase()} VIEW
                    </span>
                </div>

                <div className="flex justify-between items-center mt-2 px-1 text-[9px] font-bold text-slate-500 uppercase">
                    <div className="flex gap-4">
                        <p>Department: <span className="text-slate-900">{departmentId === 'all' ? 'All' : departments?.find((d: any) => String(d.id) === departmentId)?.name}</span></p>
                        <p>Project: <span className="text-slate-900">{projectId === 'all' ? 'All' : projects?.find((p: any) => String(p.id) === projectId)?.name}</span></p>
                        <p>Segment: <span className="text-slate-900">{segmentId === 'all' ? 'All' : segments?.find((s: any) => String(s.id) === segmentId)?.name}</span></p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <p>Print Date: <span className="text-slate-900">{new Date().toISOString().slice(0, 10)}</span></p>
                        <p>Print Time: <span className="text-slate-900">{new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}</span></p>
                    </div>
                </div>
            </div>

            {/* High-Contrast Data Table */}
            <div className="border border-slate-400 overflow-hidden">
                <table className="w-full text-[10px] border-collapse">
                    <thead>
                        <tr className="bg-slate-900 text-white border-b-2 border-slate-800">
                            {viewMode === 'details' ? (
                                <>
                                    <th className="border-r border-slate-700 p-2 text-left w-[80px]">Date</th>
                                    <th className="border-r border-slate-700 p-2 text-left w-[100px]">Bill No.</th>
                                    <th className="border-r border-slate-700 p-2 text-left w-[100px]">Reference</th>
                                    <th className="border-r border-slate-700 p-2 text-left">Party Name</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[90px]">Total</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[90px]">Paid</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[90px]">Due</th>
                                    <th className="p-2 text-center w-[60px]">Age</th>
                                </>
                            ) : (
                                <>
                                    <th className="border-r border-slate-700 p-2 text-left">Party Name</th>
                                    <th className="border-r border-slate-700 p-2 text-center w-[50px]">Inv</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[80px]">0-90 D</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[80px]">90-180 D</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[80px]">180-360 D</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[80px]">{">360 D"}</th>
                                    <th className="border-r border-slate-700 p-2 text-right w-[80px]">Not Due</th>
                                    <th className="p-2 text-right w-[100px]">Outstanding</th>
                                </>
                            )}
                        </tr>
                    </thead>
                    <tbody>
                        {viewMode === 'details' ? (
                            filteredData.map((item, idx) => {
                                const docDate = new Date(item.date);
                                const today = new Date();
                                const diffDays = Math.ceil((today.getTime() - docDate.getTime()) / (1000 * 60 * 60 * 24));
                                return (
                                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                        <td className="border border-slate-300 p-2 text-slate-600 font-medium">{displayDate(item.date)}</td>
                                        <td className="border border-slate-300 p-2 font-bold text-slate-900">{item.doc_number}</td>
                                        <td className="border border-slate-300 p-2 text-slate-500">{item.reference || '-'}</td>
                                        <td className="border border-slate-300 p-2 font-bold text-slate-800">{item.party_name}</td>
                                        <td className="border border-slate-300 p-2 text-right tabular-nums">{(item.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="border border-slate-300 p-2 text-right tabular-nums text-emerald-700">{(item.paid_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="border border-slate-300 p-2 text-right font-black tabular-nums border-l-2 border-l-slate-400">{(item.outstanding_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="border border-slate-300 p-2 text-center font-bold">{diffDays > 0 ? `${diffDays}d` : '-'}</td>
                                    </tr>
                                );
                            })
                        ) : (
                            summarizedData.map((item, idx) => (
                                <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                    <td className="border border-slate-300 p-2 font-bold text-slate-800">{item.party_name}</td>
                                    <td className="border border-slate-300 p-2 text-center tabular-nums">{item.doc_count}</td>
                                    <td className="border border-slate-300 p-2 text-right tabular-nums">{item.bracket_0_90 > 0 ? item.bracket_0_90.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                    <td className="border border-slate-300 p-2 text-right tabular-nums">{item.bracket_90_180 > 0 ? item.bracket_90_180.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                    <td className="border border-slate-300 p-2 text-right tabular-nums">{item.bracket_180_360 > 0 ? item.bracket_180_360.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                    <td className="border border-slate-300 p-2 text-right tabular-nums">{item.bracket_above_360 > 0 ? item.bracket_above_360.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                    <td className="border border-slate-300 p-2 text-right italic text-slate-400 tabular-nums">{item.not_due > 0 ? item.not_due.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}</td>
                                    <td className="border border-slate-300 p-2 text-right font-black tabular-nums text-slate-900 bg-slate-100/50">{(item.outstanding_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                </tr>
                            ))
                        )}
                    </tbody>
                    <tfoot className="bg-slate-200 border-t-2 border-slate-800 font-black">
                        {viewMode === 'details' ? (
                            <tr>
                                <td colSpan={4} className="p-2 text-right uppercase text-[9px] tracking-widest bg-slate-300">Total Outstanding (NPR)</td>
                                <td className="p-2 text-right tabular-nums border-l border-slate-400">{totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right tabular-nums border-l border-slate-400">{totals.paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right tabular-nums border-l-2 border-slate-900 bg-slate-900 text-white">{totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2"></td>
                            </tr>
                        ) : (
                            <tr>
                                <td colSpan={2} className="p-2 uppercase text-[9px] tracking-widest bg-slate-300">Consolidated Summary</td>
                                <td className="p-2 text-right tabular-nums border-l border-slate-400">{totals.b0_90.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right tabular-nums border-l border-slate-400">{totals.b90_180.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right tabular-nums border-l border-slate-400">{totals.b180_360.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right tabular-nums border-l border-slate-400">{totals.bAbove360.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right italic text-slate-500 tabular-nums border-l border-slate-400">{totals.notDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-2 text-right text-white bg-slate-900 tabular-nums">{totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                        )}
                    </tfoot>
                </table>
            </div>

            {/* Signature Blocks */}
            <div className="mt-16 grid grid-cols-3 gap-8">
                <div className="text-center">
                    <p className="mb-10 text-[11px] font-bold text-slate-400 italic">Signature</p>
                    <div className="h-px bg-slate-900 w-full mb-1"></div>
                    <p className="text-[10px] font-black uppercase text-slate-800">Prepared By</p>
                </div>
                <div className="text-center">
                    <p className="mb-10 text-[11px] font-bold text-slate-400 italic">Seal & Signature</p>
                    <div className="h-px bg-slate-900 w-full mb-1"></div>
                    <p className="text-[10px] font-black uppercase text-slate-800">Accountant</p>
                </div>
                <div className="text-center">
                    <p className="mb-10 text-[11px] font-bold text-slate-400 italic">Authorized Signature</p>
                    <div className="h-px bg-slate-900 w-full mb-1"></div>
                    <p className="text-[10px] font-black uppercase text-slate-800">Managing Director</p>
                </div>
            </div>
            
            <div className="mt-8 text-[8px] text-slate-500 text-center border-t pt-4 border-slate-200">
                This is a system-generated document. Electronic verification may be required for formal audits.
                <br />
                Page 1 of 1 | Printed by: {currentCompany?.contact_person || 'Authorized User'} | Software: Accounting System v2.0
            </div>
        </div>
    );

    const handleManualNotify = async (id: number) => {
        if (!companyId) return;
        setNotifyingId(id);
        try {
            await api.post(`/companies/${companyId}/notifications/manual`, {
                type: 'outstanding_balance',
                id: id
            });
            alert('Notification sent successfully!');
        } catch (err: any) {
            console.error(err);
            alert(err?.response?.data?.detail || 'Failed to send notification');
        } finally {
            setNotifyingId(null);
        }
    };

    const handlePartyNotify = async (partyLedgerId: number) => {
        if (!companyId) return;
        setNotifyingPartyId(partyLedgerId);
        try {
            // Find a customer or supplier linked to this ledger
            const entityType = reportType === 'receivable' ? 'customers' : 'suppliers';
            const res = await api.get(`/companies/${companyId}/${entityType}?ledger_id=${partyLedgerId}`);
            const entity = res.data?.[0];
            if (entity) {
                await api.post(`/companies/${companyId}/notifications/manual`, {
                    type: reportType === 'receivable' ? 'customer_statement' : 'supplier_statement',
                    id: entity.id
                });
                alert('Notification sent successfully!');
            } else {
                alert(`No linked ${reportType === 'receivable' ? 'customer' : 'supplier'} found for this ledger to send notification.`);
            }
        } catch (err: any) {
            console.error(err);
            alert(err?.response?.data?.detail || 'Failed to send notification');
        } finally {
            setNotifyingPartyId(null);
        }
    };


    React.useEffect(() => {
        if (initialType && (initialType === 'receivable' || initialType === 'payable')) {
            setReportType(initialType);
        }
    }, [initialType]);

    const { data: companySettings } = useSWR(
        companyId ? `/companies/${companyId}/settings` : null,
        fetcher
    );
    const isBS = companySettings?.calendar_mode === 'BS';
    const defaultDateDisplayMode: CalendarDisplayMode = isBS ? 'BS' : 'AD';
    const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(defaultDateDisplayMode);
    const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>(
        (isBS ? 'BS' : 'AD')
    );

    React.useEffect(() => {
        if (!companyId) return;
        const fallback: CalendarDisplayMode = isBS ? 'BS' : 'AD';
        const stored = readCalendarDisplayMode(companyId, fallback);
        setDateDisplayMode(stored);

        if (stored === 'BOTH') {
            const reportFallback: CalendarReportDisplayMode = isBS ? 'BS' : 'AD';
            const reportStored = readCalendarReportDisplayMode(companyId, reportFallback);
            setReportDisplayMode(reportStored);
        } else {
            setReportDisplayMode(stored);
        }
    }, [companyId, defaultDateDisplayMode, isBS]);

    const effectiveDisplayMode: CalendarReportDisplayMode =
        dateDisplayMode === 'BOTH' ? reportDisplayMode : dateDisplayMode;

    const { data: departments } = useSWR(companyId ? `/companies/${companyId}/departments` : null, fetcher);
    const { data: projects } = useSWR(companyId ? `/companies/${companyId}/projects` : null, fetcher);
    const { data: segments } = useSWR(companyId ? `/companies/${companyId}/segments` : null, fetcher);
    const { data: currentCompany } = useSWR(companyId ? `/companies/${companyId}` : null, fetcher);

    const displayDate = (d: string) => {
        if (!d) return '';
        if (effectiveDisplayMode === 'BS') {
            return safeADToBS(d) || d;
        }
        return d;
    };

    const { data: reportData, isLoading, error } = useSWR<PartyDueItem[]>(
        () => {
            if (!companyId) return null;
            const baseUrl = `/companies/${companyId}/reports/${reportType === 'receivable' ? 'receivables' : 'payables'}`;
            const params = new URLSearchParams();
            if (departmentId !== 'all') params.append('department_id', departmentId);
            if (projectId !== 'all') params.append('project_id', projectId);
            if (segmentId !== 'all') params.append('segment_id', segmentId);
            const query = params.toString();
            return query ? `${baseUrl}?${query}` : baseUrl;
        },
        fetcher
    );

    const filteredData = useMemo(() => {
        if (!reportData) return [];
        if (!partySearch) return reportData;
        const term = partySearch.toLowerCase();
        return reportData.filter(item =>
            item.party_name.toLowerCase().includes(term) ||
            item.doc_number.toLowerCase().includes(term) ||
            (item.reference && item.reference.toLowerCase().includes(term))
        );
    }, [reportData, partySearch]);

    const summarizedData = useMemo(() => {
        const today = new Date();
        const map = new Map<number, {
            party_name: string;
            party_ledger_id: number;
            total_amount: number;
            paid_amount: number;
            outstanding_amount: number;
            doc_count: number;
            bracket_0_90: number;
            bracket_90_180: number;
            bracket_180_360: number;
            bracket_above_360: number;
            not_due: number;
        }>();

        filteredData.forEach(item => {
            if (!map.has(item.party_ledger_id)) {
                map.set(item.party_ledger_id, {
                    party_name: item.party_name,
                    party_ledger_id: item.party_ledger_id,
                    total_amount: 0,
                    paid_amount: 0,
                    outstanding_amount: 0,
                    doc_count: 0,
                    bracket_0_90: 0,
                    bracket_90_180: 0,
                    bracket_180_360: 0,
                    bracket_above_360: 0,
                    not_due: 0
                });
            }
            const g = map.get(item.party_ledger_id)!;
            const outstanding = Number(item.outstanding_amount ?? 0);
            
            g.total_amount += Number(item.total_amount ?? 0);
            g.paid_amount += Number(item.paid_amount ?? 0);
            g.outstanding_amount += outstanding;
            g.doc_count += 1;

            if (outstanding > 0) {
                const docDate = new Date(item.date);
                const diffTime = today.getTime() - docDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                if (diffDays <= 0) {
                    g.not_due += outstanding;
                } else if (diffDays <= 90) {
                    g.bracket_0_90 += outstanding;
                } else if (diffDays <= 180) {
                    g.bracket_90_180 += outstanding;
                } else if (diffDays <= 360) {
                    g.bracket_180_360 += outstanding;
                } else {
                    g.bracket_above_360 += outstanding;
                }
            }
        });

        return Array.from(map.values()).sort((a, b) => b.outstanding_amount - a.outstanding_amount);
    }, [filteredData]);

    const totals = useMemo(() => {
        const base = filteredData.reduce((acc, curr) => ({
            total: acc.total + Number(curr.total_amount ?? 0),
            paid: acc.paid + Number(curr.paid_amount ?? 0),
            outstanding: acc.outstanding + Number(curr.outstanding_amount ?? 0)
        }), { total: 0, paid: 0, outstanding: 0 });

        const brackets = summarizedData.reduce((acc, curr) => ({
            b0_90: acc.b0_90 + curr.bracket_0_90,
            b90_180: acc.b90_180 + curr.bracket_90_180,
            b180_360: acc.b180_360 + curr.bracket_180_360,
            bAbove360: acc.bAbove360 + curr.bracket_above_360,
            notDue: acc.notDue + curr.not_due
        }), { b0_90: 0, b90_180: 0, b180_360: 0, bAbove360: 0, notDue: 0 });

        return { ...base, ...brackets };
    }, [filteredData, summarizedData]);

    const handleExportExcel = () => {
        if (!filteredData || filteredData.length === 0) return;

        const rows: string[][] = [];
        const reportTitle = `${reportType === 'receivable' ? 'Receivables' : 'Payables'} Report (${viewMode.toUpperCase()})`;
        
        // Header
        rows.push([reportTitle]);
        rows.push([`Date Generated: ${new Date().toLocaleDateString()}`]);
        rows.push([]);

        if (viewMode === 'details') {
            rows.push(['Date', 'Bill No.', 'Reference', 'Party Name', 'Total Amount', 'Paid', 'Outstanding', 'Age']);
            filteredData.forEach(item => {
                const docDate = new Date(item.date);
                const today = new Date();
                const diffTime = today.getTime() - docDate.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                const ageText = diffDays > 0 ? `${diffDays} days` : 'Not due';

                rows.push([
                    item.date,
                    item.doc_number,
                    item.reference || '',
                    item.party_name,
                    (item.total_amount ?? 0).toString(),
                    (item.paid_amount ?? 0).toString(),
                    (item.outstanding_amount ?? 0).toString(),
                    ageText
                ]);
            });
            rows.push(['', '', '', 'TOTAL', totals.total.toString(), totals.paid.toString(), totals.outstanding.toString(), '']);
        } else if (viewMode === 'summary') {
            rows.push(['Party Name', 'Invoices', '0-90 Days', '90-180 Days', '180-360 Days', '>360 Days', 'Not Due', 'Outstanding']);
            summarizedData.forEach(item => {
                rows.push([
                    item.party_name,
                    item.doc_count.toString(),
                    item.bracket_0_90.toString(),
                    item.bracket_90_180.toString(),
                    item.bracket_180_360.toString(),
                    item.bracket_above_360.toString(),
                    item.not_due.toString(),
                    item.outstanding_amount.toString()
                ]);
            });
            rows.push(['TOTAL', '', 
                totals.b0_90.toString(), 
                totals.b90_180.toString(), 
                totals.b180_360.toString(), 
                totals.bAbove360.toString(), 
                totals.notDue.toString(), 
                totals.outstanding.toString()
            ]);
        } else if (viewMode === 'ageing') {
            rows.push(['Party Name', '0-90 Days', '90-180 Days', '180-360 Days', '>360 Days', 'NOT DUE', 'TOTAL']);
            summarizedData.forEach(item => {
                rows.push([
                    item.party_name,
                    item.bracket_0_90.toString(),
                    item.bracket_90_180.toString(),
                    item.bracket_180_360.toString(),
                    item.bracket_above_360.toString(),
                    item.not_due.toString(),
                    item.outstanding_amount.toString()
                ]);
            });
            rows.push(['TOTAL', 
                totals.b0_90.toString(), 
                totals.b90_180.toString(), 
                totals.b180_360.toString(), 
                totals.bAbove360.toString(), 
                totals.notDue.toString(), 
                totals.outstanding.toString()
            ]);
        }

        const csvContent = rows.map(r => r.map(cell => `"${(cell || '').replace(/"/g, '""')}"`).join(",")).join("\n");
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `${reportType}_ageing_${viewMode}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handlePrint = () => {
        if (typeof window === "undefined") return;
        openPrintWindow({
            contentHtml: printRef.current?.innerHTML ?? "",
            title: "Receivable / Payable",
            company: currentCompany?.name || (company as any)?.name || "",
            period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
            orientation: "portrait",
        });
    };

    const handleExportPdf = () => {
        if (typeof window === 'undefined' || !printRef.current) return;
        
        const printContents = printRef.current.innerHTML;
        const originalHead = document.head.innerHTML;
        const win = window.open('', '_blank');
        if (!win) return;
        
        win.document.open();
        win.document.write(`
            <!doctype html>
            <html>
                <head>
                    ${originalHead}
                    <title>${reportType === 'receivable' ? 'Receivable' : 'Payable'} Statement - ${currentCompany?.name || 'Report'}</title>
                    <style>
                        @page { size: portrait; margin: 12mm; }
                        body { margin: 0; padding: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                        .no-print { display: none !important; }
                        table { width: 100% !important; border-collapse: collapse !important; }
                        th, td { border: 1px solid #e2e8f0 !important; padding: 6px 8px !important; font-size: 9px !important; line-height: 1.3 !important; }
                        th { background-color: #f8fafc !important; font-weight: 900 !important; color: #1e293b !important; }
                        .text-right { text-align: right !important; }
                        .text-center { text-align: center !important; }
                        .font-bold { font-weight: bold !important; }
                        .font-black { font-weight: 900 !important; }
                        tr { page-break-inside: avoid !important; }
                        thead { display: table-header-group !important; }
                        .print-report-container { width: 100% !important; padding: 0 !important; font-family: 'Inter', sans-serif !important; }
                    </style>
                </head>
                <body onload="window.print(); window.close();">
                    ${printContents}
                </body>
            </html>
        `);
        win.document.close();
    };

    if (!companyId) return null;

    return (
        <div className="space-y-6 max-w-[1600px] mx-auto min-h-screen pb-20">
            <PageHeader
                title={reportType === 'receivable' ? "Receivables Report" : "Payables Report"}
                subtitle={`Outstanding ${reportType === 'receivable' ? 'amounts from customers' : 'dues to suppliers'}`}
                actions={
                    <div className="flex items-center gap-3">
                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                            <button
                                onClick={() => setReportType('receivable')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'receivable'
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                Receivables
                            </button>
                            <button
                                onClick={() => setReportType('payable')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${reportType === 'payable'
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                Payables
                            </button>
                        </div>

                        <div className="flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-inner">
                            <button
                                onClick={() => setViewMode('ageing')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'ageing'
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                Ageing
                            </button>
                            <button
                                onClick={() => setViewMode('summary')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'summary'
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                Summary
                            </button>
                            <button
                                onClick={() => setViewMode('details')}
                                className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${viewMode === 'details'
                                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm ring-1 ring-black/5'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                Details
                            </button>
                        </div>
                        <ExportButtons 
                            onExportExcel={handleExportExcel} 
                            onExportPdf={handleExportPdf}
                            onPrint={() => setShowPrintPreview(true)}
                        />
                        <button
                            onClick={() => router.back()}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-600 hover:text-rose-800 dark:text-rose-400 dark:hover:text-rose-200 flex items-center gap-1 bg-rose-50 dark:bg-rose-900/10 border border-rose-100 dark:border-rose-800 rounded-lg shadow-sm transition-all hover:scale-105 active:scale-95"
                        >
                            <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                            Close
                        </button>
                    </div>
                }
            />

            {/* Filter Card */}
            <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm flex flex-wrap gap-4 items-center no-print">
                <div className="flex-1 min-w-[300px] relative group">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-indigo-500 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                    <input
                        type="text"
                        placeholder="Search by party name, bill no or reference..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-white dark:hover:bg-slate-900 focus:bg-white dark:focus:bg-slate-950 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all outline-none"
                        value={partySearch}
                        onChange={(e) => setPartySearch(e.target.value)}
                    />
                </div>
                <div className="text-xs text-slate-500 font-medium whitespace-nowrap px-3 py-1.5 bg-slate-100 dark:bg-slate-800 rounded-full border border-slate-200 dark:border-slate-700 shadow-inner">
                    Total Found: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{filteredData.length}</span> entries
                </div>

                <div className="flex gap-4 items-center">
                    <div className="w-[140px] space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Date Display</label>
                        <select
                            className="h-10 w-full appearance-none rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-sm disabled:opacity-50"
                            value={effectiveDisplayMode}
                            onChange={(e) => {
                                if (!companyId) return;
                                if (dateDisplayMode !== 'BOTH') return;
                                const next = e.target.value as CalendarReportDisplayMode;
                                setReportDisplayMode(next);
                                writeCalendarReportDisplayMode(companyId, next);
                            }}
                            disabled={dateDisplayMode !== 'BOTH'}
                        >
                            {dateDisplayMode === 'BOTH' ? (
                                <>
                                    <option value="AD">AD (Gregorian)</option>
                                    <option value="BS">BS (Nepali)</option>
                                </>
                            ) : (
                                <option value={effectiveDisplayMode}>{effectiveDisplayMode}</option>
                            )}
                        </select>
                    </div>
                    <div className="w-[180px] space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Department</label>
                        <SearchableSelect
                            placeholder="All Departments"
                            options={[
                                { value: 'all', label: 'All Departments' },
                                ...(departments?.map((d: any) => ({ value: String(d.id), label: d.name })) || [])
                            ]}
                            value={departmentId}
                            onChange={(val) => setDepartmentId(val)}
                        />
                    </div>
                    <div className="w-[180px] space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Project</label>
                        <SearchableSelect
                            placeholder="All Projects"
                            options={[
                                { value: 'all', label: 'All Projects' },
                                ...(projects?.map((p: any) => ({ value: String(p.id), label: p.name })) || [])
                            ]}
                            value={projectId}
                            onChange={(val) => setProjectId(val)}
                        />
                    </div>
                    <div className="w-[180px] space-y-1">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Segment</label>
                        <SearchableSelect
                            placeholder="All Segments"
                            options={[
                                { value: 'all', label: 'All Segments' },
                                ...(segments?.map((s: any) => ({ value: String(s.id), label: s.name })) || [])
                            ]}
                            value={segmentId}
                            onChange={(val) => setSegmentId(val)}
                        />
                    </div>
                </div>
            </div>

            <div ref={printRef} className="space-y-6">
                {/* Main Table Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                {isLoading ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-20 gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm font-medium text-slate-500 animate-pulse">Fetching outstanding data...</p>
                    </div>
                ) : error ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                        <div className="w-16 h-16 bg-rose-50 dark:bg-rose-900/20 rounded-2xl flex items-center justify-center text-rose-500 text-3xl mb-4">⚠️</div>
                        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 italic">Oops! Something went wrong</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-md mx-auto">
                            {(error as any)?.response?.data?.detail || "Failed to load the report data. Please try again later."}
                        </p>
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-600/20 hover:shadow-indigo-600/40 transition-all active:scale-95"
                        >
                            Retry Now
                        </button>
                    </div>
                ) : filteredData.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center p-20 text-center">
                        <div className="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/20 rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-sm">✨</div>
                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">All Settled!</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 max-w-sm mx-auto leading-relaxed">
                            No outstanding {reportType}s found matching your criteria. Great job on keeping the books clean!
                        </p>
                    </div>
                ) : (
                    <div className="flex-1 overflow-auto">
                        <Table className="min-w-[1000px]">
                            {viewMode === 'details' ? (
                                <>
                                    <THead className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                                        <TR>
                                            <TH className="py-4 border-none text-slate-600 dark:text-slate-300">Date</TH>
                                            <TH className="py-4 border-none text-slate-600 dark:text-slate-300">Bill No.</TH>
                                            <TH className="py-4 border-none text-slate-600 dark:text-slate-300">Reference</TH>
                                            <TH className="py-4 border-none text-slate-600 dark:text-slate-300">Party Name</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">Total Amount</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">Paid</TH>
                                            <TH className="py-4 border-none text-right text-indigo-600 dark:text-indigo-400 font-bold">Outstanding</TH>
                                            <TH className="py-4 border-none text-center text-slate-600 dark:text-slate-300">Age</TH>
                                            <TH className="py-4 border-none text-center text-slate-600 dark:text-slate-300 no-print">Action</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {filteredData.map((item, idx) => {
                                            const docDate = new Date(item.date);
                                            const today = new Date();
                                            const diffTime = today.getTime() - docDate.getTime();
                                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                                            
                                            return (
                                                <TR key={`${item.doc_type}-${item.doc_id}-${idx}`} className="group transition-all">
                                                <TD className="py-3 border-slate-200 dark:border-slate-800/40">
                                                        <span className="font-medium">{displayDate(item.date)}</span>
                                                    </TD>
                                                    <TD className="py-3 border-slate-100 dark:border-slate-800/40 font-bold text-indigo-600 dark:text-indigo-400">
                                                        {item.doc_number}
                                                    </TD>
                                                    <TD className="py-3 border-slate-100 dark:border-slate-800/40 text-slate-500 italic">
                                                        {item.reference || '-'}
                                                    </TD>
                                                    <TD className="py-3 border-slate-100 dark:border-slate-800/40 group-hover:pl-4 transition-all duration-300">
                                                        <span 
                                                            className="font-bold text-slate-800 dark:text-slate-200 block truncate max-w-md cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline decoration-2 underline-offset-4 transition-all"
                                                            onClick={() => router.push(`/companies/${companyId}/reports/ledger?ledger_id=${item.party_ledger_id}`)}
                                                        >
                                                            {item.party_name}
                                                        </span>
                                                    </TD>
                                                    <TD className="py-3 text-right border-slate-100 dark:border-slate-800/40 font-bold text-slate-900 dark:text-slate-100">
                                                        {Number(item.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </TD>
                                                    <TD className="py-3 text-right border-slate-100 dark:border-slate-800/40 text-emerald-600 dark:text-emerald-400 font-bold">
                                                        {Number(item.paid_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                    </TD>
                                                    <TD className="py-3 text-right border-slate-100 dark:border-slate-800/40 font-heavy text-slate-900 dark:text-slate-50 relative group/cell">
                                                        <div className="inline-flex flex-col items-end">
                                                            <span className="text-sm font-black tracking-tight">{Number(item.outstanding_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                            <div className="w-full h-[1.5px] bg-indigo-500/20 mt-0.5 rounded-full" />
                                                        </div>
                                                    </TD>
                                                    <TD className="py-3 text-center border-slate-100 dark:border-slate-800/40">
                                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${diffDays > 0 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                            {diffDays > 0 ? `${diffDays} days` : 'Not due'}
                                                        </span>
                                                    </TD>
                                                    <TD className="py-3 text-center border-slate-100 dark:border-slate-800/40 no-print">
                                                        <button
                                                            onClick={() => handleManualNotify(item.doc_id)}
                                                            disabled={notifyingId === item.doc_id}
                                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 text-[10px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-sm transition-all disabled:opacity-50"
                                                        >
                                                            {notifyingId === item.doc_id ? (
                                                                <span className="inline-flex h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                                                            ) : (
                                                                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                                                            )}
                                                            SEND NOTIFY
                                                        </button>
                                                    </TD>
                                                </TR>
                                            );
                                        })}
                                    </TBody>
                                </>
                            ) : viewMode === 'summary' ? (
                                <>
                                    <THead className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                                        <TR>
                                            <TH className="py-4 border-none text-slate-600 dark:text-slate-300">Party Name</TH>
                                            <TH className="py-4 border-none text-center text-slate-600 dark:text-slate-300">Invoices</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">Total Amount</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">Paid</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300 text-indigo-500">0-90 D</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300 text-indigo-500">90-180 D</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300 text-indigo-500">180-360 D</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300 text-indigo-500">&gt;360 D</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300 italic text-slate-400">Not Due</TH>
                                            <TH className="py-4 border-none text-right text-indigo-600 dark:text-indigo-400 font-bold">Outstanding</TH>
                                            <TH className="py-4 border-none text-center text-slate-600 dark:text-slate-300 no-print">Action</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {summarizedData.map((item, idx) => (
                                            <TR key={`${item.party_ledger_id}-${idx}`} className="group transition-all">
                                                <TD className="py-4 border-slate-200 dark:border-slate-800/40">
                                                    <span 
                                                        className="font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline decoration-2 underline-offset-4 transition-all"
                                                        onClick={() => router.push(`/companies/${companyId}/reports/ledger?ledger_id=${item.party_ledger_id}`)}
                                                    >
                                                        {item.party_name}
                                                    </span>
                                                </TD>
                                                <TD className="py-4 text-center border-slate-100 dark:border-slate-800/40">
                                                    <span className="inline-flex px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
                                                        {item.doc_count}
                                                    </span>
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-bold text-slate-900 dark:text-slate-100">
                                                    {Number(item.total_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 text-emerald-600 dark:text-emerald-400 font-bold">
                                                    {Number(item.paid_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 text-[11px] font-medium text-slate-600">
                                                    {item.bracket_0_90 > 0 ? item.bracket_0_90.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 text-[11px] font-medium text-slate-600">
                                                    {item.bracket_90_180 > 0 ? item.bracket_90_180.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 text-[11px] font-medium text-slate-600">
                                                    {item.bracket_180_360 > 0 ? item.bracket_180_360.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 text-[11px] font-medium text-slate-600">
                                                    {item.bracket_above_360 > 0 ? item.bracket_above_360.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 text-[11px] font-medium italic text-slate-400">
                                                    {item.not_due > 0 ? item.not_due.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-heavy text-slate-900 dark:text-slate-50">
                                                    <div className="inline-flex flex-col items-end">
                                                        <span className="text-sm font-black tracking-tight">{Number(item.outstanding_amount ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                                                        <div className="w-full h-[1.5px] bg-indigo-500/20 mt-0.5 rounded-full" />
                                                    </div>
                                                </TD>
                                                <TD className="py-4 text-center border-slate-100 dark:border-slate-800/40 no-print">
                                                    <button
                                                        onClick={() => handlePartyNotify(item.party_ledger_id)}
                                                        disabled={notifyingPartyId === item.party_ledger_id}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 text-[11px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        {notifyingPartyId === item.party_ledger_id ? (
                                                            <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                                                        ) : (
                                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                                                        )}
                                                        SEND STATEMENT
                                                    </button>
                                                </TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </>
                            ) : (
                                <>
                                    <THead className="bg-slate-50/80 dark:bg-slate-800/80 backdrop-blur-sm border-b border-slate-200 dark:border-slate-700">
                                        <TR>
                                            <TH className="py-4 border-none text-slate-600 dark:text-slate-300">Party Name</TH>
                                            <TH className="py-4 border-none text-center text-slate-600 dark:text-slate-300">Invoices</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">0-90 Days</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">90-180 Days</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">180-360 Days</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">&gt;360 Days</TH>
                                            <TH className="py-4 border-none text-right text-slate-600 dark:text-slate-300">Not Due</TH>
                                            <TH className="py-4 border-none text-right text-indigo-600 dark:text-indigo-400 font-bold">Total</TH>
                                            <TH className="py-4 border-none text-center text-slate-600 dark:text-slate-300 no-print">Action</TH>
                                        </TR>
                                    </THead>
                                    <TBody>
                                        {summarizedData.map((item, idx) => (
                                            <TR key={`${item.party_ledger_id}-${idx}`} className="group transition-all">
                                                <TD className="py-4 border-slate-200 dark:border-slate-800/40">
                                                    <span 
                                                        className="font-bold text-slate-800 dark:text-slate-200 cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline decoration-2 underline-offset-4 transition-all"
                                                        onClick={() => router.push(`/companies/${companyId}/reports/ledger?ledger_id=${item.party_ledger_id}`)}
                                                    >
                                                        {item.party_name}
                                                    </span>
                                                </TD>
                                                <TD className="py-4 text-center border-slate-100 dark:border-slate-800/40 no-print">
                                                    <span className="inline-flex px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-bold text-slate-500">
                                                        {item.doc_count}
                                                    </span>
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-medium">
                                                    {item.bracket_0_90 > 0 ? item.bracket_0_90.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-medium">
                                                    {item.bracket_90_180 > 0 ? item.bracket_90_180.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-medium">
                                                    {item.bracket_180_360 > 0 ? item.bracket_180_360.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-medium">
                                                    {item.bracket_above_360 > 0 ? item.bracket_above_360.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-medium italic text-slate-400">
                                                    {item.not_due > 0 ? item.not_due.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                                                </TD>
                                                <TD className="py-4 text-right border-slate-100 dark:border-slate-800/40 font-black text-indigo-600 dark:text-indigo-400">
                                                    {item.outstanding_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                </TD>
                                                <TD className="py-4 text-center border-slate-100 dark:border-slate-800/40 no-print">
                                                    <button
                                                        onClick={() => handlePartyNotify(item.party_ledger_id)}
                                                        disabled={notifyingPartyId === item.party_ledger_id}
                                                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 text-[11px] font-bold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 shadow-sm transition-all active:scale-95 disabled:opacity-50"
                                                    >
                                                        {notifyingPartyId === item.party_ledger_id ? (
                                                            <span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
                                                        ) : (
                                                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                                                        )}
                                                        SEND STATEMENT
                                                    </button>
                                                </TD>
                                            </TR>
                                        ))}
                                    </TBody>
                                </>
                            )}
                            <THead className="sticky bottom-0 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white shadow-[0_-5px_20px_rgba(0,0,0,0.05)] border-t-2 border-slate-300 dark:border-slate-600 font-black">
                                <TR>
                                    <TH colSpan={viewMode === 'details' ? 4 : 2} className="py-5 text-lg border-none font-black tracking-widest uppercase text-slate-800 dark:text-slate-100">Total Summary</TH>
                                    {viewMode === 'details' ? (
                                        <>
                                            <TH className="py-5 text-right text-xl border-none font-black text-slate-900 dark:text-white">{totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-xl border-none text-emerald-700 dark:text-emerald-400 font-black">{totals.paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-2xl border-none text-indigo-700 dark:text-indigo-400 font-black">{totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 border-none"></TH>
                                            <TH className="py-5 border-none"></TH>
                                        </>
                                    ) : viewMode === 'summary' ? (
                                        <>
                                            <TH className="py-5 text-right text-lg border-none font-black">{totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-lg border-none font-black text-emerald-700 dark:text-emerald-400">{totals.paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-sm border-none font-black text-slate-500">{totals.b0_90.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-sm border-none font-black text-slate-500">{totals.b90_180.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-sm border-none font-black text-slate-500">{totals.b180_360.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-sm border-none font-black text-slate-500">{totals.bAbove360.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-sm border-none font-black italic text-slate-400">{totals.notDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-xl border-none text-indigo-700 dark:text-indigo-400 font-black">{totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 border-none"></TH>
                                        </>
                                    ) : (
                                        <>
                                            <TH className="py-5 text-right text-lg border-none font-black">{totals.b0_90.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-lg border-none font-black">{totals.b90_180.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-lg border-none font-black">{totals.b180_360.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-lg border-none font-black">{totals.bAbove360.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-lg border-none font-black italic text-slate-400">{totals.notDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 text-right text-xl border-none text-indigo-700 dark:text-indigo-400 font-black">{totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</TH>
                                            <TH className="py-5 border-none"></TH>
                                        </>
                                    )}
                                </TR>
                            </THead>
                        </Table>
                    </div>
                )}
            </div>

            {/* Stats Cards */}
            {!isLoading && !error && filteredData.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 stats-grid-preview">
                    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm flex flex-col gap-1 relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-indigo-100/40 dark:bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Net Total Document Amount</span>
                        <span className="text-3xl font-black tabular-nums text-slate-800 dark:text-slate-100">{totals.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm flex flex-col gap-1 relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-emerald-100/40 dark:bg-emerald-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Total Realized/Paid Amount</span>
                        <span className="text-3xl font-black tabular-nums text-emerald-700 dark:text-emerald-400">{totals.paid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="p-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-sm flex flex-col gap-1 relative overflow-hidden group">
                        <div className="absolute -right-6 -top-6 w-32 h-32 bg-indigo-100/40 dark:bg-indigo-500/10 rounded-full blur-2xl group-hover:scale-150 transition-transform duration-700" />
                        <span className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Net Outstanding Balance</span>
                        <span className="text-3xl font-black tabular-nums text-indigo-600 dark:text-indigo-400">{totals.outstanding.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                </div>
            )}

            </div>


            <Modal
                open={showPrintPreview}
                onClose={() => setShowPrintPreview(false)}
                className="max-w-[100vw] w-[100vw] h-[100vh] flex flex-col p-0 overflow-hidden"
                headerActions={
                    <div className="flex gap-4">
                        <button
                            onClick={() => setShowPrintPreview(false)}
                            className="px-6 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all active:scale-95 border border-slate-300"
                        >
                            CLOSE
                        </button>
                        <button
                            onClick={handleExportPdf}
                            className="px-8 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-md active:scale-95 flex items-center gap-2 border border-indigo-500"
                        >
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" /></svg>
                            PRINT
                        </button>
                    </div>
                }
            >
                <div className="flex-1 overflow-auto bg-slate-200/50 dark:bg-slate-900/50 p-4 md:p-8 flex flex-col items-center">
                    {/* Document Container - A4 Portrait Simulation */}
                    <div 
                        className="bg-white shadow-[0_30px_90px_rgba(0,0,0,0.2)] border border-slate-300 rounded-sm relative" 
                        ref={printRef}
                        style={{
                            width: '210mm',
                            minHeight: '297mm',
                            padding: '15mm',
                            backgroundColor: 'white'
                        }}
                    >
                        <PrintableReport />
                    </div>
                </div>
            </Modal>
        </div>
    );
}
