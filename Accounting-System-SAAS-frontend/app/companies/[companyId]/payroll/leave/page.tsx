"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { getApiErrorMessage, api, getCurrentCompany, getSmartDefaultPeriod } from "@/lib/api";
import useSWR from "swr";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

import {
  useApproveLeaveRequest,
  useCreateLeaveRequest,
  useCreateLeaveType,
  useDeleteLeaveType,
  useEmployees,
  useLeaveRequests,
  useLeaveTypes,
  useRejectLeaveRequest,
  useUpdateLeaveType,
} from "@/lib/payroll/queries";
import type {
  EmployeeRead,
  LeaveRequestCreate,
  LeaveRequestRead,
  LeaveTypeCreate,
  LeaveTypeRead,
} from "@/lib/payroll/types";

export default function PayrollLeavePage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();

  const { data: employees, isLoading: employeesLoading } = useEmployees(companyId);
  const { data: leaveTypes, isLoading: typesLoading, error: typesError } = useLeaveTypes(companyId);

  const { calendarMode, displayMode: calendarDisplayMode, reportMode } = useCalendarSettings();

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR(
    isValidCompanyId ? `/companies/${companyId}` : null,
    fetcher
  );


  const createLeaveType = useCreateLeaveType(companyId);
  const updateLeaveType = useUpdateLeaveType(companyId);
  const deleteLeaveType = useDeleteLeaveType(companyId);

  const createLeaveRequest = useCreateLeaveRequest(companyId);
  const approveLeaveRequest = useApproveLeaveRequest(companyId);
  const rejectLeaveRequest = useRejectLeaveRequest(companyId);

  const [typeDrawerOpen, setTypeDrawerOpen] = React.useState(false);
  const [editingType, setEditingType] = React.useState<LeaveTypeRead | null>(null);
  const [typeCode, setTypeCode] = React.useState("");
  const [typeName, setTypeName] = React.useState("");
  const [typeIsPaid, setTypeIsPaid] = React.useState<string>("true");
  const [typeIsActive, setTypeIsActive] = React.useState<string>("true");
  const [typeSubmitError, setTypeSubmitError] = React.useState<string | null>(null);
  const [typeFieldErrors, setTypeFieldErrors] = React.useState<Record<string, string>>({});

  const [typeDeleteConfirmOpen, setTypeDeleteConfirmOpen] = React.useState(false);
  const [typeDeleteTarget, setTypeDeleteTarget] = React.useState<LeaveTypeRead | null>(null);

  const [status, setStatus] = React.useState<string>("");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [startDate, setStartDate] = React.useState<string>(smartFrom);
  const [endDate, setEndDate] = React.useState<string>(smartTo);


  const selectedEmployeeId = employeeId ? Number(employeeId) : undefined;

  const {
    data: leaveRequests,
    isLoading: requestsLoading,
    error: requestsError,
  } = useLeaveRequests(companyId, {
    employee_id: selectedEmployeeId,
    status: status || undefined,
    start: startDate || undefined,
    end: endDate || undefined,
  });

  const [requestDrawerOpen, setRequestDrawerOpen] = React.useState(false);
  const [reqEmployeeId, setReqEmployeeId] = React.useState<string>("");
  const [reqTypeId, setReqTypeId] = React.useState<string>("");
  const [reqStartDate, setReqStartDate] = React.useState<string>(smartTo);
  const [reqEndDate, setReqEndDate] = React.useState<string>(smartTo);

  const [reqReason, setReqReason] = React.useState<string>("");
  const [reqSubmitError, setReqSubmitError] = React.useState<string | null>(null);
  const [reqFieldErrors, setReqFieldErrors] = React.useState<Record<string, string>>({});

  const [decisionDrawerOpen, setDecisionDrawerOpen] = React.useState(false);
  const [decisionTarget, setDecisionTarget] = React.useState<LeaveRequestRead | null>(null);
  const [decisionMode, setDecisionMode] = React.useState<"APPROVE" | "REJECT">("APPROVE");
  const [decisionReason, setDecisionReason] = React.useState<string>("");
  const [decisionSubmitError, setDecisionSubmitError] = React.useState<string | null>(null);

  const employeeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), String(e.full_name || "")));
    return map;
  }, [employees]);

  const leaveTypeById = React.useMemo(() => {
    const map = new Map<number, LeaveTypeRead>();
    (leaveTypes || []).forEach((t: any) => map.set(Number(t.id), t as LeaveTypeRead));
    return map;
  }, [leaveTypes]);

  const resetTypeForm = () => {
    setEditingType(null);
    setTypeCode("");
    setTypeName("");
    setTypeIsPaid("true");
    setTypeIsActive("true");
    setTypeSubmitError(null);
    setTypeFieldErrors({});
  };

  const openCreateType = () => {
    resetTypeForm();
    setTypeDrawerOpen(true);
  };

  const openEditType = (t: LeaveTypeRead) => {
    setEditingType(t);
    setTypeCode(t.code || "");
    setTypeName(t.name || "");
    setTypeIsPaid(String(t.is_paid ?? true));
    setTypeIsActive(String(t.is_active ?? true));
    setTypeSubmitError(null);
    setTypeFieldErrors({});
    setTypeDrawerOpen(true);
  };

  const closeTypeDrawer = () => {
    if (createLeaveType.isPending || updateLeaveType.isPending) return;
    setTypeDrawerOpen(false);
  };

  const validateType = (): boolean => {
    const next: Record<string, string> = {};
    if (!typeCode.trim()) next.code = "Code is required";
    if (!typeName.trim()) next.name = "Name is required";
    setTypeFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveType = async () => {
    setTypeSubmitError(null);
    setTypeFieldErrors({});
    if (!validateType()) return;

    const payload: LeaveTypeCreate = {
      code: typeCode.trim(),
      name: typeName.trim(),
      is_paid: typeIsPaid === "true",
      is_active: typeIsActive === "true",
    };

    try {
      if (editingType) {
        await updateLeaveType.mutateAsync({ typeId: editingType.id, payload });
        showToast({ title: "Leave type updated", variant: "success" });
      } else {
        await createLeaveType.mutateAsync(payload);
        showToast({ title: "Leave type created", variant: "success" });
      }
      setTypeDrawerOpen(false);
      resetTypeForm();
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
        setTypeFieldErrors(next);
      } else {
        setTypeSubmitError(getApiErrorMessage(e));
      }
    }
  };

  const requestDeleteType = (t: LeaveTypeRead) => {
    setTypeDeleteTarget(t);
    setTypeDeleteConfirmOpen(true);
  };

  const performDeleteType = async () => {
    if (!typeDeleteTarget) return;
    try {
      await deleteLeaveType.mutateAsync(typeDeleteTarget.id);
      showToast({ title: "Leave type deleted", variant: "success" });
      setTypeDeleteConfirmOpen(false);
      setTypeDeleteTarget(null);
    } catch (e) {
      showToast({ title: "Delete failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const resetRequestForm = () => {
    setReqEmployeeId("");
    setReqTypeId("");
    setReqStartDate(smartTo);
    setReqEndDate(smartTo);

    setReqReason("");
    setReqSubmitError(null);
    setReqFieldErrors({});
  };

  const openCreateRequest = () => {
    resetRequestForm();
    if (employeeId) setReqEmployeeId(employeeId);
    setRequestDrawerOpen(true);
  };

  const closeRequestDrawer = () => {
    if (createLeaveRequest.isPending) return;
    setRequestDrawerOpen(false);
  };

  const validateRequest = (): boolean => {
    const next: Record<string, string> = {};
    if (!reqEmployeeId) next.employee_id = "Select employee";
    if (!reqTypeId) next.leave_type_id = "Select leave type";
    if (!reqStartDate) next.start_date = "Start date is required";
    if (!reqEndDate) next.end_date = "End date is required";
    if (reqStartDate && reqEndDate && reqEndDate < reqStartDate) next.end_date = "End date cannot be before start date";
    setReqFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveRequest = async () => {
    setReqSubmitError(null);
    setReqFieldErrors({});
    if (!validateRequest()) return;

    const payload: LeaveRequestCreate = {
      employee_id: Number(reqEmployeeId),
      leave_type_id: Number(reqTypeId),
      start_date: reqStartDate,
      end_date: reqEndDate,
      reason: reqReason.trim() ? reqReason.trim() : null,
    };

    try {
      await createLeaveRequest.mutateAsync(payload);
      showToast({ title: "Leave request created", variant: "success" });
      setRequestDrawerOpen(false);
      resetRequestForm();
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
        setReqFieldErrors(next);
      } else {
        setReqSubmitError(getApiErrorMessage(e));
      }
    }
  };

  const openDecision = (req: LeaveRequestRead, mode: "APPROVE" | "REJECT") => {
    setDecisionTarget(req);
    setDecisionMode(mode);
    setDecisionReason("");
    setDecisionSubmitError(null);
    setDecisionDrawerOpen(true);
  };

  const closeDecisionDrawer = () => {
    if (approveLeaveRequest.isPending || rejectLeaveRequest.isPending) return;
    setDecisionDrawerOpen(false);
    setDecisionTarget(null);
  };

  const submitDecision = async () => {
    if (!decisionTarget) return;
    setDecisionSubmitError(null);
    try {
      if (decisionMode === "APPROVE") {
        await approveLeaveRequest.mutateAsync({ id: decisionTarget.id, reason: decisionReason.trim() ? decisionReason.trim() : null });
        showToast({ title: "Leave approved", variant: "success" });
      } else {
        await rejectLeaveRequest.mutateAsync({ id: decisionTarget.id, reason: decisionReason.trim() ? decisionReason.trim() : null });
        showToast({ title: "Leave rejected", variant: "success" });
      }
      setDecisionDrawerOpen(false);
      setDecisionTarget(null);
    } catch (e) {
      setDecisionSubmitError(getApiErrorMessage(e));
    }
  };

  const typesColumns = React.useMemo((): DataTableColumn<LeaveTypeRead>[] => {
    return [
      {
        id: "code",
        header: "Code",
        accessor: (row) => <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{row.code}</span>,
      },
      {
        id: "name",
        header: "Name",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.name}</span>,
      },
      {
        id: "paid",
        header: "Paid",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{row.is_paid === false ? "No" : "Yes"}</span>
        ),
      },
      {
        id: "active",
        header: "Active",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{row.is_active === false ? "No" : "Yes"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openEditType(row)}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => requestDeleteType(row)}>
              Delete
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  const sortedRequests = React.useMemo(() => {
    const list = (leaveRequests || []) as LeaveRequestRead[];
    return list
      .slice()
      .sort((a, b) => String(b.start_date || "").localeCompare(String(a.start_date || "")));
  }, [leaveRequests]);

  const requestsColumns = React.useMemo((): DataTableColumn<LeaveRequestRead>[] => {
    return [
      {
        id: "employee",
        header: "Employee",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {employeeNameById.get(Number(row.employee_id)) || ""}
          </span>
        ),
      },
      {
        id: "type",
        header: "Type",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {leaveTypeById.get(Number(row.leave_type_id))?.name || ""}
          </span>
        ),
      },
      {
        id: "dates",
        header: "Dates",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{row.start_date} â†’ {row.end_date}</span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.status}</span>,
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => {
          const isPending = String(row.status).toUpperCase() === "PENDING";
          if (!isPending) return null;
          return (
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => openDecision(row, "APPROVE")}>
                Approve
              </Button>
              <Button size="sm" variant="danger" onClick={() => openDecision(row, "REJECT")}>
                Reject
              </Button>
            </div>
          );
        },
      },
    ];
  }, [employeeNameById, leaveTypeById]);

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Leave"
        subtitle="Maintain leave types and approve/reject leave requests."
        closeLink={`/companies/${companyId}/payroll`}
      />
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Leave Types</div>
          <Button size="sm" onClick={openCreateType}>
            Add Type
          </Button>
        </div>

        {typesError && <div className="text-xs text-critical-600">{getApiErrorMessage(typesError)}</div>}

        <DataTable
          columns={typesColumns}
          data={(leaveTypes || []) as LeaveTypeRead[]}
          getRowKey={(row) => row.id}
          emptyMessage={typesLoading ? "Loading..." : "No leave types found."}
      />
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Leave Requests</div>
          <Button size="sm" onClick={openCreateRequest}>
            New Request
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Employee</label>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={employeesLoading}>
              <option value="">All employees</option>
              {(employees || [])
                .slice()
                .sort((a: any, b: any) => String(a.full_name || "").localeCompare(String(b.full_name || "")))
                .map((e: EmployeeRead) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
          </div>
          <FormField label="Start" type="date" value={startDate}
            min={company?.fiscal_year_start || ""}
            max={company?.fiscal_year_end || ""}
            onChange={(e) => setStartDate(e.target.value)}
      />
          <FormField label="End" type="date" value={endDate}
            min={company?.fiscal_year_start || ""}
            max={company?.fiscal_year_end || ""}
            onChange={(e) => setEndDate(e.target.value)}
      />

        </div>

        {requestsError && <div className="text-xs text-critical-600">{getApiErrorMessage(requestsError)}</div>}

        <DataTable
          columns={requestsColumns}
          data={sortedRequests}
          getRowKey={(row) => row.id}
          emptyMessage={requestsLoading ? "Loading..." : "No leave requests found."}
      />
      </Card>

      <Drawer
        open={typeDrawerOpen}
        onClose={closeTypeDrawer}
        title={editingType ? "Edit Leave Type" : "Add Leave Type"}
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {typeSubmitError && <div className="text-xs text-critical-600">{typeSubmitError}</div>}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              label="Code"
              required
              value={typeCode}
              onChange={(e) => setTypeCode(e.target.value)}
              placeholder="e.g. CL"
              error={typeFieldErrors.code}
      />
            <FormField
              label="Name"
              required
              value={typeName}
              onChange={(e) => setTypeName(e.target.value)}
              placeholder="e.g. Casual Leave"
              error={typeFieldErrors.name}
      />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Paid</label>
              <Select value={typeIsPaid} onChange={(e) => setTypeIsPaid(e.target.value)}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Active</label>
              <Select value={typeIsActive} onChange={(e) => setTypeIsActive(e.target.value)}>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={closeTypeDrawer} disabled={createLeaveType.isPending || updateLeaveType.isPending}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveType} isLoading={createLeaveType.isPending || updateLeaveType.isPending}>
              Save
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={typeDeleteConfirmOpen}
        title="Delete leave type?"
        description="This will delete the leave type. This action cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteLeaveType.isPending}
        onCancel={() => {
          if (deleteLeaveType.isPending) return;
          setTypeDeleteConfirmOpen(false);
          setTypeDeleteTarget(null);
        }}
        onConfirm={performDeleteType}
      />

      <Drawer
        open={requestDrawerOpen}
        onClose={closeRequestDrawer}
        title="New Leave Request"
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {reqSubmitError && <div className="text-xs text-critical-600">{reqSubmitError}</div>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Employee
              <span className="ml-0.5 text-critical-500">*</span>
            </label>
            <Select value={reqEmployeeId} onChange={(e) => setReqEmployeeId(e.target.value)} disabled={employeesLoading}>
              <option value="">Select employee</option>
              {(employees || [])
                .slice()
                .sort((a: any, b: any) => String(a.full_name || "").localeCompare(String(b.full_name || "")))
                .map((e: EmployeeRead) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
            {reqFieldErrors.employee_id && (
              <div className="text-[11px] text-critical-600 dark:text-critical-400">{reqFieldErrors.employee_id}</div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Leave Type
              <span className="ml-0.5 text-critical-500">*</span>
            </label>
            <Select value={reqTypeId} onChange={(e) => setReqTypeId(e.target.value)} disabled={typesLoading}>
              <option value="">Select leave type</option>
              {(leaveTypes || [])
                .slice()
                .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((t: LeaveTypeRead) => (
                  <option key={t.id} value={String(t.id)}>
                    {t.name}
                  </option>
                ))}
            </Select>
            {reqFieldErrors.leave_type_id && (
              <div className="text-[11px] text-critical-600 dark:text-critical-400">{reqFieldErrors.leave_type_id}</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              label="Start Date"
              type="date"
              required
              value={reqStartDate}
              min={company?.fiscal_year_start || ""}
              max={company?.fiscal_year_end || ""}
              onChange={(e) => setReqStartDate(e.target.value)}
              error={reqFieldErrors.start_date}
      />
            <FormField
              label="End Date"
              type="date"
              required
              value={reqEndDate}
              min={company?.fiscal_year_start || ""}
              max={company?.fiscal_year_end || ""}
              onChange={(e) => setReqEndDate(e.target.value)}
              error={reqFieldErrors.end_date}
      />

          </div>

          <FormField
            label="Reason"
            value={reqReason}
            onChange={(e) => setReqReason(e.target.value)}
            placeholder="Optional"
            error={reqFieldErrors.reason}
      />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={closeRequestDrawer} disabled={createLeaveRequest.isPending}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveRequest} isLoading={createLeaveRequest.isPending}>
              Submit
            </Button>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={decisionDrawerOpen}
        onClose={closeDecisionDrawer}
        title={decisionMode === "APPROVE" ? "Approve Leave" : "Reject Leave"}
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {decisionSubmitError && <div className="text-xs text-critical-600">{decisionSubmitError}</div>}
          {decisionTarget && (
            <div className="rounded-md border border-border-light dark:border-border-dark p-3 text-xs text-slate-700 dark:text-slate-200">
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {employeeNameById.get(Number(decisionTarget.employee_id)) || ""}
              </div>
              <div className="text-[11px] text-slate-500">
                {leaveTypeById.get(Number(decisionTarget.leave_type_id))?.name || ""} Â· {decisionTarget.start_date} â†’ {decisionTarget.end_date}
              </div>
            </div>
          )}

          <FormField
            label="Decision Note"
            value={decisionReason}
            onChange={(e) => setDecisionReason(e.target.value)}
            placeholder="Optional"
      />

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeDecisionDrawer}
              disabled={approveLeaveRequest.isPending || rejectLeaveRequest.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant={decisionMode === "APPROVE" ? "primary" : "danger"}
              onClick={submitDecision}
              isLoading={approveLeaveRequest.isPending || rejectLeaveRequest.isPending}
            >
              {decisionMode === "APPROVE" ? "Approve" : "Reject"}
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

