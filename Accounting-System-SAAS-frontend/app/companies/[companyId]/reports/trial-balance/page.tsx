"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from '@/lib/api';
import { useMenuAccess } from '@/components/MenuPermissionsContext';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import { Input } from '@/components/ui/Input';
import { safeADToBS, safeBSToAD, isIsoDateString } from '@/lib/bsad';
import { FormattedDate } from '@/components/ui/FormattedDate';
import { 
  readCalendarReportDisplayMode, 
  writeCalendarReportDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
} from "@/lib/calendarMode";
import { openPrintWindow } from '@/lib/printReport';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type TrialBalanceRow = {
  // Hierarchy / metadata
  row_type?: 'GROUP' | 'SUB_GROUP' | 'LEDGER' | 'TOTAL';
  level?: number;
  is_group?: boolean;
  is_ledger?: boolean;
  group_id?: number | null;
  group_name?: string | null;
  primary_group?: string | null;
  group_path?: string[];
  parent_group_id?: number | null;
  parent_group_name?: string | null;
  sort_order?: number | null;

  // Ledger identifiers
  ledger_id: number | null;
  ledger_name: string;

  // Amounts
  opening_debit: number;
  opening_credit: number;
  period_debit: number;
  period_credit: number;
  closing_debit: number;
  closing_credit: number;
};

export default function TrialBalancePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const companyId = params?.companyId as string;
  const printRef = useRef<HTMLDivElement | null>(null);

  const { data: currentUser } = useSWR(
    '/auth/me',
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: 'AD' | 'BS' }>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );

  const { data: company } = useSWR<any>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const { data: departments = [] } = useSWR<{ id: number; name: string }[]>(
    companyId ? `/companies/${companyId}/departments` : null, fetcher
  );
  const { data: projects = [] } = useSWR<{ id: number; name: string }[]>(
    companyId ? `/companies/${companyId}/projects` : null, fetcher
  );
  const { data: segments = [] } = useSWR<{ id: number; name: string }[]>(
    companyId ? `/companies/${companyId}/segments` : null, fetcher
  );

  const [mounted, setMounted] = useState(false);
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cc = mounted ? getCurrentCompany() : initialCC;

  // Sync state if settings change or dbCompany loads
  useEffect(() => {
    if (mounted && companySettings?.calendar_mode) {
      if (companySettings.calendar_mode !== effectiveDisplayMode) {
        setEffectiveDisplayMode(companySettings.calendar_mode as any);
        const { from, to } = getSmartDefaultPeriod(companySettings.calendar_mode as any, companySettings as any);
        setFromDate(from);
        setToDate(to);
      }
    }
  }, [mounted, companySettings?.calendar_mode]);

  const isBS = effectiveDisplayMode === 'BS';

  const [presetMonth, setPresetMonth] = useState<string>('custom');

  const [view, setView] = useState<'summary' | 'details' | 'hierarchical'>('summary');
  const [submittedFromDate, setSubmittedFromDate] = useState<string>('');
  const [submittedToDate, setSubmittedToDate] = useState<string>('');
  const [showOpening, setShowOpening] = useState<boolean>(true);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const [filterDept, setFilterDept] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterSegment, setFilterSegment] = useState("");
  const [submittedFilterDept, setSubmittedFilterDept] = useState("");
  const [submittedFilterProject, setSubmittedFilterProject] = useState("");
  const [submittedFilterSegment, setSubmittedFilterSegment] = useState("");

  const [downloadFormat, setDownloadFormat] = useState<'PDF' | 'Excel' | 'Send'>('PDF');
  const [printDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [printTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
  const [todayActive, setTodayActive] = useState(true);

  const { canRead } = useMenuAccess('reports.trial_balance');

  const toggleGroup = (pathStr: string) => {
    setCollapsedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(pathStr)) next.delete(pathStr);
      else next.add(pathStr);
      return next;
    });
  };

  // Centralized settings handle persistence automatically

  // Read from URL on mount
  useEffect(() => {
    if (!companySettings) return;

    const urlFrom = searchParams.get('from_date');
    const urlTo = searchParams.get('to_date');
    const urlView = searchParams.get('view') as any;

    if (urlFrom) {
      setFromDate(urlFrom);
      setSubmittedFromDate(urlFrom);
    }
    if (urlTo) {
      setToDate(urlTo);
      setSubmittedToDate(urlTo);
    }
    if (urlView && ['summary', 'details', 'hierarchical'].includes(urlView)) {
      setView(urlView);
    }

    if (urlFrom || urlTo || urlView) {
      setInitializedFromUrl(true);
    }
  }, [searchParams, companySettings]);

  // ── Default date range helper (fiscal-year-start → today) ────────────────
  const applyDefaultDates = (markActive = false) => {
    const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(isBS ? "BS" : "AD");
    setFromDate(smartFrom);
    setToDate(smartTo);
    setSubmittedFromDate(smartFrom);
    setSubmittedToDate(smartTo);
    setTodayActive(markActive);
  };

  // ── Set default date range on load ───────────────────────────────────────
  useEffect(() => {
    if (!companySettings) return;
    const urlFrom = searchParams.get('from_date');
    const urlTo = searchParams.get('to_date');
    if (urlFrom || urlTo) return;
    
    applyDefaultDates(true);
  }, [companySettings, company, isBS, searchParams]);

  // Persist to URL
  useEffect(() => {
    if (!companyId) return;

    const params = new URLSearchParams();
    if (submittedFromDate) {
      const adFrom = isBS ? (safeBSToAD(submittedFromDate) || '') : submittedFromDate;
      if (adFrom) params.set('from_date', adFrom);
    }
    if (submittedToDate) {
      const adTo = isBS ? (safeBSToAD(submittedToDate) || '') : submittedToDate;
      if (adTo) params.set('to_date', adTo);
    }
    if (view) {
      params.set('view', view);
    }

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
  }, [companyId, submittedFromDate, submittedToDate, view, pathname, router, isBS]);

  // effectiveDisplayMode is now a state variable initialized above.

  const apiFromDate = useMemo(() => {
    if (!submittedFromDate) return '';
    return isBS ? safeBSToAD(submittedFromDate) || '' : submittedFromDate;
  }, [submittedFromDate, isBS]);

  const apiToDate = useMemo(() => {
    if (!submittedToDate) return '';
    return isBS ? safeBSToAD(submittedToDate) || '' : submittedToDate;
  }, [submittedToDate, isBS]);

  const {
    data,
    isLoading,
    error,
  } = useSWR(
    companyId && apiFromDate && apiToDate
      ? (() => {
          const p = new URLSearchParams({ from_date: apiFromDate, to_date: apiToDate });
          if (submittedFilterDept) p.set("department_id", submittedFilterDept);
          if (submittedFilterProject) p.set("project_id", submittedFilterProject);
          if (submittedFilterSegment) p.set("segment_id", submittedFilterSegment);
          return `/companies/${companyId}/reports/trial-balance?${p.toString()}`;
        })()
      : null,
    fetcher
  );

  const rows: TrialBalanceRow[] = useMemo(() => {
    const base: TrialBalanceRow[] = Array.isArray(data?.rows) ? data.rows : [];

    // Summary view: Primary heads and total rows (excluding ledgers and sub-groups)
    if (view === 'summary') {
      return base.filter((r) => r.row_type === 'GROUP' || r.row_type === 'TOTAL');
    }

    // Details view: show only GROUP/SUB_GROUP heads that have ≥1 non-zero child ledger,
    // plus those non-zero ledgers themselves.
    // NOTE: backend emits some preserved structural groups (Capital Account, Current Assets…)
    // even when all their ledgers are zero — so we CANNOT just pass all group rows through.
    if (view === 'details') {
      const isNonZeroLedger = (r: TrialBalanceRow) =>
        r.row_type === 'LEDGER' && (
          (r.opening_debit  || 0) > 0.005 ||
          (r.opening_credit || 0) > 0.005 ||
          (r.period_debit   || 0) > 0.005 ||
          (r.period_credit  || 0) > 0.005 ||
          (r.closing_debit  || 0) > 0.005 ||
          (r.closing_credit || 0) > 0.005
        );

      // Pass 1 — build sets of active group identifiers from every non-zero ledger
      const activeGroupIds  = new Set<number>();   // direct parent group IDs
      const activeGroupNames = new Set<string>();  // all ancestor group names

      for (const r of base) {
        if (!isNonZeroLedger(r)) continue;

        // Direct parent group id
        if (r.group_id != null) activeGroupIds.add(r.group_id as number);

        // Walk the full group_path to collect every ancestor name
        if (Array.isArray(r.group_path)) {
          for (const name of r.group_path) {
            if (name) activeGroupNames.add(name);
          }
        }
        // Extra fields that also carry ancestor names
        if (r.parent_group_name) activeGroupNames.add(r.parent_group_name);
        if (r.group_name)        activeGroupNames.add(r.group_name);
        if (r.primary_group)     activeGroupNames.add(r.primary_group);
      }

      // Pass 2 — filter base rows
      return base.filter((r) => {
        if (r.row_type === 'TOTAL') return true;

        if (r.row_type === 'GROUP' || r.row_type === 'SUB_GROUP') {
          // Match by direct group_id (covers immediate parent) OR by name (covers ancestors)
          const byId   = r.group_id != null && activeGroupIds.has(r.group_id as number);
          const byName = (r.group_name  && activeGroupNames.has(r.group_name))  ||
                         (r.ledger_name && activeGroupNames.has(r.ledger_name));
          return byId || !!byName;
        }

        if (r.row_type === 'LEDGER') return isNonZeroLedger(r);

        return false;
      });
    }

    // Hierarchical: show everything provided by the backend (includes subgroups and ledgers)
    // Apply Collapse filtering
    return base.filter((r) => {
      if (!r.group_path || r.group_path.length <= 1) return true;
      const pathParts = r.group_path;
      for (let i = 0; i < pathParts.length; i++) {
        const ancestorPath = pathParts.slice(0, i + 1).join(' > ');
        const isCurrentRowGroup = (r.is_group || r.row_type === 'GROUP' || r.row_type === 'SUB_GROUP')
          && pathParts.join(' > ') === ancestorPath;
        if (collapsedPaths.has(ancestorPath) && !isCurrentRowGroup) return false;
      }
      return true;
    });
  }, [data?.rows, view, collapsedPaths]);


  const totals = useMemo(() => {
    const base: TrialBalanceRow[] = Array.isArray(data?.rows) ? data.rows : [];
    return base.reduce(
      (acc, r) => {
        const isGroupOrTotal =
          r.is_group ||
          r.row_type === 'GROUP' ||
          r.row_type === 'SUB_GROUP' ||
          r.row_type === 'TOTAL';
        
        if (isGroupOrTotal) return acc;

        acc.opening_debit += r.opening_debit || 0;
        acc.opening_credit += r.opening_credit || 0;
        acc.period_debit += r.period_debit || 0;
        acc.period_credit += r.period_credit || 0;
        acc.closing_debit += r.closing_debit || 0;
        acc.closing_credit += r.closing_credit || 0;
        return acc;
      },
      {
        opening_debit: 0,
        opening_credit: 0,
        period_debit: 0,
        period_credit: 0,
        closing_debit: 0,
        closing_credit: 0,
      }
    );
  }, [data?.rows]);


  const presetMonths = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    result.push({ value: "this_year", label: "This Year (Full)" });
    result.push({ value: "custom", label: "Custom Range" });
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth() + 1;
    if (effectiveDisplayMode === "BS") {
      const todayBS = safeADToBS(new Date().toISOString().slice(0, 10));
      const parts = todayBS?.split("-") || [];
      if (parts.length >= 3) { currentYear = parseInt(parts[0], 10); currentMonth = parseInt(parts[1], 10); }
    }
    for (let i = 0; i < 24; i++) {
      let y = currentYear; let m = currentMonth - i;
      while (m <= 0) { m += 12; y -= 1; }
      const monthStr = m.toString().padStart(2, "0");
      const val = `${y}-${monthStr}`;
      let label = val;
      if (effectiveDisplayMode === "BS") {
        const bsMonths = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
        label = `${bsMonths[m - 1]} ${y}`;
      } else {
        const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        label = `${adMonths[m - 1]} ${y}`;
      }
      result.push({ value: val, label });
    }
    return result;
  }, [effectiveDisplayMode]);

  const handlePresetMonthChange = (val: string) => {
    setPresetMonth(val);
    if (val === "custom") return;
    if (val === "this_year") {
      const today = new Date();
      const fromISO = `${today.getFullYear()}-01-01`;
      const toISO = `${today.getFullYear()}-12-31`;
      setFromDate(effectiveDisplayMode === "BS" ? safeADToBS(fromISO) || "" : fromISO);
      setToDate(effectiveDisplayMode === "BS" ? safeADToBS(toISO) || "" : toISO);
      return;
    }
    const [yStr, mStr] = val.split("-");
    const y = parseInt(yStr, 10); const m = parseInt(mStr, 10);
    const firstDay = `${y}-${mStr}-01`;
    let lastDay = `${y}-${mStr}-30`;
    if (effectiveDisplayMode !== "BS") {
      const d = new Date(y, m, 0);
      lastDay = `${y}-${mStr}-${d.getDate().toString().padStart(2, "0")}`;
    } else {
      for (let d = 32; d >= 29; d--) {
        const testVal = `${y}-${mStr}-${d.toString().padStart(2, "0")}`;
        if (safeBSToAD(testVal) !== "") { lastDay = testVal; break; }
      }
    }
    setFromDate(firstDay); setToDate(lastDay);
  };

  const handleCustomFromDate = (val: string) => {
    setPresetMonth("custom");
    setTodayActive(false);
    setFromDate(val);
  };

  const handleCustomToDate = (val: string) => {
    setPresetMonth("custom");
    setTodayActive(false);
    setToDate(val);
  };

  const trialBalanceOk = useMemo(() => {
    return (
      Math.abs(totals.closing_debit - totals.closing_credit) < 0.005
    );
  }, [totals.closing_debit, totals.closing_credit]);

  useEffect(() => {
    // setCurrentCompanyState handled by direct cc assignment for responsiveness
  }, []);

  const diffFormattedTotalDisplay = useMemo(() => {
    const raw = totals.closing_debit - totals.closing_credit;
    const abs = Math.abs(raw);
    return raw < 0 ? `(${abs.toFixed(2)})` : abs.toFixed(2);
  }, [totals.closing_debit, totals.closing_credit]);



  const handlePrint = () => {
    if (typeof window === 'undefined') return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Trial Balance",
      company: cc?.name || company?.name || "",
      period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
      orientation: "portrait",
    });
  };

  const handleOpenPdfView = handlePrint;

  const handleExportCsv = () => {
    if (!rows.length) return;

    const headerLines: string[] = [];
    headerLines.push(`Company: ${cc?.name || ''}`);
    if (cc && (cc as any).address) {
      headerLines.push(`Address: ${(cc as any).address}`);
    }


    const rangeLabel =
      fromDate && toDate
        ? `From ${fromDate} To ${toDate}`
        : fromDate
          ? `From ${fromDate}`
          : toDate
            ? `To ${toDate}`
            : '';
    if (rangeLabel) {
      headerLines.push(`Date Range: ${rangeLabel}`);
    }
    if (printDate) {
      headerLines.push(`Print Date: ${printDate}`);
    }

    const csvRows: string[] = [];
    headerLines.forEach((line) => {
      csvRows.push(line.replace(/"/g, '""'));
    });

    csvRows.push(
      [
        'Particular',
        'Opening Dr',
        'Opening Cr',
        'Opening Net',
        'Period Debit',
        'Period Credit',
        'Difference',
        'Closing Dr',
        'Closing Cr',
        'Closing Net',
      ].join(',')
    );

    rows.forEach((r) => {
      const openingNet = (r.opening_debit || 0) - (r.opening_credit || 0);
      const closingNet = (r.closing_debit || 0) - (r.closing_credit || 0);
      const rawDiff = (r.closing_debit || 0) - (r.closing_credit || 0);
      const diffAbs = Math.abs(rawDiff);
      const diffFormatted = rawDiff < 0 ? `(${diffAbs.toFixed(2)})` : diffAbs.toFixed(2);
      const record = [
        String(r.ledger_name || ''),
        Number(r.opening_debit || 0).toFixed(2),
        Number(r.opening_credit || 0).toFixed(2),
        openingNet.toFixed(2),
        Number(r.period_debit || 0).toFixed(2),
        Number(r.period_credit || 0).toFixed(2),
        diffFormatted,
        Number(r.closing_debit || 0).toFixed(2),
        Number(r.closing_credit || 0).toFixed(2),
        closingNet.toFixed(2),
      ].map((val) => {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      csvRows.push(record.join(','));
    });

    const openingNetTotal = totals.opening_debit - totals.opening_credit;
    const closingNetTotal = totals.closing_debit - totals.closing_credit;
    const diffRawTotal = totals.closing_debit - totals.closing_credit;
    const diffAbsTotal = Math.abs(diffRawTotal);
    const diffFormattedTotal =
      diffRawTotal < 0 ? `(${diffAbsTotal.toFixed(2)})` : diffAbsTotal.toFixed(2);
    const totalsRow = [
      'Total',
      totals.opening_debit.toFixed(2),
      totals.opening_credit.toFixed(2),
      openingNetTotal.toFixed(2),
      totals.period_debit.toFixed(2),
      totals.period_credit.toFixed(2),
      diffFormattedTotal,
      totals.closing_debit.toFixed(2),
      totals.closing_credit.toFixed(2),
      closingNetTotal.toFixed(2),
    ].map((val) => {
      const s = String(val ?? '');
      if (s.includes(',') || s.includes('"')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    });
    csvRows.push(totalsRow.join(','));

    const csvContent = csvRows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'trial-balance.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (downloadFormat === 'PDF') {
      handleOpenPdfView();
      return;
    }

    if (downloadFormat === 'Excel') {
      handleExportCsv();
      return;
    }

    if (downloadFormat === 'Send') {
      if (typeof navigator !== 'undefined' && (navigator as any).share) {
        (navigator as any)
          .share({
            title: 'Trial Balance Report',
            text: 'Sharing Trial Balance report.',
          })
          .catch(() => {
            // ignore share errors
          });
      } else if (typeof window !== 'undefined') {
        window.alert('Sharing is not supported on this browser.');
      }
    }
  };

  if (!canRead) {
    return (
      <div className="space-y-4">
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Trial Balance</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Debit & credit balance verification</p>
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
        <p className="text-sm text-slate-600">
          You do not have permission to view the trial balance report for this company.
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v17.25m0 0c-1.472 0-2.882.265-4.185.75M12 20.25c1.472 0 2.882.265 4.185.75M18.75 4.97A48.416 48.416 0 0012 4.5c-2.291 0-4.545.16-6.75.47m13.5 0c1.01.143 2.01.317 3 .52m-3-.52l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.988 5.988 0 01-2.031.352 5.988 5.988 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L18.75 4.971zm-16.5.52c.99-.203 1.99-.377 3-.52m0 0l2.62 10.726c.122.499-.106 1.028-.589 1.202a5.989 5.989 0 01-2.031.352 5.989 5.989 0 01-2.031-.352c-.483-.174-.711-.703-.59-1.202L5.25 4.971z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Trial Balance</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Debit & credit balance verification</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
              Exit
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <div
        className="relative z-[60] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm bg-slate-50/50 dark:bg-slate-900/50"
      >
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-t-2xl">
          <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide">🔍 Report Filters</span>
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
                className="h-8 rounded-l-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-300 border-r-0"
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
        <div className="p-4 flex flex-wrap items-end gap-4 text-sm overflow-visible">
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date Display</label>
            <select
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-300 transition-all"
                value={effectiveDisplayMode}
                onChange={(e) => {
                  const next = e.target.value as 'AD' | 'BS';
                  setEffectiveDisplayMode(next);
                  writeCalendarReportDisplayMode(companyId, next);
                  const { from, to } = getSmartDefaultPeriod(next, cc);
                  setFromDate(from);
                  setToDate(to);
                  setSubmittedFromDate(from);
                  setSubmittedToDate(to);
                }}
            >
                <option value="AD">AD</option>
                <option value="BS">BS</option>
            </select>
          </div>

          <div className="relative z-50">
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">From ({effectiveDisplayMode})</label>
            {isBS ? (
                <NepaliDatePicker 
                  inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={fromDate}
                  onChange={(val) => { setFromDate(val); setTodayActive(false); }}
                  options={{calenderLocale:'ne', valueLocale:'en'}}
                  // @ts-ignore
                  minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                  // @ts-ignore
                  maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                />
            ) : (
                <Input forceNative
                  type="date"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={fromDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => { setFromDate(e.target.value); setTodayActive(false); }}
                />
            )}
          </div>
          <div className="relative z-50">
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">To ({effectiveDisplayMode})</label>
            {isBS ? (
                <NepaliDatePicker 
                  inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={toDate}
                  onChange={(val) => { setToDate(val); setTodayActive(false); }}
                  options={{calenderLocale:'ne', valueLocale:'en'}}
                  // @ts-ignore
                  minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                  // @ts-ignore
                  maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                />
            ) : (
                <Input forceNative
                  type="date"
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  value={toDate}
                  min={cc?.fiscal_year_start || ""}
                  max={cc?.fiscal_year_end || ""}
                  onChange={(e) => { setToDate(e.target.value); setTodayActive(false); }}
                />
            )}
          </div>

          <div className="flex gap-2 self-end">
            <button
              type="button"
              className={`h-9 rounded-lg border px-3 text-xs font-semibold transition-all ${todayActive
                  ? 'border-blue-400 bg-blue-50 text-blue-700 hover:bg-blue-100'
                  : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}
            onClick={() => {
                applyDefaultDates(true);
              }}
            >
              📅 Today
            </button>
          </div>
          <div className="self-end">
            <label className="flex items-center gap-2 text-xs font-medium text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                className="h-4 w-4 accent-blue-600"
                checked={showOpening}
                onChange={(e) => setShowOpening(e.target.checked)}
              />
              <span>Opening Balance</span>
            </label>
          </div>

          {/* Apply Button */}
          <button
            type="button"
            className="h-9 rounded-lg px-5 text-sm font-semibold text-white self-end transition-all duration-200 shadow-sm hover:shadow active:scale-95 bg-indigo-600 hover:bg-indigo-700"
            onClick={() => {
              setSubmittedFromDate(fromDate);
              setSubmittedToDate(toDate);
              setSubmittedFilterDept(filterDept);
              setSubmittedFilterProject(filterProject);
              setSubmittedFilterSegment(filterSegment);
            }}
          >
            ✓ Apply
          </button>

          <div className="ml-auto flex items-center gap-2 self-end">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">View:</span>
            <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 border border-slate-200">
              {(['summary', 'details', 'hierarchical'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setView(v)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 ${view === v
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-white'
                    }`}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Cost center filters */}
        <div className="px-4 py-3 flex flex-wrap items-end gap-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 rounded-b-2xl">
          <div className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider shrink-0 mb-1">
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
          {(filterDept || filterProject || filterSegment) && (
            <button
              onClick={() => { setFilterDept(""); setFilterProject(""); setFilterSegment(""); }}
              className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-500 hover:bg-red-50 hover:border-red-200 hover:text-red-600 font-semibold transition-all mb-0.5"
            >
              ✕ Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Date range info strip (kept, doesn't take extra space) */}
      {submittedFromDate && submittedToDate && (
        <div className="flex items-center gap-2 text-xs text-slate-600 bg-indigo-50 border border-indigo-200 rounded-lg px-3 py-2 print-hidden">
          <span>📆</span>
          <span>Trial balance from <strong>{submittedFromDate}</strong> to <strong>{submittedToDate}</strong></span>
        </div>
      )}

      {
        isLoading && (
          <div className="flex items-center gap-3 text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4">
            <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            Loading trial balance...
          </div>
        )
      }

      {
        error && !isLoading && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-700 flex items-center gap-3">
            <span className="text-xl">⚠️</span>
            <span>Failed to load trial balance. Please try again.</span>
          </div>
        )
      }

      {
        !isLoading && !error && submittedFromDate && submittedToDate && !rows.length && (
          <div className="text-sm text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 flex items-center gap-3">
            <span className="text-xl">📭</span>
            <span>No records found for the selected date range.</span>
          </div>
        )
      }

      {
        !!rows.length && (
          <div ref={printRef}>
          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden p-0">
            <div className="p-5">
              <div className="mb-2">
                <div
                  style={{
                    textAlign: 'center',
                    fontSize: '16px',
                    fontWeight: 800,
                    paddingBottom: '2px',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  {cc?.name || ''}
                </div>
                {cc && (cc as any).address && (
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: '9px',
                      color: '#475569',
                      paddingTop: '2px',
                      paddingBottom: '2px',
                      borderBottom: '1px solid #e2e8f0',
                    }}
                  >
                    {(cc as any).address}
                  </div>
                )}
                <div
                  style={{
                    marginTop: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textAlign: 'left',
                    paddingBottom: '2px',
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >
                  Trial Balance
                </div>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '9px',
                    color: '#64748b',
                    paddingTop: '2px',
                  }}
                >
                  <span>
                    {submittedFromDate && submittedToDate
                      ? <>From <FormattedDate date={submittedFromDate} mode={effectiveDisplayMode} /> To <FormattedDate date={submittedToDate} mode={effectiveDisplayMode} /></>
                      : ''}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                    {printDate ? <div>Print Date: <FormattedDate date={printDate || ""} mode={effectiveDisplayMode} /></div> : ""}
                    <div>Print Time: {printTime}</div>
                  </div>
                </div>
              </div>
              <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/80 sticky top-0 backdrop-blur-sm print:bg-slate-100 z-10">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 align-bottom">Particular</th>
                      {showOpening && (
                        <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 text-center align-bottom" colSpan={2}>
                          Opening Balance
                        </th>
                      )}
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 text-center align-bottom" colSpan={2}>
                        Current Period
                      </th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 text-right align-bottom">
                        Closing Balance
                      </th>
                    </tr>
                    <tr className="border-b border-slate-200 dark:border-slate-700 text-[10px] bg-slate-50/50 dark:bg-slate-800/50">
                      <th className="px-3 py-1 border-r border-slate-200 dark:border-slate-700" />
                      {showOpening && (
                        <>
                          <th className="px-3 py-1 text-right border-r border-slate-200 dark:border-slate-700 text-slate-500">Dr</th>
                          <th className="px-3 py-1 text-right border-r border-slate-200 dark:border-slate-700 text-slate-500">Cr</th>
                        </>
                      )}
                      <>
                        <th className="px-3 py-1 text-right border-r border-slate-200 dark:border-slate-700 text-slate-500">Debit</th>
                        <th className="px-3 py-1 text-right border-r border-slate-200 dark:border-slate-700 text-slate-500">Credit</th>
                      </>
                      <th className="px-3 py-1 text-right text-slate-500">Net Amount</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {rows.map((r, idx) => {
                      const closingNet = (r.closing_debit || 0) - (r.closing_credit || 0);
                      const closingAbs = Math.abs(closingNet);
                      const closingFormatted = closingAbs === 0
                        ? '0.00'
                        : `${closingAbs.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${closingNet > 0 ? 'Dr' : 'Cr'}`;

                      const isGroupRow = r.is_group || r.row_type === 'GROUP' || r.row_type === 'SUB_GROUP';
                      const rowClass = isGroupRow
                        ? `border-b border-slate-200 dark:border-slate-800 transition-colors ${r.level === 0 ? 'bg-slate-100/50 dark:bg-slate-800/40' : 'bg-slate-50/30 dark:bg-slate-800/10'} hover:bg-emerald-50 dark:hover:bg-emerald-900/20`
                        : 'border-b border-slate-100 dark:border-slate-800 even:bg-slate-50/20 dark:even:bg-slate-800/5 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors';
                      
                      const amountClass = isGroupRow
                        ? 'px-3 py-2 text-right font-bold text-slate-900 dark:text-slate-100 border-r border-slate-200 dark:border-slate-800 tabular-nums'
                        : 'px-3 py-2 text-right text-slate-700 dark:text-slate-300 border-r border-slate-100 dark:border-slate-800 tabular-nums';
                      
                      const isLedgerRow = r.is_ledger || r.row_type === 'LEDGER';

                      return (
                        <tr key={r.ledger_id ?? `${r.group_name || 'row'}-${r.level}-${idx}`} className={rowClass}>
                          <td className="px-3 py-2 border-r border-slate-200 dark:border-slate-800">
                            <div
                              style={{ marginLeft: (view === 'summary' ? Math.min(r.level || 0, 1) : (view === 'details' || view === 'hierarchical' ? (r.level || 0) : 0)) * 24 }}
                              className={
                                isGroupRow
                                  ? 'inline-flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100'
                                  : 'inline-flex items-center gap-2 text-slate-700 dark:text-slate-300'
                              }
                            >
                              {isGroupRow ? (
                                <>
                                  {view === 'hierarchical' && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const path = r.group_path ? r.group_path.join(' > ') : (r.group_name || '');
                                        toggleGroup(path);
                                      }}
                                      className="w-4 h-4 flex items-center justify-center text-slate-500 hover:text-indigo-600 border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 transition-all shadow-sm print:hidden text-[10px]"
                                    >
                                      {collapsedPaths.has(r.group_path ? r.group_path.join(' > ') : (r.group_name || '')) ? '▶' : '▼'}
                                    </button>
                                  )}
                                  <span className="tracking-tight uppercase text-[11px] font-black">{r.group_name || r.ledger_name}</span>
                                </>
                              ) : isLedgerRow && r.ledger_id ? (
                                <span
                                  role="button"
                                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer text-left"
                                  onClick={() => {
                                    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                    router.push(
                                      `/companies/${companyId}/reports/ledger?ledger_id=${r.ledger_id}&from_date=${apiFromDate}&to_date=${apiToDate}&returnUrl=${returnUrl}`
                                    );
                                  }}
                                >
                                  {r.ledger_name}
                                </span>
                              ) : (
                                <span>{r.ledger_name}</span>
                              )}
                            </div>
                          </td>
                          {showOpening && (
                            <>
                              <td className={amountClass}>{Number(r.opening_debit || 0).toFixed(2)}</td>
                              <td className={amountClass}>{Number(r.opening_credit || 0).toFixed(2)}</td>
                            </>
                          )}
                          <>
                            <td className={amountClass}>
                              {Number(r.period_debit || 0).toFixed(2)}
                            </td>
                            <td className={amountClass}>
                              {Number(r.period_credit || 0).toFixed(2)}
                            </td>
                          </>
                          <td className={`px-3 py-2 text-right font-bold tabular-nums ${closingNet > 0 ? 'text-indigo-600 dark:text-indigo-400' : closingNet < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>
                            {closingFormatted}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px]">
                    {!trialBalanceOk && (
                      <tr className="bg-rose-500 text-white border-t border-rose-600">
                        <td className="px-3 py-2 border-r border-rose-600/50 italic font-medium" colSpan={showOpening ? 3 : 1}>
                          ⚠ Difference in Trial Balance
                        </td>
                        {showOpening && <></>}
                        <td className="px-3 py-2 text-right border-r border-rose-600/50 font-black tabular-nums">
                          {totals.period_debit < totals.period_credit ? (totals.period_credit - totals.period_debit).toFixed(2) : ''}
                        </td>
                        <td className="px-3 py-2 text-right border-r border-rose-600/50 font-black tabular-nums">
                          {totals.period_credit < totals.period_debit ? (totals.period_debit - totals.period_credit).toFixed(2) : ''}
                        </td>
                        <td className="px-3 py-2 text-right font-black tabular-nums">
                          {Math.abs(totals.closing_debit - totals.closing_credit).toFixed(2)}
                        </td>
                      </tr>
                    )}
                    <tr className="font-black">
                      <td className="px-3 py-3 text-right uppercase tracking-[0.2em] border-r border-slate-700 dark:border-slate-200">Grand Total</td>
                      {showOpening && (
                        <>
                          <td className="px-3 py-3 text-right border-r border-slate-700 dark:border-slate-200 tabular-nums">{totals.opening_debit.toFixed(2)}</td>
                          <td className="px-3 py-3 text-right border-r border-slate-700 dark:border-slate-200 tabular-nums">{totals.opening_credit.toFixed(2)}</td>
                        </>
                      )}
                      <>
                        <td className="px-3 py-3 text-right border-r border-slate-700 dark:border-slate-200 tabular-nums">
                          {totals.period_debit.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-right border-r border-slate-700 dark:border-slate-200 tabular-nums">
                          {totals.period_credit.toFixed(2)}
                        </td>
                      </>
                      <td className="px-3 py-3 text-right tabular-nums bg-emerald-500 text-white">
                        {Math.max(totals.closing_debit, totals.closing_credit).toFixed(2)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800 text-[10px] text-slate-500 flex justify-between items-center bg-slate-50/30 dark:bg-slate-900/40">
              <span className="font-medium">
                {'Printed by: '}
                <span className="text-slate-800 dark:text-slate-200">{currentUser?.full_name || currentUser?.name || currentUser?.email || ''}</span>
              </span>
              <span className="font-semibold uppercase tracking-widest text-[9px] opacity-70">
                Authorized Signature: ........................................
              </span>
            </div>
          </div>
        </div>
        )}
    </div>
  );
}
