import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { PayrollApi } from "@/lib/payroll/api";
import type {
  AttendanceDailyManualFix,
  DeviceUserCreate,
  EmployeeCreate,
  EmployeeExtraPayheadCreate,
  EmployeeExtraPayheadUpdate,
  LeaveRequestCreate,
  LeaveTypeCreate,
  PayheadCreate,
  PayStructureCreate,
  PayStructureLineCreate,
  PayrollFormulaPreviewRequest,
  PayStructureLineRead,
  PayStructureRead,
  PayrollRunCreate,
  PayslipOverrideRequest,
  ShiftAssignmentCreate,
  ShiftCreate,
  DeviceCreate,
  DesignationCreate,
  DesignationRead,
  DesignationUpdate,
  DesignationTemplateLineCreate,
  DesignationTemplateLineUpdate,
} from "@/lib/payroll/types";



export function payrollKey(companyId: number) {
  return ["payroll", companyId] as const;
}

export function employeesKey(companyId: number) {
  return ["payroll", companyId, "employees"] as const;
}

export function payheadsKey(companyId: number) {
  return ["payroll", companyId, "payheads"] as const;
}

export function shiftsKey(companyId: number) {
  return ["payroll", companyId, "shifts"] as const;
}

export function shiftAssignmentsKey(companyId: number, args: { employee_id?: number }) {
  return ["payroll", companyId, "shiftAssignments", args] as const;
}

export function devicesKey(companyId: number) {
  return ["payroll", companyId, "devices"] as const;
}

export function deviceUsersKey(companyId: number, args: { device_id?: number; employee_id?: number }) {
  return ["payroll", companyId, "deviceUsers", args] as const;
}

export function attendanceDailyKey(
  companyId: number,
  args: { start: string; end: string; employee_id?: number; status?: string }
) {
  return ["payroll", companyId, "attendanceDaily", args] as const;
}

export function leaveTypesKey(companyId: number) {
  return ["payroll", companyId, "leaveTypes"] as const;
}

export function designationsKey(companyId: number) {
  return ["payroll", companyId, "designations"] as const;
}


export function leaveRequestsKey(
  companyId: number,
  args: { employee_id?: number; status?: string; start?: string; end?: string }
) {
  return ["payroll", companyId, "leaveRequests", args] as const;
}

export function payStructuresKey(companyId: number, args: { employee_id?: number; is_active?: boolean }) {
  return ["payroll", companyId, "payStructures", args] as const;
}

export function payStructureKey(companyId: number, structureId: number) {
  return ["payroll", companyId, "payStructure", structureId] as const;
}

export function payrollRunKey(companyId: number, runId: number) {
  return ["payroll", companyId, "run", runId] as const;
}

export function payslipsKey(companyId: number, runId: number) {
  return ["payroll", companyId, "run", runId, "payslips"] as const;
}

export function payrollRunsKey(companyId: number) {
  return ["payroll", companyId, "runs"] as const;
}

export function useEmployees(companyId: number) {
  return useQuery({
    queryKey: employeesKey(companyId),
    queryFn: () => PayrollApi.listEmployees(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useDesignations(companyId: number) {
  return useQuery({
    queryKey: designationsKey(companyId),
    queryFn: () => PayrollApi.listDesignations(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateDesignation(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DesignationCreate) => PayrollApi.createDesignation(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: designationsKey(companyId) });
    },
  });
}


export function useUpdateDesignation(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: DesignationUpdate }) => 
      PayrollApi.updateDesignation(companyId, id, data),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: designationsKey(companyId) });
    },
  });
}

export function useDeleteDesignation(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (designationId: number) => PayrollApi.deleteDesignation(companyId, designationId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: designationsKey(companyId) });
    },
  });
}

export function designationTemplateLinesKey(companyId: number, designationId: number) {
  return ["payroll", companyId, "designations", designationId, "template"] as const;
}

export function useDesignationTemplateLines(companyId: number, designationId: number) {
  return useQuery({
    queryKey: designationTemplateLinesKey(companyId, designationId),
    queryFn: () => PayrollApi.listDesignationTemplateLines(companyId, designationId),
    enabled: Number.isFinite(companyId) && companyId > 0 && designationId > 0,
  });
}

export function useAddDesignationTemplateLine(companyId: number, designationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DesignationTemplateLineCreate) =>
      PayrollApi.addDesignationTemplateLine(companyId, designationId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: designationTemplateLinesKey(companyId, designationId) });
      await qc.invalidateQueries({ queryKey: designationsKey(companyId) });
    },
  });
}

export function useUpdateDesignationTemplateLine(companyId: number, designationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, payload }: { lineId: number; payload: DesignationTemplateLineUpdate }) =>
      PayrollApi.updateDesignationTemplateLine(companyId, designationId, lineId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: designationTemplateLinesKey(companyId, designationId) });
    },
  });
}

export function useDeleteDesignationTemplateLine(companyId: number, designationId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: number) =>
      PayrollApi.deleteDesignationTemplateLine(companyId, designationId, lineId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: designationTemplateLinesKey(companyId, designationId) });
    },
  });
}

export function useApplyDesignationTemplate(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (designationId: number) =>
      PayrollApi.applyDesignationTemplate(companyId, designationId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function employeeExtraPayheadsKey(companyId: number, employeeId: number) {
  return ["payroll", companyId, "employees", employeeId, "extra-payheads"] as const;
}

export function useEmployeeExtraPayheads(companyId: number, employeeId: number | null) {
  return useQuery({
    queryKey: employeeExtraPayheadsKey(companyId, employeeId ?? 0),
    queryFn: () => PayrollApi.listEmployeeExtraPayheads(companyId, employeeId!),
    enabled: Number.isFinite(companyId) && companyId > 0 && employeeId != null && employeeId > 0,
  });
}

export function useAddEmployeeExtraPayhead(companyId: number, employeeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmployeeExtraPayheadCreate) =>
      PayrollApi.addEmployeeExtraPayhead(companyId, employeeId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: employeeExtraPayheadsKey(companyId, employeeId) });
    },
  });
}

export function useUpdateEmployeeExtraPayhead(companyId: number, employeeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, payload }: { lineId: number; payload: EmployeeExtraPayheadUpdate }) =>
      PayrollApi.updateEmployeeExtraPayhead(companyId, employeeId, lineId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: employeeExtraPayheadsKey(companyId, employeeId) });
    },
  });
}

export function useDeleteEmployeeExtraPayhead(companyId: number, employeeId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: number) =>
      PayrollApi.deleteEmployeeExtraPayhead(companyId, employeeId, lineId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: employeeExtraPayheadsKey(companyId, employeeId) });
    },
  });
}

export function useCreateEmployee(companyId: number) {

  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: EmployeeCreate) => PayrollApi.createEmployee(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: employeesKey(companyId) });
    },
  });
}

export function useUpdateEmployee(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { employeeId: number; payload: Partial<EmployeeCreate> }) =>
      PayrollApi.updateEmployee(companyId, args.employeeId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: employeesKey(companyId) });
    },
  });
}

export function usePayheads(companyId: number) {
  return useQuery({
    queryKey: payheadsKey(companyId),
    queryFn: () => PayrollApi.listPayheads(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreatePayhead(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PayheadCreate) => PayrollApi.createPayhead(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payheadsKey(companyId) });
    },
  });
}

export function useUpdatePayhead(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { payheadId: number; payload: Partial<PayheadCreate> }) =>
      PayrollApi.updatePayhead(companyId, args.payheadId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payheadsKey(companyId) });
    },
  });
}

export function useShifts(companyId: number) {
  return useQuery({
    queryKey: shiftsKey(companyId),
    queryFn: () => PayrollApi.listShifts(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateShift(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ShiftCreate) => PayrollApi.createShift(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: shiftsKey(companyId) });
    },
  });
}

export function useUpdateShift(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { shiftId: number; payload: Partial<ShiftCreate> }) =>
      PayrollApi.updateShift(companyId, args.shiftId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: shiftsKey(companyId) });
    },
  });
}

export function useDeleteShift(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (shiftId: number) => PayrollApi.deleteShift(companyId, shiftId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: shiftsKey(companyId) });
    },
  });
}

export function useShiftAssignments(companyId: number, args: { employee_id?: number }) {
  return useQuery({
    queryKey: shiftAssignmentsKey(companyId, args),
    queryFn: () => PayrollApi.listShiftAssignments(companyId, args),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateShiftAssignment(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: ShiftAssignmentCreate) => PayrollApi.createShiftAssignment(companyId, payload),
    onSuccess: async (_res, vars) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["payroll", companyId, "shiftAssignments"] }),
        qc.invalidateQueries({ queryKey: shiftAssignmentsKey(companyId, { employee_id: vars.employee_id }) }),
      ]);
    },
  });
}

export function useDeleteShiftAssignment(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (assignmentId: number) => PayrollApi.deleteShiftAssignment(companyId, assignmentId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "shiftAssignments"] });
    },
  });
}

export function useDevices(companyId: number) {
  return useQuery({
    queryKey: devicesKey(companyId),
    queryFn: () => PayrollApi.listDevices(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateDevice(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeviceCreate) => PayrollApi.createDevice(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: devicesKey(companyId) });
    },
  });
}

export function useDeviceUsers(companyId: number, args: { device_id?: number; employee_id?: number }) {
  return useQuery({
    queryKey: deviceUsersKey(companyId, args),
    queryFn: () => PayrollApi.listDeviceUsers(companyId, args),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateDeviceUser(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: DeviceUserCreate) => PayrollApi.createDeviceUser(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "deviceUsers"] });
    },
  });
}

export function useUpdateDeviceUser(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { deviceUserId: number; payload: Partial<DeviceUserCreate> }) =>
      PayrollApi.updateDeviceUser(companyId, args.deviceUserId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "deviceUsers"] });
    },
  });
}

export function useDeleteDeviceUser(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (deviceUserId: number) => PayrollApi.deleteDeviceUser(companyId, deviceUserId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "deviceUsers"] });
    },
  });
}

export function useAttendanceDaily(companyId: number, args: { start: string; end: string; employee_id?: number; status?: string }) {
  return useQuery({
    queryKey: attendanceDailyKey(companyId, args),
    queryFn: () => PayrollApi.listAttendanceDaily(companyId, args),
    enabled: Number.isFinite(companyId) && companyId > 0 && !!args.start && !!args.end,
  });
}

export function useRecomputeAttendanceDaily(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { start: string; end: string; employee_ids?: number[] }) => PayrollApi.recomputeAttendanceDaily(companyId, args),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "attendanceDaily"] });
    },
  });
}

export function useManualFixAttendanceDaily(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { employeeId: number; workDate: string; payload: AttendanceDailyManualFix }) =>
      PayrollApi.manualFixAttendanceDaily(companyId, args.employeeId, args.workDate, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "attendanceDaily"] });
    },
  });
}

export function useImportAttendanceCsv(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { device_id: number; file: File }) => PayrollApi.importAttendanceCsv(companyId, args),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "attendanceDaily"] });
    },
  });
}

export function useIngestAttendanceLogs(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: unknown) => PayrollApi.ingestAttendanceLogs(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "attendanceDaily"] });
    },
  });
}

export function useLeaveTypes(companyId: number) {
  return useQuery({
    queryKey: leaveTypesKey(companyId),
    queryFn: () => PayrollApi.listLeaveTypes(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useCreateLeaveType(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LeaveTypeCreate) => PayrollApi.createLeaveType(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: leaveTypesKey(companyId) });
    },
  });
}

export function useUpdateLeaveType(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { typeId: number; payload: Partial<LeaveTypeCreate> }) =>
      PayrollApi.updateLeaveType(companyId, args.typeId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: leaveTypesKey(companyId) });
    },
  });
}

export function useDeleteLeaveType(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (typeId: number) => PayrollApi.deleteLeaveType(companyId, typeId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: leaveTypesKey(companyId) });
    },
  });
}

export function useLeaveRequests(companyId: number, args: { employee_id?: number; status?: string; start?: string; end?: string }) {
  return useQuery({
    queryKey: leaveRequestsKey(companyId, args),
    queryFn: () => PayrollApi.listLeaveRequests(companyId, args),
    enabled: Number.isFinite(companyId) && companyId > 0,
    retry: (failureCount, error) => {
      const status = (error as AxiosError | undefined)?.response?.status;
      if (status === 403) return false;
      return failureCount < 2;
    },
  });
}

export function useCreateLeaveRequest(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: LeaveRequestCreate) => PayrollApi.createLeaveRequest(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "leaveRequests"] });
    },
  });
}

export function useApproveLeaveRequest(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; reason?: string | null }) => PayrollApi.approveLeaveRequest(companyId, args.id, { reason: args.reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "leaveRequests"] });
    },
  });
}

export function useRejectLeaveRequest(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: number; reason?: string | null }) => PayrollApi.rejectLeaveRequest(companyId, args.id, { reason: args.reason }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "leaveRequests"] });
    },
  });
}

export function usePayStructures(companyId: number, args: { employee_id?: number; is_active?: boolean }) {
  return useQuery({
    queryKey: payStructuresKey(companyId, args),
    queryFn: () => PayrollApi.listPayStructures(companyId, args),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function usePayStructure(companyId: number, structureId: number) {
  return useQuery({
    queryKey: payStructureKey(companyId, structureId),
    queryFn: async () => {
      const res = await PayrollApi.getPayStructure(companyId, structureId);
      return res as PayStructureRead & { lines?: PayStructureLineRead[] };
    },
    enabled: Number.isFinite(companyId) && companyId > 0 && Number.isFinite(structureId) && structureId > 0,
  });
}

export function useCreatePayStructure(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PayStructureCreate) => PayrollApi.createPayStructure(companyId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function useUpdatePayStructure(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { structureId: number; payload: Partial<PayStructureCreate> }) =>
      PayrollApi.updatePayStructure(companyId, args.structureId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function useDeletePayStructure(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (structureId: number) => PayrollApi.deletePayStructure(companyId, structureId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function useCreatePayStructureLine(companyId: number, structureId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PayStructureLineCreate) => PayrollApi.createPayStructureLine(companyId, structureId, payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function useUpdatePayStructureLine(companyId: number, structureId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { lineId: number; payload: Partial<PayStructureLineCreate> }) =>
      PayrollApi.updatePayStructureLine(companyId, structureId, args.lineId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function useDeletePayStructureLine(companyId: number, structureId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (lineId: number) => PayrollApi.deletePayStructureLine(companyId, structureId, lineId),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["payroll", companyId, "payStructures"] });
    },
  });
}

export function usePreviewPayrollFormula(companyId: number) {
  return useMutation({
    mutationFn: (payload: PayrollFormulaPreviewRequest) => PayrollApi.previewPayrollFormula(companyId, payload),
  });
}

export function useCreatePayrollRun(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: PayrollRunCreate) => PayrollApi.createPayrollRun(companyId, payload),
    onSuccess: async (run) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: payrollRunsKey(companyId) }),
        qc.setQueryData(payrollRunKey(companyId, run.id), run),
      ]);
    },
  });
}

export function usePayrollRuns(companyId: number) {
  return useQuery({
    queryKey: payrollRunsKey(companyId),
    queryFn: () => PayrollApi.listPayrollRuns(companyId),
    enabled: Number.isFinite(companyId) && companyId > 0,
  });
}

export function useComputePayrollRun(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { runId: number; payload?: unknown }) => PayrollApi.computePayrollRun(companyId, args.runId, args.payload),
    onSuccess: async (run) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: payrollRunsKey(companyId) }),
        qc.invalidateQueries({ queryKey: ["payroll", companyId, "run", run.run_id, "payslips"] }),
      ]);
    },
  });
}

export function useApprovePayrollRun(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (runId: number) => PayrollApi.approvePayrollRun(companyId, runId),
    onSuccess: async (run) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: payrollRunsKey(companyId) }),
        qc.setQueryData(payrollRunKey(companyId, run.id), run),
      ]);
    },
  });
}

export function useUnlockPayrollRun(companyId: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ runId, reason }: { runId: number; reason: string }) =>
      PayrollApi.unlockPayrollRun(companyId, runId, reason),
    onSuccess: (data, { runId }) => {
      queryClient.invalidateQueries({ queryKey: ["payroll", companyId, "runs"] });
      queryClient.invalidateQueries({ queryKey: ["payroll", companyId, "runs", runId] });
    },
  });
}

export function usePostPayrollVoucher(companyId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { runId: number; post_date: string }) => PayrollApi.postPayrollVoucher(companyId, args.runId, args.post_date),
    onSuccess: async (run) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: payrollRunsKey(companyId) }),
        qc.setQueryData(payrollRunKey(companyId, run.id), run),
      ]);
    },
  });
}

export function useExportPayslipJson(companyId: number, runId: number) {
  return useMutation({
    mutationFn: (employeeId: number) => PayrollApi.exportPayslipJson(companyId, runId, employeeId),
  });
}

export function usePayslips(companyId: number, runId: number) {
  return useQuery({
    queryKey: payslipsKey(companyId, runId),
    queryFn: () => PayrollApi.listPayslips(companyId, runId),
    enabled: Number.isFinite(companyId) && companyId > 0 && Number.isFinite(runId) && runId > 0,
  });
}

export function useOverridePayslip(companyId: number, runId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { employeeId: number; payload: PayslipOverrideRequest }) =>
      PayrollApi.overridePayslip(companyId, runId, args.employeeId, args.payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: payslipsKey(companyId, runId) });
    },
  });
}

export function useDownloadSalaryTemplateExcel(companyId: number, runId: number) {
  return useMutation({
    mutationFn: () => PayrollApi.downloadSalaryTemplateExcel(companyId, runId),
  });
}

export function useUploadSalaryExcel(companyId: number, runId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => PayrollApi.uploadSalaryExcel(companyId, runId, file),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: payrollRunsKey(companyId) }),
        qc.invalidateQueries({ queryKey: payrollRunKey(companyId, runId) }),
        qc.invalidateQueries({ queryKey: payslipsKey(companyId, runId) }),
      ]);
    },
  });
}
export function useSalarySheetData(companyId: number, runId?: number) {
  return useQuery({
    queryKey: ['payroll', companyId, 'runs', runId, 'salary-sheet-data'],
    queryFn: () => {
      if (!runId) return Promise.resolve(null);
      return PayrollApi.getSalarySheetData(companyId, runId);
    },
    enabled: !!runId,
  });
}

export function useUploadSalaryJson() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, runId, payload }: { companyId: number; runId: number; payload: { headers: string[]; rows: any[][] } }) =>
      PayrollApi.uploadSalaryJson(companyId, runId, payload),
    onSuccess: (_, { companyId, runId }) => {
      queryClient.invalidateQueries({ queryKey: ['payroll', companyId, 'runs'] });
      queryClient.invalidateQueries({ queryKey: ['payroll', companyId, 'runs', runId] });
    },
  });
}

export function useSalarySheetReport(companyId: number, params: any) {
  return useQuery({
    queryKey: ['payroll', companyId, 'reports', 'salary-sheet', params],
    queryFn: () => PayrollApi.getSalarySheetReport(companyId, params),
    enabled: !!companyId && !!params.year,
  });
}
