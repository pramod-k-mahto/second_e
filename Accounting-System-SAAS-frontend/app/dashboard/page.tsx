"use client";

import useSWR from 'swr';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  LineChart,
  Line,
  CartesianGrid,
  Cell,
} from 'recharts';
import {
  api,
  getCurrentCompany,
  getCompanyLogo,
  CurrentCompany,
  SalesOrderSummary,
  PurchaseOrderSummary,
  convertSalesOrderToInvoice,
  convertPurchaseOrderToBill,
  NotificationRecord,
  markNotificationRead,
} from '@/lib/api';
import { SummaryWidget } from '@/components/dashboard/SummaryWidget';
import { SummaryWidgetSkeleton } from '@/components/dashboard/SummaryWidgetSkeleton';
import { ChartCard } from '@/components/dashboard/ChartCard';
import { ChartSkeleton } from '@/components/dashboard/ChartSkeleton';
import { RecentVouchersTable } from '@/components/dashboard/RecentVouchersTable';
import { TopPartiesTable } from '@/components/dashboard/TopPartiesTable';
import { SalesMixReport } from '@/components/dashboard/SalesMixReport';
import { ExpensesMixReport } from '@/components/dashboard/ExpensesMixReport';
import { useMenuAccess, useMenuPermissions } from '@/components/MenuPermissionsContext';
import { useCalendarSettings } from '@/components/CalendarSettingsContext';
import { CalendarReportDisplayMode } from '@/lib/calendarMode';
import { Input } from '@/components/ui/Input';
import { safeADToBS, safeBSToAD, getBSMonthRange, getBSWeekRange } from '@/lib/bsad';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type TrialBalanceRow = {
  row_type?: 'GROUP' | 'SUB_GROUP' | 'LEDGER' | 'TOTAL';
  ledger_name: string;
  closing_debit: number;
  closing_credit: number;
};

export default function DashboardPage() {
  const { isMenuAllowed } = useMenuPermissions();
  const { allowed: dashboardAllowed } = useMenuAccess('DASHBOARD');
  const { displayMode, reportMode, setReportMode } = useCalendarSettings();

  // Module Access Flags
  const showSales = isMenuAllowed('sales.invoice.list');
  const showPurchases = isMenuAllowed('purchases.bill.list');
  const showInventory = isMenuAllowed('inventory.items');
  const showAccounting = isMenuAllowed('accounting.voucher.payment');
  const showReports = isMenuAllowed('reports.pnl');
  const showTasks = isMenuAllowed('TASKS');

  const [currentCompany, setCurrentCompanyState] = useState<CurrentCompany | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const cc = getCurrentCompany();
    setCurrentCompanyState(cc);
  }, []);



  const companyId = currentCompany?.id;

  const hasToken = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.localStorage.getItem('access_token'));
  }, []);

  const { data: currentUser } = useSWR<any>(hasToken ? '/auth/me' : null, fetcher);
  const userRoleLower = (currentUser?.role ? String(currentUser.role) : '').toLowerCase();
  const isTenantUser = userRoleLower === 'user';
  const isAdminViewer = Boolean(userRoleLower && userRoleLower !== 'user');

  const tasksLastSeenKey = useMemo(() => {
    const uid = currentUser?.id;
    if (!companyId || !uid) return null;
    return `tasks:lastSeen:${companyId}:${uid}`;
  }, [companyId, currentUser?.id]);

  const [tasksLastSeenAt, setTasksLastSeenAt] = useState<number>(0);

  useEffect(() => {
    if (!tasksLastSeenKey) return;
    try {
      const raw = window.localStorage.getItem(tasksLastSeenKey);
      const n = raw ? Number(raw) : 0;
      setTasksLastSeenAt(Number.isFinite(n) ? n : 0);
    } catch {
      setTasksLastSeenAt(0);
    }
  }, [tasksLastSeenKey]);

  const { data: taskNotifTasks } = useSWR<any>(
    dashboardAllowed && companyId ? `/companies/${companyId}/tasks?sort=updated_desc&skip=0&limit=50` : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const newAssignedTasksCount = useMemo(() => {
    const uid = currentUser?.id;
    const results = taskNotifTasks?.results;
    if (!uid || !Array.isArray(results)) return 0;

    let c = 0;
    for (const t of results) {
      const assigned =
        t?.assignee_id === uid ||
        (Array.isArray(t?.assignees) && t.assignees.some((a: any) => a?.id === uid));
      if (!assigned) continue;

      const ts = t?.updated_at ? Date.parse(t.updated_at) : NaN;
      if (!Number.isFinite(ts)) continue;
      if (tasksLastSeenAt && ts <= tasksLastSeenAt) continue;
      c += 1;
    }
    return c;
  }, [currentUser?.id, taskNotifTasks, tasksLastSeenAt]);

  const adminTasksLastSeenKey = useMemo(() => {
    const uid = currentUser?.id;
    if (!companyId || !uid) return null;
    return `tasks:admin:lastSeen:${companyId}:${uid}`;
  }, [companyId, currentUser?.id]);

  const [adminTasksLastSeenAt, setAdminTasksLastSeenAt] = useState<number>(0);

  useEffect(() => {
    if (!adminTasksLastSeenKey) return;
    try {
      const raw = window.localStorage.getItem(adminTasksLastSeenKey);
      const n = raw ? Number(raw) : 0;
      setAdminTasksLastSeenAt(Number.isFinite(n) ? n : 0);
    } catch {
      setAdminTasksLastSeenAt(0);
    }
  }, [adminTasksLastSeenKey]);

  const adminTaskActivityCount = useMemo(() => {
    const uid = currentUser?.id;
    const results = taskNotifTasks?.results;
    if (!uid || !Array.isArray(results)) return 0;

    let c = 0;
    for (const t of results) {
      if (t?.created_by_id !== uid) continue;

      const assignedToSomeoneElse =
        (typeof t?.assignee_id === 'number' && t.assignee_id !== uid) ||
        (Array.isArray(t?.assignees) && t.assignees.some((a: any) => a?.id && a.id !== uid));
      if (!assignedToSomeoneElse) continue;

      const ts = t?.updated_at ? Date.parse(t.updated_at) : NaN;
      if (!Number.isFinite(ts)) continue;
      if (adminTasksLastSeenAt && ts <= adminTasksLastSeenAt) continue;
      c += 1;
    }
    return c;
  }, [adminTasksLastSeenAt, currentUser?.id, taskNotifTasks]);

  const tasksNotificationCount = useMemo(() => {
    if (isAdminViewer) return newAssignedTasksCount + adminTaskActivityCount;
    return newAssignedTasksCount;
  }, [adminTaskActivityCount, isAdminViewer, newAssignedTasksCount]);

  const markTasksSeenAndOpen = () => {
    if (!companyId) return;
    const now = Date.now();
    if (tasksLastSeenKey) {
      try {
        window.localStorage.setItem(tasksLastSeenKey, String(now));
      } catch {
        // ignore
      }
    }
    if (adminTasksLastSeenKey) {
      try {
        window.localStorage.setItem(adminTasksLastSeenKey, String(now));
      } catch {
        // ignore
      }
    }
    setTasksLastSeenAt(now);
    setAdminTasksLastSeenAt(now);
    window.location.href = `/companies/${companyId}/tasks`;
  };

  const headerLogoUrl = useMemo(() => {
    if (!companyId) return null;
    if (currentCompany?.logo_url) return currentCompany.logo_url;
    return getCompanyLogo(companyId) || null;
  }, [companyId, currentCompany?.logo_url]);

  const { data: invoices } = useSWR(
    dashboardAllowed && showSales && companyId ? `/sales/companies/${companyId}/invoices` : null,
    fetcher
  );
  const { data: bills } = useSWR(
    dashboardAllowed && showPurchases && companyId ? `/companies/${companyId}/bills` : null,
    fetcher
  );
  const { data: items } = useSWR(
    dashboardAllowed && showInventory && companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );
  const { data: customers } = useSWR(
    dashboardAllowed && showSales && companyId ? `/sales/companies/${companyId}/customers` : null,
    fetcher
  );
  const { data: suppliers } = useSWR(
    dashboardAllowed && showPurchases && companyId ? `/purchases/companies/${companyId}/suppliers` : null,
    fetcher
  );
  const { data: realReceivables } = useSWR(
    dashboardAllowed && showAccounting && companyId ? `/companies/${companyId}/reports/receivables` : null,
    fetcher
  );
  const { data: realPayables } = useSWR(
    dashboardAllowed && showAccounting && companyId ? `/companies/${companyId}/reports/payables` : null,
    fetcher
  );

  const { data: openSalesOrders, mutate: mutateOpenSalesOrders } = useSWR<
    SalesOrderSummary[]
  >(
    dashboardAllowed && showSales && companyId
      ? `/orders/companies/${companyId}/orders/sales?status=OPEN`
      : null,
    fetcher
  );
  const { data: openPurchaseOrders, mutate: mutateOpenPurchaseOrders } = useSWR<
    PurchaseOrderSummary[]
  >(
    dashboardAllowed && showPurchases && companyId
      ? `/orders/companies/${companyId}/orders/purchase?status=OPEN`
      : null,
    fetcher
  );

  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [activeRange, setActiveRange] = useState<
    'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'threeMonths' | null
  >('today');
  const [recentOpen, setRecentOpen] = useState(false);

  const { data: notifications, mutate: mutateNotifications } = useSWR<NotificationRecord[]>(
    dashboardAllowed && companyId
      ? `/notifications/companies/${companyId}/notifications?unread_only=true`
      : null,
    fetcher,
    { refreshInterval: 30000 }
  );

  const { data: companyDetails } = useSWR(
    dashboardAllowed && companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const tbFromDate = (companyDetails as any)?.fiscal_year_start || '2000-01-01';
  const tbToDate = new Date().toISOString().slice(0, 10);

  const { data: tbData } = useSWR<{ rows: TrialBalanceRow[] }>(
    dashboardAllowed && showAccounting && companyId
      ? `/companies/${companyId}/reports/trial-balance?from_date=${tbFromDate}&to_date=${tbToDate}`
      : null,
    fetcher
  );

  const { data: plData } = useSWR<any>(
    dashboardAllowed && showReports && companyId && fromDate && toDate
      ? `/companies/${companyId}/reports/profit-and-loss-hierarchical?from_date=${fromDate}&to_date=${toDate}`
      : null,
    fetcher
  );

  const plExpensesAmount = useMemo(() => {
    if (!plData?.expenses) return 0;
    return plData.expenses.reduce((sum: number, r: any) => {
      if ((r.row_type === 'GROUP' || r.row_type === 'SUB_GROUP') && r.level === 0) {
        if (r.group_name !== 'Purchase Accounts' && r.group_name !== 'Opening Stock') {
          return sum + (Number(r.amount) || 0);
        }
      }
      return sum;
    }, 0);
  }, [plData]);

  const plNetIncomeAmount = useMemo(() => {
    return plData?.totals?.net_profit_or_loss || 0;
  }, [plData]);

  const balanceData = useMemo(() => {
    if (!tbData?.rows || !Array.isArray(tbData.rows)) return { cash: 0, bank: 0 };

    let cash = 0;
    const cashRows = tbData.rows.filter(
      (r) =>
        (r.row_type === 'GROUP' || r.row_type === 'SUB_GROUP') &&
        r.ledger_name?.toLowerCase() === 'cash-in-hand'
    );
    cashRows.forEach((r) => {
      cash += (r.closing_debit || 0) - (r.closing_credit || 0);
    });

    let bank = 0;
    const bankRows = tbData.rows.filter(
      (r) =>
        (r.row_type === 'GROUP' || r.row_type === 'SUB_GROUP') &&
        r.ledger_name?.toLowerCase() === 'bank accounts'
    );
    bankRows.forEach((r) => {
      bank += (r.closing_debit || 0) - (r.closing_credit || 0);
    });

    return { cash, bank };
  }, [tbData]);

  const unreadCount = notifications?.length || 0;

  const handleNotificationClick = async (n: NotificationRecord) => {
    if (!companyId) return;

    let target: string | null = null;
    if (n.type === 'SALES_ORDER_CREATED') {
      target = `/companies/${companyId}/sales/orders/${n.order_id}`;
    } else if (n.type === 'PURCHASE_ORDER_CREATED') {
      target = `/companies/${companyId}/purchases/orders/${n.order_id}`;
    }

    try {
      await markNotificationRead(companyId, n.id);
      await mutateNotifications();
    } catch {
      // ignore errors here; next poll will refresh
    }

    if (target) {
      window.location.href = target;
    }
  };

  const applyRange = (range: 'today' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth' | 'threeMonths') => {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    setActiveRange(range);

    if (reportMode === 'BS') {
      const todayBS = safeADToBS(isoToday);
      
      if (range === 'today') {
        setFromDate(isoToday);
        setToDate(isoToday);
      } else if (range === 'thisWeek') {
        const { from, to } = getBSWeekRange(todayBS);
        setFromDate(safeBSToAD(from));
        setToDate(safeBSToAD(to));
      } else if (range === 'lastWeek') {
        const { from: thisFrom } = getBSWeekRange(todayBS);
        const parts = thisFrom.split('-').map(Number);
        const lastWeekAnyDay = new Date(safeBSToAD(thisFrom));
        lastWeekAnyDay.setDate(lastWeekAnyDay.getDate() - 7);
        const { from, to } = getBSWeekRange(safeADToBS(lastWeekAnyDay.toISOString().slice(0, 10)));
        setFromDate(safeBSToAD(from));
        setToDate(safeBSToAD(to));
      } else if (range === 'thisMonth') {
        const { from, to } = getBSMonthRange(todayBS);
        setFromDate(safeBSToAD(from));
        setToDate(safeBSToAD(to));
      } else if (range === 'lastMonth') {
        const [y, m] = todayBS.split('-').map(Number);
        const lastMonthY = m === 1 ? y - 1 : y;
        const lastMonthM = m === 1 ? 12 : m - 1;
        const { from, to } = getBSMonthRange(`${lastMonthY}-${String(lastMonthM).padStart(2, '0')}-01`);
        setFromDate(safeBSToAD(from));
        setToDate(safeBSToAD(to));
      } else if (range === 'threeMonths') {
        const [y, m] = todayBS.split('-').map(Number);
        let startY = y, startM = m - 2;
        if (startM < 1) { startM += 12; startY -= 1; }
        const { from } = getBSMonthRange(`${startY}-${String(startM).padStart(2, '0')}-01`);
        setFromDate(safeBSToAD(from));
        setToDate(isoToday);
      }
      return;
    }

    const start = new Date(today);
    const end = new Date(today);

    const startOfWeek = (d: Date) => {
      const copy = new Date(d);
      const day = copy.getDay(); // 0=Sun
      const diff = (day + 6) % 7; // make Monday start
      copy.setDate(copy.getDate() - diff);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const startOfMonth = (d: Date) => {
      const copy = new Date(d.getFullYear(), d.getMonth(), 1);
      copy.setHours(0, 0, 0, 0);
      return copy;
    };

    const endOfMonth = (d: Date) => {
      const copy = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      copy.setHours(23, 59, 59, 999);
      return copy;
    };

    if (range === 'today') {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    } else if (range === 'thisWeek') {
      const s = startOfWeek(today);
      start.setTime(s.getTime());
      end.setTime(today.getTime());
    } else if (range === 'lastWeek') {
      const sThis = startOfWeek(today);
      const sLast = new Date(sThis);
      sLast.setDate(sLast.getDate() - 7);
      const eLast = new Date(sLast);
      eLast.setDate(eLast.getDate() + 6);
      start.setTime(sLast.getTime());
      end.setTime(eLast.getTime());
    } else if (range === 'thisMonth') {
      const s = startOfMonth(today);
      const e = endOfMonth(today);
      start.setTime(s.getTime());
      end.setTime(e.getTime());
    } else if (range === 'lastMonth') {
      const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 15);
      const s = startOfMonth(lastMonthDate);
      const e = endOfMonth(lastMonthDate);
      start.setTime(s.getTime());
      end.setTime(e.getTime());
    } else if (range === 'threeMonths') {
      const threeMonthsAgo = new Date(today);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
      threeMonthsAgo.setHours(0, 0, 0, 0);
      start.setTime(threeMonthsAgo.getTime());
      end.setHours(23, 59, 59, 999);
    }

    const fmt = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };

    setFromDate(fmt(start));
    setToDate(fmt(end));
  };

  useEffect(() => {
    if (!fromDate && !toDate) {
      applyRange('today');
    }
  }, [fromDate, toDate]);

  const invoiceTotal = (inv: any) => {
    if (!inv?.lines || !Array.isArray(inv.lines)) return 0;
    return inv.lines.reduce((sum: number, l: any) => {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      return sum + base + tax;
    }, 0);
  };

  const billTotal = (bill: any) => {
    if (!bill?.lines || !Array.isArray(bill.lines)) return 0;
    return bill.lines.reduce((sum: number, l: any) => {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      return sum + base + tax;
    }, 0);
  };

  const filteredInvoices = useMemo(() => {
    if (!invoices) return [] as any[];
    return (invoices as any[]).filter((inv) => {
      if (fromDate && inv.date < fromDate) return false;
      if (toDate && inv.date > toDate) return false;
      return true;
    });
  }, [invoices, fromDate, toDate]);

  const filteredBills = useMemo(() => {
    if (!bills) return [] as any[];
    return (bills as any[]).filter((bill) => {
      if (fromDate && bill.date < fromDate) return false;
      if (toDate && bill.date > toDate) return false;
      return true;
    });
  }, [bills, fromDate, toDate]);

  const totalSales = useMemo(
    () => filteredInvoices.reduce((sum, inv) => sum + invoiceTotal(inv), 0),
    [filteredInvoices]
  );

  const totalPurchases = useMemo(
    () => filteredBills.reduce((sum, bill) => sum + billTotal(bill), 0),
    [filteredBills]
  );

  const grossProfit = totalSales - totalPurchases;

  const actualReceivablesTotal = useMemo(() => {
    if (!realReceivables || !Array.isArray(realReceivables)) return 0;
    return realReceivables.reduce((sum, r: any) => sum + (Number(r.outstanding_amount) || 0), 0);
  }, [realReceivables]);

  const actualPayablesTotal = useMemo(() => {
    if (!realPayables || !Array.isArray(realPayables)) return 0;
    return realPayables.reduce((sum, r: any) => sum + (Number(r.outstanding_amount) || 0), 0);
  }, [realPayables]);

  const receivablesTotal = actualReceivablesTotal;
  const payablesTotal = actualPayablesTotal;
  const maxReceivablePayable = useMemo(() => {
    const max = Math.max(receivablesTotal, payablesTotal);
    return max || 1;
  }, [receivablesTotal, payablesTotal]);

  const salesByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const inv of filteredInvoices) {
      const d = inv.date as string;
      map[d] = (map[d] || 0) + invoiceTotal(inv);
    }
    return map;
  }, [filteredInvoices]);

  const purchasesByDate = useMemo(() => {
    const map: Record<string, number> = {};
    for (const bill of filteredBills) {
      const d = bill.date as string;
      map[d] = (map[d] || 0) + billTotal(bill);
    }
    return map;
  }, [filteredBills]);

  const timeline = useMemo(() => {
    const allDates = new Set<string>();
    Object.keys(salesByDate).forEach((d) => allDates.add(d));
    Object.keys(purchasesByDate).forEach((d) => allDates.add(d));
    return Array.from(allDates).sort();
  }, [salesByDate, purchasesByDate]);

  const maxDayTotal = useMemo(() => {
    let max = 0;
    for (const d of timeline) {
      const v = (salesByDate[d] || 0) + (purchasesByDate[d] || 0);
      if (v > max) max = v;
    }
    return max || 1;
  }, [timeline, salesByDate, purchasesByDate]);

  const salesByItem = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    if (!invoices) return [] as { name: string; total: number }[];
    for (const inv of invoices as any[]) {
      if (fromDate && inv.date < fromDate) continue;
      if (toDate && inv.date > toDate) continue;
      const lines = (inv.lines || []) as any[];
      for (const l of lines) {
        const itemId = String(l.item_id);
        const item = items?.find((it: any) => String(it.id) === itemId);
        const name = item?.name || `Item #${itemId}`;
        const qty = Number(l.quantity || 0);
        const rate = Number(l.rate || 0);
        const disc = Number(l.discount || 0);
        const taxRate = Number(l.tax_rate || 0);
        const base = qty * rate - disc;
        const tax = (base * taxRate) / 100;
        const lineTotal = base + tax;
        if (!map[itemId]) map[itemId] = { name, total: 0 };
        map[itemId].total += lineTotal;
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [invoices, items, fromDate, toDate]);

  const maxItemTotal = useMemo(() => {
    return salesByItem.reduce((max, r) => (r.total > max ? r.total : max), 0) || 1;
  }, [salesByItem]);

  const salesByCustomer = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    if (!invoices) return [] as { name: string; total: number }[];
    for (const inv of invoices as any[]) {
      if (fromDate && inv.date < fromDate) continue;
      if (toDate && inv.date > toDate) continue;
      const id = String(inv.customer_id ?? '');
      const customerName =
        customers?.find((c: any) => String(c.id) === id)?.name || (id ? `Customer #${id}` : 'Unknown');
      const invTotal = invoiceTotal(inv);
      if (!map[id]) map[id] = { name: customerName, total: 0 };
      map[id].total += invTotal;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [invoices, customers, fromDate, toDate]);

  const maxCustomerTotal = useMemo(() => {
    return salesByCustomer.reduce((max, r) => (r.total > max ? r.total : max), 0) || 1;
  }, [salesByCustomer]);

  const purchasesBySupplier = useMemo(() => {
    const map: Record<string, { name: string; total: number }> = {};
    if (!bills) return [] as { name: string; total: number }[];
    for (const bill of bills as any[]) {
      if (fromDate && bill.date < fromDate) continue;
      if (toDate && bill.date > toDate) continue;
      const id = String(bill.supplier_id ?? '');
      const supplierName =
        suppliers?.find((s: any) => String(s.id) === id)?.name || (id ? `Supplier #${id}` : 'Unknown');
      const billT = billTotal(bill);
      if (!map[id]) map[id] = { name: supplierName, total: 0 };
      map[id].total += billT;
    }
    return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [bills, suppliers, fromDate, toDate]);

  const maxSupplierTotal = useMemo(() => {
    return purchasesBySupplier.reduce((max, r) => (r.total > max ? r.total : max), 0) || 1;
  }, [purchasesBySupplier]);

  // Today and This Month sales (independent of the current UI filter range)
  const todaySales = useMemo(() => {
    if (!invoices) return 0;
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const todayStr = `${y}-${m}-${d}`;
    return (invoices as any[])
      .filter((inv) => inv.date === todayStr)
      .reduce((sum, inv) => sum + invoiceTotal(inv), 0);
  }, [invoices]);

  const salesVsMarginChartData = useMemo(
    () =>
      timeline.map((d) => {
        const sales = salesByDate[d] || 0;
        const purchases = purchasesByDate[d] || 0;
        const margin = sales - purchases;
        return {
          date: d,
          sales,
          margin,
        };
      }),
    [timeline, salesByDate, purchasesByDate]
  );

  const waterfallData = useMemo(() => {
    let currentTotal = 0;
    return timeline.map((d) => {
      const sales = salesByDate[d] || 0;
      const purchases = purchasesByDate[d] || 0;
      const net = sales - purchases;

      const start = currentTotal;
      const end = currentTotal + net;

      currentTotal = end;

      return {
        date: d,
        range: [start, end],
        net,
        start,
        end,
        sales,
        purchases,
        fill: net >= 0 ? '#10b981' : '#ef4444'
      };
    });
  }, [timeline, salesByDate, purchasesByDate]);

  const formatDateLabel = (date: string) => {
    if (!date) return '';
    if (reportMode === 'BS') {
      return safeADToBS(date) || date;
    }
    const [y, m, d] = date.split('-').map((v) => Number(v));
    if (!y || !m || !d) return date;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatCurrencyCompact = (value: number) => {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `₹ ${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `₹ ${(value / 1_000).toFixed(1)}K`;
    return `₹ ${value.toFixed(0)}`;
  };

  const formatNumberCompact = (value: number) => {
    if (value === 0) return '0';
    const abs = Math.abs(value);
    if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
    if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
    return `${value.toFixed(2)}`;
  };

  const formatCurrencyFull = (value: number) => {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 2,
    }).format(value || 0);
  };

  const thisMonthSales = useMemo(() => {
    if (!invoices) return 0;
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);

    let startStr = "";
    let endStr = "";

    if (reportMode === 'BS') {
      const todayBS = safeADToBS(isoToday);
      const { from, to } = getBSMonthRange(todayBS);
      startStr = safeBSToAD(from);
      endStr = safeBSToAD(to);
    } else {
      const year = today.getFullYear();
      const month = today.getMonth() + 1;
      const startOfMonth = new Date(year, month - 1, 1);
      const endOfMonth = new Date(year, month, 0);

      const f = (d: Date) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        return `${y}-${m}-${day}`;
      };

      startStr = f(startOfMonth);
      endStr = f(endOfMonth);
    }

    return (invoices as any[])
      .filter((inv) => inv.date >= startStr && inv.date <= endStr)
      .reduce((sum, inv) => sum + invoiceTotal(inv), 0);
  }, [invoices, reportMode]);

  const recentInvoices = useMemo(() => {
    if (!filteredInvoices || !filteredInvoices.length) return [] as any[];
    return [...filteredInvoices]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0)))
      .slice(0, 5);
  }, [filteredInvoices]);

  const recentBills = useMemo(() => {
    if (!filteredBills || !filteredBills.length) return [] as any[];
    return [...filteredBills]
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.id || 0) - (a.id || 0)))
      .slice(0, 5);
  }, [filteredBills]);

  // Stable memoized arrays so RecentVouchersTable / TopPartiesTable
  // don't receive new object references on every parent re-render.
  const recentVoucherRows = useMemo(() => [
    ...recentInvoices.map((inv: any) => ({
      no: String(inv.id),
      date: inv.date,
      type: 'Invoice',
      party: inv.customer_name || 'Customer',
      amount: invoiceTotal(inv).toFixed(2),
    })),
    ...recentBills.map((bill: any) => ({
      no: String(bill.id),
      date: bill.date,
      type: 'Bill',
      party: bill.supplier_name || 'Supplier',
      amount: billTotal(bill).toFixed(2),
    })),
  ], [recentInvoices, recentBills]);

  const topPartiesRows = useMemo(() => [
    ...(showSales ? salesByCustomer.map((row) => ({
      name: row.name,
      type: 'Customer' as const,
      receivable: row.total.toFixed(2),
      payable: '—',
    })) : []),
    ...(showPurchases ? purchasesBySupplier.map((row) => ({
      name: row.name,
      type: 'Supplier' as const,
      receivable: '—',
      payable: row.total.toFixed(2),
    })) : []),
  ], [showSales, showPurchases, salesByCustomer, purchasesBySupplier]);

  const openInvoiceInNewTab = useCallback((id: number) => {
    if (!companyId) return;
    const url = `/companies/${companyId}/sales/invoices/${id}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [companyId]);

  const openBillInNewTab = useCallback((id: number) => {
    if (!companyId) return;
    const url = `/companies/${companyId}/purchases/bills/${id}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, [companyId]);

  const handleConvertSalesOrder = useCallback(async (order: SalesOrderSummary) => {
    if (!companyId) return;
    try {
      await convertSalesOrderToInvoice(companyId, order.id);
      await mutateOpenSalesOrders();
    } catch (err) {
      // ignore, basic dashboard context
    }
  }, [companyId, mutateOpenSalesOrders]);

  const handleConvertPurchaseOrder = useCallback(async (order: PurchaseOrderSummary) => {
    if (!companyId) return;
    try {
      await convertPurchaseOrderToBill(companyId, order.id);
      await mutateOpenPurchaseOrders();
    } catch (err) {
      // ignore, basic dashboard context
    }
  }, [companyId, mutateOpenPurchaseOrders]);

  const exportTimelineCsv = () => {
    if (!timeline.length) return;
    const headers = ['Date', 'Sales', 'Purchases', 'Total'];
    const rows = timeline.map((d) => {
      const s = salesByDate[d] || 0;
      const p = purchasesByDate[d] || 0;
      const t = s + p;
      return [d, s.toFixed(2), p.toFixed(2), t.toFixed(2)];
    });
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? '');
            if (s.includes(',') || s.includes('"')) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-sales-purchases-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportTopItemsCsv = () => {
    if (!salesByItem.length) return;
    const headers = ['Item', 'Total Sales'];
    const rows = salesByItem.map((r) => [r.name, r.total.toFixed(2)]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? '');
            if (s.includes(',') || s.includes('"')) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-top-items-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportCustomersCsv = () => {
    if (!salesByCustomer.length) return;
    const headers = ['Customer', 'Total Sales'];
    const rows = salesByCustomer.map((r) => [r.name, r.total.toFixed(2)]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? '');
            if (s.includes(',') || s.includes('"')) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-customers-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportSuppliersCsv = () => {
    if (!purchasesBySupplier.length) return;
    const headers = ['Supplier', 'Total Purchases'];
    const rows = purchasesBySupplier.map((r) => [r.name, r.total.toFixed(2)]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? '');
            if (s.includes(',') || s.includes('"')) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(',')
      )
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashboard-suppliers-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!dashboardAllowed) {
    return (
      <div className="p-6">
        <div className="max-w-2xl rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="text-sm font-semibold">Access required</div>
          <div className="mt-1 text-sm">
            Your admin has not given you access to the Dashboard. Please contact your admin to
            enable Dashboard permission.
          </div>
        </div>
      </div>
    );
  }

  const isLoading = !companyId;

  return (
    <div className="space-y-6">
      {/* Top header: title, company, filters, notifications */}
      <div className="relative z-[70] overflow-visible flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div>
            {currentCompany ? (
              <div className="flex items-center gap-3">
                {headerLogoUrl && (
                  <img
                    src={headerLogoUrl}
                    alt={currentCompany.name}
                    className="h-11 w-11 rounded-full border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 object-cover"
                  />
                )}
                <div className="flex flex-col">
                  <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-slate-900 leading-tight truncate max-w-xs sm:max-w-sm md:max-w-md">
                    {currentCompany.name}
                  </span>
                  {currentCompany.address && (
                    <span className="mt-0.5 block text-xs text-muted-light dark:text-slate-900 truncate max-w-xs sm:max-w-sm md:max-w-md">
                      {currentCompany.address}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <h1 className="mb-1 text-2xl font-semibold text-slate-900 dark:text-brand-400">
                Dashboard
              </h1>
            )}
          </div>
        </div>

        {isMenuAllowed('dashboard.date_filters') && (
          <div className="flex flex-col items-end gap-2 text-sm">
            <div className="flex flex-wrap justify-end gap-1 text-[11px]">
              <button
                type="button"
                className={
                  activeRange === 'today'
                    ? 'rounded-full border border-brand-500 bg-brand-500/90 px-2 py-1 shadow-sm text-white hover:bg-brand-600 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400'
                    : 'rounded-full border border-border-light bg-white px-2 py-1 text-muted-light hover:bg-slate-50 dark:border-border-dark dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }
                onClick={() => applyRange('today')}
              >
                Today
              </button>
              <button
                type="button"
                className={
                  activeRange === 'thisWeek'
                    ? 'rounded-full border border-brand-500 bg-brand-500/90 px-2 py-1 shadow-sm text-white hover:bg-brand-600 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400'
                    : 'rounded-full border border-border-light bg-white px-2 py-1 text-muted-light hover:bg-slate-50 dark:border-border-dark dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }
                onClick={() => applyRange('thisWeek')}
              >
                This Week
              </button>
              <button
                type="button"
                className={
                  activeRange === 'lastWeek'
                    ? 'rounded-full border border-brand-500 bg-brand-500/90 px-2 py-1 shadow-sm text-white hover:bg-brand-600 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400'
                    : 'rounded-full border border-border-light bg-white px-2 py-1 text-muted-light hover:bg-slate-50 dark:border-border-dark dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }
                onClick={() => applyRange('lastWeek')}
              >
                Last Week
              </button>
              <button
                type="button"
                className={
                  activeRange === 'thisMonth'
                    ? 'rounded-full border border-brand-500 bg-brand-500/90 px-2 py-1 shadow-sm text-white hover:bg-brand-600 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400'
                    : 'rounded-full border border-border-light bg-white px-2 py-1 text-muted-light hover:bg-slate-50 dark:border-border-dark dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }
                onClick={() => applyRange('thisMonth')}
              >
                This Month
              </button>
              <button
                type="button"
                className={
                  activeRange === 'lastMonth'
                    ? 'rounded-full border border-brand-500 bg-brand-500/90 px-2 py-1 shadow-sm text-white hover:bg-brand-600 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400'
                    : 'rounded-full border border-border-light bg-white px-2 py-1 text-muted-light hover:bg-slate-50 dark:border-border-dark dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }
                onClick={() => applyRange('lastMonth')}
              >
                Last Month
              </button>
              <button
                type="button"
                className={
                  activeRange === 'threeMonths'
                    ? 'rounded-full border border-brand-500 bg-brand-500/90 px-2 py-1 shadow-sm text-white hover:bg-brand-600 dark:border-brand-400 dark:bg-brand-500 dark:hover:bg-brand-400'
                    : 'rounded-full border border-border-light bg-white px-2 py-1 text-muted-light hover:bg-slate-50 dark:border-border-dark dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800'
                }
                onClick={() => applyRange('threeMonths')}
              >
                Three Months
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-3">
          {companyId && (
            <div className="relative flex items-center gap-2">
              {isMenuAllowed('TASKS') && (
                <button
                  type="button"
                  className="relative rounded border border-border-light dark:border-border-dark bg-surface-light px-2 py-1 text-xs text-muted-light hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={markTasksSeenAndOpen}
                  aria-label="Tasks"
                  title="Tasks"
                >
                  <span role="img" aria-label="tasks">
                    🔔
                  </span>
                  {tasksNotificationCount > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-amber-500 px-1 text-[9px] text-white">
                      {tasksNotificationCount}
                    </span>
                  )}
                </button>
              )}
              {isMenuAllowed('header.notifications') && (
                <button
                  type="button"
                  className="relative rounded border border-border-light dark:border-border-dark bg-surface-light px-2 py-1 text-xs text-muted-light hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
                  onClick={() => setNotificationsOpen((o) => !o)}
                >
                  <span role="img" aria-label="notifications">
                    🔔
                  </span>
                  {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 rounded-full bg-critical-500 px-1 text-[9px] text-white">
                      {unreadCount}
                    </span>
                  )}
                </button>
              )}

              {isMenuAllowed('dashboard.date_filters') && (
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 px-1">Display</span>
                  <select
                    className="rounded border border-border-light dark:border-border-dark bg-surface-light px-2 py-1 text-[11px] outline-none dark:border-border-dark dark:bg-slate-900 shadow-inner h-8 font-semibold text-brand-600 dark:text-brand-400"
                    value={reportMode}
                    onChange={(e) => setReportMode(e.target.value as CalendarReportDisplayMode)}
                  >
                    <option value="AD">AD</option>
                    <option value="BS">BS</option>
                  </select>
                </div>
              )}

              {isMenuAllowed('dashboard.date_filters') && (
                <>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 px-1">From</span>
                    <Input
                      type="date"
                      calendarMode={reportMode}
                      className="rounded border border-border-light dark:border-border-dark bg-surface-light px-2 py-1 text-[11px] outline-none dark:border-border-dark dark:bg-slate-900 shadow-inner h-8"
                      value={fromDate}
                      onChange={(e) => setFromDate(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400 px-1">To</span>
                    <Input
                      type="date"
                      calendarMode={reportMode}
                      alignRight={true}
                      className="rounded border border-border-light dark:border-border-dark bg-surface-light px-2 py-1 text-[11px] outline-none dark:border-border-dark dark:bg-slate-900 shadow-inner h-8"
                      value={toDate}
                      onChange={(e) => setToDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {notificationsOpen && companyId && (
            <div className="absolute right-0 top-12 z-20 max-h-80 w-80 overflow-y-auto rounded border border-border-light dark:border-border-dark bg-surface-light dark:bg-surface-dark text-xs shadow-lg">
              <div className="flex items-center justify-between border-b border-border-light dark:border-border-dark px-3 py-2 font-medium">
                <span>Notifications</span>
                <button
                  type="button"
                  className="text-[10px] text-slate-500 hover:text-slate-700"
                  onClick={() => setNotificationsOpen(false)}
                >
                  Close
                </button>
              </div>
              {(!notifications || notifications.length === 0) && (
                <div className="px-3 py-3 text-muted-light dark:text-muted-dark">No new notifications.</div>
              )}
              {notifications && notifications.length > 0 && (
                <ul className="divide-y divide-slate-100">
                  {notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left hover:bg-slate-50"
                        onClick={() => handleNotificationClick(n)}
                      >
                        <div className="mb-1 flex justify-between">
                          <span className="font-medium text-slate-700 dark:text-slate-100">
                            {n.type === 'SALES_ORDER_CREATED'
                              ? 'Sales Order'
                              : n.type === 'PURCHASE_ORDER_CREATED'
                                ? 'Purchase Order'
                                : n.type}
                          </span>
                          <span className="text-[10px] text-muted-light dark:text-muted-dark">#{n.order_id}</span>
                        </div>
                        <div className="text-[11px] text-muted-light dark:text-muted-dark">Click to open order.</div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
      {/* Info banner when no company is selected */}
      {!companyId && (
        <div className="rounded-lg border border-dashed border-border-light dark:border-border-dark bg-surface-light/80 dark:bg-surface-dark/80 px-4 py-3 text-sm text-muted-light dark:text-muted-dark">
          Please open a company first to view dashboard analytics.
        </div>
      )}

      {/* Summary widgets */}
      {companyId && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {isLoading ? (
              <>
                <SummaryWidgetSkeleton />
                <SummaryWidgetSkeleton />
                <SummaryWidgetSkeleton />
                <SummaryWidgetSkeleton />
              </>
            ) : (
              <>
                {isMenuAllowed('dashboard.total_sales') && (
                  <SummaryWidget
                    label="Total Sales"
                    value={totalSales.toFixed(2)}
                    subLabel="Invoices in period"
                    trendLabel="Sales performance"
                    trendDirection="up"
                  />
                )}
                {isMenuAllowed('dashboard.total_purchase') && (
                  <SummaryWidget
                    label="Total Purchase"
                    value={totalPurchases.toFixed(2)}
                    subLabel={`Bills: ${filteredBills.length}`}
                    trendLabel="Procurement volume"
                    trendDirection="up"
                  />
                )}
                {isMenuAllowed('dashboard.expenses') && (
                  <SummaryWidget
                    label="Expenses"
                    value={plExpensesAmount.toFixed(2)}
                    subLabel="Operating expenses"
                    trendLabel="From P&L"
                    trendDirection="flat"
                  />
                )}
                {isMenuAllowed('dashboard.net_income') && (
                  <SummaryWidget
                    label="Net-Income"
                    value={plNetIncomeAmount.toFixed(2)}
                    subLabel="Sales - Cost of Sales - Expenses"
                    trendLabel={plNetIncomeAmount >= 0 ? "Profit" : "Loss"}
                    trendDirection={plNetIncomeAmount >= 0 ? "up" : "down"}
                  />
                )}
              </>
            )}
          </section>

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-3">
            {isLoading ? (
              <>
                <SummaryWidgetSkeleton />
                <SummaryWidgetSkeleton />
                <SummaryWidgetSkeleton />
              </>
            ) : (
              <>
                {isMenuAllowed('dashboard.receivables') && (
                  <SummaryWidget
                    label="Receivables"
                    value={receivablesTotal.toFixed(2)}
                    subLabel="Outstanding from customers"
                    trendLabel="View Detailed Report"
                    trendDirection="up"
                    href={`/companies/${companyId}/reports/receivable-payable?type=receivable`}
                  />
                )}
                {isMenuAllowed('dashboard.payables') && (
                  <SummaryWidget
                    label="Payables"
                    value={payablesTotal.toFixed(2)}
                    subLabel="Outstanding to suppliers"
                    trendLabel="View Detailed Report"
                    trendDirection={payablesTotal > receivablesTotal ? 'down' : 'flat'}
                    href={`/companies/${companyId}/reports/receivable-payable?type=payable`}
                  />
                )}
                {isMenuAllowed('dashboard.balances') && (
                  <SummaryWidget
                    label="Balances"
                    value={
                      <div className="flex items-baseline gap-2 text-lg leading-none">
                        <span title="Cash Balance">
                          {formatNumberCompact(balanceData.cash)}
                        </span>
                        <span className="text-xs text-muted-light font-normal self-center">
                          Cash
                        </span>
                        <span className="text-slate-300">|</span>
                        <span title="Bank Balance">
                          {formatNumberCompact(balanceData.bank)}
                        </span>
                        <span className="text-xs text-muted-light font-normal self-center">
                          Bank
                        </span>
                      </div>
                    }
                    subLabel="Cash & Bank Accounts"
                    trendLabel="Ledger Balance"
                    trendDirection="flat"
                  />
                )}
              </>
            )}
          </section>

          {/* Sales vs Gross Margin quick visual */}
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
            {isMenuAllowed('dashboard.sales_vs_margin') && (
              <ChartCard
                title="Sales vs Gross Margin"
                subtitle="By transaction date"
                chart={
                  salesVsMarginChartData.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={salesVsMarginChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={formatDateLabel}
                          dy={8}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={formatNumberCompact}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                          formatter={(value: any, name: any) => {
                            const numeric = Number(value || 0);
                            const label = name === 'sales' || name === 'Sales' ? 'Sales' : 'Gross Margin';
                            return [numeric.toLocaleString(), label];
                          }}
                          labelFormatter={(label: any) => `Date: ${formatDateLabel(String(label))}`}
                        />
                        <Legend wrapperStyle={{ fontSize: 12, paddingTop: '12px' }} iconType="circle" />
                        <Bar dataKey="sales" name="Sales" fill="#10b981" radius={[2, 2, 0, 0]} maxBarSize={40} />
                        <Bar dataKey="margin" name="Gross Margin" fill="#f59e0b" radius={[2, 2, 0, 0]} maxBarSize={40} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null
                }
              >
                {timeline.length === 0 ? (
                  <div className="mt-3 text-xs text-muted-light dark:text-muted-dark">No data in selected range.</div>
                ) : (
                  <div className="mt-4 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                    {timeline.map((d) => {
                      const s = salesByDate[d] || 0;
                      const p = purchasesByDate[d] || 0;
                      const margin = s - p;
                      const marginColor = margin >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
                      return (
                        <div key={d} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{formatDateLabel(d)}</span>
                          <div className="flex items-center gap-4 text-xs">
                            <span>Sales: <span className="font-semibold">{formatNumberCompact(s)}</span></span>
                            <span>
                              Margin: <span className={`font-semibold ${marginColor}`}>{margin >= 0 ? '+' : ''}{formatNumberCompact(margin)}</span>
                            </span>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex justify-end pt-2">
                      {isMenuAllowed('dashboard.export_actions') && (
                        <button
                          type="button"
                          className="text-xs text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 underline underline-offset-2 disabled:opacity-50"
                          onClick={exportTimelineCsv}
                          disabled={!timeline.length}
                        >
                          Export CSV
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </ChartCard>
            )}

            {isMenuAllowed('dashboard.income_vs_expenses') && (
              <ChartCard
                title="Income vs Expenses"
                subtitle="Daily net profit waterfall"
                chart={
                  waterfallData.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart data={waterfallData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={formatDateLabel}
                          dy={8}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: '#64748b' }}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={formatNumberCompact}
                        />
                        <Tooltip
                          contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                          cursor={{ fill: 'rgba(241, 245, 249, 0.5)' }}
                          formatter={(value: any, name: any, payload: any) => {
                            const net = payload?.payload?.net || 0;
                            return [net.toLocaleString(), 'Net Change'];
                          }}
                          labelFormatter={(label: any, payload: any) => {
                            const p = Array.isArray(payload) && payload[0]?.payload;
                            const sales = p?.sales || 0;
                            const purchases = p?.purchases || 0;
                            return `Date: ${formatDateLabel(String(label))} (In: ${formatNumberCompact(sales)} | Out: ${formatNumberCompact(purchases)})`;
                          }}
                        />
                        <Bar dataKey="range" radius={[2, 2, 2, 2]} maxBarSize={40}>
                          {waterfallData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : null
                }
              >
                {timeline.length === 0 ? (
                  <div className="mt-3 text-xs text-muted-light dark:text-muted-dark">No data in selected range.</div>
                ) : (
                  <div className="mt-4 space-y-3 text-sm text-slate-700 dark:text-slate-300">
                    <div className="flex items-center justify-between rounded bg-slate-50 px-3 py-3 dark:bg-slate-800/50">
                      <span className="font-medium text-slate-800 dark:text-slate-200">Cumulative Net Profit</span>
                      <div className="flex items-center gap-4 text-xs">
                        <span>Total: <span className={`font-semibold ${waterfallData[waterfallData.length - 1]?.end >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-500'}`}>{Number(waterfallData[waterfallData.length - 1]?.end || 0).toLocaleString()}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-muted-light dark:text-muted-dark px-1">
                      <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-emerald-500"></div> Net Positive Day</div>
                      <div className="flex items-center gap-1.5"><div className="h-2.5 w-2.5 rounded-sm bg-red-500"></div> Net Negative Day</div>
                    </div>
                  </div>
                )}
              </ChartCard>
            )}
          </section>

          {/* Recent activity & top customers/suppliers */}
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
            {isMenuAllowed('dashboard.recent_activity') && (
              <RecentVouchersTable
                calendarMode={reportMode}
                rows={recentVoucherRows}
              />
            )}

            {isMenuAllowed('dashboard.top_parties') && (
              <TopPartiesTable
                rows={topPartiesRows}
              />
            )}
          </section>

          {/* Sales Mix + Expenses Mix */}
          <section className="grid gap-4 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-2">
            {showSales && (
              <SalesMixReport
                invoices={invoices ?? []}
                items={items ?? []}
                fromDate={fromDate}
                toDate={toDate}
              />
            )}
            {showReports && (
              <ExpensesMixReport
                expenseRows={(plData as any)?.expenses ?? []}
                fromDate={fromDate}
                toDate={toDate}
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
