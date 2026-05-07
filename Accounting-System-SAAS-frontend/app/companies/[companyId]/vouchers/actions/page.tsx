"use client";

import { useState } from "react";
import useSWRMutation from "swr/mutation";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, type Voucher as ApiVoucher } from "@/lib/api";

type Voucher = ApiVoucher & {
  origin_type?: "PURCHASE_BILL" | "SALES_INVOICE" | null;
  origin_id?: number | null;
  status?: "ACTIVE" | "CANCELLED" | string;
  is_reversal?: boolean;
};

const searchFetcher = async (
  url: string,
  { arg }: { arg: { voucherNumber: string | null } }
): Promise<Voucher[]> => {
  const params: any = {};
  if (arg.voucherNumber) {
    params.voucher_number = arg.voucherNumber;
  }
  const res = await api.get(url, { params });
  return res.data;
};

export default function VoucherActionsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const [voucherNumber, setVoucherNumber] = useState<string>("");

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const role = (currentUser?.role as string | undefined) || "user";
  const isAdmin = role === "admin" || role === "superadmin";

  const {
    data: vouchers,
    trigger: triggerSearch,
    isMutating: searching,
  } = useSWRMutation(
    companyId ? `/companies/${companyId}/vouchers` : null,
    searchFetcher
  );

  const handleSearch = async () => {
    if (!companyId) return;
    try {
      await triggerSearch({ voucherNumber: voucherNumber.trim() || null });
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to search vouchers";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const handleReverseVoucher = async (voucher: Voucher) => {
    if (!companyId) return;
    if (voucher.status !== "ACTIVE") return;

    if (typeof window !== "undefined") {
      const ok = window.confirm(
        `Create a reversing voucher for ${voucher.voucher_number}?`
      );
      if (!ok) return;
    }

    try {
      await api.post(
        `/companies/${companyId}/vouchers/${voucher.id}/reverse`
      );
      await refetch();
      if (typeof window !== "undefined") {
        window.alert("Reversing voucher created.");
      }
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || "Unable to create reversing voucher";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const handleOpen = (voucher: Voucher) => {
    if (!companyId) return;

    if (voucher.origin_type === "PURCHASE_BILL" && voucher.origin_id) {
      router.push(
        `/companies/${companyId}/purchases/bills/${voucher.origin_id}`
      );
      return;
    }

    if (voucher.origin_type === "SALES_INVOICE" && voucher.origin_id) {
      router.push(
        `/companies/${companyId}/sales/invoices/${voucher.origin_id}`
      );
      return;
    }

    router.push(`/companies/${companyId}/vouchers/${voucher.id}`);
  };

  const handleEdit = (voucher: Voucher) => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/vouchers/${voucher.id}`);
  };

  const refetch = async () => {
    await handleSearch();
  };

  const handleCancel = async (voucher: Voucher) => {
    if (!companyId) return;
    if (voucher.status === "CANCELLED") return;

    try {
      await api.post(
        `/companies/${companyId}/vouchers/${voucher.id}/cancel`
      );
      await refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || "Unable to cancel voucher";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const handleDelete = async (voucher: Voucher) => {
    if (!companyId) return;
    if (!isAdmin) return;

    const message =
      `This will permanently delete voucher ${voucher.voucher_number}` +
      (voucher.origin_type
        ? " and its linked document. Are you sure?"
        : ". Are you sure?");

    if (typeof window !== "undefined") {
      const ok = window.confirm(message);
      if (!ok) return;
    }

    try {
      await api.delete(
        `/admin/companies/${companyId}/vouchers/${voucher.id}`
      );
      await refetch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || "Unable to delete voucher";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const originLabel = (v: Voucher): string => {
    if (v.origin_type === "PURCHASE_BILL" && v.origin_id) {
      return `Purchase Invoice #${v.origin_id}`;
    }
    if (v.origin_type === "SALES_INVOICE" && v.origin_id) {
      return `Sales Invoice #${v.origin_id}`;
    }
    return "Manual";
  };

  const results: Voucher[] = (vouchers as Voucher[]) || [];

  const exactResults: Voucher[] = (() => {
    const term = voucherNumber.trim();
    if (!term) return results;
    const lowered = term.toLowerCase();
    return results.filter((v) =>
      (v.voucher_number || "").toString().toLowerCase() === lowered
    );
  })();

  const getStatusClass = (status: string | undefined): string => {
    if (status === "ACTIVE") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
    if (status === "CANCELLED") {
      return "bg-red-50 text-red-700 border border-red-200";
    }
    return "bg-slate-50 text-slate-600 border border-slate-200";
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2.25m0 0v2.25m0-2.25h2.25m-2.25 0H9.75m10.125-3a.75.75 0 00-1.5 0V18a2.25 2.25 0 01-2.25 2.25h-8.25A2.25 2.25 0 015.625 18V8.25A2.25 2.25 0 017.875 6h2.25l1.5-1.5h6l1.5 1.5h2.25A2.25 2.25 0 0123.625 8.25v1.5a.75.75 0 001.5 0z" clipRule="evenodd" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5m-16.5 0v11.25c0 1.242 1.008 2.25 2.25 2.25h14.25c1.242 0 2.25-1.008 2.25-2.25V3M3.75 3h16.5m-16.5 0H3.75m16.5 0H20.25M20.25 16.5H12" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Voucher Actions</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage, cancel, reverse, or delete vouchers.
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col">
            <label className="mb-1 text-xs text-slate-600">
              Voucher number
            </label>
            <input
              type="text"
              className="border rounded px-3 py-1 text-sm"
              placeholder="e.g. SI-2024-000123"
              value={voucherNumber}
              onChange={(e) => setVoucherNumber(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={searching || !companyId}
            className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm disabled:opacity-50"
          >
            {searching ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="mt-4">
          {exactResults.length === 0 ? (
            <div className="text-xs text-slate-500">
              No vouchers found. Try searching by an exact voucher number.
            </div>
          ) : (
            <table className="w-full text-xs border-t border-slate-200">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-2 px-2">Voucher No</th>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Origin</th>
                  <th className="text-left py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exactResults.map((v) => (
                  <tr key={v.id} className="border-b">
                    <td className="py-1 px-2 align-top text-slate-700">
                      {v.voucher_number}
                    </td>
                    <td className="py-1 px-2 align-top text-slate-600">
                      {v.voucher_date}
                    </td>
                    <td className="py-1 px-2 align-top text-slate-600">
                      {v.voucher_type}
                    </td>
                    <td className="py-1 px-2 align-top text-right">
                      {Number((v as any).total_amount || 0).toFixed(2)}
                    </td>
                    <td className="py-1 px-2 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusClass(
                          v.status
                        )}`}
                      >
                        {v.status ?? ""}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-top text-slate-600">
                      {originLabel(v)}
                    </td>
                    <td className="py-1 px-2 align-top space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(v)}
                        className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(v)}
                        className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {v.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => handleReverseVoucher(v)}
                          className="px-2 py-0.5 rounded border border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100"
                        >
                          Reverse
                        </button>
                      )}
                      {v.status === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => handleCancel(v)}
                          className="px-2 py-0.5 rounded border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                        >
                          Cancel
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => handleDelete(v)}
                          className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
