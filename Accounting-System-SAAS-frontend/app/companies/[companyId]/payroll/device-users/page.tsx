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
import { getApiErrorMessage } from "@/lib/api";
import {
  useCreateDeviceUser,
  useDeleteDeviceUser,
  useDeviceUsers,
  useDevices,
  useEmployees,
  useUpdateDeviceUser,
} from "@/lib/payroll/queries";
import type { DeviceRead, DeviceUserCreate, DeviceUserRead, EmployeeRead } from "@/lib/payroll/types";

export default function PayrollDeviceUsersPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();

  const { data: devices, isLoading: devicesLoading } = useDevices(companyId);
  const { data: employees, isLoading: employeesLoading } = useEmployees(companyId);

  const [deviceId, setDeviceId] = React.useState<string>("");
  const [employeeId, setEmployeeId] = React.useState<string>("");
  const selectedDeviceId = deviceId ? Number(deviceId) : undefined;
  const selectedEmployeeId = employeeId ? Number(employeeId) : undefined;

  const {
    data: mappings,
    isLoading,
    error,
  } = useDeviceUsers(companyId, {
    device_id: selectedDeviceId,
    employee_id: selectedEmployeeId,
  });

  const createMapping = useCreateDeviceUser(companyId);
  const updateMapping = useUpdateDeviceUser(companyId);
  const deleteMapping = useDeleteDeviceUser(companyId);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DeviceUserRead | null>(null);

  const [formDeviceId, setFormDeviceId] = React.useState<string>("");
  const [formEmployeeId, setFormEmployeeId] = React.useState<string>("");
  const [deviceUserCode, setDeviceUserCode] = React.useState<string>("");
  const [displayName, setDisplayName] = React.useState<string>("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<DeviceUserRead | null>(null);

  const deviceNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (devices || []).forEach((d: any) => map.set(Number(d.id), String(d.name || "")));
    return map;
  }, [devices]);

  const employeeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), String(e.full_name || "")));
    return map;
  }, [employees]);

  const resetForm = () => {
    setEditing(null);
    setFormDeviceId("");
    setFormEmployeeId("");
    setDeviceUserCode("");
    setDisplayName("");
    setSubmitError(null);
    setFieldErrors({});
  };

  const openCreate = () => {
    resetForm();
    if (deviceId) setFormDeviceId(deviceId);
    if (employeeId) setFormEmployeeId(employeeId);
    setDrawerOpen(true);
  };

  const openEdit = (m: DeviceUserRead) => {
    setEditing(m);
    setFormDeviceId(String(m.device_id || ""));
    setFormEmployeeId(m.employee_id != null ? String(m.employee_id) : "");
    setDeviceUserCode(m.device_user_code || "");
    setDisplayName(m.display_name || "");
    setSubmitError(null);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (createMapping.isPending || updateMapping.isPending) return;
    setDrawerOpen(false);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!formDeviceId) next.device_id = "Select device";
    if (!deviceUserCode.trim()) next.device_user_code = "Device user code is required";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    setSubmitError(null);
    setFieldErrors({});
    if (!validate()) return;

    const payload: DeviceUserCreate = {
      device_id: Number(formDeviceId),
      employee_id: formEmployeeId ? Number(formEmployeeId) : null,
      device_user_code: deviceUserCode.trim(),
      display_name: displayName.trim() ? displayName.trim() : null,
      is_active: true,
    };

    try {
      if (editing) {
        await updateMapping.mutateAsync({ deviceUserId: editing.id, payload });
        showToast({ title: "Mapping updated", variant: "success" });
      } else {
        await createMapping.mutateAsync(payload);
        showToast({ title: "Mapping created", variant: "success" });
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
      } else {
        setSubmitError(getApiErrorMessage(e));
      }
    }
  };

  const requestDelete = (m: DeviceUserRead) => {
    setDeleteTarget(m);
    setConfirmOpen(true);
  };

  const performDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMapping.mutateAsync(deleteTarget.id);
      showToast({ title: "Mapping deleted", variant: "success" });
      setConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      showToast({ title: "Delete failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const columns = React.useMemo((): DataTableColumn<DeviceUserRead>[] => {
    return [
      {
        id: "code",
        header: "Device User",
        accessor: (row) => (
          <div className="space-y-0.5">
            <div className="font-medium text-slate-900 dark:text-slate-100">{row.device_user_code}</div>
            <div className="text-[11px] text-slate-500">{row.display_name || ""}</div>
          </div>
        ),
      },
      {
        id: "device",
        header: "Device",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {deviceNameById.get(Number(row.device_id)) || ""}
          </span>
        ),
      },
      {
        id: "employee",
        header: "Employee",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.employee_id ? employeeNameById.get(Number(row.employee_id)) || "" : "Unmapped"}
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
  }, [deviceNameById, employeeNameById]);

  const mappedList = (mappings || []) as DeviceUserRead[];

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Device Users"
        subtitle="Map device user codes to employees."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <Button size="sm" onClick={openCreate}>
            New Mapping
          </Button>
        }
      />

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Device</label>
            <Select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={devicesLoading}>
              <option value="">All devices</option>
              {(devices || [])
                .slice()
                .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((d: DeviceRead) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
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
          <div className="md:col-span-1"
      />
        </div>

        {error && <div className="text-xs text-critical-600">{getApiErrorMessage(error)}</div>}

        <DataTable
          columns={columns}
          data={mappedList}
          getRowKey={(row) => row.id}
          emptyMessage={isLoading ? "Loading..." : "No mappings found."}
      />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Mapping" : "New Mapping"}
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {submitError && <div className="text-xs text-critical-600">{submitError}</div>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Device
              <span className="ml-0.5 text-critical-500">*</span>
            </label>
            <Select value={formDeviceId} onChange={(e) => setFormDeviceId(e.target.value)} disabled={devicesLoading}>
              <option value="">Select device</option>
              {(devices || [])
                .slice()
                .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((d: DeviceRead) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
            </Select>
            {fieldErrors.device_id && (
              <div className="text-[11px] text-critical-600 dark:text-critical-400">{fieldErrors.device_id}</div>
            )}
          </div>

          <FormField
            label="Device User Code"
            required
            value={deviceUserCode}
            onChange={(e) => setDeviceUserCode(e.target.value)}
            placeholder="e.g. 000123"
            error={fieldErrors.device_user_code}
      />

          <FormField
            label="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Optional"
            error={fieldErrors.display_name}
      />

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Employee</label>
            <Select value={formEmployeeId} onChange={(e) => setFormEmployeeId(e.target.value)} disabled={employeesLoading}>
              <option value="">Unmapped</option>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeDrawer}
              disabled={createMapping.isPending || updateMapping.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              isLoading={createMapping.isPending || updateMapping.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={confirmOpen}
        title="Delete mapping?"
        description="This will delete the device-user mapping. This action cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteMapping.isPending}
        onCancel={() => {
          if (deleteMapping.isPending) return;
          setConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={performDelete}
      />
    </div>
  );
}

