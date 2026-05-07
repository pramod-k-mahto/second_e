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

type ItemFieldConfig = {
  id: number;
  business_type: string;
  field_code: string;
  display_label: string;
  is_active: boolean;
  is_required: boolean;
  sort_order: number;
  group_name: string | null;
};

const labelStyle: React.CSSProperties = {
  color: "#94a3b8", fontSize: "11px", fontWeight: 700,
  textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px", display: "block",
};

export default function ItemFieldsAdminPage() {
  const { data: configs, mutate } = useSWR<ItemFieldConfig[]>("/admin/settings/item-fields", fetcher);
  const { data: businessTypes } = useSWR<any[]>("/admin/settings/business-types", fetcher);
  const { showToast } = useToast();
  
  const [submitting, setSubmitting] = useState(false);
  const [newField, setNewField] = useState({
    business_type: "PHARMACY",
    field_code: "",
    display_label: "",
    is_active: true,
    is_required: false,
    sort_order: 10,
    group_name: ""
  });

  // Cloning State
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneSource, setCloneSource] = useState("");
  const [cloneTarget, setCloneTarget] = useState("");
  const [selectedFieldIds, setSelectedFieldIds] = useState<number[]>([]);
  const [isCloning, setIsCloning] = useState(false);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/admin/settings/item-fields", newField);
      showToast({ title: "Field configuration added", variant: "success" });
      mutate();
      setNewField({ ...newField, field_code: "", display_label: "" });
    } catch (err: any) {
      showToast({ title: err?.response?.data?.detail || "Failed to add field", variant: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Are you sure you want to delete this field configuration?")) return;
    try {
      await api.delete(`/admin/settings/item-fields/${id}`);
      showToast({ title: "Field deleted", variant: "success" });
      mutate();
    } catch (err: any) {
      showToast({ title: err?.response?.data?.detail || "Failed to delete", variant: "error" });
    }
  };

  const toggleActive = async (cfg: ItemFieldConfig) => {
    try {
      await api.post("/admin/settings/item-fields", {
        ...cfg,
        is_active: !cfg.is_active
      });
      mutate();
    } catch (err: any) {
      showToast({ title: "Failed to update status", variant: "error" });
    }
  };

  const handleClone = async () => {
    if (!cloneSource || !cloneTarget || selectedFieldIds.length === 0) {
      showToast({ title: "Please select source, target and at least one field", variant: "error" });
      return;
    }
    if (cloneSource === cloneTarget) {
      showToast({ title: "Source and Target cannot be the same", variant: "error" });
      return;
    }

    setIsCloning(true);
    try {
      const res = await api.post("/admin/settings/item-fields/clone", {
        source_business_type: cloneSource,
        target_business_type: cloneTarget,
        field_ids: selectedFieldIds
      });
      showToast({ title: res.data.detail, variant: "success" });
      mutate();
      setIsCloneModalOpen(false);
      setSelectedFieldIds([]);
    } catch (err: any) {
      showToast({ title: err?.response?.data?.detail || "Failed to deploy fields", variant: "error" });
    } finally {
      setIsCloning(false);
    }
  };

  const toggleFieldSelection = (id: number) => {
    setSelectedFieldIds(prev => 
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const selectAllFields = (sourceFields: ItemFieldConfig[]) => {
    if (selectedFieldIds.length === sourceFields.length) {
      setSelectedFieldIds([]);
    } else {
      setSelectedFieldIds(sourceFields.map(f => f.id));
    }
  };

  const groupedConfigs = configs?.reduce((acc, curr) => {
    if (!acc[curr.business_type]) acc[curr.business_type] = [];
    acc[curr.business_type].push(curr);
    return acc;
  }, {} as Record<string, ItemFieldConfig[]>) || {};

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader 
          icon="📦" 
          title="Industry Item Fields" 
          subtitle="Manage industry-specific fields (Pharmacy, Retail, etc.) for the Item Master."
        >
          <div style={{ display: "flex", gap: "10px" }}>
            <button 
              onClick={() => setIsCloneModalOpen(true)}
              style={{ ...G.btnPrimary, background: "linear-gradient(135deg, #10b981, #059669)", border: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}
            >
              🚀 Clone Sector Fields
            </button>
            <Link href="/admin/settings/business-types" style={{ ...G.btnGhost, textDecoration: "none" }}>🏢 Manage Industry Types</Link>
            <Link href="/admin/settings" style={{ ...G.btnGhost, textDecoration: "none" }}>← Back to Settings</Link>
          </div>
        </GhostPageHeader>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 340px", gap: "24px" }}>
          
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            {Object.keys(groupedConfigs).length === 0 && !configs && (
              <div style={{ ...G.card, padding: "20px", color: "#64748b" }}>Loading configurations...</div>
            )}
            
            {Object.entries(groupedConfigs).map(([bizType, fields]) => (
              <div key={bizType} style={{ ...G.card, padding: "20px", animation: "fadeIn 0.3s ease" }}>
                <div style={{ display: "flex", alignItems: "center", justifyItems: "center", gap: "12px", marginBottom: "16px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "12px" }}>
                  <div style={{ padding: "4px 10px", borderRadius: "6px", background: "rgba(124,58,237,0.2)", color: "#a78bfa", fontSize: "12px", fontWeight: 700 }}>{bizType}</div>
                  <div style={{ color: "#64748b", fontSize: "12px" }}>{fields.length} dynamic fields</div>
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ textAlign: "left", color: "#64748b", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                        <th style={{ padding: "10px 8px" }}>Code</th>
                        <th style={{ padding: "10px 8px" }}>Label</th>
                        <th style={{ padding: "10px 8px" }}>Group</th>
                        <th style={{ padding: "10px 8px" }}>Required</th>
                        <th style={{ padding: "10px 8px" }}>Status</th>
                        <th style={{ padding: "10px 8px" }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fields.sort((a,b) => a.sort_order - b.sort_order).map((f) => (
                        <tr key={f.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.02)", color: "#cbd5e1" }}>
                          <td style={{ padding: "12px 8px", fontFamily: "monospace", color: "#94a3b8" }}>{f.field_code}</td>
                          <td style={{ padding: "12px 8px", fontWeight: 600 }}>{f.display_label}</td>
                          <td style={{ padding: "12px 8px", fontSize: "11px" }}>{f.group_name || "-"}</td>
                          <td style={{ padding: "12px 8px" }}>{f.is_required ? "✅" : "❌"}</td>
                          <td style={{ padding: "12px 8px" }}>
                            <button 
                              onClick={() => toggleActive(f)}
                              style={{ 
                                padding: "4px 8px", borderRadius: "5px", border: "none", cursor: "pointer", fontSize: "10px", fontWeight: 700,
                                background: f.is_active ? "rgba(16,185,129,0.15)" : "rgba(239,68,68,0.15)",
                                color: f.is_active ? "#6ee7b7" : "#fca5a5"
                              }}
                            >
                              {f.is_active ? "ACTIVE" : "INACTIVE"}
                            </button>
                          </td>
                          <td style={{ padding: "12px 8px" }}>
                            <button 
                              onClick={() => handleDelete(f.id)}
                              style={{ background: "transparent", border: "none", color: "#ef4444", cursor: "pointer", fontSize: "16px" }}
                              title="Delete"
                            >
                              🗑️
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>

          <div style={{ position: "sticky", top: "24px", alignSelf: "start" }}>
            <div style={{ ...G.card, padding: "24px" }}>
              <div style={{ fontWeight: 700, color: "#e2e8f0", marginBottom: "16px", fontSize: "15px" }}>Add New Field</div>
              <form onSubmit={handleAdd} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                <div>
                  <label style={labelStyle}>Business Type</label>
                  <select 
                    style={G.selectStyle} 
                    value={newField.business_type} 
                    onChange={e => setNewField({...newField, business_type: e.target.value})}
                  >
                    {!businessTypes && <option>Loading...</option>}
                    {businessTypes?.map(t => (
                      <option key={t.id} value={t.code}>{t.name}</option>
                    ))}
                    {!businessTypes && (
                      <>
                        <option value="PHARMACY">Pharmacy</option>
                        <option value="RETAIL">Retail</option>
                        <option value="GARMENT">Garment</option>
                        <option value="GENERAL">General</option>
                      </>
                    )}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Field Code (DB Column)</label>
                  <input 
                    style={G.inputStyle} 
                    placeholder="e.g. generic_name"
                    value={newField.field_code}
                    onChange={e => setNewField({...newField, field_code: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Display Label</label>
                  <input 
                    style={G.inputStyle} 
                    placeholder="e.g. Medicine Generic Name"
                    value={newField.display_label}
                    onChange={e => setNewField({...newField, display_label: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <label style={labelStyle}>Group Name (Optional)</label>
                  <input 
                    style={G.inputStyle} 
                    placeholder="e.g. Medical Info"
                    value={newField.group_name}
                    onChange={e => setNewField({...newField, group_name: e.target.value})}
                  />
                </div>
                <div style={{ display: "flex", gap: "15px", marginTop: "5px" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#cbd5e1", fontSize: "13px" }}>
                    <input 
                      type="checkbox" 
                      checked={newField.is_active} 
                      onChange={e => setNewField({...newField, is_active: e.target.checked})} 
                    />
                    Active
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: "8px", cursor: "pointer", color: "#cbd5e1", fontSize: "13px" }}>
                    <input 
                      type="checkbox" 
                      checked={newField.is_required} 
                      onChange={e => setNewField({...newField, is_required: e.target.checked})} 
                    />
                    Required
                  </label>
                </div>
                <div>
                  <label style={labelStyle}>Sort Order</label>
                  <input 
                    type="number"
                    style={G.inputStyle} 
                    value={newField.sort_order}
                    onChange={e => setNewField({...newField, sort_order: parseInt(e.target.value)})}
                  />
                </div>
                <button 
                  type="submit" 
                  disabled={submitting} 
                  style={{ ...G.btnPrimary, marginTop: "10px", width: "100%" }}
                >
                  {submitting ? "Adding..." : "➕ Add Configuration"}
                </button>
              </form>
            </div>

            <div style={{ ...G.card, padding: "16px", marginTop: "16px", background: "rgba(59,130,246,0.05)", border: "1px solid rgba(59,130,246,0.2)" }}>
              <div style={{ color: "#60a5fa", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>💡 Pro Tip</div>
              <div style={{ color: "#94a3b8", fontSize: "12px" }}>
                Field Codes must match the column names added to the database. Use &apos;is_&apos; prefix for checkbox fields.
              </div>
            </div>
          </div>

        </div>

        <div style={{ marginTop: "32px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "20px", textAlign: "center", color: "#475569", fontSize: "11px" }}>
          📦 Industry Item Master Fields — Control Panel v1.0
        </div>
      </div>

      {/* CLONE MODAL */}
      {isCloneModalOpen && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px", animation: "fadeIn 0.2s ease" }}>
          <div style={{ ...G.card, width: "100%", maxWidth: "600px", padding: "32px", border: "1px solid rgba(124,58,237,0.3)", boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: "24px" }}>
              <div>
                <h2 style={{ color: "#fff", fontSize: "20px", fontWeight: 700, margin: 0 }}>🚀 Clone Sector Fields</h2>
                <p style={{ color: "#64748b", fontSize: "13px", marginTop: "4px" }}>Copy configurations from one industry to another.</p>
              </div>
              <button onClick={() => setIsCloneModalOpen(false)} style={{ background: "transparent", border: "none", color: "#64748b", cursor: "pointer", fontSize: "20px" }}>✕</button>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
              <div>
                <label style={labelStyle}>Source Industry</label>
                <select 
                  style={G.selectStyle} 
                  value={cloneSource} 
                  onChange={e => { setCloneSource(e.target.value); setSelectedFieldIds([]); }}
                >
                  <option value="">-- Select Source --</option>
                  {businessTypes?.map(t => (
                    <option key={t.id} value={t.code}>{t.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={labelStyle}>Target Industry</label>
                <select 
                  style={G.selectStyle} 
                  value={cloneTarget} 
                  onChange={e => setCloneTarget(e.target.value)}
                >
                  <option value="">-- Select Target --</option>
                  {businessTypes?.map(t => (
                    <option key={t.id} value={t.code}>{t.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {cloneSource && (
              <div style={{ marginBottom: "24px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                  <label style={labelStyle}>Select Fields to Deploy ({selectedFieldIds.length})</label>
                  <button 
                    onClick={() => selectAllFields(groupedConfigs[cloneSource] || [])}
                    style={{ background: "transparent", border: "none", color: "#a78bfa", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                  >
                    {selectedFieldIds.length === (groupedConfigs[cloneSource]?.length || 0) ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div style={{ maxHeight: "200px", overflowY: "auto", background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "12px", border: "1px solid rgba(255,255,255,0.05)" }}>
                  {(!groupedConfigs[cloneSource] || groupedConfigs[cloneSource].length === 0) && (
                    <div style={{ color: "#475569", fontSize: "12px", textAlign: "center", padding: "10px" }}>No fields found for this industry.</div>
                  )}
                  {groupedConfigs[cloneSource]?.map(f => (
                    <label key={f.id} style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 0", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.02)" }}>
                      <input 
                        type="checkbox" 
                        checked={selectedFieldIds.includes(f.id)} 
                        onChange={() => toggleFieldSelection(f.id)}
                      />
                      <div>
                        <div style={{ color: "#e2e8f0", fontSize: "13px", fontWeight: 600 }}>{f.display_label}</div>
                        <div style={{ color: "#64748b", fontSize: "11px", fontFamily: "monospace" }}>{f.field_code}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div style={{ padding: "16px", background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "12px", marginBottom: "24px" }}>
              <div style={{ color: "#fca5a5", fontSize: "12px", display: "flex", gap: "8px" }}>
                <span>⚠️</span>
                <span>Deploying will <strong>overwrite</strong> any existing fields in the target industry with the same code.</span>
              </div>
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button 
                onClick={() => setIsCloneModalOpen(false)}
                style={{ ...G.btnGhost, flex: 1 }}
              >
                Cancel
              </button>
              <button 
                disabled={isCloning || !cloneSource || !cloneTarget || selectedFieldIds.length === 0}
                onClick={handleClone}
                style={{ ...G.btnPrimary, flex: 2, background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              >
                {isCloning ? "Deploying..." : "🔥 Deploy Selected Fields"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
