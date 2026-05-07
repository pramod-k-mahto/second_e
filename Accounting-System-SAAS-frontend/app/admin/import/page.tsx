"use client";

import Link from "next/link";
import * as React from "react";
import { useQueries } from "@tanstack/react-query";
import { getImportJob } from "@/lib/import/api";
import { getRecentImportJobs, removeRecentImportJob, type RecentImportJob } from "@/lib/import/recentJobs";
import { ImportStatusBadge } from "@/components/import/ImportStatusBadge";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, ANIM_CSS,
} from "@/lib/adminTheme";

type JobRow = {
  id: string; company: string; source_type: string;
  data_type: string; status: string; created_at: string;
};

type ExportDataType = "ledgers" | "ledger_groups" | "customers" | "suppliers" | "items";
type ExportFormat = "csv" | "json";

function formatDate(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}

function downloadTextFile(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

function csvEscape(v: unknown) {
  const s = String(v ?? "");
  if (/[\n\r,"]/g.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const TEMPLATES: Record<ExportDataType, { filenameBase: string; headers: string[]; example: Record<string, unknown> }> = {
  ledgers: { filenameBase: "ledgers", headers: ["name", "group", "code", "opening_balance", "opening_balance_type"], example: { name: "Cash", group: "Cash-in-hand", code: "CASH", opening_balance: 0, opening_balance_type: "DR" } },
  ledger_groups: { filenameBase: "ledger_groups", headers: ["name", "parent", "nature", "code", "is_active"], example: { name: "Cash-in-hand", parent: "Current Assets", nature: "ASSET", code: "CASH_IN_HAND", is_active: true } },
  customers: { filenameBase: "customers", headers: ["name", "group", "email", "phone", "pan_vat", "opening_balance", "opening_balance_type"], example: { name: "ABC Traders", group: "Sundry Debtors", email: "abc@example.com", phone: "+977-98XXXXXXXX", pan_vat: "123456789", opening_balance: 0, opening_balance_type: "DR" } },
  suppliers: { filenameBase: "suppliers", headers: ["name", "group", "email", "phone", "pan_vat", "opening_balance", "opening_balance_type"], example: { name: "XYZ Suppliers", group: "Sundry Creditors", email: "xyz@example.com", phone: "+977-98XXXXXXXX", pan_vat: "987654321", opening_balance: 0, opening_balance_type: "CR" } },
  items: { filenameBase: "items", headers: ["name", "sku", "unit", "sales_rate", "purchase_rate", "opening_stock_qty", "opening_stock_rate"], example: { name: "Item A", sku: "ITEM_A", unit: "PCS", sales_rate: 100, purchase_rate: 80, opening_stock_qty: 0, opening_stock_rate: 0 } },
};

function jobStatusStyle(status: string) {
  const s = status.toLowerCase();
  if (s === "done" || s === "completed") return { bg: "rgba(16,185,129,0.15)", text: "#6ee7b7", border: "rgba(16,185,129,0.3)" };
  if (s === "error" || s === "failed") return { bg: "rgba(239,68,68,0.15)", text: "#fca5a5", border: "rgba(239,68,68,0.3)" };
  if (s === "running" || s === "processing") return { bg: "rgba(59,130,246,0.15)", text: "#93c5fd", border: "rgba(59,130,246,0.3)" };
  return { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "rgba(100,116,139,0.3)" };
}

const lbl: React.CSSProperties = { color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" };

export default function AdminImportDashboardPage() {
  const [recent, setRecent] = React.useState<RecentImportJob[]>([]);
  const [exportDataType, setExportDataType] = React.useState<ExportDataType>("ledgers");
  const [exportFormat, setExportFormat] = React.useState<ExportFormat>("csv");
  const [downloaded, setDownloaded] = React.useState(false);

  React.useEffect(() => { setRecent(getRecentImportJobs()); }, []);

  const queries = useQueries({
    queries: recent.map((j) => ({ queryKey: ["importJob", j.id], queryFn: () => getImportJob(j.id), staleTime: 10_000, retry: 1 })),
  });

  const rows: JobRow[] = React.useMemo(() => recent.map((j, idx) => {
    const q = queries[idx];
    const job = q?.data;
    return { id: String(j.id), company: String(job?.company_name || j.company_name || job?.company_id || j.company_id || "—"), source_type: String(job?.source_type || j.source_type || "—"), data_type: String(job?.data_type || j.data_type || "—"), status: String(job?.status || "—"), created_at: formatDate(job?.created_at || j.created_at) };
  }), [queries, recent]);

  const anyLoading = queries.some((q) => q.isLoading);

  const handleDownloadTemplate = () => {
    const tpl = TEMPLATES[exportDataType];
    const stamp = new Date().toISOString().slice(0, 10);
    if (exportFormat === "csv") {
      const header = tpl.headers.map(csvEscape).join(",");
      const row = tpl.headers.map((h) => csvEscape((tpl.example as any)[h])).join(",");
      downloadTextFile(`${tpl.filenameBase}_template_${stamp}.csv`, `${header}\n${row}\n`, "text/csv;charset=utf-8");
    } else {
      downloadTextFile(`${tpl.filenameBase}_template_${stamp}.json`, JSON.stringify({ columns: tpl.headers, example: tpl.example }, null, 2) + "\n", "application/json;charset=utf-8");
    }
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="📤" title="Import Dashboard" subtitle="Create and manage data import jobs. Download migration templates to prepare your data.">
          <Link href="/admin/import/new" style={{ ...G.btnPrimary, textDecoration: "none", display: "inline-block" }}>+ New Import</Link>
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {/* Export Templates card */}
        <div style={{ ...G.card, padding: "24px", marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "18px" }}>
            <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #059669, #10b981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>📋</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: "15px", color: "#e2e8f0" }}>Export Migration Templates</div>
              <div style={{ color: "#64748b", fontSize: "12px" }}>Download template files to help prepare your data for import</div>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "flex-end" }}>
            <div style={{ minWidth: "180px" }}>
              <label style={lbl}>Data Type</label>
              <select value={exportDataType} onChange={(e) => setExportDataType(e.target.value as ExportDataType)} style={{ ...G.selectStyle, width: "100%" }}>
                <option value="ledgers">Ledgers</option>
                <option value="ledger_groups">Ledger Groups</option>
                <option value="customers">Customers</option>
                <option value="suppliers">Suppliers</option>
                <option value="items">Items</option>
              </select>
            </div>
            <div style={{ minWidth: "130px" }}>
              <label style={lbl}>Format</label>
              <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)} style={{ ...G.selectStyle, width: "100%" }}>
                <option value="csv">CSV</option>
                <option value="json">JSON</option>
              </select>
            </div>
            <button onClick={handleDownloadTemplate} style={{ ...G.btnPrimary, background: downloaded ? "linear-gradient(135deg, #059669, #10b981)" : "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: downloaded ? "0 4px 15px rgba(16,185,129,0.3)" : "0 4px 15px rgba(124,58,237,0.3)", transition: "all 0.3s" }}>
              {downloaded ? "✅ Downloaded!" : `📥 Download ${exportFormat.toUpperCase()} Template`}
            </button>
          </div>

          {/* Preview columns */}
          <div style={{ marginTop: "16px", padding: "12px 16px", background: "rgba(255,255,255,0.03)", borderRadius: "10px", border: "1px solid rgba(255,255,255,0.06)" }}>
            <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>Columns for {exportDataType.replace(/_/g, " ")}</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
              {TEMPLATES[exportDataType].headers.map((h) => (
                <span key={h} style={{ padding: "3px 10px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "6px", fontFamily: "monospace", fontSize: "11px", color: "#c4b5fd" }}>{h}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Recent jobs */}
        <div style={{ ...G.card, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>📊 Recent Import Jobs</div>
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {anyLoading && recent.length > 0 && <span style={{ color: "#64748b", fontSize: "12px" }}>Updating statuses…</span>}
              <Link href="/admin/import/new" style={{ padding: "6px 14px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "8px", color: "#c4b5fd", fontSize: "12px", fontWeight: 600, textDecoration: "none" }}>+ New Import</Link>
            </div>
          </div>

          {recent.length === 0 ? (
            <GhostEmpty message="No recent import jobs. Create a new import to get started." />
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Job ID", "Company", "Source", "Data Type", "Status", "Created", "Actions"].map((h) => <th key={h} style={G.tableHeader}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = jobStatusStyle(r.status);
                  return (
                    <tr key={r.id} className="g-row" style={{ borderBottom: i < rows.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s", animation: `fadeIn 0.3s ease ${i * 0.03}s both` }}>
                      <td style={G.tableCell}><span style={{ fontFamily: "monospace", fontSize: "12px", color: "#67e8f9" }}>{r.id}</span></td>
                      <td style={{ ...G.tableCell, fontWeight: 600, color: "#e2e8f0" }}>{r.company}</td>
                      <td style={G.tableCell}><span style={{ textTransform: "capitalize", fontSize: "12px" }}>{r.source_type}</span></td>
                      <td style={G.tableCell}><span style={{ textTransform: "capitalize", fontSize: "12px" }}>{r.data_type}</span></td>
                      <td style={G.tableCell}>
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: st.bg, color: st.text, border: `1px solid ${st.border}` }}>
                          {r.status === "—" ? "—" : r.status}
                        </span>
                      </td>
                      <td style={{ ...G.tableCell, fontSize: "11px" }}>{r.created_at}</td>
                      <td style={G.tableCell}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <Link href={`/admin/import/jobs/${r.id}`} className="g-btn-action" style={{ padding: "5px 10px", background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "8px", color: "#c4b5fd", fontSize: "12px", textDecoration: "none", transition: "all 0.15s" }}>View</Link>
                          <button onClick={() => setRecent(removeRecentImportJob(r.id))} className="g-btn-danger-sm" style={{ padding: "5px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "8px", color: "#fca5a5", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}>Remove</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>📤 Import Dashboard — Superadmin Only</div>
      </div>
    </div>
  );
}
