import { getCurrentCompany } from "./api";

export type CalendarInputMode = 'AD' | 'BS';
export type CalendarDisplayMode = 'AD' | 'BS' | 'BOTH';
export type CalendarReportDisplayMode = 'AD' | 'BS';

export const calendarDisplayModeStorageKey = (companyId: string | number) =>
  `calendar_display_mode:${companyId}`;

export const calendarReportDisplayModeStorageKey = (companyId: string | number) =>
  `calendar_report_display_mode:${companyId}`;

/** Key for the admin-configured default (AD | BS), used as the seed for the
 *  UI Display Preference when no per-session override has been written yet. */
export const calendarDefaultDisplayModeStorageKey = (companyId: string | number) =>
  `calendar_default_display_mode:${companyId}`;

export function readDefaultCalendarDisplayMode(
  companyId: string | number | null | undefined,
  fallback: CalendarReportDisplayMode = 'AD'
): CalendarReportDisplayMode {
  if (!companyId) return fallback;
  if (typeof window === 'undefined') return fallback;
  const raw = window.localStorage.getItem(calendarDefaultDisplayModeStorageKey(companyId));
  if (raw === 'AD' || raw === 'BS') return raw;
  return fallback;
}

export function writeDefaultCalendarDisplayMode(
  companyId: string | number | null | undefined,
  mode: CalendarReportDisplayMode
): void {
  if (!companyId) return;
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(calendarDefaultDisplayModeStorageKey(companyId), mode);
}

export function readCalendarDisplayMode(
  companyId: string | number | null | undefined,
  fallback: CalendarDisplayMode = 'AD'
): CalendarDisplayMode {
  if (!companyId) return fallback;
  if (typeof window === 'undefined') return fallback;

  // 1. Check for specific user override in local storage
  const raw = window.localStorage.getItem(calendarDisplayModeStorageKey(companyId));
  if (raw === 'AD' || raw === 'BS' || raw === 'BOTH') return raw;

  // 2. Check for admin-configured default display mode (AD | BS)
  const defaultRaw = window.localStorage.getItem(calendarDefaultDisplayModeStorageKey(companyId));
  if (defaultRaw === 'AD' || defaultRaw === 'BS') return defaultRaw;

  // 3. Fallback to Central Company Setup (the "Rule of Selected Calendar")
  const cc = getCurrentCompany();
  if (cc && String(cc.id) === String(companyId) && cc.calendar_mode) {
    return cc.calendar_mode;
  }

  return fallback;
}

export function writeCalendarDisplayMode(
  companyId: string | number | null | undefined,
  mode: CalendarDisplayMode
): void {
  if (!companyId) return;
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(calendarDisplayModeStorageKey(companyId), mode);
}

export function readCalendarReportDisplayMode(
  companyId: string | number | null | undefined,
  fallback: CalendarReportDisplayMode = 'AD'
): CalendarReportDisplayMode {
  if (!companyId) return fallback;
  if (typeof window === 'undefined') return fallback;

  // 1. Check for specific user override in local storage
  const raw = window.localStorage.getItem(calendarReportDisplayModeStorageKey(companyId));
  if (raw === 'AD' || raw === 'BS') return raw;

  // 2. Fallback to Central Company Setup (the "Rule of Selected Calendar")
  const cc = getCurrentCompany();
  if (cc && String(cc.id) === String(companyId) && cc.calendar_mode) {
    return cc.calendar_mode;
  }

  return fallback;
}

export function writeCalendarReportDisplayMode(
  companyId: string | number | null | undefined,
  mode: CalendarReportDisplayMode
): void {
  if (!companyId) return;
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(calendarReportDisplayModeStorageKey(companyId), mode);
}
