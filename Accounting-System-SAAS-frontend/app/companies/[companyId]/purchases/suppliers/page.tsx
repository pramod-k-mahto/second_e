"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api, getDefaultLedgers, DefaultLedgersMap } from "@/lib/api";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type Role = "user" | "admin" | "superadmin";

type MenuAccessLevel = "deny" | "read" | "update" | "full";

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
  parent_id: number | null;
  sort_order: number | null;
  is_active: boolean;
};

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

export default function SuppliersPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;

  const { data: currentUser } = useSWR("/auth/me", (url: string) =>
    api.get(url).then((res) => res.data)
  );
  const currentRole = (currentUser?.role as Role | undefined) || "user";
  const isSuperAdmin = currentRole === "superadmin";

  const { data: suppliers, mutate } = useSWR(
    companyId ? `/companies/${companyId}/suppliers` : null,
    fetcher
  );
  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: remoteDefaultLedgers } = useSWR<DefaultLedgersMap | null>(
    companyId ? `/companies/${companyId}/default-ledgers` : null,
    fetcher
  );

  const numericCompanyId = companyId ? Number(companyId) : null;
  const [localDefaultLedgers, setLocalDefaultLedgers] = useState<DefaultLedgersMap | null>(null);

  useEffect(() => {
    if (!numericCompanyId) return;
    const existing = getDefaultLedgers(numericCompanyId);
    if (existing) {
      setLocalDefaultLedgers(existing);
    }
  }, [numericCompanyId]);

  const { data: menus } = useSWR<MenuRead[]>(
    companyId ? "/admin/users/menus" : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: userMenuAccess } = useSWR<UserMenuAccessEntry[]>(
    currentUser && companyId
      ? `/admin/users/${currentUser.id}/companies/${companyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const accessLevelByMenuId = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || "full";
      });
    }
    return map;
  }, [userMenuAccess]);

  const accessLevelByCode: Record<string, MenuAccessLevel> = useMemo(() => {
    const map: Record<string, MenuAccessLevel> = {};
    if (menus) {
      menus.forEach((m) => {
        if (!m.code) return;
        const level = accessLevelByMenuId[m.id];
        map[m.code] = level || "full";
      });
    }
    return map;
  }, [menus, accessLevelByMenuId]);

  const getAccessLevel = (menuCode: string): MenuAccessLevel => {
    if (isSuperAdmin) return "full";
    return accessLevelByCode[menuCode] ?? "full";
  };

  // Suppliers maintenance permissions (purchases.suppliers menu)
  const suppliersAccessLevel = getAccessLevel("purchases.suppliers");
  const canCreateOrEditSuppliers =
    suppliersAccessLevel === "update" || suppliersAccessLevel === "full";
  const canDeleteSuppliers = suppliersAccessLevel === "full";

  const [name, setName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [mobile, setMobile] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState("");
  const [supplierType, setSupplierType] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [rating, setRating] = useState("");

  const [country, setCountry] = useState("");
  const [stateName, setStateName] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [area, setArea] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const [bankName, setBankName] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [branchName, setBranchName] = useState("");
  const [ifscSwift, setIfscSwift] = useState("");
  const [preferredPaymentMode, setPreferredPaymentMode] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [creditDays, setCreditDays] = useState("");

  const [vatGstNumber, setVatGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [registrationType, setRegistrationType] = useState("");
  const [hsnSacRelevancy, setHsnSacRelevancy] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);
  const [taxExemptNote, setTaxExemptNote] = useState("");

  const [productCategories, setProductCategories] = useState("");
  const [deliveryTerms, setDeliveryTerms] = useState("");
  const [deliveryTermsOther, setDeliveryTermsOther] = useState("");
  const [returnPolicy, setReturnPolicy] = useState("");

  const [notes, setNotes] = useState("");
  const [documents, setDocuments] = useState("");

  const [sortBy, setSortBy] = useState<"id" | "name" | "city" | "status">("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  // Optional advanced usage: allow manually linking to an existing payable ledger.
  const [ledgerId, setLedgerId] = useState("");
  const [useCustomLedger, setUseCustomLedger] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<
    "BASIC" | "ADDRESS" | "BANKING" | "TAX" | "BUSINESS" | "ADDITIONAL" | "ACCOUNTING"
  >("BASIC");
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [viewingSupplier, setViewingSupplier] = useState<any | null>(null);

  const [supplierPage, setSupplierPage] = useState(1);

  const defaultLedgers: DefaultLedgersMap | null = remoteDefaultLedgers || localDefaultLedgers;
  const suppliersDefaultLedger = defaultLedgers?.SUPPLIERS;

  const startEdit = (s: any) => {
    setEditingId(s.id);
    setName(s.name || "");
    setContactPerson(s.contact_person || "");
    setMobile(s.mobile || "");
    setPhone(s.phone || "");
    setEmail(s.email || "");
    setWebsite(s.website || "");
    setSupplierType(s.supplier_type || "");
    setIsActive(s.is_active !== false);
    setRating(s.rating != null ? String(s.rating) : "");

    setCountry(s.country || "");
    setStateName(s.state || "");
    setDistrict(s.district || "");
    setCity(s.city || "");
    setArea(s.area || "");
    setStreetAddress(s.street_address || "");
    setPostalCode(s.postal_code || "");

    setBankName(s.bank_name || "");
    setAccountHolderName(s.account_holder_name || "");
    setAccountNumber(s.account_number || "");
    setBranchName(s.branch_name || "");
    setIfscSwift(s.ifsc_swift_routing_number || "");
    setPreferredPaymentMode(s.preferred_payment_mode || "");
    setCreditLimit(s.credit_limit != null ? String(s.credit_limit) : "");
    setCreditDays(s.credit_days != null ? String(s.credit_days) : "");

    setVatGstNumber(s.vat_gst_number || "");
    setPanNumber(s.pan_number || "");
    setRegistrationType(s.registration_type || "");
    setHsnSacRelevancy(s.hsn_sac_relevancy || "");
    setTaxExempt(Boolean(s.tax_exempt));
    setTaxExemptNote(s.tax_exempt ? s.notes || "" : "");

    setProductCategories(s.product_categories || "");
    setDeliveryTerms(s.delivery_terms || "");
    setDeliveryTermsOther("");
    setReturnPolicy(s.return_policy || "");

    setNotes(s.notes || "");
    setDocuments(s.documents || "");

    const existingLedgerId = s.ledger_id ? String(s.ledger_id) : "";
    const defaultSuppliersLedgerId = suppliersDefaultLedger?.id
      ? String(suppliersDefaultLedger.id)
      : null;
    if (defaultSuppliersLedgerId && existingLedgerId && existingLedgerId !== defaultSuppliersLedgerId) {
      setUseCustomLedger(true);
      setLedgerId(existingLedgerId);
    } else {
      setUseCustomLedger(false);
      setLedgerId("");
    }
    setSubmitError(null);
    setActiveTab("BASIC");
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setContactPerson("");
    setMobile("");
    setPhone("");
    setEmail("");
    setWebsite("");
    setSupplierType("");
    setIsActive(true);
    setRating("");

    setCountry("");
    setStateName("");
    setDistrict("");
    setCity("");
    setArea("");
    setStreetAddress("");
    setPostalCode("");

    setBankName("");
    setAccountHolderName("");
    setAccountNumber("");
    setBranchName("");
    setIfscSwift("");
    setPreferredPaymentMode("");
    setCreditLimit("");
    setCreditDays("");

    setVatGstNumber("");
    setPanNumber("");
    setRegistrationType("");
    setHsnSacRelevancy("");
    setTaxExempt(false);
    setTaxExemptNote("");

    setProductCategories("");
    setDeliveryTerms("");
    setDeliveryTermsOther("");
    setReturnPolicy("");

    setNotes("");
    setDocuments("");
    setSubmitError(null);
    setActiveTab("BASIC");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;
    if (!canCreateOrEditSuppliers) {
      setSubmitError("You do not have permission to create or update suppliers.");
      return;
    }
    setSubmitting(true);
    setSubmitError(null);

    if (!name.trim()) {
      setSubmitError("Name is required");
      setSubmitting(false);
      return;
    }

    let ratingNumber: number | null = null;
    if (rating.trim()) {
      const r = Number(rating);
      if (!Number.isFinite(r) || r < 1 || r > 5) {
        setSubmitError("Rating must be between 1 and 5");
        setSubmitting(false);
        return;
      }
      ratingNumber = r;
    }

    const toStringOrNull = (v: string) => (v.trim() === "" ? null : v.trim());
    const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));

    const derivedDeliveryTerms =
      deliveryTerms === "OTHER" && deliveryTermsOther.trim()
        ? deliveryTermsOther.trim()
        : deliveryTerms || null;

    const payload: any = {
      name,
      contact_person: toStringOrNull(contactPerson),
      mobile: toStringOrNull(mobile),
      phone: toStringOrNull(phone),
      email: toStringOrNull(email),
      website: toStringOrNull(website),
      supplier_type: toStringOrNull(supplierType),
      is_active: isActive,
      rating: ratingNumber,

      country: toStringOrNull(country),
      state: toStringOrNull(stateName),
      district: toStringOrNull(district),
      city: toStringOrNull(city),
      area: toStringOrNull(area),
      street_address: toStringOrNull(streetAddress),
      postal_code: toStringOrNull(postalCode),

      bank_name: toStringOrNull(bankName),
      account_holder_name: toStringOrNull(accountHolderName),
      account_number: toStringOrNull(accountNumber),
      branch_name: toStringOrNull(branchName),
      ifsc_swift_routing_number: toStringOrNull(ifscSwift),
      preferred_payment_mode: toStringOrNull(preferredPaymentMode),
      credit_limit: toNumberOrNull(creditLimit),
      credit_days: toNumberOrNull(creditDays),

      vat_gst_number: toStringOrNull(vatGstNumber),
      pan_number: toStringOrNull(panNumber),
      registration_type: toStringOrNull(registrationType),
      hsn_sac_relevancy: toStringOrNull(hsnSacRelevancy),
      tax_exempt: taxExempt,

      product_categories: toStringOrNull(productCategories),
      delivery_terms: derivedDeliveryTerms,
      return_policy: toStringOrNull(returnPolicy),

      notes: toStringOrNull(notes || taxExemptNote),
      documents: toStringOrNull(documents),
    };

    // Advanced usage: only send ledger_id when user explicitly chooses a custom ledger.
    if (useCustomLedger && ledgerId) {
      payload.ledger_id = Number(ledgerId);
    }

    try {
      let createdData: any = null;
      if (editingId) {
        const res = await api.put(`/companies/${companyId}/suppliers/${editingId}`, payload);
        createdData = res?.data;
      } else {
        const res = await api.post(`/companies/${companyId}/suppliers`, payload);
        createdData = res?.data;
      }

      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        const separator = returnTo.includes('?') ? '&' : '?';
        router.push(`${returnTo}${separator}returning=true&newId=${createdData?.id}&type=SUPPLIER`);
        return;
      }

      resetForm();
      mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let message: string;
      if (typeof detail === "string") {
        if (detail.includes("Default 'Suppliers' ledger not found")) {
          message =
            "Default 'Suppliers' ledger not found. Please seed the default chart of accounts for this company.";
        } else {
          message = detail;
        }
      } else {
        message = editingId ? "Failed to update supplier" : "Failed to create supplier";
      }
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    if (!canDeleteSuppliers) return;
    if (!confirm("Delete this supplier? This cannot be undone.")) return;
    try {
      await api.delete(`/companies/${companyId}/suppliers/${id}`);
      mutate();
    } catch (err) {
      // ignore
    }
  };

  const payableLedgers = (ledgers || []).filter((l: any) => {
    const name = (l.name || "") as string;
    const lower = name.toLowerCase();
    return (
      lower.includes("payable") ||
      lower.includes("creditor") ||
      lower.includes("supplier") ||
      lower.includes("sundry creditors")
    );
  });

  const sundryCreditorLedger = (payableLedgers || []).find((l: any) => {
    const name = (l.name || "") as string;
    const lower = name.toLowerCase();
    return lower.includes("sundry creditor");
  });

  const sundryCreditorPayableLedgers = (payableLedgers || []).filter((l: any) => {
    const name = (l.name || "") as string;
    const groupName = ((l.group_name || l.groupName || "") as string).toLowerCase();
    const lower = name.toLowerCase();
    return (
      lower.includes("sundry creditor") ||
      groupName.includes("sundry creditor") ||
      groupName.includes("sundry creditors")
    );
  });

  const payableLedgersForDropdown =
    sundryCreditorPayableLedgers.length > 0 ? sundryCreditorPayableLedgers : payableLedgers;

  const payableLedgerOptions = useMemo(() => {
    const list = (payableLedgersForDropdown || []) as any[];
    if (!sundryCreditorLedger) return list;
    const exists = list.some((l: any) => l.id === sundryCreditorLedger.id);
    if (exists) return list;
    return [sundryCreditorLedger, ...list];
  }, [payableLedgersForDropdown, sundryCreditorLedger]);

  const ledgerDisplayFor = (id: number | null | undefined) => {
    if (!id) return "-";
    const match = (ledgers || []).find((l: any) => l.id === id);
    if (!match) return id;
    const name = (match.name || id) as string;
    const groupName = (match.group_name || match.groupName || "") as string;
    return groupName ? `${name} (${groupName})` : name;
  };

  useEffect(() => {
    if (
      !editingId &&
      !suppliersDefaultLedger &&
      !useCustomLedger &&
      !ledgerId &&
      sundryCreditorLedger
    ) {
      setUseCustomLedger(true);
      setLedgerId(String(sundryCreditorLedger.id));
    }
  }, [editingId, suppliersDefaultLedger, useCustomLedger, ledgerId, sundryCreditorLedger]);

  const cityOptions = useMemo(() => {
    const list = (suppliers || []) as any[];
    const cities = list
      .map((s) => (s.city || "").toString().trim())
      .filter((c) => c.length > 0);
    return Array.from(new Set(cities)).sort();
  }, [suppliers]);

  const filteredSuppliers = useMemo(() => {
    if (!suppliers || !Array.isArray(suppliers)) return [] as any[];
    const term = search.trim().toLowerCase();

    let list = suppliers as any[];

    list = list.filter((s: any) => {
      const nameVal = (s.name || "").toString().toLowerCase();
      const contactVal = (s.contact_person || "").toString().toLowerCase();
      const phoneVal = (s.phone || "").toString().toLowerCase();
      const mobileVal = (s.mobile || "").toString().toLowerCase();
      const emailVal = (s.email || "").toString().toLowerCase();

      if (term) {
        const matchesTerm =
          nameVal.includes(term) ||
          contactVal.includes(term) ||
          phoneVal.includes(term) ||
          mobileVal.includes(term) ||
          emailVal.includes(term);
        if (!matchesTerm) return false;
      }

      if (filterType && s.supplier_type !== filterType) return false;

      if (filterStatus === "active" && s.is_active === false) return false;
      if (filterStatus === "inactive" && s.is_active !== false) return false;

      if (filterCity && s.city !== filterCity) return false;

      return true;
    });

    const sorted = [...list].sort((a: any, b: any) => {
      let av: any;
      let bv: any;
      if (sortBy === "id") {
        av = a.id;
        bv = b.id;
      } else if (sortBy === "name") {
        av = (a.name || "").toString().toLowerCase();
        bv = (b.name || "").toString().toLowerCase();
      } else if (sortBy === "city") {
        av = (a.city || "").toString().toLowerCase();
        bv = (b.city || "").toString().toLowerCase();
      } else {
        const as = a.is_active === false ? "inactive" : "active";
        const bs = b.is_active === false ? "inactive" : "active";
        av = as;
        bv = bs;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [suppliers, search, filterType, filterStatus, filterCity, sortBy, sortDir]);

  const pageSize = 5;

  const toggleSort = (field: "id" | "name" | "city" | "status") => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
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
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Suppliers Master</h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                Manage your suppliers contacts and banking details.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                resetForm();
                setActiveTab("BASIC");
              }}
              disabled={!canCreateOrEditSuppliers}
              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              New Supplier
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.opener) {
                  window.close();
                  return;
                }
                const rt = searchParams.get('returnTo');
                if (rt) {
                  const separator = rt.includes('?') ? '&' : '?';
                  router.push(`${rt}${separator}returning=true`);
                } else {
                  router.push('/dashboard');
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10.707 3.293a1 1 0 010 1.414L6.414 9H17a1 1 0 110 2H6.414l4.293 4.293a1 1 0 01-1.414 1.414l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                if (typeof window !== "undefined" && window.opener) {
                  window.close();
                } else {
                  const rt = searchParams.get('returnTo');
                  if (rt) {
                    const separator = rt.includes('?') ? '&' : '?';
                    router.push(`${rt}${separator}returning=true`);
                  } else {
                    router.back();
                  }
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-1">
              {editingId ? "Edit Supplier" : "Create Supplier"}
            </div>
            <p className="text-[11px] text-slate-600">
              A separate ledger will be created under Sundry Creditors for this supplier so you can
              track their balance individually.
            </p>
          </div>
        </div>

        <div className="mt-1 border-b text-xs flex flex-wrap gap-2">
          {[
            { key: "BASIC", label: "Basic" },
            { key: "ADDRESS", label: "Address" },
            { key: "BANKING", label: "Banking" },
            { key: "TAX", label: "Tax" },
            { key: "BUSINESS", label: "Business" },
            { key: "ADDITIONAL", label: "Additional" },
            { key: "ACCOUNTING", label: "Accounting" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key as any)}
              className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === tab.key
                ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
                : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm mt-3">
          {activeTab === "BASIC" && (
            <div>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="block mb-1">Name *</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="block mb-1">Supplier Type</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={supplierType}
                    onChange={(e) => setSupplierType(e.target.value)}
                  >
                    <option value="">Select type</option>
                    <option value="Local">Local</option>
                    <option value="Import">Import</option>
                    <option value="Manufacturer">Manufacturer</option>
                    <option value="Distributor">Distributor</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1">Contact Person</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Mobile</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Phone</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1">Email</label>
                  <input
                    type="email"
                    className="w-full border rounded px-3 py-2"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Website</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={website}
                    onChange={(e) => setWebsite(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Rating (1–5)</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    className="w-full border rounded px-3 py-2"
                    value={rating}
                    onChange={(e) => setRating(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input
                  id="supplier-active"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                />
                <label htmlFor="supplier-active" className="text-xs">
                  Active
                </label>
              </div>
            </div>
          )}

          {activeTab === "ADDRESS" && (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1">Country</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">State</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={stateName}
                    onChange={(e) => setStateName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">District</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={district}
                    onChange={(e) => setDistrict(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block mb-1">City</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Area</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={area}
                    onChange={(e) => setArea(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Postal Code</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                  />
                </div>
              </div>
              <div className="mt-3">
                <label className="block mb-1">Street Address</label>
                <textarea
                  className="w-full border rounded px-3 py-2"
                  rows={3}
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                />
              </div>
            </>
          )}

          {activeTab === "BANKING" && (
            <>
              <div className="grid md:grid-cols-2 gap-3">
                <div>
                  <label className="block mb-1">Bank Name</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Account Holder Name</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={accountHolderName}
                    onChange={(e) => setAccountHolderName(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block mb-1">Account Number</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={accountNumber}
                    onChange={(e) => setAccountNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Branch Name</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={branchName}
                    onChange={(e) => setBranchName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">IFSC / SWIFT / Routing</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={ifscSwift}
                    onChange={(e) => setIfscSwift(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid md:grid-cols-3 gap-3 mt-3">
                <div>
                  <label className="block mb-1">Preferred Payment Mode</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={preferredPaymentMode}
                    onChange={(e) => setPreferredPaymentMode(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Cash">Cash</option>
                    <option value="Bank Transfer">Bank Transfer</option>
                    <option value="Cheque">Cheque</option>
                    <option value="Online">Online</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Credit Limit</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={creditLimit}
                    onChange={(e) => setCreditLimit(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Credit Days</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={creditDays}
                    onChange={(e) => setCreditDays(e.target.value)}
                  />
                </div>
              </div>
            </>
          )}

          {activeTab === "TAX" && (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                <div>
                  <label className="block mb-1">VAT / GST Number</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={vatGstNumber}
                    onChange={(e) => setVatGstNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">PAN Number</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={panNumber}
                    onChange={(e) => setPanNumber(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1">Registration Type</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={registrationType}
                    onChange={(e) => setRegistrationType(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="Regular">Regular</option>
                    <option value="Composition">Composition</option>
                    <option value="Unregistered">Unregistered</option>
                  </select>
                </div>
              </div>
              <div className="mt-3">
                <label className="block mb-1">HSN / SAC Relevancy</label>
                <input
                  className="w-full border rounded px-3 py-2"
                  value={hsnSacRelevancy}
                  onChange={(e) => setHsnSacRelevancy(e.target.value)}
                />
              </div>
              <div className="mt-3 flex items-start gap-2">
                <input
                  id="tax-exempt"
                  type="checkbox"
                  className="h-4 w-4 mt-1"
                  checked={taxExempt}
                  onChange={(e) => setTaxExempt(e.target.checked)}
                />
                <div className="flex-1">
                  <label htmlFor="tax-exempt" className="text-xs block mb-1">
                    Tax Exempt
                  </label>
                  {taxExempt && (
                    <textarea
                      className="w-full border rounded px-3 py-2 text-xs"
                      rows={3}
                      placeholder="Add tax exemption note or reason"
                      value={taxExemptNote}
                      onChange={(e) => setTaxExemptNote(e.target.value)}
                    />
                  )}
                </div>
              </div>
            </>
          )}

          {activeTab === "BUSINESS" && (
            <>
              <div>
                <label className="block mb-1">Product Categories (comma separated)</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-xs"
                  rows={3}
                  value={productCategories}
                  onChange={(e) => setProductCategories(e.target.value)}
                />
              </div>
              <div className="grid md:grid-cols-2 gap-3 mt-3">
                <div>
                  <label className="block mb-1">Delivery Terms</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={deliveryTerms}
                    onChange={(e) => setDeliveryTerms(e.target.value)}
                  >
                    <option value="">Select</option>
                    <option value="FOB">FOB</option>
                    <option value="CIF">CIF</option>
                    <option value="Local Delivery">Local Delivery</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                {deliveryTerms === "OTHER" && (
                  <div>
                    <label className="block mb-1">Delivery Terms (Other)</label>
                    <input
                      className="w-full border rounded px-3 py-2 text-xs"
                      value={deliveryTermsOther}
                      onChange={(e) => setDeliveryTermsOther(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="mt-3">
                <label className="block mb-1">Return Policy</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-xs"
                  rows={3}
                  value={returnPolicy}
                  onChange={(e) => setReturnPolicy(e.target.value)}
                />
              </div>
            </>
          )}

          {activeTab === "ADDITIONAL" && (
            <>
              <div>
                <label className="block mb-1">Notes</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-xs"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              <div className="mt-3">
                <label className="block mb-1">Documents (multi-line / JSON as text)</label>
                <textarea
                  className="w-full border rounded px-3 py-2 text-xs"
                  rows={4}
                  value={documents}
                  onChange={(e) => setDocuments(e.target.value)}
                />
              </div>
            </>
          )}

          {activeTab === "ACCOUNTING" && (
            <>
              <div className="space-y-2">
                <div>
                  <label className="block mb-1">Linked ledger (optional override)</label>
                  <div className="px-3 py-2 border rounded bg-slate-50 text-[11px] text-slate-700 mb-1">
                    By default, a separate ledger will be created under Sundry Creditors for this
                    supplier. You can optionally link to an existing payable ledger instead.
                  </div>
                  <label className="block mb-1 text-[11px]">Custom payable ledger (advanced)</label>
                  <select
                    className="w-full border rounded px-3 py-2 text-xs"
                    value={useCustomLedger ? ledgerId : ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (!val) {
                        setUseCustomLedger(false);
                        setLedgerId("");
                      } else {
                        setUseCustomLedger(true);
                        setLedgerId(val);
                      }
                    }}
                  >
                    <option value="">Use auto-created ledger (recommended)</option>
                    {payableLedgerOptions.map((l: any) => (
                      <option key={l.id} value={l.id}>
                        {sundryCreditorLedger && l.id === sundryCreditorLedger.id
                          ? `${l.name} (Sundry Creditors)`
                          : l.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Showing Sundry Creditor / payable ledgers only.
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={submitting || !canCreateOrEditSuppliers}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Saving…" : editingId ? "Update Supplier" : "Save Supplier"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm font-semibold transition-all duration-150"
              >
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3 text-xs">
          <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search suppliers..."
              className="w-full md:w-64 border rounded-lg px-3 py-2 border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              className="border rounded px-3 py-2 text-xs"
            >
              <option value="">All types</option>
              <option value="Local">Local</option>
              <option value="Import">Import</option>
              <option value="Manufacturer">Manufacturer</option>
              <option value="Distributor">Distributor</option>
              <option value="Other">Other</option>
            </select>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="border rounded px-3 py-2 text-xs"
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <select
              value={filterCity}
              onChange={(e) => setFilterCity(e.target.value)}
              className="border rounded px-3 py-2 text-xs"
            >
              <option value="">All cities</option>
              {cityOptions.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="text-[11px] text-slate-500">
          Total: {suppliers ? suppliers.length : 0} &nbsp;|&nbsp; Showing: {Math.min(filteredSuppliers.length, 5)}
        </div>
        <div className="mt-3 border rounded bg-slate-50">
          <div className="px-3 py-2 border-b text-[11px] text-slate-600 flex justify-between">
            <span>Suppliers Search</span>
            <span>
              Total: {suppliers ? (suppliers as any[]).length : 0} &nbsp;|&nbsp; Showing: {Math.min(filteredSuppliers.length, 5)}
            </span>
          </div>
          <div className="max-h-52 overflow-y-auto text-xs">
            {!suppliers ? (
              <div className="px-3 py-2 text-slate-500">Loading suppliers</div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="px-3 py-2 text-slate-500">No matching suppliers.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b bg-slate-100 text-[11px] text-slate-600">
                    <th
                      className="text-left py-1 px-2 w-12 cursor-pointer select-none"
                      onClick={() => toggleSort("id")}
                    >
                      ID{sortBy === "id" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                    <th
                      className="text-left py-1 px-2 cursor-pointer select-none"
                      onClick={() => toggleSort("name")}
                    >
                      Name{sortBy === "name" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                    <th className="text-left py-1 px-2">Contact</th>
                    <th className="text-left py-1 px-2">Mobile</th>
                    <th
                      className="text-left py-1 px-2 cursor-pointer select-none"
                      onClick={() => toggleSort("city")}
                    >
                      City{sortBy === "city" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                    <th
                      className="text-left py-1 px-2 cursor-pointer select-none"
                      onClick={() => toggleSort("status")}
                    >
                      Status{sortBy === "status" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                    </th>
                    <th className="text-left py-1 px-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSuppliers.slice(0, 5).map((s: any) => (
                    <tr key={s.id} className="border-b last:border-none">
                      <td className="py-1 px-2 text-[11px] text-slate-500">{s.id}</td>
                      <td className="py-1 px-2 font-medium">{s.name || "-"}</td>
                      <td className="py-1 px-2 text-slate-600">{s.contact_person || "-"}</td>
                      <td className="py-1 px-2 text-slate-600">{s.mobile || "-"}</td>
                      <td className="py-1 px-2 text-slate-600">{s.city || "-"}</td>
                      <td className="py-1 px-2 text-slate-600">
                        {s.is_active === false ? "Inactive" : "Active"}
                      </td>
                      <td className="py-1 px-2 whitespace-nowrap space-x-1">
                        <button
                          type="button"
                          onClick={() => setViewingSupplier(s)}
                          className="px-2 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-50"
                        >
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(s)}
                          className="px-2 py-0.5 rounded border border-slate-300 text-[11px] hover:bg-slate-50"
                          disabled={!canCreateOrEditSuppliers}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ledgerId = s.ledger_id;
                            if (!ledgerId) return;
                            const params = new URLSearchParams();
                            params.set("supplier_ledger_id", String(ledgerId));
                            if (s.name) {
                              params.set("supplier_name", String(s.name));
                            }
                            const base = `/companies/${companyId}/purchases/suppliers/vouchers`;
                            // Open in PURCHASE mode
                            const paramsPurchase = new URLSearchParams(params.toString());
                            paramsPurchase.set("type", "purchase");
                            const url = `${base}?${paramsPurchase.toString()}`;
                            router.push(url);
                          }}
                          className="px-2 py-0.5 rounded border border-emerald-300 text-[11px] text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!canCreateOrEditSuppliers}
                        >
                          Record Purchase
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const ledgerId = s.ledger_id;
                            if (!ledgerId) return;
                            const params = new URLSearchParams();
                            params.set("supplier_ledger_id", String(ledgerId));
                            if (s.name) {
                              params.set("supplier_name", String(s.name));
                            }
                            params.set("type", "PAYMENT");
                            const url = `/companies/${companyId}/purchases/suppliers/vouchers?${params.toString()}`;
                            router.push(url);
                          }}
                          className="px-2 py-0.5 rounded border border-blue-300 text-[11px] text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!canCreateOrEditSuppliers}
                        >
                          Record Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(s.id)}
                          className="px-2 py-0.5 rounded border border-red-300 text-[11px] text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                          disabled={!canDeleteSuppliers}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {viewingSupplier && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/40">
          <div className="w-full max-w-xl h-full bg-white shadow-xl p-4 overflow-y-auto text-sm">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-base font-medium">Supplier Details</div>
                <div className="text-xs text-slate-500 truncate">{viewingSupplier.name}</div>
              </div>
              <button
                type="button"
                className="text-xs text-slate-500 hover:text-slate-800"
                onClick={() => setViewingSupplier(null)}
              >
                Close
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Basic Details</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Name</div>
                    <div>{viewingSupplier.name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Contact Person</div>
                    <div>{viewingSupplier.contact_person || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Mobile</div>
                    <div>{viewingSupplier.mobile || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Phone</div>
                    <div>{viewingSupplier.phone || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Email</div>
                    <div>{viewingSupplier.email || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Website</div>
                    <div>{viewingSupplier.website || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Supplier Type</div>
                    <div>{viewingSupplier.supplier_type || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Rating</div>
                    <div>{viewingSupplier.rating != null ? `${viewingSupplier.rating}/5` : "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Status</div>
                    <div>{viewingSupplier.is_active === false ? "Inactive" : "Active"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Address / Location</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Country</div>
                    <div>{viewingSupplier.country || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">State</div>
                    <div>{viewingSupplier.state || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">District</div>
                    <div>{viewingSupplier.district || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">City</div>
                    <div>{viewingSupplier.city || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Area</div>
                    <div>{viewingSupplier.area || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Postal Code</div>
                    <div>{viewingSupplier.postal_code || "-"}</div>
                  </div>
                </div>
                <div className="mt-2 text-xs">
                  <div className="text-slate-500">Street Address</div>
                  <div>{viewingSupplier.street_address || "-"}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Banking & Payment</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Bank Name</div>
                    <div>{viewingSupplier.bank_name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Account Holder Name</div>
                    <div>{viewingSupplier.account_holder_name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Account Number</div>
                    <div>{viewingSupplier.account_number || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Branch Name</div>
                    <div>{viewingSupplier.branch_name || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">IFSC / SWIFT / Routing</div>
                    <div>{viewingSupplier.ifsc_swift_routing_number || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Preferred Payment Mode</div>
                    <div>{viewingSupplier.preferred_payment_mode || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Credit Limit</div>
                    <div>{viewingSupplier.credit_limit != null ? viewingSupplier.credit_limit : "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Credit Days</div>
                    <div>{viewingSupplier.credit_days != null ? viewingSupplier.credit_days : "-"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Tax & Compliance</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">VAT / GST Number</div>
                    <div>{viewingSupplier.vat_gst_number || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">PAN Number</div>
                    <div>{viewingSupplier.pan_number || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Registration Type</div>
                    <div>{viewingSupplier.registration_type || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">HSN / SAC Relevancy</div>
                    <div>{viewingSupplier.hsn_sac_relevancy || "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Tax Exempt</div>
                    <div>{viewingSupplier.tax_exempt ? "Yes" : "No"}</div>
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Business Details</div>
                <div className="text-xs">
                  <div className="text-slate-500">Product Categories</div>
                  <div>{viewingSupplier.product_categories || "-"}</div>
                </div>
                <div className="mt-2 text-xs">
                  <div className="text-slate-500">Delivery Terms</div>
                  <div>{viewingSupplier.delivery_terms || "-"}</div>
                </div>
                <div className="mt-2 text-xs">
                  <div className="text-slate-500">Return Policy</div>
                  <div>{viewingSupplier.return_policy || "-"}</div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Additional Info</div>
                <div className="text-xs">
                  <div className="text-slate-500">Notes</div>
                  <div>{viewingSupplier.notes || "-"}</div>
                </div>
                <div className="mt-2 text-xs">
                  <div className="text-slate-500">Documents</div>
                  <div className="whitespace-pre-wrap break-words max-h-40 overflow-auto border border-slate-100 rounded px-2 py-1">
                    {viewingSupplier.documents || "-"}
                  </div>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-slate-600 mb-1">Accounting / System</div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Linked ledger</div>
                    <div>
                      {`Linked ledger: ${ledgerDisplayFor(viewingSupplier.ledger_id)}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Tenant ID</div>
                    <div>{viewingSupplier.tenant_id != null ? viewingSupplier.tenant_id : "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Assigned Employee ID</div>
                    <div>
                      {viewingSupplier.assigned_employee_id != null
                        ? viewingSupplier.assigned_employee_id
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Created By</div>
                    <div>{viewingSupplier.created_by_id != null ? viewingSupplier.created_by_id : "-"}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Updated By</div>
                    <div>{viewingSupplier.updated_by_id != null ? viewingSupplier.updated_by_id : "-"}</div>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <div className="text-slate-500">Created At</div>
                    <div>
                      {viewingSupplier.created_at
                        ? new Date(viewingSupplier.created_at).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Updated At</div>
                    <div>
                      {viewingSupplier.updated_at
                        ? new Date(viewingSupplier.updated_at).toLocaleString()
                        : "-"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
