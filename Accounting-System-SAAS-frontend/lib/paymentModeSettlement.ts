export type PaymentModeLike = {
  id?: number | string | null;
  name?: string | null;
};

export function normalizePaymentModeId(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value > 0 ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed);
    if (!Number.isFinite(n) || n <= 0) return null;
    return n;
  }
  return null;
}

export function isCreditPaymentMode(
  paymentModeId: unknown,
  paymentModeName: unknown
): boolean {
  const normalizedId = normalizePaymentModeId(paymentModeId);
  if (!normalizedId) return true;

  const name =
    typeof paymentModeName === "string" ? paymentModeName.trim().toLowerCase() : "";
  if (!name) return false;
  return name === "credit";
}

export function deriveSettlement(
  paymentModeId: unknown,
  paymentModeName: unknown,
  grandTotal: number
): {
  isCashOrBank: boolean;
  isCredit: boolean;
  paidAmount: number;
  outstandingAmount: number;
  statusLabel: "PAID" | "CREDIT";
} {
  const normalizedId = normalizePaymentModeId(paymentModeId);
  const name =
    typeof paymentModeName === "string" ? paymentModeName.trim().toLowerCase() : "";

  const isCashOrBank = !!normalizedId && name !== "credit";
  const isCredit = !isCashOrBank;

  const paidAmount = isCashOrBank ? grandTotal : 0;
  const outstandingAmount = isCashOrBank ? 0 : grandTotal;

  return {
    isCashOrBank,
    isCredit,
    paidAmount,
    outstandingAmount,
    statusLabel: isCashOrBank ? "PAID" : "CREDIT",
  };
}
