"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { api, fetcher, getApiErrorMessage } from '@/lib/api';
import { LedgerDrawerForm } from "../ledger/LedgerDrawerForm";
import { useToast } from "@/components/ui/Toast";
import { SearchableSelect, Option } from "@/components/ui/SearchableSelect";

export type IncentiveDepreciationSetupVariant =
  | "standalone"
  | "embedded-incentive"
  | "embedded-depreciation";

// ── Types ─────────────────────────────────────────────────────────────────────

type IncentiveRule = {
  id?: number;
  name: string;
  basis_type: "amount" | "qty" | "target_amount" | "target_qty";
  threshold_min: number;
  threshold_max: number | null;
  incentive_type: "fixed" | "percentage";
  incentive_value: number;
  sales_person_id: number | null;
  department_id: number | null;
  project_id: number | null;
  segment_id: number | null;
  item_id: number | null;
  ledger_id: number | null;
  is_active: boolean;
  _localId?: string;
};

type DepreciationRule = {
  id?: number;
  name: string;
  category: string | null;
  method: "straight_line" | "reducing_balance";
  rate_type: "fixed" | "percentage";
  rate_value: number;
  useful_life_years: number | null;
  is_active: boolean;
  _localId?: string;
};

function localId() { return Math.random().toString(36).slice(2, 9); }

const emptyIncentive = (): IncentiveRule => ({
  _localId: localId(), name: "", basis_type: "amount",
  threshold_min: 0, threshold_max: null, incentive_type: "percentage",
  incentive_value: 0, sales_person_id: null, department_id: null,
  project_id: null, segment_id: null, item_id: null, ledger_id: null, is_active: true,
});

const emptyDepreciation = (): DepreciationRule => ({
  _localId: localId(), name: "", category: "",
  method: "straight_line", rate_type: "percentage",
  rate_value: 0, useful_life_years: null, is_active: true,
});

const inp = "border border-slate-200 rounded px-2 py-1 text-xs outline-none focus:border-indigo-400 bg-white dark:bg-slate-900 dark:border-slate-700 w-full";
const sel = inp;
const key = (r: IncentiveRule | DepreciationRule) => r.id ? String(r.id) : (r._localId ?? "");

function SectionHeader({ icon, title, subtitle }: { icon: string; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <span className="text-base">{icon}</span>
      <div>
        <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</h2>
        <p className="text-[10px] text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

export function IncentiveDepreciationSetupPanel({
  companyId,
  variant = "standalone",
}: {
  companyId: string;
  variant?: IncentiveDepreciationSetupVariant;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const isStandalone = variant === "standalone";
  const [activeTab, setActiveTab] = useState<"incentive" | "depreciation">("incentive");
  const [isEditing, setIsEditing] = useState(false);

  const tab: "incentive" | "depreciation" = isStandalone
    ? activeTab
    : variant === "embedded-depreciation"
      ? "depreciation"
      : "incentive";

  useEffect(() => {
    if (!isStandalone) return;
    const q = searchParams?.get("tab");
    if (q === "depreciation") {
      setActiveTab("depreciation");
      return;
    }
    if (q === "incentive") {
      setActiveTab("incentive");
    }
  }, [searchParams, isStandalone]);

  // Remote data for dropdowns
  const { data: employees = [] } = useSWR(companyId ? `/payroll/companies/${companyId}/employees` : null, fetcher);
  const { data: departments = [] } = useSWR(companyId ? `/companies/${companyId}/departments` : null, fetcher);
  const { data: projects = [] } = useSWR(companyId ? `/companies/${companyId}/projects` : null, fetcher);
  const { data: segments = [] } = useSWR(companyId ? `/companies/${companyId}/segments` : null, fetcher);
  const { data: items = [] } = useSWR(companyId ? `/inventory/companies/${companyId}/items` : null, fetcher);
  const { data: ledgers = [], mutate: mutateLedgers } = useSWR(companyId ? `/ledgers/companies/${companyId}/ledgers` : null, fetcher);
  const { data: ledgerGroups = [] } = useSWR(companyId ? `/ledgers/companies/${companyId}/ledger-groups` : null, fetcher);

  const expenseLedgerOptions = useMemo<Option[]>(() => 
    (ledgers as any[])
      .filter(l => l.group_type === "EXPENSE")
      .map(l => ({
        value: String(l.id),
        label: l.name,
        sublabel: l.group_name || "Expense"
      })),
    [ledgers]
  );

  const { data: company, mutate: mutateCompany } = useSWR(companyId ? `/companies/${companyId}` : null, fetcher);

  const [showLedgerForm, setShowLedgerForm] = useState(false);
  const [ledgerTarget, setLedgerTarget] = useState<"default" | "override" | null>(null);

  // ── Backend data ────────────────────────────────────────────────────────────
  const incUrl = companyId ? `/companies/${companyId}/setup/incentives` : null;
  const deprUrl = companyId ? `/companies/${companyId}/setup/depreciation` : null;

  const { data: savedIncentives = [], mutate: mutateIncentives } = useSWR<IncentiveRule[]>(incUrl, fetcher);
  const { data: savedDeprRules = [], mutate: mutateDepr } = useSWR<DepreciationRule[]>(deprUrl, fetcher);

  // ── Incentive state ─────────────────────────────────────────────────────────
  const [incentiveRules, setIncentiveRules] = useState<IncentiveRule[]>([emptyIncentive()]);
  const [editingIncKey, setEditingIncKey] = useState<string>(key(incentiveRules[0]));

  useEffect(() => {
    if (savedIncentives.length > 0) {
      setIncentiveRules(savedIncentives.map(r => ({ ...r, _localId: localId() })));
      setEditingIncKey(String(savedIncentives[0].id));
    }
  }, [savedIncentives.length]);

  const editingIncentive = useMemo(() => incentiveRules.find(r => key(r) === editingIncKey) || null, [incentiveRules, editingIncKey]);

  function patchIncentive(k: string, patch: Partial<IncentiveRule>) {
    setIncentiveRules(prev => prev.map(r => key(r) === k ? { ...r, ...patch } : r));
  }
  function addIncentiveRule() {
    const rule = emptyIncentive();
    setIncentiveRules(prev => [...prev, rule]);
    setEditingIncKey(rule._localId!);
  }
  function removeIncentiveRule(k: string, id?: number) {
    if (id) {
      api.delete(`/companies/${companyId}/setup/incentives/${id}`)
        .then(() => { mutateIncentives(); showToast({ title: "Rule deleted", variant: "success" }); })
        .catch(() => showToast({ title: "Failed to delete", variant: "error" }));
    }
    setIncentiveRules(prev => {
      const next = prev.filter(r => key(r) !== k);
      const fallback = next.length === 0 ? [emptyIncentive()] : next;
      if (editingIncKey === k) setEditingIncKey(key(fallback[0]));
      return fallback;
    });
  }

  // ── Depreciation state ──────────────────────────────────────────────────────
  const [deprRules, setDeprRules] = useState<DepreciationRule[]>([emptyDepreciation()]);
  const [editingDeprKey, setEditingDeprKey] = useState<string>(key(deprRules[0]));

  useEffect(() => {
    if (savedDeprRules.length > 0) {
      setDeprRules(savedDeprRules.map(r => ({ ...r, _localId: localId() })));
      setEditingDeprKey(String(savedDeprRules[0].id));
    }
  }, [savedDeprRules.length]);

  const editingDepr = useMemo(() => deprRules.find(r => key(r) === editingDeprKey) || null, [deprRules, editingDeprKey]);

  function patchDepr(k: string, patch: Partial<DepreciationRule>) {
    setDeprRules(prev => prev.map(r => key(r) === k ? { ...r, ...patch } : r));
  }
  function addDeprRule() {
    const rule = emptyDepreciation();
    setDeprRules(prev => [...prev, rule]);
    setEditingDeprKey(rule._localId!);
  }
  function removeDeprRule(k: string, id?: number) {
    if (id) {
      api.delete(`/companies/${companyId}/setup/depreciation/${id}`)
        .then(() => { mutateDepr(); showToast({ title: "Rule deleted", variant: "success" }); })
        .catch(() => showToast({ title: "Failed to delete", variant: "error" }));
    }
    setDeprRules(prev => {
      const next = prev.filter(r => key(r) !== k);
      const fallback = next.length === 0 ? [emptyDepreciation()] : next;
      if (editingDeprKey === k) setEditingDeprKey(key(fallback[0]));
      return fallback;
    });
  }

  // ── Save ─────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    try {
      // Save all incentive rules (upsert)
      for (const rule of incentiveRules) {
        const payload = {
          name: rule.name || "Unnamed Rule",
          basis_type: rule.basis_type,
          threshold_min: Number(rule.threshold_min) || 0,
          threshold_max: rule.threshold_max != null ? Number(rule.threshold_max) : null,
          incentive_type: rule.incentive_type,
          incentive_value: Number(rule.incentive_value) || 0,
          sales_person_id: rule.sales_person_id ? Number(rule.sales_person_id) : null,
          department_id: rule.department_id ? Number(rule.department_id) : null,
          project_id: rule.project_id ? Number(rule.project_id) : null,
          segment_id: rule.segment_id ? Number(rule.segment_id) : null,
          item_id: rule.item_id ? Number(rule.item_id) : null,
          ledger_id: rule.ledger_id ? Number(rule.ledger_id) : null,
          is_active: rule.is_active,
        };
        if (rule.id) {
          await api.put(`/companies/${companyId}/setup/incentives/${rule.id}`, payload);
        } else {
          if (!rule.name) continue;
          await api.post(`/companies/${companyId}/setup/incentives`, payload);
        }
      }
      // Save all depreciation rules (upsert)
      for (const rule of deprRules) {
        const payload = {
          name: rule.name || "Unnamed Rule",
          category: rule.category || null,
          method: rule.method,
          rate_type: rule.rate_type,
          rate_value: Number(rule.rate_value) || 0,
          useful_life_years: rule.useful_life_years ? Number(rule.useful_life_years) : null,
          is_active: rule.is_active,
        };
        if (rule.id) {
          await api.put(`/companies/${companyId}/setup/depreciation/${rule.id}`, payload);
        } else {
          if (!rule.name) continue;
          await api.post(`/companies/${companyId}/setup/depreciation`, payload);
        }
      }

      // Save company default incentive ledger
      if (company) {
        await api.put(`/companies/${companyId}`, {
          default_incentive_expense_ledger_id: company.default_incentive_expense_ledger_id
        });
      }

      mutateIncentives();
      mutateDepr();
      mutateCompany();
      setIsEditing(false);
      showToast({ title: "Setup saved!", description: "All rules saved successfully.", variant: "success" });
    } catch (err: any) {
      showToast({ title: "Save failed", description: err?.response?.data?.detail || err?.message, variant: "error" });
    }
  };

  const handleLedgerSubmit = async (values: any) => {
    try {
      const payload = {
        name: values.name,
        group_id: Number(values.groupId),
        opening_balance: Number(values.openingBalance || 0),
        opening_balance_type: values.openingType === "CR" ? "CREDIT" : "DEBIT",
        email: values.email || null,
        phone: values.phone || null,
        address: values.address || null,
        is_active: true
      };

      const res = await api.post(`/ledgers/companies/${companyId}/ledgers`, payload);
      const newLedger = res.data;

      // Update local cache
      mutateLedgers([...ledgers, newLedger], false);
      
      // If it was triggered from a specific dropdown, select it
      if (ledgerTarget === "default" && company) {
        mutateCompany({ ...company, default_incentive_expense_ledger_id: newLedger.id }, false);
      } else if (ledgerTarget === "override" && editingIncentive) {
        patchIncentive(editingIncKey!, { ledger_id: newLedger.id });
      }

      setShowLedgerForm(false);
      setLedgerTarget(null);
      showToast({ title: "Ledger created!", description: "The new ledger is now available and selected.", variant: "success" });
    } catch (error: any) {
      showToast({ title: "Creation failed", description: getApiErrorMessage(error), variant: "error" });
    }
  };

  const toolbarButtons = (
    <>
      {!isEditing && (
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-2"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
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
            mutateIncentives();
            mutateDepr();
          }}
          className="px-4 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-semibold shadow-sm transition-all dark:bg-slate-900 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Cancel
        </button>
      )}
      <button
        type="button"
        onClick={handleSave}
        disabled={!isEditing}
        className="px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
      >
        💾 Save Setup
      </button>
    </>
  );

  return (
    <div className="space-y-3">
      {isStandalone && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="h-[3px] w-full bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500" />
          <div className="flex items-center justify-between px-4 py-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-50 border border-violet-100 text-base">⚙️</div>
              <div>
                <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Setup</h1>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">Sales Incentive &amp; Depreciation configuration</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {toolbarButtons}
              <button
                type="button"
                onClick={() => router.back()}
                className="px-3 py-1.5 border border-slate-300 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-700 rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2 dark:bg-slate-900 dark:border-slate-600 dark:text-slate-400"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {!isStandalone && (
        <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div
            className={`h-[3px] w-full ${
              variant === "embedded-depreciation"
                ? "bg-gradient-to-r from-orange-500 to-amber-500"
                : "bg-gradient-to-r from-violet-500 via-purple-500 to-pink-500"
            }`}
          />
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <div>
              <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {variant === "embedded-depreciation" ? "Depreciation rules" : "Incentive setup"}
              </h2>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                {variant === "embedded-depreciation"
                  ? "Methods and rates used for fixed asset depreciation."
                  : "Sales incentive rules linked to performance and filters."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">{toolbarButtons}</div>
          </div>
        </div>
      )}

      {isStandalone && (
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
          {(["incentive", "depreciation"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setActiveTab(t)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-all ${activeTab === t ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              {t === "incentive" ? "💰 Sales Incentive" : "📉 Depreciation Rules"}
            </button>
          ))}
        </div>
      )}

      {tab === "incentive" && (
        <div className="rounded-xl bg-violet-50/50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-800/50 p-3 mb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-base">🏢</span>
              <div>
                <h3 className="text-[11px] font-bold text-violet-900 dark:text-violet-300 uppercase tracking-wider">Company Default</h3>
                <p className="text-[10px] text-violet-600/70 dark:text-violet-400/60">Fallback expense ledger for all incentives</p>
              </div>
            </div>
            <div className="flex-1 max-w-xs">
              <SearchableSelect
                disabled={!isEditing}
                placeholder="Select Default Expense Ledger"
                searchInputPlaceholder="Search ledger..."
                value={company?.default_incentive_expense_ledger_id ? String(company.default_incentive_expense_ledger_id) : ""}
                onChange={(val) => {
                  if (val === "__NEW__") {
                    setLedgerTarget("default");
                    setShowLedgerForm(true);
                    return;
                  }
                  if (company) {
                    mutateCompany({ ...company, default_incentive_expense_ledger_id: val ? Number(val) : null }, false);
                  }
                }}
                options={expenseLedgerOptions}
                pinnedOptions={[
                  { value: "__NEW__", label: "+ Add New Ledger", sublabel: "Create a new expense ledger" }
                ]}
              />
            </div>
          </div>
        </div>
      )}

      {/* ─── INCENTIVE TAB ────────────────────────────── */}
      {tab === "incentive" && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Incentive Rules</span>
              <button
                onClick={addIncentiveRule}
                disabled={!isEditing}
                className="text-xs px-2 py-0.5 rounded bg-violet-600 text-white hover:bg-violet-700 font-bold disabled:opacity-50"
              >
                + Add
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {incentiveRules.map((rule) => (
                <div key={key(rule)} className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors group ${editingIncKey === key(rule) ? "bg-violet-50 dark:bg-violet-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
                  onClick={() => setEditingIncKey(key(rule))}>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{rule.name || <span className="text-slate-400 italic">Untitled Rule</span>}</div>
                    <div className="text-[10px] text-slate-400">{rule.basis_type.replace(/_/g, " ")} • {rule.incentive_type === "fixed" ? "Fixed" : "%"}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${rule.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                    {isEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeIncentiveRule(key(rule), rule.id);
                        }}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editingIncentive && (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm p-4">
              <SectionHeader icon="💰" title="Sales Incentive Rule" subtitle="Configure incentive based on sales performance" />
              <fieldset disabled={!isEditing} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2 lg:col-span-3">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Rule Name *</label>
                  <input className={inp} placeholder="e.g. Q1 Sales Bonus" value={editingIncentive.name} onChange={(e) => patchIncentive(editingIncKey, { name: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Sales Person</label>
                  <select className={sel} value={editingIncentive.sales_person_id || ""} onChange={(e) => patchIncentive(editingIncKey, { sales_person_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">All Sales Persons</option>
                    {(employees as any[]).map((e: any) => <option key={e.id} value={e.id}>{e.name || e.full_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Department</label>
                  <select className={sel} value={editingIncentive.department_id || ""} onChange={(e) => patchIncentive(editingIncKey, { department_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">All Departments</option>
                    {(departments as any[]).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Project</label>
                  <select className={sel} value={editingIncentive.project_id || ""} onChange={(e) => patchIncentive(editingIncKey, { project_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">All Projects</option>
                    {(projects as any[]).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Segment</label>
                  <select className={sel} value={editingIncentive.segment_id || ""} onChange={(e) => patchIncentive(editingIncKey, { segment_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">All Segments</option>
                    {(segments as any[]).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Specific Item</label>
                  <select className={sel} value={editingIncentive.item_id || ""} onChange={(e) => patchIncentive(editingIncKey, { item_id: e.target.value ? Number(e.target.value) : null })}>
                    <option value="">Any Item</option>
                    {(items as any[]).map((it: any) => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Expense Ledger Override</label>
                  <SearchableSelect
                    disabled={!isEditing}
                    placeholder="Use Company Default"
                    searchInputPlaceholder="Search override ledger..."
                    value={editingIncentive.ledger_id ? String(editingIncentive.ledger_id) : ""}
                    onChange={(val) => {
                      if (val === "__NEW__") {
                        setLedgerTarget("override");
                        setShowLedgerForm(true);
                        return;
                      }
                      patchIncentive(editingIncKey, { ledger_id: val ? Number(val) : null });
                    }}
                    options={expenseLedgerOptions}
                    pinnedOptions={[
                      { value: "__NEW__", label: "+ Add New Ledger", sublabel: "Create a new expense ledger" }
                    ]}
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Incentive Basis</label>
                  <select className={sel} value={editingIncentive.basis_type} onChange={(e) => patchIncentive(editingIncKey, { basis_type: e.target.value as any })}>
                    <option value="amount">Sales Amount (Revenue)</option>
                    <option value="qty">Sales Quantity (Units)</option>
                    <option value="target_amount">Target Amount Achieved</option>
                    <option value="target_qty">Target Qty Achieved</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Range (Min – Max)</label>
                  <div className="flex items-center gap-1">
                    <input type="number" className={inp} placeholder="Min" value={editingIncentive.threshold_min || ""} onChange={(e) => patchIncentive(editingIncKey, { threshold_min: Number(e.target.value) })} />
                    <span className="text-slate-400 text-xs shrink-0">–</span>
                    <input type="number" className={inp} placeholder="Max (∞)" value={editingIncentive.threshold_max ?? ""} onChange={(e) => patchIncentive(editingIncKey, { threshold_max: e.target.value ? Number(e.target.value) : null })} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">
                    Incentive Type &amp; Value
                  </label>

                  <div className="flex items-center gap-2">
                    {/* Left dropdown slightly bigger */}
                    <select
                      className="h-10 w-36 text-sm px-2 border rounded-md bg-white disabled:bg-slate-50"
                      value={editingIncentive.incentive_type}
                      onChange={(e) =>
                        patchIncentive(editingIncKey, {
                          incentive_type: e.target.value as any,
                        })
                      }
                    >
                      <option value="fixed">Fixed (₹)</option>
                      <option value="percentage">Percentage (%)</option>
                    </select>

                    {/* Right input box smaller than left */}
                    <div className="relative flex-1 max-w-[150px]">
                      <input
                        type="number"
                        className="w-full h-9 px-2 text-sm border rounded-md placeholder:text-gray-400 disabled:bg-slate-50"
                        placeholder={
                          editingIncentive.incentive_type === "fixed"
                            ? "e.g. 5000"
                            : "e.g. 2.5"
                        }
                        value={editingIncentive.incentive_value || ""}
                        onChange={(e) =>
                          patchIncentive(editingIncKey, {
                            incentive_value: Number(e.target.value),
                          })
                        }
                      />

                      {/* Symbol on the right */}
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-sm text-slate-400 pointer-events-none">
                        {editingIncentive.incentive_type === "fixed" ? "₹" : "%"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <input id="inc-active" type="checkbox" className="h-3.5 w-3.5" checked={editingIncentive.is_active} onChange={(e) => patchIncentive(editingIncKey, { is_active: e.target.checked })} />
                  <label htmlFor="inc-active" className="text-xs text-slate-600 dark:text-slate-300">Rule is active</label>
                </div>
              </fieldset>
              {editingIncentive.incentive_value > 0 && (
                <div className="mt-3 p-2.5 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-100 text-[11px] text-violet-700 font-medium">
                  📌 When <strong>{editingIncentive.basis_type.replace(/_/g, " ")}</strong> is between <strong>{editingIncentive.threshold_min || "0"}</strong> – <strong>{editingIncentive.threshold_max ?? "∞"}</strong>, pay <strong>{editingIncentive.incentive_type === "fixed" ? `₹ ${editingIncentive.incentive_value}` : `${editingIncentive.incentive_value}% of sales`}</strong> as incentive.
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── DEPRECIATION TAB ────────────────────────── */}
      {tab === "depreciation" && (
        <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
          <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Depreciation Rules</span>
              <button
                onClick={addDeprRule}
                disabled={!isEditing}
                className="text-xs px-2 py-0.5 rounded bg-orange-500 text-white hover:bg-orange-600 font-bold disabled:opacity-50"
              >
                + Add
              </button>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {deprRules.map((rule) => (
                <div key={key(rule)} className={`flex items-center justify-between px-3 py-2 cursor-pointer transition-colors group ${editingDeprKey === key(rule) ? "bg-orange-50 dark:bg-orange-900/20" : "hover:bg-slate-50 dark:hover:bg-slate-800/40"}`}
                  onClick={() => setEditingDeprKey(key(rule))}>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{rule.name || <span className="text-slate-400 italic">Untitled Rule</span>}</div>
                    <div className="text-[10px] text-slate-400">{rule.method === "straight_line" ? "SLM" : "WDV"} • {rule.rate_type === "fixed" ? "Fixed" : `${rule.rate_value || "—"}%`}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className={`w-1.5 h-1.5 rounded-full ${rule.is_active ? "bg-green-500" : "bg-slate-300"}`} />
                    {isEditing && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeDeprRule(key(rule), rule.id);
                        }}
                        className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 text-sm"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {editingDepr && (
            <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm p-4">
              <SectionHeader icon="📉" title="Depreciation Rule" subtitle="Set method, rate, and useful life per asset category" />
              <fieldset disabled={!isEditing} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Rule Name *</label>
                  <input className={`${inp} w-[100%] shrink-0`} placeholder="e.g. Machinery – SLM 10%" value={editingDepr.name} onChange={(e) => patchDepr(editingDeprKey, { name: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block gap-2">Asset Category</label>
                  <input className={`${inp} w-[100px] shrink-0`} placeholder="e.g. Machinery, Vehicles, IT" value={editingDepr.category || ""} onChange={(e) => patchDepr(editingDeprKey, { category: e.target.value })} />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Depreciation Method</label>
                  <select className={`${sel} w-[100px] shrink-0`} value={editingDepr.method} onChange={(e) => patchDepr(editingDeprKey, { method: e.target.value as any })}>
                    <option value="straight_line">Straight Line Method (SLM)</option>
                    <option value="reducing_balance">Written Down Value (WDV)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Rate Type &amp; Value</label>
                  <div className="flex items-center gap-1">
                    <select className={`${sel} w-[55%] shrink-0`} value={editingDepr.rate_type} onChange={(e) => patchDepr(editingDeprKey, { rate_type: e.target.value as any })}>
                      <option value="percentage">Percentage (%)</option>
                      <option value="fixed">Fixed (₹/yr)</option>
                    </select>
                    {/* Right input box smaller than left */}
                    <div className="relative flex-1 max-w-[150px]">
                      <input
                        type="number"
                        className="w-full h-7 px-2 text-sm border rounded-md placeholder:text-gray-400 disabled:bg-slate-50"
                        placeholder={
                          editingDepr.rate_type === "percentage"
                            ? "e.g. 5000"
                            : "e.g. 2.5"
                        }
                        value={editingDepr.rate_value || ""}
                        onChange={(e) =>
                          patchDepr(editingDeprKey, {
                            rate_value: Number(e.target.value)
                          }
                          )}
                      />
                      {/* Symbol on the right */}
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">{editingDepr.rate_type === "percentage" ? "%" : "₹"}</span>
                    </div>
                  </div>
                  <br />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1 block">Useful Life (Years)</label>
                  <input type="number" className={inp} placeholder="e.g. 10" value={editingDepr.useful_life_years ?? ""} onChange={(e) => patchDepr(editingDeprKey, { useful_life_years: e.target.value ? Number(e.target.value) : null })} />
                </div>
                <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <input id="depr-active" type="checkbox" className="h-3.5 w-3.5" checked={editingDepr.is_active} onChange={(e) => patchDepr(editingDeprKey, { is_active: e.target.checked })} />
                  <label htmlFor="depr-active" className="text-xs text-slate-600 dark:text-slate-300">Rule is active</label>
                </div>
              </fieldset>
              {editingDepr.rate_value > 0 && (
                <div className="mt-3 p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/20 border border-orange-100 text-[11px] text-orange-700 font-medium">
                  📌 <strong>{editingDepr.category || "This category"}</strong> — <strong>{editingDepr.method === "straight_line" ? "SLM" : "WDV"}</strong> at <strong>{editingDepr.rate_type === "percentage" ? `${editingDepr.rate_value}%/yr` : `₹${editingDepr.rate_value}/yr`}</strong>{editingDepr.useful_life_years ? ` over ${editingDepr.useful_life_years} years` : ""}.
                  {editingDepr.method === "straight_line" && editingDepr.rate_type === "percentage" && (
                    <span className="ml-1 text-orange-500">e.g. ₹1,00,000 → ₹{(100000 * editingDepr.rate_value / 100).toLocaleString("en-IN")}/yr</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Summary Table */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{tab === "incentive" ? "All Incentive Rules" : "All Depreciation Rules"}</span>
        </div>
        <div className="overflow-x-auto">
          {tab === "incentive" ? (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] text-slate-500 uppercase">
                {["Rule Name", "Basis", "Range", "Incentive", "Filters", "Status"].map(h => <th key={h} className="text-left px-3 py-1.5 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {incentiveRules.map((rule) => (
                  <tr key={key(rule)} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditingIncKey(key(rule))}>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{rule.name || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500">{rule.basis_type.replace(/_/g, " ")}</td>
                    <td className="px-3 py-1.5 text-slate-500">{rule.threshold_min || "0"} – {rule.threshold_max ?? "∞"}</td>
                    <td className="px-3 py-1.5 font-semibold text-violet-700">{rule.incentive_value ? (rule.incentive_type === "fixed" ? `₹ ${rule.incentive_value}` : `${rule.incentive_value}%`) : "—"}</td>
                    <td className="px-3 py-1.5 text-slate-400 text-[10px]">
                      <div className="flex flex-wrap gap-1">
                        {[
                          rule.department_id && "Dept",
                          rule.project_id && "Project",
                          rule.segment_id && "Segment",
                          rule.item_id && "Item",
                          rule.sales_person_id && "Person"
                        ].filter(Boolean).map(tag => (
                          <span key={tag as string} className="px-1 bg-slate-100 rounded border border-slate-200">{tag}</span>
                        ))}
                        {rule.ledger_id && <span className="px-1 bg-violet-50 text-violet-600 rounded border border-violet-100">Ledger Override</span>}
                        {!rule.department_id && !rule.project_id && !rule.segment_id && !rule.item_id && !rule.sales_person_id && !rule.ledger_id && "All"}
                      </div>
                    </td>
                    <td className="px-3 py-1.5"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${rule.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{rule.is_active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full text-xs">
              <thead><tr className="border-b border-slate-100 bg-slate-50/50 text-[10px] text-slate-500 uppercase">
                {["Rule Name", "Category", "Method", "Rate", "Useful Life", "Status"].map(h => <th key={h} className="text-left px-3 py-1.5 font-semibold">{h}</th>)}
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {deprRules.map((rule) => (
                  <tr key={key(rule)} className="hover:bg-slate-50 cursor-pointer" onClick={() => setEditingDeprKey(key(rule))}>
                    <td className="px-3 py-1.5 font-medium text-slate-800">{rule.name || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500">{rule.category || "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500">{rule.method === "straight_line" ? "SLM" : "WDV"}</td>
                    <td className="px-3 py-1.5 font-semibold text-orange-700">{rule.rate_value ? (rule.rate_type === "fixed" ? `₹ ${rule.rate_value}` : `${rule.rate_value}%`) : "—"}</td>
                    <td className="px-3 py-1.5 text-slate-500">{rule.useful_life_years ? `${rule.useful_life_years} yrs` : "—"}</td>
                    <td className="px-3 py-1.5"><span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${rule.is_active ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>{rule.is_active ? "Active" : "Inactive"}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      {/* ─── LEDGER FORM MODAL ─── */}
      <LedgerDrawerForm 
        open={showLedgerForm}
        onClose={() => {
          setShowLedgerForm(false);
          setLedgerTarget(null);
        }}
        groups={ledgerGroups}
        gstLedgers={ledgers.filter((l: any) => l.is_gst_ledger)}
        onSubmit={handleLedgerSubmit}
      />
    </div>
  );
}
