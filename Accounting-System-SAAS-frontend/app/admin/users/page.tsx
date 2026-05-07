"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";
import { createUser, deleteUser, Role, useUsers } from "@/lib/adminUsers";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, Pill, roleColor, ANIM_CSS,
} from "@/lib/adminTheme";

const ROLES: Role[] = ["user", "admin", "superadmin", "ghost_billing", "ghost_support", "ghost_tech"];

function fmt(d?: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

export default function AdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: currentUser } = useSWR("/auth/me", (url: string) => api.get(url).then((r) => r.data));
  const isSuperAdmin = (currentUser?.role as string | undefined) === "superadmin";

  const [qInput, setQInput] = useState(searchParams.get("q") || "");
  const [q, setQ] = useState(searchParams.get("q") || "");
  const [roleFilter, setRoleFilter] = useState<Role | "">(((searchParams.get("role") as Role) || "") as Role | "");
  const [tenantFilter, setTenantFilter] = useState(searchParams.get("tenant_id") || "");
  const [skip, setSkip] = useState(Number(searchParams.get("skip") || 0));
  const [limit, setLimit] = useState(Number(searchParams.get("limit") || 25));
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setQ(qInput.trim()), 300);
    return () => clearTimeout(id);
  }, [qInput]);

  useEffect(() => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (roleFilter) p.set("role", roleFilter);
    if (tenantFilter) p.set("tenant_id", tenantFilter);
    if (skip) p.set("skip", String(skip));
    if (limit) p.set("limit", String(limit));
    const qs = p.toString();
    router.replace(qs ? `/admin/users?${qs}` : "/admin/users");
  }, [q, roleFilter, tenantFilter, skip, limit, router]);

  const effectiveTenantId = isSuperAdmin
    ? tenantFilter ? Number(tenantFilter) : undefined
    : currentUser?.tenant_id ?? undefined;

  const { data, error, mutate, isLoading } = useUsers({ q, role: roleFilter, tenant_id: effectiveTenantId ?? null, skip, limit });

  const [createEmail, setCreateEmail] = useState("");
  const [createFullName, setCreateFullName] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createConfirmPassword, setCreateConfirmPassword] = useState("");
  const [createRole, setCreateRole] = useState<Role>("user");
  const [createTenantId, setCreateTenantId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [createPasswordError, setCreatePasswordError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setCreatePasswordError(null);
    if (!createEmail.trim() || !createPassword.trim()) { setCreateError("Email and password are required."); return; }
    if (createPassword.length < 8) { setCreatePasswordError("Password must be at least 8 characters."); return; }
    if (!/[A-Za-z]/.test(createPassword) || !/[0-9]/.test(createPassword)) { setCreatePasswordError("Password must contain a letter and a digit."); return; }
    if (createPassword !== createConfirmPassword) { setCreatePasswordError("Passwords do not match."); return; }
    setCreating(true);
    try {
      await createUser({
        email: createEmail, full_name: createFullName, password: createPassword,
        confirm_password: createConfirmPassword,
        role: isSuperAdmin ? createRole : "user",
        tenant_id: (isSuperAdmin ? createTenantId : String(currentUser?.tenant_id ?? "")) ? Number(isSuperAdmin ? createTenantId : currentUser?.tenant_id) : null,
      });
      setCreateEmail(""); setCreateFullName(""); setCreatePassword(""); setCreateConfirmPassword(""); setCreateRole("user"); setCreateTenantId("");
      mutate();
      setShowCreate(false);
    } catch (err: any) {
      setCreateError(err?.response?.data?.detail || "Failed to create user");
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this user? This cannot be undone.")) return;
    setActionError(null);
    try { await deleteUser(id); mutate(); } catch (err: any) {
      setActionError(err?.response?.data?.detail || "Failed to delete user");
    }
  };

  const inputFld: React.CSSProperties = { ...G.inputStyle, fontSize: "14px", padding: "10px 14px" };
  const labelSty: React.CSSProperties = { color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" };

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>
        <GhostPageHeader icon="👥" title="Users" subtitle="Manage system users — create accounts, assign roles, and control access.">
          <button onClick={() => setShowCreate((v) => !v)} style={G.btnPrimary}>
            {showCreate ? "✕ Cancel" : "+ New User"}
          </button>
          <Link href="/admin/ghost" style={{ ...G.btnGhost, textDecoration: "none", display: "inline-block" }}>← Ghost Dashboard</Link>
        </GhostPageHeader>

        {actionError && <div style={{ marginBottom: "16px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "12px 18px", color: "#fca5a5", fontSize: "13px" }}>⚠️ {actionError}</div>}

        {/* Create Form */}
        {showCreate && (
          <div style={{ ...G.card, padding: "28px", marginBottom: "24px", animation: "fadeIn 0.3s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px" }}>
              <div style={{ width: "36px", height: "36px", borderRadius: "10px", background: "linear-gradient(135deg, #7c3aed, #4f46e5)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "16px" }}>✨</div>
              <div style={{ fontWeight: 700, fontSize: "16px", color: "#e2e8f0" }}>Create New User</div>
            </div>
            {createError && <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px" }}>⚠️ {createError}</div>}
            <form onSubmit={handleCreate}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "16px", marginBottom: "16px" }}>
                <div><label style={labelSty}>Email *</label><input type="email" value={createEmail} onChange={(e) => setCreateEmail(e.target.value)} required style={inputFld} placeholder="user@example.com" /></div>
                <div><label style={labelSty}>Full Name</label><input type="text" value={createFullName} onChange={(e) => setCreateFullName(e.target.value)} style={inputFld} placeholder="John Doe" /></div>
                <div>
                  <label style={labelSty}>Password *</label>
                  <input type="password" value={createPassword} onChange={(e) => setCreatePassword(e.target.value)} required style={inputFld} placeholder="Min. 8 chars" />
                  {createPasswordError && <div style={{ color: "#fca5a5", fontSize: "12px", marginTop: "4px" }}>{createPasswordError}</div>}
                </div>
                <div><label style={labelSty}>Confirm Password *</label><input type="password" value={createConfirmPassword} onChange={(e) => setCreateConfirmPassword(e.target.value)} required style={inputFld} /></div>
                {isSuperAdmin && (
                  <>
                    <div>
                      <label style={labelSty}>Role</label>
                      <select value={createRole} onChange={(e) => setCreateRole(e.target.value as Role)} style={{ ...G.selectStyle, width: "100%" }}>
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    <div><label style={labelSty}>Tenant ID</label><input type="number" value={createTenantId} onChange={(e) => setCreateTenantId(e.target.value)} style={inputFld} placeholder="Optional" /></div>
                  </>
                )}
              </div>
              <button type="submit" disabled={creating} style={{ ...G.btnPrimary, opacity: creating ? 0.7 : 1 }}>
                {creating ? "Creating…" : "✨ Create User"}
              </button>
            </form>
          </div>
        )}

        {/* Filters */}
        <div style={{ ...G.card, padding: "14px 18px", marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
          <input value={qInput} onChange={(e) => setQInput(e.target.value)} placeholder="🔍 Search by email…" style={{ ...G.inputStyle, maxWidth: "280px" }} />
          {isSuperAdmin && (
            <>
              <select value={roleFilter} onChange={(e) => setRoleFilter((e.target.value || "") as Role | "")} style={G.selectStyle}>
                <option value="">All Roles</option>
                <option value="user">User</option>
                <option value="admin">Admin</option>
                <option value="superadmin">Superadmin</option>
                <option value="ghost_billing">Billing Admin</option>
                <option value="ghost_support">Support Admin</option>
                <option value="ghost_tech">Tech Admin</option>
              </select>
              <input value={tenantFilter} onChange={(e) => setTenantFilter(e.target.value)} placeholder="Tenant ID" style={{ ...G.inputStyle, width: "110px" }} />
              <button onClick={() => { setRoleFilter("admin"); setTenantFilter(""); setSkip(0); }} style={{ ...G.btnGhost, fontSize: "12px" }} className="g-btn-ghost">Tenant Admins</button>
            </>
          )}
          <select value={limit} onChange={(e) => { setLimit(Number(e.target.value)); setSkip(0); }} style={{ ...G.selectStyle, fontSize: "12px" }}>
            <option value={10}>10 / page</option>
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
          </select>
          <span style={{ color: "#64748b", fontSize: "13px", marginLeft: "auto" }}>{data?.length ?? 0} users</span>
        </div>

        {/* Table */}
        <div style={{ ...G.card, overflow: "hidden", marginBottom: "24px" }}>
          {isLoading ? <GhostSpinner /> : !data || data.length === 0 ? <GhostEmpty message="No users found." /> : (
            <>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                    {["User", "Role", "Tenant", "Created", "Actions"].map((h) => (
                      <th key={h} style={G.tableHeader}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((u, i) => {
                    const rc = roleColor(u.role);
                    return (
                      <tr key={u.id} className="g-row" style={{ borderBottom: i < data.length - 1 ? "1px solid rgba(255,255,255,0.05)" : "none", transition: "background 0.15s", animation: `fadeIn 0.3s ease ${i * 0.02}s both` }}>
                        <td style={G.tableCell}>
                          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                            <div style={{ width: "32px", height: "32px", borderRadius: "50%", background: `linear-gradient(135deg, ${rc.text}33, ${rc.text}66)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: "13px", fontWeight: 800, color: rc.text, flexShrink: 0 }}>
                              {(u.email || "?")[0].toUpperCase()}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: "13px", color: "#e2e8f0" }}>{u.email}</div>
                              {u.full_name && <div style={{ fontSize: "11px", color: "#64748b" }}>{u.full_name}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={G.tableCell}><Pill bg={rc.bg} text={rc.text} border={rc.border}>{u.role}</Pill></td>
                        <td style={G.tableCell}>{u.tenant_id != null ? <span style={{ fontFamily: "monospace", color: "#67e8f9" }}>#{u.tenant_id}</span> : <span style={{ color: "#334155" }}>—</span>}</td>
                        <td style={G.tableCell}><span style={{ fontSize: "12px" }}>{fmt(u.created_at)}</span></td>
                        <td style={G.tableCell}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <Link href={`/admin/users/${u.id}`} className="g-btn-action" style={{ padding: "5px 10px", background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#94a3b8", fontSize: "12px", textDecoration: "none", transition: "all 0.15s" }}>View</Link>
                            <button onClick={() => handleDelete(u.id)} className="g-btn-danger-sm" style={{ padding: "5px 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#fca5a5", fontSize: "12px", cursor: "pointer", transition: "all 0.15s" }}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {/* Pagination */}
              <div style={{ padding: "14px 18px", borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <button onClick={() => setSkip(Math.max(0, skip - limit))} disabled={skip === 0} style={{ ...G.btnGhost, opacity: skip === 0 ? 0.4 : 1, fontSize: "12px" }}>← Previous</button>
                <span style={{ color: "#64748b", fontSize: "13px" }}>Showing {skip + 1}–{skip + (data?.length ?? 0)}</span>
                <button onClick={() => setSkip(skip + limit)} disabled={!data || data.length < limit} style={{ ...G.btnGhost, opacity: !data || data.length < limit ? 0.4 : 1, fontSize: "12px" }}>Next →</button>
              </div>
            </>
          )}
        </div>

        {(error as any)?.response?.status === 403 && (
          <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "12px", padding: "16px", color: "#fca5a5", fontSize: "13px" }}>🔐 Superadmin privileges required to view all users.</div>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>👥 Users — Superadmin Only</div>
      </div>
    </div>
  );
}
