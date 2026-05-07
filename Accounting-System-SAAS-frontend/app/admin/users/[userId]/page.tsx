"use client";

import { useRouter, useParams } from "next/navigation";
import { FormEvent, useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { api, getApiErrorMessage } from "@/lib/api";
import { Role, UserRead, UserUpdate } from "@/lib/adminUsers";

const fetcher = (url: string) => api.get(url).then((res) => res.data as UserRead);

type UserCompanyAccess = {
  id: number;
  user_id: number;
  company_id: number;
  can_sales: boolean;
  can_purchases: boolean;
  can_inventory: boolean;
  can_reports: boolean;
  created_at: string;
  updated_at: string;
};

type Company = {
  id: number;
  name: string;
};

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
  parent_id: number | null;
  sort_order: number | null;
  is_active: boolean;
};

type MenuAccessLevel = "deny" | "read" | "update" | "full";

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const userId = params?.userId as string | undefined;
  const isValidUserId = !!userId;
  const { data, error, mutate } = useSWR<UserRead>(
    userId ? `/admin/users/${userId}` : null,
    fetcher
  );
  const { data: currentUser } = useSWR("/auth/me", (url: string) =>
    api.get(url).then((res) => res.data)
  );
  const currentRole = (currentUser?.role as Role | undefined) || "user";
  const isSuperAdmin = currentRole === "superadmin";

  const {
    data: accessRows,
    error: accessError,
    mutate: mutateAccess,
  } = useSWR<UserCompanyAccess[]>(
    userId ? `/admin/users/${userId}/companies` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [isTenantAdmin, setIsTenantAdmin] = useState(false);
  const [tenantId, setTenantId] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [newCompanyId, setNewCompanyId] = useState<string>("");
  const [newCanSales, setNewCanSales] = useState(false);
  const [newCanPurchases, setNewCanPurchases] = useState(false);
  const [newCanInventory, setNewCanInventory] = useState(false);
  const [newCanReports, setNewCanReports] = useState(false);
  const [accessSaving, setAccessSaving] = useState(false);
  const [accessErrorMessage, setAccessErrorMessage] = useState<string | null>(null);

  const [menuCompanyId, setMenuCompanyId] = useState<string>("");

  const menuKey =
    menuCompanyId !== "" ? `/admin/users/menus?company_id=${menuCompanyId}&include_inactive=1` : null;

  const { data: menus } = useSWR<MenuRead[]>(
    menuKey,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const [menuMode, setMenuMode] = useState<"on" | "off">("on");

  const effectiveMenuCompanyId = useMemo(() => {
    if (menuCompanyId) return Number(menuCompanyId);
    return null;
  }, [menuCompanyId]);

  const {
    data: userMenuAccess,
    mutate: mutateUserMenuAccess,
  } = useSWR<UserMenuAccessEntry[]>(
    userId && effectiveMenuCompanyId != null
      ? `/admin/users/${userId}/companies/${effectiveMenuCompanyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const accessByMenuId: Record<number, MenuAccessLevel> = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || "full";
      });
    }
    return map;
  }, [userMenuAccess]);

  const [stagedAccessByMenuId, setStagedAccessByMenuId] = useState<Record<number, MenuAccessLevel>>({});
  const [menuDirty, setMenuDirty] = useState(false);
  const [applyingMenus, setApplyingMenus] = useState(false);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuModuleFilter, setMenuModuleFilter] = useState<string>("all");
  const [menuShowOnlyAllowed, setMenuShowOnlyAllowed] = useState(false);
  const [menuShowOnlyDenied, setMenuShowOnlyDenied] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);
  const [seedErrorMessage, setSeedErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!menus || !userMenuAccess || effectiveMenuCompanyId == null) {
      setStagedAccessByMenuId({});
      setMenuDirty(false);
      return;
    }
    const initial: Record<number, MenuAccessLevel> = {};
    menus.forEach((menu) => {
      const explicit = accessByMenuId[menu.id];
      initial[menu.id] = explicit || "deny";
    });
    setStagedAccessByMenuId(initial);
    setMenuDirty(false);
  }, [menus, userMenuAccess, effectiveMenuCompanyId, accessByMenuId]);

  const effectiveTenantIdForCompanies = useMemo(() => {
    const parsed = tenantId.trim() !== "" ? Number(tenantId) : undefined;
    if (parsed != null && !Number.isNaN(parsed)) return parsed;
    if (data?.tenant_id != null) return data.tenant_id;
    if (currentUser?.tenant_id != null) return currentUser.tenant_id;
    return null;
  }, [tenantId, data?.tenant_id, currentUser?.tenant_id]);

  const { data: companies } = useSWR<Company[]>(
    effectiveTenantIdForCompanies != null
      ? `/admin/tenants/${effectiveTenantIdForCompanies}/companies`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  useEffect(() => {
    if (data) {
      setEmail(data.email);
      setFullName(data.full_name || "");
      setRole(data.role);
      setIsTenantAdmin(Boolean(data.is_tenant_admin));
      setTenantId(data.tenant_id != null ? String(data.tenant_id) : "");
    }
  }, [data]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!data) return;
    const patch: UserUpdate = {};
    if (email !== data.email) patch.email = email;
    if (fullName !== (data.full_name || "")) patch.full_name = fullName;
    if (isSuperAdmin && role !== data.role) patch.role = role;
    if (isSuperAdmin && isTenantAdmin !== Boolean(data.is_tenant_admin)) {
      patch.is_tenant_admin = isTenantAdmin;
    }
    const newTenant = tenantId ? Number(tenantId) : null;
    if (isSuperAdmin && newTenant !== data.tenant_id) patch.tenant_id = newTenant;
    if (password.trim()) patch.password = password.trim();
    if (Object.keys(patch).length === 0) return;
    setSaving(true);
    setErrorMessage(null);
    try {
      await api.put(`/admin/users/${userId}`, patch);
      setPassword("");
      mutate();
    } catch (err: any) {
      const detail = getApiErrorMessage(err);
      if (detail === "Email already in use") {
        setErrorMessage("Email already in use");
      } else if (detail === "Superadmin privileges required") {
        setErrorMessage("Superadmin privileges required");
      } else if (detail === "User not found") {
        setErrorMessage("User not found");
      } else {
        setErrorMessage(detail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAccessToggle = async (
    row: UserCompanyAccess,
    field: keyof Pick< UserCompanyAccess, "can_sales" | "can_purchases" | "can_inventory" | "can_reports">,
  ) => {
    try {
      await api.put(`/admin/users/${userId}/companies/${row.company_id}`, {
        [field]: !row[field],
      });
      mutateAccess();
    } catch (err: any) {
      // errors will be surfaced by backend as 403/404; keep UI simple
    }
  };

  const handleAccessDelete = async (row: UserCompanyAccess) => {
    if (!confirm("Remove access for this company?")) return;
    try {
      await api.delete(`/admin/users/${userId}/companies/${row.company_id}`);
      mutateAccess();
    } catch (err: any) {
      mutateAccess();
    }
  };

  const handleAccessCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!newCompanyId) return;
    setAccessSaving(true);
    setAccessErrorMessage(null);
    try {
      await api.post(`/admin/users/${userId}/companies`, {
        user_id: Number(userId),
        company_id: Number(newCompanyId),
        can_sales: newCanSales,
        can_purchases: newCanPurchases,
        can_inventory: newCanInventory,
        can_reports: newCanReports,
      });
      setNewCompanyId("");
      setNewCanSales(false);
      setNewCanPurchases(false);
      setNewCanInventory(false);
      setNewCanReports(false);
      mutateAccess();
    } catch (err: any) {
      const detail = getApiErrorMessage(err);
      if (detail.includes("Access already exists for this company")) {
        setAccessErrorMessage("Access already exists for this company.");
      } else if (detail.includes("does not belong to user")) {
        setAccessErrorMessage(
          "Company does not belong to this user's tenant. Please check tenant and company."
        );
      } else {
        setAccessErrorMessage(detail);
      }
      mutateAccess();
    } finally {
      setAccessSaving(false);
    }
  };

  const handleMenuAccessChange = (
    menuId: number,
    accessLevel: MenuAccessLevel
  ) => {
    if (effectiveMenuCompanyId == null) return;
    setStagedAccessByMenuId((prev) => ({
      ...prev,
      [menuId]: accessLevel,
    }));
    setMenuDirty(true);
  };

  const handleBulkMenuAccessChange = (accessLevel: MenuAccessLevel) => {
    if (effectiveMenuCompanyId == null || !menus) return;
    const next: Record<number, MenuAccessLevel> = { ...stagedAccessByMenuId };
    menus.forEach((menu) => {
      next[menu.id] = accessLevel;
    });
    setStagedAccessByMenuId(next);
    setMenuDirty(true);
  };

  const handleApplyMenuChanges = async () => {
    if (!userId || effectiveMenuCompanyId == null || !menus) return;
    setApplyingMenus(true);
    try {
      await Promise.all(
        menus.map((menu) => {
          const newLevel = stagedAccessByMenuId[menu.id] ?? accessByMenuId[menu.id] ?? "full";
          const oldLevel = accessByMenuId[menu.id] ?? "full";
          if (newLevel === oldLevel) return Promise.resolve();
          return api.put(
            `/admin/users/${userId}/companies/${effectiveMenuCompanyId}/menus/${menu.id}`,
            { access_level: newLevel }
          );
        })
      );
      setMenuDirty(false);
      mutateUserMenuAccess();
    } catch (err: any) {
      // keep UI simple; rely on backend status codes
    } finally {
      setApplyingMenus(false);
    }
  };

  const handleSeedDefaultMenus = async () => {
    if (!userId || effectiveMenuCompanyId == null) return;
    setSeedingDefaults(true);
    setSeedSuccessMessage(null);
    setSeedErrorMessage(null);
    try {
      const url = `/admin/users/${userId}/companies/${effectiveMenuCompanyId}/menus/seed-defaults`;
      await api.post(url);
      // Refresh menus and user menu access so the grid reflects new defaults
      if (menuKey) {
        // Revalidate the menus list
        await (async () => {
          // useSWR for menus does not expose mutate directly here; rely on global revalidation
          await api.get(menuKey);
        })();
      }
      await mutateUserMenuAccess();
      setSeedSuccessMessage(
        "Default menus updated. New menus have been added with full access; existing permissions were not changed."
      );
    } catch (err: any) {
      setSeedErrorMessage(getApiErrorMessage(err));
    } finally {
      setSeedingDefaults(false);
    }
  };

  const sortedMenus: MenuRead[] = useMemo(() => {
    if (!menus) return [] as MenuRead[];
    return [...menus].sort((a, b) => {
      const modA = (a.module || "").toLowerCase();
      const modB = (b.module || "").toLowerCase();
      if (modA !== modB) return modA.localeCompare(modB);
      return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
    });
  }, [menus]);

  const filteredMenus: MenuRead[] = useMemo(() => {
    let result = sortedMenus;

    if (menuModuleFilter !== "all") {
      const mf = menuModuleFilter.toLowerCase();
      result = result.filter((m) => (m.module || "").toLowerCase() === mf);
    }

    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      result = result.filter((m) => {
        return (
          m.label.toLowerCase().includes(q) ||
          (m.code || "").toLowerCase().includes(q) ||
          (m.module || "").toLowerCase().includes(q)
        );
      });
    }

    if (menuShowOnlyAllowed || menuShowOnlyDenied) {
      result = result.filter((m) => {
        const level = stagedAccessByMenuId[m.id] ?? accessByMenuId[m.id] ?? "deny";
        if (menuShowOnlyAllowed && level !== "deny") return true;
        if (menuShowOnlyDenied && level === "deny") return true;
        if (!menuShowOnlyAllowed && !menuShowOnlyDenied) return true;
        return false;
      });
    }

    return result;
  }, [
    sortedMenus,
    menuSearch,
    menuModuleFilter,
    menuShowOnlyAllowed,
    menuShowOnlyDenied,
    stagedAccessByMenuId,
    accessByMenuId,
  ]);

  const handleDelete = async () => {
    if (!data) return;
    if (!confirm("Delete this user? This cannot be undone.")) return;
    setDeleting(true);
    setErrorMessage(null);
    try {
      await api.delete(`/admin/users/${userId}`);
      router.push("/admin/users");
    } catch (err: any) {
      setErrorMessage(getApiErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  if (!isValidUserId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">User Detail</h1>
        {error && (
          <div className="text-sm text-red-600 mb-2">
            {errorMessage || "Failed to load user"}
          </div>
        )}
        <div className="bg-white shadow rounded p-4 max-w-xl">
          {!data ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-sm">
              {errorMessage && (
                <div className="text-sm text-red-600">{errorMessage}</div>
              )}
              <div>
                <div className="text-slate-500 text-xs">ID</div>
                <div className="font-mono text-xs">{data.id}</div>
              </div>
              <div>
                <label className="block mb-1">Email</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="block mb-1">Role</label>
                {isSuperAdmin ? (
                  <select
                    className="w-full border rounded px-3 py-2"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                  >
                    <option value="user">user</option>
                    <option value="admin">admin</option>
                    <option value="superadmin">superadmin</option>
                    <option value="ghost_billing">ghost_billing</option>
                    <option value="ghost_support">ghost_support</option>
                    <option value="ghost_tech">ghost_tech</option>
                  </select>
                ) : (
                  <div className="px-3 py-2 border rounded bg-slate-50 text-xs">
                    {role}
                  </div>
                )}
              </div>
              <div>
                <label className="block mb-1">Tenant ID</label>
                {isSuperAdmin ? (
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={tenantId}
                    onChange={(e) => setTenantId(e.target.value)}
                    placeholder="Leave blank for no tenant"
                  />
                ) : (
                  <div className="px-3 py-2 border rounded bg-slate-50 text-xs">
                    {tenantId || "(same as admin tenant)"}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-1 pb-2">
                <input
                  id="is_tenant_admin"
                  type="checkbox"
                  className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                  checked={isTenantAdmin}
                  onChange={(e) => setIsTenantAdmin(e.target.checked)}
                  disabled={!isSuperAdmin}
                />
                <label
                  htmlFor="is_tenant_admin"
                  className="text-xs font-semibold text-slate-700 cursor-pointer select-none"
                >
                  Is Tenant Admin
                </label>
                <span className="text-[10px] text-slate-400">
                  (Grant administrative privileges within the organization)
                </span>
              </div>
              <div>
                <label className="block mb-1">Reset Password (optional)</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Leave blank to keep existing password"
                />
              </div>
              <div>
                <div className="text-slate-500 text-xs">Created At</div>
                <div className="text-xs text-slate-600">
                  {new Date(data.created_at).toLocaleString()}
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="px-3 py-2 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 text-xs"
                >
                  {deleting ? "Deleting…" : "Delete User"}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
                >
                  {saving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-medium mb-2">Company Access</h2>
        {accessError && (
          <div className="text-sm text-red-600 mb-2">
            You are not allowed to manage company access for this user.
          </div>
        )}
        <div className="bg-white shadow rounded p-4 max-w-3xl text-sm">
          {accessErrorMessage && (
            <div className="text-xs text-red-600 mb-2">{accessErrorMessage}</div>
          )}
          {!accessRows ? (
            <div className="text-xs text-slate-500">Loading company access...</div>
          ) : accessRows.length === 0 ? (
            <div className="text-xs text-slate-500 mb-3">No company access configured yet.</div>
          ) : (
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5">Company</th>
                  <th className="text-center py-1.5">Sales</th>
                  <th className="text-center py-1.5">Purchases</th>
                  <th className="text-center py-1.5">Inventory</th>
                  <th className="text-center py-1.5">Reports</th>
                  <th className="text-left py-1.5">Actions</th>
                </tr>
              </thead>
              <tbody>
                {accessRows.map((row) => {
                  const company = companies?.find((c) => c.id === row.company_id);
                  return (
                    <tr key={row.id} className="border-b last:border-none">
                      <td className="py-1.5 text-xs">{company?.name || `Company #${row.company_id}`}</td>
                      {(["can_sales", "can_purchases", "can_inventory", "can_reports"] as const).map((field) => (
                        <td key={field} className="py-1.5 text-center">
                          <input
                            type="checkbox"
                            checked={row[field]}
                            onChange={() => handleAccessToggle(row, field)}
                          />
                        </td>
                      ))}
                      <td className="py-1.5 text-xs">
                        <button
                          type="button"
                          className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
                          onClick={() => handleAccessDelete(row)}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          <form onSubmit={handleAccessCreate} className="space-y-2 text-xs mt-2">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 items-center">
              <div className="md:col-span-2">
                <label className="block mb-1">Add company access</label>
                <select
                  className="w-full border rounded px-2 py-1.5 text-xs"
                  value={newCompanyId}
                  onChange={(e) => setNewCompanyId(e.target.value)}
                >
                  <option value="">Select company</option>
                  {companies?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={newCanSales}
                    onChange={(e) => setNewCanSales(e.target.checked)}
                  />
                  <span>Sales</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={newCanPurchases}
                    onChange={(e) => setNewCanPurchases(e.target.checked)}
                  />
                  <span>Purchases</span>
                </label>
              </div>
              <div className="flex flex-col gap-1">
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={newCanInventory}
                    onChange={(e) => setNewCanInventory(e.target.checked)}
                  />
                  <span>Inventory</span>
                </label>
                <label className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={newCanReports}
                    onChange={(e) => setNewCanReports(e.target.checked)}
                  />
                  <span>Reports</span>
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={accessSaving}
              className="mt-2 px-4 py-1.5 rounded bg-slate-900 text-white text-xs disabled:opacity-60"
            >
              {accessSaving ? "Saving..." : "Add Access"}
            </button>
          </form>
          {accessRows && accessRows.length > 0 && (
            <div className="mt-6 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <h3 className="text-sm font-medium">
                      Per-menu permissions
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-slate-600">
                      <span>Mode:</span>
                      <select
                        className="border rounded px-1.5 py-0.5 bg-white text-[11px]"
                        value={menuMode}
                        onChange={(e) => setMenuMode(e.target.value as "on" | "off")}
                      >
                        <option value="on">On</option>
                        <option value="off">Off</option>
                      </select>
                    </div>
                  </div>
                  {effectiveMenuCompanyId != null && menus && userMenuAccess && (
                    <div className="flex flex-wrap gap-2 text-[11px] justify-end">
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-red-500 text-red-700 bg-white hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={menuMode === "off"}
                        onClick={() => handleBulkMenuAccessChange("deny")}
                      >
                        Hide all
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-sky-500 text-sky-700 bg-white hover:bg-sky-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={menuMode === "off"}
                        onClick={() => handleBulkMenuAccessChange("read")}
                      >
                        Readonly all
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-amber-500 text-amber-700 bg-white hover:bg-amber-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={menuMode === "off"}
                        onClick={() => handleBulkMenuAccessChange("update")}
                      >
                        Update all
                      </button>
                      <button
                        type="button"
                        className="px-2 py-1 rounded border border-emerald-500 text-emerald-700 bg-white hover:bg-emerald-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={menuMode === "off"}
                        onClick={() => handleBulkMenuAccessChange("full")}
                      >
                        Allow all
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded bg-slate-900 text-white disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={menuMode === "off" || !menuDirty || applyingMenus}
                        onClick={handleApplyMenuChanges}
                      >
                        {applyingMenus ? "Applying..." : "Apply"}
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1 rounded border border-slate-400 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                        disabled={menuMode === "off" || effectiveMenuCompanyId == null || seedingDefaults}
                        onClick={handleSeedDefaultMenus}
                      >
                        {seedingDefaults ? "Updating defaults..." : "Update default menu"}
                      </button>
                    </div>
                  )}
                </div>
                {(seedSuccessMessage || seedErrorMessage) && (
                  <div className="mb-2 text-[11px]">
                    {seedSuccessMessage && (
                      <div className="text-emerald-700">{seedSuccessMessage}</div>
                    )}
                    {seedErrorMessage && (
                      <div className="text-red-600">{seedErrorMessage}</div>
                    )}
                  </div>
                )}
                {effectiveMenuCompanyId != null && menus && userMenuAccess && (
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Search menus &amp; submenus
                      </span>
                      <input
                        className="border rounded px-2 py-1 text-xs min-w-[200px]"
                        placeholder="Search by menu name, code, or module"
                        value={menuSearch}
                        onChange={(e) => setMenuSearch(e.target.value)}
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Module
                      </span>
                      <select
                        className="border rounded px-2 py-1 text-xs min-w-[140px]"
                        value={menuModuleFilter}
                        onChange={(e) => setMenuModuleFilter(e.target.value)}
                      >
                        <option value="all">All modules</option>
                        {Array.from(
                          new Set(sortedMenus.map((m) => (m.module || "").trim()).filter(Boolean))
                        ).map((mod) => (
                          <option key={mod} value={mod}>
                            {mod}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="inline-flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={menuShowOnlyAllowed}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setMenuShowOnlyAllowed(checked);
                          if (checked) setMenuShowOnlyDenied(false);
                        }}
                      />
                      <span>Show only allowed</span>
                    </label>
                    <label className="inline-flex items-center gap-1 text-[11px]">
                      <input
                        type="checkbox"
                        checked={menuShowOnlyDenied}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setMenuShowOnlyDenied(checked);
                          if (checked) setMenuShowOnlyAllowed(false);
                        }}
                      />
                      <span>Show only denied</span>
                    </label>
                  </div>
                )}
              <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
                <span className="text-slate-600">Company:</span>
                <select
                  className="border rounded px-2 py-1.5 text-xs"
                  value={menuCompanyId}
                  onChange={(e) => setMenuCompanyId(e.target.value)}
                >
                  <option value="">Select company</option>
                  {accessRows.map((row) => {
                    const company = companies?.find((c) => c.id === row.company_id);
                    return (
                      <option key={row.company_id} value={row.company_id}>
                        {company?.name || `Company #${row.company_id}`}
                      </option>
                    );
                  })}
                </select>
              </div>
              {!menus ? (
                <div className="text-xs text-slate-500">Loading menus...</div>
              ) : effectiveMenuCompanyId == null ? (
                <div className="text-xs text-slate-500">
                  Select a company to manage per-menu access.
                </div>
              ) : !userMenuAccess ? (
                <div className="text-xs text-slate-500">Loading access...</div>
              ) : (
                <div className="border rounded max-h-[500px] overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0 z-10">
                      <tr className="border-b">
                        <th className="text-left py-1.5 px-2">Menu</th>
                        <th className="text-center py-1.5 px-2">Hide</th>
                        <th className="text-center py-1.5 px-2">Readonly</th>
                        <th className="text-center py-1.5 px-2">Update</th>
                        <th className="text-center py-1.5 px-2">Allow</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMenus.map((menu) => {
                        const stagedLevel = stagedAccessByMenuId[menu.id];
                        const explicitLevel = accessByMenuId[menu.id];
                        const level: MenuAccessLevel = stagedLevel || explicitLevel || "full";
                        const isDeny = level === "deny";
                        const isRead = level === "read";
                        const isUpdate = level === "update";
                        const isFull = level === "full";
                        return (
                          <tr key={menu.id} className="border-b last:border-none">
                            <td className="py-1.5 px-2">
                              <div className="font-medium text-xs">
                                <span className="text-[10px] text-slate-500 mr-1">{menu.id}</span>
                                <span>{menu.label}</span>
                              </div>
                              <div className="text-[10px] text-slate-500">
                                {menu.module ? `${menu.module} ． ` : ""}
                                {menu.code}
                              </div>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                className={`px-3 py-1 rounded text-[11px] border ${
                                  isDeny
                                    ? "bg-red-600 text-white border-red-600"
                                    : "bg-white text-slate-700 border-slate-300"
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                                disabled={menuMode === "off"}
                                onClick={() => handleMenuAccessChange(menu.id, "deny")}
                              >
                                Hide
                              </button>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                className={`px-3 py-1 rounded text-[11px] border ${
                                  isRead
                                    ? "bg-sky-600 text-white border-sky-600"
                                    : "bg-white text-slate-700 border-slate-300"
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                                disabled={menuMode === "off"}
                                onClick={() => handleMenuAccessChange(menu.id, "read")}
                              >
                                Readonly
                              </button>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                className={`px-3 py-1 rounded text-[11px] border ${
                                  isUpdate
                                    ? "bg-amber-600 text-white border-amber-600"
                                    : "bg-white text-slate-700 border-slate-300"
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                                disabled={menuMode === "off"}
                                onClick={() => handleMenuAccessChange(menu.id, "update")}
                              >
                                Update
                              </button>
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <button
                                type="button"
                                className={`px-3 py-1 rounded text-[11px] border ${
                                  isFull
                                    ? "bg-emerald-600 text-white border-emerald-600"
                                    : "bg-white text-slate-700 border-slate-300"
                                } disabled:opacity-60 disabled:cursor-not-allowed`}
                                disabled={menuMode === "off"}
                                onClick={() => handleMenuAccessChange(menu.id, "full")}
                              >
                                Allow
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
