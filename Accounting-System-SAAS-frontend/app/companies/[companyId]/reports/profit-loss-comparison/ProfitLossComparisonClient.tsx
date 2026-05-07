"use client";

import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { safeADToBS } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
} from "@/lib/calendarMode";

export type LedgerGroupType = "INCOME" | "EXPENSE";

export type ProfitAndLossComparisonRow = {
  key: string | null;
  label: string;
  group_type: LedgerGroupType;
  values: Record<string, number>;
  total: number;
};

export type ProfitAndLossComparisonTotals = {
  per_cost_center: Record<
    string,
    {
      income: number;
      expense: number;
      net_profit: number;
    }
  >;
  overall: {
    income: number;
    expense: number;
    net_profit: number;
  };
};

export type ProfitAndLossComparison = {
  from_date: string;
  to_date: string;
  dimension: "department" | "project";
  ids: number[];
  labels: Record<string, string>;
  level: "group" | "ledger";
  rows: ProfitAndLossComparisonRow[];
  totals: ProfitAndLossComparisonTotals;
};

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function ProfitLossComparisonClient({
  companyId,
  comparison,
}: {
  companyId: string;
  comparison: ProfitAndLossComparison;
}) {
  const { from_date, to_date, dimension, ids, labels, rows, totals } = comparison;
  const printRef = useRef<HTMLDivElement | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"PDF" | "Excel">("PDF");

  const idStrings = ids.map((id) => String(id));

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: "AD" | "BS" }>(
    companyId ? `/companies/${companyId}/settings` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const isBS = companySettings?.calendar_mode === "BS";
  const defaultDateDisplayMode: CalendarDisplayMode = isBS ? "BS" : "AD";
  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>(defaultDateDisplayMode);
  const [reportDisplayMode, setReportDisplayMode] = useState<CalendarReportDisplayMode>(
    (isBS ? "BS" : "AD")
  );

  useEffect(() => {
    if (!companyId) return;
    const fallback: CalendarDisplayMode = isBS ? "BS" : "AD";
    const stored = readCalendarDisplayMode(companyId, fallback);
    setDateDisplayMode(stored);

    if (stored === "BOTH") {
      const reportFallback: CalendarReportDisplayMode = isBS ? "BS" : "AD";
      const reportStored = readCalendarReportDisplayMode(companyId, reportFallback);
      setReportDisplayMode(reportStored);
    } else {
      setReportDisplayMode(stored);
    }
  }, [companyId, defaultDateDisplayMode, isBS]);

  const effectiveDisplayMode: CalendarReportDisplayMode =
    dateDisplayMode === "BOTH" ? reportDisplayMode : (dateDisplayMode === "BS" ? "BS" : "AD");

  const displayDate = (d: string): string => {
    if (!d) return "";
    if (effectiveDisplayMode === "BS") {
      return safeADToBS(d) || d;
    }
    return d;
  };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    if (!printRef.current) {
      window.print();
      return;
    }

    const printContents = printRef.current.innerHTML;
    const originalHead = document.head.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html><head>${originalHead}<style>.print-hidden{display:none !important;} table.print-table{border-collapse:collapse;width:100%;font-size:10px;} table.print-table th,table.print-table td{border:1px solid #e2e8f0;padding:2px 3px;} .print-toolbar{padding:8px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;font-family:sans-serif;background:#f8fafc;} .print-toolbar button{padding:4px 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;font-weight:600;} .print-toolbar button:hover{background:#f1f5f9;} .print-toolbar .primary{background:#4f46e5;color:#fff;border-color:#4f46e5;} .print-toolbar .primary:hover{background:#4338ca;} @media print{.print-toolbar{display:none !important;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} table{page-break-inside:auto;} tr{page-break-inside:avoid;} thead{display:table-header-group;}} @page{margin:8mm;}</style></head><body><div class="print-toolbar"><button class="primary" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${printContents}<script>window.onload=function(){var b=document.body,pw=b.clientWidth,sw=b.scrollWidth;if(sw>pw+5){var s=pw/sw;b.style.transform='scale('+s+')';b.style.transformOrigin='top left';b.style.width=(100/s)+'%';}}</script></body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
  };

  const handleExportCsv = () => {
    const lines: string[] = [];

    lines.push(`Company: ${companyId}`);
    lines.push(`From: ${displayDate(from_date)}`);
    lines.push(`To: ${displayDate(to_date)}`);
    lines.push(`Dimension: ${dimension}`);
    lines.push("");

    // Header row
    const headerCells = ["Label", ...idStrings.map((id) => labels[id] || id), "Total"];
    lines.push(headerCells.join(","));

    // Data rows
    rows.forEach((row) => {
      const cells: string[] = [];
      cells.push(`"${String(row.label).replace(/"/g, '"')}"`);
      idStrings.forEach((id) => {
        const v = row.values[id] ?? 0;
        cells.push(v.toFixed(2));
      });
      cells.push(row.total.toFixed(2));
      lines.push(cells.join(","));
    });

    lines.push("");
    lines.push("Totals per cost center");
    lines.push("Label,Income,Expense,Net Profit");
    idStrings.forEach((id) => {
      const label = labels[id] || `${dimension} ${id}`;
      const t = totals.per_cost_center[id] || { income: 0, expense: 0, net_profit: 0 };
      lines.push(
        `"${label.replace(/"/g, '"')}",${t.income.toFixed(2)},${t.expense.toFixed(
          2,
        )},${t.net_profit.toFixed(2)}`,
      );
    });

    lines.push("");
    lines.push("Overall Totals");
    lines.push("Income,Expense,Net Profit");
    lines.push(
      `${totals.overall.income.toFixed(2)},${totals.overall.expense.toFixed(2)},${totals.overall.net_profit.toFixed(2)}`,
    );

    const csvContent = lines.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "profit-loss-comparison.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (downloadFormat === "PDF") {
      handlePrint();
      return;
    }
    if (downloadFormat === "Excel") {
      handleExportCsv();
      return;
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs mb-3">
        <div className="space-y-0.5">
          <div className="text-sm font-bold text-slate-800 uppercase tracking-wide">
            Profit & Loss Comparison ({dimension === "department" ? "By Department" : "By Project"})
          </div>
          <div className="text-[10px] text-slate-500 mt-1">
            From {displayDate(from_date)} To {displayDate(to_date)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-600">Download</span>
          <select
            className="border rounded px-2 py-1 bg-white"
            value={downloadFormat}
            onChange={(e) => setDownloadFormat(e.target.value as any)}
          >
            <option value="PDF">PDF</option>
            <option value="Excel">Excel</option>
          </select>
          <button
            type="button"
            onClick={handleDownload}
            className="px-3 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
          >
            Go
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="px-3 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
          >
            Print
          </button>
        </div>
      </div>

      <div ref={printRef}>
        <div className="overflow-auto rounded border border-slate-200 bg-white text-xs">
          <table className="min-w-full text-xs print-table">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-2 py-1 text-left font-medium text-slate-600">
                  Group / Ledger
                </th>
                {idStrings.map((id) => (
                  <th
                    key={id}
                    className="px-2 py-1 text-right font-medium text-slate-600 whitespace-nowrap"
                  >
                    {labels[id] || `${dimension} ${id}`}
                  </th>
                ))}
                <th className="px-2 py-1 text-right font-medium text-slate-600 whitespace-nowrap">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key || row.label} className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-800 whitespace-nowrap">
                    {row.label}
                  </td>
                  {idStrings.map((id) => (
                    <td
                      key={id}
                      className="px-2 py-1 text-right tabular-nums text-slate-800"
                    >
                      {formatAmount(row.values[id] ?? 0)}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-right tabular-nums text-slate-900 font-medium">
                    {formatAmount(row.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2 text-xs">
          <div className="rounded border border-slate-200 bg-white p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Totals per {dimension}
            </div>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-2 py-1 text-left">Label</th>
                  <th className="px-2 py-1 text-right">Income</th>
                  <th className="px-2 py-1 text-right">Expense</th>
                  <th className="px-2 py-1 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody>
                {idStrings.map((id) => {
                  const t = totals.per_cost_center[id] || {
                    income: 0,
                    expense: 0,
                    net_profit: 0,
                  };
                  return (
                    <tr key={id} className="border-t border-slate-100">
                      <td className="px-2 py-1 text-slate-800">
                        {labels[id] || `${dimension} ${id}`}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatAmount(t.income)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatAmount(t.expense)}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        {formatAmount(t.net_profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="rounded border border-slate-200 bg-white p-3">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Overall Totals
            </div>
            <table className="w-full text-[11px]">
              <tbody>
                <tr className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-800">Income</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatAmount(totals.overall.income)}
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-2 py-1 text-slate-800">Expense</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatAmount(totals.overall.expense)}
                  </td>
                </tr>
                <tr className="border-t border-slate-100 font-medium">
                  <td className="px-2 py-1 text-slate-900">Net Profit</td>
                  <td className="px-2 py-1 text-right tabular-nums">
                    {formatAmount(totals.overall.net_profit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
