"use client";

import useSWR, { mutate as globalMutate } from 'swr';
import { useParams, useRouter, useSearchParams, usePathname } from 'next/navigation';
import React, { useEffect, useLayoutEffect, useMemo, useState, useRef, type FormEvent } from 'react';
import { useToast } from '@/components/ui/Toast';
import {
  api,
  createManualVoucher,
  createCashVoucher,
  CashVoucherSimpleCreate,
  fetchCounterpartyLedgers,
  type CounterpartyLedger,
  getApiErrorMessage,
  postVoucherAllocations,
  type VoucherAllocationCreate,
  Voucher,
  getCurrentCompany,
  getSmartDefaultPeriod,
} from '@/lib/api';
import type { DepartmentRead, ProjectRead, SegmentRead } from '@/lib/cost-centers/types';
import type { EmployeeRead } from '@/lib/payroll/types';
import { safeADToBS, safeBSToAD } from '@/lib/bsad';

import { STANDARD_LEDGER_CODES } from '@/lib/standardLedgers';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/Table';
import { FormattedDate } from '@/components/ui/FormattedDate';
import { useCalendarSettings } from '@/components/CalendarSettingsContext';
import { Pagination } from '@/components/ui/Pagination';
import {
  NepaliDatePicker,
  NepaliDatePickerProps,
} from 'nepali-datepicker-reactjs';
import 'nepali-datepicker-reactjs/dist/index.css';

import { AgainstModal } from '@/components/vouchers/AgainstModal';
import { Modal } from '@/components/ui/Modal';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { QuickDepartmentModal } from '@/components/cost-centers/QuickDepartmentModal';
import { QuickProjectModal } from '@/components/cost-centers/QuickProjectModal';
import { QuickSegmentModal } from '@/components/cost-centers/QuickSegmentModal';
import { QuickEmployeeModal } from '@/components/payroll/QuickEmployeeModal';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function formatApiError(detail: unknown): string[] {
  if (!detail) return [];

  if (typeof detail === 'string') {
    return [detail];
  }

  if (Array.isArray(detail)) {
    return (detail as any[]).map((e) => {
      if (!e) return '';
      if (typeof e === 'string') return e;
      if (typeof e === 'object' && 'msg' in e && (e as any).msg) {
        return String((e as any).msg);
      }
      return JSON.stringify(e);
    });
  }

  if (typeof detail === 'object' && (detail as any).msg) {
    return [String((detail as any).msg)];
  }

  try {
    return [JSON.stringify(detail)];
  } catch {
    return ['An unknown error occurred'];
  }
}

type Role = 'user' | 'admin' | 'superadmin';

type MenuAccessLevel = 'deny' | 'read' | 'update' | 'full';

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
  parent_id: number | null;
  sort_order: number | null;
  is_active: boolean;
};

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

type Company = {
  id: number;
  name: string;
  cost_center_mode: null | 'single' | 'double' | 'triple';
  cost_center_single_dimension: 'department' | 'project' | 'segment' | null;
  enable_cost_centers_in_vouchers: boolean;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
};


type Line = {
  ledger_id: string;
  debit: string;
  credit: string;
  department_id?: string;
  project_id?: string;
  segment_id?: string;
  remarks: string;
  employee_id?: string;
};

export default function VouchersPage() {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const companyId = params?.companyId as string;
  const searchParams = useSearchParams();
  const initialType = (searchParams.get('type') as string) || 'PAYMENT';
  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const initialFilterFromDate = (searchParams.get('from') as string) || smartFrom;
  const initialFilterToDate = (searchParams.get('to') as string) || smartTo;
  const initialFilterType = (searchParams.get('ftype') as string) || 'ALL';
  const initialFilterPaymentModeId = (searchParams.get('pmode') as string) || 'ALL';
  const initialPage = Number(searchParams.get('page') || '1') || 1;


  const { data: currentUser } = useSWR('/auth/me', (url: string) =>
    api.get(url).then((res) => res.data)
  );
  const currentRole = (currentUser?.role as Role | undefined) || 'user';
  const isSuperAdmin = currentRole === 'superadmin';

  const { data: vouchers, mutate } = useSWR(
    companyId ? `/companies/${companyId}/vouchers` : null,
    fetcher
  );

  const { calendarMode, displayMode, reportMode, setDisplayMode, isLoading: isSettingsLoading } = useCalendarSettings();
  const isBS = calendarMode === 'BS';

  const dateDisplayMode = displayMode;

  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: ledgerGroups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  const { showToast } = useToast();



  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const { data: departments } = useSWR<DepartmentRead[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const { data: projects } = useSWR<ProjectRead[]>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );
  
  const { data: segments } = useSWR<SegmentRead[]>(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );


  const { data: menus } = useSWR<MenuRead[]>(
    companyId ? '/admin/users/menus' : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: userMenuAccess } = useSWR<UserMenuAccessEntry[]>(
    currentUser && companyId
      ? `/admin/users/${currentUser.id}/companies/${companyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const accessLevelByMenuId = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || 'full';
      });
    }
    return map;
  }, [userMenuAccess]);

  const accessLevelByCode: Record<string, MenuAccessLevel> = useMemo(() => {
    const map: Record<string, MenuAccessLevel> = {};
    if (menus) {
      menus.forEach((m) => {
        if (!m.code) return;
        const level = accessLevelByMenuId[m.id];
        map[m.code] = level || 'full';
      });
    }
    return map;
  }, [menus, accessLevelByMenuId]);

  const getAccessLevel = (menuCode: string): MenuAccessLevel => {
    if (isSuperAdmin) return 'full';
    return accessLevelByCode[menuCode] ?? 'full';
  };

  const getVoucherMenuCode = (voucherType: string): string => {
    switch (voucherType) {
      case 'PAYMENT':
        return 'accounting.voucher.payment';
      case 'RECEIPT':
        return 'accounting.voucher.receipt';
      case 'CONTRA':
        return 'accounting.voucher.contra';
      case 'JOURNAL':
      default:
        return 'accounting.voucher.journal';
    }
  };

  const today = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const [date, setDate] = useState(today);
  const [billDate, setBillDate] = useState(today);

  // If we are in BS mode and date is still the initial AD date, convert it to BS.
  useEffect(() => {
    if (isBS && date === today) {
      const bs = safeADToBS(today);
      if (bs) setDate(bs);
    }
  }, [isBS, today, date]);

  const [type, setType] = useState(initialType);

  const currentVoucherMenuCode = getVoucherMenuCode(type);
  const currentVoucherAccessLevel = getAccessLevel(currentVoucherMenuCode);
  const canCreateOrEditVoucher =
    currentVoucherAccessLevel === 'update' || currentVoucherAccessLevel === 'full';
  const canDeleteVoucher = currentVoucherAccessLevel === 'full';

  const initialSyncRef = useRef(false);
  const prevTypeRef = useRef(type);

  useEffect(() => {
    if (!initialSyncRef.current && !isSettingsLoading && calendarMode) {
      if (type === 'JOURNAL') {
        setDisplayMode('BS');
      } else {
        setDisplayMode(calendarMode as any);
      }
      initialSyncRef.current = true;
    }
  }, [calendarMode, isSettingsLoading, setDisplayMode, type]);

  useEffect(() => {
    if (initialSyncRef.current && type !== prevTypeRef.current) {
      if (type === 'JOURNAL') {
        setDisplayMode('BS');
      } else if (calendarMode) {
        setDisplayMode(calendarMode as any);
      }
      prevTypeRef.current = type;
    }
  }, [type, calendarMode, setDisplayMode]);

  const { data: customerMappings } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/customer-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );

  const { data: supplierMappings } = useSWR(
    companyId
      ? `/companies/${companyId}/reports/supplier-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );

  // Consolidated ledger/party display mapping
  const partyLabelByLedgerId = useMemo(() => {
    const map: Record<number, string> = {};
    const rawCust = (customerMappings || []) as any;
    const custArr = Array.isArray(rawCust) ? rawCust : Array.isArray(rawCust?.results) ? rawCust.results : [];

    const rawSupp = (supplierMappings || []) as any;
    const suppArr = Array.isArray(rawSupp) ? rawSupp : Array.isArray(rawSupp?.results) ? rawSupp.results : [];

    custArr.forEach((m: any) => {
      const lid = Number(m.ledger_id);
      if (!lid) return;
      if (m.customer_name) {
        map[lid] = `Customer: ${String(m.customer_name)}`;
      }
    });

    suppArr.forEach((m: any) => {
      const lid = Number(m.ledger_id);
      if (!lid) return;
      if (m.supplier_name && !map[lid]) {
        map[lid] = `Supplier: ${String(m.supplier_name)}`;
      }
    });

    return map;
  }, [customerMappings, supplierMappings]);

  // Combined options for party/ledger search (used in Transaction Details)
  const subledgerOptions = useMemo(() => {
    const opts: { value: string; label: string; partyId?: number; partyType?: 'customer' | 'supplier'; ledgerId: number; name: string; priority: number }[] = [];

    const rawCust = (customerMappings || []) as any;
    const custArr = Array.isArray(rawCust) ? rawCust : Array.isArray(rawCust?.results) ? rawCust.results : [];

    const rawSupp = (supplierMappings || []) as any;
    const suppArr = Array.isArray(rawSupp) ? rawSupp : Array.isArray(rawSupp?.results) ? rawSupp.results : [];

    custArr.forEach((m: any) => {
      const lid = Number(m.ledger_id);
      if (!lid) return;
      if (m.customer_name) {
        opts.push({
          value: String(lid),
          ledgerId: lid,
          name: String(m.customer_name),
          label: `${String(m.customer_name)} (Customer)`,
          partyId: m.customer_id,
          partyType: 'customer',
          priority: type === 'RECEIPT' ? 1 : 2
        });
      }
    });

    suppArr.forEach((m: any) => {
      const lid = Number(m.ledger_id);
      if (!lid) return;
      if (m.supplier_name) {
        opts.push({
          value: String(lid),
          ledgerId: lid,
          name: String(m.supplier_name),
          label: `${String(m.supplier_name)} (Supplier)`,
          partyId: m.supplier_id,
          partyType: 'supplier',
          priority: type === 'PAYMENT' ? 1 : 2
        });
      }
    });

    // Sub-sort by label within same priority
    opts.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.label.localeCompare(b.label);
    });
    return opts;
  }, [customerMappings, supplierMappings, type]);
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { ledger_id: '', debit: '', credit: '', department_id: '', project_id: '', segment_id: '', remarks: '', employee_id: '' },
  ]);
  const [headerDepartmentId, setHeaderDepartmentId] = useState('');
  const [headerProjectId, setHeaderProjectId] = useState('');
  const [headerSegmentId, setHeaderSegmentId] = useState('');
  const [headerEmployeeId, setHeaderEmployeeId] = useState('');
  const [showDepartment, setShowDepartment] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showSegment, setShowSegment] = useState(false);
  const [showEmployee, setShowEmployee] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [editingVoucherNumber, setEditingVoucherNumber] = useState<string | null>(null);
  const [ledgerSearch, setLedgerSearch] = useState<string[]>(['']);
  const [ledgerDropdownOpen, setLedgerDropdownOpen] = useState<boolean[]>([false]);
  const [paymentModeId, setPaymentModeId] = useState<string>('');
  const [cashCounterpartyLedgerId, setCashCounterpartyLedgerId] = useState<string>('');
  const [cashCounterpartyLedgerQuery, setCashCounterpartyLedgerQuery] = useState<string>('');
  const [cashCounterpartyLedgerOpen, setCashCounterpartyLedgerOpen] = useState<boolean>(false);
  const [cashAmount, setCashAmount] = useState<string>('');
  const [againstOpen, setAgainstOpen] = useState<boolean>(false);
  const [againstAllocations, setAgainstAllocations] = useState<VoucherAllocationCreate[]>([]);

  const [filterFromDate, setFilterFromDate] = useState(initialFilterFromDate);
  const [filterToDate, setFilterToDate] = useState(initialFilterToDate);
  const [filterType, setFilterType] = useState<string>(initialFilterType);
  const [filterPaymentModeId, setFilterPaymentModeId] = useState<string>(initialFilterPaymentModeId);
  const [filterVoucherSearch, setFilterVoucherSearch] = useState<string>("");
  /** When false, list from/to track getSmartDefaultPeriod; menu links omit them from URL. True after explicit URL dates or user edits the list period. */
  const filterPeriodUserPinnedRef = useRef(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintSearch, setReprintSearch] = useState("");
  const [isBankModeSelected, setIsBankModeSelected] = useState(false);
  const [isCashModeSelected, setIsCashModeSelected] = useState(false);
  const [selectedBankLedgerId, setSelectedBankLedgerId] = useState<string>('');
  const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
  const [cashCounterpartyBalance, setCashCounterpartyBalance] = useState<number | null>(null);
  const [focusedLineBalance, setFocusedLineBalance] = useState<number | null>(null);
  const [focusedLineIdx, setFocusedLineIdx] = useState<number | null>(null);
  const [bankRemark, setBankRemark] = useState('');
  const [successPopupOpen, setSuccessPopupOpen] = useState(false);
  const [savedVoucherInfo, setSavedVoucherInfo] = useState<{ id: number; number: string } | null>(null);
  
  // Quick cost center creation state
  const [isQuickDeptModalOpen, setIsQuickDeptModalOpen] = useState(false);
  const [isQuickProjModalOpen, setIsQuickProjModalOpen] = useState(false);
  const [isQuickSegModalOpen, setIsQuickSegModalOpen] = useState(false);
  const [isQuickEmpModalOpen, setIsQuickEmpModalOpen] = useState(false);
  const [pendingCostCenterAction, setPendingCostCenterAction] = useState<{ type: 'dept' | 'proj' | 'seg' | 'emp', lineIdx: number | 'header' } | null>(null);

  const { mutate: mutateDepartments } = useSWR<DepartmentRead[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const { mutate: mutateProjects } = useSWR<ProjectRead[]>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );

  const { mutate: mutateSegments } = useSWR<SegmentRead[]>(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );
  const editIdStr = searchParams.get('edit');

  useEffect(() => {
    if (editIdStr && companyId) {
      // Find voucher in list or fetch it
      // Since vouchers list might be paginated, we should probably fetch it individually 
      // or try to find it in current cached data. 
      // But startEdit expects a full voucher object.
      // Let's fetch it specifically to be safe.
      api.get(`/companies/${companyId}/vouchers/${editIdStr}`)
        .then(res => {
          if (res.data) startEdit(res.data);
        })
        .catch(err => {
          console.error("Failed to load voucher for editing", err);
          setSubmitError("Failed to load the voucher specified in the URL.");
        });
    }
  }, [editIdStr, companyId]);

  // Detect Bank/Cash mode
  useEffect(() => {
    const mode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
    if (mode) {
      const name = mode.name.toLowerCase();
      const isBank = name.includes('bank');
      setIsBankModeSelected(isBank);
      setIsCashModeSelected(name.includes('cash'));
      if (isBank) {
        // If it's a bank mode, we don't automatically set a ledger ID anymore if it's a group
        // But for backward compatibility or if there's only one ledger in the group, we could.
        // For now, let's just clear it if it's not in the new group.
      } else {
        setSelectedBankLedgerId('');
      }
    } else {
      setIsBankModeSelected(false);
      setIsCashModeSelected(false);
      setSelectedBankLedgerId('');
    }
  }, [paymentModeId, paymentModes]);


  // Fetch Balance
  useEffect(() => {
    let ledgerIdToFetch = '';
    if (isBankModeSelected && selectedBankLedgerId) {
      ledgerIdToFetch = selectedBankLedgerId;
    } else if (isCashModeSelected) {
      const mode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
      // For cash, we still might want a default ledger or selection from group
    }

    if (ledgerIdToFetch && companyId) {
      // Use today's date for both from and to to get the current closing balance
      api.get(`/companies/${companyId}/reports/ledger`, {
        params: {
          ledger_id: ledgerIdToFetch,
          from_date: today,
          to_date: today
        }
      }).then(res => {
        setLedgerBalance(res.data?.closing_balance ?? 0);
      }).catch(() => setLedgerBalance(null));
    } else {
      setLedgerBalance(null);
    }
  }, [isBankModeSelected, selectedBankLedgerId, isCashModeSelected, paymentModeId, paymentModes, companyId, today]);

  // Fetch Counterparty Balance
  useEffect(() => {
    if (cashCounterpartyLedgerId && companyId) {
      api.get(`/companies/${companyId}/reports/ledger`, {
        params: {
          ledger_id: cashCounterpartyLedgerId,
          from_date: today,
          to_date: today
        }
      }).then(res => {
        setCashCounterpartyBalance(res.data?.closing_balance ?? 0);
      }).catch(() => setCashCounterpartyBalance(null));
    } else {
      setCashCounterpartyBalance(null);
    }
  }, [cashCounterpartyLedgerId, companyId, today]);

  // Fetch Focused Line Balance
  useEffect(() => {
    const focusedLine = focusedLineIdx !== null ? lines[focusedLineIdx] : null;
    const ledgerId = focusedLine?.ledger_id;

    if (ledgerId && companyId) {
      api.get(`/companies/${companyId}/reports/ledger`, {
        params: {
          ledger_id: ledgerId,
          from_date: today,
          to_date: today
        }
      }).then(res => {
        setFocusedLineBalance(res.data?.closing_balance ?? 0);
      }).catch(() => setFocusedLineBalance(null));
    } else {
      setFocusedLineBalance(null);
    }
  }, [focusedLineIdx, lines, companyId, today]);

  const bankLedgers = useMemo(() => {
    if (!ledgers || !paymentModes || !paymentModeId) return [];
    const mode = paymentModes.find(pm => String(pm.id) === paymentModeId);
    if (!mode || !mode.ledger_group_id) {
      if (!ledgerGroups) return [];
      const bankGroups = (ledgerGroups as any[]).filter((g: any) =>
        g.name.toLowerCase().includes('bank') || g.name.toLowerCase().includes('cash & bank')
      ).map((g: any) => g.id);
      return (ledgers as any[]).filter((l: any) => bankGroups.includes(l.group_id));
    }
    return (ledgers as any[]).filter((l: any) => l.group_id === mode.ledger_group_id);
  }, [ledgers, ledgerGroups, paymentModes, paymentModeId]);

  const [page, setPage] = useState(initialPage);
  const [pageSize] = useState(20);

  const cashBankCodes = useMemo(
    () => ['CASH', 'PETTY_CASH', 'DEFAULT_BANK'].filter((code) => code in STANDARD_LEDGER_CODES),
    []
  );

  const isCashOrBankLedger = (l: any) => {
    const raw = (l?.code || '').toString().toUpperCase();
    return cashBankCodes.includes(raw);
  };

  const voucherDatePayload = useMemo(() => {
    if (dateDisplayMode !== 'BOTH') {
      return isBS ? { voucher_date_bs: date } : { voucher_date: date };
    }

    if (isBS) {
      const bs = date;
      const ad = safeBSToAD(bs);
      return {
        voucher_date_bs: bs,
        ...(ad ? { voucher_date: ad } : {}),
      };
    }

    const ad = date;
    const bs = safeADToBS(ad);
    return {
      voucher_date: ad,
      ...(bs ? { voucher_date_bs: bs } : {}),
    };
  }, [date, dateDisplayMode, isBS]);

  const handleVoucherDateChangeAD = (ad: string) => {
    if (!ad) return;
    if (!isBS) {
      setDate(ad);
    } else {
      const bs = safeADToBS(ad);
      if (bs) setDate(bs);
    }
  };

  const handleVoucherDateChangeBS = (bs: string) => {
    if (!bs) return;
    if (isBS) {
      setDate(bs);
    } else {
      const ad = safeBSToAD(bs);
      if (ad) setDate(ad);
    }
  };

  const handleBillDateChangeAD = (ad: string) => {
    if (!ad) return;
    if (!isBS) {
      setBillDate(ad);
    } else {
      const bs = safeADToBS(ad);
      if (bs) setBillDate(bs);
    }
  };

  const handleBillDateChangeBS = (bs: string) => {
    if (!bs) return;
    if (isBS) {
      setBillDate(bs);
    } else {
      const ad = safeBSToAD(bs);
      if (ad) setBillDate(ad);
    }
  };

  const handleFilterFromChangeAD = (ad: string) => {
    filterPeriodUserPinnedRef.current = true;
    if (dateDisplayMode !== 'BOTH') {
      if (!isBS) {
        setFilterFromDate(ad);
        setPage(1);
      }
      return;
    }
    if (!isBS) {
      setFilterFromDate(ad);
      setPage(1);
      return;
    }
    const bs = safeADToBS(ad);
    setFilterFromDate(bs || '');
    setPage(1);
  };

  const handleFilterFromChangeBS = (bs: string) => {
    filterPeriodUserPinnedRef.current = true;
    if (dateDisplayMode !== 'BOTH') {
      if (isBS) {
        setFilterFromDate(bs);
        setPage(1);
      }
      return;
    }
    if (isBS) {
      setFilterFromDate(bs);
      setPage(1);
      return;
    }
    const ad = safeBSToAD(bs);
    setFilterFromDate(ad || '');
    setPage(1);
  };

  const handleFilterToChangeAD = (ad: string) => {
    filterPeriodUserPinnedRef.current = true;
    if (dateDisplayMode !== 'BOTH') {
      if (!isBS) {
        setFilterToDate(ad);
        setPage(1);
      }
      return;
    }
    if (!isBS) {
      setFilterToDate(ad);
      setPage(1);
      return;
    }
    const bs = safeADToBS(ad);
    setFilterToDate(bs || '');
    setPage(1);
  };

  const handleFilterToChangeBS = (bs: string) => {
    filterPeriodUserPinnedRef.current = true;
    if (dateDisplayMode !== 'BOTH') {
      if (isBS) {
        setFilterToDate(bs);
        setPage(1);
      }
      return;
    }
    if (isBS) {
      setFilterToDate(bs);
      setPage(1);
      return;
    }
    const ad = safeBSToAD(bs);
    setFilterToDate(ad || '');
    setPage(1);
  };

  const paymentModeLedgerIds = useMemo(() => {
    const ids = new Set<number>();
    if (paymentModes && ledgers) {
      paymentModes.forEach((pm) => {
        if (pm.ledger_group_id) {
          (ledgers as any[])
            .filter((l: any) => l.group_id === pm.ledger_group_id)
            .forEach((l: any) => ids.add(l.id));
        }
      });
    }
    return ids;
  }, [paymentModes, ledgers]);

  const {
    data: counterpartyLedgers,
    isLoading: isCounterpartyLedgersLoading,
    error: counterpartyLedgersError,
  } = useSWR<CounterpartyLedger[]>(
    companyId && (type === 'PAYMENT' || type === 'RECEIPT')
      ? [`/companies/${companyId}/vouchers/counterparty-ledgers`, type]
      : null,
    async () => fetchCounterpartyLedgers(Number(companyId), type as 'PAYMENT' | 'RECEIPT')
  );

  const cashCounterpartyLedgerOptions = useMemo(() => {
    const opts = (counterpartyLedgers || [])
      .filter((l: CounterpartyLedger) => !paymentModeLedgerIds.has(Number(l.id)))
      .map((l: CounterpartyLedger) => {
        const subledgerLabel = partyLabelByLedgerId[Number(l.id)];
        const label = subledgerLabel
          ? subledgerLabel
          : l.group_name
            ? `${l.group_name} / ${l.name}`
            : l.name;
        return { value: String(l.id), label, raw: l };
      });

    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [counterpartyLedgers, paymentModeLedgerIds, partyLabelByLedgerId]);

  const groupById = useMemo(() => {
    const typeMap = new Map<number, string>();
    const nameMap = new Map<number, string>();
    (ledgerGroups as any[] || []).forEach((g) => {
      const gid = Number(g.id);
      if (!gid) return;
      typeMap.set(gid, String(g.group_type || '').toUpperCase());
      nameMap.set(gid, String(g.name || ''));
    });
    return { typeMap, nameMap };
  }, [ledgerGroups]);

  const cashCounterpartyExtraLedgerOptions = useMemo(() => {
    if (!ledgers || !Array.isArray(ledgers)) return [] as { value: string; label: string; raw: any }[];
    if (!ledgerGroups || !Array.isArray(ledgerGroups)) return [] as { value: string; label: string; raw: any }[];

    const { typeMap, nameMap } = groupById;

    const options = (ledgers as any[])
      .filter((l) => {
        const lid = Number(l.id);
        if (!lid) return false;
        if (paymentModeLedgerIds.has(lid)) return false;
        const gid = Number(l.group_id);
        const gt = typeMap.get(gid) || '';

        // For Payment: show Expenses and Liabilities (like Suppliers)
        // For Receipt: show Income and Assets (like Customers)
        if (type === 'PAYMENT') return gt === 'EXPENSE' || gt === 'LIABILITY';
        if (type === 'RECEIPT') return gt === 'INCOME' || gt === 'ASSET';
        return false;
      })
      .map((l) => {
        const lid = Number(l.id);
        const name = String(l.name || '');
        const gid = Number(l.group_id);
        const gname = nameMap.get(gid) || '';
        const subledgerLabel = partyLabelByLedgerId[lid];
        const label = subledgerLabel ? subledgerLabel : gname ? `${gname} / ${name}` : name;
        return { value: String(lid), label, raw: { ...l, group_name: gname } };
      });

    options.sort((a, b) => a.label.localeCompare(b.label));
    return options;
  }, [ledgers, ledgerGroups, paymentModeLedgerIds, partyLabelByLedgerId, type]);

  const cashCounterpartyAllOptions = useMemo(() => {
    const hasSubledger = new Set<string>(Object.keys(partyLabelByLedgerId));

    // Base options (suggestions from backend)
    const baseMap = new Map<string, { value: string; label: string; ledgerId: number; name: string }>();

    cashCounterpartyLedgerOptions.forEach((o) => {
      // If it has subledgers (parties), we'll add the parties instead of the parent ledger
      if (hasSubledger.has(String(o.value))) return;
      baseMap.set(String(o.value), {
        value: String(o.value),
        label: o.label,
        ledgerId: Number(o.value),
        name: o.label,
        raw: o.raw
      } as any);
    });

    // Add specific fallback ledgers
    cashCounterpartyExtraLedgerOptions.forEach((o) => {
      if (hasSubledger.has(String(o.value))) return;
      if (!baseMap.has(String(o.value))) {
        baseMap.set(String(o.value), {
          value: String(o.value),
          label: o.label,
          ledgerId: Number(o.value),
          name: o.label,
          raw: (o as any).raw
        } as any);
      }
    });

    // Final array: combination of unique base ledgers and all specific parties
    const arr = [...Array.from(baseMap.values()), ...subledgerOptions];

    // Global sort: Priority (related parties first) then label
    arr.sort((a, b) => {
      let pA = (a as any).priority;
      let pB = (b as any).priority;

      if (pA === undefined) {
        const gn = (a as any).raw?.group_name;
        if (type === 'PAYMENT' && gn === 'Sundry Creditors') pA = 1;
        else if (type === 'RECEIPT' && gn === 'Sundry Debtors') pA = 1;
        else if (type === 'PAYMENT' && gn === 'Sundry Debtors') pA = 2;
        else if (type === 'RECEIPT' && gn === 'Sundry Creditors') pA = 2;
        else pA = 10;
      }

      if (pB === undefined) {
        const gn = (b as any).raw?.group_name;
        if (type === 'PAYMENT' && gn === 'Sundry Creditors') pB = 1;
        else if (type === 'RECEIPT' && gn === 'Sundry Debtors') pB = 1;
        else if (type === 'PAYMENT' && gn === 'Sundry Debtors') pB = 2;
        else if (type === 'RECEIPT' && gn === 'Sundry Creditors') pB = 2;
        else pB = 10;
      }

      if (pA !== pB) return pA - pB;
      return a.label.localeCompare(b.label);
    });
    return arr;
  }, [cashCounterpartyLedgerOptions, cashCounterpartyExtraLedgerOptions, partyLabelByLedgerId, subledgerOptions, type]);

  const ledgerOptionsForTable = useMemo(() => {
    // Start with all base ledgers for the table (always allow picking the parent too)
    const baseOpts = ((ledgers || []) as any[]).map(l => {
      const gid = Number(l.group_id);
      const gname = groupById.nameMap.get(gid) || '';

      let priority = 10;
      if (type === 'PAYMENT' && gname === 'Sundry Creditors') priority = 1;
      else if (type === 'RECEIPT' && gname === 'Sundry Debtors') priority = 1;
      else if (type === 'PAYMENT' && gname === 'Sundry Debtors') priority = 2;
      else if (type === 'RECEIPT' && gname === 'Sundry Creditors') priority = 2;

      return {
        ...l,
        label: String(l.name || ''),
        value: String(l.id),
        ledgerId: Number(l.id),
        name: String(l.name || ''),
        subtext: partyLabelByLedgerId[Number(l.id)] || '',
        priority,
        raw: { ...l, group_name: gname }
      };
    });

    // Add all specific parties from mappings
    const partyOpts = subledgerOptions.map(p => ({
      ...p,
      id: Number(p.value),
      name: p.name,
      label: p.label,
      value: p.value,
      ledgerId: Number(p.value),
      isParty: true
    }));

    const partyLedgerIds = new Set(partyOpts.map(p => Number(p.ledgerId)));
    const filteredBaseOpts = baseOpts.filter(l => !partyLedgerIds.has(Number(l.id)));

    const combined = [...filteredBaseOpts, ...partyOpts];
    combined.sort((a, b) => {
      const pA = (a as any).priority || 10;
      const pB = (b as any).priority || 10;
      if (pA !== pB) return pA - pB;
      return a.label.localeCompare(b.label);
    });
    return combined;
  }, [ledgers, partyLabelByLedgerId, subledgerOptions, groupById, type]);

  const formattedTableLedgerOptions = useMemo(() => {
    return ledgerOptionsForTable.map(o => ({
      value: String(o.value),
      label: o.label,
      sublabel: (o as any).subtext || undefined
    }));
  }, [ledgerOptionsForTable]);

  const formattedCounterpartyOptions = useMemo(() => {
    return cashCounterpartyAllOptions.map(o => ({
      value: String(o.value),
      label: o.label,
      sublabel: (o as any).subtext || undefined
    }));
  }, [cashCounterpartyAllOptions]);

  const filteredCashCounterpartyOptions = useMemo(() => {
    const term = cashCounterpartyLedgerQuery.trim().toLowerCase();

    // If no term, show backend suggestions + first few parties
    if (!term) return cashCounterpartyAllOptions.slice(0, 50);

    // Robust search: name, ID, or label
    return cashCounterpartyAllOptions.filter((o: any) => {
      const name = String(o.name || '').toLowerCase();
      const label = String(o.label || '').toLowerCase();
      const id = String(o.ledgerId || '');
      const partyId = String(o.partyId || '');

      return label.includes(term) ||
        name.includes(term) ||
        id.includes(term) ||
        partyId.includes(term);
    }).slice(0, 100);
  }, [cashCounterpartyAllOptions, cashCounterpartyLedgerQuery]);

  // Update query when a counterparty is selected - but ONLY if query is empty or different
  useEffect(() => {
    if (!cashCounterpartyLedgerId || cashCounterpartyLedgerQuery) return;
    const lid = Number(cashCounterpartyLedgerId);
    const label = partyLabelByLedgerId[lid] ||
      (ledgers as any[])?.find(l => l.id === lid)?.name ||
      String(lid);
    setCashCounterpartyLedgerQuery(label);
  }, [cashCounterpartyLedgerId, partyLabelByLedgerId, ledgers]);

  useEffect(() => {
    if (!cashCounterpartyLedgerId) return;
    const allowedIds = new Set<string>(cashCounterpartyAllOptions.map((o) => o.value));
    if (!allowedIds.has(String(cashCounterpartyLedgerId))) {
      setCashCounterpartyLedgerId('');
    }
  }, [cashCounterpartyLedgerId, cashCounterpartyAllOptions]);

  useEffect(() => {
    setAgainstAllocations([]);
  }, [cashCounterpartyLedgerId, type]);

  const totals = useMemo(() => {
    // If we are in Simple mode, we should show the cashAmount as both debit and credit
    const isNewSimple = ['PAYMENT', 'RECEIPT'].includes(type) && !editingId;
    if (isNewSimple) {
      const amt = parseFloat(String(cashAmount || '0'));
      const val = isNaN(amt) ? 0 : amt;
      return { debit: val, credit: val };
    }

    const debit = lines.reduce((sum, l) => {
      const val = parseFloat(String(l.debit || '0'));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    const credit = lines.reduce((sum, l) => {
      const val = parseFloat(String(l.credit || '0'));
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
    return { debit, credit };
  }, [lines, type, editingId, cashAmount]);

  const activeDepartments = useMemo(
    () => (departments || []).filter((d: DepartmentRead) => d.is_active),
    [departments]
  );

  const againstAllocatedSum = useMemo(() => {
    return (againstAllocations || []).reduce((sum, a) => sum + Number(a.amount || 0), 0);
  }, [againstAllocations]);

  const againstRemainingAmount = useMemo(() => {
    const total = Number(cashAmount || '0');
    return Math.max(0, total - againstAllocatedSum);
  }, [againstAllocatedSum, cashAmount]);

  const activeProjects = useMemo(
    () => (projects || []).filter((p: ProjectRead) => p.is_active),
    [projects]
  );

  const activeSegments = useMemo(
    () => (segments || []).filter((s: SegmentRead) => s.is_active),
    [segments]
  );

  const { data: employees, mutate: mutateEmployees } = useSWR<EmployeeRead[]>(
    companyId ? `/payroll/companies/${companyId}/employees` : null,
    fetcher
  );

  const activeEmployees = useMemo(
    () => (employees || []).filter((e: EmployeeRead) => e.is_active !== false),
    [employees]
  );

  const employeeOptions = useMemo(() => {
    const opts = activeEmployees.map(emp => ({
      value: String(emp.id),
      label: emp.full_name,
      sublabel: emp.code ? `Code: ${emp.code}` : undefined
    }));
    opts.unshift({ value: 'ADD_NEW', label: '+ Add New Employee' });
    return opts;
  }, [activeEmployees]);

  const allowedTypes = useMemo(() => {
    if (initialType === 'PAYMENT') return ['PAYMENT'] as const;
    if (initialType === 'RECEIPT') return ['RECEIPT'] as const;
    return ['PAYMENT', 'RECEIPT', 'CONTRA', 'JOURNAL'] as const;
  }, [initialType]);

  const costCenterMode = company?.cost_center_mode ?? null;
  const costCenterDimension = company?.cost_center_single_dimension ?? null;
  const enableCostCenters = company?.enable_cost_centers_in_vouchers ?? false;

  // Use local state (checkboxes) instead of company settings for showing column/dropdown selection
  const showDepartmentSelector = showDepartment;
  const showProjectSelector = showProject;
  const showSegmentSelector = showSegment;
  const showEmployeeSelector = showEmployee;

  /** Percent widths for `table-fixed`: fits container — avoids horizontal scrollbar. */
  const voucherLinesColPercents = useMemo(() => {
    const nc =
      Number(showDepartmentSelector) +
      Number(showProjectSelector) +
      Number(showSegmentSelector) +
      Number(showEmployeeSelector);
    // Debit / Credit / Remarks need comfortable width for amounts and text.
    const fixed = { debit: 11, credit: 11, remarks: 19, action: 4 };
    const flexPool = 100 - fixed.debit - fixed.credit - fixed.remarks - fixed.action;
    let ledger: number;
    let eachCc = 0;
    if (nc === 0) {
      ledger = flexPool;
    } else {
      let draftLedger = nc <= 2 ? 26 : nc === 3 ? 21 : 17;
      eachCc = Math.max(6, (flexPool - draftLedger) / nc);
      ledger = flexPool - eachCc * nc;
    }
    const parts: number[] = [ledger];
    if (showDepartmentSelector) parts.push(eachCc);
    if (showProjectSelector) parts.push(eachCc);
    if (showSegmentSelector) parts.push(eachCc);
    if (showEmployeeSelector) parts.push(eachCc);
    parts.push(fixed.debit, fixed.credit, fixed.remarks, fixed.action);
    const sum = parts.reduce((a, b) => a + b, 0);
    return parts.map((p) => (p / sum) * 100);
  }, [showDepartmentSelector, showProjectSelector, showSegmentSelector, showEmployeeSelector]);

  const cashCounterpartyPartyLabel = useMemo(() => {
    if (!cashCounterpartyLedgerId) return '';
    return partyLabelByLedgerId[Number(cashCounterpartyLedgerId)] || '';
  }, [cashCounterpartyLedgerId, partyLabelByLedgerId]);

  // Apply URL → state synchronously before router.replace passive effect runs; otherwise stale
  // PAYMENT/smart defaults overwrite ?type=JOURNAL&from=&to= on hard load or hydration.
  useLayoutEffect(() => {
    const t = searchParams.get('type');
    if (t) {
      setType(t);
    }

    const fromParam = searchParams.get('from');
    const toParam = searchParams.get('to');
    if (fromParam || toParam) {
      filterPeriodUserPinnedRef.current = true;
      if (fromParam) setFilterFromDate(fromParam);
      if (toParam) setFilterToDate(toParam);
    } else {
      // Menu links like ?type=JOURNAL only — allow list period to follow smart defaults again.
      filterPeriodUserPinnedRef.current = false;
    }

    setFilterType(searchParams.get('ftype') || 'ALL');
    setFilterPaymentModeId(searchParams.get('pmode') || 'ALL');

    const pageParam = Number(searchParams.get('page') || '1') || 1;
    setPage(pageParam);
  }, [searchParams]);

  useLayoutEffect(() => {
    if (filterPeriodUserPinnedRef.current) return;
    if (searchParams.has('from') || searchParams.has('to')) return;
    setFilterFromDate(smartFrom);
    setFilterToDate(smartTo);
  }, [searchParams, smartFrom, smartTo]);

  useEffect(() => {
    if (!pathname) return;

    const current = new URLSearchParams(searchParams.toString());

    if (type && type !== initialType) {
      current.set('type', type);
    } else if (!type) {
      current.delete('type');
    }

    // Menu links are only ...?type=JOURNAL. Never add fiscal from/to until the user
    // shares a link with dates or edits list filters (filterPeriodUserPinnedRef).
    // Do not rely on filterFromDate === smartFrom here: a one-byte or hydration
    // mismatch would still trigger router.replace and pollute the URL.
    const periodExplicitInUrl =
      searchParams.has('from') || searchParams.has('to');
    const omitImplicitPeriodParams =
      !periodExplicitInUrl && !filterPeriodUserPinnedRef.current;

    if (omitImplicitPeriodParams) {
      current.delete('from');
      current.delete('to');
    } else {
      if (filterFromDate) {
        current.set('from', filterFromDate);
      } else {
        current.delete('from');
      }

      if (filterToDate) {
        current.set('to', filterToDate);
      } else {
        current.delete('to');
      }
    }

    if (filterType && filterType !== 'ALL') {
      current.set('ftype', filterType);
    } else {
      current.delete('ftype');
    }

    if (filterPaymentModeId && filterPaymentModeId !== 'ALL') {
      current.set('pmode', filterPaymentModeId);
    } else {
      current.delete('pmode');
    }

    if (page && page !== 1) {
      current.set('page', String(page));
    } else {
      current.delete('page');
    }

    const queryString = current.toString();
    const nextUrl = queryString ? `${pathname}?${queryString}` : pathname;

    router.replace(nextUrl, { scroll: false });
  }, [
    pathname,
    router,
    searchParams,
    type,
    initialType,
    filterFromDate,
    filterToDate,
    smartFrom,
    smartTo,
    filterType,
    filterPaymentModeId,
    page,
  ]);

  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam || !companyId) return;

    const vid = Number(idParam);
    if (!vid) return;

    // Prefer fetching full voucher detail to ensure payment_mode_id and lines
    // are fully populated for editing, rather than relying on the lightweight list.
    (async () => {
      try {
        const res = await api.get(`/companies/${companyId}/vouchers/${vid}`);
        if (res?.data) {
          startEdit(res.data);
        }
      } catch {
        // ignore; user can still edit manually
      }
    })();
  }, [searchParams, companyId]);

  const handleLineChange = (index: number, field: keyof Line, value: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        ledger_id: '',
        debit: '',
        credit: '',
        department_id: headerDepartmentId || '',
        project_id: headerProjectId || '',
        segment_id: headerSegmentId || '',
        remarks: '',
        employee_id: headerEmployeeId || '',
      },
    ]);
    setLedgerSearch((prev) => [...prev, '']);
    // Close all other dropdowns before adding a new one
    setLedgerDropdownOpen((prev) => [...prev.map(() => false), false]);
  };

  const applyHeaderDepartmentToLines = (deptId: string) => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        department_id: deptId || '',
      }))
    );
  };

  const applyHeaderProjectToLines = (projId: string) => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        project_id: projId || '',
      }))
    );
  };

  const applyHeaderSegmentToLines = (segId: string) => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        segment_id: segId || '',
      }))
    );
  };

  const applyHeaderEmployeeToLines = (empId: string) => {
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        employee_id: empId || '',
      }))
    );
  };

  /** Journal: compact toggles only; voucher lines hold the dropdowns when enabled. */
  const journalLineColumnTickClass =
    'inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-violet-200/80 bg-white/80 px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm dark:border-violet-800/60 dark:bg-slate-950/60 dark:text-slate-300';

  const journalLineColumnInputClass =
    'h-3.5 w-3.5 shrink-0 rounded border-slate-400 text-violet-600 focus:ring-violet-500 dark:border-slate-500';

  const renderJournalVoucherCostCenterTicks = () => (
    <div className="flex w-full flex-wrap items-center justify-end gap-x-2 gap-y-2">
      <label className={journalLineColumnTickClass}>
        <input
          type="checkbox"
          checked={showDepartment}
          onChange={(e) => {
            setShowDepartment(e.target.checked);
            if (!e.target.checked) {
              setHeaderDepartmentId('');
              setLines((prev) => prev.map(l => ({ ...l, department_id: '' })));
            }
          }}
          title="Show department column on lines"
          className={journalLineColumnInputClass}
        />
        <span>Dept</span>
      </label>
      <label className={journalLineColumnTickClass}>
        <input
          type="checkbox"
          checked={showProject}
          onChange={(e) => {
            setShowProject(e.target.checked);
            if (!e.target.checked) {
              setHeaderProjectId('');
              setLines((prev) => prev.map(l => ({ ...l, project_id: '' })));
            }
          }}
          title="Show project column on lines"
          className={journalLineColumnInputClass}
        />
        <span>Proj</span>
      </label>
      <label className={journalLineColumnTickClass}>
        <input
          type="checkbox"
          checked={showSegment}
          onChange={(e) => {
            setShowSegment(e.target.checked);
            if (!e.target.checked) {
              setHeaderSegmentId('');
              setLines((prev) => prev.map(l => ({ ...l, segment_id: '' })));
            }
          }}
          title="Show segment column on lines"
          className={journalLineColumnInputClass}
        />
        <span>Seg</span>
      </label>
      <label className={journalLineColumnTickClass}>
        <input
          type="checkbox"
          checked={showEmployee}
          onChange={(e) => {
            setShowEmployee(e.target.checked);
            if (!e.target.checked) {
              setHeaderEmployeeId('');
              setLines((prev) => prev.map(l => ({ ...l, employee_id: '' })));
            }
          }}
          title="Show employee column on lines"
          className={journalLineColumnInputClass}
        />
        <span>Emp</span>
      </label>
    </div>
  );

  const renderHeaderCostCenterFieldsGrid = () => (
    <>
      <div className="flex flex-col gap-1 md:col-span-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 tracking-tight">Dept</label>
          <input
            type="checkbox"
            checked={showDepartment}
            onChange={(e) => {
              setShowDepartment(e.target.checked);
              if (!e.target.checked) {
                setHeaderDepartmentId('');
                setLines((prev) => prev.map(l => ({ ...l, department_id: '' })));
              }
            }}
            title="Toggle Department Column"
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
        <Select
          value={headerDepartmentId}
          onChange={(e) => {
            if (e.target.value === 'ADD_NEW') {
              setPendingCostCenterAction({ type: 'dept', lineIdx: 'header' });
              setIsQuickDeptModalOpen(true);
              return;
            }
            setHeaderDepartmentId(e.target.value);
            applyHeaderDepartmentToLines(e.target.value);
          }}
          disabled={!showDepartment}
          className="h-9 text-xs font-medium"
        >
          <option value="">Select Dept</option>
          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add Department</option>
          {activeDepartments.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1 md:col-span-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 tracking-tight">Proj</label>
          <input
            type="checkbox"
            checked={showProject}
            onChange={(e) => {
              setShowProject(e.target.checked);
              if (!e.target.checked) {
                setHeaderProjectId('');
                setLines((prev) => prev.map(l => ({ ...l, project_id: '' })));
              }
            }}
            title="Toggle Project Column"
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
        <Select
          value={headerProjectId}
          onChange={(e) => {
            if (e.target.value === 'ADD_NEW') {
              setPendingCostCenterAction({ type: 'proj', lineIdx: 'header' });
              setIsQuickProjModalOpen(true);
              return;
            }
            setHeaderProjectId(e.target.value);
            applyHeaderProjectToLines(e.target.value);
          }}
          disabled={!showProject}
          className="h-9 text-xs font-medium"
        >
          <option value="">Select Proj</option>
          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add Project</option>
          {activeProjects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1 md:col-span-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 tracking-tight">Segment</label>
          <input
            type="checkbox"
            checked={showSegment}
            onChange={(e) => {
              setShowSegment(e.target.checked);
              if (!e.target.checked) {
                setHeaderSegmentId('');
                setLines((prev) => prev.map(l => ({ ...l, segment_id: '' })));
              }
            }}
            title="Toggle Segment Column"
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
        <Select
          value={headerSegmentId}
          onChange={(e) => {
            if (e.target.value === 'ADD_NEW') {
              setPendingCostCenterAction({ type: 'seg', lineIdx: 'header' });
              setIsQuickSegModalOpen(true);
              return;
            }
            setHeaderSegmentId(e.target.value);
            applyHeaderSegmentToLines(e.target.value);
          }}
          disabled={!showSegment}
          className="h-9 text-xs font-medium"
        >
          <option value="">Select Segment</option>
          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add Segment</option>
          {activeSegments.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
      </div>

      <div className="flex flex-col gap-1 md:col-span-3">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 tracking-tight">Employee</label>
          <input
            type="checkbox"
            checked={showEmployee}
            onChange={(e) => {
              setShowEmployee(e.target.checked);
              if (!e.target.checked) {
                setHeaderEmployeeId('');
                setLines((prev) => prev.map(l => ({ ...l, employee_id: '' })));
              }
            }}
            title="Toggle Employee Column"
            className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </div>
        <SearchableSelect
          disabled={!showEmployee}
          className="w-full"
          triggerClassName="h-9 text-xs font-medium"
          options={employeeOptions}
          value={headerEmployeeId}
          onChange={(val) => {
            if (val === 'ADD_NEW') {
              setPendingCostCenterAction({ type: 'emp', lineIdx: 'header' });
              setIsQuickEmpModalOpen(true);
              return;
            }
            setHeaderEmployeeId(val);
            applyHeaderEmployeeToLines(val);
          }}
          placeholder="Search employee..."
        />
      </div>
    </>
  );

  const autoBalance = () => {
    // Only for CONTRA / JOURNAL and when there is at least one line
    if (!(type === 'CONTRA' || type === 'JOURNAL')) return;
    if (!lines.length) return;

    const debitTotal = lines.reduce((sum, l) => sum + Number(l.debit || '0'), 0);
    const creditTotal = lines.reduce((sum, l) => sum + Number(l.credit || '0'), 0);
    const diff = debitTotal - creditTotal;
    if (!diff) return; // already balanced

    const lastIdx = lines.length - 1;
    setLines((prev) => {
      const copy = [...prev];
      const last = { ...copy[lastIdx] };
      if (diff > 0) {
        // Debits > credits: increase credit on last line
        const curCredit = Number(last.credit || '0');
        last.credit = (curCredit + diff).toFixed(2);
      } else {
        // Credits > debits: increase debit on last line
        const curDebit = Number(last.debit || '0');
        last.debit = (curDebit + Math.abs(diff)).toFixed(2);
      }
      copy[lastIdx] = last;
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreateOrEditVoucher) {
      setSubmitError('You do not have permission to create or update vouchers.');
      return;
    }

    const requiresPaymentMode = ['PAYMENT', 'RECEIPT', 'CONTRA'].includes(type);

    if (requiresPaymentMode && !paymentModeId) {
      setSubmitError('Payment mode is required for this voucher type.');
      return;
    }

    const isCashSimpleType = ['PAYMENT', 'RECEIPT'].includes(type);
    const isNewCashSimple = isCashSimpleType && !editingId;

    setError(null);
    setSubmitError(null);
    setSubmitting(true);

    // Backdate warning
    // Extract AD date from payload for comparison
    const targetDate = voucherDatePayload.voucher_date || (voucherDatePayload.voucher_date_bs ? safeBSToAD(voucherDatePayload.voucher_date_bs) : null);
    const todayStr = new Date().toISOString().split('T')[0];
    if (targetDate && targetDate < todayStr) {
      if (typeof window !== "undefined") {
        const ok = window.confirm(
          `The transaction date (${targetDate}) is a back date (before today, ${todayStr}). Do you want to proceed?`
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }
    }

    try {
      let saved: Voucher | null = null;
      if (isNewCashSimple) {
        if (!date) {
          setSubmitError('Voucher date is required.');
          return;
        }
        if (!cashCounterpartyLedgerId) {
          setSubmitError('Counterparty ledger is required.');
          return;
        }
        const numericAmount = Number(cashAmount || '0');
        if (!(numericAmount > 0)) {
          setSubmitError('Amount must be greater than zero.');
          return;
        }

        const payload: CashVoucherSimpleCreate = {
          ...voucherDatePayload,
          bill_date: billDate,
          voucher_type: type as 'PAYMENT' | 'RECEIPT',
          counterparty_ledger_id: Number(cashCounterpartyLedgerId),
          amount: numericAmount,
          payment_mode_id: Number(paymentModeId),
          ledger_id: isBankModeSelected && selectedBankLedgerId ? Number(selectedBankLedgerId) : null,
          department_id: headerDepartmentId ? Number(headerDepartmentId) : null,
          project_id: headerProjectId ? Number(headerProjectId) : null,
          segment_id: headerSegmentId ? Number(headerSegmentId) : null,
          employee_id: headerEmployeeId ? Number(headerEmployeeId) : null,
          narration: bankRemark ? `${narration} (Remark: ${bankRemark})`.trim() : (narration || null),
        };

        saved = await createCashVoucher(Number(companyId), payload);
        if (saved && saved.id) {
          if (againstAllocations.length > 0) {
            try {
              await postVoucherAllocations(Number(companyId), Number(saved.id), againstAllocations);
            } catch (e) {
              setSubmitError(getApiErrorMessage(e));
              return;
            }
          }

          const target = `/companies/${companyId}/vouchers/${saved.id}?created=1`;
          if (typeof window !== 'undefined') {
            window.location.href = target;
          } else {
            router.push(target);
          }
          return;
        }

        if (typeof window !== 'undefined') {
          window.location.href = `/companies/${companyId}/vouchers`;
        } else {
          router.push(`/companies/${companyId}/vouchers`);
        }
        return;
      } else {
        const activeLines = lines.filter((l) => l.ledger_id);
        if (activeLines.length === 0) {
          setError('Add at least one voucher line before saving.');
          return;
        }

        const hasNonZeroLine = activeLines.some((l) => {
          const d = Number(l.debit || '0');
          const c = Number(l.credit || '0');
          return d !== 0 || c !== 0;
        });
        if (!hasNonZeroLine) {
          setError('Enter a non-zero debit or credit amount on at least one line.');
          return;
        }

        if (totals.debit.toFixed(2) !== totals.credit.toFixed(2)) {
          setError('Voucher not balanced. Total debit must equal total credit.');
          return;
        }

        const mode = costCenterMode;
        const dimension = costCenterDimension;

        for (const l of activeLines) {
          const hasDept = !!(l as Line).department_id;
          const hasProj = !!(l as Line).project_id;
          const hasSeg = !!(l as Line).segment_id;

          if (mode === null && (hasDept || hasProj || hasSeg)) {
            setError('Cost centers are disabled for this company.');
            setSubmitError(null);
            return;
          }
          if (mode === 'single' && dimension === 'department' && (hasProj || hasSeg)) {
            setError('Project/Segment cannot be set in single-department cost center mode');
            setSubmitError(null);
            return;
          }
          if (mode === 'single' && dimension === 'project' && (hasDept || hasSeg)) {
            setError('Department/Segment cannot be set in single-project cost center mode');
            setSubmitError(null);
            return;
          }
          if (mode === 'single' && dimension === 'segment' && (hasDept || hasProj)) {
            setError('Department/Project cannot be set in single-segment cost center mode');
            setSubmitError(null);
            return;
          }
        }

        const vPayload = {
          ...voucherDatePayload,
          bill_date: billDate,
          voucher_type: type,
          narration: narration || null,
          bank_remark: bankRemark,
          payment_mode_id: requiresPaymentMode ? Number(paymentModeId) : null,
          department_id: headerDepartmentId ? Number(headerDepartmentId) : null,
          project_id: headerProjectId ? Number(headerProjectId) : null,
          segment_id: headerSegmentId ? Number(headerSegmentId) : null,
          employee_id: headerEmployeeId ? Number(headerEmployeeId) : null,
          lines: activeLines.map((l) => {

            const baseLine: any = {
              ledger_id: Number(l.ledger_id),
              debit: Number(l.debit || '0'),
              credit: Number(l.credit || '0'),
              remarks: (l as Line).remarks || null,
              employee_id: (l as Line).employee_id ? Number((l as Line).employee_id) : null,
            };

            const finalLine = {
              ...baseLine,
              department_id: (l as Line).department_id ? Number((l as Line).department_id) : null,
              project_id: (l as Line).project_id ? Number((l as Line).project_id) : null,
              segment_id: (l as Line).segment_id ? Number((l as Line).segment_id) : null,
              employee_id: (l as Line).employee_id ? Number((l as Line).employee_id) : null,
            };

            if (costCenterMode === null) {
              return {
                ...baseLine,
                department_id: null,
                project_id: null,
                segment_id: null,
              };
            }

            // In other modes, we still want to send what was selected in the UI if it's there.
            // But the backend might validate based on mode. 
            // For maximum flexibility, we send all that are available in the Line object.
            return finalLine;
          }),
        };

        if (isBankModeSelected && selectedBankLedgerId) {
          // If in bank mode, the payment side ledger should be the selected bank ledger.
          // For PAYMENT/RECEIPT/CONTRA, createManualVoucher/createCashVoucher usually handles this via payment_mode_id.
          // But if we override it, we might need a different logic. 
          // For now, we follow the simple voucher logic if possible, or manual.
        }

        if (editingId) {
          const res = await api.put<Voucher>(
            `/companies/${companyId}/vouchers/${editingId}`,
            vPayload
          );
          saved = res.data;
        } else {
          saved = await createManualVoucher(Number(companyId), vPayload);
        }

        if (saved && saved.id) {
          setSavedVoucherInfo({ id: saved.id, number: saved.voucher_number || String(saved.id) });
          setSuccessPopupOpen(true);
          // Instead of immediate redirect, we wait for popup interaction.
          // But we should refresh the list.
          mutate();
          return;
        }

        if (!editingId && saved && saved.id) {
          const target = `/companies/${companyId}/vouchers/${saved.id}?created=1`;
          if (typeof window !== 'undefined') {
            window.location.href = target;
          } else {
            router.push(target);
          }
          return;
        }

        if (typeof window !== 'undefined' && saved?.voucher_number) {
          window.alert(
            editingId
              ? `Voucher ${saved.voucher_number} updated.`
              : `Voucher ${saved.voucher_number} created.`
          );
          // Fall through to clear form
        }

        if (!editingId && saved) {
          setSubmitError('Voucher saved successfully, but could not open its detail page. Please open it from the list below.');
        }
      }

      setDate(today);
      setBillDate(today);
      setNarration('');
      setLines([
        { ledger_id: '', debit: '', credit: '', department_id: '', project_id: '', segment_id: '', remarks: '', employee_id: '' },
      ]);
      setLedgerSearch(['']);
      setLedgerDropdownOpen([false]);
      setEditingId(null);
      setEditingVoucherNumber(null);
      setFormVisible(false);
      setPaymentModeId('');
      setCashCounterpartyLedgerId('');
      setCashCounterpartyLedgerQuery('');
      setCashAmount('');
      setAgainstAllocations([]);
      setShowDepartment(false);
      setShowProject(false);
      setShowSegment(false);
      setShowEmployee(false);
      setHeaderDepartmentId('');
      setHeaderProjectId('');
      setHeaderSegmentId('');
      setHeaderEmployeeId('');
      mutate();
    } catch (err: any) {
      const rawDetail = err?.response?.data?.detail;
      const messages = formatApiError(rawDetail);
      const joined = messages.join('; ');

      if (joined) {
        if (joined.includes('Cost centers are disabled for this company')) {
          setError('Cost centers are disabled for this company.');
          setSubmitError(null);
        } else if (
          joined.includes('Project cannot be set in single-department cost center mode')
        ) {
          setError('Project cannot be set in single-department cost center mode');
          setSubmitError(null);
        } else if (
          joined.includes('Department cannot be set in single-project cost center mode')
        ) {
          setError('Department cannot be set in single-project cost center mode');
          setSubmitError(null);
        } else if (joined.includes('Voucher not balanced')) {
          setError('Debits and credits must be equal.');
          setSubmitError(null);
        } else if (joined.includes('Failed to generate unique voucher number')) {
          setSubmitError('Could not generate a voucher number. Please retry.');
        } else {
          setSubmitError(joined);
        }
      } else {
        setSubmitError(
          editingId ? 'Failed to update voucher' : 'Failed to create voucher'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (voucherId: number) => {
    if (!canDeleteVoucher) return;
    if (!confirm('Delete this voucher? This cannot be undone.')) return;
    try {
      await api.delete(`/companies/${companyId}/vouchers/${voucherId}`);
      mutate();
      await globalMutate(
        (key) =>
          typeof key === 'string' &&
          key.startsWith(`/inventory/companies/${companyId}/stock/`)
      );

      await globalMutate(
        (key) =>
          typeof key === 'string' &&
          (key === `/companies/${companyId}/bills` ||
            key.startsWith(`/companies/${companyId}/bills?`) ||
            key.startsWith(`/companies/${companyId}/reports/ledger`) ||
            key.startsWith(`/companies/${companyId}/reports/daybook`))
      );

      showToast({ title: 'Voucher deleted', variant: 'success' });
      cancelEdit();
    } catch (err) {
      const status = (err as any)?.response?.status;
      const detail = (err as any)?.response?.data?.detail;

      if (status === 409) {
        const msg = typeof detail === 'string' ? detail : String(detail);
        if (typeof window !== 'undefined') {
          window.alert(msg);
        }
        return;
      }

      const msg = typeof detail === 'string' ? detail : 'Unable to delete voucher';
      showToast({ title: 'Delete failed', description: msg, variant: 'error' });
    }
  };

  const startEdit = (v: any) => {
    setEditingId(v.id);
    setEditingVoucherNumber(v.voucher_number || null);
    setFormVisible(true);
    setDate(v.voucher_date || '');
    setBillDate(v.bill_date || v.voucher_date || today);
    setType(v.voucher_type || 'PAYMENT');
    setNarration(v.narration || '');
    if (v.payment_mode_id) {
      setPaymentModeId(String(v.payment_mode_id));
      setSelectedBankLedgerId(v.ledger_id ? String(v.ledger_id) : '');
      setBankRemark(v.bank_remark || '');
    } else {
      setPaymentModeId('');
      setSelectedBankLedgerId('');
      setBankRemark('');
    }

    // Determine Cost Center visibility from existing data
    const hasDepartment = v.department_id || (v.lines && v.lines.some((l: any) => l.department_id));
    const hasProject = v.project_id || (v.lines && v.lines.some((l: any) => l.project_id));
    const hasSegment = v.segment_id || (v.lines && v.lines.some((l: any) => l.segment_id));
    const hasEmployee = v.employee_id || (v.lines && v.lines.some((l: any) => l.employee_id));
    setShowDepartment(!!hasDepartment);
    setShowProject(!!hasProject);
    setShowSegment(!!hasSegment);
    setShowEmployee(!!hasEmployee);
    setHeaderDepartmentId(v.department_id ? String(v.department_id) : '');
    setHeaderProjectId(v.project_id ? String(v.project_id) : '');
    setHeaderSegmentId(v.segment_id ? String(v.segment_id) : '');
    setHeaderEmployeeId(v.employee_id ? String(v.employee_id) : '');

    if (v.lines && Array.isArray(v.lines) && v.lines.length > 0) {
      const mappedLines = v.lines.map((l: any) => ({
        ledger_id: String(l.ledger_id),
        debit: l.debit != null ? String(l.debit) : '',
        credit: l.credit != null ? String(l.credit) : '',
        department_id:
          l.department_id !== undefined && l.department_id !== null
            ? String(l.department_id)
            : '',
        project_id:
          l.project_id !== undefined && l.project_id !== null ? String(l.project_id) : '',
        segment_id:
          l.segment_id !== undefined && l.segment_id !== null ? String(l.segment_id) : '',
        remarks: l.remarks || '',
        employee_id: l.employee_id ? String(l.employee_id) : '',
      }));
      setLines(mappedLines);
      // Pre-fill ledger search display with existing ledger id/name so that
      // editing a voucher shows which ledgers are already selected.
      const display = mappedLines.map((ln: Line) => {
        const idNum = Number(ln.ledger_id || '');
        const found = ledgers && Array.isArray(ledgers)
          ? (ledgers as any[]).filter((lg: any) => lg.id === idNum)
          : null;
        if (found && found.length > 0) {
          return `${found[0].id} - ${found[0].name}`;
        }
        return ln.ledger_id || '';
      });
      setLedgerSearch(display);
      setLedgerDropdownOpen(display.map(() => false));
    } else {
      setLines([
        { ledger_id: '', debit: '', credit: '', department_id: '', project_id: '', segment_id: '', remarks: '', employee_id: '' },
      ]);
      setLedgerSearch(['']);
      setLedgerDropdownOpen([false]);
    }
    setError(null);
    setSubmitError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingVoucherNumber(null);
    setFormVisible(false);
    setDate(today);
    setBillDate(today);
    setNarration('');
    setLines([{ 
      ledger_id: '', 
      debit: '', 
      credit: '', 
      department_id: headerDepartmentId || '',
      project_id: headerProjectId || '', 
      segment_id: headerSegmentId || '',
      remarks: '',
      employee_id: ''
    }]);
    setLedgerSearch(['']);
    setLedgerDropdownOpen([false]);
    setPaymentModeId('');
    setCashCounterpartyLedgerId('');
    setCashCounterpartyLedgerQuery('');
    setCashAmount('');
    setAgainstAllocations([]);
    setShowDepartment(false);
    setShowProject(false);
    setShowSegment(false);
    setShowEmployee(false);
    setHeaderDepartmentId('');
    setHeaderProjectId('');
    setHeaderSegmentId('');
    setHeaderEmployeeId('');
    setError(null);
    setSubmitError(null);
  };

  const filteredVouchers = useMemo(() => {
    if (!vouchers || !Array.isArray(vouchers)) return [] as any[];
    let list = vouchers as any[];

    const voucherDateKey = isBS ? 'voucher_date_bs' : 'voucher_date';
    const getVoucherDate = (v: any): string => {
      const preferred = v?.[voucherDateKey];
      if (preferred) return String(preferred);
      if (v?.voucher_date) return String(v.voucher_date);
      if (v?.voucher_date_bs) return String(v.voucher_date_bs);
      return '';
    };

    if (filterFromDate) {
      list = list.filter((v) => {
        const d = getVoucherDate(v);
        return !d || d >= filterFromDate;
      });
    }

    if (filterToDate) {
      list = list.filter((v) => {
        const d = getVoucherDate(v);
        return !d || d <= filterToDate;
      });
    }

    if (filterType && filterType !== 'ALL') {
      list = list.filter((v) => String(v?.voucher_type || '') === filterType);
    }

    if (filterPaymentModeId && filterPaymentModeId !== 'ALL') {
      list = list.filter((v) => String(v?.payment_mode_id || '') === filterPaymentModeId);
    }

    const term = filterVoucherSearch.trim().toLowerCase();
    if (term) {
      list = list.filter((v) => {
        const num = (v?.voucher_number || '').toString().toLowerCase();
        const idStr = String(v?.id || '').toLowerCase();
        return num.includes(term) || idStr.includes(term);
      });
    }

    // Sort by date desc then id desc for a stable, recent-first view
    list = [...list].sort((a, b) => {
      const ad = getVoucherDate(a);
      const bd = getVoucherDate(b);
      if (ad < bd) return 1;
      if (ad > bd) return -1;
      return (Number(b?.id) || 0) - (Number(a?.id) || 0);
    });

    return list;
  }, [vouchers, filterFromDate, filterToDate, filterType, filterPaymentModeId, filterVoucherSearch, isBS]);

  const totalPages = useMemo(() => {
    return filteredVouchers.length === 0 ? 1 : Math.max(1, Math.ceil(filteredVouchers.length / pageSize));
  }, [filteredVouchers, pageSize]);

  const pagedVouchers = useMemo(() => {
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    return filteredVouchers.slice(start, end);
  }, [filteredVouchers, page, pageSize, totalPages]);


  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        {/* top accent line - indigo/purple for vouchers */}
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">

          {/* Left: icon + text */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Vouchers</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Create and manage journal, payment, receipt &amp; contra vouchers
              </p>
            </div>
          </div>

          {/* Right: stat pills */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1">
              <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {Array.isArray(vouchers) ? vouchers.length : '—'}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/20 px-2.5 py-1">
              <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-400">
                {(vouchers as any[] || [])
                  .reduce((sum: number, v: any) => sum + Number(v?.total_amount || 0), 0)
                  .toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {canCreateOrEditVoucher && (
        <div className="relative rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px] shadow-lg mb-8">
          <Card className="border-none bg-surface-light dark:bg-slate-950 rounded-xl overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
              {/* New Voucher */}
              <button
                type="button"
                onClick={() => {
                  cancelEdit();
                  setDate(today);
                  setType(initialType);
                  setFormVisible(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                New Voucher
              </button>

              {/* Cancel — only when form is open */}
              {formVisible && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 text-xs font-semibold border border-rose-200 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                  Cancel
                </button>
              )}

              {/* Save / Update — only when form is open */}
              {formVisible && (
                <button
                  form="voucher-form"
                  type="submit"
                  disabled={submitting || !canCreateOrEditVoucher}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
                >
                  {submitting ? (
                    <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                  ) : (
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                  )}
                  {editingId ? 'Update' : 'Save'}
                </button>
              )}

              {/* Delete — only when editing */}
              {formVisible && editingId && canDeleteVoucher && (
                <button
                  type="button"
                  onClick={() => handleDelete(editingId)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-500 hover:bg-red-600 text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  Delete
                </button>
              )}

              {/* Re-Print — always visible, opens modal */}
              <button
                type="button"
                title="Re-Print a voucher"
                onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700 text-white text-xs font-semibold shadow-sm transition-all duration-150"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
                Re-Print
              </button>

              {/* Right side: Exit + status label */}
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push('/dashboard')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                  Exit
                </button>
                {editingId ? (
                  <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50">
                    ✏ Editing #{editingId}
                  </span>
                ) : formVisible ? (
                  <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                    ✦ New Voucher
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                    No voucher open
                  </span>
                )}
              </div>
            </div>

            {!formVisible ? (
              <div className="flex flex-col items-center justify-center gap-3 px-4 py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                  <svg className="w-6 h-6 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No Voucher Open</p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">Click <strong>New Voucher</strong> to start creating, or <strong>Edit</strong> an existing voucher from the list.</p>
                </div>
              </div>
            ) : (() => {
              // type-aware color accent
              const typeAccent =
                type === 'PAYMENT' ? { bg: 'bg-emerald-500', light: 'bg-emerald-50 dark:bg-emerald-900/30', border: 'border-emerald-200 dark:border-emerald-800/40', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800', ring: 'focus:ring-emerald-400' } :
                  type === 'RECEIPT' ? { bg: 'bg-blue-500', light: 'bg-blue-50 dark:bg-blue-900/30', border: 'border-blue-200 dark:border-blue-800/40', text: 'text-blue-700 dark:text-blue-300', badge: 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800', ring: 'focus:ring-blue-400' } :
                    type === 'CONTRA' ? { bg: 'bg-orange-500', light: 'bg-orange-50 dark:bg-orange-900/30', border: 'border-orange-200 dark:border-orange-800/40', text: 'text-orange-700 dark:text-orange-300', badge: 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800', ring: 'focus:ring-orange-400' } :
                      { bg: 'bg-violet-500', light: 'bg-violet-50 dark:bg-violet-900/30', border: 'border-violet-200 dark:border-violet-800/40', text: 'text-violet-700 dark:text-violet-300', badge: 'bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800', ring: 'focus:ring-violet-400' };
              return (
                <div className="overflow-hidden">
                  {/* Form colour-accent bar */}
                  <div className={`h-[3px] w-full ${typeAccent.bg}`} />
                  <div className="p-4 sm:p-5">
                    {/* Form header */}
                    <div className={`mb-5 flex items-start justify-between gap-4 rounded-xl border ${typeAccent.border} ${typeAccent.light} px-4 py-3`}>
                      <div className="flex items-start gap-3">
                        <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${typeAccent.border} bg-white dark:bg-slate-900`}>
                          <svg className={`w-4 h-4 ${typeAccent.text}`} viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                          </svg>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${typeAccent.badge}`}>{type}</span>
                            <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                              {editingId ? `Editing Voucher` : 'New Voucher'}
                            </h2>
                          </div>
                          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                            {editingVoucherNumber
                              ? <span>Voucher <span className="font-semibold text-slate-700 dark:text-slate-200">{editingVoucherNumber}</span> · Debit must equal Credit before saving.</span>
                              : 'Fill in the details below. Debit must equal Credit before saving.'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {(error || submitError) && (
                      <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700 dark:border-red-500/60 dark:bg-red-950/40 dark:text-red-100">
                        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        {error || submitError}
                      </div>
                    )}

                    {/* Top fields: Date / Type / Mode */}
                    <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-lg p-4 shadow-sm mb-5">
                      <div
                        className={`mb-3 border-b border-slate-200 pb-2 dark:border-slate-800 ${
                          type === 'JOURNAL' ? 'space-y-2' : 'flex flex-wrap items-end justify-between gap-x-3 gap-y-2'
                        }`}
                      >
                        <div
                          className={
                            type === 'JOURNAL'
                              ? 'flex flex-wrap items-center justify-between gap-x-3 gap-y-1'
                              : 'contents'
                          }
                        >
                          <h3 className="shrink-0 text-[11px] font-bold uppercase tracking-widest text-slate-500 text-indigo-600 dark:text-indigo-400">
                            Voucher Header
                          </h3>
                          <div
                            className={`text-[10px] font-medium text-slate-400 ${
                              type === 'JOURNAL' ? 'shrink-0 whitespace-nowrap' : 'text-right'
                            }`}
                          >
                            Core Details
                          </div>
                        </div>
                        {type === 'JOURNAL' && (
                          <div className="rounded-lg border border-violet-200/90 bg-violet-50/90 px-3 py-2 dark:border-violet-800/50 dark:bg-violet-950/35">
                            {renderJournalVoucherCostCenterTicks()}
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-4">
                        {/* Date Display (Priority) */}
                        <div className="flex flex-col gap-1 md:col-span-2">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Display</label>
                          <Select
                            value={displayMode}
                            onChange={(e) => setDisplayMode(e.target.value as any)}
                            className="h-9 text-xs font-bold border-slate-200 shadow-sm"
                          >
                            <option value="AD">AD</option>
                            <option value="BS">BS</option>
                            <option value="BOTH">BOTH</option>
                          </Select>
                        </div>

                        <div className="flex flex-col gap-1 md:col-span-3">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Voucher Date ({dateDisplayMode === 'BOTH' ? 'AD & BS' : (dateDisplayMode === 'BS' ? 'BS' : 'AD')}) <span className="text-red-500">*</span></label>
                          {dateDisplayMode === 'BOTH' ? (
                            <div className="flex flex-row gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 pointer-events-none z-10">AD</span>
                                <Input
                                  type="date"
                                  calendarMode="AD"
                                  forceNative={false}
                                  className="h-9 w-full pl-8 text-xs text-center"
                                  value={isBS ? (safeBSToAD(date) || "") : date}
                                  min={company?.fiscal_year_start || ""}
                                  max={company?.fiscal_year_end || ""}
                                  onChange={(e) => handleVoucherDateChangeAD(e.target.value)}
                                  required
                                />
                              </div>
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 pointer-events-none z-10">BS</span>
                                <Input
                                  type="date"
                                  calendarMode="BS"
                                  forceNative={false}
                                  className="h-9 w-full pl-8 text-xs text-center"
                                  value={isBS ? (safeBSToAD(date) || "") : date}
                                  onChange={(e) => handleVoucherDateChangeAD(e.target.value)}
                                  required
                                />
                              </div>
                            </div>
                          ) : (
                            <Input
                              type="date"
                              calendarMode={dateDisplayMode === 'BS' ? 'BS' : 'AD'}
                              forceNative={false}
                              className="h-9 w-full text-xs"
                              value={isBS ? (safeBSToAD(date) || "") : date}
                              min={company?.fiscal_year_start || ""}
                              max={company?.fiscal_year_end || ""}
                              onChange={(e) => handleVoucherDateChangeAD(e.target.value)}
                              required
                            />
                          )}
                        </div>

                        {/* Bill Date (Reference) */}
                        <div className="flex flex-col gap-1 md:col-span-3">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 whitespace-nowrap">Bill Date ({dateDisplayMode === 'BOTH' ? 'AD & BS' : (dateDisplayMode === 'BS' ? 'BS' : 'AD')})</label>
                          {dateDisplayMode === 'BOTH' ? (
                            <div className="flex flex-row gap-2">
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 pointer-events-none z-10">AD</span>
                                <Input
                                  type="date"
                                  calendarMode="AD"
                                  forceNative={false}
                                  className="h-9 w-full pl-8 text-xs text-center"
                                  value={isBS ? (safeBSToAD(billDate) || "") : billDate}
                                  min={company?.fiscal_year_start || ""}
                                  max={company?.fiscal_year_end || ""}
                                  onChange={(e) => handleBillDateChangeAD(e.target.value)}
                                />
                              </div>
                              <div className="relative flex-1">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500 pointer-events-none z-10">BS</span>
                                <Input
                                  type="date"
                                  calendarMode="BS"
                                  forceNative={false}
                                  className="h-9 w-full pl-8 text-xs text-center"
                                  value={isBS ? (safeBSToAD(billDate) || "") : billDate}
                                  onChange={(e) => handleBillDateChangeAD(e.target.value)}
                                />
                              </div>
                            </div>
                          ) : (
                            <Input
                              type="date"
                              calendarMode={dateDisplayMode === 'BS' ? 'BS' : 'AD'}
                              forceNative={false}
                              className="h-9 w-full text-xs"
                              value={isBS ? (safeBSToAD(billDate) || "") : billDate}
                              min={company?.fiscal_year_start || ""}
                              max={company?.fiscal_year_end || ""}
                              onChange={(e) => handleBillDateChangeAD(e.target.value)}
                            />
                          )}
                        </div>
                        <div className="flex flex-col gap-1 md:col-span-2">
                          <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Type</label>
                          <Select value={type} onChange={(e) => setType(e.target.value)}
                            className="h-9 text-xs font-medium" disabled>
                            {allowedTypes.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </Select>
                        </div>

                        {['PAYMENT', 'RECEIPT', 'CONTRA'].includes(type) && (
                          <div className="flex flex-col gap-1 md:col-span-2">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {isCashModeSelected ? 'Mode & Bal' : 'Mode'}
                            </label>
                            <div className="flex gap-2">
                              <Select value={paymentModeId} onChange={(e) => setPaymentModeId(e.target.value)}
                                className="h-9 text-xs flex-1">
                                <option value="">Select mode</option>
                                {paymentModes?.map((pm) => (
                                  <option key={pm.id} value={pm.id}>{pm.name}</option>
                                ))}
                              </Select>
                              {isCashModeSelected && (
                                <div className="h-9 flex items-center px-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shadow-sm whitespace-nowrap min-w-[80px] transition-all">
                                  {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {type !== 'JOURNAL' && renderHeaderCostCenterFieldsGrid()}
                      </div>
                    </div>

                    {isBankModeSelected && (
                      <div className="bg-blue-50/30 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-lg p-4 shadow-sm mb-5 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 gap-x-3 gap-y-4">
                          <div className="flex flex-col gap-1 xl:col-span-4 lg:col-span-2">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Bank Account & Balance</label>
                            <div className="flex gap-2">
                              <Select value={selectedBankLedgerId} onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                                className="h-9 text-xs flex-1 !bg-white/50">
                                {bankLedgers.map((bl: any) => (
                                  <option key={bl.id} value={bl.id}>{bl.name}</option>
                                ))}
                              </Select>
                              <div className="h-9 flex items-center px-3 rounded-md bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-[10px] font-bold text-blue-700 dark:text-blue-300 shadow-sm whitespace-nowrap min-w-[80px] transition-all">
                                {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-1 xl:col-span-8 lg:col-span-2">
                            <label className="text-[11px] font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">Bank Remark</label>
                            <Input
                              value={bankRemark}
                              onChange={(e) => setBankRemark(e.target.value)}
                              placeholder="Cheque No / Transaction ID / Remarks..."
                              className="h-9 text-xs"
                            />
                          </div>
                        </div>
                      </div>
                    )}

                    <form id="voucher-form" onSubmit={handleSubmit} className="space-y-5 text-sm">
                      <div className="space-y-6">
                        <div className="space-y-2">
                          {['PAYMENT', 'RECEIPT'].includes(type) && !editingId ? (
                            <div className={`rounded-xl border ${typeAccent.border} bg-white shadow-sm dark:bg-slate-950`}>
                              <div className={`flex items-center gap-2 border-b ${typeAccent.border} ${typeAccent.light} px-4 py-2.5`}>
                                <svg className={`w-3.5 h-3.5 ${typeAccent.text}`} viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                                </svg>
                                <h3 className={`text-xs font-bold uppercase tracking-wide ${typeAccent.text}`}>
                                  Transaction Details
                                </h3>
                              </div>

                              <div className="p-4 grid grid-cols-1 gap-6 md:grid-cols-12">
                                {/* Left Column: Party Ledger */}
                                <div className="md:col-span-7 space-y-1.5">
                                  <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                    Party Ledger
                                  </label>
                                  <div className="flex gap-2">
                                    <div className="relative flex-1">
                                      <SearchableSelect
                                        options={formattedCounterpartyOptions}
                                        value={cashCounterpartyLedgerId}
                                        onChange={(val) => {
                                          setCashCounterpartyLedgerId(val);
                                          const opt = formattedCounterpartyOptions.find(o => o.value === val);
                                          if (opt) setCashCounterpartyLedgerQuery(opt.label);
                                        }}
                                        placeholder="Select Party..."
                                        triggerClassName="h-9 text-sm font-semibold border-slate-300"
                                      />
                                    </div>
                                    {cashCounterpartyBalance !== null && (
                                      <div className={`h-9 flex items-center px-3 rounded-md border ${typeAccent.border} ${typeAccent.light} text-xs font-bold ${typeAccent.text} shadow-sm whitespace-nowrap min-w-[100px] transition-all`}>
                                        {Math.abs(cashCounterpartyBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {cashCounterpartyBalance >= 0 ? 'Dr' : 'Cr'}
                                      </div>
                                    )}
                                  </div>
                                  {cashCounterpartyPartyLabel && (
                                    <div className="text-[11px] font-medium text-blue-600 dark:text-blue-400">
                                      {cashCounterpartyPartyLabel}
                                    </div>
                                  )}
                                </div>

                                {/* Right Column: Amount */}
                                <div className="md:col-span-5 space-y-1.5">
                                  <div className="flex items-center justify-between">
                                    <label className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                      Amount
                                    </label>
                                    {againstAllocations.length > 0 && (
                                      <span className="text-[10px] text-blue-600 dark:text-blue-400">
                                        Rem: {againstRemainingAmount.toFixed(2)}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Input
                                      type="number"
                                      step="0.01"
                                      value={cashAmount}
                                      onChange={(e) => setCashAmount(e.target.value)}
                                      min={0}
                                      placeholder="0.00"
                                      className="h-9 w-full px-3 text-right text-sm font-semibold text-slate-900 dark:text-slate-100"
                                    />
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant={againstAllocations.length > 0 ? "primary" : "outline"}
                                      className={`h-9 w-9 shrink-0 ${againstAllocations.length > 0 ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                                      title="Allocate against dues"
                                      onClick={() => {
                                        if (!cashCounterpartyLedgerId) {
                                          setSubmitError('Counterparty ledger is required before allocating against dues.');
                                          return;
                                        }
                                        setAgainstOpen(true);
                                      }}
                                    >
                                      <span className="text-[10px] font-bold">REF</span>
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className={`rounded-xl border ${typeAccent.border} bg-white shadow-sm dark:bg-slate-950`}>
                                <div className={`flex items-center justify-between border-b ${typeAccent.border} ${typeAccent.light} px-4 py-2.5`}>
                                  <div className="flex items-center gap-2">
                                    <svg className={`w-3.5 h-3.5 ${typeAccent.text}`} viewBox="0 0 20 20" fill="currentColor">
                                      <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
                                    </svg>
                                    <span className={`text-xs font-bold uppercase tracking-wide ${typeAccent.text}`}>Voucher Lines</span>
                                  </div>
                                </div>
                                <div className="relative w-full overflow-hidden">
                                  <table className="w-full border-separate border-spacing-0 text-xs table-fixed">
                                    <colgroup>
                                      {voucherLinesColPercents.map((pct, ci) => (
                                        <col key={ci} style={{ width: `${pct}%` }} />
                                      ))}
                                    </colgroup>
                                    <thead className="sticky top-0 z-20 bg-slate-50 shadow-sm dark:bg-slate-900">
                                      <tr className="border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:border-slate-800 dark:text-slate-400">
                                        <th className="min-w-0 border-b border-slate-200 px-1 py-1.5 align-middle text-left dark:border-slate-800">
                                          Ledger
                                        </th>
                                        {showDepartmentSelector && (
                                          <th className="min-w-0 border-b border-slate-200 px-1 py-1.5 align-middle text-left dark:border-slate-800 whitespace-nowrap">
                                            Dept
                                          </th>
                                        )}
                                        {showProjectSelector && (
                                          <th className="min-w-0 border-b border-slate-200 px-1 py-1.5 align-middle text-left dark:border-slate-800 whitespace-nowrap">
                                            Proj
                                          </th>
                                        )}
                                        {showSegmentSelector && (
                                          <th className="min-w-0 border-b border-slate-200 px-1 py-1.5 align-middle text-left dark:border-slate-800 whitespace-nowrap">
                                            Seg
                                          </th>
                                        )}
                                        {showEmployeeSelector && (
                                          <th className="min-w-0 border-b border-slate-200 px-1 py-1.5 align-middle text-left dark:border-slate-800 whitespace-nowrap">
                                            Emp
                                          </th>
                                        )}
                                        <th
                                          scope="col"
                                          className="min-w-0 border-b border-slate-200 px-2 py-1.5 align-middle text-right dark:border-slate-800 whitespace-nowrap"
                                        >
                                          Debit
                                        </th>
                                        <th
                                          scope="col"
                                          className="min-w-0 border-b border-slate-200 px-2 py-1.5 align-middle text-right dark:border-slate-800 whitespace-nowrap"
                                        >
                                          Credit
                                        </th>
                                        <th
                                          scope="col"
                                          className="min-w-0 border-b border-slate-200 px-2 py-1.5 align-middle text-right dark:border-slate-800 whitespace-nowrap"
                                        >
                                          Remarks
                                        </th>
                                        <th className="min-w-0 border-b border-slate-200 px-0.5 py-1.5 align-middle text-center dark:border-slate-800">
                                          <span className="sr-only">Actions</span>
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {lines.map((line, idx) => {
                                        const term = (ledgerSearch[idx] || '').trim().toLowerCase();

                                        const usedCashLedgerIds = new Set<number>();
                                        if (type === 'CONTRA' && ledgers && Array.isArray(lines)) {
                                          lines.forEach((ln, j) => {
                                            if (j === idx) return;
                                            const rawId = Number(ln.ledger_id || '0');
                                            if (!rawId) return;
                                            const found = ledgers.find((lg: any) => lg.id === rawId);
                                            if (found && isCashOrBankLedger(found)) {
                                              usedCashLedgerIds.add(rawId);
                                            }
                                          });
                                        }

                                        let options = ledgerOptionsForTable;
                                        if (term) {
                                          options = options
                                            .filter((o: any) => {
                                              const name = String(o.name || '').toLowerCase();
                                              const label = String(o.label || '').toLowerCase();
                                              const id = String(o.ledgerId || '');
                                              const partyId = String(o.partyId || '');
                                              return label.includes(term) ||
                                                name.includes(term) ||
                                                id.includes(term) ||
                                                partyId.includes(term);
                                            })
                                            .slice(0, 100);
                                        }

                                        if (type === 'CONTRA') {
                                          options = [...options]
                                            .sort((a, b) => {
                                              const aIs = isCashOrBankLedger(a) ? 1 : 0;
                                              const bIs = isCashOrBankLedger(b) ? 1 : 0;
                                              return bIs - aIs;
                                            })
                                            .filter((l) => {
                                              if (!isCashOrBankLedger(l)) return true;
                                              if (String(l.id) === String(line.ledger_id || '')) return true;
                                              return !usedCashLedgerIds.has(l.id as number);
                                            });
                                        }

                                        return (
                                          <tr key={idx} className="border-b last:border-none dark:border-slate-800">
                                            <td className="min-w-0 px-1 py-1 align-middle">
                                              <div className="flex w-full min-w-0 flex-nowrap items-center gap-1.5">
                                                <div className="min-w-0 flex-1">
                                                  <SearchableSelect
                                                    options={formattedTableLedgerOptions}
                                                    value={line.ledger_id || ''}
                                                    onChange={(val) => {
                                                      handleLineChange(idx, 'ledger_id', val);
                                                      const opt = formattedTableLedgerOptions.find(o => o.value === val);
                                                      if (opt) {
                                                        setLedgerSearch((prev) => {
                                                          const copy = [...prev];
                                                          copy[idx] = opt.label;
                                                          return copy;
                                                        });
                                                      }
                                                    }}
                                                    placeholder="Search ledger..."
                                                    triggerClassName="!min-h-0 h-9 max-h-9 text-[11px] !px-2 !py-1 border-slate-200 dark:border-slate-800"
                                                  />
                                                </div>
                                                {line.ledger_id && focusedLineIdx === idx && focusedLineBalance !== null && (
                                                  <span
                                                    title={`Balance: ${Math.abs(focusedLineBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${focusedLineBalance >= 0 ? 'Dr' : 'Cr'}`}
                                                    className="max-w-[5.5rem] shrink-0 truncate text-[10px] font-bold tabular-nums text-slate-500 dark:text-slate-400"
                                                  >
                                                    {Math.abs(focusedLineBalance).toLocaleString(undefined, {
                                                      minimumFractionDigits: 2,
                                                      maximumFractionDigits: 2,
                                                    })}
                                                    <span className="ml-0.5">{focusedLineBalance >= 0 ? 'Dr' : 'Cr'}</span>
                                                  </span>
                                                )}
                                              </div>
                                            </td>
                                            {showDepartmentSelector && (
                                              <td className="min-w-0 px-1 py-1 align-middle">
                                                {headerDepartmentId ? (
                                                  <div className="flex h-9 min-w-0 w-full items-center truncate rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                                    {activeDepartments.find(d => String(d.id) === headerDepartmentId)?.name || 'Selected'}
                                                  </div>
                                                ) : (
                                                  <Select
                                                    className="h-9 min-w-0 w-full truncate !px-2 !py-1 text-[11px] leading-tight"
                                                    value={line.department_id || ''}
                                                    onChange={(e) => {
                                                      if (e.target.value === 'ADD_NEW') {
                                                        setPendingCostCenterAction({ type: 'dept', lineIdx: idx });
                                                        setIsQuickDeptModalOpen(true);
                                                        return;
                                                      }
                                                      handleLineChange(idx, 'department_id', e.target.value)
                                                    }}
                                                  >
                                                    <option value="">Select</option>
                                                    <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                                    {activeDepartments.map((d) => (
                                                      <option key={d.id} value={d.id}>
                                                        {d.name}
                                                      </option>
                                                    ))}
                                                  </Select>
                                                )}
                                              </td>
                                            )}
                                            {showProjectSelector && (
                                              <td className="min-w-0 px-1 py-1 align-middle">
                                                {headerProjectId ? (
                                                  <div className="flex h-9 min-w-0 w-full items-center truncate rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                                    {activeProjects.find(p => String(p.id) === headerProjectId)?.name || 'Selected'}
                                                  </div>
                                                ) : (
                                                  <Select
                                                    className="h-9 min-w-0 w-full truncate !px-2 !py-1 text-[11px] leading-tight"
                                                    value={line.project_id || ''}
                                                    onChange={(e) => {
                                                      if (e.target.value === 'ADD_NEW') {
                                                        setPendingCostCenterAction({ type: 'proj', lineIdx: idx });
                                                        setIsQuickProjModalOpen(true);
                                                        return;
                                                      }
                                                      handleLineChange(idx, 'project_id', e.target.value)
                                                    }}
                                                  >
                                                    <option value="">Select</option>
                                                    <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                                    {activeProjects.map((p) => (
                                                      <option key={p.id} value={p.id}>
                                                        {p.name}
                                                      </option>
                                                    ))}
                                                  </Select>
                                                )}
                                              </td>
                                            )}
                                            {showSegmentSelector && (
                                              <td className="min-w-0 px-1 py-1 align-middle">
                                                {headerSegmentId ? (
                                                  <div className="flex h-9 min-w-0 w-full items-center truncate rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                                    {activeSegments.find(s => String(s.id) === headerSegmentId)?.name || 'Selected'}
                                                  </div>
                                                ) : (
                                                  <Select
                                                    className="h-9 min-w-0 w-full truncate !px-2 !py-1 text-[11px] leading-tight"
                                                    value={line.segment_id || ''}
                                                    onChange={(e) => {
                                                      if (e.target.value === 'ADD_NEW') {
                                                        setPendingCostCenterAction({ type: 'seg', lineIdx: idx });
                                                        setIsQuickSegModalOpen(true);
                                                        return;
                                                      }
                                                      handleLineChange(idx, 'segment_id', e.target.value)
                                                    }}
                                                  >
                                                    <option value="">Select</option>
                                                    <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                                    {activeSegments.map((s) => (
                                                      <option key={s.id} value={s.id}>
                                                        {s.name}
                                                      </option>
                                                    ))}
                                                  </Select>
                                                )}
                                              </td>
                                            )}
                                            {showEmployeeSelector && (
                                              <td className="min-w-0 px-1 py-1 align-middle">
                                                {headerEmployeeId ? (
                                                  <div className="flex h-9 min-w-0 w-full items-center truncate rounded border border-slate-100 bg-slate-50/50 px-2 py-1 text-[11px] font-medium text-slate-500 dark:border-slate-800 dark:bg-slate-900/30">
                                                    {activeEmployees.find(e => String(e.id) === headerEmployeeId)?.full_name || 'Selected'}
                                                  </div>
                                                ) : (
                                                  <SearchableSelect
                                                    className="min-w-0 w-full"
                                                    triggerClassName="!min-h-0 h-9 max-h-9 !px-2 !py-1 text-[11px] leading-tight"
                                                    options={employeeOptions}
                                                    value={line.employee_id || ''}
                                                    onChange={(val) => {
                                                      if (val === 'ADD_NEW') {
                                                        setPendingCostCenterAction({ type: 'emp', lineIdx: idx });
                                                        setIsQuickEmpModalOpen(true);
                                                        return;
                                                      }
                                                      handleLineChange(idx, 'employee_id', val)
                                                    }}
                                                    placeholder="Search employee..."
                                                  />
                                                )}
                                              </td>
                                            )}
                                            <td className="min-w-0 px-2 py-1 align-middle">
                                              <div className="flex w-full justify-center">
                                                <Input
                                                  id={`voucher-line-${idx}-debit`}
                                                  type="number"
                                                  step="0.01"
                                                  aria-label={`Line ${idx + 1} debit`}
                                                  className="h-9 w-full min-w-0 max-w-[11rem] px-2 py-1.5 text-right text-sm font-semibold tabular-nums leading-snug placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                                  placeholder="0.00"
                                                  value={line.debit}
                                                  onChange={(e) => handleLineChange(idx, 'debit', e.target.value)}
                                                />
                                              </div>
                                            </td>
                                            <td className="min-w-0 px-2 py-1 align-middle">
                                              <div className="flex w-full justify-center">
                                                <Input
                                                  id={`voucher-line-${idx}-credit`}
                                                  type="number"
                                                  step="0.01"
                                                  aria-label={`Line ${idx + 1} credit`}
                                                  className="h-9 w-full min-w-0 max-w-[11rem] px-2 py-1.5 text-right text-sm font-semibold tabular-nums leading-snug placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                                  placeholder="0.00"
                                                  value={line.credit}
                                                  onChange={(e) => handleLineChange(idx, 'credit', e.target.value)}
                                                />
                                              </div>
                                            </td>
                                            <td className="min-w-0 px-2 py-1 align-middle">
                                              <div className="flex w-full justify-center">
                                                <Input
                                                  id={`voucher-line-${idx}-remarks`}
                                                  type="text"
                                                  aria-label={`Line ${idx + 1} remarks`}
                                                  className="h-9 w-full min-w-0 max-w-[22rem] px-2 py-1.5 text-right text-sm leading-snug placeholder:text-right placeholder:text-slate-400 dark:placeholder:text-slate-500"
                                                  value={line.remarks || ''}
                                                  placeholder="Remark"
                                                  onChange={(e) => handleLineChange(idx, 'remarks', e.target.value)}
                                                />
                                              </div>
                                            </td>
                                            <td className="min-w-0 px-0.5 py-1 align-middle text-center">
                                              {lines.length > 1 && (
                                                <button
                                                  type="button"
                                                  onClick={() => {
                                                    setLines((prev) => prev.filter((_, i) => i !== idx));
                                                    setLedgerSearch((prev) => prev.filter((_, i) => i !== idx));
                                                  }}
                                                  className="inline-flex rounded border border-rose-200/60 bg-rose-50 p-1.5 text-rose-500 hover:bg-rose-100 hover:text-rose-700 transition-colors"
                                                  title="Remove Line"
                                                >
                                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                  </svg>
                                                </button>
                                              )}
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                    <tfoot className={`border-t-2 ${typeAccent.border} ${typeAccent.light} text-[11px]`}>
                                      <tr>
                                        <td className={`px-1 py-2 text-right text-xs font-bold uppercase tracking-wide ${typeAccent.text}`}
                                          colSpan={
                                            1 +
                                            (showDepartmentSelector ? 1 : 0) +
                                            (showProjectSelector ? 1 : 0) +
                                            (showSegmentSelector ? 1 : 0) +
                                            (showEmployeeSelector ? 1 : 0)
                                          }
                                        >
                                          Total
                                        </td>
                                        <td className="px-2 py-2.5 align-middle">
                                          <div className="flex w-full justify-center">
                                            <div className="w-full max-w-[11rem] text-right font-black tabular-nums text-sm text-slate-800 dark:text-slate-100">
                                              {totals.debit.toFixed(2)}
                                            </div>
                                          </div>
                                        </td>
                                        <td className="px-2 py-2.5 align-middle">
                                          <div className="flex w-full justify-center">
                                            <div className="w-full max-w-[11rem] text-right font-black tabular-nums text-sm text-slate-800 dark:text-slate-100">
                                              {totals.credit.toFixed(2)}
                                            </div>
                                          </div>
                                        </td>
                                        <td colSpan={2} className="px-1 py-2"></td>
                                      </tr>
                                    </tfoot>
                                  </table>
                                </div>
                              </div>
                              <div className="mt-3">
                                <div className="flex flex-wrap gap-2">
                                  <button type="button" onClick={addLine}
                                    className={`inline-flex items-center gap-1.5 rounded-lg border ${typeAccent.border} ${typeAccent.light} px-3 py-1.5 text-xs font-semibold ${typeAccent.text} hover:opacity-80 transition-opacity`}>
                                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                                    Add line
                                  </button>
                                  {(type === 'CONTRA' || type === 'JOURNAL') && (
                                    <button type="button" onClick={autoBalance}
                                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors">
                                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-4.75a.75.75 0 001.5 0V8.66l1.95 2.1a.75.75 0 101.1-1.02l-3.25-3.5a.75.75 0 00-1.1 0L6.2 9.74a.75.75 0 101.1 1.02l1.95-2.1v4.59z" clipRule="evenodd" /></svg>
                                      Auto-balance
                                    </button>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </div>

                        {/* Bottom panel: Narration and Summary */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t dark:border-slate-800">
                          <div className="space-y-1.5">
                            <label className={`text-[11px] font-bold uppercase tracking-wide ${typeAccent.text}`}>Narration</label>
                            <textarea
                              rows={4}
                              value={narration}
                              onChange={(e) => setNarration(e.target.value)}
                              className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                              placeholder="Optional notes about this voucher…"
                            />
                          </div>
                          <div className={`space-y-3 rounded-xl border ${typeAccent.border} ${typeAccent.light} p-4 text-xs shadow-sm self-start`}>
                            <div className={`text-[11px] font-bold uppercase tracking-wider ${typeAccent.text}`}>Summary</div>
                            <div className="space-y-2">
                              <div className="flex justify-between items-center rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-2 shadow-sm">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Total Debit</span>
                                <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100 text-sm">{totals.debit.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between items-center rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-2 shadow-sm">
                                <span className="text-slate-500 dark:text-slate-400 font-medium">Total Credit</span>
                                <span className="font-bold tabular-nums text-slate-900 dark:text-slate-100 text-sm">{totals.credit.toFixed(2)}</span>
                              </div>
                              <div className={`flex justify-between items-center rounded-lg border px-3 py-2 shadow-sm ${totals.debit.toFixed(2) === totals.credit.toFixed(2)
                                ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-950/20'
                                : 'border-red-200 bg-red-50 dark:border-red-500/30 dark:bg-red-950/20'
                                }`}>
                                <span className={`font-semibold ${totals.debit.toFixed(2) === totals.credit.toFixed(2) ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>Status</span>
                                <span className={`font-black uppercase tracking-tight ${totals.debit.toFixed(2) === totals.credit.toFixed(2) ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>
                                  {totals.debit.toFixed(2) === totals.credit.toFixed(2) ? '✓ Balanced' : '✗ Unbalanced'}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </form>


                    <AgainstModal
                      open={againstOpen}
                      onClose={() => setAgainstOpen(false)}
                      companyId={Number(companyId)}
                      voucherType={type as 'PAYMENT' | 'RECEIPT'}
                      counterpartyLedgerId={cashCounterpartyLedgerId ? Number(cashCounterpartyLedgerId) : null}
                      voucherAmount={Number(cashAmount || '0')}
                      onVoucherAmountChange={(next) => setCashAmount(String(next))}
                      initialAllocations={againstAllocations}
                      onConfirm={(allocs) => {
                        setSubmitError(null);
                        setAgainstAllocations(allocs);
                      }}
                    />

                    <QuickDepartmentModal
                      open={isQuickDeptModalOpen}
                      onClose={() => setIsQuickDeptModalOpen(false)}
                      companyId={companyId}
                      onSuccess={(newId) => {
                        mutateDepartments();
                        if (pendingCostCenterAction?.lineIdx === 'header') {
                          setHeaderDepartmentId(String(newId));
                          applyHeaderDepartmentToLines(String(newId));
                        } else if (typeof pendingCostCenterAction?.lineIdx === 'number') {
                          handleLineChange(pendingCostCenterAction.lineIdx, 'department_id', String(newId));
                        }
                      }}
                    />

                    <QuickProjectModal
                      open={isQuickProjModalOpen}
                      onClose={() => setIsQuickProjModalOpen(false)}
                      companyId={companyId}
                      onSuccess={(newId) => {
                        mutateProjects();
                        if (pendingCostCenterAction?.lineIdx === 'header') {
                          setHeaderProjectId(String(newId));
                          applyHeaderProjectToLines(String(newId));
                        } else if (typeof pendingCostCenterAction?.lineIdx === 'number') {
                          handleLineChange(pendingCostCenterAction.lineIdx, 'project_id', String(newId));
                        }
                      }}
                    />

                    <QuickSegmentModal
                      open={isQuickSegModalOpen}
                      onClose={() => setIsQuickSegModalOpen(false)}
                      companyId={companyId}
                      onSuccess={(newId) => {
                        mutateSegments();
                        if (pendingCostCenterAction?.lineIdx === 'header') {
                          setHeaderSegmentId(String(newId));
                          applyHeaderSegmentToLines(String(newId));
                        } else if (typeof pendingCostCenterAction?.lineIdx === 'number') {
                          handleLineChange(pendingCostCenterAction.lineIdx, 'segment_id', String(newId));
                        }
                      }}
                    />

                    <QuickEmployeeModal
                      open={isQuickEmpModalOpen}
                      onClose={() => setIsQuickEmpModalOpen(false)}
                      companyId={String(companyId)}
                      onSuccess={(newId) => {
                        mutateEmployees();
                        if (pendingCostCenterAction?.lineIdx === 'header') {
                          setHeaderEmployeeId(String(newId));
                          applyHeaderEmployeeToLines(String(newId));
                        } else if (typeof pendingCostCenterAction?.lineIdx === 'number') {
                          handleLineChange(pendingCostCenterAction.lineIdx, 'employee_id', String(newId));
                        }
                      }}
                    />
                  </div>
                </div>
              );
            })()}
          </Card>
        </div>
      )}



      {/* ═══ Success Popup Modal ═══ */}
      <Modal
        open={successPopupOpen}
        onClose={() => {
          setSuccessPopupOpen(false);
          cancelEdit();
        }}
        title="Message !"
        className="max-w-md"
      >
        <div className="flex flex-col items-center gap-4 py-2">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800">
            <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Transaction Saved Successfully With Voucher No. {savedVoucherInfo?.number}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Confirm to Print Slip ?
            </p>
          </div>
          <div className="mt-4 flex w-full items-center justify-center gap-3">
            <Button
              variant="primary"
              onClick={() => {
                if (savedVoucherInfo) {
                  const printUrl = `/companies/${companyId}/vouchers/${savedVoucherInfo.id}?print=1`;
                  window.open(printUrl, '_blank');
                }
                setSuccessPopupOpen(false);
                cancelEdit();
              }}
              className="flex-1"
            >
              OK
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setSuccessPopupOpen(false);
                cancelEdit();
              }}
              className="flex-1"
            >
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* ═══ Re-Print Modal ═══ */}
      {showReprintModal && (
        <div
          className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReprintModal(false); }}
        >
          <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print a Voucher</span>
              </div>
              <button type="button" onClick={() => setShowReprintModal(false)}
                className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Search bar */}
            <div className="px-5 pt-4 pb-2">
              <div className="relative">
                <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                </svg>
                <input autoFocus type="text" placeholder="Search by voucher #, type or party..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                  value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Showing <span className="font-semibold text-teal-600">{type}</span> vouchers — click <strong>View &amp; Print</strong> to open in a new tab.
              </p>
            </div>

            {/* Voucher list */}
            <div className="px-5 pb-5 max-h-80 overflow-y-auto">
              {(() => {
                const q = reprintSearch.trim().toLowerCase();
                const modalVouchers = (vouchers as any[] || []).filter((v: any) => {
                  // Only show vouchers matching the current section type
                  if (String(v?.voucher_type || '') !== type) return false;
                  if (!q) return true;
                  const num = String(v?.voucher_number || '').toLowerCase();
                  const idStr = String(v?.id || '').toLowerCase();
                  const counterpartyId = Number((v as any)?.counterparty_ledger_id || 0);
                  const partyLbl = counterpartyId ? (partyLabelByLedgerId[counterpartyId] || '').toLowerCase() : '';
                  return num.includes(q) || idStr.includes(q) || partyLbl.includes(q);
                });
                if (!vouchers) return (
                  <div className="flex items-center gap-2 py-6 text-xs text-slate-400 justify-center">
                    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    Loading vouchers...
                  </div>
                );
                if (modalVouchers.length === 0) return (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No vouchers found matching your search.
                  </div>
                );
                return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-1">
                    {modalVouchers.map((v: any) => {
                      const amount = Number(v?.total_amount || 0);
                      const counterpartyId = Number((v as any)?.counterparty_ledger_id || 0);
                      const partyLbl = counterpartyId ? (partyLabelByLedgerId[counterpartyId] || '') : '';
                      const vDate = isBS
                        ? ((v as any)?.voucher_date_bs ? String((v as any).voucher_date_bs) : String(v?.voucher_date || ''))
                        : String(v?.voucher_date || '');
                      return (
                        <div key={v.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors border-l-2 border-transparent hover:border-teal-500">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 border border-teal-100 dark:border-teal-800/40">
                                {v.voucher_number || `#${v.id}`}
                              </span>
                              <span className="inline-flex items-center rounded-full bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/40 uppercase tracking-tighter">
                                {v.voucher_type}
                              </span>
                              {partyLbl && (
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{partyLbl}</span>
                              )}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                              <span>{vDate}</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                            <a href={`/companies/${companyId}/vouchers/${v.id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-semibold shadow-sm transition-colors">
                              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                              </svg>
                              Print
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

    </div >
  );
}
