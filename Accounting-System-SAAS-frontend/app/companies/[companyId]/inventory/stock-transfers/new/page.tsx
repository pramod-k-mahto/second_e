"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getStockSummary, type StockSummaryRow } from "@/lib/api/inventory";
import {
  createStockTransfer,
  type CreateOrUpdateStockTransferPayload,
  type StockTransferStatus,
} from "@/lib/api/stockTransfers";
import { getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { Input } from "@/components/ui/Input";


const fetcher = (url: string) => api.get(url).then((res) => res.data);

type MenuAccessLevel = "deny" | "read" | "update" | "full";

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
};

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

type Warehouse = {
  id: number;
  name: string;
};

type Item = {
  id: number;
  name: string;
  code?: string | null;
  unit?: string | null;
};

type Company = {
  id: number;
  name: string;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
  calendar_mode?: "AD" | "BS";
};

export default function NewStockTransferPage() {

  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const asOnDate = new Date().toISOString().slice(0, 10);

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const userRole = (currentUser?.role as string | undefined) || "user";
  const isSuperAdmin = userRole.toLowerCase() === "superadmin";

  const { data: menus } = useSWR<MenuRead[]>(
    companyId ? "/admin/users/menus" : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: userMenuAccess } = useSWR<UserMenuAccessEntry[]>(
    currentUser && companyId
      ? `/admin/users/${currentUser.id}/companies/${companyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const accessLevelByMenuId = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || "full";
      });
    }
    return map;
  }, [userMenuAccess]);

  const accessLevelByCode: Record<string, MenuAccessLevel> = useMemo(() => {
    const map: Record<string, MenuAccessLevel> = {};
    if (menus) {
      menus.forEach((m) => {
        if (!m.code) return;
        const level = accessLevelByMenuId[m.id];
        map[m.code] = level || "full";
      });
    }
    return map;
  }, [menus, accessLevelByMenuId]);

  const getAccessLevel = (menuCode: string): MenuAccessLevel => {
    if (isSuperAdmin) return "full";
    return accessLevelByCode[menuCode] ?? "full";
  };

  const transfersAccessLevel = getAccessLevel("inventory.stock_transfers");
  const canCreate = transfersAccessLevel === "update" || transfersAccessLevel === "full";

  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const { calendarMode, displayMode: calendarDisplayMode, reportMode } = useCalendarSettings();

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const { data: items } = useSWR<Item[]>(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );


  type LineInput = {
    itemId: string;
    unit: string;
    quantity: string;
  };

  const [transferDate, setTransferDate] = useState<string>(smartTo);

  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [lines, setLines] = useState<LineInput[]>([
    { itemId: "", unit: "", quantity: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { data: stockRows } = useSWR<StockSummaryRow[]>(
    companyId && fromWarehouseId ? ["stock-summary", companyId, asOnDate] : null,
    async () => {
      if (!companyId) throw new Error("Missing companyId");
      return await getStockSummary(Number(companyId), asOnDate);
    }
  );

  const stockByItemId = useMemo(() => {
    const map: Record<number, number> = {};
    if (!stockRows) return map;
    stockRows.forEach((row) => {
      map[Number(row.item_id)] = Number(row.quantity_on_hand ?? 0);
    });
    return map;
  }, [stockRows]);

  const handleLineChange = (
    index: number,
    field: keyof LineInput,
    value: string
  ) => {
    setLines((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], [field]: value };
      if (field === "itemId") {
        const item = items?.find((it) => String(it.id) === value);
        if (item && !copy[index].unit) {
          copy[index].unit = item.unit || "pcs";
        }
      }
      return copy;
    });
  };

  const addLine = () => {
    setLines((prev) => [...prev, { itemId: "", unit: "", quantity: "" }]);
  };

  const removeLine = (index: number) => {
    setLines((prev) => prev.filter((_, i) => i !== index));
  };

  const validate = (): string | null => {
    if (!companyId) return "Company is required.";
    if (!transferDate) return "Transfer date is required.";
    if (!fromWarehouseId) return "From warehouse is required.";
    if (!toWarehouseId) return "To warehouse is required.";
    if (fromWarehouseId === toWarehouseId)
      return "From and To warehouses must be different.";
    const activeLines = lines.filter((l) => l.itemId);
    if (activeLines.length === 0) return "Add at least one item line.";
    for (const l of activeLines) {
      const qty = Number(l.quantity || "0");
      if (!(qty > 0)) return "All quantities must be greater than zero.";
      if (fromWarehouseId && l.itemId) {
        const available = stockByItemId[Number(l.itemId)] ?? 0;
        if (qty > available) {
          return "Requested quantity exceeds available stock for at least one item.";
        }
      }
    }
    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canCreate) {
      setSubmitError("You do not have permission to create stock transfers.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
    // Backdate warning
    const todayStr = new Date().toISOString().split('T')[0];
    if (transferDate < todayStr) {
      if (typeof window !== "undefined") {
        const ok = window.confirm(
          `The transfer date (${transferDate}) is a back date (before today, ${todayStr}). Do you want to proceed?`
        );
        if (!ok) {
          setSubmitting(false);
          return;
        }
      }
    }
    setSubmitError(null);

    const payload: CreateOrUpdateStockTransferPayload = {
      transferDate,
      fromWarehouseId: Number(fromWarehouseId),
      toWarehouseId: Number(toWarehouseId),
      remarks: remarks || null,
      lines: lines
        .filter((l) => l.itemId)
        .map((l) => ({
          itemId: Number(l.itemId),
          unit: l.unit || "pcs",
          quantity: l.quantity || "0",
        })),
    };

    try {
      const created = await createStockTransfer(Number(companyId), payload);
      router.replace(
        `/companies/${companyId}/inventory/stock-transfers/${created.header.id}`
      );
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.message ||
        data?.detail ||
        data?.error ||
        "Failed to create stock transfer.";
      setSubmitError(typeof msg === "string" ? msg : "Failed to create stock transfer.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">New Stock Transfer</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Transfer inventory items between warehouses.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm">
        {transfersAccessLevel === "read" && (
          <p className="text-[11px] text-slate-500 mb-2">
            You have read-only access for stock transfers. Creating is disabled.
          </p>
        )}
        {submitError && (
          <div className="text-sm text-red-600 mb-2">{submitError}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid md:grid-cols-3 gap-3">
            <div>
              <label className="block mb-1 text-xs">Transfer date</label>
              <Input
                type="date"
                className="w-full border rounded px-2 py-1 text-xs"
                value={transferDate}
                min={company?.fiscal_year_start || ""}
                max={company?.fiscal_year_end || ""}
                onChange={(e) => setTransferDate(e.target.value)}
                required
              />

            </div>
            <div>
              <label className="block mb-1 text-xs">From warehouse</label>
              <select
                className="w-full border rounded px-2 py-1 text-xs"
                value={fromWarehouseId}
                onChange={(e) => setFromWarehouseId(e.target.value)}
                required
              >
                <option value="">Select warehouse</option>
                {warehouses
                  ?.filter((w) => String(w.id) !== toWarehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs">To warehouse</label>
              <select
                className="w-full border rounded px-2 py-1 text-xs"
                value={toWarehouseId}
                onChange={(e) => setToWarehouseId(e.target.value)}
                required
              >
                <option value="">Select warehouse</option>
                {warehouses
                  ?.filter((w) => String(w.id) !== fromWarehouseId)
                  .map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block mb-1 text-xs">Remarks</label>
            <textarea
              className="w-full border rounded px-2 py-1 text-xs"
              rows={2}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="border rounded">
            <div className="px-3 py-2 border-b flex items-center justify-between text-[11px] text-slate-600">
              <span>Lines</span>
              <button
                type="button"
                onClick={addLine}
                className="px-2 py-1 rounded border border-slate-300 text-[11px]"
              >
                + Add line
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b bg-slate-50">
                    <th className="text-left py-1 px-2">Item</th>
                    <th className="text-left py-1 px-2">Unit</th>
                    <th className="text-left py-1 px-2">Quantity</th>
                    <th className="text-left py-1 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx} className="border-b last:border-none">
                      <td className="py-1 px-2 min-w-[200px]">
                        <select
                          className="w-full border rounded px-2 py-1 text-xs"
                          value={line.itemId}
                          onChange={(e) =>
                            handleLineChange(idx, "itemId", e.target.value)
                          }
                        >
                          <option value="">Select item</option>
                          {items?.map((it) => (
                            <option key={it.id} value={it.id}>
                              {it.code ? `${it.code} - ${it.name}` : it.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-1 px-2 w-28">
                        <input
                          className="w-full border rounded px-2 py-1 text-xs"
                          value={line.unit}
                          onChange={(e) =>
                            handleLineChange(idx, "unit", e.target.value)
                          }
                        />
                      </td>
                      <td className="py-1 px-2 w-28">
                        <div className="space-y-0.5">
                          <input
                            type="number"
                            step="0.000001"
                            min="0"
                            className="w-full border rounded px-2 py-1 text-xs text-right"
                            value={line.quantity}
                            onChange={(e) =>
                              handleLineChange(idx, "quantity", e.target.value)
                            }
                          />
                          {fromWarehouseId && line.itemId && (
                            (() => {
                              const available = stockByItemId[Number(line.itemId)] ?? 0;
                              const requested = Number(line.quantity || "0");
                              const over = requested > available && available > 0;
                              return (
                                <div
                                  className={
                                    "text-[10px] mt-0.5 " +
                                    (over
                                      ? "text-red-600"
                                      : "text-slate-500")
                                  }
                                >
                                  Available in source: {available}
                                  {over &&
                                    ` - requested ${requested} is more than available`}
                                </div>
                              );
                            })()
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-2 text-right">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(idx)}
                            className="px-2 py-1 rounded border border-red-300 text-red-700 text-[11px]"
                          >
                            Remove
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting || !canCreate}
              className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Save as Draft"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}/inventory/stock-transfers`)}
              className="px-4 py-2 rounded border border-slate-300 text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
