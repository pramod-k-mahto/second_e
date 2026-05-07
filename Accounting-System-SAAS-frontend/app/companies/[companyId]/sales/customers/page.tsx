"use client";

import useSWR from "swr";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { Input } from "@/components/ui/Input";

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

export default function CustomersPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string;

  const { data: currentUser } = useSWR("/auth/me", (url: string) =>
    api.get(url).then((res) => res.data)
  );
  const currentRole = (currentUser?.role as Role | undefined) || "user";
  const isSuperAdmin = currentRole === "superadmin";

  const { data: customers, mutate } = useSWR(
    companyId ? `/companies/${companyId}/customers` : null,
    fetcher
  );
  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

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

  // Customers maintenance permissions (sales.customers menu)
  const customersAccessLevel = getAccessLevel("sales.customers");
  const canCreateOrEditCustomers =
    customersAccessLevel === "update" || customersAccessLevel === "full";
  const canDeleteCustomers = customersAccessLevel === "full";

  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterCity, setFilterCity] = useState("all");
  const [filterAllowCredit, setFilterAllowCredit] = useState("all");

  const [activeTab, setActiveTab] = useState<
    | "basic"
    | "billing"
    | "shipping"
    | "tax"
    | "financial"
    | "preferences"
    | "crm"
    | "system"
  >("basic");

  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [customerType, setCustomerType] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [mobile, setMobile] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");

  const [billingAddress, setBillingAddress] = useState("");
  const [country, setCountry] = useState("");
  const [stateVal, setStateVal] = useState("");
  const [district, setDistrict] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [postalCode, setPostalCode] = useState("");

  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(false);
  const [shippingCity, setShippingCity] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [shippingPhone, setShippingPhone] = useState("");

  const [vatGstNumber, setVatGstNumber] = useState("");
  const [panNumber, setPanNumber] = useState("");
  const [registrationType, setRegistrationType] = useState("");
  const [taxExempt, setTaxExempt] = useState(false);

  const [creditLimit, setCreditLimit] = useState("");
  const [creditDays, setCreditDays] = useState("");
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [balanceType, setBalanceType] = useState("");

  const [priceLevel, setPriceLevel] = useState("");
  const [allowCredit, setAllowCredit] = useState(false);
  const [preferredDeliveryTime, setPreferredDeliveryTime] = useState("");
  const [preferredSalesPerson, setPreferredSalesPerson] = useState("");

  const [category, setCategory] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [lastPurchaseDate, setLastPurchaseDate] = useState("");
  const [notes, setNotes] = useState("");

  // Ledger is managed by the backend; we only display it in read-only views.
  const [tenantId, setTenantId] = useState<number | null>(null);
  const [createdById, setCreatedById] = useState<number | null>(null);
  const [updatedById, setUpdatedById] = useState<number | null>(null);
  const [createdAt, setCreatedAt] = useState("");
  const [updatedAt, setUpdatedAt] = useState("");

  const [viewingCustomer, setViewingCustomer] = useState<any | null>(null);

  const [sortBy, setSortBy] = useState<
    "id" | "name" | "city" | "category" | "allowCredit"
  >("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [customerPage, setCustomerPage] = useState(1);
  const [notifyingId, setNotifyingId] = useState<number | null>(null);

  const handleManualNotify = async (id: number) => {
    if (!companyId) return;
    setNotifyingId(id);
    try {
      await api.post(`/companies/${companyId}/notifications/manual`, {
        type: 'customer_statement',
        id: id
      });
      alert('Account statement notification sent successfully!');
    } catch (err: any) {
      console.error(err);
      alert(err?.response?.data?.detail || 'Failed to send notification');
    } finally {
      setNotifyingId(null);
    }
  };


  const distinctCustomerTypes = useMemo(() => {
    const setVals = new Set<string>();
    (customers || []).forEach((c: any) => {
      if (c.customer_type) setVals.add(c.customer_type);
    });
    return Array.from(setVals);
  }, [customers]);

  const distinctCategories = useMemo(() => {
    const setVals = new Set<string>();
    (customers || []).forEach((c: any) => {
      if (c.category) setVals.add(c.category);
    });
    return Array.from(setVals);
  }, [customers]);

  const distinctCities = useMemo(() => {
    const setVals = new Set<string>();
    (customers || []).forEach((c: any) => {
      if (c.city) setVals.add(c.city);
    });
    return Array.from(setVals);
  }, [customers]);

  const filteredCustomers = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = (customers || []) as any[];

    list = list.filter((c: any) => {
      const nameVal = (c.name || "").toString().toLowerCase();
      const contactVal = (c.contact_person || "").toString().toLowerCase();
      const mobileVal = (c.mobile || "").toString().toLowerCase();
      const emailVal = (c.email || "").toString().toLowerCase();

      const matchesSearch = !term
        ? true
        : nameVal.includes(term) ||
        contactVal.includes(term) ||
        mobileVal.includes(term) ||
        emailVal.includes(term);

      const matchesType =
        filterType === "all" || (c.customer_type || "").toString() === filterType;

      const matchesCategory =
        filterCategory === "all" || (c.category || "").toString() === filterCategory;

      const matchesCity =
        filterCity === "all" || (c.city || "").toString() === filterCity;

      const matchesAllowCredit =
        filterAllowCredit === "all"
          ? true
          : filterAllowCredit === "yes"
            ? !!c.allow_credit
            : !c.allow_credit;

      return (
        matchesSearch &&
        matchesType &&
        matchesCategory &&
        matchesCity &&
        matchesAllowCredit
      );
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
      } else if (sortBy === "category") {
        av = (a.category || "").toString().toLowerCase();
        bv = (b.category || "").toString().toLowerCase();
      } else {
        const as = a.allow_credit ? "yes" : "no";
        const bs = b.allow_credit ? "yes" : "no";
        av = as;
        bv = bs;
      }
      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [customers, search, filterType, filterCategory, filterCity, filterAllowCredit, sortBy, sortDir]);

  const pageSize = 5;
  const totalCustomerPages = Math.max(1, Math.ceil(filteredCustomers.length / pageSize));
  const currentCustomerPage = Math.min(customerPage, totalCustomerPages);
  const pagedCustomers = filteredCustomers.slice(
    (currentCustomerPage - 1) * pageSize,
    currentCustomerPage * pageSize
  );

  const toggleSort = (
    field: "id" | "name" | "city" | "category" | "allowCredit"
  ) => {
    if (sortBy === field) {
      setSortDir((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const startCreate = () => {
    setEditingId(null);
    setFormError(null);
    setActiveTab("basic");

    setName("");
    setCustomerType("");
    setContactPerson("");
    setMobile("");
    setPhone("");
    setEmail("");

    setBillingAddress("");
    setCountry("");
    setStateVal("");
    setDistrict("");
    setCity("");
    setAddress("");
    setPostalCode("");

    setShippingSameAsBilling(false);
    setShippingCity("");
    setShippingAddress("");
    setShippingPhone("");

    setVatGstNumber("");
    setPanNumber("");
    setRegistrationType("");
    setTaxExempt(false);

    setCreditLimit("");
    setCreditDays("");
    setDefaultPaymentMethod("");
    setOpeningBalance("");
    setBalanceType("");

    setPriceLevel("");
    setAllowCredit(false);
    setPreferredDeliveryTime("");
    setPreferredSalesPerson("");

    setCategory("");
    setRating(null);
    setLastPurchaseDate("");
    setNotes("");
    setTenantId(null);
    setCreatedById(null);
    setUpdatedById(null);
    setCreatedAt("");
    setUpdatedAt("");
  };

  const startEdit = (c: any) => {
    setEditingId(c.id);
    setFormError(null);
    setActiveTab("basic");

    setName(c.name || "");
    setCustomerType(c.customer_type || "");
    setContactPerson(c.contact_person || "");
    setMobile(c.mobile || "");
    setPhone(c.phone || "");
    setEmail(c.email || "");

    setBillingAddress(c.billing_address || "");
    setCountry(c.country || "");
    setStateVal(c.state || "");
    setDistrict(c.district || "");
    setCity(c.city || "");
    setAddress(c.address || "");
    setPostalCode(c.postal_code || "");

    setShippingSameAsBilling(!!c.shipping_address_same_as_billing);
    setShippingCity(c.shipping_city || "");
    setShippingAddress(c.shipping_address || "");
    setShippingPhone(c.shipping_phone || "");

    setVatGstNumber(c.vat_gst_number || "");
    setPanNumber(c.pan_number || "");
    setRegistrationType(c.registration_type || "");
    setTaxExempt(!!c.tax_exempt);

    setCreditLimit(
      typeof c.credit_limit === "number" ? c.credit_limit.toFixed(2) : ""
    );
    setCreditDays(
      typeof c.credit_days === "number" ? String(c.credit_days) : ""
    );
    setDefaultPaymentMethod(c.default_payment_method || "");
    setOpeningBalance(
      typeof c.opening_balance === "number" ? c.opening_balance.toFixed(2) : ""
    );
    setBalanceType(c.balance_type || "");

    setPriceLevel(c.price_level || "");
    setAllowCredit(!!c.allow_credit);
    setPreferredDeliveryTime(c.preferred_delivery_time || "");
    setPreferredSalesPerson(c.preferred_sales_person || "");

    setCategory(c.category || "");
    setRating(
      typeof c.rating === "number" && !Number.isNaN(c.rating)
        ? c.rating
        : null
    );
    setLastPurchaseDate(c.last_purchase_date || "");
    setNotes(c.notes || "");
    setTenantId(c.tenant_id ?? null);
    setCreatedById(c.created_by_id ?? null);
    setUpdatedById(c.updated_by_id ?? null);
    setCreatedAt(c.created_at || "");
    setUpdatedAt(c.updated_at || "");
  };

  const resetForm = () => {
    startCreate();
  };

  const handleDelete = async (id: number) => {
    if (!companyId) return;
    if (!canDeleteCustomers) return;
    if (!confirm("Delete this customer? This cannot be undone.")) return;
    try {
      await api.delete(`/companies/${companyId}/customers/${id}`);
      mutate();
    } catch (err) {
      // ignore
    }
  };

  const validateForm = () => {
    if (!name.trim()) {
      return "Name is required.";
    }

    if (rating !== null) {
      if (rating < 1 || rating > 5) {
        return "Rating must be between 1 and 5.";
      }
    }

    const hasOpeningBalance = openingBalance.trim() !== "";
    if (hasOpeningBalance && !balanceType) {
      return "Balance type is required when opening balance is set.";
    }

    return null;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId) return;

    if (!canCreateOrEditCustomers) {
      setFormError("You do not have permission to create or update customers.");
      return;
    }

    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const hasOpeningBalance = openingBalance.trim() !== "";
    const creditLimitNum = creditLimit.trim() === "" ? null : Number(creditLimit);
    const creditDaysNum = creditDays.trim() === "" ? null : Number(creditDays);
    const openingBalanceNum = hasOpeningBalance ? Number(openingBalance) : null;

    const payload: any = {
      name: name.trim(),
      customer_type: customerType || null,
      contact_person: contactPerson || null,
      mobile: mobile || null,
      phone: phone || null,
      email: email || null,

      billing_address: billingAddress || null,
      country: country || null,
      state: stateVal || null,
      district: district || null,
      city: city || null,
      address: address || null,
      postal_code: postalCode || null,

      shipping_address_same_as_billing: shippingSameAsBilling,
      shipping_city: shippingCity || null,
      shipping_address: shippingAddress || null,
      shipping_phone: shippingPhone || null,

      vat_gst_number: vatGstNumber || null,
      pan_number: panNumber || null,
      registration_type: registrationType || null,
      tax_exempt: taxExempt,

      credit_limit: creditLimitNum,
      credit_days: creditDaysNum,
      default_payment_method: defaultPaymentMethod || null,
      opening_balance: openingBalanceNum,
      balance_type: hasOpeningBalance ? balanceType || null : null,

      price_level: priceLevel || null,
      allow_credit: allowCredit,
      preferred_delivery_time: preferredDeliveryTime || null,
      preferred_sales_person: preferredSalesPerson || null,

      category: category || null,
      rating: rating,
      last_purchase_date: lastPurchaseDate || null,
      notes: notes || null,
    };

    if (shippingSameAsBilling) {
      if (!payload.shipping_city) {
        payload.shipping_city = payload.city;
      }
      if (!payload.shipping_address) {
        payload.shipping_address = payload.billing_address || payload.address;
      }
      if (!payload.shipping_phone) {
        payload.shipping_phone = payload.phone || payload.mobile;
      }
    }

    try {
      let createdData: any = null;
      if (editingId) {
        const res = await api.put(`/companies/${companyId}/customers/${editingId}`, payload);
        createdData = res?.data;
      } else {
        const res = await api.post(`/companies/${companyId}/customers`, payload);
        createdData = res?.data;
      }

      const returnTo = searchParams.get('returnTo');
      if (returnTo) {
        const separator = returnTo.includes('?') ? '&' : '?';
        router.push(`${returnTo}${separator}returning=true&newId=${createdData?.id}`);
        return;
      }

      startCreate();
      mutate();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let message: string;
      if (typeof detail === "string") {
        if (detail.includes("Default 'Customers' ledger not found")) {
          message =
            "Default 'Customers' ledger not found. Please seed the default chart of accounts for this company.";
        } else {
          message = detail;
        }
      } else {
        message = editingId ? "Failed to update customer." : "Failed to create customer.";
      }
      setFormError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const openView = (c: any) => {
    setViewingCustomer(c);
  };

  const closeView = () => {
    setViewingCustomer(null);
  };

  const renderRatingStars = (value: number | null | undefined) => {
    if (!value || value <= 0) return "-";
    const full = Math.max(1, Math.min(5, Math.round(value)));
    return `${full}/5`;
  };

  const ledgerNameFor = (id: number | null | undefined) => {
    if (!id) return "-";
    return ledgers?.find((l: any) => l.id === id)?.name || id;
  };

  const ledgerDisplayFor = (id: number | null | undefined) => {
    if (!id) return "-";
    const match = (ledgers || []).find((l: any) => l.id === id);
    if (!match) return id;
    const name = (match.name || id) as string;
    const groupName = (match.group_name || match.groupName || "") as string;
    return groupName ? `${name} (${groupName})` : name;
  };

  const formatDateTime = (val: string | null | undefined) => {
    if (!val) return "-";
    const d = new Date(val);
    if (Number.isNaN(d.getTime())) return val;
    return d.toLocaleString();
  };

  const formatDate = (val: string | null | undefined) => {
    if (!val) return "";
    return val.slice(0, 10);
  };

  return (<div className="space-y-6">
    {/* ── Hero Header ────────────────────────────────────────────────── */}
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
      <div className="h-[3px] w-full bg-gradient-to-r from-blue-500 via-indigo-500 to-purple-500" />
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">

        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
            <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">Customers Master</h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
              Manage your customer contacts and billing details.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={startCreate}
            disabled={!canCreateOrEditCustomers}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            New Customer
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
      <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-2">
        {editingId ? "Edit Customer" : "Create Customer"}
      </h2>
      <p className="text-xs text-slate-600 mb-3">
        A separate ledger will be created under Sundry Debtors for this customer so you can
        track their balance individually.
      </p>
      {formError && <div className="text-sm text-red-600 mb-2">{formError}</div>}

      <div className="border-b mb-4 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("basic")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "basic"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Basic Details
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("billing")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "billing"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Billing & Address
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("shipping")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "shipping"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Shipping
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("tax")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "tax"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Tax & Identification
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("financial")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "financial"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Financial & Payment
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("preferences")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "preferences"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Customer Preferences
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("crm")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "crm"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          CRM
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("system")}
          className={`px-3 py-1.5 border-b-2 transition-colors -mb-px ${activeTab === "system"
            ? "border-indigo-600 text-indigo-700 dark:text-indigo-400 font-semibold"
            : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300"
            }`}
        >
          Accounting / System
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 text-sm">
        {activeTab === "basic" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block mb-1 text-xs font-medium">
                Name<span className="text-red-500">*</span>
              </label>
              <input
                className="w-full border rounded px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Customer Type</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={customerType}
                onChange={(e) => setCustomerType(e.target.value)}
              >
                <option value="">Select type</option>
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Corporate">Corporate</option>
                <option value="School">School</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Contact Person</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={contactPerson}
                onChange={(e) => setContactPerson(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Mobile</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Phone</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Email</label>
              <input
                type="email"
                className="w-full border rounded px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
          </div>
        )}

        {activeTab === "billing" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block mb-1 text-xs font-medium">Billing Address</label>
              <textarea
                className="w-full border rounded px-3 py-2 min-h-[72px]"
                value={billingAddress}
                onChange={(e) => setBillingAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Country</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">State</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={stateVal}
                onChange={(e) => setStateVal(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">District</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">City</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block mb-1 text-xs font-medium">Address (Street)</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Postal Code</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
              />
            </div>
          </div>
        )}

        {activeTab === "shipping" && (
          <div className="space-y-4">
            <label className="flex items-center gap-2 text-xs font-medium">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={shippingSameAsBilling}
                onChange={(e) => setShippingSameAsBilling(e.target.checked)}
              />
              Shipping address same as billing
            </label>
            {!shippingSameAsBilling && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-xs font-medium">Shipping City</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={shippingCity}
                    onChange={(e) => setShippingCity(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block mb-1 text-xs font-medium">Shipping Phone</label>
                  <input
                    className="w-full border rounded px-3 py-2"
                    value={shippingPhone}
                    onChange={(e) => setShippingPhone(e.target.value)}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block mb-1 text-xs font-medium">Shipping Address</label>
                  <textarea
                    className="w-full border rounded px-3 py-2 min-h-[72px]"
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "tax" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium">VAT / GST Number</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={vatGstNumber}
                onChange={(e) => setVatGstNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">PAN Number</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={panNumber}
                onChange={(e) => setPanNumber(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Registration Type</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={registrationType}
                onChange={(e) => setRegistrationType(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={taxExempt}
                onChange={(e) => setTaxExempt(e.target.checked)}
              />
              <span className="text-xs font-medium">Tax Exempt</span>
            </div>
          </div>
        )}

        {activeTab === "financial" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium">Credit Limit</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded px-3 py-2"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Credit Days</label>
              <input
                type="number"
                className="w-full border rounded px-3 py-2"
                value={creditDays}
                onChange={(e) => setCreditDays(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Default Payment Method</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={defaultPaymentMethod}
                onChange={(e) => setDefaultPaymentMethod(e.target.value)}
              >
                <option value="">Select method</option>
                <option value="Cash">Cash</option>
                <option value="Bank Transfer">Bank Transfer</option>
                <option value="Card">Card</option>
                <option value="Cheque">Cheque</option>
                <option value="Online">Online</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Opening Balance</label>
              <input
                type="number"
                step="0.01"
                className="w-full border rounded px-3 py-2"
                value={openingBalance}
                onChange={(e) => setOpeningBalance(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Balance Type</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={balanceType}
                onChange={(e) => setBalanceType(e.target.value)}
                disabled={openingBalance.trim() === ""}
              >
                <option value="">Select</option>
                <option value="DEBIT">Debit</option>
                <option value="CREDIT">Credit</option>
              </select>
            </div>
          </div>
        )}

        {activeTab === "preferences" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium">Price Level</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={priceLevel}
                onChange={(e) => setPriceLevel(e.target.value)}
              >
                <option value="">Select level</option>
                <option value="Retail">Retail</option>
                <option value="Wholesale">Wholesale</option>
                <option value="Dealer">Dealer</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <input
                type="checkbox"
                className="rounded border-slate-300"
                checked={allowCredit}
                onChange={(e) => setAllowCredit(e.target.checked)}
              />
              <span className="text-xs font-medium">Allow Credit</span>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Preferred Delivery Time</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={preferredDeliveryTime}
                onChange={(e) => setPreferredDeliveryTime(e.target.value)}
              />
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Preferred Sales Person</label>
              <input
                className="w-full border rounded px-3 py-2"
                value={preferredSalesPerson}
                onChange={(e) => setPreferredSalesPerson(e.target.value)}
              />
            </div>
          </div>
        )}

        {activeTab === "crm" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium">Category</label>
              <select
                className="w-full border rounded px-3 py-2 text-xs"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select category</option>
                <option value="Hot Lead">Hot Lead</option>
                <option value="Regular">Regular</option>
                <option value="VIP">VIP</option>
                <option value="Dormant">Dormant</option>
                <option value="Other">Other</option>
              </select>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Rating (1f5)</label>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((val) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setRating(val)}
                    className={`w-7 h-7 border rounded text-xs flex items-center justify-center ${rating === val
                      ? "bg-yellow-400 border-yellow-500 text-black"
                      : "border-slate-300 text-slate-600"
                      }`}
                  >
                    {val}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setRating(null)}
                  className="ml-2 text-[11px] text-slate-500 underline"
                >
                  Clear
                </button>
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Last Purchase Date</label>
              <Input
                type="date"
                className="w-full border rounded px-3 py-2"
                value={lastPurchaseDate ? lastPurchaseDate.slice(0, 10) : ""}
                onChange={(e) => setLastPurchaseDate(e.target.value)}
                readOnly={!editingId}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block mb-1 text-xs font-medium">Notes</label>
              <textarea
                className="w-full border rounded px-3 py-2 min-h-[72px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>
        )}

        {activeTab === "system" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block mb-1 text-xs font-medium">Linked Ledger</label>
              <div className="px-3 py-2 border rounded bg-slate-50 text-xs text-slate-700">
                A separate ledger will be created under Sundry Debtors for this customer so you
                can track their balance individually.
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Tenant ID</label>
              <div className="px-3 py-2 border rounded bg-slate-50 text-xs text-slate-600">
                {tenantId ?? "-"}
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Created By</label>
              <div className="px-3 py-2 border rounded bg-slate-50 text-xs text-slate-600">
                {createdById ?? "-"}
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Updated By</label>
              <div className="px-3 py-2 border rounded bg-slate-50 text-xs text-slate-600">
                {updatedById ?? "-"}
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Created At</label>
              <div className="px-3 py-2 border rounded bg-slate-50 text-xs text-slate-600">
                {formatDateTime(createdAt)}
              </div>
            </div>
            <div>
              <label className="block mb-1 text-xs font-medium">Updated At</label>
              <div className="px-3 py-2 border rounded bg-slate-50 text-xs text-slate-600">
                {formatDateTime(updatedAt)}
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={submitting || !canCreateOrEditCustomers}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold shadow-sm transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Saving…" : editingId ? "Update Customer" : "Save Customer"}
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
      <div className="flex flex-col gap-3 mb-4 text-xs xl:flex-row xl:items-center xl:justify-between">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="border rounded-lg px-3 py-2 text-xs w-full sm:w-64 border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-all"
            placeholder="Search by name, contact, mobile, email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="border rounded px-2 py-1 text-xs"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Retail">Retail</option>
            <option value="Wholesale">Wholesale</option>
            <option value="Corporate">Corporate</option>
            <option value="School">School</option>
            <option value="Other">Other</option>
            {distinctCustomerTypes
              .filter(
                (t) =>
                  ![
                    "Retail",
                    "Wholesale",
                    "Corporate",
                    "School",
                    "Other",
                  ].includes(t)
              )
              .map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>
          <select
            className="border rounded px-2 py-1 text-xs"
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
          >
            <option value="all">All Categories</option>
            <option value="Hot Lead">Hot Lead</option>
            <option value="Regular">Regular</option>
            <option value="VIP">VIP</option>
            <option value="Dormant">Dormant</option>
            <option value="Other">Other</option>
            {distinctCategories
              .filter(
                (t) =>
                  !["Hot Lead", "Regular", "VIP", "Dormant", "Other"].includes(
                    t
                  )
              )
              .map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
          </select>
          <select
            className="border rounded px-2 py-1 text-xs"
            value={filterCity}
            onChange={(e) => setFilterCity(e.target.value)}
          >
            <option value="all">All Cities</option>
            {distinctCities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="border rounded px-2 py-1 text-xs"
            value={filterAllowCredit}
            onChange={(e) => setFilterAllowCredit(e.target.value)}
          >
            <option value="all">Credit: All</option>
            <option value="yes">Credit: Yes</option>
            <option value="no">Credit: No</option>
          </select>
        </div>
        <div className="text-[11px] text-slate-500">
          Total: {customers ? customers.length : 0} &nbsp;|&nbsp; Showing: {" "}
          {filteredCustomers.length === 0
            ? 0
            : (currentCustomerPage - 1) * pageSize + 1}
          {filteredCustomers.length > 0 && "-"}
          {filteredCustomers.length > 0
            ? Math.min(currentCustomerPage * pageSize, filteredCustomers.length)
            : ""}
        </div>
      </div>

      {!customers ? (
        <div className="text-sm text-slate-500">Loading...</div>
      ) : filteredCustomers.length === 0 ? (
        <div className="text-sm text-slate-500">No customers yet.</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-xs text-slate-600">
                  <th
                    className="text-left py-2 px-2 w-12 cursor-pointer select-none"
                    onClick={() => toggleSort("id")}
                  >
                    ID{sortBy === "id" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th
                    className="text-left py-2 px-2 cursor-pointer select-none"
                    onClick={() => toggleSort("name")}
                  >
                    Name{sortBy === "name" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="text-left py-2 px-2">Customer Type</th>
                  <th className="text-left py-2 px-2">Contact Person</th>
                  <th className="text-left py-2 px-2">Mobile</th>
                  <th className="text-left py-2 px-2">Email</th>
                  <th
                    className="text-left py-2 px-2 cursor-pointer select-none"
                    onClick={() => toggleSort("city")}
                  >
                    City{sortBy === "city" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th
                    className="text-left py-2 px-2 cursor-pointer select-none"
                    onClick={() => toggleSort("category")}
                  >
                    Category{sortBy === "category" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="text-left py-2 px-2">Rating</th>
                  <th
                    className="text-left py-2 px-2 cursor-pointer select-none"
                    onClick={() => toggleSort("allowCredit")}
                  >
                    Allow Credit{sortBy === "allowCredit" ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
                  </th>
                  <th className="text-left py-2 px-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pagedCustomers.map((c: any) => (
                  <tr key={c.id} className="border-b last:border-none text-xs">
                    <td className="py-2 px-2 text-[11px] text-slate-500">{c.id}</td>
                    <td className="py-2 px-2 font-medium">{c.name}</td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.customer_type || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.contact_person || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.mobile || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.email || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.city || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.category || "-"}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {renderRatingStars(c.rating)}
                    </td>
                    <td className="py-2 px-2 text-slate-600">
                      {c.allow_credit ? "Yes" : "No"}
                    </td>
                    <td className="py-2 px-2 space-x-1 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => openView(c)}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
                      >
                        View
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        disabled={!canCreateOrEditCustomers}
                        className="px-2 py-1 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={!canDeleteCustomers}
                        className="px-2 py-1 rounded border border-red-300 text-red-700 bg-white hover:bg-red-50 disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualNotify(c.id)}
                        disabled={notifyingId === c.id}
                        className="px-2 py-1 rounded border border-indigo-300 text-indigo-700 bg-white hover:bg-indigo-50 disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center gap-1"
                      >
                        {notifyingId === c.id ? (
                          <span className="inline-flex h-2.5 w-2.5 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                        ) : (
                          <svg className="w-2.5 h-2.5" viewBox="0 0 20 20" fill="currentColor"><path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" /></svg>
                        )}
                        Notify
                      </button>
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filteredCustomers.length > pageSize && (
            <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
              <div>
                Page {currentCustomerPage} of {totalCustomerPages}
              </div>
              <div className="space-x-2">
                <button
                  type="button"
                  onClick={() => setCustomerPage((p) => Math.max(1, p - 1))}
                  disabled={currentCustomerPage === 1}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Prev
                </button>
                <button
                  type="button"
                  onClick={() => setCustomerPage((p) => Math.min(totalCustomerPages, p + 1))}
                  disabled={currentCustomerPage === totalCustomerPages}
                  className="px-2 py-1 rounded border border-slate-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>

    {viewingCustomer && (
      <div className="fixed inset-0 z-40 flex">
        <div
          className="flex-1 bg-black/30"
          onClick={closeView}
        />
        <div className="w-full max-w-lg bg-white shadow-xl border-l border-slate-200 p-4 overflow-y-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">
                {viewingCustomer.name || "Customer"}
              </h2>
              <p className="text-xs text-slate-500">
                ID: {viewingCustomer.id}
              </p>
            </div>
            <button
              type="button"
              onClick={closeView}
              className="px-3 py-1 rounded border border-slate-300 text-xs"
            >
              Close
            </button>
          </div>

          <div className="space-y-4 text-xs">
            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                Basic Details
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Name</div>
                  <div className="font-medium">{viewingCustomer.name}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    Customer Type
                  </div>
                  <div>{viewingCustomer.customer_type || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Contact Person</div>
                  <div>{viewingCustomer.contact_person || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Mobile</div>
                  <div>{viewingCustomer.mobile || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Phone</div>
                  <div>{viewingCustomer.phone || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Email</div>
                  <div>{viewingCustomer.email || "-"}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                Billing & Address
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">
                    Billing Address
                  </div>
                  <div>{viewingCustomer.billing_address || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Country</div>
                  <div>{viewingCustomer.country || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">State</div>
                  <div>{viewingCustomer.state || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">District</div>
                  <div>{viewingCustomer.district || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">City</div>
                  <div>{viewingCustomer.city || "-"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">Address</div>
                  <div>{viewingCustomer.address || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Postal Code</div>
                  <div>{viewingCustomer.postal_code || "-"}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">Shipping</h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">
                    Same as billing
                  </div>
                  <div>
                    {viewingCustomer.shipping_address_same_as_billing
                      ? "Yes"
                      : "No"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Shipping City</div>
                  <div>{viewingCustomer.shipping_city || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Shipping Phone</div>
                  <div>{viewingCustomer.shipping_phone || "-"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">
                    Shipping Address
                  </div>
                  <div>{viewingCustomer.shipping_address || "-"}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                Tax & Identification
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">
                    VAT / GST Number
                  </div>
                  <div>{viewingCustomer.vat_gst_number || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">PAN Number</div>
                  <div>{viewingCustomer.pan_number || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    Registration Type
                  </div>
                  <div>{viewingCustomer.registration_type || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Tax Exempt</div>
                  <div>
                    {viewingCustomer.tax_exempt ? "Yes" : "No"}
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                Financial & Payment
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Credit Limit</div>
                  <div>
                    {typeof viewingCustomer.credit_limit === "number"
                      ? viewingCustomer.credit_limit.toFixed(2)
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Credit Days</div>
                  <div>{viewingCustomer.credit_days ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    Default Payment Method
                  </div>
                  <div>{viewingCustomer.default_payment_method || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    Opening Balance
                  </div>
                  <div>
                    {typeof viewingCustomer.opening_balance === "number"
                      ? viewingCustomer.opening_balance.toFixed(2)
                      : "-"}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    Balance Type
                  </div>
                  <div>{viewingCustomer.balance_type || "-"}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                Customer Preferences
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Price Level</div>
                  <div>{viewingCustomer.price_level || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Allow Credit</div>
                  <div>{viewingCustomer.allow_credit ? "Yes" : "No"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">
                    Preferred Delivery Time
                  </div>
                  <div>{viewingCustomer.preferred_delivery_time || "-"}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">
                    Preferred Sales Person
                  </div>
                  <div>{viewingCustomer.preferred_sales_person || "-"}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">CRM</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[11px] text-slate-500">Category</div>
                  <div>{viewingCustomer.category || "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Rating</div>
                  <div>{renderRatingStars(viewingCustomer.rating)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">
                    Last Purchase Date
                  </div>
                  <div>{formatDate(viewingCustomer.last_purchase_date)}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">Notes</div>
                  <div>{viewingCustomer.notes || "-"}</div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="font-semibold text-slate-700 mb-1">
                Accounting / System
              </h3>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <div className="text-[11px] text-slate-500">Linked ledger</div>
                  <div>
                    {`Linked ledger: ${ledgerDisplayFor(viewingCustomer.ledger_id)}`}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Tenant ID</div>
                  <div>{viewingCustomer.tenant_id ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Created By</div>
                  <div>{viewingCustomer.created_by_id ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Updated By</div>
                  <div>{viewingCustomer.updated_by_id ?? "-"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Created At</div>
                  <div>{formatDateTime(viewingCustomer.created_at)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-slate-500">Updated At</div>
                  <div>{formatDateTime(viewingCustomer.updated_at)}</div>
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
