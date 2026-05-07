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
import { useToast } from "@/components/ui/Toast";
import { PageHeader } from "@/components/ui/PageHeader";

import {
    useEmployeeTypes,
    useCreateEmployeeType,
    useUpdateEmployeeType,
    useDeleteEmployeeType,
} from "@/lib/payroll/hooks/useEmployeeTypes";
import { EmployeeTypeRead, EmployeeTypeCreate } from "@/lib/payroll/types";

export default function EmployeeTypesPage() {
    const params = useParams();
    const companyId = Number(params.companyId);
    const { showToast } = useToast();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingType, setEditingType] = useState<EmployeeTypeRead | null>(null);

    const { data: employeeTypes, isLoading } = useEmployeeTypes(companyId);
    const createMutation = useCreateEmployeeType(companyId);
    const updateMutation = useUpdateEmployeeType(companyId);
    const deleteMutation = useDeleteEmployeeType(companyId);

    const { register, handleSubmit, reset, setValue, watch } = useForm<EmployeeTypeCreate>({
        defaultValues: {
            name: "",
            code: "",
            description: "",
            is_active: true,
        },
    });

    const onSubmit = async (data: EmployeeTypeCreate) => {
        try {
            if (editingType) {
                await updateMutation.mutateAsync({ id: editingType.id, data });
                showToast({ title: "Updated", description: "Employee Type updated successfully", variant: "success" });
            } else {
                await createMutation.mutateAsync(data);
                showToast({ title: "Created", description: "Employee Type created successfully", variant: "success" });
            }
            setIsDialogOpen(false);
            reset();
            setEditingType(null);
        } catch (error) {
            showToast({
                variant: "error",
                title: "Error",
                description: "Failed to save employee type",
            });
        }
    };

    const handleEdit = (type: EmployeeTypeRead) => {
        setEditingType(type);
        setValue("name", type.name);
        setValue("code", type.code);
        setValue("description", type.description);
        setValue("is_active", type.is_active);
        setIsDialogOpen(true);
    };

    const handleDelete = async (id: number) => {
        if (!confirm("Are you sure you want to delete this Employee Type?")) return;
        try {
            await deleteMutation.mutateAsync(id);
            showToast({ title: "Deleted", description: "Employee Type deleted successfully", variant: "success" });
        } catch (error) {
            showToast({
                variant: "error",
                title: "Error",
                description: "Failed to delete employee type. It might be in use.",
            });
        }
    };

    const handleAddNew = () => {
        setEditingType(null);
        reset({
            name: "",
            code: "",
            description: "",
            is_active: true,
        });
        setIsDialogOpen(true);
    };

    if (isLoading) return <div className="flex justify-center p-8"><div className="h-8 w-8 animate-spin">...</div></div>;

    return (
        <div className="space-y-4">
            <PageHeader
                title="Employee Types"
                subtitle="Manage different categories of employees (e.g., Full-time, Permanent, Intern)."
                closeLink={`/companies/${companyId}/payroll`}
                actions={
                    <Button onClick={handleAddNew}>
                        Add New
                    </Button>
                }
            />

            <div className="rounded-md border">
                <Table>
                    <THead>
                        <TR>
                            <TH>Code</TH>
                            <TH>Name</TH>
                            <TH>Description</TH>
                            <TH>Status</TH>
                            <TH className="text-right">Actions</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {employeeTypes?.map((type) => (
                            <TR key={type.id}>
                                <TD>{type.code || "-"}</TD>
                                <TD className="font-medium">{type.name}</TD>
                                <TD>{type.description || "-"}</TD>
                                <TD>
                                    <span
                                        className={`px-2 py-1 rounded-full text-xs ${type.is_active
                                            ? "bg-green-100 text-green-800"
                                            : "bg-red-100 text-red-800"
                                            }`}
                                    >
                                        {type.is_active ? "Active" : "Inactive"}
                                    </span>
                                </TD>
                                <TD className="text-right">
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleEdit(type)}
                                    >
                                        Edit
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => handleDelete(type.id)}
                                        className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    >
                                        Delete
                                    </Button>
                                </TD>
                            </TR>
                        ))}
                        {employeeTypes?.length === 0 && (
                            <TR>
                                <TD colSpan={5} className="text-center py-8 text-muted-foreground">
                                    No employee types found. Create one to get started.
                                </TD>
                            </TR>
                        )}
                    </TBody>
                </Table>
            </div>

            <Modal open={isDialogOpen} onClose={() => setIsDialogOpen(false)} title={editingType ? "Edit Employee Type" : "New Employee Type"}>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                    <div className="space-y-2">
                        <label htmlFor="name" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Name *</label>
                        <Input id="name" {...register("name", { required: true })} placeholder="e.g. Intern"
      />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="code" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Code</label>
                        <Input id="code" {...register("code")} placeholder="e.g. EMP-INT"
      />
                    </div>
                    <div className="space-y-2">
                        <label htmlFor="description" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Description</label>
                        <Input id="description" {...register("description")}
      />
                    </div>
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="is_active"
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            checked={watch("is_active") || false}
                            onChange={(e) => setValue("is_active", e.target.checked)}
      />
                        <label htmlFor="is_active" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Active</label>
                    </div>
                    <div className="flex justify-end space-x-2 pt-4">
                        <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                            {createMutation.isPending || updateMutation.isPending ? (
                                <span className="mr-2 h-4 w-4 animate-spin">...</span>
                            ) : null}
                            Save
                        </Button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}

