import { ADToBS, BSToAD } from 'bikram-sambat-js';

/** Format a Date object to YYYY-MM-DD using LOCAL date parts (not UTC). */
function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Convert an AD date string (YYYY-MM-DD) to a BS date string.
 * Returns '' on error.
 */
export function safeADToBS(ad: string): string {
  try {
    if (!ad) return '';
    const out = ADToBS(ad);
    if (!out) return '';
    // ADToBS typically returns a string like "2082-04-01"
    return typeof out === 'string' ? out : String(out);
  } catch {
    return '';
  }
}

/**
 * Convert a BS date string (YYYY-MM-DD) to an AD date string (YYYY-MM-DD).
 * Returns '' on error.
 * NOTE: bikram-sambat-js BSToAD returns a JS Date object, not a string.
 *       We must format it as YYYY-MM-DD using local date parts.
 */
export function safeBSToAD(bs: string): string {
  try {
    if (!bs) return '';
    const out = BSToAD(bs);
    if (!out) return '';
    // BSToAD returns a Date object — format it to YYYY-MM-DD
    // Cast through unknown because the library typings don't declare Date as return type
    const outAny = out as unknown;
    if (outAny instanceof Date) {
      return dateToIso(outAny);
    }
    // Fallback: if it somehow returned a string already
    if (typeof out === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(out)) {
      return out;
    }
    return '';
  } catch {
    return '';
  }
}

export function isIsoDateString(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

export function addDaysAD(adDate: string, days: number): string {
  try {
    const date = new Date(adDate);
    if (isNaN(date.getTime())) return adDate;
    date.setDate(date.getDate() + days);
    return dateToIso(date);
  } catch {
    return adDate;
  }
}

export function addDaysBS(bsDate: string, days: number): string {
  try {
    const ad = safeBSToAD(bsDate);
    if (!ad) return bsDate;
    const newAd = addDaysAD(ad, days);
    return safeADToBS(newAd);
  } catch {
    return bsDate;
  }
}

/**
 * Returns the start and end of the BS month for the given BS date string (YYYY-MM-DD).
 * If no date provided, uses today.
 */
export function getBSMonthRange(bsDate?: string): { from: string, to: string } {
  let date = bsDate;
  if (!date) {
    date = safeADToBS(new Date().toISOString().slice(0, 10));
  }
  if (!date) return { from: '', to: '' };

  const [y, m] = date.split('-');
  const start = `${y}-${m}-01`;

  // To find the end, we try 32, then 31, then 30...
  let end = '';
  for (let d = 32; d >= 29; d--) {
    const candidate = `${y}-${m}-${String(d).padStart(2, '0')}`;
    if (safeBSToAD(candidate)) {
      end = candidate;
      break;
    }
  }

  return { from: start, to: end || start };
}

/**
 * Returns the start and end of the BS week for the given BS date string (YYYY-MM-DD).
 * Nepali week starts on Sunday (standard JS getDay()=0).
 */
export function getBSWeekRange(bsDate?: string): { from: string, to: string } {
  let date = bsDate;
  if (!date) {
    date = safeADToBS(new Date().toISOString().slice(0, 10));
  }
  if (!date) return { from: '', to: '' };

  const ad = safeBSToAD(date);
  if (!ad) return { from: date, to: date };

  const d = new Date(ad);
  const dayOfWeek = d.getDay(); // 0-6 (Sun-Sat)
  
  const startAd = addDaysAD(ad, -dayOfWeek);
  const endAd = addDaysAD(ad, 6 - dayOfWeek);

  return {
    from: safeADToBS(startAd),
    to: safeADToBS(endAd)
  };
}
