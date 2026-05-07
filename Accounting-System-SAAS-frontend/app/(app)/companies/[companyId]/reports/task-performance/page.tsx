"use client";

import * as React from "react";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Table } from "@/components/ui/Table";
import { api } from "@/lib/api";
import { BarChart3, FileText, User } from "lucide-react";
import { PageHeader } from "@/components/ui/PageHeader";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return "-";
  }
};

const formatDateTime = (dateStr: string | null) => {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-US", { 
      month: "short", 
      day: "numeric", 
      hour: "numeric", 
      minute: "2-digit",
      hour12: true 
    });
  } catch {
    return "-";
  }
};

type SummaryItem = {
  employee_id: number;
  employee_name: string;
  role: string | null;
  assigned_count: number;
  completed_count: number;
  completion_rate: number;
  avg_completion_time_hours: number | null;
};

type ReportDetail = {
  task_id: number;
  title: string;
  status: string;
  assigned_at: string;
  completed_at: string | null;
  due_at: string | null;
  priority: string | null;
  employee_name: string;
  role: string | null;
};

type PerformanceReport = {
  summary: SummaryItem[];
  details: ReportDetail[] | null;
  period: string;
  start_date: string;
  end_date: string;
};

export default function PerformanceReportPage({ params }: { params: { companyId: string } }) {
  const companyId = Number(params.companyId);
  const [period, setPeriod] = React.useState("monthly");
  const [employeeId, setEmployeeId] = React.useState<string>("all");
  const [employeeTypeId, setEmployeeTypeId] = React.useState<string>("all");
  const [showDetails, setShowDetails] = React.useState(false);

  const { data: employees } = useSWR(`/payroll/companies/${companyId}/employees`, fetcher);
  const { data: employeeTypes } = useSWR(`/payroll/companies/${companyId}/employee-types`, fetcher);

  const reportUrl = `/companies/${companyId}/performance/tasks/report?period=${period}${
    employeeId !== "all" ? `&employee_id=${employeeId}` : ""
  }${
    employeeTypeId !== "all" ? `&employee_type_id=${employeeTypeId}` : ""
  }&include_details=${showDetails}`;

  const { data: report, isLoading } = useSWR<PerformanceReport>(reportUrl, fetcher);

  return (
    <div className="container mx-auto p-4 space-y-6">
      <PageHeader
        title="Task Performance Report"
        subtitle="Analyze employee efficiency and task completion rates"
        closeLink={`/companies/${companyId}/tasks`}
      />

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 bg-white/50 backdrop-blur-sm p-4 rounded-xl border border-slate-200">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Reporting Period</label>
          <Select 
            value={period} 
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Employee Role</label>
          <Select
            value={employeeTypeId}
            onChange={(e) => setEmployeeTypeId(e.target.value)}
          >
            <option value="all">All Roles</option>
            {employeeTypes?.map((role: any) => (
              <option key={role.id} value={role.id}>
                {role.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-slate-700">Employee</label>
          <Select
            value={employeeId}
            onChange={(e) => setEmployeeId(e.target.value)}
          >
            <option value="all">All Employees</option>
            {employees?.map((emp: any) => (
              <option key={emp.id} value={emp.id}>
                {emp.full_name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-end pb-0.5">
          <Button
            variant={showDetails ? "primary" : "outline"}
            onClick={() => setShowDetails(!showDetails)}
            className="w-full"
          >
            {showDetails ? "Hide Details" : "Show Details"}
          </Button>
        </div>

        <div className="flex items-end pb-0.5">
          <Button variant="outline" className="w-full" onClick={() => window.print()}>
            Print Report
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-500"></div>
        </div>
      ) : (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="p-6 bg-gradient-to-br from-sky-50 to-white border-sky-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 font-medium">Reporting Range</span>
                <FileText className="h-5 w-5 text-sky-500" />
              </div>
              <div className="text-lg font-bold text-slate-900">
                {report?.start_date && formatDate(report.start_date)} - {report?.end_date && formatDate(report.end_date)}
              </div>
              <p className="text-xs text-slate-400 mt-1 uppercase tracking-wider">{period} basis</p>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-emerald-50 to-white border-emerald-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 font-medium">Total Performed</span>
                <BarChart3 className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="text-3xl font-bold text-slate-900">
                {report?.summary.reduce((acc, curr) => acc + curr.completed_count, 0)}
                <span className="text-sm font-normal text-slate-500 ml-2">tasks</span>
              </div>
            </Card>

            <Card className="p-6 bg-gradient-to-br from-violet-50 to-white border-violet-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-slate-500 font-medium">Avg Completion Rate</span>
                <User className="h-5 w-5 text-violet-500" />
              </div>
              <div className="text-3xl font-bold text-slate-900">
                {report?.summary.length ? (report.summary.reduce((acc, curr) => acc + curr.completion_rate, 100) / (report.summary.length || 1)).toFixed(1) : 0}%
              </div>
            </Card>
          </div>

          <Card className="overflow-hidden border-slate-200 shadow-xl">
            <div className="p-4 bg-slate-50 border-b border-slate-200">
              <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-sky-600" />
                Performance Summary
              </h3>
            </div>
            <Table>
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="text-left py-4 px-6 font-semibold text-slate-700">Employee</th>
                  <th className="text-left py-4 px-6 font-semibold text-slate-700">Role</th>
                  <th className="text-center py-4 px-6 font-semibold text-slate-700">Assigned</th>
                  <th className="text-center py-4 px-6 font-semibold text-slate-700">Completed</th>
                  <th className="text-center py-4 px-6 font-semibold text-slate-700">Completion Rate</th>
                  <th className="text-center py-4 px-6 font-semibold text-slate-700">Avg Time (Hrs)</th>
                </tr>
              </thead>
              <tbody>
                {report?.summary.map((item) => (
                  <tr key={item.employee_id} className="hover:bg-slate-50/80 transition-colors border-t border-slate-100">
                    <td className="py-4 px-6 font-medium text-slate-900">{item.employee_name}</td>
                    <td className="py-4 px-6 text-slate-600">{item.role || "-"}</td>
                    <td className="py-4 px-6 text-center text-slate-600">{item.assigned_count}</td>
                    <td className="py-4 px-6 text-center font-semibold text-emerald-600">{item.completed_count}</td>
                    <td className="py-4 px-6 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          item.completion_rate >= 80 ? 'bg-emerald-100 text-emerald-700' :
                          item.completion_rate >= 50 ? 'bg-amber-100 text-amber-700' :
                          'bg-rose-100 text-rose-700'
                        }`}>
                          {item.completion_rate.toFixed(1)}%
                        </span>
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${
                              item.completion_rate >= 80 ? 'bg-emerald-500' :
                              item.completion_rate >= 50 ? 'bg-amber-500' :
                              'bg-rose-500'
                            }`}
                            style={{ width: `${item.completion_rate}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-6 text-center text-slate-600">
                      {item.avg_completion_time_hours ? item.avg_completion_time_hours.toFixed(1) : "-"}
                    </td>
                  </tr>
                ))}
                {report?.summary.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      No data found for this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </Table>
          </Card>

          {showDetails && report?.details && (
            <Card className="overflow-hidden border-slate-200 shadow-xl">
              <div className="p-4 bg-slate-50 border-b border-slate-200">
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-violet-600" />
                  Detailed Task Performance
                </h3>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <thead>
                    <tr className="bg-slate-50/50">
                      <th className="text-left py-3 px-6 text-xs uppercase tracking-wider text-slate-500">Employee</th>
                      <th className="text-left py-3 px-6 text-xs uppercase tracking-wider text-slate-500">Role</th>
                      <th className="text-left py-3 px-6 text-xs uppercase tracking-wider text-slate-500">Task Title</th>
                      <th className="text-center py-3 px-6 text-xs uppercase tracking-wider text-slate-500">Status</th>
                      <th className="text-center py-3 px-6 text-xs uppercase tracking-wider text-slate-500">Assigned At</th>
                      <th className="text-center py-3 px-6 text-xs uppercase tracking-wider text-slate-500">Completed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.details.map((task) => (
                      <tr key={task.task_id} className="hover:bg-slate-50/80 transition-colors border-t border-slate-100">
                        <td className="py-3 px-6 text-sm text-slate-600">{task.employee_name}</td>
                        <td className="py-3 px-6 text-sm text-slate-600">{task.role || "-"}</td>
                        <td className="py-3 px-6 text-sm font-medium text-slate-900">{task.title}</td>
                        <td className="py-3 px-6 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-tight ${
                            task.status === 'done' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {task.status}
                          </span>
                        </td>
                        <td className="py-3 px-6 text-center text-xs text-slate-500">
                          {formatDateTime(task.assigned_at)}
                        </td>
                        <td className="py-3 px-6 text-center text-xs text-slate-500">
                          {formatDateTime(task.completed_at)}
                        </td>
                      </tr>
                    ))}
                    {report.details.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-slate-400">
                          No task details found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </Table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
