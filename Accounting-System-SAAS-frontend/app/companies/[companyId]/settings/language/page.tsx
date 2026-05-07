"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

type LanguageCode = "en" | "ne" | "hi";
type DateStyle = "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD";

export default function CompanyLanguageSettingsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const [language, setLanguage] = useState<LanguageCode>("en");
  const [dateStyle, setDateStyle] = useState<DateStyle>("DD/MM/YYYY");
  const [use12HourTime, setUse12HourTime] = useState(true);
  const [isEditing, setIsEditing] = useState(false);

  const preview = useMemo(() => {
    const now = new Date("2025-12-25T14:30:00");
    const d = now.getDate().toString().padStart(2, "0");
    const m = (now.getMonth() + 1).toString().padStart(2, "0");
    const y = now.getFullYear().toString();

    const date =
      dateStyle === "YYYY-MM-DD"
        ? `${y}-${m}-${d}`
        : dateStyle === "MM/DD/YYYY"
          ? `${m}/${d}/${y}`
          : `${d}/${m}/${y}`;

    const time = new Intl.DateTimeFormat(language === "ne" ? "ne-NP" : language === "hi" ? "hi-IN" : "en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: use12HourTime,
    }).format(now);

    const number = new Intl.NumberFormat(
      language === "ne" ? "ne-NP" : language === "hi" ? "hi-IN" : "en-US",
      { maximumFractionDigits: 2 }
    ).format(1234567.89);

    const sampleText =
      language === "ne" ? "उदाहरण (Sample)" : language === "hi" ? "उदाहरण (Sample)" : "Sample";

    return { date, time, number, sampleText };
  }, [dateStyle, language, use12HourTime]);

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Language Settings</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure language and formatting preferences.
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
                onClick={() => setIsEditing(false)}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={() => window.history.back()}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <fieldset disabled={!isEditing} className="rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Default language</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={language}
                onChange={(e) => setLanguage(e.target.value as LanguageCode)}
              >
                <option value="en">English</option>
                <option value="ne">Nepali</option>
                <option value="hi">Hindi</option>
              </select>
            </label>

            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Date format</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={dateStyle}
                onChange={(e) => setDateStyle(e.target.value as DateStyle)}
              >
                <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                <option value="MM/DD/YYYY">MM/DD/YYYY</option>
                <option value="YYYY-MM-DD">YYYY-MM-DD</option>
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={use12HourTime}
              onChange={(e) => setUse12HourTime(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-800">Use 12-hour time (AM/PM)</span>
          </label>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This page currently saves settings locally (UI only). If you want, I can wire it to your backend/company settings API.
          </div>
        </fieldset>

        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-xs font-medium text-slate-700 mb-3">Preview</div>
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Language</span>
              <span className="text-sm font-medium text-slate-900">{language.toUpperCase()}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Date</span>
              <span className="text-sm font-medium text-slate-900">{preview.date}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Time</span>
              <span className="text-sm font-medium text-slate-900">{preview.time}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-600">Number format</span>
              <span className="text-sm font-medium text-slate-900">{preview.number}</span>
            </div>
            <div className="pt-2 border-t border-slate-200 text-xs text-slate-700">
              {preview.sampleText}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
