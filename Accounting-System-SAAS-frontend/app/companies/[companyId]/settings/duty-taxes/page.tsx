"use client";

import { FormEvent, useState, useMemo, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useMenuAccess } from "@/components/MenuPermissionsContext";
import { IncentiveDepreciationSetupPanel } from "@/components/settings/IncentiveDepreciationSetupPanel";
import { RewardsManagementPanel } from "@/components/rewards/RewardsManagementPanel";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type DutyTax = {
  id: number;
  name: string;
  rate: number;
  purchase_rate: number | null;
  income_rate: number | null;
  tds_type: string | null;
  ledger_id: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type TdsCategory = {
  id: number;
  name: string;
  is_active: boolean;
};

type Ledger = { id: number; name: string; code: string | null; group_id: number | null };
type LedgerGroup = { id: number; name: string };

const extractErrorMessage = (detail: any, fallback: string): string => {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const msgs = detail
      .map((d) => (d && typeof d === "object" && "msg" in d ? (d as any).msg : JSON.stringify(d)))
      .filter(Boolean);
    if (msgs.length > 0) return msgs.join(", ");
  }
  return fallback;
};

const TDS_CATEGORIES_DEFAULT = ["Goods", "Service", "Rent", "Commission", "Contract", "Other"];

type DutyTaxesSection = "duties" | "incentive" | "rewards" | "depreciation";

export default function DutyTaxesPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const router = useRouter();

  const { canRead, canUpdate } = useMenuAccess("settings.duty-taxes");
  const rewardsAccess = useMenuAccess("performance.rewards");

  const [section, setSection] = useState<DutyTaxesSection>("duties");

  useEffect(() => {
    if (section === "rewards" && !rewardsAccess.canRead) {
      setSection("duties");
    }
  }, [section, rewardsAccess.canRead]);

  const { data: taxes, mutate, isLoading } = useSWR<DutyTax[]>(
    companyId ? `/companies/${companyId}/duty-taxes` : null,
    fetcher
  );

  const { data: tdsCategoriesData, mutate: mutateTdsCat } = useSWR<TdsCategory[]>(
    companyId ? `/companies/${companyId}/tds-categories` : null,
    fetcher
  );

  const { data: ledgers } = useSWR<Ledger[]>(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: ledgerGroups } = useSWR<LedgerGroup[]>(
    companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null,
    fetcher
  );

  // ── Form State ─────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState<DutyTax | TdsCategory | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [entryType, setEntryType] = useState<"TAX" | "TDS" | "TDS_CAT">("TAX");

  // Shared
  const [name, setName] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [ledgerGroupId, setLedgerGroupId] = useState("");
  const [ledgerId, setLedgerId] = useState("");

  // TAX-specific
  const [rate, setRate] = useState("");

  // TDS-specific
  const [purchaseRate, setPurchaseRate] = useState("");
  const [incomeRate, setIncomeRate] = useState("");
  const [tdsType, setTdsType] = useState("");

  // Custom TDS category creation
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState("");
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // All TDS categories: defaults + from existing entries + from API
  const allTdsCategories = useMemo(() => {
    const fromApi = (tdsCategoriesData || []).filter(c => c.is_active).map((c) => c.name);
    const fromDb = (taxes || [])
      .filter((dt) => !!dt.tds_type)
      .map((dt) => dt.tds_type as string);
    const merged = Array.from(
      new Set([...TDS_CATEGORIES_DEFAULT, ...fromDb, ...fromApi])
    );
    return merged.sort((a, b) => a.localeCompare(b));
  }, [taxes, tdsCategoriesData]);

  // Ledger group-filtered ledgers
  const filteredLedgers = useMemo(() => {
    if (!ledgers) return [];
    if (!ledgerGroupId) return ledgers;
    return ledgers.filter((l) => l.group_id === Number(ledgerGroupId));
  }, [ledgers, ledgerGroupId]);

  const detectType = (dt: DutyTax): "TAX" | "TDS" => (dt.tds_type ? "TDS" : "TAX");

  const openCreate = (type: "TAX" | "TDS" | "TDS_CAT" = "TAX") => {
    setEditing(null);
    setEntryType(type);
    setName("");
    setRate("");
    setPurchaseRate("");
    setIncomeRate("");
    setTdsType("");
    setLedgerGroupId("");
    setLedgerId("");
    setIsActive(true);
    setFormError(null);
    setShowNewCategory(false);
    setNewCategoryInput("");
    setIsFormOpen(true);
  };

  const openEdit = (obj: DutyTax | TdsCategory, type?: "TDS_CAT") => {
    setEditing(obj);
    if (type === "TDS_CAT") {
      setEntryType("TDS_CAT");
      setName(obj.name);
      setIsActive(obj.is_active);
      setFormError(null);
      setIsFormOpen(true);
      return;
    }
    
    const dt = obj as DutyTax;
    const detectedType = detectType(dt);
    setEntryType(detectedType);
    setName(dt.name);
    setRate(String(dt.rate));
    setPurchaseRate(dt.purchase_rate != null ? String(dt.purchase_rate) : "");
    setIncomeRate(dt.income_rate != null ? String(dt.income_rate) : "");
    setTdsType(dt.tds_type || "");
    // Try to find the ledger group from the ledger
    if (dt.ledger_id && ledgers) {
      const ldr = ledgers.find((l) => l.id === dt.ledger_id);
      setLedgerGroupId(ldr?.group_id ? String(ldr.group_id) : "");
    } else {
      setLedgerGroupId("");
    }
    setLedgerId(dt.ledger_id ? String(dt.ledger_id) : "");
    setIsActive(dt.is_active);
    setFormError(null);
    setIsFormOpen(true);
  };

  const resetForm = () => {
    setEditing(null);
    setIsFormOpen(false);
    setFormError(null);
    setShowNewCategory(false);
    setNewCategoryInput("");
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!companyId || !canUpdate) return;
    if (!name.trim()) { setFormError("Name is required."); return; }

    // Validation per type
    if (entryType === "TAX") {
      const rateNum = parseFloat(rate);
      if (isNaN(rateNum) || rateNum < 0) { setFormError("VAT Rate must be a valid non-negative number."); return; }
    }
    if (entryType === "TDS") {
      if (!tdsType) { setFormError("Please select a TDS Category."); return; }
      const pr = parseFloat(purchaseRate);
      const ir = parseFloat(incomeRate);
      if ((!purchaseRate && !incomeRate) || (purchaseRate && isNaN(pr)) || (incomeRate && isNaN(ir))) {
        setFormError("At least one TDS rate (Purchase or Income) is required."); return;
      }
    }

    setSaving(true);
    setFormError(null);
    try {
      if (entryType === "TDS_CAT") {
        const payload: any = {
          name: name.trim(),
          is_active: isActive,
        };
        if (editing) {
          await api.put(`/companies/${companyId}/tds-categories/${editing.id}`, payload);
        } else {
          await api.post(`/companies/${companyId}/tds-categories`, payload);
        }
        await mutateTdsCat();
        // Also refresh duty taxes since we might have renamed a category they use
        await mutate();
      } else {
        const payload: any = {
          name: name.trim(),
          rate: entryType === "TAX" ? parseFloat(rate) : 0,
          purchase_rate: entryType === "TDS" && incomeRate ? parseFloat(incomeRate) : null,
          income_rate: entryType === "TDS" && incomeRate ? parseFloat(incomeRate) : null,
          tds_type: entryType === "TDS" ? tdsType : null,
          ledger_id: ledgerId ? Number(ledgerId) : null,
          is_active: isActive,
        };
        if (editing) {
          await api.put(`/companies/${companyId}/duty-taxes/${editing.id}`, payload);
        } else {
          await api.post(`/companies/${companyId}/duty-taxes`, payload);
        }
        await mutate();
      }
      resetForm();
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setFormError(extractErrorMessage(detail, "Failed to save configuration."));
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (obj: DutyTax | TdsCategory, type?: "TDS_CAT") => {
    if (!companyId) return;
    if (!window.confirm(type === "TDS_CAT" ? `Delete "${obj.name}"?` : `Deactivate "${obj.name}"?`)) return;
    try {
      if (type === "TDS_CAT") {
        await api.delete(`/companies/${companyId}/tds-categories/${obj.id}`);
        await mutateTdsCat();
      } else {
        await api.delete(`/companies/${companyId}/duty-taxes/${obj.id}`);
        await mutate();
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Failed to perform action.");
    }
  };

  const list = taxes || [];
  const taxList = list.filter((dt) => !dt.tds_type);
  const tdsList = list.filter((dt) => !!dt.tds_type);

  const ledgerName = (id: number | null | undefined) => {
    if (!id) return null;
    return ledgers?.find((l) => l.id === id)?.name || `ID: ${id}`;
  };

  // ── Reusable Table ───────────────────────────────────────────────────────────
  const renderList = (items: any[], type: "TAX" | "TDS" | "TDS_CAT") => {
    if (isLoading) return <div className="p-4 text-xs text-slate-500">Loading...</div>;
    if (items.length === 0)
      return (
        <div className="p-4 text-xs text-slate-400 italic">
          No {type.replace("_", " ")} entries yet. Click &quot;New {type.replace("_", " ")}&quot; to add one.
        </div>
      );

    return (
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-900/80">
            <tr className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">
              <th className="text-left py-2 px-3 border-b dark:border-slate-700">Name</th>
              {type === "TAX" && (
                <th className="text-right py-2 px-3 border-b dark:border-slate-700">Rate (%)</th>
              )}
              {type === "TDS" && (
                <>
                  <th className="text-right py-2 px-3 border-b dark:border-slate-700">TDS Rate (%)</th>
                  <th className="text-left py-2 px-3 border-b dark:border-slate-700">Category</th>
                </>
              )}
              {type !== "TDS_CAT" && (
                <th className="text-left py-2 px-3 border-b dark:border-slate-700">Ledger</th>
              )}
              <th className="text-center py-2 px-3 border-b dark:border-slate-700">Status</th>
              <th className="text-center py-2 px-3 border-b dark:border-slate-700">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {items.map((dt) => (
              <tr key={dt.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors">
                <td className="py-2 px-3 font-semibold text-slate-800 dark:text-slate-200">{dt.name}</td>
                {type === "TAX" && (
                  <td className="py-2 px-3 text-right">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/50">
                      {dt.rate}%
                    </span>
                  </td>
                )}
                {type === "TDS" && (
                  <>
                    <td className="py-2 px-3 text-right font-mono">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {dt.income_rate ?? dt.purchase_rate ?? 0}%
                      </span>
                    </td>
                    <td className="py-2 px-3">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800/40">
                        {dt.tds_type}
                      </span>
                    </td>
                  </>
                )}
                {type !== "TDS_CAT" && (
                  <td className="py-2 px-3 text-slate-500 text-[11px]">
                    {ledgerName(dt.ledger_id) ?? <span className="italic text-slate-400">Not set</span>}
                  </td>
                )}
                <td className="py-2 px-3 text-center">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    dt.is_active
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40"
                      : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
                  }`}>
                    {dt.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="py-2 px-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => openEdit(dt, type === "TDS_CAT" ? "TDS_CAT" : undefined)}
                        className="px-2 py-0.5 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800 text-[10px] transition-colors"
                      >
                        Edit
                      </button>
                    )}
                    {canUpdate && (type === "TDS_CAT" || dt.is_active) && (
                      <button
                        type="button"
                        onClick={() => handleDeactivate(dt, type === "TDS_CAT" ? "TDS_CAT" : undefined)}
                        className="px-2 py-0.5 rounded border border-red-200 text-red-600 bg-white hover:bg-red-50 dark:bg-slate-900 dark:border-red-800 dark:text-red-400 text-[10px] transition-colors"
                      >
                        {type === "TDS_CAT" ? "Delete" : "Deactivate"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6 text-sm">
      {/* Hero Header */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
              <svg className="w-5 h-5 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100 tracking-tight">
                {section === "duties" && "Duties and Tax"}
                {section === "incentive" && "Incentive setup"}
                {section === "rewards" && "Rewards management"}
                {section === "depreciation" && "Depreciation rules"}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">
                {section === "duties" &&
                  "Configure VAT/Tax rates and TDS deduction settings. Each type links to a ledger for accounting entries."}
                {section === "incentive" &&
                  "Define sales incentive rules. Use Modify, then Save setup, to apply changes."}
                {section === "rewards" &&
                  "Grant points, bonuses, or badges and review reward history for your team."}
                {section === "depreciation" &&
                  "Configure depreciation methods and rates by asset category for fixed assets."}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {section === "duties" && canUpdate && (
              <>
                <button
                  type="button"
                  onClick={() => openCreate("TAX")}
                  className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  New TAX
                </button>
                <button
                  type="button"
                  onClick={() => openCreate("TDS")}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  New TDS
                </button>
                <button
                  type="button"
                  onClick={() => openCreate("TDS_CAT")}
                  className="px-4 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                  New Category
                </button>
              </>
            )}
            <button
              type="button"
              onClick={() => router.back()}
              className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
              Close
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-full md:w-fit">
        <button
          type="button"
          onClick={() => setSection("duties")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            section === "duties"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Duties &amp; Tax
        </button>
        <button
          type="button"
          onClick={() => setSection("incentive")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            section === "incentive"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Incentive setup
        </button>
        {rewardsAccess.canRead && (
          <button
            type="button"
            onClick={() => setSection("rewards")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              section === "rewards"
                ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            Rewards management
          </button>
        )}
        <button
          type="button"
          onClick={() => setSection("depreciation")}
          className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${
            section === "depreciation"
              ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm"
              : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Depreciation rules
        </button>
      </div>

      {!canRead ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-700">
          You do not have permission to view this page.
        </div>
      ) : section === "incentive" ? (
        <IncentiveDepreciationSetupPanel companyId={companyId} variant="embedded-incentive" />
      ) : section === "depreciation" ? (
        <IncentiveDepreciationSetupPanel companyId={companyId} variant="embedded-depreciation" />
      ) : section === "rewards" && rewardsAccess.canRead ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-950">
          <RewardsManagementPanel companyId={companyId} embedded />
        </div>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          {/* ── Lists Column ─────────────────────────────────────────────── */}
          <div className="space-y-5">
            {/* TAX List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" /></svg>
                  TAX / VAT
                </span>
                <p className="text-[10px] text-slate-400">Appears in Tax dropdown on bills/invoices</p>
              </div>
              {renderList(taxList, "TAX")}
            </div>

            {/* TDS List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/40">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 101.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" /></svg>
                  TDS
                </span>
                <p className="text-[10px] text-slate-400">Applied via &quot;Deduct TDS&quot; toggle in transactions</p>
              </div>
              {renderList(tdsList, "TDS")}
            </div>

            {/* TDS Categories List */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40">
                  <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" /></svg>
                  TDS Categories
                </span>
                <p className="text-[10px] text-slate-400">Manage categories used in TDS Configurations</p>
              </div>
              {renderList(tdsCategoriesData || [], "TDS_CAT")}
            </div>
          </div>

          {/* ── Form Column ──────────────────────────────────────────────── */}
          {canUpdate && isFormOpen && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-5 h-min">

              {/* Type Indicator Badge */}
              <div className="flex items-center justify-between mb-4 pb-3 border-b dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {editing ? `Edit: ${editing.name}` : `New ${entryType} Configuration`}
                </h2>
                <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[10px] font-black uppercase tracking-widest">
                  <button
                    type="button"
                    onClick={() => { setEntryType("TAX"); setTdsType(""); setPurchaseRate(""); setIncomeRate(""); }}
                    className={`px-4 py-1.5 transition-all ${entryType === "TAX" ? "bg-emerald-600 text-white" : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  >
                    TAX
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEntryType("TDS"); setRate("0"); }}
                    className={`px-4 py-1.5 transition-all ${entryType === "TDS" ? "bg-indigo-600 text-white" : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  >
                    TDS
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEntryType("TDS_CAT"); setRate("0"); setTdsType(""); }}
                    className={`px-4 py-1.5 transition-all ${entryType === "TDS_CAT" ? "bg-amber-600 text-white" : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"}`}
                  >
                    CATEGORY
                  </button>
                </div>
              </div>

              {formError && (
                <div className="mb-3 text-xs font-medium text-red-600 bg-red-50 border border-red-200 p-2 rounded-lg">{formError}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">

                {/* Name */}
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                    {entryType === "TAX" ? "Tax Name" : entryType === "TDS" ? "TDS Name" : "Category Name"} <span className="text-red-500">*</span>
                  </label>
                  <input
                    className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400 outline-none transition-all"
                    placeholder={entryType === "TAX" ? "e.g. VAT 13%, Non Taxable" : entryType === "TDS" ? "e.g. TDS on Service, TDS on Goods" : "e.g. Rent, Service, Commission"}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {entryType === "TAX" ? "Appears in the Tax dropdown on bills and invoices." : entryType === "TDS" ? "Used to match TDS deduction by category in transactions." : "Custom name for this TDS Category."}
                  </p>
                </div>

                {/* TAX-specific: Rate */}
                {entryType === "TAX" && (
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                      Tax Rate (%) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number" step="0.01" min="0" max="100"
                      className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                      placeholder="e.g. 13"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      required
                    />
                  </div>
                )}

                {/* TDS-specific fields */}
                {entryType === "TDS" && (
                  <>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        TDS Category <span className="text-red-500">*</span>
                      </label>

                      {/* Category select + New button on same row */}
                      <div className="flex gap-2">
                        <select
                          className="flex-1 h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-400 outline-none transition-all"
                          value={showNewCategory ? "__new__" : tdsType}
                          onChange={(e) => {
                            if (e.target.value === "__new__") {
                              setShowNewCategory(true);
                              setTdsType("");
                              setNewCategoryInput("");
                            } else {
                              setShowNewCategory(false);
                              setTdsType(e.target.value);
                            }
                          }}
                          required={!showNewCategory}
                        >
                          <option value="">Select category...</option>
                          {allTdsCategories.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                          <option value="__new__">➕ New Category...</option>
                        </select>

                        {/* Quick inline "New" trigger button */}
                        {!showNewCategory && (
                          <button
                            type="button"
                            title="Create a new TDS category"
                            onClick={() => { setShowNewCategory(true); setTdsType(""); setNewCategoryInput(""); }}
                            className="h-9 px-3 rounded-lg border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-800/40 text-xs font-bold transition-all flex items-center gap-1 whitespace-nowrap"
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            New
                          </button>
                        )}
                      </div>

                      {/* Inline new-category input panel */}
                      {showNewCategory && (
                        <div className="mt-2 flex gap-2 items-center p-2.5 rounded-lg border border-indigo-200 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20">
                          <input
                            autoFocus
                            type="text"
                            className="flex-1 h-8 border border-indigo-300 dark:border-indigo-600 rounded-md px-2.5 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-400 outline-none"
                            placeholder="e.g. Professional Fee, Interest..."
                            value={newCategoryInput}
                            onChange={(e) => setNewCategoryInput(e.target.value)}
                            onKeyDown={async (e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const val = newCategoryInput.trim();
                                if (!val) return;
                                try {
                                  const payload = { name: val, is_active: true };
                                  await api.post(`/companies/${companyId}/tds-categories`, payload);
                                  await mutateTdsCat();
                                  setTdsType(val);
                                  setShowNewCategory(false);
                                  setNewCategoryInput("");
                                } catch (err: any) {
                                  alert(err?.response?.data?.detail || "Failed to create category");
                                }
                              }
                              if (e.key === "Escape") {
                                setShowNewCategory(false);
                                setNewCategoryInput("");
                              }
                            }}
                          />
                          <button
                            type="button"
                            onClick={async () => {
                              const val = newCategoryInput.trim();
                              if (!val) return;
                              try {
                                const payload = { name: val, is_active: true };
                                await api.post(`/companies/${companyId}/tds-categories`, payload);
                                await mutateTdsCat();
                                setTdsType(val);
                                setShowNewCategory(false);
                                setNewCategoryInput("");
                              } catch (err: any) {
                                alert(err?.response?.data?.detail || "Failed to create category");
                              }
                            }}
                            className="h-8 px-3 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-all flex items-center gap-1 whitespace-nowrap"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                              <path d="M7.172 14.243a1 1 0 001.414 0L16 7.828a1 1 0 00-1.414-1.414L8 12.999l-2.586-2.585a1 1 0 10-1.414 1.414l3.172 3.172z" />
                            </svg>
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => { setShowNewCategory(false); setNewCategoryInput(""); }}
                            className="h-8 px-2 rounded-md border border-slate-300 dark:border-slate-600 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs transition-all"
                            title="Cancel"
                          >
                            ✕
                          </button>
                        </div>
                      )}

                      {/* Selected custom category badge */}
                      {tdsType && !showNewCategory && !TDS_CATEGORIES_DEFAULT.map(c => c).includes(tdsType) && (
                        <p className="mt-1 text-[10px] text-indigo-600 dark:text-indigo-400 font-medium">
                          Custom category: <span className="font-bold">{tdsType}</span>
                        </p>
                      )}

                      <p className="text-[10px] text-slate-400 mt-0.5">Matches against item category to auto-apply correct TDS rate.</p>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        TDS Rate (%) <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="number" step="0.01" min="0" max="100"
                        className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-indigo-400 outline-none transition-all"
                        placeholder="e.g. 1.5"
                        value={incomeRate}
                        onChange={(e) => setIncomeRate(e.target.value)}
                        required
                      />
                      <p className="text-[10px] text-slate-400 mt-0.5">This rate will be applied to both Purchase and Sales transactions.</p>
                    </div>
                  </>
                )}

                {entryType !== "TDS_CAT" && (
                  <>
                    {/* Input Ledger Group */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Input Ledger Group
                      </label>
                      <select
                        className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                        value={ledgerGroupId}
                        onChange={(e) => { setLedgerGroupId(e.target.value); setLedgerId(""); }}
                      >
                        <option value="">All Groups (no filter)</option>
                        {(ledgerGroups || []).map((lg) => (
                          <option key={lg.id} value={lg.id}>{lg.name}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">Select a group to filter the ledger list below.</p>
                    </div>

                    {/* Input Ledger */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        Input Ledger
                      </label>
                      <select
                        className="w-full h-9 border border-slate-200 dark:border-slate-700 rounded-lg px-3 text-xs bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-400 outline-none transition-all"
                        value={ledgerId}
                        onChange={(e) => setLedgerId(e.target.value)}
                      >
                        <option value="">None (no ledger mapping)</option>
                        {filteredLedgers.map((l) => (
                          <option key={l.id} value={l.id}>{l.name}{l.code ? ` (${l.code})` : ""}</option>
                        ))}
                      </select>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {entryType === "TAX" ? "Tax amount on VAT bills will be posted to this ledger." : "TDS deduction amount will be credited to this ledger."}
                      </p>
                    </div>
                  </>
                )}

                {/* Active Toggle */}
                <div className="flex items-center gap-2">
                  <input
                    id="dt-active"
                    type="checkbox"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 focus:ring-emerald-500 rounded border-slate-300"
                  />
                  <label htmlFor="dt-active" className="text-xs text-slate-700 dark:text-slate-300 font-medium">Active</label>
                </div>

                {/* Form Actions */}
                <div className="flex gap-2 pt-2 border-t dark:border-slate-800">
                  <button
                    type="submit"
                    disabled={saving}
                    className={`px-5 py-2 rounded-lg text-white text-xs font-semibold shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2 ${
                      entryType === "TAX" ? "bg-emerald-600 hover:bg-emerald-700" : entryType === "TDS" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {saving ? (
                      <span className="inline-flex h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/50 border-t-transparent" />
                    ) : (
                      <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path d="M7.172 14.243a1 1 0 001.414 0L16 7.828a1 1 0 00-1.414-1.414L8 12.999l-2.586-2.585a1 1 0 10-1.414 1.414l3.172 3.172z" /></svg>
                    )}
                    {saving ? "Saving..." : editing ? `Update ${entryType}` : `Create ${entryType}`}
                  </button>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:border-slate-600 dark:hover:bg-slate-800 text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Empty state when form is closed */}
          {canUpdate && !isFormOpen && (
            <div className="rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 p-8 flex flex-col items-center justify-center gap-4 text-center">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40">
                  <svg className="w-5 h-5 text-emerald-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
                  <svg className="w-5 h-5 text-indigo-500" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6.672 1.911a1 1 0 10-1.932.518l.259.966a1 1 0 001.932-.518l-.26-.966zM2.429 4.74a1 1 0 10-.517 1.932l.966.259a1 1 0 00.517-1.932l-.966-.26zm8.814-.569a1 1 0 00-1.415-1.414l-.707.707a1 1 0 101.415 1.415l.707-.708zm-7.071 7.072l.707-.707A1 1 0 003.465 9.12l-.708.707a1 1 0 101.415 1.415zm3.2-5.171a1 1 0 00-1.3 1.3l4 10a1 1 0 001.823.075l1.38-2.759 3.018 3.02a1 1 0 001.414-1.415l-3.019-3.02 2.76-1.379a1 1 0 00-.076-1.822l-10-4z" clipRule="evenodd" /></svg>
                </div>
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">Create a Tax or TDS Configuration</p>
                <p className="text-xs text-slate-400 mt-1">Use the <strong className="text-emerald-600">New TAX</strong> or <strong className="text-indigo-600">New TDS</strong> buttons above to get started.</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
