import React, { useMemo, useState } from "react";
import { FormattedDate } from "@/components/ui/FormattedDate";

export type PartyStatementItem = {
  line_no: number | null;
  item_id: number;
  item_name: string | null;
  quantity: number;
  rate: number;
  discount: number;
  tax_rate: number;
  line_total: number;
};

export type PartyStatementRow = {
  date: string;
  doc_type: string;
  doc_id: number;
  doc_number: string | null;
  reference: string | null;
  particulars?: string | null;
  debit: number;
  credit: number;
  balance: number;
  payment_mode?: string | null;
  paid_amount?: number | null;
  items: PartyStatementItem[];
};

export type PartyStatementReport = {
  company_id: number;
  company_name: string | null;
  party_id: number;
  party_name: string;
  from_date: string;
  to_date: string;
  opening_balance: number;
  transactions: PartyStatementRow[];
  closing_balance: number;
};

export interface PartyStatementTableProps {
  report: PartyStatementReport;
  companyAddress?: string;
  displayDate?: (d: string) => string;
  mode?: "AD" | "BS";
}

const formatMoney = (val: number) => {
  if (Number.isNaN(val)) return "0.00";
  return val.toFixed(2);
};

export const PartyStatementTable: React.FC<PartyStatementTableProps> = ({ report, companyAddress, displayDate, mode = "AD" }) => {
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const d = (v: string) => <FormattedDate date={v} mode={mode} />;

  const toggleRow = (row: PartyStatementRow) => {
    const key = `${row.doc_type}-${row.doc_id}`;
    setExpandedKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const printDate = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const printTime = useMemo(() => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }), []);

  const openingText = useMemo(() => {
    return formatMoney(report.opening_balance);
  }, [report.opening_balance]);

  const closingText = useMemo(() => {
    return formatMoney(report.closing_balance);
  }, [report.closing_balance]);

  return (
    <div className="space-y-3">
      <div
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: "4px",
          padding: "8px 10px",
        }}
      >
        <div className="mb-2">
          <div
            style={{
              textAlign: "center",
              fontSize: "16px",
              fontWeight: 800,
              paddingBottom: "2px",
            }}
          >
            {report.company_name || ""}
          </div>
          {companyAddress && (
            <div
              style={{
                textAlign: "center",
                fontSize: "9px",
                color: "#475569",
                paddingTop: "2px",
                paddingBottom: "2px",
                borderBottom: "1px solid #e2e8f0",
              }}
            >
              {companyAddress}
            </div>
          )}
          <div
            style={{
              marginTop: "4px",
              fontSize: "12px",
              fontWeight: 700,
              textAlign: "left",
              color: "#020617",
            }}
          >
            Account: <span style={{ fontWeight: 800 }}>{report.party_name}</span>
          </div>
          <div
            style={{
              marginTop: "2px",
              fontSize: "11px",
              fontWeight: 600,
              textAlign: "left",
              paddingBottom: "2px",
              borderBottom: "1px solid #e2e8f0",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end"
            }}
          >
            <div>Statement From {d(report.from_date)} To {d(report.to_date)}</div>
            <div style={{ textAlign: "right", fontSize: "9px", color: "#64748b", fontWeight: 500 }}>
              <div>Print Date: <FormattedDate date={printDate} mode={mode} showSuffix /></div>
              <div>Print Time: {printTime}</div>
            </div>
          </div>
        </div>

        <table className="w-full text-xs print-table">
          <thead>
            <tr className="border-b">
              <th className="w-6 text-center py-1">&nbsp;</th>
              <th className="text-left py-1">Date</th>
              <th className="text-left py-1">Particulars</th>
              <th className="text-left py-1">Doc Type</th>
              <th className="text-left py-1">Doc No.</th>
              <th className="text-left py-1">Reference</th>
              <th className="text-left py-1">Payment Mode</th>
              <th className="text-left py-1 text-[9px] uppercase font-black text-slate-400">Dept.</th>
              <th className="text-left py-1 text-[9px] uppercase font-black text-slate-400">Proj.</th>
              <th className="text-right py-1">Paid Amount</th>
              <th className="text-right py-1">Debit</th>
              <th className="text-right py-1">Credit</th>
              <th className="text-right py-1">Balance</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b bg-slate-50">
              <td className="py-1 text-center text-[10px] text-slate-400" />
              <td className="py-1 text-xs">{d(report.from_date)}</td>
              <td className="py-1 text-xs font-medium">Opening Balance</td>
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs">{openingText}</td>
            </tr>

            {report.transactions.map((row) => {
              const key = `${row.doc_type}-${row.doc_id}`;
              const isExpandable = row.items && row.items.length > 0;
              const isExpanded = !!expandedKeys[key];
              const paidAmount = row.paid_amount ?? 0;
              const hasPaid = typeof paidAmount === "number" && paidAmount > 0;
              const paymentModeText = row.payment_mode || "-";

              return (
                <React.Fragment key={key}>
                  <tr className="border-b last:border-none align-top">
                    <td className="py-1 text-center text-xs">
                      {isExpandable ? (
                        <button
                          type="button"
                          className="w-5 h-5 inline-flex items-center justify-center rounded border border-slate-300 bg-white hover:bg-slate-50 text-[10px]"
                          onClick={() => toggleRow(row)}
                          aria-label={isExpanded ? "Collapse details" : "Expand details"}
                        >
                          <span>{isExpanded ? "-" : "+"}</span>
                        </button>
                      ) : (
                        ""
                      )}
                    </td>
                    <td className="py-1 text-xs">{d(row.date)}</td>
                    <td className="py-1 text-xs font-semibold text-slate-700">
                      <div className="flex flex-col">
                        <span className="truncate max-w-[200px]" title={row.particulars || ""}>
                          {row.particulars || ""}
                        </span>
                        {row.remarks && (
                          <span className="text-[10px] text-slate-500 font-normal italic leading-tight mt-0.5">
                            {row.remarks}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-1 text-xs">{row.doc_type}</td>
                    <td className="py-1 text-xs">{row.doc_number || row.doc_id}</td>
                    <td className="py-1 text-xs text-slate-700 whitespace-pre-wrap">
                      <div>{row.reference || ""}</div>
                      {hasPaid && (
                        <div className="mt-0.5 text-[10px] text-emerald-700 font-medium">
                          Paid via {row.payment_mode || "-"}: {formatMoney(paidAmount)}
                        </div>
                      )}
                      {!hasPaid && (
                        <div className="mt-0.5 text-[10px] text-slate-500 font-medium">
                          Unpaid/Credit
                        </div>
                      )}
                    </td>
                    <td className="py-1 text-xs">{paymentModeText}</td>
                    <td className="py-1 text-[10px] text-slate-500 font-medium italic">{row.department_name || ""}</td>
                    <td className="py-1 text-[10px] text-slate-500 font-medium italic">{row.project_name || ""}</td>
                    <td className="py-1 text-right text-xs">{paidAmount ? formatMoney(paidAmount) : "0.00"}</td>
                    <td className="py-1 text-right text-xs">{formatMoney(row.debit)}</td>
                    <td className="py-1 text-right text-xs">{formatMoney(row.credit)}</td>
                    <td className="py-1 text-right text-xs">{formatMoney(row.balance)}</td>
                  </tr>
                  {isExpanded && row.items.length > 0 && (
                    <tr className="border-b last:border-none bg-slate-50/60">
                      <td className="py-1 text-center text-xs" />
                      <td className="py-1 text-[10px]" colSpan={9}>
                        <table className="w-full text-[10px]">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-0.5 px-1 w-10">Line #</th>
                              <th className="text-left py-0.5 px-1">Item</th>
                              <th className="text-right py-0.5 px-1">Qty</th>
                              <th className="text-right py-0.5 px-1">Rate</th>
                              <th className="text-right py-0.5 px-1">Disc</th>
                              <th className="text-right py-0.5 px-1">VAT %</th>
                              <th className="text-right py-0.5 px-1">Line Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {row.items.map((it) => (
                              <tr key={`${key}-item-${it.item_id}-${it.line_no ?? 0}`} className="border-b last:border-none">
                                <td className="py-0.5 px-1 text-left">
                                  {it.line_no != null ? it.line_no : ""}
                                </td>
                                <td className="py-0.5 px-1 text-left text-slate-700">
                                  {it.item_name || `Item #${it.item_id}`}
                                </td>
                                <td className="py-0.5 px-1 text-right">{it.quantity}</td>
                                <td className="py-0.5 px-1 text-right">{formatMoney(it.rate)}</td>
                                <td className="py-0.5 px-1 text-right">{formatMoney(it.discount)}</td>
                                <td className="py-0.5 px-1 text-right">{it.tax_rate.toFixed(2)}</td>
                                <td className="py-0.5 px-1 text-right">{formatMoney(it.line_total)}</td>
                              </tr>
                            ))}
                            <tr className="border-t">
                              <td className="py-0.5 px-1" />
                              <td className="py-0.5 px-1 font-semibold text-slate-700" colSpan={5}>
                                Bill Total
                              </td>
                              <td className="py-0.5 px-1" />
                              <td className="py-0.5 px-1 text-right font-semibold">
                                {formatMoney(row.items.reduce((sum, it) => sum + (it.line_total || 0), 0))}
                              </td>
                            </tr>
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            <tr className="border-t">
              <td className="py-1 text-center text-xs font-semibold" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs font-semibold text-slate-700">
                Opening Balance:
              </td>
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs">{openingText}</td>
            </tr>
            <tr className="border-b">
              <td className="py-1 text-center text-xs font-semibold" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs" />
              <td className="py-1 text-xs font-semibold text-slate-700">
                Closing Balance:
              </td>
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs" />
              <td className="py-1 text-right text-xs">{closingText}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
