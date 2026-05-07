"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useForm } from "react-hook-form";
import {
    Table,
    TBody,
    TD,
    TH,
    THead,
    TR,
} from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Modal";
import { Drawer } from "@/components/ui/Drawer";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { Card } from "@/components/ui/Card";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";

import {
    useDesignations,
    useCreateDesignation,
    useUpdateDesignation,
    useDeleteDesignation,
    useDesignationTemplateLines,
    useAddDesignationTemplateLine,
    useUpdateDesignationTemplateLine,
    useDeleteDesignationTemplateLine,
    useApplyDesignationTemplate,
    usePayheads,
} from "@/lib/payroll/queries";
import type {
    DesignationRead,
    DesignationCreate,
    DesignationTemplateLineRead,
    DesignationTemplateLineCreate,
    PayheadRead,
} from "@/lib/payroll/types";

export default function DesignationsPage() {
    const params = useParams();
    const companyId = Number(params.companyId);
    const { showToast } = useToast();

    // Designation list / CRUD modal
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingDesignation, setEditingDesignation] = useState<DesignationRead | null>(null);

    const { data: designations, isLoading } = useDesignations(companyId);
    const { data: payheads } = usePayheads(companyId);
    const createMutation = useCreateDesignation(companyId);
    const updateMutation = useUpdateDesignation(companyId);
    const deleteMutation = useDeleteDesignation(companyId);

    // Template editor drawer
    const [templateDesignation, setTemplateDesignation] = useState<DesignationRead | null>(null);
    const { data: templateLines, isLoading: templateLoading } = useDesignationTemplateLines(
        companyId,
        templateDesignation?.id ?? 0
    );
    const addLineMutation = useAddDesignationTemplateLine(companyId, templateDesignation?.id ?? 0);
    const updateLineMutation = useUpdateDesignationTemplateLine(companyId, templateDesignation?.id ?? 0);
    const deleteLineMutation = useDeleteDesignationTemplateLine(companyId, templateDesignation?.id ?? 0);
    const applyTemplateMutation = useApplyDesignationTemplate(companyId);

    // Template line form state
    const [editingLine, setEditingLine] = useState<DesignationTemplateLineRead | null>(null);
    const [linePayheadId, setLinePayheadId] = useState("");
    const [lineAmount, setLineAmount] = useState("");
    const [lineRate, setLineRate] = useState("");
    const [lineFormula, setLineFormula] = useState("");
    const [lineSortOrder, setLineSortOrder] = useState("100");
    const [lineError, setLineError] = useState<string | null>(null);

    const payheadById = new Map<number, PayheadRead>(
        (payheads || []).map((p: PayheadRead) => [Number(p.id), p])
    );

    // Designation form
    const { register, handleSubmit, reset, setValue, watch } = useForm<DesignationCreate>({
        defaultValues: {
            name: "",
            code: "",
            description: "",
            base_monthly_salary: null,
            grade_rate: null,
            is_active: true,
        },
    });

    const onSubmit = async (data: DesignationCreate) => {
        try {
            if (editingDesignation) {
                await updateMutation.mutateAsync({ id: editingDesignation.id, data });
                showToast({ title: "Updated", description: "Designation updated successfully", variant: "success" });
            } else {
                await createMutation.mutateAsync(data);
                showToast({ title: "Created", description: "Designation created successfully", variant: "success" });
            }
            setIsDialogOpen(false);
            reset();
            setEditingDesignation(null);
        } catch {
            showToast({ variant: "error", title: "Error", description: "Failed to save designation" });
        }
    };

    const handleEdit = (d: DesignationRead) => {
        setEditingDesignation(d);
        setValue("name", d.name);
        setValue("code", d.code || "");
        setValue("description", d.description || "");
        setValue("base_monthly_salary", d.base_monthly_salary ?? null);
        setValue("grade_rate", d.grade_rate ?? null);
        setValue("is_active", d.is_active ?? true);
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this Designation?")) return;
        try {
            await deleteMutation.mutateAsync(id);
            showToast({ title: "Deleted", description: "Designation deleted successfully", variant: "success" });
        } catch {
            showToast({ variant: "error", title: "Error", description: "Failed to delete designation. It might be in use." });
        }
    };

    const handleAddNew = () => {
        setEditingDesignation(null);
        reset({ name: "", code: "", description: "", base_monthly_salary: null, grade_rate: null, is_active: true });
        setIsDialogOpen(true);
    };

    // Template editor helpers
    const openTemplateEditor = (d: DesignationRead) => {
        setTemplateDesignation(d);
        resetLineForm();
    };

    const closeTemplateEditor = () => {
        setTemplateDesignation(null);
        resetLineForm();
    };

    const resetLineForm = () => {
        setEditingLine(null);
        setLinePayheadId("");
        setLineAmount("");
        setLineRate("");
        setLineFormula("");
        setLineSortOrder("100");
        setLineError(null);
    };

    const openEditLine = (l: DesignationTemplateLineRead) => {
        setEditingLine(l);
        setLinePayheadId(String(l.payhead_id));
        setLineAmount(l.amount != null ? String(l.amount) : "");
        setLineRate(l.rate != null ? String(l.rate) : "");
        setLineFormula(l.formula || "");
        setLineSortOrder(String(l.sort_order ?? 100));
        setLineError(null);
    };

    const saveLine = async () => {
        if (!templateDesignation) return;
        setLineError(null);
        if (!linePayheadId) { setLineError("Select a payhead"); return; }
        const hasAmount = lineAmount.trim() !== "";
        const hasRate = lineRate.trim() !== "";
        const hasFormula = lineFormula.trim() !== "";
        if (!hasAmount && !hasRate && !hasFormula) {
            setLineError("Provide at least one of: amount, rate, or formula");
            return;
        }
        if (hasAmount && isNaN(Number(lineAmount))) { setLineError("Amount must be a number"); return; }
        if (hasRate && isNaN(Number(lineRate))) { setLineError("Rate must be a number"); return; }

        const payload: DesignationTemplateLineCreate = {
            payhead_id: Number(linePayheadId),
            amount: hasAmount ? Number(lineAmount) : null,
            rate: hasRate ? Number(lineRate) : null,
            formula: hasFormula ? lineFormula.trim() : null,
            sort_order: Number(lineSortOrder) || 100,
        };

        try {
            if (editingLine) {
                await updateLineMutation.mutateAsync({ lineId: editingLine.id, payload });
                showToast({ title: "Line updated", variant: "success" });
            } else {
                await addLineMutation.mutateAsync(payload);
                showToast({ title: "Line added", variant: "success" });
            }
            resetLineForm();
        } catch (e: unknown) {
            const msg = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
            setLineError(typeof msg === "string" ? msg : "Failed to save line");
        }
    };

    const deleteLine = async (lineId: number) => {
        if (!confirm("Delete this template line?")) return;
        try {
            await deleteLineMutation.mutateAsync(lineId);
            showToast({ title: "Line deleted", variant: "success" });
        } catch {
            showToast({ title: "Delete failed", variant: "error" });
        }
    };

    const handleApplyTemplate = async () => {
        if (!templateDesignation) return;
        if (!confirm(`Apply template to all active employees with designation "${templateDesignation.name}"? This will replace their active pay structure.`)) return;
        try {
            const res = await applyTemplateMutation.mutateAsync(templateDesignation.id);
            showToast({ title: `Template applied to ${res.employee_ids.length} employee(s)`, variant: "success" });
        } catch {
            showToast({ title: "Apply failed", variant: "error" });
        }
    };

    const lineColumns: DataTableColumn<DesignationTemplateLineRead>[] = [
        {
            id: "payhead",
            header: "Payhead",
            accessor: (row) => (
                <span className="text-xs">{payheadById.get(Number(row.payhead_id))?.name || `#${row.payhead_id}`}</span>
            ),
        },
        {
            id: "type",
            header: "Type",
            accessor: (row) => (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${payheadById.get(Number(row.payhead_id))?.type === "EARNING" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"}`}>
                    {payheadById.get(Number(row.payhead_id))?.type || "—"}
                </span>
            ),
        },
        { id: "amount", header: "Amount", accessor: (row) => <span className="text-xs tabular-nums">{row.amount ?? "—"}</span> },
        { id: "rate", header: "Rate", accessor: (row) => <span className="text-xs tabular-nums">{row.rate ?? "—"}</span> },
        { id: "formula", header: "Formula", accessor: (row) => <span className="text-xs font-mono">{row.formula || "—"}</span> },
        { id: "sort", header: "Order", accessor: (row) => <span className="text-xs tabular-nums">{row.sort_order}</span> },
        {
            id: "actions",
            header: "",
            justify: "right",
            accessor: (row) => (
                <div className="flex justify-end gap-1">
                    <Button size="sm" variant="outline" onClick={() => openEditLine(row)}>Edit</Button>
                    <Button size="sm" variant="danger" onClick={() => deleteLine(row.id)}>Delete</Button>
                </div>
            ),
        },
    ];

    if (isLoading) return (
        <div className="flex justify-center p-8">
            <div className="h-8 w-8 animate-spin border-2 border-brand-600 border-t-transparent rounded-full" />
        </div>
    );

    return (
        <div className="space-y-4">
            <PageHeader
                title="Designations"
                subtitle="Manage employee designations and define pay templates shared by all employees of each designation."
                closeLink={`/companies/${companyId}/payroll`}
                actions={<Button onClick={handleAddNew}>Add New Designation</Button>}
            />

            <div className="rounded-md border bg-white dark:bg-slate-900 overflow-hidden">
                <Table>
                    <THead>
                        <TR>
                            <TH>Code</TH>
                            <TH>Name</TH>
                            <TH>Description</TH>
                            <TH className="text-right">Monthly Salary</TH>
                            <TH className="text-right">Grade Rate</TH>
                            <TH>Template Lines</TH>
                            <TH>Status</TH>
                            <TH className="text-right">Actions</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {designations?.map((d) => (
                            <TR key={d.id}>
                                <TD>{d.code || "-"}</TD>
                                <TD className="font-medium text-slate-900 dark:text-slate-100">{d.name}</TD>
                                <TD>{d.description || "-"}</TD>
                                <TD className="text-right tabular-nums">
                                    {d.base_monthly_salary != null
                                        ? Number(d.base_monthly_salary).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : <span className="text-slate-400">—</span>}
                                </TD>
                                <TD className="text-right tabular-nums">
                                    {d.grade_rate != null
                                        ? Number(d.grade_rate).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                                        : <span className="text-slate-400">—</span>}
                                </TD>
                                <TD>
                                    <span className="text-xs text-slate-600 dark:text-slate-300">
                                        {(d.template_lines?.length ?? 0)} pay head{(d.template_lines?.length ?? 0) !== 1 ? "s" : ""}
                                    </span>
                                </TD>
                                <TD>
                                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider ${d.is_active ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-800"}`}>
                                        {d.is_active ? "Active" : "Inactive"}
                                    </span>
                                </TD>
                                <TD className="text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => openTemplateEditor(d)}>
                                            Pay Template
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleEdit(d)}>Edit</Button>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => handleDelete(d.id)}
                                            className="text-critical-600 hover:text-critical-700 hover:bg-critical-50"
                                        >
                                            Delete
                                        </Button>
                                    </div>
                                </TD>
                            </TR>
                        ))}
                        {designations?.length === 0 && (
                            <TR>
                                <TD colSpan={8} className="text-center py-12 text-slate-500">
                                    No designations found. Create one to get started.
                                </TD>
                            </TR>
                        )}
                    </TBody>
                </Table>
            </div>

            {/* Designation create/edit modal */}
            <Modal
                open={isDialogOpen}
                onClose={() => setIsDialogOpen(false)}
                title={editingDesignation ? "Edit Designation" : "New Designation"}
                size="md"
            >
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-2">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1 col-span-2">
                            <label htmlFor="name" className="text-xs font-semibold text-slate-500 uppercase">Name *</label>
                            <Input id="name" {...register("name", { required: true })} placeholder="e.g. Sales Manager" autoFocus />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="code" className="text-xs font-semibold text-slate-500 uppercase">Code</label>
                            <Input id="code" {...register("code")} placeholder="e.g. MG-01" />
                        </div>
                        <div className="space-y-1">
                            <label htmlFor="description" className="text-xs font-semibold text-slate-500 uppercase">Description</label>
                            <Input id="description" {...register("description")} placeholder="Job description details..." />
                        </div>
                    </div>

                    <div className="rounded-lg border border-brand-100 bg-brand-50/40 dark:border-slate-700 dark:bg-slate-800/40 p-4 space-y-3">
                        <p className="text-xs font-semibold text-brand-700 dark:text-brand-300 uppercase tracking-wider">
                            Default Salary Values
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 -mt-1">
                            Automatically applied to new employees. Grade Amount = grade_number × Grade Rate.
                        </p>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1">
                                <label htmlFor="base_monthly_salary" className="text-xs font-semibold text-slate-500 uppercase">Monthly Salary</label>
                                <Input
                                    id="base_monthly_salary"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    {...register("base_monthly_salary", {
                                        setValueAs: (v) => (v === "" || v === null || v === undefined) ? null : Number(v),
                                    })}
                                    placeholder="e.g. 50000.00"
                                />
                            </div>
                            <div className="space-y-1">
                                <label htmlFor="grade_rate" className="text-xs font-semibold text-slate-500 uppercase">Grade Rate (per grade)</label>
                                <Input
                                    id="grade_rate"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    {...register("grade_rate", {
                                        setValueAs: (v) => (v === "" || v === null || v === undefined) ? null : Number(v),
                                    })}
                                    placeholder="e.g. 500.00"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 py-1">
                        <input
                            type="checkbox"
                            id="is_active"
                            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                            checked={watch("is_active") || false}
                            onChange={(e) => setValue("is_active", e.target.checked)}
                        />
                        <label htmlFor="is_active" className="text-sm font-medium text-slate-700 dark:text-slate-200">Active</label>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                            {(createMutation.isPending || updateMutation.isPending) && (
                                <span className="mr-2 h-4 w-4 animate-spin">...</span>
                            )}
                            Save Designation
                        </Button>
                    </div>
                </form>
            </Modal>

            {/* Pay Template Editor Drawer */}
            <Drawer
                open={!!templateDesignation}
                onClose={closeTemplateEditor}
                title={templateDesignation ? `Pay Template — ${templateDesignation.name}` : "Pay Template"}
                widthClassName="max-w-3xl w-full"
            >
                {templateDesignation && (
                    <div className="space-y-4">
                        {/* Info banner */}
                        <div className="rounded-lg border border-brand-100 bg-brand-50/40 dark:border-slate-700 dark:bg-slate-800/40 p-3 text-xs text-slate-600 dark:text-slate-300 space-y-1">
                            <p className="font-semibold text-brand-700 dark:text-brand-300">How it works</p>
                            <p>All employees with designation <strong>{templateDesignation.name}</strong> share these pay heads and amounts.</p>
                            <p>GRADE payhead amount is auto-calculated as <strong>employee Grade Number × {templateDesignation.grade_rate ?? 0} (Grade Rate)</strong> at payroll compute time.</p>
                            <p>Click <strong>Apply to All Employees</strong> to push this template to existing employees.</p>
                        </div>

                        {/* Add / Edit line form */}
                        <Card className="p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                    {editingLine ? "Edit Line" : "Add Pay Head Line"}
                                </span>
                                {editingLine && (
                                    <Button size="sm" variant="outline" onClick={resetLineForm}>Cancel Edit</Button>
                                )}
                            </div>

                            {lineError && <div className="text-[11px] text-critical-600">{lineError}</div>}

                            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                        Payhead <span className="text-critical-500">*</span>
                                    </label>
                                    <Select
                                        value={linePayheadId}
                                        onChange={(e) => setLinePayheadId(e.target.value)}
                                        disabled={!!editingLine}
                                    >
                                        <option value="">Select payhead</option>
                                        {(payheads || [])
                                            .slice()
                                            .sort((a: PayheadRead, b: PayheadRead) => a.name.localeCompare(b.name))
                                            .map((p: PayheadRead) => (
                                                <option key={p.id} value={String(p.id)}>
                                                    [{p.type === "EARNING" ? "E" : "D"}] {p.name}
                                                </option>
                                            ))}
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Amount</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={lineAmount}
                                        onChange={(e) => setLineAmount(e.target.value)}
                                        placeholder="Fixed amount"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Rate %</label>
                                    <Input
                                        type="number"
                                        step="0.01"
                                        value={lineRate}
                                        onChange={(e) => setLineRate(e.target.value)}
                                        placeholder="e.g. 10"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
                                <div className="space-y-1 md:col-span-2">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Formula</label>
                                    <Input
                                        value={lineFormula}
                                        onChange={(e) => setLineFormula(e.target.value)}
                                        placeholder="e.g. BASIC * 0.1  or  GRADE * PAYABLE_DAYS / 30"
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Sort Order</label>
                                    <Input
                                        type="number"
                                        value={lineSortOrder}
                                        onChange={(e) => setLineSortOrder(e.target.value)}
                                        placeholder="100"
                                    />
                                </div>
                            </div>

                            <div className="rounded border border-border-light dark:border-border-dark px-2 py-2 text-[11px] text-slate-500">
                                Formula variables: BASIC, GRADE, BASE_MONTHLY_SALARY, PAYABLE_DAYS, PER_DAY_RATE, WORKED_HOURS, ABSENT_DAYS, LATE_MINUTES, OVERTIME_MINUTES
                            </div>

                            <div className="flex justify-end gap-2">
                                <Button
                                    size="sm"
                                    onClick={saveLine}
                                    isLoading={addLineMutation.isPending || updateLineMutation.isPending}
                                >
                                    {editingLine ? "Save Line" : "Add Line"}
                                </Button>
                            </div>
                        </Card>

                        {/* Template lines table */}
                        <Card className="p-3 space-y-2">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                                    Template Lines ({(templateLines || []).length})
                                </span>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleApplyTemplate}
                                    isLoading={applyTemplateMutation.isPending}
                                >
                                    Apply to All Employees
                                </Button>
                            </div>
                            <DataTable
                                columns={lineColumns}
                                data={(templateLines || []) as DesignationTemplateLineRead[]}
                                getRowKey={(row) => row.id}
                                emptyMessage={templateLoading ? "Loading..." : "No template lines. Add pay heads above."}
                            />
                        </Card>
                    </div>
                )}
            </Drawer>
        </div>
    );
}
