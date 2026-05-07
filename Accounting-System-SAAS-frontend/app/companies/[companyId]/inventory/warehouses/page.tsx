"use client";

import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type MenuAccessLevel = "deny" | "read" | "update" | "full";

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
};

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

type Warehouse = {
  id: number;
  name: string;
  code?: string | null;
  location?: string | null;
  description?: string | null;
  is_active?: boolean | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
};

type Department = {
  id: number;
  name: string;
};

type Project = {
  id: number;
  name: string;
};

type Segment = {
  id: number;
  name: string;
};

export default function WarehousesPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const { data: currentUser } = useSWR(
    "/auth/me",
    (url: string) => api.get(url).then((res) => res.data)
  );

  const userRole = (currentUser?.role as string | undefined) || "user";
  const isSuperAdmin = userRole.toLowerCase() === "superadmin";

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

  const warehousesAccessLevel = getAccessLevel("inventory.warehouses");
  const canCreateOrEdit = warehousesAccessLevel === "update" || warehousesAccessLevel === "full";
  const canDeleteWarehouses = warehousesAccessLevel === "full";

  const { data: warehouses, mutate } = useSWR<Warehouse[]>(
    companyId ? `/inventory/companies/${companyId}/warehouses` : null,
    fetcher
  );

  const { data: departments } = useSWR<Department[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const { data: projects } = useSWR<Project[]>(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );
  const { data: segments } = useSWR<Segment[]>(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [departmentId, setDepartmentId] = useState<number | "">("");
  const [projectId, setProjectId] = useState<number | "">("");
  const [segmentId, setSegmentId] = useState<number | "">("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (w: Warehouse) => {
    setEditingId(w.id);
    setName(w.name || "");
    setCode((w.code as string) || "");
    setLocation((w.location as string) || "");
    setDescription((w.description as string) || "");
    setIsActive(w.is_active !== false);
    setDepartmentId(w.department_id || "");
    setProjectId(w.project_id || "");
    setSegmentId(w.segment_id || "");
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCode("");
    setLocation("");
    setDescription("");
    setIsActive(true);
    setDepartmentId("");
    setProjectId("");
    setSegmentId("");
    setSubmitError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!canCreateOrEdit) {
      setSubmitError("You do not have permission to create or update warehouses.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    const payload = {
      name,
      code: code || null,
      location: location || null,
      description: description || null,
      is_active: isActive,
      department_id: departmentId || null,
      project_id: projectId || null,
      segment_id: segmentId || null,
    };

    try {
      if (editingId) {
        await api.put(`/inventory/companies/${companyId}/warehouses/${editingId}`, payload);
      } else {
        await api.post(`/inventory/companies/${companyId}/warehouses`, payload);
      }
      resetForm();
      mutate();
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || (editingId ? "Failed to update warehouse" : "Failed to create warehouse")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    if (!canDeleteWarehouses) return;
    if (!confirm("Delete this warehouse? This will deactivate it.")) return;
    try {
      await api.delete(`/inventory/companies/${companyId}/warehouses/${id}`);
      mutate();
    } catch (err) { }
  };

  const filteredWarehouses = useMemo(() => {
    const all = (warehouses || []) as Warehouse[];
    const term = search.trim().toLowerCase();
    return all.filter((w) => {
      if (!showInactive && w.is_active === false) return false;
      if (!term) return true;
      const idVal = String(w.id || '').toLowerCase();
      const nameVal = (w.name || "").toString().toLowerCase();
      const codeVal = (w.code || "").toString().toLowerCase();
      const locationVal = (w.location || "").toString().toLowerCase();
      return (
        idVal.includes(term) ||
        nameVal.includes(term) ||
        codeVal.includes(term) ||
        locationVal.includes(term)
      );
    });
  }, [warehouses, search, showInactive]);

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12.25c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125H3M15.75 3h3.75c.621 0 1.125.504 1.125 1.125v13.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Warehouses</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage inventory locations and branches.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
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
              placeholder="Search by name, code or location..."
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

          {!warehouses ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : filteredWarehouses.length === 0 ? (
            <div className="text-sm text-slate-500">No warehouses yet. Use the form below to create one.</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Code</th>
                  <th className="text-left py-2">Location</th>
                  <th className="text-left py-2">Branch (Dept)</th>
                  <th className="text-left py-2">Active</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredWarehouses.map((w) => (
                  <tr key={w.id} className="border-b last:border-none">
                    <td className="py-2">{w.id} - {w.name}</td>
                    <td className="py-2 text-xs text-slate-500">{w.code}</td>
                    <td className="py-2 text-xs text-slate-500">{w.location}</td>
                    <td className="py-2 text-xs text-slate-500">
                      {departments?.find(d => d.id === w.department_id)?.name || "-"}
                    </td>
                    <td className="py-2 text-xs text-slate-500">{w.is_active ? "Yes" : "No"}</td>
                    <td className="py-2 text-xs space-x-2">
                      {canCreateOrEdit && (
                        <button
                          type="button"
                          onClick={() => startEdit(w)}
                          className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                        >
                          Edit
                        </button>
                      )}
                      {canDeleteWarehouses && (
                        <button
                          type="button"
                          onClick={() => handleDelete(w.id)}
                          className="px-2 py-1 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
                        >
                          Delete
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 h-min">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">{editingId ? "Edit Warehouse" : "Create Warehouse"}</h2>
        {warehousesAccessLevel === "read" && (
          <p className="text-[11px] text-slate-500 mb-3">
            You have read-only access for warehouses. Creating or editing is disabled.
          </p>
        )}
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
            <div>
              <label className="block mb-1">Location</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block mb-1">Branch (Department)</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">None</option>
                {departments?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Project</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">None</option>
                {projects?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Segment</label>
              <select
                className="w-full border rounded px-3 py-2"
                value={segmentId}
                onChange={(e) => setSegmentId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">None</option>
                {segments?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
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
          <div className="flex items-center gap-2">
            <input
              id="warehouse-active"
              type="checkbox"
              className="h-4 w-4"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="warehouse-active" className="text-xs">
              Active
            </label>
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting || !canCreateOrEdit}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : editingId ? "Update Warehouse" : "Save Warehouse"}
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
