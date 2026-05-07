"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";
import { api, type Voucher as ApiVoucher } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type Role = "user" | "admin" | "superadmin" | string;

type Voucher = ApiVoucher & {
  origin_type?: "PURCHASE_BILL" | "SALES_INVOICE" | null;
  origin_id?: number | null;
  status?: "ACTIVE" | "CANCELLED" | string;
};

type PurchaseBill = {
  id: number;
  bill_number?: string | null;
  date: string;
  supplier_id?: number | null;
  total_amount?: number | null;
  status?: string | null;
};

type SalesInvoice = {
  id: number;
  invoice_number?: string | null;
  date: string;
  customer_id?: number | null;
  total_amount?: number | null;
  status?: string | null;
};

type DocumentKind = "VOUCHER" | "BILL" | "INVOICE";

type DocumentRow = {
  kind: DocumentKind;
  id: number;
  number: string;
  date: string;
  party: string;
  total: number;
  status?: string | null;
  originLabel?: string;
  raw: Voucher | PurchaseBill | SalesInvoice;
};

export default function DocumentActionsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const [numberQuery, setNumberQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "VOUCHER" | "BILL" | "INVOICE">("ALL");
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DocumentRow[]>([]);

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: customers } = useSWR(
    companyId ? `/sales/companies/${companyId}/customers` : null,
    fetcher
  );

  const { data: suppliers } = useSWR(
    companyId ? `/purchases/companies/${companyId}/suppliers` : null,
    fetcher
  );

  const role = (currentUser?.role as Role | undefined) || "user";
  const isAdmin = role === "admin" || role === "superadmin";

  const partyNameForBill = (bill: PurchaseBill): string => {
    if (!bill.supplier_id || !Array.isArray(suppliers)) return "";
    const found = (suppliers as any[]).find((s) => s.id === bill.supplier_id);
    return found?.name || String(bill.supplier_id);
  };

  const partyNameForInvoice = (inv: SalesInvoice): string => {
    if (!inv.customer_id || !Array.isArray(customers)) return "";
    const found = (customers as any[]).find((c) => c.id === inv.customer_id);
    return found?.name || String(inv.customer_id);
  };

  const originLabelForVoucher = (v: Voucher): string => {
    if (v.origin_type === "PURCHASE_BILL" && v.origin_id) {
      return `Purchase Invoice #${v.origin_id}`;
    }
    if (v.origin_type === "SALES_INVOICE" && v.origin_id) {
      return `Sales Invoice #${v.origin_id}`;
    }
    return "Manual";
  };

  const handleSearch = async () => {
    if (!companyId) return;
    const q = numberQuery.trim();
    if (!q) {
      setRows([]);
      return;
    }

    setLoading(true);
    try {
      const results: DocumentRow[] = [];

      if (typeFilter === "ALL" || typeFilter === "VOUCHER") {
        const vRes = await api.get<Voucher[]>(
          `/companies/${companyId}/vouchers`,
          {
            params: { voucher_number: q },
          }
        );
        for (const v of vRes.data || []) {
          results.push({
            kind: "VOUCHER",
            id: v.id,
            number: v.voucher_number || String(v.id),
            date: (v as any).voucher_date || (v as any).date || "",
            party: "",
            total: Number((v as any).total_amount || 0),
            status: (v as any).status || null,
            originLabel: originLabelForVoucher(v),
            raw: v,
          });
        }
      }

      if (typeFilter === "ALL" || typeFilter === "BILL") {
        const bRes = await api.get<PurchaseBill[]>(
          `/companies/${companyId}/bills`,
          {
            params: { bill_number: q },
          }
        );
        for (const b of bRes.data || []) {
          results.push({
            kind: "BILL",
            id: b.id,
            number: b.bill_number || String(b.id),
            date: b.date,
            party: partyNameForBill(b),
            total: Number((b as any).total_amount || 0),
            status: b.status || null,
            raw: b,
          });
        }
      }

      if (typeFilter === "ALL" || typeFilter === "INVOICE") {
        const iRes = await api.get<SalesInvoice[]>(
          `/sales/companies/${companyId}/invoices`,
          {
            params: { invoice_number: q },
          }
        );
        for (const inv of iRes.data || []) {
          results.push({
            kind: "INVOICE",
            id: inv.id,
            number: inv.invoice_number || String(inv.id),
            date: inv.date,
            party: partyNameForInvoice(inv),
            total: Number((inv as any).total_amount || 0),
            status: inv.status || null,
            raw: inv,
          });
        }
      }

      setRows(results);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Failed to search documents";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (row: DocumentRow) => {
    if (!companyId) return;

    if (row.kind === "VOUCHER") {
      const v = row.raw as Voucher;
      if (v.origin_type === "PURCHASE_BILL" && v.origin_id) {
        router.push(`/companies/${companyId}/purchases/bills/${v.origin_id}`);
        return;
      }
      if (v.origin_type === "SALES_INVOICE" && v.origin_id) {
        router.push(`/companies/${companyId}/sales/invoices/${v.origin_id}`);
        return;
      }
      router.push(`/companies/${companyId}/vouchers/${v.id}`);
      return;
    }

    if (row.kind === "BILL") {
      router.push(`/companies/${companyId}/purchases/bills/${row.id}`);
      return;
    }

    if (row.kind === "INVOICE") {
      router.push(`/companies/${companyId}/sales/invoices/${row.id}`);
      return;
    }
  };

  const handleEdit = (row: DocumentRow) => {
    if (!companyId) return;

    if (row.kind === "VOUCHER") {
      const v = row.raw as Voucher;
      router.push(`/companies/${companyId}/vouchers/${v.id}`);
      return;
    }

    if (row.kind === "BILL") {
      router.push(`/companies/${companyId}/purchases/bills/${row.id}`);
      return;
    }

    if (row.kind === "INVOICE") {
      router.push(`/companies/${companyId}/sales/invoices/${row.id}`);
      return;
    }
  };

  const handleReverse = async (row: DocumentRow) => {
    if (!companyId) return;

    const status = (row.status || "").toUpperCase();
    if (status && status !== "ACTIVE") return;

    let confirmText = "";
    let url = "";

    if (row.kind === "VOUCHER") {
      confirmText = `Create a reversing voucher for ${row.number}?`;
      url = `/companies/${companyId}/vouchers/${row.id}/reverse`;
    } else if (row.kind === "BILL") {
      confirmText = "Create a purchase return to reverse this bill?";
      url = `/companies/${companyId}/bills/${row.id}/reverse`;
    } else if (row.kind === "INVOICE") {
      confirmText = "Create a sales return to reverse this invoice?";
      url = `/companies/${companyId}/invoices/${row.id}/reverse`;
    }

    if (!url) return;

    if (typeof window !== "undefined") {
      const ok = window.confirm(confirmText);
      if (!ok) return;
    }

    try {
      const res = await api.post(url);
      if (row.kind === "VOUCHER") {
        if (typeof window !== "undefined") {
          window.alert("Reversing voucher created.");
        }
        // stay on list, refresh
        await handleSearch();
      } else if (row.kind === "BILL") {
        const returnId = res?.data?.id;
        if (returnId) {
          router.push(`/companies/${companyId}/purchases/returns/${returnId}`);
        }
      } else if (row.kind === "INVOICE") {
        const returnId = res?.data?.id;
        if (returnId) {
          router.push(`/companies/${companyId}/sales/returns/${returnId}`);
        }
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || "Unable to reverse document";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const handleCancelVoucher = async (row: DocumentRow) => {
    if (!companyId) return;
    if (row.kind !== "VOUCHER") return;
    const status = (row.status || "").toUpperCase();
    if (status === "CANCELLED") return;

    try {
      await api.post(`/companies/${companyId}/vouchers/${row.id}/cancel`);
      await handleSearch();
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail || "Unable to cancel voucher";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const handleDeleteVoucher = async (row: DocumentRow) => {
    if (!companyId) return;
    if (row.kind !== "VOUCHER") return;
    if (!isAdmin) return;

    const v = row.raw as Voucher;

    const message =
      `This will permanently delete voucher ${row.number}` +
      (v.origin_type
        ? " and its linked document. Are you sure?"
        : ". Are you sure?");

    if (typeof window !== "undefined") {
      const ok = window.confirm(message);
      if (!ok) return;
    }

    try {
      await api.delete(
        `/admin/companies/${companyId}/vouchers/${row.id}`
      );
      await handleSearch();

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          key.startsWith(`/inventory/companies/${companyId}/stock/`)
      );

      await globalMutate(
        (key) =>
          typeof key === "string" &&
          (key === `/companies/${companyId}/bills` ||
            key.startsWith(`/companies/${companyId}/bills?`) ||
            key === `/companies/${companyId}/vouchers` ||
            key.startsWith(`/companies/${companyId}/vouchers?`) ||
            key.startsWith(`/companies/${companyId}/reports/ledger`) ||
            key.startsWith(`/companies/${companyId}/reports/daybook`))
      );
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 409 && typeof detail === "string") {
        if (typeof window !== "undefined") {
          window.alert(String(detail));
        }
        return;
      }
      const msg =
        err?.response?.data?.detail || "Unable to delete voucher";
      if (typeof window !== "undefined") {
        window.alert(String(msg));
      }
    }
  };

  const statusBadgeClass = (status: string | null | undefined): string => {
    const s = (status || "").toUpperCase();
    if (s === "ACTIVE") {
      return "bg-emerald-50 text-emerald-700 border border-emerald-200";
    }
    if (s === "CANCELLED" || s === "REVERSED") {
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Document Actions</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Search, open, edit, reverse, cancel, or delete documents natively.
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
            <label className="mb-1 text-xs text-slate-600">Number</label>
            <input
              type="text"
              className="border rounded px-3 py-1 text-sm"
              placeholder="Voucher / Bill / Invoice number"
              value={numberQuery}
              onChange={(e) => setNumberQuery(e.target.value)}
            />
          </div>
          <div className="flex flex-col">
            <label className="mb-1 text-xs text-slate-600">Type</label>
            <select
              className="border rounded px-3 py-1 text-sm"
              value={typeFilter}
              onChange={(e) =>
                setTypeFilter(e.target.value as any)
              }
            >
              <option value="ALL">All</option>
              <option value="VOUCHER">Vouchers</option>
              <option value="BILL">Bills</option>
              <option value="INVOICE">Invoices</option>
            </select>
          </div>
          <button
            type="button"
            onClick={handleSearch}
            disabled={loading || !companyId}
            className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50 text-sm disabled:opacity-50"
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </div>

        <div className="mt-4">
          {rows.length === 0 ? (
            <div className="text-xs text-slate-500">
              No documents found. Try searching by an exact number.
            </div>
          ) : (
            <table className="w-full text-xs border-t border-slate-200">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-left py-2 px-2">Number</th>
                  <th className="text-left py-2 px-2">Date</th>
                  <th className="text-left py-2 px-2">Party</th>
                  <th className="text-right py-2 px-2">Total</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Origin</th>
                  <th className="text-left py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={`${row.kind}-${row.id}`} className="border-b">
                    <td className="py-1 px-2 align-top text-slate-600">
                      {row.kind === "VOUCHER"
                        ? "Voucher"
                        : row.kind === "BILL"
                          ? "Purchase Invoice"
                          : "Sales Invoice"}
                    </td>
                    <td className="py-1 px-2 align-top text-slate-700">
                      {row.number}
                    </td>
                    <td className="py-1 px-2 align-top text-slate-600">
                      {row.date}
                    </td>
                    <td className="py-1 px-2 align-top text-slate-600">
                      {row.party}
                    </td>
                    <td className="py-1 px-2 align-top text-right">
                      {row.total.toFixed(2)}
                    </td>
                    <td className="py-1 px-2 align-top">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${statusBadgeClass(
                          row.status
                        )}`}
                      >
                        {row.status}
                      </span>
                    </td>
                    <td className="py-1 px-2 align-top text-slate-600">
                      {row.kind === "VOUCHER" ? row.originLabel : "-"}
                    </td>
                    <td className="py-1 px-2 align-top space-x-2">
                      <button
                        type="button"
                        onClick={() => handleOpen(row)}
                        className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50"
                      >
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEdit(row)}
                        className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {(row.status || "").toUpperCase() === "ACTIVE" && (
                        <button
                          type="button"
                          onClick={() => handleReverse(row)}
                          className="px-2 py-0.5 rounded border border-sky-300 text-sky-800 bg-sky-50 hover:bg-sky-100"
                        >
                          Reverse
                        </button>
                      )}
                      {row.kind === "VOUCHER" && (
                        <>
                          {(row.status || "").toUpperCase() === "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() => handleCancelVoucher(row)}
                              className="px-2 py-0.5 rounded border border-amber-300 text-amber-800 bg-amber-50 hover:bg-amber-100"
                            >
                              Cancel
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              onClick={() => handleDeleteVoucher(row)}
                              className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-red-50 hover:bg-red-100"
                            >
                              Delete
                            </button>
                          )}
                        </>
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
