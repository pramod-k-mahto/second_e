"use client";

import React, { useState, useMemo } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { FormField } from "@/components/ui/FormField";
import { useSalarySheetReport, useEmployees } from "@/lib/payroll/queries";
import { useDepartments, useProjects, useSegments } from "@/lib/payroll/hooks/useCommissions";
import { getApiErrorMessage, getCurrentCompany } from "@/lib/api";
import { readCalendarReportDisplayMode, writeCalendarReportDisplayMode, CalendarReportDisplayMode } from "@/lib/calendarMode";

import { openPrintWindow } from "@/lib/printReport";
import * as XLSX from "xlsx";
import { Loader2, Download, Printer, Calendar } from "lucide-react";

type PayheadCostCenterOption =
  | "NONE"
  | "DEPARTMENT"
  | "PROJECT"
  | "SEGMENT"
  | "DEPARTMENT_PROJECT"
  | "DEPARTMENT_PROJECT_SEGMENT";

function formatCostCenterOptionLabel(option?: string | null): string {
  switch ((option || "NONE") as PayheadCostCenterOption) {
    case "DEPARTMENT":
      return "Dept";
    case "PROJECT":
      return "Project";
    case "SEGMENT":
      return "Segment";
    case "DEPARTMENT_PROJECT":
      return "Dept + Project";
    case "DEPARTMENT_PROJECT_SEGMENT":
      return "Dept + Project + Segment";
    default:
      return "None";
  }
}

function buildCostCenterKey(row: any, option?: string | null): string {
  const fallback = "-";
  switch ((option || "NONE") as PayheadCostCenterOption) {
    case "DEPARTMENT":
      return row.department || fallback;
    case "PROJECT":
      return row.project || fallback;
    case "SEGMENT":
      return row.segment || fallback;
    case "DEPARTMENT_PROJECT":
      return `${row.department || fallback} / ${row.project || fallback}`;
    case "DEPARTMENT_PROJECT_SEGMENT":
      return `${row.department || fallback} / ${row.project || fallback} / ${row.segment || fallback}`;
    default:
      return "Unassigned";
  }
}

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


export default function SalarySheetReportPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);

  const [calendarMode, setCalendarMode] = useState<CalendarReportDisplayMode>('AD');
  const [isMounted, setIsMounted] = useState(false);

  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState<number | undefined>(now.getMonth() + 1);

  React.useEffect(() => {
    const saved = readCalendarReportDisplayMode(companyId);
    setCalendarMode(saved);
    if (saved === 'BS') {
      setYear(now.getFullYear() + 57);
    }
    setIsMounted(true);
  }, [companyId]);


  const [employeeId, setEmployeeId] = useState<number | undefined>(undefined);
  const [departmentId, setDepartmentId] = useState<number | undefined>(undefined);
  const [projectId, setProjectId] = useState<number | undefined>(undefined);
  const [segmentId, setSegmentId] = useState<number | undefined>(undefined);

  const [showCostCenters, setShowCostCenters] = useState(true);
  const [showPayheads, setShowPayheads] = useState(true);
  const [showDays, setShowDays] = useState(true);
  const [showDesignation, setShowDesignation] = useState(true);
  const [showGrade, setShowGrade] = useState(true);




  const reportParams = useMemo(() => ({
    year,
    month: month === 0 ? undefined : month,
    employeeId,
    departmentId,
    projectId,
    segmentId,
    calendarMode,
  }), [year, month, employeeId, departmentId, projectId, segmentId, calendarMode]);

  const { data, isLoading, error } = useSalarySheetReport(companyId, reportParams);
  const { data: employees } = useEmployees(companyId);
  const { data: departments } = useDepartments(companyId);
  const { data: projects } = useProjects(companyId);
  const { data: segments } = useSegments(companyId);

  const employeeOptions = useMemo(() => {
    return (employees || []).map((e: any) => ({
      value: e.id,
      label: e.full_name,
    }));
  }, [employees]);

  const monthOptions = useMemo(() => {
    const list = calendarMode === 'BS' ? BS_MONTHS : AD_MONTHS;
    return [
      { value: 0, label: calendarMode === 'BS' ? "All Months (Year Compile)" : "All Months (Year Compile)" },
      ...list
    ];
  }, [calendarMode]);

  const toggleCalendar = () => {


    const next = calendarMode === 'AD' ? 'BS' : 'AD';
    setCalendarMode(next);
    writeCalendarReportDisplayMode(companyId, next);
    // Adjust year roughly
    setYear(prev => next === 'BS' ? prev + 57 : prev - 57);
  };


  const payheadCols = useMemo(() => {
    return (data?.payheads || []).map((ph: any) => ({
      id: `ph_${ph.id}`,
      name: ph.name,
      type: ph.type,
      costCenterOption: ph.cost_center_option || "NONE",
    }));
  }, [data]);

  const costCenterSplitRows = useMemo(() => {
    if (!data?.rows?.length || !payheadCols.length) return [];
    const splitRows: Array<{ payhead: string; basis: string; costCenter: string; amount: number }> = [];

    payheadCols.forEach((c) => {
      if ((c.costCenterOption || "NONE") === "NONE") return;
      const grouped = new Map<string, number>();
      data.rows.forEach((row: any) => {
        const amount = Number(row[c.id] || 0);
        if (!amount) return;
        const key = buildCostCenterKey(row, c.costCenterOption);
        grouped.set(key, (grouped.get(key) || 0) + amount);
      });
      grouped.forEach((amount, key) => {
        splitRows.push({
          payhead: c.name,
          basis: formatCostCenterOptionLabel(c.costCenterOption),
          costCenter: key,
          amount,
        });
      });
    });

    return splitRows.sort((a, b) => {
      if (a.payhead !== b.payhead) return a.payhead.localeCompare(b.payhead);
      return a.costCenter.localeCompare(b.costCenter);
    });
  }, [data, payheadCols]);

  const handleExport = () => {
    if (!data?.rows?.length) return;

    const company = getCurrentCompany();
    const companyName = company?.name || "Salary Sheet";
    const periodLabel =
      !month || month === 0
        ? `Year ${year}`
        : `${calendarMode === "BS" ? BS_MONTHS[month - 1].label : AD_MONTHS[month - 1].label} ${year}`;

    // ── Header rows ─────────────────────────────────────────────────────────
    const titleRow = [`${companyName} — Salary Sheet Report`];
    const periodRow = [`Period: ${periodLabel}`];
    const blankRow: string[] = [];

    // ── Column headers ───────────────────────────────────────────────────────
    const colHeaders = [
      "ID", "Employee", "Designation",
      "Dept", "Proj", "Seg",
      "Year", "Month",
      "Payable Days",
      "No. of Grade", "Grade Rate",
      ...payheadCols.map((c) => c.name),
      "Total Earnings", "Total Deductions", "TDS", "Net Pay",
    ];

    // ── Data rows ────────────────────────────────────────────────────────────
    const dataRows = data.rows.map((row: any) => {
      const cells: (string | number)[] = [
        row.employee_code || row.employee_id,
        row.employee_name,
        row.designation || "",
        row.department || "",
        row.project || "",
        row.segment || "",
        row.year ?? "",
        row.month ?? "Yearly",
        row.payable_days,
        row.grade_number ?? "",
        row.grade_rate ?? "",
        ...payheadCols.map((c) => row[c.id] ?? 0),
        row.earnings_total,
        row.deductions_total,
        row.tds_amount,
        row.net_pay,
      ];
      return cells;
    });

    // ── Totals row ───────────────────────────────────────────────────────────
    const totals: (string | number)[] = [
      "", "TOTAL", "", "", "", "", "", "", 
      data.rows.reduce((s: number, r: any) => s + (r.payable_days || 0), 0),
      "", "",
      ...payheadCols.map((c) => data.rows.reduce((s: number, r: any) => s + (r[c.id] || 0), 0)),
      data.rows.reduce((s: number, r: any) => s + (r.earnings_total || 0), 0),
      data.rows.reduce((s: number, r: any) => s + (r.deductions_total || 0), 0),
      data.rows.reduce((s: number, r: any) => s + (r.tds_amount || 0), 0),
      data.rows.reduce((s: number, r: any) => s + (r.net_pay || 0), 0),
    ];

    // ── Build worksheet ──────────────────────────────────────────────────────
    const wsData = [titleRow, periodRow, blankRow, colHeaders, ...dataRows, blankRow, totals];
    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // Column widths (approximate)
    ws["!cols"] = [
      { wch: 8 },  // ID
      { wch: 24 }, // Employee
      { wch: 18 }, // Designation
      { wch: 12 }, // Dept
      { wch: 12 }, // Proj
      { wch: 12 }, // Seg
      { wch: 6 },  // Year
      { wch: 10 }, // Month
      { wch: 12 }, // Payable Days
      { wch: 12 }, // No. of Grade
      { wch: 12 }, // Grade Rate
      ...payheadCols.map(() => ({ wch: 14 })),
      { wch: 16 }, // Total Earnings
      { wch: 16 }, // Total Deductions
      { wch: 12 }, // TDS
      { wch: 14 }, // Net Pay
    ];

    // Freeze first 4 rows (title + period + blank + header)
    ws["!freeze"] = { xSplit: 0, ySplit: 4 };

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Salary Sheet");

    if (costCenterSplitRows.length > 0) {
      const splitTitleRow = [`${companyName} — Cost Center Split`];
      const splitPeriodRow = [`Period: ${periodLabel}`];
      const splitBlankRow: string[] = [];
      const splitHeaders = ["Payhead", "Split Basis", "Cost Center", "Amount"];
      const splitDataRows = costCenterSplitRows.map((row) => [
        row.payhead,
        row.basis,
        row.costCenter,
        row.amount,
      ]);
      const splitTotalsRow = [
        "",
        "",
        "TOTAL",
        costCenterSplitRows.reduce((sum, r) => sum + (r.amount || 0), 0),
      ];

      const splitWsData = [
        splitTitleRow,
        splitPeriodRow,
        splitBlankRow,
        splitHeaders,
        ...splitDataRows,
        splitBlankRow,
        splitTotalsRow,
      ];
      const splitWs = XLSX.utils.aoa_to_sheet(splitWsData);
      splitWs["!cols"] = [{ wch: 28 }, { wch: 18 }, { wch: 30 }, { wch: 16 }];
      splitWs["!freeze"] = { xSplit: 0, ySplit: 4 };
      XLSX.utils.book_append_sheet(wb, splitWs, "Cost Center Split");
    }

    XLSX.writeFile(wb, `salary_sheet_${year}_${month || "all"}.xlsx`);
  };

  const handlePrint = () => {
    if (!data?.rows?.length) return;

    // Use landscape to ensure all payhead columns fit properly
    const orientation = "landscape";

    const company = getCurrentCompany();
    const companyName = company?.name || "Company Report";
    const companyAddress = company?.address || "";

    // Build Table HTML for print
    // Calculate total columns being shown to determine scaling
    const activeCols = 4 + (showDesignation ? 1 : 0) + (showGrade ? 2 : 0) + (showCostCenters ? 3 : 0) + (showDays ? 1 : 0) + (showPayheads ? payheadCols.length : 0);
    
    // Aggressive scaling for wide reports
    const fontSize = activeCols > 15 ? "6.8px" : (activeCols > 10 ? "7.5px" : "8.5px");
    const padding = activeCols > 15 ? "2px 3px" : "3px 4px";
    const zoomLevel = activeCols > 18 ? "0.85" : (activeCols > 15 ? "0.92" : "1.0");
    
    const tableHtml = `
      <div style="zoom: ${zoomLevel}; transform-origin: top left;">
      <table style="width: 100%; border-collapse: collapse; font-size: ${fontSize}; table-layout: auto; border: 1px solid #e2e8f0;">
          <tr style="background: #f8fafc;">
            <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center;">ID</th>
            <th style="border: 1px solid #e2e8f0; padding: ${padding};">Employee</th>
            ${showDesignation ? `<th style="border: 1px solid #e2e8f0; padding: ${padding};">Designation</th>` : ''}
            ${showCostCenters ? `
              <th style="border: 1px solid #e2e8f0; padding: ${padding};">Dept</th>
              <th style="border: 1px solid #e2e8f0; padding: ${padding};">Proj</th>
              <th style="border: 1px solid #e2e8f0; padding: ${padding};">Seg</th>
            ` : ''}
            ${showDays ? `<th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center;">Days</th>` : ''}
            ${showGrade ? `
              <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center;">No. of Grade</th>
              <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">Grade Rate</th>
            ` : ''}
            ${showPayheads ? payheadCols.map(c => `
              <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; color: ${c.type === 'EARNING' ? '#16a34a' : '#dc2626'}">
                ${c.name}<br/><span style="font-size: 9px; color: #64748b;">${formatCostCenterOptionLabel(c.costCenterOption)}</span>
              </th>
            `).join('') : ''}
            <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; background: #f1f5f9;">Earnings</th>
            <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; background: #f1f5f9;">Ded.</th>
            <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; background: #f1f5f9;">TDS</th>
            <th style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; background: #f1f5f9; font-weight: bold;">Net Pay</th>
          </tr>
        </thead>
          ${data.rows.map(row => `
            <tr>
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center; color: #64748b;">${row.employee_code || row.employee_id}</td>
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; font-weight: 500;">${row.employee_name}</td>
              ${showDesignation ? `<td style="border: 1px solid #e2e8f0; padding: ${padding};">${row.designation || '-'}</td>` : ''}
              ${showCostCenters ? `
                <td style="border: 1px solid #e2e8f0; padding: ${padding};">${row.department}</td>
                <td style="border: 1px solid #e2e8f0; padding: ${padding};">${row.project}</td>
                <td style="border: 1px solid #e2e8f0; padding: ${padding};">${row.segment}</td>
              ` : ''}
              ${showDays ? `<td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center;">${row.payable_days}</td>` : ''}
              ${showGrade ? `
                <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center;">${row.grade_number != null ? row.grade_number : '-'}</td>
                <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${row.grade_rate != null ? row.grade_rate.toLocaleString() : '-'}</td>
              ` : ''}
              ${showPayheads ? payheadCols.map(c => `
                <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${(row[c.id] || 0).toLocaleString()}</td>
              `).join('') : ''}
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${row.earnings_total.toLocaleString()}</td>
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${row.deductions_total.toLocaleString()}</td>
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; color: #dc2626;">${row.tds_amount.toLocaleString()}</td>
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right; font-weight: bold;">${row.net_pay.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr style="background: #f1f5f9; font-weight: bold;">
            <td colspan="${(showCostCenters ? 5 : 2) + (showDesignation ? 1 : 0)}" style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">TOTAL</td>
            ${showDays ? `<td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: center;">${data.rows.reduce((sum, r) => sum + r.payable_days, 0).toFixed(1)}</td>` : ''}
            ${showGrade ? `
              <td style="border: 1px solid #e2e8f0; padding: ${padding};"></td>
              <td style="border: 1px solid #e2e8f0; padding: ${padding};"></td>
            ` : ''}
            ${showPayheads ? payheadCols.map(c => `
              <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${data.rows.reduce((sum, r) => sum + (r[c.id] || 0), 0).toLocaleString()}</td>
            `).join('') : ''}
            <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${data.rows.reduce((sum, r) => sum + r.earnings_total, 0).toLocaleString()}</td>
            <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${data.rows.reduce((sum, r) => sum + r.deductions_total, 0).toLocaleString()}</td>
            <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${data.rows.reduce((sum, r) => sum + r.tds_amount, 0).toLocaleString()}</td>
            <td style="border: 1px solid #e2e8f0; padding: ${padding}; text-align: right;">${data.rows.reduce((sum, r) => sum + r.net_pay, 0).toLocaleString()}</td>
          </tr>
        </tfoot>
      </table>
      </div>
    `;


    const periodLabel = month === 0 
      ? `Year ${year}` 
      : `${calendarMode === 'BS' ? BS_MONTHS[month - 1].label : AD_MONTHS[month - 1].label} ${year}`;

    openPrintWindow({
      title: "Salary Sheet Report",
      company: companyName,
      subtitle: companyAddress,
      contentHtml: tableHtml,
      period: periodLabel,
      orientation: orientation,
      calendarSystem: calendarMode,
      autoPrint: true,
    });
  };


  if (!isMounted) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Salary Sheet Report"
        subtitle="Comprehensive payroll report with cost center dimensions."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={toggleCalendar}>
              <Calendar className="w-4 h-4 mr-2" />
              Switch to {calendarMode === 'AD' ? 'BS' : 'AD'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={!data?.rows?.length}>
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
            <Button variant="outline" size="sm" onClick={handlePrint} disabled={!data?.rows?.length}>
              <Printer className="w-4 h-4 mr-2" />
              Print Preview
            </Button>
          </div>
        }
      />

      <Card className="p-4 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 print:hidden">
        <FormField label="Year">
          <input
            type="number"
            className="w-full rounded-md border border-slate-200 dark:border-slate-800 bg-transparent px-3 py-1 text-sm h-9"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          />
        </FormField>
        <FormField label="Month">
          <Select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {monthOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Employee">
          <SearchableSelect
            options={employeeOptions}
            value={employeeId ? String(employeeId) : ""}
            onChange={(val) => setEmployeeId(val ? Number(val) : undefined)}
            placeholder="All Employees"
          />
        </FormField>
        <FormField label="Department">
          <Select
            value={departmentId || ""}
            onChange={(e) => setDepartmentId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All</option>
            {(departments || []).map((d: any) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Project">
          <Select
            value={projectId || ""}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All</option>
            {(projects || []).map((p: any) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Segment">
          <Select
            value={segmentId || ""}
            onChange={(e) => setSegmentId(e.target.value ? Number(e.target.value) : undefined)}
          >
            <option value="">All</option>
            {(segments || []).map((s: any) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </FormField>
        
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-6 col-span-full border-t border-slate-100 dark:border-slate-800 mt-2">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Display Columns:</span>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={showCostCenters} 
              onChange={e => setShowCostCenters(e.target.checked)} 
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Cost Centers</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={showPayheads} 
              onChange={e => setShowPayheads(e.target.checked)} 
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Pay Heads</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={showDays} 
              onChange={e => setShowDays(e.target.checked)} 
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Days</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={showDesignation} 
              onChange={e => setShowDesignation(e.target.checked)} 
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>Designation</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none text-slate-700 dark:text-slate-300">
            <input 
              type="checkbox" 
              checked={showGrade} 
              onChange={e => setShowGrade(e.target.checked)} 
              className="w-4 h-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span>No. of Grade</span>
          </label>

        </div>
      </Card>




      {error && (
        <Card className="p-4 text-critical-600 text-sm">
          {getApiErrorMessage(error)}
        </Card>
      )}

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-[11px] text-left border-collapse whitespace-nowrap">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-900 z-20">
              <tr>
                <th className="p-2 border border-slate-200 dark:border-slate-800 text-center">ID</th>
                <th className="p-2 border border-slate-200 dark:border-slate-800 sticky left-0 bg-slate-50 dark:bg-slate-900 z-30 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">Employee</th>
                {showDesignation && <th className="p-2 border border-slate-200 dark:border-slate-800">Designation</th>}
                {showCostCenters && (
                  <>
                    <th className="p-2 border border-slate-200 dark:border-slate-800">Dept</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800">Proj</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800">Seg</th>
                  </>
                )}
                {showDays && <th className="p-2 border border-slate-200 dark:border-slate-800 text-center">Days</th>}
                {showGrade && (
                  <>
                    <th className="p-2 border border-slate-200 dark:border-slate-800 text-center text-violet-600 dark:text-violet-400">No. of Grade</th>
                    <th className="p-2 border border-slate-200 dark:border-slate-800 text-right text-violet-600 dark:text-violet-400">Grade Rate</th>
                  </>
                )}
                {showPayheads && payheadCols.map(c => (
                  <th key={c.id} className={`p-2 border border-slate-200 dark:border-slate-800 text-right ${c.type === 'EARNING' ? 'text-green-600' : 'text-red-600'}`}>
                    <div>{c.name}</div>
                    <div className="text-[9px] font-normal text-slate-500 dark:text-slate-400">
                      {formatCostCenterOptionLabel(c.costCenterOption)}
                    </div>
                  </th>
                ))}
                <th className="p-2 border border-slate-200 dark:border-slate-800 text-right bg-slate-100 dark:bg-slate-800">Total Earnings</th>
                <th className="p-2 border border-slate-200 dark:border-slate-800 text-right bg-slate-100 dark:bg-slate-800">Total Ded.</th>
                <th className="p-2 border border-slate-200 dark:border-slate-800 text-right bg-slate-100 dark:bg-slate-800">TDS</th>
                <th className="p-2 border border-slate-200 dark:border-slate-800 text-right font-bold bg-brand-50 dark:bg-brand-900/20 text-brand-700 dark:text-brand-300">Net Pay</th>
              </tr>
            </thead>

            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={11 + payheadCols.length} className="p-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-slate-400" />
                  </td>
                </tr>
              ) : data?.rows?.length === 0 ? (
                <tr>
                  <td colSpan={11 + payheadCols.length} className="p-8 text-center text-slate-500">
                    No data found for the selected filters.
                  </td>
                </tr>
              ) : (
                data?.rows?.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-center text-slate-400">
                      {row.employee_code || row.employee_id}
                    </td>

                    <td className="p-2 border border-slate-200 dark:border-slate-800 sticky left-0 bg-white dark:bg-slate-900 z-10 font-medium shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">
                      {row.employee_name}
                    </td>
                    {showDesignation && <td className="p-2 border border-slate-200 dark:border-slate-800 text-slate-500">{row.designation || '-'}</td>}
                    {showCostCenters && (
                      <>
                        <td className="p-2 border border-slate-200 dark:border-slate-800 text-slate-500">{row.department}</td>
                        <td className="p-2 border border-slate-200 dark:border-slate-800 text-slate-500">{row.project}</td>
                        <td className="p-2 border border-slate-200 dark:border-slate-800 text-slate-500">{row.segment}</td>
                      </>
                    )}
                    {showDays && <td className="p-2 border border-slate-200 dark:border-slate-800 text-center">{row.payable_days}</td>}
                    {showGrade && (
                      <>
                        <td className="p-2 border border-slate-200 dark:border-slate-800 text-center font-medium text-violet-700 dark:text-violet-300">
                          {row.grade_number != null ? row.grade_number : '-'}
                        </td>
                        <td className="p-2 border border-slate-200 dark:border-slate-800 text-right text-violet-700 dark:text-violet-300">
                          {row.grade_rate != null ? row.grade_rate.toLocaleString() : '-'}
                        </td>
                      </>
                    )}
                    {showPayheads && payheadCols.map(c => (
                      <td key={c.id} className="p-2 border border-slate-200 dark:border-slate-800 text-right">
                        {row[c.id]?.toLocaleString() || "0"}
                      </td>
                    ))}

                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-right bg-slate-50/50 dark:bg-slate-800/50">{row.earnings_total?.toLocaleString()}</td>
                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-right bg-slate-50/50 dark:bg-slate-800/50">{row.deductions_total?.toLocaleString()}</td>
                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-right bg-slate-50/50 dark:bg-slate-800/50 text-red-500">{row.tds_amount?.toLocaleString()}</td>
                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-right font-bold bg-brand-50/50 dark:bg-brand-900/10 text-brand-700 dark:text-brand-300">
                      {row.net_pay?.toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {data?.rows?.length > 0 && (
              <tfoot className="sticky bottom-0 bg-slate-100 dark:bg-slate-800 font-bold z-20">
                <tr>
                  <td colSpan={(showCostCenters ? 5 : 2) + (showDesignation ? 1 : 0)} className="p-2 border border-slate-200 dark:border-slate-800 text-right sticky left-0 bg-slate-100 dark:bg-slate-800 shadow-[1px_0_0_0_rgba(0,0,0,0.1)]">TOTAL</td>
                  {showDays && (
                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-center">
                      {data.rows.reduce((sum, r) => sum + r.payable_days, 0).toFixed(1)}
                    </td>
                  )}
                  {showGrade && (
                    <>
                      <td className="p-2 border border-slate-200 dark:border-slate-800" />
                      <td className="p-2 border border-slate-200 dark:border-slate-800" />
                    </>
                  )}
                  {showPayheads && payheadCols.map(c => (
                    <td key={c.id} className="p-2 border border-slate-200 dark:border-slate-800 text-right">
                      {data.rows.reduce((sum, r) => sum + (r[c.id] || 0), 0).toLocaleString()}
                    </td>
                  ))}
                  <td className="p-2 border border-slate-200 dark:border-slate-800 text-right">
                    {data.rows.reduce((sum, r) => sum + r.earnings_total, 0).toLocaleString()}
                  </td>
                  <td className="p-2 border border-slate-200 dark:border-slate-800 text-right">
                    {data.rows.reduce((sum, r) => sum + r.deductions_total, 0).toLocaleString()}
                  </td>
                  <td className="p-2 border border-slate-200 dark:border-slate-800 text-right text-red-500">
                    {data.rows.reduce((sum, r) => sum + r.tds_amount, 0).toLocaleString()}
                  </td>
                  <td className="p-2 border border-slate-200 dark:border-slate-800 text-right text-brand-700 dark:text-brand-300">
                    {data.rows.reduce((sum, r) => sum + r.net_pay, 0).toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {costCenterSplitRows.length > 0 && (
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold">Cost Center Split (By Payhead Option)</h3>
            <p className="text-xs text-slate-500">
              Totals are grouped based on each payhead&apos;s selected Cost Center option.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px] border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900">
                <tr>
                  <th className="p-2 border border-slate-200 dark:border-slate-800 text-left">Payhead</th>
                  <th className="p-2 border border-slate-200 dark:border-slate-800 text-left">Split Basis</th>
                  <th className="p-2 border border-slate-200 dark:border-slate-800 text-left">Cost Center</th>
                  <th className="p-2 border border-slate-200 dark:border-slate-800 text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {costCenterSplitRows.map((item, idx) => (
                  <tr key={`${item.payhead}-${item.costCenter}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2 border border-slate-200 dark:border-slate-800">{item.payhead}</td>
                    <td className="p-2 border border-slate-200 dark:border-slate-800">{item.basis}</td>
                    <td className="p-2 border border-slate-200 dark:border-slate-800">{item.costCenter}</td>
                    <td className="p-2 border border-slate-200 dark:border-slate-800 text-right">{item.amount.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="hidden print:block mt-8 text-[10px] text-slate-500">
        Generated on {new Date().toLocaleString()}
      </div>
    </div>
  );
}
