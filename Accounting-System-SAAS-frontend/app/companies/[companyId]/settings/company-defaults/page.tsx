"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getItemLedgerDefaults, saveItemLedgerDefaults, type ItemLedgerDefaults } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type Company = {
  id: number;
  name: string;
};

type Ledger = {
  id: number;
  name: string;
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

export default function CompanyDefaultsSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const {
    data: company,
    error: companyError,
    isLoading: companyLoading,
    mutate: mutateCompany,
  } = useSWR<Company>(companyId ? `/companies/${companyId}` : null, fetcher);

  const {
    data: defaults,
    error: defaultsError,
    isLoading: defaultsLoading,
    mutate: mutateDefaults,
  } = useSWR<ItemLedgerDefaults>(
    companyId ? `company:${companyId}:item-ledger-defaults` : null,
    () => getItemLedgerDefaults(companyId)
  );

  const { data: ledgers } = useSWR<Ledger[]>(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const [salesLedgerId, setSalesLedgerId] = useState<string>("");
  const [outputTaxLedgerId, setOutputTaxLedgerId] = useState<string>("");
  const [purchaseLedgerId, setPurchaseLedgerId] = useState<string>("");
  const [inputTaxLedgerId, setInputTaxLedgerId] = useState<string>("");

  const [saving, setSaving] = useState(false);
  const [seedLoading, setSeedLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const ready = Boolean(companyId);

  const init = () => {
    if (!defaults) return;
    if (salesLedgerId === "") setSalesLedgerId(defaults.sales_ledger_id ? String(defaults.sales_ledger_id) : "");
    if (outputTaxLedgerId === "") setOutputTaxLedgerId(defaults.output_tax_ledger_id ? String(defaults.output_tax_ledger_id) : "");
    if (purchaseLedgerId === "") setPurchaseLedgerId(defaults.purchase_ledger_id ? String(defaults.purchase_ledger_id) : "");
    if (inputTaxLedgerId === "") setInputTaxLedgerId(defaults.input_tax_ledger_id ? String(defaults.input_tax_ledger_id) : "");
  };

  if (defaults && (salesLedgerId === "" && outputTaxLedgerId === "" && purchaseLedgerId === "" && inputTaxLedgerId === "")) {
    init();
  }

  const ledgerOptions = useMemo(() => {
    const list = Array.isArray(ledgers) ? ledgers : [];
    return list
      .slice()
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [ledgers]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!ready) return;

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const payload: Partial<ItemLedgerDefaults> = {
        sales_ledger_id: salesLedgerId ? Number(salesLedgerId) : null,
        purchase_ledger_id: purchaseLedgerId ? Number(purchaseLedgerId) : null,
        output_tax_ledger_id: outputTaxLedgerId ? Number(outputTaxLedgerId) : null,
        input_tax_ledger_id: inputTaxLedgerId ? Number(inputTaxLedgerId) : null,
      };

      await saveItemLedgerDefaults(companyId, payload);
      await mutateDefaults();
      setSuccessMessage("Company defaults updated successfully.");
      setIsEditing(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(extractErrorMessage(detail, "Failed to update company defaults."));
    } finally {
      setSaving(false);
    }
  };

  const handleSeed = async () => {
    if (!companyId) return;
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Setup chart of accounts?\n\nThis will create a standard set of ledgers for this company and auto-fill the company defaults. It will not delete existing data."
      );
      if (!ok) return;
    }

    setSeedLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await api.post(`/companies/${companyId}/seed/default-chart`);
      await mutateCompany();
      await mutateDefaults();
      setSalesLedgerId("");
      setOutputTaxLedgerId("");
      setPurchaseLedgerId("");
      setInputTaxLedgerId("");
      setSuccessMessage("Chart of accounts seeded successfully.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(extractErrorMessage(detail, "Failed to seed default chart."));
    } finally {
      setSeedLoading(false);
    }
  };

  const handleClose = () => {
    router.push("/dashboard");
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Company Defaults</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Set default ledgers used by item creation and auto-accounting.
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
                  if (defaults) {
                    setSalesLedgerId(defaults.sales_ledger_id ? String(defaults.sales_ledger_id) : "");
                    setOutputTaxLedgerId(defaults.output_tax_ledger_id ? String(defaults.output_tax_ledger_id) : "");
                    setPurchaseLedgerId(defaults.purchase_ledger_id ? String(defaults.purchase_ledger_id) : "");
                    setInputTaxLedgerId(defaults.input_tax_ledger_id ? String(defaults.input_tax_ledger_id) : "");
                  }
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={(e) => handleSubmit(e as any)}
                disabled={saving || companyLoading || defaultsLoading || seedLoading}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-2"
              >
                {saving ? (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
                Save Defaults
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

      {companyError && (
        <div className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded mb-4">
          {extractErrorMessage(
            (companyError as any)?.response?.data?.detail,
            "Failed to load company information."
          )}
        </div>
      )}

      {defaultsError && (
        <div className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded mb-4">
          {extractErrorMessage(
            (defaultsError as any)?.response?.data?.detail,
            "Failed to load company defaults."
          )}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMessage && <div className="text-xs text-red-600 mb-2">{errorMessage}</div>}
          {successMessage && (
            <div className="text-xs text-green-600 mb-2">{successMessage}</div>
          )}

          <fieldset
            className="space-y-3"
            disabled={companyLoading || defaultsLoading || saving || seedLoading || !isEditing}
          >
            <div>
              <label className="block mb-1">Default Sales Ledger</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={salesLedgerId}
                onChange={(e) => setSalesLedgerId(e.target.value)}
              >
                <option value="">None</option>
                {ledgerOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Default Output Tax Ledger</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={outputTaxLedgerId}
                onChange={(e) => setOutputTaxLedgerId(e.target.value)}
              >
                <option value="">None</option>
                {ledgerOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Default Purchase Ledger</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={purchaseLedgerId}
                onChange={(e) => setPurchaseLedgerId(e.target.value)}
              >
                <option value="">None</option>
                {ledgerOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block mb-1">Default Input Tax Ledger</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={inputTaxLedgerId}
                onChange={(e) => setInputTaxLedgerId(e.target.value)}
              >
                <option value="">None</option>
                {ledgerOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          </fieldset>

          <div className="pt-2 flex flex-wrap gap-2 mt-4">
            <button
              type="submit"
              disabled={saving || companyLoading || defaultsLoading || seedLoading || !isEditing}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {saving ? "Saving..." : "Save Defaults"}
            </button>

            <button
              type="button"
              onClick={handleSeed}
              disabled={saving || seedLoading || companyLoading || !isEditing}
              className="px-4 py-2 rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-60 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              {seedLoading ? "Setting up..." : "Setup chart of accounts"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
