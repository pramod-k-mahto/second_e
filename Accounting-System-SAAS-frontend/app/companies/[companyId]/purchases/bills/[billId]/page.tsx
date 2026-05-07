"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { api, getCurrentCompany } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { ReversePurchaseBillAction } from "@/components/purchases/ReversePurchaseBillAction";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";
import { deriveSettlement } from "@/lib/paymentModeSettlement";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { safeADToBS } from "@/lib/bsad";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
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

export default function PurchaseBillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const billId = params?.billId as string;

  const { showToast } = useToast();

  const { data: bill } = useSWR(
    companyId && billId
      ? `/companies/${companyId}/bills/${billId}`
      : null,
    fetcher
  );

  const { data: suppliers } = useSWR(
    companyId ? `/purchases/companies/${companyId}/suppliers` : null,
    fetcher
  );
  const { data: items } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
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

  const printInfo = useMemo(() => {
    const d = new Date();
    return {
      date: d.toISOString().slice(0, 10),
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  }, []);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxableTotal = 0;
    let nonTaxableTotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    if (!bill?.lines) return { subtotal, taxableTotal, nonTaxableTotal, taxTotal, discountTotal, grandTotal: 0 };
    for (const l of bill.lines || []) {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      discountTotal += disc;
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const taxAmount = (base * taxRate) / 100;
      const total = base + taxAmount;
      
      subtotal += total;
      taxTotal += taxAmount;
      if (taxRate > 0) taxableTotal += base;
      else nonTaxableTotal += base;
    }
    const tdsAmount = bill.apply_tds ? Number(bill.tds_amount || 0) : 0;
    return { subtotal, taxableTotal, nonTaxableTotal, taxTotal, discountTotal, grandTotal: subtotal - tdsAmount, tdsAmount };
  }, [bill]);

  const supplierName = (id: number | undefined) =>
    suppliers?.find((s: any) => s.id === id)?.name || "";

  const itemName = (id: number | undefined) =>
    items?.find((i: any) => i.id === id)?.name || `#${id}`;

  const itemCode = (id: number | undefined) =>
    items?.find((i: any) => i.id === id)?.code || "";

  const handleBack = () => {
    const returnUrl = searchParams.get('returnUrl');
    if (returnUrl) {
      router.push(returnUrl);
      return;
    }

    // If we have history within the app, go back. 
    // Otherwise, fallback to the list view specifically.
    if (typeof window !== "undefined" && window.history.length > 1) {
      window.history.back();
      return;
    }
    router.push(`/companies/${companyId}/purchases/bills`);
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


  const { reportMode: effectiveDisplayMode } = useCalendarSettings();
  const isBS = effectiveDisplayMode === "BS";

  const displayDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "";
    return isBS ? safeADToBS(dateStr) || dateStr : dateStr;
  };

  if (!bill) {
    return <div className="text-sm text-slate-500">Loading bill...</div>;
  }

  const paymentModeName =
    bill.payment_mode_id && Array.isArray(paymentModes)
      ? paymentModes.find((pm) => pm.id === bill.payment_mode_id)?.name || null
      : null;

  const settlement = deriveSettlement(bill?.payment_mode_id, paymentModeName, totals.grandTotal);

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72M4.5 4.5l15 15M4.5 19.5l15-15M10.5 15.75L5.78 20.47" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Purchase Invoice #{bill.id}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {displayDate(bill.date)} · {supplierName(bill.supplier_id)}
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2 no-print">
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
            {bill.voucher_id && (
              <a
                href={`/companies/${companyId}/vouchers/${bill.voucher_id}`}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Voucher #{bill.voucher_id}
              </a>
            )}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg shadow-sm bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300"
              onClick={handleClose}
            >
              Close
            </Button>
          </div>
        </div>
      </div>

      <div className="relative rounded-2xl bg-gradient-to-br from-indigo-100 via-slate-200 to-indigo-100 dark:from-slate-800 dark:via-indigo-900/50 dark:to-slate-800 p-[3px] shadow-xl print:p-0 print:shadow-none print:bg-none print:bg-transparent">
        <div className="bg-white dark:bg-slate-950 rounded-[13px] p-5 md:p-6 space-y-4 h-full print:p-0 print:rounded-none">
          <div className="text-center">
            {currentCompany?.name && (
              <div className="text-base font-semibold text-slate-900">
                {currentCompany.name}
              </div>
            )}
            {currentCompany?.address && (
              <div className="mt-0.5 text-xs text-slate-600 whitespace-pre-line">
                {currentCompany.address}
              </div>
            )}
          </div>

          <div className="mt-3 flex flex-col gap-2 border-b border-slate-200 pb-2 text-xs text-slate-700 md:flex-row md:items-start md:justify-between">
            <div className="space-y-0.5">
              <div>Bill No: {bill.id}</div>
              <div>Voucher Date: {displayDate(bill.date)}</div>
              <div>Bill Date: {displayDate(bill.bill_date)}</div>
              {bill.due_date && <div>Due Date: {displayDate(bill.due_date)}</div>}
              <div>Supplier: {supplierName(bill.supplier_id)}</div>
            </div>
            <div className="space-y-0.5 md:text-right">
              {bill.reference && <div>Reference: {bill.reference}</div>}
              {paymentModeName && <div>Payment Mode: {paymentModeName}</div>}
              <div>Print Date: {printInfo.date}</div>
              <div>Print Time: {printInfo.time}</div>
            </div>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5">S.N.</th>
                <th className="text-left py-1.5">HS Code</th>
                <th className="text-left py-1.5">Item</th>
                <th className="text-right py-1.5">Qty</th>
                <th className="text-right py-1.5">Rate</th>
                <th className="text-right py-1.5">Discount</th>
                <th className="text-right py-1.5 px-2">Tax</th>
                <th className="text-right py-1.5">Line Total</th>
              </tr>
            </thead>
            <tbody>
              {bill.lines.map((l: any, idx: number) => {
                const qty = Number(l.quantity || 0);
                const rate = Number(l.rate || 0);
                const disc = Number(l.discount || 0);
                const taxRate = Number(l.tax_rate || 0);
                const base = qty * rate - disc;
                const tax = (base * taxRate) / 100;
                const total = base + tax;
                return (
                  <tr key={idx} className="border-b last:border-none">
                    <td className="py-1.5 text-xs">{idx + 1}</td>
                    <td className="py-1.5 text-xs">{itemCode(l.item_id)}</td>
                    <td className="py-1.5">{itemName(l.item_id)}</td>
                    <td className="py-1.5 text-right text-xs">{qty}</td>
                    <td className="py-1.5 text-right text-xs">
                      {rate.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-[11px]">
                      {disc.toFixed(2)}
                    </td>
                    <td className="py-1.5 text-right text-[11px] px-2">
                      {taxRate > 0 ? `${tax.toFixed(2)} (${taxRate}%)` : "—"}
                    </td>
                    <td className="py-1.5 text-right text-[11px]">
                      {total.toFixed(2)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t">
                <td
                  colSpan={7}
                  className="py-1.5 text-right text-[11px] font-medium"
                >
                  Subtotal
                </td>
                <td className="py-1.5 text-right text-[11px] font-medium">
                  {totals.subtotal.toFixed(2)}
                </td>
              </tr>
              {totals.taxableTotal > 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-1 text-right text-[11px] text-slate-500"
                  >
                    Taxable Subtotal
                  </td>
                  <td className="py-1 text-right text-[11px] text-slate-500">
                    {totals.taxableTotal.toFixed(2)}
                  </td>
                </tr>
              )}
              {totals.nonTaxableTotal > 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-1 text-right text-[11px] text-slate-500"
                  >
                    Non Taxable Subtotal
                  </td>
                  <td className="py-1 text-right text-[11px] text-slate-500">
                    {totals.nonTaxableTotal.toFixed(2)}
                  </td>
                </tr>
              )}
              {totals.discountTotal > 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-1 text-right text-[11px] text-slate-500"
                  >
                    Discount Subtotal
                  </td>
                  <td className="py-1 text-right text-[11px] text-slate-500">
                    {totals.discountTotal.toFixed(2)}
                  </td>
                </tr>
              )}
              {totals.taxTotal >= 0.01 && (
                <tr>
                  <td
                    colSpan={7}
                    className="py-1 text-right text-[11px] font-medium"
                  >
                    VAT (13%)
                  </td>
                  <td className="py-1 text-right text-[11px] font-medium">
                    {totals.taxTotal.toFixed(2)}
                  </td>
                </tr>
              )}
              <tr>
                <td
                  colSpan={7}
                  className="py-1 text-right text-xs font-semibold"
                >
                  Grand Total
                </td>
                <td className="py-1 text-right text-xs font-semibold">
                  {(totals.subtotal).toFixed(2)}
                </td>
              </tr>
              {totals.tdsAmount > 0 && (
                <tr>
                  <td colSpan={7} className="py-1 text-right text-[11px] font-medium text-rose-600">
                    TDS Deducted
                  </td>
                  <td className="py-1 text-right text-[11px] font-medium text-rose-600">
                    -{totals.tdsAmount.toFixed(2)}
                  </td>
                </tr>
              )}
              {totals.tdsAmount > 0 && (
                <tr className="border-t border-slate-300">
                  <td colSpan={7} className="py-1.5 text-right text-xs font-black text-emerald-700">
                    Net Payable
                  </td>
                  <td className="py-1.5 text-right text-xs font-black text-emerald-700">
                    {totals.grandTotal.toFixed(2)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>

          <div className="mt-3 flex flex-col gap-1 rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-700">
            <div className="flex items-center justify-between">
              <div className="font-semibold">Payment Summary</div>
              <span
                className={
                  "rounded px-2 py-0.5 text-[10px] font-semibold " +
                  (settlement.isCashOrBank
                    ? "bg-emerald-100 text-emerald-800"
                    : "bg-amber-100 text-amber-800")
                }
              >
                {settlement.statusLabel}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Paid Amount</span>
              <span className="font-medium">{settlement.paidAmount.toFixed(2)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Outstanding</span>
              <span className="font-medium">{settlement.outstandingAmount.toFixed(2)}</span>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-slate-200 pt-4 text-xs text-slate-700 md:flex-row">
            <div>Print by: {(currentUser && (currentUser.full_name || currentUser.name || currentUser.username)) || ""}</div>
            <div className="md:text-center">Approved by: ..............................</div>
          </div>
        </div>
      </div>
    </div>
  );
}