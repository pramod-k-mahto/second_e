"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { api } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function CategoriesPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;

  const { data: categories, mutate } = useSWR(
    companyId ? `/companies/${companyId}/categories?is_active=true` : null,
    fetcher
  );

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name || "");
    setCode(c.code || "");
    setDescription(c.description || "");
    setIsActive(c.is_active !== false);
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
        await api.put(`/companies/${companyId}/categories/${editingId}`, payload);
      } else {
        await api.post(`/companies/${companyId}/categories`, payload);
      }
      
      const returnTo = searchParams.get('returnTo');
      if (returnTo && !editingId) {
        const separator = returnTo.includes('?') ? '&' : '?';
        router.push(`${returnTo}${separator}returning=true&newName=${encodeURIComponent(name)}&type=CATEGORY`);
        return;
      }

      resetForm();
      mutate();
    } catch (err: any) {
      setSubmitError(
        err?.response?.data?.detail || (editingId ? "Failed to update category" : "Failed to create category")
      );
    } finally {
      setSubmitting(false);
    }
  };

  const filteredCategories = useMemo(() => {
    const all = (categories || []) as any[];
    const term = search.trim().toLowerCase();
    return all.filter((c) => {
      if (!showInactive && c.is_active === false) return false;
      if (!term) return true;
      const name = (c.name || "").toString().toLowerCase();
      const codeVal = (c.code || "").toString().toLowerCase();
      return name.includes(term) || codeVal.includes(term);
    });
  }, [categories, search, showInactive]);

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    if (!confirm("Delete this category? This will deactivate it.")) return;
    try {
      await api.delete(`/companies/${companyId}/categories/${id}`);
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Categories</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Organize items by groups and categories.
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

          {!categories ? (
            <div className="text-sm text-slate-500">Loading...</div>
          ) : filteredCategories.length === 0 ? (
            <div className="text-sm text-slate-500">No categories yet.</div>
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
                {filteredCategories.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-none">
                    <td className="py-2">{c.name}</td>
                    <td className="py-2 text-xs text-slate-500">{c.code}</td>
                    <td className="py-2 text-xs text-slate-500">{c.description}</td>
                    <td className="py-2 text-xs text-slate-500">{c.is_active ? "Yes" : "No"}</td>
                    <td className="py-2 text-xs space-x-2">
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        className="px-2 py-1 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50"
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
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{editingId ? "Edit Category" : "Create Category"}</h2>
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
                id="category-active"
                type="checkbox"
                className="h-4 w-4"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="category-active" className="text-xs">
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
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : editingId ? "Update Category" : "Save Category"}
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
