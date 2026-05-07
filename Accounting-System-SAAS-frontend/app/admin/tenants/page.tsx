"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import type { MenuTemplateDropdownItem } from "@/types/menuTemplate";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty,
  Pill, planColor, statusColor, ANIM_CSS,
} from "@/lib/adminTheme";

type Tenant = {
  id: number; name: string; plan?: string | null; status?: string | null;
  companies_count?: number | null; company_count?: number | null; users_count?: number | null; user_count?: number | null;
  expires_at?: string | null;
  companies?: any[] | null; _count?: { companies: number } | null;
  business_type_id?: number | null; business_type_name?: string | null;
  menu_template_id?: number | null;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data as Tenant[]);

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function daysLeft(d?: string | null): { label: string; color: string } | null {
  if (!d) return null;
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  if (diff < 0) return { label: "Expired", color: "#f87171" };
  if (diff <= 7) return { label: `${diff}d`, color: "#fbbf24" };
  if (diff <= 30) return { label: `${diff}d`, color: "#facc15" };
  return null;
}

const lbl: React.CSSProperties = { color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" };

export default function AdminTenantsPage() {
  const { showToast } = useToast();
  const { data, error, isLoading, mutate } = useSWR<Tenant[]>("/admin/tenants", fetcher);
  const { data: menuTemplateOptions, error: menuTemplateError, isLoading: menuTemplateLoading, mutate: refetchMenuTemplates } =
    useSWR<MenuTemplateDropdownItem[]>("/admin/menu-templates/dropdown?include_inactive=false",
      (url: string) => api.get(url).then((r) => r.data as MenuTemplateDropdownItem[]),
      { onError: () => showToast({ title: "Menu templates", description: "Failed to load menu templates.", variant: "error" }) }
    );
  const { data: plansData, isLoading: plansLoading } = useSWR<any[]>("/admin/plans", 
    (url: string) => api.get(url).then((r) => r.data)
  );

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createPlan, setCreatePlan] = useState("");
  const [menuTemplateId, setMenuTemplateId] = useState<number | null>(null);
  const [businessTypeId, setBusinessTypeId] = useState<number | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  
  const { data: businessTypes } = useSWR<any[]>("/admin/settings/business-types", 
    (url: string) => api.get(url).then((r) => r.data)
  );
  const [q, setQ] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const sortedTemplates = useMemo(() => [...(menuTemplateOptions || [])].sort((a, b) => a.name.localeCompare(b.name)), [menuTemplateOptions]);
  const selectedModulesPreview = useMemo(() => {
    if (menuTemplateId == null) return "";
    return sortedTemplates.find((t) => t.id === menuTemplateId)?.modules ?? "";
  }, [menuTemplateId, sortedTemplates]);

  const tenants = data || [];
  const plans = plansData || [];
  const availablePlans = useMemo(() => Array.from(new Set(tenants.map((t) => t.plan || "").filter(Boolean))).sort(), [tenants]);
  const availableStatuses = useMemo(() => Array.from(new Set(tenants.map((t) => t.status || "").filter(Boolean))).sort(), [tenants]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return tenants.filter((t) => {
      const mq = !query || String(t.id).includes(query) || (t.name || "").toLowerCase().includes(query) || String(t.plan || "").toLowerCase().includes(query);
      const mp = !planFilter || String(t.plan || "").toLowerCase() === planFilter;
      const ms = !statusFilter || String(t.status || "unknown").toLowerCase() === statusFilter;
      return mq && mp && ms;
    });
  }, [tenants, q, planFilter, statusFilter]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true); setCreateError(null);
    try {
      await api.post("/admin/tenants", { 
        name: createName.trim(), 
        plan: createPlan, 
        menu_template_id: menuTemplateId,
        business_type_id: businessTypeId 
      });
      setCreateName(""); setCreatePlan(""); setMenuTemplateId(null); setBusinessTypeId(null);
      await mutate();
      setShowCreate(false);
      showToast({ title: "Tenant Created", description: `Tenant "${createName}" created successfully.`, variant: "success" });
    } catch (err: any) {
      setCreateError(err?.response?.data?.detail || "Failed to create tenant");
    } finally { setCreating(false); }
  };

  const handleDelete = async (t: any) => {
    const cc = t.companies_count ?? t.company_count ?? 0;
    const uc = t.users_count ?? t.user_count ?? 0;
    
    if (cc > 0 || uc > 0) {
      showToast({ 
        title: "Cleanup Required", 
        description: `Cannot delete "${t.name}". It still has ${cc} companies and ${uc} users. Please remove all data first.`, 
        variant: "error" 
      });
      return;
    }

    if (!window.confirm(`Are you sure you want to DELETE tenant "${t.name}"? This action cannot be undone.`)) {
      return;
    }
    
    try {
      await api.delete(`/admin/tenants/${t.id}`);
      showToast({ title: "Tenant Deleted", description: `Tenant "${t.name}" has been removed.`, variant: "success" });
      await mutate();
    } catch (err: any) {
      showToast({ 
        title: "Deletion Failed", 
        description: err?.response?.data?.detail || "Failed to delete tenant.", 
        variant: "error" 
      });
    }
  };

  const [syncingAll, setSyncingAll] = useState(false);

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={{ ...G.inner, padding: "20px 24px", maxWidth: "100%" }}>
        <GhostPageHeader icon="🌐" title="Tenants" subtitle="Create and manage all tenants — set plans, expiry dates, and menu templates.">
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              disabled={syncingAll}
              onClick={async () => {
                if (!confirm("Repair & Sync All Tenants?\n\nThis will look for tenants without a Menu Template and attempt to assign their Plan's default template automatically.")) return;
                setSyncingAll(true);
                showToast({ title: "Syncing", description: "Repairing tenant feature mappings...", variant: "info" });
                try {
                  let repaired = 0;
                  for (const t of tenants) {
                    const planDef = plans.find(p => p.code === t.plan);
                    const industryDef = businessTypes?.find(bt => bt.id === t.business_type_id);
                    const targetId = planDef?.menu_template_id || industryDef?.default_menu_template_id;
                    
                    // Only sync if they currently have NO template
                    if (targetId && !t.menu_template_id) {
                      await api.put(`/admin/tenants/${t.id}`, { menu_template_id: targetId });
                      repaired++;
                    }
                  }
                  showToast({ title: "Sync Complete", description: `Successfully repaired ${repaired} tenants.`, variant: "success" });
                  await mutate();
                } catch (e) {
                  showToast({ title: "Sync Failed", description: "Could not complete bulk repair.", variant: "error" });
                } finally {
                  setSyncingAll(false);
                }
              }} 
              style={{ ...G.btnGhost, borderColor: "rgba(168,85,247,0.4)", color: "#d8b4fe", opacity: syncingAll ? 0.6 : 1 }}
              title="Fix all tenants that are missing their plan/industry default templates"
            >
              {syncingAll ? "⏳ Syncing..." : "🪄 Bulk Repair & Sync"}
            </button>
            <button onClick={() => setShowCreate((v) => !v)} style={G.btnPrimary}>
              {showCreate ? "✕ Cancel" : "+ New Tenant"}
            </button>
          </div>
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {/* Create form */}
        {showCreate && (
          <div style={{ ...G.card, padding: "26px", marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>🌐</div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Create New Tenant</div>
            </div>
            {createError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px" }}>⚠️ {createError}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                <div>
                  <label style={lbl}>Name *</label>
                  <input value={createName} onChange={(e) => setCreateName(e.target.value)} required placeholder="Acme Corp" style={G.inputStyle} />
                </div>
                <div>
                  <label style={lbl}>Plan</label>
                   <select 
                    value={createPlan} 
                    onChange={(e) => {
                      const val = e.target.value;
                      setCreatePlan(val);
                      const p = plans.find((x: any) => x.code === val);
                      if (p?.menu_template_id) {
                        setMenuTemplateId(p.menu_template_id);
                        showToast({
                          title: "Plan Defaults Applied",
                          description: `Menu template updated from plan: ${p.name}`,
                          variant: "success",
                        });
                      }
                    }} 
                    style={{ ...G.selectStyle, width: "100%" }} 
                    required
                  >
                    <option value="">Select Plan...</option>
                    {plans.map((p) => (
                      <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <label style={lbl}>Menu Template</label>
                    <div style={{ display: "flex", gap: "6px" }}>
                      {createPlan && plans.find(p => p.code === createPlan)?.menu_template_id === menuTemplateId && (
                        <span style={{ color: "#10b981", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>✓ Plan Default</span>
                      )}
                      {businessTypeId && businessTypes?.find(bt => bt.id === businessTypeId)?.default_menu_template_id === menuTemplateId && (
                        <span style={{ color: "#6366f1", fontSize: "10px", fontWeight: 700, textTransform: "uppercase" }}>✓ Industry Default</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <select value={menuTemplateId == null ? "" : String(menuTemplateId)} onChange={(e) => setMenuTemplateId(e.target.value ? Number(e.target.value) : null)} disabled={menuTemplateLoading || Boolean(menuTemplateError)} style={{ ...G.selectStyle, flex: 1 }}>
                      <option value="">None</option>
                      {sortedTemplates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <button type="button" onClick={() => refetchMenuTemplates()} disabled={menuTemplateLoading} style={{ ...G.btnGhost, padding: "9px 12px", fontSize: "12px" }}>↻</button>
                  </div>
                </div>
                {selectedModulesPreview && (
                  <div>
                    <label style={lbl}>Modules Preview</label>
                    <input value={selectedModulesPreview} readOnly style={{ ...G.inputStyle, opacity: 0.6 }} />
                  </div>
                )}
                <div>
                  <label style={lbl}>Business Type (Industry)</label>
                  <select 
                    value={businessTypeId == null ? "" : String(businessTypeId)} 
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setBusinessTypeId(val);
                      const bt = businessTypes?.find((x: any) => x.id === val);
                      if (bt?.default_menu_template_id) {
                        setMenuTemplateId(bt.default_menu_template_id);
                        showToast({
                          title: "Industry Defaults Applied",
                          description: `Menu template updated for sector: ${bt.name}`,
                          variant: "success",
                        });
                      }
                    }} 
                    style={{ ...G.selectStyle, width: "100%" }}
                  >
                    <option value="">Default (General)</option>
                    {businessTypes?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              </div>
              <button type="submit" disabled={creating} style={{ ...G.btnPrimary, opacity: creating ? 0.7 : 1 }}>
                {creating ? "Creating…" : "🌐 Create Tenant"}
              </button>
            </form>
          </div>
        )}

        {/* Filter toolbar */}
        <div style={{ ...G.card, padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Search by ID, name, plan…" style={{ ...G.inputStyle, maxWidth: "280px" }} />
          <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} style={G.selectStyle}>
            <option value="">All Plans</option>
            {plans.map((p) => <option key={p.code} value={p.code.toLowerCase()}>{p.name}</option>)}
          </select>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={G.selectStyle}>
            <option value="">All Statuses</option>
            {availableStatuses.map((s) => <option key={s} value={s.toLowerCase()}>{s}</option>)}
          </select>
          {(q || planFilter || statusFilter) && (
            <button onClick={() => { setQ(""); setPlanFilter(""); setStatusFilter(""); }} style={{ ...G.btnDanger, padding: "8px 14px" }}>✕ Clear</button>
          )}
          <span style={{ color: "#64748b", fontSize: "13px", marginLeft: "auto" }}>{filtered.length} tenants</span>
        </div>

        {/* Table w/ Compact Layout */}
        <div style={{ ...G.card, overflowX: "auto", position: "relative" }}>
          {isLoading ? <GhostSpinner /> : filtered.length === 0 ? <GhostEmpty message="No tenants found." /> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                  {[
                    {h: "ID", w: "40px"}, 
                    {h: "Tenant", w: "minmax(120px, 1fr)"}, 
                    {h: "Plan", w: "80px"}, 
                    {h: "Tpl (P)", w: "minmax(100px, 140px)"}, 
                    {h: "Tpl (M)", w: "minmax(100px, 140px)"}, 
                    {h: "Stats", w: "80px"}, 
                    {h: "Expires At", w: "100px"}, 
                    {h: "Action", w: "110px"}
                  ].map((col) => (
                    <th key={col.h} style={{ ...G.tableHeader, padding: "10px 8px", fontSize: "10px", width: col.w === "minmax(120px, 1fr)" ? "auto" : col.w }}>{col.h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t, i) => {
                  const planObj = (Array.isArray(plansData) ? plansData : (plansData as any)?.results || []).find((p: any) => String(p.code).toLowerCase() === String(t.plan).toLowerCase());
                  const planDispName = planObj?.name || t.plan || "Standard";
                  const cc = t.companies_count ?? t.company_count ?? t._count?.companies ?? t.companies?.length;

                  const pc = planColor(t.plan);
                  const sc = statusColor(t.status);
                  const dl = daysLeft(t.expires_at);
                  return (
                    <tr key={t.id} className="g-row" style={{ borderBottom: i < filtered.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s", animation: `fadeIn 0.3s ease ${i * 0.02}s both`, whiteSpace: "nowrap" }}>
                      <td style={{ ...G.tableCell, padding: "8px", width: "40px" }}><span style={{ fontFamily: "monospace", fontSize: "11px", color: "#475569" }}>#{t.id}</span></td>
                      <td style={{ ...G.tableCell, padding: "8px", maxWidth: "200px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden" }}>
                          <div style={{ width: "24px", height: "24px", borderRadius: "8px", background: `linear-gradient(135deg, ${pc.text}33, ${pc.text}55)`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: "11px", color: pc.text, flexShrink: 0 }}>{(t.name || "?")[0].toUpperCase()}</div>
                          <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>{t.name}</div>
                        </div>
                      </td>
                      <td style={G.tableCell}>
                        <Pill bg={pc.bg} text={pc.text} border={pc.border}>{planDispName}</Pill>
                      </td>
                      <td style={G.tableCell}>
                        {(() => {
                           // 1. Get plans array (handle raw array vs. {results: []} structure)
                           const plansArray = Array.isArray(plansData) ? plansData : (plansData as any)?.results || [];
                           
                           // 2. Find the plan object (be resilient with case and whitespace)
                           const tPlanCode = String(t.plan || "").trim().toLowerCase();
                           
                           if (!planObj) return <span style={{ color: "#475569", fontSize: "11px" }}>No Plan Info</span>;

                           // 3. Extract template_id (Try direct field first, then features metadata)
                           let ptId = planObj.menu_template_id;
                           if (!ptId) {
                             const featuresStr = Array.isArray(planObj.features) ? planObj.features.join(",") : String(planObj.features || "");
                             const match = featuresStr.match(/template_id:(\d+)/);
                             ptId = match ? Number(match[1]) : null;
                           }

                           // 4. Find template name
                           const ptName = (menuTemplateOptions || []).find(it => it.id === ptId)?.name;

                           return (
                             <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                               {ptName ? (
                                 <div style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 6px", background: "rgba(99,102,241,0.12)", borderRadius: "6px", border: "1px solid rgba(99,102,241,0.2)", maxWidth: "130px" }}>
                                   <span style={{ fontSize: "10px" }}>📋</span>
                                   <span style={{ fontSize: "11px", color: "#a5b4fc", fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ptName}>{ptName}</span>
                                 </div>
                               ) : <span style={{ color: "#475569", fontSize: "11px" }}>No Plan Template</span>}
                             </div>
                           );
                        })()}
                      </td>
                      <td style={G.tableCell}>
                        {(() => {
                           const p = plans.find(x => x.code === t.plan);
                           const ttName = (menuTemplateOptions || []).find(it => it.id === t.menu_template_id)?.name;
                           
                           if (ttName) {
                             return (
                               <div>
                                 <div style={{ display: "flex", alignItems: "center", gap: "4px", maxWidth: "130px" }}>
                                   <span style={{ fontSize: "11px" }}>📂</span>
                                   <span style={{ fontSize: "11px", color: "#c4b5fd", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={ttName}>{ttName}</span>
                                 </div>
                                 {p?.menu_template_id && p.menu_template_id === t.menu_template_id && (
                                   <div style={{ fontSize: "9px", color: "#10b981", fontWeight: 800, marginTop: "4px" }}>✓ MATCHES PLAN</div>
                                 )}
                               </div>
                             );
                           }
                           
                           if (p?.menu_template_id) {
                             return (
                               <button 
                                 onClick={async (e) => {
                                   e.stopPropagation();
                                   if (confirm(`Set "${p.name}" default template for "${t.name}"?`)) {
                                     try {
                                       await api.put(`/admin/tenants/${t.id}`, { menu_template_id: p.menu_template_id });
                                       showToast({ title: "Synced", description: "Tenant template updated.", variant: "success" });
                                       await mutate();
                                     } catch (err) {
                                       showToast({ title: "Sync Failed", description: "Could not update tenant.", variant: "error" });
                                     }
                                   }
                                 }}
                                 style={{ display: "block", fontSize: "9px", color: "#f87171", fontWeight: 800, textAlign: "left", cursor: "pointer", background: "none", border: "none", padding: 0 }}
                                 title="Inheriting from plan. Click to stick to tenant."
                               >
                                 ⚠ NO DIRECT OVERRIDE — USE PLAN?
                               </button>
                             );
                           }
                           
                           return <span style={{ color: "#475569", fontSize: "11px" }}>None</span>;
                        })()}
                      </td>
                      <td style={{ ...G.tableCell, padding: "8px", textAlign: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px" }}>
                           <div title="Companies" style={{ display: "flex", alignItems: "center", gap: "2px", color: "#94a3b8", fontSize: "11px" }}>
                             <span>🏢</span><span style={{ fontWeight: 800, color: "#cbd5e1" }}>{cc ?? 0}</span>
                           </div>
                           <div style={{ width: "1px", height: "10px", background: "rgba(255,255,255,0.1)" }} />
                           <div title="Users" style={{ display: "flex", alignItems: "center", gap: "2px", color: "#94a3b8", fontSize: "11px" }}>
                             <span>👥</span><span style={{ fontWeight: 800, color: "#cbd5e1" }}>{t.users_count ?? t.user_count ?? 0}</span>
                           </div>
                        </div>
                      </td>
                      <td style={{ ...G.tableCell, padding: "8px", fontSize: "12px" }}>
                        <div>{fmt(t.expires_at)}</div>
                        {dl && <div style={{ fontSize: "10px", fontWeight: 700, color: dl.color }}>{dl.label}</div>}
                      </td>
                      <td style={{ ...G.tableCell, padding: "8px" }}>
                        <div style={{ display: "flex", gap: "4px" }}>
                          <Link 
                            href={`/admin/tenants/${t.id}`} 
                            title="Edit Tenant"
                            style={{ 
                              width: "30px", height: "30px", 
                              borderRadius: "6px", background: "rgba(99,102,241,0.12)", 
                              border: "1px solid rgba(99,102,241,0.25)", 
                              color: "#a5b4fc", display: "flex", alignItems: "center", justifyContent: "center", 
                              textDecoration: "none", transition: "all 0.15s", fontSize: "14px"
                            }}
                          >
                            ✏️
                          </Link>
                          <Link 
                            href="/settings/menu-permissions" 
                            title="Manage Menus"
                            style={{ 
                              width: "30px", height: "30px", 
                              borderRadius: "6px", background: "rgba(124,58,237,0.08)", 
                              border: "1px solid rgba(124,58,237,0.2)", 
                              color: "#c4b5fd", display: "flex", alignItems: "center", justifyContent: "center", 
                              textDecoration: "none", transition: "all 0.15s", fontSize: "14px"
                            }}
                          >
                            🛠️
                          </Link>
                          <button 
                            onClick={() => handleDelete(t)}
                            title="Delete Tenant"
                            style={{ 
                              width: "30px", height: "30px", 
                              borderRadius: "6px", background: "rgba(239,68,68,0.08)", 
                              border: "1px solid rgba(239,68,68,0.2)", 
                              color: "#fca5a5", display: "flex", alignItems: "center", justifyContent: "center", 
                              cursor: "pointer", transition: "all 0.15s", fontSize: "14px"
                            }}
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {error && <div style={{ marginTop: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "16px", color: "#fca5a5", fontSize: "13px" }}>⚠️ {(error as any)?.response?.data?.detail || "Failed to load tenants"}</div>}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>🌐 Tenants — Superadmin Only</div>
      </div>
    </div>
  );
}
