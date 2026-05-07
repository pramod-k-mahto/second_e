"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { openPrintWindow } from "@/lib/printReport";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function SuppliersReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const { data: suppliers } = useSWR(
    companyId ? `/companies/${companyId}/suppliers` : null,
    fetcher
  );

  const printRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  const distinctTypes = useMemo(() => {
    const setVals = new Set<string>();
    (suppliers || []).forEach((s: any) => {
      if (s.supplier_type) setVals.add(String(s.supplier_type));
    });
    return Array.from(setVals).sort();
  }, [suppliers]);

  const distinctCities = useMemo(() => {
    const setVals = new Set<string>();
    (suppliers || []).forEach((s: any) => {
      if (s.city) setVals.add(String(s.city));
    });
    return Array.from(setVals).sort();
  }, [suppliers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!suppliers) return [];
    const base = !term
      ? (suppliers as any[])
      : (suppliers as any[]).filter((s) => {
        const name = (s.name || "").toString().toLowerCase();
        const contact = (s.contact_person || "").toString().toLowerCase();
        const mobile = (s.mobile || "").toString().toLowerCase();
        const city = (s.city || "").toString().toLowerCase();
        return (
          name.includes(term) ||
          contact.includes(term) ||
          mobile.includes(term) ||
          city.includes(term)
        );
      });

    return base.filter((s) => {
      const city = (s.city || "").toString().toLowerCase();
      if (typeFilter && String(s.supplier_type || "") !== typeFilter) return false;
      if (statusFilter === "active" && s.is_active === false) return false;
      if (statusFilter === "inactive" && s.is_active !== false) return false;
      if (cityFilter && city !== cityFilter.toLowerCase()) return false;
      return true;
    });
  }, [suppliers, search, typeFilter, statusFilter, cityFilter]);

  const handleExportCsv = () => {
    if (!filtered.length) return;
    const headers = [
      "Name",
      "Contact",
      "Mobile",
      "City",
      "Type",
      "Status",
    ];
    const rows = filtered.map((s: any) => [
      s.name ?? "",
      s.contact_person ?? "",
      s.mobile || s.phone || "",
      s.city ?? "",
      s.supplier_type ?? "",
      s.is_active === false ? "Inactive" : "Active",
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r
          .map((val) => {
            const s = String(val ?? "");
            if (s.includes(",") || s.includes("\"")) {
              return '"' + s.replace(/"/g, '""') + '"';
            }
            return s;
          })
          .join(",")
      )
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `suppliers-report-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Suppliers Report",
      company: "",
      period: `${filtered.length} records`,
      orientation: "portrait",
    });
  };

  if (!companyId) return null;

  return (
    <div className="space-y-4">
      {/* Compact Header - matching voucher page style */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Suppliers</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Supplier accounts and ledger reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}/reports/supplier-ledger`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              Supplier Ledger Report
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150 no-print"
            >
              🖨 Print
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd" /></svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div ref={printRef} className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs">
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="border rounded px-2 py-1 text-xs w-56"
              placeholder="Search by name, contact, mobile, city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="border rounded px-2 py-1 text-xs"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Types</option>
              {distinctTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-2 py-1 text-xs"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              className="border rounded px-2 py-1 text-xs"
              value={cityFilter}
              onChange={(e) => setCityFilter(e.target.value)}
            >
              <option value="">All Cities</option>
              {distinctCities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-[11px] text-slate-500">
              Total: {suppliers ? (suppliers as any[]).length : 0} &nbsp;|&nbsp; Showing: {filtered.length}
            </div>
            <button
              type="button"
              className="px-2 py-1 rounded border border-slate-300 text-[11px] bg-white hover:bg-slate-50"
              onClick={handleExportCsv}
              disabled={!filtered.length}
            >
              Export CSV
            </button>
          </div>
        </div>

        {!suppliers ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-500">No suppliers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Contact</th>
                  <th className="text-left py-2 px-2">Mobile</th>
                  <th className="text-left py-2 px-2">City</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s: any) => {
                  const statusLabel = s.is_active === false ? "Inactive" : "Active";
                  return (
                    <tr key={s.id} className="border-b last:border-none">
                      <td className="py-2 px-2">{s.name}</td>
                      <td className="py-2 px-2 text-slate-600">{s.contact_person}</td>
                      <td className="py-2 px-2 text-slate-600">{s.mobile || s.phone}</td>
                      <td className="py-2 px-2 text-slate-600">{s.city}</td>
                      <td className="py-2 px-2 text-slate-600">{s.supplier_type}</td>
                      <td className="py-2 px-2 text-slate-600">{statusLabel}</td>
                      <td className="py-2 px-2 text-slate-600">
                        <button
                          type="button"
                          className="underline text-blue-700 hover:text-blue-900 text-[11px]"
                          onClick={() =>
                            router.push(
                              `/companies/${companyId}/reports/supplier-ledger?supplier_id=${s.id}`
                            )
                          }
                        >
                          Ledger Report
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 text-[11px] text-slate-500">
          To add or edit suppliers, go to <button
            type="button"
            className="underline text-slate-700"
            onClick={() => router.push(`/companies/${companyId}/purchases/suppliers`)}
          >
            Suppliers
          </button>{" "}
          in the Master / Purchases menu.
        </div>
      </div>
    </div>
  );
}
