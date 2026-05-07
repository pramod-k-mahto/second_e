"use client";

import Link from "next/link";
import useSWR from "swr";
import { api, getToken } from "@/lib/api";
import { G, GhostBg, ANIM_CSS } from "@/lib/adminTheme";
import { usePermissions } from "@/components/PermissionsContext";

const SUPERADMIN_SECTIONS = [
  { href: "/admin/ghost", icon: "👻", label: "Ghost Dashboard", desc: "Full tenant overview & control center", color: "rgba(124,58,237,0.2)", border: "rgba(124,58,237,0.5)", text: "#c4b5fd", grad: "linear-gradient(135deg, #7c3aed, #4f46e5)" },
  { href: "/admin/ghost/reports", icon: "📈", label: "Smart Report", desc: "Platform-wide financial health hub", color: "rgba(167,139,250,0.18)", border: "rgba(167,139,250,0.4)", text: "#a78bfa", grad: "linear-gradient(135deg, #7c3aed, #5b21b6)" },
  { href: "/admin/announcements", icon: "📢", label: "System Broadcasts", desc: "Send & manage global tenant announcements", color: "rgba(16,185,129,0.18)", border: "rgba(16,185,129,0.4)", text: "#6ee7b7", grad: "linear-gradient(135deg, #10b981, #059669)" },
];

const SECTIONS = [
  { href: "/admin/tenants", icon: "🌐", label: "Tenants", desc: "Manage all tenants, plans & expiry dates", color: "rgba(6,182,212,0.15)", border: "rgba(6,182,212,0.35)", text: "#67e8f9", grad: "linear-gradient(135deg, #0891b2, #06b6d4)" },
  { href: "/admin/users", icon: "👥", label: "Users", desc: "Create, manage & delete system users", color: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.35)", text: "#6ee7b7", grad: "linear-gradient(135deg, #059669, #10b981)" },
  { href: "/admin/billing", icon: "💳", label: "Billing", desc: "Tenant subscriptions & expiry tracking", color: "rgba(245,158,11,0.15)", border: "rgba(245,158,11,0.35)", text: "#fcd34d", grad: "linear-gradient(135deg, #d97706, #f59e0b)" },
  { href: "/admin/plans", icon: "📋", label: "Plans", desc: "Subscription plans, pricing & limits", color: "rgba(59,130,246,0.15)", border: "rgba(59,130,246,0.35)", text: "#93c5fd", grad: "linear-gradient(135deg, #1d4ed8, #3b82f6)" },
  { href: "/admin/logs", icon: "📊", label: "Activity Logs", desc: "Audit trail of admin actions & events", color: "rgba(139,92,246,0.15)", border: "rgba(139,92,246,0.35)", text: "#c4b5fd", grad: "linear-gradient(135deg, #6d28d9, #8b5cf6)" },
  { href: "/admin/maintenance", icon: "🔧", label: "Maintenance", desc: "Run system tasks & repairs", color: "rgba(100,116,139,0.15)", border: "rgba(100,116,139,0.35)", text: "#94a3b8", grad: "linear-gradient(135deg, #475569, #64748b)" },
  { href: "/admin/settings", icon: "⚙️", label: "Settings", desc: "Global defaults & system configuration", color: "rgba(52,211,153,0.12)", border: "rgba(52,211,153,0.3)", text: "#6ee7b7", grad: "linear-gradient(135deg, #065f46, #10b981)" },
  { href: "/admin/menu-templates", icon: "🧩", label: "Menu Templates", desc: "Configure menu permission templates", color: "rgba(249,115,22,0.12)", border: "rgba(249,115,22,0.3)", text: "#fdba74", grad: "linear-gradient(135deg, #c2410c, #f97316)" },
  { href: "/admin/menus", icon: "📑", label: "Menus Library", desc: "Manage system menus & navigation groups", color: "rgba(139,92,246,0.12)", border: "rgba(139,92,246,0.3)", text: "#c4b5fd", grad: "linear-gradient(135deg, #7c3aed, #818cf8)" },
  { href: "/admin/backup-restore", icon: "💾", label: "Backup & Restore", desc: "Company data backup and restoration", color: "rgba(168,85,247,0.12)", border: "rgba(168,85,247,0.3)", text: "#d8b4fe", grad: "linear-gradient(135deg, #6d28d9, #a855f7)" },
  { href: "/admin/records", icon: "📑", label: "Records", desc: "System field IDs and report mappings", color: "rgba(236,72,153,0.12)", border: "rgba(236,72,153,0.3)", text: "#f472b6", grad: "linear-gradient(135deg, #db2777, #ec4899)" },
];

export default function AdminHomePage() {
  const token = typeof window !== "undefined" ? getToken() : null;
  const { data: currentUser } = useSWR(
    token ? "/auth/me" : null,
    (url: string) => api.get(url).then((r) => r.data)
  );
  const { data: settings } = useSWR(
    token ? "/admin/settings" : null,
    (url: string) => api.get(url).then((r) => r.data)
  );
  
  const { isSuperAdmin, isGhostAdmin, isTenantAdmin: contextIsTenantAdmin, role: contextRole } = usePermissions();
  const isAnyGhostAdmin = isSuperAdmin || isGhostAdmin;
  const isTenantAdmin = !isAnyGhostAdmin && (contextIsTenantAdmin || contextRole === "admin");
  const tenantId = currentUser?.tenant_id;

  const ghostCompanyId = settings?.ghost_company_id;

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={{ ...G.inner, maxWidth: "1200px" }}>
        {/* Hero header */}
        <div style={{ textAlign: "center", marginBottom: "48px", padding: "24px 0 0" }}>
          <div style={{ width: "64px", height: "64px", borderRadius: "20px", background: "linear-gradient(135deg, #7c3aed, #5b21b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "28px", boxShadow: "0 0 40px rgba(124,58,237,0.4)", margin: "0 auto 16px" }}>
            👻
          </div>
          <h1 style={{ fontSize: "36px", fontWeight: 900, background: "linear-gradient(135deg, #a78bfa 0%, #06b6d4 50%, #34d399 100%)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", margin: "0 0 8px", letterSpacing: "-1px" }}>
            {isSuperAdmin ? "Superadmin Control" : "Admin Panel"}
          </h1>
          <p style={{ color: "#64748b", fontSize: "15px", margin: 0 }}>
            {isSuperAdmin
              ? "Full system access · Manage tenants, users, plans, and infrastructure"
              : "Manage tenants, users, and system configuration"}
          </p>
        </div>

        {/* Featured: Ghost Dashboard & Platform Financials — ghost admins only */}
        {isAnyGhostAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
            <Link href="/admin/ghost" style={{ display: "block", textDecoration: "none" }}>
              <div
                className="g-card-hover"
                style={{
                  background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(79,70,229,0.12))",
                  border: "1px solid rgba(124,58,237,0.4)",
                  borderRadius: "20px",
                  padding: "24px 28px",
                  display: "flex",
                  alignItems: "center",
                  gap: "16px",
                  boxShadow: "0 8px 32px rgba(124,58,237,0.15)",
                  transition: "all 0.2s",
                  height: "100%",
                }}
              >
                <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", boxShadow: "0 0 20px rgba(124,58,237,0.4)", flexShrink: 0 }}>
                  📊
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: "16px", color: "#c4b5fd", marginBottom: "2px" }}>Ghost Dashboard</div>
                  <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.4 }}>Tenant analytics & control center</div>
                </div>
              </div>
            </Link>

            <div
              style={{
                background: "linear-gradient(135deg, rgba(236,72,153,0.18), rgba(219,39,119,0.12))",
                border: "1px solid rgba(236,72,153,0.4)",
                borderRadius: "20px",
                padding: "24px 28px",
                display: "flex",
                alignItems: "center",
                gap: "16px",
                boxShadow: "0 8px 32px rgba(236,72,153,0.15)",
                transition: "all 0.2s",
                height: "100%",
                position: "relative",
              }}
            >
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #db2777, #ec4899)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", boxShadow: "0 0 20px rgba(236,72,153,0.4)", flexShrink: 0 }}>
                💰
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: "16px", color: "#f472b6", marginBottom: "2px" }}>Platform Financials</div>
                <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.4, marginBottom: "12px" }}>Manage SaaS revenue & operator ledgers</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  <Link href="/admin/billing" style={{ ...G.btnGhost, padding: "6px 12px", fontSize: "11px", borderColor: "rgba(236,72,153,0.3)", color: "#f472b6", textDecoration: "none" }}>
                    Billing Center
                  </Link>
                  {ghostCompanyId && (
                    <Link href={`/dashboard?company_id=${ghostCompanyId}`} style={{ ...G.btnPrimary, padding: "6px 12px", fontSize: "11px", background: "linear-gradient(135deg, #db2777, #ec4899)", border: "none", color: "#fff", textDecoration: "none" }}>
                      Enter Finance Books →
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tenant Admin Quick Actions */}
        {isTenantAdmin && !isSuperAdmin && (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ color: "#94a3b8", fontSize: "13px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "1px", marginBottom: "12px" }}>Quick Actions</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
              <Link href="/settings/menu-permissions" style={{ textDecoration: "none" }}>
                <div
                  className="g-card-hover"
                  style={{
                    background: "linear-gradient(135deg, rgba(16,185,129,0.18), rgba(5,150,105,0.12))",
                    border: "1px solid rgba(16,185,129,0.4)",
                    borderRadius: "16px",
                    padding: "22px 24px",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    animation: "fadeIn 0.3s ease 0s both",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #059669, #10b981)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0, boxShadow: "0 4px 16px rgba(16,185,129,0.4)" }}>
                    🔐
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#6ee7b7", marginBottom: "4px" }}>Menu Permissions</div>
                    <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>Manage menu access levels for your tenant users</div>
                  </div>
                  <div style={{ color: "#10b981", fontSize: "20px" }}>→</div>
                </div>
              </Link>
              <Link href="/settings/users" style={{ textDecoration: "none" }}>
                <div
                  className="g-card-hover"
                  style={{
                    background: "linear-gradient(135deg, rgba(59,130,246,0.18), rgba(29,78,216,0.12))",
                    border: "1px solid rgba(59,130,246,0.4)",
                    borderRadius: "16px",
                    padding: "22px 24px",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    animation: "fadeIn 0.3s ease 0.05s both",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #1d4ed8, #3b82f6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0, boxShadow: "0 4px 16px rgba(59,130,246,0.4)" }}>
                    👥
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#93c5fd", marginBottom: "4px" }}>Manage Users</div>
                    <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>Create, edit & manage users in your tenant</div>
                  </div>
                  <div style={{ color: "#3b82f6", fontSize: "20px" }}>→</div>
                </div>
              </Link>
              {tenantId && (
                <Link href={`/admin/tenants/${tenantId}/backup-restore`} style={{ textDecoration: "none" }}>
                  <div
                    className="g-card-hover"
                    style={{
                      background: "linear-gradient(135deg, rgba(168,85,247,0.18), rgba(109,40,217,0.12))",
                      border: "1px solid rgba(168,85,247,0.4)",
                      borderRadius: "16px",
                      padding: "22px 24px",
                      transition: "all 0.2s",
                      display: "flex",
                      alignItems: "center",
                      gap: "16px",
                      animation: "fadeIn 0.3s ease 0.1s both",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #6d28d9, #a855f7)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0, boxShadow: "0 4px 16px rgba(168,85,247,0.4)" }}>
                      💾
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: "16px", color: "#d8b4fe", marginBottom: "4px" }}>Backup & Restore</div>
                      <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>Backup and restore company data</div>
                    </div>
                    <div style={{ color: "#a855f7", fontSize: "20px" }}>→</div>
                  </div>
                </Link>
              )}
              <Link href="/admin/import" style={{ textDecoration: "none" }}>
                <div
                  className="g-card-hover"
                  style={{
                    background: "linear-gradient(135deg, rgba(245,158,11,0.18), rgba(217,119,6,0.12))",
                    border: "1px solid rgba(245,158,11,0.4)",
                    borderRadius: "16px",
                    padding: "22px 24px",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "center",
                    gap: "16px",
                    animation: "fadeIn 0.3s ease 0.15s both",
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #d97706, #f59e0b)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", flexShrink: 0, boxShadow: "0 4px 16px rgba(245,158,11,0.4)" }}>
                    📥
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: "16px", color: "#fcd34d", marginBottom: "4px" }}>Import Data</div>
                    <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>Import data from files into the system</div>
                  </div>
                  <div style={{ color: "#f59e0b", fontSize: "20px" }}>→</div>
                </div>
              </Link>
            </div>
          </div>
        )}

        {/* Featured: Ghost Dashboard — ghost admins only */}
        {isAnyGhostAdmin && (
          <Link href="/admin/ghost" style={{ display: "block", textDecoration: "none", marginBottom: "24px" }}>
            <div
              className="g-card-hover"
              style={{
                background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(79,70,229,0.12))",
                border: "1px solid rgba(124,58,237,0.4)",
                borderRadius: "20px",
                padding: "24px 28px",
                display: "flex",
                alignItems: "center",
                gap: "20px",
                boxShadow: "0 8px 32px rgba(124,58,237,0.15)",
                transition: "all 0.2s",
              }}
            >
              <div style={{ width: "56px", height: "56px", borderRadius: "16px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "26px", boxShadow: "0 0 24px rgba(124,58,237,0.5)", flexShrink: 0 }}>
                👻
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: "18px", color: "#c4b5fd", marginBottom: "4px" }}>Ghost Dashboard</div>
                <div style={{ color: "#64748b", fontSize: "13px" }}>Your comprehensive tenant overview — stats, table view, quick actions, and plan distribution</div>
              </div>
              <div style={{ color: "#7c3aed", fontSize: "20px", marginRight: "4px" }}>→</div>
            </div>
          </Link>
        )}

        {/* Grid of sections — ghost admins/tenant admin only */}
        {isAnyGhostAdmin && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "16px" }}>
            {SECTIONS.filter(s => {
              if (isSuperAdmin) return true;
              const role = contextRole?.toLowerCase() || "";
              if (role === "ghost_billing") return ["/admin/billing", "/admin/plans"].includes(s.href);
              if (role === "ghost_support") return ["/admin/tenants", "/admin/announcements"].includes(s.href);
              if (role === "ghost_tech") return ["/admin/menu-templates", "/admin/menus", "/admin/settings"].includes(s.href);
              return true;
            }).map((s, i) => (
              <Link
                key={s.href}
                href={s.href}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="g-card-hover"
                  style={{
                    background: s.color,
                    border: `1px solid ${s.border}`,
                    borderRadius: "16px",
                    padding: "22px 24px",
                    transition: "all 0.2s",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "14px",
                    animation: `fadeIn 0.3s ease ${i * 0.05}s both`,
                    cursor: "pointer",
                  }}
                >
                  <div style={{ width: "44px", height: "44px", borderRadius: "12px", background: s.grad, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px", flexShrink: 0, boxShadow: `0 4px 16px ${s.border}` }}>
                    {s.icon}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: "15px", color: s.text, marginBottom: "4px" }}>{s.label}</div>
                    <div style={{ color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>{s.desc}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: "48px", textAlign: "center", color: "#1e293b", fontSize: "12px" }}>
          <div style={{ display: "flex", justifyContent: "center", gap: "24px", color: "#334155" }}>
            {isSuperAdmin && <><span>👻 Ghost Mode</span><span>•</span></>}
            <span>🔐 {isSuperAdmin ? "Superadmin" : "Admin"} Access</span>
            <span>•</span>
            <span>⚡ {isSuperAdmin ? "Full" : "Elevated"} Privileges</span>
          </div>
        </div>
      </div>
    </div>
  );
}
