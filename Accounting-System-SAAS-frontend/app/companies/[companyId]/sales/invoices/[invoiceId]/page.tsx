"use client";

import useSWR, { mutate as globalMutate } from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect } from "react";

import { api, getCurrentCompany, getDeliveryPartners, getDeliveryPlaces, createPackage, getApiErrorMessage } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { deriveSettlement } from "@/lib/paymentModeSettlement";
import { amountToWords } from "@/lib/amountToWords";


const fetcher = (url: string) => api.get(url).then((res) => res.data);

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

export default function SalesInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const companyIdStr = params?.companyId as string;
  const companyIdInt = companyIdStr ? Number(companyIdStr) : 0;
  const companyId = companyIdStr;
  const invoiceId = params?.invoiceId as string;

  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [partnerId, setPartnerId] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [shippingCharge, setShippingCharge] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");

  const { data: partners } = useSWR(
    companyIdInt ? `/companies/${companyIdInt}/delivery/partners` : null,
    () => getDeliveryPartners(companyIdInt)
  );

  const { data: places } = useSWR(
    companyIdInt ? `/companies/${companyIdInt}/delivery/places` : null,
    () => getDeliveryPlaces(companyIdInt)
  );

  // Auto-open dispatch modal if requested via query param
  useEffect(() => {
    if (searchParams?.get("dispatch") === "1") {
      setDispatchModalOpen(true);
    }
  }, [searchParams]);


  const handlePlaceChange = (val: string) => {
    setPlaceId(val);
    const p = places?.find((x: any) => String(x.id) === val);
    if (p) {
      setShippingCharge(String(p.default_shipping_charge));
    } else {
      setShippingCharge("0");
    }
  };

  const [isSubmittingDispatch, setIsSubmittingDispatch] = useState(false);

  const submitDispatch = async () => {
    if (!partnerId || !placeId) {
      alert("Select Partner and Place");
      return;
    }
    setIsSubmittingDispatch(true);
    try {
      await createPackage(companyIdInt, {
        invoice_id: Number(invoiceId),
        delivery_partner_id: Number(partnerId),
        delivery_place_id: Number(placeId),
        tracking_number: trackingNumber || undefined,
        shipping_charge: Number(shippingCharge) || 0,
      });
      alert(`Package dispatched successfully.`);
      setDispatchModalOpen(false);
    } catch (err: any) {
      alert(getApiErrorMessage(err) || "Failed to dispatch.");
    } finally {
      setIsSubmittingDispatch(false);
    }
  };

  const { data: invoice } = useSWR(
    companyId && invoiceId
      ? `/sales/companies/${companyId}/invoices/${invoiceId}`
      : null,
    fetcher
  );
  const { data: customers } = useSWR(
    companyId ? `/sales/companies/${companyId}/customers` : null,
    fetcher
  );
  const { data: items } = useSWR(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const { data: company } = useSWR(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const currentCompany = getCurrentCompany();

  // Auto-print if requested via query param
  useEffect(() => {
    if (searchParams?.get("print") === "1" && invoice) {
      // Small delay to ensure render is complete
      const timer = setTimeout(() => {
        window.print();
        // Remove the query param to avoid re-printing on refresh
        const url = new URL(window.location.href);
        url.searchParams.delete("print");
        window.history.replaceState({}, "", url.toString());
      }, 800);
      return () => clearTimeout(timer);
    }
  }, [searchParams, invoice]);

  const printDate = useMemo(() => {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }, []);

  const printTime = useMemo(() => {
    return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  }, []);

  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const totals = useMemo(() => {
    let subtotal = 0;
    let taxableTotal = 0;
    let nonTaxableTotal = 0;
    let taxTotal = 0;
    let discountTotal = 0;
    if (!invoice?.lines) return { subtotal, taxableTotal, nonTaxableTotal, taxTotal, discountTotal, grandTotal: 0 };
    for (const l of invoice.lines) {
      const qty = Number(l.quantity || 0);
      const rate = Number(l.rate || 0);
      const disc = Number(l.discount || 0);
      discountTotal += disc;
      const taxRate = Number(l.tax_rate || 0);
      const base = qty * rate - disc;
      const tax = (base * taxRate) / 100;
      
      subtotal += (base + tax);
      taxTotal += tax;
      
      if (taxRate > 0) {
        taxableTotal += base;
      } else {
        nonTaxableTotal += base;
      }
    }
    const tdsAmount = invoice.apply_tds ? Number(invoice.tds_amount || 0) : 0;
    return { subtotal, taxableTotal, nonTaxableTotal, taxTotal, discountTotal, grandTotal: subtotal - tdsAmount, tdsAmount };
  }, [invoice]);

  const totalWords = useMemo(() => {
    return amountToWords(Math.round(totals.grandTotal * 100) / 100, "", "");
  }, [totals.grandTotal]);

  const customerName = (id: number | undefined) =>
    customers?.find((c: any) => c.id === id)?.name || "";

  const customerPan = (id: number | undefined) =>
    customers?.find((c: any) => c.id === id)?.pan_number || "";

  const customerAddress = (id: number | undefined) =>
    customers?.find((c: any) => c.id === id)?.billing_address || "";

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

    if (companyId) {
      router.push(`/companies/${companyId}/sales/invoices`);
    } else {
      router.back();
    }
  };

  const handleClose = () => {
    if (typeof window !== "undefined" && window.history.length <= 1) {
       window.close();
       return;
    }
    if (companyId) {
      router.push(`/companies/${companyId}`);
    }
  };


  // If invoice is not yet loaded, avoid rendering the rest of the page
  if (!invoice) {
    return null;
  }

  const dueDate = invoice?.due_date ? String(invoice.due_date) : "";
  const paidAmount = Number(invoice?.paid_amount ?? 0);
  const outstandingAmount = Number(invoice?.outstanding_amount ?? 0);
  const paymentStatus = (invoice?.payment_status as string | null | undefined) || null;
  const overdue = Boolean(dueDate) && todayIso > dueDate && outstandingAmount > 0;

  const paymentModeName =
    invoice && invoice.payment_mode_id && Array.isArray(paymentModes)
      ? paymentModes.find((pm) => pm.id === invoice.payment_mode_id)?.name || null
      : null;

  const settlement = deriveSettlement(invoice?.payment_mode_id, paymentModeName, totals.grandTotal);

  const printedByName =
    (currentUser && (currentUser.full_name || currentUser.name || currentUser.username)) || "";

  const showCreatedBanner = searchParams?.get("created") === "1";

  return (
    <div className="space-y-4 max-w-3xl mx-auto print:max-w-none">
      {showCreatedBanner && invoice && (
        <div className="mb-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800 no-print">
          {`Sales invoice #${invoice.id} for ${totals.grandTotal.toFixed(2)} created successfully.`}
        </div>
      )}
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Invoice #{invoice.id}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                View, print, or reverse sales invoices.
              </p>
            </div>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-lg shadow-sm border-slate-200"
              onClick={handleClose}
            >
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </Button>
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
              onClick={() => {
                if (!companyId || !invoiceId) return;
                router.push(`/companies/${companyId}/sales/invoices?edit=${invoiceId}`);
              }}
            >
              Edit
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
            {invoice.voucher_id && (
              <a
                href={`/companies/${companyId}/vouchers/${invoice.voucher_id}`}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Voucher #{invoice.voucher_id}
              </a>
            )}
            <Button
              type="button"
              size="sm"
              className="rounded-lg shadow-sm bg-emerald-600 hover:bg-emerald-700 text-white"
              onClick={() => setDispatchModalOpen(true)}
            >
              Dispatch / Package
            </Button>
          </div>
        </div>
      </div>

      {dispatchModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 print:hidden">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-2xl dark:bg-slate-900 border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in-95">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-4">Create Package / Dispatch</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Delivery Partner</label>
                <Select value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
                  <option value="">Select Partner...</option>
                  {partners?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Delivery Place</label>
                <Select value={placeId} onChange={(e) => handlePlaceChange(e.target.value)}>
                  <option value="">Select Place...</option>
                  {places?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Shipping Charge</label>
                <Input type="number" step="0.01" value={shippingCharge} onChange={(e) => setShippingCharge(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Tracking Number (Optional)</label>
                <Input value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} placeholder="e.g. TRK12345" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDispatchModalOpen(false)}>Cancel</Button>
              <Button type="button" onClick={submitDispatch}>Dispatch</Button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white shadow rounded p-5 md:p-6 space-y-4 print:shadow-none print:rounded-none">
        <div className="text-center">
          <div className="text-xl font-bold text-slate-900 uppercase tracking-wide mb-1">
            INVOICE
          </div>
          {company?.pan_number && (
            <div className="text-xs font-semibold mb-1">
              PAN NO. : {company.pan_number}
            </div>
          )}
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

        <div className="mt-3 flex flex-row items-start justify-between gap-2 border-b border-slate-300 pb-2 text-xs text-slate-700">
          <div className="space-y-0.5">

            <div>Customer: {customerName(invoice.customer_id)}</div>
            {customerAddress(invoice.customer_id) && (
              <div>Address : {customerAddress(invoice.customer_id)}</div>
            )}
            {customerPan(invoice.customer_id) && (
              <div>PAN NO. : {customerPan(invoice.customer_id)}</div>
            )}

          </div>
          <div className="space-y-0.5 text-right">
            {invoice.reference && <div>Bill No.: {invoice.reference}</div>}
            {paymentModeName && <div>Payment Mode: {paymentModeName}</div>}
            <div>Invoice No: {invoice.id}</div>
            <div>Print Date: {printDate}</div>
            <div>Print Time: {printTime}</div>
            <div>Invoice Date: {invoice.date}</div>
            {invoice.due_date && <div>Due Date: {invoice.due_date}</div>}
          </div>
        </div>



        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-slate-300">
              <th className="text-left py-2 px-2 border-r border-slate-300 w-10">S.N.</th>
              <th className="text-left py-2 px-2 border-r border-slate-300">HS CODE</th>
              <th className="text-left py-2 px-2 border-r border-slate-300">Item</th>
              <th className="text-right py-2 px-2 border-r border-slate-300">Qty</th>
              <th className="text-right py-2 px-2 border-r border-slate-300">Rate</th>
              <th className="text-right py-2 px-2 border-r border-slate-300">Discount</th>
              <th className="text-right py-2 px-2 border-r border-slate-300">Tax</th>
              <th className="text-right py-2 px-2">Line Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((l: any, idx: number) => {
              const qty = Number(l.quantity || 0);
              const rate = Number(l.rate || 0);
              const disc = Number(l.discount || 0);
              const taxRate = Number(l.tax_rate || 0);
              const base = qty * rate - disc;
              const tax = (base * taxRate) / 100;
              const total = base + tax;
              return (
                <tr key={idx} className="border-b border-slate-300 last:border-none">
                  <td className="py-2 px-2 border-r border-slate-300 text-xs">{idx + 1}</td>
                  <td className="py-2 px-2 border-r border-slate-300 text-xs">{l.hs_code || ""}</td>
                  <td className="py-2 px-2 border-r border-slate-300">{itemName(l.item_id)}</td>
                  <td className="py-2 px-2 text-right text-xs border-r border-slate-300">{qty}</td>
                  <td className="py-2 px-2 text-right text-xs border-r border-slate-300">
                    {rate.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-xs border-r border-slate-300">
                    {disc.toFixed(2)}
                  </td>
                  <td className="py-2 px-2 text-right text-xs border-r border-slate-300">
                    {taxRate > 0 ? `${tax.toFixed(2)} (${taxRate}%)` : "—"}
                  </td>
                  <td className="py-2 px-2 text-right text-xs">
                    {total.toFixed(2)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-400">
              <td
                colSpan={7}
                className="py-1 px-2 text-right text-xs font-medium border-r border-slate-300"
              >
                Subtotal
              </td>
              <td className="py-1 px-2 text-right text-xs font-medium">
                {totals.subtotal.toFixed(2)}
              </td>
            </tr>
            {totals.taxableTotal > 0 && (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={7}
                  className="py-0.5 px-2 text-right text-[10px] text-slate-500 border-r border-slate-300"
                >
                  Taxable Subtotal
                </td>
                <td className="py-0.5 px-2 text-right text-[10px] text-slate-500">
                  {totals.taxableTotal.toFixed(2)}
                </td>
              </tr>
            )}
            {totals.nonTaxableTotal > 0 && (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={7}
                  className="py-0.5 px-2 text-right text-[10px] text-slate-500 border-r border-slate-300"
                >
                  Non Taxable Subtotal
                </td>
                <td className="py-0.5 px-2 text-right text-[10px] text-slate-500">
                  {totals.nonTaxableTotal.toFixed(2)}
                </td>
              </tr>
            )}
            {totals.discountTotal > 0 && (
              <tr className="border-t border-slate-200">
                <td
                  colSpan={7}
                  className="py-0.5 px-2 text-right text-[10px] text-slate-500 border-r border-slate-300"
                >
                  Discount Subtotal
                </td>
                <td className="py-0.5 px-2 text-right text-[10px] text-slate-500">
                  {totals.discountTotal.toFixed(2)}
                </td>
              </tr>
            )}
            {totals.taxTotal >= 0.01 && (
              <tr className="border-t border-slate-300">
                <td
                  colSpan={7}
                  className="py-1 px-2 text-right text-xs font-medium border-r border-slate-300"
                >
                  VAT %
                </td>
                <td className="py-1 px-2 text-right text-xs font-medium">
                  {totals.taxTotal.toFixed(2)}
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-slate-400">
              <td
                colSpan={7}
                className="py-2 px-2 text-right text-xs font-semibold border-r border-slate-300"
              >
                Grand Total
              </td>
              <td className="py-2 px-2 text-right text-xs font-semibold">
                {totals.subtotal.toFixed(2)}
              </td>
            </tr>
            {totals.tdsAmount > 0 && (
              <tr className="border-t border-slate-200">
                <td colSpan={7} className="py-1 px-2 text-right text-xs font-medium text-rose-600 border-r border-slate-300">
                  TDS Deducted
                </td>
                <td className="py-1 px-2 text-right text-xs font-medium text-rose-600">
                  -{totals.tdsAmount.toFixed(2)}
                </td>
              </tr>
            )}
            {totals.tdsAmount > 0 && (
              <tr className="border-t-2 border-slate-400">
                <td colSpan={7} className="py-2 px-2 text-right text-xs font-black text-emerald-700 border-r border-slate-300">
                  Net Receivable
                </td>
                <td className="py-2 px-2 text-right text-xs font-black text-emerald-700">
                  {totals.grandTotal.toFixed(2)}
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-slate-400">
              <td
                colSpan={7}
                className="py-2 px-2 text-right text-xs font-medium text-slate-600 border-r border-slate-300"
              >
                Paid Amount
              </td>
              <td className="py-2 px-2 text-right text-xs font-medium text-slate-600">
                {paidAmount.toFixed(2)}
              </td>
            </tr>
            <tr className="border-t border-slate-300">
              <td
                colSpan={7}
                className="py-2 px-2 text-right text-xs font-medium text-slate-600 border-r border-slate-300"
              >
                Outstanding Amount
              </td>
              <td className="py-2 px-2 text-right text-xs font-medium text-slate-600">
                {outstandingAmount.toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>

        <div className="mt-4 text-xs text-slate-700">
          <span className="font-semibold">Amount in words:</span> {totalWords}
        </div>

        <div className="mt-8 flex flex-row items-center justify-between gap-2 border-t border-slate-300 pt-4 text-xs text-slate-700">
          <div>Print by: {printedByName}</div>
          <div className="text-right">Approved by: ..............................</div>
        </div>
      </div>
    </div>
  );
}