"use client";

import Link from "next/link";
import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { getPlans, Plan } from "@/lib/adminPlans";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty,
  Pill, planColor, statusColor, ANIM_CSS,
} from "@/lib/adminTheme";

type Tenant = {
  id: number; name: string; plan?: string | null;
  status?: string | null; companies_count?: number | null;
  company_count?: number | null; expires_at?: string | null;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data as Tenant[]);

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(d?: string | null) {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { label: "Expired", color: "#f87171" };
  if (diff <= 7) return { label: `${diff}d left`, color: "#fbbf24" };
  if (diff <= 30) return { label: `${diff}d left`, color: "#facc15" };
  return { label: `${diff}d left`, color: "#34d399" };
}

export default function AdminBillingPage() {
  const { showToast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<Tenant[]>("/admin/tenants", fetcher, { refreshInterval: 60000 });
  const { data: plansData } = useSWR<Plan[]>("/admin/plans", () => getPlans());
  
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [payTenant, setPayTenant] = useState<Tenant | null>(null);

  const tenants = data || [];
  const plansList = plansData || [];

  const stats = useMemo(() => {
    const planCounts: Record<string, number> = {};
    let expiring = 0;
    let expired = 0;
    tenants.forEach((t) => {
      const p = (t.plan || "standard").toLowerCase();
      planCounts[p] = (planCounts[p] || 0) + 1;
      if (t.expires_at) {
        const diff = new Date(t.expires_at).getTime() - Date.now();
        if (diff < 0) expired++;
        else if (diff < 30 * 86400000) expiring++;
      }
    });
    return { planCounts, expiring, expired };
  }, [tenants]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return tenants.filter((t) => {
      const mq = !q || (t.name || "").toLowerCase().includes(q) || String(t.id).includes(q);
      const mp = !planFilter || (t.plan || "").toLowerCase() === planFilter;
      return mq && mp;
    });
  }, [tenants, search, planFilter]);

  const planCodes = ["enterprise", "premium", "standard"];

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="💳" title="Billing & Plans" subtitle="Monitor tenant subscriptions, track expirations, and manage plan assignments.">
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {/* Summary Cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "14px", marginBottom: "28px" }}>
          {[
            { label: "Total Tenants", value: tenants.length, icon: "🏢", glow: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.35)", bg: "rgba(124,58,237,0.12)" },
            { label: "Expiring ≤30d", value: stats.expiring, icon: "⏰", glow: stats.expiring > 0 ? "rgba(245,158,11,0.15)" : "transparent", border: stats.expiring > 0 ? "rgba(245,158,11,0.35)" : "rgba(100,116,139,0.2)", bg: stats.expiring > 0 ? "rgba(245,158,11,0.10)" : "rgba(100,116,139,0.08)" },
            { label: "Expired", value: stats.expired, icon: "🚨", glow: stats.expired > 0 ? "rgba(239,68,68,0.15)" : "transparent", border: stats.expired > 0 ? "rgba(239,68,68,0.35)" : "rgba(100,116,139,0.2)", bg: stats.expired > 0 ? "rgba(239,68,68,0.10)" : "rgba(100,116,139,0.08)" },
          ].map((s) => (
            <div key={s.label} className="g-card-hover" style={{ ...G.card, background: s.bg, borderColor: s.border, padding: "18px 20px", boxShadow: `0 4px 20px ${s.glow}`, transition: "all 0.2s" }}>
              <div style={{ fontSize: "24px", marginBottom: "6px" }}>{s.icon}</div>
              <div style={{ fontSize: "28px", fontWeight: 800, color: "#f1f5f9" }}>{s.value}</div>
              <div style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 500 }}>{s.label}</div>
            </div>
          ))}
          {planCodes.map((p) => {
            const c = planColor(p);
            const count = stats.planCounts[p] || 0;
            return (
              <div key={p} className="g-card-hover" style={{ ...G.card, background: c.bg, borderColor: c.border, padding: "18px 20px", boxShadow: `0 4px 20px ${c.bg}`, transition: "all 0.2s", cursor: "pointer" }} onClick={() => setPlanFilter(planFilter === p ? "" : p)}>
                <div style={{ fontSize: "24px", marginBottom: "6px" }}>{p === "enterprise" ? "🏆" : p === "premium" ? "💎" : "📦"}</div>
                <div style={{ fontSize: "28px", fontWeight: 800, color: c.text }}>{count}</div>
                <div style={{ color: c.text, opacity: 0.7, fontSize: "12px", fontWeight: 600, textTransform: "capitalize" }}>{p}</div>
              </div>
            );
          })}
        </div>

        {/* Filter toolbar */}
        <div style={{ ...G.card, padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search tenants…" style={{ ...G.inputStyle, maxWidth: "280px" }} />
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} style={G.selectStyle}>
            <option value="">All Plans</option>
            {planCodes.map((p) => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
          </select>
          {(search || planFilter) && (
            <button onClick={() => { setSearch(""); setPlanFilter(""); }} style={{ ...G.btnDanger, padding: "8px 14px" }}>✕ Clear</button>
          )}
          <span style={{ color: "#64748b", fontSize: "13px", marginLeft: "auto" }}>{filtered.length} tenants</span>
        </div>

        {/* Table */}
        <div style={{ ...G.card, overflow: "hidden" }}>
          {isLoading ? <GhostSpinner /> : filtered.length === 0 ? <GhostEmpty message="No billing data found." /> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Tenant", "Plan", "Status", "Companies", "Expires At", "Actions"].map((h) => (
                    <th key={h} style={G.tableHeader}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const cc = typeof t.companies_count === "number" ? t.companies_count : typeof t.company_count === "number" ? t.company_count : 0;
                  const dl = daysLeft(t.expires_at);
                  const pc = planColor(t.plan);
                  const sc = statusColor(t.status);
                  return (
                    <tr key={t.id} className="g-row" style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s", animation: `fadeIn 0.3s ease ${i * 0.02}s both` }}>
                      <td style={G.tableCell}>
                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                          <div style={{ width: "34px", height: "34px", borderRadius: "10px", background: `linear-gradient(135deg, ${pc.text}33, ${pc.text}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", fontWeight: 800, color: pc.text, flexShrink: 0 }}>{(t.name || "?")[0].toUpperCase()}</div>
                          <div>
                            <div style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>{t.name}</div>
                            <div style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace" }}>#{t.id}</div>
                          </div>
                        </div>
                      </td>
                      <td style={G.tableCell}><Pill bg={pc.bg} text={pc.text} border={pc.border}>{t.plan || "standard"}</Pill></td>
                      <td style={G.tableCell}><Pill bg={sc.bg} text={sc.text} border={sc.border}>{(t.status || "unknown").toLowerCase() === "active" ? "● " : ""}{t.status || "unknown"}</Pill></td>
                      <td style={{ ...G.tableCell, textAlign: "center" }}><span style={{ fontWeight: 700, color: "#e2e8f0" }}>{cc}</span></td>
                      <td style={G.tableCell}>
                        <div style={{ fontSize: "13px" }}>{fmt(t.expires_at)}</div>
                        {dl && <div style={{ fontSize: "11px", fontWeight: 700, color: dl.color }}>{dl.label}</div>}
                      </td>
                      <td style={G.tableCell}>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button onClick={() => setPayTenant(t)} className="g-btn-action" style={{ padding: "6px 12px", background: "rgba(52,211,153,0.1)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: "8px", color: "#34d399", fontSize: "12px", transition: "all 0.15s" }}>
                            💰 Record Payment
                          </button>
                          <Link href={`/admin/tenants/${t.id}`} className="g-btn-action" style={{ padding: "6px 12px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", fontSize: "12px", textDecoration: "none", display: "inline-block", transition: "all 0.15s" }}>
                            ✏️ Manage
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {payTenant && (
          <RecordPaymentModal 
            tenant={payTenant} 
            plans={plansList} 
            onCancel={() => setPayTenant(null)} 
            onSuccess={() => { setPayTenant(null); mutate(); }} 
          />
        )}

        {error && <div style={{ marginTop: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "16px", color: "#fca5a5", fontSize: "13px" }}>⚠️ {(error as any)?.response?.data?.detail || "Failed to load billing data"}</div>}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>💳 Billing — Superadmin Only</div>
      </div>
    </div>
  );
}

function RecordPaymentModal({ tenant, plans, onCancel, onSuccess }: { tenant: Tenant; plans: Plan[]; onCancel: () => void; onSuccess: () => void }) {
  const { showToast } = useToast();
  const [planCode, setPlanCode] = useState(tenant.plan || "standard");
  const [duration, setDuration] = useState<"monthly" | "yearly">("monthly");
  const [amount, setAmount] = useState<number>(0);
  const [method, setMethod] = useState("CASH");
  const [selectedBank, setSelectedBank] = useState("");
  const [newBankName, setNewBankName] = useState("");
  const [ref, setRef] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: bankData, mutate: mutateBanks } = useSWR("/admin/tenants/payment-modes", (url) => api.get(url).then(r => r.data));
  const banks = useMemo(() => {
    const raw = (bankData || []) as any[];
    return raw.filter(b => !["CASH", "BANK"].includes(b.name.toUpperCase()));
  }, [bankData]);

  const selectedPlan = useMemo(() => plans.find(p => p.code === planCode), [plans, planCode]);

  useEffect(() => {
    if (selectedPlan) {
      setAmount(duration === "monthly" ? selectedPlan.price_monthly || 0 : selectedPlan.price_yearly || 0);
    }
  }, [selectedPlan, duration]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      let bankNameToUse = selectedBank;
      if (method === "BANK" && selectedBank === "NEW") {
        if (!newBankName.trim()) throw new Error("Please enter the new bank name");
        // Create the new bank mode
        const res = await api.post("/admin/tenants/payment-modes", { name: newBankName });
        bankNameToUse = res.data.name;
        await mutateBanks(); // Refresh bank list
      }

      const now = new Date();
      let start = tenant.expires_at ? new Date(tenant.expires_at) : now;
      if (start < now) start = now;

      const end = new Date(start);
      if (duration === "monthly") end.setMonth(end.getMonth() + 1);
      else end.setFullYear(end.getFullYear() + 1);

      await api.post(`/admin/tenants/${tenant.id}/record-payment`, {
        tenant_id: tenant.id,
        plan_code: planCode,
        amount_paid: amount,
        period_start: start.toISOString(),
        period_end: end.toISOString(),
        payment_method: method,
        bank_name: method === "BANK" ? bankNameToUse : null,
        reference_no: ref,
        status: method === "CREDIT" ? "UNPAID" : "PAID"
      });

      showToast({ title: "Success", description: "Payment recorded and license extended.", variant: "success" });
      onSuccess();
    } catch (err: any) {
      console.error("Payment Record Error:", err);
      const description = getApiErrorMessage(err);
      showToast({ title: "Error", description, variant: "error" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
      <div style={{ ...G.card, width: "100%", maxWidth: "480px", padding: "28px", animation: "slideUp 0.3s ease" }}>
        <div style={{ marginBottom: "20px" }}>
          <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#f1f5f9", margin: "0 0 4px 0" }}>Record Payment</h2>
          <p style={{ fontSize: "13px", color: "#94a3b8", margin: 0 }}>Processing subscription for <b>{tenant.name}</b></p>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: "16px", marginBottom: "24px" }}>
            <div>
              <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Subscription Plan</label>
              <select value={planCode} onChange={(e) => setPlanCode(e.target.value)} style={G.inputStyle}>
                {plans.map(p => <option key={p.id} value={p.code}>{p.name}</option>)}
              </select>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Duration</label>
                <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", borderRadius: "8px", padding: "4px" }}>
                  {(["monthly", "yearly"] as const).map(d => (
                    <button key={d} type="button" onClick={() => setDuration(d)} style={{ flex: 1, padding: "6px", fontSize: "12px", fontWeight: 600, border: "none", borderRadius: "6px", background: duration === d ? "rgba(124,58,237,0.2)" : "transparent", color: duration === d ? "#c4b5fd" : "#64748b", transition: "all 0.2s" }}>
                      {d[0].toUpperCase() + d.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Amount Paid</label>
                <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={G.inputStyle} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Payment Method</label>
                <select value={method} onChange={(e) => setMethod(e.target.value)} style={G.inputStyle}>
                  <option value="CASH">CASH</option>
                  <option value="BANK">BANK</option>
                  <option value="CREDIT">CREDIT (Pay Later)</option>
                  <option value="ESEWA">ESEWA</option>
                  <option value="KHALTI">KHALTI</option>
                  <option value="ONLINE">ONLINE</option>
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Reference #</label>
                <input value={ref} onChange={(e) => setRef(e.target.value)} style={G.inputStyle} placeholder="CHQ-XXX / TXN-ID" />
              </div>

              {method === "BANK" && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <label style={{ display: "block", fontSize: "11px", color: "#64748b", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Select Bank</label>
                  <select value={selectedBank} onChange={(e) => setSelectedBank(e.target.value)} style={{ ...G.inputStyle, marginBottom: selectedBank === "NEW" ? "12px" : "0" }}>
                    {!selectedBank && <option value="">-- Select a bank --</option>}
                    {banks.map(b => <option key={b.id} value={b.name}>{b.name}</option>)}
                    <option value="NEW">➕ New Bank...</option>
                  </select>
                  {selectedBank === "NEW" && (
                    <input 
                      value={newBankName} 
                      onChange={(e) => setNewBankName(e.target.value)} 
                      style={G.inputStyle} 
                      placeholder="Enter Bank Name (e.g. Nabil Bank)" 
                      autoFocus
                    />
                  )}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button type="button" onClick={onCancel} style={{ ...G.btnGhost, flex: 1 }}>Cancel</button>
            <button type="submit" disabled={loading} style={{ ...G.btnPrimary, flex: 1, position: "relative" }}>
              {loading ? "Processing..." : "💾 Update Subscription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
