"use client";

import useSWR from 'swr';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useMenuAccess } from '@/components/MenuPermissionsContext';
import {
  CalendarDisplayMode,
  readCalendarDisplayMode,
  writeCalendarDisplayMode,
} from '@/lib/calendarMode';
import { safeADToBS, isIsoDateString } from '@/lib/bsad';
import { Select } from '@/components/ui/Select';
import { useMemo } from 'react';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const BS_MONTHS = [
  "वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कात्तिक", "मंसिर", "पुस", "माघ", "फागुन", "चैत"
];

const AD_MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

/** Returns current fiscal year string like "2081/82" (BS) or "2025/26" (AD). */
function getCurrentFiscalYear(mode: "BS" | "AD"): string {
  const today = new Date();
  const todayIso = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('-');

  if (mode === "BS") {
    const bsDate = safeADToBS(todayIso);
    if (bsDate) {
      const parts = bsDate.split('-');
      const bsYear = parseInt(parts[0], 10);
      const bsMonth = parseInt(parts[1], 10);
      // Nepali FY starts in Shrawan (month 4)
      const fyStart = bsMonth >= 4 ? bsYear : bsYear - 1;
      return `${fyStart}/${String(fyStart + 1).slice(2)}`;
    }
    // rough fallback
    const year = today.getFullYear();
    const bsApprox = year + 56;
    return `${bsApprox}/${String(bsApprox + 1).slice(2)}`;
  } else {
    // AD: FY starts in July (month 7)
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const fyStart = month >= 7 ? year : year - 1;
    return `${fyStart}/${String(fyStart + 1).slice(2)}`;
  }
}

export default function SalesTargetPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  const { canRead, canUpdate } = useMenuAccess('accounting.masters.sales_target');

  // Company settings for fiscal year and calendar mode
  const { data: company } = useSWR(companyId ? `/companies/${companyId}` : null, fetcher);
  const calendarMode = company?.settings?.calendar_mode || "AD";

  // State for filters
  const [fiscalYear, setFiscalYear] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [dateDisplayMode, setDateDisplayMode] = useState<CalendarDisplayMode>("BOTH");

  // Masters data
  const { data: departments } = useSWR(companyId ? `/companies/${companyId}/departments` : null, fetcher);
  const { data: projects } = useSWR(companyId ? `/companies/${companyId}/projects` : null, fetcher);
  const { data: segments } = useSWR(companyId ? `/companies/${companyId}/segments` : null, fetcher);
  const { data: ledgers } = useSWR(companyId ? `/ledgers/companies/${companyId}/ledgers` : null, fetcher);

  // Targets data
  const { data: existingTargets, mutate: mutateTargets } = useSWR(
    companyId && fiscalYear ? `/companies/${companyId}/sales-targets?fiscal_year=${fiscalYear}${departmentId ? `&department_id=${departmentId}` : ''}${projectId ? `&project_id=${projectId}` : ''}${segmentId ? `&segment_id=${segmentId}` : ''}` : null,
    fetcher
  );

  // Local state for grid edits
  const [gridData, setGridData] = useState<any[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fast Deploy State
  const [isDeployModalOpen, setIsDeployModalOpen] = useState(false);
  const [deployDepartmentId, setDeployDepartmentId] = useState<string>("");
  const [deployProjectId, setDeployProjectId] = useState<string>("");
  const [deploySegmentId, setDeploySegmentId] = useState<string>("");
  const [isDeploying, setIsDeploying] = useState(false);
  const [deployError, setDeployError] = useState<string | null>(null);
  const [deploySuccess, setDeploySuccess] = useState(false);

  // Initialize fiscal year when company data is available
  useEffect(() => {
    if (company && !fiscalYear) {
      const mode = company?.settings?.calendar_mode === "BS" ? "BS" : "AD";
      setFiscalYear(company.current_fiscal_year || getCurrentFiscalYear(mode));
    }
    if (companyId) {
      setDateDisplayMode(readCalendarDisplayMode(companyId, company?.settings?.calendar_mode === "BS" ? "BS" : "AD"));
    }
  }, [company, calendarMode, fiscalYear, companyId]);

  const handleDateDisplayModeChange = (mode: CalendarDisplayMode) => {
    setDateDisplayMode(mode);
    if (companyId) writeCalendarDisplayMode(companyId, mode);
    // Update fiscal year to the current FY for the newly selected calendar
    const fyMode = mode === "AD" ? "AD" : "BS";
    setFiscalYear(getCurrentFiscalYear(fyMode));
  };

  // Sync grid data when ledgers or existing targets change
  useEffect(() => {
    if (!ledgers || !fiscalYear) return;

    // Filter ledgers that are likely sales/income or expense related
    const salesLedgers = (ledgers as any[]).filter(l => {
      const gname = l.group_name?.toUpperCase() || "";
      const gtype = l.group_type?.toUpperCase() || "";
      return gname.includes("SALES") || gname.includes("INCOME") || gname.includes("REVENUE") || 
             gname.includes("EXPENSE") || gname.includes("PURCHASE") || gname.includes("COST") ||
             gtype === "INCOME" || gtype === "EXPENSE";
    });

    const newGrid = salesLedgers.map(l => {
      const target = (existingTargets as any[])?.find(t => t.ledger_id === l.id);
      
      let mappedType = l.group_type?.toUpperCase();
      if (!mappedType) {
        const gName = (l.group_name || "").toUpperCase();
        if (gName.includes("EXPENSE") || gName.includes("COST") || gName.includes("PURCHASE")) {
          mappedType = "EXPENSE";
        } else {
          mappedType = "INCOME";
        }
      }

      return {
        ledger_id: l.id,
        ledger_name: l.name,
        month_1: target?.month_1 || 0,
        month_2: target?.month_2 || 0,
        month_3: target?.month_3 || 0,
        month_4: target?.month_4 || 0,
        month_5: target?.month_5 || 0,
        month_6: target?.month_6 || 0,
        month_7: target?.month_7 || 0,
        month_8: target?.month_8 || 0,
        month_9: target?.month_9 || 0,
        month_10: target?.month_10 || 0,
        month_11: target?.month_11 || 0,
        month_12: target?.month_12 || 0,
        total_target: target?.total_target || 0,
        group_type: mappedType,
        group_name: l.group_name
      };
    });

    setGridData(newGrid);
  }, [ledgers, existingTargets, fiscalYear]);

  const handleInputChange = (index: number, monthKey: string, value: string) => {
    const newVal = parseFloat(value) || 0;
    const updatedGrid = [...gridData];
    updatedGrid[index][monthKey] = newVal;
    
    // Recalculate total
    let total = 0;
    for (let i = 1; i <= 12; i++) {
      total += updatedGrid[index][`month_${i}`] || 0;
    }
    updatedGrid[index].total_target = total;
    
    setGridData(updatedGrid);
    setSaveSuccess(false);
  };

  const handleSave = async () => {
    if (!canUpdate) return;
    setIsSaving(true);
    setError(null);
    try {
      const payload = gridData.map(row => ({
        fiscal_year: fiscalYear,
        ledger_id: row.ledger_id,
        department_id: departmentId ? parseInt(departmentId) : null,
        project_id: projectId ? parseInt(projectId) : null,
        segment_id: segmentId ? parseInt(segmentId) : null,
        month_1: row.month_1,
        month_2: row.month_2,
        month_3: row.month_3,
        month_4: row.month_4,
        month_5: row.month_5,
        month_6: row.month_6,
        month_7: row.month_7,
        month_8: row.month_8,
        month_9: row.month_9,
        month_10: row.month_10,
        month_11: row.month_11,
        month_12: row.month_12,
        total_target: row.total_target,
        group_type: row.group_type,
        group_name: row.group_name
      }));

      await api.post(`/companies/${companyId}/sales-targets/batch`, payload);
      setSaveSuccess(true);
      mutateTargets();
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Failed to save targets");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeploy = async () => {
    if (!canUpdate) return;
    setIsDeploying(true);
    setDeployError(null);
    setDeploySuccess(false);

    try {
      const payload = gridData.map(row => ({
        fiscal_year: fiscalYear,
        ledger_id: row.ledger_id,
        department_id: deployDepartmentId ? parseInt(deployDepartmentId) : null,
        project_id: deployProjectId ? parseInt(deployProjectId) : null,
        segment_id: deploySegmentId ? parseInt(deploySegmentId) : null,
        month_1: row.month_1,
        month_2: row.month_2,
        month_3: row.month_3,
        month_4: row.month_4,
        month_5: row.month_5,
        month_6: row.month_6,
        month_7: row.month_7,
        month_8: row.month_8,
        month_9: row.month_9,
        month_10: row.month_10,
        month_11: row.month_11,
        month_12: row.month_12,
        total_target: row.total_target,
        group_type: row.group_type,
        group_name: row.group_name
      }));

      await api.post(`/companies/${companyId}/sales-targets/batch`, payload);
      setDeploySuccess(true);
      setTimeout(() => {
        setIsDeployModalOpen(false);
        setDeploySuccess(false);
      }, 1500);
    } catch (err: any) {
      setDeployError(err?.response?.data?.detail || "Failed to deploy targets");
    } finally {
      setIsDeploying(false);
    }
  };



  const monthLabels = calendarMode === "BS" ? BS_MONTHS : AD_MONTHS;

  const orderedMonthIndices = useMemo(() => {
    // Use dateDisplayMode (user's preference) to determine FY start month,
    // so that the ordering and the labels use the same calendar reference.
    // BS calendar: always start from Shrawan (month 4) — standard Nepali FY
    // AD calendar: July (month 7) or read from company fiscal_year_start
    const isDisplayBS = dateDisplayMode === "BS" || (dateDisplayMode === "BOTH" && calendarMode === "BS");

    let startMonth = isDisplayBS ? 4 : 7;

    if (!isDisplayBS && company?.fiscal_year_start) {
      // AD mode: try to read the start month from the company record
      const ts = company.fiscal_year_start as string;
      // Only use the value if it looks like an AD date (year <= 2079)
      const sepChar = ts.includes('-') ? '-' : '/';
      const parts = ts.split(sepChar);
      const yearInDate = parts.length >= 1 ? parseInt(parts[0], 10) : 0;
      if (yearInDate <= 2079 && parts.length >= 2) {
        const parsed = parseInt(parts[1], 10);
        if (!isNaN(parsed) && parsed >= 1 && parsed <= 12) {
          startMonth = parsed;
        }
      }
    }

    const indices = [];
    for (let i = 0; i < 12; i++) {
      indices.push(((startMonth + i - 1) % 12) + 1);
    }
    return indices;
  }, [company, calendarMode, dateDisplayMode]);

  const handleForwardFirstMonth = (index: number) => {
    if (orderedMonthIndices.length === 0) return;
    const firstMonthIdx = orderedMonthIndices[0];
    const val = gridData[index][`month_${firstMonthIdx}`] || 0;
    
    const updatedGrid = [...gridData];
    for (let i = 1; i <= 12; i++) {
        updatedGrid[index][`month_${i}`] = val;
    }
    updatedGrid[index].total_target = val * 12;
    
    setGridData(updatedGrid);
    setSaveSuccess(false);
  };


  const getMonthLabel = (mIdx: number) => {
    const idx = mIdx - 1;
    if (dateDisplayMode === "BS") {
      return BS_MONTHS[idx];
    } else if (dateDisplayMode === "AD") {
      return AD_MONTHS[idx];
    } else {
      // BOTH: show primary calendar name based on company calendar mode
      return calendarMode === "BS" ? BS_MONTHS[idx] : AD_MONTHS[idx];
    }
  };


  if (!canRead) {
    return <div className="p-8 text-center text-slate-500">You do not have permission to access this page.</div>;
  }

  return (
    <div className="space-y-6">
      {/* ── Hero Header ────────────────────────────────────────────────── */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden mb-6">
        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500" />
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-100 dark:border-emerald-800/40 shadow-sm">
              <svg className="w-6 h-6 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">Sales Target Setup</h1>
              <p className="text-sm text-slate-500 dark:text-slate-400">Set monthly sales goals for accurate performance reporting.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {gridData.length > 0 && (
              <button
                onClick={() => setIsDeployModalOpen(true)}
                disabled={isSaving || !canUpdate}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-emerald-50 hover:text-emerald-700 dark:hover:bg-emerald-900/30 dark:hover:text-emerald-400 dark:hover:border-emerald-800 transition-all shadow-sm flex items-center gap-2"
                title="Copy current grid targets to another Department or Project"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                Deploy Targets
              </button>
            )}
             <button
              onClick={() => router.back()}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || !canUpdate}
              className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
            >
              {isSaving ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Saving...
                </>
              ) : "Save Targets"}
            </button>
          </div>
        </div>
      </div>

      {/* ── Filter Panel ────────────────────────────────────────────────── */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Display Date</label>
          <select
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            value={dateDisplayMode}
            onChange={(e) => handleDateDisplayModeChange(e.target.value as CalendarDisplayMode)}
          >
            <option value="BS">BS</option>
            <option value="AD">AD</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">
            Fiscal Year ({dateDisplayMode === "AD" ? "AD" : "BS"})
          </label>
          <input
            type="text"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
            placeholder={dateDisplayMode === "AD" ? "e.g. 2024/25" : "e.g. 2081/82"}
            value={fiscalYear}
            onChange={(e) => setFiscalYear(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Department</label>
          <select
             className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
             value={departmentId}
             onChange={(e) => setDepartmentId(e.target.value)}
          >
            <option value="">All Departments</option>
            {departments?.map((d: any) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Project</label>
          <select
             className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
             value={projectId}
             onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">All Projects</option>
            {projects?.map((p: any) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Segment</label>
          <select
             className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all"
             value={segmentId}
             onChange={(e) => setSegmentId(e.target.value)}
          >
            <option value="">All Segments</option>
            {segments?.map((s: any) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="md:col-span-1 py-1 px-1">
           {saveSuccess && <span className="text-emerald-600 text-xs font-bold animate-pulse">✓ Changes saved successfully</span>}
           {error && <span className="text-red-500 text-xs font-bold">⚠ {error}</span>}
        </div>
      </div>

      {/* ── Targets Grid ────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50/80 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                <th className="px-4 py-4 text-left text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest sticky left-0 bg-slate-50 dark:bg-slate-800 z-10 w-64 shadow-sm">Ledger Name</th>
                {orderedMonthIndices.map((mIdx) => (
                  <th key={mIdx} className="px-3 py-4 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest min-w-[120px]">{getMonthLabel(mIdx)}</th>
                ))}
                <th className="px-4 py-4 text-right text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest min-w-[120px]">Total Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {gridData.length === 0 ? (
                <tr>
                  <td colSpan={14} className="px-4 py-12 text-center text-slate-400 italic text-sm">
                    No sales/revenue or expense ledgers found. Make sure your ledgers are correctly categorized.
                  </td>
                </tr>
              ) : (
                <>
                  {/* INCOME SECTION */}
                  {gridData.filter(r => r.group_type === "INCOME").length > 0 && (
                    <tr className="bg-emerald-50/30 dark:bg-emerald-900/10 border-t-2 border-emerald-200 dark:border-emerald-800">
                      <td colSpan={14} className="px-4 py-2.5 text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-[0.2em] flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 mr-1"></span>
                        Income &amp; Sales Target
                      </td>
                    </tr>
                  )}
                  {gridData.filter(r => r.group_type === "INCOME").map((row) => (
                    <tr key={row.ledger_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200 text-sm sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors z-10 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{row.ledger_name}</span>
                          <button 
                            onClick={() => handleForwardFirstMonth(gridData.indexOf(row))}
                            title="Copy first month's target to all 12 months"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:text-emerald-400 dark:hover:bg-emerald-500/10 rounded transition-all flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                          </button>
                        </div>
                      </td>
                      {orderedMonthIndices.map(mIdx => (
                        <td key={mIdx} className="px-2 py-3">
                          <input
                            type="number"
                            className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/10 outline-none text-center text-sm bg-transparent transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 font-mono"
                            value={row[`month_${mIdx}`] || ""}
                            placeholder="0.00"
                            onChange={(e) => handleInputChange(gridData.indexOf(row), `month_${mIdx}`, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100 text-sm font-mono bg-emerald-50/30 dark:bg-emerald-900/10">
                        {row.total_target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Income Subtotal Row */}
                  {gridData.filter(r => r.group_type === "INCOME").length > 0 && (
                    <tr className="bg-emerald-100/40 dark:bg-emerald-900/20 border-t border-emerald-200 dark:border-emerald-700 border-b-4 border-b-slate-300 dark:border-b-slate-600">
                      <td className="px-4 py-2.5 font-bold text-emerald-800 dark:text-emerald-300 text-xs uppercase tracking-wider sticky left-0 bg-emerald-100/60 dark:bg-emerald-900/40 shadow-sm">
                        Total Income Target
                      </td>
                      {orderedMonthIndices.map(mIdx => (
                        <td key={mIdx} className="px-3 py-2.5 text-center font-bold text-emerald-700 dark:text-emerald-400 text-xs font-mono">
                          {gridData.filter(r => r.group_type === "INCOME").reduce((sum, row) => sum + (row[`month_${mIdx}`] || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-bold text-emerald-800 dark:text-emerald-200 text-sm font-mono bg-emerald-100/60 dark:bg-emerald-900/30">
                        {gridData.filter(r => r.group_type === "INCOME").reduce((sum, row) => sum + row.total_target, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}

                  {/* ── SEPARATOR ── */}
                  {gridData.filter(r => r.group_type === "EXPENSE").length > 0 && gridData.filter(r => r.group_type === "INCOME").length > 0 && (
                    <tr>
                      <td colSpan={14} className="p-0">
                        <div className="h-[3px] w-full bg-gradient-to-r from-emerald-400 via-slate-300 to-red-400 dark:from-emerald-700 dark:via-slate-600 dark:to-red-700 opacity-60" />
                      </td>
                    </tr>
                  )}

                  {/* EXPENSE SECTION */}
                  {gridData.filter(r => r.group_type === "EXPENSE").length > 0 && (
                    <tr className="bg-red-50/20 dark:bg-red-900/10 border-t-2 border-red-200 dark:border-red-800">
                      <td colSpan={14} className="px-4 py-2.5 text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-[0.2em]">
                        <span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1"></span>
                        Expenditure &amp; Cost Target
                      </td>
                    </tr>
                  )}
                  {gridData.filter(r => r.group_type === "EXPENSE").map((row) => (
                    <tr key={row.ledger_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group border-b border-slate-100 dark:border-slate-800/60">
                      <td className="px-4 py-3 font-medium text-slate-700 dark:text-slate-200 text-sm sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800 transition-colors z-10 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate">{row.ledger_name}</span>
                          <button 
                            onClick={() => handleForwardFirstMonth(gridData.indexOf(row))}
                            title="Copy first month's target to all 12 months"
                            className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-500/10 rounded transition-all flex-shrink-0"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>
                          </button>
                        </div>
                      </td>
                      {orderedMonthIndices.map(mIdx => (
                        <td key={mIdx} className="px-2 py-3">
                          <input
                            type="number"
                            className="w-full px-2 py-1.5 rounded-lg border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-red-500 focus:ring-2 focus:ring-red-500/10 outline-none text-center text-sm bg-transparent transition-all placeholder:text-slate-300 dark:placeholder:text-slate-600 font-mono"
                            value={row[`month_${mIdx}`] || ""}
                            placeholder="0.00"
                            onChange={(e) => handleInputChange(gridData.indexOf(row), `month_${mIdx}`, e.target.value)}
                          />
                        </td>
                      ))}
                      <td className="px-4 py-3 text-right font-bold text-slate-900 dark:text-slate-100 text-sm font-mono bg-red-50/30 dark:bg-red-900/10">
                        {row.total_target.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                  {/* Expense Subtotal Row */}
                  {gridData.filter(r => r.group_type === "EXPENSE").length > 0 && (
                    <tr className="bg-red-100/40 dark:bg-red-900/20 border-t border-red-200 dark:border-red-700">
                      <td className="px-4 py-2.5 font-bold text-red-800 dark:text-red-300 text-xs uppercase tracking-wider sticky left-0 bg-red-100/60 dark:bg-red-900/40 shadow-sm">
                        Total Expense Target
                      </td>
                      {orderedMonthIndices.map(mIdx => (
                        <td key={mIdx} className="px-3 py-2.5 text-center font-bold text-red-700 dark:text-red-400 text-xs font-mono">
                          {gridData.filter(r => r.group_type === "EXPENSE").reduce((sum, row) => sum + (row[`month_${mIdx}`] || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                      ))}
                      <td className="px-4 py-2.5 text-right font-bold text-red-800 dark:text-red-200 text-sm font-mono bg-red-100/60 dark:bg-red-900/30">
                        {gridData.filter(r => r.group_type === "EXPENSE").reduce((sum, row) => sum + row.total_target, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
            {gridData.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30 border-t-2 border-slate-200 dark:border-slate-700">
                  <td className="px-4 py-4 font-bold text-slate-800 dark:text-slate-100 text-sm uppercase sticky left-0 bg-slate-50 dark:bg-slate-800 shadow-sm">Total Yearly Target</td>
                  {orderedMonthIndices.map(mIdx => (
                    <td key={mIdx} className="px-3 py-4 text-center font-bold text-slate-600 dark:text-slate-400 text-sm font-mono">
                      {gridData.reduce((sum, row) => sum + (row[`month_${mIdx}`] || 0), 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                  ))}
                  <td className="px-4 py-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-lg font-mono">
                    {gridData.reduce((sum, row) => sum + row.total_target, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      
      <div className="flex justify-center py-4">
          <p className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1.5 uppercase tracking-widest font-bold">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Fiscal Year targets are stored independently per Ledger/Department/Project/Segment combination.
          </p>
      </div>

      {/* ── Deploy Targets Modal ────────────────────────────────────────────── */}
      {isDeployModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden transform transition-all">
            <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
              <div>
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                  <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
                  Deploy Targets
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Copy current grid to another destination</p>
              </div>
              <button onClick={() => setIsDeployModalOpen(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <div className="p-6 space-y-5">
              <div className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-800 dark:text-emerald-300 text-xs px-4 py-3 rounded-xl border border-emerald-100 dark:border-emerald-800/50 flex gap-3 leading-relaxed">
                <svg className="w-4 h-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                This will copy the exact target values currently shown on your screen directly into the destination selected below. 
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">Destination Department</label>
                <select
                   className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 focus:bg-white dark:bg-slate-800/50 dark:focus:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm"
                   value={deployDepartmentId}
                   onChange={(e) => setDeployDepartmentId(e.target.value)}
                >
                  <option value="">All Departments</option>
                  {departments?.map((d: any) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">Destination Project</label>
                <select
                   className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 focus:bg-white dark:bg-slate-800/50 dark:focus:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm"
                   value={deployProjectId}
                   onChange={(e) => setDeployProjectId(e.target.value)}
                >
                  <option value="">All Projects</option>
                  {projects?.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2 ml-1">Destination Segment</label>
                <select
                   className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 focus:bg-white dark:bg-slate-800/50 dark:focus:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 outline-none transition-all shadow-sm"
                   value={deploySegmentId}
                   onChange={(e) => setDeploySegmentId(e.target.value)}
                >
                  <option value="">All Segments</option>
                  {segments?.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              {deploySuccess && (
                 <div className="bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 font-bold px-4 py-3 rounded-xl border border-emerald-200 dark:border-emerald-800 text-sm text-center animate-pulse">
                   ✓ Targets Deployed Successfully!
                 </div>
              )}
              {deployError && (
                 <div className="bg-red-50 dark:bg-red-900/30 text-red-600 font-bold px-4 py-3 rounded-xl border border-red-200 dark:border-red-800 text-sm text-center">
                   ⚠ {deployError}
                 </div>
              )}
            </div>
            
            <div className="bg-slate-50 dark:bg-slate-800/80 px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-3">
              <button
                onClick={() => setIsDeployModalOpen(false)}
                className="px-5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm"
              >
                Cancel
              </button>
              <button
                onClick={handleDeploy}
                disabled={isDeploying || (deployDepartmentId === departmentId && deployProjectId === projectId && deploySegmentId === segmentId)}
                title={deployDepartmentId === departmentId && deployProjectId === projectId && deploySegmentId === segmentId ? "Cannot deploy to the exact same destination you are currently viewing." : ""}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold transition-all shadow-md shadow-emerald-500/20 disabled:opacity-50 flex items-center gap-2"
              >
                {isDeploying ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Deploying...
                  </>
                ) : "Confirm & Deploy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
