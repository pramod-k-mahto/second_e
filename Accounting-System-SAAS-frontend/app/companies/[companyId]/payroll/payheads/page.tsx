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
import { SearchableSelect } from "@/components/ui/SearchableSelect";
import { useToast } from "@/components/ui/Toast";
import { api, getApiErrorMessage } from "@/lib/api";
import { useCreatePayhead, usePayheads, useUpdatePayhead } from "@/lib/payroll/queries";
import type {
  PayheadCalculationBasis,
  PayheadCostCenterOption,
  PayheadCreate,
  PayheadRead,
  PayheadType,
} from "@/lib/payroll/types";
import type { Ledger } from "@/types/ledger";

const CALC_BASIS_OPTIONS: PayheadCalculationBasis[] = ["FIXED", "PER_DAY", "PER_HOUR", "PERCENTAGE", "FORMULA"];
const COST_CENTER_OPTIONS: PayheadCostCenterOption[] = [
  "NONE",
  "DEPARTMENT",
  "PROJECT",
  "SEGMENT",
  "DEPARTMENT_PROJECT",
  "DEPARTMENT_PROJECT_SEGMENT",
];

export default function PayrollPayheadsPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();
  const { data: payheads, isLoading, error } = usePayheads(companyId);
  const createPayhead = useCreatePayhead(companyId);
  const updatePayhead = useUpdatePayhead(companyId);

  const [typeFilter, setTypeFilter] = React.useState<"ALL" | PayheadType>("ALL");
  const [q, setQ] = React.useState("");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PayheadRead | null>(null);

  const [code, setCode] = React.useState("");
  const [name, setName] = React.useState("");
  const [payheadType, setPayheadType] = React.useState<PayheadType>("EARNING");
  const [calculationBasis, setCalculationBasis] = React.useState<PayheadCalculationBasis>("FIXED");
  const [costCenterOption, setCostCenterOption] = React.useState<PayheadCostCenterOption>("NONE");
  const [expenseLedgerId, setExpenseLedgerId] = React.useState<number | null>(null);
  const [payableLedgerId, setPayableLedgerId] = React.useState<number | null>(null);

  const [ledgers, setLedgers] = React.useState<Ledger[] | null>(null);
  const [ledgersLoading, setLedgersLoading] = React.useState(false);
  const [ledgersError, setLedgersError] = React.useState<string | null>(null);

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const loadLedgers = React.useCallback(async () => {
    if (!isValidCompanyId) return;
    setLedgersLoading(true);
    setLedgersError(null);
    try {
      const r = await api.get(`/ledgers/companies/${companyId}/ledgers`);
      setLedgers(Array.isArray(r.data) ? (r.data as Ledger[]) : []);
    } catch (e) {
      setLedgersError(getApiErrorMessage(e));
    } finally {
      setLedgersLoading(false);
    }
  }, [companyId, isValidCompanyId]);

  React.useEffect(() => {
    let mounted = true;
    if (!isValidCompanyId) return;
    loadLedgers().catch(() => null);
    return () => {
      mounted = false;
    };
  }, [loadLedgers, isValidCompanyId]);

  const resetForm = () => {
    setEditing(null);
    setCode("");
    setName("");
    setPayheadType("EARNING");
    setCalculationBasis("FIXED");
    setCostCenterOption("NONE");
    setExpenseLedgerId(null);
    setPayableLedgerId(null);
    setSubmitError(null);
    setFieldErrors({});
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openEdit = (p: PayheadRead) => {
    setEditing(p);
    setCode(p.code || "");
    setName(p.name || "");
    setPayheadType(p.type);
    setCalculationBasis(p.calculation_basis);
    setCostCenterOption((p.cost_center_option as PayheadCostCenterOption) || "NONE");
    setExpenseLedgerId(p.expense_ledger_id != null ? Number(p.expense_ledger_id) : null);
    setPayableLedgerId(p.payable_ledger_id != null ? Number(p.payable_ledger_id) : null);
    setSubmitError(null);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (createPayhead.isPending || updatePayhead.isPending) return;
    setDrawerOpen(false);
  };

  const filtered = React.useMemo(() => {
    const list = (payheads || []) as PayheadRead[];
    const term = q.trim().toLowerCase();
    return list
      .filter((p) => {
        if (typeFilter !== "ALL" && p.type !== typeFilter) return false;
        if (!term) return true;
        const hay = `${p.code || ""} ${p.name || ""}`.toLowerCase();
        return hay.includes(term);
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [payheads, q, typeFilter]);

  const ledgerOptions = React.useMemo(() => {
    return (ledgers || []).map((ledger) => ({
      value: String(ledger.id),
      label: ledger.name,
      sublabel: ledger.groupName || undefined,
    }));
  }, [ledgers]);

  const columns = React.useMemo((): DataTableColumn<PayheadRead>[] => {
    return [
      {
        id: "name",
        header: "Payhead",
        accessor: (row) => (
          <div className="space-y-0.5">
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {row.name}
            </div>
            <div className="text-[11px] text-slate-500">{row.code ? `Code: ${row.code}` : ""}</div>
          </div>
        ),
      },
      {
        id: "type",
        header: "Type",
        accessor: (row) => (
          <span className={row.type === "EARNING" ? "text-xs text-emerald-700" : "text-xs text-critical-700"}>
            {row.type}
          </span>
        ),
      },
      {
        id: "basis",
        header: "Basis",
        accessor: (row) => <span className="text-xs text-slate-700 dark:text-slate-200">{row.calculation_basis}</span>,
      },
      {
        id: "costCenter",
        header: "Cost Center",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{row.cost_center_option || "NONE"}</span>
        ),
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
            Edit
          </Button>
        ),
      },
    ];
  }, []);

  const validateForm = (): boolean => {
    const next: Record<string, string> = {};
    if (!code.trim()) next.code = "Code is required";
    if (!name.trim()) next.name = "Name is required";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    setSubmitError(null);
    setFieldErrors({});

    if (!validateForm()) return;

    const payload: PayheadCreate = {
      code: code.trim(),
      name: name.trim(),
      type: payheadType,
      calculation_basis: calculationBasis,
      cost_center_option: costCenterOption,
      expense_ledger_id: expenseLedgerId,
      payable_ledger_id: payableLedgerId,
    };

    try {
      if (editing) {
        await updatePayhead.mutateAsync({ payheadId: editing.id, payload });
        showToast({ title: "Payhead updated", variant: "success" });
      } else {
        await createPayhead.mutateAsync(payload);
        showToast({ title: "Payhead created", variant: "success" });
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

  if (!isValidCompanyId) return null;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Payheads"
        subtitle="Configure earnings and deductions and map ledger accounts."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <Button size="sm" onClick={openCreate}>
            New Payhead
          </Button>
        }
      />

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <FormField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search code or name..."
            label="Search"
      />
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Type</label>
            <Select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="EARNING">Earning</option>
              <option value="DEDUCTION">Deduction</option>
            </Select>
          </div>
          <div className="md:col-span-2"
      />
        </div>

        {error && (
          <div className="text-xs text-critical-600">
            {String((error as any)?.message || "Failed to load payheads")}
          </div>
        )}
        {ledgersError && <div className="text-xs text-critical-600">{ledgersError}</div>}

        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) => row.id}
          emptyMessage={isLoading ? "Loading..." : "No payheads found."}
      />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Payhead" : "New Payhead"}
        widthClassName="max-w-xl w-full"
      >
        <div className="space-y-3">
          {ledgersLoading && <div className="text-xs text-slate-500">Loading ledgersâ€¦</div>}
          {submitError && <div className="text-xs text-critical-600">{submitError}</div>}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <FormField
              label="Code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. BASIC"
              error={fieldErrors.code}
      />
            <FormField
              label="Name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Basic Salary"
              error={fieldErrors.name}
      />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Type
                <span className="ml-0.5 text-critical-500">*</span>
              </label>
              <Select value={payheadType || ""} onChange={(e) => setPayheadType(e.target.value as PayheadType)}>
                <option value="EARNING">Earning</option>
                <option value="DEDUCTION">Deduction</option>
              </Select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Calculation Basis
                <span className="ml-0.5 text-critical-500">*</span>
              </label>
              <Select
                value={calculationBasis || ""}
                onChange={(e) => setCalculationBasis(e.target.value as PayheadCalculationBasis)}
              >
                {CALC_BASIS_OPTIONS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Cost Center</label>
            <Select
              value={costCenterOption}
              onChange={(e) => setCostCenterOption(e.target.value as PayheadCostCenterOption)}
            >
              {COST_CENTER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </div>

          <Card className="p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="text-xs font-medium text-slate-700 dark:text-slate-200">
                Ledger Mappings (optional)
              </div>
              <button
                type="button"
                onClick={() => loadLedgers()}
                disabled={ledgersLoading}
                className="text-[11px] text-brand-700 hover:underline disabled:opacity-50 disabled:no-underline"
              >
                {ledgersLoading ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Expense Ledger</label>
                  <a
                    href={`/companies/${companyId}/ledgers`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-brand-700 hover:underline"
                  >
                    Create New Ledger
                  </a>
                </div>
                {ledgers && (
                  <SearchableSelect
                    options={ledgerOptions}
                    value={expenseLedgerId ? String(expenseLedgerId) : ""}
                    onChange={(val) => setExpenseLedgerId(val ? Number(val) : null)}
                    placeholder="Select expense ledger"
                  />
                )}
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Payable Ledger</label>
                  <a
                    href={`/companies/${companyId}/ledgers`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-brand-700 hover:underline"
                  >
                    Create New Ledger
                  </a>
                </div>
                {ledgers && (
                  <SearchableSelect
                    options={ledgerOptions}
                    value={payableLedgerId ? String(payableLedgerId) : ""}
                    onChange={(val) => setPayableLedgerId(val ? Number(val) : null)}
                    placeholder="Select payable ledger"
                  />
                )}
              </div>
            </div>
          </Card>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={closeDrawer}
              disabled={createPayhead.isPending || updatePayhead.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              isLoading={createPayhead.isPending || updatePayhead.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Drawer>
    </div>
  );
}

