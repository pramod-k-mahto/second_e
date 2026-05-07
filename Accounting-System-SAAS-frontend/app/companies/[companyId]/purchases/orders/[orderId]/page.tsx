"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  api,
  fetchPurchaseOrderDetail,
  convertPurchaseOrderToBill,
  PurchaseOrderDetail,
  NotificationRecord,
  markNotificationRead,
  OrderLine,
} from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const orderIdParam = params?.orderId as string;
  const orderId = orderIdParam ? Number(orderIdParam) : NaN;

  const { data: order, mutate } = useSWR<PurchaseOrderDetail | null>(
    companyId && orderId ? `/orders/companies/${companyId}/orders/purchase/${orderId}` : null,
    async () => {
      return fetchPurchaseOrderDetail(Number(companyId), orderId);
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

  const totals = useMemo(() => {
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

  const handleConvert = async () => {
    if (!companyId || !orderId || !order) return;
    setConverting(true);
    setConvertError(null);
    try {
      const res = await convertPurchaseOrderToBill(Number(companyId), orderId, {
        override_lines: overrideLines || order.lines,
      });
      await mutate();
      if (res.bill_id) {
        router.push(`/companies/${companyId}/purchases/bills/${res.bill_id}`);
      } else {
        router.push(`/companies/${companyId}/purchases/bills`);
      }
    } catch (err: any) {
      setConvertError(
        err?.response?.data?.detail || "Failed to convert order to bill."
      );
    } finally {
      setConverting(false);
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Purchase Order #{order.id}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                No: {order.voucher_number} · Date: {order.voucher_date} · Status: {order.status}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              className="relative flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              onClick={() => setNotificationsOpen((o) => !o)}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
              </svg>
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
                  {unreadCount}
                </span>
              )}
            </button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg shadow-sm font-semibold"
              onClick={() => router.back()}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              variant="primary"
              className="rounded-lg shadow-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white"
              onClick={handleConvert}
              disabled={converting}
            >
              {converting ? "Converting…" : "Convert to Bill"}
            </Button>
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm">
        <div className="mb-3 flex flex-wrap gap-4 text-xs text-slate-600">
          <div>
            <div className="font-medium text-slate-700">Supplier</div>
            <div>#{order.supplier_id}</div>
          </div>
          {order.reference && (
            <div>
              <div className="font-medium text-slate-700">Reference</div>
              <div>{order.reference}</div>
            </div>
          )}
        </div>

        <div className="border rounded">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-2 px-2 w-[5%] font-bold">S.N.</th>
                <th className="text-left py-2 px-2 w-[12%] font-bold">HS Code</th>
                <th className="text-left py-2 px-2 font-bold">Item</th>
                <th className="text-left py-2 px-2 font-bold text-center">Warehouse</th>
                <th className="text-right py-2 px-2 font-bold">Qty</th>
                <th className="text-right py-2 px-2 font-bold">Rate</th>
                <th className="text-right py-2 px-2 font-bold">Discount</th>
                <th className="text-right py-2 px-2 font-bold">VAT %</th>
                <th className="text-right py-2 px-2 font-bold">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {(overrideLines || order.lines).map((l, idx) => {
                const qty = Number(l.quantity || 0);
                const rate = Number(l.rate || 0);
                const disc = Number(l.discount || 0);
                const taxRate = Number(l.tax_rate || 0);
                const base = qty * rate - disc;
                const tax = (base * taxRate) / 100;
                const lineTotal = base + tax;
                return (
                  <tr key={idx} className="border-b last:border-none group hover:bg-slate-50/50">
                    <td className="py-2 px-2 text-slate-500 font-medium">{idx + 1}</td>
                    <td className="py-2 px-2 text-slate-800 font-bold uppercase tracking-wide">{l.hs_code || "—"}</td>
                    <td className="py-2 px-2 text-slate-700 font-medium italic underline decoration-slate-200 underline-offset-4">#{l.item_id}</td>
                    <td className="py-1 px-2">
                      <select
                        value={l.warehouse_id || ""}
                        onChange={(e) => {
                          if (!overrideLines) return;
                          const copy = [...overrideLines];
                          copy[idx].warehouse_id = e.target.value ? Number(e.target.value) : undefined;
                          setOverrideLines(copy);
                        }}
                        className="w-full min-w-[120px] rounded border border-slate-300 bg-white px-2 py-1 text-xs outline-none focus:border-indigo-500"
                      >
                        <option value="">Select Warehouse</option>
                        {warehouses?.map(w => (
                          <option key={w.id} value={w.id}>{w.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1 px-2 text-right">{qty}</td>
                    <td className="py-1 px-2 text-right">{rate.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right">{disc.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right">{taxRate.toFixed(2)}</td>
                    <td className="py-1 px-2 text-right font-bold text-slate-900">{lineTotal.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="border-t border-slate-200 bg-slate-50/50">
              <tr>
                <td colSpan={8} className="py-2 px-2 text-right font-medium text-slate-500 uppercase tracking-widest text-[10px]">Subtotal:</td>
                <td className="py-2 px-2 text-right font-bold text-slate-700">{totals.subtotal.toFixed(2)}</td>
              </tr>
              {totals.discountTotal > 0 && (
                <tr>
                  <td colSpan={8} className="py-1 px-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-widest">Discount Subtotal:</td>
                  <td className="py-1 px-2 text-right font-bold text-rose-600">{totals.discountTotal.toFixed(2)}</td>
                </tr>
              )}
              {totals.taxTotal > 0 && (
                <tr>
                  <td colSpan={8} className="py-1 px-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-widest">VAT Total:</td>
                  <td className="py-1 px-2 text-right font-bold text-slate-700">{totals.taxTotal.toFixed(2)}</td>
                </tr>
              )}
              <tr className="border-t border-slate-200 bg-slate-100/50">
                <td colSpan={8} className="py-2 px-2 text-right font-bold text-indigo-900 uppercase tracking-widest text-[10px]">Grand Total:</td>
                <td className="py-2 px-2 text-right font-black text-indigo-700 text-sm">{totals.grandTotal.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}
