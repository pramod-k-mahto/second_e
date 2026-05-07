"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, ANIM_CSS,
} from "@/lib/adminTheme";

type AppSettings = {
  default_fiscal_year_start?: string | null;
  default_fiscal_year_end?: string | null;
  enable_multi_tenant: boolean;
  max_companies_per_user: number;
  ghost_tenant_id?: number | null;
  ghost_company_id?: number | null;
};

type Section = {
  id: string;
  icon: string;
  title: string;
  color: string;
};

const SECTIONS: Section[] = [
  { id: "defaults", icon: "⚙️", title: "Global Defaults", color: "#7c3aed" },
  { id: "ghost", icon: "👻", title: "Ghost Financials", color: "#ec4899" },
  { id: "industries", icon: "🏢", title: "Industry Types", color: "#10b981" },
  { id: "fields", icon: "📦", title: "Item Field Config", color: "#f59e0b" },
  { id: "system", icon: "🖥️", title: "System Behavior", color: "#06b6d4" },
];

const labelStyle: React.CSSProperties = {
  color: "#94a3b8", fontSize: "12px", fontWeight: 600,
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block",
};

const toggleStyle = (checked: boolean): React.CSSProperties => ({
  display: "inline-flex",
  width: "44px", height: "24px",
  background: checked ? "linear-gradient(135deg, #7c3aed, #4f46e5)" : "rgba(255,255,255,0.1)",
  borderRadius: "12px",
  position: "relative",
  cursor: "pointer",
  transition: "background 0.2s",
  flexShrink: 0,
  border: `1px solid ${checked ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.15)"}`,
});

const thumbStyle = (checked: boolean): React.CSSProperties => ({
  position: "absolute",
  top: "3px", left: checked ? "23px" : "3px",
  width: "16px", height: "16px",
  borderRadius: "50%",
  background: checked ? "#fff" : "#475569",
  transition: "left 0.2s",
  boxShadow: "0 2px 4px rgba(0,0,0,0.3)",
});

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div style={toggleStyle(checked)} onClick={() => onChange(!checked)}>
      <div style={thumbStyle(checked)} />
    </div>
  );
}

export default function AdminSettingsPage() {
  const { showToast } = useToast();
  const { data: settings, error, mutate, isLoading } = useSWR<AppSettings>("/admin/settings", (url: string) => api.get(url).then(r => r.data));
  const { data: tenants } = useSWR<any[]>("/admin/tenants", (url: string) => api.get(url).then(r => r.data));
  
  const [formData, setFormData] = useState<AppSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState("defaults");

  useEffect(() => {
    if (settings) setFormData(settings);
  }, [settings]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formData) return;
    setSaving(true);
    try {
      await api.put("/admin/settings", formData);
      await mutate();
      showToast({ title: "Success", description: "Global settings updated.", variant: "success" });
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      const description = Array.isArray(detail) 
        ? detail.map((e: any) => e.msg || e).join(", ") 
        : (typeof detail === "string" ? detail : "Failed to update settings");
      showToast({ title: "Error", description, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const ghostTenantCompanies = useSWR<any[]>(formData?.ghost_tenant_id ? `/admin/tenants/${formData.ghost_tenant_id}` : null, 
    (url: string) => api.get(url).then(r => r.data.companies || [])
  );

  if (isLoading || !formData) return <div style={G.pageWrap}><GhostSpinner /></div>;

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="⚙️" title="Admin Settings" subtitle="Configure global defaults and ghost accounting behavior.">
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "24px" }}>
          {/* Sidebar nav */}
          <div style={{ ...G.card, padding: "16px 12px", alignSelf: "start" }}>
            <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", padding: "0 8px", marginBottom: "8px" }}>Sections</div>
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setActiveSection(s.id)}
                style={{
                  width: "100%", textAlign: "left", padding: "12px 14px",
                  borderRadius: "12px", border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: "10px",
                  background: activeSection === s.id ? `${s.color}22` : "transparent",
                  color: activeSection === s.id ? "#fff" : "#64748b",
                  fontSize: "13px", fontWeight: activeSection === s.id ? 700 : 500,
                  marginBottom: "4px", transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                  borderLeft: `3px solid ${activeSection === s.id ? s.color : "transparent"}`,
                  boxShadow: activeSection === s.id ? `0 4px 12px ${s.color}11` : "none",
                }}
              >
                <span style={{ fontSize: "16px", opacity: activeSection === s.id ? 1 : 0.6 }}>{s.icon}</span> {s.title}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit}>
            {/* Global Defaults */}
            {activeSection === "defaults" && (
              <div style={{ ...G.card, padding: "28px", animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(124,58,237,0.4), rgba(79,70,229,0.2))", border: "1px solid rgba(124,58,237,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>⚙️</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Global Defaults</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>Applied when new tenants are created</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "20px" }}>
                  <div>
                    <label style={labelStyle}>Default Fiscal Year Start</label>
                    <input
                      type="date"
                      value={formData.default_fiscal_year_start || ""}
                      onChange={(e) => setFormData((d) => d ? ({ ...d, default_fiscal_year_start: e.target.value }) : null)}
                      style={G.inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Max Companies Per User</label>
                    <input
                      type="number"
                      value={formData.max_companies_per_user}
                      onChange={(e) => setFormData((d) => d ? ({ ...d, max_companies_per_user: parseInt(e.target.value) }) : null)}
                      style={G.inputStyle}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", background: "rgba(255,255,255,0.04)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)" }}>
                  <div>
                    <div style={{ color: "#cbd5e1", fontSize: "14px", fontWeight: 600 }}>Multi-Tenant Mode</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>Enable tenant isolation and subscription logic</div>
                  </div>
                  <Toggle checked={formData.enable_multi_tenant} onChange={(v) => setFormData((d) => d ? ({ ...d, enable_multi_tenant: v }) : null)} />
                </div>
              </div>
            )}

            {/* Ghost Financials */}
            {activeSection === "ghost" && (
              <div style={{ ...G.card, padding: "28px", animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(236,72,153,0.4), rgba(219,39,119,0.2))", border: "1px solid rgba(236,72,153,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>👻</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Ghost Financials</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>Designate the SaaS administrative company</div>
                  </div>
                </div>
                
                <div style={{ background: "rgba(236,72,153,0.05)", border: "1px solid rgba(236,72,153,0.15)", borderRadius: "12px", padding: "16px", marginBottom: "24px" }}>
                  <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8", lineHeight: "1.6" }}>
                    Select the <strong>Ghost Company</strong> where SaaS subscription revenue will be automatically recorded. 
                    The system will create Invoices and Receipts in this company whenever you record a tenant payment.
                  </p>
                </div>

                <div style={{ display: "grid", gap: "20px" }}>
                  <div>
                    <label style={labelStyle}>Select Ghost Tenant (Operator)</label>
                    <select 
                      value={formData.ghost_tenant_id || ""} 
                      onChange={(e) => setFormData(d => d ? ({ ...d, ghost_tenant_id: e.target.value ? parseInt(e.target.value) : null, ghost_company_id: null }) : null)} 
                      style={{ ...G.selectStyle, width: "100%" }}
                    >
                      <option value="">None</option>
                      {tenants?.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>

                  {formData.ghost_tenant_id && (
                    <div style={{ animation: "fadeIn 0.3s ease" }}>
                      <label style={labelStyle}>Select Ghost Company (Books)</label>
                      <select 
                        value={formData.ghost_company_id || ""} 
                        onChange={(e) => setFormData(d => d ? ({ ...d, ghost_company_id: e.target.value ? parseInt(e.target.value) : null }) : null)} 
                        style={{ ...G.selectStyle, width: "100%" }}
                      >
                        <option value="">None</option>
                        {ghostTenantCompanies.data?.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      {ghostTenantCompanies.isLoading && <div style={{ marginTop: "6px" }}><GhostSpinner /></div>}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Industry Types */}
            {activeSection === "industries" && (
              <div style={{ ...G.card, padding: "28px", animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(16,185,129,0.4), rgba(5,150,105,0.2))", border: "1px solid rgba(16,185,129,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🏢</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Industry Types</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>Manage business sectors and assigned modules</div>
                  </div>
                </div>
                <div style={{ padding: "16px", background: "rgba(16,185,129,0.06)", borderRadius: "12px", border: "1px solid rgba(16,185,129,0.15)", marginBottom: "20px" }}>
                  <p style={{ color: "#94a3b8", fontSize: "13px", lineHeight: "1.5", margin: 0 }}>
                    Configure the available business sectors (e.g., Pharmacy, Restaurant). You can enable industry-specific features which will apply to all tenants in that sector.
                  </p>
                </div>
                <Link href="/admin/settings/business-types" style={{ ...G.btnPrimary, textDecoration: "none", display: "inline-flex", width: "auto" }}>
                  🏢 Manage Industry Sectors
                </Link>
              </div>
            )}

            {/* Item Field Config */}
            {activeSection === "fields" && (
              <div style={{ ...G.card, padding: "28px", animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(245,158,11,0.4), rgba(217,119,6,0.2))", border: "1px solid rgba(245,158,11,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>📦</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Item Field Config</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>Define mandatory fields per industry</div>
                  </div>
                </div>
                <Link href="/admin/settings/item-fields" style={{ ...G.btnGhost, borderColor: "rgba(245,158,11,0.3)", color: "#fbbf24", textDecoration: "none", display: "inline-flex", width: "auto" }}>
                  📦 Configure Dynamic Fields
                </Link>
              </div>
            )}

            {/* System Behavior */}
            {activeSection === "system" && (
              <div style={{ ...G.card, padding: "28px", animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
                  <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, rgba(6,182,212,0.4), rgba(14,165,233,0.2))", border: "1px solid rgba(6,182,212,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🖥️</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>System Behavior</div>
                    <div style={{ color: "#64748b", fontSize: "12px" }}>Controls system-wide features and modes</div>
                  </div>
                </div>
                <div style={{ padding: "16px", background: "rgba(255,255,255,0.04)", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.08)", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ color: "#cbd5e1", fontSize: "14px", fontWeight: 600 }}>Maintenance Mode</div>
                      <div style={{ color: "#64748b", fontSize: "12px" }}>Put system into read-only mode for maintenance</div>
                    </div>
                    <Toggle checked={false} onChange={() => {}} />
                  </div>
                </div>
              </div>
            )}

            {/* Save button */}
            <div style={{ marginTop: "16px", display: "flex", gap: "12px" }}>
              <button type="submit" disabled={saving} style={{ ...G.btnPrimary, opacity: saving ? 0.7 : 1 }}>
                {saving ? "Saving…" : "💾 Save Settings"}
              </button>
            </div>
          </form>
        </div>

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>⚙️ Admin Settings — Superadmin Only</div>
      </div>
    </div>
  );
}
