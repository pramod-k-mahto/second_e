"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useEffect, useRef } from "react";
import { api } from "@/lib/api";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { getStockPeriodReport, type StockPeriodReportRow } from "@/lib/api/inventory";
import { openPrintWindow } from '@/lib/printReport';
import { FormattedDate } from "@/components/ui/FormattedDate";

const fetcher = async (url: string) => {
  try {
    const res = await api.get(url);
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 501 && typeof detail === "string" && detail.includes("FIFO inventory valuation is not implemented yet")) {
      const e = new Error(detail);
      (e as any).code = "FIFO_NOT_IMPLEMENTED";
      throw e;
    }
    throw err;
  }
};

type Warehouse = {
  id: number;
  name: string;
};

export default function ItemsReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const { data: companyInfo } = useSWR<{ name?: string; fiscal_year_start?: string }>(
    companyId ? `/companies/${companyId}` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(todayStr);

  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>("AD");
  const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>("AD");

  useEffect(() => {
    setDateDisplayMode(readCalendarDisplayMode(companyId));
    setReportDisplayMode(readCalendarReportDisplayMode(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!companyId || fromDate) return;

    const todayAD = new Date().toISOString().slice(0, 10);
    const todayBS = safeADToBS(todayAD) || "";
    const parts = todayBS.split("-");
    let fiscalStart = "";
    if (parts.length >= 2) {
      let currentBSYear = parseInt(parts[0], 10);
      const currentBSMonth = parseInt(parts[1], 10);
      if (currentBSMonth < 4) currentBSYear -= 1;
      fiscalStart = safeBSToAD(`${currentBSYear}-04-01`) || "";
    } else {
      fiscalStart = companyInfo?.fiscal_year_start || todayAD;
    }

    if (fiscalStart) {
      setFromDate(fiscalStart);
    }
  }, [companyId, companyInfo, fromDate]);

  const isBS = dateDisplayMode === "BOTH" ? reportDisplayMode === "BS" : dateDisplayMode === "BS";
  const effectiveDisplayMode = dateDisplayMode === "BOTH" ? reportDisplayMode : dateDisplayMode;

  const { data: items, isLoading: itemsLoading } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [subCategoryFilter, setSubCategoryFilter] = useState("");
  const [brandFilter, setBrandFilter] = useState("");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [isFixedAssetFilter, setIsFixedAssetFilter] = useState<string>("all"); // all, yes, no
  const [smartFilter, setSmartFilter] = useState<"all" | "lowStock" | "expiringSoon" | "expired">("all");
  const [showZeroBalance, setShowZeroBalance] = useState(false);

  const { canRead } = useMenuAccess("reports.stock");
  const printRef = useRef<HTMLDivElement | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"PDF" | "Excel" | "Send">("PDF");
  const [todayActive, setTodayActive] = useState(true);

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Stock Status & Alerts",
      company: currentCompany?.name || (company as any)?.name || "",
      orientation: "portrait",
    });
  };

  const handleDownload = () => {
    if (downloadFormat === 'PDF') { handlePrint(); return; }
    if (downloadFormat === 'Excel') { handleExportCsv(); return; }
    if (downloadFormat === 'Send') {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        (navigator as any).share({ title: 'Stock of Items', text: 'Sharing Stock of Items report.' }).catch(() => { });
      } else { window.alert('Sharing is not supported on this browser.'); }
    }
  };

  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const effectiveFromAD = fromDate;
  const effectiveToAD = toDate;

  const swrKey = companyId && effectiveFromAD && effectiveToAD ? ["stock-period-report", companyId, effectiveFromAD, effectiveToAD, warehouseId || ""] : null;

  const {
    data: stockReport,
    error: stockError,
    isValidating: stockValidating,
  } = useSWR<StockPeriodReportRow[]>(
    swrKey,
    async () => {
      if (!companyId) throw new Error("Missing companyId");
      return await getStockPeriodReport(Number(companyId), effectiveFromAD, effectiveToAD, warehouseId ? Number(warehouseId) : undefined);
    }
  );

  const fifoNotImplemented = false; // Stock summary supports both methods or returns basic data

  const dataByItemId = useMemo(() => {
    const map: Record<number, StockPeriodReportRow> = {};
    (stockReport || []).forEach((row) => {
      map[row.item_id] = row;
    });
    return map;
  }, [stockReport]);

  const distinctCategories = useMemo(() => {
    const setVals = new Set<string>();
    (items || []).forEach((it: any) => {
      if (it.category) setVals.add(String(it.category));
    });
    return Array.from(setVals).sort();
  }, [items]);

  const distinctSubCategories = useMemo(() => {
    const setVals = new Set<string>();
    (items || []).forEach((it: any) => {
      // If a category is selected, only show sub-categories from that category
      const itCategory = (it.category || "").toString().toLowerCase();
      if (categoryFilter && itCategory !== categoryFilter.toLowerCase()) return;
      if (it.sub_category) setVals.add(String(it.sub_category));
    });
    return Array.from(setVals).sort();
  }, [items, categoryFilter]);

  const distinctBrands = useMemo(() => {
    const setVals = new Set<string>();
    (items || []).forEach((it: any) => {
      if (it.brand_name) setVals.add(String(it.brand_name));
    });
    return Array.from(setVals).sort();
  }, [items]);

  const smartMetrics = useMemo(() => {
    if (!items || !dataByItemId) return { lowStock: 0, expiringSoon: 0, expired: 0 };
    let lowStock = 0;
    let expiringSoon = 0;
    let expired = 0;
    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    (items as any[]).forEach(it => {
      const r = dataByItemId[it.id];
      const balQ = r != null && r.balance_qty != null ? Number(r.balance_qty) : Number(it.opening_stock || 0);
      const reorder = Number(it.reorder_level || it.min_stock_warning || 0);

      if (reorder > 0 && balQ < reorder) lowStock++;

      const expiryDateStr = it.expiry_date || it.field_metadata?.expiry_date;
      if (expiryDateStr) {
        const expiryDate = new Date(expiryDateStr);
        if (expiryDate < today) {
          expired++;
        } else if (expiryDate <= thirtyDaysFromNow) {
          expiringSoon++;
        }
      }
    });

    return { lowStock, expiringSoon, expired };
  }, [items, dataByItemId]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!items) return [];
    const list = items as any[];

    const today = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(today.getDate() + 30);

    return list.filter((it) => {
      // Smart filters
      if (smartFilter === "lowStock") {
        const r = dataByItemId[it.id];
        const balQ = r != null && r.balance_qty != null ? Number(r.balance_qty) : Number(it.opening_stock || 0);
        const reorder = Number(it.reorder_level || it.min_stock_warning || 0);
        if (!(reorder > 0 && balQ < reorder)) return false;
      }
      if (smartFilter === "expired" || smartFilter === "expiringSoon") {
        const expiryDateStr = it.expiry_date || it.field_metadata?.expiry_date;
        if (!expiryDateStr) return false;
        const expiryDate = new Date(expiryDateStr);
        if (smartFilter === "expired") {
          if (!(expiryDate < today)) return false;
        } else {
          if (!(expiryDate >= today && expiryDate <= thirtyDaysFromNow)) return false;
        }
      }

      // Search term
      if (term) {
        const id = String(it.id || "").toLowerCase();
        const name = (it.name || "").toString().toLowerCase();
        const code = (it.code || "").toString().toLowerCase();
        const sku = (it.sku || "").toString().toLowerCase();
        const category = (it.category || "").toString().toLowerCase();
        const subCategory = (it.sub_category || "").toString().toLowerCase();
        const brand = (it.brand_name || "").toString().toLowerCase();
        const match = id.includes(term) || name.includes(term) || code.includes(term) || sku.includes(term) || category.includes(term) || subCategory.includes(term) || brand.includes(term);
        if (!match) return false;
      }

      // Meta filters
      const category = (it.category || "").toString().toLowerCase();
      const subCategory = (it.sub_category || "").toString().toLowerCase();
      const brand = (it.brand_name || "").toString().toLowerCase();
      if (categoryFilter && category !== categoryFilter.toLowerCase()) return false;
      if (subCategoryFilter && subCategory !== subCategoryFilter.toLowerCase()) return false;
      if (brandFilter && brand !== brandFilter.toLowerCase()) return false;
      if (isFixedAssetFilter === "yes" && !it.is_fixed_asset) return false;
      if (isFixedAssetFilter === "no") {
        if (it.is_fixed_asset) return false;
        // Exclude service-like items
        if (it.allow_negative_stock && !it.costing_method) return false;
      }
      if (isFixedAssetFilter === "service") {
        if (it.is_fixed_asset) return false;
        // Include ONLY service-like items
        const isService = it.allow_negative_stock && !it.costing_method;
        if (!isService) return false;
      }

      // Zero balance filter
      if (!showZeroBalance) {
        const r = dataByItemId[it.id];
        const balQ = r != null && r.balance_qty != null ? Number(r.balance_qty) : Number(it.opening_stock || 0);
        if (balQ === 0) return false;
      }

      // Warehouse filter
      if (warehouseId) {
        const r = dataByItemId[it.id];
        if (!r) return false;
        const hasMovement = Number(r.initial_qty) !== 0 || Number(r.inwards_qty) !== 0 || Number(r.outwards_qty) !== 0 || Number(r.balance_qty) !== 0;
        if (!hasMovement) return false;
      }

      return true;
    });
  }, [items, search, categoryFilter, subCategoryFilter, brandFilter, warehouseId, dataByItemId, isFixedAssetFilter, smartFilter, showZeroBalance]);

  const handleExportCsv = () => {
    if (!filteredItems.length) return;
    const headers = [
      "ID",
      "Name",
      "Code",
      "Category",
      "Sub Category",
      "Initial Qty",
      "Initial Rate",
      "Initial Value",
      "Inwards Qty",
      "Inwards Rate",
      "Inwards Value",
      "Outwards Qty",
      "Outwards Rate",
      "Outwards Value",
      "Balance Qty",
      "Balance Rate",
      "Balance Value",
    ];
    const rows = filteredItems.map((it: any) => {
      const r = dataByItemId[it.id];
      const itemRate = Number(it.opening_rate || it.default_purchase_rate || 0);
      const initQ = Number(r?.initial_qty || it.opening_stock || 0);
      const initR = Number(r?.initial_rate) || itemRate;
      const initV = Number(r?.initial_value) || initQ * initR;
      const inQ = Number(r?.inwards_qty || 0);
      const inR = Number(r?.inwards_rate) || itemRate;
      const inV = Number(r?.inwards_value) || inQ * inR;
      const outQ = Number(r?.outwards_qty || 0);
      const outR = Number(r?.outwards_rate) || itemRate;
      const outV = Number(r?.outwards_value) || outQ * outR;
      const balQ = r != null && r.balance_qty != null ? Number(r.balance_qty) : (initQ + inQ - outQ);
      const balR = Number(r?.balance_rate) || initR;
      const balV = Number(r?.balance_value) || balQ * balR;

      return [
        it.id ?? "",
        it.name ?? "",
        it.code ?? "",
        it.category ?? "",
        it.sub_category ?? "",
        initQ, Number(initR).toFixed(2), Number(initV).toFixed(2),
        inQ, Number(inR).toFixed(2), Number(inV).toFixed(2),
        outQ, Number(outR).toFixed(2), Number(outV).toFixed(2),
        balQ, Number(balR).toFixed(2), Number(balV).toFixed(2),
      ];
    });

    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? "");
            if (s.includes(",") || s.includes("\"")) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `items-report-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!companyId) return null;

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Stock of Items</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Inventory stock levels and valuations</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
              Exit
            </button>
          </div>
        </div>
        <p className="text-sm text-slate-600">
          You do not have permission to view the stock of items report for this company.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Compact Header - matching voucher page style */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Stock of Items</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Inventory stock levels and valuations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150 ml-auto"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
            Exit
          </button>
        </div>
      </div>
      <div
        ref={printRef}
        className="rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-50/50 dark:bg-slate-900/50"
      >
        {/* Smart Metrics Cards */}
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => setSmartFilter("all")}
            className={`flex flex-col p-3 rounded-xl border transition-all text-left ${smartFilter === "all" ? "bg-indigo-50 border-indigo-200 ring-2 ring-indigo-500/20" : "bg-white border-slate-200 hover:border-indigo-300"}`}
          >
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Total Items</span>
            <span className="text-xl font-black text-slate-800 tracking-tight">{items?.length || 0}</span>
          </button>
          <button
            onClick={() => setSmartFilter("lowStock")}
            className={`flex flex-col p-3 rounded-xl border transition-all text-left ${smartFilter === "lowStock" ? "bg-amber-50 border-amber-200 ring-2 ring-amber-500/20" : "bg-white border-slate-200 hover:border-amber-300"}`}
          >
            <span className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Low Stock Alert</span>
            <div className="flex items-center justify-between">
              <span className="text-xl font-black text-amber-700 tracking-tight">{smartMetrics.lowStock}</span>
              {smartMetrics.lowStock > 0 && <span className="flex h-2 w-2 rounded-full bg-amber-500 animate-pulse" />}
            </div>
          </button>
          <button
            onClick={() => setSmartFilter("expiringSoon")}
            className={`flex flex-col p-3 rounded-xl border transition-all text-left ${smartFilter === "expiringSoon" ? "bg-orange-50 border-orange-200 ring-2 ring-orange-500/20" : "bg-white border-slate-200 hover:border-orange-300"}`}
          >
            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Expiring (30d)</span>
            <div className="flex items-center justify-between">
              <span className="text-xl font-black text-orange-700 tracking-tight">{smartMetrics.expiringSoon}</span>
              {smartMetrics.expiringSoon > 0 && <span className="flex h-2 w-2 rounded-full bg-orange-500 animate-pulse" />}
            </div>
          </button>
          <button
            onClick={() => setSmartFilter("expired")}
            className={`flex flex-col p-3 rounded-xl border transition-all text-left ${smartFilter === "expired" ? "bg-red-50 border-red-200 ring-2 ring-red-500/20" : "bg-white border-slate-200 hover:border-red-300"}`}
          >
            <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider mb-1">Expired Items</span>
            <div className="flex items-center justify-between">
              <span className="text-xl font-black text-red-700 tracking-tight">{smartMetrics.expired}</span>
              {smartMetrics.expired > 0 && <span className="flex h-2 w-2 rounded-full bg-red-500 animate-pulse" />}
            </div>
          </button>
        </div>
        {/* Filter Panel Header */}
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-t-2xl">
          <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide">🔍 Filters &amp; Date Range</span>
          <div className="flex items-center gap-2 ml-auto print-hidden">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
            >
              🖨️ Print
            </button>
            <div className="flex items-center h-8">
              <select
                className="h-8 rounded-l-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-300 border-r-0"
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
          </div>
        </div>

        {/* Filter Body */}
        <div className="p-4 flex flex-col gap-3 text-sm">
          <div className="flex flex-wrap gap-3 items-end">
            {/* Date Display */}
            <div>
              <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date Display</label>
              <select
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 transition-all disabled:opacity-50"
                value={effectiveDisplayMode}
                onChange={(e) => {
                  if (dateDisplayMode !== "BOTH") return;
                  const next = e.target.value as CalendarReportDisplayMode;
                  setReportDisplayMode(next);
                  writeCalendarReportDisplayMode(companyId, next);
                }}
                disabled={dateDisplayMode !== "BOTH"}
              >
                {dateDisplayMode === "BOTH" ? (
                  <>
                    <option value="AD">AD (Gregorian)</option>
                    <option value="BS">BS (Nepali)</option>
                  </>
                ) : (
                  <option value={effectiveDisplayMode}>{effectiveDisplayMode}</option>
                )}
              </select>
            </div>

            {/* From Date */}
            <div className="relative z-50">
              <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">From Date ({effectiveDisplayMode})</label>
              {effectiveDisplayMode === "BS" ? (
                <NepaliDatePicker
                  inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={safeADToBS(fromDate) || fromDate}
                  onChange={(v: string) => { setFromDate(safeBSToAD(v) || v); setTodayActive(false); }}
                  options={{ calenderLocale: "ne", valueLocale: "en" }}
                />
              ) : (
                <input
                  type="date"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={fromDate}
                  onChange={(e) => { setFromDate(e.target.value); setTodayActive(false); }}
                />
              )}
            </div>

            {/* To Date */}
            <div className="relative z-50">
              <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">To Date ({effectiveDisplayMode})</label>
              {effectiveDisplayMode === "BS" ? (
                <NepaliDatePicker
                  inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={safeADToBS(toDate) || toDate}
                  onChange={(v: string) => { setToDate(safeBSToAD(v) || v); setTodayActive(false); }}
                  options={{ calenderLocale: "ne", valueLocale: "en" }}
                />
              ) : (
                <input
                  type="date"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={toDate}
                  onChange={(e) => { setToDate(e.target.value); setTodayActive(false); }}
                />
              )}
            </div>

            {/* Today */}
            <button
              type="button"
              className={`h-9 self-end rounded-lg border px-3 text-xs font-semibold transition-all ${todayActive
                ? "border-indigo-400 bg-indigo-50 text-indigo-700 hover:bg-indigo-100"
                : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              onClick={() => {
                const todayBS = safeADToBS(todayStr) || "";
                const parts = todayBS.split("-");
                let fiscalStart = "";
                if (parts.length >= 2) {
                  let currentBSYear = parseInt(parts[0], 10);
                  const currentBSMonth = parseInt(parts[1], 10);
                  if (currentBSMonth < 4) currentBSYear -= 1;
                  fiscalStart = safeBSToAD(`${currentBSYear}-04-01`) || "";
                } else {
                  fiscalStart = companyInfo?.fiscal_year_start || todayStr;
                }
                setFromDate(fiscalStart);
                setToDate(todayStr);
                setTodayActive(true);
              }}
            >
              📅 Today
            </button>
          </div>

          {/* Second row: search + other filters */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2 items-center">
              <input
                className="border rounded px-2 py-1 text-xs w-56"
                placeholder="Search by ID, name, code, SKU, category, brand"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className="border rounded px-2 py-1 text-xs min-w-[180px]"
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
              >
                <option value="">All Warehouses</option>
                {warehouses?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name}
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-2 py-1 text-xs"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">All Categories</option>
                {distinctCategories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-2 py-1 text-xs"
                value={subCategoryFilter}
                onChange={(e) => setSubCategoryFilter(e.target.value)}
              >
                <option value="">All Sub Categories</option>
                {distinctSubCategories.map((sc) => (
                  <option key={sc} value={sc}>
                    {sc}
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-2 py-1 text-xs"
                value={brandFilter}
                onChange={(e) => setBrandFilter(e.target.value)}
              >
                <option value="">All Brands</option>
                {distinctBrands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                className="border rounded px-2 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50/50"
                value={isFixedAssetFilter}
                onChange={(e) => setIsFixedAssetFilter(e.target.value)}
              >
                <option value="all">All Items</option>
                <option value="no">Inventory Only</option>
                <option value="service">Service Only</option>
                <option value="yes">Fixed Assets Only</option>
              </select>
              <label className="flex items-center gap-2 cursor-pointer ml-2">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  checked={showZeroBalance}
                  onChange={(e) => setShowZeroBalance(e.target.checked)}
                />
                <span className="text-xs font-medium text-slate-700">Show Zero Balance</span>
              </label>
            </div>

            <div className="flex items-center gap-3 ml-auto">
              <div className="text-[11px] text-slate-500">
                Total: {items ? (items as any[]).length : 0} &nbsp;|&nbsp; Showing: {filteredItems.length}
              </div>
            </div>
          </div>

          {/* Loading bar */}
          {(itemsLoading || stockValidating) && (
            <div className="h-0.5 w-full rounded-full overflow-hidden bg-slate-100">
              <div className="w-full h-full bg-indigo-500 animate-[loading-bar_1.5s_infinite_linear]" />
            </div>
          )}
        </div>
      </div>

      <style jsx>{`
          @keyframes loading-bar {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>

      <div className="px-4 pb-4">
        {stockError && (
          <div className="mb-3 rounded border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
            <div className="font-semibold">Stock report API error:</div>
            <div className="mt-1">{stockError?.message || stockError?.response?.data?.detail || JSON.stringify(stockError)}</div>
          </div>
        )}
        {stockReport && (
          <div className="mb-2 text-[10px] text-slate-400">
            Stock data: {stockReport.length} rows returned for {effectiveFromAD} to {effectiveToAD}
            {stockReport.length > 0 && ` | First row item_id: ${stockReport[0]?.item_id}, inwards_qty: ${stockReport[0]?.inwards_qty}, outwards_qty: ${stockReport[0]?.outwards_qty}, balance_qty: ${stockReport[0]?.balance_qty}`}
          </div>
        )}
        {!items ? (
          <div className="text-sm text-slate-500">Loading items...</div>
        ) : !stockReport && !stockError && fromDate && toDate ? (
          <div className="text-sm text-slate-500">Loading stock data...</div>
        ) : fifoNotImplemented && warehouseId ? (
          <div className="text-sm text-slate-500">
            Stock valuation is currently unavailable for FIFO.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-sm text-slate-500">No items found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-slate-600 bg-slate-50">
                  <th colSpan={5} className="text-center py-2 px-2 border-r bg-white">Item Details</th>
                  <th className="text-center py-2 px-2 border-r bg-white font-bold text-slate-700">Status</th>
                  <th colSpan={3} className="text-center py-2 px-2 border-r text-blue-700 bg-blue-50/30">Initial</th>
                  <th colSpan={3} className="text-center py-2 px-2 border-r text-green-700 bg-green-50/30">Inwards</th>
                  <th colSpan={3} className="text-center py-2 px-2 border-r text-red-700 bg-red-50/30">Outwards</th>
                  <th colSpan={3} className="text-center py-2 px-2 text-indigo-700 bg-indigo-50/30">Balance</th>
                </tr>
                <tr className="border-b text-slate-500">
                  <th className="text-left py-2 px-2 whitespace-nowrap">ID</th>
                  <th className="text-left py-2 px-2 whitespace-nowrap min-w-[150px]">Name</th>
                  <th className="text-left py-2 px-2 whitespace-nowrap">Code</th>
                  <th className="text-left py-2 px-2 whitespace-nowrap">Category</th>
                  <th className="text-left py-2 px-2 border-r whitespace-nowrap">Sub Category</th>
                  <th className="text-center py-2 px-2 border-r whitespace-nowrap text-slate-500">Status</th>

                  {/* Initial */}
                  <th className="text-right py-2 px-2 whitespace-nowrap">Qty</th>
                  <th className="text-right py-2 px-2 whitespace-nowrap">Rate</th>
                  <th className="text-right py-2 px-2 border-r whitespace-nowrap">Value</th>

                  {/* Inwards */}
                  <th className="text-right py-2 px-2 whitespace-nowrap">Qty</th>
                  <th className="text-right py-2 px-2 whitespace-nowrap">Rate</th>
                  <th className="text-right py-2 px-2 border-r whitespace-nowrap">Value</th>

                  {/* Outwards */}
                  <th className="text-right py-2 px-2 whitespace-nowrap">Qty</th>
                  <th className="text-right py-2 px-2 whitespace-nowrap">Rate</th>
                  <th className="text-right py-2 px-2 border-r whitespace-nowrap">Value</th>

                  {/* Balance */}
                  <th className="text-right py-2 px-2 whitespace-nowrap">Qty</th>
                  <th className="text-right py-2 px-2 whitespace-nowrap">Rate</th>
                  <th className="text-right py-2 px-2 whitespace-nowrap">Value</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((it: any) => {
                  const r = dataByItemId[it.id];
                  const itemRate = Number(it.opening_rate || it.default_purchase_rate || 0);
                  const initQ = Number(r?.initial_qty || it.opening_stock || 0);
                  const initR = Number(r?.initial_rate) || itemRate;
                  const initV = Number(r?.initial_value) || initQ * initR;

                  const inQ = Number(r?.inwards_qty || 0);
                  const inR = Number(r?.inwards_rate) || itemRate;
                  const inV = Number(r?.inwards_value) || inQ * inR;

                  const outQ = Number(r?.outwards_qty || 0);
                  const outR = Number(r?.outwards_rate) || itemRate;
                  const outV = Number(r?.outwards_value) || outQ * outR;

                  const balQ = r != null && r.balance_qty != null ? Number(r.balance_qty) : (initQ + inQ - outQ);
                  const balR = Number(r?.balance_rate) || initR;
                  const balV = Number(r?.balance_value) || balQ * balR;

                  const reorder = Number(it.reorder_level || it.min_stock_warning || 0);
                  const isLowStock = reorder > 0 && balQ < reorder;
                  
                  const expiryDateStr = it.expiry_date || it.field_metadata?.expiry_date;
                  const expiryDate = expiryDateStr ? new Date(expiryDateStr) : null;
                  const isExpired = expiryDate && expiryDate < new Date();
                  const isExpiringSoon = expiryDate && !isExpired && expiryDate <= new Date(new Date().setDate(new Date().getDate() + 30));

                  return (
                    <tr key={it.id} className={`border-b hover:bg-slate-50/80 transition-colors ${isExpired ? 'bg-red-50/30' : isLowStock ? 'bg-amber-50/30' : ''}`}>
                      <td className="py-2 px-2 text-slate-500">{it.id}</td>
                      <td className="py-2 px-2 font-medium text-slate-800">{it.name}</td>
                      <td className="py-2 px-2 text-slate-500">{it.code}</td>
                      <td className="py-2 px-2 text-slate-500">{it.category}</td>
                      <td className="py-2 px-2 border-r text-slate-500">{it.sub_category}</td>
                      <td className="py-2 px-2 border-r text-center">
                        <div className="flex flex-col gap-1 items-center">
                          {isExpired && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 uppercase">Expired</span>}
                          {isExpiringSoon && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-orange-100 text-orange-700 border border-orange-200 uppercase">Expiring</span>}
                          {isLowStock && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 uppercase whitespace-nowrap">Low Stock</span>}
                          {!isExpired && !isExpiringSoon && !isLowStock && <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 uppercase">Optimal</span>}
                        </div>
                      </td>

                      {/* Initial */}
                      <td className="py-2 px-2 text-right text-slate-600 whitespace-nowrap">{Number(initQ) === 0 ? "-" : initQ}</td>
                      <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">{Number(initR) === 0 ? "-" : Number(initR).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-medium text-slate-700 border-r whitespace-nowrap">{Number(initV) === 0 ? "-" : Number(initV).toFixed(2)}</td>

                      {/* Inwards */}
                      <td className="py-2 px-2 text-right text-slate-600 whitespace-nowrap">{Number(inQ) === 0 ? "-" : inQ}</td>
                      <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">{Number(inR) === 0 ? "-" : Number(inR).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-medium text-slate-700 border-r whitespace-nowrap">{Number(inV) === 0 ? "-" : Number(inV).toFixed(2)}</td>

                      {/* Outwards */}
                      <td className="py-2 px-2 text-right text-slate-600 whitespace-nowrap">{Number(outQ) === 0 ? "-" : outQ}</td>
                      <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">{Number(outR) === 0 ? "-" : Number(outR).toFixed(2)}</td>
                      <td className="py-2 px-2 text-right font-medium text-slate-700 border-r whitespace-nowrap">{Number(outV) === 0 ? "-" : Number(outV).toFixed(2)}</td>

                      {/* Balance */}
                      <td className="py-2 px-2 text-right text-slate-600 whitespace-nowrap">{Number(balQ) === 0 ? "-" : balQ}</td>
                      <td className="py-2 px-2 text-right text-slate-400 whitespace-nowrap">{Number(balR) === 0 ? "-" : Number(balR).toFixed(2)}</td>
                      <td className={`py-2 px-2 text-right font-semibold ${isLowStock ? 'text-red-600 animate-pulse' : ''}`}>{Number(balV) === 0 ? "-" : Number(balV).toFixed(2)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 px-4 pb-4 text-[11px] text-slate-500">
          To add or edit items, go to <button
            type="button"
            className="underline text-slate-700"
            onClick={() => router.push(`/companies/${companyId}/inventory/items`)}
          >
            Items
          </button>{" "}
          in the Master menu.
        </div>
      </div>
    </div>
  );
}
