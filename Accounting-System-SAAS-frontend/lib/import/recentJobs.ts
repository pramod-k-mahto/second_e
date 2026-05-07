import type { ImportDataType, ImportSourceType } from "./types";

const STORAGE_KEY = "recent_import_jobs";

export type RecentImportJob = {
  id: string;
  company_id?: number | null;
  company_name?: string | null;
  source_type?: ImportSourceType | string;
  data_type?: ImportDataType | string;
  created_at?: string | null;
};

function safeParse(raw: string | null): any {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getRecentImportJobs(): RecentImportJob[] {
  if (typeof window === "undefined") return [];
  const parsed = safeParse(localStorage.getItem(STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x) => x && typeof x.id === "string");
}

export function addRecentImportJob(job: RecentImportJob): RecentImportJob[] {
  if (typeof window === "undefined") return [];
  const existing = getRecentImportJobs();
  const merged = [job, ...existing.filter((j) => j.id !== job.id)].slice(0, 25);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function removeRecentImportJob(jobId: string): RecentImportJob[] {
  if (typeof window === "undefined") return [];
  const next = getRecentImportJobs().filter((j) => j.id !== jobId);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}
