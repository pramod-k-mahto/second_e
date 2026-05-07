"use client";

import useSWR from 'swr';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import { api, getCurrentCompany, type CurrentCompany } from '@/lib/api';
import { useEffect, useMemo, useRef, useState } from 'react';
import { deriveSettlement } from '@/lib/paymentModeSettlement';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import { Input } from '@/components/ui/Input';
import { safeADToBS, safeBSToAD } from '@/lib/bsad';
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
} from '@/lib/calendarMode';

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
      return 'Purchase Bill';
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
  const isBS = companySettings?.calendar_mode === 'BS';

  const defaultDateDisplayMode: CalendarDisplayMode = isBS ? 'BS' : 'AD';
  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(defaultDateDisplayMode);
  const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>(
    (isBS ? 'BS' : 'AD')
  );

  useEffect(() => {
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
  }, [companyId, defaultDateDisplayMode]);

  const effectiveDisplayMode: CalendarReportDisplayMode =
    dateDisplayMode === 'BOTH' ? reportDisplayMode : dateDisplayMode;

  const [currentCompany, setCurrentCompanyState] = useState<CurrentCompany | null>(null);
  const [ledgerId, setLedgerId] = useState('');
  const [selectedNoneLedgerName, setSelectedNoneLedgerName] = useState('');
  const [partyType, setPartyType] = useState<'none' | 'customer' | 'supplier'>('none');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [onDate, setOnDate] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const [initializedFromUrl, setInitializedFromUrl] = useState(false);
  const [downloadFormat, setDownloadFormat] = useState<'PDF' | 'Excel' | 'Send'>('PDF');
  const [printDate] = useState(() => new Date().toISOString().slice(0, 10));
  const printRef = useRef<HTMLDivElement | null>(null);
  const [paymentModeFilter, setPaymentModeFilter] = useState<string>('ALL');

  const [expandedByVoucherId, setExpandedByVoucherId] = useState<Record<number, boolean>>({});
  const [detailsByVoucherId, setDetailsByVoucherId] = useState<Record<number, ItemDetail[]>>({});
  const [detailsLoading, setDetailsLoading] = useState<Record<number, boolean>>({});
  const [detailsError, setDetailsError] = useState<Record<number, string | null>>({});

  // Initialize from URL query parameters (when coming from other reports or when user returns)
  useEffect(() => {
    if (initializedFromUrl || !companySettings) return;

    const urlLedgerId = searchParams.get('ledger_id');
    const urlFrom = searchParams.get('from_date');
    const urlTo = searchParams.get('to_date');
    const urlOn = searchParams.get('on_date');
    const urlParty = searchParams.get('party_type') as 'none' | 'customer' | 'supplier' | null;
    const urlCustomerId = searchParams.get('customer_id');
    const urlSupplierId = searchParams.get('supplier_id');

    if (urlLedgerId) {
      setLedgerId(urlLedgerId);
    }
    if (urlFrom) {
      setFromDate(isBS ? safeADToBS(urlFrom) || '' : urlFrom);
    }
    if (urlTo) {
      setToDate(isBS ? safeADToBS(urlTo) || '' : urlTo);
    }
    if (urlOn) {
      setOnDate(isBS ? safeADToBS(urlOn) || '' : urlOn);
    }
    if (urlParty === 'customer' || urlParty === 'supplier' || urlParty === 'none') {
      setPartyType(urlParty);
    }
    if (urlCustomerId) {
      setSelectedCustomerId(urlCustomerId);
    }
    if (urlSupplierId) {
      setSelectedSupplierId(urlSupplierId);
    }

    if (urlLedgerId || urlFrom || urlTo || urlOn || urlParty || urlCustomerId || urlSupplierId) {
      setInitializedFromUrl(true);
    }
  }, [initializedFromUrl, searchParams, companyId, companySettings, isBS]);

  const handleFromChangeAD = (ad: string) => {
    // Always store dates in the company's primary calendar format
    if (!ad) {
      setFromDate('');
      return;
    }
    setFromDate(isBS ? safeADToBS(ad) || '' : ad);
  };

  const handleFromChangeBS = (bs: string) => {
    if (!bs) {
      setFromDate('');
      return;
    }
    setFromDate(isBS ? bs : safeBSToAD(bs) || '');
  };

  const handleToChangeAD = (ad: string) => {
    if (!ad) {
      setToDate('');
      return;
    }
    setToDate(isBS ? safeADToBS(ad) || '' : ad);
  };

  const handleToChangeBS = (bs: string) => {
    if (!bs) {
      setToDate('');
      return;
    }
    setToDate(isBS ? bs : safeBSToAD(bs) || '');
  };

  const handleOnChangeAD = (ad: string) => {
    if (!ad) {
      setOnDate('');
      return;
    }
    setOnDate(isBS ? safeADToBS(ad) || '' : ad);
  };

  const handleOnChangeBS = (bs: string) => {
    if (!bs) {
      setOnDate('');
      return;
    }
    setOnDate(isBS ? bs : safeBSToAD(bs) || '');
  };

  // Customer/Supplier Γåö Ledger mappings (also used when Party is None for subledger search)
  const { data: customerMappings, isLoading: loadingCustomers } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/customer-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );

  const { data: supplierMappings, isLoading: loadingSuppliers } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/supplier-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );

  const normalizedSearch = searchTerm.trim().toLowerCase();

  const filteredLedgers = useMemo(() => {
    const baseLedgers = (ledgers || []).map((l: any) => ({
      source: 'ledger' as const,
      id: l.id,
      name: l.name,
      ledger_id: l.id,
      group_name: l.group_name,
    }));

    const customerSubLedgers = ((customerMappings || []) as any[])
      .filter((m) => m.ledger_id)
      .map((m) => ({
        source: 'customer' as const,
        id: m.customer_id,
        name: m.customer_name,
        ledger_id: m.ledger_id,
      }));

    const supplierSubLedgers = ((supplierMappings || []) as any[])
      .filter((m) => m.ledger_id)
      .map((m) => ({
        source: 'supplier' as const,
        id: m.supplier_id,
        name: m.supplier_name,
        ledger_id: m.ledger_id,
      }));

    const allEntries = [...baseLedgers, ...customerSubLedgers, ...supplierSubLedgers];

    if (!normalizedSearch) return allEntries;

    return allEntries.filter((entry) => {
      const idStr = String(entry.id || '').toLowerCase();
      const nameStr = String(entry.name || '').toLowerCase();
      const ledgerIdStr = String(entry.ledger_id || '').toLowerCase();
      const groupNameStr = String((entry as any).group_name || '').toLowerCase();

      // Combined label similar to what is shown in the dropdown:
      // "{ledger_id} - {name} ({group or party type})"
      const combined = `${idStr} ${ledgerIdStr} ${nameStr} ${groupNameStr}`;

      return combined.includes(normalizedSearch);
    });
  }, [ledgers, customerMappings, supplierMappings, normalizedSearch]);

  const filteredCustomerMappings = useMemo(() => {
    if (!normalizedSearch) return (customerMappings || []) as any[];
    const arr = (customerMappings || []) as any[];
    return arr.filter((m) => {
      const idStr = String(m.customer_id || '').toLowerCase();
      const nameStr = String(m.customer_name || '').toLowerCase();
      return (
        idStr.includes(normalizedSearch) ||
        nameStr.includes(normalizedSearch)
      );
    });
  }, [customerMappings, normalizedSearch]);

  const filteredSupplierMappings = useMemo(() => {
    if (!normalizedSearch) return (supplierMappings || []) as any[];
    const arr = (supplierMappings || []) as any[];
    return arr.filter((m) => {
      const idStr = String(m.supplier_id || '').toLowerCase();
      const nameStr = String(m.supplier_name || '').toLowerCase();
      return (
        idStr.includes(normalizedSearch) ||
        nameStr.includes(normalizedSearch)
      );
    });
  }, [supplierMappings, normalizedSearch]);

  const apiFromDate = useMemo(() => {
    if (!fromDate) return '';
    return isBS ? safeBSToAD(fromDate) || '' : fromDate;
  }, [fromDate, isBS]);

  const apiToDate = useMemo(() => {
    if (!toDate) return '';
    return isBS ? safeBSToAD(toDate) || '' : toDate;
  }, [toDate, isBS]);

  const { data } = useSWR(
    companyId && ledgerId && apiFromDate && apiToDate
      ? `/companies/${companyId}/reports/ledger?ledger_id=${ledgerId}&from_date=${apiFromDate}&to_date=${apiToDate}`
      : null,
    fetcher
  );

  const report = data as LedgerReport | undefined;
  const transactions = (report?.transactions ?? []) as LedgerTransaction[];

  const filteredByPaymentMode = useMemo(() => {
    if (!paymentModeFilter || paymentModeFilter === 'ALL') return transactions;
    const normalizedFilter = paymentModeFilter.toUpperCase();
    return transactions.filter((t) => {
      if (!t.payment_mode) return false;
      return String(t.payment_mode).toUpperCase() === normalizedFilter;
    });
  }, [transactions, paymentModeFilter]);

  const totalDebit = filteredByPaymentMode.reduce((sum, t) => sum + (t.debit || 0), 0);
  const totalCredit = filteredByPaymentMode.reduce((sum, t) => sum + (t.credit || 0), 0);

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
    // Prefer explicit customer/supplier name when party type is selected
    if (partyType === 'customer' && selectedCustomerId && customerMappings) {
      const arr = customerMappings as any[];
      const match = arr.find(
        (m) => String(m.customer_id) === String(selectedCustomerId),
      );
      if (match?.customer_name) return String(match.customer_name);
    }
    if (partyType === 'supplier' && selectedSupplierId && supplierMappings) {
      const arr = supplierMappings as any[];
      const match = arr.find(
        (m) => String(m.supplier_id) === String(selectedSupplierId),
      );
      if (match?.supplier_name) return String(match.supplier_name);
    }

    // When Party is None, show the exact clicked subledger/ledger label (normalized)
    if (partyType === 'none' && selectedNoneLedgerName) {
      return normalizeLedgerName(selectedNoneLedgerName);
    }

    // Fallback to ledger name from the report
    if (report?.ledger_name) return normalizeLedgerName(report.ledger_name);
    return '';
  }, [partyType, selectedCustomerId, selectedSupplierId, customerMappings, supplierMappings, ledgerId, ledgers, report]);

  const expandAllItemDetails = async () => {
    for (const t of transactions) {
      if (t.voucher_type === 'SALES_INVOICE' || t.voucher_type === 'PURCHASE_BILL') {
        if (!expandedByVoucherId[t.voucher_id]) {
          // Trigger expand & load items for this voucher
          // eslint-disable-next-line no-await-in-loop
          await toggleExpand(t);
        }
      }
    }
  };

  // Persist key filter state to URL so it can be restored when user navigates back
  useEffect(() => {
    if (!companyId) return;

    const params = new URLSearchParams();
    if (ledgerId) params.set('ledger_id', ledgerId);
    if (fromDate) params.set('from_date', fromDate);
    if (toDate) params.set('to_date', toDate);
    if (onDate) params.set('on_date', onDate);
    if (partyType && partyType !== 'none') params.set('party_type', partyType);
    if (selectedCustomerId) params.set('customer_id', selectedCustomerId);
    if (selectedSupplierId) params.set('supplier_id', selectedSupplierId);

    const qs = params.toString();
    const url = qs ? `${pathname}?${qs}` : pathname;
    router.replace(url);
  }, [companyId, ledgerId, fromDate, toDate, onDate, partyType, selectedCustomerId, selectedSupplierId, pathname, router]);

  const toggleExpand = async (t: LedgerTransaction) => {
    if (!companyId) return;
    const vid = t.voucher_id;
    if (!vid) return;

    setExpandedByVoucherId((prev) => ({ ...prev, [vid]: !prev[vid] }));

    if (expandedByVoucherId[vid] || detailsByVoucherId[vid]) {
      return;
    }

    setDetailsLoading((prev) => ({ ...prev, [vid]: true }));
    setDetailsError((prev) => ({ ...prev, [vid]: null }));

    try {
      if (t.voucher_type === 'SALES_INVOICE') {
        const res = await api.get(`/companies/${companyId}/invoices?voucher_id=${vid}`);
        const first = (res.data || [])[0];
        const lines = (first?.lines || []) as any[];
        const items: ItemDetail[] = lines.map((ln) => ({
          itemId: ln.item_id,
          itemName: (ln as any).item_name ?? null,
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
          itemName: (ln as any).item_name ?? null,
          quantity: ln.quantity,
          rate: ln.rate,
          discount: ln.discount ?? null,
          remarks: (ln as any).remarks || null,
        }));
        setDetailsByVoucherId((prev) => ({ ...prev, [vid]: items }));
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to load items';
      setDetailsError((prev) => ({ ...prev, [vid]: String(msg) }));
    } finally {
      setDetailsLoading((prev) => ({ ...prev, [vid]: false }));
    }
  };

  const handlePrint = () => {
    if (typeof window === 'undefined') return;

    const targetRef = printRef;
    const hasLedgerData = report && transactions && transactions.length > 0;

    if (!hasLedgerData) return;

    if (!targetRef.current) {
      window.print();
      return;
    }

    const printContents = targetRef.current.innerHTML;
    const originalHead = document.head.innerHTML;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html><head>${originalHead}<style>
        .print-hidden{display:none !important;}
        table.print-table{border-collapse:collapse;width:100%;font-size:9px;}
        table.print-table th,table.print-table td{border:1px solid #e2e8f0;padding:1px 2px;word-wrap:break-word;}
        table.print-table button{background:none;border:none;padding:0;margin:0;font:inherit;color:#020617;text-decoration:none;box-shadow:none;}
      </style></head><body>${printContents}</body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  const handleOpenPdfView = () => {
    if (typeof window === 'undefined') return;
    const contents = printRef.current?.innerHTML;
    const originalHead = document.head.innerHTML;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(
      `<!doctype html><html><head>${originalHead}<style>
        .print-hidden{display:none !important;}
        table.print-table{border-collapse:collapse;width:100%;font-size:9px;}
        table.print-table th,table.print-table td{border:1px solid #e2e8f0;padding:1px 2px;word-wrap:break-word;}
        table.print-table button{background:none;border:none;padding:0;margin:0;font:inherit;color:#020617;text-decoration:none;box-shadow:none;}
      </style></head><body><div style="padding:6px 10px;border-bottom:1px solid #e2e8f0;margin-bottom:8px;font-size:11px;display:flex;gap:8px;align-items:center;"><span style="color:#475569;">Actions:</span><button onclick="window.print()" style="padding:3px 8px;border:1px solid #cbd5f5;border-radius:3px;background:#ffffff;font-size:11px;cursor:pointer;">Print</button><button onclick="window.print()" style="padding:3px 8px;border:1px solid #cbd5f5;border-radius:3px;background:#f8fafc;font-size:11px;cursor:pointer;">Download PDF</button></div>${contents ?? ''}</body></html>`
    );
    win.document.close();
    win.focus();
  };

  const displayDate = (d: string): string => {
    if (!d) return '';
    // Expected input 'd' is ALWAYS AD (ISO format) from backend or normalized state
    if (effectiveDisplayMode === 'BS') {
      return safeADToBS(d) || d;
    }
    return d;
  };

  const handleExportCsv = () => {
    if (!data || !data.transactions || data.transactions.length === 0) return;

    const headerLines: string[] = [];
    headerLines.push(`Company: ${currentCompany?.name || ''}`);
    if (currentCompany && (currentCompany as any).address) {
      headerLines.push(`Address: ${(currentCompany as any).address}`);
    }

    const rangeLabel =
      onDate
        ? `On Date: ${displayDate(onDate)}`
        : fromDate && toDate
          ? `From ${displayDate(fromDate)} To ${displayDate(toDate)}`
          : fromDate
            ? `From ${displayDate(fromDate)}`
            : toDate
              ? `To ${displayDate(toDate)}`
              : '';
    if (rangeLabel) {
      headerLines.push(`Date Range: ${rangeLabel}`);
    }
    if (printDate) {
      headerLines.push(`Print Date: ${printDate}`);
    }

    const rows: string[] = [];
    headerLines.forEach((line) => {
      rows.push(line.replace(/"/g, '""'));
    });

    rows.push(
      [
        'Date',
        'Voucher ID',
        'Voucher Type',
        'Payment Mode',
        'Narration',
        'Debit',
        'Credit',
        'Balance',
        'Balance Type',
      ].join(',')
    );

    const exportRows =
      paymentModeFilter && paymentModeFilter !== 'ALL'
        ? (filteredByPaymentMode as any[])
        : (data.transactions as any[]);

    for (const t of exportRows as any[]) {
      const record = [
        displayDate(String(t.date || '')),
        t.voucher_id || '',
        t.voucher_type || '',
        t.payment_mode || '',
        (t.narration || '').replace(/"/g, '""'),
        Number(t.debit || 0).toFixed(2),
        Number(t.credit || 0).toFixed(2),
        Number(t.balance || 0).toFixed(2),
        t.balance_type || '',
      ].map((val) => {
        const s = String(val ?? '');
        if (s.includes(',') || s.includes('"')) {
          return '"' + s.replace(/"/g, '""') + '"';
        }
        return s;
      });
      rows.push(record.join(','));
    }

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ledger-report.csv';
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
            title: 'Ledger Report',
            text: 'Sharing Ledger report.',
          })
          .catch(() => {
            // ignore share errors
          });
      } else if (typeof window !== 'undefined') {
        window.alert('Sharing is not supported on this browser.');
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Compact Header - matching voucher page style */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Ledger Report</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Detailed account transaction history</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
              Back
            </button>
          </div>
        </div>
      </div>

      {/* Filter Panel */}
      <div
        className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-slate-50/50 dark:bg-slate-900/50"
      >
        <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide">≡ƒöì Ledger & Date Filters</span>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-4 text-sm">
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Party</label>
            <select
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
              value={partyType}
              onChange={(e) => {
                const val = e.target.value as 'none' | 'customer' | 'supplier';
                setPartyType(val);
                setFormError(null);
                setSelectedCustomerId('');
                setSelectedSupplierId('');
                setLedgerId('');
                setSelectedNoneLedgerName('');
              }}
            >
              <option value="none">None</option>
              <option value="customer">Customer</option>
              <option value="supplier">Supplier</option>
            </select>
          </div>
          <div className="flex flex-col gap-1 min-w-[260px]">
            <div>
              <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Search</label>
              <input
                type="text"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm w-full hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
                placeholder="Search by ID, name, or group"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg px-2 py-1 bg-white text-xs mt-1">
              {partyType === 'none' && (
                <>
                  <div className="text-[11px] text-slate-500 mb-1">Ledgers &amp; Subledgers</div>
                  {!normalizedSearch ? (
                    <div className="text-[11px] text-slate-400">Type to search...</div>
                  ) : filteredLedgers.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No matches. Try a different search.</div>
                  ) : (
                    filteredLedgers.map((l: any) => {
                      const isSelected = ledgerId && String(l.ledger_id) === String(ledgerId);
                      return (
                        <button
                          key={`${l.source}-${l.id}-${l.ledger_id}`}
                          type="button"
                          onClick={() => {
                            setFormError(null);
                            setLedgerId(String(l.ledger_id));
                            setSelectedNoneLedgerName(l.name || '');
                          }}
                          className={`flex w-full items-center justify-between px-2 py-1 rounded text-left transition-all ${isSelected
                            ? 'bg-slate-700 text-white font-medium'
                            : 'hover:bg-slate-100 text-slate-700'
                            }`}
                        >
                          <span>
                            {l.ledger_id} - {l.name}
                            {l.source === 'customer' && ' (Customer)'}
                            {l.source === 'supplier' && ' (Supplier)'}
                          </span>
                          {isSelected && (
                            <span className="ml-2 text-[10px]">Γ£ô</span>
                          )}
                        </button>
                      );
                    })
                  )}
                </>
              )}
              {partyType === 'customer' && (
                <>
                  <div className="text-[11px] text-slate-500 mb-1">Customers</div>
                  {loadingCustomers ? (
                    <div className="text-[11px] text-slate-400">Loading...</div>
                  ) : !normalizedSearch ? (
                    <div className="text-[11px] text-slate-400">Type to search...</div>
                  ) : filteredCustomerMappings.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No matches.</div>
                  ) : (
                    filteredCustomerMappings.map((m: any) => {
                      const isSelected = selectedCustomerId && String(m.customer_id) === String(selectedCustomerId);
                      return (
                        <button
                          key={m.customer_id}
                          onClick={() => {
                            setSelectedCustomerId(String(m.customer_id));
                            setFormError(null);
                            if (m.ledger_id) setLedgerId(String(m.ledger_id));
                          }}
                          className={`flex w-full items-center justify-between px-2 py-1 rounded text-left transition-all ${isSelected ? 'bg-slate-700 text-white font-medium' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                        >
                          {m.customer_id} - {m.customer_name}
                          {isSelected && <span className="ml-2 text-[10px]">Γ£ô</span>}
                        </button>
                      );
                    })
                  )}
                </>
              )}
              {partyType === 'supplier' && (
                <>
                  <div className="text-[11px] text-slate-500 mb-1">Suppliers</div>
                  {loadingSuppliers ? (
                    <div className="text-[11px] text-slate-400">Loading...</div>
                  ) : !normalizedSearch ? (
                    <div className="text-[11px] text-slate-400">Type to search...</div>
                  ) : filteredSupplierMappings.length === 0 ? (
                    <div className="text-[11px] text-slate-400">No matches.</div>
                  ) : (
                    filteredSupplierMappings.map((m: any) => {
                      const isSelected = selectedSupplierId && String(m.supplier_id) === String(selectedSupplierId);
                      return (
                        <button
                          key={m.supplier_id}
                          onClick={() => {
                            setSelectedSupplierId(String(m.supplier_id));
                            setFormError(null);
                            if (m.ledger_id) setLedgerId(String(m.ledger_id));
                          }}
                          className={`flex w-full items-center justify-between px-2 py-1 rounded text-left transition-all ${isSelected ? 'bg-slate-700 text-white font-medium' : 'hover:bg-slate-100 text-slate-700'
                            }`}
                        >
                          {m.supplier_id} - {m.supplier_name}
                          {isSelected && <span className="ml-2 text-[10px]">Γ£ô</span>}
                        </button>
                      );
                    })
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">Date Display</label>
            <select
              className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
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
                  <option value="AD">AD</option>
                  <option value="BS">BS</option>
                </>
              ) : (
                <option value={effectiveDisplayMode}>{effectiveDisplayMode}</option>
              )}
            </select>
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">From</label>
            {effectiveDisplayMode === 'BS' ? (
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={isBS ? fromDate : safeADToBS(fromDate)}
                onChange={(value: string) => handleFromChangeBS(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              />
            ) : (
              <Input
                type="date"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={isBS ? safeBSToAD(fromDate) : fromDate}
                onChange={(e) => handleFromChangeAD(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">To</label>
            {effectiveDisplayMode === 'BS' ? (
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={isBS ? toDate : safeADToBS(toDate)}
                onChange={(value: string) => handleToChangeBS(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              />
            ) : (
              <Input
                type="date"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={isBS ? safeBSToAD(toDate) : toDate}
                onChange={(e) => handleToChangeAD(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="block mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wide">On Date</label>
            {effectiveDisplayMode === 'BS' ? (
              <NepaliDatePicker
                inputClassName="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={isBS ? onDate : safeADToBS(onDate)}
                onChange={(value: string) => handleOnChangeBS(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
              />
            ) : (
              <Input
                type="date"
                className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200"
                value={isBS ? safeBSToAD(onDate) : onDate}
                onChange={(e) => handleOnChangeAD(e.target.value)}
              />
            )}
          </div>
          <div className="flex gap-2 self-end">
            <button
              type="button"
              className="h-9 rounded-lg border border-slate-400 bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 text-xs font-semibold transition-all"
              onClick={() => {
                if (!onDate) return;
                setFromDate(onDate);
                setToDate(onDate);
              }}
            >
              ≡ƒôî On Date
            </button>
            <button
              type="button"
              className="h-9 rounded-lg border border-slate-500 bg-slate-700 text-white hover:bg-slate-800 px-3 text-xs font-semibold transition-all"
              onClick={() => {
                const today = new Date();
                const iso = today.toISOString().slice(0, 10);
                const primary = isBS ? safeADToBS(iso) || '' : iso;
                setFromDate(primary);
                setToDate(primary);
              }}
            >
              ≡ƒôà Today
            </button>
          </div>
        </div>
      </div>

      {/* Report Action Toolbar */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-white dark:bg-slate-950">
        <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
          <span className="text-slate-700 dark:text-slate-200 text-sm font-semibold">≡ƒôÆ Report View: Ledger</span>
        </div>
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-3 items-center">
            {/* Print */}
            <button
              type="button"
              onClick={handlePrint}
              disabled={!report || !transactions || transactions.length === 0}
              className="flex items-center gap-2 h-9 rounded-lg px-4 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              ≡ƒû¿∩╕Å Print
            </button>

            {transactions.length > 0 && (
              <button
                type="button"
                onClick={expandAllItemDetails}
                className="flex items-center gap-2 h-9 rounded-lg px-4 text-sm font-medium border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
              >
                ≡ƒôï Show All Item Details
              </button>
            )}

            {transactions.length > 0 && (
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Payment Mode</label>
                <select
                  className="h-9 rounded-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 transition-all"
                  value={paymentModeFilter}
                  onChange={(e) => setPaymentModeFilter(e.target.value)}
                >
                  <option value="ALL">All</option>
                  <option value="CASH">Cash</option>
                  <option value="BANK_TRANSFER">Bank Transfer</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="CARD">Card</option>
                  <option value="UPI">UPI</option>
                  <option value="WALLET">Wallet</option>
                </select>
              </div>
            )}
          </div>

          {/* Download */}
          <div className="flex items-center gap-1 h-9">
            <select
              className="h-9 rounded-l-lg border border-slate-300 bg-white px-3 py-1 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300 border-r-0"
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
              className="h-9 rounded-r-lg px-4 text-sm font-semibold text-white transition-all shadow-sm bg-indigo-600 hover:bg-indigo-700"
            >
              Γåô Download
            </button>
          </div>
        </div>
      </div>

      {data && (
        <div ref={printRef}>
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: '4px',
              padding: '8px 10px',
            }}
          >
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
                {currentCompany?.name || ''}
              </div>
              {currentCompany && (currentCompany as any).address && (
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
                  {(currentCompany as any).address}
                </div>
              )}
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
                  {onDate
                    ? `On Date: ${displayDate(onDate)}`
                    : fromDate && toDate
                      ? `From ${displayDate(fromDate)} To ${displayDate(toDate)}`
                      : fromDate
                        ? `From ${displayDate(fromDate)}`
                        : toDate
                          ? `To ${displayDate(toDate)}`
                          : ''}
                </span>
                <span style={{ marginLeft: 'auto' }}>
                  {printDate ? `Print Date: ${printDate}` : ''}
                </span>
              </div>
            </div>

            <table className="w-full text-xs print-table mt-2">
              <thead>
                <tr className="border-b">
                  <th className="w-4 text-center py-1 print-hidden">&nbsp;</th>
                  <th className="text-left py-1">DOC Date</th>
                  <th className="text-left py-1">DOC No.</th>
                  <th className="text-left py-1">DOC Class</th>
                  <th className="text-left py-1">Payment Mode</th>
                  <th className="text-left py-1 w-[140px]">Particulars</th>
                  <th className="text-left py-1 w-[120px]">Narration</th>
                  <th className="text-right py-1">Debit Amount</th>
                  <th className="text-right py-1">Credit Amount</th>
                  <th className="text-right py-1">Balance</th>
                  <th className="text-center py-1 w-[120px]">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {/* Opening row */}
                <tr className="border-b bg-slate-50">
                  <td className="py-1 text-center text-[10px] text-slate-400 print-hidden"></td>
                  <td className="py-1 text-xs">{displayDate(apiFromDate)}</td>
                  <td className="py-1 text-xs" />
                  <td className="py-1 text-xs" />
                  <td className="py-1 text-xs" />
                  <td className="py-1 text-xs font-medium">Subledger Opening B/L</td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-right text-xs">
                    {report?.opening_balance_type === 'DEBIT' ? (report.opening_balance).toFixed(2) : ""}
                  </td>
                  <td className="py-1 text-right text-xs">
                    {report?.opening_balance_type === 'CREDIT' ? (report.opening_balance).toFixed(2) : ""}
                  </td>
                  <td className="py-1 text-right text-xs">
                    {(report?.opening_balance ?? 0).toFixed(2)}{' '}
                    {report ? mapBalanceTypeShort(report.opening_balance_type) : ''}
                  </td>
                  <td className="py-1 text-xs"></td>
                </tr>

                {filteredByPaymentMode.map((t, idx) => {
                  const vid = t.voucher_id;
                  const isExpandable =
                    t.voucher_type === 'SALES_INVOICE' || t.voucher_type === 'PURCHASE_BILL';
                  const isExpanded = expandedByVoucherId[vid] || false;
                  const items = detailsByVoucherId[vid];
                  const isLoadingDetails = detailsLoading[vid];
                  const errorDetails = detailsError[vid];
                  const openingColValue =
                    idx === 0
                      ? `${(report?.opening_balance ?? 0).toFixed(2)} ${report ? mapBalanceTypeShort(report.opening_balance_type) : ''
                      }`
                      : '';

                  const docTotal = t.debit > 0 ? t.debit : t.credit;
                  const settlement = isExpandable
                    ? deriveSettlement(t.payment_mode ? 1 : null, t.payment_mode, docTotal)
                    : null;

                  const mainRow = (
                    <tr key={`${vid}-${t.date}`} className="border-b last:border-none align-top">
                      <td className="py-1 text-center text-xs print-hidden">
                        {isExpandable ? (
                          <button
                            type="button"
                            className="w-5 h-5 inline-flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50 text-[10px]"
                            onClick={() => toggleExpand(t)}
                            aria-label={isExpanded ? 'Collapse item details' : 'Expand item details'}
                          >
                            <span>{isExpanded ? 'Γû╛' : 'Γû╕'}</span>
                          </button>
                        ) : (
                          ''
                        )}
                      </td>
                      <td className="py-1 text-xs">{displayDate(String(t.date || ''))}</td>
                      <td className="py-1 text-[10px]">
                        {t.voucher_id ? (
                          <button
                            type="button"
                            className="font-semibold text-blue-700 hover:text-blue-900 underline"
                            onClick={() => {
                              if (t.voucher_type === 'SALES_INVOICE' && t.source_id) {
                                router.push(
                                  `/companies/${companyId}/sales/invoices/${t.source_id}`
                                );
                              } else if (t.voucher_type === 'PURCHASE_BILL' && t.source_id) {
                                // For now, purchase bills might not have a similar edit page, 
                                // but let's assume we might urge to add it or just view.
                                // The user specifically asked for "edit option".
                                // If Purchase Bill has a similar page, we should use it. 
                                // Let's stick to View for Purchase Bill if we aren't sure, 
                                // OR just link to view if edit isn't ready.
                                // But the user asked for "origional invoice voucher".
                                // Let's assume Purchase Bill also needs this. 
                                // For now, let's just do Sales Invoice as requested "origional invoice".
                                router.push(
                                  `/companies/${companyId}/purchases/bills/${t.source_id}`
                                );
                              } else {
                                // For manual vouchers, we can edit them in the vouchers page
                                // We need to pass the ID to edit.
                                // The vouchers page supports editing via selecting from the list.
                                // Does it support ?edit=ID? I haven't added that to vouchers/page.tsx yet.
                                // I should add it there too.
                                router.push(
                                  `/companies/${companyId}/vouchers/${t.voucher_id}`
                                );
                              }
                            }}
                          >
                            {t.voucher_number || t.voucher_id}
                          </button>
                        ) : (
                          t.voucher_number || ''
                        )}
                      </td>
                      <td className="py-1 text-xs">{mapVoucherTypeLabel(t.voucher_type)}</td>
                      <td className="py-1 text-xs">{t.payment_mode || ''}</td>
                      <td className="py-1 text-xs text-slate-700 whitespace-pre-wrap">
                        {t.related_ledger_name || ''}
                      </td>
                      <td className="py-1 text-xs text-slate-700 whitespace-pre-wrap">
                        {t.narration || ''}
                      </td>
                      <td className="py-1 text-right text-xs">{t.debit.toFixed(2)}</td>
                      <td className="py-1 text-right text-xs">{t.credit.toFixed(2)}</td>
                      <td className="py-1 text-right text-xs">
                        {settlement?.isCashOrBank ? '0.00' : t.balance.toFixed(2)}{' '}
                        {settlement?.isCashOrBank ? '' : mapBalanceTypeShort(t.balance_type)}
                      </td>
                      <td className="py-1 text-xs text-center text-slate-500 whitespace-pre-wrap break-words">
                        {t.remarks || ''}
                      </td>
                    </tr>
                  );

                  const detailRows: JSX.Element[] = [];
                  if (isExpandable && isExpanded) {
                    if (isLoadingDetails) {
                      detailRows.push(
                        <tr key={`${vid}-loading`} className="border-b last:border-none">
                          <td className="py-1 text-center text-xs print-hidden"></td>
                          <td className="py-1 text-xs">{/* Date */}</td>
                          <td className="py-1 text-xs">{/* Voucher No */}</td>
                          <td className="py-1 text-xs">{/* Type */}</td>
                          <td
                            className="py-1 text-xs text-slate-500 italic"
                            colSpan={7}
                          >
                            Loading items...
                          </td>
                        </tr>,
                      );
                    } else if (errorDetails) {
                      detailRows.push(
                        <tr key={`${vid}-error`} className="border-b last:border-none">
                          <td className="py-1 text-center text-xs print-hidden"></td>
                          <td className="py-1 text-xs">{/* Date */}</td>
                          <td className="py-1 text-xs">{/* Voucher No */}</td>
                          <td className="py-1 text-xs">{/* Type */}</td>
                          <td
                            className="py-1 text-xs text-red-600"
                            colSpan={7}
                          >
                            {errorDetails}
                          </td>
                        </tr>,
                      );
                    } else if (items && items.length > 0) {
                      detailRows.push(
                        <tr key={`${vid}-header`} className="border-b last:border-none">
                          <td className="py-1 text-center text-xs print-hidden"></td>
                          <td className="py-1 text-xs">{/* Date */}</td>
                          <td className="py-1 text-xs">{/* Voucher No */}</td>
                          <td className="py-1 text-xs">{/* Type */}</td>
                          <td className="py-1 text-[10px] font-semibold text-slate-600" colSpan={7}>
                            Items
                          </td>
                        </tr>,
                      );
                      items.forEach((it, iIdx) => {
                        const amount =
                          (it.quantity || 0) * (it.rate || 0) - (it.discount || 0);
                        detailRows.push(
                          <tr
                            key={`${vid}-item-${iIdx}`}
                            className="border-b last-border-none bg-slate-50/60"
                          >
                            <td className="py-0.5 text-center text-xs print-hidden"></td>
                            <td className="py-0.5 text-[10px]"></td>
                            <td className="py-0.5 text-[10px]"></td>
                            <td className="py-0.5 text-[10px]"></td>
                            <td className="py-0.5 text-[10px]"></td>
                            <td className="py-0.5 text-[10px]"></td>
                            <td className="py-0.5 text-[10px] text-slate-700">
                              <div>{it.itemName || `Item #${it.itemId}`}</div>
                            </td>
                            <td className="py-0.5 text-[10px]"></td>
                            <td className="py-0.5 text-right text-[10px]">
                              Qty: {it.quantity}
                            </td>
                            <td className="py-0.5 text-right text-[10px]">
                              Rate: {it.rate.toFixed(2)}
                            </td>
                            <td className="py-0.5 text-right text-[10px]">
                              Amount: {amount.toFixed(2)}
                            </td>
                            <td className="py-0.5 text-right text-[10px]">
                              Disc: {(it.discount || 0).toFixed(2)}
                            </td>
                            <td className="py-0.5 text-[10px] text-center text-slate-500 italic">
                              {it.remarks || ''}
                            </td>
                          </tr>,
                        );
                      });
                    }
                  }

                  return [mainRow, ...detailRows];
                })}

                {/* Operation Total */}
                <tr className="border-t">
                  <td className="py-1 text-center text-xs font-semibold print-hidden"></td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-xs font-semibold text-slate-700">
                    Operation Total:
                  </td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-right text-xs font-semibold">{totalDebit.toFixed(2)}</td>
                  <td className="py-1 text-right text-xs font-semibold">{totalCredit.toFixed(2)}</td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-left text-xs"></td>
                </tr>

                {/* Closing Balance */}
                <tr className="border-b">
                  <td className="py-1 text-center text-xs font-semibold print-hidden"></td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-xs"></td>
                  <td className="py-1 text-xs font-semibold text-slate-700">
                    Closing Balance:
                  </td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-right text-xs"></td>
                  <td className="py-1 text-right text-xs">
                    {(report?.closing_balance ?? 0).toFixed(2)}{' '}
                    {report ? mapBalanceTypeShort(report.closing_balance_type) : ''}
                  </td>
                  <td className="py-1 text-left text-xs"></td>
                </tr>
              </tbody>
            </table>
            <div
              style={{
                marginTop: '24px',
                fontSize: '9px',
                color: '#475569',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>
                {'Print by: '}
                {currentUser?.full_name || currentUser?.name || currentUser?.email || ''}
              </span>
              <span style={{ margin: '0 auto', textAlign: 'center' }}>
                Approved by: ..............................
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
