"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";
import type { PaymentModeRead } from "@/lib/payment-modes";
import * as paymentModesApi from "@/lib/payment-modes";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
type Company = {
  id: number;
  name: string;
};
type LedgerGroup = {
  id: number;
  name: string;
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const extractErrorMessage = (detail: any, fallback: string): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? (d as any).msg : JSON.stringify(d)))
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

export default function CompanyPaymentModesPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const { canRead, canUpdate, canDelete } = useMenuAccess(
    "accounting.masters.payment-modes"
  );

  const {
    data: companies,
    error: companiesError,
    isLoading: companiesLoading,
  } = useSWR<Company[]>("/companies", fetcher);

  const companyNumericId = companyId ? Number(companyId) : null;
  const hasCompanyAccess =
    companyNumericId && companies
      ? companies.some((c) => c.id === companyNumericId)
      : false;

  const [search, setSearch] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  const {
    data: modes,
    error: modesError,
    mutate: mutateModes,
    isLoading: modesLoading,
  } = useSWR<PaymentModeRead[]>(
    companyId && companies
      ? hasCompanyAccess
        ? ["payment-modes", companyId, activeOnly, search]
        : null
      : null,
    async ([, cid, isActive, q]: [string, string, boolean, string]) => {
      return paymentModesApi.list(cid, {
        isActive: isActive ? true : undefined,
        search: q || undefined,
      });
    }
  );

  const { data: groups, error: groupsError } = useSWR<LedgerGroup[]>(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  const [editing, setEditing] = useState<PaymentModeRead | null>(null);
  const [name, setName] = useState("");
  const [ledgerGroupId, setLedgerGroupId] = useState<string>("");
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [isUpdatingChart, setIsUpdatingChart] = useState(false);
  const [updateChartMessage, setUpdateChartMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const startCreate = () => {
    if (!canUpdate) return;
    setEditing(null);
    setName("");
    setLedgerGroupId("");
    setActive(true);
    setFormError(null);
  };

  const startEdit = (pm: PaymentModeRead) => {
    if (!canUpdate) return;
    setEditing(pm);
    setName(pm.name);
    setLedgerGroupId(String(pm.ledger_group_id));
    setActive(pm.is_active);
    setFormError(null);
  };

  const resetForm = () => {
    setEditing(null);
    setName("");
    setLedgerGroupId("");
    setActive(true);
    setFormError(null);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;

    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!ledgerGroupId) {
      setFormError("Please select a group.");
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: name.trim(),
        ledger_group_id: Number(ledgerGroupId),
        is_active: active,
      };

      if (editing) {
        await paymentModesApi.update(companyId, editing.id, payload);
      } else {
        await paymentModesApi.create(companyId, payload);
      }

      await mutateModes();
      resetForm();
      setIsEditing(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setFormError(extractErrorMessage(detail, "Failed to save payment mode."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (pm: PaymentModeRead) => {
    if (!companyId) return;
    if (!window.confirm(`Deactivate payment mode "${pm.name}"?`)) return;
    setListError(null);
    try {
      await paymentModesApi.deactivate(companyId, pm.id);
      await mutateModes();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setListError(extractErrorMessage(detail, "Failed to deactivate payment mode."));
    }
  };

  const modesList = modes || [];

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Payment Modes</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure cash, bank, and wallet modes used in vouchers, sales, and purchases.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && canUpdate && (
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
                }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}

            <button
              type="button"
              onClick={async () => {
                if (!companyId) return;
                setIsUpdatingChart(true);
                setUpdateChartMessage(null);
                try {
                  const res = await api.post(
                    `/companies/${companyId}/seed/default-chart`
                  );
                  const data = res?.data || {};
                  const detail = data.detail || "Updated default chart.";
                  const ledgers = data.ledgers_created;
                  const modes = data.payment_modes_created;
                  const parts: string[] = [detail];
                  if (typeof ledgers === "number") {
                    parts.push(`Ledgers created: ${ledgers}`);
                  }
                  if (typeof modes === "number") {
                    parts.push(`Payment modes created: ${modes}`);
                  }
                  setUpdateChartMessage(parts.join(" "));
                } catch (err: any) {
                  const detail = err?.response?.data?.detail;
                  setUpdateChartMessage(
                    extractErrorMessage(detail, "Failed to update default chart")
                  );
                } finally {
                  setIsUpdatingChart(false);
                }
              }}
              disabled={isUpdatingChart || !isEditing}
              className="px-3 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              {isUpdatingChart ? "Updating..." : "Update default chart"}
            </button>

            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.opener) {
                  window.close();
                } else {
                  router.back();
                }
              }}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shadow-sm transition-all duration-150 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
        {updateChartMessage && (
          <div className="px-4 py-2 bg-indigo-50 border-t border-indigo-100 text-xs font-medium text-indigo-800">
            {updateChartMessage}
          </div>
        )}
      </div>

      {companiesError && (
        <div className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded mb-4">
          {extractErrorMessage(
            companiesError?.response?.data?.detail,
            "Failed to load companies for access check"
          )}
        </div>
      )}

      {companies && !hasCompanyAccess && (
        <div className="rounded-xl border border-red-200 bg-red-50 shadow-sm p-4 text-xs font-medium text-red-700 mb-4">
          You do not have access to payment modes for this company.
        </div>
      )}

      {(!companies || hasCompanyAccess) && canRead && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 h-min">
            <div className="flex items-center justify-between mb-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex flex-wrap items-center gap-3 w-full">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 w-full md:w-auto">Payment Modes List</h2>
                <input
                  type="text"
                  placeholder="Search by name or group..."
                  className="border border-slate-200 rounded-lg px-3 py-1.5 text-xs flex-1 w-full md:w-auto min-w-[180px] focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 text-indigo-600 focus:ring-indigo-500 rounded border-slate-300"
                    checked={activeOnly}
                    onChange={(e) => setActiveOnly(e.target.checked)}
                  />
                  <span>Active only</span>
                </label>
              </div>
              {canUpdate && (
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed whitespace-nowrap ml-3"
                  onClick={startCreate}
                  disabled={!canUpdate || !isEditing}
                >
                  New Payment Mode
                </button>
              )}
            </div>
            <div className="mb-2 text-xs text-red-600">{listError}</div>
            {modesLoading ? (
              <div className="text-xs text-slate-500">Loading payment modes...</div>
            ) : modesList.length === 0 ? (
              <div className="text-xs text-slate-500">
                {activeOnly
                  ? "No active payment modes yet."
                  : "No payment modes defined yet."}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1.5 px-1">ID</th>
                    <th className="text-left py-1.5 px-1">Name</th>
                    <th className="text-left py-1.5 px-1">Linked Group</th>
                    <th className="text-left py-1.5 px-1">Group ID</th>
                    <th className="text-left py-1.5 px-1">Status</th>
                    <th className="text-left py-1.5 px-1">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {modesList.map((pm) => {
                      const groupName = groups?.find((g) => g.id === pm.ledger_group_id)?.name;
                      return (
                        <tr key={pm.id} className="border-b last:border-none">
                          <td className="py-1.5 px-1 text-slate-600">{pm.id}</td>
                          <td className="py-1.5 px-1">{pm.name}</td>
                          <td className="py-1.5 px-1 text-slate-600">
                            {groupName || pm.ledger_group_id}
                          </td>
                          <td className="py-1.5 px-1 text-slate-600">{pm.ledger_group_id}</td>
                        <td className="py-1.5 px-1 text-slate-600">
                          {pm.is_active ? "Active" : "Inactive"}
                        </td>
                        <td className="py-1.5 px-1 space-x-2">
                          {canUpdate && (
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-50"
                              onClick={() => startEdit(pm)}
                              disabled={!isEditing}
                            >
                              Edit
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              className="px-2 py-0.5 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-50"
                              onClick={() => handleDeactivate(pm)}
                              disabled={!isEditing}
                            >
                              Deactivate
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          {canUpdate && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 h-min">
              <h2 className="text-sm font-medium mb-3">
                {editing ? "Edit Payment Mode" : "New Payment Mode"}
              </h2>
              {formError && (
                <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 p-2 rounded">{formError}</div>
              )}
              <form onSubmit={handleSubmit} className="space-y-3 text-xs">
                <fieldset disabled={!isEditing || saving} className="space-y-3">
                  <div>
                    <label className="block mb-1">Name</label>
                    <input
                      className="w-full border rounded px-2 py-1.5"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1">Linked Group</label>
                    <select
                      className="w-full border rounded px-2 py-1.5"
                      value={ledgerGroupId}
                      onChange={(e) => setLedgerGroupId(e.target.value)}
                      required
                    >
                      <option value="">Select group</option>
                      {groupsError && (
                        <option value="" disabled>
                          Failed to load groups
                        </option>
                      )}
                      {groups &&
                        groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.id} - {g.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="pm-active"
                      type="checkbox"
                      checked={active}
                      onChange={(e) => setActive(e.target.checked)}
                    />
                    <label htmlFor="pm-active">Active</label>
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
          )}
        </div>
      )}
    </div>
  );
}
