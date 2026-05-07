"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  downloadCompanyBackup,
  getApiErrorWithStatus,
  restoreCompanyNew,
  restoreCompanyOverwrite,
} from "@/lib/adminCompanyBackupRestore";

type AdminCompany = {
  id: number;
  name: string;
};

const companiesFetcher = (url: string) =>
  api.get(url).then((res) => res.data as AdminCompany[]);

function isJsonFile(file: File): boolean {
  const nameOk = file.name.toLowerCase().endsWith(".json");
  const typeOk = !file.type || file.type.includes("json");
  return nameOk && typeOk;
}

export default function CompanyBackupRestorePage() {
  const { showToast } = useToast();
  const params = useParams();
  const tenantIdRaw = params?.tenantId as string | undefined;

  const tenantId = useMemo(() => {
    const n = tenantIdRaw ? Number(tenantIdRaw) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [tenantIdRaw]);

  const {
    data: companies,
    error: companiesError,
    isLoading: companiesLoading,
  } = useSWR<AdminCompany[]>(
    tenantId ? `/admin/tenants/${tenantId}/companies` : null,
    companiesFetcher
  );

  const [companyIdInput, setCompanyIdInput] = useState<string>("");
  const companyId = useMemo(() => {
    const n = companyIdInput ? Number(companyIdInput) : NaN;
    return Number.isFinite(n) ? n : null;
  }, [companyIdInput]);

  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [safeFile, setSafeFile] = useState<File | null>(null);
  const [safeRestoring, setSafeRestoring] = useState(false);
  const [safeError, setSafeError] = useState<string | null>(null);
  const [safeSuccessCompanyId, setSafeSuccessCompanyId] = useState<number | null>(
    null
  );

  const [overwriteFile, setOverwriteFile] = useState<File | null>(null);
  const [overwriteConfirm, setOverwriteConfirm] = useState(false);
  const [overwriteRestoring, setOverwriteRestoring] = useState(false);
  const [overwriteError, setOverwriteError] = useState<string | null>(null);
  const [overwriteSuccessCompanyId, setOverwriteSuccessCompanyId] = useState<
    number | null
  >(null);

  const downloadDisabled = !tenantId || !companyId || downloading;

  const safeRestoreDisabled =
    !tenantId || !safeFile || safeRestoring || !isJsonFile(safeFile);

  const overwriteRestoreDisabled =
    !tenantId ||
    !companyId ||
    !overwriteFile ||
    overwriteRestoring ||
    !overwriteConfirm ||
    !isJsonFile(overwriteFile);

  const renderFileHint = (file: File | null) => {
    if (!file) return null;
    const tooLarge = file.size > 50 * 1024 * 1024;
    return (
      <div className="text-[11px] text-slate-600 mt-1">
        <div>Selected: {file.name}</div>
        {tooLarge && (
          <div className="text-amber-700">
            Warning: File is larger than 50MB. Backend may reject it.
          </div>
        )}
        {!isJsonFile(file) && (
          <div className="text-red-600">Only .json files are allowed.</div>
        )}
      </div>
    );
  };

  const handleDownload = async () => {
    if (!tenantId || !companyId) return;

    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadCompanyBackup(tenantId, companyId);
      showToast({
        title: "Backup",
        description: "Backup downloaded successfully.",
        variant: "success",
      });
    } catch (err) {
      const msg = getApiErrorWithStatus(err);
      setDownloadError(msg);
      showToast({
        title: "Backup",
        description: msg,
        variant: "error",
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleSafeRestore = async () => {
    if (!tenantId || !safeFile) return;

    if (!isJsonFile(safeFile)) {
      setSafeError("Only .json files are allowed.");
      return;
    }

    setSafeRestoring(true);
    setSafeError(null);
    setSafeSuccessCompanyId(null);

    try {
      const data = await restoreCompanyNew(tenantId, safeFile);
      setSafeSuccessCompanyId(data.company_id);
      showToast({
        title: "Restore",
        description: `Restored successfully. New company id: ${data.company_id}`,
        variant: "success",
      });
    } catch (err) {
      const msg = getApiErrorWithStatus(err);
      setSafeError(msg);
      showToast({
        title: "Restore",
        description: msg,
        variant: "error",
      });
    } finally {
      setSafeRestoring(false);
    }
  };

  const handleOverwriteRestore = async () => {
    if (!tenantId || !companyId || !overwriteFile) return;

    if (!overwriteConfirm) {
      setOverwriteError(
        "You must confirm overwrite before restoring into an existing company."
      );
      return;
    }

    if (!isJsonFile(overwriteFile)) {
      setOverwriteError("Only .json files are allowed.");
      return;
    }

    setOverwriteRestoring(true);
    setOverwriteError(null);
    setOverwriteSuccessCompanyId(null);

    try {
      const data = await restoreCompanyOverwrite(tenantId, companyId, overwriteFile);
      setOverwriteSuccessCompanyId(data.company_id);
      showToast({
        title: "Overwrite restore",
        description: `Restored successfully. Company id: ${data.company_id}`,
        variant: "success",
      });
    } catch (err) {
      const msg = getApiErrorWithStatus(err);
      setOverwriteError(msg);
      showToast({
        title: "Overwrite restore",
        description: msg,
        variant: "error",
      });
    } finally {
      setOverwriteRestoring(false);
    }
  };

  if (!tenantIdRaw) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Company Backup &amp; Restore</h1>
        <div className="text-sm text-slate-600">
          Tenant ID: <span className="font-mono text-xs">{tenantIdRaw}</span>
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Tip: Select a company below (or manually type company id).
        </div>
      </div>

      <div className="bg-white shadow rounded p-4 space-y-3">
        <div className="text-sm font-medium">Target Company</div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block mb-1 text-xs text-slate-600">
              Company (dropdown)
            </label>
            <select
              className="w-full border rounded px-3 py-2 text-sm"
              value={companyIdInput}
              onChange={(e) => setCompanyIdInput(e.target.value)}
              disabled={companiesLoading}
            >
              <option value="">Select company…</option>
              {(companies || []).map((c) => (
                <option key={c.id} value={String(c.id)}>
                  {c.name} (#{c.id})
                </option>
              ))}
            </select>
            {companiesError && (
              <div className="mt-1 text-[11px] text-slate-500">
                Failed to load companies list. You can still type Company ID below.
              </div>
            )}
          </div>

          <div>
            <label className="block mb-1 text-xs text-slate-600">
              Company ID (manual)
            </label>
            <input
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder="e.g. 12"
              value={companyIdInput}
              onChange={(e) => setCompanyIdInput(e.target.value)}
              inputMode="numeric"
            />
          </div>
        </div>
      </div>

      <div className="bg-white shadow rounded p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Download Backup</div>
          <button
            type="button"
            onClick={handleDownload}
            disabled={downloadDisabled}
            className="px-4 py-2 rounded bg-slate-900 text-white text-sm disabled:opacity-60"
          >
            {downloading ? "Downloading…" : "Download Backup"}
          </button>
        </div>
        <div className="text-xs text-slate-500">
          Exports a company backup JSON for the selected tenant + company.
        </div>
        {downloadError && (
          <div className="text-sm text-red-600">{downloadError}</div>
        )}
      </div>

      <div className="bg-white shadow rounded p-4 space-y-4">
        <div>
          <div className="text-sm font-medium">Safe Restore (New Company)</div>
          <div className="text-xs text-slate-500">
            Recommended. Restores into a new company.
          </div>
        </div>

        <div>
          <label className="block mb-1 text-xs text-slate-600">
            Backup JSON file
          </label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setSafeFile(f);
              setSafeError(null);
              setSafeSuccessCompanyId(null);
            }}
          />
          {renderFileHint(safeFile)}
        </div>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleSafeRestore}
            disabled={safeRestoreDisabled}
            className="px-4 py-2 rounded bg-emerald-700 text-white text-sm disabled:opacity-60"
          >
            {safeRestoring ? "Restoring…" : "Restore into New Company"}
          </button>
        </div>

        {safeError && <div className="text-sm text-red-600">{safeError}</div>}
        {safeSuccessCompanyId != null && (
          <div className="text-sm text-emerald-800">
            Restored successfully. New company id: {safeSuccessCompanyId}
          </div>
        )}
      </div>

      <div className="bg-white shadow rounded p-4 space-y-4 border border-red-200">
        <div>
          <div className="text-sm font-medium text-red-700">
            Overwrite Restore (Danger)
          </div>
          <div className="text-xs text-slate-500">
            This will delete and replace existing company data.
          </div>
        </div>

        <div>
          <label className="block mb-1 text-xs text-slate-600">
            Backup JSON file
          </label>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              const f = e.target.files?.[0] || null;
              setOverwriteFile(f);
              setOverwriteError(null);
              setOverwriteSuccessCompanyId(null);
            }}
          />
          {renderFileHint(overwriteFile)}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-700">
          <input
            type="checkbox"
            checked={overwriteConfirm}
            onChange={(e) => setOverwriteConfirm(e.target.checked)}
          />
          I understand this will delete and replace existing company data
        </label>

        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleOverwriteRestore}
            disabled={overwriteRestoreDisabled}
            className="px-4 py-2 rounded bg-red-700 text-white text-sm disabled:opacity-60"
          >
            {overwriteRestoring ? "Restoring…" : "Overwrite Restore"}
          </button>
        </div>

        {overwriteError && (
          <div className="text-sm text-red-600">{overwriteError}</div>
        )}
        {overwriteSuccessCompanyId != null && (
          <div className="text-sm text-emerald-800">
            Restored successfully. Company id: {overwriteSuccessCompanyId}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <Link
          href={`/admin/tenants/${tenantIdRaw}`}
          className="px-3 py-2 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs"
        >
          Back to Tenant Detail
        </Link>
      </div>
    </div>
  );
}
