"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getCurrentCompany, type CurrentCompany } from "@/lib/api";
import { safeADToBS } from "@/lib/bsad";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";
import { CalendarDisplayMode, CalendarReportDisplayMode } from "@/lib/calendarMode";

export type LedgerGroupType = "INCOME" | "EXPENSE";

// Legacy flat details report types (kept for reference, no longer used in UI)
export type ProfitAndLossRow = {
  group_name: string;
  amount: number;
  group_type: LedgerGroupType;
};

export type ProfitAndLossReport = {
  from_date: string;
  to_date: string;
  rows: ProfitAndLossRow[];
  gross_profit: number;
  net_profit: number;
};

export type PlSummaryRow = {
  label: string;
  amount: number;
  ledger_id?: number;
};

export type PlSummarySide = {
  title: string;
  rows: PlSummaryRow[];
  total: number;
};

export type FinalAccountsBalancingEntry = {
  label: string;
  amount: number;
};

export type FinalAccountsSide = {
  title?: string;
  rows: PlSummaryRow[];
  total?: number;
  balancing_entry?: FinalAccountsBalancingEntry | null;
};

export type FinalAccountsBlock = {
  from_date?: string;
  to_date?: string;
  debit: FinalAccountsSide;
  credit: FinalAccountsSide;
};

export type FinalAccountsResponse = {
  trading: FinalAccountsBlock;
  profit_loss: FinalAccountsBlock;
};

// Hierarchical P&L types from the new backend contract
export type RowType = "GROUP" | "SUB_GROUP" | "LEDGER" | "TOTAL";

export interface ProfitLossHierRow {
  row_type: RowType;
  level: number;
  is_group: boolean;
  is_ledger: boolean;

  group_id: number | null;
  group_name: string | null;
  primary_group: string | null; // "INCOME" or "EXPENSE"
  group_path: string[];
  parent_group_id: number | null;
  parent_group_name: string | null;
  sort_order: number;

  ledger_id: number | null;
  ledger_name: string;
  amount: number;
}

export interface ProfitLossHierarchicalReport {
  from_date: string;
  to_date: string;
  income: ProfitLossHierRow[];
  expenses: ProfitLossHierRow[];
  totals: {
    income_total: number;
    expenses_total: number;
    net_profit_or_loss: number;
    balanced_income_total?: number;
    balanced_expenses_total?: number;
  };
}

export type ProfitLossStructuredRow = {
  label: string;
  amount: number;
};

export type ProfitLossStructuredSide = {
  title: string;
  rows: ProfitLossStructuredRow[];
  total: number;
};

export type ProfitLossStructuredReport = {
  from_date: string;
  to_date: string;
  debit: ProfitLossStructuredSide;
  credit: ProfitLossStructuredSide;
};

export type ProfitLossClientProps = {
  companyId: string;
  from: string;
  to: string;
  view: "summary" | "details" | "hierarchical";
  summary: FinalAccountsResponse | null;
  details?: ProfitAndLossReport | null;
  hierarchical: ProfitLossHierarchicalReport | null;
  error: string | null;
};

function formatAmount(n: number): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatAmountSigned(n: number): string {
  if (n < 0) {
    const abs = Math.abs(n);
    return `(${formatAmount(abs)})`;
  }
  return formatAmount(n);
}

// formatDateForDisplay replaced by <FormattedDate /> in JSX

export function ProfitLossClient({
  companyId,
  from,
  to,
  view,
  summary,
  details,
  hierarchical,
  error,
}: ProfitLossClientProps) {
  const router = useRouter();
  const printRef = useRef<HTMLDivElement | null>(null);
  const [downloadFormat, setDownloadFormat] = useState<"PDF" | "Excel" | "Send">("PDF");
  const [currentCompany, setCurrentCompanyState] = useState<CurrentCompany | null>(null);
  const [printDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [printTime] = useState(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }));

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: "AD" | "BS" }>(
    companyId ? `/companies/${companyId}/settings` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { 
    displayMode: dateDisplayMode, 
    reportMode 
  } = useCalendarSettings();

  const effectiveDisplayMode: CalendarReportDisplayMode =
    dateDisplayMode === "BOTH" ? reportMode : (dateDisplayMode === "BS" ? "BS" : "AD");

  useEffect(() => {
    const cc = getCurrentCompany();
    setCurrentCompanyState(cc);
  }, []);

  const [collapsedIds, setCollapsedIds] = useState<Set<number>>(new Set());

  const toggleGroup = (groupId: number) => {
    const next = new Set(collapsedIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    setCollapsedIds(next);
  };

  const handleBack = () => {
    if (typeof window !== "undefined") {
      window.history.back();
      return;
    }
    router.back();
  };

  const handleClose = () => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/reports`);
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
      `<!doctype html><html><head><base href="${window.location.origin}">${originalHead}<style>.print-hidden{display:none !important;} table.print-table{border-collapse:collapse;width:100%;font-size:10px;} table.print-table th,table.print-table td{border:1px solid #e2e8f0;padding:2px 3px;} .print-toolbar{padding:8px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;font-family:sans-serif;background:#f8fafc;} .print-toolbar button{padding:4px 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;font-weight:600;} .print-toolbar button:hover{background:#f1f5f9;} .print-toolbar .primary{background:#4f46e5;color:#fff;border-color:#4f46e5;} .print-toolbar .primary:hover{background:#4338ca;} @media print{.print-toolbar{display:none !important;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} table{page-break-inside:auto;} tr{page-break-inside:avoid;} thead{display:table-header-group;}} @page{margin:8mm;}</style></head><body><div class="print-toolbar"><button class="primary" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${printContents}<script>window.onload=function(){var b=document.body,pw=b.clientWidth,sw=b.scrollWidth;if(sw>pw+5){var s=pw/sw;b.style.transform='scale('+s+')';b.style.transformOrigin='top left';b.style.width=(100/s)+'%';}}</script></body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
  };

  useEffect(() => {
    const onPrintEvent = () => handlePrint();
    window.addEventListener("trigger-pnl-print", onPrintEvent);
    return () => window.removeEventListener("trigger-pnl-print", onPrintEvent);
  }, [summary, details, hierarchical, currentCompany]);

  const handleOpenPdfView = handlePrint;

  const handleExportCsv = () => {
    const rows: string[] = [];

    const getFormattedStr = (d: string | undefined | null) => {
      if (!d) return "";
      if (reportMode === "BS") return safeADToBS(d) || d;
      return d;
    };
    rows.push(`Company: ${companyId}`);
    rows.push(`From: ${getFormattedStr(from)}`);
    rows.push(`To: ${getFormattedStr(to)}`);
    rows.push(`View: ${view}`);

    if (view === "summary" && summary) {
      const addSide = (title: string, side: FinalAccountsSide) => {
        rows.push("");
        rows.push(title);
        rows.push("Label,Amount");
        (side.rows || []).forEach((r) => {
          const label = String(r.label ?? "").replace(/"/g, '\\"');
          rows.push(`"${label}",${Number(r.amount ?? 0).toFixed(2)}`);
        });
        if (side.balancing_entry) {
          const label = String(side.balancing_entry.label ?? "").replace(/"/g, '\\"');
          rows.push(`"${label}",${Number(side.balancing_entry.amount ?? 0).toFixed(2)}`);
        }
        if (typeof side.total === "number") {
          rows.push(`"Total",${side.total.toFixed(2)}`);
        }
      };

      rows.push("");
      rows.push("Trading Account");
      addSide("Debit", summary.trading.debit);
      addSide("Credit", summary.trading.credit);

      rows.push("");
      rows.push("Profit & Loss");
      addSide("Debit", summary.profit_loss.debit);
      addSide("Credit", summary.profit_loss.credit);
    } else if (view === "details" && details) {
      rows.push("");
      rows.push("Type,Group,Amount");
      details.rows.forEach((r) => {
        const kind = r.group_type === "INCOME" ? "INCOME" : "EXPENSE";
        const name = String(r.group_name ?? "").replace(/"/g, '\\"');
        rows.push(`"${kind}","${name}",${r.amount.toFixed(2)}`);
      });
      rows.push("");
      rows.push(
        `"${details.gross_profit >= 0 ? "Gross Profit" : "Gross Loss"}",${details.gross_profit.toFixed(
          2
        )}`
      );
      rows.push(
        `"${details.net_profit >= 0 ? "Net Profit" : "Net Loss"}",${details.net_profit.toFixed(2)}`
      );
    } else if (view === "hierarchical" && hierarchical) {
      const addHierSection = (title: string, data: ProfitLossHierRow[]) => {
        rows.push("");
        rows.push(title);
        rows.push("Type,Level,Name,Amount");
        data
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .forEach((r) => {
            const name = String(r.ledger_name || r.group_name || "").replace(/"/g, '\\"');
            rows.push(
              `"${r.row_type}",${Number(r.level ?? 0)},"${name}",${Number(r.amount ?? 0).toFixed(2)}`
            );
          });
      };

      addHierSection("Income", hierarchical.income || []);
      addHierSection("Expenses", hierarchical.expenses || []);

      rows.push("");
      rows.push("Totals");
      rows.push("Label,Amount");
      rows.push(`"Income Total",${Number(hierarchicalIncomeTotal).toFixed(2)}`);
      rows.push(`"Expenses Total",${Number(hierarchicalExpensesTotal).toFixed(2)}`);
      rows.push(
        `"${hierarchical.totals.net_profit_or_loss >= 0 ? "Net Profit" : "Net Loss"}",${Number(
          hierarchical.totals.net_profit_or_loss
        ).toFixed(2)}`
      );
    }

    const csvContent = rows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download =
      view === "summary"
        ? "profit-loss-summary.csv"
        : view === "hierarchical"
          ? "profit-loss-hierarchical.csv"
          : "profit-loss-details.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownload = () => {
    if (downloadFormat === "PDF") {
      handleOpenPdfView();
      return;
    }
    if (downloadFormat === "Excel") {
      handleExportCsv();
      return;
    }
    if (downloadFormat === "Send") {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        (navigator as any)
          .share({
            title: "Profit & Loss Report",
            text: "Sharing Profit & Loss report.",
          })
          .catch(() => {
            // ignore
          });
      } else if (typeof window !== "undefined") {
        window.alert("Sharing is not supported on this browser.");
      }
    }
  };

  if (error) {
    // Let the parent render the error; do not duplicate here.
    return null;
  }

  const summaryFromDate =
    summary?.profit_loss?.from_date ?? summary?.trading?.from_date ?? from;
  const summaryToDate = summary?.profit_loss?.to_date ?? summary?.trading?.to_date ?? to;

  const hierarchicalIncomeTotal = hierarchical
    ? hierarchical.totals.balanced_income_total ?? hierarchical.totals.income_total
    : 0;
  const hierarchicalExpensesTotal = hierarchical
    ? hierarchical.totals.balanced_expenses_total ?? hierarchical.totals.expenses_total
    : 0;

  return (
    <div ref={printRef}>
      {
        view === "details" && summary && (
          <div className="bg-white dark:bg-slate-950 rounded-sm border border-slate-300 shadow-sm overflow-hidden p-0 print:border-none print:shadow-none">
            <div className="p-4 md:p-6 print:p-0">
              <div className="mb-6 text-center w-full max-w-3xl mx-auto">
                <div className="text-xl md:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">
                  {currentCompany?.name || ""}
                </div>
                {currentCompany && (currentCompany as any).address && (
                  <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 font-medium mb-3">
                    {(currentCompany as any).address}
                  </div>
                )}
                <div className="inline-block border-y-2 border-slate-800 dark:border-slate-200 py-1 px-8 mb-4">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em]">
                    Profit & Loss Account
                  </div>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4">
                  <span>
                    {summaryFromDate && summaryToDate
                      ? summaryFromDate === summaryToDate
                        ? <>For Date: <FormattedDate date={summaryFromDate} mode={effectiveDisplayMode} showSuffix /></>
                        : <>Period: <FormattedDate date={summaryFromDate} mode={effectiveDisplayMode} showSuffix /> - <FormattedDate date={summaryToDate} mode={effectiveDisplayMode} showSuffix /></>
                      : ""}
                  </span>
                  <span>{printDate ? <>Printed: <FormattedDate date={printDate} mode={effectiveDisplayMode} showSuffix /></> : ""}</span>
                </div>
              </div>

            <div className="space-y-8 max-w-5xl mx-auto">
              {([
                { title: "Trading Account", block: summary.trading },
                { title: "Profit & Loss Account", block: summary.profit_loss },
              ] as const).map(({ title, block }) => {
                // Formatting helper for rows
                const prepareRows = (side: FinalAccountsSide) => {
                  const items: any[] = [...(side.rows || [])];
                  if (side.balancing_entry) {
                    items.push({
                      label: side.balancing_entry.label,
                      amount: side.balancing_entry.amount,
                      isBalancing: true,
                    });
                  }
                  return items;
                };

                const debitRows = prepareRows(block.debit);
                const creditRows = prepareRows(block.credit);
                const maxRows = Math.max(debitRows.length, creditRows.length);

                return (
                  <div key={title} className="bg-white dark:bg-slate-900 shadow-sm border border-slate-300 overflow-hidden rounded-sm">
                    <div className="bg-slate-800 border-b border-slate-300 px-4 py-2 font-black text-center text-white uppercase tracking-wider text-[11px]">
                      {title}
                    </div>
                    <table className="w-full text-[11px] border-collapse table-fixed">
                      <thead>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 font-semibold uppercase text-[9px]">
                          <th className="px-3 py-1 text-left w-[35%] border-r border-slate-200">Particulars (Dr)</th>
                          <th className="px-3 py-1 text-right w-[15%] border-r border-slate-300">Amount</th>
                          <th className="px-3 py-1 text-left w-[35%] border-r border-slate-200">Particulars (Cr)</th>
                          <th className="px-3 py-1 text-right w-[15%]">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const drRow = debitRows[i];
                          const crRow = creditRows[i];

                          const renderSideCell = (row: any, isDr: boolean) => {
                            if (!row) return (
                              <>
                                <td className={`px-2 py-[3px] ${isDr ? "border-r border-slate-100" : ""}`}></td>
                                <td className={`px-3 py-[3px] ${isDr ? "border-r border-slate-300" : ""}`}></td>
                              </>
                            );
                            return (
                              <>
                                <td className={`px-3 py-[3px] text-xs truncate ${isDr ? "border-r border-slate-100" : ""} ${row.isBalancing ? "font-bold text-slate-900 bg-emerald-50/50" : "text-slate-700"}`} title={row.label ?? ""}>
                                  {!row.isBalancing && row.ledger_id ? (
                                    <>
                                      <button
                                        type="button"
                                        className="text-blue-600 hover:text-blue-800 hover:underline text-left w-full truncate print-hidden"
                                        onClick={() => router.push(`/companies/${companyId}/reports/ledger?ledger_id=${row.ledger_id}&from_date=${summaryFromDate}&to_date=${summaryToDate}`)}
                                      >
                                        {row.label}
                                      </button>
                                      <span className="hidden print:block">{row.label}</span>
                                    </>
                                  ) : (
                                    row.label
                                  )}
                                </td>
                                <td className={`px-3 py-[3px] text-right text-xs tabular-nums font-medium ${isDr ? "border-r border-slate-300" : ""} ${row.isBalancing ? "font-bold text-slate-900 bg-emerald-50/50" : "text-slate-800"}`}>
                                  {formatAmount(row.amount ?? 0)}
                                </td>
                              </>
                            );
                          };

                          return (
                            <tr key={i} className="hover:bg-slate-50/50 transition-colors h-7 border-b border-slate-100 last:border-0 pointer-events-none sm:pointer-events-auto">
                              {renderSideCell(drRow, true)}
                              {renderSideCell(crRow, false)}
                            </tr>
                          );
                        })}
                        {/* Difference warnings */}
                        {(() => {
                           const drTotal = block.debit.total ?? 0;
                           const crTotal = block.credit.total ?? 0;
                           const diff = Math.abs(drTotal - crTotal);
                           if (diff < 0.01) return null;
                           return (
                             <tr className="h-8 bg-amber-50/50 border-t border-amber-200/50 font-medium italic">
                               {drTotal < crTotal ? (
                                 <>
                                   <td className="px-3 py-1.5 text-amber-800 border-r border-slate-100 text-[10px]">Difference in {title}</td>
                                   <td className="px-3 py-1.5 text-right tabular-nums text-amber-800 border-r border-slate-300 font-bold">{formatAmount(diff)}</td>
                                   <td className="px-3 py-1.5 border-r border-slate-100"></td>
                                   <td className="px-3 py-1.5 text-right"></td>
                                 </>
                               ) : (
                                 <>
                                   <td className="px-3 py-1.5 border-r border-slate-100"></td>
                                   <td className="px-3 py-1.5 border-r border-slate-300 text-right"></td>
                                   <td className="px-3 py-1.5 text-amber-800 border-r border-slate-100 text-[10px]">Difference in {title}</td>
                                   <td className="px-3 py-1.5 text-right tabular-nums text-amber-800 font-bold">{formatAmount(diff)}</td>
                                 </>
                               )}
                             </tr>
                           );
                        })()}
                      </tbody>
                      <tfoot className="border-t-2 border-slate-300 bg-slate-50 font-extrabold text-slate-950 uppercase text-[12px]">
                        <tr className="h-10">
                          <td className="px-3 py-3 border-r border-slate-100 text-right">Total</td>
                          <td className="px-3 py-3 text-right tabular-nums border-r border-slate-300">{formatAmount(Math.max(block.debit.total ?? 0, block.credit.total ?? 0))}</td>
                          <td className="px-3 py-3 border-r border-slate-100 text-right">Total</td>
                          <td className="px-3 py-3 text-right tabular-nums">{formatAmount(Math.max(block.debit.total ?? 0, block.credit.total ?? 0))}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );
              })}
            </div>

            <div className="px-0 py-0 text-[10px] text-slate-500 mt-12 mb-4 mx-auto max-w-5xl">
              <div className="flex justify-between items-center border-t border-slate-200 pt-6">
                <span>
                  {'Printed by: '}
                  <span className="text-slate-800 dark:text-slate-200">{currentUser?.full_name || currentUser?.name || currentUser?.email || 'System User'}</span>
                </span>
                <div className="text-center w-[250px]">
                  <span className="block mb-6 font-bold">Approved By</span>
                  <span className="border-t border-slate-400 block w-full"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      }

      {
        (view === "summary" || view === "hierarchical") && hierarchical && (
          <div className="bg-white dark:bg-slate-950 rounded-sm border border-slate-300 shadow-sm overflow-hidden p-0 print:border-none print:shadow-none">
            <div className="p-4 md:p-6 print:p-0">
              <div className="mb-6 text-center w-full max-w-3xl mx-auto">
                <div className="text-xl md:text-2xl font-black text-slate-900 dark:text-white uppercase tracking-tight mb-1">
                  {currentCompany?.name || ""}
                </div>
                {currentCompany && (currentCompany as any).address && (
                  <div className="text-xs md:text-sm text-slate-600 dark:text-slate-400 font-medium mb-3">
                    {(currentCompany as any).address}
                  </div>
                )}
                <div className="inline-block border-y-2 border-slate-800 dark:border-slate-200 py-1 px-8 mb-4">
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-200 uppercase tracking-[0.2em]">
                    {view === "summary" ? "Profit & Loss (Summary)" : "Profit & Loss (Hierarchical)"}
                  </div>
                </div>
                <div className="flex flex-col md:flex-row justify-between items-center text-[11px] font-semibold text-slate-500 uppercase tracking-wider px-4">
                  <span>
                    {hierarchical.from_date && hierarchical.to_date
                      ? hierarchical.from_date === hierarchical.to_date
                        ? <>On Date: <FormattedDate date={hierarchical.from_date} mode={effectiveDisplayMode} showSuffix /></>
                        : <>Period: <FormattedDate date={hierarchical.from_date} mode={effectiveDisplayMode} showSuffix /> - <FormattedDate date={hierarchical.to_date} mode={effectiveDisplayMode} showSuffix /></>
                      : ""}
                  </span>
                  <span>{printDate ? <>Printed: <FormattedDate date={printDate} mode={effectiveDisplayMode} showSuffix /></> : ""}</span>
                </div>
              </div>

            <div className="grid gap-4 text-[11px] md:grid-cols-2 print:grid-cols-2 items-start max-w-6xl mx-auto">
              {(() => {
                const getVisibleRows = (rows: any[]) => {
                  const visible: any[] = [];
                  const hiddenStack: number[] = [];

                  for (const row of rows) {
                    const level = row.level ?? 0;
                    while (hiddenStack.length > 0 && level <= hiddenStack[hiddenStack.length - 1]) {
                      hiddenStack.pop();
                    }
                    if (hiddenStack.length > 0) continue;

                    visible.push(row);

                    if ((row.is_group || row.row_type === "GROUP" || row.row_type === "SUB_GROUP") && row.group_id) {
                      if (collapsedIds.has(row.group_id)) {
                        hiddenStack.push(level);
                      }
                    }
                  }
                  return visible;
                };

                const sortRows = (rows: any[]) => [...rows].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

                // Filter out any existing Net Profit/Loss rows to avoid duplication
                const filterRows = (rows: any[]) => rows.filter(r =>
                  r.row_type !== "TOTAL" &&
                  !["Net Profit", "Net Loss"].includes(r.ledger_name)
                );

                const E_ALL = sortRows(filterRows(hierarchical.expenses));
                const I_ALL = sortRows(filterRows(hierarchical.income));

                const E = getVisibleRows(E_ALL);
                const I = getVisibleRows(I_ALL);

                const netProfit = hierarchical.totals.net_profit_or_loss;
                const hierarchicalExpensesTotal = Math.max(hierarchical.totals.expenses_total, hierarchical.totals.income_total);
                const hierarchicalIncomeTotal = hierarchicalExpensesTotal;

                // Create a balancing row structure
                const balancingRow = {
                  row_type: "TOTAL",
                  level: 0,
                  is_group: false,
                  is_ledger: false,
                  ledger_name: netProfit >= 0 ? "Net Profit" : "Net Loss",
                  amount: Math.abs(netProfit),
                  sort_order: 9999, // Ensure it's at the bottom
                  group_path: [],
                  group_id: null,
                  ledger_id: null,
                };

                // Add balancing row to the lighter side
                if (netProfit >= 0) {
                  // Profit: Income > Expenses. Add to Expenses side to balance.
                  E.push(balancingRow);
                } else {
                  // Loss: Expenses > Income. Add to Income side to balance.
                  I.push(balancingRow);
                }

                const maxRows = Math.max(E.length, I.length);
                const renderTable = (rows: any[], title: string, total: number) => (
                  <div className="flex flex-col h-full bg-white dark:bg-slate-900 shadow-sm border border-slate-300 overflow-hidden rounded-sm">
                    <table className="w-full text-[11px] border-collapse table-fixed">
                      <thead className="bg-slate-800 text-white uppercase font-bold tracking-wider text-[11px] sticky top-0 z-10">
                        <tr>
                          <th colSpan={3} className="px-3 py-2.5 text-center border-b border-slate-600">{title}</th>
                        </tr>
                        <tr className="bg-slate-100 border-b border-slate-300 text-slate-500 font-semibold uppercase text-[9px]">
                          <th className="px-3 py-1 text-left w-[60%] border-r border-slate-200">Particulars</th>
                          <th className="px-3 py-1 text-right w-24 border-r border-slate-200">Details</th>
                          <th className="px-3 py-1 text-right w-24">Amount</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white dark:bg-slate-900">
                        {Array.from({ length: maxRows }).map((_, i) => {
                          const r = rows[i];
                          if (!r) return (
                            <tr key={`empty-${title}-${i}`} className="border-b border-slate-100 dark:border-slate-800/50 h-7 pointer-events-none">
                              <td className="px-3 py-1 border-r border-slate-100 dark:border-slate-800/50"></td>
                              <td className="px-3 py-1 border-r border-slate-100 dark:border-slate-800/50"></td>
                              <td className="px-3 py-1"></td>
                            </tr>
                          );
                          const isG = r.is_group || r.row_type === "GROUP" || r.row_type === "SUB_GROUP";
                          const isLead = r.is_ledger || r.row_type === "LEDGER";
                          const isRoot = (r.level ?? 0) <= 0;
                          const isBalancing = r.row_type === "TOTAL";

                          const canToggle = view === "hierarchical" && isG && r.group_id;
                          const isCollapsed = canToggle && collapsedIds.has(r.group_id);
                          const isClosingStock = r.ledger_name === "Closing Stock" || r.group_name === "Closing Stock" || r.ledger_name === "Stock in Hand (Inventory)";

                          return (
                            <tr key={r.ledger_id ?? `${r.group_name || "row"}-${r.level}-${i}`}
                              className={`h-7 transition-colors hover:bg-slate-50/50 pointer-events-none sm:pointer-events-auto ${isBalancing ? "bg-amber-50/50 border-t border-slate-300 font-bold text-slate-900" : isRoot ? "bg-slate-50/40 font-bold border-y border-slate-100" : isG ? "font-bold border-y border-slate-50" : ""}`}>
                              <td className="py-[3px] border-r border-slate-100 dark:border-slate-800 whitespace-nowrap overflow-hidden text-ellipsis" style={{ paddingLeft: (r.level * 14 + 10), paddingRight: 4 }}>
                                <span className={`inline-block ${isG ? (isRoot ? "text-slate-900 uppercase tracking-tight text-[11px]" : "font-semibold text-slate-800") : "text-slate-600 font-medium"}`}>
                                  {isG && canToggle ? (
                                    <div className="flex items-center gap-1">
                                      <button
                                        type="button"
                                        onClick={() => toggleGroup(r.group_id)}
                                        className="hover:text-blue-600 focus:outline-none flex items-center gap-1 w-full text-left transition-colors print:hidden"
                                      >
                                        <span className="text-[9px] w-3 h-3 shrink-0 inline-flex items-center justify-center border border-slate-400 rounded-sm">
                                          {isCollapsed ? "+" : "−"}
                                        </span>
                                        <span className="truncate">{r.ledger_name || r.group_name}</span>
                                      </button>
                                      <span className="hidden print:block">{r.ledger_name || r.group_name}</span>
                                    </div>
                                  ) : (
                                    isLead && r.ledger_id ? (
                                      <>
                                        <button type="button" className="underline text-blue-600 hover:text-blue-800 text-left print:hidden truncate w-full" onClick={() => {
                                          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                                          router.push(`/companies/${companyId}/reports/ledger?ledger_id=${r.ledger_id}&from_date=${from}&to_date=${to}&returnUrl=${returnUrl}`);
                                        }}>
                                          {r.ledger_name}
                                        </button>
                                        <span className="hidden print:block">{r.ledger_name}</span>
                                      </>
                                    ) : isClosingStock ? (
                                      <>
                                        <button type="button" className="underline text-blue-600 hover:text-blue-800 text-left print:hidden truncate" onClick={() => router.push(`/companies/${companyId}/reports/items`)}>
                                          {r.ledger_name || r.group_name}
                                        </button>
                                        <span className="hidden print:block">{r.ledger_name || r.group_name}</span>
                                      </>
                                    ) : <span>{r.ledger_name || r.group_name}</span>
                                  )}
                                </span>
                              </td>
                              <td className="px-3 py-[3px] text-right tabular-nums border-r border-slate-100 dark:border-slate-800 text-slate-600">
                                {(isLead || isBalancing) && r.amount !== 0 ? formatAmountSigned(r.amount) : ""}
                              </td>
                              <td className={`px-3 py-[3px] text-right tabular-nums font-bold ${isG ? "text-slate-800 bg-slate-50/50" : "text-slate-500"}`}>
                                {isG && r.amount !== 0 ? formatAmountSigned(r.amount) : ""}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-slate-50 border-t-2 border-slate-300">
                        <tr className="h-10 text-[12px]">
                          <td className="px-3 py-3 font-extrabold text-slate-950 uppercase" colSpan={2}>Total {title}</td>
                          <td className="px-3 py-3 text-right tabular-nums font-black text-slate-950">{formatAmountSigned(total)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                );

                const maxTotal = Math.max(hierarchicalExpensesTotal, hierarchicalIncomeTotal);

                return (
                  <>
                    {renderTable(E, "Expenses", maxTotal)}
                    {renderTable(I, "Income", maxTotal)}
                  </>
                );
              })()}
            </div>

            <div className="px-0 py-0 text-[10px] text-slate-500 mt-12 mb-4 mx-auto max-w-6xl">
              <div className="flex justify-between items-center border-t border-slate-200 pt-6">
                <span>
                  {'Printed by: '}
                  <span className="text-slate-800 dark:text-slate-200">{currentUser?.full_name || currentUser?.name || currentUser?.email || 'System User'}</span>
                </span>
                <div className="text-center w-[250px]">
                  <span className="block mb-6 font-bold">Approved By</span>
                  <span className="border-t border-slate-400 block w-full"></span>
                </div>
              </div>
            </div>
          </div>
        </div>
        )
      }

    </div>
  );
}
