"use client";

import { useRouter } from "next/navigation";
import type { AxiosError } from "axios";
import { useTenantSelf } from "@/lib/tenantSelf/queries";

const PLAN_LABELS: Record<string, string> = {
  standard: "Standard",
  premium: "Premium",
  enterprise: "Enterprise",
};

export default function TenantDetailsPage() {
  const router = useRouter();
  const { data: tenant, error, isLoading } = useTenantSelf();

  const errorStatus = (error as AxiosError | undefined)?.response?.status;
  const errorDetail = (error as any)?.response?.data?.detail;

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 9h3.75M15 12h3.75M15 15h3.75M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5zm6-10.125a1.875 1.875 0 11-3.75 0 1.875 1.875 0 013.75 0zm1.294 6.336a6.721 6.721 0 01-3.17.789 6.721 6.721 0 01-3.168-.789 3.376 3.376 0 016.338 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Tenant Details</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                View information about your organization and current subscription.
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

      {errorStatus === 403 ? (
        <div className="text-sm text-red-600 mb-2">Not enough permissions</div>
      ) : error ? (
        <div className="text-sm text-red-600 mb-2">
          {errorDetail || "Failed to load tenant details"}
        </div>
      ) : null}

      <div className="bg-white shadow rounded p-4 max-w-2xl">
        {isLoading && !tenant ? (
          <div className="text-sm text-slate-500">Loading...</div>
        ) : !tenant ? (
          <div className="text-sm text-slate-500">No tenant data.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b">
                  <td className="py-2 text-xs text-slate-500">Tenant ID</td>
                  <td className="py-2 text-xs font-mono text-slate-700">{tenant.id}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-xs text-slate-500">Tenant Name</td>
                  <td className="py-2 text-xs text-slate-700">{tenant.name}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-xs text-slate-500">Status</td>
                  <td className="py-2 text-xs text-slate-700 capitalize">{tenant.status || "-"}</td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-xs text-slate-500">Plan</td>
                  <td className="py-2 text-xs text-slate-700 capitalize">
                    {PLAN_LABELS[tenant.plan] || tenant.plan}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-xs text-slate-500">Expires At</td>
                  <td className="py-2 text-xs text-slate-700">
                    {tenant.expires_at ? new Date(tenant.expires_at).toLocaleString() : "-"}
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-2 text-xs text-slate-500">Template Menu</td>
                  <td className="py-2 text-xs text-slate-700">
                    {tenant.menu_template_name || "Not selected"}
                  </td>
                </tr>
                <tr>
                  <td className="py-2 text-xs text-slate-500">Deployed Modules</td>
                  <td className="py-2 text-xs text-slate-700">
                    {tenant.menu_template_modules || "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
