"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type Role = "user" | "admin" | "superadmin";

type MenuAccessLevel = "deny" | "read" | "update" | "full";

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
  parent_id: number | null;
  sort_order: number | null;
  is_active: boolean;
};

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

export default function BrandsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;

  const { data: currentUser } = useSWR("/auth/me", (url: string) =>
    api.get(url).then((res) => res.data)
  );
  const currentRole = (currentUser?.role as Role | undefined) || "user";
  const isSuperAdmin = currentRole === "superadmin";

  const { data: brands, mutate } = useSWR(
    companyId ? `/companies/${companyId}/brands?is_active=true` : null,
    fetcher
  );

  const { data: menus } = useSWR<MenuRead[]>(
    companyId ? "/admin/users/menus" : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: userMenuAccess } = useSWR<UserMenuAccessEntry[]>(
    currentUser && companyId
      ? `/admin/users/${currentUser.id}/companies/${companyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const accessLevelByMenuId = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || "full";
      });
    }
    return map;
  }, [userMenuAccess]);

  const accessLevelByCode: Record<string, MenuAccessLevel> = useMemo(() => {
    const map: Record<string, MenuAccessLevel> = {};
    if (menus) {
      menus.forEach((m) => {
        if (!m.code) return;
        const level = accessLevelByMenuId[m.id];
        map[m.code] = level || "full";
      });
    }
    return map;
  }, [menus, accessLevelByMenuId]);

  const getAccessLevel = (menuCode: string): MenuAccessLevel => {
    if (isSuperAdmin) return "full";
    return accessLevelByCode[menuCode] ?? "full";
  };

  const brandsAccessLevel = getAccessLevel("inventory.brands");
  const canCreateOrEditBrands =
    brandsAccessLevel === "update" || brandsAccessLevel === "full";
  const canDeleteBrands = brandsAccessLevel === "full";

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (b: any) => {
    setEditingId(b.id);
    setName(b.name || "");
    setCode(b.code || "");
    setDescription(b.description || "");
    setIsActive(b.is_active !== false);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setDescription("");
    setIsActive(true);
    setSubmitError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!canCreateOrEditBrands) {
      setSubmitError("You are not allowed to create or update brands.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      name,
      code: code || null,
      description: description || null,
      is_active: isActive,
    };

    try {
      if (editingId) {
        await api.put(`/companies/${companyId}/brands/${editingId}`, payload);
      } else {
        await api.post(`/companies/${companyId}/brands`, payload);
      }

      const returnTo = searchParams.get('returnTo');
      if (returnTo && !editingId) {
        const separator = returnTo.includes('?') ? '&' : '?';
        router.push(`${returnTo}${separator}returning=true&newName=${encodeURIComponent(name)}&type=BRAND`);
        return;
      }

      resetForm();
      mutate();
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || (editingId ? "Failed to update brand" : "Failed to create brand")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredBrands = useMemo(() => {
    const all = (brands || []) as any[];
    const term = search.trim().toLowerCase();
    return all.filter((b) => {
      if (!showInactive && b.is_active === false) return false;
      if (!term) return true;
      const name = (b.name || "").toString().toLowerCase();
      const codeVal = (b.code || "").toString().toLowerCase();
      return name.includes(term) || codeVal.includes(term);
    });
  }, [brands, search, showInactive]);

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    if (!canDeleteBrands) {
      return;
    }
    if (!confirm("Delete this brand? This will deactivate it.")) return;
    try {
      await api.delete(`/companies/${companyId}/brands/${id}`);
      mutate();
    } catch (err) {
      // ignore
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Brands</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage your item brands and collections.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const rt = searchParams.get("returnTo");
                if (rt) {
                  const separator = rt.includes("?") ? "&" : "?";
                  router.push(`${rt}${separator}returning=true`);
                } else if (companyId) {
                  router.push(`/companies/${companyId}/inventory/items`);
                } else {
                  router.back();
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.707 3.293a1 1 0 010 1.414L6.414 9H17a1 1 0 110 2H6.414l4.293 4.293a1 1 0 01-1.414 1.414l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                const rt = searchParams.get("returnTo");
                if (rt) {
                  const separator = rt.includes("?") ? "&" : "?";
                  router.push(`${rt}${separator}returning=true`);
                } else {
                  router.push("/dashboard");
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between mb-4 gap-3 text-xs w-full">
            <input
              className="border rounded-lg border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 px-3 py-2 text-xs w-full md:w-64 outline-none transition-all"
              placeholder="Search by name or code..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <label className="flex items-center gap-2 cursor-pointer text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">
              <input
                type="checkbox"
                className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 rounded border-slate-300"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              <span>Show inactive</span>
            </label>
          </div>

          {!brands ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : filteredBrands.length === 0 ? (
            <div className="text-sm text-slate-500">No brands yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">Description</th>
                  <th className="text-left py-2">Active</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBrands.map((b: any) => (
                  <tr key={b.id} className="border-b last:border-none">
                    <td className="py-2">{b.name}</td>
                    <td className="py-2 text-xs text-slate-500">{b.code}</td>
                    <td className="py-2 text-xs text-slate-500">{b.description}</td>
                    <td className="py-2 text-xs text-slate-500">{b.is_active ? "Yes" : "No"}</td>
                    <td className="py-2 text-xs space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        disabled={!canCreateOrEditBrands}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(b.id)}
                        disabled={!canDeleteBrands}
                        className="px-2 py-1 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
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
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 h-min">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{editingId ? "Edit Brand" : "Create Brand"}</h2>
        {submitError && <div className="text-xs font-medium text-red-600 mb-4 bg-red-50 p-2 rounded">{submitError}</div>}
        <form onSubmit={handleSubmit} className="space-y-3 text-sm">
          <div>
            <label className="block mb-1">Name</label>
            <input
              className="w-full border rounded px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">Code</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 mt-6">
              <input
                id="brand-active"
                type="checkbox"
                className="h-4 w-4"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="brand-active" className="text-xs">
                Active
              </label>
            </div>
          </div>
          <div>
            <label className="block mb-1">Description</label>
            <textarea
              className="w-full border rounded px-3 py-2"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting || !canCreateOrEditBrands}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : editingId ? "Update Brand" : "Save Brand"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-all duration-150"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
