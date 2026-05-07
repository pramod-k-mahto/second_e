"use client";

import useSWR from "swr";
import { useState, useMemo } from "react";
import { api, type VoucherLog, type VoucherLogAction } from "@/lib/api";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, ANIM_CSS,
} from "@/lib/adminTheme";
import Link from "next/link";

const fetcher = (url: string) => api.get<VoucherLog[]>(url).then((r) => r.data);

const actionStyle = (action: string): React.CSSProperties => {
  if (action === "CREATED") return { background: "rgba(16,185,129,0.15)", color: "#6ee7b7", border: "1px solid rgba(16,185,129,0.3)" };
  if (action === "UPDATED") return { background: "rgba(59,130,246,0.15)", color: "#93c5fd", border: "1px solid rgba(59,130,246,0.3)" };
  return { background: "rgba(239,68,68,0.15)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.3)" };
};

const lbl: React.CSSProperties = { color: "#94a3b8", fontSize: "11px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px", display: "block" };

export default function AdminVoucherLogsPage() {
  const [tenantId, setTenantId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [voucherNumber, setVoucherNumber] = useState("");
  const [action, setAction] = useState<VoucherLogAction | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(0);
  const [limit, setLimit] = useState(50);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    if (tenantId.trim()) p.append("tenant_id", tenantId.trim());
    if (companyId.trim()) p.append("company_id", companyId.trim());
    if (voucherNumber.trim()) p.append("voucher_number", voucherNumber.trim());
    if (action) p.append("action", action);
    if (from) p.append("from", from);
    if (to) p.append("to", to);
    p.append("skip", String(page * limit));
    p.append("limit", String(limit));
    return p.toString();
  }, [tenantId, companyId, voucherNumber, action, from, to, page, limit]);

  const { data, error, isLoading, mutate } = useSWR<VoucherLog[]>(`/admin/voucher-logs?${queryString}`, fetcher);
  const logs = data || [];
  const notAuthorized = (error as any)?.response?.status === 403;

  const hasFilters = !!(tenantId || companyId || voucherNumber || action || from || to);

  const clearFilters = () => { setTenantId(""); setCompanyId(""); setVoucherNumber(""); setAction(""); setFrom(""); setTo(""); setPage(0); };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="📜" title="Voucher Logs" subtitle="Audit trail of voucher creations, updates, and deletions across all tenants.">
          <button onClick={() => mutate()} style={G.btnGhost} className="g-btn-ghost">↻ Refresh</button>
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {/* Stats row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "20px" }}>
          {[
            { label: "Total Shown", value: logs.length, icon: "📜", col: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.3)" },
            { label: "Created", value: logs.filter((l) => l.action === "CREATED").length, icon: "✅", col: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)" },
            { label: "Updated", value: logs.filter((l) => l.action === "UPDATED").length, icon: "✏️", col: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.3)" },
            { label: "Deleted", value: logs.filter((l) => l.action === "DELETED").length, icon: "🗑️", col: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)" },
          ].map((s) => (
            <div key={s.label} style={{ ...G.card, background: s.col, borderColor: s.border, padding: "14px 16px" }}>
              <div style={{ fontSize: "18px", marginBottom: "2px" }}>{s.icon}</div>
              <div style={{ fontSize: "22px", fontWeight: 800, color: "#f1f5f9" }}>{s.value}</div>
              <div style={{ color: "#94a3b8", fontSize: "11px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div style={{ ...G.card, padding: "18px 20px", marginBottom: "16px" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "12px", marginBottom: "12px" }}>
            <div><label style={lbl}>Tenant ID</label><input value={tenantId} onChange={(e) => { setTenantId(e.target.value); setPage(0); }} placeholder="e.g. 1" style={G.inputStyle} /></div>
            <div><label style={lbl}>Company ID</label><input value={companyId} onChange={(e) => { setCompanyId(e.target.value); setPage(0); }} placeholder="e.g. 12" style={G.inputStyle} /></div>
            <div><label style={lbl}>Voucher Number</label><input value={voucherNumber} onChange={(e) => { setVoucherNumber(e.target.value); setPage(0); }} placeholder="PAY-2024/25-…" style={G.inputStyle} /></div>
            <div>
              <label style={lbl}>Action</label>
              <select value={action} onChange={(e) => { setAction(e.target.value as VoucherLogAction | ""); setPage(0); }} style={{ ...G.selectStyle, width: "100%" }}>
                <option value="">All Actions</option>
                <option value="CREATED">CREATED</option>
                <option value="UPDATED">UPDATED</option>
                <option value="DELETED">DELETED</option>
              </select>
            </div>
            <div><label style={lbl}>From</label><input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} style={{ ...G.inputStyle, colorScheme: "dark" }} /></div>
            <div><label style={lbl}>To</label><input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} style={{ ...G.inputStyle, colorScheme: "dark" }} /></div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            {hasFilters && <button onClick={clearFilters} style={{ ...G.btnDanger, padding: "7px 14px", fontSize: "12px" }}>✕ Clear Filters</button>}
            <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setPage(0); }} style={{ ...G.selectStyle, marginLeft: "auto", fontSize: "12px" }}>
              <option value={25}>25 / page</option>
              <option value={50}>50 / page</option>
              <option value={100}>100 / page</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div style={{ ...G.card, overflow: "hidden" }}>
          {isLoading ? <GhostSpinner /> : notAuthorized ? (
            <div style={{ padding: "40px", textAlign: "center" }}>
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔐</div>
              <div style={{ color: "#64748b" }}>Superadmin privileges required to view voucher logs.</div>
            </div>
          ) : logs.length === 0 ? <GhostEmpty message="No voucher logs found. Try adjusting your filters." /> : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["Time", "Actor", "Tenant", "Company", "Voucher", "Action", "Summary"].map((h) => (
                      <th key={h} style={G.tableHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id} className="g-row" style={{ borderBottom: i < logs.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s", animation: `fadeIn 0.2s ease ${i * 0.01}s both` }}>
                      <td style={{ ...G.tableCell, fontSize: "11px", whiteSpace: "nowrap" }}>{new Date(log.timestamp).toLocaleString()}</td>
                      <td style={{ ...G.tableCell, fontSize: "12px" }}>{log.actor ? <span style={{ color: "#94a3b8" }}>{log.actor}</span> : <span style={{ color: "#334155" }}>—</span>}</td>
                      <td style={G.tableCell}><span style={{ fontFamily: "monospace", fontSize: "12px", color: "#67e8f9" }}>#{log.tenant_id}</span></td>
                      <td style={G.tableCell}><span style={{ fontFamily: "monospace", fontSize: "12px", color: "#67e8f9" }}>#{log.company_id}</span></td>
                      <td style={{ ...G.tableCell, fontFamily: "monospace", fontSize: "12px" }}>{log.voucher_number || `#${log.voucher_id}`}</td>
                      <td style={G.tableCell}>
                        <span style={{ padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, ...actionStyle(log.action) }}>{log.action}</span>
                      </td>
                      <td style={{ ...G.tableCell, maxWidth: "300px" }}>
                        <div style={{ fontSize: "12px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={log.summary}>{log.summary}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {/* Pagination */}
              <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} style={{ ...G.btnGhost, opacity: page === 0 ? 0.4 : 1, fontSize: "12px" }}>← Previous</button>
                <span style={{ color: "#64748b", fontSize: "13px" }}>Page {page + 1} · {logs.length} records</span>
                <button onClick={() => { if (logs.length >= limit) setPage((p) => p + 1); }} disabled={logs.length < limit} style={{ ...G.btnGhost, opacity: logs.length < limit ? 0.4 : 1, fontSize: "12px" }}>Next →</button>
              </div>
            </>
          )}
        </div>

        {error && !notAuthorized && (
          <div style={{ marginTop: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "16px", color: "#fca5a5", fontSize: "13px" }}>
            ⚠️ {(error as any)?.response?.data?.detail || "Failed to load voucher logs"}
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>📜 Voucher Logs — Superadmin Only</div>
      </div>
    </div>
  );
}
