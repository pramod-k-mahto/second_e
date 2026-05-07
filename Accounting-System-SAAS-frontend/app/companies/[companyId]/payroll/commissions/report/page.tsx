"use client";

import React, { useState } from "react";
import { useParams } from "next/navigation";
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
import { Select } from "@/components/ui/Select";
import { PageHeader } from "@/components/ui/PageHeader";

import { useCommissionReport, useDepartments, useProjects, useSegments } from "@/lib/payroll/hooks/useCommissions";
import { CommissionReportItem } from "@/lib/payroll/types";

export default function CommissionReportPage() {
    const params = useParams();
    const companyId = Number(params.companyId);

    // Default to current month
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

    const [startDate, setStartDate] = useState(firstDay);
    const [endDate, setEndDate] = useState(lastDay);
    const [departmentId, setDepartmentId] = useState<string>("");
    const [projectId, setProjectId] = useState<string>("");
    const [segmentId, setSegmentId] = useState<string>("");

    const { data: departments } = useDepartments(companyId);
    const { data: projects } = useProjects(companyId);
    const { data: segments } = useSegments(companyId);

    const { data: report, isLoading, refetch } = useCommissionReport(companyId, startDate, endDate, {
        departmentId: departmentId ? Number(departmentId) : null,
        projectId: projectId ? Number(projectId) : null,
        segmentId: segmentId ? Number(segmentId) : null,
    });

    // Expanded rows state
    const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

    const toggleRow = (employeeId: number) => {
        setExpandedRows(prev => ({
            ...prev,
            [employeeId]: !prev[employeeId]
        }));
    };

    const handleRun = () => {
        refetch();
    };

    return (
        <div className="space-y-4">
            <PageHeader
                title="Commission Report"
                subtitle="View and calculate commissions for sales personnel."
                closeLink={`/companies/${companyId}/payroll`}
                actions={
                    <div className="flex flex-wrap gap-2">
                        <Input
                            type="date"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                            className="w-auto"
                        />
                        <Input
                            type="date"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                            className="w-auto"
                        />
                        <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-auto min-w-[140px]">
                            <option value="">Cost Center: Department</option>
                            {(departments || []).map((d) => (
                                <option key={d.id} value={String(d.id)}>
                                    Dept: {d.name}
                                </option>
                            ))}
                        </Select>
                        <Select value={projectId} onChange={(e) => setProjectId(e.target.value)} className="w-auto min-w-[140px]">
                            <option value="">Cost Center: Project</option>
                            {(projects || []).map((p) => (
                                <option key={p.id} value={String(p.id)}>
                                    Proj: {p.name}
                                </option>
                            ))}
                        </Select>
                        <Select value={segmentId} onChange={(e) => setSegmentId(e.target.value)} className="w-auto min-w-[140px]">
                            <option value="">Cost Center: Segment</option>
                            {(segments || []).map((s) => (
                                <option key={s.id} value={String(s.id)}>
                                    Seg: {s.name}
                                </option>
                            ))}
                        </Select>
                        <Button onClick={handleRun} disabled={isLoading}>
                            {isLoading ? "Running..." : "Run Report"}
                        </Button>
                    </div>
                }
            />

            <div className="rounded-md border">
                <Table>
                    <THead>
                        <TR>
                            <TH className="w-8"></TH>
                            <TH>Employee</TH>
                            <TH className="text-right">Total Sales</TH>
                            <TH className="text-right">Commission Amount</TH>
                        </TR>
                    </THead>
                    <TBody>
                        {report?.map((item) => (
                            <React.Fragment key={item.employee_id}>
                                <TR className="hover:bg-gray-50 cursor-pointer" onClick={() => toggleRow(item.employee_id)}>
                                    <TD>
                                        <div className="flex items-center justify-center">
                                            {expandedRows[item.employee_id] ? "â–¼" : "â–¶"}
                                        </div>
                                    </TD>
                                    <TD className="font-medium">
                                        {item.employee_name}
                                        {item.employee_code && <span className="text-gray-500 text-xs ml-2">({item.employee_code})</span>}
                                    </TD>
                                    <TD className="text-right font-mono">{item.total_sales.toFixed(2)}</TD>
                                    <TD className="text-right font-mono font-bold text-green-700">{item.commission_amount.toFixed(2)}</TD>
                                </TR>
                                {expandedRows[item.employee_id] && (
                                    <TR>
                                        <TD colSpan={4} className="p-0 border-b">
                                            <div className="bg-gray-50 p-4 pl-12">
                                                <h4 className="text-sm font-semibold mb-2">Invoice Details</h4>
                                                <div className="rounded border bg-white overflow-hidden">
                                                    <table className="w-full text-sm text-left">
                                                        <thead className="bg-gray-100 border-b">
                                                            <tr>
                                                                <th className="px-3 py-2 font-medium text-gray-600">Date</th>
                                                                <th className="px-3 py-2 font-medium text-gray-600">Invoice #</th>
                                                                <th className="px-3 py-2 font-medium text-gray-600 text-right">Amount</th>
                                                                <th className="px-3 py-2 font-medium text-gray-600 text-right">Rate Applied</th>
                                                                <th className="px-3 py-2 font-medium text-gray-600 text-right">Commission</th>
                                                                <th className="px-3 py-2 font-medium text-gray-600">Rules</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {item.invoices.map(inv => (
                                                                <tr key={inv.id} className="border-b last:border-0 hover:bg-gray-50">
                                                                    <td className="px-3 py-2">{inv.date}</td>
                                                                    <td className="px-3 py-2">{inv.number}</td>
                                                                    <td className="px-3 py-2 text-right">{inv.amount.toFixed(2)}</td>
                                                                    <td className="px-3 py-2 text-right">{inv.rate_applied.toFixed(2)}%</td>
                                                                    <td className="px-3 py-2 text-right font-mono text-green-600">{inv.commission.toFixed(2)}</td>
                                                                    <td className="px-3 py-2 text-xs text-gray-500">
                                                                        {inv.rules.join(", ")}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        </TD>
                                    </TR>
                                )}
                            </React.Fragment>
                        ))}
                        {report?.length === 0 && (
                            <TR>
                                <TD colSpan={4} className="text-center py-8 text-muted-foreground">
                                    No commissions found for this period.
                                </TD>
                            </TR>
                        )}
                    </TBody>
                </Table>
            </div>
        </div>
    );
}

