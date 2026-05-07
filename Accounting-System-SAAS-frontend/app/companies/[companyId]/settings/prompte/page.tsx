"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type PromoChannel = "Email" | "SMS" | "WhatsApp" | "Facebook" | "Instagram";

type ApiProvider = "Shopify" | "WooCommerce" | "Custom";

type SeoPreset = "Basic" | "Advanced";

type OrdersMode = "Disabled" | "Receive Orders" | "Receive + Auto-Create Sales Order";

export default function CompanyPrompteSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const [promoChannel, setPromoChannel] = useState<PromoChannel>("WhatsApp");
  const [autoPromoteNewProducts, setAutoPromoteNewProducts] = useState(true);
  const [discountPercent, setDiscountPercent] = useState(5);

  const [apiProvider, setApiProvider] = useState<ApiProvider>("Custom");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");

  const [facebookPage, setFacebookPage] = useState("");
  const [instagramHandle, setInstagramHandle] = useState("");
  const [whatsAppNumber, setWhatsAppNumber] = useState("");

  const [seoPreset, setSeoPreset] = useState<SeoPreset>("Basic");
  const [siteTitle, setSiteTitle] = useState("");
  const [metaDescription, setMetaDescription] = useState("");

  const [ordersMode, setOrdersMode] = useState<OrdersMode>("Receive Orders");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const readiness = useMemo(() => {
    const promoOk = promoChannel !== "WhatsApp" || Boolean(whatsAppNumber.trim());
    const apiOk = apiProvider !== "Custom" || (Boolean(apiBaseUrl.trim()) && Boolean(apiKey.trim()));
    const socialOk = Boolean(facebookPage.trim()) || Boolean(instagramHandle.trim()) || Boolean(whatsAppNumber.trim());
    const seoOk = seoPreset !== "Advanced" || (Boolean(siteTitle.trim()) && Boolean(metaDescription.trim()));
    const ordersOk = ordersMode === "Disabled" || Boolean(notifyEmail.trim());

    const okCount = [promoOk, apiOk, socialOk, seoOk, ordersOk].filter(Boolean).length;
    return {
      promoOk,
      apiOk,
      socialOk,
      seoOk,
      ordersOk,
      okCount,
      total: 5,
    };
  }, [apiBaseUrl, apiKey, apiProvider, facebookPage, instagramHandle, metaDescription, notifyEmail, ordersMode, promoChannel, seoPreset, siteTitle, whatsAppNumber]);

  return (
    <div className="space-y-4 text-sm">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.34 1.584a2.25 2.25 0 00-2.015 0l-5.85 3.037c-.643.334-1.05 1.002-1.075 1.724a2.25 2.25 0 001.127 2.031L8.38 11.41a2.25 2.25 0 002.015 0l5.85-3.037a2.25 2.25 0 001.075-1.724 2.25 2.25 0 00-1.127-2.031L10.34 1.584z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M1.425 10.354A2.25 2.25 0 001.128 12.08a10.457 10.457 0 004.931 5.48c1.554.78 3.328 1.19 5.215 1.19a10.518 10.518 0 005.15-1.3l.006-.004a2.25 2.25 0 001.057-1.748l.006-.002a2.3 2.3 0 000-.812V12.1a2.25 2.25 0 00-1.056-1.748L10.34 13.39a2.25 2.25 0 01-2.015 0L1.425 10.354z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Promote Settings</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Promote products online, connect channels, and optimize SEO.
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
                Save Changes
              </button>
            )}
            <button
              type="button"
              onClick={() => router.back()}
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

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-slate-700">Setup readiness</div>
            <div className="text-sm text-slate-900">
              {readiness.okCount}/{readiness.total} configured
            </div>
          </div>
          <div className="h-2 w-48 rounded bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-amber-500"
              style={{ width: `${Math.round((readiness.okCount / readiness.total) * 100)}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Product Promotions</div>
            <div className={`text-xs ${readiness.promoOk ? "text-emerald-700" : "text-rose-700"}`}>
              {readiness.promoOk ? "Ready" : "Needs setup"}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Channel</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={promoChannel}
                onChange={(e) => setPromoChannel(e.target.value as PromoChannel)}
              >
                <option value="WhatsApp">WhatsApp</option>
                <option value="Email">Email</option>
                <option value="SMS">SMS</option>
                <option value="Facebook">Facebook</option>
                <option value="Instagram">Instagram</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Default discount (%)</div>
              <input
                type="number"
                min={0}
                max={90}
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
              />
            </label>
          </div>

          <label className="flex items-center gap-2 select-none">
            <input
              type="checkbox"
              checked={autoPromoteNewProducts}
              onChange={(e) => setAutoPromoteNewProducts(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm text-slate-800">Auto-promote newly created products</span>
          </label>

          {promoChannel === "WhatsApp" && (
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">WhatsApp business number</div>
              <input
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={whatsAppNumber}
                onChange={(e) => setWhatsAppNumber(e.target.value)}
                placeholder="e.g. +97798XXXXXXXX"
              />
            </label>
          )}

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Target customers with product highlights, discounts and new arrivals.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">API Integrations</div>
            <div className={`text-xs ${readiness.apiOk ? "text-emerald-700" : "text-rose-700"}`}>
              {readiness.apiOk ? "Ready" : "Needs setup"}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Provider</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={apiProvider}
                onChange={(e) => setApiProvider(e.target.value as ApiProvider)}
              >
                <option value="Custom">Custom API</option>
                <option value="Shopify">Shopify</option>
                <option value="WooCommerce">WooCommerce</option>
              </select>
            </label>
            <label className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Base URL</div>
              <input
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={apiBaseUrl}
                onChange={(e) => setApiBaseUrl(e.target.value)}
                placeholder="https://api.example.com"
              />
            </label>
          </div>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">API key</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Store this securely"
            />
          </label>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            For security, do not store API keys in frontend code. When you connect a real backend, save keys server-side.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Social Media Setup</div>
            <div className={`text-xs ${readiness.socialOk ? "text-emerald-700" : "text-rose-700"}`}>
              {readiness.socialOk ? "Ready" : "Needs setup"}
            </div>
          </div>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Facebook page URL</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={facebookPage}
              onChange={(e) => setFacebookPage(e.target.value)}
              placeholder="https://facebook.com/yourpage"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Instagram handle</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={instagramHandle}
              onChange={(e) => setInstagramHandle(e.target.value)}
              placeholder="@yourbrand"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">WhatsApp number</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={whatsAppNumber}
              onChange={(e) => setWhatsAppNumber(e.target.value)}
              placeholder="e.g. +97798XXXXXXXX"
            />
          </label>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Connect social channels to drive traffic to your products.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">SEO Setup</div>
            <div className={`text-xs ${readiness.seoOk ? "text-emerald-700" : "text-rose-700"}`}>
              {readiness.seoOk ? "Ready" : "Needs setup"}
            </div>
          </div>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Preset</div>
            <select
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={seoPreset}
              onChange={(e) => setSeoPreset(e.target.value as SeoPreset)}
            >
              <option value="Basic">Basic</option>
              <option value="Advanced">Advanced</option>
            </select>
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Site title</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={siteTitle}
              onChange={(e) => setSiteTitle(e.target.value)}
              placeholder="e.g. My Company Online Store"
            />
          </label>

          <label className="space-y-1">
            <div className="text-xs font-medium text-slate-700">Meta description</div>
            <input
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
              value={metaDescription}
              onChange={(e) => setMetaDescription(e.target.value)}
              placeholder="Short description for search engines"
            />
          </label>

          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
            Improve discoverability with good titles and descriptions.
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-slate-900">Online Orders</div>
            <div className={`text-xs ${readiness.ordersOk ? "text-emerald-700" : "text-rose-700"}`}>
              {readiness.ordersOk ? "Ready" : "Needs setup"}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="space-y-1 md:col-span-1">
              <div className="text-xs font-medium text-slate-700">Order processing mode</div>
              <select
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={ordersMode}
                onChange={(e) => setOrdersMode(e.target.value as OrdersMode)}
              >
                <option value="Disabled">Disabled</option>
                <option value="Receive Orders">Receive Orders</option>
                <option value="Receive + Auto-Create Sales Order">Receive + Auto-Create Sales Order</option>
              </select>
            </label>

            <label className="space-y-1 md:col-span-2">
              <div className="text-xs font-medium text-slate-700">Notification email</div>
              <input
                className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                value={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.value)}
                placeholder="e.g. orders@company.com"
              />
            </label>
          </div>

          <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            This page is a UI scaffold. If you confirm your backend endpoints, I can connect it to real promotion publishing and order ingestion.
          </div>
        </div>
      </div>
    </div>
  );
}
