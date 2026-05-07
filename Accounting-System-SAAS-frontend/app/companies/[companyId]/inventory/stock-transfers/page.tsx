"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import {
  listStockTransfers,
  type StockTransferHeader,
  type StockTransferListFilters,
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

type StockTransferListData = {
  data: StockTransferHeader[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

type Company = {
  id: number;
  name: string;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
  calendar_mode?: "AD" | "BS";
};

export default function StockTransfersPage() {

  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;

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
  const canCreateOrEdit =
    transfersAccessLevel === "update" || transfersAccessLevel === "full";

  const { calendarMode, displayMode: calendarDisplayMode, reportMode } = useCalendarSettings();

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR<Company>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const { data: warehouses } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );


  const [page, setPage] = useState(
    Number(searchParams.get("page") || "1") || 1
  );
  const [status, setStatus] = useState<"ALL" | StockTransferStatus>(
    (searchParams.get("status") as any) || "ALL"
  );
  const [fromDate, setFromDate] = useState<string>(
    searchParams.get("fromDate") || smartFrom
  );
  const [toDate, setToDate] = useState<string>(
    searchParams.get("toDate") || smartTo
  );

  const [fromWarehouseId, setFromWarehouseId] = useState<string>(
    searchParams.get("fromWarehouseId") || ""
  );
  const [toWarehouseId, setToWarehouseId] = useState<string>(
    searchParams.get("toWarehouseId") || ""
  );

  const filters: StockTransferListFilters = useMemo(
    () => ({
      page,
      pageSize: 20,
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      fromWarehouseId: fromWarehouseId ? Number(fromWarehouseId) : undefined,
      toWarehouseId: toWarehouseId ? Number(toWarehouseId) : undefined,
      status: status === "ALL" ? undefined : status,
    }),
    [page, status, fromDate, toDate, fromWarehouseId, toWarehouseId]
  );

  const { data: listData, error, isValidating, mutate } = useSWR<StockTransferListData>(
    companyId
      ? ["stock-transfers-list", companyId, filters]
      : null,
    async () => {
      if (!companyId) throw new Error("Missing companyId");
      return await listStockTransfers(Number(companyId), filters);
    }
  );

  const handleCreate = () => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/inventory/stock-transfers/new`);
  };

  const handleRowClick = (t: StockTransferHeader) => {
    if (!companyId) return;
    router.push(
      `/companies/${companyId}/inventory/stock-transfers/${t.id}`
    );
  };

  const handleApplyFilters = () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    if (status && status !== "ALL") params.set("status", status);
    if (fromDate) params.set("fromDate", fromDate);
    if (toDate) params.set("toDate", toDate);
    if (fromWarehouseId) params.set("fromWarehouseId", fromWarehouseId);
    if (toWarehouseId) params.set("toWarehouseId", toWarehouseId);
    router.push(
      `/companies/${companyId}/inventory/stock-transfers?${params.toString()}`
    );
    mutate();
  };

  const handleResetFilters = () => {
    setPage(1);
    setStatus("ALL");
    setFromDate("");
    setToDate("");
    setFromWarehouseId("");
    setToWarehouseId("");
    router.push(`/companies/${companyId}/inventory/stock-transfers`);
  };

  const findWarehouseName = (id: number | null | undefined) => {
    if (!id || !warehouses) return "";
    const w = warehouses.find((wh) => wh.id === id);
    return w ? w.name : String(id);
  };

  return (
    <div className="space-y-6">
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
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Stock Transfers</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage stock transfers across warehouses.
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
            {canCreateOrEdit && (
              <button
                type="button"
                onClick={handleCreate}
                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150"
              >
                New Transfer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm">
        <div className="flex flex-wrap gap-3 mb-4 text-xs items-end">
          <div>
            <label className="block mb-1">From date</label>
            <Input
              type="date"
              className="border rounded px-2 py-1 text-xs"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />

          </div>
          <div>
            <label className="block mb-1">To date</label>
            <Input
              type="date"
              className="border rounded px-2 py-1 text-xs"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />

          </div>
          <div>
            <label className="block mb-1">From warehouse</label>
            <select
              className="border rounded px-2 py-1 text-xs min-w-[140px]"
              value={fromWarehouseId}
              onChange={(e) => setFromWarehouseId(e.target.value)}
            >
              <option value="">All</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">To warehouse</label>
            <select
              className="border rounded px-2 py-1 text-xs min-w-[140px]"
              value={toWarehouseId}
              onChange={(e) => setToWarehouseId(e.target.value)}
            >
              <option value="">All</option>
              {warehouses?.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">Status</label>
            <select
              className="border rounded px-2 py-1 text-xs"
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
            >
              <option value="ALL">All</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApplyFilters}
              className="px-3 py-1 rounded bg-blue-600 text-white text-xs"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3 py-1 rounded border border-slate-300 text-xs"
            >
              Reset
            </button>
          </div>
        </div>

        {error && (
          <div className="text-sm text-red-600 mb-2">
            Failed to load stock transfers.
          </div>
        )}

        {!listData ? (
          <div className="text-sm text-slate-500">
            {isValidating ? "Loading..." : "No data."}
          </div>
        ) : listData.data.length === 0 ? (
          <div className="text-sm text-slate-500">
            No stock transfers found.
          </div>
        ) : (
          <div className="overflow-x-auto text-xs">
            <table className="w-full border text-xs">
              <thead>
                <tr className="bg-slate-100 border-b text-[11px] text-slate-600">
                  <th className="text-left py-1 px-2">Transfer No.</th>
                  <th className="text-left py-1 px-2">Date</th>
                  <th className="text-left py-1 px-2">From</th>
                  <th className="text-left py-1 px-2">To</th>
                  <th className="text-left py-1 px-2">Status</th>
                  <th className="text-left py-1 px-2">Voucher</th>
                  <th className="text-left py-1 px-2">Remarks</th>
                </tr>
              </thead>
              <tbody>
                {listData.data.map((t) => (
                  <tr
                    key={t.id}
                    className="border-b hover:bg-slate-50 cursor-pointer"
                    onClick={() => handleRowClick(t)}
                  >
                    <td className="py-1 px-2 text-xs font-medium">
                      {t.transferNumber}
                    </td>
                    <td className="py-1 px-2 text-xs">{t.transferDate}</td>
                    <td className="py-1 px-2 text-xs">
                      {findWarehouseName(t.fromWarehouseId)}
                    </td>
                    <td className="py-1 px-2 text-xs">
                      {findWarehouseName(t.toWarehouseId)}
                    </td>
                    <td className="py-1 px-2 text-xs">{t.status}</td>
                    <td className="py-1 px-2 text-xs">
                      {t.voucherNumber && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/companies/${companyId}/vouchers/${t.voucherId}`);
                          }}
                          className="text-blue-600 hover:underline"
                        >
                          {t.voucherNumber}
                        </button>
                      )}
                    </td>
                    <td className="py-1 px-2 text-xs text-slate-600">
                      {t.remarks || ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex items-center justify-between mt-3 text-xs">
              <div>
                Page {listData.page} of {listData.totalPages} | Total:
                &nbsp;{listData.totalCount}
              </div>
              <div className="space-x-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
                >
                  Prev
                </button>
                <button
                  type="button"
                  disabled={listData.page >= listData.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
