"use client";

import useSWR from "swr";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from "@/lib/api";
import { deriveSettlement } from "@/lib/paymentModeSettlement";
import { Input } from "@/components/ui/Input";
import { NepaliDatePicker } from "nepali-datepicker-reactjs";
import { safeADToBS, safeBSToAD } from "@/lib/bsad";
import {
  CalendarDisplayMode,
  CalendarReportDisplayMode,
  readCalendarDisplayMode,
  readCalendarReportDisplayMode,
  writeCalendarReportDisplayMode,
} from "@/lib/calendarMode";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type Supplier = {
  id: number;
  name: string;
};

type LedgerBalanceType = "DEBIT" | "CREDIT";

type LedgerTransaction = {
  date: string;
  voucher_id: number | null;
  voucher_type: string | null;
  voucher_number: string | null;
  payment_mode: string | null;
  narration: string | null;
  remarks: string | null;
  item_name: string | null;
  department_name: string | null;
  project_name: string | null;
  debit: number;
  credit: number;
  balance: number;
  balance_type: LedgerBalanceType;
};

type SupplierLedgerResponse = {
  company_id: number;
  company_name?: string;
  supplier_id: number;
  supplier_name: string;
  ledger_id: number;
  ledger_name: string;
  from_date?: string;
  to_date?: string;
  opening_balance: number;
  opening_balance_type: LedgerBalanceType;
  transactions: LedgerTransaction[];
  total_debit?: number;
  total_credit?: number;
  closing_balance: number;
  closing_balance_type: LedgerBalanceType;
};

export default function SupplierLedgerReportPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params?.companyId as string | undefined;

  const { data: suppliers } = useSWR<Supplier[]>(
    companyId ? `/companies/${companyId}/suppliers` : null,
    fetcher
  );

  const { data: employees } = useSWR(
    companyId ? `/payroll/companies/${companyId}/employees` : null,
    fetcher
  );

  const { data: companySettings } = useSWR<{ company_id: number; calendar_mode: "AD" | "BS" }>(
    companyId ? `/companies/${companyId}/settings` : null,
    fetcher
  );

  const { data: companyInfo } = useSWR<{ fiscal_year_start?: string }>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );
  const [mounted, setMounted] = useState(false);
  const initialCC = typeof window !== 'undefined' ? getCurrentCompany() : null;
  const initialMode = initialCC?.calendar_mode || "AD";
  const { from: initialFrom, to: initialTo } = getSmartDefaultPeriod(initialMode, initialCC);

  const [effectiveDisplayMode, setEffectiveDisplayMode] = useState<"AD" | "BS">(() => {
    const stored = readCalendarDisplayMode(initialCC?.id ? String(initialCC.id) : '', initialMode);
    return (stored === 'BOTH' ? initialMode : stored) as "AD" | "BS";
  });
  const [fromDate, setFromDate] = useState(initialFrom);
  const [toDate, setToDate] = useState(initialTo);

  useEffect(() => {
    setMounted(true);
  }, []);

  const cc = mounted ? getCurrentCompany() : initialCC;

  // Sync state if settings change or dbCompany loads
  useEffect(() => {
    if (mounted && companySettings?.calendar_mode) {
      if (companySettings.calendar_mode !== effectiveDisplayMode) {
        setEffectiveDisplayMode(companySettings.calendar_mode);
        const { from, to } = getSmartDefaultPeriod(companySettings.calendar_mode, companySettings as any);
        setFromDate(from);
        setToDate(to);
      }
    }
  }, [mounted, companySettings?.calendar_mode]);

  const isBS = effectiveDisplayMode === "BS";

  const [supplierId, setSupplierId] = useState<string>("");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [presetMonth, setPresetMonth] = useState<string>("custom");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ledgerData, setLedgerData] = useState<SupplierLedgerResponse | null>(null);

  const printRef = useRef<HTMLDivElement | null>(null);

  const effectiveDisplayModeToUse = effectiveDisplayMode;

  const displayDate = (d: string): string => {
    if (!d) return "";
    // Backend always returns dates in AD (ISO) format.
    if (effectiveDisplayMode === "BS") {
      return safeADToBS(d) || d;
    }
    return d;
  };

  const presetMonths = useMemo(() => {
    const result: { value: string; label: string }[] = [];
    result.push({ value: "this_year", label: "This Year (Full)" });
    result.push({ value: "custom", label: "Custom Range" });
    let currentYear = new Date().getFullYear();
    let currentMonth = new Date().getMonth() + 1;
    if (effectiveDisplayMode === "BS") {
      const todayBS = safeADToBS(new Date().toISOString().slice(0, 10));
      const parts = todayBS?.split("-") || [];
      if (parts.length >= 3) { currentYear = parseInt(parts[0], 10); currentMonth = parseInt(parts[1], 10); }
    }
    for (let i = 0; i < 24; i++) {
      let y = currentYear; let m = currentMonth - i;
      while (m <= 0) { m += 12; y -= 1; }
      const monthStr = m.toString().padStart(2, "0");
      const val = `${y}-${monthStr}`;
      let label = val;
      if (effectiveDisplayMode === "BS") {
        const bsMonths = ["Baisakh", "Jestha", "Ashadh", "Shrawan", "Bhadra", "Ashwin", "Kartik", "Mangsir", "Poush", "Magh", "Falgun", "Chaitra"];
        label = `${bsMonths[m - 1]} ${y}`;
      } else {
        const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        label = `${adMonths[m - 1]} ${y}`;
      }
      result.push({ value: val, label });
    }
    return result;
  }, [effectiveDisplayMode]);

  const handlePresetMonthChange = (val: string) => {
    setPresetMonth(val);
    if (val === "custom") return;
    if (val === "this_year") {
      const today = new Date();
      const fromISO = `${today.getFullYear()}-01-01`;
      const toISO = `${today.getFullYear()}-12-31`;
      setFromDate(effectiveDisplayMode === "BS" ? safeADToBS(fromISO) || "" : fromISO);
      setToDate(effectiveDisplayMode === "BS" ? safeADToBS(toISO) || "" : toISO);
      return;
    }
    const [yStr, mStr] = val.split("-");
    const y = parseInt(yStr, 10); const m = parseInt(mStr, 10);
    const firstDay = `${y}-${mStr}-01`;
    let lastDay = `${y}-${mStr}-30`;
    if (effectiveDisplayMode !== "BS") {
      const d = new Date(y, m, 0);
      lastDay = `${y}-${mStr}-${d.getDate().toString().padStart(2, "0")}`;
    } else {
      for (let d = 32; d >= 29; d--) {
        const testVal = `${y}-${mStr}-${d.toString().padStart(2, "0")}`;
        if (safeBSToAD(testVal) !== "") { lastDay = testVal; break; }
      }
    }
    setFromDate(firstDay); setToDate(lastDay);
  };

  const handleCustomFromDate = (val: string) => {
    setPresetMonth("custom");
    setFromDate(val);
  };

  const handleCustomToDate = (val: string) => {
    setPresetMonth("custom");
    setToDate(val);
  };

  const handleToChangeBS = (bs: string) => {
    if (!bs) {
      setToDate("");
      return;
    }
    setToDate(isBS ? bs : safeBSToAD(bs) || "");
  };

  useEffect(() => {
    const idFromUrl = searchParams.get("supplier_id");
    if (idFromUrl) {
      setSupplierId(idFromUrl);
    }
  }, [searchParams]);

  const handleView = async () => {
    if (!companyId) return;
    setError(null);

    if (!supplierId) {
      setError("Please select a supplier.");
      return;
    }
    if (!fromDate || !toDate) {
      setError("Please select both From and To dates.");
      return;
    }

    setLoading(true);
    try {
      const res = await api.get<SupplierLedgerResponse>(
        `/companies/${companyId}/reports/supplier-ledger`,
        {
          params: {
            supplier_id: Number(supplierId),
            from_date: isBS ? safeBSToAD(fromDate) : fromDate,
            to_date: isBS ? safeBSToAD(toDate) : toDate,
            employee_id: employeeId ? Number(employeeId) : undefined,
          },
        }
      );
      setLedgerData(res.data);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setLedgerData(null);
      setError(
        typeof detail === "string" ? detail : "Failed to load supplier ledger."
      );
    } finally {
      setLoading(false);
    }
  };

  const selectedSupplierName = useMemo(() => {
    if (!supplierId || !suppliers) return "";
    const idNum = Number(supplierId);
    const found = suppliers.find((s) => s.id === idNum);
    return found?.name || "";
  }, [supplierId, suppliers]);

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    if (!printRef.current) {
      window.print();
      return;
    }

    const printContents = printRef.current.innerHTML;
    const originalHead = document.head.innerHTML;
    const printWindow = window.open("", "_blank");
    if (!printWindow) return;

    printWindow.document.open();
    printWindow.document.write(
      `<!doctype html><html><head>${originalHead}<style>.print-hidden{display:none !important;} table.print-table{border-collapse:collapse;width:100%;font-size:10px;} table.print-table th,table.print-table td{border:1px solid #e2e8f0;padding:2px 3px;} .print-toolbar{padding:8px 12px;border-bottom:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;font-family:sans-serif;background:#f8fafc;} .print-toolbar button{padding:4px 12px;border:1px solid #cbd5e1;border-radius:4px;background:#fff;font-size:11px;cursor:pointer;font-weight:600;} .print-toolbar button:hover{background:#f1f5f9;} .print-toolbar .primary{background:#4f46e5;color:#fff;border-color:#4f46e5;} .print-toolbar .primary:hover{background:#4338ca;} @media print{.print-toolbar{display:none !important;} body{-webkit-print-color-adjust:exact;print-color-adjust:exact;} table{page-break-inside:auto;} tr{page-break-inside:avoid;} thead{display:table-header-group;}} @page{size:landscape;margin:6mm;}</style></head><body><div class="print-toolbar"><button class="primary" onclick="window.print()">Print</button><button onclick="window.close()">Close</button></div>${printContents}<script>(function(){var st=document.createElement('style');st.textContent='@page{size:landscape;margin:6mm;}';document.head.appendChild(st);window.onload=function(){var b=document.body,pw=b.clientWidth,sw=b.scrollWidth;if(sw>pw+5){var s=pw/sw;b.style.transform=\"scale(\"+s+\")\";b.style.transformOrigin=\"top left\";b.style.width=(100/s)+\"%\";}};})()</script></body></html>`
    );
    printWindow.document.close();
    printWindow.focus();
  };

  const totalDebit = useMemo(() => {
    if (!ledgerData) return 0;
    if (typeof ledgerData.total_debit === "number") {
      return ledgerData.total_debit;
    }
    return ledgerData.transactions.reduce((sum, t) => sum + (t.debit || 0), 0);
  }, [ledgerData]);

  const totalCredit = useMemo(() => {
    if (!ledgerData) return 0;
    if (typeof ledgerData.total_credit === "number") {
      return ledgerData.total_credit;
    }
    return ledgerData.transactions.reduce((sum, t) => sum + (t.credit || 0), 0);
  }, [ledgerData]);

  const formatMoney = (val: number | null | undefined) => {
    if (val == null || Number.isNaN(val)) return "0.00";
    return Number(val).toFixed(2);
  };

  const mapBalanceType = (t: LedgerBalanceType | null | undefined) => {
    if (!t) return "";
    return t === "DEBIT" ? "Dr" : "Cr";
  };

  const mapVoucherType = (type: string | null | undefined) => {
    if (!type) return "";
    switch (type) {
      case "PAYMENT":
        return "Payment Voucher";
      case "RECEIPT":
        return "Receipt Voucher";
      case "CONTRA":
        return "Contra Voucher";
      case "JOURNAL":
        return "Journal Voucher";
      case "SALES_INVOICE":
        return "Sales Invoice";
      case "PURCHASE_BILL":
        return "Purchase Invoice";
      case "SALES_RETURN":
        return "Sales Return";
      case "PURCHASE_RETURN":
        return "Purchase Return";
      default:
        return type;
    }
  };

  if (!companyId) return null;

  return (
    <div className="space-y-4">
      {/* Compact Header - matching voucher page style */}
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40">
              <svg className="w-4 h-4 text-indigo-600 dark:text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Supplier Ledger Report</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">Supplier account transaction history</p>
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all duration-150"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v5a2 2 0 002 2h1v1a1 1 0 001 1h8a1 1 0 001-1v-1h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a1 1 0 00-1-1H6a1 1 0 00-1 1zm2 0h6v3H7V4zm-1 9a1 1 0 011-1h6a1 1 0 011 1v3H6v-3zm8-5a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" /></svg>
              Print
            </button>
          </div>
        </div>
      </div>

      <div
        className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm bg-slate-50/50 dark:bg-slate-900/50"
      >
        <div className="px-5 py-3 flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
          <span className="text-slate-800 dark:text-slate-200 text-sm font-semibold tracking-wide">🔍 Supplier & Date Filters</span>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-4 text-sm">
          <div>
            <label className="block mb-1">Supplier</label>
            <select
              className="border rounded px-2 py-1 text-xs min-w-[220px]"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              <option value="">Select supplier</option>
              {suppliers?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">Employee</label>
            <select
              className="border rounded px-2 py-1 text-xs min-w-[150px]"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">All Employees</option>
              {employees?.map((emp: any) => (
                <option key={emp.id} value={emp.id}>
                  {emp.full_name || emp.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">Date Display</label>
            <select
              className="border rounded px-2 py-1 bg-white"
              value={effectiveDisplayMode}
              onChange={(e) => {
                const next = e.target.value as "AD" | "BS";
                setEffectiveDisplayMode(next);
                writeCalendarReportDisplayMode(companyId, next);
              }}
            >
              <option value="AD">AD</option>
              <option value="BS">BS</option>
            </select>
          </div>
          <div>
            <label className="block mb-1">Select Month</label>
            <select
              className="border rounded px-2 py-1 min-w-[140px]"
              value={presetMonth}
              onChange={(e) => handlePresetMonthChange(e.target.value)}
            >
              {presetMonths.map((pm) => (
                <option key={pm.value} value={pm.value}>{pm.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block mb-1">From</label>
            {effectiveDisplayMode === "BS" ? (
              <NepaliDatePicker
                inputClassName="border rounded px-2 py-1"
                value={fromDate}
                onChange={(value: string) => handleCustomFromDate(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                // @ts-ignore
                minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                // @ts-ignore
                maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
              />
            ) : (
              <Input forceNative type="date"
                className="border rounded px-2 py-1"
                value={fromDate}
                min={cc?.fiscal_year_start || ""}
                max={cc?.fiscal_year_end || ""}
                onChange={(e) => handleCustomFromDate(e.target.value)}
              />
            )}
          </div>
          <div>
            <label className="block mb-1">To</label>
            {effectiveDisplayMode === "BS" ? (
              <NepaliDatePicker
                inputClassName="border rounded px-2 py-1"
                value={toDate}
                onChange={(value: string) => handleCustomToDate(value)}
                options={{ calenderLocale: 'ne', valueLocale: 'en' }}
                // @ts-ignore
                minDate={cc?.fiscal_year_start ? (safeADToBS(cc.fiscal_year_start) || "") : ""}
                // @ts-ignore
                maxDate={cc?.fiscal_year_end ? (safeADToBS(cc.fiscal_year_end) || "") : ""}
              />
            ) : (
              <Input forceNative type="date"
                className="border rounded px-2 py-1"
                value={toDate}
                min={cc?.fiscal_year_start || ""}
                max={cc?.fiscal_year_end || ""}
                onChange={(e) => handleCustomToDate(e.target.value)}
              />
            )}
          </div>
          <div className="flex flex-col gap-1 text-xs mt-4 md:mt-0">
            <button
              type="button"
              className="px-3 py-1 rounded border border-slate-300 bg-white hover:bg-slate-50"
              onClick={handleView}
              disabled={loading}
            >
              {loading ? "Loading..." : "View Ledger"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2 rounded">
          {error}
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 shadow-sm p-4 text-sm space-y-3">
        {ledgerData ? (
          <div ref={printRef}>
            <div
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: "4px",
                padding: "8px 10px",
              }}
            >
              <div className="mb-2">
                <div
                  style={{
                    textAlign: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                    paddingBottom: "2px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  {ledgerData.company_name || cc?.name || ""}
                </div>
                {cc && (cc as any).address && (
                  <div
                    style={{
                      textAlign: "center",
                      fontSize: "9px",
                      color: "#475569",
                      paddingTop: "2px",
                      paddingBottom: "2px",
                      borderBottom: "1px solid #e2e8f0",
                    }}
                  >
                    {(cc as any).address}
                  </div>
                )}
                <div
                  style={{
                    marginTop: "4px",
                    fontSize: "11px",
                    fontWeight: 600,
                    textAlign: "left",
                    paddingBottom: "2px",
                    borderBottom: "1px solid #e2e8f0",
                  }}
                >
                  Supplier Ledger: {ledgerData.ledger_name}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "9px",
                    color: "#64748b",
                    paddingTop: "2px",
                  }}
                >
                  <span>
                    Account: {ledgerData.supplier_name || selectedSupplierName}
                  </span>
                  <span>
                    {`Linked ledger: ${ledgerData.ledger_name}`}
                  </span>
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "9px",
                    color: "#64748b",
                    paddingTop: "2px",
                  }}
                >
                  <span>
                    Operation Date: {displayDate(ledgerData.from_date || fromDate)} To {" "}
                    {displayDate(ledgerData.to_date || toDate)}
                  </span>
                </div>
              </div>

              <table className="w-full text-xs print-table">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 px-1">Date</th>
                    <th className="text-left py-1 px-1">Doc No.</th>
                    <th className="text-left py-1 px-1">Payment Mode</th>
                    <th className="text-left py-1 px-1">Dept.</th>
                    <th className="text-left py-1 px-1">Proj.</th>
                    <th className="text-left py-1 px-1">Doc Class</th>
                    <th className="text-left py-1 px-1">Particular</th>
                    <th className="text-right py-1 px-1">Opening</th>
                    <th className="text-right py-1 px-1">Debit</th>
                    <th className="text-right py-1 px-1">Credit</th>
                    <th className="text-right py-1 px-1">Balance</th>
                    <th className="text-right py-1 px-1">Type</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="py-1 px-1">{displayDate(ledgerData.from_date || fromDate)}</td>
                    <td className="py-1 px-1 text-xs" />
                    <td className="py-1 px-1 text-xs" />
                    <td className="py-1 px-1 text-xs" />
                    <td className="py-1 px-1 text-xs" />
                    <td className="py-1 px-1 text-xs text-slate-600">
                      Subledger Opening B/L
                    </td>
                    <td className="py-1 px-1 text-right">
                      {formatMoney(ledgerData.opening_balance)}
                    </td>
                    <td className="py-1 px-1 text-right">0.00</td>
                    <td className="py-1 px-1 text-right">0.00</td>
                    <td className="py-1 px-1 text-right">
                      {formatMoney(ledgerData.opening_balance)}{" "}
                      {mapBalanceType(ledgerData.opening_balance_type)}
                    </td>
                    <td className="py-1 px-1 text-right">
                      {mapBalanceType(ledgerData.opening_balance_type)}
                    </td>
                  </tr>
                  {ledgerData.transactions.map((t) => (
                    <tr
                      key={`${t.date}-${t.voucher_id || ""}`}
                      className="border-b last:border-none"
                    >
                      <td className="py-1 px-1">{displayDate(String(t.date || ""))}</td>
                      <td className="py-1 px-1 text-xs">{t.voucher_number}</td>
                      <td className="py-1 px-1 text-xs">{t.payment_mode}</td>
                      <td className="py-1 px-1 text-[10px] text-slate-500 italic">{t.department_name || ""}</td>
                      <td className="py-1 px-1 text-[10px] text-slate-500 italic">{t.project_name || ""}</td>
                      <td className="py-1 px-1 text-xs">
                        {mapVoucherType(t.voucher_type)}
                      </td>
                      <td className="py-1 px-1 text-xs text-slate-600">
                        <div className="flex flex-col">
                          <span className="font-medium text-slate-800 dark:text-slate-200">{t.narration || ""}</span>
                          {t.remarks && (
                            <span className="text-[10px] text-slate-500 italic mt-0.5 leading-tight">
                              {t.remarks}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-1 px-1 text-right" />
                      <td className="py-1 px-1 text-right">
                        {formatMoney(t.debit)}
                      </td>
                      <td className="py-1 px-1 text-right">
                        {formatMoney(t.credit)}
                      </td>
                      <td className="py-1 px-1 text-right">
                        {(() => {
                          const isDoc =
                            t.voucher_type === "SALES_INVOICE" || t.voucher_type === "PURCHASE_BILL";
                          if (!isDoc) return formatMoney(t.balance);

                          const docTotal = (t.debit || 0) > 0 ? t.debit : t.credit;
                          const settlement = deriveSettlement(
                            t.payment_mode ? 1 : null,
                            t.payment_mode,
                            docTotal,
                          );
                          return settlement.isCashOrBank ? "0.00" : formatMoney(t.balance);
                        })()}
                      </td>
                      <td className="py-1 px-1 text-right">
                        {(() => {
                          const isDoc =
                            t.voucher_type === "SALES_INVOICE" || t.voucher_type === "PURCHASE_BILL";
                          if (!isDoc) return mapBalanceType(t.balance_type);

                          const docTotal = (t.debit || 0) > 0 ? t.debit : t.credit;
                          const settlement = deriveSettlement(
                            t.payment_mode ? 1 : null,
                            t.payment_mode,
                            docTotal,
                          );
                          return settlement.isCashOrBank ? "PAID" : mapBalanceType(t.balance_type);
                        })()}
                      </td>
                    </tr>
                  ))}
                  {ledgerData.transactions.length === 0 && (
                    <tr>
                      <td
                        className="py-2 px-2 text-center text-slate-500"
                        colSpan={9}
                      >
                        No transactions found for this period.
                      </td>
                    </tr>
                  )}
                  <tr className="border-t">
                    <td className="py-1 px-1" />
                    <td className="py-1 px-1" />
                    <td className="py-1 px-1" />
                    <td className="py-1 px-1 text-right font-medium">
                      Operation Total:
                    </td>
                    <td className="py-1 px-1 text-right" />
                    <td className="py-1 px-1 text-right font-medium">
                      {formatMoney(totalDebit)}
                    </td>
                    <td className="py-1 px-1 text-right font-medium">
                      {formatMoney(totalCredit)}
                    </td>
                    <td className="py-1 px-1 text-right" />
                    <td className="py-1 px-1 text-right" />
                  </tr>
                  <tr className="border-t">
                    <td className="py-1 px-1" />
                    <td className="py-1 px-1" />
                    <td className="py-1 px-1" />
                    <td className="py-1 px-1 text-right font-medium">
                      Closing Balance :
                    </td>
                    <td className="py-1 px-1 text-right" />
                    <td className="py-1 px-1 text-right" />
                    <td className="py-1 px-1 text-right font-medium">
                      {formatMoney(ledgerData.closing_balance)}
                    </td>
                    <td className="py-1 px-1 text-right font-medium">
                      {mapBalanceType(ledgerData.closing_balance_type)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-500">
            Please select a supplier and date range, then click &quot;View Ledger&quot;.
          </div>
        )}
      </div>
    </div>
  );
}
