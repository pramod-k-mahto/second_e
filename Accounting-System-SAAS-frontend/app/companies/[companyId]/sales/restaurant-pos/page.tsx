"use client";

import { useParams, useRouter } from "next/navigation";
import { useState, useMemo, useEffect, useRef } from "react";
import useSWR, { useSWRConfig } from "swr";
import { api, getCurrentCompany, getApiErrorMessage } from "@/lib/api";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import {
  generateEscPos,
  printToThermal,
  saveOrderOffline,
  getPendingOrders,
} from "@/lib/pos-utils";
import { useToast } from "@/components/ui/Toast";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function RestaurantPosPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const { showToast } = useToast();
  const { mutate } = useSWRConfig();
  const currentCompany = getCurrentCompany();

  const { data: items } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher,
  );

  const { data: categories } = useSWR(
    companyId ? `/inventory/companies/${companyId}/categories` : null,
    fetcher,
  );

  const { data: paymentModes } = useSWR(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher,
  );

  const { data: customers } = useSWR(
    companyId ? `/sales/companies/${companyId}/customers` : null,
    fetcher,
  );

  const { data: tables } = useSWR(
    companyId ? `/companies/${companyId}/restaurant-tables` : null,
    fetcher,
  );

  const { data: openOrders, mutate: mutateOrders } = useSWR(
    companyId ? `/companies/${companyId}/orders/sales?status=OPEN` : null,
    fetcher,
  );

  const { data: serverHistory, mutate: mutateHistory } = useSWR(
    companyId ? `/sales/companies/${companyId}/invoices?limit=20` : null,
    fetcher,
  );

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Cart State
  const [cart, setCart] = useState<any[]>([]);
  const [orderType, setOrderType] = useState<
    "DINE_IN" | "TAKEAWAY" | "DELIVERY"
  >("DINE_IN");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);

  // UI State
  const [showCheckout, setShowCheckout] = useState(false);
  const [selectedPaymentMode, setSelectedPaymentMode] = useState<string | null>(
    null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [occupiedTables, setOccupiedTables] = useState<Set<string>>(new Set());
  const [activeCartTab, setActiveCartTab] = useState<"current" | "recent">(
    "current",
  );
  const [isProcessed, setIsProcessed] = useState(false);
  const [processedInvoice, setProcessedInvoice] = useState<any>(null);
  const [showReceiptPreview, setShowReceiptPreview] = useState(false);
  const [resumedReference, setResumedReference] = useState<string | null>(null);
  const [resumedOrderIds, setResumedOrderIds] = useState<number[]>([]);

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setPendingSyncCount(getPendingOrders().length);

    // Load recent orders from local storage for current session
    const stored = localStorage.getItem(`recent_pos_orders_${companyId}`);
    if (stored) {
      const orders = JSON.parse(stored);
      setRecentOrders(orders);
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "F2") {
        e.preventDefault();
        barcodeInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleBarcodeScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcode.trim()) return;

    const item = items?.find(
      (it: any) =>
        it.barcode === barcode.trim() ||
        it.sku === barcode.trim() ||
        String(it.id) === barcode.trim(),
    );

    if (item) {
      addToCart(item);
      showToast({
        title: "Item Added",
        description: `${item.name} added to cart.`,
        variant: "success",
      });
    } else {
      showToast({
        title: "Not Found",
        description: `No item found for "${barcode}"`,
        variant: "error",
      });
    }
    setBarcode("");
  };

  useEffect(() => {
    if (paymentModes && paymentModes.length > 0 && !selectedPaymentMode) {
      setSelectedPaymentMode(String(paymentModes[0].id));
    }
  }, [paymentModes, selectedPaymentMode]);


  useEffect(() => {
    if (openOrders) {
      const occupied = new Set<string>(
        openOrders
          .filter((o: any) => o.reference && o.status === "OPEN")
          .map((o: any) => o.reference),
      );
      setOccupiedTables(occupied);
    }
  }, [openOrders]);

  // Helper to merge orders into cart
  const mergeOrdersToCart = (matchingOrders: any[]) => {
    const mergedCart: any[] = [];
    matchingOrders.forEach((order) => {
      if (order.lines) {
        order.lines.forEach((l: any) => {
          const existing = mergedCart.find((i) => i.id === l.item_id);
          if (existing) {
            existing.quantity += l.quantity;
          } else {
            mergedCart.push({
              id: l.item_id,
              name: l.item_name || "Item",
              default_sales_rate: l.rate,
              quantity: l.quantity,
              tax_rate: l.tax_rate,
            });
          }
        });
      }
    });
    setCart(mergedCart);
    if (matchingOrders[0]?.customer_id)
      setSelectedCustomer(String(matchingOrders[0].customer_id));
  };

  const lastAutoLoadedRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedTable && openOrders) {
      if (selectedTable !== lastAutoLoadedRef.current) {
        const matchingOrders = openOrders.filter(
          (o: any) => o.reference === selectedTable && o.status === "OPEN",
        );
        if (matchingOrders.length > 0) {
          setResumedOrderIds(matchingOrders.map((o: any) => o.id));
          mergeOrdersToCart(matchingOrders);
          showToast({
            title: "Orders Merged",
            description: `Loaded all items for ${selectedTable}.`,
            variant: "success",
          });
        }
        lastAutoLoadedRef.current = selectedTable;
      }
    } else if (!selectedTable) {
      lastAutoLoadedRef.current = null;
    }
  }, [selectedTable, openOrders]);

  const addToCart = (item: any) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.id === item.id);
      if (existing) {
        return prev.map((i) =>
          i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i,
        );
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (itemId: number, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.id === itemId
            ? { ...i, quantity: Math.max(0, i.quantity + delta) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  };

  const totals = useMemo(() => {
    const subtotal = cart.reduce(
      (sum, item) => sum + item.default_sales_rate * item.quantity,
      0,
    );
    const tax = subtotal * 0.13; // Assuming 13% VAT
    return { subtotal, tax, total: subtotal + tax };
  }, [cart]);

  const handlePlaceOrder = async () => {
    if (!companyId || cart.length === 0) return;
    setIsSubmitting(true);

    try {
      const hasServiceItem = cart.some(
        (item) => item.category?.toLowerCase() === "service",
      );

      const effectiveReference =
        selectedTable ||
        resumedReference ||
        (orderType === "TAKEAWAY" ? "Takeaway" : "Delivery");
      const matchingOrders = (openOrders || []).filter((o: any) => {
        if (resumedOrderIds.includes(Number(o.id))) return true;
        if (selectedTable && o.reference === selectedTable && o.status === "OPEN")
          return true;
        if (resumedReference && o.reference === resumedReference && o.status === "OPEN")
          return true;
        return false;
      });

      const walkInCustomer =
        (customers || []).find(
          (c: any) =>
            c.name.toLowerCase().includes("walk") ||
            c.name.toLowerCase().includes("cash") ||
            c.name.toLowerCase().includes("counter"),
        ) || (customers && customers.length > 0 ? customers[0] : null);

      const payload = {
        customer_id: selectedCustomer
          ? Number(selectedCustomer)
          : walkInCustomer?.id || null,
        date: new Date().toISOString().slice(0, 10),
        reference: effectiveReference,
        lines: cart.map((item) => ({
          item_id: Number(item.id),
          quantity: item.quantity,
          rate: item.default_sales_rate,
          discount: 0,
          tax_rate: 13, // Fixed for now
        })),
      };

      let response;
      if (matchingOrders.length > 0) {
        // Update the primary order with the full merged cart
        response = await api.put(
          `/companies/${companyId}/orders/sales/${matchingOrders[0].id}`,
          payload,
        );

        // Cancel other redundant open orders for this table to resolve them
        for (let i = 1; i < matchingOrders.length; i++) {
          try {
            await api.post(
              `/companies/${companyId}/orders/sales/${matchingOrders[i].id}/cancel`,
            );
          } catch (e) {
            /* ignore cleanup errors */
          }
        }
      } else {
        response = await api.post(
          `/companies/${companyId}/orders/sales`,
          payload,
        );
      }

      const orderId = response.data.id;
      let invoiceNumber = null;
      let invoiceId = null;

      if (orderType !== "DELIVERY" || selectedPaymentMode || hasServiceItem) {
        // Convert to Invoice if it's Dine-In/Takeaway OR if it's a Paid Delivery OR if it has Service Items
        const convertRes = await api.post(
          `/companies/${companyId}/orders/sales/${orderId}/convert-to-invoice`,
          {
            payment_mode_id: selectedPaymentMode
              ? Number(selectedPaymentMode)
              : null,
            date: new Date().toISOString().slice(0, 10),
          },
        );
        invoiceNumber = convertRes.data.invoice_number;
        invoiceId = convertRes.data.invoice_id;
      } else {
        // Unpaid delivery gets marked as PROCESSING so it disappears from POS active list
        await api.put(`/companies/${companyId}/orders/sales/${orderId}`, {
          status: "PROCESSING",
        });
      }

      // Add to recent orders (only for invoices usually, but keeping logic consistent)
      const orderSummary = {
        id: orderId,
        type: orderType,
        table: selectedTable,
        time: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        items: cart.length,
        cart: [...cart],
        total: totals.total,
        invoiceNumber: invoiceNumber,
      };
      const updatedRecent = [orderSummary, ...recentOrders].slice(0, 10);
      setRecentOrders(updatedRecent);
      localStorage.setItem(
        `recent_pos_orders_${companyId}`,
        JSON.stringify(updatedRecent),
      );

      const selectedCustomerObj = customers?.find((c: any) => String(c.id) === String(selectedCustomer || walkInCustomer?.id));
      const customerName = selectedCustomerObj?.name || "Walk-In Customer";

      const printData = {
        id: orderId,
        invoiceId: invoiceId,
        companyName: currentCompany?.name || "RESTAURANT",
        customerName: customerName,
        invoiceNumber: invoiceNumber,
        table: effectiveReference,
        orderType: orderType,
        items: cart.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.default_sales_rate,
        })),
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        date: new Date().toLocaleDateString(),
      };

      setProcessedInvoice(printData);
      setIsProcessed(true);

      await mutateHistory();
      await mutateOrders(); // Trigger re-fetch of open orders with cache-busting
      invalidateAccountingReports(companyId);
      // Clear resumed info immediately to avoid double processing if modal is closed then reopened
      setResumedOrderIds([]);
      setResumedReference(null);
    } catch (error) {
      showToast({
        title: "Error",
        description: getApiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetPOS = () => {
    setCart([]);
    setSelectedTable(null);
    setSelectedCustomer(null);
    setShowCheckout(false);
    setIsProcessed(false);
    setProcessedInvoice(null);
    setShowReceiptPreview(false);
    setResumedReference(null);
    setResumedOrderIds([]);
  };

  const handleHoldOrder = async () => {
    if (
      !companyId ||
      cart.length === 0 ||
      (orderType === "DINE_IN" && !selectedTable)
    )
      return;
    setIsSubmitting(true);

    try {
      const effectiveReference =
        selectedTable ||
        resumedReference ||
        (orderType === "TAKEAWAY" ? "Takeaway" : "Delivery") +
          "-" +
          Math.random().toString(36).substring(7).toUpperCase();
      const matchingOrders = (openOrders || []).filter((o: any) => {
        if (resumedOrderIds.includes(o.id)) return true;
        if (selectedTable && o.reference === selectedTable && o.status === "OPEN")
          return true;
        return false;
      });

      const walkInCustomer =
        (customers || []).find(
          (c: any) =>
            c.name.toLowerCase().includes("walk") ||
            c.name.toLowerCase().includes("cash") ||
            c.name.toLowerCase().includes("counter"),
        ) || (customers && customers.length > 0 ? customers[0] : null);

      const payload = {
        customer_id: selectedCustomer
          ? Number(selectedCustomer)
          : walkInCustomer?.id || null,
        date: new Date().toISOString().slice(0, 10),
        reference: effectiveReference,
        lines: cart.map((item) => ({
          item_id: Number(item.id),
          quantity: item.quantity,
          rate: item.default_sales_rate,
          discount: 0,
          tax_rate: 13,
        })),
      };

      if (matchingOrders.length > 0) {
        await api.put(
          `/companies/${companyId}/orders/sales/${matchingOrders[0].id}`,
          payload,
        );
        // Cancel others
        for (let i = 1; i < matchingOrders.length; i++) {
          try {
            await api.post(
              `/companies/${companyId}/orders/sales/${matchingOrders[i].id}/cancel`,
            );
          } catch (e) {}
        }
      } else {
        await api.post(`/companies/${companyId}/orders/sales`, payload);
      }

      showToast({
        title: "Order Held",
        description: `Order for ${selectedTable || "Table"} saved.`,
        variant: "success",
      });
      setCart([]);
      setSelectedTable(null);
      setResumedReference(null);
      setResumedOrderIds([]);
      mutateOrders();
    } catch (error) {
      showToast({
        title: "Error",
        description: getApiErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };
  const filteredItems = useMemo(() => {
    if (!items) return [];
    const term = search.toLowerCase();

    return items
      .filter((item: any) => {
        const matchSearch =
          item.name.toLowerCase().includes(term) ||
          item.barcode?.toLowerCase().includes(term) ||
          item.sku?.toLowerCase().includes(term);
        const matchCategory =
          !selectedCategory || String(item.category_id) === selectedCategory;
        return matchSearch && matchCategory;
      })
      .sort((a: any, b: any) => {
        if (!term) return 0;
        const aName = a.name.toLowerCase();
        const bName = b.name.toLowerCase();

        const aStarts = aName.startsWith(term);
        const bStarts = bName.startsWith(term);

        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        return aName.localeCompare(bName);
      });
  }, [items, search, selectedCategory]);

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden bg-slate-50 dark:bg-slate-950 font-sans">
      <style>{`
        @keyframes slideIn {
          from { transform: translateX(20px); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .cart-item-anim { animation: slideIn 0.2s ease-out both; }
        .glass-panel { background: rgba(255, 255, 255, 0.7); backdrop-filter: blur(10px); }
        .dark .glass-panel { background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(10px); }
      `}</style>

      {/* Menu Area */}
      <div className="flex flex-1 flex-col p-6 overflow-hidden">
        {/* Header / Search */}
        <div className="mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex flex-col">
              <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight flex items-center gap-3">
                <span className="h-10 w-10 rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 flex items-center justify-center text-white shadow-lg shadow-rose-500/20 text-xl">
                  🍽️
                </span>
                Restaurant POS
              </h1>
              {selectedTable && (
                <div className="mt-1 flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500 text-white text-[10px] font-black uppercase tracking-widest w-fit animate-in fade-in slide-in-from-left-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                  Serving Table: {selectedTable}
                </div>
              )}
            </div>
            <div className="flex items-center gap-4">
              {pendingSyncCount > 0 && (
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-[10px] font-bold animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-amber-500" />
                  {pendingSyncCount} Orders Pending Sync
                </div>
              )}
              <div className="text-[10px] items-center gap-1 text-slate-400 hidden md:flex border-r border-slate-200 dark:border-slate-800 pr-4 mr-2 h-10">
                <kbd className="px-1.5 py-0.5 rounded border border-slate-200 bg-white">
                  F2
                </kbd>
                <span>for Scanner</span>
              </div>
              <button
                type="button"
                onClick={() => router.back()}
                className="h-10 w-10 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition-all shadow-sm group"
                title="Go Back"
              >
                <svg
                  className="h-6 w-6 transform group-hover:-translate-x-1 transition-transform duration-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (cart.length > 0) {
                    if (confirm("You have items in your cart. Are you sure you want to close the POS?")) {
                      router.push("/dashboard");
                    }
                  } else {
                    router.push("/dashboard");
                  }
                }}
                className="h-10 w-10 rounded-xl bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:border-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all shadow-sm group"
                title="Close POS"
              >
                <svg
                  className="h-6 w-6 transform group-hover:rotate-90 transition-transform duration-300"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2.5}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <form
              onSubmit={handleBarcodeScan}
              className="relative flex-1 group"
            >
              <input
                ref={barcodeInputRef}
                type="text"
                placeholder="Scan Barcode or Search items..."
                className="w-full h-14 pl-14 pr-4 rounded-2xl border-2 border-transparent bg-white dark:bg-slate-900 shadow-sm focus:border-rose-500 focus:ring-4 focus:ring-rose-500/10 transition-all text-base font-medium group-hover:shadow-md"
                value={barcode}
                onChange={(e) => {
                  setBarcode(e.target.value);
                  setSearch(e.target.value);
                }}
              />
              <svg
                className="absolute left-5 top-4.5 h-6 w-6 text-slate-400 group-focus-within:text-rose-500 transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </form>
            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar max-w-[50%]">
              <button
                onClick={() => setSelectedCategory(null)}
                className={`px-5 py-3 rounded-2xl text-xs font-black whitespace-nowrap transition-all shadow-sm ${!selectedCategory ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 scale-105" : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:border-rose-200"}`}
              >
                All Menus
              </button>
              {categories?.map((cat: any) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(String(cat.id))}
                  className={`px-5 py-3 rounded-2xl text-xs font-black whitespace-nowrap transition-all shadow-sm ${selectedCategory === String(cat.id) ? "bg-slate-900 text-white dark:bg-white dark:text-slate-950 scale-105" : "bg-white dark:bg-slate-900 text-slate-500 border border-slate-200 dark:border-slate-800 hover:border-rose-200"}`}
                >
                  {cat.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Grid Area */}
        <div className="flex-1 overflow-y-auto no-scrollbar pr-2">
          {!items ? (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 animate-pulse">
              {[...Array(8)].map((_, i) => (
                <div
                  key={i}
                  className="aspect-square rounded-[3rem] bg-slate-200 dark:bg-slate-800"
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 pb-12">
              {filteredItems.map((item: any, idx: number) => {
                const palettes = [
                  {
                    bg: "bg-rose-950/40",
                    border: "border-rose-500/30",
                    accent: "text-rose-400",
                    secondary: "text-rose-200/40",
                    glow: "shadow-rose-500/20",
                    gradient: "from-rose-500/20",
                  },
                  {
                    bg: "bg-indigo-950/40",
                    border: "border-indigo-500/30",
                    accent: "text-indigo-400",
                    secondary: "text-indigo-200/40",
                    glow: "shadow-indigo-500/20",
                    gradient: "from-indigo-500/20",
                  },
                  {
                    bg: "bg-emerald-950/40",
                    border: "border-emerald-500/30",
                    accent: "text-emerald-400",
                    secondary: "text-emerald-200/40",
                    glow: "shadow-emerald-500/20",
                    gradient: "from-emerald-500/20",
                  },
                  {
                    bg: "bg-amber-950/40",
                    border: "border-amber-500/30",
                    accent: "text-amber-400",
                    secondary: "text-amber-200/40",
                    glow: "shadow-amber-500/20",
                    gradient: "from-amber-500/20",
                  },
                  {
                    bg: "bg-sky-950/40",
                    border: "border-sky-500/30",
                    accent: "text-sky-400",
                    secondary: "text-sky-200/40",
                    glow: "shadow-sky-500/20",
                    gradient: "from-sky-500/20",
                  },
                  {
                    bg: "bg-violet-950/40",
                    border: "border-violet-500/30",
                    accent: "text-violet-400",
                    secondary: "text-violet-200/40",
                    glow: "shadow-violet-500/20",
                    gradient: "from-violet-500/20",
                  },
                ];
                const color = palettes[idx % palettes.length];
                const categoryName =
                  categories?.find(
                    (c: any) => String(c.id) === String(item.category_id),
                  )?.name || "Premium";

                return (
                  <button
                    key={item.id}
                    onClick={() => addToCart(item)}
                    className={`group relative flex flex-col ${color.bg} rounded-[3rem] border-2 ${color.border} shadow-xl ${color.glow} hover:shadow-2xl transition-all duration-500 text-left overflow-hidden active:scale-[0.96] hover:-translate-y-2 aspect-square`}
                  >
                    {/* Background Image with Overlay */}
                    {item.image_url && (
                      <div className="absolute inset-0 z-0">
                        <img
                          src={item.image_url}
                          alt=""
                          className="h-full w-full object-cover opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-700"
                        />
                        <div
                          className={`absolute inset-0 bg-gradient-to-t ${color.bg} via-transparent to-transparent opacity-80`}
                        />
                      </div>
                    )}

                    <div
                      className={`absolute inset-0 bg-gradient-to-t ${color.gradient} to-transparent opacity-40 group-hover:opacity-100 transition-opacity duration-500 z-5`}
                    />

                    <div className="flex-1 w-full flex flex-col p-8 justify-between relative z-10">
                      <div className="flex flex-col gap-3">
                        <div className="flex justify-between items-start w-full">
                          <h3
                            className={`px-4 py-2 rounded-2xl bg-slate-900/90 backdrop-blur-xl text-[12px] font-black uppercase tracking-[0.1em] border-2 ${color.border} ${color.accent} shadow-2xl flex-1 mr-4 leading-tight`}
                          >
                            {item.name}
                          </h3>
                          <div
                            className={`h-11 w-11 rounded-xl bg-slate-800 border-2 border-white/10 flex items-center justify-center ${color.accent} shadow-lg group-hover:bg-white group-hover:text-slate-900 transition-all transform group-hover:rotate-12 duration-300 flex-shrink-0 animate-in zoom-in-0`}
                          >
                            <svg
                              className="h-5 w-5"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M12 4v16m8-8H4"
                              />
                            </svg>
                          </div>
                        </div>
                        <div className="pl-1">
                          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em]">
                            {categoryName}
                          </span>
                          <div
                            className={`h-0.5 w-8 ${color.accent.replace("text", "bg")} rounded-full mt-1.5 transition-all duration-500 group-hover:w-16 opacity-40`}
                          />
                        </div>
                      </div>

                      <div className="flex flex-col">
                        <span
                          className={`text-[10px] font-black uppercase tracking-widest mb-1.5 ${color.secondary}`}
                        >
                          Special Price
                        </span>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-3xl font-black text-white tabular-nums drop-shadow-lg">
                            Rs. {Number(item.default_sales_rate).toFixed(0)}
                          </span>
                          <span
                            className={`text-[11px] font-black ${color.accent}`}
                          >
                            NPR
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Decorative Background Initial (if no image or as accent) */}
                    <span className="absolute -bottom-8 -right-4 text-[12rem] font-black text-white/[0.03] pointer-events-none select-none uppercase leading-none transform rotate-12 group-hover:rotate-0 transition-transform duration-700 z-1">
                      {item.name[0]}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Cart Panel */}
      <div className="w-[380px] bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl z-10">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 relative">
          <div className="flex bg-slate-100 dark:bg-slate-800/50 p-1 rounded-xl mb-5">
            <button
              onClick={() => setActiveCartTab("current")}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${activeCartTab === "current" ? "bg-white dark:bg-slate-900 shadow-sm text-rose-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              Order {cart.length > 0 && `(${cart.length})`}
            </button>
            <button
              onClick={() => setActiveCartTab("recent")}
              className={`flex-1 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${activeCartTab === "recent" ? "bg-white dark:bg-slate-900 shadow-sm text-rose-600" : "text-slate-400 hover:text-slate-600"}`}
            >
              Recent
            </button>
          </div>

          {activeCartTab === "current" ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${cart.length > 0 ? "bg-green-500" : "bg-slate-300"}`}
                  />
                  Configuration
                </h2>
                <button
                  onClick={() => setCart([])}
                  className="text-[10px] font-bold text-slate-400 hover:text-rose-600 transition-colors uppercase tracking-wider"
                >
                  Clear Cart
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(["DINE_IN", "TAKEAWAY", "DELIVERY"] as const).map((type) => (
                  <button
                    key={type}
                    onClick={() => {
                      setOrderType(type);
                      if (type !== "DINE_IN") setSelectedTable(null);
                    }}
                    className={`py-2 rounded-lg text-[10px] font-bold transition-all border ${orderType === type ? "bg-rose-50 border-rose-200 text-rose-600" : "bg-slate-50 border-slate-100 text-slate-500"}`}
                  >
                    {type.replace("_", " ")}
                  </button>
                ))}
              </div>
              <div className="mt-3 space-y-3">
                <div className="relative">
                  <SearchableSelect
                    options={(customers || []).map((c: any) => ({
                        value: String(c.id),
                        label: c.name,
                        sublabel: c.phone || c.email || "",
                      }))}
                    value={selectedCustomer || ""}
                    onChange={setSelectedCustomer}
                    placeholder="Search Customer..."
                    triggerClassName="h-10 text-xs font-bold border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900"
                  />
                </div>

                {orderType === "DINE_IN" && (
                  <div className="relative group/table">
                    <div className="flex items-center justify-between mb-1.5 px-1">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                        Table Selection
                        {!selectedTable && (
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                        )}
                      </label>
                      {!selectedTable && (
                        <span className="text-[9px] font-bold text-rose-500 animate-bounce">
                          Required *
                        </span>
                      )}
                    </div>
                    <SearchableSelect
                      options={(tables || [])
                        .filter((t: any) => t.is_active)
                        .map((table: any) => {
                          const tName = table.name;
                          const isOccupied = occupiedTables.has(tName);
                          return {
                            value: tName,
                            label: tName,
                            sublabel: isOccupied ? "Occupied" : "Available",
                          };
                        })}
                      value={selectedTable || ""}
                      onChange={setSelectedTable}
                      placeholder="Select Table..."
                      triggerClassName={`h-12 border-2 text-sm font-bold ${
                        !selectedTable
                          ? "border-rose-500 shadow-lg shadow-rose-500/10 animate-[pulse_2s_infinite]"
                          : "border-slate-100 dark:border-slate-800"
                      }`}
                    />
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                Order History
              </h2>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter self-center px-2 py-0.5 rounded-full bg-slate-50 dark:bg-slate-800">
                Last 10 items
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeCartTab === "current" ? (
            cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 italic text-sm text-center p-5">
                <div className="h-20 w-20 rounded-full bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center text-4xl mb-4 grayscale opacity-50">
                  🍔
                </div>
                <p className="font-bold text-slate-500">Your cart is empty</p>
                <p className="text-[10px] mt-2 max-w-[180px]">
                  Add some delicious items from the menu to start an order
                </p>
              </div>
            ) : (
              <div className="space-y-4 p-4">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-4 group cart-item-anim"
                  >
                    <div className="h-14 w-14 rounded-2xl bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-inner border border-slate-100 dark:border-slate-800">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="object-cover h-full w-full"
                        />
                      ) : (
                        <span className="font-black text-slate-200 dark:text-slate-700 text-xl">
                          {item.name[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-[12px] font-black text-slate-800 dark:text-white truncate uppercase tracking-tight">
                        {item.name}
                      </h4>
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 font-bold mt-1">
                        Rs. {Number(item.default_sales_rate).toFixed(0)}
                      </p>
                    </div>
                    <div className="flex items-center bg-slate-900 dark:bg-white rounded-xl p-1 shadow-lg">
                      <button
                        onClick={() => updateQuantity(item.id, -1)}
                        className="h-8 w-8 flex items-center justify-center text-white dark:text-slate-900 hover:bg-white/10 dark:hover:bg-slate-100 rounded-lg transition-all font-black text-lg"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-[13px] font-black text-white dark:text-slate-950 tabular-nums">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateQuantity(item.id, 1)}
                        className="h-8 w-8 flex items-center justify-center text-white dark:text-slate-900 hover:bg-white/10 dark:hover:bg-slate-100 rounded-lg transition-all font-black text-lg"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            <div className="h-full flex flex-col p-4 space-y-8 overflow-y-auto no-scrollbar">
              {/* Active Sessions */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-rose-500 uppercase tracking-[0.2em] flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  Active Sessions
                </h3>
                {openOrders === undefined ? (
                  <div className="flex flex-col items-center justify-center p-12 space-y-4">
                    <div className="h-8 w-8 border-4 border-rose-500/20 border-t-rose-500 rounded-full animate-spin" />
                    <p className="text-[10px] font-black text-rose-500/50 uppercase tracking-widest">
                      Fetching Sessions...
                    </p>
                  </div>
                ) : openOrders && openOrders.length > 0 ? (
                  <div className="space-y-3">
                    {(() => {
                      const groups = new Map<string, any[]>();
                      openOrders
                        .filter((o: any) => o.status === "OPEN")
                        .forEach((o: any) => {
                          const ref = (
                            o.reference ||
                            o.voucher_number ||
                            "Walk-in"
                          ).trim();
                        const refLower = ref.toLowerCase();
                        const isTakeaway = refLower.includes("take");
                        const isDelivery = refLower.includes("deliv");
                        const isWalkIn =
                          refLower.includes("walk") ||
                          refLower === "other" ||
                          refLower === "cash" ||
                          refLower === "counter";
                        const isTable = !isTakeaway && !isDelivery && !isWalkIn;
                        const key = isTable ? ref : `single-${o.id}`;
                        if (!groups.has(key)) groups.set(key, []);
                        groups.get(key)?.push(o);
                      });

                      return Array.from(groups.entries()).map(
                        ([key, orders]) => {
                          const o = orders[0];
                          const ref = (
                            o.reference ||
                            o.voucher_number ||
                            "Walk-in"
                          ).trim();
                          const refLower = ref.toLowerCase();
                          const isTakeaway = refLower.includes("take");
                          const isDelivery = refLower.includes("deliv");
                          const isWalkIn =
                            refLower.includes("walk") ||
                            refLower === "other" ||
                            refLower === "cash" ||
                            refLower === "counter";
                          const isTable =
                            !isTakeaway && !isDelivery && !isWalkIn;
                          const total = orders.reduce(
                            (sum, ord) => sum + (ord.total_amount || 0),
                            0,
                          );
                          const customerName =
                            orders.find(
                              (ord) =>
                                ord.customer_name &&
                                ord.customer_name !== "Walk-in",
                            )?.customer_name || "Walk-in Customer";
                          const emoji = isTakeaway
                            ? "🥡"
                            : isDelivery
                              ? "🚚"
                              : isWalkIn
                                ? "🚶"
                                : "🪑";

                          return (
                            <div
                              key={key}
                              className="p-4 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-xl transition-all group"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-lg">
                                    {emoji}
                                  </div>
                                  <div className="flex flex-col overflow-hidden">
                                    <span className="text-xs font-black text-slate-800 dark:text-white uppercase tracking-tight truncate">
                                      {isTable ? `Table: ${ref}` : customerName}
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 truncate">
                                      {isTable ? customerName : ref} •{" "}
                                      {orders.length === 1
                                        ? "1 Order held"
                                        : `${orders.length} orders merged`}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-xs font-black text-rose-600">
                                  Rs. {total.toFixed(0)}
                                </span>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    if (isTable) {
                                      setSelectedTable(ref);
                                      setOrderType("DINE_IN");
                                    } else {
                                      setSelectedTable(null);
                                      setResumedReference(ref);
                                      setResumedOrderIds(orders.map((o: any) => o.id));
                                      if (isTakeaway) {
                                        setOrderType("TAKEAWAY");
                                      } else if (isDelivery) {
                                        setOrderType("DELIVERY");
                                      } else setOrderType("DINE_IN"); // Fallback
                                      mergeOrdersToCart(orders);
                                    }
                                    setActiveCartTab("current");
                                    showToast({
                                      title: "Session Resumed",
                                      description: `Order for ${ref} loaded.`,
                                      variant: "success",
                                    });
                                  }}
                                  className="flex-1 h-9 rounded-xl bg-slate-900 dark:bg-white dark:text-slate-900 text-white text-[10px] font-black uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all shadow-md active:scale-95"
                                >
                                  Resume
                                </button>
                                <button
                                  onClick={async () => {
                                    if (
                                      !confirm(`Cancel all orders for ${ref}?`)
                                    )
                                      return;
                                    try {
                                      for (const ord of orders)
                                        await api.post(
                                          `/companies/${companyId}/orders/sales/${ord.id}/cancel`,
                                        );
                                      mutateOrders();
                                      showToast({
                                        title: "Cancelled",
                                        description: "Table sessions cleared.",
                                        variant: "success",
                                      });
                                    } catch (err) {
                                      showToast({
                                        title: "Error",
                                        description: getApiErrorMessage(err),
                                        variant: "error",
                                      });
                                    }
                                  }}
                                  className="h-9 px-3 rounded-xl border border-slate-100 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all font-bold"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        },
                      );
                    })()}
                  </div>
                ) : (
                  <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-dashed border-slate-200 dark:border-slate-800 p-8 rounded-[2rem] flex flex-col items-center justify-center text-center opacity-60">
                    <span className="text-4xl mb-3 grayscale">🍽️</span>
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">
                      No Active Sessions
                    </h4>
                    <p className="text-[9px] text-slate-400 mt-2 max-w-[150px]">
                      Open orders for tables will appear here.
                    </p>
                  </div>
                )}
              </div>

              {/* Recent History */}
              <div className="space-y-4">
                <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                  Transaction History
                </h3>
                {serverHistory && serverHistory.length > 0 ? (
                  <div className="space-y-3">
                    {serverHistory.map((inv: any) => {
                      const ref = (
                        inv.reference ||
                        inv.voucher_number ||
                        ""
                      ).trim();
                      const refLower = ref.toLowerCase();
                      const isTakeaway = refLower.includes("take");
                      const isDelivery = refLower.includes("deliv");
                      const isDineIn = !isTakeaway && !isDelivery && ref;

                      return (
                        <button
                          key={inv.id}
                          onClick={async () => {
                            try {
                              const res = await api.get(
                                `/sales/companies/${companyId}/invoices/${inv.id}`,
                              );
                              setCart(
                                res.data.lines.map((l: any) => ({
                                  id: l.item_id,
                                  name: l.item_name,
                                  default_sales_rate: l.rate,
                                  quantity: l.quantity,
                                  tax_rate: l.tax_rate,
                                })),
                              );
                              if (isDineIn) setSelectedTable(ref);
                              setActiveCartTab("current");
                              showToast({
                                title: "Cart Restored",
                                description: `Items from ${ref || "order"} loaded.`,
                                variant: "success",
                              });
                            } catch (e) {}
                          }}
                          className="w-full text-left p-4 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-800 shadow-sm flex items-center justify-between group hover:border-rose-200 transition-all hover:shadow-md"
                        >
                          <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-lg">
                              {isTakeaway ? "🥡" : isDelivery ? "🚚" : "🪑"}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-[11px] font-black uppercase text-slate-800 dark:text-white">
                                {isDineIn
                                  ? `Table: ${ref}`
                                  : ref || "Walk-in Order"}
                              </span>
                              <span className="text-[9px] font-bold text-slate-400">
                                {inv.customer_name || "Walk-in"} •{" "}
                                {new Date(inv.date).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          <span className="text-xs font-black text-rose-600">
                            Rs. {Number(inv.total_amount || 0).toFixed(0)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <div className="bg-slate-50/50 dark:bg-slate-800/20 border border-dashed border-slate-200 p-6 rounded-3xl flex flex-col items-center justify-center opacity-60">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      History empty
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {activeCartTab === "current" && (
          <div className="p-4 bg-slate-50 dark:bg-slate-800/20 border-t border-slate-100 dark:border-slate-800 animate-in slide-in-from-bottom-2 duration-300">
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-xs text-slate-500">
                <span>Subtotal</span>
                <span>Rs. {totals.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-500">
                <span>Tax (13% VAT)</span>
                <span>Rs. {totals.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-black text-slate-900 dark:text-white pt-2 border-t border-slate-200 dark:border-slate-700">
                <span>Total</span>
                <span>Rs. {totals.total.toFixed(2)}</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleHoldOrder}
                className="w-full h-14 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
                disabled={
                  cart.length === 0 ||
                  (orderType === "DINE_IN" && !selectedTable) ||
                  isSubmitting
                }
              >
                <span>⏸</span> {isSubmitting ? "Saving..." : "Hold Order"}
              </button>
              <button
                onClick={() => setShowCheckout(true)}
                className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold shadow-lg shadow-rose-500/20 transition-all active:scale-[0.98] disabled:opacity-50"
                disabled={
                  cart.length === 0 ||
                  (orderType === "DINE_IN" && !selectedTable) ||
                  isSubmitting
                }
              >
                {orderType === "DINE_IN" && !selectedTable
                  ? "Select Table"
                  : "Checkout"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-slate-800">
            {isProcessed ? (
              <div className="p-8 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-300">
                {!showReceiptPreview ? (
                  <>
                    <div
                      className={`h-20 w-20 rounded-full flex items-center justify-center text-4xl mb-6 shadow-inner ${
                        processedInvoice?.orderType === "DELIVERY"
                          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-500"
                          : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-500"
                      }`}
                    >
                      {processedInvoice?.orderType === "DELIVERY" ? "📝" : "✓"}
                    </div>
                    <h3 className="text-2xl font-black text-slate-800 dark:text-white mb-2 uppercase tracking-tight">
                      {processedInvoice?.orderType === "DELIVERY"
                        ? "DELIVERY ORDER BOOKED"
                        : "BILL PROCESSED"}
                    </h3>
                    <p className="text-sm font-bold text-slate-400 mb-8 uppercase tracking-widest text-center px-4">
                      {processedInvoice?.orderType === "DELIVERY"
                        ? `Order reference: ${processedInvoice?.table || "Delivery"}`
                        : `Bill No: ${processedInvoice?.invoiceNumber}`}
                    </p>

                    <div className="w-full space-y-3">
                      {processedInvoice?.orderType === "DELIVERY" ? (
                        <>
                          <button
                            onClick={() => {
                              if (processedInvoice?.invoiceId) {
                                router.push(
                                  `/companies/${companyId}/sales/invoices/${processedInvoice.invoiceId}?dispatch=1`,
                                );
                              } else {
                                router.push(
                                  `/companies/${companyId}/sales/orders/${processedInvoice.id}`,
                                );
                              }
                            }}
                            className="w-full h-14 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl font-black shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                          >
                            <span className="text-xl">🚚</span> Go for Delivery Process
                          </button>
                          <button
                            onClick={() => setShowReceiptPreview(true)}
                            className="w-full h-12 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-2xl font-black shadow-lg transition-all active:scale-[0.98] flex items-center justify-center gap-3 text-xs uppercase tracking-widest"
                          >
                            <span>🖨️</span> Print Booking Note
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setShowReceiptPreview(true)}
                          className="w-full h-14 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-2xl font-black shadow-xl transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                        >
                          <span className="text-xl">🖨️</span> Print Receipt
                        </button>
                      )}

                      <button
                        onClick={resetPOS}
                        className="w-full h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-rose-50 hover:text-rose-600 transition-all active:scale-[0.98]"
                      >
                        Start New Order
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="w-full">
                    <h3 className="text-lg font-black text-slate-800 dark:text-white mb-4 uppercase tracking-tight">
                      Receipt Preview
                    </h3>
                    <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-left mb-6 overflow-auto max-h-[300px]">
                      <pre className="text-[10px] font-mono text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                        {generateEscPos(processedInvoice)}
                      </pre>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        onClick={() => setShowReceiptPreview(false)}
                        className="h-14 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-[0.98]"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          const content = generateEscPos(processedInvoice);
                          printToThermal(content);
                        }}
                        className="h-14 bg-rose-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-rose-500/20 active:scale-[0.98]"
                      >
                        Confirm Print
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-black text-slate-800 dark:text-white">
                    Complete Order
                  </h3>
                  <button
                    onClick={() => setShowCheckout(false)}
                    className="h-8 w-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-all text-slate-400"
                  >
                    ✕
                  </button>
                </div>

                <div className="p-6 space-y-6">
                  {/* Summary */}
                  <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/30">
                    <div className="flex justify-between items-center text-sm font-bold text-rose-900 dark:text-rose-100">
                      <span>Amount to Pay</span>
                      <span className="text-xl">
                        Rs. {totals.total.toFixed(2)}
                      </span>
                    </div>
                  </div>

                  {/* Payment Mode */}
                  <div className="space-y-3">
                    <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                      Payment Method
                    </label>
                    <div className="grid grid-cols-2 gap-3">
                      {paymentModes?.map((mode: any) => (
                        <button
                          key={mode.id}
                          onClick={() => setSelectedPaymentMode(String(mode.id))}
                          className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all gap-2 ${selectedPaymentMode === String(mode.id) ? "bg-rose-600 border-rose-600 text-white" : "bg-white dark:bg-slate-950 border-slate-100 dark:border-slate-800 text-slate-600 hover:border-rose-200"}`}
                        >
                          <div
                            className={`h-8 w-8 rounded-full flex items-center justify-center text-lg ${selectedPaymentMode === String(mode.id) ? "bg-white/20" : "bg-slate-50 dark:bg-slate-900"}`}
                          >
                            {mode.name.toLowerCase().includes("cash")
                              ? "💵"
                              : "💳"}
                          </div>
                          <span className="text-xs font-bold">{mode.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Notes/Reference */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-500 uppercase">
                      Order Summary
                    </label>
                    <div className="text-[11px] bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400">
                      <p>
                        {orderType}{" "}
                        {selectedTable ? `· Table ${selectedTable}` : ""}
                      </p>
                      <p>
                        {cart.length} items · Rs. {totals.subtotal.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-6 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-100 dark:border-slate-800">
                  <button
                    onClick={handlePlaceOrder}
                    disabled={isSubmitting || !selectedPaymentMode}
                    className="w-full h-14 bg-rose-600 hover:bg-rose-700 text-white rounded-2xl font-black shadow-xl shadow-rose-500/20 transition-all flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <span className="h-5 w-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>Confirm & Print Receipt</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
