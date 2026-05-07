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
import { SalarySheetPreviewModal } from "./SalarySheetPreviewModal";
import {
  useApprovePayrollRun,
  useComputePayrollRun,
  useCreatePayrollRun,
  useEmployees,
  useExportPayslipJson,
  useOverridePayslip,
  usePayheads,
  usePayrollRuns,
  usePayslips,
  usePostPayrollVoucher,
  useUnlockPayrollRun,
  useDownloadSalaryTemplateExcel,
  useUploadSalaryExcel,
} from "@/lib/payroll/queries";
import type {
  PayheadRead,
  PayrollRunCreate,
  PayrollRunRead,
  PayslipOverrideLine,
  PayslipOverrideRequest,
  PayslipSummary,
} from "@/lib/payroll/types";

export default function PayrollRunsPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();

  const { data: runs, isLoading: runsLoading, error: runsError } = usePayrollRuns(companyId);
  const createRun = useCreatePayrollRun(companyId);
  const computeRun = useComputePayrollRun(companyId);
  const approveRun = useApprovePayrollRun(companyId);
  const unlockRun = useUnlockPayrollRun(companyId);
  const postVoucher = usePostPayrollVoucher(companyId);

  const { data: employees } = useEmployees(companyId);
  const { data: payheads, isLoading: payheadsLoading } = usePayheads(companyId);

  const [createOpen, setCreateOpen] = React.useState(false);
  const now = React.useMemo(() => new Date(), []);
  const [year, setYear] = React.useState<number>(now.getFullYear());
  const [month, setMonth] = React.useState<number>(now.getMonth() + 1);
  const [createError, setCreateError] = React.useState<string | null>(null);

  const [selectedRun, setSelectedRun] = React.useState<PayrollRunRead | null>(null);
  const [runDrawerOpen, setRunDrawerOpen] = React.useState(false);
  const runId = selectedRun?.id || 0;

  const { data: payslips, isLoading: payslipsLoading, error: payslipsError } = usePayslips(companyId, runId);

  const overridePayslip = useOverridePayslip(companyId, runId);
  const exportJson = useExportPayslipJson(companyId, runId);
  
  const downloadTemplate = useDownloadSalaryTemplateExcel(companyId, runId);
  const uploadExcel = useUploadSalaryExcel(companyId, runId);

  const [actionConfirmOpen, setActionConfirmOpen] = React.useState(false);
  const [unlockReason, setUnlockReason] = React.useState("");
  const [previewModalOpen, setPreviewModalOpen] = React.useState(false);
  const [actionMode, setActionMode] = React.useState<"COMPUTE" | "APPROVE" | "UNLOCK" | "POST">("COMPUTE");
  const [postDate, setPostDate] = React.useState<string>(new Date().toISOString().split("T")[0]);

  const [overrideDrawerOpen, setOverrideDrawerOpen] = React.useState(false);
  const [overrideTarget, setOverrideTarget] = React.useState<PayslipSummary | null>(null);
  const [overrideReason, setOverrideReason] = React.useState<string>("");
  const [overridePayableDays, setOverridePayableDays] = React.useState<string>("");
  const [overrideAbsentDays, setOverrideAbsentDays] = React.useState<string>("");
  const [overrideLate, setOverrideLate] = React.useState<string>("");
  const [overrideOt, setOverrideOt] = React.useState<string>("");
  const [overrideLines, setOverrideLines] = React.useState<PayslipOverrideLine[]>([]);
  const [linePayheadId, setLinePayheadId] = React.useState<string>("");
  const [lineAmount, setLineAmount] = React.useState<string>("");
  const [overrideError, setOverrideError] = React.useState<string | null>(null);

  const [exportDrawerOpen, setExportDrawerOpen] = React.useState(false);
  const [exportEmployee, setExportEmployee] = React.useState<PayslipSummary | null>(null);
  const [exportJsonText, setExportJsonText] = React.useState<string>("");
  const [exportError, setExportError] = React.useState<string | null>(null);

  // Payslip detail drawer
  const [viewDrawerOpen, setViewDrawerOpen] = React.useState(false);
  const [viewEmployee, setViewEmployee] = React.useState<PayslipSummary | null>(null);
  const [viewPayslipData, setViewPayslipData] = React.useState<any | null>(null);
  const [viewLoading, setViewLoading] = React.useState(false);
  const [viewError, setViewError] = React.useState<string | null>(null);

  const employeeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), String(e.full_name || "")));
    return map;
  }, [employees]);

  const employeeDataById = React.useMemo(() => {
    const map = new Map<number, any>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), e));
    return map;
  }, [employees]);

  const payheadById = React.useMemo(() => {
    const map = new Map<number, PayheadRead>();
    (payheads || []).forEach((p: any) => map.set(Number(p.id), p as PayheadRead));
    return map;
  }, [payheads]);

  const openCreate = () => {
    setCreateError(null);
    setYear(now.getFullYear());
    setMonth(now.getMonth() + 1);
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (createRun.isPending) return;
    setCreateOpen(false);
  };

  const saveCreate = async () => {
    setCreateError(null);
    if (!year || year < 2000) {
      setCreateError("Enter a valid year");
      return;
    }
    if (!month || month < 1 || month > 12) {
      setCreateError("Enter a valid month (1-12)");
      return;
    }
    const payload: PayrollRunCreate = { period_year: year, period_month: month };

    try {
      const run = await createRun.mutateAsync(payload);
      showToast({ title: "Payroll run created", variant: "success" });
      setCreateOpen(false);
      setSelectedRun(run);
      setRunDrawerOpen(true);
    } catch (e) {
      setCreateError(getApiErrorMessage(e));
    }
  };

  const openRun = (run: PayrollRunRead) => {
    setSelectedRun(run);
    setRunDrawerOpen(true);
  };

  const closeRun = () => {
    if (computeRun.isPending || approveRun.isPending || unlockRun.isPending || postVoucher.isPending) return;
    setRunDrawerOpen(false);
  };

  const requestAction = (mode: "COMPUTE" | "APPROVE" | "UNLOCK" | "POST") => {
    setActionMode(mode);
    if (mode === "UNLOCK") setUnlockReason("");
    if (mode === "POST") setPostDate(new Date().toISOString().split("T")[0]);
    setActionConfirmOpen(true);
  };

  const confirmAction = async () => {
    if (!selectedRun) return;
    try {
      if (actionMode === "POST") {
        const todayStr = new Date().toISOString().split("T")[0];
        if (postDate < todayStr) {
          if (typeof window !== "undefined") {
            const ok = window.confirm(
              `The voucher post date (${postDate}) is a back date (before today, ${todayStr}). Do you want to proceed?`
            );
            if (!ok) return;
          }
        }
      }

      if (actionMode === "COMPUTE") {
        const result = await computeRun.mutateAsync({ runId: selectedRun.id });
        setSelectedRun((prev) => (prev ? { ...prev, status: result.status } : prev));
        showToast({ title: "Run computed", variant: "success" });
      } else if (actionMode === "APPROVE") {
        const run = await approveRun.mutateAsync(selectedRun.id);
        setSelectedRun(run);
        showToast({ title: "Run approved", variant: "success" });
      } else if (actionMode === "UNLOCK") {
        if (!unlockReason.trim()) {
          showToast({ title: "Unlock reason required", variant: "error" });
          return;
        }
        const run = await unlockRun.mutateAsync({ runId: selectedRun.id, reason: unlockReason });
        setSelectedRun(run);
        showToast({ title: "Run unlocked", variant: "success" });
      } else if (actionMode === "POST") {
        const run = await postVoucher.mutateAsync({ runId: selectedRun.id, post_date: postDate });
        setSelectedRun(run);
        showToast({ title: "Voucher posted", variant: "success" });
      }
      setActionConfirmOpen(false);
    } catch (e) {
      showToast({ title: "Action failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const openOverride = (p: PayslipSummary) => {
    setOverrideTarget(p);
    setOverrideReason("");
    setOverridePayableDays(p.payable_days != null ? String(p.payable_days) : "");
    setOverrideAbsentDays("");
    setOverrideLate(p.late_minutes != null ? String(p.late_minutes) : "");
    setOverrideOt(p.overtime_minutes != null ? String(p.overtime_minutes) : "");
    setOverrideLines([]);
    setLinePayheadId("");
    setLineAmount("");
    setOverrideError(null);
    setOverrideDrawerOpen(true);
  };

  const closeOverride = () => {
    if (overridePayslip.isPending) return;
    setOverrideDrawerOpen(false);
  };

  const addOverrideLine = () => {
    if (!linePayheadId) return;
    const amt = Number(lineAmount);
    if (Number.isNaN(amt)) return;
    const pid = Number(linePayheadId);
    setOverrideLines((prev) => {
      const next = prev.filter((l) => l.payhead_id !== pid);
      next.push({ payhead_id: pid, amount: amt });
      return next;
    });
    setLinePayheadId("");
    setLineAmount("");
  };

  const removeOverrideLine = (payheadId: number) => {
    setOverrideLines((prev) => prev.filter((l) => l.payhead_id !== payheadId));
  };

  const saveOverride = async () => {
    if (!overrideTarget) return;
    setOverrideError(null);
    if (!overrideReason.trim()) {
      setOverrideError("Override reason is required");
      return;
    }

    const payload: PayslipOverrideRequest = {
      payable_days: overridePayableDays.trim() === "" ? null : Number(overridePayableDays),
      absent_days: overrideAbsentDays.trim() === "" ? null : Number(overrideAbsentDays),
      late_minutes: overrideLate.trim() === "" ? null : Number(overrideLate),
      overtime_minutes: overrideOt.trim() === "" ? null : Number(overrideOt),
      override_reason: overrideReason.trim(),
      lines: overrideLines,
    };

    try {
      await overridePayslip.mutateAsync({ employeeId: overrideTarget.employee_id, payload });
      showToast({ title: "Payslip overridden", variant: "success" });
      setOverrideDrawerOpen(false);
    } catch (e) {
      setOverrideError(getApiErrorMessage(e));
    }
  };

  const doExport = React.useCallback(
    async (p: PayslipSummary) => {
      setExportEmployee(p);
      setExportError(null);
      setExportJsonText("Loading...");
      setExportDrawerOpen(true);
      try {
        const data = await exportJson.mutateAsync(p.employee_id);
        setExportJsonText(JSON.stringify(data, null, 2));
      } catch (e) {
        setExportError(getApiErrorMessage(e));
        setExportJsonText("");
      }
    },
    [exportJson]
  );

  const openView = React.useCallback(
    async (p: PayslipSummary) => {
      setViewEmployee(p);
      setViewPayslipData(null);
      setViewError(null);
      setViewLoading(true);
      setViewDrawerOpen(true);
      try {
        const data = await exportJson.mutateAsync(p.employee_id);
        setViewPayslipData(data);
      } catch (e) {
        setViewError(getApiErrorMessage(e));
      } finally {
        setViewLoading(false);
      }
    },
    [exportJson]
  );

  const handleDownloadTemplate = async () => {
    try {
      const blob = await downloadTemplate.mutateAsync();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salary_template_${selectedRun?.period_year}_${selectedRun?.period_month}.xlsx`;
      a.click();
      window.URL.revokeObjectURL(url);
      showToast({ title: "Template downloaded", variant: "success" });
    } catch (e) {
      showToast({ title: "Failed to download template", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadExcel.mutateAsync(file);
      showToast({ title: "Salary uploaded successfully", variant: "success" });
    } catch (err) {
      showToast({ title: "Upload failed", description: getApiErrorMessage(err), variant: "error" });
    } finally {
      e.target.value = "";
    }
  };

  const sortedRuns = React.useMemo(() => {
    const list = (runs || []) as PayrollRunRead[];
    return list
      .slice()
      .sort((a, b) => (b.period_year - a.period_year) || (b.period_month - a.period_month) || (b.id - a.id));

  }, [runs]);

  const isRunLocked = !!selectedRun?.locked;
  const canCompute = !!selectedRun && !isRunLocked && (selectedRun.status === "DRAFT" || selectedRun.status === "COMPUTED");
  const canApprove = !!selectedRun && !isRunLocked && selectedRun.status === "COMPUTED";
  const canPost = !!selectedRun && !isRunLocked && selectedRun.status === "APPROVED";
  const canUnlock = !!selectedRun && isRunLocked;

  const canMutatePayslips = !!selectedRun && !isRunLocked && selectedRun.status !== "POSTED";

  const runColumns = React.useMemo((): DataTableColumn<PayrollRunRead>[] => {
    return [
      {
        id: "period",
        header: "Period",
        accessor: (row) => (
          <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
            {row.period_year}-{String(row.period_month).padStart(2, "0")}

          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.status}</span>,
      },
      {
        id: "locked",
        header: "Locked",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.locked ? "Yes" : "No"}</span>,
      },
      {
        id: "voucher",
        header: "Voucher",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{row.voucher_number || ""}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <Button size="sm" variant="outline" onClick={() => openRun(row)}>
            Open
          </Button>
        ),
      },
    ];
  }, []);

  const payslipColumns = React.useMemo((): DataTableColumn<PayslipSummary>[] => {
    return [
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
        id: "net",
        header: "Net",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.net_pay ?? ""}</span>,
      },
      {
        id: "earn",
        header: "Earnings",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.earnings_total ?? ""}</span>,
      },
      {
        id: "ded",
        header: "Deductions",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.deductions_total ?? ""}</span>,
      },
      {
        id: "days",
        header: "Payable Days",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.payable_days ?? ""}</span>,
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => openView(row)}>
              View
            </Button>
            <Button size="sm" variant="outline" onClick={() => openOverride(row)} disabled={isRunLocked || selectedRun?.status === "POSTED"}>
              Override
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => doExport(row)}
              isLoading={exportJson.isPending}
              disabled={isRunLocked || selectedRun?.status === "POSTED"}
            >
              Export JSON
            </Button>
          </div>
        ),
      },
    ];
  }, [employeeNameById, doExport, openView, exportJson.isPending, isRunLocked, selectedRun?.status]);

  const copyExportJson = async () => {
    if (!exportJsonText) return;
    try {
      await navigator.clipboard.writeText(exportJsonText);
      showToast({ title: "Copied", variant: "success" });
    } catch (e) {
      showToast({ title: "Copy failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const downloadExportJson = () => {
    if (!exportJsonText) return;
    const empName = exportEmployee?.employee_name || (exportEmployee ? employeeNameById.get(exportEmployee.employee_id) : "");
    const fileName = `payslip_${selectedRun?.period_year || ""}-${String(selectedRun?.period_month || "").padStart(2, "0")}_${String(empName || exportEmployee?.employee_id || "employee")}.json`

      .replace(/\s+/g, "_")
      .replace(/[^a-zA-Z0-9_.-]/g, "");
    const blob = new Blob([exportJsonText], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const printExportJson = () => {
    if (!exportJsonText) return;
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    const safe = exportJsonText.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    w.document.open();
    w.document.write(`<!doctype html><html><head><title>Payslip JSON</title></head><body><pre style="white-space:pre-wrap;font-family:ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;font-size:12px;">${safe}</pre></body></html>`);
    w.document.close();
    w.focus();
    w.print();
  };

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payroll Runs"
        subtitle="Create, compute, approve, unlock, and post payroll vouchers."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <Button size="sm" onClick={openCreate}>
            Create Run
          </Button>
        }
      />

      <Card className="p-4 space-y-3">
        {runsError && <div className="text-xs text-critical-600">{getApiErrorMessage(runsError)}</div>}
        <DataTable
          columns={runColumns}
          data={sortedRuns}
          getRowKey={(row) => row.id}
          emptyMessage={runsLoading ? "Loading..." : "No payroll runs found."}
      />
      </Card>

      <Drawer open={createOpen} onClose={closeCreate} title="Create Payroll Run" widthClassName="max-w-md w-full">
        <div className="space-y-3">
          {createError && <div className="text-xs text-critical-600">{createError}</div>}
          <FormField
            label="Year"
            type="number"
            value={String(year)}
            onChange={(e) => setYear(Number(e.target.value))}
      />
          <FormField
            label="Month"
            type="number"
            value={String(month)}
            onChange={(e) => setMonth(Number(e.target.value))}
      />
          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={closeCreate} disabled={createRun.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveCreate} isLoading={createRun.isPending}>
              Create
            </Button>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={runDrawerOpen}
        onClose={closeRun}
        title={selectedRun ? `Run ${selectedRun.period_year}-${String(selectedRun.period_month).padStart(2, "0")}` : "Run"}

        widthClassName="max-w-5xl w-full"
      >
        {!selectedRun ? null : (
          <div className="space-y-3">
            <Card className="p-3 space-y-2">
              <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  <span className="text-slate-500">Status:</span> {selectedRun.status}
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  <span className="text-slate-500">Locked:</span> {selectedRun.locked ? "Yes" : "No"}
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  <span className="text-slate-500">Voucher:</span> {selectedRun.voucher_number || ""}
                </div>
                <div className="text-xs text-slate-700 dark:text-slate-200">
                  <span className="text-slate-500">Run ID:</span> {selectedRun.id}
                </div>
                {selectedRun.computed_at && (
                  <div className="text-xs text-slate-700 dark:text-slate-200">
                    <span className="text-slate-500">Computed At:</span> {new Date(selectedRun.computed_at).toLocaleString()}
                  </div>
                )}
                {selectedRun.approved_at && (
                  <div className="text-xs text-slate-700 dark:text-slate-200">
                    <span className="text-slate-500">Approved At:</span> {new Date(selectedRun.approved_at).toLocaleString()}
                  </div>
                )}
                {selectedRun.posted_at && (
                  <div className="text-xs text-slate-700 dark:text-slate-200">
                    <span className="text-slate-500">Posted At:</span> {new Date(selectedRun.posted_at).toLocaleString()}
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => requestAction("COMPUTE")} disabled={!canCompute}>
                  Compute
                </Button>
                <Button size="sm" variant="outline" onClick={handleDownloadTemplate} isLoading={downloadTemplate.isPending}>
                  Download Excel
                </Button>
                <Button size="sm" variant="outline" onClick={() => setPreviewModalOpen(true)} disabled={!canCompute}>
                  Preview Sheet
                </Button>
                <div className="relative">
                  <Button size="sm" variant="outline" disabled={!canCompute || uploadExcel.isPending} isLoading={uploadExcel.isPending} onClick={() => document.getElementById('salary-upload')?.click()}>
                    Upload Excel
                  </Button>
                  <input
                    id="salary-upload"
                    type="file"
                    accept=".xlsx"
                    className="hidden"
                    disabled={!canCompute || uploadExcel.isPending}
                    onChange={handleUploadExcel}
                  />
                </div>
                <Button size="sm" onClick={() => requestAction("APPROVE")} disabled={!canApprove}>
                  Approve
                </Button>
                <Button size="sm" onClick={() => requestAction("POST")} disabled={!canPost}>
                  Post Voucher
                </Button>
                <Button size="sm" variant="outline" onClick={() => requestAction("UNLOCK")} disabled={!canUnlock}>
                  Unlock
                </Button>
              </div>
            </Card>

            {payslipsError && <div className="text-xs text-critical-600">{getApiErrorMessage(payslipsError)}</div>}
            <Card className="p-3 space-y-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Payslips</div>
              <DataTable
                columns={payslipColumns}
                data={(payslips || []) as PayslipSummary[]}
                getRowKey={(row) => row.employee_id}
                emptyMessage={payslipsLoading ? "Loading..." : "No payslips."}
      />
            </Card>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={actionConfirmOpen}
        title={
          actionMode === "COMPUTE"
            ? "Compute payroll run?"
            : actionMode === "APPROVE"
              ? "Approve payroll run?"
              : actionMode === "POST"
                ? "Post voucher?"
                : "Unlock payroll run?"
        }
        description={
          actionMode === "COMPUTE"
            ? "This will compute payslips for this run."
            : actionMode === "APPROVE"
              ? "This will approve the computed payroll run."
              : actionMode === "POST"
                ? "This will post an accounting voucher for the payroll run."
                : "This will unlock the run so it can be modified again."
        }
        confirmLabel={actionMode === "POST" ? "Post" : actionMode === "UNLOCK" ? "Unlock" : "Confirm"}
        isConfirming={computeRun.isPending || approveRun.isPending || unlockRun.isPending || postVoucher.isPending}
        onCancel={() => {
          if (computeRun.isPending || approveRun.isPending || unlockRun.isPending || postVoucher.isPending) return;
          setActionConfirmOpen(false);
        }}
        onConfirm={confirmAction}
      >
        {actionMode === "UNLOCK" && (
          <FormField
            label="Reason for unlocking"
            required
            value={unlockReason}
            onChange={(e) => setUnlockReason(e.target.value)}
            placeholder="Please specify why you are unlocking this run..."
          />
        )}
        {actionMode === "POST" && (
          <FormField
            label="Post Date"
            type="date"
            required
            value={postDate}
            onChange={(e) => setPostDate(e.target.value)}
          />
        )}
      </ConfirmDialog>

      <Drawer
        open={overrideDrawerOpen}
        onClose={closeOverride}
        title={overrideTarget ? `Override: ${overrideTarget.employee_name || employeeNameById.get(overrideTarget.employee_id) || ""}` : "Override"}
        widthClassName="max-w-2xl w-full"
      >
        <div className="space-y-3">
          {!canMutatePayslips && (
            <div className="text-xs text-warning-600">
              Payslips are locked for this run (locked or posted). Unlock the run to override.
            </div>
          )}
          {overrideError && <div className="text-xs text-critical-600">{overrideError}</div>}

          <FormField
            label="Override Reason"
            required
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Why are you overriding this payslip?"
      />

          <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
            <FormField label="Payable Days" value={overridePayableDays} onChange={(e) => setOverridePayableDays(e.target.value)}
      />
            <FormField label="Absent Days" value={overrideAbsentDays} onChange={(e) => setOverrideAbsentDays(e.target.value)}
      />
            <FormField label="Late Minutes" value={overrideLate} onChange={(e) => setOverrideLate(e.target.value)}
      />
            <FormField label="OT Minutes" value={overrideOt} onChange={(e) => setOverrideOt(e.target.value)}
      />
          </div>

          <Card className="p-3 space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Override Lines</div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Payhead</label>
                <Select value={linePayheadId} onChange={(e) => setLinePayheadId(e.target.value)} disabled={payheadsLoading}>
                  <option value="">Select payhead</option>
                  {(payheads || [])
                    .slice()
                    .sort((a: any, b: any) => String(a.name || "").localeCompare(String(b.name || "")))
                    .map((p: PayheadRead) => (
                      <option key={p.id} value={String(p.id)}>
                        {p.name}
                      </option>
                    ))}
                </Select>
              </div>
              <FormField label="Amount" value={lineAmount} onChange={(e) => setLineAmount(e.target.value)}
      />
            </div>
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={addOverrideLine} disabled={!linePayheadId || !lineAmount}>
                Add/Replace Line
              </Button>
            </div>

            {overrideLines.length ? (
              <div className="space-y-1">
                {overrideLines
                  .slice()
                  .sort((a, b) => a.payhead_id - b.payhead_id)
                  .map((l) => (
                    <div key={l.payhead_id} className="flex items-center justify-between rounded border border-border-light dark:border-border-dark px-2 py-1">
                      <div className="text-xs text-slate-700 dark:text-slate-200">
                        {payheadById.get(l.payhead_id)?.name || `Payhead #${l.payhead_id}`} â€” {l.amount}
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeOverrideLine(l.payhead_id)}>
                        Remove
                      </Button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-xs text-slate-500">No override lines added.</div>
            )}
          </Card>

          <div className="flex justify-end gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={closeOverride} disabled={overridePayslip.isPending}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveOverride} isLoading={overridePayslip.isPending} disabled={!canMutatePayslips}>
              Save Override
            </Button>
          </div>
        </div>
      </Drawer>

      <Drawer
        open={exportDrawerOpen}
        onClose={() => {
          if (exportJson.isPending) return;
          setExportDrawerOpen(false);
          setExportEmployee(null);
          setExportError(null);
          setExportJsonText("");
        }}
        title={exportEmployee ? `Payslip JSON: ${exportEmployee.employee_name || employeeNameById.get(exportEmployee.employee_id) || ""}` : "Payslip JSON"}
        widthClassName="max-w-4xl w-full"
      >
        <div className="space-y-2">
          {exportError && <div className="text-xs text-critical-600">{exportError}</div>}
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="outline" onClick={copyExportJson} disabled={!exportJsonText || exportJsonText === "Loading..."}>
              Copy
            </Button>
            <Button size="sm" variant="outline" onClick={downloadExportJson} disabled={!exportJsonText || exportJsonText === "Loading..."}>
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={printExportJson} disabled={!exportJsonText || exportJsonText === "Loading..."}>
              Print
            </Button>
          </div>
          <textarea
            value={exportJsonText}
            readOnly
            rows={18}
            className="w-full rounded-md border border-border-light dark:border-border-dark bg-white dark:bg-slate-900 px-3 py-2 font-mono text-[11px] text-slate-900 dark:text-slate-100"
      />
        </div>
      </Drawer>
      <SalarySheetPreviewModal
        companyId={companyId}
        runId={selectedRun?.id}
        open={previewModalOpen}
        onClose={() => setPreviewModalOpen(false)}
      />

      {/* Payslip detail drawer */}
      <Drawer
        open={viewDrawerOpen}
        onClose={() => { setViewDrawerOpen(false); setViewPayslipData(null); setViewEmployee(null); }}
        title={viewEmployee ? `Payslip — ${viewEmployee.employee_name || employeeNameById.get(viewEmployee.employee_id) || "Employee"}` : "Payslip"}
        widthClassName="max-w-lg w-full"
      >
        {viewLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {viewError && <p className="text-sm text-red-500 p-4">{viewError}</p>}
        {!viewLoading && !viewError && viewPayslipData && (() => {
          const slip = viewPayslipData.payslip;
          const empData = viewEmployee ? employeeDataById.get(Number(viewEmployee.employee_id)) : null;
          const earnings: { name: string; amount: number }[] = [];
          const deductions: { name: string; amount: number }[] = [];
          (slip?.lines ?? []).forEach((line: any) => {
            const ph = payheadById.get(Number(line.payhead_id));
            const name = ph?.name ?? `Payhead #${line.payhead_id}`;
            const amt = Number(line.amount ?? 0);
            if (line.type === "EARNING") earnings.push({ name, amount: amt });
            else deductions.push({ name, amount: amt });
          });
          const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          return (
            <div className="p-4 space-y-5">
              {/* Employee info strip */}
              {empData && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 px-4 py-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {empData.designation?.name && (
                    <span className="text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Designation: </span>
                      {empData.designation.name}
                    </span>
                  )}
                  {empData.grade_number != null && (
                    <span className="text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-200">Grade No.: </span>
                      {empData.grade_number}
                      {empData.grade ? <span className="ml-1 text-slate-400">({empData.grade})</span> : null}
                    </span>
                  )}
                </div>
              )}
              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Payable Days", value: slip?.payable_days ?? "—" },
                  { label: "Absent Days", value: slip?.absent_days ?? "—" },
                  { label: "Late Minutes", value: slip?.late_minutes ?? "—" },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-center">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{value}</p>
                  </div>
                ))}
              </div>

              {/* Earnings */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">Earnings</p>
                {earnings.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No earnings</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {earnings.map(({ name, amount }) => (
                      <div key={name} className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900">
                        <span className="text-sm text-slate-700 dark:text-slate-200">{name}</span>
                        <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{fmt(amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2 bg-emerald-50 dark:bg-emerald-900/20">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total Earnings</span>
                      <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">{fmt(Number(slip?.earnings_total ?? 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Deductions */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-red-500 dark:text-red-400 mb-2">Deductions</p>
                {deductions.length === 0 ? (
                  <p className="text-xs text-slate-400 italic">No deductions</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    {deductions.map(({ name, amount }) => (
                      <div key={name} className="flex items-center justify-between px-4 py-2 bg-white dark:bg-slate-900">
                        <span className="text-sm text-slate-700 dark:text-slate-200">{name}</span>
                        <span className="text-sm font-medium text-red-600 dark:text-red-400">{fmt(amount)}</span>
                      </div>
                    ))}
                    <div className="flex items-center justify-between px-4 py-2 bg-red-50 dark:bg-red-900/20">
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Total Deductions</span>
                      <span className="text-sm font-bold text-red-600 dark:text-red-400">{fmt(Number(slip?.deductions_total ?? 0))}</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Net Pay */}
              <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-brand-50 dark:bg-brand-900/20 border border-brand-200 dark:border-brand-700">
                <span className="text-base font-bold text-slate-800 dark:text-slate-100">Net Pay</span>
                <span className="text-xl font-bold text-brand-700 dark:text-brand-300">{fmt(Number(slip?.net_pay ?? 0))}</span>
              </div>

              {slip?.is_manual_override && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400 italic">
                  ⚠ This payslip was manually overridden{slip.override_reason ? `: ${slip.override_reason}` : ""}
                </p>
              )}
            </div>
          );
        })()}
      </Drawer>
    </div>
  );
}

