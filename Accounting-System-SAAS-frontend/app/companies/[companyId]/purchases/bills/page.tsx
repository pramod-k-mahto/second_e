"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { useParams, useRouter, usePathname, useSearchParams } from "next/navigation";
import React, { FormEvent, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { api, getItemLedgerDefaults, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";

import type { ItemUnitRead } from "@/types/item";
import { convertUiToBase } from "@/lib/units";
import { amountToWords } from "@/lib/amountToWords";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { buildPurchaseBillPayload } from "@/lib/transactionPayloads";
import { ReversePurchaseBillAction } from "@/components/purchases/ReversePurchaseBillAction";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";
import { deriveSettlement } from "@/lib/paymentModeSettlement";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useSupplierStatement } from "@/lib/api/partyStatements";
import { saveFormDraft, loadFormDraft, clearFormDraft } from "@/lib/formDrafts";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { readCalendarDisplayMode } from "@/lib/calendarMode";
import { QuickDepartmentModal } from '@/components/cost-centers/QuickDepartmentModal';
import { QuickProjectModal } from '@/components/cost-centers/QuickProjectModal';
import { QuickSegmentModal } from '@/components/cost-centers/QuickSegmentModal';
import { QuickSupplierModal } from '@/components/purchases/QuickSupplierModal';
import { QuickItemModal } from '@/components/production/QuickItemModal';
import { Modal } from "@/components/ui/Modal";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function HSCodeCell({ companyId, itemId, value, onChange }: { companyId: string, itemId: string, value: string, onChange: (val: string) => void }) {
  const { data: hsCodes } = useSWR<string[]>(companyId && itemId ? `/companies/${companyId}/hs-codes/${itemId}` : null, fetcher);

  // Auto-fill with the most recent HS code when item is selected and field is empty
  useEffect(() => {
    if (hsCodes && hsCodes.length > 0 && !value && itemId) {
      onChange(hsCodes[0]);
    }
  }, [hsCodes, itemId]);

  return (
    <div className="relative group">
      <input
        list={itemId ? `hs-codes-${itemId}` : undefined}
        className="w-full h-11 border border-border-light dark:border-border-dark rounded-md px-2 py-1 bg-surface-light dark:bg-slate-900 text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HS Code"
      />
      {itemId && (
        <datalist id={`hs-codes-${itemId}`}>
          {hsCodes?.map((code: string) => (
            <option key={code} value={code} />
          ))}
        </datalist>
      )}
    </div>
  );
}


type Warehouse = {
  id: number;
  name: string;
};

type DutyTax = {
  id: number;
  name: string;
  rate: number;
  purchase_rate: number | null;
  income_rate: number | null;
  tds_type: string | null;
  is_active: boolean;
};

type BillLine = {
  item_id: string;
  quantity: string;
  rate: string;
  discount: string;
  tax_rate: string;
  duty_tax_id?: string;
  selected_unit_code?: string | null;
  units?: ItemUnitRead[];
  warehouse_id?: string;
  department_id?: string;
  project_id?: string;
  segment_id?: string;
  hs_code?: string;
  remarks?: string;
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
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
  calendar_mode?: "AD" | "BS";
};


type Ledger = {
  id: number;
  company_id: number;
  group_id: number;
  name: string;
  code: string | null;
};

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

// ── Supplier Balance Badge ────────────────────────────────────────────────
function SupplierBalanceBadge({ companyId, supplierId }: { companyId: string; supplierId: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const { report, isLoading } = useSupplierStatement(
    companyId || undefined,
    supplierId || undefined,
    "2000-01-01",  // wide open window to capture all history
    today,
    { suppressForbidden: true },
  );

  if (!supplierId) return null;

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
  // Positive balance = supplier has a credit balance = we owe them (payable) — normal for purchases
  // Negative balance = we have an advance / overpaid
  const isPayable = balance > 0;
  const isAdvance = balance < 0;
  const absBalance = Math.abs(balance).toFixed(2);

  const colorClass = isPayable
    ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-300"
    : isAdvance
      ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700/40 dark:text-emerald-300"
      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400";

  const label = isPayable ? "Payable (We owe)" : isAdvance ? "Advance (Credit)" : "Settled";

  return (
    <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-0.5 py-0.5 text-[10px] font-medium ${colorClass}`}>
      {isPayable ? (
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

export default function PurchaseBillsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { canRead, canUpdate } = useMenuAccess("purchases.bill.list");

  const { data: bills, mutate } = useSWR(
    companyId ? `/companies/${companyId}/bills` : null,
    fetcher
  );
  const { data: suppliers, mutate: mutateSuppliers } = useSWR(
    companyId ? `/companies/${companyId}/suppliers` : null,
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

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
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
    companyId ? `/companies/${companyId}/duty-taxes?is_active=true` : null,
    fetcher
  );

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(`/companies/${companyId}/bills/export-template`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'purchase_bill_template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download template');
    }
  };

  const [importPreview, setImportPreview] = useState<any[] | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setSubmitting(true);
    // Backdate warning
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
      const res = await api.post(`/companies/${companyId}/bills/parse-excel`, formData, {
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
    // Backdate warning
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
      const res = await api.post(`/companies/${companyId}/bills/confirm-import`, importPreview);
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


  const { calendarMode, displayMode: calendarDisplayMode, setDisplayMode, reportMode } = useCalendarSettings();
  const isBS = reportMode === "BS";

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(smartTo);
  const [billDate, setBillDate] = useState(smartTo);

  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [paymentModeId, setPaymentModeId] = useState<string>("");
  const [showDepartment, setShowDepartment] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showSegment, setShowSegment] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [dueDate, setDueDate] = useState(smartTo);
  const [dueDateTouched, setDueDateTouched] = useState(false);

  const [invoiceType, setInvoiceType] = useState<"PRODUCT" | "SERVICE">("PRODUCT");
  const [purchaseType, setPurchaseType] = useState<"LOCAL" | "IMPORT">("LOCAL");
  const [lines, setLines] = useState<BillLine[]>([
    { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", selected_unit_code: null, units: [], warehouse_id: "", hs_code: "", department_id: "", project_id: "", segment_id: "", remarks: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [originalDate, setOriginalDate] = useState<string | null>(null);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [formVisible, setFormVisible] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successBillInfo, setSuccessBillInfo] = useState<{ id: string | number; date: string; bill_date?: string | null; voucher_number: string | null; total: number } | null>(null);
  const [reprintSearch, setReprintSearch] = useState("");
  const [isBankModeSelected, setIsBankModeSelected] = useState(false);
  const [isCashModeSelected, setIsCashModeSelected] = useState(false);
  const [selectedBankLedgerId, setSelectedBankLedgerId] = useState<string>('');
  const [ledgerBalance, setLedgerBalance] = useState<number | null>(null);
  const [bankRemark, setBankRemark] = useState('');
  const [purchaseLedgerName, setPurchaseLedgerName] = useState<string | null>(null);
  const [purchaseLedgerId, setPurchaseLedgerId] = useState<number | null>(null);
  const [applyTds, setApplyTds] = useState(false);
  const [manualTdsAmount, setManualTdsAmount] = useState<string>("");

  const [isQuickSupplierModalOpen, setIsQuickSupplierModalOpen] = useState(false);
  const [isQuickItemModalOpen, setIsQuickItemModalOpen] = useState(false);
  const [pendingItemLineIdx, setPendingItemLineIdx] = useState<number | null>(null);

  // Quick cost center creation state
  const [isQuickDeptModalOpen, setIsQuickDeptModalOpen] = useState(false);
  const [isQuickProjModalOpen, setIsQuickProjModalOpen] = useState(false);
  const [isQuickSegModalOpen, setIsQuickSegModalOpen] = useState(false);
  const [pendingCostCenterAction, setPendingCostCenterAction] = useState<{ type: 'dept' | 'proj' | 'seg', lineIdx: number | 'header' } | null>(null);

  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: ledgerGroups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  // Fetch company defaults to resolve the default purchase ledger for new bills
  const { data: companyDefaults } = useSWR(
    companyId ? `company:${companyId}:item-ledger-defaults` : null,
    () => getItemLedgerDefaults(companyId)
  );


  const [filterFromDate, setFilterFromDate] = useState(smartFrom);
  const [filterToDate, setFilterToDate] = useState(smartTo);

  const [filterSupplierId, setFilterSupplierId] = useState("");

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
        // Correctly calculate the ledgers for this mode (broadening the fallback matching)
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
          from_date: todayStr,
          to_date: todayStr
        }
      }).then(res => {
        setLedgerBalance(res.data?.closing_balance ?? 0);
      }).catch(() => setLedgerBalance(null));
    } else {
      setLedgerBalance(null);
    }
  }, [isBankModeSelected, isCashModeSelected, selectedBankLedgerId, companyId, todayStr]);

  // Header ledgers are now fully handled by backend defaults; no UI state needed here.

  // Compute the effective purchase ledger to display in the Purchase Header.
  // When editing a bill, use the bill's own resolved ledger (purchaseLedgerName/Id).
  // For new bills, fall back to the company's default purchase ledger.
  const effectivePurchaseLedger = useMemo(() => {
    if (purchaseLedgerName && purchaseLedgerId) {
      return { name: purchaseLedgerName, id: purchaseLedgerId };
    }
    if (companyDefaults?.purchase_ledger_id && ledgers) {
      const defaultLedger = (ledgers as any[]).find(
        (l: any) => l.id === companyDefaults.purchase_ledger_id
      );
      if (defaultLedger) {
        return { name: defaultLedger.name as string, id: companyDefaults.purchase_ledger_id };
      }
    }
    return null;
  }, [purchaseLedgerName, purchaseLedgerId, companyDefaults, ledgers]);

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
      const lineBase = qtyUi * rateUi - disc;

      // Determine tax from duty_tax_id if set
      const dt = dutyTaxes?.find(t => String(t.id) === l.duty_tax_id);
      const effectiveTaxRate = dt ? dt.rate : Number(l.tax_rate || "0");
      const lineTax = (lineBase * effectiveTaxRate) / 100;
      
      subtotal += (lineBase + lineTax);
      taxTotal += lineTax;

      if (effectiveTaxRate > 0) {
        taxableTotal += lineBase;
      } else {
        nonTaxableTotal += lineBase;
      }
    }

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
          const tdsRate = matchingTds.purchase_rate ?? 0;
          calculatedTdsAmount += (base * tdsRate / 100);
        }
      }
    }

    const finalTdsAmount = manualTdsAmount !== "" && !isNaN(Number(manualTdsAmount)) 
      ? Number(manualTdsAmount) 
      : calculatedTdsAmount;

    return { subtotal, taxableTotal, nonTaxableTotal, taxTotal, discountTotal, tdsAmount: finalTdsAmount, calculatedTdsAmount, grandTotal: subtotal - finalTdsAmount };
  }, [lines, dutyTaxes, applyTds, items, manualTdsAmount]);

  const lineTotal = (line: BillLine) => {
    const qtyUi = Number(line.quantity || "0");
    const rateUi = Number(line.rate || "0");
    const disc = Number(line.discount || "0");
    const taxRate = Number(line.tax_rate || "0");
    const base = qtyUi * rateUi - disc;
    const tax = (base * taxRate) / 100;
    return base + tax;
  };


  const getAvailableForLine = (line: BillLine, map: Map<string, number>): number => {
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

  const handleTransactionDateChange = (next: string) => {
    setDate(next);
    setOriginalDate((prev) => prev);
    if (!dueDateTouched && !paymentModeId) {
      setDueDate(next);
    }
  };

  const handleDateChangeAD = (nextAD: string) => {
    if (!nextAD) return;
    handleTransactionDateChange(nextAD);
  };

  const handleDateChangeBS = (nextBS: string) => {
    if (!nextBS) return;
    const ad = safeBSToAD(nextBS);
    if (ad) handleTransactionDateChange(ad);
  };

  useEffect(() => {
    if (!paymentModeId) {
      if (!dueDateTouched) {
        setDueDate(date);
      }
    }
  }, [paymentModeId, date, dueDateTouched]);

  const resetForm = (hideForm = true) => {
    setEditingId(null);
    setSupplierId("");
    setDate(todayStr);
    setBillDate(todayStr);
    setOriginalDate(null);
    setReference("");
    setNarration("");
    setPaymentModeId("");
    setBankRemark("");
    setLedgerBalance(null);
    setDueDate(todayStr);
    setDueDateTouched(false);
    setDepartmentId("");
    setProjectId("");
    setSegmentId("");
    setShowDepartment(false);
    setShowProject(false);
    setShowSegment(false);
    setLines([{ item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", selected_unit_code: null, units: [], warehouse_id: "", hs_code: "", department_id: "", project_id: "", segment_id: "", remarks: "" }]);
    setInvoiceType("PRODUCT");
    setPurchaseLedgerName(null);
    setPurchaseLedgerId(null);
    setApplyTds(false);
    setPurchaseType("LOCAL");
    setManualTdsAmount("");
    setSubmitError(null);
    setSubmitSuccess(null);
    setSuccessBillInfo(null);
    setShowSuccessModal(false);
    setStockError(null);
    if (hideForm) setFormVisible(false);
  };

  const saveDraft = useCallback(() => {
    const draft = {
      supplierId, date, billDate, originalDate, reference, narration, paymentModeId,
      bankRemark, dueDate, dueDateTouched, departmentId, projectId, segmentId,
      showDepartment, showProject, showSegment, lines, editingId, invoiceType, purchaseType, applyTds, manualTdsAmount
    };
    saveFormDraft(`purchase_bill_${companyId}`, draft);
  }, [
    supplierId, date, billDate, originalDate, reference, narration, paymentModeId,
    bankRemark, dueDate, dueDateTouched, departmentId, projectId,
    showDepartment, showProject, lines, editingId, companyId, purchaseType, applyTds, manualTdsAmount
  ]);

  const handleLineChange = (index: number, field: keyof BillLine, value: string) => {
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

    // Auto-set duty_tax from item default
    const defaultDutyTaxId = item?.duty_tax_id ? String(item.duty_tax_id) : "";
    const defaultTaxRate = item?.default_tax_rate != null ? String(item.default_tax_rate) : "";

    setLines((prev) => {
      const copy = [...prev];
      copy[index] = {
        ...copy[index],
        item_id: itemId,
        warehouse_id: isService ? "" : (copy[index].warehouse_id || ""),
        rate:
          copy[index].rate || (item?.default_purchase_rate != null ? String(item.default_purchase_rate) : ""),
        duty_tax_id: copy[index].duty_tax_id || defaultDutyTaxId,
        tax_rate: copy[index].tax_rate || defaultTaxRate,
        department_id: "",
        project_id: "",
        segment_id: "",
      };
      return copy;
    });
    if (companyId && itemId) {
      loadUnitsForLine(index, companyId, Number(itemId));
    }
  };

  useEffect(() => {
    const itemIdParam = searchParams.get("item_id");
    if (!itemIdParam || editingId) return;

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
          department_id: "",
          project_id: "",
          segment_id: "",
          remarks: "",
        });
      }
      return copy;
    });

    handleItemChange(0, itemIdParam);
  }, [searchParams, editingId]);

  // Restore draft when returning from creation
  useEffect(() => {
    if (searchParams.get('returning') === 'true' && companyId) {
      const draft = loadFormDraft(`purchase_bill_${companyId}`);
      if (draft) {
        setSupplierId(draft.supplierId);
        setDate(draft.date);
        setBillDate(draft.billDate || todayStr);
        setOriginalDate(draft.originalDate);
        setReference(draft.reference);
        setNarration(draft.narration);
        setPaymentModeId(draft.paymentModeId);
        setBankRemark(draft.bankRemark);
        setDueDate(draft.dueDate);
        setDueDateTouched(draft.dueDateTouched);
        setDepartmentId(draft.departmentId);
        setProjectId(draft.projectId);
        setSegmentId(draft.segmentId);
        setShowDepartment(draft.showDepartment);
        setShowProject(draft.showProject);
        setShowSegment(draft.showSegment);
        setLines(draft.lines);
        setEditingId(draft.editingId);
        if (draft.invoiceType) setInvoiceType(draft.invoiceType);
        if (draft.applyTds !== undefined) setApplyTds(draft.applyTds);
        if (draft.purchaseType !== undefined) setPurchaseType(draft.purchaseType);
        if (draft.manualTdsAmount !== undefined) setManualTdsAmount(draft.manualTdsAmount);
        setSelectedBankLedgerId(draft.selectedBankLedgerId || "");
        setBankRemark(draft.bankRemark || "");
        setFormVisible(true);

        const newId = searchParams.get('newId');
        const type = searchParams.get('type');
        if (newId) {
          if (!type || type === 'SUPPLIER') {
            setSupplierId(newId);
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
        clearFormDraft(`purchase_bill_${companyId}`);
      }
    }
  }, [searchParams, companyId]);

  const handleUnitChange = (index: number, unitCode: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], selected_unit_code: unitCode };
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", selected_unit_code: null, units: [], warehouse_id: "", hs_code: "", department_id: "", project_id: "", segment_id: "", remarks: "" }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length === 1) {
        return [
          { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", selected_unit_code: null, units: [], warehouse_id: "", hs_code: "", department_id: "", project_id: "", segment_id: "", remarks: "" },
        ];
      }
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleDelete = async () => {
    if (!editingId || !companyId || !canUpdate) return;
    if (!confirm("Are you sure you want to delete this bill?")) return;
    try {
      setDeleting(true);
      await api.delete(`/companies/${companyId}/bills/${editingId}`);
      setSubmitSuccess(`Bill #${editingId} deleted successfully.`);
      resetForm();
      mutate();
      await refreshStock();
      await globalMutate((key) =>
        typeof key === "string" && (key.startsWith(`/inventory/companies/${companyId}/stock/`) || key.startsWith(`/inventory/companies/${companyId}/stock-summary`))
      );
      await invalidateAccountingReports(companyId);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSubmitError(extractErrorMessage(detail, "Failed to delete bill."));
    } finally {
      setDeleting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;

    // Basic client-side validation for better UX
    if (!supplierId) {
      setSubmitError("Please select a supplier before saving the bill.");
      return;
    }

    const activeLines = lines.filter((l) => l.item_id);
    if (activeLines.length === 0) {
      setSubmitError("Add at least one item line before saving the bill.");
      return;
    }

    const hasInvalidQty = activeLines.some((l) => Number(l.quantity || "0") <= 0);
    if (hasInvalidQty) {
      setSubmitError("All item quantities must be greater than zero.");
      return;
    }

    const hasNegativeRate = activeLines.some((l) => Number(l.rate || "0") < 0);
    if (hasNegativeRate) {
      setSubmitError("Item rates cannot be negative.");
      return;
    }

    setSubmitting(true);
    // Backdate warning
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
    setSubmitError(null);
    setSubmitSuccess(null);

    const validWarehouseIds = new Set(
      (warehouses || []).map((w) => String(w.id))
    );

    const basePayload: any = {
      supplier_id: supplierId ? Number(supplierId) : null,
      date,
      bill_date: billDate,
      invoice_type: invoiceType,
      purchase_type: purchaseType,
      reference: reference || null,
      narration: narration || null,
      due_date: paymentModeId
        ? null
        : dueDateTouched
          ? dueDate
            ? dueDate
            : null
          : date,
      apply_tds: applyTds,
      tds_amount: applyTds ? totals.tdsAmount : null,
      tds_ledger_id: (() => {
        // Resolve the TDS Payable ledger: use the ledger_id from the first
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
      department_id: showDepartment && departmentId ? Number(departmentId) : null,
      project_id: showProject && projectId ? Number(projectId) : null,
      segment_id: showSegment && segmentId ? Number(segmentId) : null,
      lines: activeLines.map((l) => {
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

        // Resolve effective tax_rate from duty_tax
        const dt = dutyTaxes?.find(t => String(t.id) === l.duty_tax_id);
        const effectiveTaxRate = dt ? dt.rate : Number(l.tax_rate || "0");

        const payloadLine: any = {
          item_id: Number(l.item_id),
          quantity,
          rate,
          discount: Number(l.discount || "0"),
          tax_rate: effectiveTaxRate,
          duty_tax_id: l.duty_tax_id ? Number(l.duty_tax_id) : null,
          department_id: l.department_id ? Number(l.department_id) : (showDepartment && departmentId) ? Number(departmentId) : null,
          project_id: l.project_id ? Number(l.project_id) : (showProject && projectId) ? Number(projectId) : null,
          segment_id: l.segment_id ? Number(l.segment_id) : (showSegment && segmentId) ? Number(segmentId) : null,
          remarks: l.remarks || null,
        };

        if (warehouseId != null) {
          payloadLine.warehouse_id = warehouseId;
        }

        return payloadLine;
      }),
    };

    basePayload.payment_mode_id = paymentModeId || null;
    basePayload.bank_remark = bankRemark || null;
    if (isBankModeSelected && selectedBankLedgerId) {
      basePayload.payment_ledger_id = Number(selectedBankLedgerId);
    }
    setSubmitError(null);
    setSubmitSuccess(null);

    try {
      console.log('Submitting purchase invoice...', editingId ? 'Update' : 'Create');
      if (editingId) {
        const updatePayload = buildPurchaseBillPayload(
          {
            ...basePayload,
            original_date: originalDate,
          },
          "update"
        );

        const res = await api.put(
          `/companies/${companyId}/bills/${editingId}`,
          updatePayload
        );
        const updated = res?.data;
        console.log('Update response:', updated);
        if (updated) {
          const successId = updated.id || editingId;
          setSuccessBillInfo({
            id: successId,
            date: updated.date || date || todayStr,
            bill_date: updated.bill_date || billDate,
            voucher_number: updated.voucher_number || null,
            total: totals.grandTotal
          });
          setShowSuccessModal(true);
          console.log('Success modal should be visible now (Update)');
          setSubmitSuccess(
            `Purchase invoice #${successId} for ${totals.grandTotal.toFixed(
              2
            )} updated successfully.`
          );
        } else {
          setSubmitSuccess("Purchase invoice updated successfully.");
        }
      } else {
        const createPayload = buildPurchaseBillPayload(basePayload, "create");
        const res = await api.post(`/companies/${companyId}/bills`, createPayload);
        const created = res?.data;
        console.log('Create response:', created);
        if (created) {
          const successId = created.id || created.bill_id;
          if (successId) {
            setSuccessBillInfo({
              id: successId,
              date: created.date || date || todayStr,
              bill_date: created.bill_date || billDate,
              voucher_number: created.voucher_number || null,
              total: totals.grandTotal
            });
            setShowSuccessModal(true);
            console.log('Success modal should be visible now (Create)');
          }
          setSubmitSuccess(
            `Purchase invoice #${successId || ""} for ${totals.grandTotal.toFixed(
              2
            )} created successfully.`
          );
        } else {
          setSubmitSuccess("Purchase invoice created successfully.");
        }
      }
      // Form will be reset via the 'Close' button in the success modal, 
      // or immediately if modal is not shown. 
      // (Using resetForm() here would clear the form while the user is looking at the modal)
      mutate();
      await refreshStock();

      // Ensure stock / closing value UI updates immediately after a bill affects inventory.
      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith(`/inventory/companies/${companyId}/stock/`) || key.startsWith(`/inventory/companies/${companyId}/stock-summary`))
      );

      await invalidateAccountingReports(companyId);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSubmitError(
        extractErrorMessage(
          detail,
          editingId ? "Failed to update bill" : "Failed to create bill"
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = async (billSummary: any) => {
    if (!canUpdate || !companyId) return;

    try {
      const res = await api.get(
        `/companies/${companyId}/bills/${billSummary.id}`
      );
      const bill = res.data;

      setEditingId(bill.id);
      setSupplierId(bill.supplier_id ? String(bill.supplier_id) : "");
      setDate(bill.date || "");
      setBillDate(bill.bill_date || bill.date || todayStr);
      setOriginalDate(bill.date || null);
      setReference(bill.reference || "");
      setNarration(bill.narration || "");
      setBankRemark(bill.bank_remark || "");
      const paymentModeIdValue = bill.payment_mode_id != null ? String(bill.payment_mode_id) : "";
      setPaymentModeId(paymentModeIdValue);
      setPurchaseType(bill.purchase_type || "LOCAL");
      setSelectedBankLedgerId(bill.ledger_id ? String(bill.ledger_id) : "");
      setPurchaseLedgerName(bill.purchase_ledger_name || null);
      setPurchaseLedgerId(bill.purchase_ledger_id || null);
      const tdsAmount = bill.apply_tds ? Number(bill.tds_amount || 0) : 0;
      setApplyTds(bill.apply_tds);
      if (bill.apply_tds) {
        setManualTdsAmount(String(tdsAmount));
      } else {
        setManualTdsAmount("");
      }
      setDueDate(bill.due_date || bill.date || todayStr);
      setDueDateTouched(!!bill.due_date);
      setDepartmentId(bill.department_id != null ? String(bill.department_id) : (bill.lines && bill.lines[0]?.department_id != null ? String(bill.lines[0].department_id) : ""));
      setProjectId(bill.project_id != null ? String(bill.project_id) : (bill.lines && bill.lines[0]?.project_id != null ? String(bill.lines[0].project_id) : ""));
      const hasDepartment = bill.department_id || (bill.lines && bill.lines.some((l: any) => l.department_id));
      const hasProject = bill.project_id || (bill.lines && bill.lines.some((l: any) => l.project_id));
      setShowDepartment(!!hasDepartment);
      setShowProject(!!hasProject);
      if (bill.lines && Array.isArray(bill.lines) && bill.lines.length > 0) {
        setLines(
          bill.lines.map((l: any) => ({
            item_id: String(l.item_id),
            quantity: String(l.quantity ?? ""),
            rate: String(l.rate ?? ""),
            discount: String(l.discount ?? "0"),
            tax_rate: String(l.tax_rate ?? ""),
            selected_unit_code: null,
            units: [],
            hs_code: l.hs_code || "",
            warehouse_id: l.warehouse_id != null ? String(l.warehouse_id) : "",
            remarks: l.remarks || "",
          }))
        );
      } else {
        setLines([{ item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", selected_unit_code: null, units: [], warehouse_id: "", hs_code: "", remarks: "" }]);
      }
      setSubmitError(null);
      setFormVisible(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setSubmitError(
        extractErrorMessage(detail, "Failed to load bill details for editing.")
      );
    }
  };

  const supplierName = (id: number) =>
    suppliers?.find((s: any) => s.id === id)?.name || "";

  const filteredBills = useMemo(() => {
    if (!bills || !Array.isArray(bills)) return [] as any[];
    return (bills as any[]).filter((bill) => {
      if (filterFromDate && bill.date < filterFromDate) return false;
      if (filterToDate && bill.date > filterToDate) return false;
      if (filterSupplierId && String(bill.supplier_id) !== filterSupplierId) return false;
      return true;
    });
  }, [bills, filterFromDate, filterToDate, filterSupplierId]);

  return (
    <div className="space-y-6">
      {!canRead ? (
        <PageHeader
          title="Purchase Invoices"
          subtitle="You do not have permission to view purchase invoices for this company."
        />
      ) : (
        <>
          {/* ══ Professional Page Header ══ */}
          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
            {/* top accent line */}
            <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500" />
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">

              {/* Left: icon + text */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                  <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Purchase Invoices</h1>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                    Record and manage purchase invoices · Payment modes auto-create payment vouchers
                  </p>
                </div>
              </div>

              {/* Right: stat pills */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-0.5 py-1">
                  <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" /><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[11px] text-slate-500 dark:text-slate-400">Bills:</span>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                    {Array.isArray(bills) ? bills.length : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1 rounded-md border border-indigo-100 dark:border-indigo-800/40 bg-indigo-50 dark:bg-indigo-900/20 px-0.5 py-1">
                  <svg className="w-3.5 h-3.5 text-indigo-400" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" />
                  </svg>
                  <span className="text-[11px] text-indigo-500 dark:text-indigo-400">Grand Total:</span>
                  <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">
                    {Array.isArray(bills)
                      ? bills.reduce((s: number, b: any) => s + (Array.isArray(b.lines) ? b.lines.reduce((ls: number, l: any) => {
                        const base = Number(l.quantity || 0) * Number(l.rate || 0) - Number(l.discount || 0);
                        return ls + base + (base * Number(l.tax_rate || 0)) / 100;
                      }, 0) : 0), 0).toFixed(2)
                      : "—"}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {canUpdate && (
            <div className="relative rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px] shadow-lg">
              <Card className="border-none bg-surface-light dark:bg-slate-950 rounded-xl overflow-hidden">

                {/* ── Professional Toolbar Row ── */}
                <div className="flex items-center flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/80 px-3 py-2 rounded-t-xl">

                  {/* New */}
                  <button
                    type="button"
                    title="New bill"
                    onClick={() => { resetForm(false); setFormVisible(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                      bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700
                      text-white shadow-sm transition-all duration-150"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                    New
                  </button>

                  {/* Divider */}
                  <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />

                  {/* Cancel */}
                  <button
                    type="button"
                    title="Cancel and close form"
                    disabled={!formVisible}
                    onClick={() => { resetForm(true); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                      bg-amber-400 hover:bg-amber-500 active:bg-amber-600
                      text-white shadow-sm transition-all duration-150
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                    Cancel
                  </button>

                  {/* Delete — only when editing */}
                  {editingId && formVisible && (
                    <>
                      <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />
                      <button
                        type="button"
                        title="Delete this bill"
                        onClick={handleDelete}
                        disabled={deleting}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                          bg-red-500 hover:bg-red-600 active:bg-red-700
                          text-white shadow-sm transition-all duration-150
                          disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {deleting ? (
                          <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                        ) : (
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        )}
                        Delete
                      </button>
                    </>
                  )}

                  {/* Divider */}
                  <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />

                  {/* Save / Update */}
                  <button
                    form="bill-form"
                    type="submit"
                    title={editingId ? "Update bill" : "Save new bill"}
                    disabled={!canUpdate || !formVisible || submitting}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                      bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800
                      text-white shadow-sm transition-all duration-150
                      disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {submitting ? (
                      <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.172 14.243a1 1 0 001.414 0L16 7.828a1 1 0 00-1.414-1.414L8 12.999l-2.586-2.585a1 1 0 10-1.414 1.414l3.172 3.172z" /></svg>
                    )}
                    {editingId ? "Update" : "Save"}
                  </button>

                  {/* Divider */}
                  <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />

                  {/* Re-Print — always clickable, opens modal */}
                  <button
                    type="button"
                    title="Re-Print a bill"
                    onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                      bg-teal-500 hover:bg-teal-600 active:bg-teal-700
                      text-white shadow-sm transition-all duration-150"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
                    Re-Print
                  </button>

                  {/* Upload */}
                  <button
                    type="button"
                    title="Upload Excel"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                      bg-blue-500 hover:bg-blue-600 active:bg-blue-700
                      text-white shadow-sm transition-all duration-150"
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
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                      bg-orange-500 hover:bg-orange-600 active:bg-orange-700
                      text-white shadow-sm transition-all duration-150"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                    Download
                  </button>

                  {/* Divider */}
                  <span className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-0.5" />



                  {/* right-side status label */}
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      title="Exit — go back"
                      onClick={() => router.push('/dashboard')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold
                        bg-slate-500 hover:bg-slate-600 active:bg-slate-700
                        text-white shadow-sm transition-all duration-150"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
                      Exit
                    </button>
                    {editingId ? (
                      <span className="rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-0.5 py-0.5 text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700/50">
                        ✏ Editing Bill #{editingId}
                      </span>
                    ) : formVisible ? (
                      <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-0.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                        ✦ New Bill
                      </span>
                    ) : (
                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-0.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                        No bill open
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
                  {/* submitSuccess replaced by Success Modal popup */}
                  {stockError && formVisible && (
                    <div className="mb-3 rounded border border-warning-500/40 bg-amber-50 px-3 py-2 text-xs text-warning-500 dark:border-warning-500/70 dark:bg-amber-950/40 dark:text-warning-500">
                      {stockError}
                    </div>
                  )}
                  {!formVisible ? (
                    <p className="text-xs text-muted-light dark:text-muted-dark italic py-2">
                      Click <strong>New</strong> to create a bill, or click <strong>Edit</strong> on a bill below to modify it.
                    </p>
                  ) : (
                    <form id="bill-form" onSubmit={handleSubmit} className="space-y-4 text-sm">
                      {/* ── Header Fields ── */}
                      <div className="bg-slate-50 dark:bg-slate-900/50 border rounded-lg p-4 shadow-sm mb-4">
                        <div className="flex items-center justify-between mb-3 border-b border-slate-200 dark:border-slate-800 pb-2">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">Purchase Header</h3>
                            {/* Purchase Ledger Badge — always visible in header row */}
                            {effectivePurchaseLedger ? (
                              <div className="flex items-center gap-1.5 px-0.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                                <svg className="w-3 h-3 text-indigo-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[10px] text-slate-400 font-semibold">Ledger:</span>
                                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300">{effectivePurchaseLedger.name}</span>
                                <span className="text-[9px] font-mono bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-400 px-1 py-0.5 rounded">
                                  #{effectivePurchaseLedger.id}
                                </span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 px-0.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                                <svg className="w-3 h-3 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">No purchase ledger set</span>
                              </div>
                            )}

                            {/* Date Display SelectionDropdown */}
                            <div className="flex flex-col items-start justify-start gap-1 ml-2 border-l border-slate-200 dark:border-slate-800 pl-3 self-start min-h-[50px]">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Date Display</label>
                              <Select
                                value={calendarDisplayMode}
                                onChange={(e) => setDisplayMode(e.target.value as any)}
                                className="h-9 mt-0.5 px-0.5 text-xs font-bold text-left w-[80px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm focus:ring-1 focus:ring-indigo-400 hover:border-indigo-300 transition-all cursor-pointer"
                              >
                                <option value="AD">AD</option>
                                <option value="BS">BS</option>
                              </Select>
                            </div>

                            {/* Purchase Type SelectionDropdown */}
                            <div className="flex flex-col items-start justify-start gap-1 ml-2 border-l border-slate-200 dark:border-slate-800 pl-3 self-start min-h-[50px]">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Purchase Type</label>
                              <Select
                                value={purchaseType}
                                onChange={(e) => setPurchaseType(e.target.value as any)}
                                className="h-9 mt-0.5 px-0.5 text-xs font-bold text-left w-[100px] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-md shadow-sm focus:ring-1 focus:ring-indigo-400 hover:border-indigo-300 transition-all cursor-pointer"
                              >
                                <option value="LOCAL">LOCAL</option>
                                <option value="IMPORT">IMPORT</option>
                              </Select>
                            </div>
                            

                          </div>

                          <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                              <input
                                type="checkbox"
                                checked={showDepartment}
                                onChange={(e) => {
                                  setShowDepartment(e.target.checked);
                                  if (!e.target.checked) setDepartmentId("");
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Dept</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                              <input
                                type="checkbox"
                                checked={showProject}
                                onChange={(e) => {
                                  setShowProject(e.target.checked);
                                  if (!e.target.checked) setProjectId("");
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Proj</span>
                            </label>
                            <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                              <input
                                type="checkbox"
                                checked={showSegment}
                                onChange={(e) => {
                                  setShowSegment(e.target.checked);
                                  if (!e.target.checked) setSegmentId("");
                                }}
                                className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span>Seg</span>
                            </label>
                          </div>
                        </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-x-3 gap-y-4">
                          {/* Supplier */}
                          <div className="md:col-span-2 flex flex-col gap-1">
                            <label className="flex items-center justify-between text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                              <span className="text-indigo-600 dark:text-indigo-400">Supplier</span>
                              <button type="button"
                                className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/60 transition-colors"
                                onClick={() => { if (!companyId) return; saveDraft(); router.push(`/companies/${companyId}/purchases/suppliers?returnTo=${encodeURIComponent(pathname || "")}`); }}
                              >+ New</button>
                            </label>
                            <SearchableSelect className="w-full" triggerClassName="h-9 px-3 py-2 text-xs ring-1 ring-indigo-200 dark:ring-indigo-800/50 focus-within:ring-indigo-400"
                              options={suppliers?.map((s: any) => ({ value: String(s.id), label: `#${s.id} - ${s.name}` })) || []}
                              pinnedOptions={[{ value: "__add_supplier__", label: "+ Add New Supplier", sublabel: "Create a new supplier record" }]}
                              value={supplierId}
                              onChange={(val) => {
                                if (val === "__add_supplier__") setIsQuickSupplierModalOpen(true);
                                else setSupplierId(val);
                              }}
                              placeholder="Select supplier" />
                            <SupplierBalanceBadge companyId={companyId} supplierId={supplierId} />
                          </div>

                          {/* Date (Booking) */}
                          <div className="md:col-span-2 flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-violet-600 dark:text-violet-400 whitespace-nowrap">Voucher Date <span className="text-red-500">*</span></label>
                            {calendarDisplayMode === 'BOTH' ? (
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none z-10 transition-colors">AD</span>
                                  <Input type="date"
                                    calendarMode="AD"
                                    forceNative={false}
                                    className="h-9 w-full pl-6 text-[10px] text-center"
                                    value={date}
                                    min={cc?.fiscal_year_start || ""}
                                    max={cc?.fiscal_year_end || ""}
                                    onChange={(e) => handleDateChangeAD(e.target.value)} required />

                                </div>
                                <div className="relative flex-1">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none z-10 transition-colors">BS</span>
                                  <Input type="date"
                                    calendarMode="BS"
                                    forceNative={false}
                                    className="h-9 w-full pl-6 text-[10px] text-center"
                                    value={safeADToBS(date) || ""}
                                    min={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                                    max={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
                                    onChange={(e) => handleDateChangeBS(e.target.value)} required />

                                </div>
                              </div>
                            ) : isBS ? (
                              <Input type="date"
                                calendarMode="BS"
                                forceNative={false}
                                className="w-full h-9 border-violet-200 dark:border-violet-800/50 text-xs"
                                value={safeADToBS(date) || ""} onChange={(e) => handleDateChangeBS(e.target.value)} required />
                            ) : (
                              <Input type="date"
                                calendarMode="AD"
                                forceNative={false}
                                className="w-full h-9 border-violet-200 dark:border-violet-800/50 text-xs"
                                value={date} onChange={(e) => handleDateChangeAD(e.target.value)} required />
                            )}
                          </div>

                          {/* Bill Date (Reference) */}
                          <div className="md:col-span-2 flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-violet-600 dark:text-violet-400 whitespace-nowrap">Bill Date</label>
                            <div className="flex flex-col gap-1.5">
                              {calendarDisplayMode === "BOTH" ? (
                                <div className="flex items-center gap-1">
                                  <div className="relative flex-1">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none z-10 transition-colors">AD</span>
                                    <Input type="date"
                                      calendarMode="AD"
                                      forceNative={false}
                                      className="h-9 w-full pl-6 text-[10px] text-center"
                                      value={billDate}
                                      min={cc?.fiscal_year_start || ""}
                                      max={cc?.fiscal_year_end || ""}
                                      onChange={(e) => setBillDate(e.target.value)} />

                                  </div>
                                  <div className="relative flex-1">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none z-10 transition-colors">BS</span>
                                    <Input
                                      type="date"
                                      calendarMode="BS"
                                      forceNative={false}
                                      className="h-9 w-full pl-6 text-[10px] text-center"
                                      value={safeADToBS(billDate) || ""}
                                      min={company?.fiscal_year_start ? (safeADToBS(company.fiscal_year_start) || "") : ""}
                                      max={company?.fiscal_year_end ? (safeADToBS(company.fiscal_year_end) || "") : ""}
                                      onChange={(e) => {
                                        const ad = safeBSToAD(e.target.value);
                                        if (ad) setBillDate(ad);
                                      }}
                                    />
                                  </div>

                                </div>
                              ) : isBS ? (
                                <Input
                                  type="date"
                                  calendarMode="BS"
                                  forceNative={false}
                                  className="w-full h-9 border-violet-200 dark:border-violet-800/50 text-xs"
                                  value={safeADToBS(billDate) || ""}
                                  min={company?.fiscal_year_start ? (safeADToBS(company.fiscal_year_start) || "") : ""}
                                  max={company?.fiscal_year_end ? (safeADToBS(company.fiscal_year_end) || "") : ""}
                                  onChange={(e) => {
                                    const ad = safeBSToAD(e.target.value);
                                    if (ad) setBillDate(ad);
                                  }}
                                />

                              ) : (
                                <Input type="date"
                                  calendarMode="AD"
                                  forceNative={false}
                                  className="w-full h-9 border-violet-200 dark:border-violet-800/50 text-xs"
                                  value={billDate}
                                  min={cc?.fiscal_year_start || ""}
                                  max={cc?.fiscal_year_end || ""}
                                  onChange={(e) => setBillDate(e.target.value)} />

                              )}
                            </div>
                          </div>

                          {/* Due Date (Credit Only) relocated after Bill Date */}
                          {!paymentModeId && (
                            <div className="md:col-span-2 flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-rose-600 dark:text-rose-400">Due Date</label>
                              {calendarDisplayMode === 'BOTH' ? (
                                <div className="flex gap-2">
                                  <div className="relative flex-1">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none z-10 transition-colors">AD</span>
                                    <Input type="date"
                                      calendarMode="AD"
                                      forceNative={false}
                                      className="h-9 w-full pl-6 text-[10px] text-center"
                                      value={dueDate}
                                      min={cc?.fiscal_year_start || ""}
                                      max={cc?.fiscal_year_end || ""}
                                      onChange={(e) => {
                                        setDueDate(e.target.value);
                                        setDueDateTouched(true);
                                      }}
                                      required />

                                  </div>
                                  <div className="relative flex-1">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none z-10 transition-colors">BS</span>
                                    <Input type="date"
                                      calendarMode="BS"
                                      forceNative={false}
                                      className="h-9 w-full pl-6 text-[10px] text-center"
                                      value={safeADToBS(dueDate) || ""}
                                      onChange={(e) => {
                                        const ad = safeBSToAD(e.target.value);
                                        if (ad) {
                                          setDueDate(ad);
                                          setDueDateTouched(true);
                                        }
                                      }}
                                      required />
                                  </div>
                                </div>
                              ) : isBS ? (
                                <Input
                                  type="date"
                                  calendarMode="BS"
                                  forceNative={false}
                                  className="w-full h-9 border-rose-200 dark:border-rose-800/50 text-xs"
                                  value={safeADToBS(dueDate) || ""}
                                  min={company?.fiscal_year_start ? (safeADToBS(company.fiscal_year_start) || "") : ""}
                                  max={company?.fiscal_year_end ? (safeADToBS(company.fiscal_year_end) || "") : ""}
                                  onChange={(e) => {
                                    const ad = safeBSToAD(e.target.value);
                                    if (ad) {
                                      setDueDate(ad);
                                      setDueDateTouched(true);
                                    }
                                  }}
                                />

                              ) : (
                                <Input
                                  type="date"
                                  calendarMode="AD"
                                  forceNative={false}
                                  className="w-full h-9 border-rose-200 dark:border-rose-800/50 text-xs"
                                  value={dueDate}
                                  min={cc?.fiscal_year_start || ""}
                                  max={cc?.fiscal_year_end || ""}
                                  onChange={(e) => {
                                    setDueDate(e.target.value);
                                    setDueDateTouched(true);
                                  }}
                                />

                              )}
                            </div>
                          )}

                          {/* Ref */}
                          <div className="md:col-span-2 flex flex-col gap-1">
                            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-purple-600 dark:text-purple-400">Ref.</label>
                            <Input
                              className="w-full h-9 border border-purple-200 dark:border-purple-800/50 rounded-md px-3 py-2 text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400 placeholder-slate-400 font-mono"
                              value={reference} onChange={(e) => setReference(e.target.value)} placeholder="#" />
                          </div>
                          {/* Payment Mode */}
                          <div className="md:col-span-2 flex flex-col gap-1 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-teal-600 dark:text-teal-400">
                                Mode
                              </label>
                              {ledgerBalance !== null && (isCashModeSelected || isBankModeSelected) && (
                                <div className={`animate-in fade-in zoom-in-95 duration-200 px-1.5 py-0.5 rounded text-[9px] font-bold border shadow-sm ${
                                  isCashModeSelected 
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/30 dark:border-emerald-800 dark:text-emerald-400"
                                    : "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-400"
                                }`}>
                                  {Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {ledgerBalance >= 0 ? 'Dr' : 'Cr'}
                                </div>
                              )}
                            </div>
                            <Select name="payment_mode_id"
                              className="h-9 border border-teal-200 dark:border-teal-800/50 rounded-md text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-400 w-full"
                              value={paymentModeId} onChange={(e) => setPaymentModeId(e.target.value)}>
                              <option value="">Credit (Accounts Payable)</option>
                              {paymentModes?.map((pm: any) => (<option key={pm.id} value={pm.id}>{pm.name}</option>))}
                            </Select>
                          </div>

                          {/* Department Selector */}
                          {showDepartment && (
                            <div className="md:col-span-2 xl:col-span-2 flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Department</label>
                              <Select
                                className="w-full h-9 border border-indigo-200 dark:border-indigo-800/50 rounded-md text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                value={departmentId}
                                onChange={(e) => {
                                  if (e.target.value === 'ADD_NEW') {
                                    setPendingCostCenterAction({ type: 'dept', lineIdx: 'header' });
                                    setIsQuickDeptModalOpen(true);
                                    return;
                                  }
                                  setDepartmentId(e.target.value)
                                }}
                                required={showDepartment}
                              >
                                <option value="">Select Dept...</option>
                                <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                {(departments || []).map((d: any) => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </Select>
                            </div>
                          )}

                          {/* Project Selector */}
                          {showProject && (
                            <div className="md:col-span-2 xl:col-span-2 flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Project</label>
                              <Select
                                className="w-full h-9 border border-indigo-200 dark:border-indigo-800/50 rounded-md text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                value={projectId}
                                onChange={(e) => {
                                  if (e.target.value === 'ADD_NEW') {
                                    setPendingCostCenterAction({ type: 'proj', lineIdx: 'header' });
                                    setIsQuickProjModalOpen(true);
                                    return;
                                  }
                                  setProjectId(e.target.value)
                                }}
                                required={showProject}
                              >
                                <option value="">Select Proj...</option>
                                <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                {(projects || []).map((p: any) => (
                                  <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                              </Select>
                            </div>
                          )}

                          {/* Segment Selector */}
                          {showSegment && (
                            <div className="md:col-span-2 xl:col-span-2 flex flex-col gap-1">
                              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Segment</label>
                              <Select
                                className="w-full h-9 border border-indigo-200 dark:border-indigo-800/50 rounded-md text-xs bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                value={segmentId}
                                onChange={(e) => {
                                  if (e.target.value === 'ADD_NEW') {
                                    setPendingCostCenterAction({ type: 'seg', lineIdx: 'header' });
                                    setIsQuickSegModalOpen(true);
                                    return;
                                  }
                                  setSegmentId(e.target.value)
                                }}
                                required={showSegment}
                              >
                                <option value="">Select Seg...</option>
                                <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add</option>
                                {(segments || []).map((s: any) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </Select>
                            </div>
                          )}
                        </div>

                        {/* Purchase Ledger Badge — always visible in header to identify the booking ledger */}
                        <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center gap-3">
                          {effectivePurchaseLedger ? (
                            <div className="flex items-center gap-2 px-0.5 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                              <svg className="w-3.5 h-3.5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tight">Purchase Ledger:</span>
                              <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                                {effectivePurchaseLedger.name}
                              </span>
                              <span className="text-[10px] font-mono bg-indigo-100 dark:bg-indigo-800 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded">
                                ID: {effectivePurchaseLedger.id}
                              </span>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 px-0.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/40">
                              <svg className="w-3.5 h-3.5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                              </svg>
                              <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">No default purchase ledger set</span>
                            </div>
                          )}
                          <p className="text-[10px] text-slate-400 italic">
                            {editingId
                              ? "Accounting entries for this bill are posted to the above ledger."
                              : "Accounting entries for this bill will be posted to the above default ledger."}
                          </p>
                        </div>

                        {/* Bank Details (Bank Selection only) */}
                        {isBankModeSelected && (
                          <div className="animate-in fade-in slide-in-from-top-1 duration-200 p-3 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              <div className="md:col-span-5 flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-blue-600 dark:text-blue-400">Bank Account & Balance</label>
                                <div className="flex gap-2">
                                  <Select value={selectedBankLedgerId} onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                                    className="h-9 border border-blue-200 dark:border-blue-800/50 rounded-md text-xs bg-white dark:bg-slate-900 flex-1">
                                    <option value="">Select Bank Account...</option>
                                    {bankLedgers.map((bl: any) => (
                                      <option key={bl.id} value={bl.id}>{bl.name}</option>
                                    ))}
                                  </Select>
                                  <div className="h-9 flex items-center px-3 rounded-md bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-[10px] font-bold text-blue-700 dark:text-blue-300 shadow-sm whitespace-nowrap min-w-[100px]">
                                    {ledgerBalance !== null ? `${Math.abs(ledgerBalance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${ledgerBalance >= 0 ? 'Dr' : 'Cr'}` : '—'}
                                  </div>
                                </div>
                              </div>
                              <div className="md:col-span-7 flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-blue-600 dark:text-blue-400">Bank Remark</label>
                                <Input
                                  value={bankRemark}
                                  onChange={(e) => setBankRemark(e.target.value)}
                                  placeholder="Cheque No / TXN ID..."
                                  className="h-9 text-xs"
                                />
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Cash Details (Hidden because balance moved to Mode watermark, but we still need the select if there are multiple accounts) */}
                        {isCashModeSelected && bankLedgers.length > 1 && (
                          <div className="animate-in fade-in slide-in-from-top-1 duration-200 p-3 bg-emerald-50/50 dark:bg-emerald-900/10 rounded-lg border border-emerald-100 dark:border-emerald-900/30 mt-4">
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                              <div className="md:col-span-12 flex flex-col gap-1">
                                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Select Cash Account</label>
                                <Select value={selectedBankLedgerId} onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                                  className="h-9 border border-emerald-200 dark:border-emerald-800/50 rounded-md text-xs bg-white dark:bg-slate-900 flex-1 max-w-sm">
                                  <option value="">Select Cash Account...</option>
                                  {bankLedgers.map((cl: any) => (
                                    <option key={cl.id} value={cl.id}>{cl.name}</option>
                                  ))}
                                </Select>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* ── Items Table ── */}
                      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="overflow-x-auto relative">
                          <table className="w-full text-xs table-fixed border-separate border-spacing-0">
                            <thead className="sticky top-0 z-20 bg-slate-100 dark:bg-slate-900 shadow-sm">
                              <tr className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-bold">
                                  <th className="text-left py-2 px-0.5 w-[24%] border-b dark:border-slate-800">
                                    <div className="flex items-center justify-between">
                                      <span>Select Product</span>
                                    <button
                                      type="button"
                                      className="text-[10px] text-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:underline font-normal normal-case tracking-normal focus:outline-none"
                                      onClick={() => {
                                        if (!companyId) return;
                                        saveDraft();
                                        const returnTo = encodeURIComponent(pathname || "");
                                        router.push(
                                          `/companies/${companyId}/inventory/items?returnTo=${returnTo}&itemLineIndex=${lines.length - 1}`
                                        );
                                      }}
                                    >
                                      + New
                                    </button>
                                  </div>
                                </th>
                                <th className="text-left py-2 px-0.5 w-[10%] border-b dark:border-slate-800">HS Code</th>
                                <th className="text-left py-2 px-0.5 w-[11%] border-b dark:border-slate-800">Warehouse</th>
                                <th className="text-left py-2 px-0.5 w-[8%] border-b dark:border-slate-800">Unit</th>
                                <th className="text-right py-2 px-0.5 w-[8%] border-b dark:border-slate-800">Qty</th>
                                <th className="text-right py-2 px-0.5 w-[9%] border-b dark:border-slate-800">Rate</th>
                                <th className="text-right py-2 px-0.5 w-[7%] border-b dark:border-slate-800">Disc</th>
                                 <th className="text-right py-2 px-0.5 w-[8%] border-b dark:border-slate-800">TAX</th>
                                <th className="text-right py-2 px-0.5 w-[9%] border-b dark:border-slate-800">Total</th>
                                {showProject && <th className="text-left py-2 px-0.5 w-[10%] border-b dark:border-slate-800">Project</th>}
                                {showSegment && <th className="text-left py-2 px-0.5 w-[10%] border-b dark:border-slate-800">Segment</th>}
                                <th className="text-left py-2 px-0.5 w-[12%] border-b dark:border-slate-800">Remarks</th>
                                <th className="text-center py-2 px-0.5 w-[5%] border-b dark:border-slate-800"><span className="sr-only">Del</span></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {lines.map((line, idx) => (
                                <tr key={idx} className={`transition-colors ${idx % 2 === 0 ? "bg-white dark:bg-slate-950" : "bg-slate-50/60 dark:bg-slate-900/30"}`}>
                                  <td className="py-1 px-0.5 w-[26%]">
                                    <div className="flex gap-1 items-center">
                                      <SearchableSelect
                                        className="flex-1 min-w-0"
                                        triggerClassName="h-10 !py-1 px-3 text-xs"
                                        options={
                                          items?.map((it: any) => {
                                            const available = line.warehouse_id
                                              ? getAvailableForLine(
                                                { ...line, item_id: String(it.id) },
                                                stockMap
                                              )
                                              : getTotalForItem(Number(it.id), stockMap);
                                            return {
                                              value: String(it.id),
                                              label: `${it.name}`,
                                              sublabel: `#${it.id}${available != null ? ` · Stock: ${available}` : ""}`,
                                            };
                                          }) || []
                                        }
                                        pinnedOptions={[{ value: "__add_item__", label: "+ Add New Product / Service", sublabel: "Create a new item record" }]}
                                        value={line.item_id}
                                        onChange={(val) => {
                                          if (val === "__add_item__") { setPendingItemLineIdx(idx); setIsQuickItemModalOpen(true); }
                                          else handleItemChange(idx, val);
                                        }}
                                        placeholder="Select product or service"
                                      />
                                    </div>
                                    {line.item_id && (
                                      <div className="mt-1.5 flex items-center gap-1.5 px-1 bg-slate-50 dark:bg-slate-800/50 py-1 rounded w-fit border border-slate-100 dark:border-slate-700">
                                        <svg className="w-3 h-3 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                                        <span className="text-[10px] font-semibold text-slate-500">Available QTY:</span>
                                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-400">
                                          {line.warehouse_id
                                            ? getAvailableForLine(line, stockMap)
                                            : getTotalForItem(Number(line.item_id), stockMap)}
                                        </span>
                                      </div>
                                    )}
                                  </td>
                                  <td className="py-1 px-0.5 w-[10%]">
                                    <HSCodeCell
                                      companyId={companyId}
                                      itemId={line.item_id}
                                      value={line.hs_code || ""}
                                      onChange={(val) => handleLineChange(idx, "hs_code", val)}
                                    />
                                  </td>
                                  <td className="py-1 px-0.5 w-[13%]">
                                    {(() => {
                                      const item = items?.find((it: any) => String(it.id) === line.item_id);
                                      const isService = item?.category?.toLowerCase() === "service";
                                      if (isService) {
                                        return <div className="text-[10px] text-slate-400 italic px-0.5">N/A (Svc)</div>;
                                      }
                                      return (
                                        <select
                                          className="w-full h-11 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 bg-surface-light dark:bg-slate-900"
                                          value={line.warehouse_id ?? ""}
                                          onChange={(e) => handleLineChange(idx, "warehouse_id", e.target.value)}
                                        >
                                          <option value="">Select warehouse</option>
                                          {warehouses?.map((w) => {
                                            const stock = line.item_id ? getAvailableForLine({ ...line, warehouse_id: String(w.id) }, stockMap) : null;
                                            return (
                                              <option key={w.id} value={w.id}>
                                                {`${w.name}${stock != null ? ` (Qty: ${stock})` : ""}`}
                                              </option>
                                            );
                                          })}
                                        </select>
                                      );
                                    })()}
                                  </td>

                                  <td className="py-1 px-0.5 w-[8%]">
                                    {line.units && line.units.length > 0 ? (
                                      <select
                                        className="w-full h-11 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 bg-surface-light dark:bg-slate-900"
                                        value={line.selected_unit_code ?? ""}
                                        onChange={(e) => handleUnitChange(idx, e.target.value)}
                                      >
                                        {line.units.map((u) => (
                                          <option key={u.id} value={u.unit_code}>
                                            {u.unit_code}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <div className="w-full h-10 border border-transparent rounded-md px-0.5 py-1 flex items-center text-xs text-muted-light dark:text-muted-dark bg-surface-light dark:bg-slate-900">Base unit</div>
                                    )}
                                  </td>
                                  <td className="py-1 px-0.5 text-right w-[8%]">
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-full h-10 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 text-right bg-surface-light dark:bg-slate-900"
                                      value={line.quantity}
                                      onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                                      title={line.item_id && line.warehouse_id
                                        ? `Available in warehouse: ${getAvailableForLine(line, stockMap)}`
                                        : undefined}
                                    />

                                  </td>
                                  <td className="py-1 px-0.5 text-right w-[9%]">
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-full h-11 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 text-right bg-surface-light dark:bg-slate-900"
                                      value={line.rate}
                                      onChange={(e) => handleLineChange(idx, "rate", e.target.value)}
                                    />
                                  </td>

                                  <td className="py-1 px-0.5 text-right w-[7%]">
                                    <input
                                      type="number"
                                      step="0.01"
                                      className="w-full h-11 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 text-right bg-surface-light dark:bg-slate-900"
                                      value={line.discount}
                                      onChange={(e) => handleLineChange(idx, "discount", e.target.value)}
                                    />
                                  </td>
                                  <td className="py-1 px-0.5 text-right w-[7%]">
                                    <select
                                      className="w-full h-11 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 bg-surface-light dark:bg-slate-900 text-xs"
                                      value={line.duty_tax_id ?? ""}
                                      onChange={(e) => {
                                        handleLineChange(idx, "duty_tax_id", e.target.value);
                                        // If a duty tax is selected, derive tax_rate from it
                                        const dt = dutyTaxes?.find(t => String(t.id) === e.target.value);
                                        if (dt) handleLineChange(idx, "tax_rate", String(dt.rate));
                                        else handleLineChange(idx, "tax_rate", "0");
                                      }}
                                    >

                                      {(dutyTaxes || []).filter(t => !t.tds_type).map((dt) => (
                                        <option key={dt.id} value={dt.id}>{dt.name}</option>
                                      ))}
                                    </select>
                                    {/* Tax sub-row */}
                                    {(() => {
                                      const dt = dutyTaxes?.find(t => String(t.id) === line.duty_tax_id);
                                      if (!dt) return null;
                                      const effectiveRate = dt.rate;
                                      const base = Number(line.quantity||0)*Number(line.rate||0)-Number(line.discount||0);
                                      
                                      if (effectiveRate <= 0) {
                                        return (
                                          <div className="mt-0.5 text-[9px] font-semibold text-slate-500 dark:text-slate-400 text-right pr-1 whitespace-nowrap">
                                            Non Taxable: {base.toFixed(2)}
                                          </div>
                                        );
                                      }
                                      
                                      const taxAmt = (base * effectiveRate) / 100;
                                      return (
                                        <div className="mt-0.5 text-[9px] font-semibold text-emerald-600 dark:text-emerald-400 text-right pr-1 whitespace-nowrap leading-tight">
                                          VAT: {taxAmt.toFixed(2)}
                                        </div>
                                      );
                                    })()}
                                  </td>
                                  <td className="py-1 px-0.5 text-right w-[9%]">
                                    <span className="font-semibold text-indigo-700 dark:text-indigo-300">{lineTotal(line).toFixed(2)}</span>
                                  </td>
                                  {showProject && (
                                    <td className="py-1 px-0.5 w-[10%]">
                                      <Select
                                        className="w-full h-10 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 text-xs bg-surface-light dark:bg-slate-900"
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
                                        {(projects || []).map((p: any) => (
                                          <option key={p.id} value={p.id}>{p.name}</option>
                                        ))}
                                      </Select>
                                    </td>
                                  )}
                                  {showSegment && (
                                    <td className="py-1 px-0.5 w-[10%]">
                                      <Select
                                        className="w-full h-10 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 text-xs bg-surface-light dark:bg-slate-900"
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
                                        {(segments || []).map((s: any) => (
                                          <option key={s.id} value={s.id}>{s.name}</option>
                                        ))}
                                      </Select>
                                    </td>
                                  )}
                                  <td className="py-1 px-0.5 w-[12%]">
                                    <input
                                      type="text"
                                      className="w-full h-10 border border-border-light dark:border-border-dark rounded-md px-0.5 py-1 text-xs bg-surface-light dark:bg-slate-900"
                                      placeholder="Remarks"
                                      value={line.remarks || ""}
                                      onChange={(e) => handleLineChange(idx, "remarks", e.target.value)}
                                    />
                                  </td>
                                  <td className="py-1 px-0.5 text-center w-[5%]">
                                    <button type="button" onClick={() => removeLine(idx)}
                                      className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-red-100 hover:bg-red-500 text-red-600 hover:text-white dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-600 dark:hover:text-white transition-all duration-150"
                                      title="Remove line">
                                      <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                    </button>
                                  </td>
                                </tr>
                              ))}
                             </tbody>
                             <tfoot className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800">
                               <tr>
                                 <td colSpan={8} className="py-2.5 px-4 text-right">
                                   <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Subtotal</span>
                                 </td>
                                 <td className="py-2.5 px-0.5 text-right">
                                   <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                     {totals.subtotal.toFixed(2)}
                                   </span>
                                 </td>
                                 <td colSpan={2 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                               </tr>
                               {totals.taxTotal > 0 && (
                                 <tr>
                                   <td colSpan={8} className="py-1 px-4 text-right">
                                     <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest">VAT Total</span>
                                   </td>
                                   <td className="py-1 px-0.5 text-right">
                                     <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                       {totals.taxTotal.toFixed(2)}
                                     </span>
                                   </td>
                                   <td colSpan={2 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                                 </tr>
                               )}
                               <tr className="border-t border-slate-200 dark:border-slate-700 bg-indigo-50/30 dark:bg-indigo-900/10">
                                 <td colSpan={8} className="py-2.5 px-4 text-right">
                                   <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Grand Total</span>
                                 </td>
                                 <td className="py-2.5 px-0.5 text-right">
                                   <span className="text-base font-black text-indigo-600 dark:text-indigo-400">
                                     {(totals.subtotal + totals.taxTotal).toFixed(2)}
                                   </span>
                                 </td>
                                 <td colSpan={2 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                               </tr>
                               {applyTds && (
                                 <tr className="bg-rose-50/20 dark:bg-rose-900/10">
                                   <td colSpan={8} className="py-1.5 px-4 text-right align-middle">
                                     <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest italic leading-none">TDS Deduction</span>
                                   </td>
                                   <td className="py-1.5 px-0.5 text-right flex justify-end">
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
                                   <td colSpan={2 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                                 </tr>
                               )}
                               {totals.tdsAmount > 0 && (
                                 <tr className="border-t border-slate-200 dark:border-slate-800 bg-emerald-50/30 dark:bg-emerald-900/20">
                                   <td colSpan={8} className="py-2 px-4 text-right">
                                     <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Net Payable</span>
                                   </td>
                                   <td className="py-2 px-0.5 text-right">
                                     <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                       {totals.grandTotal.toFixed(2)}
                                     </span>
                                   </td>
                                   <td colSpan={2 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                                 </tr>
                               )}
                             </tfoot>
                          </table>
                        </div>
                      </div>

                      {/* ── Add Line + Totals ── */}
                      <div className="flex flex-wrap justify-between items-center gap-3 mt-1">
                        <div className="flex flex-col gap-2">
                          <button type="button" onClick={addLine}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-indigo-400 dark:border-indigo-600 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30 text-xs font-medium transition-colors">
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                            Add Line
                          </button>
                          
                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-fit shadow-sm">
                            <input
                              id="apply-tds-footer"
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={applyTds}
                              onChange={(e) => setApplyTds(e.target.checked)}
                            />
                            <label htmlFor="apply-tds-footer" className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest cursor-pointer">
                              Deduct TDS
                            </label>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs flex-wrap">
                          <span className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium">Subtotal: <strong>{totals.subtotal.toFixed(2)}</strong></span>
                          {totals.taxableTotal > 0 && (
                            <span className="px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800/50 font-medium">Taxable Subtotal: <strong>{totals.taxableTotal.toFixed(2)}</strong></span>
                          )}
                          {totals.nonTaxableTotal > 0 && (
                            <span className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700/50 font-medium">Non Taxable Subtotal: <strong>{totals.nonTaxableTotal.toFixed(2)}</strong></span>
                          )}
                          {totals.discountTotal > 0 && (
                            <span className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 font-medium">Discount Subtotal: <strong>{totals.discountTotal.toFixed(2)}</strong></span>
                          )}
                          {totals.taxTotal > 0 && (
                            <span className="px-3 py-1.5 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/50 font-medium">VAT: <strong>{totals.taxTotal.toFixed(2)}</strong></span>
                          )}
                          <span className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold shadow-sm">Grand Total: {(totals.subtotal + totals.taxTotal).toFixed(2)}</span>
                          {totals.tdsAmount > 0 && (
                            <>
                              <span className="px-3 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/50 font-medium italic">TDS: <strong>-{totals.tdsAmount.toFixed(2)}</strong></span>
                              <span className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-semibold shadow-md">Net Payable: {totals.grandTotal.toFixed(2)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {(() => {
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
                              {/* icon + label */}
                              <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" /><path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                              </svg>
                              <span className="font-semibold text-slate-600 dark:text-slate-300">Payment</span>

                              {/* status badge */}
                              <span className={`rounded-full px-0.5 py-0.5 text-[10px] font-bold ${settlement.isCashOrBank ? "bg-emerald-500 text-white" : "bg-amber-400 text-white"
                                }`}>{settlement.statusLabel}</span>

                              {/* divider */}
                              <span className="w-px h-3 bg-slate-300 dark:bg-slate-600" />

                              {/* paid */}
                              <span className="text-slate-500 dark:text-slate-400">Paid:</span>
                              <span className="font-semibold text-emerald-700 dark:text-emerald-400">{settlement.paidAmount.toFixed(2)}</span>

                              {/* divider */}
                              <span className="w-px h-3 bg-slate-300 dark:bg-slate-600" />

                              {/* outstanding */}
                              <span className="text-slate-500 dark:text-slate-400">Outstanding:</span>
                              <span className="font-semibold text-amber-700 dark:text-amber-400">{settlement.outstandingAmount.toFixed(2)}</span>
                            </div>
                          </div>
                        );
                      })()}

                      <div className="flex justify-end">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-100 to-indigo-50 dark:from-slate-800 dark:to-indigo-950/30 border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-[11px] text-slate-600 dark:text-slate-300 italic">
                          <svg className="w-3 h-3 text-indigo-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                          {amountToWords(totals.grandTotal, "", "")}
                        </span>
                      </div>

                      <div>
                        <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 block mb-1">Narration / Notes</label>
                        <textarea
                          className="w-full border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-xs resize-none bg-slate-50 dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-300 dark:focus:ring-indigo-700 placeholder-slate-400"
                          rows={2}
                          placeholder="Optional notes about this bill..."
                          value={narration}
                          onChange={(e) => setNarration(e.target.value)}
                        />
                      </div>

                    </form>
                  )}
                </div>{/* end card body wrapper */}
              </Card>
            </div>
          )}
        </>
      )}

      {/* ═══ Re-Print Modal ═══ */}
      {showReprintModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReprintModal(false); }}
        >
          <div className="relative w-full max-w-xl mx-4 rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">

            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print a Bill</span>
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
                <input autoFocus type="text" placeholder="Search by bill # or reference..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                  value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Showing all bills{reprintSearch ? ` matching "${reprintSearch}"` : ""} — click <strong>View &amp; Print</strong> to open in a new tab.
              </p>
            </div>

            {/* Bill list */}
            <div className="px-5 pb-5 max-h-80 overflow-y-auto">
              {(() => {
                const q = reprintSearch.trim().toLowerCase();
                const modalBills = (bills as any[] || []).filter((b: any) => {
                  if (!q) return true;
                  return (
                    String(b.id).includes(q) ||
                    (b.reference || "").toLowerCase().includes(q) ||
                    supplierName(b.supplier_id).toLowerCase().includes(q)
                  );
                });
                if (!bills) return (
                  <div className="flex items-center gap-2 py-6 text-xs text-slate-400 justify-center">
                    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    Loading bills...
                  </div>
                );
                if (modalBills.length === 0) return (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No bills found matching your search.
                  </div>
                );
                return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-1">
                    {modalBills.map((b: any) => {
                      const total = billTotal(b);
                      return (
                        <div key={b.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 border border-teal-100 dark:border-teal-800/40">
                                #{b.id}
                              </span>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{supplierName(b.supplier_id)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                              <span className="font-medium text-slate-600 dark:text-slate-300">
                                {isBS ? safeADToBS(b.date) : b.date}
                              </span>
                              {!isBS && (
                                <span className="text-[10px] opacity-70">({safeADToBS(b.date)})</span>
                              )}
                              {isBS && (
                                <span className="text-[10px] opacity-70 font-mono">({b.date})</span>
                              )}
                              {b.reference && <span>· Ref: {b.reference}</span>}
                              {b.voucher_number && (
                                <span className="rounded bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 text-indigo-600 dark:text-indigo-300 border border-indigo-100 dark:border-indigo-800/40">
                                  Voucher {b.voucher_number}
                                </span>
                              )}
                              {b.purchase_ledger_name && (
                                <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 font-mono text-[9px]">
                                  L:{b.purchase_ledger_name} ({b.purchase_ledger_id})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 rounded-md px-0.5 py-0.5 border border-indigo-100 dark:border-indigo-800/40">
                              {total.toFixed(2)}
                            </span>
                            <a href={`/companies/${companyId}/purchases/bills/${b.id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-0.5 py-1.5 rounded-md bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-semibold shadow-sm transition-colors">
                              <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                              </svg>
                              View &amp; Print
                            </a>
                            {canUpdate && (
                              <button
                                type="button"
                                onClick={() => {
                                  startEdit(b);
                                  setShowReprintModal(false);
                                }}
                                className="inline-flex items-center gap-1 px-0.5 py-1.5 rounded-md bg-indigo-500 hover:bg-indigo-600 text-white text-[11px] font-semibold shadow-sm transition-colors"
                              >
                                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                                Edit
                              </button>
                            )}
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

      {/* ═══ Success Modal at Root ═══ */}
      {showSuccessModal && successBillInfo && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="relative w-full max-w-sm rounded-2xl bg-white dark:bg-slate-900 shadow-2xl overflow-hidden border border-emerald-100 dark:border-emerald-800/40 animate-in zoom-in-95 duration-200">
            {/* Top green header/accent */}
            <div className="h-1.5 w-full bg-emerald-500" />
            
            <div className="p-6 flex flex-col items-center text-center">
              {/* Success Icon */}
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/20">
                <svg className="w-8 h-8 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>

              <h3 className="mb-1 text-lg font-bold text-slate-800 dark:text-slate-100 uppercase tracking-tight">Save Successful</h3>
              <p className="mb-6 text-xs text-slate-500 dark:text-slate-400">Your purchase invoice has been recorded and booked into the ledger.</p>

              {/* Info Box */}
              <div className="w-full mb-6 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider text-left">Voucher & Bill Date</span>
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-mono font-bold text-slate-700 dark:text-slate-200">#{successBillInfo.id}</span>
                    <span className="text-[10px] font-bold text-slate-500">
                      V: {isBS ? safeADToBS(successBillInfo.date) : successBillInfo.date}
                    </span>
                    <span className="text-[10px] font-bold text-slate-500">
                      B: {isBS ? safeADToBS(successBillInfo.bill_date || successBillInfo.date) : (successBillInfo.bill_date || successBillInfo.date)}
                    </span>
                  </div>
                </div>
                {successBillInfo.voucher_number && (
                  <div className="flex items-center justify-between border-t border-slate-200/50 dark:border-slate-700/50 pt-3">
                    <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider">Voucher No.</span>
                    <div className="flex flex-col items-end">
                      <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 tracking-tighter">{successBillInfo.voucher_number}</span>
                      <span className="text-[9px] text-slate-400 italic font-medium">Accounting reference</span>
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-slate-200/50 dark:border-slate-700/50 pt-3">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Amount</span>
                  <span className="text-xs font-bold text-emerald-600 dark:text-emerald-300">{successBillInfo.total.toFixed(2)}</span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex w-full gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowSuccessModal(false);
                    setSuccessBillInfo(null);
                    resetForm(); // Ready for another bill creation
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm font-bold transition-all active:scale-[0.98]"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (successBillInfo?.id) {
                      window.open(`/companies/${companyId}/purchases/bills/${successBillInfo.id}`, '_blank');
                    }
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-sm font-bold shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                  </svg>
                  OK (Print)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {importPreview && (
        <ImportPreviewModal
          previewData={importPreview}
          onClose={() => setImportPreview(null)}
          onConfirm={handleConfirmImport}
          onUpdate={(id, updated) => setImportPreview(prev => prev ? prev.map(b => b.id === id ? updated : b) : null)}
          onRemove={(id) => setImportPreview(prev => prev ? prev.filter(b => b.id !== id) : null)}
          submitting={submitting}
          companyId={companyId}
          suppliers={suppliers}
          items={items}
          warehouses={warehouses}
          departments={departments}
          projects={projects}
          segments={segments}
          dutyTaxes={dutyTaxes}
        />
      )}
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
  companyId,
  suppliers = [],
  items = [],
  warehouses = [],
  departments = [],
  projects = [],
  segments = [],
  dutyTaxes = []
}: {
  previewData: any[];
  onClose: () => void;
  onConfirm: () => void;
  onUpdate: (id: number, updated: any) => void;
  onRemove: (id: number) => void;
  submitting: boolean;
  companyId: string;
  suppliers?: any[];
  items?: any[];
  warehouses?: any[];
  departments?: any[];
  projects?: any[];
  segments?: any[];
  dutyTaxes?: any[];
}) {
  const [bulkWarehouseId, setBulkWarehouseId] = React.useState("");

  const handleBulkWarehouse = (whId: string) => {
    if (!whId) return;
    const wh = warehouses.find(w => String(w.id) === whId);
    if (!wh) return;

    previewData.forEach(bill => {
      const newLines = bill.lines.map((l: any) => ({
        ...l,
        warehouse_id: wh.id,
        warehouse_name: wh.name
      }));
      onUpdate(bill.id, { 
        ...bill, 
        lines: newLines,
        errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("warehouse")),
        warnings: (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes("warehouse"))
      });
    });
    setBulkWarehouseId("");
  };

  const handleBulkItemFix = () => {
    previewData.forEach(bill => {
      let changed = false;
      const newLines = bill.lines.map((l: any) => {
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
        onUpdate(bill.id, { 
          ...bill, 
          lines: newLines,
          errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("item")),
          warnings: (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes("item"))
        });
      }
    });
  };
  const [creating, setCreating] = React.useState<{
    type: 'supplier' | 'item';
    name: string;
    billId: number;
    lineIdx?: number; // for item creation
  } | null>(null);
  const [createForm, setCreateForm] = React.useState<Record<string, string>>({});
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [createLoading, setCreateLoading] = React.useState(false);

  const openCreateSupplier = (name: string, billId: number) => {
    setCreating({ type: 'supplier', name, billId });
    setCreateForm({ name, phone: '', email: '', address: '' });
    setCreateError(null);
  };

  const openCreateItem = (name: string, billId: number, lineIdx: number) => {
    setCreating({ type: 'item', name, billId, lineIdx });
    setCreateForm({ name, code: '', category: 'General', unit: 'pcs', purchase_rate: '', sale_rate: '' });
    setCreateError(null);
  };

  const handleCreate = async () => {
    if (!creating) return;
    setCreateLoading(true);
    setCreateError(null);
    try {
      if (creating.type === 'supplier') {
        const res = await api.post(`/companies/${companyId}/suppliers`, {
          name: createForm.name,
          phone: createForm.phone || null,
          email: createForm.email || null,
          address: createForm.address || null,
        });
        const newSupplier = res.data;
        // Update all bills with this supplier name
        previewData.forEach(bill => {
          if (bill.supplier_name?.toLowerCase() === creating.name.toLowerCase()) {
            const updatedErrors = (bill.errors || []).filter((e: string) => !e.toLowerCase().includes('supplier'));
            const updatedWarnings = (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes('supplier'));
            onUpdate(bill.id, { ...bill, supplier_id: newSupplier.id, errors: updatedErrors, warnings: updatedWarnings });
          }
        });
      } else {
        // Create Item
        const res = await api.post(`/inventory/companies/${companyId}/items`, {
          name: createForm.name,
          code: createForm.code || null,
          category: createForm.category || 'General',
          unit: createForm.unit || 'pcs',
          default_purchase_rate: parseFloat(createForm.purchase_rate) || null,
          sale_rate: parseFloat(createForm.sale_rate) || null,
        });
        const newItem = res.data;
        // Update the specific line in the specific bill
        const bill = previewData.find(b => b.id === creating.billId);
        if (bill) {
          const newLines = bill.lines.map((line: any, idx: number) => {
            if (idx === creating.lineIdx && line.item_name?.toLowerCase() === creating.name.toLowerCase()) {
              return { ...line, item_id: newItem.id };
            }
            return line;
          });
          // Also update all other lines across all bills with this item name
          const updatedErrors = (bill.errors || []).filter((e: string) => !e.toLowerCase().includes(`item '${creating.name.toLowerCase()}'`));
          const updatedWarnings = (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes(`item '${creating.name.toLowerCase()}'`));
          onUpdate(bill.id, { ...bill, lines: newLines, errors: updatedErrors, warnings: updatedWarnings });
          // Also fix same item in other bills
          previewData.forEach(b => {
            if (b.id !== creating.billId) {
              const updatedLines = b.lines.map((line: any) =>
                line.item_name?.toLowerCase() === creating.name.toLowerCase()
                  ? { ...line, item_id: newItem.id }
                  : line
              );
              const bErrors = (b.errors || []).filter((e: string) => !e.toLowerCase().includes(`item '${creating.name.toLowerCase()}'`));
              const bWarnings = (b.warnings || []).filter((e: string) => !e.toLowerCase().includes(`item '${creating.name.toLowerCase()}'`));
              onUpdate(b.id, { ...b, lines: updatedLines, errors: bErrors, warnings: bWarnings });
            }
          });
        }
      }
      setCreating(null);
    } catch (err: any) {
      setCreateError(err?.response?.data?.detail || 'Failed to create. Please check the details.');
    } finally {
      setCreateLoading(false);
    }
  };

  const hasErrors = previewData.some(b => (b.errors?.length || 0) > 0);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-100">

        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <div>
            <h2 className="text-lg font-bold">Review Import Data</h2>
            <p className="text-xs text-slate-500">Previewing {previewData.length} purchase invoices from Excel</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto p-6">
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
              <div className="text-center py-12 text-slate-500 italic">No bills left in preview.</div>
            ) : (
              previewData.map((bill) => (
                <div key={bill.id} className={`border rounded-xl p-4 ${bill.errors?.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/20 dark:bg-red-900/10' : 'border-slate-200 dark:border-slate-800 shadow-sm bg-white dark:bg-slate-950'}`}>

                  {/* Bill Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 flex-1">
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Supplier <span className="text-red-500 font-black">*</span></label>
                        <div className="flex flex-col gap-1.5">
                          <select 
                            className={`w-full text-xs bg-white dark:bg-slate-950 border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-semibold ${!bill.supplier_id ? 'border-red-500 bg-red-50/50' : 'border-slate-200 dark:border-slate-800'}`}
                            value={bill.supplier_id || ""}
                            onChange={(e) => {
                              const sid = e.target.value;
                              const sname = suppliers?.find(s => String(s.id) === sid)?.name || "";
                              onUpdate(bill.id, { 
                                ...bill, 
                                supplier_id: sid ? Number(sid) : null,
                                supplier_name: sname,
                                errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("supplier"))
                              });
                            }}
                          >
                            <option value="">-- Select Supplier --</option>
                            {suppliers?.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                          {!bill.supplier_id && (
                            <button 
                              onClick={() => openCreateSupplier(bill.supplier_name, bill.id)}
                              className="text-[10px] text-blue-600 font-bold hover:underline w-fit"
                            >
                              + Create &quot;{bill.supplier_name}&quot; as new Supplier
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Date</label>
                        <input
                          type="date"
                          value={bill.date}
                          onChange={(e) => onUpdate(bill.id, { ...bill, date: e.target.value })}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 text-sm focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Reference</label>
                        <input
                          type="text"
                          value={bill.reference}
                          onChange={(e) => onUpdate(bill.id, { ...bill, reference: e.target.value })}
                          className="w-full bg-transparent border-b border-slate-200 dark:border-slate-700 text-sm focus:border-indigo-500 outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Mode</label>
                        <div className="text-sm font-medium text-slate-600 dark:text-slate-400">{bill.payment_mode_name || 'Credit'}</div>
                      </div>
                    </div>

                    <button onClick={() => onRemove(bill.id)} className="ml-4 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Remove this bill">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                  {((bill.errors || []).length > 0 || (bill.warnings || []).length > 0) && (
                    <div className="mb-4 p-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                      <div className="flex items-center gap-2 font-bold text-xs mb-2">
                        <svg className="w-4 h-4 text-slate-400" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                        Validation Issues
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {bill.errors?.map((err: string, i: number) => (
                          <div key={`err-${i}`} className="flex items-start gap-2 text-[10px] text-red-600 dark:text-red-400 bg-red-500/5 px-2 py-1.5 rounded-md border border-red-100 dark:border-red-900/30">
                            <span className="w-1 h-1 rounded-full bg-red-500 mt-1.5 shrink-0" />
                            <span className="font-bold uppercase text-[8px] mr-1">[Critical]</span> {err}
                          </div>
                        ))}
                        {bill.warnings?.map((warn: string, i: number) => (
                          <div key={`warn-${i}`} className="flex items-start gap-2 text-[10px] text-amber-600 dark:text-amber-400 bg-amber-500/5 px-2 py-1.5 rounded-md border border-amber-100 dark:border-amber-900/30">
                            <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                            <span className="font-bold uppercase text-[8px] mr-1">[Warning]</span> {warn}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Lines Table */}
                  <div className="overflow-x-auto overflow-hidden border border-slate-100 dark:border-slate-800 rounded-lg">
                    <table className="w-full text-xs text-left min-w-[900px]">
                      <thead className="bg-slate-50 dark:bg-slate-900">
                        <tr className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          <th className="px-3 py-2">Item <span className="text-red-500 font-black">*</span></th>
                          <th className="px-3 py-2">Qty <span className="text-red-500 font-black">*</span></th>
                          <th className="px-3 py-2">Rate <span className="text-red-500 font-black">*</span></th>
                          <th className="px-3 py-2">Disc</th>
                          <th className="px-3 py-2">Tax %</th>
                          <th className="px-3 py-2">HS Code</th>
                          <th className="px-3 py-2">Details</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {bill.lines.map((line: any, lidx: number) => {
                          const subtotal = (line.quantity * line.rate) - line.discount;
                          const tax = (subtotal * line.tax_rate) / 100;
                          const total = subtotal + tax;
                          return (
                            <tr key={lidx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1.5 min-w-[200px]">
                                  <select 
                                    className={`text-xs bg-white dark:bg-slate-900 border rounded px-2 py-1.5 outline-none focus:ring-2 focus:ring-blue-500 font-bold ${!line.item_id ? 'border-red-500 bg-red-50/50' : 'border-slate-200 dark:border-slate-800'}`}
                                    value={line.item_id || ""}
                                    onChange={(e) => {
                                      const iid = e.target.value;
                                      const iname = items.find(i => String(i.id) === iid)?.name || "";
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], item_id: iid ? Number(iid) : null, item_name: iname, item_suggestions: [] };
                                      onUpdate(bill.id, { 
                                        ...bill, 
                                        lines: newLines,
                                        errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("item") || !e.toLowerCase().includes(line.item_name.toLowerCase()))
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
                                      onClick={() => openCreateItem(line.item_name, bill.id, lidx)}
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
                                            const newLines = [...bill.lines];
                                            newLines[lidx] = { ...newLines[lidx], item_id: s.id, item_name: s.name, item_suggestions: [] };
                                            onUpdate(bill.id, { 
                                              ...bill, 
                                              lines: newLines,
                                              errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("item"))
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
                              <td className="px-3 py-2">
                                <input 
                                  type="number" 
                                  className="w-16 bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-center font-semibold text-xs"
                                  value={line.quantity}
                                  onChange={(e) => {
                                    const newLines = [...bill.lines];
                                    newLines[lidx] = { ...newLines[lidx], quantity: parseFloat(e.target.value) || 0 };
                                    onUpdate(bill.id, { ...bill, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input 
                                  type="number" 
                                  className="w-20 bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-center font-semibold text-xs"
                                  value={line.rate}
                                  onChange={(e) => {
                                    const newLines = [...bill.lines];
                                    newLines[lidx] = { ...newLines[lidx], rate: parseFloat(e.target.value) || 0 };
                                    onUpdate(bill.id, { ...bill, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input 
                                  type="number" 
                                  className="w-16 bg-transparent border-b border-slate-200 dark:border-slate-800 focus:border-blue-500 outline-none text-center font-semibold text-xs text-rose-600"
                                  value={line.discount}
                                  onChange={(e) => {
                                    const newLines = [...bill.lines];
                                    newLines[lidx] = { ...newLines[lidx], discount: parseFloat(e.target.value) || 0 };
                                    onUpdate(bill.id, { ...bill, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2 text-center">
                                <input 
                                  type="number" 
                                  className="w-12 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded px-1 py-0.5 font-bold text-[10px] text-center border-none focus:ring-1 focus:ring-blue-500 outline-none"
                                  value={line.tax_rate}
                                  onChange={(e) => {
                                    const newLines = [...bill.lines];
                                    newLines[lidx] = { ...newLines[lidx], tax_rate: parseFloat(e.target.value) || 0 };
                                    onUpdate(bill.id, { ...bill, lines: newLines });
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <div className="space-y-1">
                                  <input 
                                    type="text" 
                                    placeholder="HS Code"
                                    className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded px-1.5 py-0.5 text-[10px] text-slate-500 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={line.hs_code || ""}
                                    onChange={(e) => {
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], hs_code: e.target.value };
                                      onUpdate(bill.id, { ...bill, lines: newLines });
                                    }}
                                  />
                                  <textarea 
                                    placeholder="Remarks..."
                                    className="w-full bg-transparent border border-slate-100 dark:border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 italic leading-tight resize-none h-8 focus:ring-1 focus:ring-blue-500 outline-none"
                                    value={line.remarks || ""}
                                    onChange={(e) => {
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], remarks: e.target.value };
                                      onUpdate(bill.id, { ...bill, lines: newLines });
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1.5 min-w-[150px]">
                                  {/* Warehouse */}
                                  <select 
                                    className={`text-[9px] font-bold bg-white dark:bg-slate-900 border rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 ${!line.warehouse_id && line.warehouse_name ? 'border-amber-400 bg-amber-50/30' : 'border-slate-200 dark:border-slate-800'}`}
                                    value={line.warehouse_id || ""}
                                    onChange={(e) => {
                                      const wid = e.target.value;
                                      const wname = warehouses.find(w => String(w.id) === wid)?.name || "";
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], warehouse_id: wid ? Number(wid) : null, warehouse_name: wname };
                                      onUpdate(bill.id, { 
                                        ...bill, 
                                        lines: newLines,
                                        errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("warehouse"))
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
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], department_id: did ? Number(did) : null, department_name: dname };
                                      onUpdate(bill.id, { 
                                        ...bill, 
                                        lines: newLines,
                                        errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("department")),
                                        warnings: (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes("department"))
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
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], project_id: pid ? Number(pid) : null, project_name: pname };
                                      onUpdate(bill.id, { 
                                        ...bill, 
                                        lines: newLines,
                                        errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("project")),
                                        warnings: (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes("project"))
                                      });
                                    }}
                                  >
                                    <option value="">Proj: -- Select --</option>
                                    {projects.map(p => (
                                      <option key={p.id} value={p.id}>Proj: {p.name}</option>
                                    ))}
                                  </select>

                                  {/* Duty Tax */}
                                  <select 
                                    className={`text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border rounded px-1.5 py-1 outline-none focus:ring-1 focus:ring-indigo-500 ${!line.duty_tax_id && line.duty_tax_name ? 'border-amber-400 bg-amber-100/50' : 'border-indigo-100 dark:border-indigo-800/40'}`}
                                    value={line.duty_tax_id || ""}
                                    onChange={(e) => {
                                      const dtid = e.target.value;
                                      const dtname = dutyTaxes.find(t => String(t.id) === dtid)?.name || "";
                                      const newLines = [...bill.lines];
                                      newLines[lidx] = { ...newLines[lidx], duty_tax_id: dtid ? Number(dtid) : null, duty_tax_name: dtname };
                                      onUpdate(bill.id, { 
                                        ...bill, 
                                        lines: newLines,
                                        errors: (bill.errors || []).filter((e: string) => !e.toLowerCase().includes("duty tax")),
                                        warnings: (bill.warnings || []).filter((e: string) => !e.toLowerCase().includes("duty tax"))
                                      });
                                    }}
                                  >
                                    <option value="">Tax: -- Select --</option>
                                    {dutyTaxes.map(t => (
                                      <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                  </select>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right font-bold text-slate-900 dark:text-slate-100">{total.toFixed(2)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-900/50">
          <button onClick={onClose} className="px-5 py-2 text-sm font-bold text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200 transition-colors">
            Cancel
          </button>
          <div className="flex items-center gap-4">
            {hasErrors && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800/40 text-[11px] font-bold text-amber-600 dark:text-amber-400">
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                Create missing items/suppliers or remove bills to continue
              </div>
            )}
            <button
              onClick={onConfirm}
              disabled={submitting || previewData.length === 0 || hasErrors}
              className="px-8 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-bold shadow-xl shadow-indigo-500/20 transition-all flex items-center gap-2 active:scale-95"
            >
              {submitting ? <span className="w-4 h-4 border-2 border-white/50 border-t-transparent animate-spin rounded-full" /> : <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
              Approve & Save All
            </button>
          </div>
        </div>
      </div>

      {/* Inline Create Dialog */}
      {creating && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className={`h-1.5 w-full ${creating.type === 'supplier' ? 'bg-blue-500' : 'bg-emerald-500'}`} />
            <div className="p-6">
              <h3 className="text-base font-bold mb-1">
                Create New {creating.type === 'supplier' ? 'Supplier' : 'Item'}
              </h3>
              <p className="text-xs text-slate-500 mb-5">
                &quot;{creating.name}&quot; was not found. Fill in the details to create it.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Name *</label>
                  <input
                    autoFocus
                    type="text"
                    value={createForm.name || ''}
                    onChange={e => setCreateForm(f => ({ ...f, name: e.target.value }))}
                    className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {creating.type === 'supplier' && (
                  <>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Phone</label>
                      <input
                        type="text"
                        value={createForm.phone || ''}
                        onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Email</label>
                      <input
                        type="email"
                        value={createForm.email || ''}
                        onChange={e => setCreateForm(f => ({ ...f, email: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Optional"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Address</label>
                      <input
                        type="text"
                        value={createForm.address || ''}
                        onChange={e => setCreateForm(f => ({ ...f, address: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder="Optional"
                      />
                    </div>
                  </>
                )}

                {creating.type === 'item' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Code</label>
                        <input
                          type="text"
                          value={createForm.code || ''}
                          onChange={e => setCreateForm(f => ({ ...f, code: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="Optional"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Unit</label>
                        <input
                          type="text"
                          value={createForm.unit || 'pcs'}
                          onChange={e => setCreateForm(f => ({ ...f, unit: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Category</label>
                      <select
                        value={createForm.category || 'General'}
                        onChange={e => setCreateForm(f => ({ ...f, category: e.target.value }))}
                        className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="General">General</option>
                        <option value="Service">Service</option>
                        <option value="Raw Material">Raw Material</option>
                        <option value="Finished Goods">Finished Goods</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Purchase Rate</label>
                        <input
                          type="number"
                          value={createForm.purchase_rate || ''}
                          onChange={e => setCreateForm(f => ({ ...f, purchase_rate: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Sale Rate</label>
                        <input
                          type="number"
                          value={createForm.sale_rate || ''}
                          onChange={e => setCreateForm(f => ({ ...f, sale_rate: e.target.value }))}
                          className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="0.00"
                        />
                      </div>
                    </div>
                  </>
                )}

                {createError && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg text-[11px] text-red-600 dark:text-red-400 font-medium">
                    {createError}
                  </div>
                )}
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setCreating(null)}
                  className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-sm font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreate}
                  disabled={createLoading || !createForm.name?.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold transition-all flex items-center justify-center gap-2"
                >
                  {createLoading ? <span className="w-4 h-4 border-2 border-white/50 border-t-transparent animate-spin rounded-full" /> : null}
                  {createLoading ? 'Creating...' : `Save ${creating.type === 'supplier' ? 'Supplier' : 'Item'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      <QuickSupplierModal
        open={isQuickSupplierModalOpen}
        onClose={() => setIsQuickSupplierModalOpen(false)}
        companyId={companyId}
        onGoToFullForm={() => { saveDraft(); router.push(`/companies/${companyId}/purchases/suppliers?returnTo=${encodeURIComponent(pathname || "")}`); }}
        onSuccess={(newId) => {
          mutateSuppliers();
          setSupplierId(String(newId));
        }}
      />

      <QuickItemModal
        open={isQuickItemModalOpen}
        onClose={() => { setIsQuickItemModalOpen(false); setPendingItemLineIdx(null); }}
        companyId={companyId}
        title="Quick Add Product / Service"
        onGoToFullForm={() => { saveDraft(); router.push(`/companies/${companyId}/inventory/items?returnTo=${encodeURIComponent(pathname || "")}`); }}
        onSuccess={(newId) => {
          mutateItems();
          if (pendingItemLineIdx !== null) handleItemChange(pendingItemLineIdx, String(newId));
          setPendingItemLineIdx(null);
        }}
      />
    </div>
  );
}


