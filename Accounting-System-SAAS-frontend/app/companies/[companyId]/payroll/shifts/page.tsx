"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { FormField } from "@/components/ui/FormField";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { getApiErrorMessage } from "@/lib/api";
import { useCreateShift, useDeleteShift, useShifts, useUpdateShift } from "@/lib/payroll/queries";
import type { ShiftCreate, ShiftRead } from "@/lib/payroll/types";

function isValidTimeHHMM(v: string): boolean {
  if (!v) return false;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(v.trim());
  return !!m;
}

export default function PayrollShiftsPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();
  const { data: shifts, isLoading, error } = useShifts(companyId);
  const createShift = useCreateShift(companyId);
  const updateShift = useUpdateShift(companyId);
  const deleteShift = useDeleteShift(companyId);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ShiftRead | null>(null);

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [startTime, setStartTime] = React.useState("09:00");
  const [endTime, setEndTime] = React.useState("18:00");
  const [breakMinutes, setBreakMinutes] = React.useState("");

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<ShiftRead | null>(null);

  const resetForm = () => {
    setEditing(null);
    setCode("");
    setName("");
    setStartTime("09:00");
    setEndTime("18:00");
    setBreakMinutes("");
    setSubmitError(null);
    setFieldErrors({});
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (s: ShiftRead) => {
    setEditing(s);
    setCode(s.code || "");
    setName(s.name || "");
    setStartTime(s.start_time || "09:00");
    setEndTime(s.end_time || "18:00");
    setBreakMinutes(s.break_minutes != null ? String(s.break_minutes) : "");
    setSubmitError(null);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (createShift.isPending || updateShift.isPending) return;
    setDrawerOpen(false);
  };

  const requestDelete = (s: ShiftRead) => {
    setDeleteTarget(s);
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteShift.mutateAsync(deleteTarget.id);
      showToast({ title: "Shift deleted", variant: "success" });
      setConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      showToast({ title: "Delete failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const validateForm = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required";
    if (!isValidTimeHHMM(startTime)) next.start_time = "Start time must be in HH:MM";
    if (!isValidTimeHHMM(endTime)) next.end_time = "End time must be in HH:MM";
    if (breakMinutes.trim()) {
      const n = Number(breakMinutes);
      if (!Number.isFinite(n) || n < 0) next.break_minutes = "Break minutes must be 0 or greater";
    }
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    setSubmitError(null);
    setFieldErrors({});

    if (!validateForm()) return;

    const payload: ShiftCreate = {
      code: code.trim() ? code.trim() : null,
      name: name.trim(),
      start_time: startTime.trim(),
      end_time: endTime.trim(),
      break_minutes: breakMinutes.trim() ? Number(breakMinutes) : null,
      is_active: true,
    };

    try {
      if (editing) {
        await updateShift.mutateAsync({ shiftId: editing.id, payload });
        showToast({ title: "Shift updated", variant: "success" });
      } else {
        await createShift.mutateAsync(payload);
        showToast({ title: "Shift created", variant: "success" });
      }
      setDrawerOpen(false);
      resetForm();
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
        setSubmitError(null);
      } else {
        setSubmitError(getApiErrorMessage(e));
      }
    }
  };

  const columns = React.useMemo((): DataTableColumn<ShiftRead>[] => {
    return [
      {
        id: "name",
        header: "Shift",
        accessor: (row) => (
          <div className="space-y-0.5">
            <div className="font-medium text-slate-900 dark:text-slate-100">{row.name}</div>
            <div className="text-[11px] text-slate-500">{row.code ? `Code: ${row.code}` : ""}</div>
          </div>
        ),
      },
      {
        id: "time",
        header: "Time",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.start_time} - {row.end_time}
          </span>
        ),
      },
      {
        id: "break",
        header: "Break",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.break_minutes != null ? `${row.break_minutes} min` : ""}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => requestDelete(row)}>
              Delete
            </Button>
          </div>
        ),
      },
    ];
  }, []);

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Shifts"
        subtitle="Create shift definitions and working times."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <Button size="sm" onClick={openCreate}>
            New Shift
          </Button>
        }
      />

      <Card className="p-4 space-y-3">
        {error && (
          <div className="text-xs text-critical-600">
            {String((error as any)?.message || "Failed to load shifts")}
          </div>
        )}

        <DataTable
          columns={columns}
          data={(shifts || []) as ShiftRead[]}
          getRowKey={(row) => row.id}
          emptyMessage={isLoading ? "Loading..." : "No shifts found."}
      />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Shift" : "New Shift"}
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {submitError && <div className="text-xs text-critical-600">{submitError}</div>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Optional code"
              error={fieldErrors.code}
      />
            <FormField
              label="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Shift name"
              error={fieldErrors.name}
      />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <FormField
              label="Start Time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              placeholder="HH:MM"
              error={fieldErrors.start_time}
      />
            <FormField
              label="End Time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              placeholder="HH:MM"
              error={fieldErrors.end_time}
      />
            <FormField
              label="Break Minutes"
              value={breakMinutes}
              onChange={(e) => setBreakMinutes(e.target.value)}
              placeholder="0"
              error={fieldErrors.break_minutes}
      />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeDrawer}
              disabled={createShift.isPending || updateShift.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              isLoading={createShift.isPending || updateShift.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete shift?"
        description="This will delete the shift definition. This action cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteShift.isPending}
        onCancel={() => {
          if (deleteShift.isPending) return;
          setConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={performDelete}
      />
    </div>
  );
}

