"use client";

import useSWR from "swr";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState, useCallback, useRef } from "react";
import { api, SalesReturn, createSalesReturn, getItemLedgerDefaults, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

import type { ItemUnitRead } from "@/types/item";
import { convertUiToBase } from "@/lib/units";
import { amountToWords } from "@/lib/amountToWords";
import { buildSalesReturnPayload } from "@/lib/transactionPayloads";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Input } from "@/components/ui/Input";
import { useCustomerStatement } from "@/lib/api/partyStatements";
import { QuickCustomerModal } from "@/components/sales/QuickCustomerModal";
import { QuickItemModal } from "@/components/production/QuickItemModal";

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
  const isReceivable = balance > 0;
  const isAdvance = balance < 0;
  const absBalance = Math.abs(balance).toFixed(2);

  const colorClass = isReceivable
    ? "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-900/20 dark:border-amber-700/40 dark:text-amber-300"
    : isAdvance
      ? "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-900/20 dark:border-emerald-700/40 dark:text-emerald-300"
      : "bg-slate-50 border-slate-200 text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400";

  const label = isReceivable ? "Receivable" : isAdvance ? "Advance" : "Settled";

  return (
    <div className={`mt-1.5 inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium ${colorClass}`}>
      <span>{label}:</span>
      <span className="font-semibold">{absBalance}</span>
    </div>
  );
}

const fetcher = (url: string) => api.get(url).then((res) => res.data);

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
        list={itemId ? `hs-codes-sales-returns-${itemId}` : undefined}
        className="w-full h-10 border border-slate-200/60 dark:border-slate-700/40 rounded-md px-2 py-1 bg-white dark:bg-slate-900 text-xs text-center font-medium"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HS Code"
      />
      {itemId && (
        <datalist id={`hs-codes-sales-returns-${itemId}`}>
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

type ReturnLine = {
  item_id: string;
  quantity: string;
  rate: string;
  discount: string;
  tax_rate: string;
  duty_tax_id?: string;
  selected_unit_code?: string | null;
  units?: ItemUnitRead[];
  warehouse_id?: string;
  hs_code?: string;
  department_id?: string;
  project_id?: string;
  segment_id?: string;
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

export default function SalesReturnsPage() {

  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();
  const searchParams = useSearchParams();
  const { canUpdate } = useMenuAccess("sales.returns");

  const sourceInvoiceIdParam = searchParams.get("source_invoice_id");

  const { data: returns } = useSWR<SalesReturn[]>(
    companyId ? `/sales/companies/${companyId}/returns` : null,
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

  const { data: sourceInvoice } = useSWR(
    companyId && sourceInvoiceIdParam
      ? `/sales/companies/${companyId}/invoices/${sourceInvoiceIdParam}`
      : null,
    fetcher
  );

  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
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
  const { data: segments } = useSWR(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );
 
  const { data: dutyTaxes } = useSWR<DutyTax[]>(
    companyId ? `/companies/${companyId}/duty-taxes` : null,
    fetcher
  );

  const [applyTds, setApplyTds] = useState(false);

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const { calendarMode, displayMode, reportMode, setDisplayMode, isLoading: isSettingsLoading } = useCalendarSettings();

  const initialSyncRef = useRef(false);
  useEffect(() => {
    if (!initialSyncRef.current && !isSettingsLoading && calendarMode) {
      setDisplayMode(calendarMode as any);
      initialSyncRef.current = true;
    }
  }, [calendarMode, isSettingsLoading, setDisplayMode]);

  const dateDisplayMode = displayMode;

  const isBS = reportMode === "BS";

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);


  const [customerId, setCustomerId] = useState("");
  const [isQuickCustomerModalOpen, setIsQuickCustomerModalOpen] = useState(false);
  const [isQuickItemModalOpen, setIsQuickItemModalOpen] = useState(false);
  const [pendingItemLineIdx, setPendingItemLineIdx] = useState<number | null>(null);

  useEffect(() => {
    const returning = searchParams.get("returning");
    const newId = searchParams.get("newId");
    if (returning === "true" && newId) {
      mutateCustomers().then(() => setCustomerId(newId));
      const clean = new URLSearchParams(searchParams.toString());
      clean.delete("returning");
      clean.delete("newId");
      const qs = clean.toString();
      router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
    }
  }, []);

  const [date, setDate] = useState(smartTo);

  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<ReturnLine[]>([
    { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "", department_id: "", project_id: "", segment_id: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintSearch, setReprintSearch] = useState("");
  const [paymentModeId, setPaymentModeId] = useState("");
  const [selectedBankLedgerId, setSelectedBankLedgerId] = useState("");
  const [isBankModeSelected, setIsBankModeSelected] = useState(false);
  const [isCashModeSelected, setIsCashModeSelected] = useState(false);

  const [showDepartment, setShowDepartment] = useState(false);
  const [showProject, setShowProject] = useState(false);
  const [showSegment, setShowSegment] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [segmentId, setSegmentId] = useState("");

  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: ledgerGroups } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  // Fetch company defaults to resolve the default sales return ledger
  const { data: companyDefaults } = useSWR(
    companyId ? `company:${companyId}:item-ledger-defaults` : null,
    () => getItemLedgerDefaults(companyId)
  );

  // Compute the effective sales return ledger for display
  const effectiveSalesReturnLedger = useMemo(() => {
    const ledgerId = companyDefaults?.sales_ledger_id;
    if (ledgerId && ledgers) {
      const found = (ledgers as any[]).find((l: any) => l.id === ledgerId);
      if (found) return { name: found.name as string, id: ledgerId };
    }
    return null;
  }, [companyDefaults, ledgers]);

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

  useEffect(() => {
    const mode = paymentModes?.find(pm => String(pm.id) === paymentModeId);
    if (mode) {
      const name = mode.name.toLowerCase();
      const isBank = name.includes('bank');
      setIsBankModeSelected(isBank);
      setIsCashModeSelected(name.includes('cash'));
      if (!isBank) setSelectedBankLedgerId("");
    } else {
      setIsBankModeSelected(false);
      setIsCashModeSelected(false);
      setSelectedBankLedgerId("");
    }
  }, [paymentModeId, paymentModes]);

  const [initializedFromInvoice, setInitializedFromInvoice] = useState(false);

  const totalForReturn = (ret: SalesReturn) => {
    if (!ret.lines || !Array.isArray(ret.lines)) return 0;
    return ret.lines.reduce((sum, l) => {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      return sum + base + tax;
    }, 0);
  };

  useEffect(() => {
    if (!companyId || !sourceInvoice || initializedFromInvoice) return;

    setCustomerId(sourceInvoice.customer_id ? String(sourceInvoice.customer_id) : "");
    const today = new Date().toISOString().slice(0, 10);
    setDate(today);
    setReference(sourceInvoice.reference || "");

    if (Array.isArray(sourceInvoice.lines) && sourceInvoice.lines.length > 0) {
      setLines(
        sourceInvoice.lines.map((l: any) => ({
          item_id: String(l.item_id),
          quantity: String(l.quantity ?? "1"),
          rate: String(l.rate ?? ""),
          discount: String(l.discount ?? "0"),
          tax_rate: String(l.tax_rate ?? ""),
          duty_tax_id: l.duty_tax_id ? String(l.duty_tax_id) : "",
          selected_unit_code: null,
          units: [],
          hs_code: l.hs_code || "",
          // preserve source warehouse_id for validation, even though
          // we do not send it in the payload when source_invoice_id is set
          warehouse_id: l.warehouse_id != null ? String(l.warehouse_id) : "",
          department_id: l.department_id != null ? String(l.department_id) : "",
          project_id: l.project_id != null ? String(l.project_id) : "",
          segment_id: l.segment_id != null ? String(l.segment_id) : "",
        }))
      );
    }

    if (sourceInvoice.department_id) {
      setShowDepartment(true);
      setDepartmentId(String(sourceInvoice.department_id));
    }
    if (sourceInvoice.project_id) {
      setShowProject(true);
      setProjectId(String(sourceInvoice.project_id));
    }
    if (sourceInvoice.segment_id) {
      setShowSegment(true);
      setSegmentId(String(sourceInvoice.segment_id));
    }

    setInitializedFromInvoice(true);
    setFormVisible(true);
  }, [companyId, sourceInvoice, initializedFromInvoice]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    let tdsAmount = 0;
    let taxableTotal = 0;
    let nonTaxableTotal = 0;

    for (const l of lines) {
      const qtyUi = Number(l.quantity || "0");
      const rateUi = Number(l.rate || "0");
      const disc = Number(l.discount || "0");
      discountTotal += disc;
      const taxRate = Number(l.tax_rate || "0");
      const lineBase = qtyUi * rateUi - disc;
      const lineTax = (lineBase * taxRate) / 100;
      
      taxTotal += lineTax;
      
      if (taxRate > 0) {
        taxableTotal += lineBase;
      } else {
        nonTaxableTotal += lineBase;
      }

      if (applyTds && l.item_id && dutyTaxes) {
        const item = (items as any[]).find((it: any) => String(it.id) === l.item_id);
        const category = (item?.category || "").toLowerCase();
        
        // 1. Try matching category directly to TDS Type
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
          tdsAmount += (lineBase * tdsRate / 100);
        }
      }
    }

    subtotal = taxableTotal + nonTaxableTotal;
    const grandTotal = subtotal + taxTotal - tdsAmount;

    return { 
      subtotal, 
      taxTotal, 
      discountTotal, 
      tdsAmount, 
      taxableTotal, 
      nonTaxableTotal, 
      grandTotal 
    };
  }, [lines, applyTds, items, dutyTaxes]);

  const lineTotal = (line: ReturnLine) => {
    const qtyUi = Number(line.quantity || "0");
    const rateUi = Number(line.rate || "0");
    const disc = Number(line.discount || "0");
    const taxRate = Number(line.tax_rate || "0");
    const base = qtyUi * rateUi - disc;
    const tax = (base * taxRate) / 100;
    return base + tax;
  };


  const getAvailableForLine = (line: ReturnLine, map: Map<string, number>): number => {
    if (!line.item_id || !line.warehouse_id) return 0;
    const key = `${Number(line.item_id)}:${Number(line.warehouse_id)}`;
    return map.get(key) ?? 0;
  };

  const handleDateChangeAD = (nextAD: string) => {
    if (!nextAD) return;
    setDate(nextAD);
  };

  const handleDateChangeBS = (nextBS: string) => {
    if (!nextBS) return;
    const ad = safeBSToAD(nextBS);
    if (ad) setDate(ad);
  };

  const handleLineChange = (index: number, field: keyof ReturnLine, value: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      return copy;
    });
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

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "", department_id: "", project_id: "", segment_id: "" },
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length === 1) {
        return [
          { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", duty_tax_id: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "", department_id: "", project_id: "", segment_id: "" },
        ];
      }
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
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

    const sourceInvoiceId = sourceInvoiceIdParam ? Number(sourceInvoiceIdParam) : null;

    const activeLines = lines.filter((l) => l.item_id);
    if (activeLines.length === 0) {
      setSubmitting(false);
      setSubmitError("Add at least one item line before saving the sales return.");
      return;
    }

    const hasInvalidQty = activeLines.some((l) => Number(l.quantity || "0") <= 0);
    if (hasInvalidQty) {
      setSubmitting(false);
      setSubmitError("All item quantities must be greater than zero.");
      return;
    }

    const hasNegativeRate = activeLines.some((l) => Number(l.rate || "0") < 0);
    if (hasNegativeRate) {
      setSubmitting(false);
      setSubmitError("Item rates cannot be negative.");
      return;
    }

    if (sourceInvoiceId && sourceInvoice && Array.isArray(sourceInvoice.lines)) {
      const originalQtyByKey = new Map<string, number>();
      for (const l of sourceInvoice.lines as any[]) {
        const idNum = Number(l.item_id);
        if (!idNum) continue;
        const whNum = l.warehouse_id != null ? Number(l.warehouse_id) : 0;
        const key = `${idNum}:${whNum}`;
        const prev = originalQtyByKey.get(key) ?? 0;
        const q = Number(l.quantity || 0);
        originalQtyByKey.set(key, prev + q);
      }

      let violationMsg: string | null = null;
      for (const l of activeLines) {
        const idNum = Number(l.item_id);
        if (!idNum) continue;
        const whNum = l.warehouse_id ? Number(l.warehouse_id) : 0;
        const key = `${idNum}:${whNum}`;
        const originalQty = originalQtyByKey.get(key);
        if (originalQty == null) continue;
        const requestedQty = Number(l.quantity || "0");
        if (requestedQty > originalQty) {
          violationMsg =
            "Return quantity for one or more items exceeds the original invoice quantity for its warehouse. Please reduce the quantity.";
          break;
        }
      }

      if (violationMsg) {
        setSubmitting(false);
        setSubmitError(violationMsg);
        return;
      }
    }

    const basePayload: any = {
      customer_id: customerId ? Number(customerId) : null,
      date,
      reference: reference || undefined,
      source_invoice_id: sourceInvoiceId || null,
      department_id: departmentId ? Number(departmentId) : undefined,
      project_id: projectId ? Number(projectId) : undefined,
      segment_id: segmentId ? Number(segmentId) : undefined,
      lines: activeLines.map((l) => {
        const units = l.units || [];
        const selected =
          units.find((u) => u.unit_code === l.selected_unit_code) ||
          units.find((u) => u.is_base);

        const qtyUi = Number(l.quantity || "0");
        const rateUi = Number(l.rate || "0");
        const { quantity, rate } = convertUiToBase(qtyUi, rateUi, selected);

        const baseLine: any = {
          item_id: Number(l.item_id),
          quantity,
          rate,
          discount: Number(l.discount || "0"),
          tax_rate: Number(l.tax_rate || "0"),
          department_id: l.department_id ? Number(l.department_id) : undefined,
          project_id: l.project_id ? Number(l.project_id) : undefined,
          segment_id: l.segment_id ? Number(l.segment_id) : undefined,
        };

        baseLine.warehouse_id = l.warehouse_id ? Number(l.warehouse_id) : null;
        baseLine.duty_tax_id = l.duty_tax_id ? Number(l.duty_tax_id) : null;
        baseLine.hs_code = l.hs_code || "";

        return baseLine;
      }),
    };

    basePayload.payment_mode_id = paymentModeId || null;
    if (isBankModeSelected && selectedBankLedgerId) {
      basePayload.payment_ledger_id = Number(selectedBankLedgerId);
    }
    basePayload.apply_tds = applyTds;
    basePayload.tds_amount = totals.tdsAmount;

    const payload = buildSalesReturnPayload(basePayload);

    try {
      await createSalesReturn(Number(companyId), payload);
      const today = new Date().toISOString().split('T')[0];
      setCustomerId("");
      setDate(today);
      setReference("");
      setLines([
        { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" },
      ]);
      setSubmitError(null);
      refreshStock(); // update stock immediately after return!
      await invalidateAccountingReports(companyId);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || "Failed to create sales return"
      );
    } finally {
      setSubmitting(false);
    }
  };

  const customerName = (id: number) =>
    customers?.find((c: any) => c.id === id)?.name || "";

  const handleClose = () => {
    if (typeof window !== "undefined" && window.opener) {
      window.close();
      return;
    }
    if (companyId) {
      router.push('/dashboard');
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
              <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Returns</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Process customer returns · Manage stock reversals and refunds
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1">
              <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
              </svg>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {Array.isArray(returns) ? returns.length : "—"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden min-h-[140px]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          <button
            type="button"
            onClick={() => {
              setCustomerId("");
              setReference("");
              setLines([{ item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" }]);
              setFormVisible(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 
              text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            New Return
          </button>

          {formVisible && (
            <button
              type="button"
              onClick={() => setFormVisible(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 
                text-rose-600 text-xs font-semibold border border-rose-200 transition-colors"
            >
              Cancel
            </button>
          )}

          {formVisible && (
            <button
              form="return-form"
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 
                text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Saving..." : "Save Return"}
            </button>
          )}

          {/* Re-Print — always clickable, opens modal */}
          <button
            type="button"
            title="Re-Print a return"
            onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700
              text-white text-xs font-semibold shadow-sm transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
            Re-Print
          </button>

          {/* right-side status label */}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 
                text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
              Exit
            </button>
            {formVisible ? (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                ✦ New Return
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-[11px] font-medium text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                No return open
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-3">
          {canUpdate && formVisible && (
            <div className="relative rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px] shadow-lg mb-8 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="rounded-xl bg-white dark:bg-slate-950 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30">
                  <div className="flex items-center gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Return Details
                      </h2>
                      {/* Sales Return Ledger Badge */}
                      {effectiveSalesReturnLedger ? (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
                          <svg className="w-3 h-3 text-emerald-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h8a2 2 0 012 2v12a1 1 0 110 2h-3a1 1 0 01-1-1v-2a1 1 0 00-1-1H9a1 1 0 00-1 1v2a1 1 0 01-1 1H4a1 1 0 110-2V4zm3 1h2v2H7V5zm2 4H7v2h2V9zm2-4h2v2h-2V5zm2 4h-2v2h2V9z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[10px] text-slate-400 font-semibold">Ledger:</span>
                          <span className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">{effectiveSalesReturnLedger.name}</span>
                          <span className="text-[9px] font-mono bg-emerald-100 dark:bg-emerald-800 text-emerald-600 dark:text-emerald-400 px-1 py-0.5 rounded">#{effectiveSalesReturnLedger.id}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40">
                          <svg className="w-3 h-3 text-amber-500 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                          <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">No return ledger set</span>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 px-3 py-1 bg-slate-100 dark:bg-slate-800 rounded-lg ml-auto">
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                          <input type="checkbox" checked={showDepartment} onChange={(e) => { setShowDepartment(e.target.checked); if (!e.target.checked) setDepartmentId(""); }} className="w-3.5 h-3.5 rounded border-slate-300" />
                          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tight">Dept</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                          <input type="checkbox" checked={showProject} onChange={(e) => { setShowProject(e.target.checked); if (!e.target.checked) setProjectId(""); }} className="w-3.5 h-3.5 rounded border-slate-300" />
                          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tight">Proj</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer hover:text-indigo-500 transition-colors">
                          <input type="checkbox" checked={showSegment} onChange={(e) => { setShowSegment(e.target.checked); if (!e.target.checked) setSegmentId(""); }} className="w-3.5 h-3.5 rounded border-slate-300" />
                          <span className="text-[10px] font-bold uppercase text-slate-500 tracking-tight">Seg</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4">
                  {submitError && (
                    <div className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600 font-medium">
                      {submitError}
                    </div>
                  )}
                  {stockError && (
                    <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 font-medium italic">
                      {stockError}
                    </div>
                  )}

                  <form id="return-form" onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 bg-slate-50/50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Customer <span className="text-red-500">*</span></label>
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
                          triggerClassName="h-10 px-3 !bg-blue-50/50 !border-blue-200 !text-blue-700 !font-semibold"
                        />
                        <CustomerBalanceBadge companyId={companyId} customerId={customerId} />
                      </div>

                      <div className="flex flex-col gap-1 md:col-span-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Display</label>
                        <select
                          className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-slate-900 font-bold text-slate-700"
                          value={dateDisplayMode}
                          onChange={(e) => setDisplayMode(e.target.value as any)}
                        >
                          <option value="AD">AD</option>
                          <option value="BS">BS</option>
                          <option value="BOTH">BOTH</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="text-[11px] font-bold text-slate-500 uppercase text-center">
                          {dateDisplayMode === 'BOTH' ? 'Dates (AD / BS)' : `Date (${dateDisplayMode})`} <span className="text-red-500">*</span>
                        </label>
                        <div className="flex gap-2">
                          {(dateDisplayMode === 'AD' || dateDisplayMode === 'BOTH') && (
                            <Input
                              type="date"
                              className="flex-1"
                              calendarMode="AD"
                              value={date}
                              min={company?.fiscal_year_start || ""}
                              max={company?.fiscal_year_end || ""}
                              onChange={(e) => handleDateChangeAD(e.target.value)}
                              required
                            />
                          )}
                          {(dateDisplayMode === 'BS' || dateDisplayMode === 'BOTH') && (
                            <Input
                              type="date"
                              className="flex-1"
                              calendarMode="BS"
                              value={date}
                              min={company?.fiscal_year_start || ""}
                              max={company?.fiscal_year_end || ""}
                              onChange={(e) => handleDateChangeBS(e.target.value)}
                              required={dateDisplayMode === 'BS'}
                            />
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 md:col-span-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Reference</label>
                        <input
                          className="w-full h-10 border rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                          placeholder="e.g. INV-123-RET"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase">Payment Mode</label>
                        <select
                          name="payment_mode_id"
                          className="w-full h-10 border rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                          value={paymentModeId}
                          onChange={(e) => setPaymentModeId(e.target.value)}
                        >
                          <option value="">Credit (no info)</option>
                          {paymentModes?.map((pm) => (
                            <option key={pm.id} value={pm.id}>
                              {pm.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {paymentModeId && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">
                            {isBankModeSelected ? "Bank Ledger" : isCashModeSelected ? "Cash Ledger" : "Ledger"}
                          </label>
                          <select
                            className="w-full h-10 border border-emerald-200 dark:border-emerald-800 rounded-md px-3 py-1.5 text-xs bg-emerald-50/50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-semibold"
                            value={selectedBankLedgerId}
                            onChange={(e) => setSelectedBankLedgerId(e.target.value)}
                            required
                          >
                            <option value="">Select Ledger</option>
                            {bankLedgers.map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                        </div>
                      )}

                      {showDepartment && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Department</label>
                          <select className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900" value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} required={showDepartment}>
                            <option value="">Select Dept</option>
                            {(departments || []).map((d: any) => (<option key={d.id} value={d.id}>{d.name}</option>))}
                          </select>
                        </div>
                      )}
                      {showProject && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Project</label>
                          <select className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900" value={projectId} onChange={(e) => setProjectId(e.target.value)} required={showProject}>
                            <option value="">Select Project</option>
                            {(projects || []).map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                          </select>
                        </div>
                      )}
                      {showSegment && (
                        <div className="flex flex-col gap-1">
                          <label className="text-[11px] font-bold text-slate-500 uppercase">Segment</label>
                          <select className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900" value={segmentId} onChange={(e) => setSegmentId(e.target.value)} required={showSegment}>
                            <option value="">Select Segment</option>
                            {(segments || []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900/50">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                          <tr className="text-slate-500 uppercase tracking-tighter">
                            <th className="text-left py-2.5 px-0.5 font-bold w-[34%]">Item Selection</th>
                            <th className="text-left py-2.5 px-0.5 font-bold w-[12%] text-center">HS Code</th>
                            <th className="text-left py-2.5 px-0.5 font-bold w-[14%]">Warehouse</th>
                            <th className="text-left py-2.5 px-3 font-bold w-[10%]">Unit</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[10%]">Qty</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[12%]">Rate</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[10%] text-indigo-600">Disc</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[12%] text-indigo-600">Tax</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[13%] text-emerald-600">Line Total</th>
                            {showProject && <th className="text-left py-2.5 px-3 font-bold w-[12%]">Project</th>}
                            {showSegment && <th className="text-left py-2.5 px-3 font-bold w-[12%]">Segment</th>}
                            <th className="text-center py-2.5 px-3 font-bold w-[8%]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                          {lines.map((line, idx) => (
                            <tr key={idx} className="group hover:bg-slate-50/30 transition-colors">
                              <td className="py-2 px-0.5">
                                <SearchableSelect
                                  options={items?.map((it: any) => {
                                    const available = getAvailableForLine({ ...line, item_id: String(it.id) }, stockMap);
                                    return {
                                      value: String(it.id),
                                      label: it.name,
                                      sublabel: `#${it.id} · Stock: ${available}`
                                    };
                                  }) || []}
                                  pinnedOptions={[{ value: "__add_item__", label: "+ Add New Product / Service", sublabel: "Create a new item record" }]}
                                  value={line.item_id}
                                  onChange={(val) => {
                                    if (val === "__add_item__") { setPendingItemLineIdx(idx); setIsQuickItemModalOpen(true); }
                                    else handleItemChange(idx, val);
                                  }}
                                  placeholder="Select item"
                                  triggerClassName="h-10 px-0.5 !bg-indigo-50/50 !border-indigo-100 !text-indigo-700 !font-semibold"
                                />
                              </td>
                              <td className="py-2 px-0.5">
                                <HSCodeCell
                                  companyId={companyId}
                                  itemId={line.item_id}
                                  value={line.hs_code || ""}
                                  onChange={(val) => handleLineChange(idx, "hs_code", val)}
                                />
                              </td>
                              <td className="py-2 px-0.5">
                                {(() => {
                                  const item = items?.find((it: any) => String(it.id) === line.item_id);
                                  const isService = item?.category?.toLowerCase() === "service";
                                  if (isService) {
                                    return <div className="text-[10px] text-slate-400 italic px-2">N/A (Service)</div>;
                                  }
                                  return (
                                    <select
                                      className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-slate-900"
                                      value={line.warehouse_id ?? ""}
                                      onChange={(e) => handleLineChange(idx, "warehouse_id", e.target.value)}
                                    >
                                      <option value="">Warehouse</option>
                                      {warehouses?.map((w) => {
                                        const stock = line.item_id ? getAvailableForLine({ ...line, warehouse_id: String(w.id) }, stockMap) : null;
                                        return (
                                          <option key={w.id} value={w.id}>
                                            {w.name}{stock != null ? ` (Qty: ${stock})` : ""}
                                          </option>
                                        );
                                      })}
                                    </select>
                                  );
                                })()}
                              </td>
                              <td className="py-2 px-0.5">
                                {line.units && line.units.length > 0 ? (
                                  <select
                                    className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs"
                                    value={line.selected_unit_code ?? ""}
                                    onChange={(e) => handleUnitChange(idx, e.target.value)}
                                  >
                                    {line.units.map((u) => <option key={u.id} value={u.unit_code}>{u.unit_code}</option>)}
                                  </select>
                                ) : <div className="text-[10px] text-slate-400 font-medium px-2 italic uppercase">Base</div>}
                              </td>
                              <td className="py-2 px-0.5">
                                <input
                                  type="number" step="0.01"
                                  className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-right font-medium"
                                  value={line.quantity}
                                  onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                                />
                              </td>
                              <td className="py-2 px-0.5">
                                <input
                                  type="number" step="0.01"
                                  className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-right font-medium"
                                  value={line.rate}
                                  onChange={(e) => handleLineChange(idx, "rate", e.target.value)}
                                />
                              </td>
                              <td className="py-2 px-0.5">
                                <input
                                  type="number" step="0.01"
                                  className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs text-right font-medium"
                                  value={line.discount}
                                  onChange={(e) => handleLineChange(idx, "discount", e.target.value)}
                                />
                              </td>
                              <td className="py-2 px-0.5">
                                <select
                                  className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-slate-900"
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
                                </select>
                              </td>
                              <td className="py-2 px-0.5">
                                <div className="text-right font-bold text-emerald-700 dark:text-emerald-400">
                                  {lineTotal(line).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                              </td>
                              {showProject && (
                                <td className="py-2 px-0.5">
                                  <select className="w-full h-9 border border-slate-200 rounded text-xs bg-white dark:bg-slate-900" value={line.project_id || ""} onChange={(e) => handleLineChange(idx, "project_id", e.target.value)}>
                                    <option value="">N/A</option>
                                    {(projects || []).map((p: any) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                                  </select>
                                </td>
                              )}
                              {showSegment && (
                                <td className="py-2 px-0.5">
                                  <select className="w-full h-9 border border-slate-200 rounded text-xs bg-white dark:bg-slate-900" value={line.segment_id || ""} onChange={(e) => handleLineChange(idx, "segment_id", e.target.value)}>
                                    <option value="">N/A</option>
                                    {(segments || []).map((s: any) => (<option key={s.id} value={s.id}>{s.name}</option>))}
                                  </select>
                                </td>
                              )}
                              <td className="py-2 px-0.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeLine(idx)}
                                  className="h-7 w-7 flex items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-500 hover:bg-rose-50 transition-colors"
                                >
                                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800">
                          <tr>
                            <td colSpan={8} className="py-2.5 px-3 text-right">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Grand Total</span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                {(totals.subtotal + totals.taxTotal).toFixed(2)}
                              </span>
                            </td>
                            <td colSpan={1 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                          </tr>
                          {totals.tdsAmount > 0 && (
                            <tr className="bg-rose-50/20 dark:bg-rose-900/10">
                              <td colSpan={8} className="py-1.5 px-3 text-right">
                                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest text-right italic leading-none">TDS Deduction</span>
                              </td>
                              <td className="py-1.5 px-3 text-right">
                                <span className="text-xs font-bold text-rose-600 dark:text-rose-400">
                                  -{totals.tdsAmount.toFixed(2)}
                                </span>
                              </td>
                              <td colSpan={1 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                            </tr>
                          )}
                          {totals.tdsAmount > 0 && (
                            <tr className="border-t border-slate-200 dark:border-slate-800 bg-emerald-50/30 dark:bg-emerald-900/20">
                              <td colSpan={8} className="py-2 px-3 text-right">
                                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">Net Receivable</span>
                              </td>
                              <td className="py-2 px-3 text-right">
                                <span className="text-sm font-black text-emerald-600 dark:text-emerald-400">
                                  {totals.grandTotal.toFixed(2)}
                                </span>
                              </td>
                              <td colSpan={1 + (showProject ? 1 : 0) + (showSegment ? 1 : 0)}></td>
                            </tr>
                          )}
                        </tfoot>
                      </table>
                      <div className="p-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
                        <div className="flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={addLine}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 shadow-sm transition-all"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                            Add Another Item
                          </button>

                          <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 w-fit shadow-sm">
                            <input
                              id="apply-tds-footer-sal-ret"
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              checked={applyTds}
                              onChange={(e) => setApplyTds(e.target.checked)}
                            />
                            <label htmlFor="apply-tds-footer-sal-ret" className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase tracking-widest cursor-pointer">
                              Deduct TDS
                            </label>
                          </div>
                        </div>

                        <div className="text-[10px] font-medium text-slate-400 bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 px-3 py-1.5 rounded-lg italic">
                          TDS rates are fetched automatically based on item category.
                        </div>
                      </div>
                    </div>

                    {/* Totals Strip */}
                    <div className="flex justify-end">
                      <div className="inline-flex items-center gap-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-6 py-2.5 shadow-sm">
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subtotal</span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{totals.subtotal.toFixed(2)}</span>
                        </div>
                        {totals.discountTotal > 0 && (
                          <>
                            <div className="h-6 w-[1px] bg-slate-100 dark:bg-slate-800" />
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Discount</span>
                              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{totals.discountTotal.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        <div className="h-6 w-[1px] bg-slate-100 dark:bg-slate-800" />
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tax Total</span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{totals.taxTotal.toFixed(2)}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-emerald-100 dark:bg-emerald-900/50 mx-1" />
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest">Grand Total</span>
                          <span className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                            {(totals.subtotal + totals.taxTotal).toFixed(2)}
                          </span>
                        </div>
                        {totals.tdsAmount > 0 && (
                          <>
                            <div className="h-8 w-[1px] bg-rose-100 dark:bg-rose-900/50 mx-1" />
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest italic leading-none">TDS</span>
                              <span className="text-xs font-bold text-rose-600 dark:text-rose-400 leading-tight">
                                -{totals.tdsAmount.toFixed(2)}
                              </span>
                            </div>
                            <div className="h-8 w-[1px] bg-indigo-100 dark:bg-indigo-900/50 mx-1" />
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Net</span>
                              <span className="text-lg font-black text-indigo-600 dark:text-indigo-400 leading-tight">
                                {totals.grandTotal.toFixed(2)}
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-start">
                      <div className="flex-1 space-y-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider ml-1">Amount in Words</span>
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-600 italic">
                          {amountToWords(totals.grandTotal)}
                        </div>
                      </div>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══ Re-Print Modal ═══ */}
      {showReprintModal && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowReprintModal(false); }}
        >
          <div className="relative w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-teal-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print a Sales Return</span>
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
                <input autoFocus type="text" placeholder="Search by return #, customer or reference..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                  value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Found {(returns || []).length} returns — click <strong>Print</strong> to open in a new tab.
              </p>
            </div>

            {/* Return list */}
            <div className="px-5 pb-5 max-h-80 overflow-y-auto">
              {(() => {
                const q = reprintSearch.trim().toLowerCase();
                const modalReturns = (returns || []).filter((ret: any) => {
                  if (!q) return true;
                  return (
                    String(ret.id).includes(q) ||
                    (ret.reference || "").toLowerCase().includes(q) ||
                    customerName(ret.customer_id).toLowerCase().includes(q)
                  );
                });
                if (modalReturns.length === 0) return (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No sales returns found matching your search.
                  </div>
                );
                return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-1">
                    {modalReturns.map((ret: any) => {
                      const total = totalForReturn(ret);
                      return (
                        <div key={ret.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors border-l-2 border-transparent hover:border-teal-500">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 border border-teal-100 dark:border-teal-800/40">
                                #{ret.id}
                              </span>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{customerName(ret.customer_id)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                              <span>{ret.date}</span>
                              {ret.reference && <span className="italic">• {ret.reference}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <a href={`/companies/${companyId}/sales/returns/${ret.id}`}
                              target="_blank" rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 text-white text-[11px] font-semibold shadow-sm transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
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

      <QuickCustomerModal
        open={isQuickCustomerModalOpen}
        onClose={() => setIsQuickCustomerModalOpen(false)}
        companyId={companyId}
        onGoToFullForm={() => router.push(`/companies/${companyId}/sales/customers?returnTo=${encodeURIComponent(`/companies/${companyId}/sales/returns`)}`)}
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
        onGoToFullForm={() => router.push(`/companies/${companyId}/inventory/items`)}
        onSuccess={(newId) => {
          mutateItems();
          if (pendingItemLineIdx !== null) handleItemChange(pendingItemLineIdx, String(newId));
          setPendingItemLineIdx(null);
        }}
      />
    </div>
  );
}
