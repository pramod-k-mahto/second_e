"use client";

import { Fragment, ReactElement, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { isMenuPermissionsFeatureEnabled } from "@/lib/featureFlags";
import { G, GhostBg, GhostSpinner, GhostEmpty, ANIM_CSS } from "@/lib/adminTheme";

// ─── Types ────────────────────────────────────────────────────────────────────

type TenantUser = { id: number; name: string; email: string; is_tenant_admin: boolean; active: boolean };
type Company = { id: number; name: string };
type Menu = { id: number; code: string; label: string; module: string | null; parent_id: number | null; sort_order: number | null; is_active: boolean };
type MenuAccessLevel = "deny" | "read" | "update" | "full";
type UserMenuAccess = { menu_id: number; access_level: MenuAccessLevel };
type CurrentUser = { id: number; role?: string; is_tenant_admin?: boolean };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fetcher = (url: string) => api.get(url).then((r) => r.data);
const menusFetcher = (url: string): Promise<Menu[]> => api.get(url).then((r) => r.data);

const normalizedModule = (m: Menu): string => {
  const mod = (m.module || "").trim();
  if (mod) return mod;
  if ((m.code || "").toLowerCase().startsWith("settings.")) return "Settings";
  return "-";
};

const levels: MenuAccessLevel[] = ["deny", "read", "update", "full"];
const levelRank = (lvl: MenuAccessLevel) => { const i = levels.indexOf(lvl); return i >= 0 ? i : 0; };

const accessColors: Record<MenuAccessLevel, { bg: string; text: string; border: string; activeBg: string; activeText: string }> = {
  deny: { bg: "rgba(239,68,68,0.08)", text: "#94a3b8", border: "rgba(239,68,68,0.2)", activeBg: "rgba(239,68,68,0.2)", activeText: "#fca5a5" },
  read: { bg: "rgba(59,130,246,0.08)", text: "#94a3b8", border: "rgba(59,130,246,0.2)", activeBg: "rgba(59,130,246,0.22)", activeText: "#93c5fd" },
  update: { bg: "rgba(245,158,11,0.08)", text: "#94a3b8", border: "rgba(245,158,11,0.2)", activeBg: "rgba(245,158,11,0.22)", activeText: "#fcd34d" },
  full: { bg: "rgba(16,185,129,0.08)", text: "#94a3b8", border: "rgba(16,185,129,0.2)", activeBg: "rgba(16,185,129,0.22)", activeText: "#6ee7b7" },
};

const levelLabel: Record<MenuAccessLevel, string> = { deny: "Hide", read: "Read", update: "Update", full: "Full" };
const levelIcon: Record<MenuAccessLevel, string> = { deny: "🚫", read: "👁", update: "✏️", full: "✅" };

// ─── Component ────────────────────────────────────────────────────────────────

export default function TenantMenuPermissionsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const { data: currentUser } = useSWR<CurrentUser>("/auth/me", fetcher);
  const { data: users, error: usersError } = useSWR<TenantUser[]>("/tenants/self/users", fetcher);
  const { data: companies, error: companiesError } = useSWR<Company[]>("/companies", fetcher);

  const isSuperAdmin = String(currentUser?.role || "").toLowerCase() === "superadmin";
  const isRestrictedDelegator = false; // Tenant admins have implicit full access, so they can delegate up to "full"

  const [selectedUserId, setSelectedUserId] = useState<number | "">("");
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | "">("");

  const isBuildEnabled = isMenuPermissionsFeatureEnabled({ companyId: null, currentUser });
  const isFeatureEnabled = isMenuPermissionsFeatureEnabled({
    companyId: selectedCompanyId === "" ? null : selectedCompanyId, currentUser,
  });

  const menuKey = selectedCompanyId !== "" ? `/admin/users/menus?company_id=${selectedCompanyId}&include_inactive=1` : null;
  const { data: menus, error: menusError } = useSWR<Menu[]>(menuKey, menusFetcher);

  const canLoadAccess = selectedUserId !== "" && selectedCompanyId !== "" && isFeatureEnabled;
  const accessKey = canLoadAccess
    ? `/tenants/self/users/${selectedUserId}/companies/${selectedCompanyId}/menus` : null;

  const { data: userAccess, error: accessError, mutate: mutateUserAccess, isLoading: accessLoading } =
    useSWR<UserMenuAccess[]>(accessKey, (url: string) => api.get(url).then((r) => r.data));

  const canLoadAdminAccess = isRestrictedDelegator && currentUser?.id != null && selectedCompanyId !== "" && isFeatureEnabled;
  const adminAccessKey = canLoadAdminAccess
    ? `/tenants/self/users/${currentUser?.id}/companies/${selectedCompanyId}/menus` : null;
  const { data: adminAccess, isLoading: adminAccessLoading } =
    useSWR<UserMenuAccess[]>(adminAccessKey, (url: string) => api.get(url).then((r) => r.data));

  const selectableUsers = useMemo(() => {
    if (!users) return [] as TenantUser[];
    if (!currentUser) return users;
    return users.filter((u) => u.id !== currentUser.id);
  }, [users, currentUser]);

  const accessByMenuId = useMemo(() => {
    const m: Record<number, MenuAccessLevel> = {};
    (userAccess || []).forEach((r) => { m[r.menu_id] = r.access_level; });
    return m;
  }, [userAccess]);

  const [draftAccessByMenuId, setDraftAccessByMenuId] = useState<Record<number, MenuAccessLevel>>({});
  const [applySaving, setApplySaving] = useState(false);

  // Safely sync draft state with server state without being caught by useMemo reference changes
  const userAccessStr = useMemo(() => JSON.stringify(accessByMenuId), [accessByMenuId]);
  useEffect(() => { 
    setDraftAccessByMenuId(accessByMenuId); 
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessKey, userAccessStr]);

  const adminAccessByMenuId = useMemo(() => {
    const m: Record<number, MenuAccessLevel> = {};
    (adminAccess || []).forEach((r) => { m[r.menu_id] = r.access_level; });
    return m;
  }, [adminAccess]);

  const DEFAULT_LEVEL: MenuAccessLevel = "deny";

  const getMaxDelegableLevel = useCallback((menuId: number): MenuAccessLevel => {
    if (!isRestrictedDelegator) return "full";
    return adminAccessByMenuId[menuId] ?? DEFAULT_LEVEL;
  }, [adminAccessByMenuId, isRestrictedDelegator]);

  const clampToMaxDelegable = (menuId: number, desired: MenuAccessLevel): MenuAccessLevel => {
    const max = getMaxDelegableLevel(menuId);
    return levelRank(desired) <= levelRank(max) ? desired : max;
  };

  const isDirty = useMemo(() => {
    const ids = new Set<number>([
      ...Object.keys(accessByMenuId).map(Number),
      ...Object.keys(draftAccessByMenuId).map(Number),
    ]);
    for (const id of ids) {
      if ((accessByMenuId[id] ?? DEFAULT_LEVEL) !== (draftAccessByMenuId[id] ?? DEFAULT_LEVEL)) return true;
    }
    return false;
  }, [accessByMenuId, draftAccessByMenuId]);

  const [menuSearch, setMenuSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("all");
  const [showOnlyAllowed, setShowOnlyAllowed] = useState(false);
  const [showOnlyDenied, setShowOnlyDenied] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const sortedMenus = useMemo(() => {
    if (!menus) return [] as Menu[];
    return [...menus].sort((a, b) => {
      const mA = normalizedModule(a).toLowerCase(), mB = normalizedModule(b).toLowerCase();
      if (mA !== mB) return mA.localeCompare(mB);
      if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase());
    });
  }, [menus]);

  const hasSettingsMenus = useMemo(() => (menus || []).some((m) => (m.code || "").toLowerCase().startsWith("settings.")), [menus]);

  const filteredMenus = useMemo(() => {
    let r = sortedMenus;
    if (isRestrictedDelegator) r = r.filter((m) => getMaxDelegableLevel(m.id) !== "deny");
    if (!showInactive) r = r.filter((m) => m.is_active || (m.code || "").toLowerCase().startsWith("settings."));
    if (moduleFilter !== "all") r = r.filter((m) => normalizedModule(m).toLowerCase() === moduleFilter.toLowerCase());
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      r = r.filter((m) => (m.label || "").toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q) || (m.module || "").toLowerCase().includes(q));
    }
    if (showOnlyAllowed || showOnlyDenied) {
      r = r.filter((m) => {
        const lvl = accessByMenuId[m.id] ?? DEFAULT_LEVEL;
        if (showOnlyAllowed && lvl !== "deny") return true;
        if (showOnlyDenied && lvl === "deny") return true;
        if (!showOnlyAllowed && !showOnlyDenied) return true;
        return false;
      });
    }
    return r;
  }, [sortedMenus, isRestrictedDelegator, getMaxDelegableLevel, showInactive, menuSearch, moduleFilter, showOnlyAllowed, showOnlyDenied, accessByMenuId]);

  const groupedMenus = useMemo(() => {
    const g: Record<string, Menu[]> = {};
    filteredMenus.forEach((m) => { const k = normalizedModule(m); if (!g[k]) g[k] = []; g[k].push(m); });
    return g;
  }, [filteredMenus]);

  const childrenByParentId = useMemo(() => {
    const map = new Map<number | null, Menu[]>();
    filteredMenus.forEach((m) => {
      const k = m.parent_id ?? null;
      const arr = map.get(k) || [];
      arr.push(m);
      map.set(k, arr);
    });
    for (const [k, arr] of map.entries()) {
      arr.sort((a, b) => { if ((a.sort_order ?? 0) !== (b.sort_order ?? 0)) return (a.sort_order ?? 0) - (b.sort_order ?? 0); return (a.label || "").toLowerCase().localeCompare((b.label || "").toLowerCase()); });
      map.set(k, arr);
    }
    return map;
  }, [filteredMenus]);

  const getDescendants = (menuId: number): Menu[] => {
    const out: Menu[] = [];
    const stack = [menuId];
    while (stack.length) {
      const cur = stack.pop()!;
      const kids = childrenByParentId.get(cur) || [];
      for (const k of kids) { out.push(k); stack.push(k.id); }
    }
    return out;
  };

  const putMenuAccess = (menuId: number, newLevel: MenuAccessLevel) => {
    if (!canLoadAccess) return;
    const clamped = clampToMaxDelegable(menuId, newLevel);
    setDraftAccessByMenuId((prev) => ({ ...prev, [menuId]: clamped }));
  };

  const bulkUpdateModule = (module: string, level: MenuAccessLevel) => {
    if (!canLoadAccess || !menus) return;
    const ids = menus.filter((m) => normalizedModule(m) === (module || "-")).map((m) => m.id)
      .filter((id) => !isRestrictedDelegator || getMaxDelegableLevel(id) !== "deny");
    setDraftAccessByMenuId((prev) => { const n = { ...prev }; ids.forEach((id) => { n[id] = clampToMaxDelegable(id, level); }); return n; });
  };

  const bulkUpdateMenus = (menuIds: number[], level: MenuAccessLevel) => {
    if (!canLoadAccess || menuIds.length === 0) return;
    const ids = menuIds.filter((id) => !isRestrictedDelegator || getMaxDelegableLevel(id) !== "deny");
    if (ids.length === 0) return;
    setDraftAccessByMenuId((prev) => { const n = { ...prev }; ids.forEach((id) => { n[id] = clampToMaxDelegable(id, level); }); return n; });
  };

  const applyChanges = async () => {
    if (!canLoadAccess || !isDirty) return;
    const ids = new Set<number>([...Object.keys(accessByMenuId).map(Number), ...Object.keys(draftAccessByMenuId).map(Number)]);
    const changes: Array<{ menuId: number; level: MenuAccessLevel }> = [];
    for (const id of ids) {
      const srv = accessByMenuId[id] ?? DEFAULT_LEVEL;
      const drft = draftAccessByMenuId[id] ?? DEFAULT_LEVEL;
      if (srv !== drft) changes.push({ menuId: id, level: drft });
    }
    if (changes.length === 0) return;
    setApplySaving(true);
    try {
      await Promise.all(changes.map((c) => api.put(`/tenants/self/users/${selectedUserId}/companies/${selectedCompanyId}/menus/${c.menuId}`, { access_level: c.level })));
      await mutateUserAccess();
      showToast({ variant: "success", title: "Permissions saved", description: `${changes.length} changes applied.` });
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 403 && typeof detail === "string" && detail.toLowerCase().includes("menu not available")) {
        showToast({ variant: "error", title: "Permission denied", description: "This menu is not enabled for your tenant." });
      } else {
        showToast({ variant: "error", title: "Failed", description: detail || "Please try again." });
      }
      mutateUserAccess();
    } finally { setApplySaving(false); }
  };

  // ── Access Level Segmented Button ──────────────────────────────────────────
  const renderAccessLevel = (menuId: number, current: MenuAccessLevel): ReactNode => {
    const max = getMaxDelegableLevel(menuId);
    return (
      <div style={{ display: "flex", borderRadius: "8px", overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
        {levels.map((lvl) => {
          const c = accessColors[lvl];
          const active = current === lvl;
          const disabled = applySaving || !canLoadAccess || (isRestrictedDelegator && levelRank(lvl) > levelRank(max));
          return (
            <button key={lvl} type="button" onClick={() => putMenuAccess(menuId, lvl)} disabled={disabled}
              title={disabled && isRestrictedDelegator && levelRank(lvl) > levelRank(max) ? `Max: ${max}` : levelLabel[lvl]}
              style={{
                flex: 1, padding: "4px 0", border: "none", cursor: disabled ? "not-allowed" : "pointer",
                fontSize: "10px", fontWeight: 700, letterSpacing: "0.3px", transition: "all 0.15s",
                background: active ? c.activeBg : "rgba(255,255,255,0.03)",
                color: active ? c.activeText : disabled ? "#334155" : "#475569",
                opacity: disabled && !active ? 0.4 : 1,
                borderRight: lvl !== "full" ? "1px solid rgba(255,255,255,0.06)" : "none",
              }}
            >
              {levelLabel[lvl]}
            </button>
          );
        })}
      </div>
    );
  };

  // ── Feature disabled ───────────────────────────────────────────────────────
  if (!isBuildEnabled) {
    return (
      <div style={{ ...G.pageWrap, minHeight: "60vh" }}>
        <style>{ANIM_CSS}</style>
        <GhostBg />
        <div style={G.inner}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "linear-gradient(135deg, #7c3aed,#5b21b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>🔐</div>
            <div>
              <h1 style={G.gradientTitle}>Menu Permissions</h1>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Configure per-menu access levels for each user and company.</p>
            </div>
          </div>
          <div style={{ ...G.card, padding: "40px", textAlign: "center" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔒</div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>Per-menu permissions mode is disabled.</div>
          </div>
        </div>
      </div>
    );
  }

  // ── Main page ──────────────────────────────────────────────────────────────
  const allModules = Array.from(new Set(sortedMenus.map(normalizedModule).filter(Boolean)));
  const allowedCount = filteredMenus.filter((m) => (draftAccessByMenuId[m.id] ?? DEFAULT_LEVEL) !== "deny").length;
  const deniedCount = filteredMenus.length - allowedCount;
  const dirtyCount = Object.keys(draftAccessByMenuId).filter((k) => (draftAccessByMenuId[Number(k)] ?? DEFAULT_LEVEL) !== (accessByMenuId[Number(k)] ?? DEFAULT_LEVEL)).length;

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}</style>
      <GhostBg />
      <div style={G.inner}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "28px", flexWrap: "wrap", gap: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "44px", height: "44px", borderRadius: "14px", background: "linear-gradient(135deg, #7c3aed,#5b21b6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", boxShadow: "0 0 24px rgba(124,58,237,0.4)", flexShrink: 0 }}>🔐</div>
            <div>
              <h1 style={G.gradientTitle}>Menu Permissions</h1>
              <p style={{ color: "#64748b", fontSize: "13px", margin: 0 }}>Set Deny / Read / Update / Full access per menu, per user, per company.</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              onClick={() => router.back()}
              style={{ ...G.btnGhost, fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}
              className="g-btn-ghost"
              title="Go Back"
            >
              <span>←</span> Back
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              style={{ ...G.btnGhost, fontSize: "12px", display: "flex", alignItems: "center", gap: "6px", color: "#fca5a5" }}
              className="g-btn-ghost hover:text-rose-400"
              title="Close"
            >
              <span>✕</span> Close
            </button>
          </div>
        </div>

        {/* User / Company selector */}
        <div style={{ ...G.card, padding: "20px 24px", marginBottom: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          <div>
            <label style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" }}>Select User</label>
            <select value={selectedUserId === "" ? "" : String(selectedUserId)}
              onChange={(e) => { const v = e.target.value; setSelectedUserId(v ? Number(v) : ""); }}
              style={{ ...G.selectStyle, width: "100%" }}>
              <option value="">— Choose user —</option>
              {selectableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name || u.email} ({u.email}){u.is_tenant_admin ? " – Admin" : ""}
                </option>
              ))}
            </select>
            {usersError && <div style={{ color: "#fca5a5", fontSize: "11px", marginTop: "4px" }}>⚠️ {usersError?.response?.data?.detail || "Failed to load users"}</div>}
          </div>
          <div>
            <label style={{ color: "#94a3b8", fontSize: "12px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px", display: "block" }}>Select Company</label>
            <select value={selectedCompanyId === "" ? "" : String(selectedCompanyId)}
              onChange={(e) => { const v = e.target.value; setSelectedCompanyId(v ? Number(v) : ""); }}
              style={{ ...G.selectStyle, width: "100%" }}>
              <option value="">— Choose company —</option>
              {(companies || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {companiesError && <div style={{ color: "#fca5a5", fontSize: "11px", marginTop: "4px" }}>⚠️ {companiesError?.response?.data?.detail || "Failed to load companies"}</div>}
          </div>
        </div>

        {!canLoadAccess && (
          <div style={{ ...G.card, padding: "40px", textAlign: "center", marginBottom: "20px" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🔐</div>
            <div style={{ color: "#64748b", fontSize: "14px" }}>Select both a user and a company to configure menu permissions.</div>
          </div>
        )}

        {canLoadAccess && (
          <>
            {/* Stats + warning bar */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "12px", marginBottom: "16px" }}>
              {[
                { label: "Total Menus", val: filteredMenus.length, bg: "rgba(124,58,237,0.15)", border: "rgba(124,58,237,0.3)", text: "#c4b5fd" },
                { label: "Allowed", val: allowedCount, bg: "rgba(16,185,129,0.15)", border: "rgba(16,185,129,0.3)", text: "#6ee7b7" },
                { label: "Denied", val: deniedCount, bg: "rgba(239,68,68,0.15)", border: "rgba(239,68,68,0.3)", text: "#fca5a5" },
                { label: "Unsaved", val: dirtyCount, bg: dirtyCount > 0 ? "rgba(245,158,11,0.15)" : "rgba(100,116,139,0.12)", border: dirtyCount > 0 ? "rgba(245,158,11,0.3)" : "rgba(100,116,139,0.2)", text: dirtyCount > 0 ? "#fcd34d" : "#94a3b8" },
              ].map((s) => (
                <div key={s.label} style={{ ...G.card, background: s.bg, borderColor: s.border, padding: "12px 16px" }}>
                  <div style={{ fontSize: "20px", fontWeight: 800, color: s.text }}>{s.val}</div>
                  <div style={{ fontSize: "11px", color: "#94a3b8" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {isRestrictedDelegator && adminAccessLoading && (
              <div style={{ color: "#64748b", fontSize: "12px", marginBottom: "12px" }}>Loading your delegable permissions…</div>
            )}
            {!isFeatureEnabled && typeof selectedCompanyId === "number" && (
              <div style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "10px", padding: "10px 14px", color: "#fcd34d", fontSize: "12px", marginBottom: "16px" }}>
                ⚠️ Per-menu permissions feature is disabled for this company.
              </div>
            )}

            {/* Filters + Apply toolbar */}
            <div style={{ ...G.card, padding: "14px 18px", marginBottom: "14px", display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" }}>
              <input value={menuSearch} onChange={(e) => setMenuSearch(e.target.value)} placeholder="🔍 Search menus…" style={{ ...G.inputStyle, maxWidth: "240px" }} />
              <select value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)} style={{ ...G.selectStyle }}>
                <option value="all">All modules</option>
                {allModules.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b", cursor: "pointer" }}>
                <input type="checkbox" checked={showOnlyAllowed} onChange={(e) => { setShowOnlyAllowed(e.target.checked); if (e.target.checked) setShowOnlyDenied(false); }} style={{ accentColor: "#7c3aed" }} />
                Allowed only
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b", cursor: "pointer" }}>
                <input type="checkbox" checked={showOnlyDenied} onChange={(e) => { setShowOnlyDenied(e.target.checked); if (e.target.checked) setShowOnlyAllowed(false); }} style={{ accentColor: "#7c3aed" }} />
                Denied only
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#64748b", cursor: "pointer" }}>
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ accentColor: "#7c3aed" }} />
                Show inactive
              </label>
              <div style={{ marginLeft: "auto", display: "flex", gap: "8px" }}>
                <button onClick={() => setDraftAccessByMenuId(accessByMenuId)} disabled={!isDirty || applySaving} style={{ ...G.btnGhost, opacity: !isDirty || applySaving ? 0.4 : 1, fontSize: "12px" }} className="g-btn-ghost">↩ Reset</button>
                <button onClick={applyChanges} disabled={!isDirty || applySaving} style={{ ...G.btnPrimary, opacity: !isDirty || applySaving ? 0.5 : 1 }}>
                  {applySaving ? (
                    <span style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ width: "12px", height: "12px", border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                      Applying…
                    </span>
                  ) : `💾 Apply ${dirtyCount > 0 ? `(${dirtyCount})` : ""}`}
                </button>
              </div>
            </div>

            {accessError && (
              <div style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#fca5a5", fontSize: "13px", marginBottom: "14px" }}>
                ⚠️ {accessError?.response?.data?.detail || "Failed to load menu access"}
              </div>
            )}

            {/* Permissions table */}
            <div style={{ ...G.card, overflow: "hidden" }}>
              {(accessLoading && (!userAccess || userAccess.length === 0)) ? <GhostSpinner /> : filteredMenus.length === 0 ? <GhostEmpty message="No menus match your filters." /> : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "rgba(255,255,255,0.04)", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                      <th style={{ ...G.tableHeader, width: "110px" }}>Module</th>
                      <th style={{ ...G.tableHeader }}>Menu</th>
                      <th style={{ ...G.tableHeader, width: "190px" }}>Code</th>
                      <th style={{ ...G.tableHeader, width: "240px", textAlign: "center" }}>Access Level</th>
                      <th style={{ ...G.tableHeader, width: "100px" }}>Info</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(groupedMenus).map(([module, moduleMenus]) => {
                      const moduleRoots = moduleMenus.filter((m) => m.parent_id == null || !moduleMenus.some((x) => x.id === m.parent_id));

                      const renderNode = (m: Menu, depth: number): ReactElement[] => {
                        const level = draftAccessByMenuId[m.id] ?? accessByMenuId[m.id] ?? DEFAULT_LEVEL;
                        const isInherited = !Object.prototype.hasOwnProperty.call(accessByMenuId, m.id);
                        const children = (childrenByParentId.get(m.id) || []).filter((c) => normalizedModule(c) === module);
                        const descendants = children.length > 0 ? getDescendants(m.id).filter((d) => normalizedModule(d) === module) : [];

                        const row = (
                          <tr key={m.id} className="g-row" style={{ borderBottom: "1px solid rgba(255,255,255,0.04)", transition: "background 0.15s" }}>
                            <td style={{ ...G.tableCell, fontSize: "11px", color: "#475569" }}>{normalizedModule(m)}</td>
                            <td style={{ ...G.tableCell }}>
                              <div style={{ paddingLeft: depth * 16, display: "flex", alignItems: "center", gap: "6px" }}>
                                {depth > 0 && <span style={{ color: "#334155", fontSize: "10px" }}>└</span>}
                                <span style={{ fontSize: "13px", color: m.is_active ? "#e2e8f0" : "#475569", fontWeight: depth === 0 ? 600 : 400 }}>{m.label}</span>
                                {children.length > 0 && <span style={{ fontSize: "10px", color: "#334155" }}>({children.length})</span>}
                              </div>
                            </td>
                            <td style={{ ...G.tableCell, fontFamily: "monospace", fontSize: "11px", color: "#475569" }}>{m.code}</td>
                            <td style={{ ...G.tableCell, padding: "8px 12px" }}>{renderAccessLevel(m.id, level)}</td>
                            <td style={{ ...G.tableCell, fontSize: "11px" }}>
                              {isInherited && <span style={{ color: "#334155" }}>inherited</span>}
                              {!m.is_active && <span style={{ color: "#475569", marginLeft: isInherited ? " 6px" : "0" }}>inactive</span>}
                              {descendants.length > 0 && (
                                <button type="button" onClick={() => bulkUpdateMenus(descendants.map((d) => d.id), level)} disabled={applySaving}
                                  style={{ display: "block", marginTop: "2px", padding: "2px 6px", background: "rgba(124,58,237,0.12)", border: "1px solid rgba(124,58,237,0.2)", borderRadius: "5px", color: "#c4b5fd", fontSize: "10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                                  Set {descendants.length} children
                                </button>
                              )}
                            </td>
                          </tr>
                        );

                        const childRows = children.flatMap((c) => renderNode(c, depth + 1));
                        return [row, ...childRows];
                      };

                      return (
                        <Fragment key={module}>
                          {/* Module group header */}
                          <tr key={`mod-hdr-${module}`} style={{ background: "rgba(124,58,237,0.07)", borderBottom: "1px solid rgba(124,58,237,0.12)", borderTop: "1px solid rgba(124,58,237,0.12)" }}>
                            <td colSpan={5} style={{ padding: "8px 16px" }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#7c3aed" }} />
                                  <span style={{ fontSize: "12px", fontWeight: 800, color: "#c4b5fd", textTransform: "uppercase", letterSpacing: "0.8px" }}>{module}</span>
                                  <span style={{ fontSize: "11px", color: "#475569" }}>{moduleMenus.length} items</span>
                                </div>
                                <div style={{ display: "flex", gap: "6px" }}>
                                  {levels.map((lvl) => (
                                    <button key={lvl} type="button" onClick={() => bulkUpdateModule(module === "-" ? "" : module, lvl)} disabled={applySaving}
                                      style={{ padding: "3px 10px", borderRadius: "6px", border: `1px solid ${accessColors[lvl].border}`, background: accessColors[lvl].bg, color: accessColors[lvl].activeText, fontSize: "10px", fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                                      {levelIcon[lvl]} {levelLabel[lvl]} all
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {moduleRoots.flatMap((m) => renderNode(m, 0))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Floating sticky save bar when dirty */}
            {isDirty && (
              <div style={{ position: "sticky", bottom: "20px", display: "flex", justifyContent: "flex-end", marginTop: "16px", animation: "fadeIn 0.2s ease", zIndex: 50 }}>
                <div style={{ background: "rgba(15,15,25,0.92)", backdropFilter: "blur(16px)", border: "1px solid rgba(124,58,237,0.4)", borderRadius: "14px", padding: "12px 18px", display: "flex", alignItems: "center", gap: "14px", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }}>
                  <span style={{ color: "#fcd34d", fontSize: "13px", fontWeight: 600 }}>⚠️ {dirtyCount} unsaved change{dirtyCount !== 1 ? "s" : ""}</span>
                  <button onClick={() => setDraftAccessByMenuId(accessByMenuId)} style={{ ...G.btnGhost, fontSize: "12px" }} className="g-btn-ghost">↩ Reset</button>
                  <button onClick={applyChanges} disabled={applySaving} style={{ ...G.btnPrimary, opacity: applySaving ? 0.7 : 1 }}>
                    {applySaving ? "Applying…" : "💾 Apply Changes"}
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        <div style={{ marginTop: "24px", textAlign: "center", color: "#334155", fontSize: "12px" }}>🔐 Menu Permissions — Tenant Admin & Superadmin</div>
      </div>
    </div>
  );
}
