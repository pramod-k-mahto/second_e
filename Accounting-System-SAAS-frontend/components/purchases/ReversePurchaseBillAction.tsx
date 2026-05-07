"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR, { mutate as globalMutate } from "swr";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api, reversePurchaseBill, type PurchaseReturn, type ReversePurchaseBillPayload } from "@/lib/api";
import { invalidateAccountingReports } from "@/lib/invalidateAccountingReports";

type PaymentMode = {
  id: number;
  name: string;
  ledger_id: number;
  is_active: boolean;
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

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

export interface ReversePurchaseBillActionProps {
  companyId: string | number;
  billId: string | number;
  billDate?: string | null;
  disabled?: boolean;
  onReversed?: (purchaseReturn: PurchaseReturn) => void;
}

export function ReversePurchaseBillAction({
  companyId,
  billId,
  billDate,
  disabled,
  onReversed,
}: ReversePurchaseBillActionProps) {
  const router = useRouter();
  const { showToast } = useToast();

  const companyIdNum = Number(companyId);
  const billIdNum = Number(billId);

  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const defaultDate = useMemo(() => {
    if (billDate) return billDate;
    return new Date().toISOString().slice(0, 10);
  }, [billDate]);

  const defaultReference = useMemo(() => `REV-${billIdNum}`, [billIdNum]);

  const [reverseDate, setReverseDate] = useState<string>(defaultDate);
  const [reference, setReference] = useState<string>(defaultReference);
  const [paymentModeId, setPaymentModeId] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    setReverseDate(defaultDate);
    setReference(defaultReference);
    setPaymentModeId("");
  }, [open, defaultDate, defaultReference]);

  const { data: paymentModes } = useSWR<PaymentMode[]>(
    open && companyIdNum
      ? `/payment-modes/companies/${companyIdNum}/payment-modes?is_active=true`
      : null,
    fetcher
  );

  const handleSubmit = async () => {
    if (!companyIdNum || !billIdNum) return;

    const payload: ReversePurchaseBillPayload = {};

    if (reverseDate === "") {
      payload.date = null;
    } else if (reverseDate && reverseDate !== defaultDate) {
      payload.date = reverseDate;
    }

    if (reference === "") {
      payload.reference = null;
    } else if (reference && reference !== defaultReference) {
      payload.reference = reference;
    }

    payload.payment_mode_id = paymentModeId ? Number(paymentModeId) : null;

    const payloadToSend: ReversePurchaseBillPayload =
      Object.keys(payload).length > 0 ? payload : {};

    try {
      setSubmitting(true);
      const pr = await reversePurchaseBill(companyIdNum, billIdNum, payloadToSend);

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key === `/companies/${companyIdNum}/bills` ||
            key === `/companies/${companyIdNum}/bills/${billIdNum}` ||
            key.startsWith(`/companies/${companyIdNum}/bills?`))
      );

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/purchases/companies/${companyIdNum}/returns`)
      );

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith(`/companies/${companyIdNum}/vouchers`) ||
            key.startsWith(`/companies/${companyIdNum}/reports/ledger`) ||
            key.startsWith(`/companies/${companyIdNum}/reports/daybook`))
      );

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key.startsWith(`/inventory/companies/${companyIdNum}/stock/`) || key.startsWith(`/inventory/companies/${companyIdNum}/stock-summary`))
      );

      await invalidateAccountingReports(companyIdNum);

      const asOnDate = new Date().toISOString().slice(0, 10);
      if (pr && Array.isArray((pr as any).lines)) {
        const uniquePairs = new Set<string>();
        for (const l of (pr as any).lines) {
          const itemId = Number(l?.item_id);
          const warehouseId = Number(l?.warehouse_id);
          if (!itemId || !warehouseId) continue;
          uniquePairs.add(`${itemId}:${warehouseId}`);
        }

        await Promise.all(
          Array.from(uniquePairs).map(() =>
            globalMutate(
              `/inventory/companies/${companyIdNum}/stock/summary?as_on_date=${asOnDate}`
            )
          )
        );
      }

      showToast({
        title: "Bill reversed",
        description: `Purchase Return #${pr.reference || pr.id} created.`,
        variant: "success",
      });

      setOpen(false);

      if (onReversed) {
        onReversed(pr);
        return;
      }

      router.push(`/companies/${companyIdNum}/purchases/returns/${pr.id}`);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;

      if (status === 409) {
        showToast({
          title: "Cannot reverse because inventory has been consumed.",
          variant: "error",
        });
        return;
      }

      const msg = extractErrorMessage(detail, "Failed to reverse bill");
      showToast({ title: "Reverse failed", description: msg, variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="border-critical-500 text-critical-700 hover:bg-critical-50"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        Reverse
      </Button>

      <Modal
        open={open}
        onClose={() => {
          if (submitting) return;
          setOpen(false);
        }}
        title="Reverse Purchase Invoice?"
      >
        <div className="space-y-3">
          <p className="text-xs text-slate-600">
            This will create a compensating Purchase Return and voucher. This keeps audit history.
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-700">Reverse Date</label>
              <input
                type="date"
                className="h-9 px-3 py-2 text-sm border rounded"
                value={reverseDate}
                onChange={(e) => setReverseDate(e.target.value)}
                disabled={submitting}
              />
              <div className="text-[11px] text-slate-500">Leave blank to use the bill date.</div>
              <button
                type="button"
                className="self-start text-[11px] text-slate-600 underline"
                onClick={() => setReverseDate("")}
                disabled={submitting}
              >
                Clear date
              </button>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-slate-700">Reference</label>
              <input
                className="h-9 px-3 py-2 text-sm border rounded"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-[11px] font-medium text-slate-700">Payment Mode (optional)</label>
              <select
                className="h-9 px-3 py-2 text-sm border rounded"
                value={paymentModeId}
                onChange={(e) => setPaymentModeId(e.target.value)}
                disabled={submitting}
              >
                <option value="">Credit (no immediate payment)</option>
                {paymentModes?.map((pm) => (
                  <option key={pm.id} value={pm.id}>
                    {pm.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={submitting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              onClick={handleSubmit}
              isLoading={submitting}
            >
              Reverse
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
