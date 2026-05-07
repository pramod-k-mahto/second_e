"use client";

import useSWR from 'swr';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deriveSettlement } from '@/lib/paymentModeSettlement';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import { Input } from '@/components/ui/Input';
import { safeADToBS, safeBSToAD } from '@/lib/bsad';
import { FormattedDate } from '@/components/ui/FormattedDate';
import { useCalendarSettings } from '@/components/CalendarSettingsContext';
import { writeCalendarReportDisplayMode, readCalendarDisplayMode } from '@/lib/calendarMode';
import { openPrintWindow } from '@/lib/printReport';
import { SearchableSelect } from '@/components/ui/SearchableSelect';


const fetcher = (url: string) => api.get(url).then((res) => res.data);

type OpeningBalanceType = 'DEBIT' | 'CREDIT';

type VoucherType =
  | 'PAYMENT'
  | 'RECEIPT'
  | 'CONTRA'
  | 'JOURNAL'
  | 'SALES_INVOICE'
  | 'PURCHASE_BILL'
  | 'SALES_RETURN'
  | 'PURCHASE_RETURN';

type LedgerTransaction = {
  date: string;
  bill_date?: string | null;
  voucher_id: number;
  voucher_type: VoucherType;
  voucher_number: string | null;
  narration: string | null;
  remarks: string | null;
  payment_mode: string | null;
  debit: number;
  credit: number;
  balance: number;
  balance_type: OpeningBalanceType;
  related_ledger_name?: string | null;
  source_id?: number | null;
};

type LedgerReport = {
  ledger_id: number;
  ledger_name: string;
  opening_balance: number;
  opening_balance_type: OpeningBalanceType;
  transactions: LedgerTransaction[];
  closing_balance: number;
  closing_balance_type: OpeningBalanceType;
};

type ItemDetail = {
  itemId: number;
  itemName?: string | null;
  quantity: number;
  rate: number;
  discount?: number | null;
  remarks?: string | null;
};

const mapVoucherTypeLabel = (v: VoucherType): string => {
  switch (v) {
    case 'PAYMENT':
      return 'Payment Voucher';
    case 'RECEIPT':
      return 'Receipt Voucher';
    case 'CONTRA':
      return 'Contra Voucher';
    case 'JOURNAL':
      return 'Journal Voucher';
    case 'SALES_INVOICE':
      return 'Sales Invoice';
    case 'PURCHASE_BILL':
      return 'Purchase Invoice';
    case 'SALES_RETURN':
      return 'Sales Return';
    case 'PURCHASE_RETURN':
      return 'Purchase Return';
    default:
      return v;
  }
};

const mapBalanceTypeShort = (t: OpeningBalanceType): 'Dr' | 'Cr' =>
  t === 'DEBIT' ? 'Dr' : 'Cr';

const mapPaymentModeLabel = (mode: string | null | undefined): string => {
  if (!mode) return '';
  const normalized = String(mode).toUpperCase();
  switch (normalized) {
    case 'CASH':
      return 'Cash';
    case 'BANK_TRANSFER':
    case 'BANK':
      return 'Bank Transfer';
    case 'CHEQUE':
    case 'CHECK':
      return 'Cheque';
    case 'CARD':
    case 'CREDIT_CARD':
    case 'DEBIT_CARD':
      return 'Card';
    case 'UPI':
      return 'UPI';
    case 'WALLET':
      return 'Wallet';
    default:
      // Fallback: title-case the raw value
      return mode
        .toString()
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
  }
};

export default function LedgerReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: currentUser } = useSWR(
    '/auth/me',
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: 'AD' | 'BS' }>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );

  const { data: companyInfo } = useSWR<{ fiscal_year_start?: string }>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const { data: segments } = useSWR(
    companyId ? `/companies/${companyId}/segments` : null,
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
  
  const { data: customers } = useSWR(
    companyId ? `/companies/${companyId}/customers` : null,
    fetcher
  );
  
  const { data: suppliers } = useSWR(
    companyId ? `/companies/${companyId}/suppliers` : null,
    fetcher
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
  const [onDate, setOnDate] = useState('');

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
          const { from, to } = getSmartDefaultPeriod(activeCo.calendar_mode as any, activeCo);
          setFromDate(from);
          setToDate(to);
        }
      }
    }
  }, [mounted, dbCompany?.id, cc?.calendar_mode]);

  const isBS = effectiveDisplayMode === 'BS';

  const [ledgerId, setLedgerId] = useState('');
  const [selectedNoneLedgerName, setSelectedNoneLedgerName] = useState('');
  const [partyType, setPartyType] = useState<'none' | 'customer' | 'supplier'>('none');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [segmentId, setSegmentId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [projectId, setProjectId] = useState('');

  const searchableOptions = useMemo(() => {
    if (partyType === 'none') {
      return (ledgers || []).map((l: any) => ({
        value: String(l.id),
        label: l.name,
        sublabel: l.group_name || l.account_type || '',
      }));
    } else if (partyType === 'customer') {
      return (customers || []).map((c: any) => ({
        value: String(c.id),
        label: c.name || c.full_name || 'Unnamed Customer',
        sublabel: c.address || c.phone || '',
      }));
    } else {
      return (suppliers || []).map((s: any) => ({
        value: String(s.id),
        label: s.name || s.full_name || 'Unnamed Supplier',
        sublabel: s.address || s.phone || '',
      }));
    }
  }, [partyType, ledgers, customers, suppliers]);

  const handlePartyChange = (val: string) => {
    if (partyType === 'none') {
      setLedgerId(val);
      const l = ledgers?.find((x: any) => x.id === parseInt(val));
      if (l) setSelectedNoneLedgerName(l.name);
    } else if (partyType === 'customer') {
      setSelectedCustomerId(val);
      const cust = customers?.find((x: any) => x.id === parseInt(val));
      if (cust) setLedgerId(String(cust.ledger_id));
    } else {
      setSelectedSupplierId(val);
      const supp = suppliers?.find((x: any) => x.id === parseInt(val));
      if (supp) setLedgerId(String(supp.ledger_id));
    }
  };

  const [formError, setFormError] = useState<string | null>(null);


  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'PDF' | 'Excel' | 'Send'>('PDF');
  const [printDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [printTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));
  const printRef = useRef<HTMLDivElement | null>(null);
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<'summary' | 'details'>('summary');

  const [deprView, setDeprView] = useState<'ledger' | 'depr_summary' | 'depr_detailed'>('ledger');
  const [deprFilterCat, setDeprFilterCat] = useState<string>('ALL');

  const [expandedByVoucherId, setExpandedByVoucherId] = useState<Record<number, boolean>>({});
  const [detailsByVoucherId, setDetailsByVoucherId] = useState<Record<number, ItemDetail[]>>({});
  const [voucherLinesByVoucherId, setVoucherLinesByVoucherId] = useState<Record<number, any[]>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<number, boolean>>({});
  const [detailsError, setDetailsError] = useState<Record<number, string | null>>({});

  // Initialize from URL query parameters (when coming from other reports or when user returns)
  useEffect(() => {
    if (initializedFromUrl || !companySettings) return;

    const lId = searchParams.get('ledger_id');
    const fD = searchParams.get('from_date');
    const tD = searchParams.get('to_date');
    const urlParty = searchParams.get('party_type') as 'none' | 'customer' | 'supplier' | null;
    const urlCustomerId = searchParams.get('customer_id');
    const urlSupplierId = searchParams.get('supplier_id');
    const dId = searchParams.get('department_id');
    const pId = searchParams.get('project_id');
    const sId = searchParams.get('segment_id');


    if (lId) setLedgerId(lId);
    if (fD) setFromDate(fD);
    if (tD) setToDate(tD);
    if (urlParty) setPartyType(urlParty);
    if (urlCustomerId) setSelectedCustomerId(urlCustomerId);
    if (urlSupplierId) setSelectedSupplierId(urlSupplierId);
    if (dId) setDepartmentId(dId);
    if (pId) setProjectId(pId);
    if (sId) setSegmentId(sId);


    if (lId || fD || tD || urlParty || urlCustomerId || urlSupplierId || dId || pId || sId) {
      setInitializedFromUrl(true);
    }
  }, [initializedFromUrl, searchParams, companyId, companySettings, isBS]);

  const apiFromDate = useMemo(() => {
    if (!fromDate) return '';
    return isBS ? safeBSToAD(fromDate) || '' : fromDate;
  }, [fromDate, isBS]);

  const apiToDate = useMemo(() => {
    if (!toDate) return '';
    return isBS ? safeBSToAD(toDate) || '' : toDate;
  }, [toDate, isBS]);

  const { data: report, error, mutate } = useSWR<LedgerReport>(
    companyId && ledgerId && apiFromDate && apiToDate
      ? `/companies/${companyId}/reports/ledger?ledger_id=${ledgerId}&from_date=${apiFromDate}&to_date=${apiToDate}${departmentId ? `&department_id=${departmentId}` : ''}${projectId ? `&project_id=${projectId}` : ''}${segmentId ? `&segment_id=${segmentId}` : ''}`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const transactions = (report?.transactions ?? []) as LedgerTransaction[];

  const filteredByPaymentMode = useMemo(() => {
    if (!paymentModeFilter || paymentModeFilter === 'ALL') return transactions;
    const normalizedFilter = paymentModeFilter.toUpperCase();
    return transactions.filter((t) => {
      if (!t.payment_mode) return false;
      return String(t.payment_mode).toUpperCase() === normalizedFilter;
    });
  }, [transactions, paymentModeFilter]);

  const totalDebit = useMemo(() => {
    return filteredByPaymentMode.reduce((sum, t) => sum + (t.debit || 0), 0);
  }, [filteredByPaymentMode]);

  const totalCredit = useMemo(() => {
    return filteredByPaymentMode.reduce((sum, t) => sum + (t.credit || 0), 0);
  }, [filteredByPaymentMode]);


  const deprAnalysis = useMemo(() => {
    const isDepr = report?.ledger_name?.toLowerCase().includes('depreciation expense');
    if (!isDepr) return { isDepr: false, data: [] as any[], categories: [] as string[] };
    
    const parsed = filteredByPaymentMode.filter(t => t.debit > 0).map(t => {
      const remark = t.remarks || '';
      const parts = remark.split(' | ').map(p => p.trim());
      
      let nameCode = 'Unknown Asset';
      let category = 'Uncategorized';
      let rateInfo = '—';

      if (parts.length >= 3) {
        nameCode = parts[0];
        category = parts[1];
        rateInfo = parts[2];
      } else if (parts.length === 2) {
        nameCode = parts[0];
        if (parts[1].startsWith('Rate:')) {
          rateInfo = parts[1];
        } else {
          category = parts[1];
        }
      } else if (parts.length === 1 && parts[0]) {
        nameCode = parts[0];
      }

      return {
        ...t,
        assetRef: nameCode,
        category,
        rateInfo,
        amount: t.debit || 0
      };
    });
    
    parsed.sort((a, b) => a.category.localeCompare(b.category) || a.assetRef.localeCompare(b.assetRef));
    const categories = Array.from(new Set(parsed.map(d => d.category))).sort();
    
    return { isDepr: true, data: parsed, categories };
  }, [filteredByPaymentMode, report]);

  const headerPartyName = useMemo(() => {
    const normalizeLedgerName = (raw: string) => {
      if (!raw) return '';
      const cutMarkers = [' From ', ' Report', '('];
      let cutIndex = raw.length;
      for (const marker of cutMarkers) {
        const idx = raw.indexOf(marker);
        if (idx !== -1 && idx < cutIndex) {
          cutIndex = idx;
        }
      }
      const base = raw.slice(0, cutIndex);
      return base.trim();
    };
    if (partyType === 'customer' && selectedCustomerId && report) {
      return normalizeLedgerName(report.ledger_name);
    }
    if (partyType === 'supplier' && selectedSupplierId && report) {
      return normalizeLedgerName(report.ledger_name);
    }
    if (partyType === 'none' && selectedNoneLedgerName) {
      return normalizeLedgerName(selectedNoneLedgerName);
    }
    if (report?.ledger_name) return normalizeLedgerName(report.ledger_name);
    return '';
  }, [partyType, selectedCustomerId, selectedSupplierId, selectedNoneLedgerName, report]);

  const collapseAllItemDetails = () => {
    setExpandedByVoucherId({});
  };

  const handleToggleViewMode = async () => {
    if (viewMode === 'summary') {
      setViewMode('details');
      await expandAllItemDetails();
    } else {
      setViewMode('summary');
      collapseAllItemDetails();
    }
  };

  const expandAllItemDetails = async () => {
    const currentExpanded = { ...expandedByVoucherId };
    const currentItems = { ...detailsByVoucherId };
    const currentLines = { ...voucherLinesByVoucherId };

    for (const t of transactions) {
      if (!t.voucher_id) continue;
      const vid = t.voucher_id;
      const alreadyLoaded =
        currentItems[vid] !== undefined || currentLines[vid] !== undefined;

      if (!currentExpanded[vid]) {
        setExpandedByVoucherId((prev) => ({ ...prev, [vid]: true }));
        currentExpanded[vid] = true;
      }

      if (!alreadyLoaded) {
        await fetchVoucherDetails(t);
        if (t.voucher_type === 'SALES_INVOICE' || t.voucher_type === 'PURCHASE_BILL') {
          currentItems[vid] = [];
        } else {
          currentLines[vid] = [];
        }
      }
    }
  };

  useEffect(() => {
    if (!companyId) return;
    const params = new URLSearchParams();
    if (ledgerId) params.set('ledger_id', ledgerId);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (partyType && partyType !== 'none') params.set('party_type', partyType);
    if (selectedCustomerId) params.set('customer_id', selectedCustomerId);
    if (selectedSupplierId) params.set('supplier_id', selectedSupplierId);
    if (segmentId) params.set('segment_id', segmentId);
    if (departmentId) params.set('department_id', departmentId);
    if (projectId) params.set('project_id', projectId);
    window.history.replaceState(null, '', `?${params.toString()}`);
  }, [companyId, ledgerId, fromDate, toDate, partyType, selectedCustomerId, selectedSupplierId, segmentId, departmentId, projectId]);

  const fetchVoucherDetails = async (t: LedgerTransaction) => {
    if (!companyId) return;
    const vid = t.voucher_id;
    if (!vid) return;

    setDetailsLoading((prev) => ({ ...prev, [vid]: true }));
    setDetailsError((prev) => ({ ...prev, [vid]: null }));

    try {
      if (t.voucher_type === 'SALES_INVOICE') {
        const res = await api.get(`/companies/${companyId}/invoices?voucher_id=${vid}`);
        const first = (res.data || [])[0];
        const lines = (first?.lines || []) as any[];
        const items: ItemDetail[] = lines.map((ln) => ({
          itemId: ln.item_id,
          itemName: (ln as any).item_name || (ln as any).item?.name || (ln as any).itemName || null,
          quantity: ln.quantity,
          rate: ln.rate,
          discount: ln.discount ?? null,
          remarks: (ln as any).remarks || null,
        }));
        setDetailsByVoucherId((prev) => ({ ...prev, [vid]: items }));
      } else if (t.voucher_type === 'PURCHASE_BILL') {
        const res = await api.get(`/companies/${companyId}/bills?voucher_id=${vid}`);
        const first = (res.data || [])[0];
        const lines = (first?.lines || []) as any[];
        const items: ItemDetail[] = lines.map((ln) => ({
          itemId: ln.item_id,
          itemName: (ln as any).item_name || (ln as any).item?.name || (ln as any).itemName || null,
          quantity: ln.quantity,
          rate: ln.rate,
          discount: ln.discount ?? null,
          remarks: (ln as any).remarks || null,
        }));
        setDetailsByVoucherId((prev) => ({ ...prev, [vid]: items }));
      } else {
        const res = await api.get(`/companies/${companyId}/vouchers/${vid}`);
        const v = res.data;
        const lines = (v?.lines || []) as any[];
        setVoucherLinesByVoucherId((prev) => ({ ...prev, [vid]: lines }));
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to load details';
      setDetailsError((prev) => ({ ...prev, [vid]: String(msg) }));
    } finally {
      setDetailsLoading((prev) => ({ ...prev, [vid]: false }));
    }
  };

  const toggleExpand = async (t: LedgerTransaction) => {
    if (!companyId) return;
    const vid = t.voucher_id;
    if (!vid) return;

    const currentlyExpanded = expandedByVoucherId[vid];
    const alreadyLoaded =
      detailsByVoucherId[vid] !== undefined ||
      voucherLinesByVoucherId[vid] !== undefined;

    setExpandedByVoucherId((prev) => ({ ...prev, [vid]: !currentlyExpanded }));

    if (!currentlyExpanded && !alreadyLoaded) {
      await fetchVoucherDetails(t);
    }
  };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Ledger Report",
      company: cc?.name || "",
      period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
      orientation: "portrait",
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/60 bg-white dark:bg-slate-950 shadow-sm overflow-visible">
        <div className="px-4 py-2.5 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => router.back()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 hover:border-slate-300 dark:hover:border-slate-600 transition-all shadow-sm"
                title="Back"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button
                type="button"
                onClick={() => router.push(`/companies/${companyId}`)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-100 dark:border-red-900/30 bg-white dark:bg-slate-800 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-all shadow-sm"
                title="Exit to Dashboard"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 hidden sm:block" />

            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none mb-0.5">Ledger Report</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">Account Statement & Transactions</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              disabled={!report || !transactions || transactions.length === 0}
              className="group flex items-center gap-2 h-8 rounded-lg px-3 text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 hover:border-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 transition-all shadow-sm disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" /></svg>
              Print
            </button>
          </div>
        </div>

        <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3 bg-white dark:bg-slate-950/50 border-b border-slate-100 dark:border-slate-800/60">
          <div className="w-[72px] shrink-0">
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Display</label>
            <div className="relative">
              <select
                className="appearance-none h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 pr-6 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
                value={effectiveDisplayMode}
                onChange={(e) => {
                  const next = e.target.value as 'AD' | 'BS';
                  setEffectiveDisplayMode(next);
                  writeCalendarReportDisplayMode(companyId, next);
                  const { from, to } = getSmartDefaultPeriod(next, cc);
                  setFromDate(from);
                  setToDate(to);
                }}
              >
                <option value="AD">AD</option>
                <option value="BS">BS</option>
              </select>
            </div>
          </div>

          <div className="flex-1 min-w-[400px] flex items-end gap-2.5">
            <div className="flex-1 min-w-[135px]">
              <label className="block mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">From Date ({effectiveDisplayMode})</label>
              {effectiveDisplayMode === 'BS' ? (
                <NepaliDatePicker 
                  inputClassName="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
                  value={fromDate}
                  onChange={(v) => setFromDate(v)}
                />
              ) : (
                <Input forceNative
                  type="date"
                  className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
              )}
            </div>
            <div className="flex-1 min-w-[135px]">
              <label className="block mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">To Date ({effectiveDisplayMode})</label>
              {effectiveDisplayMode === 'BS' ? (
                <NepaliDatePicker 
                  inputClassName="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
                  value={toDate}
                  onChange={(v) => setToDate(v)}
                />
              ) : (
                <Input forceNative
                  type="date"
                  className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="w-[120px] shrink-0">
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Party Type</label>
            <div className="relative">
              <select
                className="appearance-none h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 pr-6 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-400 transition-all shadow-sm"
                value={partyType}
                onChange={(e) => {
                  const val = e.target.value as any;
                  setPartyType(val);
                  setLedgerId('');
                  setSelectedCustomerId('');
                  setSelectedSupplierId('');
                }}
              >
                <option value="none">General Ledger</option>
                <option value="customer">Customer</option>
                <option value="supplier">Supplier</option>
              </select>
            </div>
          </div>

          <div className="flex-1 min-w-[200px]">
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
              {partyType === 'none' ? 'Select Ledger' : partyType === 'customer' ? 'Select Customer' : 'Select Supplier'}
            </label>
            <div className="relative">
              <SearchableSelect
                options={searchableOptions}
                value={partyType === 'none' ? ledgerId : partyType === 'customer' ? selectedCustomerId : selectedSupplierId}
                onChange={handlePartyChange}
                placeholder={`Choose ${partyType === 'none' ? 'Ledger' : partyType === 'customer' ? 'Customer' : 'Supplier'}...`}
                triggerClassName="h-8 !py-0 !text-xs font-medium"
              />
            </div>
          </div>


          <div className="flex items-center gap-3 self-end h-8">
            <button
              type="button"
              onClick={() => mutate()}
              className="flex items-center gap-1.5 h-8 rounded-lg px-3 text-[10px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-600 hover:border-indigo-200 transition-all shadow-sm"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              Refresh
            </button>
            <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800" />
            <div className="flex items-center gap-1.5 group">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
              <span className="text-[9px] font-bold text-slate-400 group-hover:text-slate-500 uppercase tracking-widest transition-colors">Statement Ready</span>
            </div>
          </div>
        </div>
      </div>

      {report && (
        <div ref={printRef}>
          <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-md overflow-hidden p-0">
            <div className="p-5">
            <div className="mb-2">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                {cc && (cc as any).logo_url && (
                  <img
                    src={(cc as any).logo_url}
                    alt="Logo"
                    style={{ height: '50px', width: 'auto', objectFit: 'contain' }}
                  />
                )}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '18px',
                      fontWeight: 800,
                      color: '#0f172a',
                      textTransform: 'uppercase',
                      letterSpacing: '0.5px'
                    }}
                  >
                    {cc?.name || ''}
                  </div>
                  {cc && (cc as any).address && (
                    <div
                      style={{
                        fontSize: '10px',
                        color: '#475569',
                        marginTop: '2px'
                      }}
                    >
                      {(cc as any).address}
                    </div>
                  )}
                  {cc && (cc as any).phone && (
                    <div style={{ fontSize: '9px', color: '#64748b' }}>
                      Tel: {(cc as any).phone}
                    </div>
                  )}
                </div>
              </div>
              {headerPartyName && (
                <div
                  style={{
                    marginTop: '4px',
                    fontSize: '12px',
                    fontWeight: 700,
                    textAlign: 'left',
                    color: '#020617',
                  }}
                >
                  Ledger:&nbsp;
                  <span style={{ fontWeight: 800 }}>{headerPartyName}</span>
                </div>
              )}
              <div
                style={{
                  marginTop: '2px',
                  fontSize: '11px',
                  fontWeight: 600,
                  textAlign: 'left',
                  paddingBottom: '2px',
                  borderBottom: '1px solid #e2e8f0',
                }}
              >
                Ledger Report
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
                  {onDate ? (
                    <>On Date: <FormattedDate date={onDate} mode={effectiveDisplayMode} showSuffix /></>
                  ) : fromDate && toDate ? (
                    <>From <FormattedDate date={fromDate} mode={effectiveDisplayMode} showSuffix /> To <FormattedDate date={toDate} mode={effectiveDisplayMode} showSuffix /></>
                  ) : fromDate ? (
                    <>From <FormattedDate date={fromDate} mode={effectiveDisplayMode} showSuffix /></>
                  ) : toDate ? (
                    <>To <FormattedDate date={toDate} mode={effectiveDisplayMode} showSuffix /></>
                  ) : ''}
                </span>
                <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                  {printDate ? <div>Print Date: <FormattedDate date={printDate} mode={effectiveDisplayMode} showSuffix /></div> : ''}
                  <div>Print Time: {printTime}</div>
                </div>
              </div>
            </div>
          </div>
                {deprView === 'ledger' && (
              <div className="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100/80 dark:bg-slate-800/80 sticky top-0 backdrop-blur-sm print:bg-slate-100">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-2 py-2 print-hidden border-r border-slate-200 dark:border-slate-700 w-8 text-center">&nbsp;</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap min-w-[90px]">Voucher Date</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap min-w-[90px]">Bill Date</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap min-w-[100px]">Voucher No.</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">DOC Class</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap">Payment Mode</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap w-[140px]">Particulars</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap w-[120px]">Narration</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap text-right">Debit</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap text-right">Credit</th>
                      <th className="px-3 py-2 font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 border-r border-slate-200 dark:border-slate-700 whitespace-nowrap text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-900">
                    {/* Opening row */}
                    <tr className="border-b bg-slate-50/50 dark:bg-slate-800/10">
                      <td className="py-2 px-2 border-r border-slate-200 dark:border-slate-800 print-hidden"></td>
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap"><FormattedDate date={apiFromDate} mode={effectiveDisplayMode} showSuffix /></td>
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800" />
                       <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-slate-200">Subledger Opening B/L</td>
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800"></td>
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-medium">
                        {report?.opening_balance_type === 'DEBIT' ? (report.opening_balance).toFixed(2) : ""}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-medium">
                        {report?.opening_balance_type === 'CREDIT' ? (report.opening_balance).toFixed(2) : ""}
                      </td>
                      <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-bold text-slate-900 dark:text-slate-100">
                        {(report?.opening_balance ?? 0).toFixed(2)}{' '}
                        {report ? mapBalanceTypeShort(report.opening_balance_type) : ''}
                      </td>
                    </tr>

                    {filteredByPaymentMode.map((t, idx) => {
                      const vid = t.voucher_id;
                      const isExpandable = !!vid;
                      const isExpanded = expandedByVoucherId[vid] || false;
                      const items = detailsByVoucherId[vid];
                      const vLines = voucherLinesByVoucherId[vid];
                      const isLoadingDetails = detailsLoading[vid];
                      const errorDetails = detailsError[vid];

                      const docTotal = t.debit > 0 ? t.debit : t.credit;
                      const settlement = (t.voucher_type === 'SALES_INVOICE' || t.voucher_type === 'PURCHASE_BILL')
                        ? deriveSettlement(t.payment_mode ? 1 : null, t.payment_mode, docTotal)
                        : null;

                      const mainRow = (
                        <tr key={`${vid}-${t.date}-${idx}`} className="border-t border-slate-200 dark:border-slate-800 even:bg-slate-50/50 dark:even:bg-slate-800/20 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors align-top">
                          <td className="py-2 px-2 text-center border-r border-slate-200 dark:border-slate-800 print-hidden">
                            {isExpandable ? (
                              <button
                                type="button"
                                className={`w-5 h-5 inline-flex items-center justify-center rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-[10px] transition-all ${isExpanded ? 'rotate-90' : ''}`}
                                onClick={() => toggleExpand(t)}
                                aria-label={isExpanded ? 'Collapse detail' : 'Expand detail'}
                              >
                                <span>▶</span>
                              </button>
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap"><FormattedDate date={String(t.date || '')} mode={effectiveDisplayMode} showSuffix /></td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                            {(t.bill_date || t.date) ? <FormattedDate date={String(t.bill_date || t.date)} mode={effectiveDisplayMode} showSuffix /> : ''}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800">
                            {t.voucher_id ? (
                              <div className="flex flex-col">
                                <button
                                  type="button"
                                  className="text-left font-bold text-indigo-600 dark:text-indigo-400 hover:underline print-hidden uppercase tracking-tight text-[10px] whitespace-nowrap"
                                  onClick={() => {
                                    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                    if (t.voucher_type === 'SALES_INVOICE' && t.source_id) {
                                      router.push(`/companies/${companyId}/sales/invoices/${t.source_id}?returnUrl=${returnUrl}`);
                                    } else if (t.voucher_type === 'PURCHASE_BILL' && t.source_id) {
                                      router.push(`/companies/${companyId}/purchases/bills/${t.source_id}?returnUrl=${returnUrl}`);
                                    } else {
                                      router.push(`/companies/${companyId}/vouchers/${t.voucher_id}?returnUrl=${returnUrl}`);
                                    }
                                  }}
                                >
                                  {t.voucher_number || t.voucher_id}
                                  {t.reference && (
                                    <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                      ({t.reference})
                                    </span>
                                  )}
                                </button>
                                <span className="hidden print:inline font-bold text-[10px] whitespace-nowrap">
                                  {t.voucher_number || t.voucher_id}
                                  {t.reference && (
                                    <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                      ({t.reference})
                                    </span>
                                  )}
                                </span>
                              </div>
                            ) : (
                                <span className="font-semibold text-[10px] whitespace-nowrap">
                                  {t.voucher_number || ''}
                                  {t.reference && (
                                    <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                      ({t.reference})
                                    </span>
                                  )}
                                </span>
                            )}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-500 font-semibold uppercase tracking-tighter text-[10px] whitespace-nowrap">{mapVoucherTypeLabel(t.voucher_type)}</td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium">{t.payment_mode || ''}</td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 font-medium">
                            <div className="flex flex-col">
                              <span className="truncate max-w-[200px]" title={t.related_ledger_name || ''}>
                                {t.related_ledger_name || ''}
                              </span>
                              {t.remarks && (
                                <span className="text-[10px] text-slate-500 italic mt-0.5 leading-tight">
                                  {t.remarks}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 italic text-[11px] whitespace-pre-wrap max-w-[150px]">
                            {t.narration || ''}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-medium tabular-nums">{(t.debit || 0).toFixed(2)}</td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-medium tabular-nums">{(t.credit || 0).toFixed(2)}</td>
                          <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-right font-bold tabular-nums text-slate-900 dark:text-white">
                            {settlement?.isCashOrBank ? '0.00' : (t.balance || 0).toFixed(2)}{' '}
                            {settlement?.isCashOrBank ? '' : mapBalanceTypeShort(t.balance_type)}
                          </td>
                        </tr>
                      );

                      const detailRows: any[] = [];
                      if (isExpandable && isExpanded) {
                        if (isLoadingDetails) {
                          detailRows.push(
                            <tr key={`${vid}-loading`} className="border-t border-slate-200 dark:border-slate-800 bg-slate-50/30">
                              <td className="py-4 px-2 text-center print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                              <td className="py-4 px-3 text-xs text-slate-400 italic" colSpan={11}>
                                Loading details...
                              </td>
                            </tr>
                          );
                        } else if (errorDetails) {
                          detailRows.push(
                            <tr key={`${vid}-error`} className="border-t border-slate-200 dark:border-slate-800 bg-red-50/30">
                              <td className="py-4 px-2 text-center print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                              <td className="py-4 px-3 text-xs text-red-500 font-medium" colSpan={11}>
                                {errorDetails}
                              </td>
                            </tr>
                          );
                        } else if (items && items.length > 0) {
                          detailRows.push(
                            <tr key={`${vid}-header`} className="bg-slate-100/50 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800">
                              <td className="print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                              <td colSpan={4} className="border-r border-slate-200 dark:border-slate-800"></td>
                              <td className="py-2 px-3 text-[10px] font-bold text-slate-500 uppercase tracking-widest border-r border-slate-200 dark:border-slate-800" colSpan={7}>
                                Itemized Breakdown
                              </td>
                            </tr>
                          );
                          items.forEach((it, iIdx) => {
                            const amount = (it.quantity || 0) * (it.rate || 0) - (it.discount || 0);
                            detailRows.push(
                              <tr key={`${vid}-item-${iIdx}`} className="bg-slate-50/30 dark:bg-slate-900/40 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                                <td className="print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                                <td colSpan={4} className="border-r border-slate-200 dark:border-slate-800"></td>
                                <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 font-medium">
                                  {it.itemName || `Item #${it.itemId}`}
                                  {it.remarks && <div className="text-[9px] text-slate-400 italic mt-0.5">{it.remarks}</div>}
                                </td>
                                <td className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800 text-slate-500 tabular-nums">
                                  {it.quantity} <span className="text-[9px]">x</span> {it.rate.toFixed(2)}
                                </td>
                                <td className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800 text-amber-600 font-medium tabular-nums">
                                  {it.discount ? `- ${it.discount.toFixed(2)}` : ''}
                                </td>
                                <td className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800 font-bold text-slate-800 dark:text-white tabular-nums">
                                  {amount.toFixed(2)}
                                </td>
                                <td colSpan={3}></td>
                              </tr>
                            );
                          });
                        } else if (vLines && vLines.length > 0) {
                          detailRows.push(
                            <tr key={`${vid}-header-lines`} className="bg-indigo-50/40 dark:bg-indigo-900/10 border-t border-slate-200 dark:border-slate-800">
                              <td className="print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                              <td colSpan={4} className="border-r border-slate-200 dark:border-slate-800"></td>
                              <td className="py-2 px-3 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest border-r border-slate-200 dark:border-slate-800" colSpan={7}>
                                Journal / Voucher Attribution
                              </td>
                            </tr>
                          );
                          vLines.forEach((vl, lIdx) => {
                            detailRows.push(
                              <tr key={`${vid}-line-${lIdx}`} className="bg-indigo-50/10 dark:bg-indigo-900/5 border-t border-slate-200 dark:border-slate-800 text-[11px]">
                                <td className="print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                                <td colSpan={4} className="border-r border-slate-200 dark:border-slate-800"></td>
                                <td className="py-2 px-3 border-r border-slate-200 dark:border-slate-800 text-indigo-900 dark:text-indigo-300 font-medium">
                                  {vl.ledger_id} - {vl.ledger_name}
                                  {vl.remarks && <div className="text-[9px] text-slate-400 italic mt-0.5">{vl.remarks}</div>}
                                </td>
                                <td className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 tabular-nums">
                                  {(vl.debit || 0) > 0 ? vl.debit.toFixed(2) : ''}
                                </td>
                                <td className="py-2 px-3 text-right border-r border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 tabular-nums">
                                  {(vl.credit || 0) > 0 ? vl.credit.toFixed(2) : ''}
                                </td>
                                <td colSpan={4}></td>
                              </tr>
                            );
                          });
                        }
                      }

                      return [mainRow, ...detailRows];
                    })}

                    <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-100/80 dark:bg-slate-800/60 font-bold">
                      <td className="py-2.5 px-2 print-hidden border-r border-slate-200 dark:border-slate-800"></td>
                      <td colSpan={8} className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 text-right uppercase tracking-widest text-[10px] text-slate-600 dark:text-slate-400">
                        Total Transactions:
                      </td>
                      <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 text-right tabular-nums text-slate-900 dark:text-white">{totalDebit.toFixed(2)}</td>
                      <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 text-right tabular-nums text-slate-900 dark:text-white">{totalCredit.toFixed(2)}</td>
                      <td className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 text-right tabular-nums text-emerald-600 dark:text-emerald-400">
                         {/* Net change could be shown here if useful */}
                      </td>
                      <td></td>
                    </tr>

                    <tr className="bg-slate-900 text-white dark:bg-white dark:text-slate-900">
                      <td className="py-3 px-2 print-hidden border-r border-slate-700/50 dark:border-slate-200/50"></td>
                      <td colSpan={8} className="py-3 px-3 border-r border-slate-700/50 dark:border-slate-200/50 text-right uppercase tracking-widest text-[11px] font-black">
                        Current Closing Balance:
                      </td>
                      <td colSpan={2} className="py-3 px-3 border-r border-slate-700/50 dark:border-slate-200/50 text-right font-black tabular-nums text-sm">
                        {(report?.closing_balance ?? 0).toFixed(2)}{' '}
                        <span className="text-[10px] opacity-80">{report ? mapBalanceTypeShort(report.closing_balance_type) : ''}</span>
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {deprAnalysis.isDepr && deprView === 'depr_summary' && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-2 px-1 print-hidden">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Category Summary</h3>
                </div>
                <table className="w-full text-xs print-table">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-1.5 px-3">Asset Category</th>
                      <th className="text-right py-1.5 px-3">Depreciation Expense (Dr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deprAnalysis.categories.length === 0 ? (
                      <tr><td colSpan={2} className="text-center py-6 text-slate-500 italic">No depreciation entries found in the current period.</td></tr>
                    ) : (
                      deprAnalysis.categories.map((cat, idx) => {
                        const total = deprAnalysis.data.filter(d => d.category === cat).reduce((sum, d) => sum + d.amount, 0);
                        return (
                          <tr key={cat} className="border-b hover:bg-slate-50/50">
                            <td className="py-2 px-3 font-semibold text-slate-800">{cat}</td>
                            <td className="py-2 px-3 text-right text-amber-700 font-bold">{total.toFixed(2)}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  {deprAnalysis.categories.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                        <td className="py-2 px-3 text-right font-bold uppercase tracking-widest text-[10px]">Grand Total</td>
                        <td className="py-2 px-3 text-right font-bold text-amber-700 text-[13px]">
                          {deprAnalysis.data.reduce((sum, d) => sum + d.amount, 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {deprAnalysis.isDepr && deprView === 'depr_detailed' && (
              <div className="mt-4">
                <div className="flex justify-between items-center mb-3 px-1 print-hidden">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wide">Asset Item Details</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-widest">Filter:</span>
                    <select
                      className="text-xs font-semibold border-2 border-slate-200 dark:border-slate-700 rounded-lg px-2 pr-8 py-1.5 bg-white dark:bg-slate-900 outline-none focus:border-amber-400 transition-colors shadow-sm"
                      value={deprFilterCat}
                      onChange={(e) => setDeprFilterCat(e.target.value)}
                    >
                      <option value="ALL">All Categories</option>
                      {deprAnalysis.categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <table className="w-full text-xs print-table">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-1.5 px-3">Voucher Date</th>
                      <th className="text-left py-1.5 px-3">Voucher No</th>
                      <th className="text-left py-1.5 px-3">Asset Name / Code</th>
                      <th className="text-left py-1.5 px-3">Category</th>
                      <th className="text-left py-1.5 px-3">Rate / Method</th>
                      <th className="text-right py-1.5 px-3">Period Exp (Dr)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeprData.length === 0 ? (
                      <tr><td colSpan={6} className="text-center py-6 text-slate-500 italic">No matching assets found.</td></tr>
                    ) : (
                      filteredDeprData.map((d, i) => (
                        <tr key={i} className="border-b hover:bg-slate-50/50">
                          <td className="py-2 px-3"><FormattedDate date={String(d.date || '')} mode={effectiveDisplayMode} /></td>
                          <td className="py-2 px-3 font-medium text-slate-600">
                            {d.voucher_id ? (
                                <button
                                  type="button"
                                  className="font-semibold text-blue-700 hover:text-blue-900 underline"
                                  onClick={() => {
                                    const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                    router.push(`/companies/${companyId}/vouchers/${d.voucher_id}?returnUrl=${returnUrl}`);
                                  }}
                                >
                                  {d.voucher_number || d.voucher_id}
                                </button>
                              ) : (
                                d.voucher_number || ''
                              )}
                          </td>
                          <td className="py-2 px-3 font-bold text-indigo-700">{d.assetRef}</td>
                          <td className="py-2 px-3 text-[10px] text-slate-500 font-semibold uppercase tracking-widest">{d.category}</td>
                          <td className="py-2 px-3 text-slate-600 font-mono text-[10px] bg-slate-50 border border-slate-100 rounded px-1.5 mx-3">{d.rateInfo}</td>
                          <td className="py-2 px-3 text-right font-bold text-amber-700">{d.amount.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                  {filteredDeprData.length > 0 && (
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-100">
                        <td className="py-2 px-3 text-right font-bold uppercase tracking-widest text-[10px]" colSpan={5}>Visible Total</td>
                        <td className="py-2 px-3 text-right font-bold text-amber-700 text-[13px]">
                          {filteredDeprData.reduce((sum, d) => sum + d.amount, 0).toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
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
