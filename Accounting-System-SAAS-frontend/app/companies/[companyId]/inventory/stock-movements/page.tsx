"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import { Input } from "@/components/ui/Input";

import { getStockLedger, StockLedgerResponse } from "@/lib/api/inventory";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function StockMovementsPage() {
    const params = useParams();
    const router = useRouter();
    const companyId = Number(params.companyId);
    const { reportMode: effectiveDisplayMode, calendarMode } = useCalendarSettings();
    const isBS = calendarMode === "BS";

    const cc = getCurrentCompany();
    const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
    const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

    const { data: company } = useSWR(
        companyId ? `/companies/${companyId}` : null,
        fetcher
    );


    const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
    const [selectedWarehouseId, setSelectedWarehouseId] = useState<number | null>(null);
    const [fromDate, setFromDate] = useState(smartFrom);
    const [toDate, setToDate] = useState(smartTo);


    const { data: items = [] } = useSWR(
        companyId ? `/inventory/companies/${companyId}/items` : null,
        fetcher
    );

    const { data: warehouses = [] } = useSWR(
        companyId ? `/inventory/companies/${companyId}/warehouses` : null,
        fetcher
    );

    const { data: ledgerData, isLoading } = useSWR<StockLedgerResponse | null>(
        selectedItemId
            ? ["stock-ledger", companyId, selectedItemId, selectedWarehouseId, fromDate, toDate]
            : null,
        () =>
            selectedItemId
                ? getStockLedger(companyId, selectedItemId, {
                    warehouseId: selectedWarehouseId || undefined,
                    fromDate,
                    toDate,
                })
                : null
    );

    const handleNewTransfer = () => {
        router.push(`/companies/${companyId}/inventory/stock-transfers/new`);
    };

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* ── Hero Header ────────────────────────────────────────────────── */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
                <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40">
                            <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
                            </svg>
                        </div>
                        <div>
                            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Stock Movements</h1>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                                Track inventory ins and outs for specific items across periods.
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleNewTransfer}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-semibold shadow-sm"
                        >
                            + New Stock Transfer
                        </button>
                        <button
                            onClick={() => router.back()}
                            className="px-4 py-2 border border-slate-300 bg-white text-slate-700 rounded-lg hover:bg-slate-50 transition-colors text-sm font-semibold shadow-sm"
                        >
                            Back
                        </button>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Item <span className="text-red-500">*</span>
                        </label>
                        <select
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedItemId || ""}
                            onChange={(e) => setSelectedItemId(e.target.value ? Number(e.target.value) : null)}
                        >
                            <option value="">Select Item</option>
                            {items.map((item: any) => (
                                <option key={item.id} value={item.id}>
                                    {item.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            Warehouse
                        </label>
                        <select
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={selectedWarehouseId || ""}
                            onChange={(e) => setSelectedWarehouseId(e.target.value ? Number(e.target.value) : null)}
                        >
                            <option value="">All Warehouses</option>
                            {warehouses.map((wh: any) => (
                                <option key={wh.id} value={wh.id}>
                                    {wh.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            From Date ({effectiveDisplayMode})
                        </label>
                        <Input
                            type="date"
                            calendarMode={effectiveDisplayMode}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={isBS ? safeBSToAD(fromDate) || "" : fromDate}
                            min={company?.fiscal_year_start || ""}
                            max={company?.fiscal_year_end || ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                setFromDate(isBS ? safeADToBS(val) || "" : val);
                            }}
                        />

                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">
                            To Date ({effectiveDisplayMode})
                        </label>
                        <Input
                            type="date"
                            calendarMode={effectiveDisplayMode}
                            className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            value={isBS ? safeBSToAD(toDate) || "" : toDate}
                            min={company?.fiscal_year_start || ""}
                            max={company?.fiscal_year_end || ""}
                            onChange={(e) => {
                                const val = e.target.value;
                                setToDate(isBS ? safeADToBS(val) || "" : val);
                            }}
                        />

                    </div>
                </div>
            </div>

            {/* Results */}
            {!selectedItemId && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                    <p className="text-blue-800">Please select an item to view stock movements</p>
                </div>
            )}

            {selectedItemId && isLoading && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                    <p className="mt-4 text-slate-600">Loading movements...</p>
                </div>
            )}

            {selectedItemId && !isLoading && ledgerData && (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                    {/* Header */}
                    <div className="bg-slate-50 border-b border-slate-200 p-4">
                        <h2 className="text-lg font-semibold text-slate-900">{ledgerData.item_name}</h2>
                        <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                                <span className="text-slate-600">Period:</span>
                                <span className="ml-2 font-medium text-slate-900">
                                    <FormattedDate date={ledgerData.from_date} showSuffix /> to <FormattedDate date={ledgerData.to_date} showSuffix />
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-600">Opening Qty:</span>
                                <span className="ml-2 font-medium text-slate-900">
                                    {ledgerData.opening_qty.toFixed(2)}
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-600">Closing Qty:</span>
                                <span className="ml-2 font-medium text-slate-900">
                                    {ledgerData.closing_qty.toFixed(2)}
                                </span>
                            </div>
                            <div>
                                <span className="text-slate-600">Total Movements:</span>
                                <span className="ml-2 font-medium text-slate-900">
                                    {ledgerData.entries.length}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    {ledgerData.entries.length === 0 ? (
                        <div className="p-8 text-center text-slate-500">
                            No movements found for the selected period
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-slate-200">
                                <thead className="bg-slate-50">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Date
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Type
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Voucher No.
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Warehouse
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Qty In
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Qty Out
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Balance
                                        </th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-slate-700 uppercase tracking-wider">
                                            Unit Cost
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-slate-200">
                                    {ledgerData.entries.map((entry) => (
                                        <tr key={entry.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900">
                                                <FormattedDate date={entry.posted_at} showSuffix />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <span
                                                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${entry.source_type === "PURCHASE_BILL"
                                                        ? "bg-green-100 text-green-800"
                                                        : entry.source_type === "SALES_INVOICE"
                                                            ? "bg-blue-100 text-blue-800"
                                                            : entry.source_type === "STOCK_TRANSFER"
                                                                ? "bg-purple-100 text-purple-800"
                                                                : "bg-slate-100 text-slate-800"
                                                        }`}
                                                >
                                                    {entry.source_type.replace(/_/g, " ")}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-900 font-medium">
                                                {entry.voucher_number || "-"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                                {entry.warehouse_name || "-"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-green-600 font-medium">
                                                {entry.qty_in > 0 ? entry.qty_in.toFixed(2) : "-"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600 font-medium">
                                                {entry.qty_out > 0 ? entry.qty_out.toFixed(2) : "-"}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right font-medium text-slate-900">
                                                {entry.balance.toFixed(2)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-slate-600">
                                                {entry.unit_cost != null ? entry.unit_cost.toFixed(2) : "-"}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
