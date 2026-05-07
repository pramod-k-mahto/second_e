"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";
import { api, createBOM, deleteBOM, getApiErrorMessage, getBOMById, getBOMByProduct, updateBOM } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import { PageHeader } from "@/components/ui/PageHeader";
import type { BOMItemCreate, BOMRead } from "@/types/production";
import type { BomRowInput } from "./bomValidation";
import { mapBomToRows, validateBomRows } from "./bomValidation";
import { QuickItemModal } from "./QuickItemModal";

type ProductLite = {
  id: number;
  name: string;
  code?: string | null;
  unit?: string | null;
  default_purchase_rate?: number | null;
};
type WarehouseLite = {
  id: number;
  name: string;
  is_active?: boolean;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
};
type CostCenterLite = {
  id: number;
  name: string;
  code?: string | null;
  is_active?: boolean;
};

type ProductLiteList = ProductLite[];
type WarehouseLiteList = WarehouseLite[];
type CostCenterLiteList = CostCenterLite[];
type BomRowInputList = BomRowInput[];
type FormErrorState = string | null;
type ActiveBomState = BOMRead | null;

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const INITIAL_ROW: BomRowInput = {
  componentProductId: "",
  quantity: "",
  unit: "",
  wastagePercent: "0",
};

function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getFriendlyBomError(rawError: unknown): string {
  const msg = getApiErrorMessage(rawError);
  const normalized = msg.toLowerCase();
  if (normalized.includes("circular")) return "Circular BOM detected. Remove self-referencing component chain and retry.";
  if (normalized.includes("invalid product")) return "One or more selected products are invalid. Please refresh and reselect products.";
  return msg;
}

export function BOMManagementPage({ companyId }: { companyId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [finishedProductId, setFinishedProductId] = useState("");
  const [fgBatchQty, setFgBatchQty] = useState("");
  const [version, setVersion] = useState("");
  const [rows, setRows] = useState<BomRowInputList>([{ ...INITIAL_ROW }]);
  const [rowErrors, setRowErrors] = useState<Record<number, string[]>>({});
  const [formError, setFormError] = useState<FormErrorState>(null);
  const [activeBom, setActiveBom] = useState<ActiveBomState>(null);
  const [loadingBom, setLoadingBom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [asOfForLoad, setAsOfForLoad] = useState("");
  const [effectiveFromLocal, setEffectiveFromLocal] = useState("");
  const [effectiveToLocal, setEffectiveToLocal] = useState("");
  const [warehouseId, setWarehouseId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [segmentId, setSegmentId] = useState("");
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateType, setQuickCreateType] = useState<"FINISHED_PRODUCT" | "COMPONENT">("COMPONENT");
  const [quickCreateRowIndex, setQuickCreateRowIndex] = useState<number | null>(null);

  const { mutate: globalMutate } = useSWRConfig();

  const { data: products, mutate: mutateProducts } = useSWR<ProductLiteList>(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );
  const { data: warehouses } = useSWR<WarehouseLiteList>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );
  const { data: departments } = useSWR<CostCenterLiteList>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );
  const { data: projects } = useSWR<CostCenterLiteList>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );
  const { data: segments } = useSWR<CostCenterLiteList>(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );

  const productOptions = useMemo(
    () =>
      (products || []).map((p) => ({
        value: String(p.id),
        label: p.name,
        sublabel: [p.code, p.unit].filter(Boolean).join(" | "),
      })),
    [products]
  );

  const productById = useMemo(() => {
    const map = new Map<number, ProductLite>();
    (products || []).forEach((p) => map.set(p.id, p));
    return map;
  }, [products]);
  const warehouseById = useMemo(() => {
    const map = new Map<number, WarehouseLite>();
    (warehouses || []).forEach((w) => map.set(Number(w.id), w));
    return map;
  }, [warehouses]);

  const componentSummaryRows = useMemo(() => {
    return rows
      .filter((r) => r.componentProductId)
      .map((row, index) => {
        const product = productById.get(Number(row.componentProductId));
        const qty = Number(row.quantity || "0");
        const wastage = Number(row.wastagePercent || "0");
        const rate = Number(product?.default_purchase_rate || 0);
        const grossQty = qty + (qty * wastage) / 100;
        const lineCost = grossQty * rate;
        return {
          key: `${row.componentProductId}-${index}`,
          name: product?.name || `#${row.componentProductId}`,
          qty,
          grossQty,
          unit: row.unit || product?.unit || "",
          wastage,
          rate,
          lineCost,
        };
      });
  }, [rows, productById]);
  const selectedFinishedProduct = useMemo(
    () => (finishedProductId ? productById.get(Number(finishedProductId)) : undefined),
    [finishedProductId, productById]
  );
  const finishedProductUnit = selectedFinishedProduct?.unit || "-";
  const totals = useMemo(() => {
    const totalQty = componentSummaryRows.reduce((acc, r) => acc + Number(r.qty || 0), 0);
    const avgWaste = componentSummaryRows.length
      ? componentSummaryRows.reduce((acc, r) => acc + Number(r.wastage || 0), 0) / componentSummaryRows.length
      : 0;
    const estimatedMaterialCost = rows.reduce((acc, r) => {
      if (!r.componentProductId) return acc;
      const p = productById.get(Number(r.componentProductId));
      return acc + Number(r.quantity || 0) * Number(p?.default_purchase_rate || 0);
    }, 0);
    const estimatedMaterialCostWithWastage = componentSummaryRows.reduce((acc, r) => acc + Number(r.lineCost || 0), 0);
    const fgQty = Number(fgBatchQty || activeBom?.batch_size || 0);
    const estimatedFgPerUnitMaterialCost = fgQty > 0 ? estimatedMaterialCostWithWastage / fgQty : 0;
    return { totalQty, avgWaste, estimatedMaterialCost, estimatedMaterialCostWithWastage, estimatedFgPerUnitMaterialCost };
  }, [activeBom?.batch_size, componentSummaryRows, fgBatchQty, rows, productById]);

  const validate = () => {
    const result = validateBomRows(finishedProductId, rows);
    setRowErrors(result.rowErrors);
    setFormError(result.formError);
    return !result.formError;
  };

  const resetForNew = () => {
    setActiveBom(null);
    setVersion("");
    setFgBatchQty("");
    setRows([{ ...INITIAL_ROW }]);
    setRowErrors({});
    setFormError(null);
    setAsOfForLoad("");
    setEffectiveFromLocal("");
    setEffectiveToLocal("");
    setWarehouseId("");
    setDepartmentId("");
    setProjectId("");
    setSegmentId("");
  };

  const applyWarehouseDefaults = (nextWarehouseId: string) => {
    const selected = warehouseById.get(Number(nextWarehouseId));
    if (!selected) {
      return;
    }
    setDepartmentId(selected.department_id != null ? String(selected.department_id) : "");
    setProjectId(selected.project_id != null ? String(selected.project_id) : "");
    setSegmentId(selected.segment_id != null ? String(selected.segment_id) : "");
  };

  const handleLoadBom = async () => {
    if (!finishedProductId) {
      setFormError("Please select a finished product first.");
      return;
    }
    setLoadingBom(true);
    setFormError(null);
    setRowErrors({});
    try {
      const bom = await getBOMByProduct(
        companyId,
        Number(finishedProductId),
        asOfForLoad.trim() ? { as_of: asOfForLoad.trim() } : undefined
      );
      setActiveBom(bom);
      setVersion(String(bom.version ?? ""));
      setFgBatchQty(bom.batch_size != null ? String(bom.batch_size) : "");
      setRows(mapBomToRows(bom));
      setDepartmentId(bom.department_id != null ? String(bom.department_id) : "");
      setProjectId(bom.project_id != null ? String(bom.project_id) : "");
      setSegmentId(bom.segment_id != null ? String(bom.segment_id) : "");
      setEffectiveFromLocal(toDatetimeLocalValue(bom.effective_from ?? undefined));
      setEffectiveToLocal(toDatetimeLocalValue(bom.effective_to ?? undefined));
      showToast({ title: "BOM loaded", description: `Loaded BOM #${bom.id}.`, variant: "success" });
    } catch (error) {
      setActiveBom(null);
      setRows([{ ...INITIAL_ROW }]);
      showToast({
        title: "Load BOM failed",
        description: getFriendlyBomError(error),
        variant: "error",
      });
    } finally {
      setLoadingBom(false);
    }
  };

  useEffect(() => {
    const initialProductId = searchParams.get("productId");
    const initialBomId = searchParams.get("bomId");
    if (!initialProductId && !initialBomId) return;
    let cancelled = false;
    const run = async () => {
      setLoadingBom(true);
      setFormError(null);
      try {
        let bom: BOMRead;
        if (initialBomId) {
          bom = await getBOMById(companyId, Number(initialBomId));
        } else {
          bom = await getBOMByProduct(companyId, Number(initialProductId));
        }
        if (cancelled) return;
        setFinishedProductId(String(bom.product_id));
        setActiveBom(bom);
        setVersion(String(bom.version ?? ""));
        setFgBatchQty(bom.batch_size != null ? String(bom.batch_size) : "");
        setRows(mapBomToRows(bom));
        setDepartmentId(bom.department_id != null ? String(bom.department_id) : "");
        setProjectId(bom.project_id != null ? String(bom.project_id) : "");
        setSegmentId(bom.segment_id != null ? String(bom.segment_id) : "");
        setEffectiveFromLocal(toDatetimeLocalValue(bom.effective_from ?? undefined));
        setEffectiveToLocal(toDatetimeLocalValue(bom.effective_to ?? undefined));
      } catch (error) {
        if (!cancelled) {
          setFormError(getFriendlyBomError(error));
        }
      } finally {
        if (!cancelled) setLoadingBom(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [companyId, searchParams]);

  const handleRowChange = (index: number, key: keyof BomRowInput, value: string) => {
    setRows((prev) => {
      const copy = [...prev];
      const next = { ...copy[index], [key]: value };
      if (key === "componentProductId" && !next.unit) {
        const matched = productById.get(Number(value));
        if (matched?.unit) next.unit = matched.unit;
      }
      copy[index] = next;
      return copy;
    });
  };

  const buildItemsPayload = (): BOMItemCreate[] => {
    return rows
      .filter((r) => r.componentProductId)
      .map((r) => ({
        component_product_id: Number(r.componentProductId),
        quantity: Number(r.quantity),
        unit: r.unit || undefined,
        wastage_percent: Number(r.wastagePercent || "0"),
      }));
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!finishedProductId) {
      setFormError("Finished product is required.");
      return;
    }
    if (!validate()) return;
    setSaving(true);
    try {
      const created = await createBOM(companyId, {
        product_id: Number(finishedProductId),
        version: version ? Number(version) : undefined,
        batch_size: fgBatchQty.trim() ? Number(fgBatchQty) : null,
        items: buildItemsPayload(),
        ...(warehouseId ? { warehouse_id: Number(warehouseId) } : {}),
        ...(departmentId ? { department_id: Number(departmentId) } : {}),
        ...(projectId ? { project_id: Number(projectId) } : {}),
        ...(segmentId ? { segment_id: Number(segmentId) } : {}),
        ...(effectiveFromLocal ? { effective_from: new Date(effectiveFromLocal).toISOString() } : {}),
        ...(effectiveToLocal ? { effective_to: new Date(effectiveToLocal).toISOString() } : {}),
      });
      setActiveBom(created);
      setVersion(String(created.version ?? ""));
      showToast({
        title: "BOM created",
        description: `Created BOM #${created.id} successfully.`,
        variant: "success",
      });
    } catch (error) {
      const msg = getFriendlyBomError(error);
      setFormError(msg);
      showToast({ title: "Create failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!activeBom) return;
    if (!validate()) return;
    setSaving(true);
    try {
      const updated = await updateBOM(companyId, activeBom.id, {
        version: version ? Number(version) : undefined,
        batch_size: fgBatchQty.trim() ? Number(fgBatchQty) : null,
        items: buildItemsPayload(),
        ...(warehouseId ? { warehouse_id: Number(warehouseId) } : {}),
        department_id: departmentId ? Number(departmentId) : null,
        project_id: projectId ? Number(projectId) : null,
        segment_id: segmentId ? Number(segmentId) : null,
        ...(effectiveFromLocal ? { effective_from: new Date(effectiveFromLocal).toISOString() } : {}),
        ...(effectiveToLocal ? { effective_to: new Date(effectiveToLocal).toISOString() } : {}),
      });
      setActiveBom(updated);
      setVersion(String(updated.version ?? ""));
      showToast({ title: "BOM updated", description: `Updated BOM #${updated.id}.`, variant: "success" });
    } catch (error) {
      const msg = getFriendlyBomError(error);
      setFormError(msg);
      showToast({ title: "Update failed", description: msg, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeBom) return;
    setDeleting(true);
    try {
      await deleteBOM(companyId, activeBom.id);
      showToast({ title: "BOM deleted", description: `Deleted BOM #${activeBom.id}.`, variant: "success" });
      setConfirmDeleteOpen(false);
      resetForNew();
    } catch (error) {
      showToast({
        title: "Delete failed",
        description: getFriendlyBomError(error),
        variant: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  const handleQuickCreateSuccess = async (newItemId: number) => {
    await mutateProducts();
    if (quickCreateType === "FINISHED_PRODUCT") {
      setFinishedProductId(String(newItemId));
      setActiveBom(null);
      setFormError(null);
    } else if (quickCreateType === "COMPONENT" && quickCreateRowIndex !== null) {
      handleRowChange(quickCreateRowIndex, "componentProductId", String(newItemId));
    }
  };

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="BOM Management"
        subtitle="Create, review, and maintain bill of materials with clearer costing and component controls."
        actions={
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Back
          </Button>
        }
        closeLink={`/companies/${companyId}`}
      />

      <form onSubmit={handleCreate} className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Finished product</label>
            <div className="flex items-end gap-1">
              <div className="flex-1">
                <SearchableSelect
                  options={productOptions}
                  value={finishedProductId}
                  onChange={(v) => {
                    setFinishedProductId(v);
                    setActiveBom(null);
                    setFormError(null);
                  }}
                  placeholder="Select finished product"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                className="px-2"
                title="Create New Finished Product"
                onClick={() => {
                  setQuickCreateType("FINISHED_PRODUCT");
                  setQuickCreateRowIndex(null);
                  setQuickCreateOpen(true);
                }}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </Button>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Version (optional)</label>
            <Input
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1"
              type="number"
              min={1}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">FG Qty (Batch Size)</label>
            <Input
              value={fgBatchQty}
              onChange={(e) => setFgBatchQty(e.target.value)}
              placeholder="e.g. 100"
              type="number"
              min={0}
              step="any"
            />
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">Unit: <strong>{finishedProductUnit}</strong></p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={handleLoadBom} isLoading={loadingBom} disabled={!finishedProductId}>
            Load Existing BOM
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowAdvanced((v) => !v)}>
            {showAdvanced ? "Hide Advanced Options" : "Show Advanced Options"}
          </Button>
        </div>

        {showAdvanced && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Warehouse</label>
                <SearchableSelect
                  options={[{ value: "", label: "Default (Main / first active)" }, ...(warehouses || []).filter((w) => w.is_active !== false).map((w) => ({ value: String(w.id), label: w.name }))]}
                  value={warehouseId}
                  onChange={(v) => {
                    setWarehouseId(v);
                    applyWarehouseDefaults(v);
                  }}
                  placeholder="Default warehouse"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Department</label>
                <SearchableSelect
                  options={[{ value: "", label: "Auto from warehouse" }, ...(departments || []).filter((d) => d.is_active !== false).map((d) => ({ value: String(d.id), label: d.name, sublabel: d.code || undefined }))]}
                  value={departmentId}
                  onChange={setDepartmentId}
                  placeholder="Auto from warehouse"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Project</label>
                <SearchableSelect
                  options={[{ value: "", label: "Auto from warehouse" }, ...(projects || []).filter((p) => p.is_active !== false).map((p) => ({ value: String(p.id), label: p.name, sublabel: p.code || undefined }))]}
                  value={projectId}
                  onChange={setProjectId}
                  placeholder="Auto from warehouse"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Segment</label>
                <SearchableSelect
                  options={[{ value: "", label: "Auto from warehouse" }, ...(segments || []).filter((s) => s.is_active !== false).map((s) => ({ value: String(s.id), label: s.name, sublabel: s.code || undefined }))]}
                  value={segmentId}
                  onChange={setSegmentId}
                  placeholder="Auto from warehouse"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">
                  Load BOM as-of (optional, date UTC)
                </label>
                <Input type="date" value={asOfForLoad} onChange={(e) => setAsOfForLoad(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Effective from</label>
                <Input
                  type="datetime-local"
                  value={effectiveFromLocal}
                  onChange={(e) => setEffectiveFromLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Effective to</label>
                <Input type="datetime-local" value={effectiveToLocal} onChange={(e) => setEffectiveToLocal(e.target.value)} />
              </div>
            </div>
          </div>
        )}

        {formError && <p className="text-xs text-critical-600">{formError}</p>}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Components</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setRows((prev) => [...prev, { ...INITIAL_ROW }])}>
              Add Row
            </Button>
          </div>

          {rows.map((row, index) => (
            <div key={`bom-row-${index}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-3 space-y-2">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                <div className="md:col-span-4 flex items-end gap-1">
                  <div className="flex-1">
                    <SearchableSelect
                      options={productOptions}
                      value={row.componentProductId}
                      onChange={(v) => handleRowChange(index, "componentProductId", v)}
                      placeholder="Component product"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="px-2"
                    title="Create New Component"
                    onClick={() => {
                      setQuickCreateType("COMPONENT");
                      setQuickCreateRowIndex(index);
                      setQuickCreateOpen(true);
                    }}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                  </Button>
                </div>
                <div className="md:col-span-2">
                  <Input
                    placeholder="Quantity"
                    value={row.quantity}
                    type="number"
                    min={0}
                    step="any"
                    onChange={(e) => handleRowChange(index, "quantity", e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    placeholder="Unit"
                    value={row.unit}
                    onChange={(e) => handleRowChange(index, "unit", e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Input
                    placeholder="Wastage %"
                    value={row.wastagePercent}
                    type="number"
                    min={0}
                    step="any"
                    onChange={(e) => handleRowChange(index, "wastagePercent", e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Button type="button" variant="ghost" onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))} disabled={rows.length <= 1}>
                    Remove
                  </Button>
                </div>
              </div>
              {rowErrors[index]?.length ? (
                <ul className="text-xs text-critical-600 space-y-1">
                  {rowErrors[index].map((err) => (
                    <li key={err}>{err}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700 pt-3">
          <div className="flex flex-wrap gap-2">
            <Button type="submit" isLoading={saving}>
              Save as New BOM
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleUpdate}
              disabled={!activeBom || saving}
              isLoading={saving}
            >
              Update Current BOM
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="ghost" onClick={resetForNew} disabled={saving || deleting}>
              Reset Form
            </Button>
            <Button type="button" variant="danger" onClick={() => setConfirmDeleteOpen(true)} disabled={!activeBom || deleting}>
              Delete BOM
            </Button>
          </div>
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Current BOM ID: <strong>{activeBom?.id ?? "-"}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Estimated Cost: <strong>{activeBom?.estimated_cost ?? 0}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Version: <strong>{activeBom?.version ?? "-"}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            FG Qty / Unit: <strong>{fgBatchQty || activeBom?.batch_size || "-"}</strong> <strong>{finishedProductUnit}</strong>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
          {(activeBom?.effective_from || activeBom?.effective_to) && (
            <span>
              Effective: <strong>{activeBom?.effective_from || "-"}</strong> to <strong>{activeBom?.effective_to || "open"}</strong>
            </span>
          )}
        </div>
        <Table>
          <THead>
            <TR>
              <TH>Component</TH>
              <TH className="text-right">Quantity</TH>
              <TH className="text-right">Qty + Wastage</TH>
              <TH>Unit</TH>
              <TH className="text-right">Wastage %</TH>
              <TH className="text-right">Rate</TH>
              <TH className="text-right">Line Cost</TH>
            </TR>
          </THead>
          <TBody>
            {componentSummaryRows.length ? (
              componentSummaryRows.map((row) => (
                <TR key={row.key}>
                  <TD>{row.name}</TD>
                  <TD className="text-right">{row.qty}</TD>
                  <TD className="text-right">{row.grossQty.toFixed(3)}</TD>
                  <TD>{row.unit || "-"}</TD>
                  <TD className="text-right">{row.wastage}</TD>
                  <TD className="text-right">{row.rate.toFixed(2)}</TD>
                  <TD className="text-right">{row.lineCost.toFixed(2)}</TD>
                </TR>
              ))
            ) : (
              <TR>
                <TD colSpan={7} className="text-center text-slate-500">No components added yet.</TD>
              </TR>
            )}
          </TBody>
        </Table>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-2 text-xs">
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Total Component Qty: <strong>{totals.totalQty.toFixed(3)}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Avg Wastage %: <strong>{totals.avgWaste.toFixed(2)}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Est. Material Cost: <strong>{totals.estimatedMaterialCost.toFixed(2)}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            Est. Material Cost (With Wastage): <strong>{totals.estimatedMaterialCostWithWastage.toFixed(2)}</strong>
          </div>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/30 p-2">
            FG Per Unit Cost (Material): <strong>{totals.estimatedFgPerUnitMaterialCost.toFixed(4)}</strong>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title="Delete BOM?"
        description="This action permanently removes the current BOM."
        confirmLabel="Delete"
        cancelLabel="Cancel"
        isConfirming={deleting}
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
      />

      <QuickItemModal
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        companyId={companyId}
        onSuccess={handleQuickCreateSuccess}
        type={quickCreateType}
      />
    </div>
  );
}
