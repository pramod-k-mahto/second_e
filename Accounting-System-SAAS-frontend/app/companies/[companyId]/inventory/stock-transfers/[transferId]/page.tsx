"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { getStockSummary, type StockSummaryRow } from "@/lib/api/inventory";
import {
  getStockTransfer,
  updateStockTransfer,
  postStockTransfer,
  deleteStockTransfer,
  type StockTransferDetail,
  type CreateOrUpdateStockTransferPayload,
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

export default function StockTransferDetailPage() {

  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const transferId = Number(params?.transferId as string);

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
  const canEditOrPost =
    transfersAccessLevel === "update" || transfersAccessLevel === "full";
  const canDelete = transfersAccessLevel === "full";

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


  const {
    data: detail,
    error,
    isValidating,
    mutate,
  } = useSWR<StockTransferDetail>(
    companyId && transferId
      ? ["stock-transfer-detail", companyId, transferId]
      : null,
    async () => {
      if (!companyId || !transferId) throw new Error("Missing identifiers");
      return await getStockTransfer(Number(companyId), transferId);
    }
  );

  type LineInput = {
    id?: number;
    itemId: string;
    unit: string;
    quantity: string;
  };

  const [editing, setEditing] = useState(false);
  const [transferDate, setTransferDate] = useState<string>("");
  const [fromWarehouseId, setFromWarehouseId] = useState<string>("");
  const [toWarehouseId, setToWarehouseId] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");
  const [lines, setLines] = useState<LineInput[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  const isDraft = detail?.header.status === "DRAFT";

  const initFromDetail = (d: StockTransferDetail) => {
    setTransferDate(d.header.transferDate || "");
    setFromWarehouseId(String(d.header.fromWarehouseId || ""));
    setToWarehouseId(String(d.header.toWarehouseId || ""));
    setRemarks(d.header.remarks || "");
    setLines(
      (d.lines || []).map((l) => ({
        id: l.id,
        itemId: String(l.itemId),
        // normalize unit so it never shows undefined in the UI
        unit: l.unit || "pcs",
        quantity: l.quantity,
      }))
    );
  };

  if (detail && lines.length === 0 && !editing) {
    initFromDetail(detail);
  }

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
    if (!detail) return;
    if (!isDraft || !canEditOrPost) {
      setSubmitError("You cannot edit this transfer.");
      return;
    }

    const validationError = validate();
    if (validationError) {
      setSubmitError(validationError);
      return;
    }

    setSubmitting(true);
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
      await updateStockTransfer(Number(companyId), transferId, payload);
      await mutate();
      setEditing(false);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.message ||
        data?.detail ||
        data?.error ||
        "Failed to update stock transfer.";
      setSubmitError(typeof msg === "string" ? msg : "Failed to update stock transfer.");
    } finally {
      setSubmitting(false);
    }
  };

  const handlePost = async () => {
    if (!detail || !isDraft || !canEditOrPost) return;
    if (!companyId) return;
    if (!confirm("Post this stock transfer? This will move stock between warehouses."))
      return;

    setPosting(true);
    setSubmitError(null);
    try {
      await postStockTransfer(Number(companyId), transferId);
      await mutate();
      setEditing(false);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.message ||
        data?.detail ||
        data?.error ||
        "Failed to post stock transfer.";
      setSubmitError(typeof msg === "string" ? msg : "Failed to post stock transfer.");
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async () => {
    if (!detail || !canDelete || !isDraft) return;
    if (!companyId) return;
    if (!confirm("Delete this DRAFT stock transfer? This cannot be undone."))
      return;

    setDeleting(true);
    setSubmitError(null);
    try {
      await deleteStockTransfer(Number(companyId), transferId);
      router.replace(`/companies/${companyId}/inventory/stock-transfers`);
    } catch (err: any) {
      const data = err?.response?.data;
      const msg =
        data?.message ||
        data?.detail ||
        data?.error ||
        "Failed to delete stock transfer.";
      setSubmitError(typeof msg === "string" ? msg : "Failed to delete stock transfer.");
    } finally {
      setDeleting(false);
    }
  };

  const findWarehouseName = (id: number | null | undefined) => {
    if (!id || !warehouses) return "";
    const w = warehouses.find((wh) => wh.id === id);
    return w ? w.name : String(id);
  };

  const findItemName = (id: number) => {
    if (!items) return String(id);
    const it = items.find((x) => x.id === id);
    if (!it) return String(id);
    return it.code ? `${it.code} - ${it.name}` : it.name;
  };

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Stock Transfer</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1 rounded border border-slate-300 text-xs"
          >
            Close
          </button>
        </div>
        <div className="text-sm text-red-600">Failed to load stock transfer.</div>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Stock Transfer</h1>
          <button
            type="button"
            onClick={() => router.back()}
            className="px-3 py-1 rounded border border-slate-300 text-xs"
          >
            Close
          </button>
        </div>
        <div className="text-sm text-slate-500">
          {isValidating ? "Loading..." : "No data."}
        </div>
      </div>
    );
  }

  const header = detail.header;

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
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Stock Transfer {header?.transferNumber ? `#${header.transferNumber}` : ''}</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                View, edit, or post inventory stock transfers.
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
            {isDraft && canEditOrPost && (
              <button
                type="button"
                onClick={() => {
                  if (!editing) initFromDetail(detail);
                  setEditing((v) => !v);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                {editing ? "Cancel Edit" : "Edit"}
              </button>
            )}
            {isDraft && canEditOrPost && (
              <button
                type="button"
                disabled={posting}
                onClick={handlePost}
                className="px-3 py-1.5 rounded-lg border border-transparent bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60"
              >
                {posting ? "Posting…" : "Post"}
              </button>
            )}
            {isDraft && canDelete && (
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60"
              >
                {deleting ? "Deleting…" : "Delete"}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm space-y-4">
        {submitError && (
          <div className="text-sm text-red-600 mb-2">{submitError}</div>
        )}

        {!editing ? (
          <>
            <div className="grid md:grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500">Transfer No.</div>
                <div className="font-medium">{header.transferNumber}</div>
              </div>
              <div>
                <div className="text-slate-500">Date</div>
                <div className="font-medium">{header.transferDate}</div>
              </div>
              <div>
                <div className="text-slate-500">Status</div>
                <div className="font-medium">{header.status}</div>
              </div>
              <div>
                <div className="text-slate-500">From warehouse</div>
                <div className="font-medium">
                  {findWarehouseName(header.fromWarehouseId)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">To warehouse</div>
                <div className="font-medium">
                  {findWarehouseName(header.toWarehouseId)}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Remarks</div>
                <div className="font-medium">{header.remarks || ""}</div>
              </div>
              {header.voucherNumber && (
                <div>
                  <div className="text-slate-500">Voucher</div>
                  <div className="font-medium">
                    <button
                      type="button"
                      onClick={() => router.push(`/companies/${companyId}/vouchers/${header.voucherId}`)}
                      className="text-blue-600 hover:outline-none hover:underline"
                    >
                      {header.voucherNumber}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border rounded mt-4">
              <div className="px-3 py-2 border-b text-[11px] text-slate-600">
                Lines
              </div>
              <div className="max-h-80 overflow-y-auto">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left py-1 px-2">Item</th>
                      <th className="text-left py-1 px-2">Unit</th>
                      <th className="text-left py-1 px-2">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines.map((l) => (
                      <tr key={l.id} className="border-b last:border-none">
                        <td className="py-1 px-2">
                          {findItemName(l.itemId)}
                        </td>
                        {/* fallback to 'pcs' if unit is missing or invalid */}
                        <td className="py-1 px-2">{l.unit || "pcs"}</td>
                        <td className="py-1 px-2 text-right">{l.quantity}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 text-sm">
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
                                const available =
                                  stockByItemId[Number(line.itemId)] ?? 0;
                                const requested = Number(line.quantity || "0");
                                const over =
                                  requested > available && available > 0;
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
                disabled={submitting || !canEditOrPost}
                className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Save Changes"}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (detail) initFromDetail(detail);
                  setEditing(false);
                }}
                className="px-4 py-2 rounded border border-slate-300 text-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
