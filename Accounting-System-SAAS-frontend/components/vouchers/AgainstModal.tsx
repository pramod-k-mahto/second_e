"use client";

import { useEffect, useMemo, useState } from "react";

import { Modal } from "@/components/ui/Modal";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

import {
  fetchOutstandingPurchaseBills,
  fetchOutstandingSalesInvoices,
  getApiErrorMessage,
  OutstandingDocument,
  VoucherAllocationCreate,
} from "@/lib/api";

type VoucherType = "PAYMENT" | "RECEIPT";

type Props = {
  open: boolean;
  onClose: () => void;
  companyId: number;
  voucherType: VoucherType;
  counterpartyLedgerId: number | null;
  voucherAmount: number;
  onVoucherAmountChange: (nextAmount: number) => void;
  initialAllocations: VoucherAllocationCreate[];
  onConfirm: (allocations: VoucherAllocationCreate[]) => void;
};

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function AgainstModal({
  open,
  onClose,
  companyId,
  voucherType,
  counterpartyLedgerId,
  voucherAmount,
  onVoucherAmountChange,
  initialAllocations,
  onConfirm,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docs, setDocs] = useState<OutstandingDocument[]>([]);
  const [selectedKeys, setSelectedKeys] = useState<Record<string, boolean>>({});
  const [allocInputByKey, setAllocInputByKey] = useState<Record<string, string>>({});

  const filteredDocs = useMemo(() => {
    return (docs || []).filter((d) => Number(d.outstanding_amount || 0) > 0);
  }, [docs]);

  const keyOf = (d: OutstandingDocument) => `${d.doc_type}:${d.id}`;

  useEffect(() => {
    if (!open) return;
    setError(null);
  }, [open, voucherAmount]);

  useEffect(() => {
    if (!open) return;
    const next: Record<string, string> = {};
    const sel: Record<string, boolean> = {};
    (initialAllocations || []).forEach((a) => {
      const k = `${a.doc_type}:${a.doc_id}`;
      next[k] = a.amount != null ? String(a.amount) : "";
      if (Number(a.amount || 0) > 0) {
        sel[k] = true;
      }
    });
    setAllocInputByKey(next);
    setSelectedKeys(sel);
  }, [open, initialAllocations]);

  useEffect(() => {
    if (!open) return;
    if (filteredDocs.length === 0) return;
    setSelectedKeys((prev) => {
      const next: Record<string, boolean> = {};
      for (const d of filteredDocs) {
        const k = keyOf(d);
        const hasAlloc = Number(allocInputByKey[k] || 0) > 0;
        next[k] = Boolean(prev[k] || hasAlloc);
      }
      return next;
    });
  }, [open, filteredDocs, allocInputByKey]);

  useEffect(() => {
    if (!open) return;
    if (!companyId) return;
    if (!counterpartyLedgerId) {
      setDocs([]);
      setError("Counterparty ledger is required.");
      return;
    }

    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setError(null);
      try {
        const data =
          voucherType === "PAYMENT"
            ? await fetchOutstandingPurchaseBills(companyId, counterpartyLedgerId)
            : await fetchOutstandingSalesInvoices(companyId, counterpartyLedgerId);
        if (cancelled) return;
        setDocs(Array.isArray(data) ? data : []);
      } catch (e) {
        if (cancelled) return;
        setDocs([]);
        setError(getApiErrorMessage(e));
      } finally {
        if (cancelled) return;
        setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [open, companyId, counterpartyLedgerId, voucherType]);

  const allocatedSum = useMemo(() => {
    let sum = 0;
    for (const d of filteredDocs) {
      const k = keyOf(d);
      if (!selectedKeys[k]) continue;
      const raw = allocInputByKey[keyOf(d)] ?? "";
      const n = Number(raw || 0);
      if (n > 0) sum += n;
    }
    return round2(sum);
  }, [allocInputByKey, filteredDocs, selectedKeys]);

  const remainingVoucherAmount = useMemo(() => {
    return round2(Math.max(0, Number(voucherAmount || 0) - allocatedSum));
  }, [allocatedSum, voucherAmount]);

  const autoAllocate = () => {
    setError(null);
    const anySelected = filteredDocs.some((d) => selectedKeys[keyOf(d)]);
    const base = anySelected
      ? filteredDocs.filter((d) => selectedKeys[keyOf(d)])
      : filteredDocs;

    const sorted = [...base].sort((a, b) => {
      const ad = String(a.date || "");
      const bd = String(b.date || "");
      if (ad < bd) return -1;
      if (ad > bd) return 1;
      return Number(a.id) - Number(b.id);
    });

    let remaining = Number(voucherAmount || 0);
    const next: Record<string, string> = {};

    for (const d of sorted) {
      if (!(remaining > 0)) break;
      const due = Number(d.outstanding_amount || 0);
      if (!(due > 0)) continue;
      const amt = Math.min(due, remaining);
      if (amt > 0) {
        next[keyOf(d)] = String(round2(amt));
        remaining = round2(remaining - amt);
      }
    }

    setAllocInputByKey(next);
    setSelectedKeys((prev) => {
      const s: Record<string, boolean> = { ...prev };
      for (const d of sorted) {
        const k = keyOf(d);
        if (Number(next[k] || 0) > 0) s[k] = true;
      }
      return s;
    });
  };

  const clearAllocations = () => {
    setAllocInputByKey({});
    setSelectedKeys({});
    setError(null);
  };

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      clearAllocations();
      return;
    }
    const next: Record<string, boolean> = {};
    filteredDocs.forEach((d) => {
      next[keyOf(d)] = true;
    });
    setSelectedKeys(next);
    setError(null);
  };

  const validateAndConfirm = () => {
    const numericVoucherAmount = Number(voucherAmount || 0);
    if (!(numericVoucherAmount > 0)) {
      setError("Voucher amount must be greater than zero.");
      return;
    }

    if (allocatedSum > numericVoucherAmount) {
      setError("Allocated amount cannot exceed voucher amount.");
      return;
    }

    const expectedDocType = voucherType === "PAYMENT" ? "PURCHASE_BILL" : "SALES_INVOICE";
    const allocations: VoucherAllocationCreate[] = [];

    for (const d of filteredDocs) {
      const k = keyOf(d);
      if (!selectedKeys[k]) continue;

      const dueAmount = Number(d.outstanding_amount || 0);
      const allocateAmount = Number(allocInputByKey[k] || 0);

      if (allocateAmount > dueAmount) {
        setError("Cannot allocate more than due amount.");
        return;
      }

      if (!(allocateAmount > 0)) {
        setError("Allocation amount must be greater than zero.");
        return;
      }

      if (d.doc_type !== expectedDocType) {
        setError("Invalid document type for this voucher type.");
        return;
      }

      allocations.push({
        doc_type: d.doc_type,
        doc_id: d.id,
        amount: round2(allocateAmount),
      });
    }

    onConfirm(allocations);
    onClose();
  };

  return (
    <Modal open={open} title="Against" onClose={onClose} className="max-w-7xl">
      <div className="space-y-3">
        {error && (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-xs font-medium text-slate-700">Voucher Amount</div>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min={0}
                value={Number.isFinite(Number(voucherAmount)) ? String(voucherAmount) : ""}
                onChange={(e) => {
                  setError(null);
                  const n = Number(e.target.value || 0);
                  onVoucherAmountChange(n);
                }}
                className="h-8 w-40 px-2 py-1 text-xs"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={autoAllocate} disabled={loading}>
              Auto-allocate
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={clearAllocations} disabled={loading}>
              Clear
            </Button>
          </div>
        </div>

        <div className="max-h-[80vh] overflow-auto rounded-md border border-slate-200">
          <Table className="text-xs">
            <THead>
              <TR>
                <TH className="w-10">
                  <input
                    type="checkbox"
                    checked={
                      filteredDocs.length > 0 &&
                      filteredDocs.every((d) => Boolean(selectedKeys[keyOf(d)]))
                    }
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all"
                  />
                </TH>
                <TH>Doc No</TH>
                <TH>Date</TH>
                <TH className="text-right">Total</TH>
                <TH className="text-right">Paid</TH>
                <TH className="text-right">Due</TH>
                <TH className="text-right">Allocate</TH>
              </TR>
            </THead>
            <TBody>
              {loading ? (
                <TR>
                  <TD colSpan={7} className="py-6 text-center text-slate-500">
                    Loading...
                  </TD>
                </TR>
              ) : filteredDocs.length === 0 ? (
                <TR>
                  <TD colSpan={7} className="py-6 text-center text-slate-500">
                    No outstanding documents.
                  </TD>
                </TR>
              ) : (
                filteredDocs.map((d) => {
                  const k = keyOf(d);
                  const due = Number(d.outstanding_amount || 0);
                  const checked = Boolean(selectedKeys[k]);
                  return (
                    <TR key={k}>
                      <TD>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const isChecked = e.target.checked;
                            setError(null);
                            setSelectedKeys((prev) => ({ ...prev, [k]: isChecked }));
                            if (!isChecked) {
                              setAllocInputByKey((prev) => {
                                const next = { ...prev };
                                delete next[k];
                                return next;
                              });
                            }
                          }}
                          aria-label={`Select ${d.number}`}
                        />
                      </TD>
                      <TD className="whitespace-nowrap">{d.number}</TD>
                      <TD className="whitespace-nowrap">{d.date}</TD>
                      <TD className="text-right whitespace-nowrap">{round2(Number(d.total_amount || 0))}</TD>
                      <TD className="text-right whitespace-nowrap">{round2(Number(d.paid_amount || 0))}</TD>
                      <TD className="text-right whitespace-nowrap">{round2(due)}</TD>
                      <TD className="text-right">
                        <div className="flex justify-end">
                          <Input
                            type="number"
                            step="0.01"
                            min={0}
                            value={allocInputByKey[k] ?? ""}
                            onChange={(e) => {
                              const nextVal = e.target.value;
                              setError(null);
                              if (!selectedKeys[k]) {
                                setSelectedKeys((prev) => ({ ...prev, [k]: true }));
                              }
                              setAllocInputByKey((prev) => ({ ...prev, [k]: nextVal }));
                            }}
                            className="h-8 w-28 px-2 py-1 text-xs"
                            max={due}
                            disabled={!checked}
                          />
                        </div>
                      </TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </div>

        <div className="flex flex-col gap-2 border-t border-slate-100 pt-3 md:flex-row md:items-center md:justify-between">
          <div className="text-xs text-slate-700">
            Due Amount: <span className="font-medium text-slate-900">{round2(Number(voucherAmount || 0))}</span>
            <span className="mx-2 text-slate-300">|</span>
            Allocated Amount: <span className="font-medium text-slate-900">{allocatedSum}</span>
            <span className="mx-2 text-slate-300">|</span>
            Remaining Voucher Amount: <span className="font-medium text-slate-900">{remainingVoucherAmount}</span>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={validateAndConfirm} disabled={loading}>
              Apply
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
