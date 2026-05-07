"use client";

import useSWR from "swr";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState, ChangeEvent, WheelEvent } from "react";
import { api, getCurrentCompany, setCurrentCompany, CurrentCompany, getCompanyLogo, setCompanyLogo, setDefaultLedgers } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function CompaniesPage() {
  const router = useRouter();
  const { data, error, mutate } = useSWR("/companies/", fetcher);
  const { data: currentUser } = useSWR("/auth/me", fetcher);

  const [currentCompany, setCurrentCompanyState] = useState<CurrentCompany | null>(null);

  const [name, setName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoScale, setLogoScale] = useState(1);
  const [fiscalYearStart, setFiscalYearStart] = useState("");
  const [fiscalYearEnd, setFiscalYearEnd] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [businessType, setBusinessType] = useState("");
  const [country, setCountry] = useState("NP");
  const [currency, setCurrency] = useState("NPR");
  const [createDefaultChart, setCreateDefaultChart] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

  const role = (currentUser?.role as string | undefined)?.toLowerCase();
  const isAdminLike = role === "admin" || role === "superadmin";

  useEffect(() => {
    const cc = getCurrentCompany();
    setCurrentCompanyState(cc);
  }, []);

  const handleLogoFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setLogoUrl(result);
        setLogoScale(1);
      }
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        name,
        logo_url: logoUrl || null,
        fiscal_year_start: fiscalYearStart || null,
        fiscal_year_end: fiscalYearEnd || null,
        address: address || null,
        phone: phone || null,
        pan_number: panNumber || null,
        business_type: businessType || null,
        country: country || null,
        currency: currency || null,
      };

      if (editingId) {
        // edit existing
        await api.put(`/companies/${editingId}`, payload);
        setCompanyLogo(editingId, logoUrl || null);
      } else {
        // create new
        const res = await api.post("/companies", payload);
        const created = res?.data;
        const newId = created?.id;

        if (newId) {
          setCompanyLogo(newId, logoUrl || null);
        }

        if (createDefaultChart && newId) {
          try {
            await api.post(`/companies/${newId}/seed/default-chart`);
            const defaultsRes = await api.get(`/companies/${newId}/default-ledgers`);
            if (defaultsRes?.data) {
              setDefaultLedgers(newId, defaultsRes.data || {});
            }
          } catch {
            // ignore seeding/default-ledger errors; user can retry from company context
          }
        }
      }

      setName("");
      setLogoUrl("");
      setLogoScale(1);
      setFiscalYearStart("");
      setFiscalYearEnd("");
      setAddress("");
      setPhone("");
      setPanNumber("");
      setBusinessType("");
      setCountry("NP");
      setCurrency("NPR");

      setCreateDefaultChart(true);

      setEditingId(null);
      mutate();
    } catch (err: any) {
      setSubmitError(err?.response?.data?.detail || "Failed to save company");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this company? This cannot be undone.")) return;
    try {
      await api.delete(`/companies/${id}`);
      mutate();
    } catch (err) {
      // ignore; user will still see stale row until next refresh
    }
  };

  const handleOpenCompany = async (company: any) => {
    const fromBackend = company.logo_url ?? null;
    const fromLocal = getCompanyLogo(company.id);
    const logo = fromBackend || fromLocal || null;

    let calendarMode: "AD" | "BS" = "AD";
    try {
      const settingsRes = await api.get(`/companies/${company.id}/settings`);
      if (settingsRes?.data?.calendar_mode) {
        calendarMode = settingsRes.data.calendar_mode;
      }
    } catch (err) {
      console.warn("Failed to fetch company calendar settings, defaulting to AD", err);
    }

    const companyData: CurrentCompany = { 
      id: company.id, 
      name: company.name, 
      logo_url: logo,
      calendar_mode: calendarMode,
      fiscal_year_start: company.fiscal_year_start || null,
      fiscal_year_end: company.fiscal_year_end || null,
    };

    setCurrentCompany(companyData);
    setCurrentCompanyState(companyData);
    
    // Redirect to dashboard after setting company
    router.push(`/companies/${company.id}`);
  };

  const handleCloseCompany = () => {
    setCurrentCompany(null);
    setCurrentCompanyState(null);
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setName(c.name || "");

    const fromBackend = c.logo_url || "";
    const fromLocal = getCompanyLogo(c.id) || "";
    setLogoUrl(fromBackend || fromLocal || "");

    setFiscalYearStart(c.fiscal_year_start || "");
    setFiscalYearEnd(c.fiscal_year_end || "");
    setAddress(c.address || "");
    setPhone(c.phone || "");
    setPanNumber(c.pan_number || "");
    setBusinessType(c.business_type || "");
    setCountry(c.country || "NP");
    setCurrency(c.currency || "NPR");
    setShowForm(true);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setName("");

    setLogoUrl("");
    setLogoScale(1);

    setFiscalYearStart("");
    setFiscalYearEnd("");
    setAddress("");
    setPhone("");
    setPanNumber("");
    setBusinessType("");
    setCountry("NP");
    setCurrency("NPR");
    setCreateDefaultChart(true);

    setShowForm(false);
  };

  const startNew = () => {
    setEditingId(null);
    setName("");
    setLogoUrl("");
    setLogoScale(1);
    setFiscalYearStart("");
    setFiscalYearEnd("");
    setAddress("");
    setPhone("");
    setPanNumber("");
    setBusinessType("");
    setCountry("NP");
    setCurrency("NPR");
    setCreateDefaultChart(true);
    setShowForm(true);
  };

  const closeForm = () => {
    setEditingId(null);
    setName("");

    setLogoUrl("");
    setLogoScale(1);

    setFiscalYearStart("");
    setFiscalYearEnd("");
    setAddress("");
    setPhone("");
    setPanNumber("");
    setBusinessType("");
    setCountry("NP");
    setCurrency("NPR");
    setCreateDefaultChart(true);

    setShowForm(false);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Companies</h1>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 mr-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-indigo-500 hover:border-indigo-500 transition-all shadow-xs group"
                title="Go Back"
              >
                <svg className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="h-8 w-8 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-center text-slate-500 hover:text-rose-500 hover:border-rose-500 transition-all shadow-xs group"
                title="Close"
              >
                <svg className="w-4 h-4 transform group-hover:rotate-90 transition-transform" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isAdminLike && (
              <button
                type="button"
                onClick={startNew}
                className="px-3 py-1.5 rounded bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium h-8"
              >
                New
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="text-sm text-critical-600 mb-2">
            {error?.response?.data?.detail || 'Failed to load companies'}
          </div>
        )}

        <div className="bg-surface-light dark:bg-slate-900 shadow rounded border border-border-light dark:border-border-dark p-4">
          {!data ? (
            <div className="text-sm text-muted-light dark:text-muted-dark">Loading...</div>
          ) : data.length === 0 ? (
            <div className="text-sm text-muted-light dark:text-muted-dark">
              {isAdminLike
                ? 'No companies yet.'
                : "You don't have access to any companies. Please contact your administrator."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border-light dark:border-border-dark">
                  <th className="text-left py-2">Name</th>
                  <th className="text-left py-2">Fiscal Start</th>
                  <th className="text-left py-2">Fiscal End</th>
                  <th className="text-left py-2">Address</th>
                  <th className="text-left py-2">Phone</th>
                  <th className="text-left py-2">Country / Currency</th>
                  <th className="text-left py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.map((c: any) => {
                  const isCurrent = currentCompany && currentCompany.id === c.id;
                  return (
                    <tr key={c.id} className="border-b last:border-none">
                      <td className="py-2">
                        <div className="flex flex-col">
                          <span className="text-slate-900 dark:text-slate-50">{c.name}</span>
                          <span className="text-[11px] text-muted-light dark:text-muted-dark">ID: {c.id}</span>
                        </div>
                      </td>
                      <td className="py-2 text-xs text-muted-light dark:text-muted-dark">
                        {c.fiscal_year_start || "-"}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {c.fiscal_year_end || "-"}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {c.address || "-"}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {c.phone || "-"}
                      </td>
                      <td className="py-2 text-xs text-slate-500">
                        {c.country && c.currency ? `${c.country} / ${c.currency}` : "-"}
                      </td>
                      <td className="py-2 text-xs space-x-2">
                        {isCurrent ? (
                          <button
                            type="button"
                            onClick={handleCloseCompany}
                            className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 bg-surface-light dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            Close company
                          </button>
                        ) : (
                          <a
                            href={`/companies/${c.id}`}
                            onClick={() => handleOpenCompany(c)}
                            className="px-2 py-1 rounded bg-brand-600 text-white hover:bg-brand-700"
                          >
                            Open
                          </a>
                        )}
                        {isAdminLike && (
                          <>
                            <button
                              type="button"
                              onClick={() => startEdit(c)}
                              className="px-2 py-1 rounded border border-border-light dark:border-border-dark text-slate-700 dark:text-slate-200 bg-surface-light dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(c.id)}
                              className="px-2 py-1 rounded border border-critical-500/60 text-critical-600 bg-white hover:bg-red-50 dark:border-critical-500/70 dark:bg-slate-900 dark:text-critical-500 dark:hover:bg-red-950/30"
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isAdminLike && showForm && (
        <div className="fixed inset-0 z-40 flex items-stretch justify-end bg-black/30 dark:bg-black/40">
          <div className="relative h-full w-full max-w-lg bg-surface-light dark:bg-slate-950 shadow-xl border-l border-border-light dark:border-border-dark flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-light dark:border-border-dark">

              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-50">
                {editingId ? "Edit Company" : "Create Company"}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="text-xs px-2 py-1 rounded border border-border-light dark:border-border-dark text-slate-600 dark:text-slate-200 bg-surface-light dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                Close
              </button>
            </div>

            {submitError && (
              <div className="px-4 pt-3 text-sm text-critical-600">{submitError}</div>
            )}

            <div className="flex-1 overflow-y-auto px-4 py-3">
              <div className="rounded-lg border border-border-light dark:border-border-dark bg-white dark:bg-slate-950/40 px-4 py-4 shadow-sm space-y-4">

                <form onSubmit={handleSubmit} className="space-y-4 text-sm">
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Left column: core details */}
                    <div className="space-y-3">
                      <div>
                        <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Name</label>
                        <input
                          className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          required
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Fiscal Year Start</label>
                          <input
                            type="date"
                            className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                            value={fiscalYearStart}
                            onChange={(e) => setFiscalYearStart(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Fiscal Year End</label>
                          <input
                            type="date"
                            className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                            value={fiscalYearEnd}
                            onChange={(e) => setFiscalYearEnd(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Address</label>
                          <input
                            className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                            value={address}
                            onChange={(e) => setAddress(e.target.value)}
                          />
                        </div>
                        <div>
                          <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Phone</label>
                          <input
                            className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">PAN Number</label>
                        <input
                          className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                          value={panNumber}
                          onChange={(e) => setPanNumber(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Business Type</label>
                        <input
                          className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                          value={businessType}
                          onChange={(e) => setBusinessType(e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Country</label>
                          <select
                            className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                          >
                            <option value="">Select country</option>
                            <option value="NP">Nepal</option>
                          </select>
                        </div>
                        <div>
                          <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Currency</label>
                          <select
                            className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                          >
                            <option value="">Select currency</option>
                            <option value="NPR">Nepalese Rupee</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    {/* Right column: logo & chart info */}
                    <div className="space-y-3">
                      <div>
                        <label className="block mb-1 text-sm text-slate-800 dark:text-slate-100">Logo URL</label>
                        <input
                          className="w-full border border-border-light dark:border-border-dark rounded px-3 py-2 text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                          placeholder="https://example.com/logo.png"
                          value={logoUrl}
                          onChange={(e) => setLogoUrl(e.target.value)}
                        />
                        <div className="mt-2 flex items-center gap-3">
                          <label className="text-[11px] text-muted-light dark:text-muted-dark">
                            Or upload image:
                            <input
                              type="file"
                              accept="image/*"
                              className="mt-1 block text-[11px]"
                              onChange={handleLogoFileChange}
                            />
                          </label>
                          {logoUrl && (
                            <div className="flex items-center gap-2">
                              <div
                                className="w-10 h-10 flex items-center justify-center border border-border-light dark:border-border-dark rounded-full bg-white dark:bg-slate-900 overflow-hidden cursor-ns-resize"
                                onWheel={(e: WheelEvent<HTMLDivElement>) => {
                                  e.preventDefault();
                                  setLogoScale((prev) => {
                                    const delta = e.deltaY < 0 ? 0.1 : -0.1;
                                    const next = Math.min(2, Math.max(0.5, prev + delta));
                                    return next;
                                  });
                                }}
                                title="Scroll to resize preview"
                              >
                                <img
                                  src={logoUrl}
                                  alt="Logo preview"
                                  className="rounded-full object-cover"
                                  style={{ width: `${logoScale * 32}px`, height: `${logoScale * 32}px` }}
                                />
                              </div>
                              <div className="flex flex-col items-start gap-0.5 text-[10px] text-muted-light dark:text-muted-dark">
                                <span>Size</span>
                                <input
                                  type="range"
                                  min="0.5"
                                  max="2"
                                  step="0.1"
                                  value={logoScale}
                                  onChange={(e) => {
                                    const v = parseFloat(e.target.value);
                                    if (!Number.isNaN(v)) {
                                      setLogoScale(v);
                                    }
                                  }}
                                  className="w-24"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-start gap-2 text-xs text-muted-light dark:text-muted-dark">
                        <input
                          id="create-default-chart"
                          type="checkbox"
                          className="mt-0.5"
                          checked={createDefaultChart}
                          onChange={(e) => setCreateDefaultChart(e.target.checked)}
                        />
                        <label htmlFor="create-default-chart" className="space-y-0.5">
                          <span className="font-medium block">Create default chart of accounts (recommended)</span>
                          <span className="block text-muted-light dark:text-muted-dark">
                            Includes standard groups and ledgers like Cash, Bank, Sales, Purchase, VAT/Tax,
                            and common expenses and income.
                          </span>
                        </label>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 justify-end pt-3 mt-2 border-t border-border-light dark:border-border-dark">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 rounded bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
                    >
                      {submitting ? "Saving…" : "Save"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
