"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { api, createManualVoucher, Voucher } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type VoucherTypeForScreen = "JOURNAL" | "PAYMENT";

type Ledger = {
  id: number;
  name: string;
  group_name?: string | null;
};

type PaymentMode = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

type SupplierLedgerMapping = {
  supplier_id: number;
  supplier_name: string;
  ledger_id: number;
};

export default function SupplierVouchersPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const searchParams = useSearchParams();

  const [actionType, setActionType] = useState<"PURCHASE" | "PAYMENT">("PURCHASE");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [voucherDate, setVoucherDate] = useState<string>(today);
  const [amount, setAmount] = useState<string>("");
  const [narration, setNarration] = useState<string>("");

  const [supplierLedgerId, setSupplierLedgerId] = useState<string>("");
  const [supplierName, setSupplierName] = useState<string>("");
  const [purchaseLedgerId, setPurchaseLedgerId] = useState<string>("");
  const [bankLedgerId, setBankLedgerId] = useState<string>("");
  const [paymentModeId, setPaymentModeId] = useState<string>("");

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: 'AD' | 'BS' }>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );
  const isBS = companySettings?.calendar_mode === 'BS';

  const { data: ledgers } = useSWR<Ledger[]>(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    companyId
      ? `/payment-modes/companies/${companyId}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const { data: supplierMappings } = useSWR<SupplierLedgerMapping[]>(
    companyId
      ? `/companies/${companyId}/reports/supplier-ledger-mapping?has_ledger=true`
      : null,
    fetcher
  );
  const supplierOptions = useMemo(() => {
    const mapped = (supplierMappings || []).map((m) => ({
      ledgerId: m.ledger_id,
      label: m.supplier_name,
    }));

    if (mapped.length > 0) return mapped;

    // Fallback: derive supplier-like ledgers directly from ledgers list
    const fallback: { ledgerId: number; label: string }[] = [];
    (ledgers || []).forEach((l) => {
      const name = (l.name || "").toString().toLowerCase();
      const group = (l.group_name || "").toString().toLowerCase();

      const looksLikeSupplier =
        group.includes("sundry creditor") ||
        group.includes("creditor") ||
        group.includes("supplier") ||
        name.includes("creditor") ||
        name.includes("supplier");

      if (!looksLikeSupplier) return;
      fallback.push({ ledgerId: l.id, label: l.name });
    });

    return fallback;
  }, [supplierMappings, ledgers]);

  const purchaseLedgers = (ledgers || []).filter((l) => {
    const group = (l.group_name || "").toString().toLowerCase();
    const name = (l.name || "").toString().toLowerCase();
    if (group.includes("purchase")) return true;
    return name.includes("purchase");
  });

  const filteredBankCashLedgers = useMemo(() => {
    if (!ledgers || !paymentModes || !paymentModeId) return [];
    const mode = paymentModes.find(pm => String(pm.id) === paymentModeId);
    if (!mode || !mode.ledger_group_id) {
       // Fallback to old behavior if no group is linked or no mode selected
       return (ledgers || []).filter((l) => {
        const group = (l.group_name || "").toString().toLowerCase();
        const name = (l.name || "").toString().toLowerCase();
        return group.includes("bank") || group.includes("cash") || name.includes("bank") || name.includes("cash");
      });
    }
    // Filter by the linked group
    // Note: Ledger type here doesn't have group_id, but the API usually returns it. 
    // If not, we might need to fetch it or use group_name matching.
    // Based on other files, ledgers have group_id.
    return (ledgers as any[]).filter((l: any) => l.group_id === mode.ledger_group_id);
  }, [ledgers, paymentModes, paymentModeId]);

  const handleSupplierChange = (value: string) => {
    setSupplierLedgerId(value);
    if (!value) {
      setSupplierName("");
      return;
    }
    const id = Number(value);
    const found = supplierOptions.find((s) => s.ledgerId === id);
    setSupplierName(found?.label || "");
  };

  const resetForm = () => {
    setVoucherDate(today);
    setAmount("");
    setNarration("");
    setSupplierLedgerId("");
    setSupplierName("");
    setPurchaseLedgerId("");
    setBankLedgerId("");
    setPaymentModeId("");
    setSubmitError(null);
  };

  useEffect(() => {
    const supplierLedgerIdParam = searchParams.get("supplier_ledger_id");
    const supplierNameParam = searchParams.get("supplier_name");
    const typeParam = searchParams.get("type");

    if (supplierLedgerIdParam) {
      setSupplierLedgerId(supplierLedgerIdParam);
      if (supplierNameParam) {
        setSupplierName(supplierNameParam);
      } else {
        const id = Number(supplierLedgerIdParam);
        const found = supplierOptions.find((s) => s.ledgerId === id);
        if (found) {
          setSupplierName(found.label);
        }
      }
    }

    if (typeParam === "PAYMENT" || typeParam === "purchase") {
      setActionType(typeParam === "PAYMENT" ? "PAYMENT" : "PURCHASE");
    }
  }, [searchParams, supplierOptions]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    setSubmitError(null);

    if (!voucherDate) {
      setSubmitError('Voucher date is required.');
      return;
    }
    if (!supplierLedgerId) {
      setSubmitError("Supplier is required.");
      return;
    }

    const numericAmount = Number(amount || "0");
    if (!(numericAmount > 0)) {
      setSubmitError("Amount must be greater than zero.");
      return;
    }

    let payload: any;
    let voucherType: VoucherTypeForScreen;

    if (actionType === "PURCHASE") {
      voucherType = "JOURNAL";

      if (!purchaseLedgerId) {
        setSubmitError("Purchase ledger is required.");
        return;
      }

      payload = {
        ...(isBS ? { voucher_date_bs: voucherDate } : { voucher_date: voucherDate }),
        voucher_type: voucherType,
        lines: [
          {
            ledger_id: Number(purchaseLedgerId),
            debit: numericAmount,
            credit: 0,
            department_id: null,
            project_id: null,
          },
          {
            ledger_id: Number(supplierLedgerId),
            debit: 0,
            credit: numericAmount,
            department_id: null,
            project_id: null,
          },
        ],
        narration:
          narration ||
          (supplierName
            ? `Purchase from ${supplierName}`
            : "Purchase from supplier"),
        payment_mode_id: null,
      };
    } else {
      voucherType = "PAYMENT";

      if (!bankLedgerId) {
        setSubmitError("Bank / Cash ledger is required.");
        return;
      }
      if (!paymentModeId) {
        setSubmitError("Payment mode is required.");
        return;
      }

      payload = {
        ...(isBS ? { voucher_date_bs: voucherDate } : { voucher_date: voucherDate }),
        voucher_type: voucherType,
        lines: [
          {
            ledger_id: Number(supplierLedgerId),
            debit: numericAmount,
            credit: 0,
            department_id: null,
            project_id: null,
          },
          {
            ledger_id: Number(bankLedgerId),
            debit: 0,
            credit: numericAmount,
            department_id: null,
            project_id: null,
          },
        ],
        narration:
          narration ||
          (supplierName
            ? `Payment to ${supplierName}`
            : "Payment to supplier"),
        payment_mode_id: Number(paymentModeId),
      };
    }

    const debits = payload.lines.reduce(
      (sum: number, l: any) => sum + Number(l.debit || 0),
      0
    );
    const credits = payload.lines.reduce(
      (sum: number, l: any) => sum + Number(l.credit || 0),
      0
    );
    if (debits.toFixed(2) !== credits.toFixed(2)) {
      setSubmitError("Voucher not balanced. Debit must equal credit.");
      return;
    }

    setSubmitting(true);
    try {
      const voucher: Voucher = await createManualVoucher(
        Number(companyId),
        payload
      );
      resetForm();
      router.push(`/companies/${companyId}/vouchers/${voucher.id}?created=1`);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let message = "Failed to create voucher";
      if (typeof detail === "string") {
        message = detail;
      }
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Supplier Purchase & Payment"
        subtitle="Record supplier purchases (JOURNAL) and payments (PAYMENT)."
      />

      <Card>
        <form
          className="space-y-4 text-sm max-w-2xl"
          onSubmit={handleSubmit}
        >
          {submitError && (
            <div className="text-xs text-red-600">{submitError}</div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant={actionType === "PURCHASE" ? "primary" : "outline"}
              size="sm"
              onClick={() => setActionType("PURCHASE")}
            >
              Book Purchase (JOURNAL)
            </Button>
            <Button
              type="button"
              variant={actionType === "PAYMENT" ? "primary" : "outline"}
              size="sm"
              onClick={() => setActionType("PAYMENT")}
            >
              Record Payment (PAYMENT)
            </Button>
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 text-xs font-medium">
                Voucher Date
              </label>
              {isBS ? (
                <NepaliDatePicker
                  inputClassName="h-8 px-2 py-1 text-xs w-full rounded-md border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  value={voucherDate}
                  onChange={(value: string) => setVoucherDate(value)}
                  options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                />
              ) : (
                <Input
                  type="date"
                  className="h-8 px-2 py-1 text-xs"
                  value={voucherDate}
                  onChange={(e) => setVoucherDate(e.target.value)}
                  required
                />
              )}
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Amount</label>
              <Input
                type="number"
                step="0.01"
                min={0}
                className="h-8 px-2 py-1 text-xs"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">
                Voucher Type
              </label>
              <Input
                readOnly
                value={actionType === "PURCHASE" ? "JOURNAL" : "PAYMENT"}
                className="h-8 px-2 py-1 text-xs bg-slate-50"
              />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1 text-xs font-medium">
                Supplier
              </label>
              <Select
                className="h-8 px-2 py-1 text-xs"
                value={supplierLedgerId}
                onChange={(e) => handleSupplierChange(e.target.value)}
              >
                <option value="">Select supplier</option>
                {supplierOptions.map((s) => (
                  <option key={s.ledgerId} value={s.ledgerId}>
                    {s.ledgerId} - {s.label}
                  </option>
                ))}
              </Select>
            </div>

            {actionType === "PURCHASE" && (
              <div>
                <label className="block mb-1 text-xs font-medium">
                  Purchase Ledger
                </label>
                <Select
                  className="h-8 px-2 py-1 text-xs"
                  value={purchaseLedgerId}
                  onChange={(e) => setPurchaseLedgerId(e.target.value)}
                >
                  <option value="">Select purchase ledger</option>
                  {purchaseLedgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id} - {l.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            {actionType === "PAYMENT" && (
              <>
                <div>
                  <label className="block mb-1 text-xs font-medium">
                    Bank / Cash Ledger
                  </label>
                  <Select
                    className="h-8 px-2 py-1 text-xs"
                    value={bankLedgerId}
                    onChange={(e) => setBankLedgerId(e.target.value)}
                  >
                    <option value="">Select bank / cash ledger</option>
                    {filteredBankCashLedgers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.id} - {l.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium">
                    Payment Mode
                  </label>
                  <Select
                    className="h-8 px-2 py-1 text-xs"
                    value={paymentModeId}
                    onChange={(e) => setPaymentModeId(e.target.value)}
                  >
                    <option value="">Select payment mode</option>
                    {paymentModes?.map((pm) => (
                      <option key={pm.id} value={pm.id.toString()}>
                        {pm.name}
                      </option>
                    ))}
                  </Select>
                </div>
              </>
            )}
          </div>

          <div>
            <label className="block mb-1 text-xs font-medium">
              Narration (optional)
            </label>
            <Input
              className="h-8 px-2 py-1 text-xs"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              placeholder={
                actionType === "PURCHASE"
                  ? "Purchase from supplier..."
                  : "Payment to supplier..."
              }
            />
          </div>

          <div className="flex items-center gap-2 mt-2">
            <Button
              type="submit"
              variant="primary"
              size="md"
              isLoading={submitting}
            >
              {actionType === "PURCHASE"
                ? "Save Purchase Voucher"
                : "Save Payment Voucher"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => router.back()}
            >
              Close
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
