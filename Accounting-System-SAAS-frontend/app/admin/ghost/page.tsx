"use client";

import { useMemo, useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import Link from "next/link";
import { api, getToken } from "@/lib/api";

type Tenant = {
    id: number;
    name: string;
    plan?: string | null;
    status?: string | null;
    companies_count?: number | null;
    company_count?: number | null;
    users_count?: number | null;
    user_count?: number | null;
    expires_at?: string | null;
    modules?: string[] | null;
    created_at?: string | null;
};

type AdminStats = {
    total_tenants?: number;
    active_tenants?: number;
    total_companies?: number;
    total_users?: number;
};

type GhostSmartReportTransaction = {
    date: string;
    type: "SALES" | "RECEIPT";
    tenant_name: string;
    amount: number;
    reference?: string;
};

type GhostSmartReportResponse = {
    total_sales: number;
    total_collections: number;
    total_outstanding: number;
    recent_transactions: GhostSmartReportTransaction[];
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);


const planBadge: Record<string, string> = {
    enterprise:
        "bg-violet-500/20 text-violet-300 border border-violet-500/30",
    premium: "bg-amber-500/20 text-amber-300 border border-amber-500/30",
    standard: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30",
};


function formatDate(dateStr?: string | null) {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
}

function getExpiryStatus(expiresAt?: string | null) {
    if (!expiresAt) return null;
    const now = new Date();
    const exp = new Date(expiresAt);
    const diffMs = exp.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: "Expired", cls: "text-red-400" };
    if (diffDays <= 7) return { label: `${diffDays}d left`, cls: "text-amber-400" };
    if (diffDays <= 30) return { label: `${diffDays}d left`, cls: "text-yellow-400" };
    return { label: `${diffDays}d left`, cls: "text-emerald-400" };
}

// Animated count-up
function CountUp({ target, prefix = "" }: { target: number; prefix?: string }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        if (!target) return;
        const step = Math.ceil(target / 40);
        let current = 0;
        const timer = setInterval(() => {
            current = Math.min(current + step, target);
            setVal(current);
            if (current >= target) clearInterval(timer);
        }, 20);
        return () => clearInterval(timer);
    }, [target]);
    return (
        <span>
            {prefix}
            {val.toLocaleString()}
        </span>
    );
}

export default function SuperAdminGhostDashboard() {
    const router = useRouter();
    const token = typeof window !== "undefined" ? getToken() : null;
    const { data: currentUser, isLoading: meLoading } = useSWR(
        token ? "/auth/me" : null,
        (url: string) => api.get(url).then((r) => r.data)
    );

    const isSuperAdmin = String(currentUser?.role || "").toLowerCase() === "superadmin";
    const isAnyGhostAdmin = isSuperAdmin || String(currentUser?.role || "").toLowerCase().startsWith("ghost_");

    useEffect(() => {
        if (meLoading) return;
        if (!isAnyGhostAdmin) {
            router.replace("/admin");
        }
    }, [meLoading, isAnyGhostAdmin, router]);

    const { data: tenantsRaw, isLoading, error, mutate } = useSWR<Tenant[]>(
        "/admin/tenants",
        fetcher,
        { refreshInterval: 30000 }
    );

    const { data: statsRaw } = useSWR<AdminStats>("/admin/stats", fetcher, {
        refreshInterval: 60000,
        onErrorRetry: (_err, _key, _config, _revalidate, { retryCount }) => {
            if (retryCount >= 1) return;
        },
    });

    const { data: smartReport, isLoading: smartLoading } = useSWR<GhostSmartReportResponse>(
        "/admin/tenants/ghost/smart-report",
        fetcher,
        { refreshInterval: 60000 }
    );

    const [search, setSearch] = useState("");
    const [planFilter, setPlanFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "plan" | "expires" | "companies" | "users">("name");
    const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
    const [viewMode, setViewMode] = useState<"table" | "cards">("table");
    const [selectedTenants, setSelectedTenants] = useState<Set<number>>(new Set());

    const tenants = tenantsRaw || [];

    const stats = useMemo(() => {
        const total = tenants.length;
        const active = tenants.filter(
            (t) => (t.status || "").toLowerCase() === "active"
        ).length;
        const totalCompanies = tenants.reduce((sum, t) => {
            const c =
                typeof t.companies_count === "number"
                    ? t.companies_count
                    : typeof t.company_count === "number"
                        ? t.company_count
                        : 0;
            return sum + (c || 0);
        }, 0);
        const planBreakdown: Record<string, number> = {};
        tenants.forEach((t) => {
            const p = (t.plan || "standard").toLowerCase();
            planBreakdown[p] = (planBreakdown[p] || 0) + 1;
        });
        const expiringSoon = tenants.filter((t) => {
            if (!t.expires_at) return false;
            const diff = new Date(t.expires_at).getTime() - Date.now();
            return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000;
        }).length;
        return {
            total,
            active,
            totalCompanies,
            planBreakdown,
            expiringSoon,
            totalUsers: statsRaw?.total_users ?? null,
        };
    }, [tenants, statsRaw]);

    const availablePlans = useMemo(() => {
        const set = new Set<string>();
        tenants.forEach((t) => {
            if (t.plan) set.add(t.plan.toLowerCase());
        });
        return Array.from(set).sort();
    }, [tenants]);

    const availableStatuses = useMemo(() => {
        const set = new Set<string>();
        tenants.forEach((t) => {
            if (t.status) set.add(t.status.toLowerCase());
            else set.add("unknown");
        });
        return Array.from(set).sort();
    }, [tenants]);

    const filteredTenants = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tenants
            .filter((t) => {
                const matchQ =
                    !q ||
                    String(t.id).includes(q) ||
                    (t.name || "").toLowerCase().includes(q) ||
                    (t.plan || "").toLowerCase().includes(q) ||
                    (t.status || "").toLowerCase().includes(q);
                const matchPlan = !planFilter || (t.plan || "").toLowerCase() === planFilter;
                const matchStatus =
                    !statusFilter ||
                    (t.status || "unknown").toLowerCase() === statusFilter;
                return matchQ && matchPlan && matchStatus;
            })
            .sort((a, b) => {
                let cmp = 0;
                if (sortBy === "name") cmp = (a.name || "").localeCompare(b.name || "");
                else if (sortBy === "plan")
                    cmp = (a.plan || "").localeCompare(b.plan || "");
                else if (sortBy === "expires") {
                    const at = a.expires_at ? new Date(a.expires_at).getTime() : Infinity;
                    const bt = b.expires_at ? new Date(b.expires_at).getTime() : Infinity;
                    cmp = at - bt;
                } else if (sortBy === "companies") {
                    const ac =
                        typeof a.companies_count === "number"
                            ? a.companies_count
                            : typeof a.company_count === "number"
                                ? a.company_count
                                : 0;
                    const bc =
                        typeof b.companies_count === "number"
                            ? b.companies_count
                            : typeof b.company_count === "number"
                                ? b.company_count
                                : 0;
                    cmp = (ac || 0) - (bc || 0);
                } else if (sortBy === "users") {
                    cmp = (a.users_count ?? a.user_count ?? 0) - (b.users_count ?? b.user_count ?? 0);
                }
                return sortDir === "asc" ? cmp : -cmp;
            });
    }, [tenants, search, planFilter, statusFilter, sortBy, sortDir]);

    const toggleSort = (col: typeof sortBy) => {
        if (sortBy === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
        else {
            setSortBy(col);
            setSortDir("asc");
        }
    };

    const toggleSelect = (id: number) => {
        setSelectedTenants((prev) => {
            const copy = new Set(prev);
            if (copy.has(id)) copy.delete(id);
            else copy.add(id);
            return copy;
        });
    };

    const toggleAll = () => {
        if (selectedTenants.size === filteredTenants.length) {
            setSelectedTenants(new Set());
        } else {
            setSelectedTenants(new Set(filteredTenants.map((t) => t.id)));
        }
    };
    
    const [renamingId, setRenamingId] = useState<number | null>(null);
    const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
    const [broadcastType, setBroadcastType] = useState<"text" | "image">("text");
    const [broadcastContent, setBroadcastContent] = useState("");
    const [broadcastStartDate, setBroadcastStartDate] = useState("");
    const [broadcastEndDate, setBroadcastEndDate] = useState("");
    const [broadcastSaving, setBroadcastSaving] = useState(false);

    const handleBroadcastSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setBroadcastSaving(true);
        try {
            const payload = {
                message_type: broadcastType,
                content: broadcastContent,
                start_date: broadcastStartDate ? new Date(broadcastStartDate).toISOString() : null,
                end_date: broadcastEndDate ? new Date(broadcastEndDate).toISOString() : null,
                target_tenant_ids: selectedTenants.size > 0 ? Array.from(selectedTenants) : null,
                is_active: true
            };
            await api.post("/admin/announcements", payload);
            alert("Message broadcasted successfully!");
            setIsBroadcastModalOpen(false);
            setBroadcastContent("");
            setBroadcastStartDate("");
            setBroadcastEndDate("");
            setSelectedTenants(new Set());
        } catch (err: any) {
            alert(err?.response?.data?.detail || "Failed to broadcast message");
        } finally {
            setBroadcastSaving(false);
        }
    };

    const handleRename = async (id: number, currentName: string) => {
        const newName = window.prompt("Enter new name for tenant:", currentName);
        if (!newName || newName.trim() === currentName) return;
        
        try {
            setRenamingId(id);
            await api.put(`/admin/tenants/${id}`, { name: newName.trim() });
            await mutate();
        } catch (err: any) {
            alert(err?.response?.data?.detail || "Failed to rename tenant");
        } finally {
            setRenamingId(null);
        }
    };

    const SortIcon = ({ col }: { col: typeof sortBy }) => (
        <span className="inline-block ml-1 opacity-60">
            {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
        </span>
    );

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "linear-gradient(135deg, #0a0a0f 0%, #0e0e1a 40%, #0a0f1a 100%)",
                color: "#e2e8f0",
                fontFamily:
                    "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
                padding: "0",
            }}
        >
            {/* Ambient background blobs */}
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    overflow: "hidden",
                    pointerEvents: "none",
                    zIndex: 0,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        top: "-20%",
                        left: "-10%",
                        width: "600px",
                        height: "600px",
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        top: "30%",
                        right: "-10%",
                        width: "500px",
                        height: "500px",
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(6,182,212,0.08) 0%, transparent 70%)",
                    }}
                />
                <div
                    style={{
                        position: "absolute",
                        bottom: "10%",
                        left: "30%",
                        width: "400px",
                        height: "400px",
                        borderRadius: "50%",
                        background:
                            "radial-gradient(circle, rgba(16,185,129,0.06) 0%, transparent 70%)",
                    }}
                />
            </div>

            {/* Main content */}
            <div className="relative z-10 px-4 py-8 sm:px-6 md:px-10 w-full" style={{ margin: "0 auto" }}>

                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "36px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                            <div
                                style={{
                                    width: "40px",
                                    height: "40px",
                                    borderRadius: "12px",
                                    background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: "20px",
                                    boxShadow: "0 0 20px rgba(124,58,237,0.4)",
                                }}
                            >
                                👻
                            </div>
                            <h1
                                style={{
                                    fontSize: "28px",
                                    fontWeight: 800,
                                    background:
                                        "linear-gradient(135deg, #a78bfa 0%, #06b6d4 50%, #34d399 100%)",
                                    WebkitBackgroundClip: "text",
                                    WebkitTextFillColor: "transparent",
                                    backgroundClip: "text",
                                    margin: 0,
                                    letterSpacing: "-0.5px",
                                }}
                            >
                                Ghost Dashboard
                            </h1>
                        </div>
                        <p style={{ color: "#64748b", fontSize: "14px", margin: 0 }}>
                            Superadmin control center — manage tenants, plans & system health
                        </p>
                    </div>

                    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                        <button
                            onClick={() => mutate()}
                            style={{
                                padding: "8px 16px",
                                borderRadius: "10px",
                                border: "1px solid rgba(255,255,255,0.1)",
                                background: "rgba(255,255,255,0.05)",
                                color: "#94a3b8",
                                fontSize: "13px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.1)";
                                (e.currentTarget as HTMLButtonElement).style.color = "#e2e8f0";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
                                (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
                            }}
                        >
                            ↻ Refresh
                        </button>
                        <button
                            onClick={() => setIsBroadcastModalOpen(true)}
                            style={{
                                padding: "8px 16px",
                                borderRadius: "10px",
                                background: "linear-gradient(135deg, #10b981, #059669)",
                                border: "none",
                                color: "#fff",
                                fontSize: "13px",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                boxShadow: "0 4px 15px rgba(16,185,129,0.3)",
                                transition: "all 0.2s",
                            }}
                        >
                            📢 Broadcast Message {selectedTenants.size > 0 ? `(${selectedTenants.size})` : ""}
                        </button>
                        <Link
                            href="/admin/announcements"
                            style={{
                                padding: "8px 14px",
                                borderRadius: "10px",
                                border: "1px solid rgba(16,185,129,0.3)",
                                background: "rgba(16,185,129,0.05)",
                                color: "#34d399",
                                fontSize: "13px",
                                textDecoration: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                transition: "all 0.2s",
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(16,185,129,0.1)";
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(16,185,129,0.05)";
                            }}
                        >
                            📋 History
                        </Link>
                        <Link
                            href="/admin/ghost/document-scan-usage"
                            style={{
                                padding: "8px 14px",
                                borderRadius: "10px",
                                border: "1px solid rgba(245,158,11,0.3)",
                                background: "rgba(245,158,11,0.08)",
                                color: "#fbbf24",
                                fontSize: "13px",
                                textDecoration: "none",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                                transition: "all 0.2s",
                            }}
                        >
                            📄 Scan Usage
                        </Link>
                        <Link
                            href="/admin/tenants"
                            style={{
                                padding: "8px 18px",
                                borderRadius: "10px",
                                background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
                                color: "#fff",
                                fontSize: "13px",
                                fontWeight: 600,
                                textDecoration: "none",
                                boxShadow: "0 4px 15px rgba(124,58,237,0.3)",
                                transition: "all 0.2s",
                            }}
                        >
                            + New Tenant
                        </Link>
                    </div>
                </div>

                {/* Smart Report Feature Card */}
                <Link href="/admin/ghost/reports" style={{ display: "block", textDecoration: "none", marginBottom: "32px" }}>
                    <div
                        className="g-card-hover"
                        style={{
                            background: "linear-gradient(135deg, rgba(167,139,250,0.15), rgba(79,70,229,0.1))",
                            border: "1px solid rgba(167,139,250,0.3)",
                            borderRadius: "20px",
                            padding: "24px 28px",
                            display: "flex",
                            alignItems: "center",
                            gap: "20px",
                            boxShadow: "0 8px 32px rgba(124,58,237,0.1)",
                            transition: "all 0.2s",
                        }}
                    >
                        <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 0 20px rgba(124,58,237,0.4)", flexShrink: 0 }}>
                            📈
                        </div>
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 800, fontSize: "18px", color: "#c4b5fd", marginBottom: "4px" }}>Platform Financial Hub</div>
                            <div style={{ color: "#64748b", fontSize: "13px" }}>View consolidated sales, collections, and credit aging reports for the entire SaaS platform</div>
                        </div>
                        <div style={{ color: "#a78bfa", fontWeight: 700, fontSize: "14px" }}>Open Hub →</div>
                    </div>
                </Link>

                {/* Smart Report Section */}
                <div style={{ marginBottom: "32px", animation: "fadeIn 0.5s ease" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "16px" }}>
                        <span style={{ fontSize: "20px" }}>📊</span>
                        <h2 style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", margin: 0 }}>Smart Report Summary</h2>
                        <div style={{ flexGrow: 1, height: "1px", background: "linear-gradient(90deg, rgba(255,255,255,0.1), transparent)" }} />
                        <Link href="/admin/ghost/reports" style={{ fontSize: "12px", color: "#a78bfa", textDecoration: "none", fontWeight: 600 }}>View Full Hub →</Link>
                    </div>

                    <div style={{ 
                        background: "rgba(255,255,255,0.02)", 
                        border: "1px solid rgba(255,255,255,0.05)", 
                        borderRadius: "16px", 
                        overflow: "hidden",
                        marginBottom: "16px"
                    }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                                <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                                    <th style={{ padding: "14px 20px", textAlign: "left", fontSize: "12px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>ACCOUNTING METRIC</th>
                                    <th style={{ padding: "14px 20px", textAlign: "right", fontSize: "12px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>CONSOLIDATED TOTAL</th>
                                    <th style={{ padding: "14px 20px", textAlign: "center", fontSize: "12px", color: "#64748b", fontWeight: 600, letterSpacing: "1px" }}>ACTION</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    {
                                        label: "Total Platform Sales",
                                        value: smartReport?.total_sales ?? 0,
                                        icon: "💰",
                                        textColor: "#a78bfa",
                                        href: "/admin/ghost/reports/sales"
                                    },
                                    {
                                        label: "Tenant Collections & Receipts",
                                        value: smartReport?.total_collections ?? 0,
                                        icon: "📥",
                                        textColor: "#34d399",
                                        href: "/admin/ghost/reports/collections"
                                    },
                                    {
                                        label: "Outstanding Platform Credit",
                                        value: smartReport?.total_outstanding ?? 0,
                                        icon: "💳",
                                        textColor: "#fb7185",
                                        href: "/admin/ghost/reports/debtors"
                                    }
                                ].map((row) => (
                                    <tr key={row.label} style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", transition: "all 0.2s" }} className="hover:bg-white/5">
                                        <td style={{ padding: "20px" }}>
                                            <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
                                                <span style={{ fontSize: "20px" }}>{row.icon}</span>
                                                <span style={{ fontSize: "14px", fontWeight: 600, color: "#cbd5e1" }}>{row.label}</span>
                                            </div>
                                        </td>
                                        <td style={{ padding: "20px", textAlign: "right" }}>
                                            <div style={{ fontSize: "20px", fontWeight: 800, color: row.textColor }}>
                                                {smartLoading ? "..." : <CountUp target={row.value} prefix="Rs. " />}
                                            </div>
                                        </td>
                                        <td style={{ padding: "20px", textAlign: "center" }}>
                                            <Link 
                                                href={row.href} 
                                                style={{ 
                                                    padding: "6px 16px", 
                                                    borderRadius: "20px", 
                                                    fontSize: "12px", 
                                                    fontWeight: 700, 
                                                    background: "rgba(255,255,255,0.05)", 
                                                    color: row.textColor, 
                                                    border: `1px solid ${row.textColor}33`,
                                                    textDecoration: "none",
                                                    display: "inline-block",
                                                    transition: "all 0.2s"
                                                }}
                                                onMouseEnter={(e) => { e.currentTarget.style.background = row.textColor + "22"; }}
                                                onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
                                            >
                                                View Detailed Report →
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Recent Transactions */}
                    <div style={{ 
                        background: "rgba(255,255,255,0.02)", 
                        border: "1px solid rgba(255,255,255,0.05)", 
                        borderRadius: "16px", 
                        padding: "20px",
                        backdropFilter: "blur(8px)"
                    }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                            <h3 style={{ fontSize: "14px", fontWeight: 600, color: "#94a3b8", margin: 0, textTransform: "uppercase", letterSpacing: "0.5px" }}>Recent Transactions</h3>
                        </div>
                        
                        {smartLoading ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#475569" }}>Loading transactions...</div>
                        ) : !smartReport?.recent_transactions?.length ? (
                            <div style={{ padding: "20px", textAlign: "center", color: "#475569", fontSize: "13px" }}>No recent transactions found</div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                {smartReport.recent_transactions.map((tx, i) => (
                                    <div key={i} style={{ 
                                        display: "flex", 
                                        alignItems: "center", 
                                        justifyContent: "space-between", 
                                        padding: "12px 16px", 
                                        background: "rgba(255,255,255,0.03)", 
                                        borderRadius: "10px",
                                        border: "1px solid rgba(255,255,255,0.03)"
                                    }}>
                                        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                                            <div style={{ 
                                                width: "8px", 
                                                height: "8px", 
                                                borderRadius: "50%", 
                                                background: tx.type === "SALES" ? "#a78bfa" : "#34d399" 
                                            }} />
                                            <div>
                                                <div style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0" }}>{tx.tenant_name}</div>
                                                <div style={{ fontSize: "12px", color: "#64748b" }}>{formatDate(tx.date)} • {tx.reference || tx.type}</div>
                                            </div>
                                        </div>
                                        <div style={{ fontSize: "15px", fontWeight: 700, color: tx.type === "SALES" ? "#a78bfa" : "#34d399" }}>
                                            {tx.type === "SALES" ? "+" : "-"} Rs. {tx.amount.toLocaleString()}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Stats Cards */}
                <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-4 gap-4 mb-7"
                >
                    {[
                        {
                            label: "Total Tenants",
                            value: stats.total,
                            icon: "🏢",
                            color: "rgba(124,58,237,0.2)",
                            border: "rgba(124,58,237,0.4)",
                            glow: "rgba(124,58,237,0.15)",
                        },
                        {
                            label: "Active Tenants",
                            value: stats.active,
                            icon: "✅",
                            color: "rgba(16,185,129,0.2)",
                            border: "rgba(16,185,129,0.4)",
                            glow: "rgba(16,185,129,0.15)",
                        },
                        {
                            label: "Total Companies",
                            value: stats.totalCompanies,
                            icon: "🏗️",
                            color: "rgba(6,182,212,0.2)",
                            border: "rgba(6,182,212,0.4)",
                            glow: "rgba(6,182,212,0.15)",
                        },
                        {
                            label: "Expiring Soon",
                            value: stats.expiringSoon,
                            icon: "⏰",
                            color:
                                stats.expiringSoon > 0
                                    ? "rgba(245,158,11,0.2)"
                                    : "rgba(100,116,139,0.2)",
                            border:
                                stats.expiringSoon > 0
                                    ? "rgba(245,158,11,0.4)"
                                    : "rgba(100,116,139,0.3)",
                            glow:
                                stats.expiringSoon > 0
                                    ? "rgba(245,158,11,0.15)"
                                    : "transparent",
                        },
                    ].map((s) => (
                        <div
                            key={s.label}
                            style={{
                                background: s.color,
                                border: `1px solid ${s.border}`,
                                borderRadius: "16px",
                                padding: "20px 24px",
                                boxShadow: `0 4px 24px ${s.glow}`,
                                transition: "transform 0.2s, box-shadow 0.2s",
                                cursor: "default",
                            }}
                            onMouseEnter={(e) => {
                                (e.currentTarget as HTMLDivElement).style.transform = "translateY(-2px)";
                                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 8px 32px ${s.glow}`;
                            }}
                            onMouseLeave={(e) => {
                                (e.currentTarget as HTMLDivElement).style.transform = "translateY(0)";
                                (e.currentTarget as HTMLDivElement).style.boxShadow = `0 4px 24px ${s.glow}`;
                            }}
                        >
                            <div style={{ fontSize: "28px", marginBottom: "8px" }}>{s.icon}</div>
                            <div
                                style={{ fontSize: "32px", fontWeight: 800, lineHeight: 1, color: "#f1f5f9", marginBottom: "4px" }}
                            >
                                {isLoading ? (
                                    <div
                                        style={{
                                            width: "60px",
                                            height: "32px",
                                            background: "rgba(255,255,255,0.1)",
                                            borderRadius: "6px",
                                            animation: "pulse 1.5s ease-in-out infinite",
                                        }}
                                    />
                                ) : (
                                    <CountUp target={s.value} />
                                )}
                            </div>
                            <div style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 500 }}>
                                {s.label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Plan Distribution */}
                {Object.keys(stats.planBreakdown).length > 0 && (
                    <div
                        style={{
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "16px",
                            padding: "20px 24px",
                            marginBottom: "24px",
                            display: "flex",
                            flexWrap: "wrap",
                            alignItems: "center",
                            gap: "16px",
                        }}
                    >
                        <span style={{ color: "#64748b", fontSize: "13px", fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                            Plan Distribution
                        </span>
                        {Object.entries(stats.planBreakdown).map(([plan, count]) => {
                            const pct = stats.total ? Math.round((count / stats.total) * 100) : 0;
                            const gradients: Record<string, string> = {
                                enterprise: "linear-gradient(135deg, #7c3aed, #a855f7)",
                                premium: "linear-gradient(135deg, #d97706, #f59e0b)",
                                standard: "linear-gradient(135deg, #0891b2, #06b6d4)",
                            };
                            const g = gradients[plan] || "linear-gradient(135deg, #475569, #64748b)";
                            return (
                                <div key={plan} style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                    <div
                                        style={{
                                            width: "32px",
                                            height: "32px",
                                            borderRadius: "8px",
                                            background: g,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: "12px",
                                            fontWeight: 800,
                                            color: "#fff",
                                        }}
                                    >
                                        {count}
                                    </div>
                                    <div>
                                        <div style={{ fontSize: "12px", fontWeight: 600, color: "#e2e8f0", textTransform: "capitalize" }}>
                                            {plan}
                                        </div>
                                        <div style={{ fontSize: "11px", color: "#64748b" }}>{pct}%</div>
                                    </div>
                                </div>
                            );
                        })}
                        <div style={{ flexGrow: 1 }} />
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            {Object.entries(stats.planBreakdown).map(([plan, count]) => {
                                const colors: Record<string, string> = {
                                    enterprise: "#7c3aed",
                                    premium: "#d97706",
                                    standard: "#0891b2",
                                };
                                const pct = stats.total ? (count / stats.total) * 100 : 0;
                                const color = colors[plan] || "#475569";
                                return (
                                    <div
                                        key={plan}
                                        title={`${plan}: ${count}`}
                                        style={{
                                            width: `${Math.max(pct * 1.5, 20)}px`,
                                            height: "12px",
                                            borderRadius: "6px",
                                            background: color,
                                            opacity: 0.8,
                                        }}
                                    />
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Toolbar */}
                <div
                    style={{
                        background: "rgba(255,255,255,0.03)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "16px",
                        padding: "16px 20px",
                        marginBottom: "16px",
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: "12px",
                    }}
                >
                    {/* Search */}
                    <div style={{ position: "relative", minWidth: "240px", flexGrow: 1 }}>
                        <span
                            style={{
                                position: "absolute",
                                left: "12px",
                                top: "50%",
                                transform: "translateY(-50%)",
                                color: "#475569",
                                fontSize: "16px",
                                pointerEvents: "none",
                            }}
                        >
                            🔍
                        </span>
                        <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search tenants by name, ID, plan…"
                            style={{
                                width: "100%",
                                padding: "9px 12px 9px 38px",
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "10px",
                                color: "#e2e8f0",
                                fontSize: "14px",
                                outline: "none",
                                boxSizing: "border-box",
                            }}
                        />
                    </div>

                    {/* Plan filter */}
                    <select
                        value={planFilter}
                        onChange={(e) => setPlanFilter(e.target.value)}
                        style={{
                            padding: "9px 14px",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "10px",
                            color: planFilter ? "#e2e8f0" : "#64748b",
                            fontSize: "13px",
                            outline: "none",
                            cursor: "pointer",
                        }}
                    >
                        <option value="">All Plans</option>
                        {availablePlans.map((p) => (
                            <option key={p} value={p}>
                                {p.charAt(0).toUpperCase() + p.slice(1)}
                            </option>
                        ))}
                    </select>

                    {/* Status filter */}
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        style={{
                            padding: "9px 14px",
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.1)",
                            borderRadius: "10px",
                            color: statusFilter ? "#e2e8f0" : "#64748b",
                            fontSize: "13px",
                            outline: "none",
                            cursor: "pointer",
                        }}
                    >
                        <option value="">All Statuses</option>
                        {availableStatuses.map((s) => (
                            <option key={s} value={s}>
                                {s.charAt(0).toUpperCase() + s.slice(1)}
                            </option>
                        ))}
                    </select>

                    {/* Clear filters */}
                    {(search || planFilter || statusFilter) && (
                        <button
                            onClick={() => {
                                setSearch("");
                                setPlanFilter("");
                                setStatusFilter("");
                            }}
                            style={{
                                padding: "9px 14px",
                                background: "rgba(239,68,68,0.15)",
                                border: "1px solid rgba(239,68,68,0.3)",
                                borderRadius: "10px",
                                color: "#fca5a5",
                                fontSize: "13px",
                                cursor: "pointer",
                            }}
                        >
                            ✕ Clear
                        </button>
                    )}

                    <div style={{ flexGrow: 1 }} />

                    {/* Result count */}
                    <span style={{ color: "#64748b", fontSize: "13px" }}>
                        {filteredTenants.length} tenant{filteredTenants.length !== 1 ? "s" : ""}
                    </span>

                    {/* View toggle */}
                    <div
                        style={{
                            display: "flex",
                            background: "rgba(255,255,255,0.06)",
                            borderRadius: "10px",
                            overflow: "hidden",
                            border: "1px solid rgba(255,255,255,0.1)",
                        }}
                    >
                        {(["table", "cards"] as const).map((mode) => (
                            <button
                                key={mode}
                                onClick={() => setViewMode(mode)}
                                style={{
                                    padding: "8px 14px",
                                    background:
                                        viewMode === mode
                                            ? "rgba(124,58,237,0.4)"
                                            : "transparent",
                                    border: "none",
                                    color: viewMode === mode ? "#c4b5fd" : "#64748b",
                                    fontSize: "13px",
                                    cursor: "pointer",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "5px",
                                    transition: "all 0.2s",
                                }}
                            >
                                {mode === "table" ? "☰ Table" : "⊞ Cards"}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Loading / Error */}
                {isLoading && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                            padding: "80px",
                            color: "#475569",
                        }}
                    >
                        <div
                            style={{
                                width: "40px",
                                height: "40px",
                                border: "3px solid rgba(124,58,237,0.3)",
                                borderTop: "3px solid #7c3aed",
                                borderRadius: "50%",
                                animation: "spin 0.8s linear infinite",
                            }}
                        />
                        <style>{`
              @keyframes spin { to { transform: rotate(360deg); } }
              @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
              @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
                    </div>
                )}

                {error && (
                    <div
                        style={{
                            background: "rgba(239,68,68,0.1)",
                            border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: "12px",
                            padding: "20px",
                            color: "#fca5a5",
                            textAlign: "center",
                            fontSize: "14px",
                        }}
                    >
                        ⚠️ Failed to load tenants.{" "}
                        <button
                            onClick={() => mutate()}
                            style={{
                                color: "#f87171",
                                textDecoration: "underline",
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: "14px",
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {!isLoading && !error && (
                    <>
                        {/* TABLE VIEW */}
                        {viewMode === "table" && (
                            <div
                                style={{
                                    background: "rgba(255,255,255,0.02)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "16px",
                                    overflowX: "auto",
                                    animation: "fadeIn 0.3s ease",
                                }}
                            >
                                <style>{`
                  @keyframes spin { to { transform: rotate(360deg); } }
                  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                  .ghost-tr:hover { background: rgba(124,58,237,0.06) !important; }
                  .ghost-tr:hover td { color: #e2e8f0 !important; }
                  .ghost-action-btn:hover { background: rgba(124,58,237,0.2) !important; color: #c4b5fd !important; }
                `}</style>

                                {filteredTenants.length === 0 ? (
                                    <div
                                        style={{
                                            textAlign: "center",
                                            padding: "60px",
                                            color: "#475569",
                                        }}
                                    >
                                        <div style={{ fontSize: "40px", marginBottom: "12px" }}>👻</div>
                                        <div style={{ fontSize: "15px" }}>No tenants match your filters</div>
                                    </div>
                                ) : (
                                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead>
                                            <tr
                                                style={{
                                                    background: "rgba(255,255,255,0.04)",
                                                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                                                }}
                                            >
                                                <th style={{ padding: "12px 16px", textAlign: "left" }}>
                                                    <input
                                                        type="checkbox"
                                                        checked={
                                                            selectedTenants.size === filteredTenants.length &&
                                                            filteredTenants.length > 0
                                                        }
                                                        onChange={toggleAll}
                                                        style={{ cursor: "pointer", accentColor: "#7c3aed" }}
                                                    />
                                                </th>
                                                {[
                                                    { key: "name" as const, label: "Tenant" },
                                                    { key: "plan" as const, label: "Plan" },
                                                    { key: null, label: "Status" },
                                                    { key: "companies" as const, label: "Companies" },
                                                    { key: "users" as const, label: "Users" },
                                                    { key: "expires" as const, label: "Expires At" },
                                                    { key: null, label: "Actions" },
                                                ].map((col) => (
                                                    <th
                                                        key={col.label}
                                                        onClick={() => col.key && toggleSort(col.key)}
                                                        style={{
                                                            padding: "12px 16px",
                                                            textAlign: "left",
                                                            color: "#64748b",
                                                            fontSize: "12px",
                                                            fontWeight: 600,
                                                            textTransform: "uppercase",
                                                            letterSpacing: "0.5px",
                                                            cursor: col.key ? "pointer" : "default",
                                                            userSelect: "none",
                                                            whiteSpace: "nowrap",
                                                        }}
                                                    >
                                                        {col.label}
                                                        {col.key && <SortIcon col={col.key} />}
                                                    </th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {filteredTenants.map((t, idx) => {
                                                const companiesCount =
                                                    typeof t.companies_count === "number"
                                                        ? t.companies_count
                                                        : typeof t.company_count === "number"
                                                            ? t.company_count
                                                            : 0;
                                                const statusKey = (t.status || "unknown").toLowerCase();
                                                const planKey = (t.plan || "standard").toLowerCase();
                                                const expiryInfo = getExpiryStatus(t.expires_at);
                                                const isSelected = selectedTenants.has(t.id);

                                                return (
                                                    <tr
                                                        key={t.id}
                                                        className="ghost-tr"
                                                        style={{
                                                            borderBottom:
                                                                idx < filteredTenants.length - 1
                                                                    ? "1px solid rgba(255,255,255,0.05)"
                                                                    : "none",
                                                            background: isSelected
                                                                ? "rgba(124,58,237,0.08)"
                                                                : "transparent",
                                                            transition: "background 0.15s",
                                                            animation: `fadeIn 0.3s ease ${idx * 0.03}s both`,
                                                        }}
                                                    >
                                                        <td style={{ padding: "14px 16px" }}>
                                                            <input
                                                                type="checkbox"
                                                                checked={isSelected}
                                                                onChange={() => toggleSelect(t.id)}
                                                                style={{ cursor: "pointer", accentColor: "#7c3aed" }}
                                                            />
                                                        </td>
                                                        <td style={{ padding: "14px 16px" }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                                <div
                                                                    style={{
                                                                        width: "36px",
                                                                        height: "36px",
                                                                        borderRadius: "10px",
                                                                        background: `linear-gradient(135deg, ${planKey === "enterprise"
                                                                            ? "#7c3aed, #a855f7"
                                                                            : planKey === "premium"
                                                                                ? "#d97706, #f59e0b"
                                                                                : "#0891b2, #06b6d4"
                                                                            })`,
                                                                        display: "flex",
                                                                        alignItems: "center",
                                                                        justifyContent: "center",
                                                                        fontSize: "15px",
                                                                        fontWeight: 800,
                                                                        color: "#fff",
                                                                        flexShrink: 0,
                                                                    }}
                                                                >
                                                                    {(t.name || "?").charAt(0).toUpperCase()}
                                                                </div>
                                                                <div>
                                                                    <div style={{ fontWeight: 600, fontSize: "14px", color: "#e2e8f0" }}>
                                                                        {t.name}
                                                                    </div>
                                                                    <div style={{ fontSize: "11px", color: "#475569", fontFamily: "monospace" }}>
                                                                        #{t.id}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: "14px 16px" }}>
                                                            <span
                                                                style={{
                                                                    display: "inline-block",
                                                                    padding: "3px 10px",
                                                                    borderRadius: "20px",
                                                                    fontSize: "12px",
                                                                    fontWeight: 600,
                                                                    textTransform: "capitalize",
                                                                    ...(planBadge[planKey]
                                                                        ? {}
                                                                        : { background: "rgba(100,116,139,0.2)", color: "#94a3b8", border: "1px solid rgba(100,116,139,0.3)" }),
                                                                }}
                                                                className={planBadge[planKey] || ""}
                                                            >
                                                                {(() => {
                                                                    const b = planBadge[planKey];
                                                                    if (b) {
                                                                        const parts = b.split(" ");
                                                                        const bgClass = parts.find((p) => p.startsWith("bg-")) || "";
                                                                        const textClass = parts.find((p) => p.startsWith("text-")) || "";
                                                                        const bgMap: Record<string, string> = {
                                                                            "bg-violet-500/20": "rgba(139,92,246,0.2)",
                                                                            "bg-amber-500/20": "rgba(245,158,11,0.2)",
                                                                            "bg-cyan-500/20": "rgba(6,182,212,0.2)",
                                                                        };
                                                                        const textColorMap: Record<string, string> = {
                                                                            "text-violet-300": "#c4b5fd",
                                                                            "text-amber-300": "#fcd34d",
                                                                            "text-cyan-300": "#67e8f9",
                                                                        };
                                                                        return (
                                                                            <span
                                                                                style={{
                                                                                    background: bgMap[bgClass] || "rgba(100,116,139,0.2)",
                                                                                    color: textColorMap[textClass] || "#94a3b8",
                                                                                    padding: "3px 10px",
                                                                                    borderRadius: "20px",
                                                                                    fontSize: "12px",
                                                                                    fontWeight: 600,
                                                                                }}
                                                                            >
                                                                                {t.plan || "standard"}
                                                                            </span>
                                                                        );
                                                                    }
                                                                    return (
                                                                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                                                                            {t.plan || "standard"}
                                                                        </span>
                                                                    );
                                                                })()}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: "14px 16px" }}>
                                                            {(() => {
                                                                const statusColors: Record<string, { bg: string; text: string }> = {
                                                                    active: { bg: "rgba(16,185,129,0.15)", text: "#6ee7b7" },
                                                                    inactive: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
                                                                    suspended: { bg: "rgba(239,68,68,0.15)", text: "#fca5a5" },
                                                                    trial: { bg: "rgba(59,130,246,0.15)", text: "#93c5fd" },
                                                                    unknown: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
                                                                };
                                                                const sc = statusColors[statusKey] || statusColors.unknown;
                                                                return (
                                                                    <span
                                                                        style={{
                                                                            background: sc.bg,
                                                                            color: sc.text,
                                                                            padding: "3px 10px",
                                                                            borderRadius: "20px",
                                                                            fontSize: "12px",
                                                                            fontWeight: 600,
                                                                            textTransform: "capitalize",
                                                                            border: `1px solid ${sc.text}33`,
                                                                        }}
                                                                    >
                                                                        {statusKey === "active" && "● "}
                                                                        {t.status || "unknown"}
                                                                    </span>
                                                                );
                                                            })()}
                                                        </td>
                                                        <td style={{ padding: "14px 16px", color: "#94a3b8", fontSize: "14px", textAlign: "center" }}>
                                                            <span
                                                                style={{
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    width: "32px",
                                                                    height: "32px",
                                                                    borderRadius: "8px",
                                                                    background: "rgba(255,255,255,0.06)",
                                                                    fontWeight: 700,
                                                                    color: "#e2e8f0",
                                                                    fontSize: "13px",
                                                                }}
                                                            >
                                                                {companiesCount ?? "—"}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: "14px 16px", color: "#94a3b8", fontSize: "14px", textAlign: "center" }}>
                                                            <span
                                                                style={{
                                                                    display: "inline-flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    width: "32px",
                                                                    height: "32px",
                                                                    borderRadius: "8px",
                                                                    background: "rgba(255,255,255,0.06)",
                                                                    fontWeight: 700,
                                                                    color: "#e2e8f0",
                                                                    fontSize: "13px",
                                                                }}
                                                            >
                                                                 {t.users_count ?? t.user_count ?? 0}
                                                            </span>
                                                        </td>
                                                        <td style={{ padding: "14px 16px" }}>
                                                            <div>
                                                                <div style={{ fontSize: "13px", color: "#94a3b8" }}>
                                                                    {formatDate(t.expires_at)}
                                                                </div>
                                                                {expiryInfo && (
                                                                    <div style={{ fontSize: "11px", color: expiryInfo.cls.includes("red") ? "#f87171" : expiryInfo.cls.includes("amber") ? "#fbbf24" : "#34d399", fontWeight: 600 }}>
                                                                        {expiryInfo.label}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td style={{ padding: "14px 16px" }}>
                                                            <div style={{ display: "flex", gap: "6px" }}>
                                                                <Link
                                                                    href={`/admin/tenants/${t.id}`}
                                                                    style={{
                                                                        padding: "6px 12px",
                                                                        background: "rgba(255,255,255,0.06)",
                                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                                        borderRadius: "8px",
                                                                        color: "#94a3b8",
                                                                        fontSize: "12px",
                                                                        textDecoration: "none",
                                                                        transition: "all 0.15s",
                                                                        display: "inline-block",
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(124,58,237,0.2)";
                                                                        (e.currentTarget as HTMLAnchorElement).style.color = "#c4b5fd";
                                                                        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(124,58,237,0.4)";
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)";
                                                                        (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8";
                                                                        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.1)";
                                                                    }}
                                                                >
                                                                    ✏️ Edit
                                                                </Link>
                                                                <button
                                                                    onClick={() => handleRename(t.id, t.name)}
                                                                    disabled={renamingId === t.id}
                                                                    style={{
                                                                        padding: "6px 12px",
                                                                        background: "rgba(255,255,255,0.06)",
                                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                                        borderRadius: "8px",
                                                                        color: "#94a3b8",
                                                                        fontSize: "12px",
                                                                        cursor: renamingId === t.id ? "not-allowed" : "pointer",
                                                                        transition: "all 0.15s",
                                                                        display: "inline-block",
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        if (renamingId === t.id) return;
                                                                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(6,182,212,0.15)";
                                                                        (e.currentTarget as HTMLButtonElement).style.color = "#67e8f9";
                                                                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(6,182,212,0.3)";
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                                                                        (e.currentTarget as HTMLButtonElement).style.color = "#94a3b8";
                                                                        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.1)";
                                                                    }}
                                                                >
                                                                    {renamingId === t.id ? "..." : "🏷️ Rename"}
                                                                </button>
                                                                <Link
                                                                    href={`/admin/tenants/${t.id}/backup-restore`}
                                                                    style={{
                                                                        padding: "6px 12px",
                                                                        background: "rgba(255,255,255,0.06)",
                                                                        border: "1px solid rgba(255,255,255,0.1)",
                                                                        borderRadius: "8px",
                                                                        color: "#94a3b8",
                                                                        fontSize: "12px",
                                                                        textDecoration: "none",
                                                                        transition: "all 0.15s",
                                                                        display: "inline-block",
                                                                    }}
                                                                    onMouseEnter={(e) => {
                                                                        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(16,185,129,0.15)";
                                                                        (e.currentTarget as HTMLAnchorElement).style.color = "#6ee7b7";
                                                                        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(16,185,129,0.3)";
                                                                    }}
                                                                    onMouseLeave={(e) => {
                                                                        (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)";
                                                                        (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8";
                                                                        (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.1)";
                                                                    }}
                                                                >
                                                                    💾 Backup
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
                        )}

                        {/* CARDS VIEW */}
                        {viewMode === "cards" && (
                            <div
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
                                    gap: "16px",
                                    animation: "fadeIn 0.3s ease",
                                }}
                            >
                                <style>{`
                  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
                  .tenant-card:hover { transform: translateY(-3px) !important; box-shadow: 0 12px 40px rgba(124,58,237,0.15) !important; border-color: rgba(124,58,237,0.3) !important; }
                `}</style>

                                {filteredTenants.length === 0 ? (
                                    <div
                                        style={{
                                            gridColumn: "1/-1",
                                            textAlign: "center",
                                            padding: "60px",
                                            color: "#475569",
                                        }}
                                    >
                                        <div style={{ fontSize: "40px", marginBottom: "12px" }}>👻</div>
                                        <div>No tenants match your filters</div>
                                    </div>
                                ) : (
                                    filteredTenants.map((t, idx) => {
                                        const companiesCount =
                                            typeof t.companies_count === "number"
                                                ? t.companies_count
                                                : typeof t.company_count === "number"
                                                    ? t.company_count
                                                    : 0;
                                        const planKey = (t.plan || "standard").toLowerCase();
                                        const statusKey = (t.status || "unknown").toLowerCase();
                                        const expiryInfo = getExpiryStatus(t.expires_at);
                                        const gradients: Record<string, string> = {
                                            enterprise: "linear-gradient(135deg, #7c3aed, #a855f7)",
                                            premium: "linear-gradient(135deg, #d97706, #f59e0b)",
                                            standard: "linear-gradient(135deg, #0891b2, #06b6d4)",
                                        };

                                        return (
                                            <div
                                                key={t.id}
                                                className="tenant-card"
                                                style={{
                                                    background: "rgba(255,255,255,0.03)",
                                                    border: "1px solid rgba(255,255,255,0.08)",
                                                    borderRadius: "16px",
                                                    overflow: "hidden",
                                                    transition: "all 0.2s",
                                                    cursor: "default",
                                                    animation: `fadeIn 0.3s ease ${idx * 0.04}s both`,
                                                }}
                                            >
                                                {/* Card header gradient */}
                                                <div
                                                    style={{
                                                        height: "6px",
                                                        background: gradients[planKey] || "linear-gradient(135deg, #475569, #64748b)",
                                                    }}
                                                />
                                                <div style={{ padding: "20px" }}>
                                                    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "16px" }}>
                                                        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                                                            <div
                                                                style={{
                                                                    width: "44px",
                                                                    height: "44px",
                                                                    borderRadius: "12px",
                                                                    background: gradients[planKey] || "linear-gradient(135deg, #475569, #64748b)",
                                                                    display: "flex",
                                                                    alignItems: "center",
                                                                    justifyContent: "center",
                                                                    fontSize: "20px",
                                                                    fontWeight: 800,
                                                                    color: "#fff",
                                                                    boxShadow: `0 4px 12px ${planKey === "enterprise" ? "rgba(124,58,237,0.4)" : planKey === "premium" ? "rgba(217,119,6,0.3)" : "rgba(8,145,178,0.3)"}`,
                                                                }}
                                                            >
                                                                {(t.name || "?").charAt(0).toUpperCase()}
                                                            </div>
                                                            <div>
                                                                <div style={{ fontWeight: 700, fontSize: "15px", color: "#f1f5f9" }}>
                                                                    {t.name}
                                                                </div>
                                                                <div style={{ fontSize: "12px", color: "#475569", fontFamily: "monospace" }}>
                                                                    ID #{t.id}
                                                                </div>
                                                            </div>
                                                        </div>
                                                        {(() => {
                                                            const statusColors: Record<string, { bg: string; text: string }> = {
                                                                active: { bg: "rgba(16,185,129,0.15)", text: "#6ee7b7" },
                                                                inactive: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
                                                                suspended: { bg: "rgba(239,68,68,0.15)", text: "#fca5a5" },
                                                                trial: { bg: "rgba(59,130,246,0.15)", text: "#93c5fd" },
                                                                unknown: { bg: "rgba(100,116,139,0.15)", text: "#94a3b8" },
                                                            };
                                                            const sc = statusColors[statusKey] || statusColors.unknown;
                                                            return (
                                                                <span
                                                                    style={{
                                                                        background: sc.bg,
                                                                        color: sc.text,
                                                                        padding: "4px 10px",
                                                                        borderRadius: "20px",
                                                                        fontSize: "11px",
                                                                        fontWeight: 600,
                                                                        textTransform: "capitalize",
                                                                        border: `1px solid ${sc.text}33`,
                                                                    }}
                                                                >
                                                                    {statusKey === "active" && "● "}
                                                                    {t.status || "unknown"}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>

                                                    {/* Stats row */}
                                                    <div
                                                        style={{
                                                            display: "grid",
                                                            gridTemplateColumns: "1fr 1fr",
                                                            gap: "10px",
                                                            marginBottom: "16px",
                                                        }}
                                                    >
                                                        <div
                                                            style={{
                                                                background: "rgba(255,255,255,0.04)",
                                                                borderRadius: "10px",
                                                                padding: "10px 12px",
                                                            }}
                                                        >
                                                            <div style={{ color: "#475569", fontSize: "11px", marginBottom: "2px" }}>
                                                                Plan
                                                            </div>
                                                            <div
                                                                style={{
                                                                    fontSize: "13px",
                                                                    fontWeight: 700,
                                                                    color:
                                                                        planKey === "enterprise" ? "#c4b5fd" : planKey === "premium" ? "#fcd34d" : "#67e8f9",
                                                                    textTransform: "capitalize",
                                                                }}
                                                            >
                                                                {t.plan || "standard"}
                                                            </div>
                                                        </div>
                                                        <div
                                                            style={{
                                                                background: "rgba(255,255,255,0.04)",
                                                                borderRadius: "10px",
                                                                padding: "10px 12px",
                                                            }}
                                                        >
                                                            <div style={{ color: "#475569", fontSize: "11px", marginBottom: "2px" }}>
                                                                Companies
                                                            </div>
                                                            <div style={{ fontSize: "13px", fontWeight: 700, color: "#e2e8f0" }}>
                                                                {companiesCount ?? "—"}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Expiry */}
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems: "center",
                                                            justifyContent: "space-between",
                                                            marginBottom: "16px",
                                                            padding: "8px 12px",
                                                            background: "rgba(255,255,255,0.03)",
                                                            borderRadius: "8px",
                                                            border: "1px solid rgba(255,255,255,0.06)",
                                                        }}
                                                    >
                                                        <span style={{ color: "#64748b", fontSize: "12px" }}>⏱ Expires</span>
                                                        <div style={{ textAlign: "right" }}>
                                                            <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                                                                {formatDate(t.expires_at)}
                                                            </div>
                                                            {expiryInfo && (
                                                                <div
                                                                    style={{
                                                                        fontSize: "11px",
                                                                        fontWeight: 600,
                                                                        color: expiryInfo.cls.includes("red") ? "#f87171" : expiryInfo.cls.includes("amber") ? "#fbbf24" : "#34d399",
                                                                    }}
                                                                >
                                                                    {expiryInfo.label}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    {/* Actions */}
                                                    <div style={{ display: "flex", gap: "8px" }}>
                                                        <Link
                                                            href={`/admin/tenants/${t.id}`}
                                                            style={{
                                                                flex: 1,
                                                                padding: "9px",
                                                                background: "rgba(124,58,237,0.15)",
                                                                border: "1px solid rgba(124,58,237,0.3)",
                                                                borderRadius: "10px",
                                                                color: "#c4b5fd",
                                                                fontSize: "13px",
                                                                fontWeight: 600,
                                                                textDecoration: "none",
                                                                textAlign: "center",
                                                                display: "block",
                                                                transition: "all 0.15s",
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(124,58,237,0.3)";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(124,58,237,0.15)";
                                                            }}
                                                        >
                                                            ✏️ Manage
                                                        </Link>
                                                        <button
                                                            onClick={() => handleRename(t.id, t.name)}
                                                            disabled={renamingId === t.id}
                                                            style={{
                                                                padding: "9px 12px",
                                                                background: "rgba(6,182,212,0.15)",
                                                                border: "1px solid rgba(6,182,212,0.3)",
                                                                borderRadius: "10px",
                                                                color: "#67e8f9",
                                                                fontSize: "13px",
                                                                cursor: renamingId === t.id ? "not-allowed" : "pointer",
                                                                transition: "all 0.15s",
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                if (renamingId === t.id) return;
                                                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(6,182,212,0.25)";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                (e.currentTarget as HTMLButtonElement).style.background = "rgba(6,182,212,0.15)";
                                                            }}
                                                        >
                                                            {renamingId === t.id ? "..." : "🏷️"}
                                                        </button>
                                                        <Link
                                                            href={`/admin/tenants/${t.id}/backup-restore`}
                                                            style={{
                                                                padding: "9px 12px",
                                                                background: "rgba(255,255,255,0.06)",
                                                                border: "1px solid rgba(255,255,255,0.1)",
                                                                borderRadius: "10px",
                                                                color: "#64748b",
                                                                fontSize: "13px",
                                                                textDecoration: "none",
                                                                display: "flex",
                                                                alignItems: "center",
                                                                transition: "all 0.15s",
                                                            }}
                                                            onMouseEnter={(e) => {
                                                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(16,185,129,0.15)";
                                                                (e.currentTarget as HTMLAnchorElement).style.color = "#6ee7b7";
                                                            }}
                                                            onMouseLeave={(e) => {
                                                                (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.06)";
                                                                (e.currentTarget as HTMLAnchorElement).style.color = "#64748b";
                                                            }}
                                                        >
                                                            💾
                                                        </Link>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        )}
                    </>
                )}

                {/* Industry & Features Control — HIGHLIGHTED */}
                <div style={{ marginTop: "40px", marginBottom: "32px" }}>
                    <div style={{ color: "#64748b", fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.5px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                        <div style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.06)" }}></div>
                        Industry & Features Control
                        <div style={{ height: "1px", flex: 1, background: "rgba(255,255,255,0.06)" }}></div>
                    </div>
                    
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                        <Link href="/admin/settings/business-types" style={{ textDecoration: "none", transition: "transform 0.2s" }}>
                            <div style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.15) 0%, rgba(79,70,229,0.05) 100%)", border: "1px solid rgba(124,58,237,0.3)", borderRadius: "20px", padding: "24px", display: "flex", alignItems: "flex-start", gap: "16px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: "-20px", right: "-20px", fontSize: "80px", opacity: 0.1, pointerEvents: "none" }}>🏢</div>
                                <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(124,58,237,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>🏢</div>
                                <div>
                                    <div style={{ color: "#c4b5fd", fontWeight: 700, fontSize: "18px", marginBottom: "4px" }}>Business Types</div>
                                    <div style={{ color: "#94a3b8", fontSize: "13px", lineHeight: "1.5" }}>Configure industry sectors, enable features like Batch Tracking, and set default menu templates.</div>
                                    <div style={{ marginTop: "12px", color: "#a78bfa", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>Manage Sectors →</div>
                                </div>
                            </div>
                        </Link>

                        <Link href="/admin/settings/item-fields" style={{ textDecoration: "none", transition: "transform 0.2s" }}>
                            <div style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(217,119,6,0.05) 100%)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "20px", padding: "24px", display: "flex", alignItems: "flex-start", gap: "16px", position: "relative", overflow: "hidden" }}>
                                <div style={{ position: "absolute", top: "-20px", right: "-20px", fontSize: "80px", opacity: 0.1, pointerEvents: "none" }}>📦</div>
                                <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "rgba(245,158,11,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "24px" }}>📦</div>
                                <div>
                                    <div style={{ color: "#fcd34d", fontWeight: 700, fontSize: "18px", marginBottom: "4px" }}>Item Field Config</div>
                                    <div style={{ color: "#94a3b8", fontSize: "13px", lineHeight: "1.5" }}>Define mandatory and dynamic fields per industry for the Item Master form.</div>
                                    <div style={{ marginTop: "12px", color: "#fbbf24", fontSize: "12px", fontWeight: 600, display: "flex", alignItems: "center", gap: "4px" }}>Configure Fields →</div>
                                </div>
                            </div>
                        </Link>
                    </div>
                </div>

                {/* Quick Links */}
                <div
                    style={{
                        marginTop: "8px",
                        background: "rgba(255,255,255,0.02)",
                        border: "1px solid rgba(255,255,255,0.06)",
                        borderRadius: "16px",
                        padding: "20px 24px",
                    }}
                >
                    <div
                        style={{
                            color: "#64748b",
                            fontSize: "12px",
                            fontWeight: 600,
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                            marginBottom: "16px",
                        }}
                    >
                        Quick Access
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                        {[
                            { href: "/admin", label: "⚡ Admin Home" },
                            { href: "/admin/tenants", label: "👥 Tenants" },
                            { href: "/admin/settings/business-types", label: "🏢 Business Types" },
                            { href: "/admin/settings/item-fields", label: "📦 Item Field Config" },
                            { href: "/admin/users", label: "👥 Users" },
                            { href: "/admin/billing", label: "💳 Billing" },
                            { href: "/admin/plans", label: "📋 Plans" },
                            { href: "/admin/logs", label: "📊 Logs" },
                            { href: "/admin/maintenance", label: "🔧 Maintenance" },
                            { href: "/settings/menu-permissions", label: "🔐 Permissions" },
                        ].map((link) => (
                            <Link
                                key={link.href}
                                href={link.href}
                                style={{
                                    padding: "8px 16px",
                                    background: "rgba(255,255,255,0.04)",
                                    border: "1px solid rgba(255,255,255,0.08)",
                                    borderRadius: "10px",
                                    color: "#94a3b8",
                                    fontSize: "13px",
                                    textDecoration: "none",
                                    transition: "all 0.15s",
                                }}
                                onMouseEnter={(e) => {
                                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(124,58,237,0.15)";
                                    (e.currentTarget as HTMLAnchorElement).style.color = "#c4b5fd";
                                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(124,58,237,0.3)";
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)";
                                    (e.currentTarget as HTMLAnchorElement).style.color = "#94a3b8";
                                    (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.08)";
                                }}
                            >
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Broadcast Modal */}
                {isBroadcastModalOpen && (
                    <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}>
                        <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "16px", padding: "24px", width: "100%", maxWidth: "500px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                                <h2 style={{ fontSize: "20px", fontWeight: 700, margin: 0, color: "#f8fafc" }}>Broadcast Message</h2>
                                <button onClick={() => setIsBroadcastModalOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "20px" }}>✕</button>
                            </div>
                            <p style={{ color: "#94a3b8", fontSize: "14px", marginBottom: "20px", lineHeight: "1.5" }}>
                                Send a popup message or image that users will see upon their next login. {selectedTenants.size > 0 ? `Targeting ${selectedTenants.size} selected tenant(s).` : "Targeting ALL tenants."}
                            </p>
                            <form onSubmit={handleBroadcastSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                                <div>
                                    <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>Message Type</label>
                                    <select 
                                        value={broadcastType} 
                                        onChange={(e) => setBroadcastType(e.target.value as "text" | "image")}
                                        style={{ width: "100%", padding: "10px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none" }}
                                    >
                                        <option value="text">Text Message</option>
                                        <option value="image">Image URL</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>Content</label>
                                    {broadcastType === "text" ? (
                                        <textarea
                                            required
                                            value={broadcastContent}
                                            onChange={(e) => setBroadcastContent(e.target.value)}
                                            rows={4}
                                            placeholder="Enter your message here..."
                                            style={{ width: "100%", padding: "10px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none", resize: "vertical" }}
                                        />
                                    ) : (
                                        <input
                                            required
                                            type="url"
                                            value={broadcastContent}
                                            onChange={(e) => setBroadcastContent(e.target.value)}
                                            placeholder="https://example.com/banner.png"
                                            style={{ width: "100%", padding: "10px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none" }}
                                        />
                                    )}
                                </div>
                                <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                                    <div style={{ flex: 1, minWidth: "200px" }}>
                                        <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>Valid From (Optional)</label>
                                        <input
                                            type="datetime-local"
                                            value={broadcastStartDate}
                                            onChange={(e) => setBroadcastStartDate(e.target.value)}
                                            style={{ width: "100%", padding: "10px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none", colorScheme: "dark" }}
                                        />
                                    </div>
                                    <div style={{ flex: 1, minWidth: "200px" }}>
                                        <label style={{ display: "block", fontSize: "13px", color: "#cbd5e1", marginBottom: "6px" }}>Valid Until (Optional)</label>
                                        <input
                                            type="datetime-local"
                                            value={broadcastEndDate}
                                            onChange={(e) => setBroadcastEndDate(e.target.value)}
                                            style={{ width: "100%", padding: "10px", background: "rgba(0,0,0,0.2)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", outline: "none", colorScheme: "dark" }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "16px" }}>
                                    <button 
                                        type="button" 
                                        onClick={() => setIsBroadcastModalOpen(false)}
                                        style={{ padding: "10px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.2)", borderRadius: "8px", color: "#cbd5e1", cursor: "pointer", fontSize: "14px" }}
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="submit" 
                                        disabled={broadcastSaving}
                                        style={{ padding: "10px 16px", background: "linear-gradient(135deg, #10b981, #059669)", border: "none", borderRadius: "8px", color: "#fff", cursor: broadcastSaving ? "not-allowed" : "pointer", fontSize: "14px", fontWeight: 600, opacity: broadcastSaving ? 0.7 : 1 }}
                                    >
                                        {broadcastSaving ? "Sending..." : "🚀 Send Broadcast"}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Footer */}
                <div
                    style={{
                        marginTop: "24px",
                        textAlign: "center",
                        color: "#334155",
                        fontSize: "12px",
                    }}
                >
                    👻 Ghost Dashboard — Superadmin Only · Auto-refreshes every 30s
                </div>
            </div>
        </div>
    );
}
