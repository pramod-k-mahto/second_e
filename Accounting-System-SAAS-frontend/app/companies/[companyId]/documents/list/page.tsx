"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { listCompanyDocuments, type CompanyDocument } from "@/lib/api";

const statusTone: Record<string, string> = {
  uploaded: "bg-slate-100 text-slate-700 border-slate-200",
  processed: "bg-amber-100 text-amber-700 border-amber-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  failed: "bg-rose-100 text-rose-700 border-rose-200",
};

export default function DocumentListPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const { data, isLoading, error, mutate } = useSWR<CompanyDocument[]>(
    companyId ? `documents-${companyId}` : null,
    () => listCompanyDocuments(companyId)
  );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Document List</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Review uploaded scans, process with AI, and confirm into purchase records.
            </p>
          </div>
          <Link
            href={`/companies/${companyId}/documents/upload`}
            className="inline-flex h-9 items-center rounded-lg bg-indigo-600 px-3 text-xs font-semibold text-white hover:bg-indigo-700"
          >
            Upload Document
          </Link>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          <span>{Array.isArray(data) ? data.length : 0} documents</span>
          <button
            type="button"
            onClick={() => mutate()}
            className="rounded-md border border-slate-200 px-2 py-1 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Refresh
          </button>
        </div>

        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Loading documents…</div>
        ) : error ? (
          <div className="p-6 text-sm text-rose-600">
            {(error as any)?.response?.data?.detail || "Failed to load documents"}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No documents uploaded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/40">
                <tr className="text-slate-500 dark:text-slate-300">
                  <th className="px-4 py-2 font-semibold">ID</th>
                  <th className="px-4 py-2 font-semibold">File</th>
                  <th className="px-4 py-2 font-semibold">Type</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 font-semibold">Created</th>
                  <th className="px-4 py-2 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.map((doc) => (
                  <tr key={doc.id} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-300">#{doc.id}</td>
                    <td className="px-4 py-2 text-slate-700 dark:text-slate-200">
                      {doc.original_filename || "document"}
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{doc.document_kind || "—"}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                          statusTone[String(doc.status || "").toLowerCase()] ||
                          "bg-slate-100 text-slate-700 border-slate-200"
                        }`}
                      >
                        {doc.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-500 dark:text-slate-400">
                      {doc.created_at ? new Date(doc.created_at).toLocaleString() : "—"}
                    </td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/companies/${companyId}/documents/list/${doc.id}`}
                        className="rounded-md border border-indigo-200 px-2 py-1 font-semibold text-indigo-700 hover:bg-indigo-50"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
