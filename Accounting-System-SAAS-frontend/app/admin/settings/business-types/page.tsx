"use client";

import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  G, GhostBg, GhostPageHeader, ANIM_CSS,
} from "@/lib/adminTheme";
import { useToast } from "@/components/ui/Toast";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type BusinessTypeFeature = {
  id: number;
  feature_code: string;
  is_enabled: boolean;
  config: any;
};

type BusinessType = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
  default_menu_template_id: number | null;
  default_menu_template_name: string | null;
  features: BusinessTypeFeature[];
};

const labelStyle: React.CSSProperties = {
  color: "#94a3b8", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px", display: "block",
};

export default function BusinessTypesPage() {
  const { data: types, mutate } = useSWR<BusinessType[]>("/admin/settings/business-types", fetcher);
  const { data: menuTemplates } = useSWR<any[]>("/admin/menu-templates/dropdown", fetcher);
  const { showToast } = useToast();
  
  const [submitting, setSubmitting] = useState(false);
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState({
    code: "",
    name: "",
    description: "",
    is_active: true,
    default_menu_template_id: null as number | null
  });

  const selectedType = types?.find(t => t.id === selectedTypeId) || (types?.[0]);
  if (!selectedTypeId && types && types.length > 0 && !showCreate) {
    setSelectedTypeId(types[0].id);
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/admin/settings/business-types", newType);
      showToast({ title: "Business type created", variant: "success" });
      mutate();
      setNewType({ code: "", name: "", description: "", is_active: true, default_menu_template_id: null });
      setShowCreate(false);
    } catch (err: any) {
      showToast({ title: err?.response?.data?.detail || "Failed to create", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const updateType = async (typeId: number, data: Partial<BusinessType>) => {
    try {
      await api.put(`/admin/settings/business-types/${typeId}`, data);
      mutate();
      showToast({ title: "Updated", variant: "success" });
    } catch (err: any) {
      showToast({ title: "Update failed", variant: "error" });
    }
  };

  const toggleFeature = async (typeId: number, featureCode: string, currentlyEnabled: boolean) => {
    try {
      await api.post(`/admin/settings/business-types/${typeId}/features`, {
        feature_code: featureCode,
        is_enabled: !currentlyEnabled
      });
      mutate();
      showToast({ title: "Feature updated", variant: "success" });
    } catch (err: any) {
      showToast({ title: "Failed to update feature", variant: "error" });
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure? This will affect all tenants using this type.")) return;
    try {
      await api.delete(`/admin/settings/business-types/${id}`);
      showToast({ title: "Deleted successfuly", variant: "success" });
      if (selectedTypeId === id) setSelectedTypeId(null);
      mutate();
    } catch (err: any) {
      showToast({ title: "Failed to delete", variant: "error" });
    }
  };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader 
          icon="🏢" 
          title="Industry Configuration" 
          subtitle="Configure business sectors and their enabled features."
        >
          <div style={{ display: "flex", gap: "10px" }}>
            <Link href="/admin/settings/item-fields" style={{ ...G.btnGhost, textDecoration: "none" }}>📦 Dynamic Fields</Link>
            <Link href="/admin/settings" style={{ ...G.btnGhost, textDecoration: "none" }}>← Back to Settings</Link>
          </div>
        </GhostPageHeader>

        <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: "24px", height: "calc(100vh - 200px)" }}>
          
          {/* LEFT: Master List */}
          <div style={{ display: "flex", flexDirection: "column", gap: "12px", overflowY: "auto", paddingRight: "8px" }}>
            <button 
              onClick={() => { setShowCreate(true); setSelectedTypeId(null); }}
              style={{ ...G.btnGhost, borderColor: "rgba(124,58,237,0.4)", color: "#a78bfa", justifyContent: "center", marginBottom: "8px" }}
            >
              ➕ Create New Industry
            </button>
            
            {!types && <div style={{ color: "#64748b", textAlign: "center", padding: "20px" }}>Loading...</div>}
            
            {types?.map((t) => (
              <div 
                key={t.id} 
                onClick={() => { setSelectedTypeId(t.id); setShowCreate(false); }}
                style={{ 
                  ...G.card, padding: "16px", cursor: "pointer", transition: "all 0.2s",
                  border: `1px solid ${selectedTypeId === t.id ? "rgba(124,58,237,0.5)" : "rgba(255,255,255,0.05)"}`,
                  background: selectedTypeId === t.id ? "rgba(124,58,237,0.1)" : "rgba(255,255,255,0.03)",
                }}
              >
                <div style={{ fontWeight: 700, color: selectedTypeId === t.id ? "#c4b5fd" : "#e2e8f0", fontSize: "14px" }}>{t.name}</div>
                <div style={{ color: "#64748b", fontSize: "11px", marginTop: "4px" }}>{t.code}</div>
              </div>
            ))}
          </div>

          {/* RIGHT: Detail Config */}
          <div style={{ ...G.card, padding: "32px", overflowY: "auto" }}>
            {showCreate ? (
              <div style={{ animation: "fadeIn 0.3s ease" }}>
                <div style={{ fontWeight: 800, color: "#f8fafc", fontSize: "20px", marginBottom: "24px" }}>Create New Industry</div>
                <form onSubmit={handleAdd} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Industry Name</label>
                    <input style={G.inputStyle} placeholder="e.g. Pharmacy / Medical" value={newType.name} onChange={e => setNewType({...newType, name: e.target.value})} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Industry Code</label>
                    <input style={G.inputStyle} placeholder="e.g. PHARMACY" value={newType.code} onChange={e => setNewType({...newType, code: e.target.value.toUpperCase()})} required />
                  </div>
                  <div>
                    <label style={labelStyle}>Default Menu Template</label>
                    <select style={{ ...G.selectStyle, width: "100%" }} value={newType.default_menu_template_id || ""} onChange={(e) => setNewType({...newType, default_menu_template_id: e.target.value ? Number(e.target.value) : null})}>
                      <option value="">None</option>
                      {menuTemplates?.map(mt => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
                    </select>
                  </div>
                  <div style={{ gridColumn: "1 / -1" }}>
                    <label style={labelStyle}>Description</label>
                    <textarea style={{ ...G.inputStyle, height: "100px", resize: "none" }} placeholder="Industry details..." value={newType.description} onChange={e => setNewType({...newType, description: e.target.value})} />
                  </div>
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: "12px" }}>
                    <button type="submit" disabled={submitting} style={G.btnPrimary}>{submitting ? "Creating..." : "💾 Create Industry"}</button>
                    <button type="button" onClick={() => { setShowCreate(false); setSelectedTypeId(types?.[0]?.id || null); }} style={G.btnGhost}>Cancel</button>
                  </div>
                </form>
              </div>
            ) : selectedType ? (
              <div key={selectedType.id} style={{ animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "28px", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "20px" }}>
                  <div>
                    <div style={{ color: "#7c3aed", fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>Industry Config</div>
                    <h2 style={{ margin: "4px 0 0 0", color: "#f8fafc", fontSize: "28px", fontWeight: 800 }}>{selectedType.name}</h2>
                    <div style={{ color: "#64748b", fontSize: "14px", marginTop: "4px" }}>Internal Code: <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{selectedType.code}</span></div>
                  </div>
                  <button onClick={() => handleDelete(selectedType.id)} style={{ padding: "8px 16px", borderRadius: "10px", border: "1px solid rgba(239,68,68,0.3)", background: "rgba(239,68,68,0.1)", color: "#fca5a5", fontSize: "13px", cursor: "pointer" }}>🗑️ Delete Industry</button>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                    <div>
                      <label style={labelStyle}>Default Menu Template</label>
                      <select style={{ ...G.selectStyle, width: "100%" }} value={selectedType.default_menu_template_id || ""} onChange={(e) => updateType(selectedType.id, { default_menu_template_id: e.target.value ? Number(e.target.value) : null })}>
                        <option value="">None</option>
                        {menuTemplates?.map(mt => <option key={mt.id} value={mt.id}>{mt.name}</option>)}
                      </select>
                      <p style={{ color: "#64748b", fontSize: "11px", marginTop: "6px" }}>This template will be assigned to new tenants by default.</p>
                    </div>

                    <div>
                      <label style={labelStyle}>Description</label>
                      <textarea 
                        style={{ ...G.inputStyle, height: "120px", resize: "none" }} 
                        value={selectedType.description || ""} 
                        onChange={(e) => updateType(selectedType.id, { description: e.target.value })}
                        onBlur={(e) => updateType(selectedType.id, { description: e.target.value })}
                        placeholder="Describe this industry..."
                      />
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>Enabled Features</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "10px", marginTop: "8px" }}>
                      {["batch_tracking", "expiry_tracking", "table_management", "variant_matrix", "prescription_tracking", "kds_mode"].map(f => {
                         const feature = selectedType.features.find(feat => feat.feature_code === f);
                         const isEnabled = feature ? feature.is_enabled : false;
                         return (
                           <div key={f} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderRadius: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                             <div>
                               <div style={{ color: "#e2e8f0", fontSize: "14px", fontWeight: 600 }}>{f.replace("_", " ").toUpperCase()}</div>
                               <div style={{ color: "#64748b", fontSize: "11px" }}>{isEnabled ? "Feature is active" : "Feature is disabled"}</div>
                             </div>
                             <button
                               onClick={() => toggleFeature(selectedType.id, f, isEnabled)}
                               style={{
                                 padding: "6px 12px", borderRadius: "8px", border: "1px solid", cursor: "pointer", fontSize: "11px", fontWeight: 700,
                                 background: isEnabled ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.05)",
                                 borderColor: isEnabled ? "rgba(16,185,129,0.3)" : "rgba(255,255,255,0.1)",
                                 color: isEnabled ? "#6ee7b7" : "#94a3b8"
                               }}
                             >
                               {isEnabled ? "ENABLED ✅" : "DISABLED ❌"}
                             </button>
                           </div>
                         );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", color: "#475569" }}>
                <div style={{ fontSize: "48px", marginBottom: "16px" }}>🏢</div>
                <div>Select an industry from the left to configure options</div>
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
