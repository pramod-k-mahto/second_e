"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import {
  api,
  cancelProductionOrder,
  completeProductionOrder,
  createProductionOrder,
  getApiErrorMessage,
  getBOMByProduct,
  getProductionOrder,
  getStockSummary,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/Table";
import type { BOMRead, ProductionOrderCreate, ProductionOrderRead } from "@/types/production";

type ProductLite = {
  id: number;
  name: string;
  code?: string | null;
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
type ProductionStatusMode = "COMPLETED" | "DRAFT" | "RELEASED";
type NullableString = string | null;
type NullableProductionOrder = ProductionOrderRead | null;
type NullableBomRead = BOMRead | null;

const fetcher = (url: string) => api.get(url).then((res) => res.data);

function friendlyProductionError(error: unknown): string {
  const msg = getApiErrorMessage(error);
  const lower = msg.toLowerCase();
  if (lower.includes("insufficient stock")) return "Insufficient stock for one or more BOM components.";
  if (lower.includes("missing bom")) return "No BOM found for this finished product.";
  if (lower.includes("invalid qty")) return "Please enter a valid production quantity.";
  return msg;
}

export function ProductionOrderPage({ companyId }: { companyId: string }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<NullableString>(null);
  const [currentOrder, setCurrentOrder] = useState<NullableProductionOrder>(null);
  const [lookupOrderId, setLookupOrderId] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<NullableString>(null);
  const [bomPreview, setBomPreview] = useState<NullableBomRead>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [warehouseId, setWarehouseId] = useState("");
  const [bomAsOf, setBomAsOf] = useState("");
  const [expandSub, setExpandSub] = useState(false);
  const [statusMode, setStatusMode] = useState<ProductionStatusMode>("COMPLETED");
  const [actionLoading, setActionLoading] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [projectId, setProjectId] = useState("");
  const [segmentId, setSegmentId] = useState("");

  const { data: products } = useSWR<ProductLiteList>(
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

  const { data: stockRows } = useSWR(
    companyId ? ["stock-summary-production", companyId] : null,
    () => getStockSummary(companyId)
  );

  useEffect(() => {
    if (!productId) {
      setBomPreview(null);
      return;
    }
    let cancelled = false;
    const asOf = bomAsOf.trim() || undefined;
    getBOMByProduct(companyId, Number(productId), asOf ? { as_of: asOf } : undefined)
      .then((bom) => {
        if (!cancelled) setBomPreview(bom);
      })
      .catch(() => {
        if (!cancelled) setBomPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId, productId, bomAsOf]);

  const productOptions = useMemo(
    () =>
      (products || []).map((p) => ({
        value: String(p.id),
        label: p.name,
        sublabel: p.code || undefined,
      })),
    [products]
  );

  const warehouseOptions = useMemo(
    () => [
      { value: "", label: "Default (Main / first active)", sublabel: undefined as string | undefined },
      ...(warehouses || [])
        .filter((w) => w.is_active !== false)
        .map((w) => ({
          value: String(w.id),
          label: w.name,
          sublabel: undefined as string | undefined,
        })),
    ],
    [warehouses]
  );
  const warehouseById = useMemo(() => {
    const map = new Map<number, WarehouseLite>();
    (warehouses || []).forEach((w) => map.set(Number(w.id), w));
    return map;
  }, [warehouses]);

  const productNameById = useMemo(() => {
    const map = new Map<number, string>();
    (products || []).forEach((p) => map.set(Number(p.id), p.name));
    return map;
  }, [products]);

  const stockByProductId = useMemo(() => {
    const map = new Map<number, number>();
    (stockRows || []).forEach((row) => map.set(Number(row.product_id), Number(row.qty_on_hand ?? 0)));
    return map;
  }, [stockRows]);

  const onSubmitCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (!productId) {
      setCreateError("Finished product is required.");
      return;
    }
    const qty = Number(quantity);
    if (!(qty > 0)) {
      setCreateError("Quantity must be greater than 0.");
      return;
    }
    setCreating(true);
    try {
      const payload: ProductionOrderCreate = {
        product_id: Number(productId),
        quantity: qty,
      };
      if (warehouseId) payload.warehouse_id = Number(warehouseId);
      if (departmentId) payload.department_id = Number(departmentId);
      if (projectId) payload.project_id = Number(projectId);
      if (segmentId) payload.segment_id = Number(segmentId);
      if (bomAsOf.trim()) payload.bom_as_of = bomAsOf.trim();
      if (expandSub) payload.expand_sub_assemblies = true;
      if (statusMode !== "COMPLETED") payload.status = statusMode;

      const order = await createProductionOrder(companyId, payload);
      setCurrentOrder(order);
      showToast({
        title: "Production order created",
        description:
          order.status === "COMPLETED"
            ? `Order #${order.id} completed and stock posted.`
            : `Order #${order.id} saved as ${order.status}. Use Complete when ready to consume stock.`,
        variant: "success",
      });
    } catch (error) {
      const msg = friendlyProductionError(error);
      setCreateError(msg);
      showToast({ title: "Create failed", description: msg, variant: "error" });
    } finally {
      setCreating(false);
    }
  };

  const onFetchOrder = async () => {
    setLookupError(null);
    const id = Number(lookupOrderId);
    if (!(id > 0)) {
      setLookupError("Enter a valid production order ID.");
      return;
    }
    setLookupLoading(true);
    try {
      const order = await getProductionOrder(companyId, id);
      setCurrentOrder(order);
    } catch (error) {
      const msg = getApiErrorMessage(error);
      setLookupError(msg);
      showToast({ title: "Fetch failed", description: msg, variant: "error" });
    } finally {
      setLookupLoading(false);
    }
  };

  const onCompleteOrder = async () => {
    if (!currentOrder) return;
    setActionLoading(true);
    try {
      const order = await completeProductionOrder(companyId, currentOrder.id);
      setCurrentOrder(order);
      showToast({ title: "Production completed", description: `Order #${order.id} posted to stock.`, variant: "success" });
    } catch (error) {
      const msg = getApiErrorMessage(error);
      showToast({ title: "Complete failed", description: msg, variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const onCancelOrder = async () => {
    if (!currentOrder) return;
    setActionLoading(true);
    try {
      const order = await cancelProductionOrder(companyId, currentOrder.id);
      setCurrentOrder(order);
      showToast({ title: "Order cancelled", description: `Order #${order.id} marked CANCELLED.`, variant: "success" });
    } catch (error) {
      const msg = getApiErrorMessage(error);
      showToast({ title: "Cancel failed", description: msg, variant: "error" });
    } finally {
      setActionLoading(false);
    }
  };

  const canCompleteOrCancel =
    currentOrder && (currentOrder.status === "DRAFT" || currentOrder.status === "RELEASED");

  return (
    <div className="space-y-6 max-w-6xl">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Production Orders</h1>
            <p className="text-xs text-slate-500 mt-1">
              Create production orders (immediate complete by default), or save as Draft / Released and complete later.
              Advanced options control warehouse, BOM effective date, and multi-level explosion.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M17 10a1 1 0 01-1 1H6.414l3.293 3.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L6.414 9H16a1 1 0 011 1z" clipRule="evenodd" />
              </svg>
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push(`/companies/${companyId}`)}>
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Close
            </Button>
          </div>
        </div>
      </div>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Create Production Order</h2>
        <form onSubmit={onSubmitCreate} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Finished product</label>
              <SearchableSelect
                options={productOptions}
                value={productId}
                onChange={(value) => setProductId(value)}
                placeholder="Select product"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Quantity</label>
              <Input
                type="number"
                min={0}
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter quantity"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Initial status</label>
              <select
                className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
                value={statusMode}
                onChange={(e) => setStatusMode(e.target.value as ProductionStatusMode)}
              >
                <option value="COMPLETED">Complete immediately (default)</option>
                <option value="DRAFT">Draft (no stock until Complete)</option>
                <option value="RELEASED">Released (no stock until Complete)</option>
              </select>
            </div>
          </div>

          <button
            type="button"
            className="text-xs text-primary-600 hover:underline"
            onClick={() => setShowAdvanced((v) => !v)}
          >
            {showAdvanced ? "Hide advanced options" : "Show advanced options"}
          </button>

          {showAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 rounded-lg border border-slate-100 dark:border-slate-700 p-3">
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Warehouse</label>
                <SearchableSelect
                  options={warehouseOptions}
                  value={warehouseId}
                  onChange={(v) => {
                    setWarehouseId(v);
                    const selected = warehouseById.get(Number(v));
                    if (selected) {
                      setDepartmentId(selected.department_id != null ? String(selected.department_id) : "");
                      setProjectId(selected.project_id != null ? String(selected.project_id) : "");
                      setSegmentId(selected.segment_id != null ? String(selected.segment_id) : "");
                    }
                  }}
                  placeholder="Default warehouse"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">
                  BOM as-of (date, UTC)
                </label>
                <Input type="date" value={bomAsOf} onChange={(e) => setBomAsOf(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 md:col-span-2">
                <input
                  type="checkbox"
                  checked={expandSub}
                  onChange={(e) => setExpandSub(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Expand sub-assemblies (consume leaf components when a component has its own BOM)
              </label>
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
          )}

          <div className="flex items-end">
            <Button type="submit" isLoading={creating} disabled={creating}>
              Create Order
            </Button>
          </div>
          {createError && <p className="text-xs text-critical-600">{createError}</p>}
        </form>

        {bomPreview && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">BOM Preview</h3>
            <p className="text-xs text-slate-500 mb-2">
              BOM #{bomPreview.id}, v{bomPreview.version}
              {bomPreview.effective_from || bomPreview.effective_to
                ? ` (effective ${bomPreview.effective_from || "-"} to ${bomPreview.effective_to || "open"})`
                : ""}
              , estimated cost: {bomPreview.estimated_cost}
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Component Product ID</TH>
                  <TH className="text-right">Quantity</TH>
                  <TH>Unit</TH>
                  <TH className="text-right">Wastage %</TH>
                </TR>
              </THead>
              <TBody>
                {bomPreview.items.map((item) => (
                  <TR key={item.id}>
                    <TD>{item.component_product_id}</TD>
                    <TD className="text-right">{item.quantity}</TD>
                    <TD>{item.unit || "-"}</TD>
                    <TD className="text-right">{item.wastage_percent}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">Current Stock Summary</h3>
          <Table>
            <THead>
              <TR>
                <TH>Product</TH>
                <TH>Product ID</TH>
                <TH className="text-right">Qty on Hand</TH>
              </TR>
            </THead>
            <TBody>
              {Array.from(stockByProductId.entries())
                .slice(0, 20)
                .map(([id, qty]) => (
                  <TR key={id}>
                    <TD>{productNameById.get(id) || "-"}</TD>
                    <TD>{id}</TD>
                    <TD className="text-right">{qty}</TD>
                  </TR>
                ))}
              {stockByProductId.size === 0 && (
                <TR>
                  <TD colSpan={3} className="text-center text-slate-500">
                    No stock summary available.
                  </TD>
                </TR>
              )}
            </TBody>
          </Table>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Fetch Existing Order</h2>
        <div className="flex items-end gap-2">
          <div className="w-64">
            <label className="block text-xs font-medium mb-1 text-slate-600 dark:text-slate-300">Production order ID</label>
            <Input
              value={lookupOrderId}
              onChange={(e) => setLookupOrderId(e.target.value)}
              type="number"
              min={1}
            />
          </div>
          <Button type="button" variant="outline" onClick={onFetchOrder} isLoading={lookupLoading}>
            Fetch Order
          </Button>
        </div>
        {lookupError && <p className="text-xs text-critical-600">{lookupError}</p>}

        {currentOrder && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-700 dark:text-slate-300">
              <span>
                ID: <strong>{currentOrder.id}</strong>
              </span>
              <span>
                Status: <strong>{currentOrder.status}</strong>
              </span>
              <span>
                Created: <strong>{currentOrder.created_at}</strong>
              </span>
              <span>
                Produced Qty: <strong>{currentOrder.produced_qty}</strong>
              </span>
              {currentOrder.warehouse_id != null && currentOrder.warehouse_id !== undefined && (
                <span>
                  Warehouse ID: <strong>{currentOrder.warehouse_id}</strong>
                </span>
              )}
              {(currentOrder.department_id != null || currentOrder.project_id != null || currentOrder.segment_id != null) && (
                <span>
                  Cost centers: <strong>D:{currentOrder.department_id ?? "-"} / P:{currentOrder.project_id ?? "-"} / S:{currentOrder.segment_id ?? "-"}</strong>
                </span>
              )}
              {currentOrder.bom_id != null && (
                <span>
                  BOM ID: <strong>{currentOrder.bom_id}</strong>
                </span>
              )}
              {currentOrder.voucher_id != null && (
                <span>
                  Voucher ID: <strong>{currentOrder.voucher_id}</strong>
                </span>
              )}
              {currentOrder.voucher_number && (
                <span>
                  Voucher No: <strong>{currentOrder.voucher_number}</strong>
                </span>
              )}
              {currentOrder.bom_as_of && (
                <span>
                  BOM as-of: <strong>{currentOrder.bom_as_of}</strong>
                </span>
              )}
              {currentOrder.expand_sub_assemblies && (
                <span>
                  Exploded: <strong>yes</strong>
                </span>
              )}
            </div>
            {(currentOrder.actual_material_cost != null || currentOrder.standard_material_cost != null) && (
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Material cost (actual): <strong>{Number(currentOrder.actual_material_cost ?? 0).toFixed(2)}</strong>
                {" | "}
                Standard extended: <strong>{Number(currentOrder.standard_material_cost ?? 0).toFixed(2)}</strong>
              </p>
            )}
            {canCompleteOrCancel && (
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={onCompleteOrder} isLoading={actionLoading}>
                  Complete and post stock
                </Button>
                <Button type="button" variant="outline" onClick={onCancelOrder} isLoading={actionLoading}>
                  Cancel order
                </Button>
              </div>
            )}
            <Table>
              <THead>
                <TR>
                  <TH>Item</TH>
                  <TH>Item ID</TH>
                  <TH className="text-right">Consumed Qty</TH>
                </TR>
              </THead>
              <TBody>
                {currentOrder.items.map((item) => (
                  <TR key={item.id}>
                    <TD>{productNameById.get(item.product_id) || "-"}</TD>
                    <TD>{item.product_id}</TD>
                    <TD className="text-right">{item.consumed_qty}</TD>
                  </TR>
                ))}
                {currentOrder.items.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="text-center text-slate-500">
                      No consumption lines yet (draft / released orders post on Complete).
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
