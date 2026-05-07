"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getToken } from "@/lib/api";
import { G, GhostBg, ANIM_CSS } from "@/lib/adminTheme";
import { Megaphone, Trash2, Plus, X, Calendar, Target, Image as ImageIcon, Send, Clock, CheckCircle2, AlertCircle } from "lucide-react";

type Announcement = {
    id: number;
    message_type: "text" | "image";
    content: string;
    start_date: string | null;
    end_date: string | null;
    is_active: boolean;
    target_tenant_ids: number[] | null;
    created_at: string;
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

export default function AdminAnnouncementsPage() {
    const router = useRouter();
    const token = typeof window !== "undefined" ? getToken() : null;
    
    const { data: currentUser, isLoading: meLoading } = useSWR(
        token ? "/auth/me" : null,
        (url: string) => api.get(url).then((r) => r.data)
    );

    const isSuperAdmin = String(currentUser?.role || "").toLowerCase() === "superadmin";

    useEffect(() => {
        if (meLoading) return;
        if (!isSuperAdmin) {
            router.replace("/admin");
        }
    }, [meLoading, isSuperAdmin, router]);

    const { data: announcementsRaw, isLoading, error, mutate } = useSWR<Announcement[]>(
        "/admin/announcements",
        fetcher
    );

    const announcements = announcementsRaw || [];

    // Tenant Selection & Filtering
    const { data: tenantsRaw } = useSWR("/admin/tenants", fetcher);
    const { data: businessTypesRaw } = useSWR("/admin/settings/business-types", fetcher);
    const { data: plansRaw } = useSWR("/admin/plans", fetcher);

    const tenants = (tenantsRaw || []) as any[];
    const businessTypes = (businessTypesRaw || []) as any[];
    const plans = (plansRaw || []) as any[];

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [msgType, setMsgType] = useState<"text" | "image">("text");
    const [content, setContent] = useState("");
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");
    const [saving, setSaving] = useState(false);
    
    // Selection state
    const [selectedTenantIds, setSelectedTenantIds] = useState<Set<number>>(new Set());
    const [tenantSearch, setTenantSearch] = useState("");
    const [planFilter, setPlanFilter] = useState("all");
    const [categoryFilter, setCategoryFilter] = useState("all");

    const filteredTenants = useMemo(() => {
        return tenants.filter(t => {
            const matchesSearch = t.name.toLowerCase().includes(tenantSearch.toLowerCase());
            const matchesPlan = planFilter === "all" || t.plan === planFilter;
            const matchesCategory = categoryFilter === "all" || String(t.business_type_id) === categoryFilter;
            return matchesSearch && matchesPlan && matchesCategory;
        });
    }, [tenants, tenantSearch, planFilter, categoryFilter]);

    const toggleTenant = (id: number) => {
        const next = new Set(selectedTenantIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedTenantIds(next);
    };

    const selectAllFiltered = () => {
        const next = new Set(selectedTenantIds);
        filteredTenants.forEach(t => next.add(t.id));
        setSelectedTenantIds(next);
    };

    const deselectAllFiltered = () => {
        const next = new Set(selectedTenantIds);
        filteredTenants.forEach(t => next.delete(t.id));
        setSelectedTenantIds(next);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            const payload = {
                message_type: msgType,
                content: content.trim(),
                start_date: startDate ? new Date(startDate).toISOString() : null,
                end_date: endDate ? new Date(endDate).toISOString() : null,
                target_tenant_ids: selectedTenantIds.size > 0 ? Array.from(selectedTenantIds) : null,
                is_active: true
            };
            await api.post("/admin/announcements", payload);
            setShowCreateForm(false);
            setContent("");
            setStartDate("");
            setEndDate("");
            setSelectedTenantIds(new Set());
            mutate();
        } catch (err: any) {
            alert(err?.response?.data?.detail || "Failed to broadcast message");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this broadcast?")) return;
        try {
            await api.delete(`/admin/announcements/${id}`);
            mutate();
        } catch (err: any) {
            alert(err?.response?.data?.detail || "Failed to delete");
        }
    };

    const formatDate = (dateStr: string | null) => {
        if (!dateStr) return "N/A";
        return new Date(dateStr).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short"
        });
    };

    const getStatus = (ann: Announcement) => {
        const now = new Date();
        const start = ann.start_date ? new Date(ann.start_date) : null;
        const end = ann.end_date ? new Date(ann.end_date) : null;

        if (!ann.is_active) return { label: "Inactive", color: "#64748b" };
        if (start && start > now) return { label: "Scheduled", color: "#6366f1" };
        if (end && end < now) return { label: "Expired", color: "#ef4444" };
        return { label: "Live", color: "#10b981" };
    };

    if (meLoading || !isSuperAdmin) return null;

    return (
        <div style={G.pageWrap}>
            <style>{ANIM_CSS}</style>
            <GhostBg />
            <div style={{ ...G.inner, maxWidth: "1200px" }}>
                
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #10b981, #059669)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", boxShadow: "0 0 20px rgba(16,185,129,0.3)" }}>
                                📢
                            </div>
                            <h1 style={{ fontSize: "28px", fontWeight: 800, background: "linear-gradient(135deg, #10b981, #34d399)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", margin: 0 }}>
                                System Broadcasts
                            </h1>
                        </div>
                        <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>Create and manage global announcements for all or specific tenants</p>
                    </div>
                    <button 
                        onClick={() => {
                            setSelectedTenantIds(new Set());
                            setShowCreateForm(true);
                        }}
                        style={{ height: "42px", padding: "0 20px", borderRadius: "12px", background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", fontSize: "14px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "8px", boxShadow: "0 4px 15px rgba(16,185,129,0.3)" }}
                    >
                        <Plus size={18} /> New Broadcast
                    </button>
                </div>

                {/* List */}
                <div style={{ display: "grid", gap: "16px" }}>
                    {isLoading ? (
                        <div style={{ textAlign: "center", padding: "60px", color: "#475569" }}>Fetching broadcasts...</div>
                    ) : announcements.length === 0 ? (
                        <div style={{ textAlign: "center", padding: "80px", background: "rgba(255,255,255,0.02)", borderRadius: "24px", border: "1px dashed rgba(255,255,255,0.1)" }}>
                            <Megaphone size={48} style={{ color: "rgba(255,255,255,0.05)", marginBottom: "16px" }} />
                            <div style={{ color: "#475569", fontSize: "16px" }}>No broadcasts found. Start by creating one!</div>
                        </div>
                    ) : announcements.map(ann => {
                        const status = getStatus(ann);
                        return (
                            <div key={ann.id} style={{ background: "rgba(15,23,42,0.4)", borderRadius: "20px", border: "1px solid rgba(255,255,255,0.05)", padding: "20px", display: "flex", gap: "20px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: 0, left: 0, width: "4px", height: "100%", background: status.color }} />
                                
                                <div style={{ width: "48px", height: "48px", borderRadius: "12px", background: ann.message_type === "image" ? "rgba(99,102,241,0.1)" : "rgba(16,185,129,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: ann.message_type === "image" ? "#818cf8" : "#10b981", flexShrink: 0 }}>
                                    {ann.message_type === "image" ? <ImageIcon size={24} /> : <Send size={24} />}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "8px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <span style={{ fontSize: "11px", fontWeight: 800, textTransform: "uppercase", letterSpacing: "1px", color: status.color, background: `${status.color}15`, padding: "2px 8px", borderRadius: "10px" }}>
                                                {status.label}
                                            </span>
                                            <span style={{ color: "#475569", fontSize: "12px" }}>ID: #{ann.id}</span>
                                        </div>
                                        <button 
                                            onClick={() => handleDelete(ann.id)}
                                            style={{ background: "rgba(239,68,68,0.1)", border: "none", color: "#ef4444", padding: "8px", borderRadius: "10px", cursor: "pointer" }}
                                            title="Delete broadcast"
                                        >
                                            <Trash2 size={16} />
                                        </button>
                                    </div>

                                    <div style={{ color: "#e2e8f0", fontSize: "15px", fontWeight: 500, marginBottom: "12px", lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                                        {ann.content}
                                    </div>

                                    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px" }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "12px" }}>
                                            <Calendar size={14} />
                                            <span>Start: {formatDate(ann.start_date)}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "12px" }}>
                                            <Clock size={14} />
                                            <span>End: {formatDate(ann.end_date)}</span>
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "#64748b", fontSize: "12px" }}>
                                            <Target size={14} />
                                            <span>Targets: {ann.target_tenant_ids ? `${ann.target_tenant_ids.length} tenants` : "All tenants"}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Create Modal */}
                {showCreateForm && (
                     <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={() => setShowCreateForm(false)}>
                        <div style={{ background: "#0f172a", width: "100%", maxWidth: "800px", borderRadius: "24px", border: "1px solid rgba(16,185,129,0.3)", padding: "32px", animation: "scaleUp 0.15s ease", position: "relative", maxHeight: "90vh", overflowY: "auto" }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => setShowCreateForm(false)} style={{ position: "absolute", top: "20px", right: "20px", background: "none", border: "none", color: "#475569", cursor: "pointer" }}><X size={24} /></button>
                            
                            <h2 style={{ fontSize: "22px", fontWeight: 800, color: "#fff", margin: "0 0 8px" }}>Broadcast New Message</h2>
                            <p style={{ color: "#64748b", fontSize: "14px", marginBottom: "24px" }}>Send an announcement to select tenants.</p>

                            <form onSubmit={handleSubmit} style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "32px" }}>
                                
                                {/* Left Side: Content */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                                    <div>
                                        <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>Message Type</label>
                                        <div style={{ display: "flex", gap: "10px" }}>
                                            {["text", "image"].map((t) => (
                                                <button
                                                    key={t}
                                                    type="button"
                                                    onClick={() => setMsgType(t as any)}
                                                    style={{ flex: 1, height: "40px", borderRadius: "10px", background: msgType === t ? "rgba(16,185,129,0.15)" : "rgba(255,255,255,0.03)", border: msgType === t ? "1px solid #10b981" : "1px solid rgba(255,255,255,0.05)", color: msgType === t ? "#10b981" : "#64748b", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                                                >
                                                    {t.charAt(0).toUpperCase() + t.slice(1)}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <div>
                                        <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>
                                            {msgType === "image" ? "Image URL" : "Message Content"}
                                        </label>
                                        <textarea 
                                            style={{ ...G.inputStyle, minHeight: "120px", padding: "12px", resize: "none" }}
                                            value={content}
                                            onChange={e => setContent(e.target.value)}
                                            placeholder={msgType === "image" ? "https://..." : "Type your message here..."}
                                            required
                                        />
                                    </div>

                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                                        <div>
                                            <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>Start Date</label>
                                            <input type="datetime-local" style={G.inputStyle} value={startDate} onChange={e => setStartDate(e.target.value)} />
                                        </div>
                                        <div>
                                            <label style={{ display: "block", color: "#475569", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", marginBottom: "8px" }}>End Date</label>
                                            <input type="datetime-local" style={G.inputStyle} value={endDate} onChange={e => setEndDate(e.target.value)} />
                                        </div>
                                    </div>

                                    <button 
                                        type="submit"
                                        disabled={saving}
                                        style={{ height: "48px", background: "linear-gradient(135deg, #10b981, #059669)", color: "#fff", border: "none", borderRadius: "14px", fontWeight: 700, fontSize: "15px", cursor: "pointer", marginTop: "auto", boxShadow: "0 4px 15px rgba(16,185,129,0.3)" }}
                                    >
                                        {saving ? "Sending Broadcast..." : `Send to ${selectedTenantIds.size || "All"} Tenants`}
                                    </button>
                                </div>

                                {/* Right Side: Filters */}
                                <div style={{ background: "rgba(255,255,255,0.02)", borderRadius: "20px", padding: "20px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: "16px" }}>
                                    <h3 style={{ fontSize: "14px", fontWeight: 700, color: "#94a3b8", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>Target Audience</h3>
                                    
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                                        <select 
                                            style={{ ...G.inputStyle, padding: "0 10px" }}
                                            value={planFilter}
                                            onChange={e => setPlanFilter(e.target.value)}
                                        >
                                            <option value="all">All Plans</option>
                                            {plans.map(p => <option key={p.id} value={p.code}>{p.name}</option>)}
                                        </select>

                                        <select 
                                            style={{ ...G.inputStyle, padding: "0 10px" }}
                                            value={categoryFilter}
                                            onChange={e => setCategoryFilter(e.target.value)}
                                        >
                                            <option value="all">All Industries</option>
                                            {businessTypes.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
                                        </select>
                                    </div>

                                    <div style={{ position: "relative" }}>
                                        <input 
                                            style={{ ...G.inputStyle, paddingLeft: "36px" }}
                                            placeholder="Search tenants..."
                                            value={tenantSearch}
                                            onChange={e => setTenantSearch(e.target.value)}
                                        />
                                        <X size={14} style={{ position: "absolute", left: "12px", top: "14px", color: "#64748b" }} />
                                    </div>

                                    <div style={{ flex: 1, overflowY: "auto", minHeight: "200px", padding: "10px", background: "rgba(0,0,0,0.2)", borderRadius: "12px" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "10px" }}>
                                            {filteredTenants.length > 0 && (
                                                <button 
                                                    type="button" 
                                                    onClick={filteredTenants.every(t => selectedTenantIds.has(t.id)) ? deselectAllFiltered : selectAllFiltered} 
                                                    style={{ background: "none", border: "none", color: filteredTenants.every(t => selectedTenantIds.has(t.id)) ? "#ef4444" : "#10b981", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
                                                >
                                                    {filteredTenants.every(t => selectedTenantIds.has(t.id)) ? "Unselect All" : "Select All"}
                                                </button>
                                            )}
                                            <button type="button" onClick={() => setSelectedTenantIds(new Set())} style={{ background: "none", border: "none", color: "#64748b", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}>Clear Total Selection</button>
                                        </div>
                                        {filteredTenants.map(t => (
                                            <div 
                                                key={t.id} 
                                                onClick={() => toggleTenant(t.id)}
                                                style={{ padding: "8px 12px", borderRadius: "8px", background: selectedTenantIds.has(t.id) ? "rgba(16,185,129,0.1)" : "transparent", color: selectedTenantIds.has(t.id) ? "#10b981" : "#94a3b8", fontSize: "13px", cursor: "pointer", display: "flex", alignItems: "center", gap: "10px", marginBottom: "4px" }}
                                            >
                                                <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid", borderColor: selectedTenantIds.has(t.id) ? "#10b981" : "#475569", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                    {selectedTenantIds.has(t.id) && <CheckCircle2 size={12} fill="#10b981" color="#fff" />}
                                                </div>
                                                <span style={{ fontWeight: 500 }}>{t.name}</span>
                                                <span style={{ fontSize: "10px", marginLeft: "auto", opacity: 0.6 }}>{t.plan}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", background: "rgba(16,185,129,0.1)", padding: "10px", borderRadius: "10px", color: "#10b981", fontSize: "12px" }}>
                                        <AlertCircle size={14} />
                                        <span>{selectedTenantIds.size || "All"} active selections</span>
                                    </div>
                                </div>

                            </form>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
