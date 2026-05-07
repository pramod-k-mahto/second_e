"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { api, getCurrentCompany } from "@/lib/api";
import { PayrollApi } from "@/lib/payroll/api";
import { useDepartments } from "@/lib/payroll/hooks/useCommissions";
import { openPrintWindow } from "@/lib/printReport";
import type { PayrollRunRead, PayslipSummary } from "@/lib/payroll/types";
import { writeCalendarReportDisplayMode, readCalendarDisplayMode } from "@/lib/calendarMode";
import { FormattedDate } from "@/components/ui/FormattedDate";
import { useEmployees } from "@/lib/payroll/queries";

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const AD_MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const BS_MONTHS = [
  "वैशाख", "जेठ", "असार", "साउन", "भदौ", "असोज",
  "कात्तिक", "मङ्सिर", "पुस", "माघ", "फागुन", "चैत"
];

import { safeADToBS } from "@/lib/bsad";

const formatDateWithMonthName = (dateStr: string, mode: "AD" | "BS") => {
  if (!dateStr) return "—";
  if (mode === "AD") {
    const d = new Date(dateStr);
    return `${AD_MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
  } else {
    const bs = safeADToBS(dateStr.includes("T") ? dateStr.split("T")[0] : dateStr);
    if (!bs || bs === "Invalid BS") return bs;
    const [y, m, day] = bs.split("-").map(Number);
    return `${BS_MONTHS[m - 1]} ${day}, ${y}`;
  }
};

const fmt = (n: number | null | undefined) =>
  n != null ? new Intl.NumberFormat("en-US", { minimumFractionDigits: 2 }).format(n) : "—";

function VoucherNumberDisplay({ companyId, voucherId }: { companyId: number; voucherId: number | null | undefined }) {
  const { data } = useSWR(
    voucherId ? `/companies/${companyId}/vouchers/${voucherId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  if (!voucherId) return <>—</>;
  if (!data) return <span className="animate-pulse opacity-50">...</span>;
  return <>{data.voucher_number || "—"}</>;
}

export default function PayrollVoucherReportPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const router = useRouter();
  const printRef = useRef<HTMLDivElement | null>(null);
  const cc = typeof window !== "undefined" ? getCurrentCompany() : null;
  const initialMode = cc?.calendar_mode || "AD";
  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(cc?.id ? String(cc.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });

  // Filters
  // Filters (Applied)
  const [appliedYear, setAppliedYear] = useState<string>("");
  const [appliedMonth, setAppliedMonth] = useState<string>("");
  const [appliedEmployeeId, setAppliedEmployeeId] = useState<string>("");
  const [appliedPayhead, setAppliedPayhead] = useState<string>("");
  const [appliedSearchTerm, setAppliedSearchTerm] = useState("");

  // Filters (Pending)
  const [filterYear, setFilterYear] = useState<string>("");
  const [filterMonth, setFilterMonth] = useState<string>("");
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>("");
  const [filterPayhead, setFilterPayhead] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");

  const handleApplyFilters = () => {
    setAppliedYear(filterYear);
    setAppliedMonth(filterMonth);
    setAppliedEmployeeId(filterEmployeeId);
    setAppliedPayhead(filterPayhead);
    setAppliedSearchTerm(searchTerm);
  };

  const activeMonths = effectiveDisplayMode === "BS" ? BS_MONTHS : AD_MONTHS;
  const currentYear = effectiveDisplayMode === "BS" ? new Date().getFullYear() + 57 : new Date().getFullYear();
  const yearOptions = Array.from({ length: 6 }, (_, i) => String(currentYear - i));

  const { data: employees } = useEmployees(companyId);
  const { data: payheads } = useSWR(`/payroll/companies/${companyId}/payheads`, fetcher);

  const employeeMap = useMemo(() => {
    const map = new Map<number, string>();
    if (Array.isArray(employees)) {
      employees.forEach((emp: any) => {
        map.set(emp.id, emp.full_name);
      });
    }
    return map;
  }, [employees]);

  // Expanded run to show payslips and voucher
  const [expandedRunId, setExpandedRunId] = useState<number | null>(null);
  const [payslipCache, setPayslipCache] = useState<Record<number, PayslipSummary[]>>({});
  const [payslipLoading, setPayslipLoading] = useState(false);
  const [voucherCache, setVoucherCache] = useState<Record<number, any>>({});
  const [voucherLoading, setVoucherLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [viewMode, setViewMode] = useState<"DETAILS" | "SUMMARY">("DETAILS");
  const { data: departments } = useDepartments(companyId);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: runs, isLoading: runsLoading } = useSWR<PayrollRunRead[]>(
    companyId ? `/payroll/companies/${companyId}/runs` : null,
    fetcher
  );

  const postedRuns = useMemo(() => {
    const all = (runs || []).filter((r) => r.status === "POSTED");
    let filtered = all;

    if (appliedYear) {
      filtered = filtered.filter((r) => String(r.period_year) === appliedYear);
    }
    if (appliedMonth && appliedMonth !== "all") {
      filtered = filtered.filter((r) => String(r.period_month) === appliedMonth);
    }
    if (appliedSearchTerm.trim()) {
      const term = appliedSearchTerm.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          (r.voucher_number || "").toLowerCase().includes(term) ||
          activeMonths[r.period_month - 1]?.toLowerCase().includes(term) ||
          String(r.period_year).includes(term)
      );
    }

    return filtered.sort(
      (a, b) => b.period_year - a.period_year || b.period_month - a.period_month
    );
  }, [runs, appliedYear, appliedMonth, appliedSearchTerm]);

  const totals = useMemo(() => {
    let earnings = 0, deductions = 0, netPay = 0;
    for (const run of postedRuns) {
      const slips = payslipCache[run.id] || [];
      for (const s of slips) {
        earnings += s.earnings_total ?? 0;
        deductions += s.deductions_total ?? 0;
        netPay += s.net_pay ?? 0;
      }
    }
    return { earnings, deductions, netPay };
  }, [postedRuns, payslipCache]);

  // Aggregation for SUMMARY mode
  const [summaryData, setSummaryData] = useState<{
    slips: PayslipSummary[],
    vouchers: any[],
    loading: boolean
  }>({ slips: [], vouchers: [], loading: false });

  useEffect(() => {
    if (viewMode !== "SUMMARY") return;
    let active = true;
    const fetchAll = async () => {
      setSummaryData(prev => ({ ...prev, loading: true }));
      try {
        const slipsPromises = postedRuns.map(r => 
          payslipCache[r.id] ? Promise.resolve(payslipCache[r.id]) : PayrollApi.listPayslips(companyId, r.id)
        );
        const voucherPromises = postedRuns.map(r => {
          if (!r.voucher_id) return Promise.resolve(null);
          if (voucherCache[r.voucher_id]) return Promise.resolve(voucherCache[r.voucher_id]);
          return api.get(`/companies/${companyId}/vouchers/${r.voucher_id}`).then(res => res.data);
        });

        const [slipsRes, vouchersRes] = await Promise.all([
          Promise.all(slipsPromises),
          Promise.all(voucherPromises)
        ]);

        if (!active) return;

        // Cache the newly fetched data
        const newSlipsCache = { ...payslipCache };
        const newVoucherCache = { ...voucherCache };
        postedRuns.forEach((r, i) => {
          newSlipsCache[r.id] = slipsRes[i];
          if (r.voucher_id && vouchersRes[i]) {
            newVoucherCache[r.voucher_id] = vouchersRes[i];
          }
        });
        setPayslipCache(newSlipsCache);
        setVoucherCache(newVoucherCache);

        setSummaryData({ slips: slipsRes.flat(), vouchers: vouchersRes.filter(v => v), loading: false });
      } catch (err) {
        console.error(err);
        if (active) setSummaryData(prev => ({ ...prev, loading: false }));
      }
    };
    fetchAll();
    return () => { active = false; };
  }, [viewMode, postedRuns]);

  const summaryEmployee = useMemo(() => {
    const map = new Map<number, { name: string, earnings: number, deductions: number, netPay: number }>();
    summaryData.slips.forEach(s => {
      if (appliedEmployeeId && s.employee_id.toString() !== appliedEmployeeId) return;
      
      const resolvedName = employeeMap.get(s.employee_id) || s.employee_name || `Employee #${s.employee_id}`;
      const existing = map.get(s.employee_id) || { name: resolvedName, earnings: 0, deductions: 0, netPay: 0 };
      existing.earnings += s.earnings_total || 0;
      existing.deductions += s.deductions_total || 0;
      existing.netPay += s.net_pay || 0;
      map.set(s.employee_id, existing);
    });
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [summaryData.slips, appliedEmployeeId, employeeMap]);

  const summaryLedger = useMemo(() => {
    const map = new Map<string, { debit: number, credit: number }>();
    summaryData.vouchers.forEach(v => {
      (v.lines || []).forEach((l: any) => {
        if (appliedPayhead && l.ledger_name?.toLowerCase() !== appliedPayhead.toLowerCase()) return;
        
        const key = l.ledger_name || "Unknown";
        const existing = map.get(key) || { debit: 0, credit: 0 };
        existing.debit += l.debit || 0;
        existing.credit += l.credit || 0;
        map.set(key, existing);
      });
    });
    return Array.from(map.entries()).map(([ledger, amts]) => ({ ledger, ...amts })).sort((a, b) => a.ledger.localeCompare(b.ledger));
  }, [summaryData.vouchers, appliedPayhead]);

  const summaryCostCenter = useMemo(() => {
    const map = new Map<number, { debit: number, credit: number }>();
    summaryData.vouchers.forEach(v => {
      (v.lines || []).forEach((l: any) => {
        if (appliedPayhead && l.ledger_name?.toLowerCase() !== appliedPayhead.toLowerCase()) return;
        if (!l.department_id) return;
        
        const existing = map.get(l.department_id) || { debit: 0, credit: 0 };
        existing.debit += l.debit || 0;
        existing.credit += l.credit || 0;
        map.set(l.department_id, existing);
      });
    });
    return Array.from(map.entries()).map(([deptId, amts]) => {
      const deptName = departments?.find((d: any) => d.id === deptId)?.name || `Dept #${deptId}`;
      return { department: deptName, ...amts };
    }).sort((a, b) => a.department.localeCompare(b.department));
  }, [summaryData.vouchers, departments, appliedPayhead]);
  const summaryMonthly = useMemo(() => {
    const map = new Map<number, { monthNum: number, label: string, year: number, earnings: number, deductions: number, netPay: number, employees: number }>();
    
    postedRuns.forEach(run => {
      const slips = payslipCache[run.id] || [];
      const monthNum = run.period_month;
      const key = monthNum;
      
      const existing = map.get(key) || { 
        monthNum, 
        label: activeMonths[monthNum - 1], 
        year: run.period_year,
        earnings: 0, 
        deductions: 0, 
        netPay: 0,
        employees: 0
      };
      
      slips.forEach(s => {
        if (appliedEmployeeId && s.employee_id.toString() !== appliedEmployeeId) return;
        existing.earnings += s.earnings_total || 0;
        existing.deductions += s.deductions_total || 0;
        existing.netPay += s.net_pay || 0;
        existing.employees++;
      });
      
      map.set(key, existing);
    });
    
    return Array.from(map.values()).sort((a, b) => a.monthNum - b.monthNum);
  }, [postedRuns, payslipCache, activeMonths, appliedEmployeeId]);

  const toggleExpand = async (runId: number, voucherId?: number | null) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
      return;
    }
    setExpandedRunId(runId);
    if (!payslipCache[runId]) {
      setPayslipLoading(true);
      try {
        const slips = await PayrollApi.listPayslips(companyId, runId);
        setPayslipCache((prev) => ({ ...prev, [runId]: slips }));
      } catch {
        // ignore
      } finally {
        setPayslipLoading(false);
      }
    }
    
    if (voucherId && !voucherCache[voucherId]) {
      setVoucherLoading(true);
      try {
        const res = await api.get(`/companies/${companyId}/vouchers/${voucherId}`);
        setVoucherCache((prev) => ({ ...prev, [voucherId]: res.data }));
      } catch {
        // ignore
      } finally {
        setVoucherLoading(false);
      }
    }
  };

  const handlePrint = () => {
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: "Payroll Voucher Report",
      company: cc?.name || "",
      period: appliedYear ? `Year: ${appliedYear}${appliedMonth ? ` / ${activeMonths[Number(appliedMonth) - 1]}` : ""}` : "All Periods",
      orientation: "landscape",
    });
  };

  return (
    <div className="flex flex-col gap-4 p-4 min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* ── Header ── */}
      <div className="flex items-center justify-between bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/40">
            <svg className="w-5 h-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">Payroll Voucher Report</h1>
            <p className="text-[10px] text-slate-500 font-medium uppercase tracking-[0.1em]">Posted payroll vouchers & employee breakdown</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => router.back()}
            className="px-3 py-1.5 text-xs font-semibold border rounded-lg hover:bg-slate-50 transition-colors bg-white dark:bg-slate-800 dark:border-slate-700 text-slate-600 dark:text-slate-300"
          >
            Back
          </button>
          <button
            onClick={handlePrint}
            className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-all shadow-md active:scale-95"
          >
            🖨️ Print
          </button>
        </div>
      </div>

      {/* ── Filters ── */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          {/* Date Mode */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Date Mode</label>
            <select
              value={effectiveDisplayMode}
              onChange={(e) => {
                const next = e.target.value as "AD" | "BS";
                setEffectiveDisplayMode(next);
                writeCalendarReportDisplayMode(companyId, next);
                setFilterYear(""); // Reset year filter when mode changes to prevent mismatch
              }}
              className="h-9 w-32 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <option value="AD">AD (Gregorian)</option>
              <option value="BS">BS (Bikram Sambat)</option>
            </select>
          </div>

          {/* Year */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Year</label>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="h-9 w-28 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <option value="">All Years</option>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Month */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Month</label>
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="h-9 w-32 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <option value="">All Months</option>
              {activeMonths.map((m, i) => <option key={i} value={String(i + 1)}>{m}</option>)}
            </select>
          </div>

          {/* Employee */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Employee</label>
            <select
              value={filterEmployeeId}
              onChange={(e) => setFilterEmployeeId(e.target.value)}
              className="h-9 w-36 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <option value="">All Employees</option>
              {employees?.map((emp: any) => <option key={emp.id} value={emp.id}>{emp.full_name}</option>)}
            </select>
          </div>

          {/* Pay Head */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Pay Head</label>
            <select
              value={filterPayhead}
              onChange={(e) => setFilterPayhead(e.target.value)}
              className="h-9 w-36 border border-slate-200 dark:border-slate-700 rounded-lg px-2 text-xs bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-violet-400/40"
            >
              <option value="">All Pay Heads</option>
              {payheads?.map((ph: any) => <option key={ph.id} value={ph.name}>{ph.name}</option>)}
            </select>
          </div>

          {/* Search */}
          <div className="flex flex-col gap-1.5 flex-1 min-w-[140px]">
            <label className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Search</label>
            <div className="relative">
              <input
                type="text"
                placeholder="Voucher no..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-9 w-full border border-slate-200 dark:border-slate-700 rounded-lg text-xs pl-8 pr-3 bg-slate-50/50 dark:bg-slate-800 focus:ring-2 focus:ring-violet-500/20 outline-none transition-all text-slate-700 dark:text-slate-200"
              />
              <svg className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </div>
          </div>

          {/* Show Button */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-black text-violet-500 tracking-widest">Report</label>
            <button
              onClick={handleApplyFilters}
              className="h-9 px-8 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-[0.2em] rounded-lg shadow-xl shadow-emerald-200 dark:shadow-none transition-all hover:scale-[1.02] active:scale-95 flex items-center gap-2 border border-emerald-500/50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              Show Report
            </button>
          </div>

          {/* Summary chips */}
          <div className="flex items-center gap-3 ml-auto">
            <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-center">
              <div className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Posted Runs</div>
              <div className="text-base font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{postedRuns.length}</div>
            </div>
          </div>
        </div>

        {/* View Mode Toggle */}
        <div className="mt-4 flex items-center gap-1 border border-slate-200 dark:border-slate-700 rounded-lg p-1 bg-slate-50 dark:bg-slate-800/50 w-max">
          <button
            onClick={() => setViewMode("DETAILS")}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === "DETAILS" 
                ? "bg-white dark:bg-slate-900 text-violet-700 dark:text-violet-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Details Mode
          </button>
          <button
            onClick={() => setViewMode("SUMMARY")}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              viewMode === "SUMMARY" 
                ? "bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400 shadow-sm" 
                : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            Summary Mode
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      {runsLoading ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="flex flex-col items-center justify-center py-32 text-violet-500 animate-pulse gap-4">
            <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-[10px] font-black uppercase tracking-[0.2em] italic">Loading payroll vouchers...</p>
          </div>
        </div>
      ) : postedRuns.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-32 text-center flex flex-col items-center gap-3 text-slate-400 opacity-60">
            <div className="text-5xl">📋</div>
            <p className="text-sm font-medium">
              {appliedYear || appliedMonth || appliedSearchTerm
                ? "No posted payroll vouchers found for the selected filters."
                : "No posted payroll vouchers found."}
            </p>
            <p className="text-xs">Post a payroll run first from Payroll → Runs.</p>
          </div>
        </div>
      ) : viewMode === "SUMMARY" ? (
          <div className="flex flex-col gap-6" ref={printRef}>
            {summaryData.loading ? (
              <div className="p-12 text-center text-slate-400 font-medium animate-pulse">Aggregating payroll data across {postedRuns.length} runs...</div>
            ) : (
              <>
                {/* Monthly Summary Table */}
                {(!appliedMonth || appliedMonth === "all") && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Monthly Summary Breakdown</h3>
                    </div>
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Month</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Voucher No.</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Employees</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Earnings</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Deductions</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {summaryMonthly.map((row) => {
                          const run = postedRuns.find(r => r.period_month === row.monthNum);
                          return (
                            <tr key={row.monthNum} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                              <td className="p-2.5 font-bold text-slate-800 dark:text-slate-200">{row.label} {row.year}</td>
                              <td className="p-2.5">
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">
                                  {run?.voucher_number || "—"}
                                </span>
                              </td>
                              <td className="p-2.5 text-right tabular-nums text-slate-500">{row.employees}</td>
                              <td className="p-2.5 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">{fmt(row.earnings)}</td>
                              <td className="p-2.5 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">{fmt(row.deductions)}</td>
                              <td className="p-2.5 text-right font-black text-slate-900 dark:text-slate-100 tabular-nums">{fmt(row.netPay)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pay Heads (Ledger) Wise */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Pay Heads & Ledgers Summary</h3>
                  </div>
                  <table className="w-full text-xs text-left whitespace-nowrap">
                    <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Ledger Account (Payhead)</th>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Debit Amount</th>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Credit Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {summaryLedger.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{row.ledger}</td>
                          <td className="p-2.5 text-right font-bold text-emerald-600 tabular-nums">{row.debit > 0 ? fmt(row.debit) : ""}</td>
                          <td className="p-2.5 text-right font-bold text-rose-600 tabular-nums">{row.credit > 0 ? fmt(row.credit) : ""}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
                      <tr>
                        <td className="p-2.5 text-right font-black uppercase text-[10px] text-slate-500">Total</td>
                        <td className="p-2.5 text-right font-black text-emerald-700 tabular-nums">{fmt(summaryLedger.reduce((s, r) => s + r.debit, 0))}</td>
                        <td className="p-2.5 text-right font-black text-rose-700 tabular-nums">{fmt(summaryLedger.reduce((s, r) => s + r.credit, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Cost Center Wise */}
                {summaryCostCenter.length > 0 && (
                  <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                    <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                      <h3 className="text-[11px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Cost Center Summary (Departments)</h3>
                    </div>
                    <table className="w-full text-xs text-left whitespace-nowrap">
                      <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Department</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Debit Impact</th>
                          <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Credit Impact</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {summaryCostCenter.map((row, i) => (
                          <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                            <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{row.department}</td>
                            <td className="p-2.5 text-right font-bold text-amber-600 tabular-nums">{row.debit > 0 ? fmt(row.debit) : ""}</td>
                            <td className="p-2.5 text-right font-bold text-rose-600 tabular-nums">{row.credit > 0 ? fmt(row.credit) : ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Employee Wise */}
                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                    <h3 className="text-[11px] font-black uppercase tracking-widest text-violet-600 dark:text-violet-400">Employee Summary</h3>
                  </div>
                  <table className="w-full text-xs text-left whitespace-nowrap">
                    <thead className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400">Employee Name</th>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Total Earnings</th>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right">Total Deductions</th>
                        <th className="p-2.5 font-bold text-slate-600 dark:text-slate-400 text-right bg-brand-50 dark:bg-brand-900/10 text-brand-700 dark:text-brand-300">Total Net Pay</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {summaryEmployee.map((row, i) => (
                        <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="p-2.5 font-medium text-slate-800 dark:text-slate-200">{row.name}</td>
                          <td className="p-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmt(row.earnings)}</td>
                          <td className="p-2.5 text-right tabular-nums text-slate-600 dark:text-slate-400">{fmt(row.deductions)}</td>
                          <td className="p-2.5 text-right font-bold text-brand-700 dark:text-brand-300 tabular-nums bg-brand-50/50 dark:bg-brand-900/10">{fmt(row.netPay)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-200 dark:border-slate-800">
                      <tr>
                        <td className="p-2.5 text-right font-black uppercase text-[10px] text-slate-500">Total</td>
                        <td className="p-2.5 text-right font-black text-slate-700 tabular-nums">{fmt(summaryEmployee.reduce((s, r) => s + r.earnings, 0))}</td>
                        <td className="p-2.5 text-right font-black text-slate-700 tabular-nums">{fmt(summaryEmployee.reduce((s, r) => s + r.deductions, 0))}</td>
                        <td className="p-2.5 text-right font-black text-brand-700 tabular-nums">{fmt(summaryEmployee.reduce((s, r) => s + r.netPay, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden" ref={printRef}>
            <table className="w-full text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
                <tr className="uppercase text-[9px] font-black text-slate-400 tracking-widest">
                  <th className="p-3 text-left w-8"></th>
                  <th className="p-3 text-left">Period</th>
                  <th className="p-3 text-left">Voucher No.</th>
                  <th className="p-3 text-left">Posted At</th>
                  <th className="p-3 text-right">Earnings</th>
                  <th className="p-3 text-right">Deductions</th>
                  <th className="p-3 text-right">Net Pay</th>
                  <th className="p-3 text-right">Employees</th>
                </tr>
              </thead>
              <tbody>
                {postedRuns.map((run) => {
                  const isExpanded = expandedRunId === run.id;
                  const slips: PayslipSummary[] = payslipCache[run.id] || [];
                  const runEarnings = slips.reduce((s, p) => s + (p.earnings_total ?? 0), 0);
                  const runDeductions = slips.reduce((s, p) => s + (p.deductions_total ?? 0), 0);
                  const runNet = slips.reduce((s, p) => s + (p.net_pay ?? 0), 0);

                  return (
                    <React.Fragment key={run.id}>
                      {/* Run Row */}
                      <tr
                        className="hover:bg-violet-50/50 dark:hover:bg-violet-900/10 transition-colors cursor-pointer border-b border-slate-100 dark:border-slate-800"
                        onClick={() => toggleExpand(run.id, run.voucher_id)}
                      >
                        <td className="p-3 text-center">
                          <div className={`w-5 h-5 rounded-full flex items-center justify-center border transition-all ${isExpanded ? "bg-violet-600 border-violet-600 text-white" : "border-slate-300 dark:border-slate-600 text-slate-400"}`}>
                            <svg className={`w-2.5 h-2.5 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="font-black text-slate-900 dark:text-slate-100">
                            {activeMonths[run.period_month - 1]} {run.period_year}
                          </div>
                        </td>
                        <td className="p-3">
                          <span className="px-2 py-0.5 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-bold text-[10px] uppercase tracking-wide">
                            {run.voucher_number ? run.voucher_number : <VoucherNumberDisplay companyId={companyId} voucherId={run.voucher_id} />}
                          </span>
                        </td>
                        <td className="p-3 text-slate-500 tabular-nums">
                          {run.posted_at ? formatDateWithMonthName(run.posted_at, effectiveDisplayMode) : "—"}
                        </td>
                        <td className="p-3 text-right font-bold text-emerald-700 dark:text-emerald-400 tabular-nums">
                          {slips.length > 0 ? fmt(runEarnings) : <span className="text-slate-300 dark:text-slate-600 italic text-[9px]">expand</span>}
                        </td>
                        <td className="p-3 text-right font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                          {slips.length > 0 ? fmt(runDeductions) : ""}
                        </td>
                        <td className="p-3 text-right font-black text-slate-900 dark:text-slate-100 tabular-nums">
                          {slips.length > 0 ? fmt(runNet) : ""}
                        </td>
                        <td className="p-3 text-right">
                          {slips.length > 0 ? (
                            <span className="px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[10px]">{slips.length}</span>
                          ) : ""}
                        </td>
                      </tr>

                      {/* Details Area */}
                      {isExpanded && (
                        <>
                          {/* Voucher / Ledger Details */}
                          {run.voucher_id && (
                            <tr>
                              <td colSpan={8} className="p-0 border-b border-violet-100 dark:border-violet-900/30">
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-4 pl-10 border-l-4 border-l-indigo-500">
                                  <div className="flex flex-wrap items-center justify-between mb-3 gap-4">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-indigo-500 flex items-center gap-2">
                                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                                      Accounting Journal Entry
                                    </h4>
                                    {voucherCache[run.voucher_id] && (
                                      <div className="flex items-center gap-6">
                                        <div className="flex flex-col">
                                          <span className="text-[8px] uppercase tracking-widest font-black text-slate-400">Voucher No</span>
                                          <a href={`/companies/${companyId}/vouchers/${run.voucher_id}`} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                                            {voucherCache[run.voucher_id].voucher_number || "—"}
                                          </a>
                                        </div>
                                        <div className="flex flex-col">
                                          <span className="text-[8px] uppercase tracking-widest font-black text-slate-400">Posted Date</span>
                                          <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                                            {voucherCache[run.voucher_id].voucher_date ? (
                                              <FormattedDate date={voucherCache[run.voucher_id].voucher_date} mode={effectiveDisplayMode} />
                                            ) : "—"}
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {voucherLoading && !voucherCache[run.voucher_id] ? (
                                    <div className="text-[10px] text-slate-400 italic animate-pulse">Loading voucher details...</div>
                                  ) : voucherCache[run.voucher_id] ? (
                                    <table className="w-full text-xs max-w-4xl border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden bg-white dark:bg-slate-950">
                                      <thead className="bg-slate-100 dark:bg-slate-800">
                                        <tr>
                                          <th className="p-2.5 text-left text-[9px] uppercase font-bold text-slate-500 w-1/2">Ledger Account</th>
                                          <th className="p-2.5 text-right text-[9px] uppercase font-bold text-slate-500 w-1/4">Debit</th>
                                          <th className="p-2.5 text-right text-[9px] uppercase font-bold text-slate-500 w-1/4">Credit</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {(voucherCache[run.voucher_id].lines || [])
                                          .filter((l: any) => !filterPayhead || l.ledger_name?.toLowerCase() === filterPayhead.toLowerCase())
                                          .map((line: any, idx: number) => (
                                          <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                                            <td className="p-2.5 text-slate-800 dark:text-slate-200 font-semibold">
                                              {line.ledger_name}
                                              {line.narration && <div className="text-[10px] text-slate-500 mt-1 italic font-normal">{line.narration}</div>}
                                            </td>
                                            <td className="p-2.5 text-right text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">
                                              {line.debit > 0 ? fmt(line.debit) : ""}
                                            </td>
                                            <td className="p-2.5 text-right text-rose-600 dark:text-rose-400 font-bold tabular-nums">
                                              {line.credit > 0 ? fmt(line.credit) : ""}
                                            </td>
                                          </tr>
                                        ))}
                                        {(voucherCache[run.voucher_id].lines || [])
                                          .filter((l: any) => !filterPayhead || l.ledger_name?.toLowerCase() === filterPayhead.toLowerCase()).length === 0 && (
                                          <tr>
                                            <td colSpan={3} className="p-4 text-center text-[10px] text-slate-400 italic">No ledger lines found matching the pay head filter.</td>
                                          </tr>
                                        )}
                                      </tbody>
                                      <tfoot className="bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800">
                                        <tr>
                                          <td className="p-2.5 text-right text-[9px] uppercase font-black text-slate-500">Voucher Total</td>
                                          <td className="p-2.5 text-right text-emerald-700 dark:text-emerald-500 font-black tabular-nums">
                                            {fmt((voucherCache[run.voucher_id].lines || []).reduce((s: number, l: any) => s + (l.debit || 0), 0))}
                                          </td>
                                          <td className="p-2.5 text-right text-rose-700 dark:text-rose-500 font-black tabular-nums">
                                            {fmt((voucherCache[run.voucher_id].lines || []).reduce((s: number, l: any) => s + (l.credit || 0), 0))}
                                          </td>
                                        </tr>
                                      </tfoot>
                                    </table>
                                  ) : (
                                    <div className="text-[10px] text-rose-400 italic">Failed to load voucher ledger details.</div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}

                          {/* Employee Detail Rows */}
                          {payslipLoading && !slips.length ? (
                            <tr>
                              <td colSpan={8} className="p-4 text-center text-[10px] text-violet-500 font-bold animate-pulse">Loading employee details...</td>
                            </tr>
                          ) : slips.length === 0 ? (
                            <tr>
                              <td colSpan={8} className="p-4 text-center text-[10px] text-slate-400">No payslip data available.</td>
                            </tr>
                          ) : (
                            <>
                              {/* Sub-header */}
                              <tr className="bg-violet-50/60 dark:bg-violet-900/10">
                                <td className="pl-10 py-2 text-[9px] font-black text-violet-400 uppercase tracking-widest" colSpan={2}>↳ Employee</td>
                                <td className="py-2 text-[9px] font-black text-violet-400 uppercase tracking-widest">Payable Days</td>
                                <td className="py-2 text-[9px] font-black text-violet-400 uppercase tracking-widest text-right pr-3">Earnings</td>
                                <td className="py-2 text-[9px] font-black text-violet-400 uppercase tracking-widest text-right pr-3">Deductions</td>
                                <td className="py-2 text-[9px] font-black text-violet-400 uppercase tracking-widest text-right pr-3" colSpan={3}>Net Pay</td>
                              </tr>
                              {slips.filter(s => !filterEmployeeId || s.employee_id.toString() === filterEmployeeId).map((slip) => (
                                <tr key={slip.employee_id} className="border-b border-violet-50 dark:border-violet-900/20 hover:bg-violet-50/30 dark:hover:bg-violet-900/5 transition-colors">
                                  <td className="pl-10 py-2.5" colSpan={2}>
                                    <div className="flex items-center gap-2">
                                      <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center text-[8px] font-black text-violet-600">
                                        {(employeeMap.get(slip.employee_id) || slip.employee_name || "?").charAt(0).toUpperCase()}
                                      </div>
                                      <div>
                                        <div className="font-bold text-slate-800 dark:text-slate-200 text-[11px]">{employeeMap.get(slip.employee_id) || slip.employee_name || `Employee #${slip.employee_id}`}</div>
                                        {slip.is_overridden && (
                                          <span className="text-[9px] text-amber-500 font-bold">⚠ Overridden</span>
                                        )}
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 text-slate-500 tabular-nums text-[11px]">
                                    {slip.payable_days ?? "—"} days
                                  </td>
                                  <td className="py-2.5 text-right pr-3 text-emerald-700 dark:text-emerald-400 font-bold tabular-nums">{fmt(slip.earnings_total)}</td>
                                  <td className="py-2.5 text-right pr-3 text-rose-600 dark:text-rose-400 font-bold tabular-nums">{fmt(slip.deductions_total)}</td>
                                  <td className="py-2.5 text-right pr-3 text-slate-900 dark:text-slate-100 font-black tabular-nums" colSpan={3}>{fmt(slip.net_pay)}</td>
                                </tr>
                              ))}
                              {slips.filter(s => !filterEmployeeId || s.employee_id.toString() === filterEmployeeId).length === 0 && (
                                <tr>
                                  <td colSpan={8} className="p-4 text-center text-[10px] text-slate-400 italic">No payslips found matching the employee filter.</td>
                                </tr>
                              )}
                              {/* Run subtotal */}
                              {!filterEmployeeId && (
                                <tr className="bg-violet-100/60 dark:bg-violet-900/20 border-b-2 border-violet-200 dark:border-violet-800">
                                  <td className="pl-10 py-2 font-black text-violet-700 dark:text-violet-300 text-[10px] uppercase tracking-widest" colSpan={3}>
                                    Subtotal — {activeMonths[run.period_month - 1]} {run.period_year}
                                  </td>
                                  <td className="py-2 text-right pr-3 font-black text-emerald-700 dark:text-emerald-300 tabular-nums">{fmt(runEarnings)}</td>
                                  <td className="py-2 text-right pr-3 font-black text-rose-600 dark:text-rose-300 tabular-nums">{fmt(runDeductions)}</td>
                                  <td className="py-2 text-right pr-3 font-black text-slate-900 dark:text-slate-100 tabular-nums" colSpan={3}>{fmt(runNet)}</td>
                                </tr>
                              )}
                            </>
                          )}
                        </>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>

              {/* Grand total footer */}
              <tfoot className="bg-slate-900 text-white font-black text-[11px] sticky bottom-0 z-10 uppercase tracking-widest">
                <tr>
                  <td className="p-4" colSpan={4}>
                    Grand Total — {postedRuns.length} posted run{postedRuns.length !== 1 ? "s" : ""}
                  </td>
                  <td className="p-4 text-right border-l border-slate-800 text-emerald-400 tabular-nums">{fmt(totals.earnings)}</td>
                  <td className="p-4 text-right border-l border-slate-800 text-rose-400 tabular-nums">{fmt(totals.deductions)}</td>
                  <td className="p-4 text-right border-l border-slate-800 tabular-nums" colSpan={2}>{fmt(totals.netPay)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

      {/* Footer */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em]">
        <div>Generated: {mounted ? new Date().toLocaleString() : ""}</div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
            Payroll Voucher Report
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            {mounted ? (cc?.name || "Company") : "Company"}
          </div>
        </div>
      </div>
    </div>
  );
}
