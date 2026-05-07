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
  useCreatePayStructure,
  useCreatePayStructureLine,
  useDeletePayStructure,
  useDeletePayStructureLine,
  useEmployees,
  usePayStructure,
  usePayStructures,
  usePayheads,
  useUpdatePayStructure,
  useUpdatePayStructureLine,
  usePreviewPayrollFormula,
} from "@/lib/payroll/queries";
import type {
  EmployeeRead,
  PayStructureCreate,
  PayStructureLineCreate,
  PayStructureLineRead,
  PayStructureRead,
  PayheadRead,
} from "@/lib/payroll/types";

export default function PayrollPayStructuresPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();

  const { data: employees, isLoading: employeesLoading } = useEmployees(companyId);
  const { data: payheads, isLoading: payheadsLoading } = usePayheads(companyId);

  const [employeeId, setEmployeeId] = React.useState<string>("");
  const [activeOnly, setActiveOnly] = React.useState<string>("true");
  const selectedEmployeeId = employeeId ? Number(employeeId) : undefined;

  const { data: structures, isLoading, error } = usePayStructures(companyId, {
    employee_id: selectedEmployeeId,
    is_active: activeOnly === "" ? undefined : activeOnly === "true",
  });

  const createStructure = useCreatePayStructure(companyId);
  const updateStructure = useUpdatePayStructure(companyId);
  const deleteStructure = useDeletePayStructure(companyId);

  const [structureDrawerOpen, setStructureDrawerOpen] = React.useState(false);
  const [editingStructure, setEditingStructure] = React.useState<PayStructureRead | null>(null);
  const [formEmployeeId, setFormEmployeeId] = React.useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = React.useState<string>(new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = React.useState<string>("");
  const [isActive, setIsActive] = React.useState<string>("true");
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [deleteConfirmOpen, setDeleteConfirmOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PayStructureRead | null>(null);

  const [linesDrawerOpen, setLinesDrawerOpen] = React.useState(false);
  const [linesStructureId, setLinesStructureId] = React.useState<number | null>(null);
  const { data: structureDetail, isLoading: structureDetailLoading } = usePayStructure(
    companyId,
    linesStructureId || 0
  );

  const createLine = useCreatePayStructureLine(companyId, linesStructureId || 0);
  const updateLine = useUpdatePayStructureLine(companyId, linesStructureId || 0);
  const deleteLine = useDeletePayStructureLine(companyId, linesStructureId || 0);
  const previewFormula = usePreviewPayrollFormula(companyId);

  const [editingLine, setEditingLine] = React.useState<PayStructureLineRead | null>(null);
  const [linePayheadId, setLinePayheadId] = React.useState<string>("");
  const [lineAmount, setLineAmount] = React.useState<string>("");
  const [lineRate, setLineRate] = React.useState<string>("");
  const [lineFormula, setLineFormula] = React.useState<string>("");
  const [formulaInsertToken, setFormulaInsertToken] = React.useState<string>("");
  const [lineSubmitError, setLineSubmitError] = React.useState<string | null>(null);
  const [lineFieldErrors, setLineFieldErrors] = React.useState<Record<string, string>>({});
  const [formulaPreviewAmount, setFormulaPreviewAmount] = React.useState<string>("");
  const [formulaPreviewError, setFormulaPreviewError] = React.useState<string | null>(null);

  const [lineDeleteConfirmOpen, setLineDeleteConfirmOpen] = React.useState(false);
  const [lineDeleteTarget, setLineDeleteTarget] = React.useState<PayStructureLineRead | null>(null);

  const employeeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employees || []).forEach((e: any) => map.set(Number(e.id), String(e.full_name || "")));
    return map;
  }, [employees]);

  const payheadById = React.useMemo(() => {
    const map = new Map<number, PayheadRead>();
    (payheads || []).forEach((p: any) => map.set(Number(p.id), p as PayheadRead));
    return map;
  }, [payheads]);

  const sortedStructures = React.useMemo(() => {
    const list = (structures || []) as PayStructureRead[];
    return list
      .slice()
      .sort((a, b) => String(b.effective_from || "").localeCompare(String(a.effective_from || "")));
  }, [structures]);

  const resetStructureForm = () => {
    setEditingStructure(null);
    setFormEmployeeId("");
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setEffectiveTo("");
    setIsActive("true");
    setSubmitError(null);
    setFieldErrors({});
  };

  const openCreateStructure = () => {
    resetStructureForm();
    if (employeeId) setFormEmployeeId(employeeId);
    setStructureDrawerOpen(true);
  };

  const openEditStructure = (s: PayStructureRead) => {
    setEditingStructure(s);
    setFormEmployeeId(String(s.employee_id));
    setEffectiveFrom(s.effective_from);
    setEffectiveTo(s.effective_to || "");
    setIsActive(String(!!s.is_active));
    setSubmitError(null);
    setFieldErrors({});
    setStructureDrawerOpen(true);
  };

  const closeStructureDrawer = () => {
    if (createStructure.isPending || updateStructure.isPending) return;
    setStructureDrawerOpen(false);
  };

  const validateStructure = (): boolean => {
    const next: Record<string, string> = {};
    if (!formEmployeeId) next.employee_id = "Select employee";
    if (!effectiveFrom) next.effective_from = "Effective from is required";
    if (effectiveTo && effectiveFrom && effectiveTo < effectiveFrom) next.effective_to = "Effective to cannot be before effective from";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveStructure = async () => {
    setSubmitError(null);
    setFieldErrors({});
    if (!validateStructure()) return;

    const payload: PayStructureCreate = {
      employee_id: Number(formEmployeeId),
      effective_from: effectiveFrom,
      effective_to: effectiveTo ? effectiveTo : null,
      is_active: isActive === "true",
    };

    try {
      if (editingStructure) {
        await updateStructure.mutateAsync({ structureId: editingStructure.id, payload });
        showToast({ title: "Pay structure updated", variant: "success" });
      } else {
        await createStructure.mutateAsync(payload);
        showToast({ title: "Pay structure created", variant: "success" });
      }
      setStructureDrawerOpen(false);
      resetStructureForm();
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

  const requestDeleteStructure = (s: PayStructureRead) => {
    setDeleteTarget(s);
    setDeleteConfirmOpen(true);
  };

  const performDeleteStructure = async () => {
    if (!deleteTarget) return;
    try {
      await deleteStructure.mutateAsync(deleteTarget.id);
      showToast({ title: "Pay structure deleted", variant: "success" });
      setDeleteConfirmOpen(false);
      setDeleteTarget(null);
    } catch (e) {
      showToast({ title: "Delete failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const toggleActive = async (s: PayStructureRead) => {
    try {
      await updateStructure.mutateAsync({ structureId: s.id, payload: { is_active: !s.is_active } });
      showToast({ title: "Pay structure updated", variant: "success" });
    } catch (e) {
      showToast({ title: "Update failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const openLines = (s: PayStructureRead) => {
    setLinesStructureId(s.id);
    setLinesDrawerOpen(true);
    setEditingLine(null);
    setLinePayheadId("");
    setLineAmount("");
    setLineRate("");
    setLineFormula("");
    setFormulaInsertToken("");
    setLineSubmitError(null);
    setLineFieldErrors({});
    setFormulaPreviewAmount("");
    setFormulaPreviewError(null);
  };

  const closeLinesDrawer = () => {
    if (createLine.isPending || updateLine.isPending || deleteLine.isPending) return;
    setLinesDrawerOpen(false);
    setLinesStructureId(null);
    setEditingLine(null);
  };

  const validateLine = (): boolean => {
    const next: Record<string, string> = {};
    if (!linePayheadId) next.payhead_id = "Select payhead";

    const hasAmount = lineAmount.trim() !== "";
    const hasRate = lineRate.trim() !== "";
    const hasFormula = lineFormula.trim() !== "";
    if (!hasAmount && !hasRate && !hasFormula) {
      next.amount = "Provide amount, rate or formula";
    }

    if (hasAmount && Number.isNaN(Number(lineAmount))) next.amount = "Amount must be a number";
    if (hasRate && Number.isNaN(Number(lineRate))) next.rate = "Rate must be a number";

    setLineFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const resetLineForm = () => {
    setEditingLine(null);
    setLinePayheadId("");
    setLineAmount("");
    setLineRate("");
    setLineFormula("");
    setLineSubmitError(null);
    setLineFieldErrors({});
    setFormulaPreviewAmount("");
    setFormulaPreviewError(null);
  };

  const openEditLine = (l: PayStructureLineRead) => {
    setEditingLine(l);
    setLinePayheadId(String(l.payhead_id));
    setLineAmount(l.amount != null ? String(l.amount) : "");
    setLineRate(l.rate != null ? String(l.rate) : "");
    setLineFormula(l.formula || "");
    setFormulaInsertToken("");
    setLineSubmitError(null);
    setLineFieldErrors({});
  };

  const saveLine = async () => {
    if (!linesStructureId) return;
    setLineSubmitError(null);
    setLineFieldErrors({});
    if (!validateLine()) return;

    const payload: PayStructureLineCreate = {
      payhead_id: Number(linePayheadId),
      amount: lineAmount.trim() === "" ? null : Number(lineAmount),
      rate: lineRate.trim() === "" ? null : Number(lineRate),
      formula: lineFormula.trim() ? lineFormula.trim() : null,
    };

    try {
      if (editingLine) {
        await updateLine.mutateAsync({ lineId: editingLine.id, payload });
        showToast({ title: "Line updated", variant: "success" });
      } else {
        await createLine.mutateAsync(payload);
        showToast({ title: "Line added", variant: "success" });
      }
      resetLineForm();
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
        setLineFieldErrors(next);
      } else {
        setLineSubmitError(getApiErrorMessage(e));
      }
    }
  };

  const doPreviewFormula = async () => {
    setFormulaPreviewAmount("");
    setFormulaPreviewError(null);
    const formulaText = lineFormula.trim();
    if (!formulaText) {
      setFormulaPreviewError("Enter formula to preview");
      return;
    }
    try {
      const structureEmployeeId = Number((structureDetail as any)?.employee_id || 0) || undefined;
      const res = await previewFormula.mutateAsync({
        formula: formulaText,
        employee_id: structureEmployeeId ?? selectedEmployeeId,
        structure_id: linesStructureId || undefined,
        payable_days: 30,
      });
      setFormulaPreviewAmount(String(res.amount ?? 0));
    } catch (e) {
      setFormulaPreviewError(getApiErrorMessage(e));
    }
  };

  const insertFormulaToken = () => {
    if (!formulaInsertToken) return;
    const next = lineFormula.trim()
      ? `${lineFormula.trim()} ${formulaInsertToken}`
      : formulaInsertToken;
    setLineFormula(next);
    setFormulaInsertToken("");
  };

  const requestDeleteLine = (l: PayStructureLineRead) => {
    setLineDeleteTarget(l);
    setLineDeleteConfirmOpen(true);
  };

  const performDeleteLine = async () => {
    if (!lineDeleteTarget) return;
    try {
      await deleteLine.mutateAsync(lineDeleteTarget.id);
      showToast({ title: "Line deleted", variant: "success" });
      setLineDeleteConfirmOpen(false);
      setLineDeleteTarget(null);
    } catch (e) {
      showToast({ title: "Delete failed", description: getApiErrorMessage(e), variant: "error" });
    }
  };

  const structuresColumns = React.useMemo((): DataTableColumn<PayStructureRead>[] => {
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
        id: "from",
        header: "From",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.effective_from}</span>,
      },
      {
        id: "to",
        header: "To",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.effective_to || ""}</span>,
      },
      {
        id: "active",
        header: "Active",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.is_active ? "Yes" : "No"}</span>,
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openLines(row)}>
              Lines
            </Button>
            <Button size="sm" variant="outline" onClick={() => openEditStructure(row)}>
              Edit
            </Button>
            <Button size="sm" variant="outline" onClick={() => toggleActive(row)} isLoading={updateStructure.isPending}>
              {row.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button size="sm" variant="danger" onClick={() => requestDeleteStructure(row)}>
              Delete
            </Button>
          </div>
        ),
      },
    ];
  }, [employeeNameById, updateStructure.isPending]);

  const lines = React.useMemo(() => {
    const l = (structureDetail as any)?.lines;
    if (!Array.isArray(l)) return [] as PayStructureLineRead[];
    return (l as PayStructureLineRead[]).slice().sort((a, b) => Number(a.payhead_id) - Number(b.payhead_id));
  }, [structureDetail]);

  const lineColumns = React.useMemo((): DataTableColumn<PayStructureLineRead>[] => {
    return [
      {
        id: "payhead",
        header: "Payhead",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{payheadById.get(Number(row.payhead_id))?.name || ""}</span>
        ),
      },
      {
        id: "amount",
        header: "Amount",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.amount ?? ""}</span>,
      },
      {
        id: "rate",
        header: "Rate",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.rate ?? ""}</span>,
      },
      {
        id: "formula",
        header: "Formula",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.formula || ""}</span>,
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={() => openEditLine(row)}>
              Edit
            </Button>
            <Button size="sm" variant="danger" onClick={() => requestDeleteLine(row)}>
              Delete
            </Button>
          </div>
        ),
      },
    ];
  }, [payheadById]);

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pay Structures"
        subtitle="View and manage per-employee pay structures. Use Designations → Pay Template to define shared templates applied automatically."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <Button size="sm" onClick={openCreateStructure}>
            Add Structure
          </Button>
        }
      />

      <div className="rounded-lg border border-brand-100 bg-brand-50/40 dark:border-slate-700 dark:bg-slate-800/40 px-4 py-3 text-xs text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-brand-700 dark:text-brand-300">Tip: </span>
        Pay structures are generated automatically when you assign a designation with a Pay Template to an employee.
        To set up templates, go to <strong>Designations → Pay Template</strong> and click <strong>Apply to All Employees</strong>.
        Manual structures created here override designation templates for that employee.
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
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

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Active</label>
            <Select value={activeOnly} onChange={(e) => setActiveOnly(e.target.value)}>
              <option value="true">Active only</option>
              <option value="false">Inactive only</option>
              <option value="">All</option>
            </Select>
          </div>
          <div className="md:col-span-1"
      />
        </div>

        {error && <div className="text-xs text-critical-600">{getApiErrorMessage(error)}</div>}

        <DataTable
          columns={structuresColumns}
          data={sortedStructures}
          getRowKey={(row) => row.id}
          emptyMessage={isLoading ? "Loading..." : "No pay structures found."}
      />
      </Card>

      <Drawer
        open={structureDrawerOpen}
        onClose={closeStructureDrawer}
        title={editingStructure ? "Edit Pay Structure" : "Add Pay Structure"}
        widthClassName="max-w-lg w-full"
      >
        <div className="space-y-3">
          {submitError && <div className="text-xs text-critical-600">{submitError}</div>}

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
              Employee
              <span className="ml-0.5 text-critical-500">*</span>
            </label>
            <Select value={formEmployeeId} onChange={(e) => setFormEmployeeId(e.target.value)} disabled={employeesLoading}>
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
            {fieldErrors.employee_id && (
              <div className="text-[11px] text-critical-600 dark:text-critical-400">{fieldErrors.employee_id}</div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              label="Effective From"
              type="date"
              required
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              error={fieldErrors.effective_from}
      />
            <FormField
              label="Effective To"
              type="date"
              value={effectiveTo}
              onChange={(e) => setEffectiveTo(e.target.value)}
              error={fieldErrors.effective_to}
      />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Active</label>
            <Select value={isActive} onChange={(e) => setIsActive(e.target.value)}>
              <option value="true">Yes</option>
              <option value="false">No</option>
            </Select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={closeStructureDrawer}
              disabled={createStructure.isPending || updateStructure.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={saveStructure}
              isLoading={createStructure.isPending || updateStructure.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Drawer>

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Delete pay structure?"
        description="This will delete the pay structure. This action cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteStructure.isPending}
        onCancel={() => {
          if (deleteStructure.isPending) return;
          setDeleteConfirmOpen(false);
          setDeleteTarget(null);
        }}
        onConfirm={performDeleteStructure}
      />

      <Drawer
        open={linesDrawerOpen}
        onClose={closeLinesDrawer}
        title="Pay Structure Lines"
        widthClassName="max-w-3xl w-full"
      >
        <div className="space-y-3">
          <div className="text-xs text-slate-500">
            {linesStructureId ? `Structure #${linesStructureId}` : ""}
          </div>

          <Card className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {editingLine ? "Edit Line" : "Add Line"}
              </div>
              {editingLine && (
                <Button size="sm" variant="outline" onClick={resetLineForm}>
                  Cancel Edit
                </Button>
              )}
            </div>

            {lineSubmitError && <div className="text-xs text-critical-600">{lineSubmitError}</div>}

            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="space-y-1 md:col-span-2">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                  Payhead
                  <span className="ml-0.5 text-critical-500">*</span>
                </label>
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
                {lineFieldErrors.payhead_id && (
                  <div className="text-[11px] text-critical-600 dark:text-critical-400">{lineFieldErrors.payhead_id}</div>
                )}
              </div>

              <FormField
                label="Amount"
                value={lineAmount}
                onChange={(e) => setLineAmount(e.target.value)}
                placeholder="e.g. 10000"
                error={lineFieldErrors.amount}
      />

              <FormField
                label="Rate"
                value={lineRate}
                onChange={(e) => setLineRate(e.target.value)}
                placeholder="e.g. 10"
                error={lineFieldErrors.rate}
      />
            </div>

            <FormField
              label="Formula"
              value={lineFormula}
              onChange={(e) => setLineFormula(e.target.value)}
              placeholder="e.g. BASIC * 0.1"
              error={lineFieldErrors.formula}
      />
            <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
              <div className="space-y-1 md:col-span-3">
                <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Insert Variable</label>
                <Select value={formulaInsertToken} onChange={(e) => setFormulaInsertToken(e.target.value)}>
                  <option value="">Choose variable</option>
                  <option value="BASIC">BASIC</option>
                  <option value="GRADE">GRADE</option>
                  <option value="PAYABLE_DAYS">PAYABLE_DAYS</option>
                  <option value="ABSENT_DAYS">ABSENT_DAYS</option>
                  <option value="WORKED_HOURS">WORKED_HOURS</option>
                  <option value="WORKED_MINUTES">WORKED_MINUTES</option>
                  <option value="LATE_MINUTES">LATE_MINUTES</option>
                  <option value="OVERTIME_MINUTES">OVERTIME_MINUTES</option>
                  <option value="BASE_MONTHLY_SALARY">BASE_MONTHLY_SALARY</option>
                  <option value="BASE_DAILY_WAGE">BASE_DAILY_WAGE</option>
                  <option value="BASE_HOURLY_RATE">BASE_HOURLY_RATE</option>
                  <option value="PER_DAY_RATE">PER_DAY_RATE</option>
                  <option value="PER_MINUTE_RATE">PER_MINUTE_RATE</option>
                  <option value="DAYS_IN_PERIOD">DAYS_IN_PERIOD</option>
                  <option value="EARNINGS_SO_FAR">EARNINGS_SO_FAR</option>
                  <option value="DEDUCTIONS_SO_FAR">DEDUCTIONS_SO_FAR</option>
                  <option value="NET_SO_FAR">NET_SO_FAR</option>
                  <option value="PH_">PH_&lt;payhead_id&gt;</option>
                </Select>
              </div>
              <div className="flex items-end">
                <Button size="sm" variant="outline" onClick={insertFormulaToken} disabled={!formulaInsertToken}>
                  Insert
                </Button>
              </div>
            </div>
            <div className="rounded border border-border-light dark:border-border-dark px-2 py-2 text-[11px] text-slate-600 dark:text-slate-300">
              Variables: BASIC, GRADE, PH_12, PAYABLE_DAYS, WORKED_HOURS, BASE_MONTHLY_SALARY.
            </div>
            {formulaPreviewError && <div className="text-[11px] text-critical-600 dark:text-critical-400">{formulaPreviewError}</div>}
            {formulaPreviewAmount !== "" && (
              <div className="text-[11px] text-emerald-700 dark:text-emerald-400">
                Preview amount: {formulaPreviewAmount}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={doPreviewFormula}
                isLoading={previewFormula.isPending}
                disabled={!lineFormula.trim()}
              >
                Preview Formula
              </Button>
              <Button
                size="sm"
                onClick={saveLine}
                isLoading={createLine.isPending || updateLine.isPending}
                disabled={!linesStructureId}
              >
                {editingLine ? "Save Line" : "Add Line"}
              </Button>
            </div>
          </Card>

          <Card className="p-3 space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-200">Lines</div>
            <DataTable
              columns={lineColumns}
              data={lines}
              getRowKey={(row) => row.id}
              emptyMessage={structureDetailLoading ? "Loading..." : "No lines found."}
      />
          </Card>
        </div>
      </Drawer>

      <ConfirmDialog
        open={lineDeleteConfirmOpen}
        title="Delete line?"
        description="This will delete the pay structure line. This action cannot be undone."
        confirmLabel="Delete"
        isConfirming={deleteLine.isPending}
        onCancel={() => {
          if (deleteLine.isPending) return;
          setLineDeleteConfirmOpen(false);
          setLineDeleteTarget(null);
        }}
        onConfirm={performDeleteLine}
      />
    </div>
  );
}

