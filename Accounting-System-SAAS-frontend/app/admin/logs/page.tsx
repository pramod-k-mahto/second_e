"use client";

import useSWR from "swr";
import { useState, useMemo } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, ANIM_CSS,
} from "@/lib/adminTheme";

type Log = {
  id: number; timestamp: string; actor?: string | null;
  type: string; description: string; tenant_id?: number | null;
};

const DEMO_LOGS: Log[] = [
  { id: 1, timestamp: new Date().toISOString(), actor: "admin@system.com", type: "plan_change", description: "Changed plan from Standard to Premium for Tenant #1", tenant_id: 1 },
  { id: 2, timestamp: new Date(Date.now() - 60000).toISOString(), actor: "system", type: "maintenance", description: "Ran demo data seeding for Tenant #2", tenant_id: 2 },
  { id: 3, timestamp: new Date(Date.now() - 120000).toISOString(), actor: "superadmin@example.com", type: "tenant_created", description: "New tenant 'Acme Corp' created with Standard plan", tenant_id: 3 },
];

const fetcher = (url: string) => api.get(url).then((r) => r.data as Log[]);

function getLogStyle(type: string) {
  const t = type.toLowerCase();
  if (t.includes("create")) return { icon: "✨", bg: "rgba(16,185,129,0.15)", text: "#6ee7b7", border: "rgba(16,185,129,0.3)" };
  if (t.includes("delete") || t.includes("reset")) return { icon: "🗑️", bg: "rgba(239,68,68,0.15)", text: "#fca5a5", border: "rgba(239,68,68,0.3)" };
  if (t.includes("plan") || t.includes("upgrade")) return { icon: "💎", bg: "rgba(124,58,237,0.15)", text: "#c4b5fd", border: "rgba(124,58,237,0.3)" };
  if (t.includes("maintenance")) return { icon: "🔧", bg: "rgba(6,182,212,0.15)", text: "#67e8f9", border: "rgba(6,182,212,0.3)" };
  if (t.includes("login") || t.includes("auth")) return { icon: "🔐", bg: "rgba(245,158,11,0.15)", text: "#fcd34d", border: "rgba(245,158,11,0.3)" };
  return { icon: "📋", bg: "rgba(100,116,139,0.15)", text: "#94a3b8", border: "rgba(100,116,139,0.3)" };
}

function formatType(type: string) {
  return type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export default function AdminLogsPage() {
  const { data, error, isLoading, mutate } = useSWR<Log[]>("/admin/logs?skip=0&limit=100", fetcher);
  const logs = error ? DEMO_LOGS : (data || []);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");

  const types = useMemo(() => {
    const s = new Set(logs.map((l) => l.type));
    return Array.from(s).sort();
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter((l) => {
      const mq = !q || (l.description || "").toLowerCase().includes(q) || (l.actor || "").toLowerCase().includes(q);
      const mt = !typeFilter || l.type === typeFilter;
      return mq && mt;
    });
  }, [logs, search, typeFilter]);

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="📊" title="Activity Logs" subtitle="Review admin events — plan changes, maintenance tasks, tenant creation, and more.">
          <button onClick={() => mutate()} style={G.btnGhost} className="g-btn-ghost">↻ Refresh</button>
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px", marginBottom: "24px" }}>
          {[
            { label: "Total Events", value: logs.length, icon: "📋", color: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.3)" },
            { label: "Filtered", value: filtered.length, icon: "🔍", color: "rgba(6,182,212,0.15)", border: "rgba(6,182,212,0.3)" },
          ].map((s) => (
            <div key={s.label} style={{ ...G.card, background: s.color, borderColor: s.border, padding: "16px 18px" }}>
              <div style={{ fontSize: "20px", marginBottom: "4px" }}>{s.icon}</div>
              <div style={{ fontSize: "26px", fontWeight: 800, color: "#f1f5f9" }}>{s.value}</div>
              <div style={{ color: "#94a3b8", fontSize: "12px" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ ...G.card, padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search by description or actor…" style={{ ...G.inputStyle, maxWidth: "300px" }} />
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} style={G.selectStyle}>
            <option value="">All Types</option>
            {types.map((t) => <option key={t} value={t}>{formatType(t)}</option>)}
          </select>
          {(search || typeFilter) && (
            <button onClick={() => { setSearch(""); setTypeFilter(""); }} style={{ ...G.btnDanger, padding: "8px 14px" }}>✕ Clear</button>
          )}
          <span style={{ color: "#64748b", fontSize: "13px", marginLeft: "auto" }}>{filtered.length} events</span>
        </div>

        {/* Logs */}
        <div style={{ ...G.card, overflow: "hidden" }}>
          {isLoading ? <GhostSpinner /> : filtered.length === 0 ? <GhostEmpty message="No activity logs found." /> : (
            <div>
              {filtered.map((log, i) => {
                const ls = getLogStyle(log.type);
                return (
                  <div
                    key={log.id}
                    className="g-row"
                    style={{
                      padding: "16px 18px",
                      borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none",
                      display: "flex",
                      gap: "14px",
                      alignItems: "flex-start",
                      transition: "background 0.15s",
                      animation: `fadeIn 0.3s ease ${i * 0.02}s both`,
                    }}
                  >
                    <div style={{ width: "36px", height: "36px", flexShrink: 0, borderRadius: "10px", background: ls.bg, border: `1px solid ${ls.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>
                      {ls.icon}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                        <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: ls.bg, border: `1px solid ${ls.border}`, color: ls.text }}>
                          {formatType(log.type)}
                        </span>
                        {log.tenant_id && (
                          <span style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace" }}>Tenant #{log.tenant_id}</span>
                        )}
                      </div>
                      <div style={{ color: "#cbd5e1", fontSize: "13px", lineHeight: 1.5 }}>{log.description}</div>
                      <div style={{ marginTop: "4px", color: "#475569", fontSize: "11px" }}>
                        {log.actor && <span style={{ color: "#64748b" }}>👤 {log.actor} · </span>}
                        {new Date(log.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div style={{ marginTop: "12px", background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#fcd34d", fontSize: "13px" }}>
            ⚠️ Could not reach API — showing demo logs.
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>📊 Activity Logs — Superadmin Only</div>
      </div>
    </div>
  );
}
