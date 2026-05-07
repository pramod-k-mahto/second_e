"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type InventoryValuationMethod = "AVERAGE" | "FIFO";

type Company = {
  id: number;
  name: string;
  inventory_valuation_method?: InventoryValuationMethod;
};

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

export default function CompanyInventoryValuationSettingsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const {
    data: company,
    error: companyError,
    isLoading,
    mutate,
  } = useSWR<Company>(companyId ? `/companies/${companyId}` : null, fetcher);

  const [method, setMethod] = useState<InventoryValuationMethod | "loading">("loading");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const effectiveMethod: InventoryValuationMethod =
    method === "loading" ? company?.inventory_valuation_method ?? "AVERAGE" : method;

  const handleInitState = () => {
    if (!company) return;
    if (method === "loading") {
      setMethod(company.inventory_valuation_method ?? "AVERAGE");
    }
  };

  if (company && method === "loading") {
    handleInitState();
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !company) return;

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await api.put(`/companies/${companyId}`, {
        inventory_valuation_method: effectiveMethod,
      });
      await mutate();
      setSuccessMessage("Inventory valuation method updated successfully.");
      setIsEditing(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(
        extractErrorMessage(detail, "Failed to update inventory valuation method.")
      );
    } finally {
      setSaving(false);
    }
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Inventory Valuation</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Choose how closing stock value is calculated for this company.
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
                  if (company) {
                    setMethod(company.inventory_valuation_method ?? "AVERAGE");
                  }
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shadow-sm transition-all duration-150 flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
        {company && (
          <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-800/20 text-xs font-medium text-indigo-800 dark:text-indigo-300">
            Company: {company.name}
          </div>
        )}
      </div>

      {companyError && (
        <div className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded mb-4">
          {extractErrorMessage(
            (companyError as any)?.response?.data?.detail,
            "Failed to load company information."
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="text-xs text-red-600 mb-2">{errorMessage}</div>
          )}
          {successMessage && (
            <div className="text-xs text-green-600 mb-2">{successMessage}</div>
          )}

          <fieldset className="space-y-2" disabled={isLoading || saving || !isEditing}>
            <legend className="text-sm font-medium mb-1">Valuation method</legend>

            <p className="text-[11px] text-slate-500 mb-1">
              Recommended: AVERAGE. FIFO may not be available on all servers yet.
            </p>

            <label className="block mb-1 text-xs text-slate-600">Method</label>
            <select
              className="border rounded px-3 py-2 text-xs min-w-[240px]"
              value={effectiveMethod}
              onChange={(e) => setMethod(e.target.value as InventoryValuationMethod)}
            >
              <option value="AVERAGE">AVERAGE (default / recommended)</option>
              <option value="FIFO">FIFO</option>
            </select>
          </fieldset>

          <div className="pt-2 flex gap-2 mt-4">
            <button
              type="submit"
              disabled={saving || isLoading || !isEditing}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
