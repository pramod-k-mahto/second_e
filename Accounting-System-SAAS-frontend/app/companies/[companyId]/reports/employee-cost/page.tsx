"use client";

import useSWR from 'swr';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { api, getCurrentCompany, getSmartDefaultPeriod, type CurrentCompany } from '@/lib/api';
import { useEffect, useMemo, useState, useRef, Fragment } from 'react';
import { NepaliDatePicker } from 'nepali-datepicker-reactjs';
import { Input } from '@/components/ui/Input';
import { safeBSToAD } from '@/lib/bsad';
import { FormattedDate } from '@/components/ui/FormattedDate';
import { openPrintWindow } from '@/lib/printReport';
import { writeCalendarReportDisplayMode, readCalendarDisplayMode } from '@/lib/calendarMode';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type EmployeeCostRow = {
  employee_id: number | null;
  employee_name: string | null;
  ledger_id?: number | null;
  ledger_name?: string | null;
  date?: string | null;
  voucher_id?: number | null;
  voucher_number?: string | null;
  debit: number;
  credit: number;
  remarks?: string | null;
  month_name?: string | null;
  year?: number | null;
};

type EmployeeCostReport = {
  company_id: number;
  from_date: string;
  to_date: string;
  rows: EmployeeCostRow[];
  total_debit: number;
  total_credit: number;
};

type CommissionInvoice = {
  id: number;
  date: string;
  number: string;
  voucher_date?: string;
  voucher_no?: string;
  post_method?: string;
  amount: number;
  ledger_name?: string;
  remarks?: string;
  rate_applied: number;
  commission: number;
  rules: { name: string; ledger_id: number | null; ledger_name: string }[];
};

type CommissionReportItem = {
  employee_id: number;
  employee_name: string;
  employee_code?: string;
  total_sales: number;
  commission_amount: number;
  invoices: CommissionInvoice[];
};

export default function EmployeeCostReportPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;
  const searchParams = useSearchParams();

  const [reportType, setReportType] = useState<'COST' | 'INCENTIVE'>('COST');

  const { data: employees } = useSWR(
    companyId ? `/payroll/companies/${companyId}/employees` : null,
    fetcher
  );

  const { data: departments } = useSWR(
    companyId ? `/companies/${companyId}/departments` : null,
    fetcher
  );

  const { data: projects } = useSWR(
    companyId ? `/companies/${companyId}/projects` : null,
    fetcher
  );

  const { data: segments } = useSWR(
    companyId ? `/companies/${companyId}/segments` : null,
    fetcher
  );

  const { data: ledgers } = useSWR(
    companyId ? `/ledgers/companies/${companyId}/ledgers` : null,
    fetcher
  );

  const { data: employeeTypes } = useSWR(
    companyId ? `/payroll/companies/${companyId}/employee-types` : null,
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
  const [employeeId, setEmployeeId] = useState('');
  const [ledgerId, setLedgerId] = useState('');
  const [employeeTypeId, setEmployeeTypeId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [segmentId, setSegmentId] = useState('');

  const [groupBy, setGroupBy] = useState<'TRANSACTION' | 'LEDGER' | 'MONTH'>('TRANSACTION');

  // Expanded rows for incentive report
  const [expandedIncentiveRows, setExpandedIncentiveRows] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setMounted(true);
  }, []);

  const { data: dbCompany } = useSWR<CurrentCompany>(
    companyId ? `/companies/${companyId}` : null,
    fetcher
  );

  const cc = mounted ? getCurrentCompany() : initialCC;

  useEffect(() => {
    if (mounted) {
      const activeCo = dbCompany || cc;
      if (activeCo) {
        if (activeCo.calendar_mode && activeCo.calendar_mode !== effectiveDisplayMode) {
          setEffectiveDisplayMode(activeCo.calendar_mode as any);
          const { from, to } = getSmartDefaultPeriod(activeCo.calendar_mode as any, activeCo);
          setFromDate(from);
          setToDate(to);
        }
      }
    }
  }, [mounted, dbCompany?.id, cc?.calendar_mode]);

  const isBS = effectiveDisplayMode === 'BS';

  const apiFromDate = useMemo(() => {
    if (!fromDate) return '';
    return isBS ? safeBSToAD(fromDate) || '' : fromDate;
  }, [fromDate, isBS]);

  const apiToDate = useMemo(() => {
    if (!toDate) return '';
    return isBS ? safeBSToAD(toDate) || '' : toDate;
  }, [toDate, isBS]);

  // Employee Cost Data
  const { data: report, error: reportError, mutate: mutateReport } = useSWR<EmployeeCostReport>(
    reportType === 'COST' && companyId && apiFromDate && apiToDate
      ? `/reports/employee-cost?company_id=${companyId}&from_date=${apiFromDate}&to_date=${apiToDate}${employeeId ? `&employee_id=${employeeId}` : ''}${ledgerId ? `&ledger_id=${ledgerId}` : ''}${employeeTypeId ? `&employee_type_id=${employeeTypeId}` : ''}${departmentId ? `&department_id=${departmentId}` : ''}${projectId ? `&project_id=${projectId}` : ''}${segmentId ? `&segment_id=${segmentId}` : ''}&group_by=${groupBy}&calendar=${effectiveDisplayMode}`
      : null,
    fetcher
  );

  // Incentive Data
  const { data: incentiveReport, error: incentiveError, mutate: mutateIncentive } = useSWR<CommissionReportItem[]>(
    reportType === 'INCENTIVE' && companyId && apiFromDate && apiToDate
      ? `/companies/${companyId}/commissions/report?start_date=${apiFromDate}&end_date=${apiToDate}${departmentId ? `&department_id=${departmentId}` : ''}${projectId ? `&project_id=${projectId}` : ''}${segmentId ? `&segment_id=${segmentId}` : ''}`
      : null,
    fetcher
  );

  const printRef = useRef<HTMLDivElement | null>(null);

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    openPrintWindow({
      contentHtml: printRef.current?.innerHTML ?? "",
      title: reportType === 'COST' ? "Employee Cost Report" : "Sales Incentive Report",
      company: cc?.name || "",
      period: fromDate && toDate ? `${fromDate} – ${toDate}` : "",
      orientation: "landscape",
    });
  };

  const handleRefetch = () => {
    if (reportType === 'COST') mutateReport();
    else mutateIncentive();
  };

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="rounded-xl border border-slate-200/70 dark:border-slate-800/60 bg-white dark:bg-slate-950 shadow-sm">
        <div className="px-4 py-3 flex items-center justify-between border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-3">
             <button
                type="button"
                onClick={() => router.back()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 transition-all shadow-sm"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" /></svg>
              </button>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight leading-none mb-0.5">
                {reportType === 'COST' ? 'Employee Cost Report' : "Sales Persons' Incentive"}
              </h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">
                {reportType === 'COST' ? 'Transaction wise allocation' : 'Performance based commissions'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg">
               <button
                 type="button"
                 onClick={() => setReportType('COST')}
                 className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${reportType === 'COST' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 Cost Allocation
               </button>
               <button
                 type="button"
                 onClick={() => setReportType('INCENTIVE')}
                 className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${reportType === 'INCENTIVE' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
               >
                 Sales Incentives
               </button>
            </div>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <button
              type="button"
              onClick={handlePrint}
              disabled={(reportType === 'COST' ? !report?.rows.length : !incentiveReport?.length)}
              className="flex items-center gap-2 h-8 rounded-lg px-3 text-[11px] font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 hover:bg-slate-50 transition-all shadow-sm disabled:opacity-50"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4" /></svg>
              Print
            </button>
          </div>
        </div>

        <div className="p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          <div>
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Calendar</label>
            <select
              className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium focus:ring-1 focus:ring-indigo-400 transition-all outline-none"
              value={effectiveDisplayMode}
              onChange={(e) => {
                const next = e.target.value as 'AD' | 'BS';
                setEffectiveDisplayMode(next);
                writeCalendarReportDisplayMode(companyId, next);
                const { from, to } = getSmartDefaultPeriod(next, cc);
                setFromDate(from);
                setToDate(to);
              }}
            >
              <option value="AD">AD</option>
              <option value="BS">BS</option>
            </select>
          </div>

          <div>
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">From Date</label>
            {isBS ? (
              <NepaliDatePicker 
                inputClassName="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs outline-none"
                value={fromDate}
                onChange={(v) => setFromDate(v)}
              />
            ) : (
              <Input forceNative type="date" className="h-8 text-xs" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            )}
          </div>

          <div>
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">To Date</label>
            {isBS ? (
              <NepaliDatePicker 
                inputClassName="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs outline-none"
                value={toDate}
                onChange={(v) => setToDate(v)}
              />
            ) : (
              <Input forceNative type="date" className="h-8 text-xs" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            )}
          </div>

          <div>
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Employee</label>
            <select
              className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium outline-none"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">{reportType === 'COST' ? 'All Employees' : 'All Sales Persons'}</option>
              {employees?.map((emp: any) => (
                <option key={emp.id} value={emp.id}>{emp.full_name}</option>
              ))}
            </select>
          </div>

          {(reportType === 'COST' || reportType === 'INCENTIVE') && (
            <>
              {reportType === 'COST' && (
                <div>
                  <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Ledger</label>
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium outline-none"
                    value={ledgerId}
                    onChange={(e) => setLedgerId(e.target.value)}
                  >
                    <option value="">All Ledgers</option>
                    {ledgers?.map((l: any) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {reportType === 'COST' && (
                <div>
                  <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Employee Type</label>
                  <select
                    className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium outline-none"
                    value={employeeTypeId}
                    onChange={(e) => setEmployeeTypeId(e.target.value)}
                  >
                    <option value="">All Types</option>
                    {employeeTypes?.map((t: any) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">View Mode</label>
                <select
                  className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-bold text-indigo-600 outline-none"
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as any)}
                >
                  <option value="TRANSACTION">Transaction Wise</option>
                  {reportType === 'COST' ? (
                    <>
                      <option value="LEDGER">Ledger Wise</option>
                      <option value="MONTH">Month Wise</option>
                    </>
                  ) : (
                    <option value="LEDGER">Sales Person Wise</option>
                  )}
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Department</label>
            <select
              className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium outline-none"
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
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Project</label>
            <select
              className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium outline-none"
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
            <label className="block mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Segment</label>
            <select
              className="h-8 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 text-xs font-medium outline-none"
              value={segmentId}
              onChange={(e) => setSegmentId(e.target.value)}
            >
              <option value="">All Segments</option>
              {segments?.map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleRefetch}
              className="h-8 w-full rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition-all shadow-md shadow-indigo-200 dark:shadow-none"
            >
              Run Report
            </button>
          </div>
        </div>
      </div>

      {/* Report Container */}
      <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div ref={printRef} className="p-6 overflow-x-auto">
          {/* Print Header */}
          <div className="hidden print:block mb-6 text-center border-b pb-4">
            <h2 className="text-xl font-bold uppercase">{mounted ? cc?.name : ''}</h2>
            <p className="text-xs text-slate-500">{reportType === 'COST' ? 'Employee Cost Report' : 'Sales Incentive Report'}</p>
            <p className="text-[10px] mt-1">Period: {fromDate} to {toDate}</p>
          </div>

          {reportType === 'COST' ? (
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50">
                  {groupBy === 'TRANSACTION' && <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Date</th>}
                  {groupBy === 'MONTH' && <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Month</th>}
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Employee Name</th>
                  {groupBy !== 'MONTH' && <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Ledger</th>}
                  {groupBy === 'TRANSACTION' && <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Voucher No.</th>}
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-right">Debit</th>
                  <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-right">Credit</th>
                  {groupBy === 'TRANSACTION' && <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Remarks</th>}
                </tr>
              </thead>
              <tbody className="text-xs">
                {report && report.rows.length > 0 ? (
                  report.rows.map((row, idx) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                      {groupBy === 'TRANSACTION' && (
                        <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                          <FormattedDate date={row.date!} mode={effectiveDisplayMode} />
                        </td>
                      )}
                      {groupBy === 'MONTH' && (
                        <td className="px-3 py-2.5 whitespace-nowrap font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-tighter">
                          {row.month_name} {row.year}
                        </td>
                      )}
                      <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{row.employee_name}</td>
                      {groupBy !== 'MONTH' && <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400">{row.ledger_name}</td>}
                      {groupBy === 'TRANSACTION' && (
                        <td className="px-3 py-2.5 text-indigo-600 dark:text-indigo-400 font-semibold cursor-pointer hover:underline" onClick={() => {
                          const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
                          router.push(`/companies/${companyId}/vouchers/${row.voucher_id}?returnUrl=${returnUrl}`);
                        }}>
                          {row.voucher_number || `V#${row.voucher_id}`}
                        </td>
                      )}
                      <td className="px-3 py-2.5 text-right font-medium text-slate-800 dark:text-slate-200">
                        {row.debit > 0 ? row.debit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-right font-medium text-slate-800 dark:text-slate-200">
                        {row.credit > 0 ? row.credit.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '-'}
                      </td>
                      {groupBy === 'TRANSACTION' && (
                        <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 italic max-w-xs truncate" title={row.remarks || ''}>
                          {row.remarks || '-'}
                        </td>
                      )}
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={groupBy === 'TRANSACTION' ? 7 : (groupBy === 'MONTH' ? 4 : 4)} className="px-3 py-8 text-center text-slate-400 italic">{reportError ? "Failed to load report" : "No transactions found for the selected criteria."}</td>
                  </tr>
                )}
              </tbody>
              {report && report.rows.length > 0 && (
                <tfoot className="bg-slate-50/80 dark:bg-slate-900/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td colSpan={groupBy === 'TRANSACTION' ? 4 : (groupBy === 'MONTH' ? 2 : 2)} className="px-3 py-3 text-right uppercase tracking-wider text-[10px] text-slate-500">Totals</td>
                    <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                      {report.total_debit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-3 text-right text-red-600 dark:text-red-400">
                      {report.total_credit.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    {groupBy === 'TRANSACTION' && <td></td>}
                  </tr>
                </tfoot>
              )}
            </table>
          ) : (
            <>
              {groupBy === 'TRANSACTION' ? (
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Date</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Invoice #</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Voucher No.</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Sales Person</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Ledger (Customer)</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-right">Net Sales</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-right">Incentive</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Details (Remarks)</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {incentiveReport && incentiveReport.length > 0 ? (
                      incentiveReport.flatMap(person => 
                        person.invoices.map((inv, idx) => (
                          <tr key={`${person.employee_id}-${inv.id}-${idx}`} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors">
                            <td className="px-3 py-2.5 whitespace-nowrap text-slate-600 dark:text-slate-400">
                              <FormattedDate date={inv.date} mode={effectiveDisplayMode} />
                            </td>
                            <td className="px-3 py-2.5 text-indigo-600 font-medium">{inv.number}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium">{inv.voucher_no || '-'}</td>
                            <td className="px-3 py-2.5 font-medium text-slate-800 dark:text-slate-200">{person.employee_name}</td>
                            <td className="px-3 py-2.5 text-slate-600 dark:text-slate-400 font-medium truncate max-w-[150px]" title={inv.ledger_name}>{inv.ledger_name || '-'}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-right font-bold text-emerald-600 dark:text-emerald-400">{inv.commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-2.5 text-slate-500 dark:text-slate-500 italic max-w-xs truncate" title={inv.remarks || ''}>{inv.remarks || '-'}</td>
                          </tr>
                        ))
                      )
                    ) : (
                      <tr>
                        <td colSpan={8} className="px-3 py-8 text-center text-slate-400 italic">{incentiveError ? "Failed to load report" : "No incentive data found for the selected period."}</td>
                      </tr>
                    )}
                  </tbody>
                  {incentiveReport && incentiveReport.length > 0 && (
                    <tfoot className="bg-slate-50/80 dark:bg-slate-900/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                      <tr>
                        <td colSpan={5} className="px-3 py-3 text-right uppercase tracking-wider text-[10px] text-slate-500">Totals</td>
                        <td className="px-3 py-3 text-right text-slate-700">
                          {incentiveReport.reduce((sum, p) => sum + p.total_sales, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-3 py-3 text-right text-emerald-600 dark:text-emerald-400">
                          {incentiveReport.reduce((sum, p) => sum + p.commission_amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              ) : (
                <table className="w-full text-left border-collapse min-w-[800px]">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      <th className="w-8 px-3 py-2 border-b dark:border-slate-800"></th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800">Sales Person</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-right">Total Sales</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-right">Incentive Amount</th>
                      <th className="px-3 py-2 text-[10px] font-bold text-slate-500 uppercase border-b dark:border-slate-800 text-center">Details</th>
                    </tr>
                  </thead>
              <tbody className="text-xs">
                {incentiveReport && incentiveReport.length > 0 ? (
                  incentiveReport.map((item) => (
                    <Fragment key={item.employee_id}>
                      <tr 
                        className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedIncentiveRows(prev => ({ ...prev, [item.employee_id]: !prev[item.employee_id] }))}
                      >
                        <td className="px-3 py-3 text-center text-slate-400">
                          {expandedIncentiveRows[item.employee_id] ? '▾' : '▸'}
                        </td>
                        <td className="px-3 py-3 font-medium text-slate-800 dark:text-slate-200">
                          {item.employee_name}
                          {item.employee_code && <span className="text-[10px] text-slate-400 ml-2">({item.employee_code})</span>}
                        </td>
                        <td className="px-3 py-3 text-right font-mono text-slate-600 dark:text-slate-400">{item.total_sales.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-3 text-right font-bold text-emerald-600 dark:text-emerald-400">{item.commission_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-3 text-center">
                          <button className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800">
                            {expandedIncentiveRows[item.employee_id] ? 'Hide' : 'Show'}
                          </button>
                        </td>
                      </tr>
                      {expandedIncentiveRows[item.employee_id] && (
                        <tr>
                          <td colSpan={5} className="px-0 py-0 bg-slate-50/30 dark:bg-slate-900/20">
                            <div className="p-4 pl-12">
                              <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Invoice-wise breakdown</h4>
                              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 overflow-hidden shadow-sm">
                                <table className="w-full text-[11px] text-left">
                                  <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                                    <tr>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Date</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Invoice #</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Voucher Date</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Voucher No.</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Post Method</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Ledger (Customer)</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500 text-right">Net Sales</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500 text-right">Rate %</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500 text-right">Incentive</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Rules & Ledgers</th>
                                      <th className="px-3 py-2 font-semibold text-slate-500">Details (Remarks)</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {item.invoices.map(inv => (
                                      <tr key={inv.id} className="border-b border-slate-100 dark:border-slate-800/50 last:border-0 hover:bg-slate-50/50 dark:hover:bg-slate-900/30">
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                          <FormattedDate date={inv.date} mode={effectiveDisplayMode} />
                                        </td>
                                        <td className="px-3 py-2 text-indigo-600 font-medium">{inv.number}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                                          {inv.voucher_date ? <FormattedDate date={inv.voucher_date} mode={effectiveDisplayMode} /> : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium">{inv.voucher_no || '-'}</td>
                                        <td className="px-3 py-2">
                                           <span className={`px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase ${
                                              inv.post_method === 'Manual' ? 'bg-amber-100 text-amber-600 border border-amber-200' : 
                                              'bg-indigo-100 text-indigo-600 border border-indigo-200'
                                            }`}>
                                              {inv.post_method || 'Auto'}
                                           </span>
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-400 font-medium" title={inv.ledger_name}>{inv.ledger_name || '-'}</td>
                                        <td className="px-3 py-2 text-right text-slate-700 dark:text-slate-300 font-mono font-medium">{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-2 text-right text-slate-500">{inv.rate_applied.toFixed(2)}%</td>
                                        <td className="px-3 py-2 text-right font-bold text-emerald-600">{inv.commission.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                        <td className="px-3 py-2">
                                           <div className="flex flex-wrap gap-1">
                                             {inv.rules.map((r, idx) => (
                                               <div key={idx} className="flex flex-col gap-0.5">
                                                 <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1 py-0.5 rounded text-[10px] font-bold">{r.name}</span>
                                                 <span className="text-[9px] text-violet-600 dark:text-violet-400 font-medium px-1">→ {r.ledger_name}</span>
                                               </div>
                                             ))}
                                           </div>
                                        </td>
                                                                                 <td className="px-3 py-2 text-slate-500 italic" title={inv.remarks}>{inv.remarks || '-'}</td>

                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-slate-400 italic">{incentiveError ? "Failed to load report" : "No incentive data found for the selected period."}</td>
                  </tr>
                )}
              </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
