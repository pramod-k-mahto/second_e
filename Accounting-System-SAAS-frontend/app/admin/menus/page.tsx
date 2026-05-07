"use client";

import { FormEvent, useMemo, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { G, GhostBg, ANIM_CSS } from "@/lib/adminTheme";
import { Layers, Plus, Search, Trash2, Edit2, Check, X, ShieldAlert } from "lucide-react";

type MenuAdminItem = {
  id: number;
  label: string;
  code: string;
  module: string | null;
  parent_id: number | null;
  sort_order: number | null;
  is_active: boolean;
};

const fetcher = (url: string) => api.get(url).then((res) => res.data as MenuAdminItem[]);

export default function AdminMenusPage() {
  const { data, error, mutate, isLoading } = useSWR<MenuAdminItem[]>(
    "/admin/menus?include_inactive=true",
    fetcher
  );

  const inlineInput: React.CSSProperties = {
    ...G.inputStyle,
    height: "30px",
    padding: "4px 10px",
    fontSize: "12px",
    background: "rgba(0,0,0,0.3)", // Darker for inline contrast
    border: "1px solid rgba(99,102,241,0.2)"
  };

  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");

  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createLabel, setCreateLabel] = useState("");
  const [createCode, setCreateCode] = useState("");
  const [createModule, setCreateModule] = useState<string>("");
  const [createParentId, setCreateParentId] = useState<string>("");
  const [createSortOrder, setCreateSortOrder] = useState<string>("");
  const [createActive, setCreateActive] = useState(true);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editCode, setEditCode] = useState("");
  const [editModule, setEditModule] = useState<string>("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [editSortOrder, setEditSortOrder] = useState<string>("");
  const [editActive, setEditActive] = useState(true);
  const [editError, setEditError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);

  const menus = data || [];
  const modules = Array.from(new Set(menus.map(m => m.module).filter(Boolean))).sort();

  const filteredMenus = useMemo(() => {
    return menus.filter(m => {
      const label = m.label || "";
      const code = m.code || "";
      const mod = m.module || "";
      const matchSearch = (label + code + mod).toLowerCase().includes(search.toLowerCase());
      const matchModule = moduleFilter === "all" || (moduleFilter === "Menu Group" ? m.module === "Menu Group" : m.module === moduleFilter);
      return matchSearch && matchModule;
    }).sort((a,b) => (a.module || "").localeCompare(b.module || "") || (a.sort_order || 0) - (b.sort_order || 0));
  }, [menus, search, moduleFilter]);

  const parentOptions = useMemo(
    () => menus.filter((m) => m.parent_id === null),
    [menus]
  );

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreating(true);
    try {
      await api.post("/admin/menus", {
        label: createLabel.trim(),
        code: createCode.trim(),
        module: createModule.trim() || null,
        parent_id: createParentId ? Number(createParentId) : null,
        sort_order: createSortOrder ? Number(createSortOrder) : null,
        is_active: createActive,
      });
      setCreateLabel("");
      setCreateCode("");
      setCreateModule("");
      setCreateParentId("");
      setCreateSortOrder("");
      setCreateActive(true);
      setShowCreateForm(false);
      await mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setCreateError(detail || "Failed to create menu");
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (m: MenuAdminItem) => {
    setEditingId(m.id);
    setEditLabel(m.label);
    setEditCode(m.code);
    setEditModule(m.module || "");
    setEditParentId(m.parent_id != null ? String(m.parent_id) : "");
    setEditSortOrder(m.sort_order != null ? String(m.sort_order) : "");
    setEditActive(m.is_active);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditError(null);
  };

  const handleEditSave = async (id: number) => {
    setEditError(null);
    try {
      await api.put(`/admin/menus/${id}`, {
        label: editLabel.trim() || undefined,
        code: editCode.trim() || undefined,
        module: editModule.trim() || null,
        parent_id: editParentId ? Number(editParentId) : null,
        sort_order: editSortOrder ? Number(editSortOrder) : null,
        is_active: editActive,
      });
      setEditingId(null);
      await mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setEditError(detail || "Failed to update menu");
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Soft-delete this menu? It will be hidden from normal users.")) return;
    setActionError(null);
    try {
      await api.delete(`/admin/menus/${id}`);
      await mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setActionError(detail || "Failed to delete menu");
    }
  };

  const handleSeed = async () => {
    if (!confirm("Seed default menus? This may overwrite existing definitions by code.")) {
      return;
    }
    setSeeding(true);
    setActionError(null);
    try {
      const res = await api.post<MenuAdminItem[]>("/admin/menus/seed");
      await mutate(res.data, false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setActionError(detail || "Failed to seed menus");
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={{ ...G.inner, maxWidth: "1350px" }}>
        
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
          <div>
            <h1 style={{ fontSize: "28px", fontWeight: 900, background: "linear-gradient(135deg, #a78bfa, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: "0 0 4px" }}>
               Menus Library
            </h1>
            <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>Central repository for all system menus and navigation groups</p>
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button
               onClick={handleSeed}
               disabled={seeding}
               style={{ height: "38px", padding: "0 16px", borderRadius: "10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
            >
               {seeding ? "Seeding…" : "Seed Defaults"}
            </button>
            <button
               onClick={() => setShowCreateForm(true)}
               style={{ height: "38px", padding: "0 16px", borderRadius: "10px", background: "linear-gradient(135deg, #6366f1, #4f46e5)", border: "none", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px" }}
            >
               <Plus size={16} /> Create Menu
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", gap: "16px", marginBottom: "24px", background: "rgba(15,23,42,0.6)", padding: "16px", borderRadius: "16px", border: "1px dashed rgba(255,255,255,0.05)" }}>
           <div style={{ position: "relative", flex: 1 }}>
              <Search size={18} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#475569" }} />
              <input 
                placeholder="Search menus by label, code or module..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ ...G.inputStyle, paddingLeft: "42px", height: "42px" }}
              />
           </div>
            <select 
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              style={{ ...G.inputStyle, width: "180px", height: "42px", padding: "0 12px" }}
            >
               <option value="all">All Modules</option>
               <option value="Menu Group" style={{ fontWeight: 800, color: "#818cf8" }}>📦 Custom Groups</option>
               {(modules as string[]).filter(m => m !== "Menu Group").map(m => (
                 <option key={m} value={m}>{m}</option>
               ))}
            </select>
        </div>

        {/* Table Container */}
        <div style={{ background: "rgba(30,41,59,0.4)", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)", overflow: "hidden", position: "relative", minHeight: "400px" }}>
           <table style={{ width: "100%", borderCollapse: "collapse" }}>
             <thead>
               <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                 <th style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Label / Code</th>
                 <th style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Module</th>
                 <th style={{ padding: "12px 20px", textAlign: "left", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Parent</th>
                 <th style={{ padding: "12px 20px", textAlign: "center", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Sort</th>
                 <th style={{ padding: "12px 20px", textAlign: "center", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Status</th>
                 <th style={{ padding: "12px 20px", textAlign: "right", fontSize: "11px", color: "#475569", textTransform: "uppercase", letterSpacing: "1px" }}>Actions</th>
               </tr>
             </thead>
             <tbody>
               {isLoading ? (
                 <tr>
                   <td colSpan={6} style={{ textAlign: "center", padding: "60px", color: "#475569" }}>Loading database...</td>
                 </tr>
               ) : filteredMenus.length === 0 ? (
                 <tr>
                   <td colSpan={6} style={{ textAlign: "center", padding: "60px", color: "#475569" }}>No menus match your filter.</td>
                 </tr>
               ) : filteredMenus.map(m => {
                 const isEditing = editingId === m.id;
                 const isGroup = m.module === "Menu Group";
                 return (
                   <tr key={m.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", background: isGroup ? "rgba(99,102,241,0.02)" : "transparent" }}>
                     <td style={{ padding: "12px 20px" }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            <input style={{ ...inlineInput }} value={editLabel || ""} onChange={e => setEditLabel(e.target.value)} placeholder="Label" />
                            <input style={{ ...inlineInput, height: "24px", fontSize: "10px", fontFamily: "monospace", padding: "2px 8px" }} value={editCode || ""} onChange={e => setEditCode(e.target.value)} placeholder="Code" />
                          </div>
                        ) : (
                         <div>
                            <div style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: isGroup ? 700 : 500, display: "flex", alignItems: "center", gap: "6px" }}>
                               {isGroup && <Layers size={12} style={{ color: "#818cf8" }} />}
                               {m.label}
                               {isGroup && (
                                 <span style={{ fontSize: "9px", color: "#818cf8", background: "rgba(129,140,248,0.15)", padding: "1px 6px", borderRadius: "10px", fontWeight: 800, letterSpacing: "0.5px" }}>
                                   GROUP
                                 </span>
                               )}
                            </div>
                            <div style={{ color: "#475569", fontSize: "10px", fontFamily: "monospace", marginTop: "2px" }}>{m.code}</div>
                         </div>
                       )}
                     </td>
                     <td style={{ padding: "12px 20px" }}>
                         {isEditing ? (
                           <input style={{ ...inlineInput, width: "130px" }} value={editModule || ""} onChange={e => setEditModule(e.target.value)} placeholder="Module" />
                         ) : (
                          <span style={{ fontSize: "11px", padding: "2px 8px", borderRadius: "6px", background: isGroup ? "rgba(129,140,248,0.15)" : "rgba(255,255,255,0.05)", color: isGroup ? "#818cf8" : "#94a3b8" }}>
                             {m.module || "Unassigned"}
                          </span>
                        )}
                     </td>
                     <td style={{ padding: "12px 20px" }}>
                         {isEditing ? (
                            <select style={{ ...inlineInput, width: "150px", cursor: "pointer" }} value={editParentId || ""} onChange={e => setEditParentId(e.target.value)}>
                               <option value="">(None)</option>
                               {parentOptions.filter(po => po.id !== m.id).map(po => <option key={po.id} value={po.id}>{po.label}</option>)}
                            </select>
                         ) : (
                          <span style={{ fontSize: "11px", color: "#475569" }}>
                             {menus.find(p => p.id === m.parent_id)?.label || "—"}
                          </span>
                        )}
                     </td>
                     <td style={{ padding: "12px 20px", textAlign: "center" }}>
                         {isEditing ? (
                            <input type="number" style={{ ...inlineInput, width: "50px", textAlign: "center" }} value={editSortOrder || ""} onChange={e => setEditSortOrder(e.target.value)} />
                         ) : (
                           <span style={{ fontSize: "11px", color: "#475569" }}>{m.sort_order || 0}</span>
                        )}
                     </td>
                     <td style={{ padding: "12px 20px", textAlign: "center" }}>
                        {isEditing ? (
                           <input type="checkbox" checked={editActive} onChange={e => setEditActive(e.target.checked)} />
                        ) : (
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "4px", padding: "2px 8px", borderRadius: "12px", background: m.is_active ? "rgba(16,185,129,0.1)" : "rgba(239,68,68,0.1)", color: m.is_active ? "#10b981" : "#ef4444", fontSize: "10px", fontWeight: 700 }}>
                             {m.is_active ? <Check size={10} /> : <X size={10} />}
                             {m.is_active ? "ACTIVE" : "INACTIVE"}
                          </div>
                        )}
                     </td>
                     <td style={{ padding: "12px 20px", textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
                          {isEditing ? (
                             <>
                                <button onClick={() => handleEditSave(m.id)} style={{ padding: "6px", borderRadius: "6px", background: "rgba(16,185,129,0.1)", border: "none", color: "#10b981", cursor: "pointer" }}><Check size={14} /></button>
                                <button onClick={cancelEdit} style={{ padding: "6px", borderRadius: "6px", background: "rgba(239,68,68,0.1)", border: "none", color: "#ef4444", cursor: "pointer" }}><X size={14} /></button>
                             </>
                          ) : (
                             <>
                                <button onClick={() => startEdit(m)} style={{ padding: "6px", borderRadius: "6px", background: "rgba(255,255,255,0.05)", border: "none", color: "#94a3b8", cursor: "pointer" }}><Edit2 size={14} /></button>
                                <button onClick={() => handleDelete(m.id)} style={{ padding: "6px", borderRadius: "6px", background: "rgba(239,68,68,0.05)", border: "none", color: "#475569", cursor: "pointer" }}><Trash2 size={14} /></button>
                             </>
                          )}
                        </div>
                     </td>
                   </tr>
                 );
               })}
             </tbody>
           </table>
        </div>

        {/* Create Modal */}
        {showCreateForm && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setShowCreateForm(false)}>
             <div style={{ background: "#0f172a", width: "100%", maxWidth: "500px", borderRadius: "24px", border: "1px solid rgba(99,102,241,0.3)", padding: "24px", animation: "scaleUp 0.2s ease" }} onClick={e => e.stopPropagation()}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px" }}>
                   <h2 style={{ fontSize: "18px", fontWeight: 800, color: "#fff", margin: 0 }}>Create New Menu</h2>
                   <button onClick={() => setShowCreateForm(false)} style={{ background: "none", border: "none", color: "#475569", cursor: "pointer" }}><X size={20} /></button>
                </div>
                {createError && <div style={{ color: "#ef4444", fontSize: "12px", background: "rgba(239,68,68,0.1)", padding: "8px 12px", borderRadius: "8px", marginBottom: "16px" }}>{createError}</div>}
                
                <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                   <div>
                     <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Label</label>
                     <input style={G.inputStyle} value={createLabel} onChange={e => setCreateLabel(e.target.value)} placeholder="e.g. Daily Reports" required />
                   </div>
                   <div>
                     <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Menu Code (Unique)</label>
                     <input style={{ ...G.inputStyle, fontFamily: "monospace" }} value={createCode} onChange={e => setCreateCode(e.target.value)} placeholder="e.g. reports.daily" required />
                   </div>
                   <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                      <div>
                        <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Module</label>
                        <input style={G.inputStyle} value={createModule} onChange={e => setCreateModule(e.target.value)} placeholder="e.g. Sales" />
                      </div>
                      <div>
                        <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "6px" }}>Parent</label>
                        <select style={G.inputStyle} value={createParentId} onChange={e => setCreateParentId(e.target.value)}>
                           <option value="">None</option>
                           {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                        </select>
                      </div>
                   </div>
                   <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <input type="checkbox" id="c_active" checked={createActive} onChange={e => setCreateActive(e.target.checked)} />
                      <label htmlFor="c_active" style={{ color: "#94a3b8", fontSize: "13px" }}>Active for all tenants</label>
                   </div>
                   <button 
                     type="submit" 
                     disabled={creating}
                     style={{ height: "42px", background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "14px", cursor: "pointer", marginTop: "12px" }}
                   >
                     {creating ? "Creating…" : "Register Menu"}
                   </button>
                </form>
             </div>
          </div>
        )}

      </div>
    </div>
  );
}
