"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  api,
  fetchSalesOrderDetail,
  convertSalesOrderToInvoice,
  SalesOrderDetail,
  NotificationRecord,
  markNotificationRead,
  OrderLine,
} from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function SalesOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
   const searchParams = useSearchParams();
   const companyId = params?.companyId as string;
  const orderIdParam = params?.orderId as string;
  const orderId = orderIdParam ? Number(orderIdParam) : NaN;

  const { data: order, mutate } = useSWR<SalesOrderDetail | null>(
    companyId && orderId ? `/orders/companies/${companyId}/orders/sales/${orderId}` : null,
    async () => {
      return fetchSalesOrderDetail(Number(companyId), orderId);
    }
  );

  const { data: warehouses } = useSWR<{ id: number, name: string }[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const [overrideLines, setOverrideLines] = useState<OrderLine[] | null>(null);

  useEffect(() => {
    if (order && !overrideLines) {
      setOverrideLines(order.lines.map(l => ({ ...l })));
    }
  }, [order, overrideLines]);

  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { data: notifications, mutate: mutateNotifications } = useSWR<
    NotificationRecord[]
  >(
    companyId
      ? `/notifications/companies/${companyId}/notifications?unread_only=true`
      : null,
    (url: string) => api.get(url).then((res) => res.data),
    {
      refreshInterval: 30000,
    }
  );

  const unreadCount = notifications?.length || 0;

  const totals = useMemo(() => {
    if (!order?.lines) return { subtotal: 0, taxTotal: 0, grandTotal: 0 };

    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    for (const l of order.lines) {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      discountTotal += disc;
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      subtotal += (base + tax);
      taxTotal += tax;
    }
    return { subtotal, taxTotal, discountTotal, grandTotal: subtotal };
  }, [order]);

  const handleNotificationClick = async (n: NotificationRecord) => {
    if (!companyId) return;

    let target: string | null = null;
    if (n.type === "SALES_ORDER_CREATED") {
      target = `/companies/${companyId}/sales/orders/${n.order_id}`;
    } else if (n.type === "PURCHASE_ORDER_CREATED") {
      target = `/companies/${companyId}/purchases/orders/${n.order_id}`;
    }

    try {
      await markNotificationRead(Number(companyId), n.id);
      await mutateNotifications();
    } catch (err) {
      // ignore for now; UI will retry on next poll
    }

    if (target) {
      router.push(target);
      setNotificationsOpen(false);
    }
  };

  const handleConvert = async () => {
    if (!companyId || !orderId || !order) return;

    const currentLines = overrideLines || order.lines;
    const hasMissingWarehouse = currentLines.some(l => !l.warehouse_id && (l as any).category !== 'Service');

    if (hasMissingWarehouse) {
      setConvertError("Please select a warehouse for all items before converting to invoice.");
      return;
    }

    setConverting(true);
    setConvertError(null);
    try {
      const res = await convertSalesOrderToInvoice(Number(companyId), orderId, {
        override_lines: currentLines,
      });
      await mutate();
      if (res.invoice_id) {
        router.push(`/companies/${companyId}/sales/invoices/${res.invoice_id}`);
      } else {
        router.push(`/companies/${companyId}/sales/invoices`);
      }
    } catch (err: any) {
      setConvertError(
        err?.response?.data?.detail || "Failed to convert order to invoice."
      );
    } finally {
      setConverting(false);
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && window.close) {
      window.close();
      return;
    }
    if (companyId) {
      router.push(`/companies/${companyId}`);
    }
  };

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl');
    if (returnUrl) {
      router.push(returnUrl);
      return;
    }
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(`/companies/${companyId}/sales/orders`);
    }
  };

  if (!companyId || !orderId) {
    return (
      <div className="text-sm text-slate-600">Invalid company or order.</div>
    );
  }

  if (!order) {
    return <div className="text-sm text-slate-500">Loading order...</div>;
  }

  return (
    <div className="space-y-4">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Order #{order.voucher_number}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5 whitespace-nowrap overflow-hidden text-ellipsis max-w-[300px] sm:max-w-[400px]">
                Status: <span className="font-semibold text-indigo-600 dark:text-indigo-400">{order.status}</span> · Date: {order.voucher_date} ·
                Payment Status: <span className={`font-semibold ml-1 ${order.payment_status === "PAID" ? "text-emerald-600 dark:text-emerald-400" : order.payment_status === "PARTIAL" ? "text-amber-600 dark:text-amber-400" : "text-rose-600 dark:text-rose-400"}`}>{order.payment_status}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="relative flex h-9 w-9 items-center justify-center rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 shadow-sm transition-all duration-150"
              onClick={() => setNotificationsOpen((o) => !o)}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150 flex items-center"
              onClick={handleClose}
            >
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              onClick={handleBack}
            >
              Back
            </button>
            {order.status === "CONVERTED" && order.converted_to_invoice_id ? (
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-transparent bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all duration-150"
                onClick={() => router.push(`/companies/${companyId}/sales/invoices/${order.converted_to_invoice_id}`)}
              >
                View Invoice
              </button>
            ) : (
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border border-transparent bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60"
                onClick={handleConvert}
                disabled={converting || order.status === "CANCELLED"}
              >
                {converting ? "Converting…" : "Convert to Invoice"}
              </button>
            )}
          </div>
        </div>
      </div>
      {notificationsOpen && companyId && (
        <div className="absolute right-0 top-12 w-80 max-h-80 overflow-y-auto bg-white border border-slate-200 rounded shadow-lg text-xs z-20">
          <div className="px-3 py-2 border-b border-slate-200 font-medium flex items-center justify-between">
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
            <div className="px-3 py-3 text-slate-500">No new notifications.</div>
          )}
          {notifications && notifications.length > 0 && (
            <ul className="divide-y divide-slate-100">
              {notifications.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50"
                    onClick={() => handleNotificationClick(n)}
                  >
                    <div className="flex justify-between mb-1">
                      <span className="font-medium text-slate-700">
                        {n.type === "SALES_ORDER_CREATED"
                          ? "Sales Order"
                          : n.type === "PURCHASE_ORDER_CREATED"
                            ? "Purchase Order"
                            : n.type}
                      </span>
                      <span className="text-[10px] text-slate-400">#{n.order_id}</span>
                    </div>
                    <div className="text-[11px] text-slate-600">
                      Click to open order.
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {convertError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {convertError}
        </div>
      )}

      {/* ── Info Cards ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Customer Information Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Customer Information</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <div className="col-span-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Customer</p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {order.customer_name || <span className="text-slate-400">—</span>}
                <span className="ml-1.5 text-[11px] font-normal text-slate-400">#{order.customer_id}</span>
              </p>
            </div>
            {order.customer_email && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Email</p>
                <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{order.customer_email}</p>
              </div>
            )}
            {order.customer_phone && (
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Phone</p>
                <p className="text-xs text-slate-700 dark:text-slate-300">{order.customer_phone}</p>
              </div>
            )}
            {order.customer_address && (
              <div className="col-span-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Address</p>
                <p className="text-xs text-slate-700 dark:text-slate-300">{order.customer_address}</p>
              </div>
            )}
          </div>
        </div>

        {/* Order Information Card */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Order Information</h3>
          </div>
          <div className="p-4 grid grid-cols-2 gap-x-6 gap-y-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Order Date</p>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.voucher_date}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Due Date</p>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.due_date || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Sales Person</p>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.sales_person_name || <span className="text-slate-400">Not Assigned</span>}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Reference</p>
              <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{order.reference || <span className="text-slate-400">—</span>}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Order Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                order.status === "CONVERTED"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : order.status === "CANCELLED"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
              }`}>{order.status}</span>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-0.5">Payment Status</p>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                order.payment_status === "PAID"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400"
                  : order.payment_status === "PARTIAL"
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
                  : "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400"
              }`}>{order.payment_status}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Line Items ──────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {/* Section header */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
          </div>
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Order Line Items</h3>
          <span className="ml-auto text-[10px] font-semibold text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
            {(overrideLines || order.lines).length} item{(overrideLines || order.lines).length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="text-center py-2.5 px-3 w-10 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">#</th>
                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">HS Code</th>
                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Item</th>
                <th className="text-left py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Warehouse</th>
                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Qty</th>
                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Rate</th>
                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Discount</th>
                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">VAT %</th>
                <th className="text-right py-2.5 px-3 font-semibold text-[10px] uppercase tracking-widest text-slate-400 dark:text-slate-500">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/80">
              {(overrideLines || order.lines).map((l, idx) => {
                const qty = Number(l.quantity || 0);
                const rate = Number(l.rate || 0);
                const disc = Number(l.discount || 0);
                const taxRate = Number(l.tax_rate || 0);
                const base = qty * rate - disc;
                const tax = (base * taxRate) / 100;
                const lineTotal = base + tax;
                return (
                  <tr key={idx} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3 px-3 text-center">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 text-[10px] font-semibold text-slate-500 dark:text-slate-400">{idx + 1}</span>
                    </td>
                    <td className="py-3 px-3">
                      {l.hs_code
                        ? <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono font-medium text-slate-600 dark:text-slate-300">{l.hs_code}</span>
                        : <span className="text-slate-300 dark:text-slate-600">—</span>
                      }
                    </td>
                    <td className="py-3 px-3">
                      <p className="font-medium text-slate-800 dark:text-slate-200">{l.item_name || `Item #${l.item_id}`}</p>
                      <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">ID: {l.item_id}</p>
                    </td>
                    <td className="py-3 px-3">
                      <select
                        value={l.warehouse_id || ""}
                        onChange={(e) => {
                          if (!overrideLines) return;
                          const copy = [...overrideLines];
                          copy[idx].warehouse_id = e.target.value ? Number(e.target.value) : undefined;
                          setOverrideLines(copy);
                        }}
                        className="w-full min-w-[130px] rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-[11px] text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200 dark:focus:ring-indigo-800 transition-colors"
                      >
                        <option value="">Select warehouse…</option>
                        {warehouses?.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">{qty}</td>
                    <td className="py-3 px-3 text-right font-medium text-slate-700 dark:text-slate-300">{rate.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                    <td className="py-3 px-3 text-right">
                      {disc > 0
                        ? <span className="text-rose-600 dark:text-rose-400 font-medium">{disc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        : <span className="text-slate-300 dark:text-slate-600">—</span>
                      }
                    </td>
                    <td className="py-3 px-3 text-right">
                      {taxRate > 0
                        ? <span className="text-slate-700 dark:text-slate-300 font-medium">{taxRate.toFixed(1)}%</span>
                        : <span className="text-slate-300 dark:text-slate-600">—</span>
                      }
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-slate-800 dark:text-slate-100">{lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Totals summary */}
        <div className="border-t border-slate-200 dark:border-slate-700/60 bg-slate-50/70 dark:bg-slate-800/30 px-4 py-3">
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-500 dark:text-slate-400">Subtotal</span>
                <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">{totals.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
              {(totals.discountTotal ?? 0) > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">Total Discount</span>
                  <span className="font-medium text-rose-600 dark:text-rose-400 tabular-nums">− {totals.discountTotal!.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {totals.taxTotal > 0 && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400">VAT</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300 tabular-nums">{totals.taxTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wide">Grand Total</span>
                <span className="text-base font-bold text-indigo-600 dark:text-indigo-400 tabular-nums">{totals.grandTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
