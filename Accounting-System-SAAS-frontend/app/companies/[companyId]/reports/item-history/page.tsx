"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { readCalendarDisplayMode } from "@/lib/calendarMode";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { Input } from "@/components/ui/Input";
import { openPrintWindow } from "@/lib/printReport";
import { Printer, ArrowLeft, Search, Package, List } from "lucide-react";

// ---------------------------------------------------------------------------
// Constants & fetcher
// ---------------------------------------------------------------------------
const SALES_TYPES = ["Sales Invoice", "Sales Return"];
const PURCHASE_TYPES = ["Purchase Invoice", "Purchase Return"];

const fetcher = (url: string) => api.get(url).then((r) => r.data);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function ItemHistoryPage() {
  const params    = useParams();
  const companyId = params?.companyId as string;
  const router    = useRouter();
  const printRef  = useRef<HTMLDivElement>(null);

  // ── mounting / timestamp ────────────────────────────────────────────────
  const [mounted,   setMounted]   = useState(false);
  const [timestamp, setTimestamp] = useState("");

  // ── calendar mode & date range (SSR-safe: always start with AD) ─────────
  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">("AD");
  const [fromDate, setFromDate] = useState(() => getSmartDefaultPeriod("AD").from);
  const [toDate,   setToDate]   = useState(() => getSmartDefaultPeriod("AD").to);

  // ── search / filter state ───────────────────────────────────────────────
  const [partySearch,      setPartySearch]      = useState("");
  const [partyName,        setPartyName]        = useState("");
  const [showPartyDrop,    setShowPartyDrop]    = useState(false);
  const [itemSearch,       setItemSearch]       = useState("");
  const [itemId,           setItemId]           = useState("");
  const [selectedItemName, setSelectedItemName] = useState("");
  const [showItemDrop,     setShowItemDrop]     = useState(false);
  const [txnType, setTxnType] = useState<"all" | "sales" | "purchases">("all");

  // ── on mount: read localStorage and sync mode + dates atomically ─────────
  useEffect(() => {
    setMounted(true);
    setTimestamp(new Date().toLocaleString());
    const cc   = getCurrentCompany();
    const stored = readCalendarDisplayMode(cc?.id ? String(cc.id) : '', cc?.calendar_mode || 'AD');
    const mode = (stored === 'BOTH' ? (cc?.calendar_mode || 'AD') : stored) as "AD" | "BS";
    const { from, to } = getSmartDefaultPeriod(mode, cc);
    setEffectiveDisplayMode(mode);
    setFromDate(from);
    setToDate(to);
  }, []);

  // ── API calls ────────────────────────────────────────────────────────────
  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const { data: items, isLoading: loadingItems } = useSWR<any[]>(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const { data: customers } = useSWR<any[]>(
    companyId ? `/companies/${companyId}/reports/customer-ledger-mapping` : null,
    fetcher
  );

  const { data: suppliers } = useSWR<any[]>(
    companyId ? `/companies/${companyId}/reports/supplier-ledger-mapping` : null,
    fetcher
  );

  // ── sync with server company settings (in case localStorage was stale) ───
  useEffect(() => {
    if (!mounted || !dbCompany?.calendar_mode) return;
    const mode = dbCompany.calendar_mode as "AD" | "BS";
    if (mode === effectiveDisplayMode) return;
    const { from, to } = getSmartDefaultPeriod(mode, dbCompany as any);
    setEffectiveDisplayMode(mode);
    setFromDate(from);
    setToDate(to);
  }, [mounted, dbCompany?.calendar_mode]);

  // ── date helpers ─────────────────────────────────────────────────────────
  const isBS  = effectiveDisplayMode === "BS";
  const fromAD = isBS ? (safeBSToAD(fromDate) || "") : fromDate;
  const toAD   = isBS ? (safeBSToAD(toDate)   || "") : toDate;

  const handleModeSwitch = (mode: "AD" | "BS") => {
    if (mode === effectiveDisplayMode) return;
    const { from, to } = getSmartDefaultPeriod(mode);
    setEffectiveDisplayMode(mode);
    setFromDate(from);
    setToDate(to);
  };

  const handleToday = () => {
    const { from, to } = getSmartDefaultPeriod(isBS ? "BS" : "AD");
    setFromDate(from);
    setToDate(to);
  };

  // ── report data ──────────────────────────────────────────────────────────
  const reportUrl = companyId && fromAD && toAD && (itemId || partyName)
    ? `/companies/${companyId}/reports/inventory-history?from_date=${fromAD}&to_date=${toAD}${partyName ? "&party_name=" + encodeURIComponent(partyName) : ""}${itemId ? "&item_id=" + itemId : ""}`
    : null;

  const { data: rawData, isLoading, error: reportError } = useSWR(reportUrl, fetcher);

  const reportData = useMemo(() => {
    const rows: any[] = Array.isArray(rawData?.rows) ? rawData.rows : [];
    if (txnType === "sales")     return rows.filter((r) => SALES_TYPES.includes(r.voucher_type));
    if (txnType === "purchases") return rows.filter((r) => PURCHASE_TYPES.includes(r.voucher_type));
    return rows;
  }, [rawData, txnType]);

  // ── autocomplete lists ───────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const q = itemSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((it: any) =>
      (it.name || "").toLowerCase().includes(q) ||
      (it.code || "").toLowerCase().includes(q)
    );
  }, [items, itemSearch]);

  const allParties = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const c of Array.isArray(customers) ? customers : []) {
      const n = c.customer_name || c.name;
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    }
    for (const s of Array.isArray(suppliers) ? suppliers : []) {
      const n = s.supplier_name || s.name;
      if (n && !seen.has(n)) { seen.add(n); out.push(n); }
    }
    return out.sort();
  }, [customers, suppliers]);

  const filteredParties = useMemo(() => {
    const q = partySearch.trim().toLowerCase();
    if (!q) return allParties;
    return allParties.filter((n) => n.toLowerCase().includes(q));
  }, [allParties, partySearch]);

  // ── print ────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Item History Report",
      company: dbCompany?.name || "",
      period: `${fromDate} – ${toDate}`,
      orientation: "landscape",
    });
  };

  // ── derived display values ───────────────────────────────────────────────
  const total       = reportData.reduce((s: number, r: any) => s + (r.amount || 0), 0);
  const companyName = mounted ? (dbCompany?.name || "Accounting System") : "Accounting System";

  if (!companyId) return null;

  // ── render ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-bottom-2 duration-700 print:space-y-0 print:pb-0">

      {/* ── Toolbar ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm rounded-xl print:hidden">

        {/* Header row */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg bg-slate-900 dark:bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
              <List className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight uppercase">Item History</h1>
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest leading-none mt-0.5">Purchase &amp; Sales Transactions by Item</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="group flex items-center gap-2 h-9 px-4 text-[11px] font-bold bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm uppercase tracking-wider"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              Print
            </button>
            <button
              onClick={() => router.back()}
              className="flex items-center gap-2 h-9 px-4 text-[11px] font-bold bg-slate-900 text-white dark:bg-white dark:text-slate-900 rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all shadow-md shadow-slate-900/10 uppercase tracking-wider"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back
            </button>
          </div>
        </div>

        {/* Filter row */}
        <div className="px-6 py-4 bg-slate-50/50 dark:bg-slate-900/50 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">

          {/* Party search */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Customer / Supplier
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="All parties..."
                value={partySearch || partyName}
                onChange={(e) => { setPartySearch(e.target.value); setPartyName(""); }}
                onFocus={(e) => { setShowPartyDrop(true); if (partyName) { setPartySearch(partyName); setPartyName(""); e.target.select(); } }}
                onBlur={() => setTimeout(() => { setShowPartyDrop(false); setPartySearch(""); }, 150)}
                className="w-full h-9 pl-9 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
              />
              {partyName && (
                <button
                  onClick={() => { setPartyName(""); setPartySearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 text-xs font-bold leading-none"
                >
                  ✕
                </button>
              )}
              {showPartyDrop && (
                <div className="absolute left-0 right-0 top-full mt-1 z-[200] max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1">
                  {filteredParties.length === 0 ? (
                    <p className="px-3 py-2 text-[10px] text-slate-400">
                      {allParties.length === 0 ? "Loading parties..." : "No match found"}
                    </p>
                  ) : (
                    filteredParties.map((name) => (
                      <button
                        key={name}
                        onMouseDown={() => { setPartyName(name); setPartySearch(""); setShowPartyDrop(false); }}
                        className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 transition-colors"
                      >
                        {name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Item search */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Item / Product
            </label>
            <div className="relative">
              <Package className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="All items..."
                value={itemSearch || selectedItemName}
                onChange={(e) => { setItemSearch(e.target.value); setItemId(""); setSelectedItemName(""); }}
                onFocus={(e) => { setShowItemDrop(true); if (selectedItemName) { setItemSearch(selectedItemName); setSelectedItemName(""); e.target.select(); } }}
                onBlur={() => setTimeout(() => { setShowItemDrop(false); setItemSearch(""); }, 150)}
                className="w-full h-9 pl-9 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-semibold text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
              />
              {selectedItemName && (
                <button
                  onClick={() => { setItemId(""); setSelectedItemName(""); setItemSearch(""); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 text-xs font-bold leading-none"
                >
                  ✕
                </button>
              )}
              {showItemDrop && (
                <div className="absolute left-0 right-0 top-full mt-1 z-[200] max-h-56 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1">
                  {loadingItems ? (
                    <p className="px-3 py-2 text-[10px] text-slate-400 animate-pulse">Loading items…</p>
                  ) : filteredItems.length === 0 ? (
                    <p className="px-3 py-2 text-[10px] text-slate-400">No items found</p>
                  ) : (
                    filteredItems.map((it: any) => (
                      <button
                        key={it.id}
                        onMouseDown={() => {
                          setItemId(String(it.id));
                          setSelectedItemName(it.name);
                          setItemSearch("");
                          setShowItemDrop(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-[11px] font-medium rounded hover:bg-indigo-600 hover:text-white text-slate-700 dark:text-slate-300 transition-colors flex items-center justify-between"
                      >
                        <span>{it.name}</span>
                        {it.code && <span className="text-[9px] opacity-40 ml-2 shrink-0">{it.code}</span>}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Transaction type */}
          <div className="space-y-1.5">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Type
            </label>
            <div className="flex h-9 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
              {(["all", "sales", "purchases"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTxnType(t)}
                  className={`flex-1 text-[9px] font-black uppercase tracking-wide transition-all ${
                    txnType === t
                      ? t === "sales"
                        ? "bg-emerald-600 text-white"
                        : t === "purchases"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-900 text-white dark:bg-indigo-600"
                      : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  }`}
                >
                  {t === "all" ? "All" : t === "sales" ? "Sales" : "Purchase"}
                </button>
              ))}
            </div>
          </div>

          {/* Date range */}
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest ml-1">
              Period
            </label>
            <div className="flex items-center gap-2">
              {isBS ? (
                <>
                  <div className="flex-1 bg-white dark:bg-slate-800 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center">
                    <NepaliDatePicker
                      inputClassName="bg-transparent border-none p-0 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-full"
                      value={fromDate}
                      onChange={(v: string) => setFromDate(v)}
                      options={{ calenderLocale: "ne", valueLocale: "en" }}
                    />
                  </div>
                  <span className="text-slate-300 text-[10px] font-bold shrink-0">→</span>
                  <div className="flex-1 bg-white dark:bg-slate-800 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center">
                    <NepaliDatePicker
                      inputClassName="bg-transparent border-none p-0 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-0 outline-none w-full"
                      value={toDate}
                      onChange={(v: string) => setToDate(v)}
                      options={{ calenderLocale: "ne", valueLocale: "en" }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <Input
                    forceNative
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="flex-1 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                  <span className="text-slate-300 text-[10px] font-bold shrink-0">→</span>
                  <Input
                    forceNative
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="flex-1 h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-[11px] font-bold text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none"
                  />
                </>
              )}
            </div>
          </div>

          {/* Today + AD/BS toggle */}
          <div className="space-y-1.5 flex flex-col justify-end">
            <div className="flex gap-2">
              <button
                onClick={handleToday}
                className="h-9 flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-bold text-slate-600 dark:text-slate-300 rounded-lg hover:bg-slate-50 transition-all uppercase tracking-widest"
              >
                Today
              </button>
              <div className="flex h-9 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
                <button
                  onClick={() => handleModeSwitch("AD")}
                  className={`px-3 rounded-md text-[9px] font-black uppercase transition-all ${!isBS ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600" : "text-slate-400"}`}
                >
                  AD
                </button>
                <button
                  onClick={() => handleModeSwitch("BS")}
                  className={`px-3 rounded-md text-[9px] font-black uppercase transition-all ${isBS ? "bg-white dark:bg-slate-700 shadow-sm text-indigo-600" : "text-slate-400"}`}
                >
                  BS
                </button>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* ── Report body ── */}
      <div
        ref={printRef}
        className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden print:shadow-none print:border-none print:rounded-none"
      >
        {/* Report header */}
        <div className="px-8 py-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight text-slate-900 dark:text-white">
              {companyName}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
              Item History — Purchase &amp; Sales Register
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-3">
              <div>
                <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Period</span>
                <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300">
                  {fromDate} — {toDate}
                </span>
              </div>
              {selectedItemName && (
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Item</span>
                  <span className="text-[11px] font-extrabold text-indigo-600 dark:text-indigo-400">{selectedItemName}</span>
                </div>
              )}
              {partyName && (
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Party</span>
                  <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400">{partyName}</span>
                </div>
              )}
              {txnType !== "all" && (
                <div>
                  <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Type</span>
                  <span className="text-[11px] font-extrabold text-slate-700 dark:text-slate-300 capitalize">{txnType} only</span>
                </div>
              )}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="inline-block px-3 py-1 bg-slate-900 text-white rounded text-[9px] font-black uppercase tracking-widest">
              Official Report
            </div>
            {timestamp && (
              <p className="text-[9px] text-slate-400 mt-2 tabular-nums">{timestamp}</p>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900/80 sticky top-0 z-10 print:bg-slate-50">
              <tr className="border-b-2 border-slate-200 dark:border-slate-700">
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 w-28">Date</th>
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Reference</th>
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Item</th>
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">Party</th>
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right w-24">Qty</th>
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 text-right w-28">Rate</th>
                <th className="px-4 py-3 font-black uppercase tracking-wider text-slate-900 dark:text-white text-right w-36">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {!itemId && !partyName ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-300 dark:text-slate-600">
                      <Search className="w-10 h-10" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">Select a filter to load data</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">
                        Search by item or customer / supplier to view transactions.
                      </span>
                    </div>
                  </td>
                </tr>
              ) : isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-slate-400 text-xs font-semibold animate-pulse">
                    Loading…
                  </td>
                </tr>
              ) : reportData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3 text-slate-300 dark:text-slate-600">
                      <Package className="w-10 h-10" />
                      <span className="text-[11px] font-bold uppercase tracking-widest">No transactions found</span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">No records match the selected filters.</span>
                    </div>
                  </td>
                </tr>
              ) : (
                reportData.map((row: any, idx: number) => {
                  const displayDate = isBS ? (safeADToBS(row.date) || row.date) : row.date;
                  const isSale = SALES_TYPES.includes(row.voucher_type);
                  return (
                    <tr
                      key={idx}
                      className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-2.5 tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap font-medium">
                        {displayDate}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <span className={`text-[9px] font-black uppercase tracking-tight ${isSale ? "text-emerald-600 dark:text-emerald-400" : "text-indigo-500 dark:text-indigo-400"}`}>
                            {row.voucher_type}
                          </span>
                          <span className="font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                            #{row.voucher_number}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-semibold text-slate-800 dark:text-slate-200">
                        {row.item_name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-medium">
                        {row.party_name || <span className="text-slate-400 italic text-[10px]">Cash</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-700 dark:text-slate-300">
                        {Number(row.qty).toLocaleString()}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {Number(row.rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-bold text-slate-900 dark:text-white">
                        {Number(row.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {!isLoading && reportData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-t-2 border-slate-900 dark:border-white">
                  <td colSpan={6} className="px-6 py-3 text-right text-[10px] font-black uppercase tracking-widest">
                    Total ({reportData.length} transactions)
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums font-black text-base">
                    <span className="text-[10px] mr-1 opacity-60 font-normal">NPR</span>
                    {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-end gap-6 text-[10px] text-slate-400">
          <p>This report is system-generated. Unauthorized modification is prohibited.</p>
          <div className="flex flex-col items-center gap-1">
            <div className="w-48 h-px bg-slate-300 dark:bg-slate-700" />
            <span className="font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">Authorized Signatory</span>
          </div>
        </div>

      </div>
    </div>
  );
}
