"use client";

import { FormEvent, useState, useEffect, useMemo } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { api, setToken, getApiErrorMessage } from "@/lib/api";

type TenantUser = {
  id: number;
  name: string;
  email: string;
  is_tenant_admin: boolean;
  active: boolean;
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

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function TenantUsersPage() {
  const router = useRouter();
  const { data: currentUser, error: currentUserError } = useSWR("/auth/me", fetcher);
  const role = (currentUser?.role as string | undefined)?.toLowerCase();
  const isAdminLike = role === "admin" || role === "superadmin";

  const {
    data: users,
    error: usersError,
    isLoading: usersLoading,
    mutate: mutateUsers,
  } = useSWR<TenantUser[]>("/tenants/self/users", fetcher);

  const [formError, setFormError] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<TenantUser | null>(null);
  const [formUser, setFormUser] = useState<TenantUser | null>(null);
  const [saving, setSaving] = useState(false);

  // --- Per-menu permissions state ---
  const { data: companies } = useSWR<Company[]>("/companies", fetcher);
  const [menuCompanyId, setMenuCompanyId] = useState<string>("");
  const [menuMode, setMenuMode] = useState<"on" | "off">("on");
  const [menuSearch, setMenuSearch] = useState("");
  const [menuModuleFilter, setMenuModuleFilter] = useState<string>("all");
  const [menuShowOnlyAllowed, setMenuShowOnlyAllowed] = useState(false);
  const [menuShowOnlyDenied, setMenuShowOnlyDenied] = useState(false);
  const [updatingMenuId, setUpdatingMenuId] = useState<number | null>(null);
  const [applyingMenus, setApplyingMenus] = useState(false);
  const [seedingDefaults, setSeedingDefaults] = useState(false);
  const [seedSuccessMessage, setSeedSuccessMessage] = useState<string | null>(null);
  const [seedErrorMessage, setSeedErrorMessage] = useState<string | null>(null);

  const menuKey = menuCompanyId !== "" ? `/admin/users/menus?company_id=${menuCompanyId}` : null;
  const { data: menus } = useSWR<MenuRead[]>(menuKey, fetcher);

  const userMenuAccessKey = (editingUser && menuCompanyId)
    ? `/admin/users/${editingUser.id}/companies/${menuCompanyId}/menus`
    : null;
  const { data: userMenuAccess, mutate: mutateUserMenuAccess } = useSWR<UserMenuAccessEntry[]>(userMenuAccessKey, fetcher);

  const [stagedAccessByMenuId, setStagedAccessByMenuId] = useState<Record<number, MenuAccessLevel>>({});

  // Sync staged with fetched
  const accessByMenuId: Record<number, MenuAccessLevel> = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || "full";
      });
    }
    return map;
  }, [userMenuAccess]);

  useEffect(() => {
    if (!menus || !userMenuAccess || !menuCompanyId) {
      setStagedAccessByMenuId({});
      return;
    }
    const initial: Record<number, MenuAccessLevel> = {};
    menus.forEach((menu) => {
      initial[menu.id] = accessByMenuId[menu.id] || "deny";
    });
    setStagedAccessByMenuId(initial);
  }, [menus, userMenuAccess, menuCompanyId, accessByMenuId]);

  const handleMenuAccessChange = async (menuId: number, accessLevel: MenuAccessLevel) => {
    if (!editingUser || !menuCompanyId) return;
    setUpdatingMenuId(menuId);
    try {
      await api.put(`/admin/users/${editingUser.id}/companies/${menuCompanyId}/menus/${menuId}`, {
        access_level: accessLevel,
      });
      // Instant UI update
      setStagedAccessByMenuId((prev) => ({ ...prev, [menuId]: accessLevel }));
      mutateUserMenuAccess();
    } catch (err) {
      console.error("Failed to update menu access", err);
    } finally {
      setUpdatingMenuId(null);
    }
  };

  const handleBulkMenuAccessChange = async (accessLevel: MenuAccessLevel) => {
    if (!editingUser || !menuCompanyId || !menus) return;
    setApplyingMenus(true);
    try {
      await Promise.all(
        menus.map((m) => {
          const current = stagedAccessByMenuId[m.id] || "deny";
          if (current === accessLevel) return Promise.resolve();
          return api.put(`/admin/users/${editingUser.id}/companies/${menuCompanyId}/menus/${m.id}`, {
            access_level: accessLevel,
          });
        })
      );
      mutateUserMenuAccess();
    } catch (err) {
      console.error("Bulk update failed", err);
    } finally {
      setApplyingMenus(false);
    }
  };

  const handleSeedDefaultMenus = async () => {
    if (!editingUser || !menuCompanyId) return;
    setSeedingDefaults(true);
    setSeedSuccessMessage(null);
    setSeedErrorMessage(null);
    try {
      await api.post(`/admin/users/${editingUser.id}/companies/${menuCompanyId}/menus/seed-defaults`);
      mutateUserMenuAccess();
      setSeedSuccessMessage("Default menus updated.");
    } catch (err: any) {
      setSeedErrorMessage(getApiErrorMessage(err));
    } finally {
      setSeedingDefaults(false);
    }
  };

  const sortedMenus = useMemo(() => {
    if (!menus) return [] as MenuRead[];
    return [...menus].sort((a, b) => {
      const modA = (a.module || "").toLowerCase();
      const modB = (b.module || "").toLowerCase();
      if (modA !== modB) return modA.localeCompare(modB);
      return a.label.toLowerCase().localeCompare(b.label.toLowerCase());
    });
  }, [menus]);

  const filteredMenus = useMemo(() => {
    let result = sortedMenus;
    if (menuModuleFilter !== "all") {
      result = result.filter((m) => (m.module || "").toLowerCase() === menuModuleFilter.toLowerCase());
    }
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      result = result.filter((m) => m.label.toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q));
    }
    if (menuShowOnlyAllowed || menuShowOnlyDenied) {
      result = result.filter((m) => {
        const level = stagedAccessByMenuId[m.id] || "deny";
        if (menuShowOnlyAllowed && level !== "deny") return true;
        if (menuShowOnlyDenied && level === "deny") return true;
        return false;
      });
    }
    return result;
  }, [sortedMenus, menuSearch, menuModuleFilter, menuShowOnlyAllowed, menuShowOnlyDenied, stagedAccessByMenuId]);

  const isEditing = !!editingUser;

  if (currentUserError) {
    return (
      <div className="space-y-6">
        {/* ── Hero Header ────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
          <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40">
                <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-2.533-3.076m-9.594 3.076c.639.09 1.287.144 1.93.144 1.49 0 2.913-.288 4.223-.809m-7.4-.413a4.125 4.125 0 00-2.533 3.076m10.785-3.076a9.47 9.47 0 01-5.185 1.52 9.47 9.47 0 01-5.185-1.52m10.37 0a4.125 4.125 0 011.62-.338m-11.99 0a4.125 4.125 0 00-1.62-.338m15.233-3.664a4.125 4.125 0 11-8.25 0 4.125 4.125 0 018.25 0zm-7.5 0a4.125 4.125 0 11-8.25 0 4.125 4.125 0 018.25 0z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Users Management</h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  Manage your organization member&apos;s administrative roles.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-500 transition-all shadow-sm group"
                title="Go Back"
              >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:border-rose-500 transition-all shadow-sm group"
                title="Close"
              >
                <svg className="w-5 h-5 transform group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="text-red-600 text-sm">Failed to load current user.</div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className="text-sm text-slate-500">Loading user...</div>
    );
  }

  if (!isAdminLike) {
    return (
      <div className="space-y-6">
        {/* ── Hero Header ────────────────────────────────────────────────── */}
        <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6 no-print">
          <div className="h-[3px] w-full bg-gradient-to-r from-red-500 to-rose-500" />
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/30 border border-red-100 dark:border-red-800/40">
                <svg className="w-5 h-5 text-red-600 dark:text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Access Denied</h1>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                  You do not have permission to manage users for this tenant.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-500 transition-all shadow-sm group"
                title="Go Back"
              >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:border-rose-500 transition-all shadow-sm group"
                title="Close"
              >
                <svg className="w-5 h-5 transform group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
        <div className="bg-white shadow rounded p-4 max-w-lg text-xs text-slate-700">
          Please contact your Tenant Admin if you need additional access.
        </div>
      </div>
    );
  }

  const startCreate = () => {
    const base: TenantUser = {
      id: 0,
      name: "",
      email: "",
      is_tenant_admin: false,
      active: true,
    };
    setEditingUser(null);
    setFormUser(base);
    setPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setConfirmPasswordError(null);
    setFormError(null);
  };

  const startEdit = (u: TenantUser) => {
    setEditingUser(u);
    setFormUser(JSON.parse(JSON.stringify(u)) as TenantUser);
    setPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setConfirmPasswordError(null);
    setFormError(null);
    // Reset permissions state
    setMenuCompanyId("");
    setSeedSuccessMessage(null);
    setSeedErrorMessage(null);
  };

  const cancelEdit = () => {
    setEditingUser(null);
    setFormUser(null);
    setPassword("");
    setConfirmPassword("");
    setPasswordError(null);
    setConfirmPasswordError(null);
    setFormError(null);
    // Reset permissions state
    setMenuCompanyId("");
    setSeedSuccessMessage(null);
    setSeedErrorMessage(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!formUser) return;

    setSaving(true);
    setFormError(null);
    setPasswordError(null);
    setConfirmPasswordError(null);

    const isEditing = !!editingUser;

    // Client-side password validation
    if (!isEditing) {
      if (!password || !confirmPassword) {
        const msg = "Password and confirm password are required.";
        setPasswordError(msg);
        setConfirmPasswordError(msg);
        setSaving(false);
        return;
      }
      if (password !== confirmPassword) {
        const msg = "Password and confirm password do not match.";
        setPasswordError(msg);
        setConfirmPasswordError(msg);
        setSaving(false);
        return;
      }
    } else {
      const hasPassword = !!password || !!confirmPassword;
      if (hasPassword) {
        if (!password || !confirmPassword) {
          const msg = "Both password and confirm password are required to reset password.";
          setPasswordError(msg);
          setConfirmPasswordError(msg);
          setSaving(false);
          return;
        }
        if (password !== confirmPassword) {
          const msg = "Password and confirm password do not match.";
          setPasswordError(msg);
          setConfirmPasswordError(msg);
          setSaving(false);
          return;
        }
      }
    }

    try {
      const payload: any = {
        name: formUser.name,
        email: formUser.email,
        active: formUser.active,
        is_tenant_admin: formUser.is_tenant_admin,
      };

      const includePassword = !isEditing || (!!password && !!confirmPassword);
      if (includePassword) {
        payload.password = password;
        payload.confirm_password = confirmPassword;
      }

      if (isEditing) {
        await api.put(`/tenants/self/users/${formUser.id}`, payload);
      } else {
        await api.post("/tenants/self/users", payload);
      }

      await mutateUsers();
      setEditingUser(null);
      setFormUser(null);
      setPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = getApiErrorMessage(err);

      if (status === 401) {
        setToken(null);
        router.replace("/auth/login");
        return;
      }

      const lower = detail.toLowerCase();
      if (lower.includes("password") && lower.includes("match")) {
        setPasswordError(detail);
        setConfirmPasswordError(detail);
      } else if (lower.includes("at least 8") || lower.includes("letters and numbers")) {
        setPasswordError(detail);
      } else {
        setFormError(detail);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (user: TenantUser) => {
    if (!window.confirm("Delete this user?")) return;
    setListError(null);
    try {
      await api.delete(`/tenants/self/users/${user.id}`);
      await mutateUsers();
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = getApiErrorMessage(err);

      if (status === 401) {
        setToken(null);
        router.replace("/auth/login");
        return;
      }

      setListError(detail);
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/40">
              <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-2.533-3.076m-9.594 3.076c.639.09 1.287.144 1.93.144 1.49 0 2.913-.288 4.223-.809m-7.4-.413a4.125 4.125 0 00-2.533 3.076m10.785-3.076a9.47 9.47 0 01-5.185 1.52 9.47 9.47 0 01-5.185-1.52m10.37 0a4.125 4.125 0 011.62-.338m-11.99 0a4.125 4.125 0 00-1.62-.338m15.233-3.664a4.125 4.125 0 11-8.25 0 4.125 4.125 0 018.25 0zm-7.5 0a4.125 4.125 0 11-8.25 0 4.125 4.125 0 018.25 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Users Management</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage tenant users and administrative roles.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-500 transition-all shadow-sm group"
                title="Go Back"
              >
                <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:border-rose-500 transition-all shadow-sm group"
                title="Close"
              >
                <svg className="w-5 h-5 transform group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {isAdminLike && (
              <button
                type="button"
                className="px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 text-white text-xs font-semibold shadow-md active:scale-95 transition-all"
                onClick={startCreate}
              >
                New User
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded p-4">
        <div className="flex items-center justify-between mb-3 px-1">
          <h2 className="text-sm font-medium">Existing Users</h2>
        </div>
        {usersError && (
          <div className="mb-2 text-xs text-red-600">
            {usersError?.response?.data?.detail || "Failed to load users"}
          </div>
        )}
        {listError && (
          <div className="mb-2 text-xs text-red-600">{listError}</div>
        )}
        {usersLoading ? (
          <div className="text-xs text-slate-500">Loading users...</div>
        ) : !users || users.length === 0 ? (
          <div className="text-xs text-slate-500">No users yet.</div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1.5">Name</th>
                <th className="text-left py-1.5">Email</th>
                <th className="text-left py-1.5">Tenant Role</th>
                <th className="text-left py-1.5">Status</th>
                <th className="text-left py-1.5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-none">
                  <td className="py-1.5">{u.name}</td>
                  <td className="py-1.5 text-slate-500">{u.email}</td>
                  <td className="py-1.5 text-slate-500">
                    {u.is_tenant_admin ? "Tenant Admin" : "User"}
                  </td>
                  <td className="py-1.5 text-slate-500">{u.active ? "Active" : "Inactive"}</td>
                  <td className="py-1.5 space-x-2">
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                      onClick={() => startEdit(u)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
                      onClick={() => handleDelete(u)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {formUser && (
        <div className="bg-white shadow rounded p-4">
          <h2 className="text-sm font-medium mb-3">
            {isEditing ? "Edit User" : "New User"}
          </h2>
          {formError && (
            <div className="mb-2 text-xs text-red-600">{formError}</div>
          )}
          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block mb-1">Name</label>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={formUser.name}
                  onChange={(e) => setFormUser({ ...formUser, name: e.target.value })}
                  required
                />
              </div>
              <div>
                <label className="block mb-1">Email / Username</label>
                <input
                  className="w-full border rounded px-2 py-1.5"
                  value={formUser.email}
                  onChange={(e) => setFormUser({ ...formUser, email: e.target.value })}
                  required
                />
              </div>
            </div>

            {!isEditing && (
              <>
                <div>
                  <label className="block mb-1">Password</label>
                  <input
                    type="password"
                    className="w-full border rounded px-2 py-1.5"
                    placeholder="Set initial password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  {passwordError && (
                    <div className="mt-1 text-[11px] text-red-600">{passwordError}</div>
                  )}
                </div>
                <div>
                  <label className="block mb-1">Confirm Password</label>
                  <input
                    type="password"
                    className="w-full border rounded px-2 py-1.5"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  {confirmPasswordError && (
                    <div className="mt-1 text-[11px] text-red-600">{confirmPasswordError}</div>
                  )}
                </div>
              </>
            )}

            <div className="flex items-center gap-4 text-xs">
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={formUser.active}
                  onChange={(e) => setFormUser({ ...formUser, active: e.target.checked })}
                />
                <span>Active</span>
              </label>
              <label className="inline-flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={formUser.is_tenant_admin}
                  onChange={(e) => setFormUser({ ...formUser, is_tenant_admin: e.target.checked })}
                />
                <span>Tenant Admin (full access)</span>
              </label>
            </div>

            {isEditing && (
              <div className="mt-4 border-t pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-slate-800">Per-menu Permissions</h3>
                  <div className="flex items-center gap-2">
                    <select
                      className="text-[11px] border rounded px-2 py-1 bg-slate-50"
                      value={menuCompanyId}
                      onChange={(e) => setMenuCompanyId(e.target.value)}
                    >
                      <option value="">-- Select Company --</option>
                      {companies?.map((c) => (
                        <option key={c.id} value={String(c.id)}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    {menuCompanyId && (
                      <button
                        type="button"
                        onClick={handleSeedDefaultMenus}
                        disabled={seedingDefaults}
                        className="text-[10px] text-blue-600 hover:underline disabled:opacity-50"
                      >
                        {seedingDefaults ? "Seeding..." : "Seed Defaults"}
                      </button>
                    )}
                  </div>
                </div>

                {seedSuccessMessage && (
                  <div className="mb-2 p-2 bg-green-50 border border-green-100 text-green-700 rounded text-[10px]">
                    {seedSuccessMessage}
                  </div>
                )}
                {seedErrorMessage && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-100 text-red-700 rounded text-[10px]">
                    {seedErrorMessage}
                  </div>
                )}

                {menuCompanyId ? (
                  <div className="space-y-3">
                    {/* Filters & Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-3 p-2 bg-slate-50 border border-slate-100 rounded-lg">
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Search menus..."
                          className="w-40 border rounded px-2 py-1 text-[11px]"
                          value={menuSearch}
                          onChange={(e) => setMenuSearch(e.target.value)}
                        />
                        <select
                          className="border rounded px-2 py-1 text-[11px]"
                          value={menuModuleFilter}
                          onChange={(e) => setMenuModuleFilter(e.target.value)}
                        >
                          <option value="all">All Modules</option>
                          {Array.from(new Set(menus?.map((m) => (m.module || "General").trim()) || [])).sort().map((mod) => (
                            <option key={mod} value={mod.toLowerCase()}>{mod}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleBulkMenuAccessChange("full")}
                          className="px-2 py-1 text-[10px] bg-indigo-50 text-indigo-700 rounded border border-indigo-100 font-medium hover:bg-indigo-100"
                        >
                          Allow All
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBulkMenuAccessChange("deny")}
                          className="px-2 py-1 text-[10px] bg-rose-50 text-rose-700 rounded border border-rose-100 font-medium hover:bg-rose-100"
                        >
                          Deny All
                        </button>
                      </div>
                    </div>

                    {/* Permissions Grid */}
                    <div className="max-h-[300px] overflow-y-auto border border-slate-200 rounded-lg bg-white custom-scrollbar">
                      <table className="w-full text-[10px]">
                        <thead className="sticky top-0 bg-slate-100 border-b z-10 shadow-sm">
                          <tr>
                            <th className="text-left py-2 px-3">Menu / Module</th>
                            <th className="text-center py-2 px-1 w-14">Full</th>
                            <th className="text-center py-2 px-1 w-14">Update</th>
                            <th className="text-center py-2 px-1 w-14">Read</th>
                            <th className="text-center py-2 px-3 w-14">Deny</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {filteredMenus.map((m) => {
                            const currentLevel = stagedAccessByMenuId[m.id] || "deny";
                            return (
                              <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                                <td className="py-2 px-3">
                                  <div className="font-semibold text-slate-700">{m.label}</div>
                                  <div className="text-[9px] text-slate-400 tracking-wider">
                                    {(m.module || "General").toUpperCase()} • {m.code}
                                  </div>
                                </td>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="radio"
                                    name={`access-${m.id}`}
                                    className="accent-indigo-600 w-3 h-3"
                                    checked={currentLevel === "full"}
                                    onChange={() => handleMenuAccessChange(m.id, "full")}
                                  />
                                </td>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="radio"
                                    name={`access-${m.id}`}
                                    className="accent-purple-600 w-3 h-3"
                                    checked={currentLevel === "update"}
                                    onChange={() => handleMenuAccessChange(m.id, "update")}
                                  />
                                </td>
                                <td className="py-2 px-1 text-center">
                                  <input
                                    type="radio"
                                    name={`access-${m.id}`}
                                    className="accent-blue-600 w-3 h-3"
                                    checked={currentLevel === "read"}
                                    onChange={() => handleMenuAccessChange(m.id, "read")}
                                  />
                                </td>
                                <td className="py-2 px-3 text-center">
                                  <input
                                    type="radio"
                                    name={`access-${m.id}`}
                                    className="accent-slate-400 w-3 h-3"
                                    checked={currentLevel === "deny"}
                                    onChange={() => handleMenuAccessChange(m.id, "deny")}
                                    disabled={updatingMenuId === m.id}
                                  />
                                </td>
                              </tr>
                            );
                          })}
                          {filteredMenus.length === 0 && (
                            <tr>
                              <td colSpan={5} className="py-10 text-center text-slate-400 italic">
                                No menus found matching current filters.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-between mt-2 pt-1 border-t border-slate-100">
                       <span className="text-[10px] text-slate-400 italic">
                        {updatingMenuId ? "Updating..." : applyingMenus ? "Applying bulk changes..." : "Changes are saved automatically."}
                       </span>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-10 bg-slate-50 border border-slate-100 border-dashed rounded-xl">
                    <svg className="w-10 h-10 text-slate-200 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <p className="text-[11px] text-slate-400">Select a company above to manage granular menu access for this user.</p>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 mt-3">
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs disabled:opacity-60"
              >
                {saving ? "Saving..." : "Save"}
              </button>
              <button
                type="button"
                onClick={cancelEdit}
                className="px-4 py-1.5 rounded border border-slate-300 text-xs"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
