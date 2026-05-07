"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { api, getCurrentCompany, getSmartDefaultPeriod, CurrentCompany } from "@/lib/api";
import { safeBSToAD } from "@/lib/bsad";
import { readCalendarDisplayMode } from "@/lib/calendarMode";
import { openPrintWindow } from "@/lib/printReport";
import { ArrowLeft, Printer, Package } from "lucide-react";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

type BOMTransactionRow = {
  row_type: "production_consume" | "production_output" | "kit_sale_component";
  txn_date: string;
  ref_id: number;
  ref_label: string | null;
  parent_item_id: number | null;
  parent_item_code: string | null;
  parent_item_name: string | null;
  component_item_id: number | null;
  component_item_code: string | null;
  component_item_name: string | null;
  qty: number;
  warehouse_id: number | null;
  warehouse_name: string | null;
  department_id: number | null;
  project_id: number | null;
  segment_id: number | null;
  unit_cost: number | null;
  amount: number | null;
  bom_id: number | null;
};

type BOMTransactionsReport = {
  company_id: number;
  from_date: string;
  to_date: string;
  rows: BOMTransactionRow[];
};

function rowTypeLabel(t: string) {
  if (t === "production_consume") return "Production (consume)";
  if (t === "production_output") return "Production (output)";
  if (t === "kit_sale_component") return "Kit sale (component)";
  return t;
}

export default function BOMTransactionsReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const printRef = useRef<HTMLDivElement>(null);

  const [mounted, setMounted] = useState(false);
  const [mode, setMode] = useState<"AD" | "BS">("AD");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [kind, setKind] = useState<"all" | "production" | "kit_sales">("all");
  const [warehouseId, setWarehouseId] = useState<string>("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");

  useEffect(() => {
    setMounted(true);
    const cc = getCurrentCompany();
    const stored = readCalendarDisplayMode(cc?.id ? String(cc.id) : '', cc?.calendar_mode || 'AD');
    const m = (stored === 'BOTH' ? (cc?.calendar_mode || 'AD') : stored) as "AD" | "BS";
    setMode(m);
    const { from, to } = getSmartDefaultPeriod(m, cc);
    setFromDate(from);
    setToDate(to);
  }, []);

  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  useEffect(() => {
    if (!mounted || !dbCompany?.calendar_mode) return;
    const m = dbCompany.calendar_mode as "AD" | "BS";
    if (m === mode) return;
    setMode(m);
    const { from, to } = getSmartDefaultPeriod(m, dbCompany as any);
    setFromDate(from);
    setToDate(to);
  }, [mounted, dbCompany?.calendar_mode, dbCompany?.id]);

  const fromAD = mode === "BS" ? safeBSToAD(fromDate) || fromDate : fromDate;
  const toAD = mode === "BS" ? safeBSToAD(toDate) || toDate : toDate;

  const reportUrl = useMemo(() => {
    if (!companyId || !fromAD || !toAD) return null;
    const q = new URLSearchParams({
      from_date: fromAD,
      to_date: toAD,
      kind,
    });
    if (warehouseId.trim()) q.set("warehouse_id", warehouseId.trim());
    if (departmentId.trim()) q.set("department_id", departmentId.trim());
    if (projectId.trim()) q.set("project_id", projectId.trim());
    if (segmentId.trim()) q.set("segment_id", segmentId.trim());
    return `/companies/${companyId}/reports/bom-transactions?${q.toString()}`;
  }, [companyId, fromAD, toAD, kind, warehouseId, departmentId, projectId, segmentId]);

  const { data, isLoading, error } = useSWR<BOMTransactionsReport>(reportUrl, fetcher);

  const { data: warehouses } = useSWR<any[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );
  const { data: departments } = useSWR<any[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );
  const { data: projects } = useSWR<any[]>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );
  const { data: segments } = useSWR<any[]>(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "BOM-related transactions",
      company: dbCompany?.name || "",
      period: `${fromDate} – ${toDate}`,
      orientation: "landscape",
    });
  };

  if (!companyId) return null;

  return (
    <div className="max-w-[1200px] mx-auto px-4 py-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/companies/${companyId}/reports`)}
            className="inline-flex items-center gap-1 text-sm text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Reports
          </button>
        </div>
        <button
          type="button"
          onClick={handlePrint}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50"
        >
          <Printer className="w-4 h-4" />
          Print
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-start gap-3 mb-4">
          <div className="rounded-lg bg-indigo-50 p-2 dark:bg-indigo-950">
            <Package className="w-6 h-6 text-indigo-600 dark:text-indigo-300" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              BOM-related transactions
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 max-w-2xl">
              Production BOM component consumption and finished output, plus phantom kit sales (invoice
              line is the kit; stock rows are components). Production rows use the order creation date.
            </p>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">From</label>
            <input
              type={mode === "BS" ? "text" : "date"}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">To</label>
            <input
              type={mode === "BS" ? "text" : "date"}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Type</label>
            <select
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
            >
              <option value="all">All</option>
              <option value="production">Production only</option>
              <option value="kit_sales">Kit sales only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Warehouse</label>
            <select
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={warehouseId}
              onChange={(e) => setWarehouseId(e.target.value)}
            >
              <option value="">All</option>
              {(warehouses || []).map((w: any) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Department</label>
            <select
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">All</option>
              {(departments || []).filter((d: any) => d.is_active !== false).map((d: any) => (
                <option key={d.id} value={String(d.id)}>{d.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Project</label>
            <select
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All</option>
              {(projects || []).filter((p: any) => p.is_active !== false).map((p: any) => (
                <option key={p.id} value={String(p.id)}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Segment</label>
            <select
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-800"
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
            >
              <option value="">All</option>
              {(segments || []).filter((s: any) => s.is_active !== false).map((s: any) => (
                <option key={s.id} value={String(s.id)}>{s.name}</option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            Failed to load report.
          </div>
        )}
        {isLoading && <div className="text-sm text-slate-500">Loading…</div>}
      </div>

      <div ref={printRef} className="rounded-xl border border-slate-200 bg-white overflow-x-auto dark:border-slate-700 dark:bg-slate-900">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left dark:border-slate-700 dark:bg-slate-800">
              <th className="p-2 font-semibold">Date</th>
              <th className="p-2 font-semibold">Type</th>
              <th className="p-2 font-semibold">Reference</th>
              <th className="p-2 font-semibold">Parent (kit / FG)</th>
              <th className="p-2 font-semibold">Component</th>
              <th className="p-2 font-semibold text-right">Qty</th>
              <th className="p-2 font-semibold">Warehouse</th>
              <th className="p-2 font-semibold">Cost center</th>
              <th className="p-2 font-semibold text-right">Unit cost</th>
              <th className="p-2 font-semibold text-right">Amount</th>
              <th className="p-2 font-semibold text-right">BOM #</th>
            </tr>
          </thead>
          <tbody>
            {(data?.rows || []).map((row, idx) => (
              <tr
                key={`${row.row_type}-${row.ref_id}-${row.component_item_id ?? "o"}-${idx}`}
                className="border-b border-slate-100 dark:border-slate-800"
              >
                <td className="p-2 whitespace-nowrap">{row.txn_date}</td>
                <td className="p-2">{rowTypeLabel(row.row_type)}</td>
                <td className="p-2 max-w-[180px] truncate" title={row.ref_label || ""}>
                  {row.ref_label || `#${row.ref_id}`}
                </td>
                <td className="p-2">
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    {row.parent_item_name || "—"}
                  </div>
                  <div className="text-[10px] text-slate-500">
                    {[row.parent_item_code, row.parent_item_id].filter(Boolean).join(" · ")}
                  </div>
                </td>
                <td className="p-2">
                  {row.component_item_name ? (
                    <>
                      <div className="font-medium">{row.component_item_name}</div>
                      <div className="text-[10px] text-slate-500">
                        {[row.component_item_code, row.component_item_id].filter(Boolean).join(" · ")}
                      </div>
                    </>
                  ) : (
                    <span className="text-slate-400">—</span>
                  )}
                </td>
                <td className="p-2 text-right tabular-nums">{Number(row.qty).toLocaleString()}</td>
                <td className="p-2">{row.warehouse_name || "—"}</td>
                <td className="p-2 text-[10px] text-slate-500">
                  D:{row.department_id ?? "—"} / P:{row.project_id ?? "—"} / S:{row.segment_id ?? "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {row.unit_cost != null ? Number(row.unit_cost).toFixed(4) : "—"}
                </td>
                <td className="p-2 text-right tabular-nums">
                  {row.amount != null ? Number(row.amount).toFixed(2) : "—"}
                </td>
                <td className="p-2 text-right">{row.bom_id ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data?.rows?.length === 0 && !isLoading && (
          <div className="p-8 text-center text-sm text-slate-500">No rows in this period.</div>
        )}
      </div>
    </div>
  );
}
