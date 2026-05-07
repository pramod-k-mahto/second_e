"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import React, { FormEvent, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { api, getItemLedgerDefaults, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { readCalendarDisplayMode } from "@/lib/calendarMode";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

import type { ItemUnitRead } from "@/types/item";
import { convertUiToBase } from "@/lib/units";
import { MasterSearchDialog, MasterSearchType } from "@/components/MasterSearchDialog";
import { amountToWords } from "@/lib/amountToWords";
import { PageHeader } from "@/components/ui/PageHeader";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { getEffectiveItemRate, } from "@/lib/api/inventory";
import { buildSalesInvoicePayload } from "@/lib/transactionPayloads";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";
import { deriveSettlement } from "@/lib/paymentModeSettlement";
import { SearchableSelect, type Option } from "@/components/ui/SearchableSelect";
import {
  SalesPersonMultiSearchSelect,
  formatSalesPersonIdsFromList,
  mergeSalesPersonCsv,
  parseSalesPersonIds,
  primarySalesPersonIdNum,
} from "@/components/sales/SalesPersonMultiSearchSelect";
import {
  computeInvoiceIncentivePreviews,
  salesPersonSelectionKey,
  type IncentiveRulePreview,
} from "@/lib/salesInvoiceIncentivePreview";
import {
  mergeInvoiceSalesPersonStateFromCache,
  saveSalesInvoiceSalesPersonCache,
} from "@/lib/salesInvoiceSalesPersonCache";
import { useCustomerStatement } from "@/lib/api/partyStatements";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/lib/formDrafts";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { QuickDepartmentModal } from '@/components/cost-centers/QuickDepartmentModal';
import { QuickProjectModal } from '@/components/cost-centers/QuickProjectModal';
import { QuickSegmentModal } from '@/components/cost-centers/QuickSegmentModal';
import { QuickCustomerModal } from '@/components/sales/QuickCustomerModal';
import { QuickItemModal } from '@/components/production/QuickItemModal';
import { QuickSalesPersonModal } from '@/components/sales/QuickSalesPersonModal';

function HSCodeCell({ companyId, itemId, value, onChange }: { companyId: string, itemId: string, value: string, onChange: (val: string) => void }) {
  const { data: hsCodes } = useSWR<string[]>(companyId && itemId ? `/sales/companies/${companyId}/hs-codes/${itemId}` : null, fetcher);

  // Auto-fill with the most recent HS code when item is selected and field is empty
  useEffect(() => {
    if (hsCodes && hsCodes.length > 0 && !value && itemId) {
      onChange(hsCodes[0]);
    }
  }, [hsCodes, itemId]);

  return (
    <div className="relative group">
      <input
        list={itemId ? `hs-codes-sales-${itemId}` : undefined}
        className="w-full h-10 border border-slate-200/60 dark:border-slate-700/40 rounded-md px-2 py-1 bg-white dark:bg-slate-900 text-xs text-center"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HS Code"
      />
      {itemId && (
        <datalist id={`hs-codes-sales-${itemId}`}>
          {hsCodes?.map((code: string) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      )}
    </div>
  );
}


const fetcher = (url: string) => api.get(url).then((res) => res.data);

/** Hydrate inline incentive inputs from GET invoice (tolerant of alternate API shapes) */
function parseIncentiveAmountsFromInvoicePayload(data: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!data || typeof data !== "object") return out;
  const d = data as Record<string, unknown>;
  const raw =
    d.sales_person_incentive_amounts ??
    d.sales_person_incentive_overrides ??
    d.sales_incentive_amounts ??
    d.incentives;
  if (!Array.isArray(raw)) return out;
  for (const entry of raw as Record<string, unknown>[]) {
    const sid = entry?.sales_person_id ?? entry?.sales_personId;
    const amt = entry?.incentive_amount ?? entry?.amount;
    const isManual = entry?.is_manual ?? entry?.isManual;
    const postMethod = entry?.post_method ?? entry?.postMethod;
    
    if (sid == null || amt == null) continue;
    const n = Number(amt);
    if (!Number.isFinite(n)) continue;
    
    // Only populate if it was specifically a manual override or if it came from stored incentives
    // In fact, always populating ensures the EXACT stored amount is visible in the UI during edit.
    if (isManual === true || postMethod === "Manual Override" || postMethod === "Manual") {
      out[String(sid)] = n.toFixed(2);
    }
  }
  return out;
}

/**
 * Rebuild header comma-separated sales person ids after GET.
 * The API persists a single numeric `sales_person_id` (primary); additional selections
 * are recovered from `sales_person_incentive_amounts` when present, or from optional
 * `sales_person_ids` / CSV string shapes if the backend sends them.
 */
function headerSalesPersonCsvFromInvoicePayload(inv: Record<string, unknown> | null | undefined): string {
  if (!inv || typeof inv !== "object") return "";
  const ordered: string[] = [];
  const seen = new Set<string>();
  const pushUnique = (raw: string) => {
    const id = raw.trim();
    if (!id || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
  };

  const rawHeader = inv.sales_person_id;
  if (rawHeader != null && rawHeader !== "") {
    if (typeof rawHeader === "string") {
      for (const id of parseSalesPersonIds(rawHeader)) pushUnique(id);
    } else {
      pushUnique(String(rawHeader));
    }
  }

  const idsField = inv.sales_person_ids;
  if (Array.isArray(idsField)) {
    for (const x of idsField) pushUnique(String(x));
  }

  const rawInc =
    inv.sales_person_incentive_amounts ??
    inv.sales_person_incentive_overrides ??
    inv.sales_incentive_amounts ??
    inv.incentives;
  if (Array.isArray(rawInc)) {
    for (const entry of rawInc as Record<string, unknown>[]) {
      const sid = entry?.sales_person_id ?? entry?.sales_personId;
      if (sid != null) pushUnique(String(sid));
    }
  }

  return ordered.join(",");
}

function lineSalesPersonCsvFromApi(line: Record<string, unknown> | null | undefined): string {
  if (!line || typeof line !== "object") return "";
  const idsField = line.sales_person_ids;
  if (Array.isArray(idsField) && idsField.length > 0) {
    return formatSalesPersonIdsFromList(idsField.map(String));
  }
  const sp = line.sales_person_id;
  if (sp != null && sp !== "") {
    if (typeof sp === "string") {
      const ids = parseSalesPersonIds(sp);
      if (ids.length > 1) return ids.join(",");
      if (ids.length === 1) return ids[0];
      return "";
    }
    return String(sp);
  }
  return "";
}

/** Sentinel for SearchableSelect — opens quick-create; never stored as sales_person id */
const SALES_PERSON_QUICK_CREATE_VALUE = "__sales_person_quick_create__";

/** Native <select> first row — sentinel opens QuickSalesPersonModal (state must not persist this value) */
const SALES_PERSON_SELECT_PLACEHOLDER = "Choose sales person…";

const extractErrorMessage = (detail: any, fallback: string): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? (d as any).msg : JSON.stringify(d)))
      .filter(Boolean);
    if (msgs.length > 0) return msgs.join(", ");
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      // ignore
    }
  }
  return fallback;
};

type Ledger = {
  id: number;
  company_id: number;
  group_id: number;
  name: string;
  code: string | null;
};

const SALES_LEDGER_GROUP_IDS: number[] = [248];
const OUTPUT_TAX_LEDGER_GROUP_IDS: number[] = [72];
 
type DutyTax = {
  id: number;
  name: string;
  rate: number;
  purchase_rate: number | null;
  income_rate: number | null;
  tds_type: string | null;
  ledger_id: number;
};

function useLedgers(companyId: string | undefined, groupIds: number[]): Ledger[] {
  const query = groupIds.length ? `?group_ids=${groupIds.join(",")}` : "";
  const { data } = useSWR<Ledger[]>(
    companyId ? `/companies/${companyId}/ledgers${query}` : null,
    fetcher
  );
  return data ?? [];
}

type Warehouse = {
  id: number;
  name: string;
};

type InvoiceLine = {
  item_id: string;
  quantity: string;
  rate: string;
  discount: string;
  tax_rate: string;
  duty_tax_id?: string;
  selected_unit_code?: string | null;
  units?: ItemUnitRead[];
  warehouse_id?: string;
  /** Comma-separated sales person ids; API stores the first id only */
  sales_person_id?: string;
  department_id?: string;
  project_id?: string;
  segment_id?: string;
  ref_no?: string;
  hs_code?: string;
  remarks?: string;
};

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

type InventoryValuationMethod = "AVERAGE" | "FIFO";

type Company = {
  id: number;
  name: string;
  inventory_valuation_method?: InventoryValuationMethod;
  cost_center_mode?: null | "single" | "double" | "triple";
  cost_center_single_dimension?: "department" | "project" | "segment" | null;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
  calendar_mode?: "AD" | "BS";
};


function EffectiveCostHint({
  companyId,
  itemId,
  warehouseId,
  dateParam,
  valuationMethod,
}: {
  companyId: number;
  itemId: number;
  warehouseId: number;
  dateParam: string;
  valuationMethod: InventoryValuationMethod;
}) {
  const { data, error } = useSWR<number | null>(
    companyId && itemId && warehouseId && dateParam
      ? ["effective-rate", companyId, itemId, warehouseId, dateParam]
      : null,
    () => getEffectiveItemRate(companyId, itemId, warehouseId, dateParam)
  );

  if (error) {
    return (
      <div className="mt-0.5 text-[10px] text-slate-500">
        Cost rate ({valuationMethod}): -
      </div>
    );
  }

  if (data == null) {
    return (
      <div className="mt-0.5 text-[10px] text-slate-500">
        Cost rate ({valuationMethod}): -
      </div>
    );
  }

  return (
    <div className="mt-0.5 text-[10px] text-slate-500">
      Cost rate ({valuationMethod}): {Number(data).toFixed(2)}
    </div>
  );
}

// ── Customer Balance Badge ────────────────────────────────────────────────
function CustomerBalanceBadge({ companyId, customerId }: { companyId: string; customerId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { report, isLoading } = useCustomerStatement(
    companyId || undefined,
    customerId || undefined,
    "2000-01-01",
    today,
    { suppressForbidden: true },
  );

  if (!customerId) return null;

  if (isLoading) {
    return (
      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400">
        <span className="inline-flex h-3 w-3 animate-spin rounded-full border border-slate-300 border-t-transparent" />
        Loading balance…
      </div>
    );
  }

  if (!report) return null;

  const balance = report.closing_balance ?? 0;
  // Positive = customer owes us (receivable — normal after sales)
  // Negative = customer has advance / overpaid
  const isReceivable = balance > 0;
  const isAdvance = balance < 0;
  const absBalance = Math.abs(balance).toFixed(2);

  const colorClass = isReceivable
    ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-300"
    : isAdvance
      ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700/40 dark:text-emerald-300"
      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400";

  const label = isReceivable ? "Receivable (Owes us)" : isAdvance ? "Advance (Credit)" : "Settled";

  return (
    <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium ${colorClass}`}>
      {isReceivable ? (
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
        </svg>
      ) : isAdvance ? (
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-7a1 1 0 012 0v3a1 1 0 11-2 0v-3zm1-5a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
        </svg>
      )}
      <span>{label}:</span>
      <span className="font-semibold">{absBalance}</span>
    </div>
  );
}

export default function SalesInvoicesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { data: currentUser } = useSWR(
    companyId ? "/auth/me" : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const userRoleLower = (currentUser?.role ? String(currentUser.role) : "").toLowerCase();
  const isAdminLike = userRoleLower && userRoleLower !== "user";
  const selfSalesPersonId: string =
    currentUser?.sales_person_id != null
      ? String(currentUser.sales_person_id)
      : currentUser?.employee_id != null
        ? String(currentUser.employee_id)
        : "";

  const { canRead, canUpdate } = useMenuAccess("sales.invoice.list");

  const { showToast } = useToast();
  const { data: invoices, mutate } = useSWR(
    companyId ? `/sales/companies/${companyId}/invoices` : null,
    fetcher
  );
  const { data: customers, mutate: mutateCustomers } = useSWR(
    companyId ? `/sales/companies/${companyId}/customers` : null,
    fetcher
  );
  const { data: items, mutate: mutateItems } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<any[] | null>(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(`/companies/${companyId}/sales/invoices/export-template`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'sales_invoice_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download template');
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setSubmitting(true);
      const res = await api.post(`/companies/${companyId}/sales/invoices/parse-excel`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setImportPreview(res.data);
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(error?.response?.data?.detail || 'Failed to upload Excel');
    } finally {
      setSubmitting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirmImport = async () => {
    if (!importPreview) return;
    try {
      setSubmitting(true);
      const res = await api.post(`/companies/${companyId}/sales/invoices/confirm-import`, importPreview);
      alert(res.data.detail);
      setImportPreview(null);
      mutate();
    } catch (error: any) {
      console.error('Import confirmation error:', error);
      alert(error?.response?.data?.detail || 'Failed to confirm import');
    } finally {
      setSubmitting(false);
    }
  };

  const valuationMethod: InventoryValuationMethod =
    company?.inventory_valuation_method ?? "AVERAGE";

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const { data: salesPersons, mutate: mutateSalesPersons } = useSWR(
    companyId ? `/companies/${companyId}/sales-persons?is_active=true` : null,
    fetcher
  );

  const { data: incentiveRules = [] } = useSWR<IncentiveRulePreview[]>(
    companyId ? `/companies/${companyId}/setup/incentives` : null,
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

  const { data: segments, mutate: mutateSegments } = useSWR(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );

  const { mutate: mutateDepartments } = useSWR(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const { mutate: mutateProjects } = useSWR(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );
 
  const { data: dutyTaxes } = useSWR<DutyTax[]>(
    companyId ? `/companies/${companyId}/duty-taxes` : null,
    fetcher
  );

  // Check if Multi Branch (both department and project) is enabled based on cost center settings
  const costCenterMode = company?.cost_center_mode || null;
  const costCenterDimension = company?.cost_center_single_dimension || null;
  const isMultiBranchEnabled = costCenterMode === "double" || costCenterMode === "triple";

  // Header ledgers (sales/output tax) are handled by backend defaults; no dedicated fetch required here.

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { calendarMode, displayMode, isLoading: isCalendarSettingsLoading } = useCalendarSettings();
  const [calendarDisplayMode, setDisplayMode] = useState<"AD" | "BS">(
    () => {
      const stored = readCalendarDisplayMode(cc?.id ? String(cc.id) : '', initMode);
      return (stored === 'BOTH' ? initMode : stored) as "AD" | "BS";
    }
  );
  const isBS = calendarDisplayMode === "BS";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Sync displayMode from CalendarSettingsContext once settings are loaded
  const calendarSyncRef = useRef(false);
  useEffect(() => {
    if (!isCalendarSettingsLoading && calendarMode && !calendarSyncRef.current) {
      const stored = readCalendarDisplayMode(companyId, calendarMode);
      setDisplayMode((stored === 'BOTH' ? calendarMode : stored) as "AD" | "BS");
      calendarSyncRef.current = true;
    }
  }, [isCalendarSettingsLoading, calendarMode, companyId]);

  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(smartTo);
  const [billDate, setBillDate] = useState(smartTo);
  const [dueDate, setDueDate] = useState(smartTo);

  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [salesPersonId, setSalesPersonId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [customReference, setCustomReference] = useState("");
  const [narration, setNarration] = useState("");
  const [paymentModeId, setPaymentModeId] = useState<string>("");
  const [lines, setLines] = useState<InvoiceLine[]>([
    { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", selected_unit_code: null, units: [], warehouse_id: "", sales_person_id: "", hs_code: "", department_id: "", project_id: "", segment_id: "", ref_no: "", remarks: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [originalDate, setOriginalDate] = useState<string | null>(null);
  const [isBankModeSelected, setIsBankModeSelected] = useState(false);
  const [isCashModeSelected, setIsCashModeSelected] = useState(false);
  const [selectedBankLedgerId, setSelectedBankLedgerId] = useState<string>('');
  const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
  const [bankRemark, setBankRemark] = useState('');
  const [applyTds, setApplyTds] = useState(false);

  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: ledgerGroups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  // Fetch company defaults to resolve the default sales ledger for new invoices
  const { data: companyDefaults } = useSWR(
    companyId ? `company:${companyId}:item-ledger-defaults` : null,
    () => getItemLedgerDefaults(companyId)
  );

  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintSearch, setReprintSearch] = useState("");
  const [notifyingId, setNotifyingId] = useState<number | null>(null);
  const [createdInvoiceInfo, setCreatedInvoiceInfo] = useState<{ id: number; reference: string } | null>(null);

  const handleManualNotify = async (id: number) => {
    if (!companyId) return;
    setNotifyingId(id);
    try {
      await api.post(`/companies/${companyId}/notifications/manual`, {
        type: 'order_placed',
        id: id
      });
      alert('Order confirmation notification sent successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to send notification');
    } finally {
      setNotifyingId(null);
    }
  };

  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);

  // Service invoice and cost center state
  const [invoiceType, setInvoiceType] = useState<"PRODUCT" | "SERVICE">("PRODUCT");
  const [salesType, setSalesType] = useState<"LOCAL" | "IMPORT">("LOCAL");
  const [showInvNo, setShowInvNo] = useState(false);
  const [showDepartment, setShowDepartment] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showSegment, setShowSegment] = useState(false);
  /** Invoice wise: sales person in customer row; Product wise: per line only */
  const [salesPersonColumnMode, setSalesPersonColumnMode] = useState<"invoice" | "product">("invoice");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [segmentId, setSegmentId] = useState("");

  const [manualTdsAmount, setManualTdsAmount] = useState<string>("");
  /** Per sales person id: edited incentive string; omitted key means use calculated preview */
  const [incentiveManualBySp, setIncentiveManualBySp] = useState<Record<string, string>>({});
  /** Show invoice form by default so header/line fields (e.g. Sales Person search) are not missed */
  const [formVisible, setFormVisible] = useState(false);

  const saveDraft = useCallback(() => {
    const draft = {
      customerId, date, dueDate, dueDateTouched, salesPersonId, reference,
      customReference, narration, paymentModeId, lines, invoiceType,
      showInvNo,
      showDepartment, showProject, showSegment, departmentId, projectId, segmentId,
      isBankModeSelected, isCashModeSelected, selectedBankLedgerId, bankRemark,
      editingId, originalDate, salesType, incentiveManualBySp, salesPersonColumnMode
    };
    if (!companyId) return;
    saveFormDraft(`sales_invoice_${companyId}`, draft);
  }, [customerId, date, dueDate, dueDateTouched, salesPersonId, reference, customReference, narration, paymentModeId, lines, invoiceType, showInvNo, showDepartment, showProject, showSegment, departmentId, projectId, segmentId, isBankModeSelected, isCashModeSelected, selectedBankLedgerId, bankRemark, editingId, originalDate, companyId, pathname, salesType, incentiveManualBySp, salesPersonColumnMode]);

  const [isCreateCustomerModalOpen, setIsCreateCustomerModalOpen] = useState(false);
  const [createCustomerName, setCreateCustomerName] = useState("");
  const [activeImportBillIdForCustomer, setActiveImportBillIdForCustomer] = useState<number | null>(null);

  const [isCreateItemModalOpen, setIsCreateItemModalOpen] = useState(false);
  const [createItemName, setCreateItemName] = useState("");
  const [activeImportBillIdForItem, setActiveImportBillIdForItem] = useState<number | null>(null);
  const [activeImportLineIdx, setActiveImportLineIdx] = useState<number | null>(null);

  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [isQuickItemModalOpen, setIsQuickItemModalOpen] = useState(false);
  const [pendingItemLineIdx, setPendingItemLineIdx] = useState<number | null>(null);

  // Quick cost center creation state
  const [isQuickDeptModalOpen, setIsQuickDeptModalOpen] = useState(false);
  const [isQuickProjModalOpen, setIsQuickProjModalOpen] = useState(false);
  const [isQuickSegModalOpen, setIsQuickSegModalOpen] = useState(false);
  const [isQuickSalesPersonModalOpen, setIsQuickSalesPersonModalOpen] = useState(false);
  const [pendingSalesPersonAction, setPendingSalesPersonAction] = useState<{ lineIdx: number | 'header'; billId?: number } | null>(null);
  const [pendingCostCenterAction, setPendingCostCenterAction] = useState<{ type: 'dept' | 'proj' | 'seg', lineIdx: number | 'header' } | null>(null);

  const salesPersonSearchRows: Option[] = useMemo(
    () =>
      (salesPersons || []).map((sp: { id: number; name: string }) => ({
        value: String(sp.id),
        label: sp.name,
        sublabel: `ID ${sp.id}`,
      })),
    [salesPersons]
  );

  const handleCreateCustomerOnFly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createCustomerName.trim()) return;
    try {
      setSubmitting(true);
      const res = await api.post(`/sales/companies/${companyId}/customers`, {
        name: createCustomerName,
        is_active: true
      });
      const newCustomer = res.data;
      globalMutate(companyId ? `/sales/companies/${companyId}/customers` : null);
      
      if (importPreview && activeImportBillIdForCustomer !== null) {
        setImportPreview(prev => prev ? prev.map(inv => {
          if (inv.id === activeImportBillIdForCustomer) {
            return {
              ...inv,
              customer_id: newCustomer.id,
              customer_name: newCustomer.name,
              errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("customer") || !e.toLowerCase().includes("not found"))
            };
          }
          return inv;
        }) : null);
      }
      setIsCreateCustomerModalOpen(false);
      setCreateCustomerName("");
      setActiveImportBillIdForCustomer(null);
      showToast({
        title: "Customer created and linked successfully",
        variant: "success",
      });
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to create customer");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateItemOnFly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!createItemName.trim()) return;
    try {
      setSubmitting(true);
      const res = await api.post(`/inventory/companies/${companyId}/items`, {
        name: createItemName,
        is_active: true,
        category: "Product"
      });
      const newItem = res.data;
      globalMutate(companyId ? `/inventory/companies/${companyId}/items` : null);
      
      if (importPreview && activeImportBillIdForItem !== null && activeImportLineIdx !== null) {
        setImportPreview(prev => prev ? prev.map(inv => {
          if (inv.id === activeImportBillIdForItem) {
            const newLines = [...(inv.lines || [])];
            if (newLines[activeImportLineIdx]) {
              newLines[activeImportLineIdx] = {
                ...newLines[activeImportLineIdx],
                item_id: newItem.id,
                item_name: newItem.name,
                item_suggestions: []
              };
            }
            return {
              ...inv,
              lines: newLines,
              errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("item") || !e.toLowerCase().includes("not found"))
            };
          }
          return inv;
        }) : null);
      }
      setIsCreateItemModalOpen(false);
      setCreateItemName("");
      setActiveImportBillIdForItem(null);
      setActiveImportLineIdx(null);
      showToast({
        title: "Item created and linked successfully",
        variant: "success",
      });
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to create item");
    } finally {
      setSubmitting(false);
    }
  };
  const editIdStr = searchParams.get('edit');

  useEffect(() => {
    if (editIdStr && companyId && items && customers && warehouses) {
      api.get(`/sales/companies/${companyId}/invoices/${editIdStr}`)
        .then(res => {
          if (res.data) {
            // Manually set all fields instead of calling startEdit to avoid dependency issues
            if (res.data.sales_type) setSalesType(res.data.sales_type);
            setEditingId(res.data.id);
            setFormVisible(true);
            setCustomerId(res.data.customer_id ? String(res.data.customer_id) : "");
            setDate(res.data.date || "");
            setBillDate(res.data.bill_date || res.data.date || "");
            setDueDate(res.data.due_date || res.data.date || "");
            setDueDateTouched(true);
            const apiHeaderSp = headerSalesPersonCsvFromInvoicePayload(res.data as Record<string, unknown>);
            const baseLineRows = res.data.lines.map((l: any) => ({
              item_id: String(l.item_id),
              quantity: String(l.quantity ?? ""),
              rate: String(l.rate ?? ""),
              discount: String(l.discount ?? "0"),
              tax_rate: String(l.tax_rate ?? ""),
              duty_tax_id: l.duty_tax_id != null ? String(l.duty_tax_id) : "",
              selected_unit_code: null,
              units: [],
              warehouse_id: l.warehouse_id != null ? String(l.warehouse_id) : "",
              sales_person_id: lineSalesPersonCsvFromApi(l as Record<string, unknown>),
              department_id: l.department_id != null ? String(l.department_id) : (res.data.department_id ? String(res.data.department_id) : ""),
              project_id: l.project_id != null ? String(l.project_id) : (res.data.project_id ? String(res.data.project_id) : ""),
              segment_id: l.segment_id != null ? String(l.segment_id) : (res.data.segment_id ? String(res.data.segment_id) : ""),
              ref_no: l.ref_no || "",
              remarks: l.remarks || "",
            }));
            const spMerged = mergeInvoiceSalesPersonStateFromCache(
              companyId,
              res.data.id,
              apiHeaderSp,
              baseLineRows
            );
            if (spMerged.salesPersonColumnMode != null) {
              setSalesPersonColumnMode(spMerged.salesPersonColumnMode);
            }
            setSalesPersonId(spMerged.header);
            setLines(spMerged.lines);
            setIncentiveManualBySp(spMerged.manuals || {});
            setOriginalDate(res.data.date || null);
            setReference(res.data.reference || "");
            setCustomReference(res.data.custom_reference || "");
            setNarration(res.data.narration || "");
            setBankRemark(res.data.bank_remark || "");
            setPaymentModeId(res.data.payment_mode_id != null ? String(res.data.payment_mode_id) : "");
            setSelectedBankLedgerId(res.data.ledger_id ? String(res.data.ledger_id) : "");
            setApplyTds(!!res.data.apply_tds);
            setManualTdsAmount(res.data.tds_amount != null ? String(res.data.tds_amount) : "");
            setDepartmentId(res.data.department_id != null ? String(res.data.department_id) : (res.data.lines && res.data.lines[0]?.department_id != null ? String(res.data.lines[0].department_id) : ""));

            // Load cost center fields and detect invoice type
            const hasDepartment = res.data.department_id || (res.data.lines && res.data.lines.some((l: any) => l.department_id));
            const hasProject = res.data.project_id || (res.data.lines && res.data.lines.some((l: any) => l.project_id));
            const hasSegment = res.data.segment_id || (res.data.lines && res.data.lines.some((l: any) => l.segment_id));

            setInvoiceType(res.data.invoice_type === "SERVICE" ? "SERVICE" : "PRODUCT");
            if (hasDepartment) setShowDepartment(true);
            if (hasProject) setShowProject(true);
            if (hasSegment) setShowSegment(true);
            if (res.data.reference) setShowInvNo(true);
            setProjectId(res.data.project_id != null ? String(res.data.project_id) : (res.data.lines && res.data.lines[0]?.project_id != null ? String(res.data.lines[0].project_id) : ""));
            setSegmentId(res.data.segment_id != null ? String(res.data.segment_id) : (res.data.lines && res.data.lines[0]?.segment_id != null ? String(res.data.lines[0].segment_id) : ""));

            setLines(spMerged.lines);
            setIncentiveManualBySp(parseIncentiveAmountsFromInvoicePayload(res.data));
            // Scroll to top to show the edit form
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        })
        .catch(err => {
          const errorMsg = err?.response?.data?.detail || err.message || "Unknown error";
          setSubmitError(`Failed to load the invoice: ${errorMsg}`);
        });
    }
  }, [editIdStr, companyId, items, customers, warehouses]);

  // Restore draft when returning from creation
  useEffect(() => {
    if (searchParams.get('returning') === 'true' && companyId) {
      const draft = loadFormDraft(`sales_invoice_${companyId}`);
      if (draft) {
        setCustomerId(draft.customerId);
        setDate(draft.date);
        setDueDate(draft.dueDate);
        setDueDateTouched(draft.dueDateTouched);
        setSalesPersonId(draft.salesPersonId);
        setReference(draft.reference);
        setCustomReference(draft.customReference);
        setNarration(draft.narration);
        setPaymentModeId(draft.paymentModeId);
        setLines(draft.lines);
        setInvoiceType(draft.invoiceType);
        setShowInvNo(draft.showInvNo ?? false);
        setShowDepartment(draft.showDepartment);
        setShowProject(draft.showProject);
        setShowSegment(draft.showSegment);
        setDepartmentId(draft.departmentId);
        setProjectId(draft.projectId);
        setSegmentId(draft.segmentId);
        setIsBankModeSelected(draft.isBankModeSelected);
        setIsCashModeSelected(draft.isCashModeSelected);
        setSelectedBankLedgerId(draft.selectedBankLedgerId);
        setBankRemark(draft.bankRemark);
        setEditingId(draft.editingId);
        setOriginalDate(draft.originalDate);
        setFormVisible(true);
        setIncentiveManualBySp(
          draft.incentiveManualBySp && typeof draft.incentiveManualBySp === "object"
            ? draft.incentiveManualBySp
            : {}
        );
        if (draft.salesPersonColumnMode === "invoice" || draft.salesPersonColumnMode === "product") {
          setSalesPersonColumnMode(draft.salesPersonColumnMode);
        }

        const newId = searchParams.get('newId');
        const type = searchParams.get('type');
        if (newId) {
          if (!type || type === 'CUSTOMER') {
            setCustomerId(newId);
          } else if (type === 'ITEM') {
            const lineIdx = searchParams.get('itemLineIndex');
            if (lineIdx !== null) {
              const idx = parseInt(lineIdx, 10);
              setLines(prev => {
                const next = [...prev];
                if (next[idx]) {
                  next[idx] = { ...next[idx], item_id: newId };
                }
                return next;
              });
            }
          }
        }
        clearFormDraft(`sales_invoice_${companyId}`);
      }
    }
  }, [searchParams, companyId]);

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

  // Mode Detection
  useEffect(() => {
    const mode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
    if (mode) {
      const name = mode.name.toLowerCase();
      const isBank = name.includes('bank');
      const isCash = name.includes('cash');
      setIsBankModeSelected(isBank);
      setIsCashModeSelected(isCash);

      // Automatically select ledger if there is only one in the group
      if (isBank || isCash) {
        let modeLedgers: any[] = [];
        const ledgerList = Array.isArray(ledgers) ? ledgers : (ledgers as any)?.results || [];

        if (mode.ledger_group_id) {
          modeLedgers = ledgerList.filter((l: any) => l.group_id === mode.ledger_group_id);
        } else if (ledgerGroups) {
          const matchingGroups = (ledgerGroups as any[]).filter((g: any) => {
            const gn = g.name.toLowerCase();
            return gn.includes('bank') || gn.includes('cash');
          }).map((g: any) => g.id);
          modeLedgers = ledgerList.filter((l: any) => matchingGroups.includes(l.group_id));
        }

        if (modeLedgers.length === 1) {
          setSelectedBankLedgerId(String(modeLedgers[0].id));
        }
      } else {
        setSelectedBankLedgerId('');
      }
    } else {
      setIsBankModeSelected(false);
      setIsCashModeSelected(false);
      setSelectedBankLedgerId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentModeId, paymentModes, ledgers, ledgerGroups]);

  // Fetch Balance
  useEffect(() => {
    let ledgerIdToFetch = '';
    if ((isBankModeSelected || isCashModeSelected) && selectedBankLedgerId) {
      ledgerIdToFetch = selectedBankLedgerId;
    }

    if (ledgerIdToFetch && companyId) {
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
  }, [isBankModeSelected, isCashModeSelected, selectedBankLedgerId, companyId, today]);

  // Header ledgers are now fully handled by backend defaults; no UI state needed here.

  // Compute the effective sales ledger to display in the Invoice Header.
  // Sales invoices don't store sales_ledger_name on the list endpoint, so we always
  // show the company's default sales ledger as the expected booking ledger.
  const effectiveSalesLedger = useMemo(() => {
    if (companyDefaults?.sales_ledger_id && ledgers) {
      const defaultLedger = (ledgers as any[]).find(
        (l: any) => l.id === companyDefaults.sales_ledger_id
      );
      if (defaultLedger) {
        return { name: defaultLedger.name as string, id: companyDefaults.sales_ledger_id };
      }
    }
    return null;
  }, [companyDefaults, ledgers]);

  useEffect(() => {
    const itemIdParam = searchParams.get("item_id");
    if (!itemIdParam || editingId) return;

    setFormVisible(true);
    setLines((prev) => {
      const copy = [...prev];
      if (!copy.length) {
        copy.push({
          item_id: "",
          quantity: "1",
          rate: "",
          discount: "0",
          tax_rate: "",
          selected_unit_code: null,
          units: [],
          warehouse_id: "",
          sales_person_id: "",
          department_id: "",
          project_id: "",
          segment_id: "",
          ref_no: "",
          remarks: "",
          duty_tax_id: "",
        });
      }
      return copy;
    });

    handleItemChange(0, itemIdParam);
  }, [searchParams, editingId]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxableTotal = 0;
    let nonTaxableTotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    for (const l of lines) {
      const qtyUi = Number(l.quantity || "0");
      const rateUi = Number(l.rate || "0");
      const disc = Number(l.discount || "0");
      discountTotal += disc;
      const taxRate = Number(l.tax_rate || "0");
      const lineBase = qtyUi * rateUi - disc;
      const lineTax = (lineBase * taxRate) / 100;
      
      subtotal += (lineBase + lineTax);
      taxTotal += lineTax;

      if (taxRate > 0) {
        taxableTotal += lineBase;
      } else {
        nonTaxableTotal += lineBase;
      }
    }

    let tdsAmount = 0;
    let calculatedTdsAmount = 0;
    if (applyTds && dutyTaxes && items) {
      for (const l of lines) {
        if (!l.item_id) continue;
        const item = (items as any[]).find((i: any) => String(i.id) === l.item_id);
        const category = (item?.category || "").toLowerCase();
        
        const qty = Number(l.quantity || 0);
        const rate = Number(l.rate || 0);
        const disc = Number(l.discount || 0);
        const base = qty * rate - disc;
        
        // 1. Try matching category directly to TDS Type (e.g. category 'Rent' matches TDS type 'rent')
        let matchingTds = dutyTaxes.find(t => t.tds_type?.toLowerCase() === category);
        
        if (!matchingTds) {
          // 2. Fallback based on typical classifications
          if (category === "service" || item?.allow_negative_stock === true) {
            matchingTds = dutyTaxes.find(t => t.tds_type?.toLowerCase() === "service");
          } else {
            // Treat anything else (Electronics, Hardware, etc.) as "goods" for TDS
            matchingTds = dutyTaxes.find(t => t.tds_type?.toLowerCase() === "goods");
          }
        }
        
        if (matchingTds) {
          const tdsRate = matchingTds.income_rate ?? 0;
          calculatedTdsAmount += (base * tdsRate / 100);
        }
      }
      
      if (manualTdsAmount !== "" && !isNaN(Number(manualTdsAmount))) {
        tdsAmount = Number(manualTdsAmount);
      } else {
        tdsAmount = calculatedTdsAmount;
      }
    }

    return { subtotal, taxableTotal, nonTaxableTotal, taxTotal, discountTotal, calculatedTdsAmount, tdsAmount, grandTotal: subtotal - tdsAmount };
  }, [lines, applyTds, dutyTaxes, items, manualTdsAmount]);

  const showSalesPersonPerLine =
    (invoiceType === "SERVICE" || invoiceType === "PRODUCT") && salesPersonColumnMode === "product";
  const showSalesPersonInCustomerRow =
    (invoiceType === "SERVICE" || invoiceType === "PRODUCT") && salesPersonColumnMode === "invoice";
  /** Invoice mode: header selection drives preview; product mode: lines only (no header picker). */
  const incentiveHeaderCsv = salesPersonColumnMode === "invoice" ? salesPersonId : "";
  const footerTrailingColSpan = showSalesPersonPerLine ? 3 : 2;

  const incentiveSpKey = useMemo(
    () => salesPersonSelectionKey(lines, incentiveHeaderCsv),
    [lines, incentiveHeaderCsv]
  );

  const salesPersonNameByIdForIncentives = useMemo(() => {
    const m = new Map<number, string>();
    for (const sp of salesPersons || []) {
      const s = sp as { id: number; name?: string; full_name?: string };
      const nm = String(s.full_name || s.name || "").trim();
      m.set(s.id, nm || `Person #${s.id}`);
    }
    return m;
  }, [salesPersons]);

  useEffect(() => {
    const allowed = new Set(
      incentiveSpKey.split(",").map((s) => s.trim()).filter(Boolean)
    );
    setIncentiveManualBySp((prev) => {
      if (Object.keys(prev).length === 0) return prev;
      const next: Record<string, string> = { ...prev };
      for (const k of Object.keys(next)) {
        if (!allowed.has(k)) delete next[k];
      }
      return next;
    });
  }, [incentiveSpKey]);

  const incentivePreviews = useMemo(
    () =>
      computeInvoiceIncentivePreviews(
        lines,
        incentiveHeaderCsv,
        (salesPersons as { id: number; name?: string; full_name?: string }[]) || [],
        incentiveRules,
        {
          showDepartment,
          departmentId,
          showProject,
          projectId,
          showSegment,
          segmentId,
        }
      ),
    [
      lines,
      incentiveHeaderCsv,
      salesPersons,
      incentiveRules,
      showDepartment,
      departmentId,
      showProject,
      projectId,
      showSegment,
      segmentId,
    ]
  );

  const lineTotal = (line: InvoiceLine) => {
    const qtyUi = Number(line.quantity || "0");
    const rateUi = Number(line.rate || "0");
    const disc = Number(line.discount || "0");
    const taxRate = Number(line.tax_rate || "0");
    const base = qtyUi * rateUi - disc;
    const tax = (base * taxRate) / 100;
    return base + tax;
  };

  const getAvailableForLine = (line: InvoiceLine, map: Map<string, number>): number => {
    if (!line.item_id || !line.warehouse_id) return 0;
    const key = `${Number(line.item_id)}:${Number(line.warehouse_id)}`;
    return map.get(key) ?? 0;
  };

  const getTotalForItem = (itemId: number, map: Map<string, number>): number => {
    let total = 0;
    for (const [key, qty] of map.entries()) {
      const [idPart] = key.split(":");
      if (Number(idPart) === itemId) {
        total += qty;
      }
    }
    return total;
  };

  const refreshStock = useCallback(async () => {
    if (!companyId) return;

    try {
      setLoadingStock(true);
      setStockError(null);

      const todayStr = new Date().toISOString().slice(0, 10);
      const { data } = await api.get(`/inventory/companies/${companyId}/stock-summary?as_on_date=${todayStr}`);
      const results = Array.isArray(data) ? data : [];
      const map = new Map<string, number>();
      for (const r of results) {
        const key = `${r.item_id}:${r.warehouse_id || "null"}`;
        map.set(key, parseFloat(String(r.quantity_on_hand) || "0"));
      }
      setStockMap(map);
    } catch {
      setStockError("Failed to load stock availability.");
    } finally {
      setLoadingStock(false);
    }
  }, [companyId]);

  useEffect(() => {
    void refreshStock();
  }, [refreshStock]);

  const resetForm = () => {
    setEditingId(null);
    setCustomerId("");
    setDate(today);
    setBillDate(today);
    setDueDate(today);
    setDueDateTouched(false);
    setSalesPersonId("");
    setOriginalDate(null);
    setReference("");
    setCustomReference("");
    setNarration("");
    setPaymentModeId("");
    setBankRemark("");
    setLedgerBalance(null);
    setDepartmentId("");
    setProjectId("");
    setSegmentId("");
    setShowDepartment(false);
    setShowProject(false);
    setShowSegment(false);
    setSalesPersonColumnMode("product");
    setManualTdsAmount("");
    setIncentiveManualBySp({});
    setSalesType("LOCAL");
    setLines([{ item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", selected_unit_code: null, units: [], warehouse_id: "", sales_person_id: "", hs_code: "", department_id: "", project_id: "", segment_id: "", ref_no: "", remarks: "" }]);
    setSubmitError(null);
    setStockError(null);
  };

  const handleTransactionDateChange = (next: string) => {
    setDate(next);
    setOriginalDate((prev) => prev);
    if (!dueDateTouched && !paymentModeId) {
      setDueDate(next);
    }
  };

  const handleDateChangeAD = (val: string) => {
    handleTransactionDateChange(val);
  };

  const handleDateChangeBS = (bsVal: string) => {
    const ad = safeBSToAD(bsVal);
    if (ad) {
      handleTransactionDateChange(ad);
    }
  };

  useEffect(() => {
    if (!paymentModeId) {
      if (!dueDateTouched) {
        setDueDate(date);
      }
    }
  }, [paymentModeId, date, dueDateTouched]);

  const handleLineChange = (index: number, field: keyof InvoiceLine, value: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
  };

  const loadUnitsForLine = async (index: number, companyId: string, itemId: number) => {
    try {
      const res = await api.get<ItemUnitRead[]>(
        `/companies/${companyId}/items/${itemId}/units`
      );
      setLines((prev) => {
        const copy = [...prev];
        const base = res.data.find((u) => u.is_base);
        copy[index] = {
          ...copy[index],
          units: res.data,
          selected_unit_code: base?.unit_code ?? null,
        };
        return copy;
      });
    } catch {
      setLines((prev) => {
        const copy = [...prev];
        copy[index] = {
          ...copy[index],
          units: [],
          selected_unit_code: null,
        };
        return copy;
      });
    }
  };

  const handleItemChange = (index: number, itemId: string) => {
    const item = items?.find((i: any) => String(i.id) === itemId);
    const isService = item?.category?.toLowerCase() === "service";

    setLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        item_id: itemId,
        warehouse_id: isService ? "" : (copy[index].warehouse_id || ""),
        rate:
          copy[index].rate || (item?.default_sales_rate != null ? String(item.default_sales_rate) : ""),
        tax_rate:
          copy[index].tax_rate || (item?.default_tax_rate != null ? String(item.default_tax_rate) : ""),
        duty_tax_id:
          copy[index].duty_tax_id || (item?.duty_tax_id != null ? String(item.duty_tax_id) : ""),
      };
      return copy;
    });
    if (companyId && itemId) {
      loadUnitsForLine(index, companyId, Number(itemId));
    }
  };

  const handleUnitChange = (index: number, unitCode: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], selected_unit_code: unitCode };
      return copy;
    });
  };

  const handleWarehouseChange = (index: number, warehouseId: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], warehouse_id: warehouseId };
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", selected_unit_code: null, units: [], warehouse_id: "", sales_person_id: "", hs_code: "", department_id: "", project_id: "", ref_no: "", remarks: "" },
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length === 1) {
        return [
          { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", selected_unit_code: null, units: [], warehouse_id: "", sales_person_id: "", hs_code: "", department_id: "", project_id: "", ref_no: "", remarks: "" },
        ];
      }
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;

    if (showInvNo && (!reference || reference.trim() === "")) {
      setSubmitError("Bill No. is required when enabled.");
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    // Backdate warning
    const todayStr = new Date().toISOString().split('T')[0];
    if (date < todayStr) {
      if (typeof window !== "undefined") {
        const ok = window.confirm(
          `The transaction date (${date}) is a back date (before today, ${todayStr}). Do you want to proceed?`
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }
    }

    const stockViolations = lines.filter((l) => {
      if (!l.item_id || !l.warehouse_id) return false;
      const available = getAvailableForLine(l, stockMap);
      const requested = Number(l.quantity || "0");
      return requested > available;
    });

    let bypassStock = false;
    if (stockViolations.length > 0) {
      if (typeof window !== "undefined") {
        const ok = window.confirm(
          "Some invoice lines exceed available stock. Do you want to proceed with negative stock?"
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
        bypassStock = true;
      }
    }

    const validWarehouseIds = new Set(
      (warehouses || []).map((w) => String(w.id))
    );

    const basePayload: any = {
      customer_id: customerId ? Number(customerId) : null,
      invoice_type: invoiceType,
      sales_type: salesType,
      date,
      bill_date: billDate,
      due_date: paymentModeId
        ? null
        : dueDateTouched
          ? dueDate
            ? dueDate
            : null
          : date,
      sales_person_id:
        salesPersonColumnMode === "invoice"
          ? primarySalesPersonIdNum(salesPersonId)
          : (() => {
              for (const l of lines) {
                const p = primarySalesPersonIdNum(l.sales_person_id);
                if (p != null) return p;
              }
              return primarySalesPersonIdNum(salesPersonId);
            })(),
      reference: showInvNo ? (reference || null) : null,
      custom_reference: customReference || null,
      narration: narration || null,
      department_id: showDepartment && departmentId ? Number(departmentId) : null,
      project_id: showProject && projectId ? Number(projectId) : null,
      segment_id: showSegment && segmentId ? Number(segmentId) : null,
      apply_tds: applyTds,
      tds_amount: applyTds ? totals.tdsAmount : null,
      tds_ledger_id: (() => {
        // Resolve the TDS Receivable ledger: use the ledger_id from the first
        // applicable TDS DutyTax entry (the one that matched a line's item category).
        if (!applyTds || !dutyTaxes) return null;
        for (const l of lines) {
          if (!l.item_id) continue;
          const item = (items as any[])?.find((i: any) => String(i.id) === l.item_id);
          const category = (item?.category || "").toLowerCase();
          let matchingTds = dutyTaxes.find(t => t.tds_type?.toLowerCase() === category);
          if (!matchingTds) {
            if (category === "service" || item?.allow_negative_stock === true) {
              matchingTds = dutyTaxes.find(t => t.tds_type?.toLowerCase() === "service");
            } else {
              matchingTds = dutyTaxes.find(t => t.tds_type?.toLowerCase() === "goods");
            }
          }
          if (matchingTds?.ledger_id) return matchingTds.ledger_id;
        }
        return null;
      })(),
      bypass_stock_validation: bypassStock,
      lines: lines
        .filter((l) => l.item_id)
        .map((l) => {
          const units = l.units || [];
          const selected =
            units.find((u) => u.unit_code === l.selected_unit_code) ||
            units.find((u) => u.is_base);

          const qtyUi = Number(l.quantity || "0");
          const rateUi = Number(l.rate || "0");
          const { quantity, rate } = convertUiToBase(qtyUi, rateUi, selected);

          const warehouseIdStr = l.warehouse_id ? String(l.warehouse_id) : "";
          const warehouseId = validWarehouseIds.has(warehouseIdStr)
            ? Number(warehouseIdStr)
            : null;

          return {
            item_id: Number(l.item_id),
            quantity,
            rate,
            discount: Number(l.discount || "0"),
            tax_rate: Number(l.tax_rate || "0"),
            duty_tax_id: l.duty_tax_id ? Number(l.duty_tax_id) : null,
            hs_code: l.hs_code || null,
            warehouse_id: warehouseId,
            sales_person_id:
              salesPersonColumnMode === "invoice"
                ? primarySalesPersonIdNum(salesPersonId)
                : primarySalesPersonIdNum(l.sales_person_id),
            department_id: l.department_id ? Number(l.department_id) : (showDepartment && departmentId ? Number(departmentId) : null),
            project_id: l.project_id ? Number(l.project_id) : (showProject && projectId ? Number(projectId) : null),
            segment_id: l.segment_id ? Number(l.segment_id) : (showSegment && segmentId ? Number(segmentId) : null),
            ref_no: l.ref_no || null,
            remarks: l.remarks || null,
          };
        }),
      ...(incentivePreviews.length > 0
        ? {
            sales_person_incentive_amounts: incentivePreviews.map((row) => {
              const key = String(row.salesPersonId);
              const raw = incentiveManualBySp[key];
              let amt = row.calculatedIncentive;
              let isManual = false;
              if (raw !== undefined && String(raw).trim() !== "") {
                const n = Number(raw);
                if (Number.isFinite(n)) {
                  amt = n;
                  isManual = true;
                }
              }

              let postMethod = "Auto";
              if (isManual) {
                postMethod = "Manual";
              } else if (row.matchedRules.length > 0) {
                postMethod = "Auto";
              }

              return {
                sales_person_id: row.salesPersonId,
                incentive_amount: Math.round(amt * 100) / 100,
                is_manual: isManual,
                post_method: postMethod,
              };
            }),
          }
        : {}),
    };

    basePayload.payment_mode_id = paymentModeId || null;
    basePayload.bank_remark = bankRemark || null;
    if (isBankModeSelected && selectedBankLedgerId) {
      basePayload.payment_ledger_id = Number(selectedBankLedgerId);
    }

    try {
      if (editingId) {
        const updatePayload = buildSalesInvoicePayload(
          {
            ...basePayload,
            original_date: originalDate,
          },
          "update"
        );

        const response = await api.put(`/sales/companies/${companyId}/invoices/${editingId}`, updatePayload);

        saveSalesInvoiceSalesPersonCache(companyId, editingId, {
          salesPersonColumnMode,
          headerCsv: salesPersonId,
          lineCsvs: lines.map((l) => l.sales_person_id || ""),
          manuals: incentiveManualBySp,
        });

        showToast({
          title: "Invoice Updated",
          description: `Sales invoice #${editingId} has been successfully updated.`,
          variant: "success",
        });

        resetForm();
        setFormVisible(false);
        mutate();
        await refreshStock();
        await globalMutate(
          (key) =>
            typeof key === "string" &&
            (key.startsWith(`/inventory/companies/${companyId}/stock/`) || key.startsWith(`/inventory/companies/${companyId}/stock-summary`))
        );
        await invalidateAccountingReports(companyId);
      } else {
        const createPayload = buildSalesInvoicePayload(basePayload, "create");
        const res = await api.post(`/sales/companies/${companyId}/invoices`, createPayload);
        const created = res?.data;
        if (created && created.id) {
          saveSalesInvoiceSalesPersonCache(companyId, created.id, {
            salesPersonColumnMode,
            headerCsv: salesPersonId,
            lineCsvs: lines.map((l) => l.sales_person_id || ""),
            manuals: incentiveManualBySp,
          });
          setCreatedInvoiceInfo({
            id: created.id,
            reference: created.reference || String(created.id)
          });
          mutate();
          await refreshStock();
          await globalMutate(
            (key) =>
              typeof key === "string" &&
              (key.startsWith(`/inventory/companies/${companyId}/stock/`) || key.startsWith(`/inventory/companies/${companyId}/stock-summary`))
          );
          await invalidateAccountingReports(companyId);
          return;
        }
        resetForm();
        mutate();
        await refreshStock();
        await globalMutate(
          (key) =>
            typeof key === "string" &&
            (key.startsWith(`/inventory/companies/${companyId}/stock/`) || key.startsWith(`/inventory/companies/${companyId}/stock-summary`))
        );
        await invalidateAccountingReports(companyId);
      }
    } catch (err: any) {

      const detail = err?.response?.data?.detail;
      if (detail && detail.error === "INSUFFICIENT_STOCK" && detail.details) {
        const d = detail.details;
        const itemCode = d.item_code || `#${d.item_id}`;
        const itemName = d.item_name ? ` (${d.item_name})` : "";
        const warehouseName = d.warehouse_name || "selected warehouse";
        const required = d.required_quantity;
        const available = d.available_quantity;
        setSubmitError(
          `Insufficient stock for ${itemCode}${itemName} in ${warehouseName}. Required ${required}, available ${available}.`
        );
      } else {
        const errorMessage = extractErrorMessage(
          detail,
          editingId ? "Failed to update invoice" : "Failed to create invoice"
        );
        setSubmitError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };


  const startEdit = (inv: any) => {
    if (!canUpdate) return;
    setEditingId(inv.id);
    setCustomerId(inv.customer_id ? String(inv.customer_id) : "");
    setDate(inv.date || "");
    setDueDate(inv.due_date || inv.date || "");
    setDueDateTouched(true);
    const apiHeaderSpStart = headerSalesPersonCsvFromInvoicePayload(inv as Record<string, unknown>);
    setOriginalDate(inv.date || null);
    setReference(inv.reference || "");
    setCustomReference(inv.custom_reference || "");
    setNarration(inv.narration || "");
    setBankRemark(inv.bank_remark || "");
    const paymentModeIdValue = inv.payment_mode_id != null ? String(inv.payment_mode_id) : "";
    setPaymentModeId(paymentModeIdValue);
    setSalesType(inv.sales_type || "LOCAL");
    setSelectedBankLedgerId(inv.ledger_id ? String(inv.ledger_id) : "");
    setDepartmentId(inv.department_id != null ? String(inv.department_id) : (inv.lines && inv.lines[0]?.department_id != null ? String(inv.lines[0].department_id) : ""));
    setProjectId(inv.project_id != null ? String(inv.project_id) : (inv.lines && inv.lines[0]?.project_id != null ? String(inv.lines[0].project_id) : ""));
    const hasDepartment = inv.department_id || (inv.lines && inv.lines.some((l: any) => l.department_id));
    const hasProject = inv.project_id || (inv.lines && inv.lines.some((l: any) => l.project_id));
    setShowDepartment(!!hasDepartment);
    setShowProject(!!hasProject);
    if (inv.lines && Array.isArray(inv.lines) && inv.lines.length > 0) {
      const baseLinesStart = inv.lines.map((l: any) => ({
        item_id: String(l.item_id),
        quantity: String(l.quantity ?? ""),
        rate: String(l.rate ?? ""),
        discount: String(l.discount ?? "0"),
        tax_rate: String(l.tax_rate ?? ""),
        selected_unit_code: null,
        units: [],
        warehouse_id: l.warehouse_id != null ? String(l.warehouse_id) : "",
        sales_person_id: lineSalesPersonCsvFromApi(l as Record<string, unknown>),
        department_id: l.department_id != null ? String(l.department_id) : (inv.department_id ? String(inv.department_id) : ""),
        project_id: l.project_id != null ? String(l.project_id) : (inv.project_id ? String(inv.project_id) : ""),
        ref_no: l.ref_no || "",
        hs_code: l.hs_code || "",
        remarks: l.remarks || "",
      }));
      const spMergedStart = mergeInvoiceSalesPersonStateFromCache(
        companyId,
        inv.id,
        apiHeaderSpStart,
        baseLinesStart
      );
      if (spMergedStart.salesPersonColumnMode != null) {
        setSalesPersonColumnMode(spMergedStart.salesPersonColumnMode);
      }
      setSalesPersonId(spMergedStart.header);
      setLines(spMergedStart.lines);
      setIncentiveManualBySp(spMergedStart.manuals || {});
    } else {
      const spMergedEmpty = mergeInvoiceSalesPersonStateFromCache(companyId, inv.id, apiHeaderSpStart, []);
      if (spMergedEmpty.salesPersonColumnMode != null) {
        setSalesPersonColumnMode(spMergedEmpty.salesPersonColumnMode);
      }
      setSalesPersonId(spMergedEmpty.header);
      setIncentiveManualBySp(spMergedEmpty.manuals || {});
      setLines([
        {
          item_id: "",
          quantity: "1",
          rate: "",
          discount: "0",
          tax_rate: "",
          selected_unit_code: null,
          units: [],
          warehouse_id: "",
          sales_person_id: "",
          hs_code: "",
          department_id: "",
          project_id: "",
          ref_no: "",
          remarks: "",
        },
      ]);
    }
    setIncentiveManualBySp(parseIncentiveAmountsFromInvoicePayload(inv));
    setSubmitError(null);
  };

  const customerName = (id: number) => customers?.find((c: any) => c.id === id)?.name || "";





  if (!canRead) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Sales Invoices"
          subtitle="You do not have permission to view sales invoices for this company."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        {/* top accent line - emerald for sales */}
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">

          {/* Left: icon + text */}
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 15.75V18m-3-3V18m-3-3V18M3 21h18M3 10a1 1 0 011-1h16a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V10zm8.25-3.75V7.5m0 0H12m-.75 0H10.5M12 7.5h.75m-2.25 3h.008v.008H10.5V10.5zm0 2.25h.008v.008H10.5v-.008zm2.25-2.25h.008v.008H12.75V10.5zm0 2.25h.008v.008H12.75v-.008zm2.25-2.25h.008v.008H15V10.5zm0 2.25h.008v.008H15v-.008zm-9-2.25h.008v.008H6V10.5zm0 2.25h.008v.008H6v-.008zm2.25-2.25h.008v.008H8.25V10.5zm0 2.25h.008v.008H8.25v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Invoices</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Record and manage sales invoices · Payment modes auto-create receipt vouchers
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
                {Array.isArray(invoices) ? invoices.length : "—"}
              </span>
            </div>
            <div className="flex items-center gap-1 rounded-md border border-emerald-100 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20 px-2.5 py-1">
              <svg className="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400">
                {(invoices || []).reduce((sum: number, inv: any) => sum + invoiceTotal(inv), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {canUpdate && (
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
          {/* ── Toolbar / Header Row ── */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setFormVisible(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 
                text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              New Invoice
            </button>

            {formVisible && (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                  setFormVisible(false);
                  router.push(pathname);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 
                  text-rose-600 text-xs font-semibold border border-rose-200 transition-colors"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                Cancel
              </button>
            )}

            {formVisible && (
              <button
                form="invoice-form"
                type="submit"
                disabled={submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 
                  text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                {editingId ? "Update" : "Save"}
              </button>
            )}

            {/* Re-Print — always clickable, opens modal */}
            <button
              type="button"
              title="Re-Print an invoice"
              onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700
                text-white text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
              Re-Print
            </button>

            {/* Upload */}
            <button
              type="button"
              title="Upload Excel"
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 active:bg-blue-700
                text-white text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Upload
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".xlsx,.xls"
            />

            {/* Download */}
            <button
              type="button"
              title="Download Template"
              onClick={handleDownloadTemplate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-500 hover:bg-orange-600 active:bg-orange-700
                text-white text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Download
            </button>



            {/* right-side status label */}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 
                  text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                Exit
              </button>
              {editingId ? (
                <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50">
                  ✏ Editing Invoice #{editingId}
                </span>
              ) : formVisible ? (
                <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                  ✦ New Invoice
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                  No invoice open
                </span>
              )}
            </div>
          </div>

          {/* ── Card body ── */}
          <div className="px-4 pt-3 pb-4">
            {submitError && (
              <div className="mb-3 rounded border border-critical-500/40 bg-red-50 px-3 py-2 text-xs text-critical-600 dark:border-critical-500/70 dark:bg-red-950/40 dark:text-critical-500">
                {submitError}
              </div>
            )}
            {stockError && formVisible && (
              <div className="mb-3 rounded border border-warning-500/40 bg-amber-50 px-3 py-2 text-xs text-warning-500 dark:border-warning-500/70 dark:bg-amber-950/40 dark:text-warning-500">
                {stockError}
              </div>
            )}

            {!formVisible ? (
              <div className="text-xs py-2 space-y-2">
                <p className="text-muted-light dark:text-muted-dark italic">
                  Click <strong>New</strong> to create an invoice, or click <strong>Edit</strong> on an invoice below to modify it.
                </p>
                <p className="text-[11px] text-slate-600 dark:text-slate-400 not-italic leading-snug rounded-md border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/30 px-3 py-2">
                  <span className="font-semibold text-indigo-700 dark:text-indigo-300">Sales Person</span>
                  {" — use "}
                  <span className="font-medium">Inv. wise / Prod. wise</span>
                  {" next to the Seg checkbox: invoice mode uses the customer row; product mode uses each line. Tick one or more people, then "}
                  <span className="font-medium">Apply</span>
                  {". Search by name or ID; use "}
                  <span className="font-medium">+ Add New</span>
                  {" to create a sales person without leaving the invoice. The first selected person is used as the primary id on save."}
                </p>
              </div>
            ) : (
              <form id="invoice-form" onSubmit={handleSubmit} className="space-y-4 text-sm">
                {/* ── Header Fields ── */}
                <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-lg p-4 shadow-sm mb-4">
                  <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Invoice Header</h3>
                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                      {/* Sales Ledger Badge — always visible to identify the booking ledger */}
                      {effectiveSalesLedger ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
                          <svg className="w-3 h-3 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[10px] text-slate-400 font-semibold">Ledger:</span>
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{effectiveSalesLedger.name}</span>
                          <span className="text-[9px] font-mono bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-400 px-1 py-0.5 rounded">
                            #{effectiveSalesLedger.id}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                          <svg className="w-3 h-3 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">No sales ledger set</span>
                        </div>
                      )}
                      <div className="h-4 w-px bg-slate-200 dark:bg-slate-700" />
                      {/* Date Display toggle */}
                      <div className="flex flex-col items-start justify-start gap-1 ml-2 border-l border-slate-200 dark:border-slate-700 pl-3 self-start">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Date Display</label>
                        <Select
                          value={calendarDisplayMode}
                          onChange={(e) => setDisplayMode(e.target.value as any)}
                          className="h-9 mt-0.5 px-2 text-xs font-bold text-left w-[80px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm focus:ring-1 focus:ring-emerald-400"
                        >
                          <option value="AD">AD</option>
                          <option value="BS">BS</option>
                        </Select>
                      </div>

                      {/* Sales Type SelectionDropdown */}
                      <div className="flex flex-col items-start justify-start gap-1 ml-2 border-l border-slate-200 dark:border-slate-700 pl-3 self-start">
                        <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Sales Type</label>
                        <Select
                          value={salesType}
                          onChange={(e) => setSalesType(e.target.value as any)}
                          className="h-9 mt-0.5 px-2 text-xs font-bold text-left w-[100px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm focus:ring-1 focus:ring-emerald-400"
                        >
                          <option value="LOCAL">LOCAL</option>
                          <option value="IMPORT">IMPORT</option>
                        </Select>
                      </div>


                    </div>
                    
                    <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                        <input type="checkbox" checked={showInvNo} onChange={(e) => setShowInvNo(e.target.checked)} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span>Bill No.</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                        <input type="checkbox" checked={showDepartment} onChange={(e) => { setShowDepartment(e.target.checked); if (!e.target.checked) setDepartmentId(""); }} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span>Dept</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                        <input type="checkbox" checked={showProject} onChange={(e) => { setShowProject(e.target.checked); if (!e.target.checked) setProjectId(""); }} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span>Proj</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                        <input type="checkbox" checked={showSegment} onChange={(e) => { setShowSegment(e.target.checked); if (!e.target.checked) setSegmentId(""); }} className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
                        <span>Seg</span>
                      </label>
                      <div
                        className="flex flex-col items-start justify-start gap-1 border-l border-slate-200 dark:border-slate-700 pl-3 ml-0.5 self-start"
                        role="group"
                        aria-label="Sales person column placement"
                      >
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                          Sales Person
                        </span>
                        <div className="inline-flex rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
                          <button
                            type="button"
                            title="Invoice wise — assign in the customer row; applies to all lines"
                            onClick={() => setSalesPersonColumnMode("invoice")}
                            className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors ${
                              salesPersonColumnMode === "invoice"
                                ? "bg-indigo-600 text-white"
                                : "bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                            }`}
                          >
                            Inv. wise
                          </button>
                          <button
                            type="button"
                            title="Product wise — assign per line in the grid"
                            onClick={() => setSalesPersonColumnMode("product")}
                            className={`px-2 py-1 text-[9px] font-bold uppercase tracking-wide transition-colors border-l border-slate-200 dark:border-slate-700 ${
                              salesPersonColumnMode === "product"
                                ? "bg-indigo-600 text-white"
                                : "bg-white dark:bg-slate-800 text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
                            }`}
                          >
                            Prod. wise
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                    {/* Customer */}
                    <div className={`flex flex-col gap-1 ${showSalesPersonInCustomerRow ? "md:col-span-3 lg:col-span-2" : "md:col-span-4 lg:col-span-2"}`}>
                      <label className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                        <span className="text-emerald-600 dark:text-emerald-400">Customer <span className="text-red-500">*</span></span>
                        <button type="button" className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors"
                          onClick={() => { if (!companyId) return; saveDraft(); router.push(`/companies/${companyId}/sales/customers?returnTo=${encodeURIComponent(pathname || "")}`); }}
                        >+ New</button>
                      </label>
                      <SearchableSelect
                        options={customers?.map((c: any) => ({
                          value: String(c.id),
                          label: c.name,
                          sublabel: `#${c.id}${c.phone ? ` • ${c.phone}` : ""}${c.email ? ` • ${c.email}` : ""}`
                        })) || []}
                        pinnedOptions={[{ value: "__add_customer__", label: "+ Add New Customer", sublabel: "Create a new customer record" }]}
                        value={customerId}
                        onChange={(val) => {
                          if (val === "__add_customer__") setIsQuickCustomerModalOpen(true);
                          else setCustomerId(val);
                        }}
                        placeholder="Select customer"
                        triggerClassName="h-9 px-3 text-xs ring-1 ring-emerald-200 dark:ring-emerald-800/50 focus-within:ring-emerald-400"
                      />
                      <CustomerBalanceBadge companyId={companyId} customerId={customerId} />
                    </div>

                    {showSalesPersonInCustomerRow && (
                      <div className="flex flex-col gap-1 md:col-span-4 lg:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-slate-400">
                          Sales Person
                        </label>
                        <SalesPersonMultiSearchSelect
                          options={salesPersonSearchRows}
                          value={salesPersonId}
                          onChange={setSalesPersonId}
                          onQuickCreate={() => {
                            setPendingSalesPersonAction({ lineIdx: "header" });
                            setIsQuickSalesPersonModalOpen(true);
                          }}
                          placeholder={SALES_PERSON_SELECT_PLACEHOLDER}
                          searchInputPlaceholder="Search by name or ID…"
                          className="w-full min-w-0"
                          triggerClassName="h-9 px-2 text-xs border-slate-200 dark:border-slate-800"
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-teal-600 dark:text-teal-400 whitespace-nowrap">Invoice Date <span className="text-red-500">*</span></label>
                      <Input
                        type="date"
                        calendarMode={isBS ? 'BS' : 'AD'}
                        forceNative={false}
                        className="h-9 border-teal-200 dark:border-teal-800/50 rounded-md focus:ring-teal-400"
                        value={isBS ? (safeADToBS(date) || "") : date}
                        min={isBS && company?.fiscal_year_start ? (safeADToBS(company.fiscal_year_start) || "") : (company?.fiscal_year_start || "")}
                        max={isBS && company?.fiscal_year_end ? (safeADToBS(company.fiscal_year_end) || "") : (company?.fiscal_year_end || "")}
                        onChange={(e) => isBS ? handleDateChangeBS(e.target.value) : handleDateChangeAD(e.target.value)}
                        required
                      />
                    </div>


                    <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-teal-600 dark:text-teal-400 whitespace-nowrap">Bill Date</label>
                      <Input
                        type="date"
                        calendarMode={isBS ? 'BS' : 'AD'}
                        forceNative={false}
                        className="h-9 border-teal-200 dark:border-teal-800/50 rounded-md focus:ring-teal-400"
                        value={isBS ? (safeADToBS(billDate) || "") : billDate}
                        min={isBS && company?.fiscal_year_start ? (safeADToBS(company.fiscal_year_start) || "") : (company?.fiscal_year_start || "")}
                        max={isBS && company?.fiscal_year_end ? (safeADToBS(company.fiscal_year_end) || "") : (company?.fiscal_year_end || "")}
                        onChange={(e) => {
                          if (isBS) {
                            const ad = safeBSToAD(e.target.value);
                            if (ad) setBillDate(ad);
                          } else {
                            setBillDate(e.target.value);
                          }
                        }}
                      />
                    </div>

                    {/* Due Date (Credit Only) */}
                    {!paymentModeId && (
                      <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-rose-600 dark:text-rose-400">Due Date</label>
                        <Input
                          type="date"
                          calendarMode={isBS ? 'BS' : 'AD'}
                          forceNative={false}
                          className="h-9 border-rose-200 dark:border-rose-800/50 rounded-md focus:ring-rose-400"
                          value={dueDate}
                          min={isBS && company?.fiscal_year_start ? (safeADToBS(company.fiscal_year_start) || "") : (company?.fiscal_year_start || "")}
                          max={isBS && company?.fiscal_year_end ? (safeADToBS(company.fiscal_year_end) || "") : (company?.fiscal_year_end || "")}
                          onChange={(e) => {
                            setDueDateTouched(true);
                            setDueDate(isBS ? safeADToBS(e.target.value) : e.target.value);
                          }}
                        />
                      </div>
                    )}

                    {/* Invoice No */}
                    {showInvNo && (
                      <div className="flex flex-col gap-1 md:col-span-2 lg:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Bill No. <span className="text-red-500">*</span></label>
                        <Input className="h-9 border-indigo-200 dark:border-indigo-800/50 rounded-md focus:ring-indigo-400"
                          value={reference} onChange={(e) => setReference(e.target.value)} placeholder="BILL#" required />
                      </div>
                    )}

                    {/* Payment Mode */}
                    <div className="flex flex-col gap-1 md:col-span-4 lg:col-span-2">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-cyan-600 dark:text-cyan-400">
                        {isCashModeSelected ? 'Mode & Bal' : 'Mode'}
                      </label>
                      <div className="flex gap-2">
                        <Select name="payment_mode_id" className="h-9 border-cyan-200 dark:border-cyan-800/50 rounded-md focus:ring-cyan-400 flex-1 text-xs"
                          value={paymentModeId} onChange={(e) => setPaymentModeId(e.target.value)}>
                          <option value="">Credit (Accounts Receivable)</option>
                          {paymentModes?.map((pm) => (<option key={pm.id} value={pm.id}>{pm.name}</option>))}
                        </Select>
                        {isCashModeSelected && (
                          <div className="h-9 flex items-center px-3 rounded-md bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 shadow-sm whitespace-nowrap min-w-[90px]">
                            {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Dept/Proj/SP - Dynamic Columns */}
                    {showDepartment && (
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Dept</label>
                        <Select className="h-9 border-indigo-200 dark:border-indigo-800/50 rounded-md focus:ring-indigo-400 text-xs"
                          value={departmentId} 
                          onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                              setPendingCostCenterAction({ type: 'dept', lineIdx: 'header' });
                              setIsQuickDeptModalOpen(true);
                              return;
                            }
                            setDepartmentId(e.target.value)
                          }} 
                          required={showDepartment}>
                          <option value="">Dept...</option>
                          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                          {(departments || []).map((d: any) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                        </Select>
                      </div>
                    )}
                    
                    {showProject && (
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Proj</label>
                        <Select className="h-9 border-indigo-200 dark:border-indigo-800/50 rounded-md focus:ring-indigo-400 text-xs"
                          value={projectId} 
                          onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                              setPendingCostCenterAction({ type: 'proj', lineIdx: 'header' });
                              setIsQuickProjModalOpen(true);
                              return;
                            }
                            setProjectId(e.target.value)
                          }} 
                          required={showProject}>
                          <option value="">Proj...</option>
                          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                          {(projects || []).map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                        </Select>
                      </div>
                    )}

                    {showSegment && (
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Seg</label>
                        <Select className="h-9 border-indigo-200 dark:border-indigo-800/50 rounded-md focus:ring-indigo-400 text-xs"
                          value={segmentId} 
                          onChange={(e) => {
                            if (e.target.value === 'ADD_NEW') {
                              setPendingCostCenterAction({ type: 'seg', lineIdx: 'header' });
                              setIsQuickSegModalOpen(true);
                              return;
                            }
                            setSegmentId(e.target.value)
                          }} 
                          required={showSegment}>
                          <option value="">Seg...</option>
                          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                          {(segments || []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                        </Select>
                      </div>
                    )}

                    <div className="flex flex-col gap-1 md:col-span-2 border-l pl-3 ml-1 border-slate-200 dark:border-slate-800">
                      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-slate-400">Ref.</label>
                      <Input className="h-9 border-slate-200 dark:border-slate-700/50 rounded-md text-xs"
                        value={customReference} onChange={(e) => setCustomReference(e.target.value)} placeholder="#" />
                    </div>

                    {/* Bank Details */}
                    {isBankModeSelected && (
                      <div className="col-span-full grid grid-cols-1 md:grid-cols-12 gap-4 animate-in fade-in slide-in-from-top-1 duration-200 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30 mt-2">
                        <div className="flex flex-col gap-1 md:col-span-5">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-blue-600 dark:text-blue-400">Bank Account & Balance</label>
                          <div className="flex gap-2">
                            <Select value={selectedBankLedgerId} onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                              className="h-9 text-xs flex-1 border-blue-200 dark:border-blue-800/50 focus:ring-blue-400">
                              {bankLedgers.map((bl: any) => (
                                <option key={bl.id} value={bl.id}>{bl.name}</option>
                              ))}
                            </Select>
                            <div className="h-9 flex items-center px-3 rounded-md bg-white dark:bg-slate-900 border border-blue-200 text-[10px] font-bold text-blue-700 dark:text-blue-300 shadow-sm whitespace-nowrap min-w-[100px]">
                              {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1 md:col-span-5">
                          <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-blue-600 dark:text-blue-400">Bank Remark</label>
                          <Input value={bankRemark} onChange={(e) => setBankRemark(e.target.value)} placeholder="Ref No / TXN ID / Cheque No..." className="h-9 text-xs" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* ── Items Table Section ── */}
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="overflow-x-auto relative">
                    <table className="w-full text-xs table-fixed border-separate border-spacing-0">
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {lines.map((line, idx) => (
                          <tr key={idx} className={`transition-colors align-top ${idx % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/60 dark:bg-slate-900/30"}`}>
                            <td className="py-2 px-0.5 w-[22%]">
                              <div className="flex items-center justify-between mb-1">
                                <label className="text-[9px] font-bold text-slate-400 tracking-tight uppercase block">Select Product</label>
                                <button type="button" className="text-[9px] text-emerald-500 hover:text-emerald-600 font-semibold"
                                  onClick={() => { if (!companyId) return; saveDraft(); router.push(`/companies/${companyId}/inventory/items?returnTo=${encodeURIComponent(pathname || "")}&itemLineIndex=${idx}`); }}
                                >+ New</button>
                              </div>
                              <SearchableSelect
                                options={items
                                  ?.map((it: any) => {
                                    const itemIdNum = Number(it.id);
                                    const available = line.warehouse_id
                                      ? getAvailableForLine({ ...line, item_id: String(it.id) }, stockMap)
                                      : getTotalForItem(itemIdNum, stockMap);
                                    return {
                                      value: String(it.id),
                                      label: it.name,
                                      sublabel: `#${it.id}${available != null ? ` · Stock: ${available}` : ""}`
                                    };
                                  }) || []}
                                pinnedOptions={[{ value: "__add_item__", label: "+ Add New Product / Service", sublabel: "Create a new item record" }]}
                                value={line.item_id}
                                onChange={(val) => {
                                  if (val === "__add_item__") { setPendingItemLineIdx(idx); setIsQuickItemModalOpen(true); }
                                  else handleItemChange(idx, val);
                                }}
                                placeholder="Select product or service"
                                className="w-full min-w-0"
                                triggerClassName="h-10 px-3 text-xs border-slate-200/60 dark:border-slate-700/40"
                              />
                              {invoiceType !== "SERVICE" && line.item_id && (
                                <div className="mt-1 flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 w-fit">
                                  <span className="text-[10px] font-semibold text-slate-500">Stock:</span>
                                  <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-400">
                                    {line.warehouse_id
                                      ? getAvailableForLine(line, stockMap)
                                      : getTotalForItem(Number(line.item_id), stockMap)}
                                  </span>
                                </div>
                              )}
                            </td>
                            {showProject && (
                              <td className="py-2 px-0.5 w-[10%]">
                                <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Project</label>
                                <Select
                                  className="w-full h-10 border-slate-200/60 dark:border-slate-700/40 text-xs"
                                  value={line.project_id || ""}
                                  onChange={(e) => {
                                    if (e.target.value === 'ADD_NEW') {
                                      setPendingCostCenterAction({ type: 'proj', lineIdx: idx });
                                      setIsQuickProjModalOpen(true);
                                      return;
                                    }
                                    handleLineChange(idx, "project_id", e.target.value)
                                  }}
                                >
                                  <option value="">N/A</option>
                                  <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                  {(projects || []).map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                                </Select>
                              </td>
                            )}
                            {showSegment && (
                              <td className="py-2 px-0.5 w-[10%]">
                                <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Segment</label>
                                <Select
                                  className="w-full h-10 border-slate-200/60 dark:border-slate-700/40 text-xs"
                                  value={line.segment_id || ""}
                                  onChange={(e) => {
                                    if (e.target.value === 'ADD_NEW') {
                                      setPendingCostCenterAction({ type: 'seg', lineIdx: idx });
                                      setIsQuickSegModalOpen(true);
                                      return;
                                    }
                                    handleLineChange(idx, "segment_id", e.target.value)
                                  }}
                                >
                                  <option value="">N/A</option>
                                  <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                  {(segments || []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                </Select>
                              </td>
                            )}
                            {invoiceType !== "SERVICE" && (
                              <td className="py-2 px-0.5 w-[9%]">
                                <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Ref</label>
                                <Input
                                  className="h-10 text-xs text-center border-slate-200/60 dark:border-slate-700/40"
                                  placeholder="Ref"
                                  value={line.ref_no || ""}
                                  onChange={(e) => handleLineChange(idx, "ref_no", e.target.value)}
                                />
                              </td>
                            )}
                            <td className="py-2 px-0.5 w-[9%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">HS Code</label>
                              <HSCodeCell
                                companyId={companyId}
                                itemId={line.item_id}
                                value={line.hs_code || ""}
                                onChange={(val) => handleLineChange(idx, "hs_code", val)}
                              />
                            </td>
                            {invoiceType === "PRODUCT" && (
                              <td className="py-2 px-0.5 w-[11%]">
                                <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Warehouse</label>
                                {(() => {
                                  const item = items?.find((it: any) => String(it.id) === line.item_id);
                                  const isService = item?.category?.toLowerCase() === "service";
                                  if (isService) return <div className="text-[10px] text-slate-400 italic px-2">N/A</div>;
                                  return (
                                    <Select
                                      className="w-full h-10 border-slate-200/60 dark:border-slate-700/40 text-xs"
                                      value={line.warehouse_id ?? ""}
                                      onChange={(e) => handleLineChange(idx, "warehouse_id", e.target.value)}
                                    >
                                      <option value="">Wh...</option>
                                      {warehouses?.map((w) => {
                                        const stock = line.item_id ? getAvailableForLine({ ...line, warehouse_id: String(w.id) }, stockMap) : null;
                                        return <option key={w.id} value={w.id}>{`#${w.id} - ${w.name}${stock != null ? ` (${stock})` : ""}`}</option>;
                                      })}
                                    </Select>
                                  );
                                })()}
                              </td>
                            )}

                            <td className="py-2 px-0.5 w-[5%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Unit</label>
                              {line.units && line.units.length > 0 ? (
                                <Select className="w-full h-10 border-slate-200/60 dark:border-slate-700/40 text-xs" value={line.selected_unit_code ?? ""} onChange={(e) => handleUnitChange(idx, e.target.value)}>
                                  {line.units.map((u) => (<option key={u.id} value={u.unit_code}>{u.unit_code}</option>))}
                                </Select>
                              ) : (
                                <div className="text-[10px] text-slate-400 mt-2 px-1">Base</div>
                              )}
                            </td>
                            <td className="py-2 px-0.5 text-right w-[7%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Qty</label>
                              <Input type="number" step="any" className="h-10 text-right text-xs border-slate-200/60 dark:border-slate-700/40" value={line.quantity} onChange={(e) => handleLineChange(idx, "quantity", e.target.value)} />
                            </td>
                            <td className="py-2 px-0.5 text-right w-[9%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Rate</label>
                              <Input type="number" step="any" className="h-10 text-right text-xs border-slate-200/60 dark:border-slate-700/40" value={line.rate} onChange={(e) => handleLineChange(idx, "rate", e.target.value)} />
                            </td>
                            <td className="py-2 px-0.5 text-right w-[7%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Disc</label>
                              <Input type="number" step="any" className="h-10 text-right text-xs border-slate-200/60 dark:border-slate-700/40" value={line.discount} onChange={(e) => handleLineChange(idx, "discount", e.target.value)} />
                            </td>
                            <td className="py-2 px-0.5 w-[10%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Tax</label>
                              <Select
                                className="w-full h-10 border-slate-200/60 dark:border-slate-700/40 text-xs"
                                value={line.duty_tax_id ?? ""}
                                onChange={(e) => {
                                  handleLineChange(idx, "duty_tax_id", e.target.value);
                                  const dt = dutyTaxes?.find(t => String(t.id) === e.target.value);
                                  if (dt) handleLineChange(idx, "tax_rate", String(dt.rate));
                                  else handleLineChange(idx, "tax_rate", "0");
                                }}
                              >

                                {(dutyTaxes || []).filter(t => !t.tds_type).map((dt) => (
                                  <option key={dt.id} value={dt.id}>{dt.name}</option>
                                ))}
                              </Select>
                            </td>
                            <td className="py-2 px-0.5 text-right w-[8%] font-semibold text-slate-700 dark:text-slate-300">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Total</label>
                              <div className="h-10 flex items-center justify-end px-1">
                                {lineTotal(line).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </td>
                            {showSalesPersonPerLine && (
                              <td className="py-2 px-0.5 w-[11%] min-w-[7.5rem]">
                                <label className="block text-[8px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center leading-snug">
                                  Sales Person
                                </label>
                                <SalesPersonMultiSearchSelect
                                  options={salesPersonSearchRows}
                                  value={line.sales_person_id || ""}
                                  onChange={(csv) => handleLineChange(idx, "sales_person_id", csv)}
                                  onQuickCreate={() => {
                                    setPendingSalesPersonAction({ lineIdx: idx });
                                    setIsQuickSalesPersonModalOpen(true);
                                  }}
                                  placeholder={SALES_PERSON_SELECT_PLACEHOLDER}
                                  searchInputPlaceholder="Search by name or ID…"
                                  className="w-full min-w-0"
                                  triggerClassName="h-10 px-2 text-[11px] border-slate-200/60 dark:border-slate-700/40"
                                />
                              </td>
                            )}
                            <td className="py-2 px-0.5 w-[12%]">
                              <label className="block text-[9px] font-bold text-slate-400 tracking-tight mb-1 uppercase text-center">Remarks</label>
                              <Input className="h-10 text-xs border-slate-200/60 dark:border-slate-700/40" value={line.remarks || ""} onChange={(e) => handleLineChange(idx, "remarks", e.target.value)} placeholder="Remarks" />
                            </td>
                            <td className="py-1 px-0.5 text-center w-[5%]">
                              <button type="button" onClick={() => removeLine(idx)} className="h-10 w-full flex items-center justify-center text-rose-500 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-md transition-colors">
                                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800 no-print">
                        <tr>
                          <td colSpan={7 + (invoiceType !== "SERVICE" ? 2 : 0) + (showProject ? 1 : 0) + (showSegment ? 1 : 0)} className="py-2.5 px-4 text-right">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Subtotal</span>
                          </td>
                          <td className="py-2.5 px-1 text-right">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                              {(totals.subtotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td colSpan={footerTrailingColSpan}></td>
                        </tr>
                        {totals.taxTotal > 0 && (
                          <tr>
                            <td colSpan={7 + (invoiceType !== "SERVICE" ? 2 : 0) + (showProject ? 1 : 0) + (showSegment ? 1 : 0)} className="py-1 px-4 text-right">
                              <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-right">VAT Total</span>
                            </td>
                            <td className="py-1 px-1 text-right">
                              <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                {totals.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td colSpan={footerTrailingColSpan}></td>
                          </tr>
                        )}
                        <tr className="border-t border-slate-200 dark:border-slate-700 bg-blue-50/30 dark:bg-blue-900/10">
                          <td colSpan={7 + (invoiceType !== "SERVICE" ? 2 : 0) + (showProject ? 1 : 0) + (showSegment ? 1 : 0)} className="py-2.5 px-4 text-right">
                            <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest text-right">Grand Total</span>
                          </td>
                          <td className="py-2.5 px-1 text-right">
                            <span className="text-base font-black text-blue-600 dark:text-blue-400">
                              {(totals.subtotal + totals.taxTotal).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td colSpan={footerTrailingColSpan}></td>
                        </tr>
                        {applyTds && (
                          <tr className="bg-rose-50/20 dark:bg-rose-900/10">
                            <td colSpan={7 + (invoiceType !== "SERVICE" ? 2 : 0) + (showProject ? 1 : 0) + (showSegment ? 1 : 0)} className="py-1.5 px-4 text-right align-middle">
                              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest text-right italic leading-none">TDS Deduction</span>
                            </td>
                            <td className="py-1.5 px-1 text-right flex justify-end">
                              <div className="relative inline-block w-32">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-rose-600 dark:text-rose-400 text-xs font-bold">-</span>
                                <input
                                  type="number"
                                  className="w-full text-right text-xs font-bold text-rose-600 dark:text-rose-400 bg-white/50 dark:bg-slate-900/50 border border-rose-200 dark:border-rose-800/50 rounded px-1.5 py-0.5 pl-4 focus:outline-none focus:border-rose-400 focus:ring-1 focus:ring-rose-400 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  value={manualTdsAmount}
                                  onChange={(e) => setManualTdsAmount(e.target.value)}
                                  placeholder={totals.calculatedTdsAmount.toFixed(2)}
                                  step="0.01"
                                  min="0"
                                />
                              </div>
                            </td>
                            <td colSpan={footerTrailingColSpan}></td>
                          </tr>
                        )}
                        {applyTds && (
                          <tr className="border-t border-slate-200 dark:border-slate-800 bg-emerald-50/30 dark:bg-emerald-900/20">
                            <td colSpan={7 + (invoiceType !== "SERVICE" ? 2 : 0) + (showProject ? 1 : 0) + (showSegment ? 1 : 0)} className="py-2 px-4 text-right">
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Net Payable</span>
                            </td>
                            <td className="py-2 px-1 text-right">
                              <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </td>
                            <td colSpan={footerTrailingColSpan}></td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                  <div className="p-3 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-3">
                    <Button type="button" size="sm" variant="outline" onClick={addLine} className="h-8 w-fit text-[11px] font-semibold border-slate-300 dark:border-slate-700 hover:bg-white dark:hover:bg-slate-800 transition-all shadow-sm">
                      <svg className="w-3.5 h-3.5 mr-1.5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z" clipRule="evenodd" />
                      </svg>
                      Add Line
                    </Button>

                    <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-fit shadow-sm">
                      <input
                        id="apply-tds-footer-inv"
                        type="checkbox"
                        className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        checked={applyTds}
                        onChange={(e) => setApplyTds(e.target.checked)}
                      />
                      <label htmlFor="apply-tds-footer-inv" className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest cursor-pointer">
                        Deduct TDS
                      </label>
                    </div>
                  </div>
                </div>

                {/* ── Side-by-Side Summary Section ── */}
                <div className="mt-4 flex flex-col md:flex-row gap-6 items-start">
                  
                  {/* Left Column: Incentive Preview */}
                  <div className="flex-1 w-full max-w-[450px]">
                    <div className="relative">
                      <div className="mb-2 w-full rounded-xl border border-violet-200/60 bg-white dark:bg-slate-900 px-3 py-1.5 shadow-sm relative overflow-hidden">
                        {/* Slim visual accent */}
                        <div className="absolute top-0 left-0 w-1 h-full bg-violet-500/30" />
                        
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-6 w-6 items-center justify-center rounded-lg bg-violet-50 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                              </svg>
                            </div>
                            <h2 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-700 dark:text-slate-200 m-0">Incentives</h2>
                          </div>
                          <div className="flex items-center gap-2">
                            {incentiveRules.length > 0 && (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-900/20 text-[8px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-tighter">
                                Rules Active
                              </span>
                            )}
                          </div>
                        </div>

                        {incentiveSpKey === "" && (
                          <div className="py-2 px-3 border border-dashed border-slate-100 dark:border-slate-800 rounded-lg text-center">
                            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest m-0">Select Sales Person to preview</p>
                          </div>
                        )}
                        {incentiveSpKey !== "" && (
                          <div className="flex flex-col gap-1">
                            {incentivePreviews.map((row, idx) => {
                              const key = String(row.salesPersonId);
                              const displayName = salesPersonNameByIdForIncentives.get(row.salesPersonId) ?? row.name;
                              const manual = incentiveManualBySp[key];
                              const inputValue = manual ?? row.calculatedIncentive.toFixed(2);
                              const calc = row.calculatedIncentive;
                              
                              return (
                                <div key={idx} className="flex items-center justify-between gap-3 rounded-lg border border-violet-100/20 bg-slate-50/30 dark:bg-slate-800/20 p-1.5 transition-all hover:bg-white dark:hover:bg-slate-800/40">
                                  <div className="flex items-center gap-2 min-w-[150px]">
                                    <span className="text-[9px] font-mono text-violet-400 bg-violet-50/50 dark:bg-violet-900/20 px-1 py-0.2 rounded shrink-0">#{row.salesPersonId}</span>
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-tight truncate">{displayName}</span>
                                  </div>

                                  <div className="flex items-center gap-2 flex-1 justify-end">
                                    {manual !== undefined && (
                                      <span className="text-[8px] font-bold text-amber-500 uppercase bg-amber-50 dark:bg-amber-900/20 px-1.5 py-0.2 rounded-full border border-amber-100/30">
                                        Manual ({calc.toFixed(0)})
                                      </span>
                                    )}
                                    
                                    <div className="relative w-[100px]">
                                      <input 
                                        type="text" 
                                        className="h-7 w-full rounded-md border-slate-200 bg-white/80 pl-5 pr-1 text-[10px] font-black text-violet-700 focus:ring-1 focus:ring-violet-500 dark:border-slate-700 dark:bg-slate-900 dark:text-violet-300 shadow-sm"
                                        value={inputValue}
                                        onChange={(e) => setIncentiveManualBySp(prev => ({ ...prev, [key]: e.target.value }))}
                                      />
                                      <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-violet-400">Rs</span>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                            
                            <div className="mt-1 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-1.5 px-1">
                              <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Incentive Amt</span>
                              <span className="text-xs font-black text-violet-600 dark:text-violet-400 tabular-nums">
                                Rs {incentivePreviews.reduce((sum, p) => sum + (Number(incentiveManualBySp[String(p.salesPersonId)]) ?? p.calculatedIncentive), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Totals & Settlement */}
                  <div className="flex-1 flex flex-col gap-3 w-full">
                    <div className="text-[11px] text-slate-600 flex flex-wrap items-center justify-end gap-3 font-medium">
                      <span className="bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">Subtotal: <strong>{totals.subtotal.toFixed(2)}</strong></span>
                      {totals.taxableTotal > 0 && (
                        <span className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded border border-blue-200 dark:border-blue-800/50">Taxable Subtotal: <strong>{totals.taxableTotal.toFixed(2)}</strong></span>
                      )}
                      {totals.nonTaxableTotal > 0 && (
                        <span className="bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded border border-slate-200 dark:border-slate-700/50">Non Taxable Subtotal: <strong>{totals.nonTaxableTotal.toFixed(2)}</strong></span>
                      )}
                      {totals.discountTotal > 0 && (
                        <span className="bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 px-2 py-1 rounded border border-rose-200 dark:border-rose-800/50">Discount Subtotal: <strong>{totals.discountTotal.toFixed(2)}</strong></span>
                      )}
                      {totals.taxTotal >= 0.01 && (
                        <span className="bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-1 rounded border border-amber-200 dark:border-amber-800/50">VAT: <strong>{totals.taxTotal.toFixed(2)}</strong></span>
                      )}
                      <span className="bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 px-3 py-1 rounded-md text-sm font-bold shadow-sm">Total: {(totals.subtotal + totals.taxTotal).toFixed(2)}</span>
                      {totals.tdsAmount > 0 && (
                        <>
                          <span className="bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 px-2 py-1 rounded border border-rose-200 dark:border-rose-800/50 italic">TDS: <strong>-{totals.tdsAmount.toFixed(2)}</strong></span>
                          <span className="bg-emerald-600 text-white dark:bg-emerald-500 px-3 py-1 rounded-md text-sm font-bold shadow-md">Net: {totals.grandTotal.toFixed(2)}</span>
                        </>
                      )}
                    </div>

                    {
                      (() => {
                        const paymentModeName = paymentModeId
                          ? paymentModes?.find((pm) => String(pm.id) === String(paymentModeId))?.name
                          : null;
                        const settlement = deriveSettlement(paymentModeId, paymentModeName, totals.grandTotal);

                        return (
                          <div className="flex justify-end">
                            <div className={`inline-flex items-center gap-3 rounded-lg border px-3 py-1.5 text-[11px] ${settlement.isCashOrBank
                              ? "border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20"
                              : "border-amber-200 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20"
                              }`}>
                              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                              </svg>
                              <span className="font-semibold text-slate-500 uppercase tracking-tight">Payment</span>
                              <span className={`${settlement.isCashOrBank
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20"
                                : "bg-amber-500/10 text-amber-600 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20"
                                } rounded px-1.5 py-0.5 text-[10px] font-bold uppercase`}>
                                {settlement.statusLabel}
                              </span>
                              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500">Received:</span>
                                <span className="font-bold text-slate-900 dark:text-white">{settlement.paidAmount.toFixed(2)}</span>
                              </div>
                              <div className="h-4 w-[1px] bg-slate-200 dark:bg-slate-800 mx-1" />
                              <div className="flex items-center gap-2">
                                <span className="text-slate-500">Outstanding:</span>
                                <span className="font-bold text-slate-900 dark:text-white">{settlement.outstandingAmount.toFixed(2)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()
                    }

                    <div className="text-xs text-slate-600 text-right">
                      Amount in words: {amountToWords(totals.grandTotal, "", "")}
                    </div>
                  </div>
                </div>


                <div className="mt-4">
                  <label className="text-xs font-medium text-slate-700 block mb-1">
                    Narration
                  </label>
                  <textarea
                    className="w-full border rounded px-2 py-1 text-xs resize-none"
                    rows={2}
                    placeholder="Enter narration..."
                    value={narration}
                    onChange={(e) => setNarration(e.target.value)}
                  />
                </div>



              </form>
          )}

          </div>
        </div>
      )
      }
      {/* ═══ Success Modal ═══ */}
      <Modal
        open={!!createdInvoiceInfo}
        title="Invoice Created Successfully"
        onClose={() => {
          resetForm();
          setCreatedInvoiceInfo(null);
          setFormVisible(false);
        }}
        className="max-w-md"
      >
        <div className="flex flex-col items-center justify-center py-4 space-y-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
              Sales Invoice <span className="font-bold text-indigo-600 dark:text-indigo-400">#{createdInvoiceInfo?.reference}</span> has been recorded.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Choose what you would like to do next:
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 w-full pt-4">
            <button
              type="button"
              onClick={() => {
                if (!createdInvoiceInfo) return;
                window.open(`/companies/${companyId}/sales/invoices/${createdInvoiceInfo.id}?print=1`, '_blank');
              }}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-blue-100 bg-blue-50/50 hover:bg-blue-100 dark:border-blue-900/30 dark:bg-blue-900/20 dark:hover:bg-blue-900/40 transition-all group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500 text-white shadow-sm group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
              </div>
              <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300">OK</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setCreatedInvoiceInfo(null);
                setFormVisible(true);
              }}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-emerald-100 bg-emerald-50/50 hover:bg-emerald-100 dark:border-emerald-900/30 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40 transition-all group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
              </div>
              <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">NEW</span>
            </button>

            <button
              type="button"
              onClick={() => {
                resetForm();
                setCreatedInvoiceInfo(null);
                setFormVisible(false);
              }}
              className="flex flex-col items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 dark:border-slate-700/50 dark:bg-slate-800/50 dark:hover:bg-slate-800 transition-all group"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-500 text-white shadow-sm group-hover:scale-110 transition-transform">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">CLOSE</span>
            </button>
          </div>
        </div>
      </Modal>




      {/* ═══ Re-Print Modal ═══ */}
      {
        showReprintModal && (
          <div
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={(e) => { if (e.target === e.currentTarget) setShowReprintModal(false); }}
          >
            <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
              {/* Modal header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print an Invoice</span>
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
                  <input autoFocus type="text" placeholder="Search by invoice #, customer or bill no...."
                    className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                    value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                  Found {(invoices || []).length} invoices — click <strong>View &amp; Print</strong> to open in a new tab.
                </p>
              </div>

              {/* Invoice list */}
              <div className="px-5 pb-5 max-h-80 overflow-y-auto">
                {(() => {
                  const q = reprintSearch.trim().toLowerCase();
                  const modalInvoices = (invoices as any[] || []).filter((inv: any) => {
                    if (!q) return true;
                    return (
                      String(inv.id).includes(q) ||
                      (inv.reference || "").toLowerCase().includes(q) ||
                      customerName(inv.customer_id).toLowerCase().includes(q)
                    );
                  });
                  if (!invoices) return (
                    <div className="flex items-center gap-2 py-6 text-xs text-slate-400 justify-center">
                      <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                      Loading invoices...
                    </div>
                  );
                  if (modalInvoices.length === 0) return (
                    <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                      No invoices found matching your search.
                    </div>
                  );
                  return (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-1">
                      {modalInvoices.map((inv: any) => {
                        const total = invoiceTotal(inv);
                        return (
                          <div key={inv.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors border-l-2 border-transparent hover:border-teal-500">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 border border-teal-100 dark:border-teal-800/40">
                                  #{inv.id}
                                </span>
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{customerName(inv.customer_id)}</span>
                              </div>
                              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                                <span>{inv.date}</span>
                                {inv.reference && <span className="flex items-center gap-1">• <span className="italic">{inv.reference}</span></span>}
                                {inv.voucher_number && (
                                  <span className="rounded bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 text-[9px] font-bold text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/40 uppercase tracking-tighter">
                                    Voucher {inv.voucher_number}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                {total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                              <a href={`/companies/${companyId}/sales/invoices/${inv.id}`}
                                target="_blank" rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-semibold shadow-sm transition-colors">
                                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                                </svg>
                                Print
                              </a>
                              <button
                                type="button"
                                onClick={() => handleManualNotify(inv.id)}
                                disabled={notifyingId === inv.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-semibold shadow-sm transition-colors disabled:opacity-50">
                                {notifyingId === inv.id ? (
                                  <span className="inline-flex h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                                ) : (
                                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                                )}
                                Notify
                              </button>
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
        )
      }
      {importPreview && (
        <ImportPreviewModal
          previewData={importPreview}
          onClose={() => setImportPreview(null)}
          onConfirm={handleConfirmImport}
          onUpdate={(id, updated) => setImportPreview(prev => prev ? prev.map(inv => inv.id === id ? updated : inv) : null)}
          onRemove={(id) => setImportPreview(prev => prev ? prev.filter(inv => inv.id !== id) : null)}
          submitting={submitting}
          openCreateCustomer={(name, id) => {
            setCreateCustomerName(name);
            setActiveImportBillIdForCustomer(id);
            setIsCreateCustomerModalOpen(true);
          }}
          openCreateItem={(name, billId, lineIdx) => {
            setCreateItemName(name);
            setActiveImportBillIdForItem(billId);
            setActiveImportLineIdx(lineIdx);
            setIsCreateItemModalOpen(true);
          }}
          setIsQuickSalesPersonModalOpen={setIsQuickSalesPersonModalOpen}
          setPendingSalesPersonAction={setPendingSalesPersonAction}
          customers={customers}
          items={items}
          warehouses={warehouses}
          departments={departments}
          projects={projects}
          segments={segments}
          salesPersons={salesPersons}
        />
      )}

      {/* In-line Create Customer Modal */}
      <Modal
        open={isCreateCustomerModalOpen}
        title="Create New Customer"
        onClose={() => setIsCreateCustomerModalOpen(false)}
        className="max-w-md"
      >
        <form onSubmit={handleCreateCustomerOnFly} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Customer Name</label>
            <Input 
              value={createCustomerName} 
              onChange={(e) => setCreateCustomerName(e.target.value)}
              className="mt-1 h-10"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreateCustomerModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Customer"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* In-line Create Item Modal */}
      <Modal
        open={isCreateItemModalOpen}
        title="Create New Item"
        onClose={() => setIsCreateItemModalOpen(false)}
        className="max-w-md"
      >
        <form onSubmit={handleCreateItemOnFly} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-500 uppercase">Item Name</label>
            <Input 
              value={createItemName} 
              onChange={(e) => setCreateItemName(e.target.value)}
              className="mt-1 h-10"
              autoFocus
              required
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setIsCreateItemModalOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Creating..." : "Create Item"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* ═══ Cost Center Quick Modals ═══ */}
      <QuickDepartmentModal
        open={isQuickDeptModalOpen}
        onClose={() => setIsQuickDeptModalOpen(false)}
        companyId={companyId}
        onSuccess={(newId) => {
          mutateDepartments();
          if (pendingCostCenterAction?.lineIdx === 'header') {
            setDepartmentId(String(newId));
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
            setProjectId(String(newId));
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
            setSegmentId(String(newId));
          } else if (typeof pendingCostCenterAction?.lineIdx === 'number') {
            handleLineChange(pendingCostCenterAction.lineIdx, 'segment_id', String(newId));
          }
        }}
      />
      <QuickSalesPersonModal
        open={isQuickSalesPersonModalOpen}
        onClose={() => setIsQuickSalesPersonModalOpen(false)}
        companyId={companyId}
        onSuccess={(newId) => {
          mutateSalesPersons();
          const action = pendingSalesPersonAction;
          if (!action) return;
          if (action.lineIdx === "header") {
            setSalesPersonId((prev) => mergeSalesPersonCsv(prev, String(newId)));
          } else if (typeof action.lineIdx === "number") {
            if (action.billId != null) {
              const billId = action.billId;
              const lineIdx = action.lineIdx;
              setImportPreview((prev) => {
                if (!prev) return null;
                return prev.map((inv) => {
                  if (inv.id === billId) {
                    const newLines = [...inv.lines];
                    const sp =
                      salesPersons?.find((s: { id: number; name?: string }) => s.id === newId) ||
                      ({ id: newId, name: "New Sales Person" } as { id: number; name: string });
                    newLines[lineIdx] = {
                      ...newLines[lineIdx],
                      sales_person_id: newId,
                      sales_person_name: sp.name || (sp as { full_name?: string }).full_name || "New Sales Person",
                    };
                    return { ...inv, lines: newLines };
                  }
                  return inv;
                });
              });
            } else {
              const idx = action.lineIdx;
              setLines((prev) => {
                const copy = [...prev];
                const cur = copy[idx]?.sales_person_id || "";
                copy[idx] = { ...copy[idx], sales_person_id: mergeSalesPersonCsv(cur, String(newId)) };
                return copy;
              });
            }
          }
        }}
      />

      <QuickCustomerModal
        open={isQuickCustomerModalOpen}
        onClose={() => setIsQuickCustomerModalOpen(false)}
        companyId={companyId}
        onGoToFullForm={() => { saveDraft(); router.push(`/companies/${companyId}/sales/customers?returnTo=${encodeURIComponent(pathname || "")}`); }}
        onSuccess={(newId) => {
          mutateCustomers();
          setCustomerId(String(newId));
        }}
      />

      <QuickItemModal
        open={isQuickItemModalOpen}
        onClose={() => { setIsQuickItemModalOpen(false); setPendingItemLineIdx(null); }}
        companyId={companyId}
        title="Quick Add Product / Service"
        onGoToFullForm={() => {
          saveDraft();
          router.push(`/companies/${companyId}/inventory/items?returnTo=${encodeURIComponent(pathname || "")}${pendingItemLineIdx !== null ? `&itemLineIndex=${pendingItemLineIdx}` : ""}`);
        }}
        onSuccess={(newId) => {
          mutateItems();
          if (pendingItemLineIdx !== null) handleItemChange(pendingItemLineIdx, String(newId));
          setPendingItemLineIdx(null);
        }}
      />
    </div>
  );
}

function ImportPreviewModal({
  previewData,
  onClose,
  onConfirm,
  onUpdate,
  onRemove,
  submitting,
  openCreateCustomer,
  openCreateItem,
  setIsQuickSalesPersonModalOpen,
  setPendingSalesPersonAction,
  customers = [],
  items = [],
  warehouses = [],
  departments = [],
  projects = [],
  segments = [],
  salesPersons = []
}: {
  previewData: any[];
  onClose: () => void;
  onConfirm: () => void;
  onUpdate: (id: number, updated: any) => void;
  onRemove: (id: number) => void;
  submitting: boolean;
  openCreateCustomer: (name: string, id: number) => void;
  openCreateItem: (name: string, billId: number, lineIdx: number) => void;
  setIsQuickSalesPersonModalOpen: (open: boolean) => void;
  setPendingSalesPersonAction: (action: { lineIdx: number | 'header', billId?: number } | null) => void;
  customers?: any[];
  items?: any[];
  warehouses?: any[];
  departments?: any[];
  projects?: any[];
  segments?: any[];
  salesPersons?: any[];
}) {
  const [bulkWarehouseId, setBulkWarehouseId] = useState("");

  const importSalesPersonOptions: Option[] = useMemo(
    () =>
      (salesPersons || []).map((s: { id: number; name?: string; full_name?: string }) => ({
        value: String(s.id),
        label: String(s.full_name || s.name || `Person #${s.id}`),
        sublabel: `ID ${s.id}`,
      })),
    [salesPersons]
  );

  const handleBulkWarehouse = (whId: string) => {
    if (!whId) return;
    const wh = warehouses.find(w => String(w.id) === whId);
    if (!wh) return;

    previewData.forEach(inv => {
      const newLines = inv.lines.map((l: any) => ({
        ...l,
        warehouse_id: wh.id,
        warehouse_name: wh.name
      }));
      onUpdate(inv.id, { 
        ...inv, 
        lines: newLines,
        errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("warehouse")),
        warnings: (inv.warnings || []).filter((e: string) => !e.toLowerCase().includes("warehouse"))
      });
    });
    setBulkWarehouseId("");
  };

  const handleBulkItemFix = () => {
    previewData.forEach(inv => {
      let changed = false;
      const newLines = inv.lines.map((l: any) => {
        if (!l.item_id && l.item_suggestions?.length > 0) {
          changed = true;
          return {
            ...l,
            item_id: l.item_suggestions[0].id,
            item_name: l.item_suggestions[0].name,
            item_suggestions: []
          };
        }
        return l;
      });
      if (changed) {
        onUpdate(inv.id, { 
          ...inv, 
          lines: newLines,
          errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("item")),
          warnings: (inv.warnings || []).filter((e: string) => !e.toLowerCase().includes("item"))
        });
      }
    });
  };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 text-slate-800 dark:text-slate-100">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-7xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-600">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-bold">Review Sales Invoices Bulk Import</h2>
              <p className="text-xs text-slate-500">Previewing {previewData.length} invoices from Excel</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 bg-slate-50/50 dark:bg-slate-950/50">
          {/* Bulk Actions Bar */}
          {previewData.length > 0 && (
            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800/40 rounded-xl flex flex-wrap items-center gap-4 shadow-sm">
              <div className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                Bulk Settle Options:
              </div>
              
              <div className="flex items-center gap-2">
                <select 
                  className="text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 rounded px-2 py-1.5 focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={bulkWarehouseId}
                  onChange={(e) => handleBulkWarehouse(e.target.value)}
                >
                  <option value="">Assign Warehouse to All...</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={handleBulkItemFix}
                className="text-xs bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 px-3 py-1.5 rounded font-medium text-indigo-600 dark:text-indigo-400 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                Auto-fix Items with Suggestions
              </button>
            </div>
          )}

          <div className="space-y-6">
            {previewData.length === 0 ? (
              <div className="text-center py-12 text-slate-500 italic">No invoices left in preview.</div>
            ) : (
              previewData.map((inv) => (
                <div key={inv.id} className={`border rounded-xl p-5 bg-white dark:bg-slate-950 ${inv.errors?.length > 0 ? 'border-red-300 dark:border-red-900 shadow-lg shadow-red-500/5' : 'border-slate-200 dark:border-slate-800 shadow-sm'}`}>
                  <div className="flex items-start justify-between mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-6 gap-6 flex-1">
                      {/* Customer Selection */}
                      <div className="lg:col-span-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Customer <span className="text-red-500 font-black">*</span></label>
                        <div className="flex flex-col gap-1.5">
                          <select 
                            className={`w-full text-xs bg-white dark:bg-slate-950 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold ${!inv.customer_id ? 'border-red-500 bg-red-50/50' : 'border-slate-200 dark:border-slate-800'}`}
                            value={inv.customer_id || ""}
                            onChange={(e) => {
                              const cid = e.target.value;
                              const cname = customers.find(c => String(c.id) === cid)?.name || "";
                              onUpdate(inv.id, { 
                                ...inv, 
                                customer_id: cid ? Number(cid) : null,
                                customer_name: cname,
                                errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("customer"))
                              });
                            }}
                          >
                            <option value="">-- Select Customer --</option>
                            {customers.map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          {!inv.customer_id && (
                            <button 
                              onClick={() => openCreateCustomer(inv.customer_name, inv.id)}
                              className="text-[10px] text-blue-600 font-bold hover:underline w-fit"
                            >
                              + Create &quot;{inv.customer_name}&quot; as new Customer
                            </button>
                          )}
                          
                          {inv.customer_suggestions?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              <span className="text-[9px] text-slate-400 italic mr-1">Suggestions:</span>
                              {inv.customer_suggestions.map((s: any) => (
                                <button
                                  key={s.id}
                                  onClick={() => onUpdate(inv.id, { 
                                    ...inv, 
                                    customer_id: s.id, 
                                    customer_name: s.name,
                                    customer_suggestions: [],
                                    errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("customer"))
                                  })}
                                  className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-400 text-[10px] font-medium border border-indigo-100 dark:border-indigo-800/50 transition-all"
                                >
                                  {s.name}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Dates */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Date</label>
                        <input 
                          type="date" 
                          value={inv.date} 
                          onChange={(e) => onUpdate(inv.id, { ...inv, date: e.target.value })}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 text-sm font-semibold focus:border-indigo-500 outline-none pb-1"
                        />
                        {inv.bill_date && (
                          <div className="mt-1 text-[10px] text-slate-500">Bill Date: <span className="font-medium">{inv.bill_date}</span></div>
                        )}
                        {inv.due_date && (
                          <div className="text-[10px] text-slate-500">Due Date: <span className="font-medium">{inv.due_date}</span></div>
                        )}
                      </div>

                      {/* Reference & Person */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Reference</label>
                        <input 
                          type="text" 
                          value={inv.reference} 
                          onChange={(e) => onUpdate(inv.id, { ...inv, reference: e.target.value })}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-800 text-sm font-semibold focus:border-indigo-500 outline-none pb-1 placeholder:text-slate-300"
                          placeholder="INV-#"
                        />
                        {inv.sales_person_name && (
                          <div className="mt-1 flex items-center gap-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-bold uppercase tracking-tight">
                            <svg className="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" /></svg>
                            {inv.sales_person_name}
                          </div>
                        )}
                      </div>

                      {/* Ledgers */}
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Ledgers</label>
                        <div className="space-y-1">
                          <div className={`text-[10px] px-1.5 py-0.5 rounded inline-block ${inv.sales_ledger_id ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'} font-bold`}>
                            Sales: {inv.sales_ledger_name || 'System Default'}
                          </div>
                          {inv.output_tax_ledger_name && (
                            <div className={`text-[10px] px-1.5 py-0.5 rounded block ${inv.output_tax_ledger_id ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20' : 'bg-amber-50 text-amber-600 dark:bg-amber-900/20'} font-bold`}>
                              Tax: {inv.output_tax_ledger_name}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Mode & Remove */}
                      <div className="flex items-start justify-end gap-3">
                        <div className="text-right">
                          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">Mode</label>
                          <div className="text-xs font-bold text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-md">{inv.payment_mode_name || 'Credit'}</div>
                        </div>
                        <button onClick={() => onRemove(inv.id)} className="p-2.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-all" title="Remove this invoice">
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  {((inv.errors || []).length > 0 || (inv.warnings || []).length > 0) && (
                    <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl">
                      <div className="flex items-center gap-2 font-bold text-xs mb-3">
                        <svg className="w-4 h-4 text-slate-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        Validation Issues
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {inv.errors?.map((err: string, i: number) => (
                          <div key={`err-${i}`} className="flex items-start gap-2 text-[11px] text-red-600 dark:text-red-400 bg-red-500/5 px-3 py-2 rounded-lg border border-red-100 dark:border-red-900/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1 shrink-0" />
                            <span className="font-semibold uppercase text-[9px] mr-1">[Critical]</span> {err}
                          </div>
                        ))}
                        {inv.warnings?.map((warn: string, i: number) => (
                          <div key={`warn-${i}`} className="flex items-start gap-2 text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/5 px-3 py-2 rounded-lg border border-amber-100 dark:border-amber-900/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1 shrink-0" />
                            <span className="font-semibold uppercase text-[9px] mr-1">[Warning]</span> {warn}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="overflow-x-auto border border-slate-100 dark:border-slate-800 rounded-xl shadow-sm">
                    <table className="w-full text-xs text-left min-w-[900px]">
                      <thead className="bg-slate-50 dark:bg-slate-900/80">
                        <tr className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          <th className="px-4 py-3">Item Details <span className="text-red-500 font-black">*</span></th>
                          <th className="px-4 py-3 text-center">Qty <span className="text-red-500 font-black">*</span></th>
                          <th className="px-4 py-3 text-center">Rate <span className="text-red-500 font-black">*</span></th>
                          <th className="px-4 py-3 text-center">Discount</th>
                          <th className="px-4 py-3 text-center">Tax %</th>
                          <th className="px-4 py-3">HS Code / Remarks</th>
                          <th className="px-4 py-3">Dimensions</th>
                          <th className="px-4 py-3 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-950/50">
                        {inv.lines.map((line: any, lidx: number) => {
                          const subtotal = (line.quantity * line.rate) - line.discount;
                          const tax = (subtotal * line.tax_rate) / 100;
                          const total = subtotal + tax;
                          return (
                            <tr key={lidx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1.5 min-w-[200px]">
                                  <select 
                                    className={`text-xs bg-white dark:bg-slate-900 border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold ${!line.item_id ? 'border-red-500 bg-red-50/50' : 'border-slate-200 dark:border-slate-800'}`}
                                    value={line.item_id || ""}
                                    onChange={(e) => {
                                      const iid = e.target.value;
                                      const iname = items.find(i => String(i.id) === iid)?.name || "";
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = { ...newLines[lidx], item_id: iid ? Number(iid) : null, item_name: iname, item_suggestions: [] };
                                      onUpdate(inv.id, { 
                                        ...inv, 
                                        lines: newLines,
                                        errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("item") || !e.toLowerCase().includes(line.item_name.toLowerCase()))
                                      });
                                    }}
                                  >
                                    <option value="">-- Select Item --</option>
                                    {items.map(i => (
                                      <option key={i.id} value={i.id}>{i.name}</option>
                                    ))}
                                  </select>
                                  
                                  {!line.item_id && (
                                    <button 
                                      onClick={() => openCreateItem(line.item_name, inv.id, lidx)}
                                      className="text-[10px] text-blue-600 font-bold hover:underline w-fit"
                                    >
                                      + Create &quot;{line.item_name}&quot;
                                    </button>
                                  )}

                                  {line.item_suggestions?.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      <span className="text-[9px] text-slate-400 italic">Suggestions:</span>
                                      {line.item_suggestions.map((s: any) => (
                                        <button
                                          key={s.id}
                                          onClick={() => {
                                            const newLines = [...inv.lines];
                                            newLines[lidx] = { ...newLines[lidx], item_id: s.id, item_name: s.name, item_suggestions: [] };
                                            onUpdate(inv.id, { 
                                              ...inv, 
                                              lines: newLines,
                                              errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("item"))
                                            });
                                          }}
                                          className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 hover:bg-indigo-100 text-[9px] font-medium border border-indigo-100 transition-all"
                                        >
                                          {s.name}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="number" 
                                  className="w-16 bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-center font-semibold text-xs"
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const newLines = [...inv.lines];
                                    newLines[lidx] = { ...newLines[lidx], quantity: parseFloat(e.target.value) || 0 };
                                    onUpdate(inv.id, { ...inv, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="number" 
                                  className="w-20 bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-center font-semibold text-xs"
                                  value={line.rate}
                                  onChange={(e) => {
                                    const newLines = [...inv.lines];
                                    newLines[lidx] = { ...newLines[lidx], rate: parseFloat(e.target.value) || 0 };
                                    onUpdate(inv.id, { ...inv, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <input 
                                  type="number" 
                                  className="w-16 bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-center font-semibold text-xs text-rose-600"
                                  value={line.discount}
                                  onChange={(e) => {
                                    const newLines = [...inv.lines];
                                    newLines[lidx] = { ...newLines[lidx], discount: parseFloat(e.target.value) || 0 };
                                    onUpdate(inv.id, { ...inv, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3 text-center">
                                <input 
                                  type="number" 
                                  className="w-12 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded px-1 py-0.5 font-bold text-[10px] text-center border-none focus:ring-1 focus:ring-blue-500 outline-none"
                                  value={line.tax_rate}
                                  onChange={(e) => {
                                    const newLines = [...inv.lines];
                                    newLines[lidx] = { ...newLines[lidx], tax_rate: parseFloat(e.target.value) || 0 };
                                    onUpdate(inv.id, { ...inv, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-4 py-3">
                                <div className="space-y-1">
                                  <input 
                                    type="text" 
                                    placeholder="HS Code"
                                    className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded px-1.5 py-0.5 text-[10px] text-slate-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={line.hs_code || ""}
                                    onChange={(e) => {
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = { ...newLines[lidx], hs_code: e.target.value };
                                      onUpdate(inv.id, { ...inv, lines: newLines });
                                    }}
                                  />
                                  <textarea 
                                    placeholder="Remarks..."
                                    className="w-full bg-transparent border border-slate-100 dark:border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 italic leading-tight resize-none h-8 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={line.remarks || ""}
                                    onChange={(e) => {
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = { ...newLines[lidx], remarks: e.target.value };
                                      onUpdate(inv.id, { ...inv, lines: newLines });
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex flex-col gap-1.5 min-w-[150px]">
                                  {/* Warehouse */}
                                  <select 
                                    className={`text-[9px] font-bold bg-white dark:bg-slate-900 border rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 ${!line.warehouse_id && line.warehouse_name ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 dark:border-slate-800'}`}
                                    value={line.warehouse_id || ""}
                                    onChange={(e) => {
                                      const wid = e.target.value;
                                      const wname = warehouses.find(w => String(w.id) === wid)?.name || "";
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = { ...newLines[lidx], warehouse_id: wid ? Number(wid) : null, warehouse_name: wname };
                                      onUpdate(inv.id, { 
                                        ...inv, 
                                        lines: newLines,
                                        errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("warehouse")),
                                        warnings: (inv.warnings || []).filter((e: string) => !e.toLowerCase().includes("warehouse"))
                                      });
                                    }}
                                  >
                                    <option value="">WH: -- Select --</option>
                                    {warehouses.map(w => (
                                      <option key={w.id} value={w.id}>WH: {w.name}</option>
                                    ))}
                                  </select>

                                  {/* Department */}
                                  <select 
                                    className={`text-[9px] font-bold bg-white dark:bg-slate-900 border rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 ${!line.department_id && line.department_name ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 dark:border-slate-800'}`}
                                    value={line.department_id || ""}
                                    onChange={(e) => {
                                      const did = e.target.value;
                                      const dname = departments.find(d => String(d.id) === did)?.name || "";
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = { ...newLines[lidx], department_id: did ? Number(did) : null, department_name: dname };
                                      onUpdate(inv.id, { 
                                        ...inv, 
                                        lines: newLines,
                                        errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("department")),
                                        warnings: (inv.warnings || []).filter((e: string) => !e.toLowerCase().includes("department"))
                                      });
                                    }}
                                  >
                                    <option value="">Dept: -- Select --</option>
                                    {departments.map(d => (
                                      <option key={d.id} value={d.id}>Dept: {d.name}</option>
                                    ))}
                                  </select>

                                  {/* Project */}
                                  <select 
                                    className={`text-[9px] font-bold bg-white dark:bg-slate-900 border rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 ${!line.project_id && line.project_name ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 dark:border-slate-800'}`}
                                    value={line.project_id || ""}
                                    onChange={(e) => {
                                      const pid = e.target.value;
                                      const pname = projects.find(p => String(p.id) === pid)?.name || "";
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = { ...newLines[lidx], project_id: pid ? Number(pid) : null, project_name: pname };
                                      onUpdate(inv.id, { 
                                        ...inv, 
                                        lines: newLines,
                                        errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("project")),
                                        warnings: (inv.warnings || []).filter((e: string) => !e.toLowerCase().includes("project"))
                                      });
                                    }}
                                  >
                                    <option value="">Proj: -- Select --</option>
                                    {projects.map(p => (
                                      <option key={p.id} value={p.id}>Proj: {p.name}</option>
                                    ))}
                                  </select>

                                  {/* Sales Person — native select so “+ Add New” always appears */}
                                  <select
                                    aria-label={`Import line ${lidx + 1} sales person`}
                                    value={line.sales_person_id != null ? String(line.sales_person_id) : ""}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      if (val === SALES_PERSON_QUICK_CREATE_VALUE) {
                                        setPendingSalesPersonAction({ lineIdx: lidx, billId: inv.id });
                                        setIsQuickSalesPersonModalOpen(true);
                                        return;
                                      }
                                      const sp = (salesPersons as any[])?.find((s: any) => String(s.id) === val);
                                      const spname = sp?.full_name || sp?.name || "";
                                      const newLines = [...inv.lines];
                                      newLines[lidx] = {
                                        ...newLines[lidx],
                                        sales_person_id: val ? Number(val) : null,
                                        sales_person_name: spname,
                                      };
                                      onUpdate(inv.id, {
                                        ...inv,
                                        lines: newLines,
                                        errors: (inv.errors || []).filter((e: string) => !e.toLowerCase().includes("sales person")),
                                        warnings: (inv.warnings || []).filter((e: string) => !e.toLowerCase().includes("sales person")),
                                      });
                                    }}
                                    className={`text-[9px] font-bold bg-white dark:bg-slate-900 border rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 min-w-[140px] max-w-[240px] w-full shrink-0 ${
                                      !line.sales_person_id && line.sales_person_name
                                        ? "border-amber-400 bg-amber-50/30"
                                        : "border-slate-200 dark:border-slate-800"
                                    }`}
                                  >
                                    <option value={SALES_PERSON_QUICK_CREATE_VALUE}>+ Add New</option>
                                    <option value="">SP: — Choose —</option>
                                    {importSalesPersonOptions.map((o: Option) => (
                                      <option key={o.value} value={o.value}>
                                        {o.sublabel ? `${o.label} (${o.sublabel})` : o.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100 text-sm">{total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {inv.narration && (
                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-100 dark:border-slate-800 text-[11px] text-slate-500">
                      <span className="font-bold uppercase text-[9px] tracking-widest text-slate-400 mr-2">Narration:</span>
                      {inv.narration}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="px-6 py-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <button 
            onClick={onClose}
            className="px-6 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
            Cancel & Exit
          </button>
          <div className="flex items-center gap-5">
            {previewData.some(inv => (inv.errors?.length || 0) > 0) && (
              <div className="animate-bounce flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/40 text-[11px] font-bold text-amber-700 dark:text-amber-400 shadow-sm">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                Please resolve all errors to import
              </div>
            )}
            <button
              onClick={onConfirm}
              disabled={submitting || previewData.length === 0 || previewData.some(inv => (inv.errors?.length || 0) > 0)}
              className="px-10 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-xl shadow-indigo-500/30 transition-all flex items-center gap-2 active:scale-95 group"
            >
              {submitting ? (
                <span className="w-5 h-5 border-3 border-white/50 border-t-transparent animate-spin rounded-full" />
              ) : (
                <svg className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              )}
              Confirm Bulk Import
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
