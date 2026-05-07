export type PayrollMode = "MONTHLY" | "DAILY" | "HOURLY";

export type SalaryMode = "PRO_RATA" | "FIXED" | "HYBRID";

export type PayheadType = "EARNING" | "DEDUCTION";

export type PayheadCalculationBasis =
  | "PER_DAY"
  | "PER_HOUR"
  | "FIXED"
  | "PERCENTAGE"
  | "FORMULA";

export type PayheadCostCenterOption =
  | "NONE"
  | "DEPARTMENT"
  | "PROJECT"
  | "SEGMENT"
  | "DEPARTMENT_PROJECT"
  | "DEPARTMENT_PROJECT_SEGMENT";

export type PayrollRunStatus = "DRAFT" | "COMPUTED" | "APPROVED" | "POSTED";

export type EmployeeExtraPayheadRead = {
  id: number;
  company_id: number;
  employee_id: number;
  payhead_id: number;
  amount?: number | null;
  rate?: number | null;
  formula?: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

export type EmployeeExtraPayheadCreate = {
  payhead_id: number;
  amount?: number | null;
  rate?: number | null;
  formula?: string | null;
  sort_order?: number;
  is_active?: boolean;
};

export type EmployeeExtraPayheadUpdate = {
  amount?: number | null;
  rate?: number | null;
  formula?: string | null;
  sort_order?: number | null;
  is_active?: boolean | null;
};

export type EmployeeRead = {
  id: number;
  full_name: string;
  code?: string | null;
  join_date?: string | null;
  grade?: string | null;
  grade_number?: number | null;
  gender?: string | null;
  marital_status?: string | null;
  dob?: string | null;
  pan?: string | null;
  end_date?: string | null;

  payroll_mode: PayrollMode;
  salary_mode?: SalaryMode;
  base_monthly_salary?: number | null;
  base_daily_wage?: number | null;
  base_hourly_rate?: number | null;
  payable_ledger_id: number | null;
  designation_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  employee_type_id?: number | null;
  employee_type?: EmployeeTypeRead | null;
  designation?: DesignationRead | null;
  extra_payheads?: EmployeeExtraPayheadRead[];
  apply_tds?: boolean;

  tds_percent?: number;
  is_active?: boolean | null;
};


export type DesignationTemplateLineRead = {
  id: number;
  company_id: number;
  designation_id: number;
  payhead_id: number;
  amount?: number | null;
  rate?: number | null;
  formula?: string | null;
  sort_order: number;
  created_at: string;
};

export type DesignationTemplateLineCreate = {
  payhead_id: number;
  amount?: number | null;
  rate?: number | null;
  formula?: string | null;
  sort_order?: number;
};

export type DesignationTemplateLineUpdate = Partial<Omit<DesignationTemplateLineCreate, "payhead_id">>;

export type DesignationRead = {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  base_monthly_salary?: number | null;
  grade_rate?: number | null;
  is_active?: boolean | null;
  template_lines?: DesignationTemplateLineRead[];
};

export type DesignationCreate = Omit<DesignationRead, "id" | "template_lines">;
export type DesignationUpdate = Partial<DesignationCreate>;


export type EmployeeTypeRead = {
  id: number;
  name: string;
  code?: string | null;
  description?: string | null;
  is_active?: boolean | null;
};

export type EmployeeTypeCreate = Omit<EmployeeTypeRead, "id">;

export type EmployeeTypeUpdate = Partial<EmployeeTypeCreate>;

export type EmployeeCreate = Omit<EmployeeRead, "id" | "employee_type">;


export type PayheadRead = {
  id: number;
  code: string;
  name: string;
  type: PayheadType;
  calculation_basis: PayheadCalculationBasis;
  cost_center_option?: PayheadCostCenterOption | null;
  expense_ledger_id?: number | null;
  payable_ledger_id?: number | null;
  is_active?: boolean | null;
};

export type PayheadCreate = Omit<PayheadRead, "id">;

export type ShiftRead = {
  id: number;
  code?: string | null;
  name: string;
  start_time: string; // "HH:MM"
  end_time: string; // "HH:MM"
  break_minutes?: number | null;
  is_active?: boolean | null;
};

export type ShiftCreate = Omit<ShiftRead, "id">;

export type ShiftAssignmentRead = {
  id: number;
  employee_id: number;
  shift_id: number;
  effective_from: string; // YYYY-MM-DD
  effective_to?: string | null;
};

export type ShiftAssignmentCreate = Omit<ShiftAssignmentRead, "id">;

export type DeviceRead = {
  id: number;
  name: string;
  code?: string | null;
  location?: string | null;
  ip_address?: string | null;
  is_active?: boolean | null;
};

export type DeviceCreate = Omit<DeviceRead, "id">;

export type DeviceUserRead = {
  id: number;
  device_id: number;
  employee_id: number | null;
  device_user_code: string;
  display_name?: string | null;
  is_active?: boolean | null;
};

export type DeviceUserCreate = Omit<DeviceUserRead, "id">;

export type AttendanceIngestResponse = {
  inserted?: number;
  skipped?: number;
  unmapped_device_user_codes?: string[];
  detail?: unknown;
};

export type AttendanceDailyRead = {
  employee_id: number;
  employee_name?: string | null;
  work_date: string;
  first_in?: string | null;
  last_out?: string | null;
  worked_minutes?: number | null;
  late_minutes?: number | null;
  overtime_minutes?: number | null;
  status?: string | null;
  is_manual?: boolean | null;
};

export type AttendanceDailyManualFix = {
  first_in?: string | null;
  last_out?: string | null;
  status?: string | null;
  reason: string;
};

export type LeaveTypeRead = {
  id: number;
  code: string;
  name: string;
  is_paid?: boolean | null;
  is_active?: boolean | null;
};

export type LeaveTypeCreate = Omit<LeaveTypeRead, "id">;

export type LeaveRequestRead = {
  id: number;
  employee_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | string;
  reason?: string | null;
  decision_reason?: string | null;
  decided_at?: string | null;
  decided_by?: number | null;
};

export type LeaveRequestCreate = {
  employee_id: number;
  leave_type_id: number;
  start_date: string;
  end_date: string;
  reason?: string | null;
};

export type PayStructureRead = {
  id: number;
  employee_id: number;
  effective_from: string;
  effective_to?: string | null;
  is_active: boolean;
};

export type PayStructureCreate = Omit<PayStructureRead, "id">;

export type PayStructureLineRead = {
  id: number;
  payhead_id: number;
  amount?: number | null;
  rate?: number | null;
  formula?: string | null;
};

export type PayStructureLineCreate = Omit<PayStructureLineRead, "id">;

export type PayrollFormulaPreviewRequest = {
  formula: string;
  employee_id?: number;
  structure_id?: number;
  payable_days?: number;
  absent_days?: number;
  late_minutes?: number;
  overtime_minutes?: number;
  worked_minutes?: number;
  variables?: Record<string, number>;
};

export type PayrollFormulaPreviewResponse = {
  amount: number;
  variables: Record<string, number>;
};

export type PayrollRunRead = {
  id: number;
  period_year: number;
  period_month: number;

  status: PayrollRunStatus;
  locked: boolean;
  voucher_id?: number | null;
  voucher_number?: string | null;
  computed_at?: string | null;
  approved_at?: string | null;
  posted_at?: string | null;
};

export type PayrollRunCreate = {
  period_year: number;
  period_month: number;
};

export type PayrollRunComputeResponse = {
  run_id: number;
  status: PayrollRunStatus;
  employees_processed: number;
};


export type PayslipSummary = {
  employee_id: number;
  employee_name?: string | null;
  payable_days?: number | null;
  late_minutes?: number | null;
  overtime_minutes?: number | null;
  earnings_total?: number | null;
  deductions_total?: number | null;
  net_pay?: number | null;
  is_overridden?: boolean | null;
};

export type PayslipOverrideLine = {
  payhead_id: number;
  amount: number;
};

export type PayslipOverrideRequest = {
  payable_days?: number | null;
  absent_days?: number | null;
  late_minutes?: number | null;
  overtime_minutes?: number | null;
  override_reason: string;
  lines: PayslipOverrideLine[];
};

export type PayslipExportJson = unknown;

export type CommissionBasis = "TURNOVER";

export type CommissionRuleRead = {
  id: number;
  name: string;
  employee_type_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  is_global_default: boolean;
  basis: CommissionBasis;
  rate_percent: number;
  is_active: boolean;

  // Optional expanded
  employee_type?: { name: string } | null;
  department?: { name: string } | null;
  project?: { name: string } | null;
  segment?: { name: string } | null;
};

export type CommissionRuleCreate = {
  name: string;
  employee_type_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  is_global_default?: boolean;
  basis?: CommissionBasis;
  rate_percent: number;
  is_active?: boolean;
};

export type CommissionRuleUpdate = Partial<CommissionRuleCreate>;

export type CommissionReportItem = {
  employee_id: number;
  employee_name: string;
  employee_code?: string | null;
  total_sales: number;
  commission_amount: number;
  invoices: Array<{
    id: number;
    date: string;
    number: string;
    amount: number;
    rate_applied: number;
    commission: number;
    rules: string[];
  }>;
};
