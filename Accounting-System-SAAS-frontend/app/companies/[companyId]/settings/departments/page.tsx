"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, DepartmentRead } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const extractErrorMessage = (detail: any, fallback: string): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) =>
        d && typeof d === "object" && "msg" in d ? (d as any).msg : JSON.stringify(d)
      )
      .filter(Boolean);
    if (msgs.length > 0) return msgs.join(", ");
  }
  if (detail && typeof detail === "object") {
    try {
      return JSON.stringify(detail);
    } catch {
      // ignore
    }
  }
  return fallback;
};

export default function CompanyDepartmentsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const {
    data: departments,
    error,
    isLoading,
    mutate,
  } = useSWR<DepartmentRead[]>(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const [editing, setEditing] = useState<DepartmentRead | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const startCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setActive(true);
    setFormError(null);
  };

  const startEdit = (dept: DepartmentRead) => {
    setEditing(dept);
    setName(dept.name);
    setCode(dept.code || "");
    setActive(dept.is_active);
    setFormError(null);
  };

  const resetForm = () => {
    setEditing(null);
    setName("");
    setCode("");
    setActive(true);
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim() || null,
        is_active: active,
      };

      if (editing) {
        await api.put(
          `/companies/${companyId}/departments/${editing.id}`,
          payload
        );
      } else {
        await api.post(`/companies/${companyId}/departments`, payload);
      }

      await mutate();
      resetForm();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setFormError(extractErrorMessage(detail, "Failed to save department."));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (dept: DepartmentRead) => {
    if (!companyId) return;
    if (!window.confirm(`Delete department "${dept.name}"? This cannot be undone.`)) return;

    setListError(null);
    try {
      await api.delete(`/companies/${companyId}/departments/${dept.id}`);
      await mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setListError(extractErrorMessage(detail, "Failed to delete department."));
    }
  };

  const handleToggleActive = async (dept: DepartmentRead) => {
    if (!companyId) return;

    setListError(null);
    try {
      await api.put(`/companies/${companyId}/departments/${dept.id}`, {
        is_active: !dept.is_active,
      });
      await mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setListError(extractErrorMessage(detail, "Failed to update status."));
    }
  };

  const list = departments || [];

  const handleBack = () => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/settings/cost-centers`);
  };

  const handleClose = () => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/settings/cost-centers`);
  };

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h16.5m-16.5 0v11.25c0 1.242 1.008 2.25 2.25 2.25h14.25c1.242 0 2.25-1.008 2.25-2.25V3M3.75 3h16.5m-16.5 0H3.75m16.5 0H20.25M20.25 16.5H12" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Departments</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage departments for this company. Active departments can be used as cost centers.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Modify
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  resetForm();
                  setListError(null);
                }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shadow-sm transition-all duration-150 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded mb-4">
          {extractErrorMessage(
            (error as any)?.response?.data?.detail,
            "Failed to load departments."
          )}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Departments List</h2>
            <button
              type="button"
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              onClick={startCreate}
              disabled={!isEditing}
            >
              New Department
            </button>
          </div>
          {listError && <div className="mb-2 text-xs text-red-600">{listError}</div>}
          {isLoading ? (
            <div className="text-xs text-slate-500">Loading departments...</div>
          ) : list.length === 0 ? (
            <div className="text-xs text-slate-500">No departments defined yet.</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-1.5 px-1">Name</th>
                  <th className="text-left py-1.5 px-1">Code</th>
                  <th className="text-left py-1.5 px-1">Status</th>
                  <th className="text-left py-1.5 px-1">Actions</th>
                </tr>
              </thead>
              <tbody>
                {list.map((dept) => (
                  <tr key={dept.id} className="border-b last:border-none">
                    <td className="py-1.5 px-1">{dept.name}</td>
                    <td className="py-1.5 px-1 text-slate-600">{dept.code || "-"}</td>
                    <td className="py-1.5 px-1 text-slate-600">
                      {dept.is_active ? "Active" : "Inactive"}
                    </td>
                    <td className="py-1.5 px-1 space-x-2">
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => startEdit(dept)}
                        disabled={!isEditing}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                        onClick={() => handleToggleActive(dept)}
                        disabled={!isEditing}
                      >
                        {dept.is_active ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                        onClick={() => handleDelete(dept)}
                        disabled={!isEditing}
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 h-min">
        <h2 className="text-sm font-medium mb-3">
          {editing ? "Edit Department" : "New Department"}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3 text-xs">
          <fieldset disabled={!isEditing} className="space-y-3">
            <div>
              <label className="block mb-1">Name</label>
              <input
                className="w-full border rounded px-2 py-1.5 bg-white disabled:bg-slate-50"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block mb-1">Code (optional)</label>
              <input
                className="w-full border rounded px-2 py-1.5 bg-white disabled:bg-slate-50"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                id="dept-active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
              />
              <label htmlFor="dept-active">Active</label>
            </div>
          </fieldset>
          <div className="flex gap-2 pt-2 mt-2">
            <button
              type="submit"
              disabled={saving || !isEditing}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save"}
            </button>
            {editing && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition-all duration-150"
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
