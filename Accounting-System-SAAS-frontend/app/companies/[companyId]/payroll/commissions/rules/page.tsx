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
import { Select } from "@/components/ui/Select";
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/ui/PageHeader";

import {
    useCommissionRules,
    useCreateCommissionRule,
    useUpdateCommissionRule,
    useDeleteCommissionRule,
    useDepartments,
    useProjects,
    useSegments,
} from "@/lib/payroll/hooks/useCommissions";
import { useEmployeeTypes } from "@/lib/payroll/hooks/useEmployeeTypes";
import { CommissionRuleRead, CommissionRuleCreate } from "@/lib/payroll/types";

export default function CommissionRulesPage() {
    const params = useParams();
    const companyId = Number(params.companyId);
    const { showToast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<CommissionRuleRead | null>(null);

    const { data: rules, isLoading } = useCommissionRules(companyId);
    const { data: employeeTypes } = useEmployeeTypes(companyId);
    const { data: departments } = useDepartments(companyId);
    const { data: projects } = useProjects(companyId);
    const { data: segments } = useSegments(companyId);

    const createMutation = useCreateCommissionRule(companyId);
    const updateMutation = useUpdateCommissionRule(companyId);
    const deleteMutation = useDeleteCommissionRule(companyId);

    const { register, handleSubmit, reset, setValue, watch } = useForm<CommissionRuleCreate>({
        defaultValues: {
            name: "",
            employee_type_id: null,
            department_id: null,
            project_id: null,
            segment_id: null,
            is_global_default: false,
            rate_percent: 0,
            is_active: true,
            basis: "TURNOVER",
        },
    });

    const onSubmit = async (data: CommissionRuleCreate) => {
        // Convert empty strings to null for optional selects
        const payload = {
            ...data,
            employee_type_id: data.employee_type_id ? Number(data.employee_type_id) : null,
            department_id: data.department_id ? Number(data.department_id) : null,
            project_id: data.project_id ? Number(data.project_id) : null,
            segment_id: data.segment_id ? Number(data.segment_id) : null,
            rate_percent: Number(data.rate_percent),
        };

        try {
            if (editingRule) {
                await updateMutation.mutateAsync({ id: editingRule.id, data: payload });
                showToast({ title: "Updated", description: "Rule updated successfully", variant: "success" });
            } else {
                await createMutation.mutateAsync(payload);
                showToast({ title: "Created", description: "Rule created successfully", variant: "success" });
            }
            setIsDialogOpen(false);
            reset();
            setEditingRule(null);
        } catch (error) {
            showToast({
                variant: "error",
                title: "Error",
                description: "Failed to save rule",
            });
        }
    };

    const handleEdit = (rule: CommissionRuleRead) => {
        setEditingRule(rule);
        setValue("name", rule.name);
        setValue("employee_type_id", rule.employee_type_id);
        setValue("department_id", rule.department_id);
        setValue("project_id", rule.project_id);
        setValue("segment_id", rule.segment_id);
        setValue("is_global_default", rule.is_global_default);
        setValue("rate_percent", rule.rate_percent);
        setValue("is_active", rule.is_active);
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this Rule?")) return;
        try {
            await deleteMutation.mutateAsync(id);
            showToast({ title: "Deleted", description: "Rule deleted successfully", variant: "success" });
        } catch (error) {
            showToast({
                variant: "error",
                title: "Error",
                description: "Failed to delete rule.",
            });
        }
    };

    const handleAddNew = () => {
        setEditingRule(null);
        reset({
            name: "",
            employee_type_id: null,
            department_id: null,
            project_id: null,
            segment_id: null,
            is_global_default: false,
            rate_percent: 0,
            is_active: true,
            basis: "TURNOVER",
        });
        setIsDialogOpen(true);
    };

    if (isLoading) return <div className="flex justify-center p-8"><div className="h-8 w-8 animate-spin">...</div></div>;

    return (
        <div className="space-y-4">
            <PageHeader
                title="Commission Rules"
                subtitle="Define commission rules based on departments, projects, or employee types."
                closeLink={`/companies/${companyId}/payroll`}
                actions={
                    <Button onClick={handleAddNew}>
                        Add New Rule
                    </Button>
                }
            />

            <div className="rounded-md border">
                <Table>
                    <THead>
                        <TR>
                            <TH>Name</TH>
                            <TH>Criteria</TH>
                            <TH>Rate</TH>
                            <TH>Status</TH>
                            <TH className="text-right">Actions</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {rules?.map((rule) => (
                            <TR key={rule.id}>
                                <TD className="font-medium">
                                    {rule.name}
                                    {rule.is_global_default && <span className="ml-2 px-2 py-0.5 bg-blue-100 text-blue-800 text-xs rounded-full">Global</span>}
                                </TD>
                                <TD>
                                    <div className="flex flex-col gap-1 text-sm text-gray-600">
                                        {rule.employee_type_id && <span>Type: {employeeTypes?.find(t => t.id === rule.employee_type_id)?.name || rule.employee_type_id}</span>}
                                        {rule.department_id && <span>Dept: {departments?.find(d => d.id === rule.department_id)?.name || rule.department_id}</span>}
                                        {rule.project_id && <span>Proj: {projects?.find(p => p.id === rule.project_id)?.name || rule.project_id}</span>}
                                        {rule.segment_id && <span>Seg: {segments?.find(s => s.id === rule.segment_id)?.name || rule.segment_id}</span>}
                                        {!rule.employee_type_id && !rule.department_id && !rule.project_id && !rule.segment_id && !rule.is_global_default && <span className="text-gray-400">Apply to All (Partial)</span>}
                                    </div>
                                </TD>
                                <TD>{rule.rate_percent}%</TD>
                                <TD>
                                    <span
                                        className={`px-2 py-1 rounded-full text-xs ${rule.is_active
                                            ? "bg-green-100 text-green-800"
                                            : "bg-red-100 text-red-800"
                                            }`}
                                    >
                                        {rule.is_active ? "Active" : "Inactive"}
                                    </span>
                                </TD>
                                <TD className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEdit(rule)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(rule.id)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        Delete
                                    </Button>
                                </TD>
                            </TR>
                        ))}
                        {rules?.length === 0 && (
                            <TR>
                                <TD colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No rules found. Create one to get started.
                                </TD>
                            </TR>
                        )}
                    </TBody>
                </Table>
            </div>

            <Modal open={isDialogOpen} onClose={() => setIsDialogOpen(false)} title={editingRule ? "Edit Rule" : "New Rule"}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium">Name *</label>
                        <Input id="name" {...register("name", { required: true })} placeholder="e.g. Sales Team Commission"
      />
                    </div>

                    <div className="space-y-2">
                        <label htmlFor="rate_percent" className="text-sm font-medium">Commission Rate (%) *</label>
                        <Input
                            id="rate_percent"
                            type="number"
                            step="0.01"
                            {...register("rate_percent", { required: true, min: 0 })}
      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Employee Type</label>
                            <Select {...register("employee_type_id")}>
                                <option value="">Any</option>
                                {employeeTypes?.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Department</label>
                            <Select {...register("department_id")}>
                                <option value="">Any</option>
                                {departments?.map(d => (
                                    <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Project</label>
                            <Select {...register("project_id")}>
                                <option value="">Any</option>
                                {projects?.map(p => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Segment</label>
                            <Select {...register("segment_id")}>
                                <option value="">Any</option>
                                {segments?.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2 pt-2">
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="is_global_default"
                                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                checked={watch("is_global_default") || false}
                                onChange={(e) => setValue("is_global_default", e.target.checked)}
      />
                            <label htmlFor="is_global_default" className="text-sm font-medium">Global Default (Apply to All)</label>
                        </div>
                        <p className="text-xs text-gray-500 ml-6">If checked, this rule applies regardless of other criteria.</p>
                    </div>

                    <div className="flex items-center space-x-2 pt-2">
                        <input
                            type="checkbox"
                            id="is_active"
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={watch("is_active") || false}
                            onChange={(e) => setValue("is_active", e.target.checked)}
      />
                        <label htmlFor="is_active" className="text-sm font-medium">Active</label>
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                            {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save"}
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

