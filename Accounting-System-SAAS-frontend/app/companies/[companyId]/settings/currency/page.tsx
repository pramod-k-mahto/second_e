"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type LocaleCode = "en-US" | "en-IN" | "ne-NP";
type CurrencyCode = "USD" | "NPR" | "INR";
type NumberFormat = "1,234,567.89" | "12,34,567.89";

export default function CompanyCurrencySettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const STORAGE_KEY = companyId ? `country_settings_${companyId}` : null;

  const [locale, setLocale] = useState<LocaleCode>("en-US");
  const [currency, setCurrency] = useState<CurrencyCode>("USD");
  const [numberFormat, setNumberFormat] = useState<NumberFormat>("1,234,567.89");
  const [currencySymbolOnLeft, setCurrencySymbolOnLeft] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Load persisted settings from localStorage on mount
  useEffect(() => {
    if (!STORAGE_KEY) return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (saved.locale) setLocale(saved.locale);
        if (saved.currency) setCurrency(saved.currency);
        if (saved.numberFormat) setNumberFormat(saved.numberFormat);
        if (saved.currencySymbolOnLeft !== undefined) setCurrencySymbolOnLeft(saved.currencySymbolOnLeft);
      }
    } catch { }
  }, [STORAGE_KEY]);

  const handleApply = () => {
    if (!STORAGE_KEY) return;
    setSaving(true);
    setSuccessMessage(null);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ locale, currency, numberFormat, currencySymbolOnLeft }));
      setSuccessMessage("Country settings applied successfully.");
      setIsEditing(false);
    } catch {
      setSuccessMessage(null);
    } finally {
      setSaving(false);
    }
  };

  const preview = useMemo(() => {
    const amount = 1234567.89;
    const formatted = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);

    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).formatToParts(amount);

    const symbol = parts.find((p) => p.type === "currency")?.value ?? "";
    const numberOnly = parts
      .filter((p) => p.type !== "currency" && p.type !== "literal")
      .map((p) => p.value)
      .join("");

    const manual = currencySymbolOnLeft ? `${symbol}${numberOnly}` : `${numberOnly}${symbol}`;
    const groupExample =
      numberFormat === "12,34,567.89" ? "12,34,567.89" : "1,234,567.89";

    return { formatted, manual, groupExample };
  }, [currency, currencySymbolOnLeft, locale, numberFormat]);

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Country Settings</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure currency and formatting preferences.
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
                  // Re-load from local storage to revert
                  try {
                    const raw = localStorage.getItem(STORAGE_KEY!);
                    if (raw) {
                      const saved = JSON.parse(raw);
                      if (saved.locale) setLocale(saved.locale);
                      if (saved.currency) setCurrency(saved.currency);
                      if (saved.numberFormat) setNumberFormat(saved.numberFormat);
                      if (saved.currencySymbolOnLeft !== undefined) setCurrencySymbolOnLeft(saved.currencySymbolOnLeft);
                    }
                  } catch {}
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
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <fieldset disabled={!isEditing || saving} className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Country/locale</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={locale}
                onChange={(e) => setLocale(e.target.value as LocaleCode)}
              >
                <option value="en-US">United States</option>
                <option value="ne-NP">Nepal</option>
                <option value="en-IN">India</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Currency</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as CurrencyCode)}
              >
                <option value="USD">USD</option>
                <option value="NPR">NPR</option>
                <option value="INR">INR</option>
              </select>
            </label>
          </div>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Number grouping</div>
            <select
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={numberFormat}
              onChange={(e) => setNumberFormat(e.target.value as NumberFormat)}
            >
              <option value="1,234,567.89">International (1,234,567.89)</option>
              <option value="12,34,567.89">Indian (12,34,567.89)</option>
            </select>
          </label>

          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={currencySymbolOnLeft}
              onChange={(e) => setCurrencySymbolOnLeft(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-800">Currency symbol on left</span>
          </label>

          {successMessage && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
              {successMessage}
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleApply}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              {saving ? "Applying..." : "Apply Settings"}
            </button>
          </div>
        </fieldset>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-700 mb-3">Preview</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Locale</span>
              <span className="text-sm font-medium text-slate-900">{locale}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Currency</span>
              <span className="text-sm font-medium text-slate-900">{currency}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Formatted amount</span>
              <span className="text-sm font-medium text-slate-900">{preview.formatted}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Symbol placement</span>
              <span className="text-sm font-medium text-slate-900">{preview.manual}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 text-xs text-slate-700">
              Grouping example: {preview.groupExample}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
