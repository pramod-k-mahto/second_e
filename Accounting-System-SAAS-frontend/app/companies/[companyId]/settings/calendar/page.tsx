"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR, { mutate as globalMutate } from "swr";

import { api, updateCurrentCompany } from "@/lib/api";
import { usePermissions } from "@/components/PermissionsContext";
import {
  CalendarDisplayMode,
  readCalendarDisplayMode,
  writeCalendarDisplayMode,
  readDefaultCalendarDisplayMode,
  writeDefaultCalendarDisplayMode,
} from "@/lib/calendarMode";
import { safeADToBS } from "@/lib/bsad";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

// ─── Types ───────────────────────────────────────────────────────────────────

type CompanySettings = {
  company_id: number;
  calendar_mode: "AD" | "BS";
};

type CompanyInfo = {
  id: number;
  fiscal_year_start?: string | null;
  fiscal_year_end?: string | null;
};

type FiscalYearEntry = {
  id: string;
  label: string;
  start: string; // YYYY-MM-DD (AD)
  end: string;   // YYYY-MM-DD (AD)
};

// ─── localStorage helpers ─────────────────────────────────────────────────────

const FY_STORAGE_KEY = (cid: string) => `fy_directory_${cid}`;

const DEFAULT_FY_LIST: FiscalYearEntry[] = [
  { id: "bs-2079-80", label: "BS 2079–80", start: "2022-07-17", end: "2023-07-15" },
  { id: "bs-2080-81", label: "BS 2080–81", start: "2023-07-16", end: "2024-07-15" },
  { id: "bs-2081-82", label: "BS 2081–82", start: "2024-07-16", end: "2025-07-15" },
  { id: "bs-2082-83", label: "BS 2082–83", start: "2025-07-17", end: "2026-07-16" },
];

function loadFyList(companyId: string): FiscalYearEntry[] {
  if (typeof window === "undefined") return DEFAULT_FY_LIST;
  try {
    const raw = localStorage.getItem(FY_STORAGE_KEY(companyId));
    if (raw) return JSON.parse(raw) as FiscalYearEntry[];
  } catch { }
  return DEFAULT_FY_LIST;
}

function saveFyList(companyId: string, list: FiscalYearEntry[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(FY_STORAGE_KEY(companyId), JSON.stringify(list));
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CompanyCalendarSettingsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const permissions = usePermissions();
  const canUpdate = permissions.can("settings_company", "update");

  const {
    data: settings,
    error,
    isLoading,
    mutate,
  } = useSWR<CompanySettings>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );

  const { data: companyInfo, mutate: mutateCompany } = useSWR<CompanyInfo>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const [calendarMode, setCalendarMode] = useState<"AD" | "BS">("AD");
  const [calendarDisplayMode, setCalendarDisplayMode] = useState<CalendarDisplayMode>("AD");
  const [defaultDisplayMode, setDefaultDisplayMode] = useState<"AD" | "BS">("AD");
  const [fiscalYearStart, setFiscalYearStart] = useState("");
  const [fiscalYearEnd, setFiscalYearEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Fiscal year directory
  const [fyList, setFyList] = useState<FiscalYearEntry[]>([]);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newFy, setNewFy] = useState({ label: "", start: "", end: "" });
  const [addError, setAddError] = useState<string | null>(null);

  const [clientCanUpdate, setClientCanUpdate] = useState(false);
  const [clientIsLoading, setClientIsLoading] = useState(true);

  useEffect(() => {
    setClientCanUpdate(permissions.can("settings_company", "update"));
  }, [permissions]);

  useEffect(() => {
    setClientIsLoading(isLoading);
  }, [isLoading]);

  useEffect(() => {
    if (!companyId) return;
    setFyList(loadFyList(companyId));
  }, [companyId]);

  useEffect(() => {
    if (!settings) return;
    setCalendarMode(settings.calendar_mode || "AD");
  }, [settings]);

  useEffect(() => {
    if (!companyInfo) return;
    setFiscalYearStart(companyInfo.fiscal_year_start || "");
    setFiscalYearEnd(companyInfo.fiscal_year_end || "");
  }, [companyInfo]);

  useEffect(() => {
    if (!companyId) return;
    const fallback: CalendarDisplayMode = settings?.calendar_mode === "BS" ? "BS" : "AD";
    const stored = readCalendarDisplayMode(companyId, fallback);
    setCalendarDisplayMode(stored);
    const storedDefault = readDefaultCalendarDisplayMode(companyId, settings?.calendar_mode === "BS" ? "BS" : "AD");
    setDefaultDisplayMode(storedDefault);
  }, [companyId, settings?.calendar_mode]);

  // ── Save calendar settings + fiscal year manually entered ─────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;
    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await Promise.all([
        api.patch(`/companies/${companyId}/settings`, { calendar_mode: calendarMode }),
        api.patch(`/companies/${companyId}`, {
          fiscal_year_start: fiscalYearStart || null,
          fiscal_year_end: fiscalYearEnd || null,
        }),
      ]);
      writeCalendarDisplayMode(companyId, calendarDisplayMode);
      writeDefaultCalendarDisplayMode(companyId, defaultDisplayMode);
      updateCurrentCompany({
        calendar_mode: calendarMode,
        fiscal_year_start: fiscalYearStart || null,
        fiscal_year_end: fiscalYearEnd || null,
      });
      await Promise.all([
        mutate(),
        mutateCompany(),
        globalMutate((key) => typeof key === "string" && key === `/companies/${companyId}/settings`),
        globalMutate((key) => typeof key === "string" && key === `/companies/${companyId}`),
      ]);
      setSuccessMessage("Settings saved successfully.");
      setIsEditing(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(typeof detail === "string" ? detail : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  // ── Activate a fiscal year from the directory ─────────────────────────────

  const handleActivateFY = useCallback(async (fy: FiscalYearEntry) => {
    if (!companyId || !canUpdate) return;
    setActivatingId(fy.id);
    try {
      await api.patch(`/companies/${companyId}`, {
        fiscal_year_start: fy.start,
        fiscal_year_end: fy.end,
      });
      await Promise.all([
        mutateCompany(),
        globalMutate((key) => typeof key === "string" && key === `/companies/${companyId}`),
      ]);
      updateCurrentCompany({
        fiscal_year_start: fy.start,
        fiscal_year_end: fy.end,
      });
      setFiscalYearStart(fy.start);
      setFiscalYearEnd(fy.end);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      alert(typeof detail === "string" ? detail : "Failed to activate fiscal year.");
    } finally {
      setActivatingId(null);
    }
  }, [companyId, canUpdate, mutateCompany]);

  // ── Add new FY to directory ───────────────────────────────────────────────

  const handleAddFY = () => {
    setAddError(null);
    if (!newFy.label.trim()) { setAddError("Please enter a label."); return; }
    if (!newFy.start) { setAddError("Please enter a start date."); return; }
    if (!newFy.end) { setAddError("Please enter an end date."); return; }
    if (newFy.start >= newFy.end) { setAddError("Start date must be before end date."); return; }
    const entry: FiscalYearEntry = {
      id: `custom-${Date.now()}`,
      label: newFy.label.trim(),
      start: newFy.start,
      end: newFy.end,
    };
    const updated = [...fyList, entry];
    setFyList(updated);
    saveFyList(companyId, updated);
    setNewFy({ label: "", start: "", end: "" });
    setShowAddForm(false);
  };

  // ── Delete FY from directory ──────────────────────────────────────────────

  const handleDeleteFY = (id: string) => {
    const updated = fyList.filter((f) => f.id !== id);
    setFyList(updated);
    saveFyList(companyId, updated);
  };

  const isActive = (fy: FiscalYearEntry) =>
    fy.start === companyInfo?.fiscal_year_start && fy.end === companyInfo?.fiscal_year_end;

  // ─────────────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ─────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Calendar Settings</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure calendar preferences and fiscal year for this company.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isEditing && clientCanUpdate && (
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
                  if (settings) setCalendarMode(settings.calendar_mode || "AD");
                  if (companyInfo) {
                    setFiscalYearStart(companyInfo.fiscal_year_start || "");
                    setFiscalYearEnd(companyInfo.fiscal_year_end || "");
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
                disabled={saving || clientIsLoading}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-2 disabled:opacity-50"
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
                Save Settings
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
      </div>

      {error && (
        <div className="text-xs font-medium text-red-600 bg-red-50 p-2 rounded mb-4">
          {typeof (error as any)?.response?.data?.detail === "string"
            ? (error as any).response.data.detail
            : "Failed to load calendar settings."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        {errorMessage && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{errorMessage}</div>
        )}
        {successMessage && (
          <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">{successMessage}</div>
        )}
        {!clientCanUpdate && (
          <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            You do not have permission to update calendar settings.
          </div>
        )}

        {/* ── Top Grid: Mode & Active FY ─────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* ── Section 1: Calendar Mode ──────────────────────────────────── */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col h-full">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight">System Calendar Mode</h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Control how dates are displayed across the app.</p>
              </div>
            </div>
            <div className="p-5 flex-1 flex flex-col justify-center space-y-6">
              <fieldset className="space-y-5">
                <div>
                  <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Primary Storage Calendar</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    value={calendarMode}
                    onChange={(e) => setCalendarMode(e.target.value as "AD" | "BS")}
                    disabled={clientIsLoading || saving || !clientCanUpdate || !isEditing}
                  >
                    <option value="AD">AD (Gregorian)</option>
                    <option value="BS">BS (Bikram Sambat)</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">UI Display Preference</label>
                  <select
                    className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    value={calendarDisplayMode}
                    onChange={(e) => setCalendarDisplayMode(e.target.value as CalendarDisplayMode)}
                    disabled={clientIsLoading || saving || !clientCanUpdate || !isEditing}
                  >
                    <option value="AD">Show AD Only</option>
                    <option value="BS">Show BS Only</option>
                    <option value="BOTH">Show Both (AD + BS)</option>
                  </select>
                </div>
                {calendarDisplayMode === 'BOTH' && (
                  <div>
                    <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Default Calendar Display
                      <span className="ml-2 text-[10px] font-normal text-slate-400 dark:text-slate-500">
                        (pre-selects UI Display Preference on first load)
                      </span>
                    </label>
                    <select
                      className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      value={defaultDisplayMode}
                      onChange={(e) => setDefaultDisplayMode(e.target.value as "AD" | "BS")}
                      disabled={clientIsLoading || saving || !clientCanUpdate || !isEditing}
                    >
                      <option value="AD">AD (Gregorian)</option>
                      <option value="BS">BS (Bikram Sambat)</option>
                    </select>
                  </div>
                )}
              </fieldset>
            </div>
          </div>

          {/* ── Section 2: Active Fiscal Year Dates ──────────────────────── */}
          <div className="rounded-2xl border border-emerald-100 dark:border-emerald-900/40 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex flex-col h-full relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
            <div className="px-5 py-4 border-b border-emerald-50 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-900/10 flex items-center gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-emerald-800 dark:text-emerald-300 tracking-tight">Active Fiscal Year</h2>
                <p className="text-[11px] text-emerald-600/70 dark:text-emerald-400 mt-0.5">
                  The current reporting period for your company.
                </p>
              </div>
            </div>
            <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/40 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="px-4 py-2.5 bg-indigo-50/60 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-900/40">
                <h2 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wide">Active Fiscal Year Dates</h2>
                <p className="text-[10px] text-indigo-500 dark:text-indigo-400/70 mt-0.5">
                  The active fiscal year used across all reports. Switch using the directory below, or set manually here.
                </p>
              </div>
              <div className="p-5 flex-1 flex flex-col justify-center">
                <fieldset>
                  <div className="space-y-6">
                    <div>
                      <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Fiscal Year Start Date</label>
                      <input
                        type="date"
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        value={fiscalYearStart}
                        onChange={(e) => setFiscalYearStart(e.target.value)}
                        disabled={clientIsLoading || saving || !clientCanUpdate || !isEditing}
                      />
                      <div className="mt-2 text-[11px] text-slate-500 px-1">
                        {fiscalYearStart ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">BS Equivalent:</span>
                            <span className="font-bold text-emerald-600 px-1.5 py-0.5 bg-emerald-50 rounded-md border border-emerald-100">{safeADToBS(fiscalYearStart) || "Invalid Date"}</span>
                          </div>
                        ) : (
                          "e.g. 2024-07-16"
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block mb-2 text-xs font-semibold text-slate-700 dark:text-slate-300">Fiscal Year End Date</label>
                      <input
                        type="date"
                        className="w-full border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm bg-white dark:bg-slate-950 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        value={fiscalYearEnd}
                        onChange={(e) => setFiscalYearEnd(e.target.value)}
                        disabled={clientIsLoading || saving || !clientCanUpdate || !isEditing}
                      />
                      <div className="mt-2 text-[11px] text-slate-500 px-1">
                        {fiscalYearEnd ? (
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium">BS Equivalent:</span>
                            <span className="font-bold text-emerald-600 px-1.5 py-0.5 bg-emerald-50 rounded-md border border-emerald-100">{safeADToBS(fiscalYearEnd) || "Invalid Date"}</span>
                          </div>
                        ) : (
                          "e.g. 2025-07-15"
                        )}
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>
            </div>
          </div>

        </div> {/* Close the grid */}

      </form>

      {/* ── Section 3: Fiscal Year Directory ──────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 flex items-center gap-3">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight">Fiscal Year Directory</h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              Rapidly switch the active fiscal year used across reports, or define new ones.
            </p>
          </div>
          {clientCanUpdate && isEditing && (
            <button
              type="button"
              onClick={() => { setShowAddForm((v) => !v); setAddError(null); }}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:bg-slate-800 dark:hover:bg-white shadow-sm transition-colors flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
              </svg>
              Add New
            </button>
          )}
        </div>
      </div>

      {/* Add inline form */}
      {showAddForm && (
        <div className="px-4 py-3 bg-emerald-50/30 dark:bg-emerald-900/10 border-b border-emerald-100 dark:border-emerald-900/40">
          <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 mb-2 uppercase tracking-wide">New Fiscal Year</p>
          {addError && <p className="text-[10px] text-red-500 mb-2">{addError}</p>}
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block mb-1 text-[10px] text-slate-500">Label</label>
              <input
                type="text"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs w-44 focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-900 dark:border-slate-700"
                placeholder="e.g. BS 2083–84"
                value={newFy.label}
                onChange={(e) => setNewFy((p) => ({ ...p, label: e.target.value }))}
              />
            </div>
            <div>
              <label className="block mb-1 text-[10px] text-slate-500">
                Start (AD)
                {newFy.start && <span className="ml-1.5 text-indigo-500 font-semibold">{safeADToBS(newFy.start) || ""}</span>}
              </label>
              <input
                type="date"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-900 dark:border-slate-700"
                value={newFy.start}
                onChange={(e) => setNewFy((p) => ({ ...p, start: e.target.value }))}
              />
            </div>
            <div>
              <label className="block mb-1 text-[10px] text-slate-500">
                End (AD)
                {newFy.end && <span className="ml-1.5 text-indigo-500 font-semibold">{safeADToBS(newFy.end) || ""}</span>}
              </label>
              <input
                type="date"
                className="border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-400 bg-white dark:bg-slate-900 dark:border-slate-700"
                value={newFy.end}
                onChange={(e) => setNewFy((p) => ({ ...p, end: e.target.value }))}
              />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleAddFY}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => { setShowAddForm(false); setAddError(null); }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Directory table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
              <th className="text-left py-2 px-4 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Fiscal Year</th>
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Start (AD)</th>
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Start (BS)</th>
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">End (AD)</th>
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">End (BS)</th>
              <th className="text-left py-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Status</th>
              <th className="py-2 px-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wide text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {fyList.map((fy) => {
              const active = isActive(fy);
              const activating = activatingId === fy.id;
              return (
                <tr
                  key={fy.id}
                  className={`border-b border-slate-100 dark:border-slate-800 last:border-none transition-colors ${active
                    ? "bg-emerald-50/40 dark:bg-emerald-900/10"
                    : "hover:bg-slate-50/50 dark:hover:bg-slate-800/30"
                    }`}
                >
                  <td className="py-2.5 px-4 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
                    {fy.label}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">{fy.start}</td>
                  <td className="py-2.5 px-3 text-indigo-500 dark:text-indigo-400 font-mono text-[11px]">
                    {safeADToBS(fy.start) || "—"}
                  </td>
                  <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">{fy.end}</td>
                  <td className="py-2.5 px-3 text-indigo-500 dark:text-indigo-400 font-mono text-[11px]">
                    {safeADToBS(fy.end) || "—"}
                  </td>
                  <td className="py-2.5 px-3">
                    {active ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!active && clientCanUpdate && isEditing && (
                        <button
                          type="button"
                          disabled={!!activatingId}
                          onClick={() => handleActivateFY(fy)}
                          className="text-[11px] px-3 py-1 rounded-lg border border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-800/50 font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {activating ? (
                            <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                          {activating ? "Activating..." : "Activate"}
                        </button>
                      )}
                      {clientCanUpdate && isEditing && !fy.id.startsWith("bs-") && (
                        <button
                          type="button"
                          onClick={() => handleDeleteFY(fy.id)}
                          className="text-[11px] px-2 py-1 rounded-lg border border-red-200 dark:border-red-800 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30 font-semibold transition-colors"
                          title="Delete this fiscal year"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {fyList.length === 0 && (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-slate-400">
                  No fiscal years defined. Click &quot;Add&quot; to create one.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
