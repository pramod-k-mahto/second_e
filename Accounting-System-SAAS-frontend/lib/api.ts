import axios from 'axios';
import { ItemRead, ItemUnitRead, ItemUnitCreate } from '@/types/item';
import type {
  BOMCreate,
  BOMRead,
  BOMUpdate,
  ProductionIssueRead,
  ProductionOrderCreate,
  ProductionOrderRead,
  StockSummaryRow as ProductionStockSummaryRow,
} from "@/types/production";
import { safeADToBS, safeBSToAD } from "./bsad";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://127.0.0.1:8000';

export const api = axios.create({
  baseURL: apiBase,
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
  }

  if (process.env.NODE_ENV !== 'production') {
    const url = String(config.url || '');
    if (
      url.includes('/customer-statement') &&
      !url.includes('/reports/customer-statement')
    ) {
      // eslint-disable-next-line no-console
      console.error(
        '[PartyStatement] Old API path used. Expected /reports/customer-statement but got:',
        url,
      );
    }
    if (
      url.includes('/supplier-statement') &&
      !url.includes('/reports/supplier-statement')
    ) {
      // eslint-disable-next-line no-console
      console.error(
        '[PartyStatement] Old API path used. Expected /reports/supplier-statement but got:',
        url,
      );
    }
    if (
      url.includes('/customer-ledger-mapping') &&
      !url.includes('/reports/customer-ledger-mapping')
    ) {
      // eslint-disable-next-line no-console
      console.error(
        '[PartyStatement] Old API path used. Expected /reports/customer-ledger-mapping but got:',
        url,
      );
    }
    if (
      url.includes('/supplier-ledger-mapping') &&
      !url.includes('/reports/supplier-ledger-mapping')
    ) {
      // eslint-disable-next-line no-console
      console.error(
        '[PartyStatement] Old API path used. Expected /reports/supplier-ledger-mapping but got:',
        url,
      );
    }
  }
  return config;
});

// ─── Token refresh queue ─────────────────────────────────────────────────────
let isRefreshing = false;
let refreshSubscribers: Array<(token: string | null) => void> = [];
let logoutScheduled = false;

function subscribeTokenRefresh(cb: (token: string | null) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(token: string | null) {
  refreshSubscribers.forEach((cb) => cb(token));
  refreshSubscribers = [];
}

// ─── JWT expiry helpers ───────────────────────────────────────────────────────
export function parseJwtExpiry(token: string): number | null {
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    const payload = JSON.parse(jsonPayload);
    return typeof payload.exp === 'number' ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

let expiryTimerId: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a proactive token refresh ~2 minutes before expiry.
 * Call this after every successful login or successful refresh.
 */
export function scheduleTokenRefresh(token: string) {
  if (typeof window === 'undefined') return;
  if (expiryTimerId) clearTimeout(expiryTimerId);

  const expiry = parseJwtExpiry(token);
  if (!expiry) return;

  const now = Date.now();
  const msUntilExpiry = expiry - now;

  if (msUntilExpiry <= 0) {
    // Already expired – clear and redirect
    localStorage.removeItem('access_token');
    if (!window.location.pathname.startsWith('/auth')) {
      window.location.href = '/auth/login';
    }
    return;
  }

  // Attempt refresh 2 minutes before expiry (min 0 ms)
  const refreshIn = Math.max(0, msUntilExpiry - 2 * 60 * 1000);

  expiryTimerId = setTimeout(async () => {
    try {
      const res = await fetch('/api/auth/refresh', { method: 'POST' });
      if (res.ok) {
        const data = await res.json() as { access_token?: string };
        if (data.access_token) {
          setToken(data.access_token);
          scheduleTokenRefresh(data.access_token); // reschedule for the new token
          return;
        }
      }
    } catch (err) {
      // Ignore network errors or proactive refresh failures.
      // If the token truly expires, the next API request will return 401
      // and the interceptor will handle the forceful logout securely.
      console.warn('[scheduleTokenRefresh] Proactive refresh failed:', err);
    }
  }, refreshIn);
}

// ─── Response interceptor with refresh-and-retry ─────────────────────────────
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as typeof error.config & { _retry?: boolean };

    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      typeof window !== 'undefined' &&
      !window.location.pathname.startsWith('/auth')
    ) {
      if (isRefreshing) {
        // Queue this request until the refresh resolves
        return new Promise((resolve, reject) => {
          subscribeTokenRefresh((newToken) => {
            if (newToken) {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${newToken}`;
              resolve(api(originalRequest));
            } else {
              reject(error);
            }
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshRes = await fetch('/api/auth/refresh', { method: 'POST' });
        if (refreshRes.ok) {
          const data = await refreshRes.json() as { access_token?: string };
          if (data.access_token) {
            setToken(data.access_token);
            scheduleTokenRefresh(data.access_token);
            isRefreshing = false;
            onTokenRefreshed(data.access_token);

            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
            return api(originalRequest);
          }
        }
      } catch {
        // network error during refresh
      } finally {
        isRefreshing = false;
      }

      // Refresh failed – sign out once
      onTokenRefreshed(null);
      localStorage.removeItem('access_token');
      if (!logoutScheduled) {
        logoutScheduled = true;
        window.location.href = '/auth/login';
      }
    }

    return Promise.reject(error);
  }
);

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return;
  if (token) {
    localStorage.setItem('access_token', token);
  } else {
    localStorage.removeItem('access_token');
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('access_token');
}

export type ItemLedgerDefaults = {
  sales_ledger_id: number | null;
  purchase_ledger_id: number | null;
  output_tax_ledger_id: number | null;
  input_tax_ledger_id: number | null;
  income_ledger_id?: number | null;
  expense_ledger_id?: number | null;
};

export async function getItemLedgerDefaults(companyId: number | string): Promise<ItemLedgerDefaults> {
  const res = await api.get(`/companies/${companyId}/item-ledger-defaults`);
  return res.data;
}

export async function saveItemLedgerDefaults(
  companyId: number | string,
  payload: Partial<ItemLedgerDefaults>
): Promise<ItemLedgerDefaults> {
  const res = await api.put(`/companies/${companyId}/item-ledger-defaults`, payload);
  return res.data;
}

export type CurrentCompany = {
  id: number;
  name: string;
  address?: string | null;
  enable_pos?: boolean;
  logo_url?: string | null;
  calendar_mode?: "AD" | "BS"; // New central setup field
  fiscal_year_start?: string | null; // Stored AD date
  fiscal_year_end?: string | null;   // Stored AD date
};

const CURRENT_COMPANY_KEY = 'current_company';
const COMPANY_LOGOS_KEY = 'company_logos';
const DEFAULT_LEDGERS_KEY = 'default_ledgers';

export function setCurrentCompany(company: CurrentCompany | null) {
  if (typeof window === 'undefined') return;
  if (company) {
    localStorage.setItem(CURRENT_COMPANY_KEY, JSON.stringify(company));
  } else {
    localStorage.removeItem(CURRENT_COMPANY_KEY);
  }
}

export function getCurrentCompany(): CurrentCompany | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(CURRENT_COMPANY_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as CurrentCompany;
  } catch {
    return null;
  }
}

/**
 * Fetch company details directly from the database/API.
 */
export async function getCompany(companyId: number | string): Promise<CurrentCompany> {
  const res = await api.get<CurrentCompany>(`/companies/${companyId}`);
  return res.data;
}

/**
 * Update the locally stored company object with new fields.
 * Used when settings are changed (e.g. Calendar Mode).
 */
export function updateCurrentCompany(updates: Partial<CurrentCompany>) {
  if (typeof window === 'undefined') return;
  const current = getCurrentCompany();
  if (current) {
    const updated = { ...current, ...updates };
    setCurrentCompany(updated);
    return updated;
  }
  return null;
}

/**
 * Returns a smart default period (from/to) for the current company's reports.
 * Falls back to the current month if no fiscal year is defined.
 * If mode is 'BS', it ensures returning BS dates.
 */
export function getSmartDefaultPeriod(
  mode: "AD" | "BS" = "AD",
  company?: CurrentCompany | null
): { from: string; to: string } {
  const today = new Date();
  const isoToday = today.toISOString().slice(0, 10);

  if (mode === "BS") {
    const todayBS = safeADToBS(isoToday) || "";
    if (todayBS) {
      const parts = todayBS.split("-");
      const y = parseInt(parts[0], 10);
      const m = parseInt(parts[1], 10);
      // Nepali Fiscal Year starts on Shrawan 1 (Month 04)
      const fyStartYear = m >= 4 ? y : y - 1;
      return { from: `${fyStartYear}-04-01`, to: todayBS };
    }
    return { from: isoToday.slice(0, 8) + "01", to: isoToday };
  } else {
    // mode === "AD": Nepali Fiscal Year in AD starts on July 17
    const y = today.getFullYear();
    const m = today.getMonth() + 1;
    const d = today.getDate();
    const fyStartYear = (m > 7 || (m === 7 && d >= 17)) ? y : y - 1;
    return { from: `${fyStartYear}-07-17`, to: isoToday };
  }
}

/**
 * Formats an ISO date string for display, adding a (BS) or (AD) suffix.
 * Automatically handles conversion if the input date string doesn't match the target mode.
 */
export function formatDateWithSuffix(
  iso: string,
  mode: "AD" | "BS" = "AD"
): string {
  if (!iso) return "";

  const parseYear = (d: string) => {
    if (!d || !d.includes("-")) return 0;
    return parseInt(d.split("-")[0], 10);
  };
  const looksLikeBS = parseYear(iso) > 2050;
  const looksLikeAD = parseYear(iso) > 1950 && parseYear(iso) <= 2050;
  
  if (mode === "BS") {
    let display = iso;
    if (looksLikeAD) {
       display = safeADToBS(iso) || iso;
    }
    return display + " (BS)";
  } else {
    let display = iso;
    if (looksLikeBS) {
       display = safeBSToAD(iso) || iso;
    }
    return display + " (AD)";
  }
}

export type DefaultLedgerRecord = {
  id: number;
  name: string;
  group_id: number;
  code?: string;
};

export type DefaultLedgersMap = Record<string, DefaultLedgerRecord>;

type AllCompanyDefaultLedgers = Record<number, DefaultLedgersMap>;

export function setDefaultLedgers(companyId: number, ledgers: DefaultLedgersMap): void {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem(DEFAULT_LEDGERS_KEY);
  let map: AllCompanyDefaultLedgers = {};
  if (raw) {
    try {
      map = JSON.parse(raw) as AllCompanyDefaultLedgers;
    } catch {
      map = {};
    }
  }
  map[companyId] = ledgers || {};
  localStorage.setItem(DEFAULT_LEDGERS_KEY, JSON.stringify(map));
}

export function getDefaultLedgers(companyId: number): DefaultLedgersMap | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(DEFAULT_LEDGERS_KEY);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as AllCompanyDefaultLedgers;
    return map[companyId] || null;
  } catch {
    return null;
  }
}

type CompanyLogos = Record<number, string>;

export function setCompanyLogo(companyId: number, logoUrl: string | null) {
  if (typeof window === 'undefined') return;
  const raw = localStorage.getItem(COMPANY_LOGOS_KEY);
  let map: CompanyLogos = {};
  if (raw) {
    try {
      map = JSON.parse(raw) as CompanyLogos;
    } catch {
      map = {};
    }
  }
  if (logoUrl) {
    map[companyId] = logoUrl;
  } else {
    delete map[companyId];
  }
  localStorage.setItem(COMPANY_LOGOS_KEY, JSON.stringify(map));
}

export function getCompanyLogo(companyId: number): string | null {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(COMPANY_LOGOS_KEY);
  if (!raw) return null;
  try {
    const map = JSON.parse(raw) as CompanyLogos;
    return map[companyId] || null;
  } catch {
    return null;
  }
}

export function getApiErrorMessage(error: unknown): string {
  const detail = (error as any)?.response?.data?.detail;
  
  // Hande FastAPI / Pydantic validation errors (array of objects)
  if (Array.isArray(detail)) {
    return detail
      .map((err: any) => {
        const field = err.loc ? err.loc[err.loc.length - 1] : "";
        return `${field ? field + ": " : ""}${err.msg || "Invalid value"}`;
      })
      .join(", ");
  }

  if (typeof detail === 'string' && detail.trim()) return detail;
  if (detail && typeof detail === 'object' && typeof (detail as any).msg === 'string') {
    return (detail as any).msg;
  }
  
  try {
    if (detail != null && typeof detail === 'object') return JSON.stringify(detail);
    if (detail != null) return String(detail);
  } catch {
    // ignore
  }
  
  const msg = (error as any)?.message;
  if (typeof msg === 'string' && msg.trim()) return msg;
  return 'Request failed';
}

export async function fetchItem(companyId: number, itemId: number): Promise<ItemRead> {
  const res = await api.get<ItemRead>(`/companies/${companyId}/items/${itemId}`);
  return res.data;
}

export async function createVoucher(
  companyId: number,
  payload: {
    voucher_date: string;
    voucher_type: string;
    narration?: string;
    lines: { ledger_id: number; debit: number; credit: number }[];
  }
): Promise<Voucher> {
  const res = await api.post<Voucher>(`/companies/${companyId}/vouchers`, payload);
  return res.data;
}

export type CounterpartyLedger = {
  id: number;
  name: string;
  group_id: number;
  group_name?: string;
};

export async function fetchCounterpartyLedgers(
  companyId: number,
  voucherType: 'PAYMENT' | 'RECEIPT'
): Promise<CounterpartyLedger[]> {
  const res = await api.get<unknown>(
    `/companies/${companyId}/vouchers/counterparty-ledgers`,
    {
      params: { voucher_type: voucherType },
    }
  );

  const data: any = res.data as any;
  if (Array.isArray(data)) return data as CounterpartyLedger[];
  if (data && Array.isArray(data.results)) return data.results as CounterpartyLedger[];
  return [];
}

export type CashVoucherSimpleCreate = {
  voucher_date?: string;
  bill_date?: string | null;
  voucher_date_bs?: string;
  voucher_type: 'PAYMENT' | 'RECEIPT';
  counterparty_ledger_id: number;
  amount: number;
  payment_mode_id: number;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  ledger_id?: number | null;
  narration: string | null;
};

export async function createSimpleVoucher(
  companyId: number,
  payload: {
    voucher_date: string;
    voucher_type: 'PAYMENT' | 'RECEIPT' | 'CONTRA';
    payment_mode_id: number;
    counterparty_ledger_id: number;
    amount: number;
    narration?: string | null;
  }
): Promise<Voucher> {
  const res = await api.post<Voucher>(`/companies/${companyId}/vouchers/simple`, payload);
  return res.data;
}

export async function createCashVoucher(
  companyId: number,
  payload: CashVoucherSimpleCreate
): Promise<Voucher> {
  const res = await api.post<Voucher>(
    `/companies/${companyId}/vouchers/cash-simple`,
    payload
  );
  return res.data;
}

export async function createManualVoucher(
  companyId: number,
  payload: VoucherCreate
): Promise<Voucher> {
  const res = await api.post<Voucher>(`/companies/${companyId}/vouchers`, payload);
  return res.data;
}

export type OutstandingDocument = {
  doc_type: 'PURCHASE_BILL' | 'SALES_INVOICE';
  id: number;
  number: string;
  date: string;
  party_id: number;
  party_name: string;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency: string;
  reference?: string | null;
};

export type VoucherAllocationCreate = {
  doc_type: 'PURCHASE_BILL' | 'SALES_INVOICE';
  doc_id: number;
  amount: number;
};

export async function fetchOutstandingPurchaseBills(
  companyId: number,
  counterpartyLedgerId: number
): Promise<OutstandingDocument[]> {
  const url = `/companies/${companyId}/outstanding/purchase-bills`;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Against] GET', url, { counterparty_ledger_id: counterpartyLedgerId });
  }
  const res = await api.get<OutstandingDocument[]>(url, {
    params: { counterparty_ledger_id: counterpartyLedgerId },
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Against] GET response', res.data);
  }
  return Array.isArray(res.data) ? res.data : [];
}

export async function fetchOutstandingSalesInvoices(
  companyId: number,
  counterpartyLedgerId: number
): Promise<OutstandingDocument[]> {
  const url = `/companies/${companyId}/outstanding/sales-invoices`;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Against] GET', url, { counterparty_ledger_id: counterpartyLedgerId });
  }
  const res = await api.get<OutstandingDocument[]>(url, {
    params: { counterparty_ledger_id: counterpartyLedgerId },
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Against] GET response', res.data);
  }
  return Array.isArray(res.data) ? res.data : [];
}

export async function postVoucherAllocations(
  companyId: number,
  voucherId: number,
  allocations: VoucherAllocationCreate[]
): Promise<void> {
  const url = `/companies/${companyId}/vouchers/${voucherId}/allocations`;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Against] POST', url, { allocations });
  }
  await api.post(url, { allocations });
}

export async function fetchVoucherAllocations(
  companyId: number,
  voucherId: number
): Promise<VoucherAllocationCreate[]> {
  const url = `/companies/${companyId}/vouchers/${voucherId}/allocations`;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[Against] GET', url);
  }
  const res = await api.get<{ allocations?: VoucherAllocationCreate[] } | VoucherAllocationCreate[]>(url);
  const data: any = res.data as any;
  if (Array.isArray(data)) return data as VoucherAllocationCreate[];
  if (data && Array.isArray(data.allocations)) return data.allocations as VoucherAllocationCreate[];
  return [];
}

export type VoucherLogAction = 'CREATED' | 'UPDATED' | 'DELETED';

export type VoucherLog = {
  id: number;
  timestamp: string;
  tenant_id: number;
  company_id: number;
  voucher_id: number;
  voucher_number: string | null;
  actor: string | null;
  action: VoucherLogAction;
  summary: string;
};

export type VoucherLogFilters = {
  tenant_id?: number;
  company_id?: number;
  voucher_number?: string;
  action?: VoucherLogAction;
  from?: string;
  to?: string;
  skip?: number;
  limit?: number;
};

export async function fetchVoucherLogs(filters: VoucherLogFilters): Promise<VoucherLog[]> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.append(key, String(value));
    }
  });
  const res = await api.get<VoucherLog[]>(`/admin/voucher-logs?${params.toString()}`);
  return res.data;
}

export async function fetchItemUnits(
  companyId: number,
  itemId: number
): Promise<ItemUnitRead[]> {
  const res = await api.get<ItemUnitRead[]>(`/companies/${companyId}/items/${itemId}/units`);
  return res.data;
}

export async function saveItemUnits(
  companyId: number,
  itemId: number,
  units: ItemUnitCreate[]
): Promise<ItemUnitRead[]> {
  const res = await api.put<ItemUnitRead[]>(
    `/companies/${companyId}/items/${itemId}/units`,
    units
  );
  return res.data;
}

// Orders & Notifications & Returns helpers

export type SalesOrderSummary = {
  id: number;
  voucher_date: string;
  voucher_number: string;
  customer_id: number;
  customer_name: string;
  customer_address?: string;
  customer_email?: string;
  customer_phone?: string;
  due_date?: string | null;
  sales_person_id?: number | null;
  sales_person_name?: string | null;
  total_amount: number;
  status: string;
  payment_status?: string;
};

export type PurchaseOrderSummary = {
  id: number;
  voucher_date: string;
  voucher_number: string;
  supplier_id: number;
  supplier_name: string;
  total_amount: number;
  status: string;
};

export type OrderLine = {
  item_id: number;
  quantity: number;
  rate: number;
  discount: number;
  tax_rate: number;
  warehouse_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  item_name?: string;
  category?: string;
};

export type SalesOrderDetail = {
  id: number;
  voucher_date: string;
  voucher_number: string;
  customer_id: number;
  customer_name?: string;
  customer_address?: string;
  customer_email?: string;
  customer_phone?: string;
  due_date?: string | null;
  sales_person_id?: number | null;
  sales_person_name?: string | null;
  reference?: string | null;
  status: string;
  payment_status?: string;
  total_amount?: number;
  lines: OrderLine[];
  converted_to_invoice_id?: number | null;
};

export type PurchaseOrderDetail = {
  id: number;
  voucher_date: string;
  voucher_number: string;
  supplier_id: number;
  supplier_name?: string;
  reference?: string | null;
  status: string;
  total_amount?: number;
  lines: OrderLine[];
};

export type SalesOrderCreate = {
  customer_id: number;
  date: string;
  due_date?: string | null;
  sales_person_id?: number | null;
  reference?: string;
  lines: OrderLine[];
};

export type PurchaseOrderCreate = {
  supplier_id: number;
  date: string;
  reference?: string;
  lines: OrderLine[];
};

export type ConvertSalesOrderBody = {
  date?: string;
  due_date?: string | null;
  sales_person_id?: number | null;
  reference?: string;
  override_lines?: OrderLine[];
};

export type ConvertSalesOrderResponse = {
  invoice_id: number;
  invoice_number: string;
  order_id: number;
  status: string;
};

export type ConvertPurchaseOrderBody = {
  date?: string;
  reference?: string;
  override_lines?: OrderLine[];
};

export type ConvertPurchaseOrderResponse = {
  bill_id: number;
  bill_number: string;
  order_id: number;
  status: string;
};

export type NotificationRecord = {
  id: number;
  company_id: number;
  type: 'SALES_ORDER_CREATED' | 'PURCHASE_ORDER_CREATED' | 'TASK_ASSIGNED' | 'TASK_COMPLETED' | string;
  order_id?: number | null;
  task_id?: number | null;
  created_at: string;
  read: boolean;
};

export type TransactionMode = 'CASH' | 'BANK' | 'ESEWA' | 'KHALTI' | 'ONLINE';

export type DepartmentRead = {
  id: number;
  company_id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type ProjectRead = {
  id: number;
  company_id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  updated_at: string;
};

export type SegmentRead = {
  id: number;
  company_id: number;
  name: string;
  code: string | null;
  is_active: boolean;
  updated_at: string;
};

export async function listDepartments(companyId: number | string): Promise<DepartmentRead[]> {
  const res = await api.get<DepartmentRead[]>(`/companies/${companyId}/departments`);
  return res.data;
}

export async function listProjects(companyId: number | string): Promise<ProjectRead[]> {
  const res = await api.get<ProjectRead[]>(`/companies/${companyId}/projects`);
  return res.data;
}

export async function listSegments(companyId: number | string): Promise<SegmentRead[]> {
  const res = await api.get<SegmentRead[]>(`/companies/${companyId}/segments`);
  return res.data;
}

export type VoucherLineCreate = {
  ledger_id: number;
  debit?: number; // default 0 on backend
  credit?: number; // default 0 on backend
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
};

export type VoucherLineRead = VoucherLineCreate & {
  id: number;
  ledger_name: string | null;
  department_name: string | null;
  project_name: string | null;
  segment_name: string | null;
  employee_id: number | null;
  employee_name: string | null;
};

export type VoucherCreate = {
  voucher_date?: string;
  bill_date?: string | null;
  voucher_date_bs?: string;
  voucher_type: 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'JOURNAL';
  narration?: string | null;
  payment_mode_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  employee_id?: number | null;
  lines: VoucherLineCreate[];
};

export type VoucherUpdate = {
  voucher_date?: string;
  bill_date?: string | null;
  voucher_date_bs?: string;
  voucher_type?: 'PAYMENT' | 'RECEIPT' | 'CONTRA' | 'JOURNAL';
  narration?: string | null;
  payment_mode_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  employee_id?: number | null;
  lines?: VoucherLineCreate[];
};

export type SalesInvoiceLine = OrderLine;

export type SalesPersonIncentiveAmountInput = {
  sales_person_id: number;
  incentive_amount: number;
  is_manual?: boolean;
  post_method?: string;
};

export type SalesInvoice = {
  id: number;
  customer_id: number;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  date: string;
  bill_date?: string | null;
  due_date?: string | null;
  sales_person_id?: number | null;
  sales_person_name?: string | null;
  reference?: string | null;
  custom_reference?: string | null;
  lines: SalesInvoiceLine[];
  voucher_id?: number | null;
  voucher_number?: string | null;
  payment_mode_id?: number | null;
  ledger_id?: number | null;
  bank_remark?: string | null;
  payment_status?: 'PAID' | 'PARTIAL' | 'UNPAID' | string | null;
  paid_amount?: number | null;
  outstanding_amount?: number | null;
  sales_person_incentive_amounts?: SalesPersonIncentiveAmountInput[] | null;
};

export type CustomerRead = {
  id: number;
  name: string;
  ledger_id?: number | null;
};

export async function fetchCustomer(
  companyId: number,
  customerId: number
): Promise<CustomerRead> {
  const res = await api.get<CustomerRead>(`/companies/${companyId}/customers/${customerId}`);
  return res.data;
}

export async function listCustomers(companyId: number | string): Promise<CustomerRead[]> {
  const res = await api.get<CustomerRead[]>(`/companies/${companyId}/customers`);
  return res.data;
}

export async function fetchSalesInvoiceByReference(
  companyId: number,
  reference: string
): Promise<SalesInvoice> {
  const res = await api.get<SalesInvoice>(`/sales/companies/${companyId}/invoices/by-reference/${encodeURIComponent(reference)}`);
  return res.data;
}

export type SalesInvoiceLineInput = {
  item_id: number;
  quantity: number;
  rate: number;
  discount?: number;
  tax_rate: number;
  warehouse_id?: number | null;
  sales_person_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  ref_no?: string | null;
  remarks?: string | null;
  hs_code?: string | null;
  duty_tax_id?: number | null;
};

export type SalesInvoiceCreateInput = {
  customer_id: number;
  date: string;
  bill_date?: string | null;
  due_date?: string | null;
  sales_person_id?: number | null;
  reference?: string;
  custom_reference?: string;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  lines: SalesInvoiceLineInput[];
  /** Per sales person incentive amounts for this invoice (optional; backend may ignore if unsupported) */
  sales_person_incentive_amounts?: SalesPersonIncentiveAmountInput[] | null;
  transaction_mode?: TransactionMode | null;
  bypass_stock_validation?: boolean;
  payment_mode_id?: number | null;
  payment_ledger_id?: number | null;
  bank_remark?: string | null;
  narration?: string | null;
  invoice_type?: string;
  sales_type?: string;
  apply_tds?: boolean;
  tds_amount?: number | null;
  tds_ledger_id?: number | null;
};

export type SalesPersonRead = {
  id: number;
  name: string;
  is_active: boolean;
};

export type SalesByPersonRow = {
  sales_person_id: number | null;
  sales_person_name: string | null;
  invoice_count: number;
  total_sales_amount: number;
  outstanding_amount: number;
};

export type PurchaseBillLine = OrderLine;

export type PurchaseBill = {
  id: number;
  supplier_id: number;
  date: string;
  bill_date?: string | null;
  due_date?: string | null;
  reference?: string | null;
  lines: PurchaseBillLine[];
  voucher_id?: number | null;
  voucher_number?: string | null;
  payment_mode_id?: number | null;
};

export type PurchaseBillLineInput = {
  item_id: number;
  quantity: number;
  rate: number;
  discount?: number;
  tax_rate: number;
  warehouse_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
};

export type PurchaseBillCreateInput = {
  supplier_id: number;
  date: string;
  bill_date?: string | null;
  due_date?: string | null;
  reference?: string;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  lines: PurchaseBillLineInput[];
};

export type SalesReturnLine = OrderLine;

export type SalesReturn = {
  id: number;
  customer_id: number;
  customer_name?: string;
  date: string;
  reference?: string;
  source_invoice_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  lines: SalesReturnLine[];
  payment_mode_id?: number | null;
};

export type SalesReturnCreate = {
  customer_id: number;
  date: string;
  reference?: string;
  source_invoice_id?: number;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  lines: SalesReturnLine[];
  transaction_mode?: TransactionMode | null;
};

export type PurchaseReturnLine = OrderLine;

export type PurchaseReturn = {
  id: number;
  supplier_id: number;
  supplier_name?: string;
  date: string;
  reference?: string;
  source_bill_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  lines: PurchaseReturnLine[];
  payment_mode_id?: number | null;
};

export type PurchaseReturnCreate = {
  supplier_id: number;
  date: string;
  reference?: string;
  source_bill_id?: number;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  lines: PurchaseReturnLine[];
  transaction_mode?: TransactionMode | null;
};

export type ReversePurchaseBillPayload = {
  date?: string | null;
  reference?: string | null;
  payment_mode_id?: number | null;
  purchase_return_ledger_id?: number | null;
  input_tax_return_ledger_id?: number | null;
};

export type Voucher = {
  id: number;
  company_id: number;
  voucher_date: string;
  bill_date?: string | null;
  voucher_date_bs?: string;
  voucher_type: string;
  narration: string | null;
  fiscal_year: string | null;
  voucher_sequence: number | null;
  voucher_number: string | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  employee_id?: number | null;
  department_name?: string | null;
  project_name?: string | null;
  segment_name?: string | null;
  employee_name?: string | null;
  payment_mode?: string | null;
  payment_mode_id?: number | null;
  bank_remark?: string | null;
  total_amount?: number;
  lines: VoucherLineRead[];
  created_at: string;
  updated_at: string;
};

// Orders

export async function fetchOpenSalesOrders(companyId: number): Promise<SalesOrderSummary[]> {
  const res = await api.get<SalesOrderSummary[]>(
    `/orders/companies/${companyId}/orders/sales?status=OPEN`
  );
  return res.data;
}

export async function fetchOpenPurchaseOrders(
  companyId: number
): Promise<PurchaseOrderSummary[]> {
  const res = await api.get<PurchaseOrderSummary[]>(
    `/orders/companies/${companyId}/orders/purchase?status=OPEN`
  );
  return res.data;
}

export async function fetchSalesOrderDetail(
  companyId: number,
  orderId: number
): Promise<SalesOrderDetail> {
  const res = await api.get<SalesOrderDetail>(
    `/orders/companies/${companyId}/orders/sales/${orderId}`
  );
  return res.data;
}

export async function fetchPurchaseOrderDetail(
  companyId: number,
  orderId: number
): Promise<PurchaseOrderDetail> {
  const res = await api.get<PurchaseOrderDetail>(
    `/orders/companies/${companyId}/orders/purchase/${orderId}`
  );
  return res.data;
}

export async function createSalesOrder(
  companyId: number,
  payload: SalesOrderCreate
): Promise<SalesOrderDetail> {
  const res = await api.post<SalesOrderDetail>(
    `/orders/companies/${companyId}/orders/sales`,
    payload
  );
  return res.data;
}

export async function createPurchaseOrder(
  companyId: number,
  payload: PurchaseOrderCreate
): Promise<PurchaseOrderDetail> {
  const res = await api.post<PurchaseOrderDetail>(
    `/orders/companies/${companyId}/orders/purchase`,
    payload
  );
  return res.data;
}

export async function convertSalesOrderToInvoice(
  companyId: number,
  orderId: number,
  payload?: ConvertSalesOrderBody
): Promise<ConvertSalesOrderResponse> {
  const res = await api.post<ConvertSalesOrderResponse>(
    `/orders/companies/${companyId}/orders/sales/${orderId}/convert-to-invoice`,
    payload || {}
  );
  return res.data;
}

export async function convertPurchaseOrderToBill(
  companyId: number,
  orderId: number,
  payload?: ConvertPurchaseOrderBody
): Promise<ConvertPurchaseOrderResponse> {
  const res = await api.post<ConvertPurchaseOrderResponse>(
    `/orders/companies/${companyId}/orders/purchase/${orderId}/convert-to-bill`,
    payload || {}
  );
  return res.data;
}

// Notifications

export async function fetchUnreadNotifications(
  companyId: number
): Promise<NotificationRecord[]> {
  const res = await api.get<NotificationRecord[]>(
    `/notifications/companies/${companyId}/notifications?unread_only=true`
  );
  return res.data;
}

export async function markNotificationRead(
  companyId: number,
  notificationId: number
): Promise<void> {
  await api.post(
    `/notifications/companies/${companyId}/notifications/${notificationId}/mark-read`,
    {}
  );
}

// Sales returns

export async function fetchSalesReturns(companyId: number): Promise<SalesReturn[]> {
  const res = await api.get<SalesReturn[]>(`/sales/companies/${companyId}/returns`);
  return res.data;
}

export async function fetchSalesReturnDetail(
  companyId: number,
  returnId: number
): Promise<SalesReturn> {
  const res = await api.get<SalesReturn>(
    `/sales/companies/${companyId}/returns/${returnId}`
  );
  return res.data;
}

export async function createSalesReturn(
  companyId: number,
  payload: SalesReturnCreate
): Promise<SalesReturn> {
  const res = await api.post<SalesReturn>(
    `/sales/companies/${companyId}/returns`,
    payload
  );
  return res.data;
}

export async function createSalesReturnFromInvoice(
  companyId: number,
  invoiceId: number
): Promise<SalesReturn> {
  const res = await api.post<SalesReturn>(
    `/sales/companies/${companyId}/invoices/${invoiceId}/create-return`,
    {}
  );
  return res.data;
}

// Purchase returns

export async function fetchPurchaseReturns(companyId: number): Promise<PurchaseReturn[]> {
  const res = await api.get<PurchaseReturn[]>(
    `/purchases/companies/${companyId}/returns`
  );
  return res.data;
}

export async function fetchPurchaseReturnDetail(
  companyId: number,
  returnId: number
): Promise<PurchaseReturn> {
  const res = await api.get<PurchaseReturn>(
    `/purchases/companies/${companyId}/returns/${returnId}`
  );
  return res.data;
}

export async function createPurchaseReturn(
  companyId: number,
  payload: PurchaseReturnCreate
): Promise<PurchaseReturn> {
  const res = await api.post<PurchaseReturn>(
    `/purchases/companies/${companyId}/returns`,
    payload
  );
  return res.data;
}

// Invoices & Bills

export async function listSalesInvoices(companyId: number): Promise<SalesInvoice[]> {
  const res = await api.get<SalesInvoice[]>(`/sales/companies/${companyId}/invoices`);
  return res.data;
}

export async function createSalesInvoice(
  companyId: number,
  payload: SalesInvoiceCreateInput
): Promise<SalesInvoice> {
  const res = await api.post<SalesInvoice>(`/sales/companies/${companyId}/invoices`, payload);
  return res.data;
}

export async function fetchSalesPersons(
  companyId: number,
  isActive: boolean = true
): Promise<SalesPersonRead[]> {
  const res = await api.get<SalesPersonRead[]>(
    `/companies/${companyId}/sales-persons?is_active=${isActive ? 'true' : 'false'}`
  );
  return res.data;
}

export async function fetchSalesByPersonReport(
  companyId: number,
  params: {
    from_date: string;
    to_date: string;
    sales_person_id?: number | null;
  }
): Promise<SalesByPersonRow[]> {
  const query = new URLSearchParams({
    from_date: params.from_date,
    to_date: params.to_date,
  });

  if (params.sales_person_id !== undefined && params.sales_person_id !== null) {
    query.set('sales_person_id', String(params.sales_person_id));
  }

  const res = await api.get<SalesByPersonRow[]>(
    `/sales/companies/${companyId}/reports/sales-by-person?${query.toString()}`
  );
  return res.data;
}

export async function listPurchaseBills(companyId: number): Promise<PurchaseBill[]> {
  const res = await api.get<PurchaseBill[]>(`/companies/${companyId}/bills`);
  return res.data;
}

export async function createPurchaseBill(
  companyId: number,
  payload: PurchaseBillCreateInput
): Promise<PurchaseBill> {
  const res = await api.post<PurchaseBill>(`/companies/${companyId}/bills`, payload);
  return res.data;
}

export async function reversePurchaseBill(
  companyId: number,
  billId: number,
  payload: ReversePurchaseBillPayload
): Promise<PurchaseReturn> {
  const res = await api.post<PurchaseReturn>(
    `/companies/${companyId}/bills/${billId}/reverse`,
    payload
  );
  return res.data;
}

// Delivery Management

export type DeliveryPlaceRead = {
  id: number;
  company_id: number;
  name: string;
  address?: string | null;
  default_shipping_charge?: number | null;
  is_active: boolean;
};

export type DeliveryPartnerRead = {
  id: number;
  company_id: number;
  name: string;
  contact_person?: string | null;
  phone?: string | null;
  email?: string | null;
  vehicle_number?: string | null;
  ledger_id?: number | null;
  is_active: boolean;
};

export type PackageStatus = 'PENDING' | 'DISPATCHED' | 'DELIVERED' | 'RETURNED';

export type PackageRead = {
  id: number;
  company_id: number;
  invoice_id: number;
  tracking_number?: string | null;
  delivery_partner_id?: number | null;
  delivery_place_id?: number | null;
  status: PackageStatus;
  cod_amount: number;
  cod_received: boolean;
  dispatched_at?: string | null;
  delivered_at?: string | null;
  returned_at?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export async function getDeliveryPlaces(companyId: number): Promise<DeliveryPlaceRead[]> {
  const res = await api.get<DeliveryPlaceRead[]>(`/companies/${companyId}/delivery/places`);
  return res.data;
}

export async function createDeliveryPlace(companyId: number, payload: any): Promise<DeliveryPlaceRead> {
  const res = await api.post<DeliveryPlaceRead>(`/companies/${companyId}/delivery/places`, payload);
  return res.data;
}

export async function updateDeliveryPlace(companyId: number, id: number, payload: any): Promise<DeliveryPlaceRead> {
  const res = await api.put<DeliveryPlaceRead>(`/companies/${companyId}/delivery/places/${id}`, payload);
  return res.data;
}

export async function deleteDeliveryPlace(companyId: number, id: number): Promise<void> {
  await api.delete(`/companies/${companyId}/delivery/places/${id}`);
}

export async function getDeliveryPartners(companyId: number): Promise<DeliveryPartnerRead[]> {
  const res = await api.get<DeliveryPartnerRead[]>(`/companies/${companyId}/delivery/partners`);
  return res.data;
}

export async function createDeliveryPartner(companyId: number, payload: any): Promise<DeliveryPartnerRead> {
  const res = await api.post<DeliveryPartnerRead>(`/companies/${companyId}/delivery/partners`, payload);
  return res.data;
}

export async function updateDeliveryPartner(companyId: number, id: number, payload: any): Promise<DeliveryPartnerRead> {
  const res = await api.put<DeliveryPartnerRead>(`/companies/${companyId}/delivery/partners/${id}`, payload);
  return res.data;
}

export async function deleteDeliveryPartner(companyId: number, id: number): Promise<void> {
  await api.delete(`/companies/${companyId}/delivery/partners/${id}`);
}

export async function getPackages(companyId: number): Promise<PackageRead[]> {
  const res = await api.get<PackageRead[]>(`/companies/${companyId}/delivery/packages`);
  return res.data;
}

export async function createPackage(companyId: number, payload: any): Promise<PackageRead> {
  const res = await api.post<PackageRead>(`/companies/${companyId}/delivery/packages`, payload);
  return res.data;
}

export async function updatePackage(companyId: number, id: number, payload: any): Promise<PackageRead> {
  const res = await api.put<PackageRead>(`/companies/${companyId}/delivery/packages/${id}`, payload);
  return res.data;
}

export async function receivePackageCOD(companyId: number, id: number, amount: number): Promise<any> {
  const res = await api.post(`/companies/${companyId}/delivery/packages/${id}/receive-cod`, { amount });
  return res.data;
}

// BOM & Production
export async function createBOM(
  companyId: number | string,
  payload: BOMCreate
): Promise<BOMRead> {
  const res = await api.post<BOMRead>(`/production/companies/${companyId}/bom`, payload);
  return res.data;
}

export async function updateBOM(
  companyId: number | string,
  bomId: number,
  payload: BOMUpdate
): Promise<BOMRead> {
  const res = await api.put<BOMRead>(
    `/production/companies/${companyId}/bom/${bomId}`,
    payload
  );
  return res.data;
}

export async function getBOMByProduct(
  companyId: number | string,
  productId: number,
  params?: { as_of?: string }
): Promise<BOMRead> {
  const res = await api.get<BOMRead>(
    `/production/companies/${companyId}/bom/product/${productId}`,
    { params: params?.as_of ? { as_of: params.as_of } : undefined }
  );
  return res.data;
}

export async function getBOMById(
  companyId: number | string,
  bomId: number
): Promise<BOMRead> {
  const res = await api.get<BOMRead>(`/production/companies/${companyId}/bom/${bomId}`);
  return res.data;
}

export async function listBOMs(companyId: number | string): Promise<BOMRead[]> {
  const res = await api.get<BOMRead[]>(`/production/companies/${companyId}/bom`);
  return res.data;
}

export async function duplicateBOM(companyId: number | string, bomId: number): Promise<BOMRead> {
  const res = await api.post<BOMRead>(`/production/companies/${companyId}/bom/${bomId}/duplicate`);
  return res.data;
}

export async function approveBOM(companyId: number | string, bomId: number): Promise<BOMRead> {
  const res = await api.post<BOMRead>(`/production/companies/${companyId}/bom/${bomId}/approve`);
  return res.data;
}

export async function deleteBOM(
  companyId: number | string,
  bomId: number
): Promise<void> {
  await api.delete(`/production/companies/${companyId}/bom/${bomId}`);
}

export async function createProductionOrder(
  companyId: number | string,
  payload: ProductionOrderCreate
): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>(
    `/production/companies/${companyId}/production-orders`,
    payload
  );
  return res.data;
}

export async function completeProductionOrder(
  companyId: number | string,
  productionOrderId: number
): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>(
    `/production/companies/${companyId}/production-orders/${productionOrderId}/complete`
  );
  return res.data;
}

export async function cancelProductionOrder(
  companyId: number | string,
  productionOrderId: number
): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>(
    `/production/companies/${companyId}/production-orders/${productionOrderId}/cancel`
  );
  return res.data;
}

export async function getProductionOrder(
  companyId: number | string,
  productionOrderId: number
): Promise<ProductionOrderRead> {
  const res = await api.get<ProductionOrderRead>(
    `/production/companies/${companyId}/production-orders/${productionOrderId}`
  );
  return res.data;
}

export async function updateProductionOrder(
  companyId: string | number,
  productionOrderId: number,
  payload: Partial<ProductionOrderCreate>
): Promise<ProductionOrderRead> {
  const res = await api.put<ProductionOrderRead>(
    `/production/companies/${companyId}/production-orders/${productionOrderId}`,
    payload
  );
  return res.data;
}

export async function deleteProductionOrder(
  companyId: string | number,
  productionOrderId: number
): Promise<void> {
  await api.delete(
    `/production/companies/${companyId}/production-orders/${productionOrderId}`
  );
}

export async function listProductionOrders(
  companyId: number | string,
  params?: { q?: string; status?: string; from_date?: string; to_date?: string }
): Promise<ProductionOrderRead[]> {
  const res = await api.get<ProductionOrderRead[]>(`/production/companies/${companyId}/production-orders`, { params });
  return res.data;
}

export async function approveProductionOrder(companyId: number | string, productionOrderId: number): Promise<ProductionOrderRead> {
  const res = await api.post<ProductionOrderRead>(
    `/production/companies/${companyId}/production-orders/${productionOrderId}/approve`
  );
  return res.data;
}

export async function getManufacturingDashboard(companyId: number | string): Promise<{ today_production: number; pending_orders: number; wastage_qty: number; monthly_output: number; material_shortage: number }> {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/dashboard`);
  return res.data;
}

export async function listMaterialIssues(companyId: number | string): Promise<ProductionIssueRead[]> {
  const res = await api.get<ProductionIssueRead[]>(`/production/companies/${companyId}/manufacturing/material-issue`);
  return res.data;
}

export type ManufacturingSettingsRead = {
  id: number;
  company_id: number;
  default_wip_ledger_id: number | null;
  default_fg_ledger_id: number | null;
  default_rm_ledger_id: number | null;
  default_warehouse_id: number | null;
  costing_method: string;
  approval_required: boolean;
  ai_predictions_enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ManufacturingSettingsUpsert = {
  default_wip_ledger_id?: number | null;
  default_fg_ledger_id?: number | null;
  default_rm_ledger_id?: number | null;
  default_warehouse_id?: number | null;
  costing_method?: string;
  approval_required?: boolean;
  ai_predictions_enabled?: boolean;
};

export async function getManufacturingSettings(companyId: number | string): Promise<ManufacturingSettingsRead | null> {
  const res = await api.get<ManufacturingSettingsRead | null>(`/production/companies/${companyId}/manufacturing/settings`);
  return res.data;
}

export async function upsertManufacturingSettings(companyId: number | string, payload: ManufacturingSettingsUpsert): Promise<ManufacturingSettingsRead> {
  const res = await api.put<ManufacturingSettingsRead>(`/production/companies/${companyId}/manufacturing/settings`, payload);
  return res.data;
}

// ── AI Analytics ─────────────────────────────────────────────────────────────

export type ReorderAlert = {
  item_id: number;
  item_name: string;
  item_code?: string | null;
  on_hand: number;
  reorder_level: number;
  monthly_avg_consumption: number;
  suggested_reorder_qty: number;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM";
};

export type WastageAnomaly = {
  order_id: number;
  order_no?: string | null;
  product_id: number;
  product_name: string;
  produced_qty: number;
  actual_scrap_qty: number;
  actual_wastage_pct: number;
  expected_wastage_pct: number;
  excess_pct: number;
};

export type ProductProfitability = {
  product_id: number;
  product_name: string;
  avg_cost_per_unit: number;
  avg_selling_price: number;
  profit_margin_pct: number;
  production_runs: number;
  recommendation: string;
};

export type ManufacturingAnalytics = {
  reorder_alerts: ReorderAlert[];
  wastage_anomalies: WastageAnomaly[];
  product_profitability: ProductProfitability[];
};

export async function getManufacturingAnalytics(companyId: number | string): Promise<ManufacturingAnalytics> {
  const res = await api.get<ManufacturingAnalytics>(`/production/companies/${companyId}/manufacturing/ai/analytics`);
  return res.data;
}

// ── Role Management ───────────────────────────────────────────────────────────

export type MfgRolePresetsResponse = {
  presets: string[];
  details: Record<string, Record<string, string>>;
};

export async function listManufacturingRolePresets(companyId: number | string): Promise<MfgRolePresetsResponse> {
  const res = await api.get<MfgRolePresetsResponse>(`/production/companies/${companyId}/manufacturing/roles/presets`);
  return res.data;
}

export async function assignManufacturingRole(
  companyId: number | string,
  userId: number,
  roleName: string,
  customPermissions?: Record<string, string>
): Promise<{ status: string; role: string; user_id: number; menus_configured: number; applied: string[] }> {
  const res = await api.post(`/production/companies/${companyId}/manufacturing/roles/assign`, {
    user_id: userId,
    role_name: roleName,
    ...(customPermissions ? { custom_permissions: customPermissions } : {}),
  });
  return res.data;
}

export async function createMaterialIssue(companyId: number | string, payload: { production_order_id: number; issue_date?: string; warehouse_id?: number | null; notes?: string }): Promise<ProductionIssueRead> {
  const res = await api.post<ProductionIssueRead>(`/production/companies/${companyId}/manufacturing/material-issue`, payload);
  return res.data;
}

export async function listManufacturingWip(companyId: number | string): Promise<Array<{ production_order_id: number; current_stage?: string | null; issued_material_value: number; labor_added: number; overhead_added: number; total_wip_cost: number }>> {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/wip`);
  return res.data;
}

export async function listProductionEntries(companyId: number | string) {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/production-entry`);
  return res.data;
}

export async function createProductionEntryRecord(
  companyId: number | string,
  payload: { production_order_id: number; entry_date?: string; produced_qty: number; rejected_qty?: number; damaged_qty?: number; extra_consumption?: number; stage?: string; notes?: string }
) {
  const res = await api.post(`/production/companies/${companyId}/manufacturing/production-entry`, payload);
  return res.data;
}

export async function listFinishedGoodsReceives(companyId: number | string) {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/finished-goods-receive`);
  return res.data;
}

export async function createFinishedGoodsReceiveRecord(
  companyId: number | string,
  payload: {
    production_order_id: number;
    receive_date?: string;
    warehouse_id?: number | null;
    department_id?: number | null;
    project_id?: number | null;
    segment_id?: number | null;
    received_qty: number;
  }
) {
  const res = await api.post(`/production/companies/${companyId}/manufacturing/finished-goods-receive`, payload);
  return res.data;
}

export async function listScrap(companyId: number | string) {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/scrap`);
  return res.data;
}

export async function createScrapRecord(
  companyId: number | string,
  payload: { production_order_id?: number | null; scrap_type: string; qty: number; reason?: string; recoverable?: boolean; saleable?: boolean }
) {
  const res = await api.post(`/production/companies/${companyId}/manufacturing/scrap`, payload);
  return res.data;
}

export async function listCosting(companyId: number | string) {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/costing`);
  return res.data;
}

export async function calculateCostingRecord(
  companyId: number | string,
  payload: { production_order_id: number; labor_cost?: number; machine_cost?: number; electricity_cost?: number; packing_cost?: number; overhead_cost?: number; sales_value?: number }
) {
  const res = await api.post(`/production/companies/${companyId}/manufacturing/costing`, payload);
  return res.data;
}

export async function getManufacturingReports(companyId: number | string, params?: { from_date?: string; to_date?: string }) {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/reports`, { params });
  return res.data;
}

export async function exportManufacturingReport(
  companyId: number | string,
  report: string,
  format: "csv" | "excel" = "csv",
  params?: { from_date?: string; to_date?: string }
): Promise<Blob> {
  const res = await api.get(`/production/companies/${companyId}/manufacturing/reports/export`, {
    params: { report, format, ...(params || {}) },
    responseType: "blob",
  });
  return res.data;
}

export async function getStockSummary(
  companyId: number | string
): Promise<ProductionStockSummaryRow[]> {
  const res = await api.get<ProductionStockSummaryRow[]>(
    `/inventory/companies/${companyId}/stock/summary`
  );
  return Array.isArray(res.data) ? res.data : [];
}

// Documents
export type DocumentExtractedItem = {
  name: string;
  qty: number;
  price: number;
  tax_rate?: number;
};

export type DocumentExtractedData = {
  document_type?: "PURCHASE" | "BILL" | null;
  vendor_name?: string | null;
  invoice_number?: string | null;
  invoice_date?: string | null;
  items: DocumentExtractedItem[];
  total_amount?: number | null;
  tax?: number | null;
  confidence_score?: number | null;
};

export type CompanyDocument = {
  id: number;
  file_url: string;
  file_type: "pdf" | "image" | string;
  status: "uploaded" | "processed" | "failed" | "confirmed" | string;
  extracted_data?: DocumentExtractedData | null;
  created_at: string;
  document_kind?: "PURCHASE" | "BILL" | string | null;
  original_filename?: string | null;
  content_type?: string | null;
  size_bytes?: number | null;
  confirmed_at?: string | null;
};

export type DocumentConfirmPayload = {
  document_type: "PURCHASE" | "BILL";
  extracted_data: DocumentExtractedData;
  allow_create_missing_supplier?: boolean;
  allow_create_missing_items?: boolean;
};

export type DocumentConfirmResult = {
  document_id: number;
  status: string;
  created_type: "PURCHASE_ORDER" | "PURCHASE_BILL";
  created_id: number;
  created_reference?: string | null;
};

export async function uploadCompanyDocument(
  companyId: number | string,
  file: File
): Promise<CompanyDocument> {
  const form = new FormData();
  form.append("file", file);
  const res = await api.post<CompanyDocument>(`/companies/${companyId}/documents/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return res.data;
}

export async function processCompanyDocument(
  companyId: number | string,
  documentId: number,
  force: boolean = false
): Promise<CompanyDocument> {
  const res = await api.post<CompanyDocument>(
    `/companies/${companyId}/documents/${documentId}/process`,
    { force }
  );
  return res.data;
}

export async function listCompanyDocuments(companyId: number | string): Promise<CompanyDocument[]> {
  const res = await api.get<CompanyDocument[]>(`/companies/${companyId}/documents`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function getCompanyDocument(
  companyId: number | string,
  documentId: number
): Promise<CompanyDocument> {
  const res = await api.get<CompanyDocument>(`/companies/${companyId}/documents/${documentId}`);
  return res.data;
}

export async function confirmCompanyDocument(
  companyId: number | string,
  documentId: number,
  payload: DocumentConfirmPayload
): Promise<DocumentConfirmResult> {
  const res = await api.post<DocumentConfirmResult>(
    `/companies/${companyId}/documents/${documentId}/confirm`,
    payload
  );
  return res.data;
}
