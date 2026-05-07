"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { api, SalesReturn, getCurrentCompany } from "@/lib/api";
import { Button } from "@/components/ui/Button";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

export default function SalesReturnDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const returnIdParam = params?.returnId as string;
  const returnId = returnIdParam ? Number(returnIdParam) : NaN;

  const { data: ret } = useSWR<SalesReturn | null>(
    companyId && returnId ? `/sales/companies/${companyId}/returns/${returnId}` : null,
    fetcher
  );

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const currentCompany = getCurrentCompany();

  const printDate = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const totals = useMemo(() => {
    if (!ret?.lines) return { subtotal: 0, taxTotal: 0, grandTotal: 0 };
    let subtotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    for (const l of ret.lines) {
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
    const tdsAmount = (ret as any).apply_tds ? Number((ret as any).tds_amount || 0) : 0;
    return { subtotal, taxTotal, discountTotal, grandTotal: subtotal - tdsAmount, tdsAmount };
  }, [ret]);

  if (!companyId || !returnId) {
    return (
      <div className="text-sm text-slate-600">Invalid company or return.</div>
    );
  }

  if (!ret) {
    return <div className="text-sm text-slate-500">Loading sales return...</div>;
  }

  const paymentModeName =
    ret.payment_mode_id && Array.isArray(paymentModes)
      ? paymentModes.find((pm) => pm.id === ret.payment_mode_id)?.name || null
      : null;

  const printedByName =
    (currentUser && (currentUser.full_name || currentUser.name || currentUser.username)) || "";

  const handleBack = () => {
    if (typeof window !== "undefined") {
      window.history.back();
      return;
    }
    router.back();
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

  return (
    <div className="space-y-4">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Return #{ret.id}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Date: {ret.date} · Customer: {ret.customer_name || (ret.customer_id ? `#${ret.customer_id}` : "")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 no-print">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg shadow-sm"
              onClick={handleBack}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg shadow-sm"
              onClick={() => window.print()}
            >
              Print
            </Button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm space-y-4">
        <div className="text-center">
          {currentCompany?.name && (
            <div className="text-base font-semibold text-slate-900">{currentCompany.name}</div>
          )}
          {currentCompany?.address && (
            <div className="mt-0.5 text-xs text-slate-600 whitespace-pre-line">
              {currentCompany.address}
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-col gap-2 border-b border-slate-200 pb-2 text-xs text-slate-700 md:flex-row md:items-start md:justify-between">
          <div className="space-y-0.5">
            <div>Return No: {ret.id}</div>
            <div>Return Date: {ret.date}</div>
            <div>Customer: {ret.customer_name || (ret.customer_id ? `#${ret.customer_id}` : "")}</div>
          </div>
          <div className="space-y-0.5 md:text-right">
            {ret.reference && <div>Reference: {ret.reference}</div>}
            {paymentModeName && <div>Payment Mode: {paymentModeName}</div>}
            <div>Print Date: {printDate}</div>
          </div>
        </div>

        <div className="border rounded">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50">
                <th className="text-left py-2 px-2 w-[5%] font-bold">S.N.</th>
                <th className="text-left py-2 px-2 w-[12%] font-bold">HS Code</th>
                <th className="text-left py-2 px-2 font-bold">Item</th>
                <th className="text-right py-2 px-2 font-bold">Qty</th>
                <th className="text-right py-2 px-2 font-bold">Rate</th>
                <th className="text-right py-2 px-2 font-bold">Discount</th>
                <th className="text-right py-2 px-2 font-bold">VAT %</th>
                <th className="text-right py-2 px-2 font-bold">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {ret.lines.map((l, idx) => {
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
                    <td className="py-2 px-2 text-slate-800 font-bold uppercase tracking-wide">{(l as any).hs_code || "—"}</td>
                    <td className="py-2 px-2 text-slate-700 font-medium italic underline decoration-slate-200 underline-offset-4">#{l.item_id}</td>
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
                <td colSpan={7} className="py-2 px-2 text-right font-medium text-slate-500 uppercase tracking-widest text-[10px]">Subtotal:</td>
                <td className="py-2 px-2 text-right font-bold text-slate-700">{totals.subtotal.toFixed(2)}</td>
              </tr>
              {totals.discountTotal > 0 && (
                <tr>
                  <td colSpan={7} className="py-1 px-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-widest">Discount Subtotal:</td>
                  <td className="py-1 px-2 text-right font-bold text-rose-600">{totals.discountTotal.toFixed(2)}</td>
                </tr>
              )}
              {totals.taxTotal > 0 && (
                <tr>
                  <td colSpan={7} className="py-1 px-2 text-right font-medium text-slate-500 text-[10px] uppercase tracking-widest">VAT Total:</td>
                  <td className="py-1 px-2 text-right font-bold text-slate-700">{totals.taxTotal.toFixed(2)}</td>
                </tr>
              )}
              <tr className="border-t border-slate-200 bg-slate-100/50">
                <td colSpan={7} className="py-2 px-2 text-right font-bold text-indigo-900 uppercase tracking-widest text-[10px]">Grand Total:</td>
                <td className="py-2 px-2 text-right font-black text-indigo-700 text-sm">{totals.subtotal.toFixed(2)}</td>
              </tr>
              {totals.tdsAmount > 0 && (
                <tr>
                  <td colSpan={7} className="py-1 px-2 text-right font-medium text-rose-600 text-[10px] uppercase tracking-widest">TDS Deducted:</td>
                  <td className="py-1 px-2 text-right font-bold text-rose-600">-{totals.tdsAmount.toFixed(2)}</td>
                </tr>
              )}
              {totals.tdsAmount > 0 && (
                <tr className="border-t border-slate-300 bg-emerald-50">
                  <td colSpan={7} className="py-2 px-2 text-right font-black text-emerald-800 uppercase tracking-widest text-[10px]">Net Receivable:</td>
                  <td className="py-2 px-2 text-right font-black text-emerald-700 text-sm">{totals.grandTotal.toFixed(2)}</td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>

        <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-700 md:flex-row">
          <div>Print by: {printedByName}</div>
          <div className="md:text-center">Approved by: ..............................</div>
        </div>
      </div>
    </div>
  );
}
