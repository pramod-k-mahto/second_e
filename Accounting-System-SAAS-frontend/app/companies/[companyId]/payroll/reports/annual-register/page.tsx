"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useEmployees, usePayheads } from "@/lib/payroll/queries";
import { useDepartments, useProjects, useSegments } from "@/lib/payroll/hooks/useCommissions";
import { readCalendarReportDisplayMode, writeCalendarReportDisplayMode, CalendarReportDisplayMode } from "@/lib/calendarMode";
import { api, getApiErrorMessage, getCurrentCompany } from "@/lib/api";
import { Loader2, Download, Printer } from "lucide-react";
import * as XLSX from "xlsx";
import { openPrintWindow } from "@/lib/printReport";

const BS_MONTHS = [
  { value: 1, label: "वैशाख" },
  { value: 2, label: "जेठ" },
  { value: 3, label: "असार" },
  { value: 4, label: "साउन" },
  { value: 5, label: "भदौ" },
  { value: 6, label: "असोज" },
  { value: 7, label: "कात्तिक" },
  { value: 8, label: "मङ्सिर" },
  { value: 9, label: "पुस" },
  { value: 10, label: "माघ" },
  { value: 11, label: "फागुन" },
  { value: 12, label: "चैत" },
];

const AD_MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

function fmt(n?: number | null) {
  if (!n) return "-";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function AnnualMatrixReportPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);

  const [calendarMode, setCalendarMode] = useState<CalendarReportDisplayMode>("AD");
  const [year, setYear] = useState<number>(new Date().getFullYear());
  const [employeeId, setEmployeeId] = useState<string>("");
  const [viewTarget, setViewTarget] = useState<"employee" | "payhead" | "monthly">("employee");
  const [selectedMonth, setSelectedMonth] = useState<number>(0); // 0 = All Months
  const [metric, setMetric] = useState<"net_pay" | "earnings_total" | "deductions_total">("net_pay");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [projectId, setProjectId] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");

  const { data: employees } = useEmployees(companyId);
  const { data: payheads } = usePayheads(companyId);
  const { data: departments } = useDepartments(companyId);
  const { data: projects } = useProjects(companyId);
  const { data: segments } = useSegments(companyId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Array of 12 responses (one per month)
  const [monthlyData, setMonthlyData] = useState<any[]>([]);

  useEffect(() => {
    const saved = readCalendarReportDisplayMode(companyId);
    setCalendarMode(saved);
    if (saved === "BS") {
      setYear(new Date().getFullYear() + 57);
    }
  }, [companyId]);

  const activeMonths = calendarMode === "BS" ? BS_MONTHS : AD_MONTHS;

  const toggleCalendar = () => {
    const next = calendarMode === "AD" ? "BS" : "AD";
    setCalendarMode(next);
    writeCalendarReportDisplayMode(companyId, next);
    setYear((prev: number) => (next === "BS" ? prev + 57 : prev - 57));
  };

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    setMonthlyData([]);

    try {
      const promises = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) =>
        api.get(`/payroll/companies/${companyId}/reports/salary-sheet`, {
          params: {
            year,
            month: m,
            employee_id: employeeId ? Number(employeeId) : undefined,
            department_id: departmentId ? Number(departmentId) : undefined,
            project_id: projectId ? Number(projectId) : undefined,
            segment_id: segmentId ? Number(segmentId) : undefined,
            calendar_mode: calendarMode,
          },
        }).then((res) => ({ month: m, data: res.data }))
      );

      const results = await Promise.all(promises);
      setMonthlyData(results);
    } catch (err: any) {
      setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  // Matrix Processing: Single Employee (Months as Rows, Payheads as Cols)
  const employeeMatrix = useMemo(() => {
    if (!employeeId || !monthlyData.length) return null;

    const rows = activeMonths.map((m) => {
      const md = monthlyData.find((d) => d.month === m.value)?.data;
      const empRow = md?.rows?.find((r: any) => String(r.employee_id) === employeeId);
      
      return {
        month: m.label,
        data: empRow || {},
      };
    });

    const totals: any = {};
    rows.forEach(r => {
      Object.keys(r.data).forEach(k => {
        if (typeof r.data[k] === "number") {
          totals[k] = (totals[k] || 0) + r.data[k];
        }
      });
    });

    return { rows, totals };
  }, [employeeId, monthlyData, activeMonths]);

  const employeeMap = useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((emp: any) => {
      map.set(emp.id, emp.full_name);
    });
    return map;
  }, [employees]);

  // Aggregate yearly totals per employee (Payhead breakdown)
  const yearlyEmployeePayheadMatrix = useMemo(() => {
    if (viewTarget !== "monthly" || selectedMonth !== 0 || monthlyData.length === 0) return [];
    
    const map = new Map<number, any>();
    
    monthlyData.forEach(m => {
      (m.data?.rows || []).forEach((row: any) => {
        let existing = map.get(row.employee_id);
        if (!existing) {
          existing = { 
            employee_id: row.employee_id, 
            employee_name: employeeMap.get(row.employee_id) || row.employee_name || `Emp #${row.employee_id}`,
            payable_days: 0,
            earnings_total: 0,
            deductions_total: 0,
            net_pay: 0
          };
          (payheads || []).forEach((ph: any) => {
            existing[`ph_${ph.id}`] = 0;
          });
          map.set(row.employee_id, existing);
        }
        
        existing.payable_days += row.payable_days || 0;
        existing.earnings_total += row.earnings_total || 0;
        existing.deductions_total += row.deductions_total || 0;
        existing.net_pay += row.net_pay || 0;
        (payheads || []).forEach((ph: any) => {
          existing[`ph_${ph.id}`] += row[`ph_${ph.id}`] || 0;
        });
      });
    });
    
    return Array.from(map.values()).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
  }, [viewTarget, selectedMonth, monthlyData, payheads, employeeMap]);

  // Matrix Processing: All Employees (Employees as Rows, Months as Cols)

  
  const allEmployeesMatrix = useMemo(() => {
    if (employeeId || !monthlyData.length) return null;

    const map = new Map<number, { name: string; months: Record<number, number>; total: number }>();

    monthlyData.forEach((md) => {
      const monthNum = md.month;
      (md.data?.rows || []).forEach((r: any) => {
        const val = Number(r[metric] || 0);
        if (!map.has(r.employee_id)) {
          map.set(r.employee_id, { name: r.employee_name || `Emp #${r.employee_id}`, months: {}, total: 0 });
        }
        const emp = map.get(r.employee_id)!;
        emp.months[monthNum] = (emp.months[monthNum] || 0) + val;
        emp.total += val;
      });
    });

    const rows = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
    
    const monthTotals: Record<number, number> = {};
    let grandTotal = 0;
    rows.forEach(r => {
      activeMonths.forEach(m => {
        monthTotals[m.value] = (monthTotals[m.value] || 0) + (r.months[m.value] || 0);
      });
      grandTotal += r.total;
    });

    return { rows, monthTotals, grandTotal };
  }, [employeeId, monthlyData, metric, activeMonths]);

  const allPayheadsMatrix = useMemo(() => {
    if (employeeId || viewTarget !== "payhead" || !monthlyData.length) return null;

    const map = new Map<number, { name: string; type: string; months: Record<number, number>; total: number }>();

    monthlyData.forEach((md) => {
      const monthNum = md.month;
      (md.data?.rows || []).forEach((r: any) => {
        (payheads || []).forEach((ph: any) => {
          const val = Number(r[`ph_${ph.id}`] || 0);
          if (val === 0) return;

          if (!map.has(ph.id)) {
            map.set(ph.id, { name: ph.name, type: ph.type, months: {}, total: 0 });
          }
          const entry = map.get(ph.id)!;
          entry.months[monthNum] = (entry.months[monthNum] || 0) + val;
          entry.total += val;
        });
      });
    });

    const rows = Array.from(map.values()).sort((a, b) => {
      if (a.type !== b.type) return a.type.localeCompare(b.type);
      return a.name.localeCompare(b.name);
    });

    const monthTotals: Record<number, number> = {};
    let grandTotal = 0;
    rows.forEach(r => {
      activeMonths.forEach(m => {
        monthTotals[m.value] = (monthTotals[m.value] || 0) + (r.months[m.value] || 0);
      });
      grandTotal += r.total;
    });

    return { rows, monthTotals, grandTotal };
  }, [employeeId, viewTarget, monthlyData, payheads, activeMonths]);

  const handlePrint = () => {
    const html = document.getElementById("matrix-report-content")?.innerHTML;
    if (html) {
      const company = getCurrentCompany();
      openPrintWindow({
        contentHtml: html,
        title: "Annual Payroll Matrix",
        company: company?.name,
        period: `Year: ${year} (${calendarMode})`,
        orientation: "landscape",
        calendarSystem: calendarMode
      });
    }
  };

  const handleExport = () => {
    if (!monthlyData.length) return;
    const wb = XLSX.utils.book_new();

    if (employeeId && employeeMatrix) {
      const wsData: any[][] = [];
      const headers = ["Month", "Payable Days", ...(payheads || []).map((p: any) => p.name), "Total Earnings", "Total Deductions", "Net Pay"];
      wsData.push(headers);

      employeeMatrix.rows.forEach(r => {
        const row = [
          r.month,
          r.data.payable_days || 0,
          ...(payheads || []).map((p: any) => r.data[`ph_${p.id}`] || 0),
          r.data.earnings_total || 0,
          r.data.deductions_total || 0,
          r.data.net_pay || 0
        ];
        wsData.push(row);
      });

      const tRow = [
        "Total",
        employeeMatrix.totals.payable_days || 0,
        ...(payheads || []).map((p: any) => employeeMatrix.totals[`ph_${p.id}`] || 0),
        employeeMatrix.totals.earnings_total || 0,
        employeeMatrix.totals.deductions_total || 0,
        employeeMatrix.totals.net_pay || 0
      ];
      wsData.push(tRow);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Employee Matrix");
    } else if (allEmployeesMatrix) {
      const wsData: any[][] = [];
      const title = metric === "net_pay" ? "Net Pay" : metric === "earnings_total" ? "Gross Earnings" : "Total Deductions";
      const headers = ["Employee", ...activeMonths.map(m => m.label), `Yearly Total (${title})`];
      wsData.push(headers);

      allEmployeesMatrix.rows.forEach(r => {
        const row = [r.name, ...activeMonths.map(m => r.months[m.value] || 0), r.total];
        wsData.push(row);
      });

      const tRow = ["Company Total", ...activeMonths.map(m => allEmployeesMatrix.monthTotals[m.value] || 0), allEmployeesMatrix.grandTotal];
      wsData.push(tRow);

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Company Matrix");
    }

    XLSX.writeFile(wb, `Annual_Matrix_Report_${year}.xlsx`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Annual Payroll Matrix"
        subtitle="Month-wise salary register and matrix breakdown for the entire year."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!monthlyData.length}>
              <Download className="w-4 h-4 mr-2" /> Export
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!monthlyData.length}>
              <Printer className="w-4 h-4 mr-2" /> Print
            </Button>
          </div>
        }
      />

      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1 w-32">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Calendar</label>
            <Button variant="outline" className="w-full justify-between" onClick={toggleCalendar}>
              <span className="font-bold">{calendarMode}</span>
              <span className="text-xs text-slate-400">Switch</span>
            </Button>
          </div>

          <div className="space-y-1 w-32">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Year</label>
            <input
              type="number"
              className="w-full h-9 px-3 border border-slate-200 dark:border-slate-700 rounded-md text-sm font-medium focus:ring-2 focus:ring-violet-500/30"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>

          <div className="space-y-1 w-64">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Employee Filter</label>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}>
              <option value="">All Employees (Company Matrix)</option>
              {(employees || []).map((e: any) => (
                <option key={e.id} value={e.id}>{e.full_name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 w-64">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Department</label>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="">All Departments</option>
              {(departments || []).map((d: any) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 w-64">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Project</label>
            <Select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="">All Projects</option>
              {(projects || []).map((p: any) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </div>

          <div className="space-y-1 w-64">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Segment</label>
            <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
              <option value="">All Segments</option>
              {(segments || []).map((s: any) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </div>

          <Button onClick={fetchReport} disabled={loading} className="px-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-200 dark:shadow-none h-9 font-black uppercase tracking-widest transition-all hover:scale-105 active:scale-95">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Printer className="w-4 h-4 mr-2" />}
            Show Report / Compile
          </Button>
        </div>

        {error && <div className="text-sm text-rose-500 p-3 bg-rose-50 dark:bg-rose-900/10 rounded border border-rose-200 dark:border-rose-900/50">{error}</div>}
      </Card>

      {monthlyData.length > 0 && (
        <div id="matrix-report-content" className="mt-4">
        <Card className="p-4 overflow-x-auto">
          <div className="mb-4">
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">Annual Salary Matrix — {year} {calendarMode}</h2>
            <p className="text-sm text-slate-500">
              {employeeId && employees 
                ? `Employee: ${employees.find((e: any) => String(e.id) === employeeId)?.full_name}`
                : viewTarget === "payhead" ? "Company-Wide Payhead Breakdown" : "Company-Wide Employee Breakdown"}
            </p>
          </div>

          {!employeeId && (
            <div className="mb-4 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800 pb-2 overflow-x-auto whitespace-nowrap">
               <Button size="sm" variant={viewTarget === "employee" ? "primary" : "outline"} onClick={() => setViewTarget("employee")}>By Employee (Yearly)</Button>
               <Button size="sm" variant={viewTarget === "payhead" ? "primary" : "outline"} onClick={() => setViewTarget("payhead")}>By Payhead (Yearly)</Button>
               <Button size="sm" variant={viewTarget === "monthly" ? "primary" : "outline"} onClick={() => setViewTarget("monthly")}>Monthly Matrix (All Employees)</Button>
               
               {viewTarget === "monthly" && (
                 <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200 dark:border-slate-700">
                   <span className="text-[10px] font-black uppercase text-slate-400">Month:</span>
                   <select 
                     value={selectedMonth} 
                     onChange={(e) => setSelectedMonth(Number(e.target.value))}
                     className="h-8 text-[11px] font-bold border rounded bg-white dark:bg-slate-900 px-2"
                   >
                     <option value={0}>All Months (Yearly Total)</option>
                     {activeMonths.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                   </select>
                 </div>
               )}
            </div>
          )}

          {!employeeId && viewTarget === "employee" && allEmployeesMatrix && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={metric === "net_pay" ? "primary" : "outline"} onClick={() => setMetric("net_pay")}>Net Pay</Button>
                <Button size="sm" variant={metric === "earnings_total" ? "primary" : "outline"} onClick={() => setMetric("earnings_total")}>Gross Earnings</Button>
                <Button size="sm" variant={metric === "deductions_total" ? "primary" : "outline"} onClick={() => setMetric("deductions_total")}>Total Deductions</Button>
              </div>
              <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 w-48 sticky left-0 bg-slate-50 dark:bg-slate-800">Employee</th>
                    {activeMonths.map(m => (
                      <th key={m.value} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right min-w-[80px]">{m.label}</th>
                    ))}
                    <th className="p-2 text-right bg-violet-50 dark:bg-violet-900/20 font-bold text-violet-700 dark:text-violet-300">Total Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allEmployeesMatrix.rows.map(r => (
                    <tr key={r.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-medium sticky left-0 bg-white dark:bg-slate-900">{r.name}</td>
                      {activeMonths.map(m => (
                        <td key={m.value} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">{fmt(r.months[m.value])}</td>
                      ))}
                      <td className="p-2 text-right font-bold bg-violet-50/30 dark:bg-violet-900/10 tabular-nums">{fmt(r.total)}</td>
                    </tr>
                  ))}
                  {allEmployeesMatrix.rows.length === 0 && (
                    <tr>
                      <td colSpan={14} className="p-4 text-center italic text-slate-500">No data found for this year.</td>
                    </tr>
                  )}
                </tbody>
                {allEmployeesMatrix.rows.length > 0 && (
                  <tfoot className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                    <tr>
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Company Total</td>
                      {activeMonths.map(m => (
                        <td key={m.value} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-emerald-600">{fmt(allEmployeesMatrix.monthTotals[m.value])}</td>
                      ))}
                      <td className="p-2 text-right tabular-nums text-violet-700 dark:text-violet-300 bg-violet-100/50 dark:bg-violet-900/30">{fmt(allEmployeesMatrix.grandTotal)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {!employeeId && viewTarget === "payhead" && allPayheadsMatrix && (
            <div className="space-y-3">
              <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 w-48 sticky left-0 bg-slate-50 dark:bg-slate-800">Payhead / Ledger</th>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700">Type</th>
                    {activeMonths.map(m => (
                      <th key={m.value} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right min-w-[80px]">{m.label}</th>
                    ))}
                    <th className="p-2 text-right bg-violet-50 dark:bg-violet-900/20 font-bold text-violet-700 dark:text-violet-300">Total Year</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {allPayheadsMatrix.rows.map(r => (
                    <tr key={r.name} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-medium sticky left-0 bg-white dark:bg-slate-900">{r.name}</td>
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700">
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${r.type === 'EARNING' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                          {r.type}
                        </span>
                      </td>
                      {activeMonths.map(m => (
                        <td key={m.value} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">{fmt(r.months[m.value])}</td>
                      ))}
                      <td className="p-2 text-right font-bold bg-violet-50/30 dark:bg-violet-900/10 tabular-nums">{fmt(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                  <tr>
                    <td colSpan={2} className="p-2 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Total Company Payroll</td>
                    {activeMonths.map(m => (
                      <td key={m.value} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">{fmt(allPayheadsMatrix.monthTotals[m.value])}</td>
                    ))}
                    <td className="p-2 text-right tabular-nums text-violet-700 dark:text-violet-300 bg-violet-100/50 dark:bg-violet-900/30">{fmt(allPayheadsMatrix.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {!employeeId && viewTarget === "monthly" && (
            <div className="space-y-3">
              <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 w-48 sticky left-0 bg-slate-50 dark:bg-slate-800">Employee</th>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-right">Pay Days</th>
                    {(payheads || []).map((ph: any) => (
                      <th key={ph.id} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right min-w-[80px]">
                        {ph.name}
                        <div className="text-[9px] font-normal text-slate-400">{ph.type}</div>
                      </th>
                    ))}
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-right text-emerald-600">Earnings</th>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-right text-rose-600">Deductions</th>
                    <th className="p-2 text-right bg-violet-50 dark:bg-violet-900/20 font-bold text-violet-700 dark:text-violet-300">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {(selectedMonth === 0 ? yearlyEmployeePayheadMatrix : (monthlyData.find(d => d.month === selectedMonth)?.data?.rows || [])).map((row: any) => (
                    <tr key={row.employee_id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-medium sticky left-0 bg-white dark:bg-slate-900">
                        {employeeMap.get(row.employee_id) || row.employee_name || `Emp #${row.employee_id}`}
                      </td>
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-slate-500">{row.payable_days || 0}</td>
                      {(payheads || []).map((ph: any) => (
                        <td key={ph.id} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">
                          {fmt(row[`ph_${ph.id}`])}
                        </td>
                      ))}
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-emerald-600 font-medium">{fmt(row.earnings_total)}</td>
                      <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-rose-600 font-medium">{fmt(row.deductions_total)}</td>
                      <td className="p-2 text-right font-bold bg-violet-50/30 dark:bg-violet-900/10 tabular-nums">{fmt(row.net_pay)}</td>
                    </tr>
                  ))}
                  {(monthlyData.find(d => d.month === selectedMonth)?.data?.rows || []).length === 0 && (
                    <tr>
                      <td colSpan={(payheads?.length || 0) + 5} className="p-10 text-center text-slate-400 italic">
                        No data found for {selectedMonth === 0 ? "the entire year" : activeMonths[selectedMonth-1].label} {year}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {employeeId && employeeMatrix && (
            <div className="space-y-3">
              <table className="w-full text-xs text-left border border-slate-200 dark:border-slate-700">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Month</th>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-right">Pay Days</th>
                    {(payheads || []).map((ph: any) => (
                      <th key={ph.id} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right min-w-[80px]">
                        {ph.name}
                        <div className="text-[9px] font-normal text-slate-400">{ph.type}</div>
                      </th>
                    ))}
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-right text-emerald-600 bg-emerald-50/50 dark:bg-emerald-900/10">Gross Earnings</th>
                    <th className="p-2 border-r border-slate-200 dark:border-slate-700 text-right text-rose-600 bg-rose-50/50 dark:bg-rose-900/10">Deductions</th>
                    <th className="p-2 text-right bg-violet-50 dark:bg-violet-900/20 font-bold text-violet-700 dark:text-violet-300">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {employeeMatrix.rows.map((r, idx) => {
                    const hasData = Object.keys(r.data).length > 0;
                    return (
                      <tr key={idx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                        <td className="p-2 border-r border-slate-200 dark:border-slate-700 font-medium sticky left-0 bg-white dark:bg-slate-900">{r.month}</td>
                        <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-slate-500">{hasData ? (r.data.payable_days || 0) : "-"}</td>
                        {(payheads || []).map((ph: any) => (
                          <td key={ph.id} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">
                            {hasData ? fmt(r.data[`ph_${ph.id}`]) : "-"}
                          </td>
                        ))}
                        <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-emerald-600 font-medium bg-emerald-50/10">{hasData ? fmt(r.data.earnings_total) : "-"}</td>
                        <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-rose-600 font-medium bg-rose-50/10">{hasData ? fmt(r.data.deductions_total) : "-"}</td>
                        <td className="p-2 text-right font-bold bg-violet-50/30 dark:bg-violet-900/10 tabular-nums">{hasData ? fmt(r.data.net_pay) : "-"}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="bg-slate-50 dark:bg-slate-800 border-t-2 border-slate-200 dark:border-slate-700 font-bold">
                  <tr>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 sticky left-0 bg-slate-50 dark:bg-slate-800">Yearly Total</td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">{employeeMatrix.totals.payable_days || 0}</td>
                    {(payheads || []).map((ph: any) => (
                      <td key={ph.id} className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums">
                        {fmt(employeeMatrix.totals[`ph_${ph.id}`])}
                      </td>
                    ))}
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-emerald-600 bg-emerald-50/30">{fmt(employeeMatrix.totals.earnings_total)}</td>
                    <td className="p-2 border-r border-slate-200 dark:border-slate-700 text-right tabular-nums text-rose-600 bg-rose-50/30">{fmt(employeeMatrix.totals.deductions_total)}</td>
                    <td className="p-2 text-right tabular-nums text-violet-700 dark:text-violet-300 bg-violet-100/50 dark:bg-violet-900/30">{fmt(employeeMatrix.totals.net_pay)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
        </div>
      )}
    </div>
  );
}
