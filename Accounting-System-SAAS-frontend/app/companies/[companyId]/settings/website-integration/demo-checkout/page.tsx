"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import type { WebsiteOrderCreate, WebsiteOrderResult } from "@/types/websiteOrder";
import { isRetryableWebsiteOrderError, submitWebsiteOrder } from "@/lib/websiteOrders";

type SubmitState =
  | { status: "idle"; idempotencyKey: string | null; result: WebsiteOrderResult | null; error: string | null }
  | { status: "processing"; idempotencyKey: string; result: WebsiteOrderResult | null; error: string | null };

export default function WebsiteIntegrationDemoCheckoutPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const [customerName, setCustomerName] = useState("John Doe");
  const [customerEmail, setCustomerEmail] = useState("john@example.com");
  const [itemId, setItemId] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [rate, setRate] = useState(100);
  const [taxRate, setTaxRate] = useState(13);

  const [autoInvoice, setAutoInvoice] = useState(true);
  const [recordPayment, setRecordPayment] = useState(false);
  const [receiptPaymentModeId, setReceiptPaymentModeId] = useState<number>(3);
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  const [state, setState] = useState<SubmitState>({
    status: "idle",
    idempotencyKey: null,
    result: null,
    error: null,
  });

  const payload = useMemo<WebsiteOrderCreate>(() => {
    return {
      reference: `DEMO-${Date.now()}`,
      customer: {
        name: customerName,
        email: customerEmail || undefined,
        shipping_address_same_as_billing: true,
      },
      lines: [
        {
          item_id: Number(itemId),
          quantity: Number(quantity),
          rate: Number(rate),
          discount: 0,
          tax_rate: Number(taxRate),
        },
      ],
      options: {
        auto_invoice: autoInvoice,
        record_payment: recordPayment,
        receipt_payment_mode_id: recordPayment ? Number(receiptPaymentModeId) : null,
        notify_customer: notifyCustomer,
        notify_channels: notifyCustomer ? ["EMAIL", "SMS", "WHATSAPP"] : undefined,
        notify_internal: true,
      },
    };
  }, [autoInvoice, customerEmail, customerName, itemId, notifyCustomer, quantity, rate, recordPayment, receiptPaymentModeId, taxRate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    const existingKey = state.idempotencyKey;

    const ensureProcessingKey = (key: string) => {
      setState((s) => ({
        status: "processing",
        idempotencyKey: key,
        result: s.result,
        error: null,
      }));
    };

    try {
      const first = await submitWebsiteOrder(companyId, payload, { idempotencyKey: existingKey || undefined });
      ensureProcessingKey(first.idempotencyKey);
      setState({ status: "idle", idempotencyKey: first.idempotencyKey, result: first.data, error: null });
    } catch (err: any) {
      const key = existingKey || (state.status === "processing" ? state.idempotencyKey : null) || null;
      if (key) {
        ensureProcessingKey(key);
      }

      if (isRetryableWebsiteOrderError(err) && key) {
        try {
          const second = await submitWebsiteOrder(companyId, payload, { idempotencyKey: key });
          setState({ status: "idle", idempotencyKey: second.idempotencyKey, result: second.data, error: null });
          return;
        } catch (err2: any) {
          setState({
            status: "idle",
            idempotencyKey: key,
            result: null,
            error: err2?.message || "Request failed",
          });
          return;
        }
      }

      setState({ status: "idle", idempotencyKey: key, result: null, error: err?.message || "Request failed" });
    }
  };

  const resetAttempt = () => {
    setState({ status: "idle", idempotencyKey: null, result: null, error: null });
  };

  const processing = state.status === "processing";

  return (
    <div className="space-y-4 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.59 8.31m5.84 1.27a4.965 4.965 0 01-1.01 1.01m-1.01 1.01c-.63.63-1.4 1.08-2.26 1.321m2.26-1.321c.63-.63 1.08-1.4 1.321-2.26m-4.8 1.428l-4.94 4.94A4.475 4.475 0 003.5 17.5a4.474 4.474 0 004.94 4.94l4.94-4.94A4.475 4.475 0 0012 12.5a4.475 4.475 0 00-1.27-3.19z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Demo Checkout</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Submit sample orders to test your website integration.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              onClick={() => window.history.back()}
            >
              Back
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="text-xs text-slate-600">Company</div>
        <div className="font-mono text-sm text-slate-900">{companyId}</div>
        <div className="mt-2 text-xs text-slate-600">Idempotency-Key (current attempt)</div>
        <div className="font-mono text-xs text-slate-800 break-all">{state.idempotencyKey || "(not generated yet)"}</div>
      </div>

      <form onSubmit={handleSubmit} className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Customer name</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Customer email</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={customerEmail}
              onChange={(e) => setCustomerEmail(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Item ID</div>
            <input
              type="number"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={itemId}
              onChange={(e) => setItemId(Number(e.target.value))}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Quantity</div>
            <input
              type="number"
              min={1}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Rate</div>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={rate}
              onChange={(e) => setRate(Number(e.target.value))}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Tax rate (%)</div>
            <input
              type="number"
              min={0}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={taxRate}
              onChange={(e) => setTaxRate(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 select-none">
            <input type="checkbox" checked={autoInvoice} onChange={(e) => setAutoInvoice(e.target.checked)} />
            <span className="text-sm text-slate-800">Auto-invoice</span>
          </label>

          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={recordPayment}
              onChange={(e) => setRecordPayment(e.target.checked)}
              disabled={!autoInvoice}
            />
            <span className="text-sm text-slate-800">Record payment (requires auto-invoice)</span>
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Receipt payment mode id</div>
            <input
              type="number"
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={receiptPaymentModeId}
              onChange={(e) => setReceiptPaymentModeId(Number(e.target.value))}
              disabled={!recordPayment}
            />
          </label>

          <label className="flex items-center gap-2 select-none">
            <input type="checkbox" checked={notifyCustomer} onChange={(e) => setNotifyCustomer(e.target.checked)} />
            <span className="text-sm text-slate-800">Notify customer</span>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={processing}
            className="rounded-md bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          >
            {processing ? "Processing…" : "Submit demo order"}
          </button>
          <button
            type="button"
            onClick={resetAttempt}
            disabled={processing}
            className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 disabled:opacity-60"
          >
            New attempt
          </button>
        </div>

        {state.error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">{state.error}</div>
        )}

        {state.result && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-1">
            <div className="text-sm font-semibold text-emerald-900">Success</div>
            <div className="text-xs text-emerald-900">Status: {state.result.status}</div>
            <div className="text-xs text-emerald-900">Order ID: {state.result.order_id}</div>
            {state.result.invoice_number ? (
              <div className="text-xs text-emerald-900">Invoice: {state.result.invoice_number}</div>
            ) : null}
            {state.result.receipt_voucher_id ? (
              <div className="text-xs text-emerald-900">Payment recorded</div>
            ) : null}
            {Array.isArray(state.result.outbound_message_ids) && state.result.outbound_message_ids.length > 0 ? (
              <div className="text-xs text-emerald-900">Confirmation sent</div>
            ) : null}
          </div>
        )}

        <details className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-slate-700">Payload preview</summary>
          <pre className="mt-2 overflow-auto text-xs text-slate-700">{JSON.stringify(payload, null, 2)}</pre>
        </details>
      </form>
    </div>
  );
}
