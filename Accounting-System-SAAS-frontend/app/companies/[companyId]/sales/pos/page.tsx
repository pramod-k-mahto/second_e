"use client";

import useSWR, { useSWRConfig } from "swr";
import { useParams, useRouter } from "next/navigation";
import {
  FormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from "react";
import { api } from "@/lib/api";
import type { ItemUnitRead } from "@/types/item";
import { convertUiToBase } from "@/lib/units";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Input } from "@/components/ui/Input";
import { useCustomerStatement } from "@/lib/api/partyStatements";

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

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

type Warehouse = {
  id: number;
  name: string;
};

type PosLine = {
  item_id: string;
  name: string;
  quantity: string;
  rate: string;
  discount: string;
  tax_rate: string;
  selected_unit_code?: string | null;
  units?: ItemUnitRead[];
  warehouse_id?: string;
};

export default function PosPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const today = new Date().toISOString().slice(0, 10);

  const { canRead, canUpdate } = useMenuAccess("pos.billing");

  const { data: items } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );
  const { data: customers } = useSWR(
    companyId ? `/sales/companies/${companyId}/customers` : null,
    fetcher
  );
  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const { data: fetchInvoices } = useSWR(
    companyId ? `/sales/companies/${companyId}/invoices` : null,
    fetcher
  );
  const invoices = fetchInvoices || [];

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const [customerId, setCustomerId] = useState("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const [paymentModeId, setPaymentModeId] = useState("");
  const [date, setDate] = useState(today);
  const [reference, setReference] = useState("");
  const [barcode, setBarcode] = useState("");
  const [selectedItemId, setSelectedItemId] = useState("");
  const [itemSearchQuery, setItemSearchQuery] = useState("");
  const [lines, setLines] = useState<PosLine[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockError, setStockError] = useState<string | null>(null);
  const [showReprintModal, setShowReprintModal] = useState(false);
  const [reprintSearch, setReprintSearch] = useState("");
  const [showNewCustomerModal, setShowNewCustomerModal] = useState(false);
  const [newCustName, setNewCustName] = useState("");
  const [newCustPhone, setNewCustPhone] = useState("");
  const [newCustEmail, setNewCustEmail] = useState("");
  const [newCustSaving, setNewCustSaving] = useState(false);
  const [newCustError, setNewCustError] = useState<string | null>(null);
  const { mutate } = useSWRConfig();

  const handleCreateCustomer = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCustName.trim()) { setNewCustError("Name is required."); return; }
    setNewCustSaving(true);
    setNewCustError(null);
    try {
      const res = await api.post(`/sales/companies/${companyId}/customers`, {
        name: newCustName.trim(),
        phone: newCustPhone.trim() || null,
        email: newCustEmail.trim() || null,
      });
      const created = res.data;
      await mutate(`/sales/companies/${companyId}/customers`);
      setCustomerId(String(created.id));
      setShowNewCustomerModal(false);
      setNewCustName(""); setNewCustPhone(""); setNewCustEmail("");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        setNewCustError(detail.map((d: any) => d?.msg || JSON.stringify(d)).join("; "));
      } else if (typeof detail === "string") {
        setNewCustError(detail);
      } else {
        setNewCustError("Failed to create customer.");
      }
    } finally {
      setNewCustSaving(false);
    }
  };

  const customerName = (id: any) => customers?.find((c: any) => c.id === Number(id))?.name || "Unknown Customer";

  const invoiceTotal = (inv: any) => {
    return (inv.lines || []).reduce((sum: number, l: any) => {
      const lineTotal = (l.quantity * l.rate) - (l.discount || 0);
      const tax = (lineTotal * (l.tax_rate || 0)) / 100;
      return sum + lineTotal + tax;
    }, 0);
  };


  const totals = useMemo(() => {
    let subtotal = 0;
    let taxTotal = 0;
    for (const l of lines) {
      const qty = Number(l.quantity || "0");
      const rate = Number(l.rate || "0");
      const disc = Number(l.discount || "0");
      const taxRate = Number(l.tax_rate || "0");
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      subtotal += (base + tax);
      taxTotal += tax;
    }
    return { subtotal, taxTotal, grandTotal: subtotal };
  }, [lines]);

  useEffect(() => {
    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Global shortcut: F2 focuses the barcode input for quick scanning
      if (e.key === "F2") {
        e.preventDefault();
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handler);
    }

    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", handler);
      }
    };
  }, []);

  const resetForm = () => {
    setCustomerId("");
    setCustomerSearchQuery("");
    setPaymentModeId("");
    setDate(new Date().toISOString().slice(0, 10));
    setReference("");
    setBarcode("");
    setLines([]);
    setSubmitError(null);
    setStockError(null);

    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const addItemToLines = async (item: any) => {
    if (!companyId || !item) return;

    let units: ItemUnitRead[] = [];
    let baseUnit: ItemUnitRead | undefined;
    try {
      const res = await api.get<ItemUnitRead[]>(
        `/companies/${companyId}/items/${item.id}/units`
      );
      units = res.data;
      baseUnit = units.find((u) => u.is_base) ?? units[0];
    } catch {
      units = [];
      baseUnit = undefined;
    }

    setLines((prev) => {
      const existingIndex = prev.findIndex((l) => l.item_id === String(item.id));
      if (existingIndex >= 0) {
        const copy = [...prev];
        const currentQty = Number(copy[existingIndex].quantity || "0");
        copy[existingIndex] = {
          ...copy[existingIndex],
          quantity: String(currentQty + 1),
        };
        return copy;
      }
      const newLine: PosLine = {
        item_id: String(item.id),
        name: item.name || "",
        quantity: "1",
        rate:
          item.default_sales_rate != null ? String(item.default_sales_rate) : "",
        discount: "0",
        tax_rate:
          item.default_tax_rate != null ? String(item.default_tax_rate) : "",
        selected_unit_code: baseUnit?.unit_code ?? null,
        units,
        warehouse_id: "",
      };
      return [...prev, newLine];
    });

    setSubmitError(null);
  };

  const handleScan = async () => {
    if (!companyId) return;
    if (!barcode.trim()) return;
    const code = barcode.trim();
    const item = items?.find(
      (it: any) => it.barcode === code || it.sku === code || String(it.id) === code
    );
    if (!item) {
      setSubmitError(`Item not found for code "${code}"`);
      setBarcode("");
      return;
    }

    await addItemToLines(item);
    setBarcode("");

    if (barcodeInputRef.current) {
      barcodeInputRef.current.focus();
    }
  };

  const handleBarcodeKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void handleScan();
    }
  };

  const handleLineChange = (index: number, field: keyof PosLine, value: string) => {
    setLines((prev) => {
      const copy = [...prev];
      const item = items?.find((it: any) => String(it.id) === copy[index].item_id);
      const isService = item?.category?.toLowerCase() === "service";

      copy[index] = {
        ...copy[index],
        [field]: value,
        warehouse_id: isService ? "" : (field === "warehouse_id" ? value : copy[index].warehouse_id)
      };
      return copy;
    });
  };

  const handleUnitChange = (index: number, unitCode: string) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], selected_unit_code: unitCode };
      return copy;
    });
  };


  const getAvailableForLine = (line: PosLine, map: Map<string, number>): number => {
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;
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
      customer_id: customerId ? Number(customerId) : null,
      payment_mode_id: paymentModeId ? Number(paymentModeId) : null,
      date,
      reference: reference || null,
      lines: lines.map((l) => {
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
        };
      }),
    };

    try {
      await api.post(`/sales/companies/${companyId}/invoices`, payload);
      resetForm();
      refreshStock(); // update stock post-submission
      await invalidateAccountingReports(companyId);
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || "Failed to save POS invoice"
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (!canRead) {
    return (
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-red-500 to-rose-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800/40">
              <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Access Denied</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                You do not have permission to use POS billing for this company.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* ── Hero Header ────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path strokeLinecap="round" strokeLinejoin="round" d="M18.5 2.5a2.121 2.121 0 113 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">POS Billing</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">
                  High-speed checkout · Barcode scanning enabled · Real-time stock sync
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden md:flex items-center gap-4 text-[10px] text-slate-400 font-medium">
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">F2</kbd>
                  <span>Focus Scanner</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-slate-50">TAB</kbd>
                  <span>Move Field</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 
                text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Exit
              </button>
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden min-h-[500px]">
          {/* Secondary Toolbar */}
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
            <button
              form="pos-form"
              type="submit"
              disabled={submitting || lines.length === 0 || !canUpdate}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 
              text-white text-xs font-semibold shadow-sm transition-all duration-150 active:scale-95 disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
              {submitting ? "Processing..." : "Finish & Save (F1)"}
            </button>

            <button
              type="button"
              onClick={resetForm}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 
              text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              Clear Screen
            </button>

            <button
              type="button"
              title="Re-Print an invoice"
              onClick={() => { setReprintSearch(""); setShowReprintModal(true); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-500 hover:bg-teal-600 active:bg-teal-700
              text-white text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
              Re-Print (P)
            </button>

            <div className="ml-auto flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 dark:bg-emerald-900/20 dark:border-emerald-800/40">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider tabular-nums">Scanner Active</span>
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

            <form id="pos-form" onSubmit={handleSubmit} className="space-y-4">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left Column: Inputs */}
                <div className="flex-1 space-y-4">

                  {/* ── Barcode Scanner ── */}
                  <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-emerald-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5h2M7 5h2m4 0h2m4 0h2M3 10h2m4 0h2m4 0h2m4 0h2M3 15h2m4 0h2m4 0h2m4 0h2M3 20h2m4 0h2m4 0h2m4 0h2" />
                      </svg>
                      <span className="text-xs font-semibold text-slate-600 tracking-tight">Barcode Scanner</span>
                      <span className="ml-auto text-[10px] font-medium text-slate-400 bg-slate-100 rounded px-1.5 py-0.5">F2 to focus</span>
                    </div>
                    <div className="relative p-2">
                      <input
                        className="w-full rounded-lg border border-slate-300 bg-slate-50 pl-4 pr-20 py-3 text-base font-mono font-semibold tracking-[0.15em] text-slate-800 placeholder:text-slate-300 placeholder:font-normal placeholder:tracking-normal focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/15 outline-none transition-all"
                        placeholder="Scan or type barcode here..."
                        value={barcode}
                        onChange={(e) => setBarcode(e.target.value)}
                        onKeyDown={handleBarcodeKeyDown}
                        ref={barcodeInputRef}
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center">
                        <button
                          type="button"
                          onClick={handleScan}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold tracking-wide transition-colors shadow-sm"
                        >
                          Search
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* ── Item + Customer ── */}
                  <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-semibold text-slate-600 tracking-tight">Item & Customer</span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                      <div className="p-3 space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Manual Item Search</label>
                        <SearchableSelect
                          options={items?.map((it: any) => {
                            const available = getTotalForItem(Number(it.id), stockMap);
                            return {
                              value: String(it.id),
                              label: it.name,
                              sublabel: `#${it.id} · ${it.sku || "No SKU"} ${available != null ? `· Stock: ${available}` : ""}`
                            };
                          }) || []}
                          value={selectedItemId}
                          onChange={async (val) => {
                            setSelectedItemId(val);
                            const item = items?.find((it: any) => String(it.id) === val);
                            if (item) {
                              await addItemToLines(item);
                              setSelectedItemId("");
                            }
                          }}
                          placeholder="Search by name or code..."
                          triggerClassName="!bg-white !border !border-slate-300 !h-9 !text-sm !rounded-lg !shadow-none"
                        />
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Customer</label>
                          <button
                            type="button"
                            onClick={() => { setShowNewCustomerModal(true); setNewCustError(null); }}
                            className="inline-flex items-center gap-1 rounded-md bg-blue-600 hover:bg-blue-700 px-2 py-0.5 text-[10px] font-bold text-white transition-colors"
                          >
                            <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            New
                          </button>
                        </div>
                        <SearchableSelect
                          options={customers?.map((c: any) => ({
                            value: String(c.id),
                            label: c.name,
                            sublabel: `#${c.id}${c.phone ? ` • ${c.phone}` : ""}${c.email ? ` • ${c.email}` : ""}`
                          })) || []}
                          value={customerId}
                          onChange={(val) => setCustomerId(val)}
                          placeholder="Walk-in customer"
                          triggerClassName="!bg-white !border !border-slate-300 !h-9 !text-sm !rounded-lg !shadow-none"
                        />
                        <CustomerBalanceBadge companyId={companyId} customerId={customerId} />
                      </div>
                    </div>
                  </div>

                  {/* ── Payment Mode / Date / Ref ── */}
                  <div className="rounded-xl border-2 border-slate-200 bg-white shadow-sm overflow-hidden">
                    <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                      <svg className="w-3.5 h-3.5 text-violet-500" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                        <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                      </svg>
                      <span className="text-xs font-semibold text-slate-600 tracking-tight">Transaction Details</span>
                    </div>

                    <div className="p-3 space-y-3">
                      {/* Payment Mode buttons */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Payment Mode</label>
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => setPaymentModeId("")}
                            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${paymentModeId === ""
                              ? "border-slate-700 bg-slate-800 text-white shadow"
                              : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:border-slate-400"
                              }`}
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                            </svg>
                            Default
                          </button>
                          {paymentModes?.map((pm, idx) => {
                            const isSelected = paymentModeId === String(pm.id);
                            const palettes = [
                              { active: "bg-emerald-600 border-emerald-600 text-white", idle: "bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100" },
                              { active: "bg-blue-600 border-blue-600 text-white", idle: "bg-blue-50 border-blue-300 text-blue-700 hover:bg-blue-100" },
                              { active: "bg-violet-600 border-violet-600 text-white", idle: "bg-violet-50 border-violet-300 text-violet-700 hover:bg-violet-100" },
                              { active: "bg-rose-600 border-rose-600 text-white", idle: "bg-rose-50 border-rose-300 text-rose-700 hover:bg-rose-100" },
                              { active: "bg-amber-500 border-amber-500 text-white", idle: "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100" },
                              { active: "bg-teal-600 border-teal-600 text-white", idle: "bg-teal-50 border-teal-300 text-teal-700 hover:bg-teal-100" },
                            ];
                            const p = palettes[idx % palettes.length];
                            return (
                              <button
                                key={pm.id}
                                type="button"
                                onClick={() => setPaymentModeId(String(pm.id))}
                                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-all duration-150 ${isSelected ? `${p.active} shadow` : p.idle
                                  }`}
                              >
                                <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                  <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
                                </svg>
                                {pm.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Date + Ref # */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date</label>
                          <Input
                            type="date"
                            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 font-medium focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                            required
                          />
                        </div>
                        <div className="space-y-1.5">
                          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Reference #</label>
                          <input
                            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-400/20 transition-all"
                            placeholder="Optional"
                            value={reference}
                            onChange={(e) => setReference(e.target.value)}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right Column: Mini Summary */}
                <div className="w-full md:w-64 space-y-4">
                  <div className="rounded-2xl bg-slate-900 p-5 text-white shadow-xl shadow-emerald-500/10">
                    <div className="flex flex-col items-center">
                      <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-1">Total Amount</span>
                      <span className="text-4xl font-black tracking-tighter tabular-nums">
                        {totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                      <div className="w-full h-[1px] bg-slate-800 my-4" />
                      <div className="w-full flex justify-between text-[11px] font-medium text-slate-400">
                        <span>Subtotal</span>
                        <span className="text-slate-100">{totals.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="w-full flex justify-between text-[11px] font-medium text-slate-400 mt-2">
                        <span>Tax Total</span>
                        <span className="text-slate-100">{totals.taxTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl text-[10px] text-slate-500 italic leading-snug">
                    Quick Hint: Press <kbd className="font-sans font-bold text-slate-900 border px-1 rounded bg-white">F2</kbd> anytime to return focus to the barcode scanner for the next item.
                  </div>
                </div>
              </div>

              {/* Table Section */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm bg-white dark:bg-slate-900/50 mt-6">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr className="text-slate-500 uppercase tracking-tighter">
                      <th className="text-left py-3 px-4 font-bold w-[40%]">Product</th>
                      <th className="text-left py-3 px-2 font-bold w-[12%]">Warehouse</th>
                      <th className="text-left py-3 px-2 font-bold w-[8%]">Unit</th>
                      <th className="text-right py-3 px-2 font-bold w-[8%]">Qty</th>
                      <th className="text-right py-3 px-2 font-bold w-[12%]">Rate</th>
                      <th className="text-right py-3 px-4 font-bold w-[15%] text-emerald-600">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-12 px-2 text-center text-slate-400 italic">
                          <div className="flex flex-col items-center gap-2">
                            <svg className="w-8 h-8 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                            </svg>
                            <span>Basket is empty. Scan a product to begin checkout.</span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      lines.map((line, idx) => {
                        const qty = Number(line.quantity || "0");
                        const rate = Number(line.rate || "0");
                        const disc = Number(line.discount || "0");
                        const taxRate = Number(line.tax_rate || "0");
                        const base = qty * rate - disc;
                        const tax = (base * taxRate) / 100;
                        const total = base + tax;
                        return (
                          <tr key={idx} className="group hover:bg-slate-50/50 transition-colors">
                            <td className="py-2.5 px-4">
                              <div className="flex flex-col">
                                <span className="font-bold text-slate-800 dark:text-slate-100">{line.name}</span>
                                <span className="text-[10px] text-slate-500">#{line.item_id}</span>
                              </div>
                            </td>
                            <td className="py-2.5 px-2">
                              {(() => {
                                const item = items?.find((it: any) => String(it.id) === line.item_id);
                                const isService = item?.category?.toLowerCase() === "service";
                                if (isService) {
                                  return <div className="text-[10px] text-slate-400 italic px-2">N/A (Svc)</div>;
                                }
                                return (
                                  <select
                                    className="w-full h-10 border-slate-200 rounded-md text-[11px] py-1 bg-transparent"
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
                            <td className="py-2.5 px-2">
                              {line.units && line.units.length > 0 ? (
                                <select
                                  className="w-full h-10 border-slate-200 rounded-md text-[11px] py-1 bg-transparent"
                                  value={line.selected_unit_code ?? ""}
                                  onChange={(e) => handleUnitChange(idx, e.target.value)}
                                >
                                  {line.units.map((u) => <option key={u.id} value={u.unit_code}>{u.unit_code}</option>)}
                                </select>
                              ) : <span className="text-[10px] text-slate-400 px-1 border border-slate-100 rounded">BASE</span>}
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number" step="0.01"
                                className="w-16 h-10 border-slate-200 rounded-md text-[11px] py-1 text-right font-bold focus:ring-emerald-500/20"
                                value={line.quantity}
                                onChange={(e) => handleLineChange(idx, "quantity", e.target.value)}
                                title={line.item_id && line.warehouse_id
                                  ? `Stock: ${getAvailableForLine(line, stockMap)}`
                                  : undefined}
                              />
                            </td>
                            <td className="py-2.5 px-2 text-right">
                              <input
                                type="number" step="0.01"
                                className="w-20 h-10 border-slate-200 rounded-md text-[11px] py-1 text-right focus:ring-emerald-500/20"
                                value={line.rate}
                                onChange={(e) => handleLineChange(idx, "rate", e.target.value)}
                              />
                            </td>
                            <td className="py-2.5 px-4 text-right font-black text-slate-900 group-hover:text-emerald-600 transition-colors">
                              {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50/50 dark:bg-slate-800/20 border-t border-slate-200 dark:border-slate-800">
                    <tr>
                      <td colSpan={5} className="py-2.5 px-4 text-right">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Subtotal</span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="text-sm font-bold text-slate-700 dark:text-slate-300">
                          {totals.subtotal.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                    {totals.taxTotal > 0 && (
                      <tr>
                        <td colSpan={5} className="py-1 px-4 text-right">
                          <span className="text-[10px] font-medium text-slate-500 uppercase tracking-widest text-right">VAT Total</span>
                        </td>
                        <td className="py-1 px-4 text-right">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                            {totals.taxTotal.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    )}
                    <tr className="border-t border-slate-200 dark:border-slate-700 bg-emerald-50/30 dark:bg-emerald-900/10">
                      <td colSpan={5} className="py-2.5 px-4 text-right">
                        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest text-right">Grand Total</span>
                      </td>
                      <td className="py-2.5 px-4 text-right">
                        <span className="text-base font-black text-emerald-600 dark:text-emerald-400">
                          {totals.grandTotal.toFixed(2)}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </form>
          </div >
        </div >
        {/* ═══ Re-Print Modal ═══ */}
        {
          showReprintModal && (
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
                    <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">Re-Print an Invoice</span>
                  </div>
                  <button type="button" onClick={() => setShowReprintModal(false)}
                    className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>

                <div className="px-5 pt-4 pb-2">
                  <div className="relative">
                    <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                    <input autoFocus type="text" placeholder="Search by invoice #, customer or reference..."
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-400 placeholder-slate-400"
                      value={reprintSearch} onChange={(e) => setReprintSearch(e.target.value)} />
                  </div>
                  <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
                    Found {invoices.length} invoices — click <strong>Print</strong> to open in a new tab.
                  </p>
                </div>

                <div className="px-5 pb-5 max-h-80 overflow-y-auto">
                  {(() => {
                    const q = reprintSearch.trim().toLowerCase();
                    const modalInvoices = invoices.filter((inv: any) => {
                      if (!q) return true;
                      return (
                        String(inv.id).includes(q) ||
                        (inv.reference || "").toLowerCase().includes(q) ||
                        customerName(inv.customer_id).toLowerCase().includes(q)
                      );
                    });
                    if (modalInvoices.length === 0) return (
                      <div className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                        No invoices found.
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
                                    #{(inv.voucher_number || inv.id)}
                                  </span>
                                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{customerName(inv.customer_id)}</span>
                                </div>
                                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
                                  <span>{inv.date}</span>
                                  {inv.reference && <span className="italic">• {inv.reference}</span>}
                                </div>
                              </div>
                              <div className="shrink-0 flex items-center gap-3">
                                <span className="text-xs font-bold text-slate-900 dark:text-slate-100">
                                  {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </span>
                                <a href={`/companies/${companyId}/sales/invoices/${inv.id}`}
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
          )
        }
      </div >

      {/* ── New Customer Quick-Create Modal ── */}
      {showNewCustomerModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowNewCustomerModal(false); }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden">
            {/* Modal header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50 px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100">
                  <svg className="w-3.5 h-3.5 text-blue-600" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
                  </svg>
                </div>
                <span className="text-sm font-bold text-slate-800">New Customer</span>
              </div>
              <button
                type="button"
                onClick={() => setShowNewCustomerModal(false)}
                className="p-1 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateCustomer} className="p-4 space-y-3">
              {newCustError && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {newCustError}
                </div>
              )}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 font-medium placeholder:text-slate-400 placeholder:font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                  placeholder="e.g. John Doe"
                  value={newCustName}
                  onChange={(e) => setNewCustName(e.target.value)}
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Phone</label>
                  <input
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                    placeholder="Optional"
                    value={newCustPhone}
                    onChange={(e) => setNewCustPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 placeholder:font-normal focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400/20 transition-all"
                    placeholder="Optional"
                    value={newCustEmail}
                    onChange={(e) => setNewCustEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowNewCustomerModal(false)}
                  className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newCustSaving}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 px-4 py-2 text-xs font-bold text-white transition-colors shadow-sm"
                >
                  {newCustSaving ? (
                    <><span className="inline-flex h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" /> Saving…</>
                  ) : (
                    <><svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg> Create Customer</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
