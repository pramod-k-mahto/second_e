"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { openPrintWindow } from "@/lib/printReport";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function CustomersReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const { data: customers } = useSWR(
    companyId ? `/companies/${companyId}/customers` : null,
    fetcher
  );

  const printRef = useRef<HTMLDivElement>(null);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [cityFilter, setCityFilter] = useState("");

  const distinctTypes = useMemo(() => {
    const setVals = new Set<string>();
    (customers || []).forEach((c: any) => {
      if (c.customer_type) setVals.add(String(c.customer_type));
    });
    return Array.from(setVals).sort();
  }, [customers]);

  const distinctCities = useMemo(() => {
    const setVals = new Set<string>();
    (customers || []).forEach((c: any) => {
      if (c.city) setVals.add(String(c.city));
    });
    return Array.from(setVals).sort();
  }, [customers]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!customers) return [];
    const base = !term
      ? (customers as any[])
      : (customers as any[]).filter((c) => {
        const name = (c.name || "").toString().toLowerCase();
        const contact = (c.contact_person || "").toString().toLowerCase();
        const mobile = (c.mobile || "").toString().toLowerCase();
        const city = (c.city || "").toString().toLowerCase();
        return (
          name.includes(term) ||
          contact.includes(term) ||
          mobile.includes(term) ||
          city.includes(term)
        );
      });

    return base.filter((c) => {
      const name = (c.name || "").toString().toLowerCase();
      const contact = (c.contact_person || "").toString().toLowerCase();
      const mobile = (c.mobile || "").toString().toLowerCase();
      const city = (c.city || "").toString().toLowerCase();
      if (typeFilter && String(c.customer_type || "") !== typeFilter) return false;
      if (cityFilter && city !== cityFilter.toLowerCase()) return false;
      return true;
    });
  }, [customers, search, typeFilter, cityFilter]);

  const handleExportCsv = () => {
    if (!filtered.length) return;
    const headers = [
      "Name",
      "Type",
      "Contact",
      "Mobile",
      "City",
      "Category",
      "Allow Credit",
    ];
    const rows = filtered.map((c: any) => [
      c.name ?? "",
      c.customer_type ?? "",
      c.contact_person ?? "",
      c.mobile ?? "",
      c.city ?? "",
      c.category ?? "",
      c.allow_credit ? "Yes" : "No",
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
    a.download = `customers-report-${companyId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Customers Report",
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Customers</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Customer accounts and ledger reports</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}/reports/customer-ledger`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              Customer Ledger Report
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
              Total: {customers ? (customers as any[]).length : 0} &nbsp;|&nbsp; Showing: {filtered.length}
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

        {!customers ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="text-sm text-slate-500">No customers found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b text-slate-600">
                  <th className="text-left py-2 px-2">Name</th>
                  <th className="text-left py-2 px-2">Type</th>
                  <th className="text-left py-2 px-2">Contact</th>
                  <th className="text-left py-2 px-2">Mobile</th>
                  <th className="text-left py-2 px-2">City</th>
                  <th className="text-left py-2 px-2">Category</th>
                  <th className="text-left py-2 px-2">Allow Credit</th>
                  <th className="text-left py-2 px-2">Ledger</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-none">
                    <td className="py-2 px-2 font-medium">{c.name}</td>
                    <td className="py-2 px-2 text-slate-600">{c.customer_type || "-"}</td>
                    <td className="py-2 px-2 text-slate-600">{c.contact_person || "-"}</td>
                    <td className="py-2 px-2 text-slate-600">{c.mobile || "-"}</td>
                    <td className="py-2 px-2 text-slate-600">{c.city || "-"}</td>
                    <td className="py-2 px-2 text-slate-600">{c.category || "-"}</td>
                    <td className="py-2 px-2 text-slate-600">{c.allow_credit ? "Yes" : "No"}</td>
                    <td className="py-2 px-2 text-slate-600">
                      <button
                        type="button"
                        className="underline text-blue-700 hover:text-blue-900 text-[11px]"
                        onClick={() =>
                          router.push(
                            `/companies/${companyId}/reports/customer-ledger?customer_id=${c.id}`
                          )
                        }
                      >
                        Ledger Report
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="mt-3 text-[11px] text-slate-500">
          To add or edit customers, go to <button
            type="button"
            className="underline text-slate-700"
            onClick={() => router.push(`/companies/${companyId}/sales/customers`)}
          >
            Customers
          </button>{" "}
          in the Master / Sales menu.
        </div>
      </div>
    </div>
  );
}
