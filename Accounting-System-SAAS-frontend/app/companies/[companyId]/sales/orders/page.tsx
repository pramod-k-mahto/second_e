"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState, useEffect, useCallback, useRef } from "react";
import { api, createSalesOrder, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

import type { ItemUnitRead } from "@/types/item";
import { convertUiToBase } from "@/lib/units";
import { amountToWords } from "@/lib/amountToWords";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Input } from "@/components/ui/Input";
import { QuickSalesPersonModal } from "@/components/sales/QuickSalesPersonModal";
import { QuickCustomerModal } from "@/components/sales/QuickCustomerModal";
import { QuickItemModal } from "@/components/production/QuickItemModal";
import { useCustomerStatement } from "@/lib/api/partyStatements";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { safeBSToAD } from "@/lib/bsad";

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
        list={itemId ? `hs-codes-sales-orders-${itemId}` : undefined}
        className="w-full h-10 border border-slate-200/60 dark:border-slate-700/40 rounded-md px-2 py-1 bg-white dark:bg-slate-900 text-xs text-center font-medium"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="HS Code"
      />
      {itemId && (
        <datalist id={`hs-codes-sales-orders-${itemId}`}>
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

type OrderLine = {
  item_id: string;
  quantity: string;
  rate: string;
  discount: string;
  tax_rate: string;
  selected_unit_code?: string | null;
  units?: ItemUnitRead[];
  warehouse_id?: string;
  hs_code?: string;
};

type Company = {
  id: number;
  name: string;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
  calendar_mode?: "AD" | "BS";
};

export default function SalesOrdersPage() {

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;

  const salesOrderAccess = useMenuAccess("sales.order.list");
  const allowEditSalesOrders = salesOrderAccess.canUpdate === true;

  const { data: orders, mutate } = useSWR(
    companyId ? `/orders/companies/${companyId}/orders/sales?status=OPEN,PROCESSING` : null,
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

  const { data: salesPersons, mutate: mutateSalesPersons } = useSWR(
    companyId ? `/companies/${companyId}/sales-persons?is_active=true` : null,
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

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);


  const [customerId, setCustomerId] = useState("");
  const [date, setDate] = useState(smartTo);
  const [dueDate, setDueDate] = useState(smartTo);

  const [dueDateTouched, setDueDateTouched] = useState(false);
  const [salesPersonId, setSalesPersonId] = useState<string>("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<OrderLine[]>([
    { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [formVisible, setFormVisible] = useState(false);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintSearch, setReprintSearch] = useState("");
  const [isQuickSalesPersonModalOpen, setIsQuickSalesPersonModalOpen] = useState(false);
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

  const orderTotal = (order: any) => {
    if (!order?.lines || !Array.isArray(order.lines)) return 0;
    return order.lines.reduce((sum: number, l: any) => {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      return sum + base + tax;
    }, 0);
  };

  const totals = useMemo(() => {
    let subtotal = 0;
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
    }
    return { subtotal, taxTotal, discountTotal, grandTotal: subtotal };
  }, [lines]);

  const lineTotal = (line: OrderLine) => {
    const qtyUi = Number(line.quantity || "0");
    const rateUi = Number(line.rate || "0");
    const disc = Number(line.discount || "0");
    const taxRate = Number(line.tax_rate || "0");
    const base = qtyUi * rateUi - disc;
    const tax = (base * taxRate) / 100;
    return base + tax;
  };


  const getAvailableForLine = (line: OrderLine, map: Map<string, number>): number => {
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
    setDate(smartTo);
    setDueDate(smartTo);

    setDueDateTouched(false);
    setSalesPersonId("");
    setReference("");
    setLines([
      { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" },
    ]);
    setSubmitError(null);
    setStockError(null);
    setFormVisible(false);
  };

  const handleDateChangeAD = (nextAD: string) => {
    if (!nextAD) return;
    setDate(nextAD);
    if (!dueDateTouched) setDueDate(nextAD);
  };

  const handleDateChangeBS = (nextBS: string) => {
    if (!nextBS) return;
    const ad = safeBSToAD(nextBS);
    if (ad) {
      setDate(ad);
      if (!dueDateTouched) setDueDate(ad);
    }
  };

  const handleDueDateChangeAD = (nextAD: string) => {
    if (!nextAD) return;
    setDueDateTouched(true);
    setDueDate(nextAD);
  };

  const handleDueDateChangeBS = (nextBS: string) => {
    if (!nextBS) return;
    const ad = safeBSToAD(nextBS);
    if (ad) {
      setDueDateTouched(true);
      setDueDate(ad);
    }
  };

  const handleLineChange = (index: number, field: keyof OrderLine, value: string) => {
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
      { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" },
    ]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => {
      if (prev.length === 1) {
        return [
          { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" },
        ];
      }
      const copy = [...prev];
      copy.splice(index, 1);
      return copy;
    });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allowEditSalesOrders) return;
    if (!companyId) return;
    setSubmitting(true);
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
    setSubmitError(null);

    const payload = {
      customer_id: customerId ? Number(customerId) : 0,
      date,
      due_date: dueDateTouched ? (dueDate ? dueDate : null) : date,
      sales_person_id: salesPersonId ? Number(salesPersonId) : null,
      reference: reference || undefined,
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

          return {
            item_id: Number(l.item_id),
            quantity,
            rate,
            discount: Number(l.discount || "0"),
            tax_rate: Number(l.tax_rate || "0"),
            hs_code: l.hs_code || "",
          };
        }),
    };

    try {
      if (editingId) {
        await api.put(`/orders/companies/${companyId}/orders/sales/${editingId}`, payload);
      } else {
        await createSalesOrder(Number(companyId), payload);
      }
      resetForm();
      refreshStock();
      mutate();
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || (editingId ? "Failed to update order" : "Failed to create order")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!allowEditSalesOrders || !companyId) return;
    if (!confirm("Delete this order? This cannot be undone.")) return;
    try {
      await api.delete(`/orders/companies/${companyId}/orders/sales/${id}`);
      mutate();
    } catch (err) {
      // ignore
    }
  };

  const startEdit = (order: any) => {
    setEditingId(order.id);
    setCustomerId(order.customer_id ? String(order.customer_id) : "");
    setDate(order.voucher_date || order.date || "");
    setDueDate(order.due_date || order.voucher_date || order.date || "");
    setDueDateTouched(true);
    setSalesPersonId(order.sales_person_id != null ? String(order.sales_person_id) : "");
    setReference(order.reference || "");
    if (order.lines && Array.isArray(order.lines) && order.lines.length > 0) {
      setLines(
        order.lines.map((l: any) => ({
          item_id: String(l.item_id),
          quantity: String(l.quantity ?? ""),
          rate: String(l.rate ?? ""),
          discount: String(l.discount ?? "0"),
          tax_rate: String(l.tax_rate ?? ""),
          selected_unit_code: null,
          units: [],
          hs_code: l.hs_code || "",
          warehouse_id: l.warehouse_id != null ? String(l.warehouse_id) : "",
        }))
      );
    } else {
      setLines([
        { item_id: "", quantity: "1", rate: "", discount: "0", tax_rate: "", hs_code: "", selected_unit_code: null, units: [], warehouse_id: "" },
      ]);
    }
    setSubmitError(null);
    setFormVisible(true);
  };


  const customerName = (id: any) =>
    customers?.find((c: any) => c.id === Number(id))?.name || "Unknown Customer";



  return (
    <>
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-rose-500 via-pink-500 to-indigo-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50 dark:bg-rose-900/30 border border-rose-100 dark:border-rose-800/40">
              <svg className="w-4 h-4 text-rose-600 dark:text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Orders</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                Manage committed sales · Track order status · Convert to final invoices
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1">
              <svg className="w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
              </svg>
              <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                {Array.isArray(orders) ? orders.length : "—"}
              </span>
            </div>
          </div>
        </div>
      </div >

      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden min-h-[140px]">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          {allowEditSalesOrders && (
            <button
              type="button"
              onClick={() => {
                resetForm();
                setFormVisible(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 
              text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
              New Order
            </button>
          )}

          <button
            type="button"
            title="Re-Print an order"
            onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700
              text-white text-xs font-semibold shadow-sm transition-all duration-150"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
            Re-Print
          </button>

          {formVisible && allowEditSalesOrders && (
            <button
              type="button"
              onClick={() => setFormVisible(false)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-pink-50 hover:bg-pink-100 
                text-pink-600 text-xs font-semibold border border-pink-200 transition-colors"
            >
              Cancel
            </button>
          )}

          {formVisible && allowEditSalesOrders && (
            <button
              form="order-form"
              type="submit"
              disabled={submitting || !allowEditSalesOrders}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 
                text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              {submitting ? "Saving..." : (editingId ? "Update Order" : "Save Order")}
            </button>
          )}

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
                ✏ Editing Order #{editingId}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-100 dark:bg-emerald-900/40 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700/50">
                ✦ New Order
              </span>
            )}
          </div>
        </div>

        <div className="px-4 py-3">
          {formVisible && allowEditSalesOrders && (
            <div className="relative rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-[2px] shadow-lg mb-4 animate-in fade-in slide-in-from-top-4 duration-300">
              <div className="rounded-xl bg-white dark:bg-slate-950 overflow-hidden">
                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30">
                  <h2 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                    Sales Order Details
                  </h2>
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

                  <form id="order-form" onSubmit={handleSubmit} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50/50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                      <div className="flex flex-col gap-1 md:col-span-3">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Customer <span className="text-red-500">*</span></label>
                        <SearchableSelect
                          options={customers?.map((c: any) => ({
                            value: String(c.id),
                            label: c.name,
                            sublabel: `#${c.id}${c.phone ? ` • ${c.phone}` : ""}${c.email ? ` • ${c.email}` : ""}`
                          })) || []}
                          pinnedOptions={[{
                            value: "__add_customer__",
                            label: "+ Add New Customer",
                            sublabel: "Create a new customer record"
                          }]}
                          value={customerId}
                          onChange={(val) => {
                            if (val === "__add_customer__") {
                              setIsQuickCustomerModalOpen(true);
                            } else {
                              setCustomerId(val);
                            }
                          }}
                          placeholder="Select customer"
                          triggerClassName="h-10 px-3 !bg-rose-50/50 !border-rose-200 !text-rose-700 !font-semibold"
                        />
                        <CustomerBalanceBadge companyId={companyId} customerId={customerId} />
                      </div>

                      <div className="flex flex-col gap-1 md:col-span-1">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter">Display</label>
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

                      <div className="flex flex-col gap-1 md:col-span-4">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter text-center">
                          {dateDisplayMode === 'BOTH' ? 'Date (AD/BS)' : `Date (${dateDisplayMode})`} <span className="text-red-500">*</span>
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
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="flex items-center justify-between gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-tighter ml-1">
                          <span>Sales Person</span>
                          <button
                            type="button"
                            className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-300 transition-colors font-bold normal-case shrink-0"
                            onClick={() => setIsQuickSalesPersonModalOpen(true)}
                          >
                            + Add new
                          </button>
                        </label>
                        <select
                          className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900"
                          value={salesPersonId}
                          onChange={(e) => {
                            if (e.target.value === "ADD_NEW") {
                              setIsQuickSalesPersonModalOpen(true);
                            } else {
                              setSalesPersonId(e.target.value);
                            }
                          }}
                        >
                          <option value="ADD_NEW" className="font-bold text-indigo-600 dark:text-indigo-400">+ Add new</option>
                          <option value="">None</option>
                          {(salesPersons || []).map((sp: any) => (
                            <option key={sp.id} value={sp.id}>{sp.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1 md:col-span-2">
                        <label className="text-[11px] font-bold text-slate-500 uppercase tracking-tighter ml-1">Reference</label>
                        <input
                          className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-3 py-1.5 text-xs bg-white dark:bg-slate-900"
                          placeholder="e.g. PO-8822"
                          value={reference}
                          onChange={(e) => setReference(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm bg-white dark:bg-slate-900/50">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-800/50">
                          <tr className="text-slate-500 uppercase tracking-tighter">
                            <th className="text-left py-2.5 px-3 font-bold w-[30%]">Product Selection</th>
                            <th className="text-left py-2.5 px-3 font-bold w-[12%]">HS Code</th>
                            <th className="text-left py-2.5 px-3 font-bold w-[14%]">Warehouse</th>
                            <th className="text-left py-2.5 px-3 font-bold w-[8%]">Unit</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[12%]">Qty</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[15%]">Rate</th>
                            <th className="text-right py-2.5 px-3 font-bold w-[13%] text-rose-600">Total</th>
                            <th className="text-center py-2.5 px-3 font-bold w-[6%]"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                          {lines.map((line, idx) => (
                            <tr key={idx} className="group hover:bg-slate-50/30 transition-colors">
                              <td className="py-2 px-3">
                                <SearchableSelect
                                  options={items?.map((it: any) => {
                                    const available = line.warehouse_id
                                      ? getAvailableForLine({ ...line, item_id: String(it.id) }, stockMap)
                                      : getTotalForItem(Number(it.id), stockMap);
                                    return {
                                      value: String(it.id),
                                      label: it.name,
                                      sublabel: `#${it.id} · ${it.sku || "No SKU"}${available != null ? ` · Stock: ${available}` : ""}`
                                    };
                                  }) || []}
                                  pinnedOptions={[{ value: "__add_item__", label: "+ Add New Product / Service", sublabel: "Create a new item record" }]}
                                  value={line.item_id}
                                  onChange={(val) => {
                                    if (val === "__add_item__") { setPendingItemLineIdx(idx); setIsQuickItemModalOpen(true); }
                                    else handleItemChange(idx, val);
                                  }}
                                  placeholder="Select product"
                                  triggerClassName="w-full h-10 px-3 !bg-rose-50/30 !border-rose-100 !text-rose-800 !font-semibold"
                                />
                                {line.item_id && (
                                  <div className="mt-1 flex items-center gap-1.5 px-1 pb-1">
                                    <span className="text-[10px] font-semibold tracking-wide text-slate-500 uppercase">
                                      Available QTY:
                                    </span>
                                    <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400">
                                      {line.warehouse_id
                                        ? getAvailableForLine(line, stockMap)
                                        : getTotalForItem(Number(line.item_id), stockMap)}
                                    </span>
                                  </div>
                                )}
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
                                      <option value="">WH</option>
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
                                    className="w-full h-10 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 text-xs bg-white dark:bg-slate-900"
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
                                  title={line.item_id && line.warehouse_id
                                    ? `Stock: ${getAvailableForLine(line, stockMap)}`
                                    : undefined}
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
                              <td className="py-2 px-0.5 text-right font-bold text-slate-900 dark:text-slate-100">
                                {lineTotal(line).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              </td>
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
                            <td colSpan={6} className="py-2.5 px-3 text-right">
                              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Subtotal</span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                                {totals.subtotal.toFixed(2)}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                          {totals.taxTotal > 0 && (
                            <tr>
                              <td colSpan={5} className="py-1 px-3 text-right">
                                <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-right">VAT Total</span>
                              </td>
                              <td className="py-1 px-3 text-right">
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                                  {totals.taxTotal.toFixed(2)}
                                </span>
                              </td>
                              <td></td>
                            </tr>
                          )}
                          <tr className="border-t border-slate-200 dark:border-slate-700 bg-rose-50/30 dark:bg-rose-900/10">
                            <td colSpan={5} className="py-2.5 px-3 text-right">
                              <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-widest text-right">Grand Total</span>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <span className="text-base font-black text-rose-600 dark:text-rose-400">
                                {totals.grandTotal.toFixed(2)}
                              </span>
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                      <div className="p-2.5 bg-slate-50/50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                        <button
                          type="button"
                          onClick={addLine}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-[11px] font-bold text-slate-600 shadow-sm transition-all"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 5a1 1 0 011 1v3h3a1 1 0 110 2h-3v3a1 1 0 11-2 0v-3H6a1 1 0 110-2h3V6a1 1 0 011-1z" clipRule="evenodd" /></svg>
                          Add Another Line
                        </button>
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
                        {totals.discountTotal > 0 && (
                          <>
                            <div className="flex flex-col items-end">
                              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Discount</span>
                              <span className="text-xs font-semibold text-rose-600 dark:text-rose-400">{totals.discountTotal.toFixed(2)}</span>
                            </div>
                            <div className="h-6 w-[1px] bg-slate-100 dark:bg-slate-800" />
                          </>
                        )}
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Tax Total</span>
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{totals.taxTotal.toFixed(2)}</span>
                        </div>
                        <div className="h-8 w-[1px] bg-rose-100 dark:bg-rose-900/50 mx-1" />
                        <div className="flex flex-col items-end">
                          <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">Grand Total</span>
                          <span className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                            {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col md:flex-row gap-4 items-start">
                      <div className="flex-1 space-y-1 w-full">
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
                <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print a Sales Order</span>
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
                <input autoFocus type="text" placeholder="Search by order #, customer or reference..."
                  className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                  value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
              </div>
              <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                Found {(orders || []).length} orders — click <strong>Print</strong> to open in a new tab.
              </p>
            </div>

            {/* Order list */}
            <div className="px-5 pb-5 max-h-80 overflow-y-auto">
              {(() => {
                const q = reprintSearch.trim().toLowerCase();
                const modalOrders = (orders as any[] || []).filter((ord: any) => {
                  if (!q) return true;
                  return (
                    String(ord.id).includes(q) ||
                    (ord.reference || "").toLowerCase().includes(q) ||
                    customerName(ord.customer_id).toLowerCase().includes(q)
                  );
                });
                if (!orders) return (
                  <div className="flex items-center gap-2 py-6 text-xs text-slate-400 justify-center">
                    <span className="inline-flex h-4 w-4 animate-spin rounded-full border-2 border-teal-400 border-t-transparent" />
                    Loading orders...
                  </div>
                );
                if (modalOrders.length === 0) return (
                  <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                    No sales orders found matching your search.
                  </div>
                );
                return (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-100 dark:border-slate-800 overflow-hidden mt-1">
                    {modalOrders.map((ord: any) => {
                      const total = orderTotal(ord);
                      return (
                        <div key={ord.id} className="flex items-center justify-between gap-3 px-3 py-2.5 bg-white dark:bg-slate-900 hover:bg-teal-50 dark:hover:bg-teal-950/20 transition-colors border-l-2 border-transparent hover:border-teal-500">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[11px] font-semibold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 rounded px-1.5 py-0.5 border border-teal-100 dark:border-teal-800/40">
                                #{(ord.voucher_number || ord.id)}
                              </span>
                              <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{customerName(ord.customer_id)}</span>
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                              <span>{ord.date}</span>
                              {ord.reference && <span className="italic">• {ord.reference}</span>}
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-3">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                              {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                            <a href={`/companies/${companyId}/sales/orders/${ord.id}`}
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

      <QuickSalesPersonModal
        open={isQuickSalesPersonModalOpen}
        onClose={() => setIsQuickSalesPersonModalOpen(false)}
        companyId={companyId}
        onSuccess={(newId) => {
          mutateSalesPersons();
          setSalesPersonId(String(newId));
        }}
      />
      <QuickCustomerModal
        open={isQuickCustomerModalOpen}
        onClose={() => setIsQuickCustomerModalOpen(false)}
        companyId={companyId}
        onGoToFullForm={() => router.push(`/companies/${companyId}/sales/customers?returnTo=${encodeURIComponent(`/companies/${companyId}/sales/orders`)}`)}
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
    </>
  );
}
