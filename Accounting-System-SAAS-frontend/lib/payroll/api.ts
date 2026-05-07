import { api, getApiErrorMessage } from "@/lib/api";
import type {
  AttendanceDailyManualFix,
  AttendanceDailyRead,
  AttendanceIngestResponse,
  DeviceCreate,
  DeviceRead,
  DeviceUserCreate,
  DeviceUserRead,
  EmployeeCreate,
  EmployeeRead,
  EmployeeExtraPayheadRead,
  EmployeeExtraPayheadCreate,
  EmployeeExtraPayheadUpdate,
  LeaveRequestCreate,
  LeaveRequestRead,
  LeaveTypeCreate,
  LeaveTypeRead,
  PayheadCreate,
  PayheadRead,
  PayStructureCreate,
  PayStructureLineCreate,
  PayStructureLineRead,
  PayStructureRead,
  PayrollFormulaPreviewRequest,
  PayrollFormulaPreviewResponse,
  PayrollRunCreate,
  PayrollRunComputeResponse,
  PayrollRunRead,
  PayslipExportJson,
  PayslipOverrideRequest,
  PayslipSummary,
  ShiftAssignmentCreate,
  ShiftAssignmentRead,
  ShiftCreate,
  ShiftRead,
  DesignationRead,
  DesignationCreate,
  DesignationUpdate,
  DesignationTemplateLineRead,
  DesignationTemplateLineCreate,
  DesignationTemplateLineUpdate,
} from "@/lib/payroll/types";


function buildQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === "") return;
    if (Array.isArray(v)) {
      if (!v.length) return;
      search.set(k, v.join(","));
      return;
    }
    search.set(k, String(v));
  });
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

function base(companyId: number) {
  return `/payroll/companies/${companyId}`;
}

export const PayrollApi = {
  async listEmployees(companyId: number): Promise<EmployeeRead[]> {
    const res = await api.get(`${base(companyId)}/employees`);
    return res.data;
  },

  async createEmployee(companyId: number, payload: EmployeeCreate): Promise<EmployeeRead> {
    const res = await api.post(`${base(companyId)}/employees`, payload);
    return res.data;
  },

  async updateEmployee(
    companyId: number,
    employeeId: number,
    payload: Partial<EmployeeCreate>
  ): Promise<EmployeeRead> {
    const res = await api.put(`${base(companyId)}/employees/${employeeId}`, payload);
    return res.data;
  },

  async listPayheads(companyId: number): Promise<PayheadRead[]> {
    const res = await api.get(`${base(companyId)}/payheads`);
    return res.data;
  },

  async createPayhead(companyId: number, payload: PayheadCreate): Promise<PayheadRead> {
    const res = await api.post(`${base(companyId)}/payheads`, payload);
    return res.data;
  },

  async updatePayhead(
    companyId: number,
    payheadId: number,
    payload: Partial<PayheadCreate>
  ): Promise<PayheadRead> {
    const res = await api.put(`${base(companyId)}/payheads/${payheadId}`, payload);
    return res.data;
  },

  async listShifts(companyId: number): Promise<ShiftRead[]> {
    const res = await api.get(`${base(companyId)}/shifts`);
    return res.data;
  },

  async createShift(companyId: number, payload: ShiftCreate): Promise<ShiftRead> {
    const res = await api.post(`${base(companyId)}/shifts`, payload);
    return res.data;
  },

  async listDesignations(companyId: number): Promise<DesignationRead[]> {
    const res = await api.get(`${base(companyId)}/designations`);
    return res.data;
  },

  async createDesignation(companyId: number, payload: DesignationCreate): Promise<DesignationRead> {
    const res = await api.post(`${base(companyId)}/designations`, payload);
    return res.data;
  },

  async updateDesignation(
    companyId: number,
    designationId: number,
    payload: DesignationUpdate
  ): Promise<DesignationRead> {
    const res = await api.put(`${base(companyId)}/designations/${designationId}`, payload);
    return res.data;
  },

  async deleteDesignation(companyId: number, designationId: number): Promise<void> {
    await api.delete(`${base(companyId)}/designations/${designationId}`);
  },

  async listDesignationTemplateLines(companyId: number, designationId: number): Promise<DesignationTemplateLineRead[]> {
    const res = await api.get(`${base(companyId)}/designations/${designationId}/template`);
    return res.data;
  },

  async addDesignationTemplateLine(
    companyId: number,
    designationId: number,
    payload: DesignationTemplateLineCreate
  ): Promise<DesignationTemplateLineRead> {
    const res = await api.post(`${base(companyId)}/designations/${designationId}/template`, payload);
    return res.data;
  },

  async updateDesignationTemplateLine(
    companyId: number,
    designationId: number,
    lineId: number,
    payload: DesignationTemplateLineUpdate
  ): Promise<DesignationTemplateLineRead> {
    const res = await api.put(`${base(companyId)}/designations/${designationId}/template/${lineId}`, payload);
    return res.data;
  },

  async deleteDesignationTemplateLine(companyId: number, designationId: number, lineId: number): Promise<void> {
    await api.delete(`${base(companyId)}/designations/${designationId}/template/${lineId}`);
  },

  async applyDesignationTemplate(companyId: number, designationId: number): Promise<{ detail: string; employee_ids: number[] }> {
    const res = await api.post(`${base(companyId)}/designations/${designationId}/apply-template`);
    return res.data;
  },

  async listEmployeeExtraPayheads(companyId: number, employeeId: number): Promise<EmployeeExtraPayheadRead[]> {
    const res = await api.get(`${base(companyId)}/employees/${employeeId}/extra-payheads`);
    return res.data;
  },

  async addEmployeeExtraPayhead(companyId: number, employeeId: number, payload: EmployeeExtraPayheadCreate): Promise<EmployeeExtraPayheadRead> {
    const res = await api.post(`${base(companyId)}/employees/${employeeId}/extra-payheads`, payload);
    return res.data;
  },

  async updateEmployeeExtraPayhead(companyId: number, employeeId: number, lineId: number, payload: EmployeeExtraPayheadUpdate): Promise<EmployeeExtraPayheadRead> {
    const res = await api.put(`${base(companyId)}/employees/${employeeId}/extra-payheads/${lineId}`, payload);
    return res.data;
  },

  async deleteEmployeeExtraPayhead(companyId: number, employeeId: number, lineId: number): Promise<void> {
    await api.delete(`${base(companyId)}/employees/${employeeId}/extra-payheads/${lineId}`);
  },


  async updateShift(companyId: number, shiftId: number, payload: Partial<ShiftCreate>): Promise<ShiftRead> {
    const res = await api.put(`${base(companyId)}/shifts/${shiftId}`, payload);
    return res.data;
  },

  async deleteShift(companyId: number, shiftId: number): Promise<void> {
    await api.delete(`${base(companyId)}/shifts/${shiftId}`);
  },

  async listShiftAssignments(companyId: number, opts: { employee_id?: number } = {}): Promise<ShiftAssignmentRead[]> {
    const res = await api.get(`${base(companyId)}/shift-assignments${buildQuery(opts)}`);
    return res.data;
  },

  async createShiftAssignment(companyId: number, payload: ShiftAssignmentCreate): Promise<ShiftAssignmentRead> {
    const res = await api.post(`${base(companyId)}/shift-assignments`, payload);
    return res.data;
  },

  async deleteShiftAssignment(companyId: number, assignmentId: number): Promise<void> {
    await api.delete(`${base(companyId)}/shift-assignments/${assignmentId}`);
  },

  async listDevices(companyId: number): Promise<DeviceRead[]> {
    const res = await api.get(`${base(companyId)}/devices`);
    return res.data;
  },

  async createDevice(companyId: number, payload: DeviceCreate): Promise<DeviceRead> {
    const res = await api.post(`${base(companyId)}/devices`, payload);
    return res.data;
  },

  async listDeviceUsers(
    companyId: number,
    opts: { device_id?: number; employee_id?: number } = {}
  ): Promise<DeviceUserRead[]> {
    const res = await api.get(`${base(companyId)}/device-users${buildQuery(opts)}`);
    return res.data;
  },

  async createDeviceUser(companyId: number, payload: DeviceUserCreate): Promise<DeviceUserRead> {
    const res = await api.post(`${base(companyId)}/device-users`, payload);
    return res.data;
  },

  async updateDeviceUser(
    companyId: number,
    deviceUserId: number,
    payload: Partial<DeviceUserCreate>
  ): Promise<DeviceUserRead> {
    const res = await api.put(`${base(companyId)}/device-users/${deviceUserId}`, payload);
    return res.data;
  },

  async deleteDeviceUser(companyId: number, deviceUserId: number): Promise<void> {
    await api.delete(`${base(companyId)}/device-users/${deviceUserId}`);
  },

  async ingestAttendanceLogs(companyId: number, payload: unknown): Promise<AttendanceIngestResponse> {
    const res = await api.post(`${base(companyId)}/attendance/logs/ingest`, payload);
    return res.data;
  },

  async importAttendanceCsv(companyId: number, args: { device_id: number; file: File }): Promise<AttendanceIngestResponse> {
    const fd = new FormData();
    fd.append("file", args.file);

    const res = await api.post(`${base(companyId)}/attendance/import/csv${buildQuery({ device_id: args.device_id })}`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });

    return res.data;
  },

  async listAttendanceDaily(
    companyId: number,
    params: { start: string; end: string; employee_id?: number; status?: string }
  ): Promise<AttendanceDailyRead[]> {
    const res = await api.get(`${base(companyId)}/attendance/daily${buildQuery(params)}`);
    return res.data;
  },

  async recomputeAttendanceDaily(
    companyId: number,
    params: { start: string; end: string; employee_ids?: number[] }
  ): Promise<void> {
    await api.post(`${base(companyId)}/attendance/daily/recompute${buildQuery(params)}`);
  },

  async manualFixAttendanceDaily(
    companyId: number,
    employeeId: number,
    workDate: string,
    payload: AttendanceDailyManualFix
  ): Promise<AttendanceDailyRead> {
    const res = await api.put(`${base(companyId)}/attendance/daily/${employeeId}/${workDate}`, payload);
    return res.data;
  },

  async listLeaveTypes(companyId: number): Promise<LeaveTypeRead[]> {
    const res = await api.get(`${base(companyId)}/leave/types`);
    return res.data;
  },

  async createLeaveType(companyId: number, payload: LeaveTypeCreate): Promise<LeaveTypeRead> {
    const res = await api.post(`${base(companyId)}/leave/types`, payload);
    return res.data;
  },

  async updateLeaveType(companyId: number, typeId: number, payload: Partial<LeaveTypeCreate>): Promise<LeaveTypeRead> {
    const res = await api.put(`${base(companyId)}/leave/types/${typeId}`, payload);
    return res.data;
  },

  async deleteLeaveType(companyId: number, typeId: number): Promise<void> {
    await api.delete(`${base(companyId)}/leave/types/${typeId}`);
  },

  async listLeaveRequests(
    companyId: number,
    params: { employee_id?: number; status?: string; start?: string; end?: string } = {}
  ): Promise<LeaveRequestRead[]> {
    const res = await api.get(`${base(companyId)}/leave/requests${buildQuery(params)}`);
    return res.data;
  },

  async createLeaveRequest(companyId: number, payload: LeaveRequestCreate): Promise<LeaveRequestRead> {
    const res = await api.post(`${base(companyId)}/leave/requests`, payload);
    return res.data;
  },

  async approveLeaveRequest(companyId: number, id: number, payload?: { reason?: string | null }): Promise<LeaveRequestRead> {
    const res = await api.post(`${base(companyId)}/leave/requests/${id}/approve`, payload || {});
    return res.data;
  },

  async rejectLeaveRequest(companyId: number, id: number, payload?: { reason?: string | null }): Promise<LeaveRequestRead> {
    const res = await api.post(`${base(companyId)}/leave/requests/${id}/reject`, payload || {});
    return res.data;
  },

  async listPayStructures(
    companyId: number,
    params: { employee_id?: number; is_active?: boolean } = {}
  ): Promise<PayStructureRead[]> {
    const res = await api.get(`${base(companyId)}/pay-structures${buildQuery(params)}`);
    return res.data;
  },

  async createPayStructure(companyId: number, payload: PayStructureCreate): Promise<PayStructureRead> {
    const res = await api.post(`${base(companyId)}/pay-structures`, payload);
    return res.data;
  },

  async getPayStructure(companyId: number, structureId: number): Promise<PayStructureRead> {
    const res = await api.get(`${base(companyId)}/pay-structures/${structureId}`);
    return res.data;
  },

  async updatePayStructure(
    companyId: number,
    structureId: number,
    payload: Partial<PayStructureCreate>
  ): Promise<PayStructureRead> {
    const res = await api.put(`${base(companyId)}/pay-structures/${structureId}`, payload);
    return res.data;
  },

  async deletePayStructure(companyId: number, structureId: number): Promise<void> {
    await api.delete(`${base(companyId)}/pay-structures/${structureId}`);
  },

  async createPayStructureLine(
    companyId: number,
    structureId: number,
    payload: PayStructureLineCreate
  ): Promise<PayStructureLineRead> {
    const res = await api.post(`${base(companyId)}/pay-structures/${structureId}/lines`, payload);
    return res.data;
  },

  async updatePayStructureLine(
    companyId: number,
    structureId: number,
    lineId: number,
    payload: Partial<PayStructureLineCreate>
  ): Promise<PayStructureLineRead> {
    const res = await api.put(`${base(companyId)}/pay-structures/${structureId}/lines/${lineId}`, payload);
    return res.data;
  },

  async deletePayStructureLine(companyId: number, structureId: number, lineId: number): Promise<void> {
    await api.delete(`${base(companyId)}/pay-structures/${structureId}/lines/${lineId}`);
  },

  async previewPayrollFormula(
    companyId: number,
    payload: PayrollFormulaPreviewRequest
  ): Promise<PayrollFormulaPreviewResponse> {
    const res = await api.post(`${base(companyId)}/formula/preview`, payload);
    return res.data;
  },

  async createPayrollRun(companyId: number, payload: PayrollRunCreate): Promise<PayrollRunRead> {
    const res = await api.post(`${base(companyId)}/runs`, payload);
    return res.data;
  },

  async listPayrollRuns(companyId: number): Promise<PayrollRunRead[]> {
    const res = await api.get(`${base(companyId)}/runs`);
    return res.data;
  },

  async computePayrollRun(companyId: number, runId: number, payload?: unknown): Promise<PayrollRunComputeResponse> {
    const res = await api.post(`${base(companyId)}/runs/${runId}/compute`, payload || {});
    return res.data;
  },

  async listPayslips(companyId: number, runId: number): Promise<PayslipSummary[]> {
    const res = await api.get(`${base(companyId)}/runs/${runId}/payslips`);
    return res.data;
  },

  async approvePayrollRun(companyId: number, runId: number): Promise<PayrollRunRead> {
    const res = await api.post(`${base(companyId)}/runs/${runId}/approve`);
    return res.data;
  },

  async unlockPayrollRun(companyId: number, runId: number, reason: string): Promise<PayrollRunRead> {
    const res = await api.post(`${base(companyId)}/runs/${runId}/unlock`, { reason });
    return res.data;
  },

  async postPayrollVoucher(companyId: number, runId: number, post_date: string): Promise<PayrollRunRead> {
    const res = await api.post(`${base(companyId)}/runs/${runId}/post-voucher`, { post_date });
    return res.data;
  },

  async overridePayslip(
    companyId: number,
    runId: number,
    employeeId: number,
    payload: PayslipOverrideRequest
  ): Promise<void> {
    await api.post(`${base(companyId)}/runs/${runId}/payslips/${employeeId}/override`, payload);
  },

  async exportPayslipJson(companyId: number, runId: number, employeeId: number): Promise<PayslipExportJson> {
    const res = await api.get(`${base(companyId)}/runs/${runId}/payslips/${employeeId}/export`);
    return res.data;
  },

  async downloadSalaryTemplateExcel(companyId: number, runId: number): Promise<Blob> {
    const res = await api.get(`${base(companyId)}/runs/${runId}/salary-template-excel`, { responseType: 'blob' });
    return res.data;
  },

  async uploadSalaryExcel(companyId: number, runId: number, file: File): Promise<any> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await api.post(`${base(companyId)}/runs/${runId}/upload-salary-excel`, fd, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data;
  },

  async getSalarySheetData(companyId: number, runId: number): Promise<{ headers: string[]; rows: any[][] }> {
    const res = await api.get(`${base(companyId)}/runs/${runId}/salary-sheet-data`);
    return res.data;
  },

  async uploadSalaryJson(companyId: number, runId: number, payload: { headers: string[]; rows: any[][] }): Promise<any> {
    const res = await api.post(`${base(companyId)}/runs/${runId}/upload-salary-json`, payload);
    return res.data;
  },

  async getSalarySheetReport(
    companyId: number,
    params: {
      year: number;
      month?: number;
      employeeId?: number;
      departmentId?: number;
      projectId?: number;
      segmentId?: number;
      calendarMode?: string;
    }
  ): Promise<{ payheads: any[]; rows: any[] }> {
    const res = await api.get(`${base(companyId)}/reports/salary-sheet`, {
      params: {
        year: params.year,
        month: params.month,
        employee_id: params.employeeId,
        department_id: params.departmentId,
        project_id: params.projectId,
        segment_id: params.segmentId,
        calendar_mode: params.calendarMode,
      },
    });
    return res.data;
  },


  getErrorMessage(error: unknown): string {
    return getApiErrorMessage(error);
  },
};
