"use client";

import { useRouter, useParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { MenuTemplateDropdownItem } from "@/types/menuTemplate";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, Pill, planColor, statusColor, ANIM_CSS,
} from "@/lib/adminTheme";

type Tenant = {
  id: number; name: string; plan?: string | null; status?: string | null;
  companies_count?: number | null; company_count?: number | null;
  expires_at?: string | null; modules?: string[] | null; menu_template_id?: number | null;
  document_scan_enabled?: boolean;
  daily_document_scan_limit?: number | null;
  business_type_id?: number | null; business_type_name?: string | null;
  companies?: any[] | null; _count?: { companies: number } | null;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data as Tenant);

const lbl: React.CSSProperties = { color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" };

export default function AdminTenantDetailPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const params = useParams();
  const tenantId = params?.tenantId as string | undefined;

  const { data, error, mutate } = useSWR<Tenant>(tenantId ? `/admin/tenants/${tenantId}` : null, fetcher);
  const { data: menuTemplateOptions, error: menuTemplateError, isLoading: menuTemplateLoading, mutate: refetchMenuTemplates } =
    useSWR<MenuTemplateDropdownItem[]>("/admin/menu-templates/dropdown?include_inactive=false",
      (url: string) => api.get(url).then((r) => r.data as MenuTemplateDropdownItem[]),
      { onError: () => showToast({ title: "Menu templates", description: "Failed to load menu templates.", variant: "error" }) }
    );
  const { data: businessTypes } = useSWR<any[]>("/admin/settings/business-types", 
    (url: string) => api.get(url).then((r) => r.data)
  );
  const { data: plansData } = useSWR<any[]>("/admin/plans", 
    (url: string) => api.get(url).then((r) => r.data)
  );
  const { data: subscriptions, isLoading: subsLoading } = useSWR<any[]>(tenantId ? `/admin/tenants/${tenantId}/subscriptions` : null, 
    (url: string) => api.get(url).then((r) => r.data)
  );

  const [name, setName] = useState("");
  const [tenantPlan, setTenantPlan] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [menuTemplateId, setMenuTemplateId] = useState<number | null>(null);
  const [businessTypeId, setBusinessTypeId] = useState<number | null>(null);
  const [documentScanEnabled, setDocumentScanEnabled] = useState(true);
  const [dailyDocumentScanLimit, setDailyDocumentScanLimit] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<"details" | "billing">("details");

  const sortedTemplates = useMemo(() => [...(menuTemplateOptions || [])].sort((a, b) => a.name.localeCompare(b.name)), [menuTemplateOptions]);
  const selectedModulesPreview = useMemo(() => {
    if (menuTemplateId == null) return "";
    return sortedTemplates.find((t: any) => t.id === menuTemplateId)?.modules ?? "";
  }, [menuTemplateId, sortedTemplates]);

  useEffect(() => {
    if (data) {
      setName(data.name || "");
      setTenantPlan(data.plan || "");
      setMenuTemplateId(typeof data.menu_template_id === "number" ? data.menu_template_id : null);
      setBusinessTypeId(typeof data.business_type_id === "number" ? data.business_type_id : null);
      setDocumentScanEnabled(Boolean(data.document_scan_enabled ?? true));
      setDailyDocumentScanLimit(
        data.daily_document_scan_limit == null ? "" : String(data.daily_document_scan_limit)
      );
      if (data.expires_at) {
        const dt = new Date(data.expires_at);
        setExpiresAt(new Date(dt.getTime() - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
      } else {
        setExpiresAt("");
      }
    }
  }, [data]);

  if (!tenantId) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    setSaving(true); setErrorMessage(null); setSaved(false);
    try {
      await api.put(`/admin/tenants/${tenantId}`, { 
        name: name.trim(),
        plan: tenantPlan, 
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null, 
        menu_template_id: menuTemplateId,
        business_type_id: businessTypeId,
        document_scan_enabled: documentScanEnabled,
        daily_document_scan_limit:
          dailyDocumentScanLimit.trim() === "" ? null : Math.max(Number(dailyDocumentScanLimit), 0),
      });
      await mutate();
      setSaved(true);
      showToast({ title: "Saved", description: "Tenant updated successfully.", variant: "success" });
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setErrorMessage(err?.response?.data?.detail || "Failed to update tenant");
    } finally { setSaving(false); }
  };

  const cc = data?.companies_count ?? data?.company_count ?? data?._count?.companies ?? data?.companies?.length;
  const pc = planColor(data?.plan);
  const sc = statusColor(data?.status);

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="🌐" title={data ? `${data.name}` : "Tenant Detail"} subtitle={`Tenant #${tenantId} — update settings and view billing history.`}>
          <button onClick={() => router.push("/admin/tenants")} style={G.btnGhost} className="g-btn-ghost">← All Tenants</button>
        </GhostPageHeader>

        {/* Tab Switcher */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "24px", borderBottom: "1px solid rgba(255,255,255,0.1)", paddingBottom: "12px" }}>
          <button onClick={() => setActiveTab("details")} style={{ ...G.btnGhost, borderColor: activeTab === "details" ? "#7c3aed" : "transparent", background: activeTab === "details" ? "rgba(124,58,237,0.1)" : "transparent", color: activeTab === "details" ? "#c4b5fd" : "#94a3b8" }}>📋 Details & Config</button>
          <button onClick={() => setActiveTab("billing")} style={{ ...G.btnGhost, borderColor: activeTab === "billing" ? "#34d399" : "transparent", background: activeTab === "billing" ? "rgba(52,211,153,0.1)" : "transparent", color: activeTab === "billing" ? "#6ee7b7" : "#94a3b8" }}>💳 Billing History</button>
        </div>

        {!data && !error && <GhostSpinner />}
        {error && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "16px", color: "#fca5a5", fontSize: "13px" }}>⚠️ {(error as any)?.response?.data?.detail || "Failed to load tenant"}</div>}

        {data && activeTab === "details" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "24px", alignItems: "start", animation: "slideUp 0.3s ease" }}>
            {/* Info cards col */}
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div style={{ ...G.card, padding: "24px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", animation: "fadeIn 0.3s ease" }}>
                <div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Tenant ID</div>
                  <div style={{ fontFamily: "monospace", fontSize: "18px", fontWeight: 800, color: "#67e8f9" }}>#{data.id}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Name</div>
                  <div style={{ fontSize: "16px", fontWeight: 700, color: "#e2e8f0" }}>{data.name}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Status</div>
                  <Pill bg={sc.bg} text={sc.text} border={sc.border}>{data.status || "active"}</Pill>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Current Plan</div>
                  <Pill bg={pc.bg} text={pc.text} border={pc.border}>{data.plan || "standard"}</Pill>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Companies</div>
                  <div style={{ fontSize: "22px", fontWeight: 800, color: "#e2e8f0" }}>{cc ?? "—"}</div>
                </div>
                <div>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>Expires</div>
                  <div style={{ fontSize: "13px", color: "#94a3b8" }}>{data.expires_at ? new Date(data.expires_at).toLocaleDateString() : "—"}</div>
                </div>
              </div>

              {data.modules && data.modules.length > 0 && (
                <div style={{ ...G.card, padding: "18px 22px" }}>
                  <div style={{ color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Active Modules</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                    {data.modules.map((m: any) => (
                      <span key={m} style={{ padding: "3px 10px", background: "rgba(124,58,237,0.15)", border: "1px solid rgba(124,58,237,0.25)", borderRadius: "6px", fontSize: "12px", color: "#c4b5fd" }}>{m}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Edit form col */}
            <div style={{ ...G.card, padding: "26px", animation: "fadeIn 0.3s ease 0.1s both" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
                <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>✏️</div>
                <div style={{ fontWeight: 700, fontSize: "15px", color: "#e2e8f0" }}>Edit Tenant</div>
              </div>

              {saved && <div style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.35)", borderRadius: "10px", padding: "10px 14px", color: "#6ee7b7", fontSize: "13px", marginBottom: "16px" }}>✅ Saved successfully</div>}
              {errorMessage && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "10px 14px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px" }}>⚠️ {errorMessage}</div>}

              <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <div>
                  <label style={lbl}>Tenant Name</label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required style={G.inputStyle} />
                </div>
                <div>
                  <label style={lbl}>Plan</label>
                  <select value={tenantPlan} onChange={(e) => setTenantPlan(e.target.value)} style={{ ...G.selectStyle, width: "100%" }} required>
                    <option value="">Select Plan...</option>
                    {(plansData || []).map((p: any) => (
                      <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Menu Template Override</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select value={menuTemplateId == null ? "" : String(menuTemplateId)} onChange={(e) => setMenuTemplateId(e.target.value ? Number(e.target.value) : null)} disabled={menuTemplateLoading || !!menuTemplateError} style={{ ...G.selectStyle, flex: 1 }}>
                      <option value="">Use Industry Default</option>
                      {sortedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button type="button" onClick={() => refetchMenuTemplates()} disabled={menuTemplateLoading} style={{ ...G.btnGhost, padding: "9px 12px" }}>↻</button>
                  </div>
                  {selectedModulesPreview && <div style={{ marginTop: "6px", color: "#64748b", fontSize: "11px" }}>Preview: {selectedModulesPreview}</div>}
                </div>
                <div>
                   <label style={lbl}>Business Type (Industry)</label>
                   <select 
                    value={businessTypeId == null ? "" : String(businessTypeId)} 
                    onChange={(e) => {
                      const val = e.target.value ? Number(e.target.value) : null;
                      setBusinessTypeId(val);
                      const bt = (businessTypes || []).find((x: any) => x.id === val);
                      if (bt?.default_menu_template_id && menuTemplateId == null) {
                        setMenuTemplateId(bt.default_menu_template_id);
                        showToast({ title: "Template Updated", description: `Applied default template for ${bt.name}`, variant: "info" });
                      }
                    }} 
                    style={{ ...G.selectStyle, width: "100%" }}
                  >
                    <option value="">None</option>
                    {(businessTypes || []).map((bt: any) => (
                      <option key={bt.id} value={bt.id}>{bt.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lbl}>Document Scan Access</label>
                  <label style={{ display: "inline-flex", alignItems: "center", gap: "8px", color: "#cbd5e1", fontSize: "13px" }}>
                    <input
                      type="checkbox"
                      checked={documentScanEnabled}
                      onChange={(e) => setDocumentScanEnabled(e.target.checked)}
                    />
                    Enable document scanning for this tenant
                  </label>
                </div>
                <div>
                  <label style={lbl}>Daily Document Scan Limit</label>
                  <input
                    type="number"
                    min={0}
                    value={dailyDocumentScanLimit}
                    onChange={(e) => setDailyDocumentScanLimit(e.target.value)}
                    placeholder="Leave empty for unlimited"
                    style={G.inputStyle}
                    disabled={!documentScanEnabled}
                  />
                  <div style={{ marginTop: "6px", color: "#64748b", fontSize: "11px" }}>
                    Empty means unlimited daily scans.
                  </div>
                </div>
                <div>
                  <label style={lbl}>Expiration Date</label>
                  <input type="datetime-local" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} style={G.inputStyle} />
                </div>
                <div style={{ marginTop: "10px" }}>
                  <button type="submit" disabled={saving} style={{ ...G.btnPrimary, width: "100%", padding: "12px", fontSize: "14px" }}>
                    {saving ? "Saving Changes..." : "💾 Update Tenant settings"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {data && activeTab === "billing" && (
          <div style={{ ...G.card, padding: "26px", animation: "slideUp 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
              <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(52,211,153,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "18px" }}>🧾</div>
              <div>
                <h3 style={{ margin: 0, color: "#f1f5f9", fontSize: "17px", fontWeight: 700 }}>Subscription History</h3>
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "13px" }}>A complete audit trail of payments and renewals for this tenant.</p>
              </div>
            </div>

            {subsLoading ? <GhostSpinner /> : !subscriptions || subscriptions.length === 0 ? <GhostEmpty message="No subscription history found for this tenant." /> : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      {["Date", "Plan", "Amount", "Period", "Method", "Ref #"].map(h => <th key={h} style={{ ...G.tableHeader, padding: "12px 16px" }}>{h}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {subscriptions.map((s, idx) => (
                      <tr key={s.id} style={{ borderBottom: idx < subscriptions.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                        <td style={{ ...G.tableCell, padding: "14px 16px" }}>{new Date(s.payment_date).toLocaleDateString()}</td>
                        <td style={{ ...G.tableCell, padding: "14px 16px" }}><Pill bg={planColor(s.plan_code).bg} text={planColor(s.plan_code).text} border={planColor(s.plan_code).border}>{s.plan_code}</Pill></td>
                        <td style={{ ...G.tableCell, padding: "14px 16px", fontWeight: 700, color: "#f1f5f9" }}>Nrs. {s.amount_paid.toLocaleString()}</td>
                        <td style={{ ...G.tableCell, padding: "14px 16px", fontSize: "12px" }}>
                          {new Date(s.period_start).toLocaleDateString()} — {new Date(s.period_end).toLocaleDateString()}
                        </td>
                        <td style={{ ...G.tableCell, padding: "14px 16px" }}>{s.payment_method}</td>
                        <td style={{ ...G.tableCell, padding: "14px 16px", color: "#64748b", fontFamily: "monospace" }}>{s.reference_no || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>Administrative Panel — Strictly Superadmin Access</div>
      </div>
    </div>
  );
}