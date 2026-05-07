"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { Plan, PlanCreatePayload, PlanUpdatePayload, getPlans, createPlan, updatePlan, archivePlan, duplicatePlan, deletePlan } from "@/lib/adminPlans";
import { listMenuTemplates } from "@/lib/api/menuTemplates";
import { MenuTemplate } from "@/types/menuTemplate";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, ANIM_CSS,
} from "@/lib/adminTheme";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import Link from "next/link";

const fetcher = () => getPlans();

const SAMPLE: Plan[] = [
  { id: 1, code: "standard", name: "Standard", price_monthly: 9.99, price_yearly: 99, max_companies: 5, max_users: 10, menu_template_id: null, features: ["ledger", "vouchers", "reports"], is_active: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
];

const PLAN_ICONS: Record<string, string> = { enterprise: "🏆", premium: "💎", standard: "📦" };
const PLAN_COLORS: Record<string, { bg: string; text: string; border: string; grad: string }> = {
  enterprise: { bg: "rgba(124,58,237,0.12)", text: "#c4b5fd", border: "rgba(124,58,237,0.3)", grad: "linear-gradient(135deg, #7c3aed, #a855f7)" },
  premium: { bg: "rgba(245,158,11,0.12)", text: "#fcd34d", border: "rgba(245,158,11,0.3)", grad: "linear-gradient(135deg, #d97706, #f59e0b)" },
  standard: { bg: "rgba(6,182,212,0.12)", text: "#67e8f9", border: "rgba(6,182,212,0.3)", grad: "linear-gradient(135deg, #0891b2, #06b6d4)" },
};
function getPlanStyle(code: string) {
  return PLAN_COLORS[code.toLowerCase()] || PLAN_COLORS.standard;
}

type FormProps = { mode: "create" | "edit"; initial?: Plan; onCancel: () => void; onSaved: () => void };

function PlanForm({ mode, initial, onCancel, onSaved }: FormProps) {
  const { showToast } = useToast();
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [priceMonthly, setPriceMonthly] = useState(initial?.price_monthly != null ? String(initial.price_monthly) : "");
  const [priceYearly, setPriceYearly] = useState(initial?.price_yearly != null ? String(initial.price_yearly) : "");
  const [maxCompanies, setMaxCompanies] = useState(initial?.max_companies != null ? String(initial.max_companies) : "");
  const [maxUsers, setMaxUsers] = useState(initial?.max_users != null ? String(initial.max_users) : "");
  const [menuTemplateId, setMenuTemplateId] = useState<number | null>(initial?.menu_template_id ?? null);
  const [features, setFeatures] = useState(initial?.features?.join(", ") ?? "");
  const [isActive, setIsActive] = useState(initial?.is_active ?? true);
  const [saving, setSaving] = useState(false);
  const [propagateToTenants, setPropagateToTenants] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (mode === "create") setIsActive(true); }, [mode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "create" && !code.trim()) { setError("Code is required."); return; }
    if (!name.trim()) { setError("Name is required."); return; }
    if (!/^[a-z0-9_-]+$/.test(code.trim())) { setError("Code must use only [a-z0-9_-]."); return; }
    const pm = priceMonthly.trim() === "" ? null : Number(priceMonthly);
    const py = priceYearly.trim() === "" ? null : Number(priceYearly);
    if (pm == null && py == null) { setError("At least one price must be set."); return; }
    const mc = maxCompanies.trim() === "" ? null : Number(maxCompanies);
    const mu = maxUsers.trim() === "" ? null : Number(maxUsers);
    
    const fArr = features.split(",").map((f) => f.trim()).filter(Boolean);
    
    // SMART SYNC: Inject the template ID into the features list so the Layout can find it
    if (menuTemplateId) {
      const tag = `template_id:${menuTemplateId}`;
      if (!fArr.includes(tag)) fArr.push(tag);
    }

    const payload = { 
      code: code.trim(), 
      name: name.trim(), 
      price_monthly: pm, 
      price_yearly: py, 
      max_companies: mc, 
      max_users: mu, 
      features: fArr, 
      menu_template_id: menuTemplateId,
      is_active: isActive 
    };
    setSaving(true);
    try {
      if (mode === "create") { await createPlan(payload as PlanCreatePayload); }
      else if (initial) {
        const upd: PlanUpdatePayload = {};
        if (payload.name !== initial.name) upd.name = payload.name;
        if (payload.price_monthly !== initial.price_monthly) upd.price_monthly = payload.price_monthly!;
        if (payload.price_yearly !== initial.price_yearly) upd.price_yearly = payload.price_yearly!;
        if (payload.max_companies !== initial.max_companies) upd.max_companies = payload.max_companies!;
        if (payload.max_users !== initial.max_users) upd.max_users = payload.max_users!;
        if (JSON.stringify(payload.features) !== JSON.stringify(initial.features)) upd.features = payload.features!;
        if (payload.menu_template_id !== initial.menu_template_id) upd.menu_template_id = payload.menu_template_id;
        if (payload.is_active !== initial.is_active) upd.is_active = payload.is_active;
        await updatePlan(initial.id, upd);
        
        if (propagateToTenants && payload.menu_template_id !== undefined) {
          try {
            const tenantsRes = await api.get<any[]>("/admin/tenants");
            const tenants = tenantsRes.data || [];
            const matching = tenants.filter((t: any) => (t.plan || "").toLowerCase() === code.toLowerCase());
            
            if (matching.length > 0) {
              if (confirm(`Propagate Plan Changes to all ${matching.length} tenants? \n\nThis will synchronize their plan features and ensure the baseline template is available for all members, without removing their individual custom overrides.`)) {
                showToast({ title: "Syncing Tenants", description: `Updating ${matching.length} members...`, variant: "info" });
                let count = 0;
                for (const tenant of matching) {
                  // We update the plan reference to trigger a backend recalculation of feature strings
                  await api.put(`/admin/tenants/${tenant.id}`, { plan: code });
                  count++;
                }
                showToast({ title: "Sync Complete", description: `Successfully updated ${count} tenants.`, variant: "success" });
              }
            }
          } catch (syncErr) {
            showToast({ title: "Sync Partial/Failed", description: "One or more tenants could not be updated.", variant: "error" });
            console.error("Propagation failed:", syncErr);
          }
        }
      }
      onSaved();
    } catch (err: any) { setError(err?.response?.data?.detail || "Failed to save plan"); }
    finally { setSaving(false); }
  };

  const fld: React.CSSProperties = { ...G.inputStyle, fontSize: "13px" };
  const lbl: React.CSSProperties = { color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" };

  return (
    <div style={{ ...G.card, padding: "28px", marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>{mode === "create" ? "✨" : "✏️"}</div>
          <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>{mode === "create" ? "Create New Plan" : `Edit — ${initial?.name}`}</div>
        </div>
        <button onClick={onCancel} style={{ ...G.btnGhost, fontSize: "12px" }}>✕ Cancel</button>
      </div>
      {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px" }}>⚠️ {error}</div>}
      <form onSubmit={handleSubmit}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "16px", marginBottom: "16px" }}>
          <div><label style={lbl}>Code {mode === "edit" && <span style={{ color: "#475569" }}>(locked)</span>}</label><input value={code} onChange={(e) => setCode(e.target.value)} disabled={mode === "edit"} placeholder="standard" style={{ ...fld, opacity: mode === "edit" ? 0.5 : 1 }} /></div>
          <div><label style={lbl}>Name *</label><input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Standard" style={fld} /></div>
          <div><label style={lbl}>Monthly Price</label><input type="number" min={0} step="0.01" value={priceMonthly} onChange={(e) => setPriceMonthly(e.target.value)} placeholder="9.99" style={fld} /></div>
          <div><label style={lbl}>Yearly Price</label><input type="number" min={0} step="0.01" value={priceYearly} onChange={(e) => setPriceYearly(e.target.value)} placeholder="99.00" style={fld} /></div>
          <div><label style={lbl}>Max Companies</label><input type="number" min={0} value={maxCompanies} onChange={(e) => setMaxCompanies(e.target.value)} placeholder="5" style={fld} /></div>
          <div><label style={lbl}>Max Users</label><input type="number" min={0} value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} placeholder="10" style={fld} /></div>
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={lbl}>Feature Template (Applied to all tenants on this plan)</label>
          <TemplateSelector value={menuTemplateId} onChange={setMenuTemplateId} />
        </div>
        <div style={{ marginBottom: "16px" }}>
          <label style={lbl}>Features (comma-separated legacy tags)</label>
          <input value={features} onChange={(e) => setFeatures(e.target.value)} placeholder="ledger, vouchers, reports" style={fld} />
        </div>
        {mode === "edit" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", background: "rgba(255,255,255,0.04)", borderRadius: "10px", marginBottom: "16px" }}>
              <span style={{ color: "#cbd5e1", fontSize: "13px" }}>Plan is active</span>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px", background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.15)", borderRadius: "10px", marginBottom: "16px" }}>
              <div>
                <div style={{ color: "#c4b5fd", fontSize: "13px", fontWeight: 700 }}>Propagate to Members</div>
                <div style={{ color: "#94a3b8", fontSize: "11px" }}>Apply this template to all existing tenants on this plan</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <input type="checkbox" checked={propagateToTenants} onChange={(e) => setPropagateToTenants(e.target.checked)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
              </div>
            </div>
          </>
        )}
        <button type="submit" disabled={saving} style={{ ...G.btnPrimary, opacity: saving ? 0.7 : 1 }}>
          {saving ? "Saving…" : mode === "create" ? "✨ Create Plan" : "💾 Save Changes"}
        </button>
      </form>
    </div>
  );
}

function TemplateSelector({ value, onChange }: { value: number | null, onChange: (v: number | null) => void }) {
  const { data: templates, isLoading } = useSWR<MenuTemplate[]>("/admin/menu-templates", () => listMenuTemplates());
  
  return (
    <select 
      value={value ?? ""} 
      onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
      style={{ ...G.inputStyle, fontSize: "13px" }}
    >
      <option value="">— No Template (Access Denied by default) —</option>
      {templates?.map(t => (
        <option key={t.id} value={t.id}>{t.name}</option>
      ))}
      {isLoading && <option disabled>Loading templates...</option>}
    </select>
  );
}

function PlanTemplateBadge({ plan }: { plan: Plan }) {
  const { data: templates } = useSWR<MenuTemplate[]>("/admin/menu-templates", () => listMenuTemplates());
  const template = templates?.find(t => t.id === plan.menu_template_id);
  
  if (!plan.menu_template_id) return <span style={{ color: "#475569", fontSize: "11px" }}>None</span>;
  if (!template) return <span style={{ color: "#64748b", fontSize: "11px" }}>ID: {plan.menu_template_id}</span>;
  
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
      <span style={{ fontSize: "12px" }}>📂</span>
      <span style={{ fontWeight: 600, color: "#94a3b8", fontSize: "12px" }}>{template.name}</span>
    </div>
  );
}

export default function AdminPlansPage() {
  const { data, error, isLoading, mutate } = useSWR<Plan[]>("/admin/plans", fetcher);
  const [editMode, setEditMode] = useState<"list" | "create" | "edit">("list");
  const [selected, setSelected] = useState<Plan | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const plans = (error ? SAMPLE : data) || [];
  const sorted = useMemo(() => [...plans].sort((a, b) => a.code.localeCompare(b.code)), [plans]);

  const closeForm = () => { setSelected(null); setEditMode("list"); };
  const refresh = async () => { await mutate(); closeForm(); };

  const runArchive = async (plan: Plan) => {
    if (!confirm(`Archive plan "${plan.name}"?`)) return;
    setActionError(null);
    try { await archivePlan(plan.id); await mutate(); } catch (err: any) { setActionError(err?.response?.data?.detail || "Failed to archive"); }
  };
  const runDuplicate = async (plan: Plan) => {
    const code = prompt("New plan code:", `${plan.code}_copy`);
    if (code === null) return;
    const name = prompt("New plan name:", `${plan.name} Copy`);
    try { await duplicatePlan(plan.id, { code: code.trim() || undefined, name: name?.trim() || undefined }); await mutate(); } catch (err: any) { setActionError(err?.response?.data?.detail || "Failed to duplicate"); }
  };
  const runDelete = async (plan: Plan) => {
    if (!confirm(`Delete plan "${plan.name}"? This cannot be undone.`)) return;
    setActionError(null);
    try { await deletePlan(plan.id); await mutate(); } catch (err: any) { setActionError(err?.response?.data?.detail || "Failed to delete"); }
  };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="📋" title="Plans & Pricing" subtitle="Manage subscription plans, feature limits, and pricing tiers for tenants.">
          {editMode === "list" && <button onClick={() => setEditMode("create")} style={G.btnPrimary}>+ New Plan</button>}
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {actionError && <div style={{ marginBottom: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "12px 18px", color: "#fca5a5", fontSize: "13px" }}>⚠️ {actionError}</div>}

        {/* Plan cards summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px", marginBottom: "28px" }}>
          {sorted.map((p) => {
            const st = getPlanStyle(p.code);
            const icon = PLAN_ICONS[p.code.toLowerCase()] || "📦";
            return (
              <div key={p.id} className="g-card-hover" style={{ ...G.card, background: st.bg, borderColor: st.border, padding: "20px 22px", transition: "all 0.2s" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                  <span style={{ fontSize: "24px" }}>{icon}</span>
                  <span style={{ padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: p.is_active ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.15)", color: p.is_active ? "#6ee7b7" : "#94a3b8", border: `1px solid ${p.is_active ? "rgba(16,185,129,0.3)" : "rgba(100,116,139,0.3)"}` }}>{p.is_active ? "Active" : "Archived"}</span>
                </div>
                <div style={{ fontWeight: 800, fontSize: "16px", color: st.text, marginBottom: "4px" }}>{p.name}</div>
                <div style={{ fontFamily: "monospace", fontSize: "11px", color: "#475569", marginBottom: "8px" }}>{p.code}</div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                  {p.price_monthly != null && <div style={{ background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", color: "#94a3b8" }}>${p.price_monthly}/mo</div>}
                  {p.price_yearly != null && <div style={{ background: "rgba(255,255,255,0.06)", padding: "3px 8px", borderRadius: "6px", fontSize: "12px", color: "#94a3b8" }}>${p.price_yearly}/yr</div>}
                </div>
                <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                  <button onClick={() => { setSelected(p); setEditMode("edit"); }} className="g-btn-action" style={{ flex: 1, padding: "7px 0", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}>✏️ Edit</button>
                  <button onClick={() => runDuplicate(p)} className="g-btn-action" style={{ padding: "7px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}>⧉</button>
                  <button onClick={() => runDelete(p)} className="g-btn-danger-sm" style={{ padding: "7px 10px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "8px", color: "#fca5a5", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}>🗑️</button>
                </div>
              </div>
            );
          })}
          {isLoading && <div style={{ ...G.card, padding: "40px", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "30px", height: "30px", border: "3px solid rgba(124,58,237,0.3)", borderTop: "3px solid #7c3aed", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /></div>}
          {!isLoading && plans.length === 0 && <GhostEmpty message="No plans created yet." />}
        </div>

        {/* Form */}
        {(editMode === "create" || editMode === "edit") && (
          <PlanForm mode={editMode === "create" ? "create" : "edit"} initial={editMode === "edit" ? selected ?? undefined : undefined} onCancel={closeForm} onSaved={refresh} />
        )}

        {/* Detail table */}
        {plans.length > 0 && (
          <div style={{ ...G.card, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", color: "#64748b", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Full Details</div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {["Code", "Name", "Monthly", "Yearly", "Co.", "Users", "Features", "Status", "Actions"].map((h) => (
                    <th key={h} style={G.tableHeader}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.id} className="g-row" style={{ borderBottom: i < sorted.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s" }}>
                    <td style={G.tableCell}><span style={{ fontFamily: "monospace", fontSize: "12px", color: "#67e8f9" }}>{p.code}</span></td>
                    <td style={{ ...G.tableCell, fontWeight: 600, color: "#e2e8f0" }}>{p.name}</td>
                    <td style={G.tableCell}>{p.price_monthly != null ? <span style={{ color: "#6ee7b7" }}>${p.price_monthly}</span> : "—"}</td>
                    <td style={G.tableCell}>{p.price_yearly != null ? <span style={{ color: "#6ee7b7" }}>${p.price_yearly}</span> : "—"}</td>
                    <td style={G.tableCell}>{p.max_companies ?? "∞"}</td>
                    <td style={G.tableCell}>{p.max_users ?? "∞"}</td>
                    <td style={G.tableCell}><PlanTemplateBadge plan={p} /></td>
                    <td style={G.tableCell}><div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>{(p.features || []).slice(0, 3).map((f) => <span key={f} style={{ padding: "1px 6px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "4px", fontSize: "10px", color: "#c4b5fd" }}>{f}</span>)}{(p.features?.length || 0) > 3 && <span style={{ padding: "1px 6px", background: "rgba(100,116,139,0.15)", borderRadius: "4px", fontSize: "10px", color: "#64748b" }}>+{(p.features?.length || 0) - 3}</span>}</div></td>
                    <td style={G.tableCell}><span style={{ padding: "3px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 700, background: p.is_active ? "rgba(16,185,129,0.15)" : "rgba(100,116,139,0.12)", color: p.is_active ? "#6ee7b7" : "#94a3b8", border: `1px solid ${p.is_active ? "rgba(16,185,129,0.3)" : "rgba(100,116,139,0.25)"}` }}>{p.is_active ? "Active" : "Archived"}</span></td>
                    <td style={G.tableCell}>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <button onClick={() => { setSelected(p); setEditMode("edit"); }} className="g-btn-action" style={{ padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#94a3b8", fontSize: "11px", cursor: "pointer", transition: "all 0.15s" }}>Edit</button>
                        <button onClick={() => runArchive(p)} className="g-btn-action" style={{ padding: "4px 8px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#94a3b8", fontSize: "11px", cursor: "pointer", transition: "all 0.15s" }}>Archive</button>
                        <button onClick={() => runDelete(p)} className="g-btn-danger-sm" style={{ padding: "4px 8px", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "6px", color: "#fca5a5", fontSize: "11px", cursor: "pointer", transition: "all 0.15s" }}>Del</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>📋 Plans & Pricing — Superadmin Only</div>
      </div>
    </div>
  );
}
