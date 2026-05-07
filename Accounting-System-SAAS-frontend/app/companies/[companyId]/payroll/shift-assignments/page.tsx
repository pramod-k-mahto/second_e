"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Select } from "@/components/ui/Select";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { getApiErrorMessage, api, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import useSWR from "swr";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

import {
  useCreateShiftAssignment,
  useDeleteShiftAssignment,
  useEmployees,
  useShiftAssignments,
  useShifts,
} from "@/lib/payroll/queries";
import type { ShiftAssignmentCreate, ShiftAssignmentRead, ShiftRead } from "@/lib/payroll/types";

export default function PayrollShiftAssignmentsPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();

  const { data: employees, isLoading: employeesLoading } = useEmployees(companyId);
  const { data: shifts, isLoading: shiftsLoading } = useShifts(companyId);

  const { calendarMode, displayMode: calendarDisplayMode, reportMode } = useCalendarSettings();

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR(
    isValidCompanyId ? `/companies/${companyId}` : null,
    fetcher
  );


  const [employeeId, setEmployeeId] = React.useState<string>("");
  const selectedEmployeeId = employeeId ? Number(employeeId) : null;

  const {
    data: assignments,
    isLoading: assignmentsLoading,
    error: assignmentsError,
  } = useShiftAssignments(companyId, {
    employee_id: selectedEmployeeId ?? undefined,
  });

  const createAssignment = useCreateShiftAssignment(companyId);
  const deleteAssignment = useDeleteShiftAssignment(companyId);

  const [shiftId, setShiftId] = React.useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = React.useState<string>(smartTo);

  const [effectiveTo, setEffectiveTo] = React.useState<string>("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ShiftAssignmentRead | null>(null);

  const shiftById = React.useMemo(() => {
    const map = new Map<number, ShiftRead>();
    (shifts || []).forEach((s) => map.set(Number((s as any).id), s as ShiftRead));
    return map;
  }, [shifts]);

  const employeeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), String(e.full_name || "")));
    return map;
  }, [employees]);

  const selectedEmployeeName = selectedEmployeeId ? employeeNameById.get(selectedEmployeeId) || "" : "";

  const sortedAssignments = React.useMemo(() => {
    const list = (assignments || []) as ShiftAssignmentRead[];
    return list
      .slice()
      .sort((a, b) => String(b.effective_from || "").localeCompare(String(a.effective_from || "")));
  }, [assignments]);

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!selectedEmployeeId) next.employee_id = "Select employee";
    if (!shiftId) next.shift_id = "Select shift";
    if (!effectiveFrom) next.effective_from = "Effective from is required";
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) {
      next.effective_to = "Effective to cannot be before effective from";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleCreate = async () => {
    setSubmitError(null);
    setFieldErrors({});
    if (!validate()) return;

    const payload: ShiftAssignmentCreate = {
      employee_id: Number(selectedEmployeeId),
      shift_id: Number(shiftId),
      effective_from: effectiveFrom,
      effective_to: effectiveTo ? effectiveTo : null,
    };

    try {
      await createAssignment.mutateAsync(payload as ShiftAssignmentCreate as ShiftAssignmentCreate);
      showToast({ title: "Shift assigned", variant: "success" });
      setShiftId("");
      setEffectiveTo("");
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;
      if (status === 422 && Array.isArray(detail)) {
        const next: Record<string, string> = {};
        (detail as any[]).forEach((d) => {
          const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
          const msg = typeof d?.msg === "string" ? d.msg : "Invalid value";
          if (typeof field === "string") next[field] = msg;
        });
        setFieldErrors(next);
      } else {
        setSubmitError(getApiErrorMessage(e));
      }
    }
  };

  const requestDelete = (a: ShiftAssignmentRead) => {
    setDeleteTarget(a);
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteAssignment.mutateAsync(deleteTarget.id);
      showToast({ title: "Assignment removed", variant: "success" });
      setConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      showToast({ title: "Delete failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const columns = React.useMemo((): DataTableColumn<ShiftAssignmentRead>[] => {
    return [
      {
        id: "shift",
        header: "Shift",
        accessor: (row) => {
          const s = shiftById.get(Number(row.shift_id));
          return (
            <div className="space-y-0.5">
              <div className="font-medium text-slate-900 dark:text-slate-100">{s?.name || ""}</div>
              <div className="text-[11px] text-slate-500">
                {s?.start_time && s?.end_time ? `${s.start_time} - ${s.end_time}` : ""}
              </div>
            </div>
          );
        },
      },
      {
        id: "from",
        header: "From",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.effective_from}</span>,
      },
      {
        id: "to",
        header: "To",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{row.effective_to || ""}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <Button size="sm" variant="danger" onClick={() => requestDelete(row)}>
            Remove
          </Button>
        ),
      },
    ];
  }, [shiftById]);

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shift Assignments"
        subtitle="Assign shifts to employees with effective date ranges."
        closeLink={`/companies/${companyId}/payroll`}
      />
      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="space-y-1 md:col-span-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Employee</label>
            <Select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={employeesLoading}
            >
              <option value="">Select employee</option>
              {(employees || [])
                .slice()
                .sort((a: any, b: any) => String(a.full_name || "").localeCompare(String(b.full_name || "")))
                .map((e: any) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
            {fieldErrors.employee_id && (
              <div className="text-[11px] text-critical-600 dark:text-critical-400">{fieldErrors.employee_id}</div>
            )}
          </div>

          <div className="md:col-span-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200 mb-2">Assign shift</div>
            {submitError && <div className="mb-2 text-xs text-critical-600">{submitError}</div>}
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Shift</label>
                <Select
                  value={shiftId}
                  onChange={(e) => setShiftId(e.target.value)}
                  disabled={shiftsLoading}
                >
                  <option value="">Select shift</option>
                  {(shifts || [])
                    .slice()
                    .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
                    .map((s: any) => (
                      <option key={s.id} value={String(s.id)}>
                        {s.name} ({s.start_time}-{s.end_time})
                      </option>
                    ))}
                </Select>
                {fieldErrors.shift_id && (
                  <div className="text-[11px] text-critical-600 dark:text-critical-400">{fieldErrors.shift_id}</div>
                )}
              </div>

              <FormField
                label="From"
                type="date"
                value={effectiveFrom}
                min={company?.fiscal_year_start || ""}
                max={company?.fiscal_year_end || ""}
                onChange={(e) => setEffectiveFrom(e.target.value)}
                error={fieldErrors.effective_from}
      />
              <FormField
                label="To"
                type="date"
                value={effectiveTo}
                min={company?.fiscal_year_start || ""}
                max={company?.fiscal_year_end || ""}
                onChange={(e) => setEffectiveTo(e.target.value)}
                error={fieldErrors.effective_to}
      />

            </div>

            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                onClick={handleCreate}
                isLoading={createAssignment.isPending}
                disabled={!selectedEmployeeId}
              >
                Assign
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
          {selectedEmployeeId ? `Assignment history: ${selectedEmployeeName}` : "Assignment history"}
        </div>

        {!selectedEmployeeId && (
          <div className="text-xs text-slate-500">Select an employee to view and manage their shift assignments.</div>
        )}

        {assignmentsError && (
          <div className="text-xs text-critical-600">{getApiErrorMessage(assignmentsError)}</div>
        )}

        {selectedEmployeeId && (
          <DataTable
            columns={columns}
            data={sortedAssignments}
            getRowKey={(row) => row.id}
            emptyMessage={assignmentsLoading ? "Loading..." : "No assignments found."}
      />
        )}
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Remove assignment?"
        description="This will remove the shift assignment. This action cannot be undone."
        confirmLabel="Remove"
        isConfirming={deleteAssignment.isPending}
        onCancel={() => {
          if (deleteAssignment.isPending) return;
          setConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={performDelete}
      />
    </div>
  );
}

