"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { useEmployees, useDeviceUsers, usePayrollRuns } from "@/lib/payroll/queries";

export default function PayrollDashboardPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);

  const { data: employees } = useEmployees(companyId);
  const { data: deviceUsers } = useDeviceUsers(companyId, {});
  const { data: runs } = usePayrollRuns(companyId);

  if (!companyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll"
        subtitle="Manage employees, attendance, leave, salary structures and payroll runs."
        closeLink={`/companies/${companyId}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/companies/${companyId}/payroll/attendance`}>
              <Button size="sm" variant="outline">
                Import Attendance CSV
              </Button>
            </Link>
            <Link href={`/companies/${companyId}/payroll/attendance`}>
              <Button size="sm" variant="outline">
                Recompute Attendance
              </Button>
            </Link>
            <Link href={`/companies/${companyId}/payroll/runs`}>
              <Button size="sm">Create Payroll Run</Button>
            </Link>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-slate-500">Employees</div>
          <div className="mt-1 text-xl font-semibold">{employees?.length ?? "-"}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Unmapped Device Users</div>
          <div className="mt-1 text-xl font-semibold">
            {deviceUsers ? deviceUsers.filter((u: any) => !u.employee_id).length : "-"}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-slate-500">Latest Payroll Run</div>
          <div className="mt-1 text-xl font-semibold">
            {runs && runs.length > 0 ? new Date(runs[0].created_at || runs[0].start_date).toLocaleDateString() : "No runs yet"}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/employees`}>
            Employees
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/payheads`}>
            Payheads
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/employee-types`}>
            Employee Types
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/shifts`}>
            Shifts
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/designations`}>
            Designations
          </Link>

          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/attendance`}>
            Attendance
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/leave`}>
            Leave
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/pay-structures`}>
            Pay Structures
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/runs`}>
            Payroll Runs
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/devices`}>
            Biometric Devices
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/commissions/rules`}>
            Commission Rules
          </Link>
          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/commissions/report`}>
            Commission Report
          </Link>

          <Link className="text-sm text-brand-700 hover:underline" href={`/companies/${companyId}/settings/cost-centers`}>
            Cost Centers
          </Link>
          <Link className="text-sm font-semibold text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/reports/salary-sheet`}>
            Salary Sheet Report
          </Link>
          <Link className="text-sm font-semibold text-brand-700 hover:underline" href={`/companies/${companyId}/payroll/reports/vouchers`}>
            Payroll Voucher Report
          </Link>
          <Link className="text-sm font-semibold text-brand-700 hover:underline flex items-center gap-1" href={`/companies/${companyId}/payroll/reports/annual-register`}>
            <span className="w-2 h-2 rounded-full bg-violet-500 animate-pulse"></span>
            Annual Matrix Report
          </Link>
        </div>
      </Card>
    </div>
  );
}

