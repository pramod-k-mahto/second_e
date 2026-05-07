"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR, { mutate as globalMutate } from "swr";

import { api } from "@/lib/api";
import { usePermissions } from "@/components/PermissionsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type CompanySettings = {
  company_id: number;
  website_api_key?: string | null;
  website_api_secret?: string | null;
  payment_qr_url?: string | null;
};

function randomHex(bytes: number): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function CompanyWebsiteIntegrationSettingsPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const permissions = usePermissions();
  const canUpdate = permissions.can("settings_company", "update");

  const { data: settings, error, isLoading, mutate } = useSWR<CompanySettings>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );

  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [paymentQrUrl, setPaymentQrUrl] = useState("");

  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [menuCode, setMenuCode] = useState("settings.website_orders");
  const [bffPath, setBffPath] = useState("/api/website/companies/{companyId}/orders");
  const [upstreamPath, setUpstreamPath] = useState("{ACCOUNTING_API_BASE}/website/companies/{companyId}/orders");

  const demoCheckoutPath = useMemo(
    () => `/companies/${companyId}/settings/website-integration/demo-checkout`,
    [companyId]
  );

  useEffect(() => {
    if (!settings) return;
    setApiKey(settings.website_api_key || "");
    setApiSecret(settings.website_api_secret || "");
    setPaymentQrUrl(settings.payment_qr_url || "");
  }, [settings]);

  const hasChanges = useMemo(() => {
    const k = settings?.website_api_key || "";
    const s = settings?.website_api_secret || "";
    const q = settings?.payment_qr_url || "";
    return apiKey !== k || apiSecret !== s || paymentQrUrl !== q;
  }, [apiKey, apiSecret, paymentQrUrl, settings?.website_api_key, settings?.website_api_secret, settings?.payment_qr_url]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!canUpdate) return;

    setSaving(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      await api.patch(`/companies/${companyId}/settings`, {
        website_api_key: apiKey || null,
        website_api_secret: apiSecret || null,
        payment_qr_url: paymentQrUrl || null,
      });

      await mutate();
      await globalMutate((key) => typeof key === "string" && key === `/companies/${companyId}/settings`);
      setIsEditing(false);
      setSuccessMessage("Website integration settings saved.");
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setErrorMessage(typeof detail === "string" ? detail : "Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const rotateKey = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setApiKey(`web_${crypto.randomUUID()}`);
  };

  const rotateSecret = () => {
    setSuccessMessage(null);
    setErrorMessage(null);
    setApiSecret(randomHex(32));
  };

  return (
    <div className="space-y-4 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
              <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Website & Checkout Integration</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Configure your API credentials, checkout integration paths, and test sample orders.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!isEditing && canUpdate && (
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
                  if (settings) {
                    setApiKey(settings.website_api_key || "");
                    setApiSecret(settings.website_api_secret || "");
                    setPaymentQrUrl(settings.payment_qr_url || "");
                  }
                }}
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

      {error && (
        <div className="text-xs text-red-600">
          {typeof (error as any)?.response?.data?.detail === "string"
            ? (error as any).response.data.detail
            : "Failed to load company settings."}
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900 mb-4">Website API Credentials</h2>
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {errorMessage && <div className="text-xs text-red-600">{errorMessage}</div>}
              {successMessage && <div className="text-xs text-green-600">{successMessage}</div>}

              {!canUpdate && (
                <div className="text-xs text-slate-600">You do not have permission to update website integration settings.</div>
              )}

              <fieldset className="space-y-3" disabled={isLoading || saving || !canUpdate || !isEditing}>
                <label className="space-y-1 block">
                  <div className="text-xs font-medium text-slate-700">Website API Key</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="e.g. PUBLIC_KEY_123"
                    />
                    <button
                      type="button"
                      onClick={rotateKey}
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 hover:bg-slate-50"
                    >
                      Rotate
                    </button>
                  </div>
                </label>

                <label className="space-y-1 block">
                  <div className="text-xs font-medium text-slate-700">Website API Secret</div>
                  <div className="flex gap-2">
                    <input
                      className="flex-1 rounded border border-slate-300 bg-white px-3 py-2 text-sm font-mono"
                      value={apiSecret}
                      onChange={(e) => setApiSecret(e.target.value)}
                      placeholder="e.g. SECRET_456"
                    />
                    <button
                      type="button"
                      onClick={rotateSecret}
                      className="rounded border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 hover:bg-slate-50"
                    >
                      Rotate
                    </button>
                  </div>
                </label>

                <div className="space-y-2">
                  <div className="text-xs font-medium text-slate-700">Payment QR Code</div>

                  {/* Upload option */}
                  <div className="flex items-center gap-3">
                    {paymentQrUrl && (
                      <div className="relative shrink-0">
                        <img
                          src={paymentQrUrl}
                          alt="Payment QR"
                          className="h-24 w-24 object-contain rounded-lg border border-slate-200 bg-white p-1"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                        <button
                          type="button"
                          onClick={() => setPaymentQrUrl("")}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-rose-500 rounded-full flex items-center justify-center text-white shadow"
                          title="Remove QR"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    )}
                    <label className="flex-1 cursor-pointer">
                      <div className="flex items-center gap-2 border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-lg px-4 py-3 transition-colors bg-white">
                        <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        <span className="text-xs text-slate-500">{paymentQrUrl ? "Replace QR image" : "Upload QR image"}</span>
                      </div>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            if (typeof reader.result === "string") setPaymentQrUrl(reader.result);
                          };
                          reader.readAsDataURL(file);
                        }}
                      />
                    </label>
                  </div>

                  {/* Or use URL */}
                  <div>
                    <div className="text-[11px] text-slate-400 mb-1">— or paste a public URL —</div>
                    <input
                      className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                      value={paymentQrUrl.startsWith("data:") ? "" : paymentQrUrl}
                      onChange={(e) => setPaymentQrUrl(e.target.value)}
                      placeholder="https://example.com/payment-qr.png"
                    />
                  </div>

                  <p className="text-[11px] text-slate-400">
                    This QR code appears in the &ldquo;Pay Now&rdquo; popup on your public product page. Uploading directly is recommended to avoid broken links.
                  </p>
                </div>

              </fieldset>

              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Keep the secret stored server-side only (website BFF / backend). Never expose it in browser code.
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="submit"
                  disabled={saving || isLoading || !canUpdate || !hasChanges || !isEditing}
                  className="px-4 py-1.5 rounded bg-slate-900 text-white text-xs disabled:opacity-60"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Server Environment Variables</h2>
            <div className="text-xs text-slate-700">Set these on the server (do not expose in browser):</div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-[11px] text-slate-700 space-y-1 overflow-x-auto">
              <div>ACCOUNTING_API_BASE=...</div>
              <div>WEBSITE_API_KEY=...</div>
              <div>WEBSITE_API_SECRET=...</div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-900">Checkout Manual Setup</h2>
            <div className="text-xs text-slate-600">
              Use these values in your backend menu system and when documenting the integration.
            </div>

            <fieldset disabled={!isEditing} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <label className="space-y-1">
                <div className="text-[11px] font-medium text-slate-700">Menu code</div>
                <input
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                  value={menuCode}
                  onChange={(e) => setMenuCode(e.target.value)}
                />
              </label>

              <div className="space-y-1">
                <div className="text-[11px] font-medium text-slate-700">Settings page URL</div>
                <div className="w-full rounded border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-mono text-slate-700 break-all">
                  /companies/{companyId}/settings/website-integration
                </div>
              </div>

              <label className="space-y-1">
                <div className="text-[11px] font-medium text-slate-700">BFF path (browser)</div>
                <input
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                  value={bffPath}
                  onChange={(e) => setBffPath(e.target.value)}
                />
              </label>

              <label className="space-y-1">
                <div className="text-[11px] font-medium text-slate-700">Upstream path (server)</div>
                <input
                  className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-xs font-mono"
                  value={upstreamPath}
                  onChange={(e) => setUpstreamPath(e.target.value)}
                />
              </label>
            </fieldset>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-2">
            <div className="text-sm font-semibold text-slate-900">Demo checkout</div>
            <div className="text-xs text-slate-600">
              Use this page to test submitting a sample order through the integration.
            </div>
            <Link
              className="inline-flex rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50 transition-colors"
              href={demoCheckoutPath}
            >
              Open demo checkout
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
