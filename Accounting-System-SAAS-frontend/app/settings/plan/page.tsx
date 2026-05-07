"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { useToast } from "@/components/ui/Toast";
import { usePermissions } from "@/components/PermissionsContext";
import {
  useMenuTemplatesDropdown,
  useTenantSelf,
  useUpdateTenantPlanModules,
} from "@/lib/tenantSelf/queries";
import type { MenuTemplateDropdownRead } from "@/types/tenantSelf";


export default function TenantPlanPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const permissions = usePermissions();
  const canEditTenantPlan = permissions.isSuperAdmin;
  const {
    data: tenant,
    error: tenantError,
    isLoading: tenantLoading,
    refetch: refetchTenant,
  } = useTenantSelf();
  const {
    data: menuTemplates,
    error: menuTemplatesError,
    isLoading: menuTemplatesLoading,
  } = useMenuTemplatesDropdown(canEditTenantPlan);
  const updateModules = useUpdateTenantPlanModules();

  const [selectedMenuTemplateId, setSelectedMenuTemplateId] = useState<number | null>(null);

  useEffect(() => {
    if (!tenant) return;
    setSelectedMenuTemplateId(
      typeof tenant.menu_template_id === "number" ? tenant.menu_template_id : null
    );
  }, [tenant]);

  const selectedTemplateModulesPreview = useMemo(() => {
    if (selectedMenuTemplateId == null) return "";
    const selected = (menuTemplates || []).find(
      (t: MenuTemplateDropdownRead) => t.id === selectedMenuTemplateId
    );
    return selected?.modules ?? "";
  }, [menuTemplates, selectedMenuTemplateId]);

  const handleUpdateModules = async () => {
    if (!canEditTenantPlan) {
      showToast({
        variant: "error",
        title: "Not allowed",
        description: "Only SuperAdmin can update plan/modules.",
      });
      await refetchTenant();
      return;
    }
    try {
      await updateModules.mutateAsync({ menu_template_id: selectedMenuTemplateId });
      showToast({
        variant: "success",
        title: "Modules updated",
        description: "Modules updated successfully.",
      });
    } catch (err: any) {
      const status = err?.response?.status as number | undefined;
      const detail = err?.response?.data?.detail;
      if (status === 403) {
        showToast({
          variant: "error",
          title: "Not allowed",
          description: "Only SuperAdmin can update plan/modules.",
        });
        await refetchTenant();
        return;
      }
      showToast({
        variant: "error",
        title: "Failed to update modules",
        description: detail || "Please try again.",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Organization Plan</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage your organization&apos;s subscription and active modules.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-500 transition-all shadow-sm group"
              title="Go Back"
            >
              <svg className="w-5 h-5 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => router.push("/dashboard")}
              className="h-9 w-9 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:border-rose-500 transition-all shadow-sm group"
              title="Close"
            >
              <svg className="w-5 h-5 transform group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {tenantError && (
        <div className="text-sm text-red-600 mb-2">
          {(tenantError as AxiosError | undefined)?.response?.status === 403
            ? "Not enough permissions"
            : (tenantError as any)?.response?.data?.detail || "Failed to load tenant plan."}
        </div>
      )}
      <div className="bg-white shadow rounded p-4 max-w-xl">
        {tenantLoading && !tenant ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : !tenant ? (
          <div className="text-sm text-slate-500">No tenant data.</div>
        ) : (
          <div className="space-y-4 text-sm">
            <div>
              <div className="text-slate-500 text-xs">Tenant</div>
              <div className="font-medium">{tenant.name}</div>
              {tenant.id != null && (
                <div className="mt-1 text-xs text-slate-600">
                  Tenant ID: {tenant.id}
                </div>
              )}
            </div>
            <div>
              <div className="text-slate-500 text-xs mb-1">Current Plan</div>
              <div className="inline-flex px-2 py-1 rounded-full bg-slate-100 text-slate-700 text-xs capitalize">
                {tenant.plan_name || tenant.plan}
              </div>
            </div>
            <div>
              <div className="text-slate-500 text-xs">Expires At</div>
              <div className="text-xs text-slate-600">
                {tenant.expires_at ? new Date(tenant.expires_at).toLocaleString() : "-"}
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-xs">Current Template Menu</div>
              <div className="text-xs text-slate-600">
                {tenant.menu_template_name || "Not selected"}
              </div>
            </div>

            <div>
              <div className="text-slate-500 text-xs">Deployed Modules</div>
              <div className="text-xs text-slate-600">
                {tenant.menu_template_modules || "—"}
              </div>
            </div>

            {canEditTenantPlan && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <div className="text-sm font-semibold">Modules (optional)</div>

                {menuTemplatesError && (
                  <div className="text-xs text-red-600">
                    {(menuTemplatesError as AxiosError | undefined)?.response?.status === 403
                      ? "Not enough permissions"
                      : (menuTemplatesError as any)?.response?.data?.detail ||
                      "Failed to load menu templates."}
                  </div>
                )}

                {Array.isArray(menuTemplates) &&
                  menuTemplates.length === 0 &&
                  !menuTemplatesLoading &&
                  !menuTemplatesError && (
                    <div className="text-xs text-amber-700">
                      No menu templates available. Contact superadmin.
                    </div>
                  )}

                <div>
                  <label className="block mb-1 font-medium text-xs">Modules (optional)</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={selectedMenuTemplateId == null ? "" : String(selectedMenuTemplateId)}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSelectedMenuTemplateId(v ? Number(v) : null);
                    }}
                    disabled={
                      !canEditTenantPlan ||
                      menuTemplatesLoading ||
                      Boolean(menuTemplatesError) ||
                      updateModules.isPending
                    }
                  >
                    <option value="">None</option>
                    {(menuTemplates || []).map((t: MenuTemplateDropdownRead) => (
                      <option key={t.id} value={t.id}>
                        {t.name} — {t.modules}
                      </option>
                    ))}
                  </select>
                  {selectedTemplateModulesPreview ? (
                    <div className="mt-1 text-[11px] text-slate-600">
                      {selectedTemplateModulesPreview}
                    </div>
                  ) : null}
                </div>

                <button
                  type="button"
                  onClick={handleUpdateModules}
                  disabled={!canEditTenantPlan || updateModules.isPending}
                  className="px-4 py-2 rounded bg-slate-900 text-white text-xs disabled:opacity-60"
                >
                  {updateModules.isPending ? "Saving…" : "Save/Update Modules"}
                </button>
              </div>
            )}

            {tenant.expires_at && (
              <div>
                <div className="text-slate-500 text-[10px]">
                  Status: {tenant.status}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
