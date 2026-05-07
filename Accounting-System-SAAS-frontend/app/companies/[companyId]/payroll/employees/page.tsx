"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { FormField } from "@/components/ui/FormField";
import { Drawer } from "@/components/ui/Drawer";
import { Select } from "@/components/ui/Select";
import { LedgerSelectDropdown } from "@/components/ui/LedgerSelectDropdown";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { usePermissions } from "@/components/PermissionsContext";
import { api, getApiErrorMessage } from "@/lib/api";
import {
  useCreateEmployee,
  useEmployees,
  useUpdateEmployee,
  useDesignations,
  useCreateDesignation,
  usePayheads,
  useEmployeeExtraPayheads,
  useAddEmployeeExtraPayhead,
  useUpdateEmployeeExtraPayhead,
  useDeleteEmployeeExtraPayhead,
} from "@/lib/payroll/queries";

import { useEmployeeTypes, useCreateEmployeeType } from "@/lib/payroll/hooks/useEmployeeTypes";
import type { EmployeeCreate, EmployeeRead, PayrollMode, SalaryMode, EmployeeTypeRead, DesignationRead, EmployeeExtraPayheadRead } from "@/lib/payroll/types";

import type { Ledger } from "@/types/ledger";

type Department = { id: number; name: string; is_active?: boolean };
type Project = { id: number; name: string; is_active?: boolean };
type Segment = { id: number; name: string; is_active?: boolean };

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toNumberOrNull(v: string): number | null {
  const s = String(v || "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export default function PayrollEmployeesPage() {
  const params = useParams();
  const companyId = Number(params?.companyId);
  const isValidCompanyId = Number.isFinite(companyId) && companyId > 0;

  const { showToast } = useToast();
  const permissions = usePermissions();
  const isAdminLike = permissions.isTenantAdmin || permissions.isSuperAdmin;

  const { data: employees, isLoading, error } = useEmployees(companyId);
  const { data: employeeTypes } = useEmployeeTypes(companyId);
  const { data: designations } = useDesignations(companyId);
  const { data: payheads } = usePayheads(companyId);
  const createEmployeeType = useCreateEmployeeType(companyId);
  const createDesignation = useCreateDesignation(companyId);
  const createEmployee = useCreateEmployee(companyId);
  const updateEmployee = useUpdateEmployee(companyId);


  const [q, setQ] = React.useState("");
  const [payrollMode, setPayrollMode] = React.useState<"ALL" | PayrollMode>("ALL");
  const [activeFilter, setActiveFilter] = React.useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [departmentId, setDepartmentId] = React.useState<"ALL" | string>("ALL");

  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<EmployeeRead | null>(null);

  // Extra pay heads drawer
  const [extraPhEmployee, setExtraPhEmployee] = React.useState<EmployeeRead | null>(null);
  const [extraPhDrawerOpen, setExtraPhDrawerOpen] = React.useState(false);
  const [extraPhPayheadId, setExtraPhPayheadId] = React.useState<string>("");
  const [extraPhAmount, setExtraPhAmount] = React.useState<string>("");
  const [extraPhFormula, setExtraPhFormula] = React.useState<string>("");
  const [extraPhSortOrder, setExtraPhSortOrder] = React.useState<string>("100");
  const [extraPhEditingLine, setExtraPhEditingLine] = React.useState<EmployeeExtraPayheadRead | null>(null);
  const [extraPhError, setExtraPhError] = React.useState<string | null>(null);

  const { data: extraPayheads, isLoading: extraPhLoading } = useEmployeeExtraPayheads(
    companyId,
    extraPhEmployee?.id ?? null
  );
  const addExtraPayhead = useAddEmployeeExtraPayhead(companyId, extraPhEmployee?.id ?? 0);
  const updateExtraPayhead = useUpdateEmployeeExtraPayhead(companyId, extraPhEmployee?.id ?? 0);
  const deleteExtraPayhead = useDeleteEmployeeExtraPayhead(companyId, extraPhEmployee?.id ?? 0);

  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

  const [fullName, setFullName] = React.useState("");
  const [code, setCode] = React.useState("");
  const [grade, setGrade] = React.useState("");
  const [gradeNumber, setGradeNumber] = React.useState<string>("");
  const [gender, setGender] = React.useState<string>("");
  const [maritalStatus, setMaritalStatus] = React.useState<string>("");
  const [email, setEmail] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [dob, setDob] = React.useState("");
  const [pan, setPan] = React.useState("");


  const [joinDate, setJoinDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");

  const [employeePayrollMode, setEmployeePayrollMode] = React.useState<PayrollMode>("MONTHLY");
  const [salaryMode, setSalaryMode] = React.useState<SalaryMode>("PRO_RATA");
  const [employeeTypeId, setEmployeeTypeId] = React.useState<number | null>(null);
  const [employeeDesignationId, setEmployeeDesignationId] = React.useState<number | null>(null);


  const [baseMonthlySalary, setBaseMonthlySalary] = React.useState("");
  const [baseDailyWage, setBaseDailyWage] = React.useState("");
  const [baseHourlyRate, setBaseHourlyRate] = React.useState("");

  const [payableLedgerId, setPayableLedgerId] = React.useState<number | null>(null);
  const [employeeDepartmentId, setEmployeeDepartmentId] = React.useState<number | null>(null);
  const [employeeProjectId, setEmployeeProjectId] = React.useState<number | null>(null);
  const [employeeSegmentId, setEmployeeSegmentId] = React.useState<number | null>(null);

  const [applyTds, setApplyTds] = React.useState(false);
  const [tdsPercent, setTdsPercent] = React.useState("1.0");
  const [salaryPrefillSource, setSalaryPrefillSource] = React.useState<"designation" | null>(null);

  const [ledgers, setLedgers] = React.useState<Ledger[] | null>(null);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [projects, setProjects] = React.useState<Project[]>([]);
  const [segments, setSegments] = React.useState<Segment[]>([]);

  const [auxLoading, setAuxLoading] = React.useState(false);
  const [auxError, setAuxError] = React.useState<string | null>(null);

  const [newEmployeeTypeName, setNewEmployeeTypeName] = React.useState("");
  const [newEmployeeTypeCode, setNewEmployeeTypeCode] = React.useState("");
  const [employeeTypeModalOpen, setEmployeeTypeModalOpen] = React.useState(false);

  const [designationModalOpen, setDesignationModalOpen] = React.useState(false);
  const [newDesignationName, setNewDesignationName] = React.useState("");
  const [newDesignationCode, setNewDesignationCode] = React.useState("");

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleDownloadTemplate = async () => {
    try {
      const response = await api.get(`/payroll/companies/${companyId}/employees/export-template`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "employee_template.xlsx");
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (e) {
      showToast({ title: "Failed to download template", variant: "error" });
    }
  };

  const handleUploadExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post(`/payroll/companies/${companyId}/employees/import-excel`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      showToast({ 
        title: "Import complete", 
        description: res.data?.detail || "Employees imported successfully", 
        variant: "success" 
      });
      refetch();
    } catch (err: any) {
      showToast({ 
        title: "Import failed", 
        description: getApiErrorMessage(err), 
        variant: "error" 
      });
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };


  const handleCreateEmployeeType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmployeeTypeName.trim()) return;
    try {
      const created = await createEmployeeType.mutateAsync({
        name: newEmployeeTypeName,
        code: newEmployeeTypeCode,
        is_active: true,
      });
      showToast({ title: "Employee Type created", variant: "success" });
      setEmployeeTypeModalOpen(false);
      setNewEmployeeTypeName("");
      setNewEmployeeTypeCode("");
      setEmployeeTypeId(created.id);
    } catch (err: any) {
      showToast({ title: "Failed to create Employee Type", variant: "error" });
    }
  };

  const handleCreateDesignation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDesignationName.trim()) return;
    try {
      const created = await createDesignation.mutateAsync({
        name: newDesignationName,
        code: newDesignationCode,
        is_active: true,
      });
      showToast({ title: "Designation created", variant: "success" });
      setDesignationModalOpen(false);
      setNewDesignationName("");
      setNewDesignationCode("");
      setEmployeeDesignationId(created.id);
    } catch (err: any) {
      showToast({ title: "Failed to create Designation", variant: "error" });
    }
  };


  const resetForm = () => {
    setEditing(null);
    setFullName("");
    setCode("");
    setGrade("");
    setGradeNumber("");
    setGender("");
    setMaritalStatus("");
    setEmail("");
    setPhone("");
    setDob("");
    setPan("");

    setJoinDate("");
    setEndDate("");

    setEmployeePayrollMode("MONTHLY");
    setSalaryMode("PRO_RATA");
    setEmployeeTypeId(null);
    setEmployeeDesignationId(null);
    setBaseMonthlySalary("");

    setBaseDailyWage("");
    setBaseHourlyRate("");
    setPayableLedgerId(null);
    setEmployeeDepartmentId(null);
    setEmployeeProjectId(null);
    setEmployeeSegmentId(null);
    setApplyTds(false);
    setTdsPercent("1.0");
    setSalaryPrefillSource(null);
    setSubmitError(null);
    setFieldErrors({});
  };

  const openCreate = () => {
    resetForm();
    setDrawerOpen(true);
  };

  const openExtraPayheads = (emp: EmployeeRead) => {
    setExtraPhEmployee(emp);
    setExtraPhEditingLine(null);
    setExtraPhPayheadId("");
    setExtraPhAmount("");
    setExtraPhFormula("");
    setExtraPhSortOrder("100");
    setExtraPhError(null);
    setExtraPhDrawerOpen(true);
  };

  const resetExtraPhForm = () => {
    setExtraPhEditingLine(null);
    setExtraPhPayheadId("");
    setExtraPhAmount("");
    setExtraPhFormula("");
    setExtraPhSortOrder("100");
    setExtraPhError(null);
  };

  const openExtraPhEdit = (line: EmployeeExtraPayheadRead) => {
    setExtraPhEditingLine(line);
    setExtraPhPayheadId(String(line.payhead_id));
    setExtraPhAmount(line.amount != null ? String(line.amount) : "");
    setExtraPhFormula(line.formula ?? "");
    setExtraPhSortOrder(String(line.sort_order));
    setExtraPhError(null);
  };

  const handleExtraPhSave = async () => {
    if (!extraPhPayheadId) {
      setExtraPhError("Please select a pay head.");
      return;
    }
    if (!extraPhAmount.trim() && !extraPhFormula.trim()) {
      setExtraPhError("Provide either an amount or a formula.");
      return;
    }
    setExtraPhError(null);
    try {
      const payload = {
        payhead_id: Number(extraPhPayheadId),
        amount: extraPhAmount.trim() ? Number(extraPhAmount) : null,
        formula: extraPhFormula.trim() || null,
        sort_order: extraPhSortOrder.trim() ? Number(extraPhSortOrder) : 100,
      };
      if (extraPhEditingLine) {
        await updateExtraPayhead.mutateAsync({ lineId: extraPhEditingLine.id, payload });
        showToast({ title: "Extra pay head updated", variant: "success" });
      } else {
        await addExtraPayhead.mutateAsync(payload);
        showToast({ title: "Extra pay head added", variant: "success" });
      }
      resetExtraPhForm();
    } catch (err: any) {
      setExtraPhError(getApiErrorMessage(err) ?? "Failed to save");
    }
  };

  const handleExtraPhDelete = async (lineId: number) => {
    try {
      await deleteExtraPayhead.mutateAsync(lineId);
      showToast({ title: "Removed", variant: "success" });
      if (extraPhEditingLine?.id === lineId) resetExtraPhForm();
    } catch {
      showToast({ title: "Failed to remove", variant: "error" });
    }
  };

  const openEdit = (emp: EmployeeRead) => {
    setEditing(emp);
    setFullName(emp.full_name || "");
    setCode(emp.code || "");
    setGrade(emp.grade || "");
    setGradeNumber(emp.grade_number != null ? String(emp.grade_number) : "");
    setGender(emp.gender || "");
    setMaritalStatus(emp.marital_status || "");
    setEmail(emp.email || "");
    setPhone(emp.phone || "");
    setDob(toDateInputValue(emp.dob));
    setPan(emp.pan || "");
    setJoinDate(toDateInputValue(emp.join_date));

    setEndDate(toDateInputValue(emp.end_date));

    setEmployeePayrollMode(emp.payroll_mode || "MONTHLY");
    setSalaryMode(emp.salary_mode || "PRO_RATA");
    setEmployeeTypeId(emp.employee_type_id ?? null);
    setEmployeeDesignationId(emp.designation_id ?? null);
    setBaseMonthlySalary(emp.base_monthly_salary != null ? String(emp.base_monthly_salary) : "");

    setBaseDailyWage(emp.base_daily_wage != null ? String(emp.base_daily_wage) : "");
    setBaseHourlyRate(emp.base_hourly_rate != null ? String(emp.base_hourly_rate) : "");
    setPayableLedgerId(emp.payable_ledger_id != null ? Number(emp.payable_ledger_id) : null);
    setEmployeeDepartmentId(emp.department_id != null ? Number(emp.department_id) : null);
    setEmployeeProjectId(emp.project_id != null ? Number(emp.project_id) : null);
    setEmployeeSegmentId(emp.segment_id != null ? Number(emp.segment_id) : null);
    setApplyTds(!!emp.apply_tds);
    setTdsPercent(emp.tds_percent != null ? String(emp.tds_percent) : "1.0");
    setSalaryPrefillSource(null);
    setSubmitError(null);
    setFieldErrors({});
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    if (createEmployee.isPending || updateEmployee.isPending) return;
    setDrawerOpen(false);
  };

  React.useEffect(() => {
    let mounted = true;
    if (!isValidCompanyId) return;
    setAuxLoading(true);
    setAuxError(null);
    Promise.all([
      api.get(`/ledgers/companies/${companyId}/ledgers`).then((r) => r.data as Ledger[]),
      api.get(`/companies/${companyId}/departments`).then((r) => r.data as Department[]),
      api.get(`/companies/${companyId}/projects`).then((r) => r.data as Project[]),
      api.get(`/companies/${companyId}/segments`).then((r) => r.data as Segment[]),
    ])
      .then(([ledgerList, deptList, projList, segList]) => {
        if (!mounted) return;
        setLedgers(Array.isArray(ledgerList) ? ledgerList : []);
        setDepartments(Array.isArray(deptList) ? deptList : []);
        setProjects(Array.isArray(projList) ? projList : []);
        setSegments(Array.isArray(segList) ? segList : []);
      })
      .catch((e) => {
        if (!mounted) return;
        setAuxError(getApiErrorMessage(e));
      })
      .finally(() => {
        if (!mounted) return;
        setAuxLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [companyId, isValidCompanyId]);

  // Lookup map for full designation objects (needed for salary/grade prefill)
  const designationById = React.useMemo(() => {
    const map = new Map<number, DesignationRead>();
    (designations || []).forEach((d) => map.set(d.id, d));
    return map;
  }, [designations]);

  // Auto-fill salary & show grade rate info when designation changes
  React.useEffect(() => {
    if (!drawerOpen) return;
    if (!employeeDesignationId) {
      // Designation cleared — remove the prefill hint but keep any manually typed salary
      if (salaryPrefillSource === "designation") {
        setBaseMonthlySalary("");
        setSalaryPrefillSource(null);
      }
      return;
    }
    const desg = designationById.get(employeeDesignationId);
    if (!desg) return;

    // Only prefill salary if the field is currently empty (don't overwrite user input)
    if (desg.base_monthly_salary != null && baseMonthlySalary === "") {
      setBaseMonthlySalary(String(desg.base_monthly_salary));
      setSalaryPrefillSource("designation");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employeeDesignationId, drawerOpen]);

  const departmentNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    departments.forEach((d) => map.set(Number(d.id), String(d.name || "")));
    return map;
  }, [departments]);

  const employeeTypeNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (employeeTypes || []).forEach((t) => map.set(t.id, t.name));
    return map;
  }, [employeeTypes]);

  const designationNameById = React.useMemo(() => {
    const map = new Map<number, string>();
    (designations || []).forEach((d) => map.set(d.id, d.name));
    return map;
  }, [designations]);


  const filtered = React.useMemo(() => {
    const list = (employees || []) as EmployeeRead[];
    const term = q.trim().toLowerCase();
    return list
      .filter((e) => {
        if (activeFilter !== "ALL") {
          const active = e.end_date ? false : true;
          if (activeFilter === "ACTIVE" && !active) return false;
          if (activeFilter === "INACTIVE" && active) return false;
        }
        if (payrollMode !== "ALL" && e.payroll_mode !== payrollMode) return false;
        if (departmentId !== "ALL") {
          if (String(e.department_id ?? "") !== String(departmentId)) return false;
        }
        if (!term) return true;
        const hay = `${e.full_name || ""} ${e.code || ""}`.toLowerCase();
        return hay.includes(term);
      })
      .sort((a, b) => String(a.full_name || "").localeCompare(String(b.full_name || "")));
  }, [employees, q, activeFilter, payrollMode, departmentId]);

  const columns = React.useMemo((): DataTableColumn<EmployeeRead>[] => {
    return [
      {
        id: "name",
        header: "Employee",
        accessor: (row) => (
          <div className="space-y-0.5">
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {row.full_name}
            </div>
            <div className="text-[11px] text-slate-500">
              {row.code ? `Code: ${row.code}` : ""}
            </div>
          </div>
        ),
      },
      {
        id: "designation",
        header: "Designation",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.designation_id ? designationNameById.get(Number(row.designation_id)) || "" : ""}
          </span>
        ),
      },
      {
        id: "type",
        header: "Employee Type",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.employee_type_id ? employeeTypeNameById.get(Number(row.employee_type_id)) || "" : ""}
          </span>
        ),
      },
      {
        id: "mode",

        header: "Mode",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.payroll_mode}
          </span>
        ),
      },
      {
        id: "phone",
        header: "Phone",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.phone || ""}
          </span>
        ),
      },
      {
        id: "department",
        header: "Department",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">
            {row.department_id ? departmentNameById.get(Number(row.department_id)) || "" : ""}
          </span>
        ),
      },
      {
        id: "join",
        header: "Join Date",
        accessor: (row) => (
          <span className="text-xs text-slate-700 dark:text-slate-200">{toDateInputValue(row.join_date) || ""}</span>
        ),
      },
      {
        id: "end",
        header: "Status",
        accessor: (row) => {
          const active = !row.end_date;
          return (
            <span className={active ? "text-xs text-emerald-700" : "text-xs text-slate-500"}>
              {active ? "Active" : "Inactive"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "",
        justify: "right",
        accessor: (row) => (
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => openExtraPayheads(row)} title="Extra Pay Heads">
              + Pay Heads
            </Button>
            <Button size="sm" variant="outline" onClick={() => openEdit(row)}>
              Edit
            </Button>
          </div>
        ),
      },
    ];
  }, [departmentNameById, designationNameById, employeeTypeNameById]);

  const validateForm = (): boolean => {
    const next: Record<string, string> = {};
    if (!fullName.trim()) next.full_name = "Full name is required";
    if (isAdminLike && !payableLedgerId) next.payable_ledger_id = "Payable ledger is required";
    if (endDate && joinDate && endDate < joinDate) next.end_date = "End date cannot be before join date";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSave = async () => {
    setSubmitError(null);
    setFieldErrors({});

    if (!validateForm()) return;

    const payload: EmployeeCreate = {
      full_name: fullName.trim(),
      code: code.trim() ? code.trim() : null,
      grade: grade.trim() ? grade.trim() : null,
      grade_number: gradeNumber.trim() ? (parseInt(gradeNumber.trim(), 10) || null) : null,
      gender: gender ? gender : null,
      marital_status: maritalStatus ? maritalStatus : null,
      email: email.trim() ? email.trim() : null,
      phone: phone.trim() ? phone.trim() : null,
      dob: dob.trim() ? dob.trim() : null,
      pan: pan.trim() ? pan.trim() : null,
      join_date: joinDate.trim() ? joinDate.trim() : null,

      end_date: endDate.trim() ? endDate.trim() : null,

      payroll_mode: employeePayrollMode,
      salary_mode: salaryMode,
      employee_type_id: employeeTypeId,
      designation_id: employeeDesignationId,
      base_monthly_salary: toNumberOrNull(baseMonthlySalary),

      base_daily_wage: toNumberOrNull(baseDailyWage),
      base_hourly_rate: toNumberOrNull(baseHourlyRate),
      payable_ledger_id: payableLedgerId,
      department_id: employeeDepartmentId,
      project_id: employeeProjectId,
      segment_id: employeeSegmentId,
      apply_tds: applyTds,
      tds_percent: Number(tdsPercent) || 1.0,
    };

    if (!isAdminLike && !payableLedgerId) {
      showToast({
        title: "Payable ledger missing",
        description: "Voucher posting will be blocked until a payable ledger is set for this employee.",
        variant: "warning",
      });
    }

    try {
      if (editing) {
        await updateEmployee.mutateAsync({ employeeId: editing.id, payload });
        showToast({ title: "Employee updated", variant: "success" });
      } else {
        await createEmployee.mutateAsync(payload);
        showToast({ title: "Employee created", variant: "success" });
      }
      setDrawerOpen(false);
      resetForm();
    } catch (e: any) {
      const status = e?.response?.status;
      const detail = e?.response?.data?.detail;

      if (status === 400 && typeof detail === "string" && detail.includes("Duplicate")) {
        setFieldErrors({ code: detail });
        setSubmitError(null);
      } else if (status === 422 && Array.isArray(detail)) {
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
        title="Employees"
        subtitle="Create and manage payroll employees."
        closeLink={`/companies/${companyId}/payroll`}
        actions={
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
              Download
            </Button>
            <Button size="sm" variant="outline" onClick={() => fileInputRef.current?.click()} className="relative">
              Upload
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept=".xlsx,.xls"
                onChange={handleUploadExcel}
              />
            </Button>
            <Button size="sm" onClick={openCreate}>
              New Employee
            </Button>
          </div>
        }
      />

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
          <FormField
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name or code..."
            label="Search"
      />

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Payroll Mode</label>
            <Select value={payrollMode} onChange={(e) => setPayrollMode(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="MONTHLY">Monthly</option>
              <option value="DAILY">Daily</option>
              <option value="HOURLY">Hourly</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Status</label>
            <Select value={activeFilter} onChange={(e) => setActiveFilter(e.target.value as any)}>
              <option value="ALL">All</option>
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
            </Select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-700 dark:text-slate-200">Department</label>
            <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
              <option value="ALL">All</option>
              {departments
                .slice()
                .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")))
                .map((d) => (
                  <option key={d.id} value={String(d.id)}>
                    {d.name}
                  </option>
                ))}
            </Select>
          </div>
        </div>

        {error && <div className="text-xs text-critical-600">{String((error as any)?.message || "Failed to load employees")}</div>}

        {auxError && <div className="text-xs text-critical-600">{auxError}</div>}

        <DataTable
          columns={columns}
          data={filtered}
          getRowKey={(row) => row.id}
          emptyMessage={isLoading ? "Loading..." : "No employees found."}
      />
      </Card>

      <Drawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={editing ? "Edit Employee" : "New Employee"}
        widthClassName="max-w-3xl w-full"
      >

        <div className="space-y-8 py-2 pb-24">
          {submitError && (
            <div className="p-3 bg-critical-50 dark:bg-critical-900/20 border border-critical-200 dark:border-critical-800 rounded-md text-xs text-critical-600 dark:text-critical-400">
              {submitError}
            </div>
          )}

          {/* Section 1: Identity & Role */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
              Identity & Role
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <FormField label="Full Name" error={fieldErrors.full_name}>
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full name" />
                </FormField>
              </div>

              <FormField label="Employee ID / Code" error={fieldErrors.code}>
                <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. EMP-001" />
              </FormField>

              <FormField label="Designation">
                <div className="flex gap-1">
                  <Select
                    value={employeeDesignationId ?? ""}
                    onChange={(e) => {
                      const newId = toNumberOrNull(e.target.value);
                      // If clearing designation, reset prefill state
                      if (!newId && salaryPrefillSource === "designation") {
                        setBaseMonthlySalary("");
                        setSalaryPrefillSource(null);
                      }
                      setEmployeeDesignationId(newId);
                    }}
                    className="flex-1"
                  >
                    <option value="">Select Designation</option>
                    {(designations || []).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                        {d.base_monthly_salary != null ? ` — ${Number(d.base_monthly_salary).toLocaleString()}` : ""}
                      </option>
                    ))}
                  </Select>
                  <Button variant="outline" size="sm" type="button" onClick={() => setDesignationModalOpen(true)} className="px-2">
                    +
                  </Button>
                </div>
                {(() => {
                  const desg = employeeDesignationId ? designationById.get(employeeDesignationId) : null;
                  if (!desg || (desg.base_monthly_salary == null && desg.grade_rate == null)) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap gap-2">
                      {desg.base_monthly_salary != null && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-300 border border-brand-200 dark:border-brand-700">
                          Salary: {Number(desg.base_monthly_salary).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                      {desg.grade_rate != null && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-700">
                          Grade Rate: {Number(desg.grade_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      )}
                    </div>
                  );
                })()}
              </FormField>

              <FormField label="Grade Number">
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={gradeNumber}
                  onChange={(e) => setGradeNumber(e.target.value)}
                  placeholder="e.g. 3"
                />
                <p className="text-[11px] text-slate-400 mt-0.5">
                  GRADE = Grade Number × designation Grade Rate
                </p>
              </FormField>

              <FormField label="Grade Label (text)">
                <Input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="e.g. Senior, A1" />
              </FormField>

              <FormField label="Gender">
                <Select value={gender} onChange={(e) => setGender(e.target.value)}>
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </Select>
              </FormField>

              <FormField label="Marital Status">
                <Select value={maritalStatus} onChange={(e) => setMaritalStatus(e.target.value)}>
                  <option value="">Select Status</option>
                  <option value="Married">Married</option>
                  <option value="Unmarried">Unmarried</option>
                </Select>
              </FormField>


              <FormField label="Employee Type">
                <div className="flex gap-1">
                  <Select
                    value={employeeTypeId ?? ""}
                    onChange={(e) => setEmployeeTypeId(toNumberOrNull(e.target.value))}
                    className="flex-1"
                  >
                    <option value="">Select Type</option>
                    {(employeeTypes || []).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                  <Button variant="outline" size="sm" type="button" onClick={() => setEmployeeTypeModalOpen(true)} className="px-2">
                    +
                  </Button>
                </div>
              </FormField>
            </div>
          </section>

          {/* Section 2: Contact & Tenure */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500"></span>
              Contact & Tenure
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-2">
                <FormField label="Email Address">
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@example.com" />
                </FormField>
              </div>
              <div className="lg:col-span-2">
                <FormField label="Phone Number">
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+977-..." />
                </FormField>
              </div>

              <FormField label="Date of Birth">
                <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} />
              </FormField>

              <FormField label="PAN">
                <Input value={pan} onChange={(e) => setPan(e.target.value)} placeholder="PAN number" />
              </FormField>

              <FormField label="Join Date" error={fieldErrors.join_date}>
                <Input type="date" value={joinDate} onChange={(e) => setJoinDate(e.target.value)} />
              </FormField>

              <FormField label="End Date" error={fieldErrors.end_date}>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </FormField>
            </div>
          </section>


          {/* Section 3: Payroll & Financials */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Payroll & Financials
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="Payroll Mode" required>
                <Select value={employeePayrollMode} onChange={(e) => setEmployeePayrollMode(e.target.value as PayrollMode)}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="DAILY">Daily</option>
                  <option value="HOURLY">Hourly</option>
                </Select>
              </FormField>

              <FormField label="Salary Mode" required>
                <Select value={salaryMode} onChange={(e) => setSalaryMode(e.target.value as SalaryMode)}>
                  <option value="PRO_RATA">Pro-Rata (attendance-based)</option>
                  <option value="HYBRID">Hybrid (full salary, deduct absents)</option>
                  <option value="FIXED">Fixed (full salary, ignore attendance)</option>
                </Select>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {salaryMode === "PRO_RATA" && "BASIC = (salary ÷ days) × payable days"}
                  {salaryMode === "HYBRID" && "BASIC = full salary; absent days deducted from attendance"}
                  {salaryMode === "FIXED" && "BASIC = full salary always; attendance ignored"}
                </p>
              </FormField>

              <div className="md:col-span-2">
                <FormField label="Payable Ledger" required={isAdminLike} error={fieldErrors.payable_ledger_id}>
                  {ledgers && (
                    <LedgerSelectDropdown
                      ledgers={ledgers}
                      value={payableLedgerId}
                      onChange={setPayableLedgerId}
                      placeholder="Select ledger for salary payable"
                    />
                  )}
                </FormField>
              </div>

              {employeePayrollMode === "MONTHLY" && (
                <FormField label="Monthly Salary" error={fieldErrors.base_monthly_salary}>
                  <Input
                    type="number"
                    value={baseMonthlySalary}
                    onChange={(e) => {
                      setBaseMonthlySalary(e.target.value);
                      if (salaryPrefillSource === "designation") setSalaryPrefillSource(null);
                    }}
                    placeholder="0.00"
                  />
                  {salaryPrefillSource === "designation" && (
                    <p className="mt-1 text-[11px] text-brand-600 dark:text-brand-400 flex items-center gap-1">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" /></svg>
                      Auto-filled from designation · you can override this
                    </p>
                  )}
                  {(() => {
                    const desg = employeeDesignationId ? designationById.get(employeeDesignationId) : null;
                    if (!desg || desg.grade_rate == null) return null;
                    return (
                      <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <svg className="w-3 h-3 text-amber-500" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg>
                        Grade Rate from designation: <span className="font-semibold text-amber-600 dark:text-amber-400">{Number(desg.grade_rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                        <span className="text-slate-400">(applied as GRADE payhead)</span>
                      </p>
                    );
                  })()}
                </FormField>
              )}
              {employeePayrollMode === "DAILY" && (
                <FormField label="Daily Wage" error={fieldErrors.base_daily_wage}>
                  <Input type="number" value={baseDailyWage} onChange={(e) => setBaseDailyWage(e.target.value)} placeholder="0.00" />
                </FormField>
              )}
              {employeePayrollMode === "HOURLY" && (
                <FormField label="Hourly Rate" error={fieldErrors.base_hourly_rate}>
                  <Input type="number" value={baseHourlyRate} onChange={(e) => setBaseHourlyRate(e.target.value)} placeholder="0.00" />
                </FormField>
              )}

              <div className="flex flex-col justify-end pb-1.5">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                    checked={applyTds}
                    onChange={(e) => setApplyTds(e.target.checked)}
                  />
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">Deduct TDS</span>
                </label>
              </div>

              {applyTds && (
                <FormField label="TDS Percentage (%)">
                  <Input type="number" value={tdsPercent} onChange={(e) => setTdsPercent(e.target.value)} placeholder="1.0" />
                </FormField>
              )}
            </div>
          </section>

          {/* Section 4: Organization / Cost Centers */}
          <section className="space-y-4">
            <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
              Organization & Cost Centers
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <FormField label="Department">
                <Select
                  value={employeeDepartmentId ?? ""}
                  onChange={(e) => setEmployeeDepartmentId(toNumberOrNull(e.target.value))}
                >
                  <option value="">None</option>
                  {(departments || []).map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Project">
                <Select
                  value={employeeProjectId ?? ""}
                  onChange={(e) => setEmployeeProjectId(toNumberOrNull(e.target.value))}
                >
                  <option value="">None</option>
                  {(projects || []).map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </Select>
              </FormField>

              <FormField label="Segment">
                <Select
                  value={employeeSegmentId ?? ""}
                  onChange={(e) => setEmployeeSegmentId(toNumberOrNull(e.target.value))}
                >
                  <option value="">None</option>
                  {(segments || []).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </FormField>
            </div>
          </section>

          <div className="fixed bottom-0 right-0 left-0 md:left-auto md:w-[768px] bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800 p-4 flex justify-end gap-3 z-50">
            <Button variant="outline" onClick={closeDrawer} disabled={createEmployee.isPending || updateEmployee.isPending}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              isLoading={createEmployee.isPending || updateEmployee.isPending}
              className="px-8"
            >
              {editing ? "Update Employee" : "Create Employee"}
            </Button>
          </div>
        </div>
      </Drawer>


      {/* Extra Pay Heads drawer */}
      <Drawer
        open={extraPhDrawerOpen}
        onClose={() => { setExtraPhDrawerOpen(false); resetExtraPhForm(); }}
        title={`Extra Pay Heads — ${extraPhEmployee?.full_name ?? ""}`}
        description="Add pay heads specific to this employee, applied on top of the designation template."
        size="md"
      >
        <div className="p-4 space-y-6">
          {/* Existing extra pay heads list */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Current Extra Pay Heads</p>
            {extraPhLoading ? (
              <p className="text-sm text-slate-400">Loading…</p>
            ) : !extraPayheads?.length ? (
              <p className="text-sm text-slate-400 italic">No extra pay heads added yet.</p>
            ) : (
              <div className="space-y-2">
                {extraPayheads.map((line) => {
                  const ph = (payheads ?? []).find((p) => p.id === line.payhead_id);
                  return (
                    <div
                      key={line.id}
                      className="flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                    >
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">
                          {ph?.name ?? `Payhead #${line.payhead_id}`}
                          <span className="ml-2 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500">
                            {ph?.type ?? ""}
                          </span>
                        </span>
                        <span className="text-xs text-slate-400">
                          {line.formula ? `Formula: ${line.formula}` : line.amount != null ? `Fixed: ${Number(line.amount).toLocaleString()}` : "—"}
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openExtraPhEdit(line)}>
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-red-500 hover:text-red-700"
                          onClick={() => handleExtraPhDelete(line.id)}
                          isLoading={deleteExtraPayhead.isPending}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Add / Edit form */}
          <div className="space-y-4 border-t border-slate-100 dark:border-slate-800 pt-4">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              {extraPhEditingLine ? "Edit Pay Head" : "Add Pay Head"}
            </p>

            {extraPhError && (
              <p className="text-sm text-red-500">{extraPhError}</p>
            )}

            <FormField label="Pay Head" required>
              <select
                value={extraPhPayheadId}
                onChange={(e) => setExtraPhPayheadId(e.target.value)}
                disabled={!!extraPhEditingLine}
                className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50"
              >
                <option value="">Select pay head…</option>
                {(payheads ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.type})
                  </option>
                ))}
              </select>
            </FormField>

            <FormField label="Fixed Amount">
              <Input
                type="number"
                step="0.01"
                value={extraPhAmount}
                onChange={(e) => setExtraPhAmount(e.target.value)}
                placeholder="e.g. 1500.00"
              />
            </FormField>

            <FormField label="Formula (overrides amount if set)">
              <Input
                value={extraPhFormula}
                onChange={(e) => setExtraPhFormula(e.target.value)}
                placeholder="e.g. BASIC * 0.10"
              />
              <p className="text-[11px] text-slate-400 mt-0.5">
                Variables: BASIC, GRADE, BASE_MONTHLY_SALARY, PAYABLE_DAYS, etc.
              </p>
            </FormField>

            <FormField label="Sort Order">
              <Input
                type="number"
                step="1"
                value={extraPhSortOrder}
                onChange={(e) => setExtraPhSortOrder(e.target.value)}
                placeholder="100"
              />
            </FormField>

            <div className="flex gap-2 pt-1">
              {extraPhEditingLine && (
                <Button variant="outline" size="sm" onClick={resetExtraPhForm}>
                  Cancel Edit
                </Button>
              )}
              <Button
                onClick={handleExtraPhSave}
                isLoading={addExtraPayhead.isPending || updateExtraPayhead.isPending}
                size="sm"
              >
                {extraPhEditingLine ? "Update" : "Add Pay Head"}
              </Button>
            </div>
          </div>
        </div>
      </Drawer>

      <Modal open={employeeTypeModalOpen} onClose={() => setEmployeeTypeModalOpen(false)} title="New Employee Type">
        <form onSubmit={handleCreateEmployeeType} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="typeName" className="text-sm font-medium leading-none">Name *</label>
            <Input 
              id="typeName" 
              required 
              value={newEmployeeTypeName} 
              onChange={(e) => setNewEmployeeTypeName(e.target.value)} 
              placeholder="e.g. Intern" 
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="typeCode" className="text-sm font-medium leading-none">Code</label>
            <Input 
              id="typeCode" 
              value={newEmployeeTypeCode} 
              onChange={(e) => setNewEmployeeTypeCode(e.target.value)} 
              placeholder="e.g. EMP-INT" 
            />
          </div>
          <div className="flex justify-end space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={() => setEmployeeTypeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createEmployeeType.isPending}>
              {createEmployeeType.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={designationModalOpen}
        onClose={() => setDesignationModalOpen(false)}
        title="Create New Designation"
        size="sm"
      >

        <form onSubmit={handleCreateDesignation} className="space-y-4 pt-2">
          <FormField label="Designation Name" required>
            <Input
              value={newDesignationName}
              onChange={(e) => setNewDesignationName(e.target.value)}
              placeholder="e.g. Software Engineer"
              autoFocus
            />
          </FormField>
          <FormField label="Designation Code">
            <Input
              value={newDesignationCode}
              onChange={(e) => setNewDesignationCode(e.target.value)}
              placeholder="e.g. SE"
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" type="button" onClick={() => setDesignationModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createDesignation.isPending || !newDesignationName.trim()}>
              {createDesignation.isPending ? "Creating..." : "Create Designation"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}


