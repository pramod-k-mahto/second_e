"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import Link from "next/link";
import {
  G, GhostBg, GhostPageHeader, ANIM_CSS,
} from "@/lib/adminTheme";

type ActionKey = "reseed_demo_data" | "cleanup_test_companies" | "fix_purchase_bill_stock_posted_at" | "repair_standard_ledgers" | "reset_company_transactions";

type Action = {
  key: ActionKey;
  label: string;
  description: string;
  icon: string;
  danger?: boolean;
  requiresCompany?: boolean;
};

const ACTIONS: Action[] = [
  { key: "reseed_demo_data", label: "Reseed Demo Data", icon: "🌱", description: "Safely seed default chart and demo data for newly created companies." },
  { key: "repair_standard_ledgers", label: "Repair Standard Ledgers", icon: "🔧", description: "Ensure all companies have required standard ledgers like Cash, Sales, etc." },
  { key: "cleanup_test_companies", label: "Cleanup Test Companies", icon: "🗂️", description: "Remove stale or empty test companies from the system." },
  { key: "fix_purchase_bill_stock_posted_at", label: "Fix Stock Timestamps", icon: "⏱️", description: "Repair stock movement timestamps to match purchase invoice dates." },
  { key: "reset_company_transactions", label: "Reset Company Data", icon: "⚠️", description: "Permanently DELETE all transactional data (Vouchers, Invoices, Stock) for a specific company ID. Master data (Ledgers, Items) is preserved.", danger: true, requiresCompany: true },
];

type TaskResult = { key: ActionKey; label: string; duration: number; success: boolean; message: string };

export default function AdminMaintenancePage() {
  const [runningAction, setRunningAction] = useState<ActionKey | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);

  async function runAction(action: Action) {
    if (action.requiresCompany && !companyId.trim()) {
      setResults(prev => [{ key: action.key, label: action.label, duration: 0, success: false, message: "Please provide a Company ID for this task." }, ...prev]);
      return;
    }
    if (action.danger && !confirm(`⚠️ Are you absolutely sure you want to run "${action.label}"?\n\nThis action may be destructive and cannot be undone.`)) return;
    setRunningAction(action.key);
    const t0 = Date.now();
    try {
      await api.post("/admin/maintenance/run", { task: action.key, company_id: companyId ? parseInt(companyId) : null });
      const duration = ((Date.now() - t0) / 1000).toFixed(1);
      setResults(prev => [{ key: action.key, label: action.label, duration: parseFloat(duration), success: true, message: `Completed in ${duration}s` }, ...prev.slice(0, 9)]);
    } catch (e: any) {
      const msg = e?.response?.data?.detail || `Failed to run "${action.label}".`;
      setResults(prev => [{ key: action.key, label: action.label, duration: (Date.now() - t0) / 1000, success: false, message: msg }, ...prev.slice(0, 9)]);
    } finally {
      setRunningAction(null);
    }
  }

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="🔧" title="Maintenance" subtitle="Run administrative tasks. Exercise caution — some operations are irreversible.">
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {/* Company ID input */}
        <div style={{ ...G.card, padding: "20px 24px", marginBottom: "24px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ fontSize: "20px" }}>🏗️</div>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600, marginBottom: "4px" }}>Target Company ID</div>
              <div style={{ color: "#64748b", fontSize: "12px" }}>Required for tasks that operate on a specific company</div>
            </div>
            <input
              type="number"
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              placeholder="e.g. 12"
              style={{ ...G.inputStyle, width: "160px" }}
            />
          </div>
        </div>

        {/* Actions grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "16px", marginBottom: "32px" }}>
          {ACTIONS.map((action) => {
            const isRunning = runningAction === action.key;
            const isDisabled = !!runningAction;
            return (
              <div
                key={action.key}
                className="g-card-hover"
                style={{
                  ...G.card,
                  padding: "22px 24px",
                  borderLeft: `3px solid ${action.danger ? "rgba(239,68,68,0.6)" : "rgba(124,58,237,0.4)"}`,
                  display: "flex", flexDirection: "column", gap: "12px",
                  transition: "all 0.2s",
                  opacity: isDisabled && !isRunning ? 0.6 : 1,
                  animation: "fadeIn 0.3s ease",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "12px" }}>
                  <div style={{ fontSize: "28px", flexShrink: 0 }}>{action.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color: action.danger ? "#fca5a5" : "#e2e8f0", marginBottom: "4px" }}>{action.label}</div>
                    <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>{action.description}</div>
                    {action.requiresCompany && (
                      <div style={{ marginTop: "6px", display: "inline-block", padding: "2px 8px", background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "6px", color: "#fcd34d", fontSize: "11px", fontWeight: 600 }}>Requires Company ID</div>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => runAction(action)}
                  disabled={isDisabled}
                  style={{
                    padding: "9px 20px",
                    borderRadius: "10px",
                    border: "none",
                    background: isRunning
                      ? "rgba(255,255,255,0.1)"
                      : action.danger
                        ? "linear-gradient(135deg, #dc2626, #b91c1c)"
                        : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                    color: "#fff",
                    fontSize: "13px",
                    fontWeight: 600,
                    cursor: isDisabled ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    boxShadow: action.danger ? "0 4px 15px rgba(220,38,38,0.3)" : "0 4px 15px rgba(124,58,237,0.3)",
                    alignSelf: "flex-start",
                  }}
                >
                  {isRunning ? (
                    <>
                      <span style={{ width: "14px", height: "14px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                      Running…
                    </>
                  ) : (
                    <>{action.danger ? "⚠️" : "▶"} Run Task</>
                  )}
                </button>
              </div>
            );
          })}
        </div>

        {/* Results log */}
        {results.length > 0 && (
          <div style={{ ...G.card, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#64748b", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
              📋 Task Results
            </div>
            {results.map((r, i) => (
              <div key={i} style={{ padding: "14px 18px", borderBottom: i < results.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", display: "flex", alignItems: "center", gap: "12px", animation: "fadeIn 0.3s ease" }}>
                <span style={{ fontSize: "20px" }}>{r.success ? "✅" : "❌"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0" }}>{r.label}</div>
                  <div style={{ fontSize: "12px", color: r.success ? "#6ee7b7" : "#fca5a5" }}>{r.message}</div>
                </div>
                <div style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace" }}>{new Date().toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>🔧 Maintenance — Superadmin Only · Be careful with destructive tasks</div>
      </div>
    </div>
  );
}
