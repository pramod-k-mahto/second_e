"use client";

import { FormEvent, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type Company = {
  id: number;
  name: string;
  cost_center_mode: null | "single" | "double" | "triple";
  cost_center_single_dimension: "department" | "project" | "segment" | null;
  enable_cost_centers_in_vouchers: boolean;
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

export default function CompanyCostCentersSettingsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const {
    data: company,
    error: companyError,
    isLoading,
    mutate,
  } = useSWR<Company>(companyId ? `/companies/${companyId}` : null, fetcher);

  const [mode, setMode] = useState<null | "single" | "double" | "triple" | "loading" | "">("loading");
  const [dimension, setDimension] =
    useState<"department" | "project" | "segment" | null | "loading">("loading");
  const [enableVouchers, setEnableVouchers] = useState<boolean | "loading">("loading");
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const effectiveMode = mode === "loading" ? company?.cost_center_mode ?? null : mode;
  const effectiveDimension =
    dimension === "loading" ? company?.cost_center_single_dimension ?? null : dimension;
  const effectiveEnableVouchers =
    enableVouchers === "loading"
      ? company?.enable_cost_centers_in_vouchers ?? false
      : enableVouchers;

  const handleInitState = () => {
    if (!company) return;
    if (mode === "loading") {
      setMode(company.cost_center_mode ?? null);
    }
    if (dimension === "loading") {
      setDimension(company.cost_center_single_dimension ?? null);
    }
    if (enableVouchers === "loading") {
      setEnableVouchers(company.enable_cost_centers_in_vouchers ?? false);
    }
  };

  if (company && (mode === "loading" || dimension === "loading" || enableVouchers === "loading")) {
    handleInitState();
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !company) return;

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      let payload: Partial<Company> = {};

      if (effectiveMode === null) {
        payload = {
          cost_center_mode: null,
          cost_center_single_dimension: null,
        };
      } else if (effectiveMode === "triple") {
        payload = {
          cost_center_mode: "triple",
          cost_center_single_dimension: null,
        };
      } else if (effectiveMode === "single") {
        if (!effectiveDimension) {
          setErrorMessage("Select whether the single cost center is Department, Project, or Segment.");
          setSaving(false);
          return;
        }
        payload = {
          cost_center_mode: "single",
          cost_center_single_dimension: effectiveDimension,
        };
      }

      if (effectiveMode !== null) {
        payload.enable_cost_centers_in_vouchers = effectiveEnableVouchers;
      } else {
        payload.enable_cost_centers_in_vouchers = false;
      }

      await api.put(`/companies/${companyId}`, payload);
      await mutate();
      setSuccessMessage("Cost center mode updated successfully.");
      setIsEditing(false);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(extractErrorMessage(detail, "Failed to update cost center mode."));
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    router.push('/dashboard');
  };

  const currentSelectionLabel = () => {
    if (!company) return "";
    if (effectiveMode === null) return "Disabled";
    if (effectiveMode === "double") return "Double – Department + Project";
    if (effectiveMode === "triple") return "Triple – Dept + Proj + Segment";
    if (effectiveMode === "single") {
      if (effectiveDimension === "department") return "Single – Department";
      if (effectiveDimension === "project") return "Single – Project";
      if (effectiveDimension === "segment") return "Single – Segment";
      return "Single";
    }
    return "";
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Cost Center Settings</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure how departments and projects are used as cost centers.
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
                    setMode(company.cost_center_mode ?? null);
                    setDimension(company.cost_center_single_dimension ?? null);
                    setEnableVouchers(company.enable_cost_centers_in_vouchers ?? false);
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
        {company && (
          <div className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 border-t border-indigo-100 dark:border-indigo-800/20 text-xs text-indigo-800 dark:text-indigo-300">
            Current selection: <span className="font-semibold">{currentSelectionLabel()}</span>
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4 text-xs">
          {errorMessage && (
            <div className="text-xs text-red-600 mb-2">{errorMessage}</div>
          )}
          {successMessage && (
            <div className="text-xs text-green-600 mb-2">{successMessage}</div>
          )}

          <fieldset className="space-y-2" disabled={isLoading || saving || !isEditing}>
            <legend className="text-sm font-medium mb-1">Cost center mode</legend>

            <p className="text-[11px] text-slate-500 mb-1">
              Choose whether voucher lines can be tagged with departments, projects, or both.
            </p>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cc-mode"
                className="mt-0.5"
                checked={effectiveMode === null}
                onChange={() => {
                  setMode(null);
                  setDimension(null);
                }}
              />
              <div>
                <div className="font-medium">Disabled</div>
                <div className="text-[11px] text-slate-500">
                  Cost centers are not used. Vouchers cannot reference departments or projects.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cc-mode"
                className="mt-0.5"
                checked={effectiveMode === "single" && effectiveDimension === "department"}
                onChange={() => {
                  setMode("single");
                  setDimension("department");
                }}
              />
              <div>
                <div className="font-medium">Single – Department</div>
                <div className="text-[11px] text-slate-500">
                  Only departments can be assigned to voucher lines. Projects will be disabled.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cc-mode"
                className="mt-0.5"
                checked={effectiveMode === "single" && effectiveDimension === "project"}
                onChange={() => {
                  setMode("single");
                  setDimension("project");
                }}
              />
              <div>
                <div className="font-medium">Single – Project</div>
                <div className="text-[11px] text-slate-500">
                  Only projects can be assigned to voucher lines. Departments will be disabled.
                </div>
              </div>
            </label>


            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cc-mode"
                className="mt-0.5"
                checked={effectiveMode === "single" && effectiveDimension === "segment"}
                onChange={() => {
                  setMode("single");
                  setDimension("segment");
                }}
              />
              <div>
                <div className="font-medium">Single – Segment</div>
                <div className="text-[11px] text-slate-500">
                  Only segments can be assigned to voucher lines. Others will be disabled.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cc-mode"
                className="mt-0.5"
                checked={effectiveMode === "double"}
                onChange={() => {
                  setMode("double");
                  setDimension(null);
                }}
              />
              <div>
                <div className="font-medium">Double – Department + Project</div>
                <div className="text-[11px] text-slate-500">
                  Voucher lines can carry both a department and a project.
                </div>
              </div>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="radio"
                name="cc-mode"
                className="mt-0.5"
                checked={effectiveMode === "triple"}
                onChange={() => {
                  setMode("triple");
                  setDimension(null);
                }}
              />
              <div>
                <div className="font-medium">Triple – Dept + Proj + Segment</div>
                <div className="text-[11px] text-slate-500">
                  Voucher lines can carry department, project, and segment.
                </div>
              </div>
            </label>

            {effectiveMode !== null && (
              <div className="pt-4 border-t border-slate-100 mt-2">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={effectiveEnableVouchers}
                    onChange={(e) => setEnableVouchers(e.target.checked)}
                  />
                  <div>
                    <div className="font-medium">Enable in Vouchers</div>
                    <div className="text-[11px] text-slate-500">
                      Allow assigning cost centers (Department/Project) in Voucher lines (Journal, Payment, Receipt, etc.).
                    </div>
                  </div>
                </label>
              </div>
            )}
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

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 max-w-xl">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100 mb-2">Cost center masters</h2>
        <p className="text-[11px] text-slate-500 mb-3">
          Manage departments and projects that can be used as cost centers on voucher lines.
        </p>
        <div className="flex flex-wrap gap-2 text-xs mt-4">
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={
              !companyId ||
              effectiveMode === null ||
              (effectiveMode === "single" && effectiveDimension !== "department") ||
              !isEditing
            }
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `/companies/${companyId}/settings/departments`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }
            }}
          >
            Manage Departments
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={
              !companyId ||
              effectiveMode === null ||
              (effectiveMode === "single" && effectiveDimension !== "project") ||
              (effectiveMode !== "triple" && effectiveMode !== "double" && effectiveMode !== "single") ||
              (effectiveMode === "single" && effectiveDimension !== "project") ||
              !isEditing
            }
            onClick={() => {
              if (typeof window !== "undefined" && (effectiveMode === "double" || effectiveMode === "triple" || (effectiveMode === "single" && effectiveDimension === "project"))) {
                window.open(
                  `/companies/${companyId}/settings/projects`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }
            }}
          >
            Manage Projects
          </button>
          <button
            type="button"
            className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={
              !companyId ||
              effectiveMode === null ||
              (effectiveMode !== "triple" && (effectiveMode !== "single" || effectiveDimension !== "segment")) ||
              !isEditing
            }
            onClick={() => {
              if (typeof window !== "undefined") {
                window.open(
                  `/companies/${companyId}/settings/segments`,
                  "_blank",
                  "noopener,noreferrer"
                );
              }
            }}
          >
            Manage Segments
          </button>
        </div>
        {effectiveMode === null && (
          <p className="mt-2 text-[11px] text-slate-500">
            Enable cost centers above to manage departments, projects, and segments as cost centers.
          </p>
        )}
        {effectiveMode === "single" && effectiveDimension === "department" && (
          <p className="mt-2 text-[11px] text-slate-500">
            In single-department mode, only departments are used as cost centers. Project and Segment
            management is disabled here.
          </p>
        )}
        {effectiveMode === "single" && effectiveDimension === "project" && (
          <p className="mt-2 text-[11px] text-slate-500">
            In single-project mode, only projects are used as cost centers. Department and Segment
            management is disabled here.
          </p>
        )}
        {effectiveMode === "single" && effectiveDimension === "segment" && (
          <p className="mt-2 text-[11px] text-slate-500">
            In single-segment mode, only segments are used as cost centers. Department and Project
            management is disabled here.
          </p>
        )}
      </div>
    </div>
  );
}
