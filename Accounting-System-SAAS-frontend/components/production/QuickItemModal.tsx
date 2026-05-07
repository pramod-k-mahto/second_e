"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { api, getItemLedgerDefaults, getApiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";

interface QuickItemModalProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
  onSuccess: (newItemId: number) => void;
  initialName?: string;
  type?: "FINISHED_PRODUCT" | "COMPONENT";
  /** Override the modal title (e.g. "Quick Add Product") */
  title?: string;
  /** Called when user clicks "Open full form". Parent saves draft if needed then navigates. */
  onGoToFullForm?: () => void;
}

export function QuickItemModal({
  open,
  onClose,
  companyId,
  onSuccess,
  initialName = "",
  type = "COMPONENT",
  title: titleOverride,
  onGoToFullForm,
}: QuickItemModalProps) {
  const { showToast } = useToast();
  const [itemType, setItemType] = useState<"goods" | "service">("goods");
  const [name, setName] = useState(initialName);
  const [code, setCode] = useState("");
  const [unit, setUnit] = useState("pcs");
  const [salesRate, setSalesRate] = useState("0");
  const [purchaseRate, setPurchaseRate] = useState("0");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [altUnits, setAltUnits] = useState<{ unit_code: string; factor_to_base: string }[]>([]);

  useEffect(() => {
    if (open) {
      setItemType("goods");
      setName(initialName);
      setCode("");
      setUnit("pcs");
      setSalesRate("0");
      setPurchaseRate("0");
      setError(null);
      setAltUnits([]);
    }
  }, [open, initialName]);

  const handleItemTypeChange = (t: "goods" | "service") => {
    setItemType(t);
    setUnit(t === "service" ? "hrs" : "pcs");
    if (t === "service") setAltUnits([]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      // Fetch ledger defaults to ensure creation doesn't fail due to missing accounts
      const defaults = await getItemLedgerDefaults(companyId);
      const incomeId = defaults.income_ledger_id ?? defaults.sales_ledger_id ?? null;
      const expenseId = defaults.expense_ledger_id ?? defaults.purchase_ledger_id ?? null;

      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        unit: unit.trim() || "pcs",
        default_sales_rate: Number(salesRate) || 0,
        default_purchase_rate: Number(purchaseRate) || 0,
        income_ledger_id: incomeId,
        expense_ledger_id: expenseId,
        output_tax_ledger_id: defaults.output_tax_ledger_id,
        input_tax_ledger_id: defaults.input_tax_ledger_id,
        is_active: true,
        is_inventory_item: itemType === "goods",
        category: itemType === "goods" ? "Product" : "Service",
        units: [
          {
            unit_code: unit.trim() || "pcs",
            is_base: true,
            factor_to_base: 1,
            decimals: 0,
            sort_order: 1,
          },
          ...altUnits.filter(u => u.unit_code.trim() && Number(u.factor_to_base) > 0).map((u, i) => ({
            unit_code: u.unit_code.trim(),
            is_base: false,
            factor_to_base: Number(u.factor_to_base),
            decimals: 0,
            sort_order: i + 2,
          }))
        ]
      };

      const res = await api.post(`/inventory/companies/${companyId}/items`, payload);
      const newItem = res.data;

      showToast({
        title: "Item Created",
        description: `Successfully created ${name}`,
        variant: "success",
      });

      onSuccess(newItem.id);
      onClose();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const modalTitle = titleOverride ?? `Quick Create ${type === "FINISHED_PRODUCT" ? "Finished Product" : "Component"}`;

  return (
    <Modal open={open} onClose={onClose} title={modalTitle} size="md">
      <form onSubmit={handleSubmit} className="space-y-4 py-2">
        {onGoToFullForm && (
          <div className="flex items-center justify-between rounded-lg border border-indigo-100 dark:border-indigo-800/50 bg-indigo-50/60 dark:bg-indigo-900/20 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300">
              <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20A10 10 0 0012 2z" />
              </svg>
              Need to set category, tax, warehouse, or other details?
            </div>
            <button
              type="button"
              onClick={() => { onClose(); onGoToFullForm(); }}
              className="ml-3 shrink-0 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-200 underline underline-offset-2 transition-colors whitespace-nowrap"
            >
              Open full form →
            </button>
          </div>
        )}
        {/* Item Type toggle */}
        <div>
          <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">Item Type</label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleItemTypeChange("goods")}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                itemType === "goods"
                  ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 ring-1 ring-indigo-400"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${itemType === "goods" ? "bg-indigo-100 dark:bg-indigo-800/50 text-indigo-600 dark:text-indigo-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </span>
              <div>
                <p className={`text-xs font-semibold ${itemType === "goods" ? "text-indigo-700 dark:text-indigo-300" : "text-slate-700 dark:text-slate-300"}`}>Goods</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Inventory tracked</p>
              </div>
            </button>

            <button
              type="button"
              onClick={() => handleItemTypeChange("service")}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left transition-all ${
                itemType === "service"
                  ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 ring-1 ring-emerald-400"
                  : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${itemType === "service" ? "bg-emerald-100 dark:bg-emerald-800/50 text-emerald-600 dark:text-emerald-300" : "bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400"}`}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </span>
              <div>
                <p className={`text-xs font-semibold ${itemType === "service" ? "text-emerald-700 dark:text-emerald-300" : "text-slate-700 dark:text-slate-300"}`}>Service</p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">Not inventory tracked</p>
              </div>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Item Name *</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Enter item name"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Item Code</label>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Optional code"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Unit</label>
            <Input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder="e.g. pcs, kg"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Sales Rate</label>
            <Input
              type="number"
              step="any"
              value={salesRate}
              onChange={(e) => setSalesRate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Purchase Rate</label>
            <Input
              type="number"
              step="any"
              value={purchaseRate}
              onChange={(e) => setPurchaseRate(e.target.value)}
            />
          </div>
        </div>

        {/* Alternative Units Section — only relevant for goods */}
        {itemType === "goods" && <div className="pt-2 border-t dark:border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">Alternative Units (Optional)</label>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAltUnits((prev) => [...prev, { unit_code: "", factor_to_base: "1" }])}
            >
              + Add Unit
            </Button>
          </div>
          {altUnits.length > 0 && (
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold text-slate-500 mb-1">
                <div className="col-span-5">Unit Code</div>
                <div className="col-span-5">Factor to Base</div>
                <div className="col-span-2"></div>
              </div>
              {altUnits.map((u, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <div className="col-span-5">
                    <Input
                      value={u.unit_code}
                      onChange={(e) => {
                        const next = [...altUnits];
                        next[i].unit_code = e.target.value;
                        setAltUnits(next);
                      }}
                      placeholder="e.g. box"
                    />
                  </div>
                  <div className="col-span-5">
                    <Input
                      type="number"
                      step="any"
                      min={0}
                      value={u.factor_to_base}
                      onChange={(e) => {
                        const next = [...altUnits];
                        next[i].factor_to_base = e.target.value;
                        setAltUnits(next);
                      }}
                      placeholder="Factor"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setAltUnits((prev) => prev.filter((_, idx) => idx !== i))}
                    >
                      <svg className="w-4 h-4 text-slate-400 hover:text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-500">
                1 [Alt Unit] = [Factor] × {unit.trim() || "pcs"} (Base Unit)
              </p>
            </div>
          )}
        </div>}

        {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

        <div className="flex justify-end gap-2 pt-2 border-t dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" isLoading={submitting}>
            Create Item
          </Button>
        </div>
      </form>
    </Modal>
  );
}
