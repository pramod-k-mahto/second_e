"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, createVoucher, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
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
import { openPrintWindow } from '@/lib/printReport';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type FixedAssetItem = {
  id: number; name: string; code: string | null; category: string | null;
  sub_category: string | null;
  purchase_date: string | null; purchase_cost: number; opening_balance: number; quantity_on_hand: number;
  depreciation_rate: number; depreciation_method: string;
  depreciation_for_period: number; accumulated_depreciation: number; book_value: number;
  project_id?: number | null;
  segment_id?: number | null;
  project_name?: string | null;
  segment_name?: string | null;
};
type FixedAssetReport = {
  company_name: string; from_date: string; to_date: string;
  assets: FixedAssetItem[]; total_purchase_cost: number;
  total_depreciation: number; total_book_value: number;
};
type Ledger = { id: number; name: string; group_name?: string };

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

export default function FixedAssetsReportPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();
  const { showToast } = useToast();
  const printRef = useRef<HTMLDivElement | null>(null);

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Fixed Assets & Depreciation",
      company: currentCompany?.name || "",
      period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
      orientation: "landscape",
    });
  };

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: "AD" | "BS" }>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );
  const isBS = companySettings?.calendar_mode === "BS";

  const defaultDateDisplayMode: CalendarDisplayMode = isBS ? "BS" : "AD";
  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(defaultDateDisplayMode);
  const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>(
    (isBS ? "BS" : "AD")
  );

  useEffect(() => {
    if (!companyId) return;
    const fallback: CalendarDisplayMode = isBS ? "BS" : "AD";
    const stored = readCalendarDisplayMode(companyId, fallback);
    setDateDisplayMode(stored);

    if (stored === "BOTH") {
      const reportFallback: CalendarReportDisplayMode = isBS ? "BS" : "AD";
      const reportStored = readCalendarReportDisplayMode(companyId, reportFallback);
      setReportDisplayMode(reportStored);
    } else {
      setReportDisplayMode(stored);
    }
  }, [companyId, defaultDateDisplayMode, isBS]);

  const effectiveDisplayMode: CalendarReportDisplayMode =
    dateDisplayMode === "BOTH" ? reportDisplayMode : dateDisplayMode;

  const [currentCompany, setCurrentCompanyState] = useState<CurrentCompany | null>(null);
  useEffect(() => {
    const cc = getCurrentCompany();
    setCurrentCompanyState(cc);
  }, []);

  const todayAd = new Date().toISOString().slice(0, 10);
  const todayBs = useMemo(() => safeADToBS(todayAd) || "", [todayAd]);

  const nepaliFiscalYearStart = useMemo(() => {
    if (!todayBs) return "";
    const [y, m] = todayBs.split("-").map(Number);
    const fyYear = m >= 4 ? y : y - 1;
    return `${fyYear}-04-01`;
  }, [todayBs]);

  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!companyId || initialized) return;
    const { from, to } = getSmartDefaultPeriod(isBS ? "BS" : "AD");
    setFromDate(from);
    setToDate(to);
    setInitialized(true);
  }, [companyId, isBS, initialized]);
  const [activeTab, setActiveTab] = useState<"register" | "depr_summary" | "depr_detailed">("register");
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [filterDept, setFilterDept] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterSegment, setFilterSegment] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [filterSubCategory, setFilterSubCategory] = useState("");

  const displayDate = (d: string | null): string => {
    if (!d) return "";
    return d;
  };

  const effectiveFromAD = effectiveDisplayMode === "BS" ? safeBSToAD(fromDate) : fromDate;
  const effectiveToAD = effectiveDisplayMode === "BS" ? safeBSToAD(toDate) : toDate;

  // Double-post guard
  const [postedPeriods, setPostedPeriods] = useState<Set<string>>(new Set());
  const periodKey = `${fromDate}__${toDate}`;
  const alreadyPosted = postedPeriods.has(periodKey);

  // Cost center & category data
  const { data: departments = [] } = useSWR<{ id: number; name: string }[]>(
    companyId ? `/companies/${companyId}/departments` : null, fetcher
  );
  const { data: projects = [] } = useSWR<{ id: number; name: string }[]>(
    companyId ? `/companies/${companyId}/projects` : null, fetcher
  );
  const { data: segments = [] } = useSWR<{ id: number; name: string }[]>(
    companyId ? `/companies/${companyId}/segments` : null, fetcher
  );

  const reportUrl = companyId && effectiveFromAD && effectiveToAD
    ? (() => {
      const p = new URLSearchParams({ from_date: effectiveFromAD, to_date: effectiveToAD });
      if (filterDept) p.set("department_id", filterDept);
      if (filterProject) p.set("project_id", filterProject);
      if (filterSegment) p.set("segment_id", filterSegment);
      if (filterCategory) p.set("category", filterCategory);
      if (filterSubCategory) p.set("sub_category", filterSubCategory);
      return `/companies/${companyId}/reports/fixed-assets-depreciation?${p.toString()}`;
    })()
    : null;
  const { data: report, error, isLoading, mutate } = useSWR<FixedAssetReport>(reportUrl, fetcher);

  // Ledgers for modal
  const { data: allLedgers = [] } = useSWR<Ledger[]>(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );
  const deprExpenseCandidates = useMemo(
    () => allLedgers.filter((l) => /depreciation/i.test(l.name) && !/accumulated/i.test(l.name)),
    [allLedgers]
  );
  const accumDeprCandidates = useMemo(
    () => allLedgers.filter((l) =>
      /accumulated.*depreciation|depreciation.*reserve|provision.*depreciation/i.test(l.name)
    ),
    [allLedgers]
  );

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [posting, setPosting] = useState(false);
  const [deprExpenseLedgerId, setDeprExpenseLedgerId] = useState("");
  const [accumDeprLedgerId, setAccumDeprLedgerId] = useState("");
  const [voucherDate, setVoucherDate] = useState(todayAd);
  const [narration, setNarration] = useState("");
  const [postedVoucher, setPostedVoucher] = useState<{ id: number; number: string | null } | null>(null);

  const openModal = () => {
    setVoucherDate(effectiveToAD);
    setNarration(`Depreciation for period ${effectiveFromAD} to ${effectiveToAD}`);
    setDeprExpenseLedgerId(deprExpenseCandidates[0]?.id ? String(deprExpenseCandidates[0].id) : "");
    setAccumDeprLedgerId(accumDeprCandidates[0]?.id ? String(accumDeprCandidates[0].id) : "");
    setPostedVoucher(null);
    setShowModal(true);
  };

  const handlePost = async () => {
    if (!deprExpenseLedgerId || !accumDeprLedgerId) {
      showToast({ title: "Select both ledger accounts", variant: "error" }); return;
    }
    if (deprExpenseLedgerId === accumDeprLedgerId) {
      showToast({ title: "Debit and credit accounts must be different", variant: "error" }); return;
    }
    if (!report || report.total_depreciation <= 0) {
      showToast({ title: "No depreciation amount to post", variant: "error" }); return;
    }
    setPosting(true);
    try {
      const { data: voucher } = await api.post(`/companies/${companyId}/reports/fixed-assets-depreciation/post`, {
        from_date: effectiveFromAD,
        to_date: effectiveToAD,
        voucher_date: voucherDate,
        expense_ledger_id: Number(deprExpenseLedgerId),
        accumulated_dep_ledger_id: Number(accumDeprLedgerId),
        narration: narration,
      });
      setPostedVoucher({ id: voucher.id, number: voucher.voucher_number });
      setPostedPeriods((prev) => new Set([...prev, periodKey]));
      showToast({ title: "Depreciation posted!", description: `Journal Voucher ${voucher.voucher_number || "#" + voucher.id} created with item-wise details.`, variant: "success" });
    } catch (err: any) {
      showToast({ title: "Failed to post", description: err?.response?.data?.detail || err?.message, variant: "error" });
    } finally {
      setPosting(false);
    }
  };

  const assets = report?.assets ?? [];

  // Derive unique categories from loaded report data
  const reportCategories = useMemo(() => {
    const cats = new Set<string>();
    assets.forEach(a => { if (a.category) cats.add(a.category); });
    return Array.from(cats).sort();
  }, [assets]);

  // Derive sub-categories scoped to currently selected category
  const reportSubCategories = useMemo(() => {
    const subs = new Set<string>();
    assets.forEach(a => {
      if (a.sub_category && (!filterCategory || a.category === filterCategory))
        subs.add(a.sub_category);
    });
    return Array.from(subs).sort();
  }, [assets, filterCategory]);

  // Group assets by category
  const assetsByCategory = useMemo(() => {
    if (!assets.length) return {} as Record<string, FixedAssetItem[]>;
    return assets.reduce<Record<string, FixedAssetItem[]>>((acc, a) => {
      const cat = a.category || "Uncategorized";
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(a);
      return acc;
    }, {});
  }, [assets]);

  const maxCost = useMemo(() => Math.max(...assets.map(a => a.purchase_cost), 1), [assets]);
  const projectNameById = useMemo(
    () => new Map((projects || []).map((p) => [p.id, p.name])),
    [projects]
  );
  const segmentNameById = useMemo(
    () => new Map((segments || []).map((s) => [s.id, s.name])),
    [segments]
  );

  const inp = "border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5 text-xs outline-none focus:border-indigo-400 bg-white dark:bg-slate-900 w-full";

  // Shared empty state
  const EmptyState = () => (
    <div className="py-12 text-center">
      <div className="text-3xl mb-3">🏗️</div>
      <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">No Fixed Assets Found</p>
      <p className="text-[11px] text-slate-400 mt-1 max-w-xs mx-auto">
        Mark items as <strong>Fixed Assets</strong> in Inventory → Items to see them here.
      </p>
    </div>
  );

  return (
    <div className="space-y-3" ref={printRef}>

      {/* ── Header ────────────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden print:hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-orange-400 via-amber-400 to-yellow-400" />
        <div className="flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 border border-orange-100 text-base">🏗️</div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Fixed Assets &amp; Depreciation</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">Asset register &amp; depreciation schedule</p>
            </div>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <button onClick={handlePrint} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold shadow-sm transition-all">🖨️ Print</button>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 text-xs font-semibold shadow-sm hover:shadow transition-all duration-150"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                Back
              </button>
              <button
                type="button"
                onClick={() => router.push(`/companies/${companyId}/reports`)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-100 bg-rose-50 hover:bg-rose-100 text-rose-700 dark:border-rose-900/30 dark:bg-rose-900/20 dark:text-rose-400 text-xs font-semibold shadow-sm hover:shadow-md transition-all duration-150"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                Close
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filters ───────────────────────────────────────────── */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm p-3 print:hidden">
        {/* Row 1: Date + actions */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-[140px] space-y-1">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 ml-1">Date Display</label>
            <select
              className="h-9 w-full appearance-none rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-1 text-xs text-slate-700 dark:text-slate-200 hover:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 transition-all shadow-sm disabled:opacity-50"
              value={effectiveDisplayMode}
              onChange={(e) => {
                if (!companyId) return;
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

          <div className="flex items-center gap-2 text-xs pt-4">
            <label className="text-slate-500 font-medium whitespace-nowrap">From</label>
            {effectiveDisplayMode === "BS" ? (
              <NepaliDatePicker
                value={isBS ? fromDate : safeADToBS(fromDate)}
                onChange={(bs: string) => setFromDate(isBS ? bs : safeBSToAD(bs))}
                options={{ calenderLocale: "ne", valueLocale: "en" }}
                // @ts-ignore
                minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                // @ts-ignore
                maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                inputClassName="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all w-[100px]"
              />
            ) : (
              <Input forceNative type="date"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all w-[130px]"
                value={isBS ? safeBSToAD(fromDate) : fromDate}
                min={currentCompany?.fiscal_year_start || ""}
                max={currentCompany?.fiscal_year_end || ""}
                onChange={(e) => setFromDate(isBS ? safeADToBS(e.target.value) : e.target.value)}
              />
            )}
          </div>
          <div className="flex items-center gap-2 text-xs pt-4">
            <label className="text-slate-500 font-medium whitespace-nowrap">To</label>
            {effectiveDisplayMode === "BS" ? (
              <NepaliDatePicker
                value={isBS ? toDate : safeADToBS(toDate)}
                onChange={(bs: string) => setToDate(isBS ? bs : safeBSToAD(bs))}
                options={{ calenderLocale: "ne", valueLocale: "en" }}
                // @ts-ignore
                minDate={currentCompany?.fiscal_year_start ? (safeADToBS(currentCompany.fiscal_year_start) || "") : ""}
                // @ts-ignore
                maxDate={currentCompany?.fiscal_year_end ? (safeADToBS(currentCompany.fiscal_year_end) || "") : ""}
                inputClassName="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all w-[100px]"
              />
            ) : (
              <Input forceNative type="date"
                className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all w-[130px]"
                value={isBS ? safeBSToAD(toDate) : toDate}
                min={currentCompany?.fiscal_year_start || ""}
                max={currentCompany?.fiscal_year_end || ""}
                onChange={(e) => setToDate(isBS ? safeADToBS(e.target.value) : e.target.value)}
              />
            )}
          </div>
          <button onClick={() => mutate()} className="mt-4 px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold transition-all">🔄 Refresh</button>
          <div className="pt-4 flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
              <input type="checkbox" className="h-3.5 w-3.5 accent-indigo-600" checked={groupByCategory} onChange={(e) => setGroupByCategory(e.target.checked)} />
              Group by Category
            </label>
          </div>
          {alreadyPosted ? (
            <span className="ml-auto inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-green-50 border border-green-200 text-green-700 text-[11px] font-semibold">✓ Posted for this period</span>
          ) : (
            <button onClick={openModal} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold shadow-sm transition-all">
              📒 Post Depreciation
            </button>
          )}
        </div>

        {/* Row 2: Cost center filters */}
        <div className="flex flex-wrap items-end gap-3 mt-2.5 pt-2.5 border-t border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0">
            🏢 Cost Centers:
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Department</label>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all min-w-[140px]"
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
            >
              <option value="">All Departments</option>
              {(departments as { id: number; name: string }[]).map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Project</label>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all min-w-[140px]"
              value={filterProject}
              onChange={(e) => setFilterProject(e.target.value)}
            >
              <option value="">All Projects</option>
              {(projects as { id: number; name: string }[]).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Segment</label>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all min-w-[140px]"
              value={filterSegment}
              onChange={(e) => setFilterSegment(e.target.value)}
            >
              <option value="">All Segments</option>
              {(segments as { id: number; name: string }[]).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">Category</label>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all min-w-[140px]"
              value={filterCategory}
              onChange={(e) => { setFilterCategory(e.target.value); setFilterSubCategory(""); }}
            >
              <option value="">All Categories</option>
              {reportCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-semibold text-slate-400 uppercase mb-1">
              Sub Category
              {filterCategory && <span className="text-indigo-400 ml-1 normal-case font-normal">({filterCategory})</span>}
            </label>
            <select
              className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs bg-slate-50 focus:bg-white focus:border-indigo-400 outline-none transition-all min-w-[140px] disabled:opacity-50 disabled:cursor-not-allowed"
              value={filterSubCategory}
              onChange={(e) => setFilterSubCategory(e.target.value)}
              disabled={reportSubCategories.length === 0}
            >
              <option value="">All Sub-Categories</option>
              {reportSubCategories.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          {(filterDept || filterProject || filterSegment || filterCategory || filterSubCategory) && (
            <button
              onClick={() => { setFilterDept(""); setFilterProject(""); setFilterSegment(""); setFilterCategory(""); setFilterSubCategory(""); }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 font-semibold transition-all"
            >
              ✕ Clear Filters
            </button>
          )}
          {(filterDept || filterProject || filterSegment || filterCategory || filterSubCategory) && (
            <div className="flex flex-wrap gap-1.5 ml-1">
              {filterDept && departments.find((d: any) => String(d.id) === filterDept) && (
                <span className="text-[10px] bg-indigo-50 border border-indigo-200 text-indigo-700 px-2 py-0.5 rounded-full font-semibold">
                  Dept: {(departments as any[]).find((d) => String(d.id) === filterDept)?.name}
                </span>
              )}
              {filterProject && projects.find((p: any) => String(p.id) === filterProject) && (
                <span className="text-[10px] bg-violet-50 border border-violet-200 text-violet-700 px-2 py-0.5 rounded-full font-semibold">
                  Project: {(projects as any[]).find((p) => String(p.id) === filterProject)?.name}
                </span>
              )}
              {filterSegment && segments.find((s: any) => String(s.id) === filterSegment) && (
                <span className="text-[10px] bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-700 px-2 py-0.5 rounded-full font-semibold">
                  Segment: {(segments as any[]).find((s) => String(s.id) === filterSegment)?.name}
                </span>
              )}
              {filterCategory && (
                <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-full font-semibold">
                  Category: {filterCategory}
                </span>
              )}
              {filterSubCategory && (
                <span className="text-[10px] bg-orange-50 border border-orange-200 text-orange-700 px-2 py-0.5 rounded-full font-semibold">
                  Sub-Cat: {filterSubCategory}
                </span>
              )}
            </div>
          )}
        </div>

        {/* KPI chips */}
        {report && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {[
              { label: "Total Assets", value: String(assets.length), icon: "🏗️", bg: "bg-slate-50 border-slate-200", text: "text-slate-700" },
              { label: "Total Cost", value: `₹ ${fmt(report?.total_purchase_cost || 0)}`, icon: "💰", bg: "bg-indigo-50 border-indigo-100", text: "text-indigo-700" },
              { label: "Period Depreciation", value: `₹ ${fmt(report?.total_depreciation || 0)}`, icon: "📉", bg: "bg-amber-50 border-amber-100", text: "text-amber-700" },
              { label: "Net Book Value", value: `₹ ${fmt(report?.total_book_value || 0)}`, icon: "✅", bg: "bg-emerald-50 border-emerald-100", text: "text-emerald-700" },
            ].map((k) => (
              <div key={k.label} className={`rounded-lg border px-3 py-2 ${k.bg}`}>
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-sm">{k.icon}</span>
                  <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">{k.label}</span>
                </div>
                <div className={`text-sm font-bold ${k.text}`}>{k.value}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── TAB SWITCHER — always visible ────────────────────── */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit print:hidden">
        {([
          { key: "register", label: "📋 Fixed Assets Register" },
          { key: "depr_summary", label: "📊 Depreciation Summary" },
          { key: "depr_detailed", label: "📉 Depreciation Detailed" },
        ] as const).map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === t.key
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
           WIDGET 1 — FIXED ASSETS REGISTER
         ══════════════════════════════════════════════════════════ */}
      {activeTab === "register" && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          {/* Widget header bar */}
          <div className="h-[3px] bg-gradient-to-r from-indigo-500 to-blue-400" />
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 text-sm font-bold">📋</span>
              <div>
                <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">Fixed Assets Register</h2>
                <p className="text-[10px] text-slate-400">Complete record of all fixed assets — cost, accumulated depreciation &amp; current book value</p>
              </div>
            </div>
            {assets.length > 0 && (
              <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">{assets.length} Assets</span>
            )}
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-xs text-slate-400">
              <div className="w-4 h-4 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
              Loading asset register...
            </div>
          ) : error ? (
            <div className="py-10 text-center text-xs text-red-500">Failed to load. Please check the date range and try again.</div>
          ) : assets.length === 0 ? (
            <EmptyState />
          ) : (
            <>
              {/* Print header */}
              <div className="hidden print:block text-center pt-4 pb-2">
                <p className="font-bold text-base">{report?.company_name}</p>
                <p className="text-sm font-semibold">Fixed Assets Register</p>
                <p className="text-xs text-slate-400">As at {effectiveToAD}</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 uppercase tracking-wide">
                      <th className="text-left px-3 py-2 font-semibold">#</th>
                      <th className="text-left px-3 py-2 font-semibold">Asset Name</th>
                      <th className="text-left px-3 py-2 font-semibold">Code</th>
                      <th className="text-left px-3 py-2 font-semibold">Category</th>
                      <th className="text-left px-3 py-2 font-semibold">Project</th>
                      <th className="text-left px-3 py-2 font-semibold">Segment</th>
                      <th className="text-center px-3 py-2 font-semibold">Purchase Date</th>
                      <th className="text-right px-3 py-2 font-semibold">Qty</th>
                      <th className="text-right px-3 py-2 font-semibold">Original Cost</th>
                      <th className="text-right px-3 py-2 font-semibold">Accum. Depr.</th>
                      <th className="text-right px-3 py-2 font-semibold">Net Book Value</th>
                      <th className="text-left px-3 py-2 font-semibold w-28">Share %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {(groupByCategory
                      ? Object.entries(assetsByCategory).flatMap(([cat, items]) => [
                        { _isCat: true, cat, items } as any,
                        ...items.map((a, i) => ({ ...a, _idx: i + 1 })),
                      ])
                      : assets.map((a, i) => ({ ...a, _idx: i + 1 }))
                    ).map((row: any) => {
                      if (row._isCat) {
                        const catCost = (row.items as FixedAssetItem[]).reduce((s, a) => s + a.purchase_cost, 0);
                        const catBV = (row.items as FixedAssetItem[]).reduce((s, a) => s + a.book_value, 0);
                        const catAcc = (row.items as FixedAssetItem[]).reduce((s, a) => s + a.accumulated_depreciation, 0);
                        return (
                          <tr key={`cat-${row.cat}`} className="bg-indigo-50/60 dark:bg-indigo-900/20">
                            <td colSpan={7} className="px-3 py-1.5 font-bold text-indigo-700 text-[11px] uppercase tracking-wide">
                              📁 {row.cat} <span className="text-indigo-400 font-normal normal-case">({(row.items as FixedAssetItem[]).length} assets)</span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[11px]" />
                            <td className="px-3 py-1.5 text-right font-bold text-indigo-700 text-[11px]">{fmt(catCost)}</td>
                            <td className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[11px]">{fmt(catAcc)}</td>
                            <td className="px-3 py-1.5 text-right font-bold text-emerald-700 text-[11px]">{fmt(catBV)}</td>
                            <td className="px-3 py-1.5" />
                          </tr>
                        );
                      }
                      const asset = row as FixedAssetItem & { _idx: number };
                      const bvPct = asset.purchase_cost > 0 ? (asset.book_value / asset.purchase_cost) * 100 : 0;
                      const sharePct = report!.total_purchase_cost > 0 ? Math.round((asset.purchase_cost / report!.total_purchase_cost) * 100) : 0;
                      const barColor = bvPct > 60 ? "#22c55e" : bvPct > 30 ? "#f59e0b" : "#ef4444";
                      return (
                        <tr key={asset.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="px-3 py-2 text-slate-400 text-[10px]">{asset._idx}</td>
                          <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                            {asset.name}
                            {asset.purchase_date && (
                              <div className="text-[9px] text-slate-400">{displayDate(asset.purchase_date)}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-400 font-mono text-[10px]">{asset.code || "—"}</td>
                          <td className="px-3 py-2">
                            {asset.category
                              ? <span className="text-[10px] bg-indigo-50 text-indigo-600 border border-indigo-100 px-1.5 py-0.5 rounded font-medium">{asset.category}</span>
                              : <span className="text-slate-300 text-[10px]">—</span>}
                          </td>
                          <td className="px-3 py-2 text-slate-500 text-[10px]">
                            {asset.project_name || (asset.project_id ? projectNameById.get(asset.project_id) : null) || "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-500 text-[10px]">
                            {asset.segment_name || (asset.segment_id ? segmentNameById.get(asset.segment_id) : null) || "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-slate-500 text-[10px]">
                            {displayDate(asset.purchase_date) || "—"}
                          </td>
                          <td className="px-3 py-2 text-right font-medium text-slate-500">{asset.quantity_on_hand}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-700 dark:text-slate-200">{fmt(asset.purchase_cost)}</td>
                          <td className="px-3 py-2 text-right text-slate-500">{fmt(asset.accumulated_depreciation)}</td>
                          <td className="px-3 py-2 text-right">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="font-bold text-[11px]" style={{ color: barColor }}>{fmt(asset.book_value)}</span>
                              <span className="text-[9px] text-slate-400">{fmtPct(bvPct)} remaining</span>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full rounded-full bg-indigo-400" style={{ width: `${sharePct}%` }} />
                              </div>
                              <span className="text-[9px] text-slate-400 w-5 text-right shrink-0">{sharePct}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 text-[11px] font-bold text-slate-700 dark:text-slate-100">
                      <td className="px-3 py-2" colSpan={7}>Grand Total ({assets.length} assets)</td>
                      <td className="px-3 py-2 text-right">{assets.reduce((s, a) => s + (a.quantity_on_hand || 0), 0)}</td>
                      <td className="px-3 py-2 text-right text-indigo-700">{fmt(report!.total_purchase_cost)}</td>
                      <td className="px-3 py-2 text-right text-slate-500">{fmt(assets.reduce((s, a) => s + a.accumulated_depreciation, 0))}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{fmt(report!.total_book_value)}</td>
                      <td className="px-3 py-2" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
           WIDGET 2 — DEPRECIATION SUMMARY
         ══════════════════════════════════════════════════════════ */}
      {activeTab === "depr_summary" && (
        <div className="space-y-3">

          {/* Category summary cards */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="h-[3px] bg-gradient-to-r from-amber-400 to-orange-500" />
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 text-sm">📊</span>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">Depreciation by Category</h2>
                  <p className="text-[10px] text-slate-400">Period: {effectiveFromAD} → {effectiveToAD}</p>
                </div>
              </div>
              {report && (
                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">
                  Total ₹ {fmt(report.total_depreciation)}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-amber-500 rounded-full animate-spin" />
                Calculating depreciation...
              </div>
            ) : assets.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {Object.entries(assetsByCategory).map(([cat, items]) => {
                  const catDepr = items.reduce((s, a) => s + a.depreciation_for_period, 0);
                  const catCost = items.reduce((s, a) => s + a.purchase_cost, 0);
                  const pct = report!.total_depreciation > 0 ? (catDepr / report!.total_depreciation) * 100 : 0;
                  return (
                    <div key={cat} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{cat}</p>
                          <p className="text-[10px] text-slate-400">{items.length} asset{items.length !== 1 ? "s" : ""}</p>
                        </div>
                        <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 font-semibold px-1.5 py-0.5 rounded">{fmtPct(pct)} of total</span>
                      </div>
                      <div className="mb-1.5 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-400 rounded-full transition-all" style={{ width: `${Math.max(pct, 2)}%` }} />
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-slate-500">Cost: <strong className="text-slate-700">{fmt(catCost)}</strong></span>
                        <span className="text-amber-700 font-bold">₹ {fmt(catDepr)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
           WIDGET 3 — DEPRECIATION DETAILED
         ══════════════════════════════════════════════════════════ */}
      {activeTab === "depr_detailed" && (
        <div className="space-y-3">
          {/* Detailed depreciation schedule */}
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/40 text-orange-700 text-sm">📉</span>
                <div>
                  <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100">Depreciation Schedule — Detailed</h2>
                  <p className="text-[10px] text-slate-400">Asset-wise depreciation for the selected period</p>
                </div>
              </div>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                <div className="w-4 h-4 border-2 border-slate-200 border-t-orange-500 rounded-full animate-spin" />
                Calculating...
              </div>
            ) : assets.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                <div className="hidden print:block text-center pt-4 pb-2">
                  <p className="font-bold text-base">{report?.company_name}</p>
                  <p className="text-sm font-semibold">Depreciation Report</p>
                  <p className="text-xs text-slate-400">Period: {effectiveFromAD} to {effectiveToAD}</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 uppercase tracking-wide">
                        <th className="text-left px-3 py-2 font-semibold">Asset</th>
                        <th className="text-left px-3 py-2 font-semibold">Category</th>
                        <th className="text-left px-3 py-2 font-semibold">Project</th>
                        <th className="text-left px-3 py-2 font-semibold">Segment</th>
                        <th className="text-center px-3 py-2 font-semibold">Method</th>
                        <th className="text-center px-3 py-2 font-semibold">Rate</th>
                        <th className="text-right px-3 py-2 font-semibold">Opening Value</th>
                        <th className="text-right px-3 py-2 font-semibold">Period Depr.</th>
                        <th className="text-right px-3 py-2 font-semibold">Accum. Depr.</th>
                        <th className="text-right px-3 py-2 font-semibold">Closing Value</th>
                        <th className="text-left px-3 py-2 font-semibold w-24">Depr. %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {(groupByCategory
                        ? Object.entries(assetsByCategory).flatMap(([cat, items]) => [
                          { _isCat: true, cat, items } as any,
                          ...items,
                        ])
                        : assets
                      ).map((row: any) => {
                        if (row._isCat) {
                          const catItems = row.items as FixedAssetItem[];
                          return (
                            <tr key={`cat-depr-${row.cat}`} className="bg-amber-50/60 dark:bg-amber-900/20">
                              <td colSpan={6} className="px-3 py-1.5 font-bold text-amber-700 text-[11px] uppercase tracking-wide">
                                📁 {row.cat}
                              </td>
                              <td className="px-3 py-1.5 text-right font-bold text-slate-600 text-[11px]">
                                {fmt(catItems.reduce((s, a) => s + (a.opening_balance || a.purchase_cost), 0))}
                              </td>
                              <td className="px-3 py-1.5 text-right font-bold text-amber-700 text-[11px]">
                                {fmt(catItems.reduce((s, a) => s + a.depreciation_for_period, 0))}
                              </td>
                              <td className="px-3 py-1.5 text-right font-semibold text-slate-500 text-[11px]">
                                {fmt(catItems.reduce((s, a) => s + a.accumulated_depreciation, 0))}
                              </td>
                              <td className="px-3 py-1.5 text-right font-bold text-emerald-700 text-[11px]">
                                {fmt(catItems.reduce((s, a) => s + a.book_value, 0))}
                              </td>
                              <td className="px-3 py-1.5" />
                            </tr>
                          );
                        }
                        const asset = row as FixedAssetItem;
                        const openVal = asset.opening_balance || asset.purchase_cost;
                        const deprPct = openVal > 0 ? (asset.depreciation_for_period / openVal) * 100 : 0;
                        const isHighRate = asset.depreciation_rate >= 20;
                        const methodLabel =
                          asset.depreciation_method === "straight_line" || asset.depreciation_method === "SLM" ? "SLM" :
                            asset.depreciation_method === "reducing_balance" || asset.depreciation_method === "WDV" ? "WDV" :
                              asset.depreciation_method?.toUpperCase() || "—";
                        return (
                          <tr key={`depr-${asset.id}`} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-3 py-2 font-medium text-slate-800 dark:text-slate-100">
                              {asset.name}
                              {asset.purchase_date && (
                                <div className="text-[9px] text-slate-400">{displayDate(asset.purchase_date)}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-slate-400 text-[10px] italic">{asset.category || "—"}</td>
                            <td className="px-3 py-2 text-slate-500 text-[10px]">
                              {asset.project_name || (asset.project_id ? projectNameById.get(asset.project_id) : null) || "—"}
                            </td>
                            <td className="px-3 py-2 text-slate-500 text-[10px]">
                              {asset.segment_name || (asset.segment_id ? segmentNameById.get(asset.segment_id) : null) || "—"}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{methodLabel}</span>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${isHighRate ? "bg-red-50 text-red-600 border border-red-100" : "bg-indigo-50 text-indigo-600 border border-indigo-100"}`}>
                                {asset.depreciation_rate}%
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right text-slate-600">{fmt(openVal)}</td>
                            <td className="px-3 py-2 text-right font-semibold text-amber-600">{fmt(asset.depreciation_for_period)}</td>
                            <td className="px-3 py-2 text-right text-slate-500">{fmt(asset.accumulated_depreciation)}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">{fmt(asset.book_value)}</td>
                            <td className="px-3 py-2">
                              <div className="flex items-center gap-1">
                                <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${Math.min(deprPct * 3, 100)}%` }} />
                                </div>
                                <span className="text-[9px] text-slate-400 shrink-0 w-7 text-right">{deprPct.toFixed(1)}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600 text-[11px] font-bold text-slate-700 dark:text-slate-100">
                        <td className="px-3 py-2" colSpan={6}>Grand Total</td>
                        <td className="px-3 py-2 text-right">{fmt(assets.reduce((s, a) => s + (a.opening_balance || a.purchase_cost), 0))}</td>
                        <td className="px-3 py-2 text-right text-amber-700">{fmt(report!.total_depreciation)}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{fmt(assets.reduce((s, a) => s + a.accumulated_depreciation, 0))}</td>
                        <td className="px-3 py-2 text-right text-emerald-700">{fmt(report!.total_book_value)}</td>
                        <td className="px-3 py-2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── POST DEPRECIATION MODAL ──────────────────────────── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg overflow-hidden">
            <div className="h-[3px] bg-gradient-to-r from-orange-400 to-amber-400" />
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <span className="text-lg">📒</span>
                <div>
                  <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">Post Depreciation Entry</h2>
                  <p className="text-[10px] text-slate-400">Creates a Journal Voucher in the ledger</p>
                </div>
              </div>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-lg leading-none font-bold">×</button>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Preview table */}
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 overflow-hidden">
                <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-700/50">
                  <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Journal Entry Preview</span>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-[10px] text-slate-400 uppercase">
                      <th className="text-left px-3 py-1.5">Account</th>
                      <th className="text-right px-3 py-1.5">Dr</th>
                      <th className="text-right px-3 py-1.5">Cr</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-700 dark:text-slate-200 font-medium">Depreciation Expense A/c</td>
                      <td className="px-3 py-2 text-right font-bold text-orange-600">{fmt(report?.total_depreciation || 0)}</td>
                      <td className="px-3 py-2 text-right text-slate-300">—</td>
                    </tr>
                    <tr className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-3 py-2 text-slate-500 italic pl-6">&nbsp;&nbsp;Accumulated Depreciation A/c</td>
                      <td className="px-3 py-2 text-right text-slate-300">—</td>
                      <td className="px-3 py-2 text-right font-bold text-emerald-600">{fmt(report?.total_depreciation || 0)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              {/* Ledger picks */}
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Debit — Depreciation Expense Account <span className="text-red-400">*</span></label>
                  <select className={inp} value={deprExpenseLedgerId} onChange={(e) => setDeprExpenseLedgerId(e.target.value)}>
                    <option value="">— Select Ledger —</option>
                    {deprExpenseCandidates.length > 0 && <optgroup label="Suggested">{deprExpenseCandidates.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}</optgroup>}
                    <optgroup label="All Ledgers">{(allLedgers as Ledger[]).map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}</optgroup>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Credit — Accumulated Depreciation Account <span className="text-red-400">*</span></label>
                  <select className={inp} value={accumDeprLedgerId} onChange={(e) => setAccumDeprLedgerId(e.target.value)}>
                    <option value="">— Select Ledger —</option>
                    {accumDeprCandidates.length > 0 && <optgroup label="Suggested">{accumDeprCandidates.map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}</optgroup>}
                    <optgroup label="All Ledgers">{(allLedgers as Ledger[]).map((l) => <option key={l.id} value={String(l.id)}>{l.name}</option>)}</optgroup>
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Voucher Date</label>
                    <Input type="date" className={inp} value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Narration</label>
                    <input type="text" className={inp} value={narration} onChange={(e) => setNarration(e.target.value)} />
                  </div>
                </div>
              </div>
              {postedVoucher && (
                <div className="rounded-lg bg-green-50 border border-green-200 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-xs font-semibold text-green-700">✅ Voucher {postedVoucher?.number || `#${postedVoucher?.id}`} posted!</span>
                  <button onClick={() => router.push(`/companies/${companyId}/vouchers?type=JOURNAL`)} className="text-xs text-green-600 underline font-semibold">View →</button>
                </div>
              )}
            </div>
            <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 bg-slate-50 dark:bg-slate-800/50">
              <button onClick={() => setShowModal(false)} className="px-4 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-all">
                {postedVoucher ? "Close" : "Cancel"}
              </button>
              {!postedVoucher && (
                <button onClick={handlePost} disabled={posting || !deprExpenseLedgerId || !accumDeprLedgerId}
                  className="px-4 py-1.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5">
                  {posting
                    ? <><span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Posting...</>
                    : <>📒 Post Journal Entry</>}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}