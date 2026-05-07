"use client";

import * as React from "react";
import Link from "next/link";
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
import { getApiErrorMessage, getCurrentCompany, getSmartDefaultPeriod, api } from "@/lib/api";
import useSWR from "swr";
import { useCalendarSettings } from "@/components/CalendarSettingsContext";

const fetcher = (url: string) => api.get(url).then((res) => res.data);


import {
  useAttendanceDaily,
  useDevices,
  useEmployees,
  useImportAttendanceCsv,
  useIngestAttendanceLogs,
  useManualFixAttendanceDaily,
  useRecomputeAttendanceDaily,
} from "@/lib/payroll/queries";
import type { AttendanceDailyManualFix, AttendanceDailyRead, AttendanceIngestResponse } from "@/lib/payroll/types";

export default function PayrollAttendancePage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();

  const { data: employees, isLoading: employeesLoading } = useEmployees(companyId);
  const { data: devices, isLoading: devicesLoading } = useDevices(companyId);

  const { calendarMode, displayMode: calendarDisplayMode, reportMode } = useCalendarSettings();

  const cc = getCurrentCompany();
  const initMode: "AD" | "BS" = cc?.calendar_mode || "AD";
  const { from: smartFrom, to: smartTo } = getSmartDefaultPeriod(initMode);

  const { data: company } = useSWR(
    isValidCompanyId ? `/companies/${companyId}` : null,
    (url: string) => fetcher(url)
  );


  const [start, setStart] = React.useState<string>(smartFrom);
  const [end, setEnd] = React.useState<string>(smartTo);

  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [status, setStatus] = React.useState<string>("");

  const selectedEmployeeId = employeeId ? Number(employeeId) : undefined;

  const {
    data: daily,
    isLoading: dailyLoading,
    error: dailyError,
  } = useAttendanceDaily(companyId, {
    start,
    end,
    employee_id: selectedEmployeeId,
    status: status || undefined,
  });

  const importCsv = useImportAttendanceCsv(companyId);
  const ingestLogs = useIngestAttendanceLogs(companyId);
  const recompute = useRecomputeAttendanceDaily(companyId);
  const manualFix = useManualFixAttendanceDaily(companyId);

  const [csvDeviceId, setCsvDeviceId] = React.useState<string>("");
  const [csvFile, setCsvFile] = React.useState<File | null>(null);
  const [csvError, setCsvError] = React.useState<string | null>(null);

  const [ingestText, setIngestText] = React.useState<string>("");
  const [ingestError, setIngestError] = React.useState<string | null>(null);

  const [lastImportResult, setLastImportResult] = React.useState<AttendanceIngestResponse | null>(null);

  const [recomputeConfirmOpen, setRecomputeConfirmOpen] = React.useState(false);

  const [fixDrawerOpen, setFixDrawerOpen] = React.useState(false);
  const [fixRow, setFixRow] = React.useState<AttendanceDailyRead | null>(null);
  const [fixFirstIn, setFixFirstIn] = React.useState<string>("");
  const [fixLastOut, setFixLastOut] = React.useState<string>("");
  const [fixStatus, setFixStatus] = React.useState<string>("");
  const [fixReason, setFixReason] = React.useState<string>("");
  const [fixSubmitError, setFixSubmitError] = React.useState<string | null>(null);
  const [fixFieldErrors, setFixFieldErrors] = React.useState<Record<string, string>>({});

  const employeeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), String(e.full_name || "")));
    return map;
  }, [employees]);

  const sortedDaily = React.useMemo(() => {
    const list = (daily || []) as AttendanceDailyRead[];
    return list
      .slice()
      .sort((a, b) => {
        const d = String(b.work_date || "").localeCompare(String(a.work_date || ""));
        if (d !== 0) return d;
        return String(employeeNameById.get(Number(a.employee_id)) || "").localeCompare(
          String(employeeNameById.get(Number(b.employee_id)) || "")
        );
      });
  }, [daily, employeeNameById]);

  const validateCsv = (): boolean => {
    if (!csvDeviceId) {
      setCsvError("Select a device");
      return false;
    }
    if (!csvFile) {
      setCsvError("Select a CSV file");
      return false;
    }
    setCsvError(null);
    return true;
  };

  const handleImportCsv = async () => {
    setCsvError(null);
    if (!validateCsv()) return;
    try {
      const res = await importCsv.mutateAsync({ device_id: Number(csvDeviceId), file: csvFile as File });
      setLastImportResult(res);
      showToast({ title: "CSV imported", variant: "success" });
    } catch (e) {
      setCsvError(getApiErrorMessage(e));
    }
  };

  const handleIngest = async () => {
    setIngestError(null);
    const raw = ingestText.trim();
    if (!raw) {
      setIngestError("Paste JSON payload to ingest");
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setIngestError("Invalid JSON");
      return;
    }

    try {
      const res = await ingestLogs.mutateAsync(parsed);
      setLastImportResult(res);
      showToast({ title: "Logs ingested", variant: "success" });
    } catch (e) {
      setIngestError(getApiErrorMessage(e));
    }
  };

  const validateDateRange = (): boolean => {
    if (!start || !end) return false;
    return end >= start;
  };

  const handleRecompute = async () => {
    if (!validateDateRange()) {
      showToast({ title: "Invalid date range", description: "End date cannot be before start date", variant: "error" });
      return;
    }

    try {
      await recompute.mutateAsync({
        start,
        end,
        employee_ids: selectedEmployeeId ? [selectedEmployeeId] : undefined,
      });
      showToast({ title: "Attendance recomputed", variant: "success" });
      setRecomputeConfirmOpen(false);
    } catch (e) {
      showToast({ title: "Recompute failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const openFix = (row: AttendanceDailyRead) => {
    setFixRow(row);
    setFixFirstIn(row.first_in || "");
    setFixLastOut(row.last_out || "");
    setFixStatus(row.status || "");
    setFixReason("");
    setFixSubmitError(null);
    setFixFieldErrors({});
    setFixDrawerOpen(true);
  };

  const closeFixDrawer = () => {
    if (manualFix.isPending) return;
    setFixDrawerOpen(false);
    setFixRow(null);
  };

  const validateFix = (): boolean => {
    const next: Record<string, string> = {};
    if (!fixReason.trim()) next.reason = "Reason is required";
    setFixFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveFix = async () => {
    if (!fixRow) return;
    setFixSubmitError(null);
    setFixFieldErrors({});
    if (!validateFix()) return;

    const payload: AttendanceDailyManualFix = {
      first_in: fixFirstIn.trim() ? fixFirstIn.trim() : null,
      last_out: fixLastOut.trim() ? fixLastOut.trim() : null,
      status: fixStatus.trim() ? fixStatus.trim() : null,
      reason: fixReason.trim(),
    };

    try {
      await manualFix.mutateAsync({ employeeId: fixRow.employee_id, workDate: fixRow.work_date, payload });
      showToast({ title: "Attendance updated", variant: "success" });
      setFixDrawerOpen(false);
      setFixRow(null);
    } catch (e) {
      setFixSubmitError(getApiErrorMessage(e));
    }
  };

  const columns = React.useMemo((): DataTableColumn<AttendanceDailyRead>[] => {
    return [
      {
        id: "date",
        header: "Date",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.work_date}</span>,
      },
      {
        id: "employee",
        header: "Employee",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.employee_name || employeeNameById.get(Number(row.employee_id)) || ""}
          </span>
        ),
      },
      {
        id: "in",
        header: "First In",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.first_in || ""}</span>,
      },
      {
        id: "out",
        header: "Last Out",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.last_out || ""}</span>,
      },
      {
        id: "worked",
        header: "Worked (min)",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.worked_minutes ?? ""}</span>,
      },
      {
        id: "late",
        header: "Late",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.late_minutes ?? ""}</span>,
      },
      {
        id: "ot",
        header: "OT",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.overtime_minutes ?? ""}</span>,
      },
      {
        id: "status",
        header: "Status",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.status || ""}
            {row.is_manual ? " (M)" : ""}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <Button size="sm" variant="outline" onClick={() => openFix(row)}>
            Manual Fix
          </Button>
        ),
      },
    ];
  }, [employeeNameById]);

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Attendance"
        subtitle="Import, recompute, and manually adjust daily attendance."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`/companies/${companyId}/payroll/devices`}>
              <Button size="sm" variant="outline">
                Attendance Machines
              </Button>
            </Link>
            <Link href={`/companies/${companyId}/reports`}>
              <Button size="sm" variant="outline">
                Reports & Calculations
              </Button>
            </Link>
            <Button size="sm" variant="outline" onClick={() => setRecomputeConfirmOpen(true)}>
              Recompute
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card className="p-4 space-y-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Import Attendance CSV</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="space-y-1 md:col-span-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Device</label>
              <Select value={csvDeviceId} onChange={(e) => setCsvDeviceId(e.target.value)} disabled={devicesLoading}>
                <option value="">Select device</option>
                {(devices || [])
                  .slice()
                  .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
                  .map((d: any) => (
                    <option key={d.id} value={String(d.id)}>
                      {d.name}
                    </option>
                  ))}
              </Select>
            </div>
            <div className="space-y-1 md:col-span-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">CSV File</label>
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-slate-700 dark:text-slate-200"
      />
            </div>
          </div>
          {csvError && <div className="text-xs text-critical-600">{csvError}</div>}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleImportCsv} isLoading={importCsv.isPending}>
              Import
            </Button>
          </div>
        </Card>

        <Card className="p-4 space-y-3">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Ingest Logs (JSON)</div>
          <textarea
            value={ingestText}
            onChange={(e) => setIngestText(e.target.value)}
            rows={8}
            placeholder='Paste JSON payload accepted by /attendance/logs/ingest'
            className="w-full rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-2 text-xs text-slate-900 dark:text-slate-100"
      />
          {ingestError && <div className="text-xs text-critical-600">{ingestError}</div>}
          <div className="flex justify-end">
            <Button size="sm" onClick={handleIngest} isLoading={ingestLogs.isPending}>
              Ingest
            </Button>
          </div>
        </Card>
      </div>

      {lastImportResult && (
        <Card className="p-4 space-y-2">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Last Import Result</div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="text-xs text-slate-700 dark:text-slate-200">Inserted: {lastImportResult.inserted ?? "â€”"}</div>
            <div className="text-xs text-slate-700 dark:text-slate-200">Skipped: {lastImportResult.skipped ?? "â€”"}</div>
            <div className="text-xs text-slate-700 dark:text-slate-200">
              Unmapped codes: {lastImportResult.unmapped_device_user_codes?.length ?? 0}
            </div>
          </div>
          {lastImportResult.unmapped_device_user_codes?.length ? (
            <div className="text-xs text-slate-600 dark:text-slate-300">
              {lastImportResult.unmapped_device_user_codes.slice(0, 20).join(", ")}
              {lastImportResult.unmapped_device_user_codes.length > 20 ? " â€¦" : ""}
            </div>
          ) : null}
        </Card>
      )}

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Daily Attendance</div>
        </div>

        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <FormField label="Start" type="date" value={start}
            min={company?.fiscal_year_start || ""}
            max={company?.fiscal_year_end || ""}
            onChange={(e) => setStart(e.target.value)}
      />
          <FormField label="End" type="date" value={end}
            min={company?.fiscal_year_start || ""}
            max={company?.fiscal_year_end || ""}
            onChange={(e) => setEnd(e.target.value)}
      />

          <div className="space-y-1 md:col-span-2">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Employee</label>
            <Select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} disabled={employeesLoading}>
              <option value="">All employees</option>
              {(employees || [])
                .slice()
                .sort((a: any, b: any) => String(a.full_name || "").localeCompare(String(b.full_name || "")))
                .map((e: any) => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name}
                  </option>
                ))}
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Status</label>
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All</option>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LEAVE">Leave</option>
              <option value="HOLIDAY">Holiday</option>
            </Select>
          </div>
        </div>

        {dailyError && <div className="text-xs text-critical-600">{getApiErrorMessage(dailyError)}</div>}

        <DataTable
          columns={columns}
          data={sortedDaily}
          getRowKey={(row) => `${row.employee_id}-${row.work_date}`}
          emptyMessage={dailyLoading ? "Loading..." : "No attendance found."}
      />
      </Card>

      <ConfirmDialog
        open={recomputeConfirmOpen}
        title="Recompute attendance?"
        description={
          selectedEmployeeId
            ? `This will recompute daily attendance for the selected employee from ${start} to ${end}.`
            : `This will recompute daily attendance for all employees from ${start} to ${end}.`
        }
        confirmLabel="Recompute"
        isConfirming={recompute.isPending}
        onCancel={() => {
          if (recompute.isPending) return;
          setRecomputeConfirmOpen(false);
        }}
        onConfirm={handleRecompute}
      />

      <Drawer
        open={fixDrawerOpen}
        onClose={closeFixDrawer}
        title="Manual Fix"
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {fixRow && (
            <div className="rounded-md border border-border-light dark:border-border-dark p-3 text-xs text-slate-700 dark:text-slate-200">
              <div className="font-medium text-slate-900 dark:text-slate-100">
                {fixRow.employee_name || employeeNameById.get(Number(fixRow.employee_id)) || ""}
              </div>
              <div className="text-[11px] text-slate-500">{fixRow.work_date}</div>
            </div>
          )}

          {fixSubmitError && <div className="text-xs text-critical-600">{fixSubmitError}</div>}

          <FormField
            label="First In"
            value={fixFirstIn}
            onChange={(e) => setFixFirstIn(e.target.value)}
            placeholder="HH:MM"
      />
          <FormField
            label="Last Out"
            value={fixLastOut}
            onChange={(e) => setFixLastOut(e.target.value)}
            placeholder="HH:MM"
      />
          <FormField
            label="Status"
            value={fixStatus}
            onChange={(e) => setFixStatus(e.target.value)}
            placeholder="e.g. PRESENT"
      />
          <FormField
            label="Reason"
            required
            value={fixReason}
            onChange={(e) => setFixReason(e.target.value)}
            placeholder="Why is this being changed?"
            error={fixFieldErrors.reason}
      />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" size="sm" variant="outline" onClick={closeFixDrawer} disabled={manualFix.isPending}>
              Cancel
            </Button>
            <Button type="button" size="sm" onClick={saveFix} isLoading={manualFix.isPending}>
              Save
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

