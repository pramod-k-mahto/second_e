"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { Drawer } from "@/components/ui/Drawer";
import { FormField } from "@/components/ui/FormField";
import { useToast } from "@/components/ui/Toast";
import { getApiErrorMessage } from "@/lib/api";
import { useCreateDevice, useDevices } from "@/lib/payroll/queries";
import type { DeviceCreate, DeviceRead } from "@/lib/payroll/types";

export default function PayrollDevicesPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();
  const { data: devices, isLoading, error } = useDevices(companyId);
  const createDevice = useCreateDevice(companyId);

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [ipAddress, setIpAddress] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const resetForm = () => {
    setName("");
    setCode("");
    setLocation("");
    setIpAddress("");
    setSubmitError(null);
    setFieldErrors({});
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (createDevice.isPending) return;
    setDrawerOpen(false);
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = "Name is required";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    setSubmitError(null);
    setFieldErrors({});
    if (!validate()) return;

    const payload: DeviceCreate = {
      name: name.trim(),
      code: code.trim() ? code.trim() : null,
      location: location.trim() ? location.trim() : null,
      ip_address: ipAddress.trim() ? ipAddress.trim() : null,
      is_active: true,
    };

    try {
      await createDevice.mutateAsync(payload);
      showToast({ title: "Device created", variant: "success" });
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

  const columns = React.useMemo((): DataTableColumn<DeviceRead>[] => {
    return [
      {
        id: "name",
        header: "Device",
        accessor: (row) => (
          <div className="space-y-0.5">
            <div className="font-medium text-slate-900 dark:text-slate-100">{row.name}</div>
            <div className="text-[11px] text-slate-500">{row.code ? `Code: ${row.code}` : ""}</div>
          </div>
        ),
      },
      {
        id: "location",
        header: "Location",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.location || ""}</span>,
      },
      {
        id: "ip",
        header: "IP",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.ip_address || ""}</span>,
      },
    ];
  }, []);

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Biometric Devices"
        subtitle="Manage biometric devices and device user mappings."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <Button size="sm" onClick={openCreate}>
            Add Device
          </Button>
        }
      />

      <Card className="p-4 space-y-3">
        {error && (
          <div className="text-xs text-critical-600">
            {String((error as any)?.message || "Failed to load devices")}
          </div>
        )}

        <DataTable
          columns={columns}
          data={(devices || []) as DeviceRead[]}
          getRowKey={(row) => row.id}
          emptyMessage={isLoading ? "Loading..." : "No devices found."}
      />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title="Add Device"
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {submitError && <div className="text-xs text-critical-600">{submitError}</div>}

          <FormField
            label="Name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Device name"
            error={fieldErrors.name}
      />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              label="Code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Optional code"
              error={fieldErrors.code}
      />
            <FormField
              label="Location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Optional location"
              error={fieldErrors.location}
      />
          </div>
          <FormField
            label="IP Address"
            value={ipAddress}
            onChange={(e) => setIpAddress(e.target.value)}
            placeholder="Optional IP"
            error={fieldErrors.ip_address}
      />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" size="sm" onClick={closeDrawer} disabled={createDevice.isPending}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={handleSave} isLoading={createDevice.isPending}>
              Save
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

