"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import * as salesPersonsApi from "@/lib/sales-persons";
import type { SalesPersonRead } from "@/lib/sales-persons";
import { useMenuAccess } from "@/components/MenuPermissionsContext";

const extractErrorMessage = (detail: any, fallback: string): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? (d as any).msg : JSON.stringify(d)))
      .filter(Boolean);
    if (msgs.length > 0) return msgs.join(", ");
  }
  return fallback;
};

const emptyForm = () => ({
  name: "",
  phone: "",
  email: "",
  commission_rate: "",
  notes: "",
  is_active: true,
});

export default function SalesPersonsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const { canRead, canUpdate, canDelete } = useMenuAccess("accounting.masters.sales-persons");

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const {
    data: persons,
    mutate,
    isLoading,
  } = useSWR<SalesPersonRead[]>(
    companyId ? ["sales-persons", companyId, activeOnly, search] : null,
    ([, cid, ia, q]: [string, string, boolean, string]) =>
      salesPersonsApi.list(cid, { isActive: ia ? true : undefined, search: q || undefined })
  );

  const [editing, setEditing] = useState<SalesPersonRead | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  const resetForm = () => {
    setEditing(null);
    setForm(emptyForm());
    setFormError(null);
  };

  const startCreate = () => {
    if (!canUpdate) return;
    resetForm();
  };

  const startEdit = (sp: SalesPersonRead) => {
    if (!canUpdate) return;
    setEditing(sp);
    setForm({
      name: sp.name,
      phone: sp.phone ?? "",
      email: sp.email ?? "",
      commission_rate: sp.commission_rate != null ? String(sp.commission_rate) : "",
      notes: sp.notes ?? "",
      is_active: sp.is_active,
    });
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;
    if (!form.name.trim()) { setFormError("Name is required."); return; }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        commission_rate: form.commission_rate !== "" ? Number(form.commission_rate) : null,
        notes: form.notes.trim() || null,
        is_active: form.is_active,
      };
      if (editing) {
        await salesPersonsApi.update(companyId, editing.id, payload);
      } else {
        await salesPersonsApi.create(companyId, payload);
      }
      await mutate();
      resetForm();
    } catch (err: any) {
      setFormError(extractErrorMessage(err?.response?.data?.detail, "Failed to save."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (sp: SalesPersonRead) => {
    if (!companyId || !canDelete) return;
    if (!window.confirm(`Deactivate "${sp.name}"?`)) return;
    setListError(null);
    try {
      await salesPersonsApi.deactivate(companyId, sp.id);
      await mutate();
    } catch (err: any) {
      setListError(extractErrorMessage(err?.response?.data?.detail, "Failed to deactivate."));
    }
  };

  const list = persons ?? [];

  return (
    <div className="space-y-6 text-sm">
      {/* Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Persons</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage sales representatives. They may or may not be employees of the company.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && canUpdate && (
              <button
                type="button"
                onClick={() => setIsEditing(true)}
                className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
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
                onClick={() => { setIsEditing(false); resetForm(); }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => (window.opener ? window.close() : router.back())}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shadow-sm transition-all flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      {canRead && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* List */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 h-min">
            <div className="flex flex-wrap items-center gap-3 mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 w-full md:w-auto">Sales Persons</h2>
              <input
                type="text"
                placeholder="Search by name, phone or email…"
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs flex-1 min-w-[180px] focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-slate-300"
                  checked={activeOnly}
                  onChange={(e) => setActiveOnly(e.target.checked)}
                />
                Active only
              </label>
              {canUpdate && (
                <button
                  type="button"
                  disabled={!isEditing}
                  onClick={startCreate}
                  className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm disabled:opacity-50 whitespace-nowrap"
                >
                  + New
                </button>
              )}
            </div>

            {listError && <div className="mb-2 text-xs text-red-600">{listError}</div>}

            {isLoading ? (
              <div className="text-xs text-slate-500">Loading…</div>
            ) : list.length === 0 ? (
              <div className="text-xs text-slate-500">
                {activeOnly ? "No active sales persons yet." : "No sales persons defined yet."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b text-slate-500">
                      <th className="text-left py-1.5 px-1 font-medium">Name</th>
                      <th className="text-left py-1.5 px-1 font-medium">Phone</th>
                      <th className="text-left py-1.5 px-1 font-medium">Email</th>
                      <th className="text-left py-1.5 px-1 font-medium">Commission %</th>
                      <th className="text-left py-1.5 px-1 font-medium">Status</th>
                      <th className="text-left py-1.5 px-1 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((sp) => (
                      <tr key={sp.id} className="border-b last:border-none hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                        <td className="py-1.5 px-1 font-medium text-slate-800 dark:text-slate-100">{sp.name}</td>
                        <td className="py-1.5 px-1 text-slate-500">{sp.phone ?? "—"}</td>
                        <td className="py-1.5 px-1 text-slate-500">{sp.email ?? "—"}</td>
                        <td className="py-1.5 px-1 text-slate-500">
                          {sp.commission_rate != null ? `${sp.commission_rate}%` : "—"}
                        </td>
                        <td className="py-1.5 px-1">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${sp.is_active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                            {sp.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td className="py-1.5 px-1 space-x-1.5">
                          {canUpdate && (
                            <button
                              type="button"
                              disabled={!isEditing}
                              onClick={() => startEdit(sp)}
                              className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50 text-[11px]"
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              disabled={!isEditing || !sp.is_active}
                              onClick={() => handleDeactivate(sp)}
                              className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50 text-[11px]"
                            >
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Form */}
          {canUpdate && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 h-min">
              <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-3">
                {editing ? "Edit Sales Person" : "New Sales Person"}
              </h2>
              {formError && (
                <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{formError}</div>
              )}
              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                <fieldset disabled={!isEditing || saving} className="space-y-3">
                  <div>
                    <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">Phone</label>
                      <input
                        type="tel"
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none"
                        value={form.phone}
                        onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">Email</label>
                      <input
                        type="email"
                        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none"
                        value={form.email}
                        onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">
                      Commission Rate (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none"
                      value={form.commission_rate}
                      onChange={(e) => setForm((f) => ({ ...f, commission_rate: e.target.value }))}
                      placeholder="e.g. 2.5"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 font-medium text-slate-700 dark:text-slate-300">Notes</label>
                    <textarea
                      rows={3}
                      className="w-full border border-slate-300 rounded-lg px-2 py-1.5 focus:ring-1 focus:ring-emerald-500 outline-none resize-none"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                      placeholder="Any additional information…"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="sp-active"
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600"
                      checked={form.is_active}
                      onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
                    />
                    <label htmlFor="sp-active" className="font-medium text-slate-700 dark:text-slate-300">Active</label>
                  </div>
                </fieldset>
                <div className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="submit"
                    disabled={saving || !isEditing}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-all"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  {editing && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold shadow-sm transition-all"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {!canRead && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-700">
          You do not have permission to view sales persons.
        </div>
      )}
    </div>
  );
}
