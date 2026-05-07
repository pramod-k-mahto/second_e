"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useParams } from "next/navigation";

export default function WebsiteOrdersSettingsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const [menuCode, setMenuCode] = useState("settings.website_orders");
  const [bffPath, setBffPath] = useState("/api/website/companies/{companyId}/orders");
  const [upstreamPath, setUpstreamPath] = useState("{ACCOUNTING_API_BASE}/website/companies/{companyId}/orders");
  const [isEditing, setIsEditing] = useState(false);

  const demoCheckoutPath = useMemo(
    () => `/companies/${companyId}/settings/website-orders/demo-checkout`,
    [companyId]
  );

  return (
    <div className="space-y-6 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Website Orders</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure your website checkout integration.
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
                }}
                className="px-4 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
              >
                Cancel
              </button>
            )}
            {isEditing && (
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 flex items-center gap-2"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Save
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

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-900">Integration endpoint</div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">
          POST {bffPath}
        </div>
        <div className="text-xs text-slate-600">
          This route runs on the server and signs requests to the Accounting backend using HMAC.
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-900">Demo checkout</div>
        <div className="text-xs text-slate-600">
          Use this page to test submitting a sample order through the integration.
        </div>
        <Link
          className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 hover:bg-slate-50"
          href={demoCheckoutPath}
        >
          Open demo checkout
        </Link>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="text-sm font-semibold text-slate-900">Manual setup</div>
        <div className="text-xs text-slate-600">
          Use these values in your backend menu system and when documenting the integration. You can edit them now and
          copy/paste.
        </div>

        <fieldset disabled={!isEditing} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Menu code (create this under Settings)</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
              value={menuCode}
              onChange={(e) => setMenuCode(e.target.value)}
            />
          </label>

          <div className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Settings page URL</div>
            <div className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-mono text-slate-700 break-all">
              /companies/{companyId}/settings/website-orders
            </div>
          </div>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">BFF path (browser calls this)</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
              value={bffPath}
              onChange={(e) => setBffPath(e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Accounting upstream path (server calls this)</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
              value={upstreamPath}
              onChange={(e) => setUpstreamPath(e.target.value)}
            />
          </label>
        </fieldset>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
        <div className="text-sm font-semibold text-slate-900">Server environment variables</div>
        <div className="text-xs text-slate-700">Set these on the server (do not expose in browser):</div>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700 space-y-1">
          <div>ACCOUNTING_API_BASE=...</div>
          <div>WEBSITE_API_KEY=...</div>
          <div>WEBSITE_API_SECRET=...</div>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-xs text-amber-800">
        Do not compute HMAC signatures in the browser. Always use a server-side route.
      </div>
    </div>
  );
}
