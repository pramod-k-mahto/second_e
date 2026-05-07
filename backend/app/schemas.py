from __future__ import annotations

from typing import Literal
from datetime import date, datetime
import datetime as dt
from typing import List, Optional
from enum import Enum

from pydantic import BaseModel, EmailStr, field_validator, ConfigDict, model_validator, Field

from .models import (
    LedgerGroupType,
    OpeningBalanceType,
    VoucherType,
    TransactionMode,
    VoucherAction,
    InventoryValuationMethod,
    PayrollMode,
    SalaryMode,
    PayrollPayheadType,
    AttendanceStatus,
    LeaveRequestStatus,
    PayrollRunStatus,
    CommissionBasis,
    RewardType,
    InteractionType,
)


class PayrollShiftBase(BaseModel):
    code: str
    name: str
    start_time: dt.time
    end_time: dt.time

    expected_work_minutes: int = 0
    grace_minutes: int = 0
    allow_night_shift: bool = False


class PayrollShiftCreate(PayrollShiftBase):
    pass


class PayrollShiftUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None

    expected_work_minutes: int | None = None
    grace_minutes: int | None = None
    allow_night_shift: bool | None = None


class PayrollShiftRead(PayrollShiftBase):
    id: int
    company_id: int
    model_config = ConfigDict(from_attributes=True)


class EmployeeShiftAssignmentBase(BaseModel):
    employee_id: int
    shift_id: int
    effective_from: date
    effective_to: date | None = None


class EmployeeShiftAssignmentCreate(EmployeeShiftAssignmentBase):
    pass


class EmployeeShiftAssignmentRead(EmployeeShiftAssignmentBase):
    id: int
    company_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class EmployeeBase(BaseModel):
    code: str | None = None
    full_name: str
    email: str | None = None
    phone: str | None = None
    designation_id: int | None = None
    department_id: int | None = None

    project_id: int | None = None
    segment_id: int | None = None
    join_date: date | None = None
    end_date: date | None = None
    payroll_mode: PayrollMode = PayrollMode.MONTHLY
    salary_mode: SalaryMode = SalaryMode.PRO_RATA
    base_monthly_salary: float | None = None
    base_daily_wage: float | None = None
    base_hourly_rate: float | None = None
    payable_ledger_id: int | None = None
    user_id: int | None = None
    apply_tds: bool = False
    tds_percent: float = 1.0
    is_active: bool = True
    grade_number: int | None = None
    grade: str | None = None
    gender: str | None = None
    marital_status: str | None = None
    dob: date | None = None
    pan: str | None = None


class EmployeeCreate(EmployeeBase):
    pass


class EmployeeUpdate(BaseModel):
    code: str | None = None
    full_name: str | None = None
    email: str | None = None
    phone: str | None = None
    designation_id: int | None = None
    department_id: int | None = None

    project_id: int | None = None
    segment_id: int | None = None
    join_date: date | None = None
    end_date: date | None = None
    payroll_mode: PayrollMode | None = None
    salary_mode: SalaryMode | None = None
    base_monthly_salary: float | None = None
    base_daily_wage: float | None = None
    base_hourly_rate: float | None = None
    payable_ledger_id: int | None = None
    employee_type_id: int | None = None
    user_id: int | None = None
    apply_tds: bool | None = None
    tds_percent: float | None = None
    is_active: bool | None = None
    grade_number: int | None = None
    grade: str | None = None
    gender: str | None = None
    marital_status: str | None = None
    dob: date | None = None
    pan: str | None = None



class DesignationBase(BaseModel):
    name: str
    code: str | None = None
    description: str | None = None
    base_monthly_salary: float | None = None
    grade_rate: float | None = None
    is_active: bool = True


class DesignationCreate(DesignationBase):
    pass


class DesignationUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    base_monthly_salary: float | None = None
    grade_rate: float | None = None
    is_active: bool | None = None


class DesignationTemplateLineBase(BaseModel):
    payhead_id: int
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None
    sort_order: int = 100


class DesignationTemplateLineCreate(DesignationTemplateLineBase):
    pass


class DesignationTemplateLineUpdate(BaseModel):
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None
    sort_order: int | None = None


class DesignationTemplateLineRead(DesignationTemplateLineBase):
    id: int
    company_id: int
    designation_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class DesignationRead(DesignationBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    template_lines: list[DesignationTemplateLineRead] = []
    model_config = ConfigDict(from_attributes=True)


class EmployeeTypeBase(BaseModel):

    name: str
    code: str | None = None
    description: str | None = None
    is_active: bool = True


class EmployeeTypeCreate(EmployeeTypeBase):
    pass


class EmployeeTypeUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    description: str | None = None
    is_active: bool | None = None


class EmployeeTypeRead(EmployeeTypeBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class EmployeeExtraPayheadBase(BaseModel):
    payhead_id: int
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None
    sort_order: int = 100
    is_active: bool = True


class EmployeeExtraPayheadCreate(EmployeeExtraPayheadBase):
    pass


class EmployeeExtraPayheadUpdate(BaseModel):
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None
    sort_order: int | None = None
    is_active: bool | None = None


class EmployeeExtraPayheadRead(EmployeeExtraPayheadBase):
    id: int
    company_id: int
    employee_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class EmployeeRead(EmployeeBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    employee_type_id: int | None = None
    designation_id: int | None = None
    segment_id: int | None = None
    grade_number: int | None = None
    employee_type: EmployeeTypeRead | None = None
    designation: DesignationRead | None = None
    segment: SegmentRead | None = None
    extra_payheads: list[EmployeeExtraPayheadRead] = []

    model_config = ConfigDict(from_attributes=True)


class RewardBase(BaseModel):
    employee_id: int
    reward_type: RewardType
    amount: float | None = None
    points: int | None = None
    reason: str
    given_at: datetime | None = None


class RewardCreate(RewardBase):
    pass


class RewardRead(RewardBase):
    id: int
    company_id: int
    model_config = ConfigDict(from_attributes=True)


class EmployeePerformanceRead(BaseModel):
    employee_id: int
    full_name: str
    total_tasks: int = 0
    completed_tasks: int = 0
    completion_rate: float = 0
    total_revenue: float = 0
    total_points: int = 0
    total_rewards_amount: float = 0
    model_config = ConfigDict(from_attributes=True)


class ResourceBase(BaseModel):
    group_id: int
    title: str
    description: str | None = None
    link_url: str | None = None
    file_path: str | None = None
    is_active: bool = True


class ResourceCreate(ResourceBase):
    pass


class ResourceRead(ResourceBase):
    id: int
    company_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ResourceGroupBase(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True


class ResourceGroupCreate(ResourceGroupBase):
    pass


class ResourceGroupRead(ResourceGroupBase):
    id: int
    company_id: int
    created_at: datetime
    resources: list[ResourceRead] = []
    model_config = ConfigDict(from_attributes=True)


class CustomerInteractionBase(BaseModel):
    customer_id: int
    employee_id: int
    interaction_type: InteractionType
    notes: str
    task_id: int | None = None
    interaction_date: datetime | None = None


class CustomerInteractionCreate(CustomerInteractionBase):
    pass


class CustomerInteractionRead(CustomerInteractionBase):
    id: int
    company_id: int
    created_at: datetime
    customer_name: str | None = None
    employee_name: str | None = None
    model_config = ConfigDict(from_attributes=True)


class SalesPersonRead(BaseModel):
    id: int
    name: str
    is_active: bool = True


class SalesByPersonReportRow(BaseModel):
    sales_person_id: int | None = None
    sales_person_name: str | None = None
    invoice_count: int = 0
    total_sales_amount: float = 0
    outstanding_amount: float = 0


class RestaurantSummaryRow(BaseModel):
    order_type: str
    table_number: str | None = None
    invoice_count: int = 0
    total_amount: float = 0
    total_items: float = 0


class RestaurantSummaryResponse(BaseModel):
    summary_by_type: list[RestaurantSummaryRow]
    summary_by_table: list[RestaurantSummaryRow]
    total_sales: float = 0
    total_orders: int = 0


class PayrollPayheadBase(BaseModel):
    code: str
    name: str
    type: PayrollPayheadType
    taxable: bool = False
    default_amount: float | None = None
    default_rate: float | None = None
    calculation_basis: str | None = None
    cost_center_option: str | None = None
    sort_order: int = 100
    expense_ledger_id: int | None = None
    payable_ledger_id: int | None = None
    is_active: bool = True


class PayrollPayheadCreate(PayrollPayheadBase):
    pass


class PayrollPayheadUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    type: PayrollPayheadType | None = None
    taxable: bool | None = None
    default_amount: float | None = None
    default_rate: float | None = None
    calculation_basis: str | None = None
    cost_center_option: str | None = None
    sort_order: int | None = None
    expense_ledger_id: int | None = None
    payable_ledger_id: int | None = None
    is_active: bool | None = None


class PayrollPayheadRead(PayrollPayheadBase):
    id: int
    company_id: int
    model_config = ConfigDict(from_attributes=True)


class EmployeePayStructureLineBase(BaseModel):
    payhead_id: int
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None


class EmployeePayStructureLineCreate(EmployeePayStructureLineBase):
    pass


class EmployeePayStructureLineUpdate(BaseModel):
    amount: float | None = None
    rate: float | None = None
    formula: str | None = None


class EmployeePayStructureLineRead(EmployeePayStructureLineBase):
    id: int
    company_id: int
    structure_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class EmployeePayStructureBase(BaseModel):
    employee_id: int
    effective_from: date
    effective_to: date | None = None
    is_active: bool = True


class EmployeePayStructureCreate(EmployeePayStructureBase):
    lines: list[EmployeePayStructureLineCreate] = []


class EmployeePayStructureUpdate(BaseModel):
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool | None = None


class EmployeePayStructureRead(EmployeePayStructureBase):
    id: int
    company_id: int
    created_at: datetime
    lines: list[EmployeePayStructureLineRead] = []
    model_config = ConfigDict(from_attributes=True)


class BiometricDeviceBase(BaseModel):
    name: str
    vendor: str | None = None
    protocol: str = "HTTP"
    ip: str | None = None
    port: int | None = None
    timezone: str = "Asia/Kathmandu"
    location: str | None = None
    is_active: bool = True


class BiometricDeviceCreate(BiometricDeviceBase):
    pass


class BiometricDeviceRead(BiometricDeviceBase):
    id: int
    company_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class BiometricDeviceUserBase(BaseModel):
    device_id: int
    device_user_code: str
    employee_id: int | None = None


class BiometricDeviceUserCreate(BiometricDeviceUserBase):
    pass


class BiometricDeviceUserUpdate(BaseModel):
    device_user_code: str | None = None
    employee_id: int | None = None


class BiometricDeviceUserRead(BiometricDeviceUserBase):
    id: int
    company_id: int
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AttendanceLogIngestItem(BaseModel):
    device_id: int | None = None
    device_user_code: str
    event_ts: datetime
    event_type: str | None = None
    payload: dict | None = None


class AttendanceLogsIngestRequest(BaseModel):
    source: str = "PUSH"
    logs: list[AttendanceLogIngestItem]


class AttendanceCsvImportResponse(BaseModel):
    inserted: int
    deduped: int
    unmapped_device_users: list[str]


class AttendanceDailyRead(BaseModel):
    id: int
    company_id: int
    employee_id: int
    work_date: date
    shift_id: int | None = None
    first_in: datetime | None = None
    last_out: datetime | None = None
    worked_minutes: int
    late_minutes: int
    overtime_minutes: int
    status: AttendanceStatus
    is_manual: bool
    manual_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class AttendanceDailyManualUpdate(BaseModel):
    first_in: datetime | None = None
    last_out: datetime | None = None
    status: AttendanceStatus | None = None
    manual_reason: str


class LeaveTypeBase(BaseModel):
    code: str
    name: str
    paid: bool = True
    annual_quota: float | None = None
    carry_forward: bool = False
    is_active: bool = True


class LeaveTypeCreate(LeaveTypeBase):
    pass


class LeaveTypeRead(LeaveTypeBase):
    id: int
    company_id: int
    model_config = ConfigDict(from_attributes=True)


class LeaveRequestCreate(BaseModel):
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    reason: str | None = None


class LeaveRequestDecision(BaseModel):
    reason: str | None = None


class LeaveRequestRead(BaseModel):
    id: int
    company_id: int
    employee_id: int
    leave_type_id: int
    start_date: date
    end_date: date
    days: float
    status: LeaveRequestStatus
    approved_by_user_id: int | None = None
    approved_at: datetime | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PayrollRunCreate(BaseModel):
    period_year: int
    period_month: int


class PayrollRunRead(BaseModel):
    id: int
    company_id: int
    period_year: int
    period_month: int
    period_start: date
    period_end: date
    status: PayrollRunStatus
    locked: bool
    voucher_id: int | None = None
    computed_at: datetime | None = None
    approved_at: datetime | None = None
    posted_at: datetime | None = None
    approved_by_user_id: int | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class PayrollRunComputeRequest(BaseModel):
    recompute_attendance: bool = False
    employee_ids: list[int] | None = None


class PayrollRunComputeResponse(BaseModel):
    run_id: int
    status: PayrollRunStatus
    employees_processed: int


class PayrollRunPostRequest(BaseModel):
    post_date: dt.date


class PayrollFormulaPreviewRequest(BaseModel):
    formula: str
    employee_id: int | None = None
    structure_id: int | None = None
    payable_days: float | None = None
    absent_days: float | None = None
    late_minutes: int | None = None
    overtime_minutes: int | None = None
    worked_minutes: int | None = None
    variables: dict[str, float] | None = None


class PayrollFormulaPreviewResponse(BaseModel):
    amount: float
    variables: dict[str, float] = {}


class PayslipLineRead(BaseModel):
    payhead_id: int
    type: PayrollPayheadType
    amount: float


class PayslipRead(BaseModel):
    id: int
    company_id: int
    payroll_run_id: int
    employee_id: int
    payable_days: float
    absent_days: float
    late_minutes: int
    overtime_minutes: int
    earnings_total: float
    deductions_total: float
    tds_amount: float
    net_pay: float
    is_manual_override: bool
    override_reason: str | None = None
    lines: list[PayslipLineRead] = []
    model_config = ConfigDict(from_attributes=True)


class PayrollPayslipOverrideLine(BaseModel):
    payhead_id: int
    amount: float


class PayrollPayslipOverrideRequest(BaseModel):
    override_reason: str
    payable_days: float | None = None
    absent_days: float | None = None
    late_minutes: int | None = None
    overtime_minutes: int | None = None
    lines: list[PayrollPayslipOverrideLine] = []


class PayrollRunUnlockRequest(BaseModel):
    reason: str


class PayslipExportResponse(BaseModel):
    company_id: int
    payroll_run: PayrollRunRead
    employee: EmployeeRead
    payslip: PayslipRead


# -------------------- Company Settings --------------------

class CompanySettingsBase(BaseModel):
    calendar_mode: str = "AD"
    website_api_key: str | None = None
    website_api_secret: str | None = None
    payment_qr_url: str | None = None
    notify_on_dispatch: bool = False
    notify_on_delivery: bool = False
    notify_on_order_placed: bool = False
    notify_on_payment_received: bool = False
    notify_on_overdue: bool = False
    overdue_reminders: list[int] | None = None
    message_templates: dict | None = None
    smtp_config: dict | None = None
    whatsapp_config: dict | None = None
    ai_provider: str | None = None
    ai_api_key: str | None = None
    ai_system_prompt: str | None = None
    ai_permissions: dict | None = None
    ai_chatbot_config: dict | None = None

class CompanySettingsRead(CompanySettingsBase):
    company_id: int
    model_config = ConfigDict(from_attributes=True)

class CompanySettingsUpdate(BaseModel):
    calendar_mode: str | None = None
    website_api_key: str | None = None
    website_api_secret: str | None = None
    payment_qr_url: str | None = None
    notify_on_dispatch: bool | None = None
    notify_on_delivery: bool | None = None
    notify_on_order_placed: bool | None = None
    notify_on_payment_received: bool | None = None
    notify_on_overdue: bool | None = None
    overdue_reminders: list[int] | None = None
    message_templates: dict | None = None
    smtp_config: dict | None = None
    whatsapp_config: dict | None = None
    ai_provider: str | None = None
    ai_api_key: str | None = None
    ai_system_prompt: str | None = None
    ai_permissions: dict | None = None
    ai_chatbot_config: dict | None = None

# -------------------- Admin Stats --------------------

class AdminStats(BaseModel):
    total_tenants: int
    active_tenants: int
    total_companies: int
    total_users: int


class GhostSmartReportTransaction(BaseModel):
    date: date
    type: str
    tenant_name: str
    amount: float
    reference: str | None = None


class GhostSmartReportResponse(BaseModel):
    total_sales: float
    total_collections: float
    total_outstanding: float
    recent_transactions: list[GhostSmartReportTransaction]



# -------------------- Plans --------------------



class PlanBase(BaseModel):
    code: str
    name: str
    price_monthly: float | None = None
    price_yearly: float | None = None
    max_companies: int | None = None
    max_users: int | None = None
    menu_template_id: int | None = None
    features: list[str] = []
    is_active: bool = True

    @field_validator("features", mode="before")
    @classmethod
    def parse_features(cls, v):
        # DB value is NULL
        if v is None:
            return []
        # DB value is stored as comma-separated text
        if isinstance(v, str):
            return [item.strip() for item in v.split(",") if item.strip()]
        # Already a list or compatible type
        return v

    @field_validator("code")
    @classmethod
    def validate_code(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Code cannot be empty")
        # simple example: lowercase, alnum + -_
        if not all(c.isalnum() or c in "-_" for c in v):
            raise ValueError("Code may only contain letters, numbers, '-' or '_'")
        return v.lower()

    @field_validator("price_monthly", "price_yearly")
    @classmethod
    def non_negative_price(cls, v: float | None) -> float | None:
        if v is not None and v < 0:
            raise ValueError("Price cannot be negative")
        return v

    @field_validator("max_companies", "max_users")
    @classmethod
    def non_negative_limits(cls, v: int | None) -> int | None:
        if v is not None and v < 0:
            raise ValueError("Limit cannot be negative")
        return v


class PlanCreate(PlanBase):
    """
    Require at least one of price_monthly or price_yearly on create.
    Pydantic v2 style using model_validator.
    """

    @model_validator(mode="after")
    def require_at_least_one_price(self) -> "PlanCreate":
        if self.price_monthly is None and self.price_yearly is None:
            raise ValueError(
                "At least one of price_monthly or price_yearly is required"
            )
        return self


class PlanUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    price_monthly: float | None = None
    price_yearly: float | None = None
    max_companies: int | None = None
    max_users: int | None = None
    menu_template_id: int | None = None
    features: list[str] | None = None
    is_active: bool | None = None


class PlanRead(PlanBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TenantSubscriptionBase(BaseModel):
    tenant_id: int | None = None  # comes from URL path; optional in body
    plan_code: str
    amount_paid: float
    period_start: datetime
    period_end: datetime
    payment_method: TransactionMode
    bank_name: str | None = None
    reference_no: str | None = None
    status: str = "PAID"


class TenantSubscriptionCreate(TenantSubscriptionBase):
    pass


class TenantSubscriptionRead(TenantSubscriptionBase):
    id: int
    payment_date: datetime
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class VoucherAllocationBase(BaseModel):
    doc_type: str
    doc_id: int
    amount: float


class VoucherAllocationCreate(VoucherAllocationBase):
    pass


class VoucherAllocationRead(VoucherAllocationBase):
    doc_number: str | None = None


class VoucherAllocationsCreate(BaseModel):
    allocations: list[VoucherAllocationCreate]


class OutstandingDocumentRead(BaseModel):
    doc_type: str
    id: int
    number: str | None = None
    reference: str | None = None
    date: dt.date
    party_id: int
    party_name: str
    total_amount: float
    paid_amount: float
    outstanding_amount: float
    currency: str | None = None


class PartyDueItem(BaseModel):
    doc_type: str
    doc_id: int
    doc_number: str
    date: dt.date
    reference: str | None = None
    party_ledger_id: int
    party_name: str
    total_amount: float
    paid_amount: float
    outstanding_amount: float
    currency: str | None = None


class PartyDuesResponse(BaseModel):
    results: list[PartyDueItem]
    count: int



class DepartmentBase(BaseModel):
    name: str
    code: str | None = None
    is_active: bool = True


class DepartmentCreate(DepartmentBase):
    pass


class DepartmentUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    is_active: bool | None = None


class DepartmentRead(DepartmentBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ProjectBase(BaseModel):
    name: str
    code: str | None = None
    is_active: bool = True


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    is_active: bool | None = None


class ProjectRead(ProjectBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SegmentBase(BaseModel):
    name: str
    code: str | None = None
    is_active: bool = True


class SegmentCreate(SegmentBase):
    pass


class SegmentUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    is_active: bool | None = None


class SegmentRead(SegmentBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# -------------------- Sales Targets --------------------

class SalesTargetBase(BaseModel):
    fiscal_year: str
    ledger_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    
    month_1: float = 0
    month_2: float = 0
    month_3: float = 0
    month_4: float = 0
    month_5: float = 0
    month_6: float = 0
    month_7: float = 0
    month_8: float = 0
    month_9: float = 0
    month_10: float = 0
    month_11: float = 0
    month_12: float = 0
    
    total_target: float = 0
    is_active: bool = True

class SalesTargetCreate(SalesTargetBase):
    pass

class SalesTargetUpdate(BaseModel):
    fiscal_year: str | None = None
    ledger_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    month_1: float | None = None
    month_2: float | None = None
    month_3: float | None = None
    month_4: float | None = None
    month_5: float | None = None
    month_6: float | None = None
    month_7: float | None = None
    month_8: float | None = None
    month_9: float | None = None
    month_10: float | None = None
    month_11: float | None = None
    month_12: float | None = None
    total_target: float | None = None
    is_active: bool | None = None

class SalesTargetRead(SalesTargetBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    
    ledger_name: str | None = None
    department_name: str | None = None
    project_name: str | None = None

    model_config = ConfigDict(from_attributes=True)



# -------------------- Inventory Reports --------------------


class StockSummaryRow(BaseModel):
    item_id: int
    item_name: str
    warehouse_id: int | None = None
    warehouse_name: str | None = None
    opening_stock: float
    movement_in: float
    movement_out: float
    quantity_on_hand: float
    closing_value: float
    purchase_qty: float = 0.0
    sales_qty: float = 0.0


class StockPeriodReportRow(BaseModel):
    item_id: int
    item_name: str
    warehouse_id: int | None = None
    warehouse_name: str | None = None
    
    initial_qty: float
    initial_rate: float
    initial_value: float
    
    inwards_qty: float
    inwards_rate: float
    inwards_value: float
    
    outwards_qty: float
    outwards_rate: float
    outwards_value: float
    
    balance_qty: float
    balance_rate: float
    balance_value: float


class StockLedgerEntry(BaseModel):
    id: int
    posted_at: datetime
    source_type: str
    source_id: int
    voucher_number: str | None = None
    warehouse_name: str | None = None
    qty_in: float
    qty_out: float
    balance: float
    unit_cost: float | None = None
    item_value: float | None = None


class StockLedgerResponse(BaseModel):
    item_id: int
    item_name: str
    warehouse_id: int | None = None
    from_date: date | None = None
    to_date: date | None = None
    opening_qty: float
    opening_value: float
    entries: List[StockLedgerEntry]
    closing_qty: float
    closing_value: float



class StockSummaryBatchRequestItem(BaseModel):
    itemId: int
    warehouseId: int


class StockSummaryBatchRequest(BaseModel):
    requests: List[StockSummaryBatchRequestItem]


class StockSummaryBatchResult(BaseModel):
    itemId: int
    warehouseId: int
    quantityOnHand: str


class StockSummaryBatchResponse(BaseModel):
    results: List[StockSummaryBatchResult]


class ItemEffectiveRateResponse(BaseModel):
    itemId: int
    effectiveRate: float
    valuationMethod: str


class InventoryValuationRow(BaseModel):
    item_id: int
    item_name: str
    opening_stock: float
    movement_delta: float
    quantity_on_hand: float
    rate: float
    value: float


class InventoryValuationReport(BaseModel):
    as_on_date: date
    rows: List[InventoryValuationRow]
    total_value: float


class StockTransferLineCreate(BaseModel):
    itemId: int
    unit: str
    quantity: float
    unit_cost: Optional[float] = None

    @field_validator("quantity")
    @classmethod
    def positive_quantity(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("quantity must be greater than zero")
        return v

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_unit(cls, v: str | None) -> str:
        # Treat missing/empty units as "pcs" so the frontend never sees undefined
        if v in (None, "", "null"):
            return "pcs"
        if isinstance(v, str):
            v = v.strip()
            return v or "pcs"
        return "pcs"


class StockTransferLineRead(BaseModel):
    id: int
    line_no: int
    item_id: int
    unit: str
    quantity: float
    unit_cost: Optional[float] = None

    @field_validator("unit", mode="before")
    @classmethod
    def normalize_read_unit(cls, v: str | None) -> str:
        # Ensure API always returns a valid unit string; default to "pcs" if blank
        if v in (None, "", "null"):
            return "pcs"
        if isinstance(v, str):
            v = v.strip()
            return v or "pcs"
        return "pcs"

    model_config = ConfigDict(from_attributes=True)


class StockTransferCreate(BaseModel):
    transferDate: date
    fromWarehouseId: int
    toWarehouseId: int
    remarks: str | None = None
    lines: List[StockTransferLineCreate]


class StockTransferUpdate(BaseModel):
    transferDate: date | None = None
    fromWarehouseId: int | None = None
    toWarehouseId: int | None = None
    remarks: str | None = None
    lines: List[StockTransferLineCreate] | None = None


class StockTransferRead(BaseModel):
    transfer_date: date
    from_warehouse_id: int
    to_warehouse_id: int
    remarks: str | None = None
    id: int
    company_id: int
    transfer_number: str | None = None
    status: str
    created_at: datetime
    updated_at: datetime
    posted_at: datetime | None = None
    voucher_id: Optional[int] = None
    voucher_number: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class StockTransferDetailRead(BaseModel):
    header: StockTransferRead
    lines: List[StockTransferLineRead]


class StockTransferListResponse(BaseModel):
    data: List[StockTransferRead]
    page: int
    page_size: int
    total_count: int
    total_pages: int



class BOMItemBase(BaseModel):
    component_product_id: int
    quantity: float
    unit: str | None = None
    wastage_percent: float = 0
    remarks: str | None = None


class BOMItemCreate(BOMItemBase):
    pass


class BOMItemRead(BOMItemBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class BOMCreate(BaseModel):
    product_id: int
    version: int = 1
    bom_code: str | None = None
    batch_size: float | None = None
    status: str = "ACTIVE"
    items: list[BOMItemCreate]
    warehouse_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    labor_cost: float = 0
    machine_cost: float = 0
    electricity_cost: float = 0
    packing_cost: float = 0
    overhead_cost: float = 0


class BOMUpdate(BaseModel):
    version: int | None = None
    bom_code: str | None = None
    batch_size: float | None = None
    status: str | None = None
    approval_status: str | None = None
    items: list[BOMItemCreate] | None = None
    warehouse_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    labor_cost: float | None = None
    machine_cost: float | None = None
    electricity_cost: float | None = None
    packing_cost: float | None = None
    overhead_cost: float | None = None


class BOMRead(BaseModel):
    id: int
    product_id: int
    version: int
    bom_code: str | None = None
    batch_size: float | None = None
    status: str = "ACTIVE"
    approval_status: str = "DRAFT"
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    effective_from: datetime | None = None
    effective_to: datetime | None = None
    labor_cost: float = 0
    machine_cost: float = 0
    electricity_cost: float = 0
    packing_cost: float = 0
    overhead_cost: float = 0
    created_at: datetime
    items: list[BOMItemRead] = []
    estimated_cost: float = 0
    model_config = ConfigDict(from_attributes=True)


class ProductionOrderCreate(BaseModel):
    product_id: int
    quantity: float
    order_no: str | None = None
    order_date: date | None = None
    planned_qty: float | None = None
    status: str | None = None
    bom_id: int | None = None
    warehouse_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    bom_as_of: date | None = None
    expand_sub_assemblies: bool = False
    options: dict | None = None
    priority: str | None = None
    supervisor_name: str | None = None
    expected_completion_date: date | None = None
    operator: str | None = None
    machine: str | None = None


class ProductionOrderItemRead(BaseModel):
    id: int
    product_id: int
    consumed_qty: float
    model_config = ConfigDict(from_attributes=True)



class ProductionOrderUpdate(BaseModel):
    product_id: Optional[int] = None
    quantity: Optional[float] = None
    order_date: Optional[date] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    supervisor_name: Optional[str] = None
    expected_completion_date: Optional[date] = None
    operator: Optional[str] = None
    machine: Optional[str] = None

class ProductionOrderRead(BaseModel):
    id: int
    order_no: str | None = None
    order_date: date | None = None
    product_id: int
    quantity: float
    planned_qty: float | None = None
    status: str
    created_at: datetime
    produced_qty: float = 0
    warehouse_id: int | None = None
    bom_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    voucher_id: int | None = None
    voucher_number: str | None = None
    bom_as_of: date | None = None
    expand_sub_assemblies: bool = False
    options: dict | None = None
    priority: str | None = None
    supervisor_name: str | None = None
    operator: str | None = None
    machine: str | None = None
    expected_completion_date: date | None = None
    rejection_qty: float = 0
    damaged_qty: float = 0
    actual_material_cost: float = 0.0
    standard_material_cost: float = 0.0
    items: list[ProductionOrderItemRead] = []
    model_config = ConfigDict(from_attributes=True)


class ProductionIssueCreate(BaseModel):
    production_order_id: int
    issue_date: date | None = None
    warehouse_id: int | None = None
    notes: str | None = None


class ProductionIssueRead(BaseModel):
    id: int
    issue_no: str
    production_order_id: int
    issue_date: date
    warehouse_id: int | None = None
    total_value: float = 0
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProductionEntryCreate(BaseModel):
    production_order_id: int
    entry_date: date | None = None
    produced_qty: float
    rejected_qty: float = 0
    damaged_qty: float = 0
    extra_consumption: float = 0
    stage: str | None = None
    notes: str | None = None


class ProductionEntryRead(BaseModel):
    id: int
    production_order_id: int
    entry_date: date
    produced_qty: float
    rejected_qty: float
    damaged_qty: float
    extra_consumption: float
    stage: str | None = None
    notes: str | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class FinishedGoodsReceiveCreate(BaseModel):
    production_order_id: int
    receive_date: date | None = None
    warehouse_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    received_qty: float


class FinishedGoodsReceiveRead(BaseModel):
    id: int
    production_order_id: int
    receive_date: date
    warehouse_id: int | None = None
    received_qty: float
    unit_cost: float
    total_cost: float
    voucher_id: int | None = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProductionScrapCreate(BaseModel):
    production_order_id: int | None = None
    scrap_type: str
    qty: float
    reason: str | None = None
    recoverable: bool = False
    saleable: bool = False


class ProductionScrapRead(BaseModel):
    id: int
    production_order_id: int | None = None
    scrap_type: str
    qty: float
    reason: str | None = None
    recoverable: bool
    saleable: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ProductionCostingCalc(BaseModel):
    production_order_id: int
    labor_cost: float = 0
    machine_cost: float = 0
    electricity_cost: float = 0
    packing_cost: float = 0
    overhead_cost: float = 0
    sales_value: float = 0


class ProductionCostingRead(BaseModel):
    id: int
    production_order_id: int
    material_cost: float
    labor_cost: float
    machine_cost: float
    electricity_cost: float
    packing_cost: float
    overhead_cost: float
    total_batch_cost: float
    cost_per_unit: float
    variance_cost: float
    profit_margin: float
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ManufacturingSettingsUpsert(BaseModel):
    default_wip_ledger_id: int | None = None
    default_fg_ledger_id: int | None = None
    default_rm_ledger_id: int | None = None
    default_warehouse_id: int | None = None
    costing_method: str = "AUTO"
    approval_required: bool = True
    ai_predictions_enabled: bool = False


class MfgRoleAssign(BaseModel):
    user_id: int
    role_name: str
    custom_permissions: dict[str, str] | None = None


class ManufacturingSettingsRead(BaseModel):
    id: int
    company_id: int
    default_wip_ledger_id: int | None = None
    default_fg_ledger_id: int | None = None
    default_rm_ledger_id: int | None = None
    default_warehouse_id: int | None = None
    costing_method: str
    approval_required: bool
    ai_predictions_enabled: bool
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class VoucherLogRead(BaseModel):
    id: int
    timestamp: datetime
    tenant_id: int
    company_id: int
    voucher_id: int
    voucher_number: str | None = None
    actor: str | None = None
    action: VoucherAction
    summary: str

    model_config = ConfigDict(from_attributes=True)


# -------------------- Sales, Purchases, Inventory --------------------


class CustomerBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    customer_type: Optional[str] = None
    contact_person: Optional[str] = None
    mobile: Optional[str] = None

    billing_address: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None

    shipping_address_same_as_billing: bool = True
    shipping_city: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_phone: Optional[str] = None

    vat_gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    registration_type: Optional[str] = None
    tax_exempt: bool = False

    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None
    default_payment_method: Optional[str] = None
    opening_balance: Optional[float] = None
    balance_type: Optional[OpeningBalanceType] = None

    price_level: Optional[str] = None
    allow_credit: bool = True
    preferred_delivery_time: Optional[str] = None
    preferred_sales_person: Optional[str] = None

    category: Optional[str] = None
    notes: Optional[str] = None
    last_purchase_date: Optional[date] = None
    rating: Optional[int] = None

    ledger_id: Optional[int] = None


class CustomerCreate(CustomerBase):
    pass


class CustomerUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None

    customer_type: Optional[str] = None
    contact_person: Optional[str] = None
    mobile: Optional[str] = None

    billing_address: Optional[str] = None
    country: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    postal_code: Optional[str] = None

    shipping_address_same_as_billing: Optional[bool] = None
    shipping_city: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_phone: Optional[str] = None

    vat_gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    registration_type: Optional[str] = None
    tax_exempt: Optional[bool] = None

    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None
    default_payment_method: Optional[str] = None
    opening_balance: Optional[float] = None
    balance_type: Optional[OpeningBalanceType] = None

    price_level: Optional[str] = None
    allow_credit: Optional[bool] = None
    preferred_delivery_time: Optional[str] = None
    preferred_sales_person: Optional[str] = None

    category: Optional[str] = None
    notes: Optional[str] = None
    last_purchase_date: Optional[date] = None
    rating: Optional[int] = None

    ledger_id: Optional[int] = None


class CustomerRead(CustomerBase):
    id: int
    tenant_id: Optional[int] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class SupplierBase(BaseModel):
    name: str
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    mobile: Optional[str] = None
    website: Optional[str] = None

    country: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    street_address: Optional[str] = None
    postal_code: Optional[str] = None

    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    branch_name: Optional[str] = None
    ifsc_swift_routing_number: Optional[str] = None
    preferred_payment_mode: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None

    vat_gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    registration_type: Optional[str] = None
    hsn_sac_relevancy: Optional[str] = None
    tax_exempt: bool = False

    supplier_type: Optional[str] = None
    product_categories: Optional[str] = None
    delivery_terms: Optional[str] = None
    return_policy: Optional[str] = None
    is_active: bool = True

    notes: Optional[str] = None
    documents: Optional[str] = None
    rating: Optional[int] = None

    ledger_id: Optional[int] = None


class SupplierCreate(SupplierBase):
    pass


class SupplierUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    contact_person: Optional[str] = None
    mobile: Optional[str] = None

    country: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    city: Optional[str] = None
    area: Optional[str] = None
    street_address: Optional[str] = None
    postal_code: Optional[str] = None

    bank_name: Optional[str] = None
    account_holder_name: Optional[str] = None
    account_number: Optional[str] = None
    branch_name: Optional[str] = None
    ifsc_swift_routing_number: Optional[str] = None
    preferred_payment_mode: Optional[str] = None
    credit_limit: Optional[float] = None
    credit_days: Optional[int] = None

    vat_gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    registration_type: Optional[str] = None
    hsn_sac_relevancy: Optional[str] = None
    tax_exempt: Optional[bool] = None

    supplier_type: Optional[str] = None
    product_categories: Optional[str] = None
    delivery_terms: Optional[str] = None
    return_policy: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierRead(SupplierBase):
    id: int
    tenant_id: Optional[int] = None
    assigned_employee_id: Optional[int] = None
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class ItemBase(BaseModel):
    code: Optional[str] = None
    name: str
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    unit: Optional[str] = None
    default_sales_rate: Optional[float] = None
    default_purchase_rate: Optional[float] = None
    default_tax_rate: Optional[float] = None
    duty_tax_id: Optional[int] = None
    mrp: Optional[float] = None
    wholesale_price: Optional[float] = None
    delivery_charge: Optional[float] = None
    opening_stock: Optional[float] = None
    opening_rate: Optional[float] = None
    opening_date: Optional[date] = None
    opening_value: Optional[float] = None
    standard_cost: Optional[float] = None
    reorder_level: Optional[float] = None
    min_stock_warning: Optional[float] = None
    location: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    description: Optional[str] = None
    specifications: Optional[str] = None
    image_url: Optional[str] = None
    gallery_images: Optional[str] = None
    tax_type: Optional[str] = None
    hsn_sac_code: Optional[str] = None
    is_fixed_asset: bool = False
    depreciation_rate: Optional[float] = None
    depreciation_method: Optional[str] = None
    income_ledger_id: Optional[int] = None
    expense_ledger_id: Optional[int] = None
    output_tax_ledger_id: Optional[int] = None
    input_tax_ledger_id: Optional[int] = None
    allow_negative_stock: bool = False
    sell_as_kit: bool = False
    costing_method: Optional[str] = None
    is_active: bool = True
    show_in_online_store: bool = False
    is_featured: bool = False
    is_returnable: bool = True
    has_variants: bool = False
    variant_attributes: Optional[str] = None
    
    # New Industry Fields
    generic_name: Optional[str] = None
    dosage_form: Optional[str] = None
    drug_schedule: Optional[str] = None
    composition: Optional[str] = None
    strength: Optional[str] = None
    packing: Optional[str] = None
    prescription_required: bool = False
    is_batch_tracked: bool = False
    is_expiry_tracked: bool = False
    field_metadata: Optional[dict] = None

    seo_title: Optional[str] = None
    seo_keywords: Optional[str] = None
    slug: Optional[str] = None




class ItemCreate(ItemBase):
    units: Optional[list[ItemUnitCreate]] = None


class ItemUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    sku: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    unit: Optional[str] = None
    default_sales_rate: Optional[float] = None
    default_purchase_rate: Optional[float] = None
    default_tax_rate: Optional[float] = None
    mrp: Optional[float] = None
    wholesale_price: Optional[float] = None
    delivery_charge: Optional[float] = None
    opening_stock: Optional[float] = None
    standard_cost: Optional[float] = None
    reorder_level: Optional[float] = None
    min_stock_warning: Optional[float] = None
    location: Optional[str] = None
    brand_name: Optional[str] = None
    manufacturer: Optional[str] = None
    model_number: Optional[str] = None
    description: Optional[str] = None
    specifications: Optional[str] = None
    image_url: Optional[str] = None
    gallery_images: Optional[str] = None
    tax_type: Optional[str] = None
    hsn_sac_code: Optional[str] = None
    is_fixed_asset: Optional[bool] = None
    depreciation_rate: Optional[float] = None
    depreciation_method: Optional[str] = None
    income_ledger_id: Optional[int] = None
    expense_ledger_id: Optional[int] = None
    output_tax_ledger_id: Optional[int] = None
    input_tax_ledger_id: Optional[int] = None
    allow_negative_stock: Optional[bool] = None
    sell_as_kit: Optional[bool] = None
    costing_method: Optional[str] = None
    is_active: Optional[bool] = None
    show_in_online_store: Optional[bool] = None
    is_featured: Optional[bool] = None
    is_returnable: Optional[bool] = None
    has_variants: Optional[bool] = None
    variant_attributes: Optional[str] = None
    
    # New Industry Fields
    generic_name: Optional[str] = None
    dosage_form: Optional[str] = None
    drug_schedule: Optional[str] = None
    composition: Optional[str] = None
    strength: Optional[str] = None
    packing: Optional[str] = None
    prescription_required: Optional[bool] = None
    is_batch_tracked: Optional[bool] = None
    is_expiry_tracked: Optional[bool] = None
    duty_tax_id: Optional[int] = None
    field_metadata: Optional[dict] = None

    seo_title: Optional[str] = None
    seo_keywords: Optional[str] = None
    slug: Optional[str] = None
    units: Optional[list[ItemUnitCreate]] = None



class ItemRead(ItemBase):
    id: int
    created_by_id: Optional[int] = None
    updated_by_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    sales_ledger_id: Optional[int] = None
    purchase_ledger_id: Optional[int] = None

    ledger_overrides_company_defaults: bool = False
    ledger_override_warning: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ItemFieldConfigBase(BaseModel):
    business_type: str
    field_code: str
    display_label: str
    is_active: bool = True
    is_required: bool = False
    group_name: Optional[str] = None
    sort_order: int = 0


class ItemFieldConfigCreate(ItemFieldConfigBase):
    pass


class ItemFieldConfigUpdate(BaseModel):
    business_type: Optional[str] = None
    field_code: Optional[str] = None
    display_label: Optional[str] = None
    is_active: Optional[bool] = None
    is_required: Optional[bool] = None
    group_name: Optional[str] = None
    sort_order: Optional[int] = None


class ItemFieldConfigRead(ItemFieldConfigBase):
    id: int
    model_config = ConfigDict(from_attributes=True)


class ItemFieldCloneRequest(BaseModel):
    source_business_type: str
    target_business_type: str
    field_ids: List[int]


class WarehouseBase(BaseModel):
    code: str
    name: str
    is_active: bool = True
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    segment_id: Optional[int] = None


class WarehouseCreate(WarehouseBase):
    pass


class WarehouseUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    is_active: Optional[bool] = None
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    segment_id: Optional[int] = None


class WarehouseRead(WarehouseBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class RestaurantTableBase(BaseModel):
    name: str
    code: Optional[str] = None
    is_active: bool = True


class RestaurantTableCreate(RestaurantTableBase):
    pass


class RestaurantTableUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    is_active: Optional[bool] = None


class RestaurantTableRead(RestaurantTableBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemCategoryBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class ItemCategoryCreate(ItemCategoryBase):
    pass


class ItemCategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ItemCategoryRead(ItemCategoryBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemSubCategoryBase(BaseModel):
    name: str
    code: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    is_active: bool = True


class ItemSubCategoryCreate(ItemSubCategoryBase):
    pass


class ItemSubCategoryUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    category_id: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ItemSubCategoryRead(ItemSubCategoryBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ItemBrandBase(BaseModel):
    name: str
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class ItemBrandCreate(ItemBrandBase):
    pass


class ItemBrandUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class ItemBrandRead(ItemBrandBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class UnitBase(BaseModel):
    code: str
    name: str
    decimals: int = 0
    is_active: bool = True


class UnitCreate(UnitBase):
    pass


class UnitUpdate(BaseModel):
    name: Optional[str] = None
    decimals: Optional[int] = None
    is_active: Optional[bool] = None


class UnitRead(UnitBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class ItemUnitBase(BaseModel):
    unit_code: str
    is_base: bool = False
    factor_to_base: float = 1.0
    decimals: Optional[int] = None
    sort_order: Optional[int] = None


class ItemUnitCreate(ItemUnitBase):
    pass


class ItemUnitUpdate(BaseModel):
    unit_code: Optional[str] = None
    is_base: Optional[bool] = None
    factor_to_base: Optional[float] = None
    decimals: Optional[int] = None
    sort_order: Optional[int] = None


class ItemUnitRead(ItemUnitBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class SalesInvoiceLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float = 0
    hs_code: str | None = None
    warehouse_id: int | None = None
    sales_person_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    ref_no: str | None = None
    remarks: str | None = None
    item_name: str | None = None

    @field_validator("warehouse_id", "sales_person_id", "department_id", "project_id", "segment_id", mode="before")
    @classmethod
    def normalize_invoice_line_ids(cls, v):
        # Treat common "empty" values from the frontend as None
        if v in ("", "null", None, 0, "0"):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    @field_validator("item_id", mode="before")
    @classmethod
    def normalize_item_id(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if v.isdigit():
                return int(v)
        return v

    @field_validator("tax_rate", mode="before")
    @classmethod
    def normalize_invoice_tax_rate(cls, v):
        # Treat common "empty" values from the frontend as 0
        if v in ("", "null", None):
            return 0
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return 0
        return v

    model_config = ConfigDict(from_attributes=True)


class SalesPersonIncentiveAmount(BaseModel):
    sales_person_id: int
    incentive_amount: float
    is_manual: bool = False
    post_method: str = "Auto"  # "Auto" or "Manual"

    model_config = ConfigDict(from_attributes=True)


class SalesInvoiceBase(BaseModel):
    customer_id: int
    date: dt.date
    due_date: dt.date | None = None
    sales_person_id: int | None = None
    reference: Optional[str] = None
    custom_reference: Optional[str] = None
    bill_date: dt.date | None = None
    lines: List[SalesInvoiceLine]
    sales_ledger_id: int | None = None
    output_tax_ledger_id: int | None = None
    narration: str | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    invoice_type: str = "PRODUCT"
    sales_type: str = "LOCAL"
    # TDS fields (customer deducts TDS from payment to us)
    apply_tds: bool = False
    tds_amount: float | None = None
    tds_ledger_id: int | None = None
    sales_person_incentive_amounts: List[SalesPersonIncentiveAmount] = []

    @field_validator("customer_id", "sales_person_id", "sales_ledger_id", "output_tax_ledger_id", "department_id", "project_id", "segment_id", mode="before")
    @classmethod
    def normalize_invoice_header_ids(cls, v):
        if v in ("", "null", None, 0, "0"):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    @field_validator("date", "due_date", mode="before")
    @classmethod
    def normalize_invoice_dates(cls, v):
        if v in ("", "null", None):
            return None
        return v

    model_config = ConfigDict(from_attributes=True)


class SalesInvoiceCreate(SalesInvoiceBase):
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None
    bypass_stock_validation: bool = False


    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_invoice_payment_mode_id(cls, v):
        # Treat common "empty" values as None so credit sales can safely send
        # 0/""/"null" without violating payment_modes FK constraints.
        if v in (0, "0", "", "null", None):
            return None
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_invoice_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v


class SalesInvoiceUpdate(BaseModel):
    customer_id: Optional[int] = None
    date: Optional[dt.date] = None
    due_date: Optional[dt.date] = None
    sales_person_id: int | None = None
    reference: Optional[str] = None
    custom_reference: Optional[str] = None
    bypass_stock_validation: bool = False
    lines: Optional[List[SalesInvoiceLine]] = None
    sales_ledger_id: int | None = None
    output_tax_ledger_id: int | None = None
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None
    narration: Optional[str] = None
    invoice_type: Optional[str] = None
    sales_type: Optional[str] = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    bill_date: Optional[date] = None
    apply_tds: bool | None = None
    tds_amount: float | None = None
    tds_ledger_id: int | None = None
    sales_person_incentive_amounts: Optional[List[SalesPersonIncentiveAmount]] = None

    @field_validator("customer_id", mode="before")
    @classmethod
    def normalize_customer_id(cls, v):
        # Treat common "empty" values from the frontend as None
        if v in ("", "null", None):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    @field_validator("date", mode="before")
    @classmethod
    def normalize_invoice_date(cls, v):
        # Allow empty/"null" dates to be treated as None on update
        if v in ("", "null", None):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v

    @field_validator("sales_person_incentive_amounts", mode="before", check_fields=False)
    @classmethod
    def normalize_incentive_amounts(cls, v):
        if v in ("", "null", None):
            return []
        return v

    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_invoice_update_payment_mode_id(cls, v):
        # Allow 0/"0"/"" to represent "no payment mode" on update.
        if v in (0, "0", "", "null", None):
            return None
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_invoice_update_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v

        return v


class SalesInvoiceRead(SalesInvoiceBase):
    id: int
    voucher_id: Optional[int] = None
    sales_person_name: str | None = None
    paid_amount: float = 0
    outstanding_amount: float = 0
    payment_status: Literal["PAID", "PARTIAL", "UNPAID"] = "UNPAID"
    payment_mode_id: int | None = None
    invoice_type: str = "PRODUCT"
    sales_type: str = "LOCAL"
    voucher_number: Optional[str] = None
    apply_tds: bool = False
    tds_amount: float | None = None
    tds_ledger_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class SalesReturnLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float
    hs_code: str | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    warehouse_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class SalesReturnBase(BaseModel):
    customer_id: int
    date: dt.date
    reference: Optional[str] = None
    source_invoice_id: Optional[int] = None
    lines: List[SalesReturnLine]
    sales_return_ledger_id: int | None = None
    output_tax_return_ledger_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None


class SalesReturnCreate(SalesReturnBase):
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None


    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_sales_return_payment_mode_id(cls, v):
        # Treat common "empty" values as None so credit returns can safely
        # send 0/""/"null" without violating payment_modes FK constraints.
        if v in (0, "0", "", "null", None):
            return None
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_sales_return_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v


class SalesReturnRead(SalesReturnBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class SalesOrderLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float
    hs_code: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SalesOrderLineDetail(SalesOrderLine):
    item_name: str | None = None
    category: str | None = None


class SalesOrderBase(BaseModel):
    customer_id: int
    date: dt.date
    due_date: dt.date | None = None
    sales_person_id: int | None = None
    reference: Optional[str] = None
    lines: List[SalesOrderLine]


class SalesOrderCreate(SalesOrderBase):
    pass


class SalesOrderUpdate(BaseModel):
    customer_id: int | None = None
    date: dt.date | None = None
    due_date: dt.date | None = None
    sales_person_id: int | None = None
    reference: str | None = None
    status: Literal["OPEN", "CONVERTED", "CANCELLED", "PROCESSING"] | None = None
    lines: list[SalesOrderLine] | None = None


class SalesOrderRead(SalesOrderBase):
    id: int
    status: Literal["OPEN", "CONVERTED", "CANCELLED", "PROCESSING"]
    converted_to_invoice_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SalesOrderDetailRead(SalesOrderRead):
    customer_name: str | None = None
    sales_person_name: str | None = None
    customer_address: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    payment_status: str | None = None
    lines: List[SalesOrderLineDetail]


class SalesOrderSummary(BaseModel):
    id: int
    voucher_date: date
    voucher_number: Optional[str] = None
    reference: Optional[str] = None
    customer_id: Optional[int] = None
    customer_name: str
    customer_address: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None
    total_amount: float
    due_date: date | None = None
    sales_person_id: int | None = None
    sales_person_name: str | None = None
    status: Literal["OPEN", "CONVERTED", "CANCELLED", "PROCESSING"]
    payment_status: str | None = None
    lines: List[SalesOrderLineDetail] = []


class WebsiteCustomer(BaseModel):
    name: str
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    shipping_address_same_as_billing: bool = True
    shipping_address: str | None = None
    shipping_phone: str | None = None


class WebsiteOrderLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float


class WebsiteOrderOptions(BaseModel):
    auto_invoice: bool = False
    invoice_payment_mode_id: int | None = None
    notify_internal: bool = True
    record_payment: bool = False
    receipt_payment_mode_id: int | None = None
    notify_customer: bool = False
    notify_channels: list[Literal["EMAIL", "SMS", "WHATSAPP"]] | None = None


class WebsiteOrderCreate(BaseModel):
    reference: str | None = None
    transaction_id: str | None = None
    payment_screenshot: str | None = None
    date: dt.date | None = None
    customer: WebsiteCustomer
    lines: list[WebsiteOrderLine]
    options: WebsiteOrderOptions | None = None


class WebsiteOrderResult(BaseModel):
    order_id: int
    status: Literal["CREATED", "EXISTS"]
    invoice_id: int | None = None
    invoice_number: str | None = None
    package_id: int | None = None
    package_status: str | None = None
    receipt_voucher_id: int | None = None
    outbound_message_ids: list[int] = []
    total_amount: float | None = None
    tax_amount: float | None = None
    lines: list[WebsiteOrderLine] | None = None


class PurchaseBillLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float = 0
    hs_code: str | None = None
    warehouse_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    duty_tax_id: int | None = None
    remarks: str | None = None
    item_name: str | None = None

    @field_validator("warehouse_id", mode="before")
    @classmethod
    def normalize_warehouse_id(cls, v):
        # Treat common "empty" values from the frontend as None
        if v in ("", "null", None):
            return None
        # Allow numeric strings like "1" -> 1
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    model_config = ConfigDict(from_attributes=True)


class PurchaseBillBase(BaseModel):
    supplier_id: int
    date: dt.date
    bill_date: dt.date | None = None
    reference: Optional[str] = None
    lines: List[PurchaseBillLine]
    purchase_ledger_id: int | None = None
    input_tax_ledger_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    purchase_type: str = "LOCAL"
    narration: str | None = None
    # TDS deduction
    apply_tds: bool = False
    tds_amount: float | None = None
    tds_ledger_id: int | None = None


class PurchaseBillCreate(PurchaseBillBase):
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None


    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_bill_payment_mode_id(cls, v):
        # Treat common "empty" values from the frontend as None so that
        # credit purchases can safely send 0/""/"null" without violating
        # payment_modes FK constraints.
        if v in (0, "0", "", "null", None):
            return None
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_bill_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v


class PurchaseBillUpdate(BaseModel):
    supplier_id: Optional[int] = None
    date: Optional[date] = None
    bill_date: Optional[date] = None
    reference: Optional[str] = None
    lines: Optional[List[PurchaseBillLine]] = None
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None
    purchase_ledger_id: int | None = None
    input_tax_ledger_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    narration: Optional[str] = None
    purchase_type: Optional[str] = None
    apply_tds: bool | None = None
    tds_amount: float | None = None
    tds_ledger_id: int | None = None

    @field_validator("supplier_id", mode="before")
    @classmethod
    def normalize_supplier_id(cls, v):
        # Treat common "empty" values from the frontend as None
        if v in ("", "null", None):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    @field_validator("date", mode="before")
    @classmethod
    def normalize_date(cls, v):
        # Allow empty/"null" dates to be treated as None on update
        if v in ("", "null", None):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
        return v

    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_payment_mode_id(cls, v):
        # Treat common "empty" values from the frontend as None. Also treat
        # 0/"0" as "no payment mode" so credit purchases do not violate
        # payment_modes FK constraints on update.
        if v in (0, "0", "", "null", None):
            return None
        # Allow numeric strings like "1" -> 1
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v


class PurchaseBillRead(PurchaseBillBase):
    id: int
    voucher_id: Optional[int] = None
    payment_mode_id: int | None = None
    voucher_number: Optional[str] = None
    purchase_ledger_name: Optional[str] = None
    apply_tds: bool = False
    tds_amount: float | None = None
    tds_ledger_id: int | None = None
    purchase_type: str = "LOCAL"

    model_config = ConfigDict(from_attributes=True)


class PurchaseBillReverseRequest(BaseModel):
    date: Optional[date] = None
    reference: Optional[str] = None
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None
    purchase_return_ledger_id: int | None = None
    input_tax_return_ledger_id: int | None = None

    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_reverse_payment_mode_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return None
            if v.isdigit():
                return int(v)
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_reverse_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v


class PurchaseReturnLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float
    hs_code: str | None = None
    department_id: int | None = None
    project_id: int | None = None
    warehouse_id: int | None = None


class PurchaseReturnBase(BaseModel):
    supplier_id: int
    date: dt.date
    reference: Optional[str] = None
    source_bill_id: Optional[int] = None
    lines: List[PurchaseReturnLine]
    purchase_return_ledger_id: int | None = None
    input_tax_return_ledger_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None


class PurchaseReturnCreate(PurchaseReturnBase):
    payment_mode_id: int | None = None
    payment_ledger_id: int | None = None

    @field_validator("payment_mode_id", mode="before")
    @classmethod
    def normalize_purchase_return_payment_mode_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v

    @field_validator("payment_ledger_id", mode="before")
    @classmethod
    def normalize_purchase_return_payment_ledger_id(cls, v):
        if v in (0, "0", "", "null", None):
            return None
        return v


class PurchaseReturnRead(PurchaseReturnBase):
    id: int
    purchase_return_ledger_name: Optional[str] = None
    input_tax_return_ledger_name: Optional[str] = None


    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderLine(BaseModel):
    item_id: int
    quantity: float
    rate: float
    discount: float = 0
    tax_rate: float
    hs_code: str | None = None


class PurchaseOrderBase(BaseModel):
    supplier_id: int
    date: dt.date
    reference: Optional[str] = None
    lines: List[PurchaseOrderLine]


class PurchaseOrderCreate(PurchaseOrderBase):
    pass


class PurchaseOrderRead(PurchaseOrderBase):
    id: int
    status: Literal["OPEN", "CONVERTED", "CANCELLED"]
    converted_to_bill_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderSummary(BaseModel):
    id: int
    voucher_date: date
    voucher_number: Optional[str] = None
    supplier_id: int
    supplier_name: str
    total_amount: float
    status: Literal["OPEN", "CONVERTED", "CANCELLED"]


# -------------------- Documents --------------------


class DocumentExtractedItem(BaseModel):
    name: str
    qty: float = 1
    price: float = 0
    tax_rate: float = 0


class DocumentExtractedData(BaseModel):
    document_type: Literal["PURCHASE", "BILL"] | None = None
    vendor_name: str | None = None
    invoice_number: str | None = None
    invoice_date: date | None = None
    items: list[DocumentExtractedItem] = []
    total_amount: float | None = None
    tax: float | None = None
    confidence_score: float | None = None


class DocumentRead(BaseModel):
    id: int
    file_url: str
    file_type: str
    status: str
    extracted_data: dict | None = None
    created_at: datetime
    document_kind: str | None = None
    original_filename: str | None = None
    content_type: str | None = None
    size_bytes: int | None = None
    confirmed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class DocumentLogRead(BaseModel):
    id: int
    document_id: int
    message: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentProcessRequest(BaseModel):
    force: bool = False


class DocumentConfirmRequest(BaseModel):
    document_type: Literal["PURCHASE", "BILL"]
    extracted_data: DocumentExtractedData
    allow_create_missing_supplier: bool = True
    allow_create_missing_items: bool = True


class DocumentConfirmResponse(BaseModel):
    document_id: int
    status: str
    created_type: Literal["PURCHASE_ORDER", "PURCHASE_BILL"]
    created_id: int
    created_reference: str | None = None


# -------------------- Users & Auth --------------------


class UserBase(BaseModel):
    email: EmailStr
    full_name: Optional[str] = None
    is_system_admin: bool = False


class UserCreate(UserBase):
    password: str
    confirm_password: str
    role: Literal["user", "admin", "superadmin", "TENANT", "ghost_billing", "ghost_support", "ghost_tech"] = "user"
    tenant_id: Optional[int] = None

    @model_validator(mode="after")
    def validate_user_create(self) -> "UserCreate":
        # Password and confirm_password must match
        if self.password != self.confirm_password:
            raise ValueError("Password and confirm password do not match")

        # Password policy: min 8 chars, at least 1 letter + 1 number
        pwd = self.password or ""
        if len(pwd) < 8:
            raise ValueError("Password must be at least 8 characters long")
        if not any(c.isalpha() for c in pwd):
            raise ValueError("Password must contain at least one letter")
        if not any(c.isdigit() for c in pwd):
            raise ValueError("Password must contain at least one number")

        # tenant_id is mandatory for non-superadmins was here; now handled by route
        return self


class UserRead(UserBase):
    id: int
    role: str
    tenant_id: Optional[int] = None
    is_active: bool
    is_system_admin: bool = False
    created_at: datetime

    # Tenant-level permissions
    is_tenant_admin: bool | None = None
    tenant_permissions: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[Literal["user", "admin", "superadmin", "TENANT", "ghost_billing", "ghost_support", "ghost_tech"]] = None
    tenant_id: Optional[int] = None  # Immutable once set. Can only be assigned by superadmin if currently None.
    password: Optional[str] = None
    is_active: Optional[bool] = None
    is_tenant_admin: Optional[bool] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class TenantUserCreate(BaseModel):
    """Pydantic schema for POST /tenants/self/users — replaces raw dict."""
    name: str
    email: EmailStr
    password: str
    confirm_password: str
    is_tenant_admin: bool = False
    active: bool = True
    permissions: Optional[dict] = None

    @model_validator(mode="after")
    def validate_passwords(self) -> "TenantUserCreate":
        if self.password != self.confirm_password:
            raise ValueError("Password and confirm password do not match")
        pwd = self.password or ""
        if len(pwd) < 8 or not any(c.isalpha() for c in pwd) or not any(c.isdigit() for c in pwd):
            raise ValueError("Password must be at least 8 characters long and contain both letters and numbers.")
        return self


class TenantUserUpdate(BaseModel):
    """Pydantic schema for PUT /tenants/self/users/{user_id} — replaces raw dict."""
    name: Optional[str] = None
    email: Optional[EmailStr] = None
    active: Optional[bool] = None
    is_tenant_admin: Optional[bool] = None
    password: Optional[str] = None
    confirm_password: Optional[str] = None
    permissions: Optional[dict] = None

    @model_validator(mode="after")
    def validate_passwords(self) -> "TenantUserUpdate":
        if self.password is not None or self.confirm_password is not None:
            pwd = self.password or ""
            cpwd = self.confirm_password or ""
            if pwd != cpwd:
                raise ValueError("Password and confirm password do not match")
            if len(pwd) < 8 or not any(c.isalpha() for c in pwd) or not any(c.isdigit() for c in pwd):
                raise ValueError("Password must be at least 8 characters long and contain both letters and numbers.")
        return self


class UserCompanyAccessBase(BaseModel):
    user_id: int
    company_id: int
    can_sales: bool = True
    can_purchases: bool = True
    can_inventory: bool = True
    can_reports: bool = True


class UserCompanyAccessCreate(UserCompanyAccessBase):
    pass


class UserCompanyAccessUpdate(BaseModel):
    can_sales: Optional[bool] = None
    can_purchases: Optional[bool] = None
    can_inventory: Optional[bool] = None
    can_reports: Optional[bool] = None


class UserCompanyAccessRead(UserCompanyAccessBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MenuBase(BaseModel):
    code: str
    label: str
    module: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: bool = True


class MenuCreate(MenuBase):
    pass


class MenuUpdate(BaseModel):
    code: Optional[str] = None
    label: Optional[str] = None
    module: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: Optional[bool] = None


class MenuRead(MenuBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class CompanyMenuTreeItem(BaseModel):
    id: int
    label: str
    code: str
    module: str
    parent_id: Optional[int] = None
    sort_order: Optional[int] = None
    is_active: bool
    is_sidebar_visible: bool = True
    children: list["CompanyMenuTreeItem"] = Field(default_factory=list)


class CompanyMenuModuleGroup(BaseModel):
    module: str
    items: list[CompanyMenuTreeItem]


class MenuSidebarRead(BaseModel):
    id: int
    label: str
    module: Optional[str] = None
    code: str

    model_config = ConfigDict(from_attributes=True)


class MenuAccessLevel(str, Enum):
    deny = "deny"
    read = "read"
    update = "update"
    full = "full"


class UserMenuAccessBase(BaseModel):
    access_level: MenuAccessLevel = MenuAccessLevel.full


class UserMenuAccessUpdate(UserMenuAccessBase):
    pass


class UserMenuAccessRead(UserMenuAccessBase):
    id: int
    tenant_id: int
    user_id: int
    company_id: int
    menu_id: int

    model_config = ConfigDict(from_attributes=True)


class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    license_warning: Optional[str] = None


class TokenData(BaseModel):
    user_id: Optional[int] = None



# -------------------- Business Types --------------------


class BusinessTypeFeatureBase(BaseModel):
    feature_code: str
    is_enabled: bool = True
    config: Optional[dict] = None


class BusinessTypeFeatureCreate(BusinessTypeFeatureBase):
    pass


class BusinessTypeFeatureRead(BusinessTypeFeatureBase):
    id: int
    business_type_id: int

    model_config = ConfigDict(from_attributes=True)


class BusinessTypeBase(BaseModel):
    code: str
    name: str
    description: Optional[str] = None
    is_active: bool = True
    default_menu_template_id: Optional[int] = None


class BusinessTypeCreate(BusinessTypeBase):
    pass


class BusinessTypeUpdate(BaseModel):
    code: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class BusinessTypeRead(BusinessTypeBase):
    id: int
    features: List[BusinessTypeFeatureRead] = []
    default_menu_template_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


# -------------------- Tenants & Companies --------------------


class TenantBase(BaseModel):
    name: str
    plan: str = "standard"
    inventory_valuation_method: InventoryValuationMethod = InventoryValuationMethod.FIFO
    expires_at: Optional[datetime] = None
    business_type_id: Optional[int] = None
    document_scan_enabled: bool = True
    daily_document_scan_limit: int | None = None


class TenantCreate(TenantBase):
    menu_template_id: int


class TenantCompanyBrief(BaseModel):
    id: int
    name: str
    model_config = ConfigDict(from_attributes=True)


class TenantRead(TenantBase):
    id: int
    status: str
    menu_template_id: int | None = None
    menu_template_name: str | None = None
    menu_template_modules: str | None = None
    companies_count: int | None = 0
    users_count: int | None = 0
    user_count: int | None = 0
    plan_name: Optional[str] = None
    business_type_id: Optional[int] = None
    business_type_name: str | None = None # Calculated or joined
    user_full_name: Optional[str] = None
    user_email: Optional[EmailStr] = None
    user_role: Optional[str] = None
    companies: list[TenantCompanyBrief] = []

    model_config = ConfigDict(from_attributes=True)


class TenantBillingRead(BaseModel):
    id: int
    name: str
    plan: str
    status: str
    companies_count: int
    expires_at: datetime | None = None


class TenantUpdate(BaseModel):
    name: Optional[str] = None
    plan: Optional[str] = None
    status: Optional[str] = None
    inventory_valuation_method: Optional[InventoryValuationMethod] = None
    expires_at: Optional[datetime] = None
    menu_template_id: int | None = None
    business_type_id: int | None = None
    document_scan_enabled: bool | None = None
    daily_document_scan_limit: int | None = None


class TenantDocumentScanPolicyRead(BaseModel):
    tenant_id: int
    document_scan_enabled: bool
    daily_document_scan_limit: int | None = None


class TenantDocumentScanPolicyUpdate(BaseModel):
    document_scan_enabled: bool | None = None
    daily_document_scan_limit: int | None = None


class TenantDocumentScanUsageRow(BaseModel):
    tenant_id: int
    tenant_name: str
    document_scan_enabled: bool
    daily_document_scan_limit: int | None = None
    scans_used_today: int
    scans_remaining_today: int | None = None


class MenuTemplateBase(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True


class MenuTemplateMenuItemCreate(BaseModel):
    menu_id: int
    group_name: str | None = None
    group_order: int | None = None
    item_order: int | None = None
    parent_id: int | None = None
    is_sidebar_visible: bool = True


class MenuTemplateCreate(MenuTemplateBase):
    menu_ids: list[int] = []
    items: list[MenuTemplateMenuItemCreate] = []


class MenuTemplateUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None
    menu_ids: list[int] | None = None
    items: list[MenuTemplateMenuItemCreate] | None = None


class MenuTemplateMenuItemRead(BaseModel):
    menu_id: int
    group_name: str | None = None
    group_order: int | None = None
    item_order: int | None = None
    parent_id: int | None = None
    is_sidebar_visible: bool = True
    # Include label and code for convenience in UI
    label: str | None = None
    code: str | None = None


class MenuTemplateRead(MenuTemplateBase):
    id: int
    created_at: datetime
    menu_ids: list[int] = []
    items: list[MenuTemplateMenuItemRead] = []
    superadmin_only: bool = False

    model_config = ConfigDict(from_attributes=True)


class MenuTemplateDropdownRead(BaseModel):
    id: int
    name: str
    modules: str


class CompanyBase(BaseModel):
    name: str
    fiscal_year_start: Optional[date] = None
    fiscal_year_end: Optional[date] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    pan_number: Optional[str] = None
    business_type_id: Optional[int] = None
    business_type: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    inventory_valuation_method: InventoryValuationMethod = InventoryValuationMethod.AVERAGE
    # Cost center configuration flags mirrored from models.Company.
    # cost_center_mode: None (disabled), "single", or "double".
    cost_center_mode: Optional[str] = None
    # When mode == "single", indicates which dimension is active:
    # "department", "project", or "segment".
    cost_center_single_dimension: Optional[str] = None
    enable_cost_centers_in_vouchers: bool = False


class CompanyCreate(CompanyBase):
    pass


class CompanyUpdate(BaseModel):
    name: Optional[str] = None
    fiscal_year_start: Optional[date] = None
    fiscal_year_end: Optional[date] = None
    address: Optional[str] = None
    phone: Optional[str] = None
    pan_number: Optional[str] = None
    business_type_id: Optional[int] = None
    business_type: Optional[str] = None
    country: Optional[str] = None
    currency: Optional[str] = None
    default_purchase_ledger_id: int | None = None
    default_sales_ledger_id: int | None = None
    default_input_tax_ledger_id: int | None = None
    default_output_tax_ledger_id: int | None = None
    default_incentive_expense_ledger_id: int | None = None
    default_incentive_payable_ledger_id: int | None = None
    inventory_valuation_method: Optional[InventoryValuationMethod] = None
    cost_center_mode: Optional[str] = None
    cost_center_single_dimension: Optional[str] = None
    enable_cost_centers_in_vouchers: Optional[bool] = None


class CompanyRead(CompanyBase):
    id: int
    owner_id: int
    tenant_id: int  # optional but recommended
    business_type_id: Optional[int] = None
    default_purchase_ledger_id: int | None = None
    default_sales_ledger_id: int | None = None
    default_input_tax_ledger_id: int | None = None
    default_output_tax_ledger_id: int | None = None
    default_incentive_expense_ledger_id: int | None = None
    default_incentive_payable_ledger_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class CompanySettingsRead(BaseModel):
    company_id: int
    calendar_mode: str = "AD"
    website_api_key: str | None = None
    website_api_secret: str | None = None
    payment_qr_url: str | None = None
    
    notify_on_dispatch: bool = False
    notify_on_delivery: bool = False
    notify_on_order_placed: bool = False
    notify_on_payment_received: bool = False
    notify_on_overdue: bool = False
    overdue_reminders: list[int] | None = None
    message_templates: dict | None = None
    smtp_config: dict | None = None
    whatsapp_config: dict | None = None
    
    ai_provider: str | None = None
    ai_model: str | None = None
    ai_api_key: str | None = None
    ai_temperature: float | None = None
    ai_max_tokens: int | None = None
    ai_system_prompt: str | None = None
    ai_permissions: dict | None = None
    ai_chatbot_config: dict | None = None

    model_config = ConfigDict(from_attributes=True)


class CompanySettingsUpdate(BaseModel):
    calendar_mode: Optional[str] = None
    website_api_key: str | None = None
    website_api_secret: str | None = None
    payment_qr_url: str | None = None
    
    notify_on_dispatch: bool | None = None
    notify_on_delivery: bool | None = None
    notify_on_order_placed: bool | None = None
    notify_on_payment_received: bool | None = None
    notify_on_overdue: bool | None = None
    overdue_reminders: list[int] | None = None
    message_templates: dict | None = None
    smtp_config: dict | None = None
    whatsapp_config: dict | None = None

    ai_provider: str | None = None
    ai_model: str | None = None
    ai_api_key: str | None = None
    ai_temperature: float | None = None
    ai_max_tokens: int | None = None
    ai_system_prompt: str | None = None
    ai_permissions: dict | None = None
    ai_chatbot_config: dict | None = None

class ItemLedgerDefaultsUpdate(BaseModel):
    income_ledger_id: int | None = None
    sales_ledger_id: int | None = None
    expense_ledger_id: int | None = None
    purchase_ledger_id: int | None = None
    output_tax_ledger_id: int | None = None
    input_tax_ledger_id: int | None = None


class TenantCompanySummary(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


# -------------------- Ledgers & Vouchers --------------------


class LedgerGroupBase(BaseModel):
    name: str
    group_type: LedgerGroupType
    parent_group_id: Optional[int] = None


class LedgerGroupCreate(LedgerGroupBase):
    pass


class LedgerGroupUpdate(BaseModel):
    name: Optional[str] = None
    group_type: Optional[LedgerGroupType] = None
    parent_group_id: Optional[int] = None


class LedgerGroupRead(LedgerGroupBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class LedgerBase(BaseModel):
    name: str
    group_id: int
    code: Optional[str] = None
    opening_balance: float = 0
    opening_balance_type: OpeningBalanceType = OpeningBalanceType.DEBIT
    is_active: bool = True


class LedgerCreate(LedgerBase):
    pass


class LedgerUpdate(BaseModel):
    name: Optional[str] = None
    group_id: Optional[int] = None
    code: Optional[str] = None
    opening_balance: Optional[float] = None
    opening_balance_type: Optional[OpeningBalanceType] = None
    is_active: Optional[bool] = None


class LedgerRead(LedgerBase):
    id: int

    group_name: str | None = None
    group_type: LedgerGroupType | None = None

    model_config = ConfigDict(from_attributes=True)


class LedgerCounterpartyRead(BaseModel):
    id: int
    name: str
    group_id: int
    group_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


class PaymentModeBase(BaseModel):
    name: str
    ledger_id: int
    ledger_group_id: int | None = None
    is_active: bool = True


class PaymentModeCreate(PaymentModeBase):
    pass


class PaymentModeUpdate(BaseModel):
    name: Optional[str] = None
    ledger_id: Optional[int] = None
    ledger_group_id: Optional[int] = None
    is_active: Optional[bool] = None


class PaymentModeRead(PaymentModeBase):
    id: int

    model_config = ConfigDict(from_attributes=True)


class SalesPersonBase(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    commission_rate: Optional[float] = None
    notes: Optional[str] = None
    is_active: bool = True


class SalesPersonCreate(SalesPersonBase):
    pass


class SalesPersonUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    commission_rate: Optional[float] = None
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class SalesPersonRead(SalesPersonBase):
    id: int
    company_id: int

    model_config = ConfigDict(from_attributes=True)


class VoucherLineBase(BaseModel):
    ledger_id: int
    debit: float = 0
    credit: float = 0
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    employee_id: int | None = None
    remarks: str | None = None

    @field_validator("debit", "credit")
    @classmethod
    def non_negative(cls, v: float) -> float:
        if v < 0:
            raise ValueError("Debit/Credit cannot be negative")
        return v


class VoucherLineCreate(VoucherLineBase):
    pass


class VoucherItemRead(BaseModel):
    item_id: int
    item_name: str | None = None
    quantity: float
    unit: str | None = None
    rate: float | None = None
    amount: float | None = None

class VoucherLineRead(VoucherLineBase):
    id: int
    ledger_name: str | None = None
    department_name: str | None = None
    project_name: str | None = None
    segment_name: str | None = None
    employee_name: str | None = None
    related_ledgers: str | None = None

    model_config = ConfigDict(from_attributes=True)


class VoucherBase(BaseModel):
    voucher_date: date | None = None
    bill_date: date | None = None
    voucher_date_bs: str | None = None
    voucher_type: VoucherType
    narration: Optional[str] = None
    payment_mode_id: Optional[int] = None
    department_id: Optional[int] = None
    project_id: Optional[int] = None
    segment_id: Optional[int] = None
    employee_id: Optional[int] = None
    bank_remark: Optional[str] = None
    bill_date: Optional[date] = None


class VoucherCreate(VoucherBase):
    lines: List[VoucherLineCreate]


class CashVoucherSimpleCreate(BaseModel):
    voucher_date: date | None = None
    bill_date: date | None = None
    voucher_date_bs: str | None = None
    voucher_type: VoucherType
    counterparty_ledger_id: int
    amount: float
    payment_mode_id: int
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    employee_id: int | None = None
    ledger_id: int | None = None
    narration: Optional[str] = None
    bank_remark: Optional[str] = None
    allocations: list["VoucherAllocationCreate"] | None = None

    @field_validator("amount")
    @classmethod
    def positive_amount(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("amount must be greater than zero")
        return v

class VoucherUpdate(BaseModel):
    voucher_date: Optional[date] = None
    voucher_date_bs: str | None = None
    voucher_type: Optional[VoucherType] = None
    narration: Optional[str] = None
    lines: Optional[List[VoucherLineCreate]] = None
    payment_mode_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    employee_id: int | None = None
    bank_remark: str | None = None
    bill_date: Optional[date] = None


class VoucherRead(VoucherBase):
    voucher_date: date
    id: int
    company_id: int
    fiscal_year: Optional[str] = None
    voucher_sequence: Optional[int] = None
    voucher_number: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    lines: List[VoucherLineRead] = []
    total_amount: float
    origin_type: str | None = None
    origin_id: int | None = None
    payment_mode: str | None = None
    department_name: str | None = None
    project_name: str | None = None
    segment_name: str | None = None
    employee_name: str | None = None
    allocations: list["VoucherAllocationRead"] = []
    items: List[VoucherItemRead] = []

    model_config = ConfigDict(from_attributes=True)


# -------------------- Reports --------------------


class LedgerTransaction(BaseModel):
    date: dt.date
    voucher_id: int
    voucher_type: VoucherType
    voucher_number: Optional[str]
    reference: Optional[str] = None
    narration: Optional[str]
    payment_mode: Optional[str] = None
    remarks: Optional[str] = None
    debit: float
    credit: float
    balance: float
    balance_type: OpeningBalanceType
    related_ledger_name: Optional[str] = None
    item_name: Optional[str] = None
    bill_date: Optional[dt.date] = None
    department_name: Optional[str] = None
    project_name: Optional[str] = None
    segment_name: Optional[str] = None
    employee_name: Optional[str] = None
    source_id: Optional[int] = None
    all_lines: List[VoucherLineRead] = []


class LedgerReport(BaseModel):
    ledger_id: int
    ledger_name: str
    opening_balance: float
    opening_balance_type: OpeningBalanceType
    transactions: List[LedgerTransaction]
    closing_balance: float
    closing_balance_type: OpeningBalanceType


class PartyStatementItem(BaseModel):
    line_no: int | None = None
    item_id: int
    item_name: str | None = None
    quantity: float
    rate: float
    discount: float
    tax_rate: float
    line_total: float


class PartyStatementRow(BaseModel):
    date: dt.date
    doc_type: str
    doc_id: int
    doc_number: str | None = None
    reference: str | None = None
    particulars: str | None = None
    payment_mode: str | None = None
    paid_amount: float | None = None
    debit: float
    credit: float
    balance: float
    remarks: Optional[str] = None
    department_name: Optional[str] = None
    project_name: Optional[str] = None
    segment_name: Optional[str] = None
    employee_name: Optional[str] = None
    items: List[PartyStatementItem] = []


class PartyStatementReport(BaseModel):
    company_id: int
    company_name: str | None = None
    party_id: int
    party_name: str
    from_date: date
    to_date: date
    opening_balance: float
    transactions: List[PartyStatementRow]
    closing_balance: float


class CustomerLedgerMappingItem(BaseModel):
    customer_id: int
    customer_name: str
    ledger_id: int | None = None
    ledger_name: str | None = None


class SupplierLedgerMappingItem(BaseModel):
    supplier_id: int
    supplier_name: str
    ledger_id: int | None = None
    ledger_name: str | None = None


class CustomerLedgerReport(BaseModel):
    company_id: int
    company_name: str | None = None
    customer_id: int
    customer_name: str
    from_date: date
    to_date: date
    ledger_id: int
    ledger_name: str
    opening_balance: float
    opening_balance_type: OpeningBalanceType
    transactions: List[LedgerTransaction]
    total_debit: float
    total_credit: float
    closing_balance: float
    closing_balance_type: OpeningBalanceType


class SupplierLedgerReport(BaseModel):
    company_id: int
    company_name: str | None = None
    supplier_id: int
    supplier_name: str
    from_date: date
    to_date: date
    ledger_id: int
    ledger_name: str
    opening_balance: float
    opening_balance_type: OpeningBalanceType
    transactions: List[LedgerTransaction]
    total_debit: float
    total_credit: float
    closing_balance: float
    closing_balance_type: OpeningBalanceType


class TrialBalanceRowType(str, Enum):
    GROUP = "GROUP"
    SUB_GROUP = "SUB_GROUP"
    LEDGER = "LEDGER"
    TOTAL = "TOTAL"


class TrialBalanceRow(BaseModel):
    # hierarchy / typing
    row_type: TrialBalanceRowType
    level: int
    is_group: bool
    is_ledger: bool
    group_id: int | None = None
    group_name: str | None = None
    primary_group: str | None = None
    group_path: List[str] = []
    parent_group_id: int | None = None
    parent_group_name: str | None = None
    sort_order: int

    # identification
    ledger_id: int | None = None
    ledger_name: str

    # numeric
    opening_debit: float
    opening_credit: float
    period_debit: float
    period_credit: float
    closing_debit: float
    closing_credit: float


class TrialBalanceReport(BaseModel):
    from_date: date
    to_date: date
    rows: List[TrialBalanceRow]


class BalanceSheetHierRow(BaseModel):
    row_type: TrialBalanceRowType
    level: int
    is_group: bool
    is_ledger: bool
    group_id: int | None = None
    group_name: str | None = None
    primary_group: str | None = None
    group_path: List[str] = []
    parent_group_id: int | None = None
    parent_group_name: str | None = None
    sort_order: int

    ledger_id: int | None = None
    ledger_name: str

    amount: float
    classification: Optional[str] = None  # "Current" or "Non-Current"


class BalanceSheetTotals(BaseModel):
    liabilities_total: float
    assets_total: float
    difference_in_opening_balance: float = 0


class BalanceSheetHierarchicalReport(BaseModel):
    as_on_date: date
    liabilities: List[BalanceSheetHierRow]
    assets: List[BalanceSheetHierRow]
    totals: BalanceSheetTotals


class ProfitLossHierRow(BaseModel):
    row_type: TrialBalanceRowType
    level: int
    is_group: bool
    is_ledger: bool

    group_id: int | None = None
    group_name: str | None = None
    primary_group: str | None = None  # "INCOME" or "EXPENSE"
    group_path: List[str] = []
    parent_group_id: int | None = None
    parent_group_name: str | None = None
    sort_order: int

    ledger_id: int | None = None
    ledger_name: str

    amount: float


class ProfitLossHierarchicalReport(BaseModel):
    from_date: date
    to_date: date
    income: List[ProfitLossHierRow]
    expenses: List[ProfitLossHierRow]
    totals: dict


class ProfitAndLossRow(BaseModel):
    group_name: str
    amount: float
    group_type: LedgerGroupType


class ProfitAndLossReport(BaseModel):
    from_date: date
    to_date: date
    rows: List[ProfitAndLossRow]
    gross_profit: float
    net_profit: float


class BalanceSheetRow(BaseModel):
    group_name: str
    amount: float
    group_type: LedgerGroupType
    classification: Optional[str] = None  # "Current" or "Non-Current"


class BalanceSheetReport(BaseModel):
    as_on_date: date
    rows: List[BalanceSheetRow]


class BalanceSheetSideRow(BaseModel):
    group_name: str
    amount: float


class BalanceSheetSide(BaseModel):
    title: str
    rows: List[BalanceSheetSideRow]
    total: float


class BalanceSheetTallyStyleReport(BaseModel):
    as_on_date: date
    liabilities: BalanceSheetSide
    assets: BalanceSheetSide
    totals: BalanceSheetTotals


class IncomeExpenseCategoryRow(BaseModel):
    department_id: int | None = None
    department_name: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    income: float = 0
    expense: float = 0
    net: float = 0


class IncomeExpenseReport(BaseModel):
    from_date: date
    to_date: date
    rows: List[IncomeExpenseCategoryRow] = []
    total_income: float = 0
    total_expense: float = 0
    total_net: float = 0


# -------------------- App Settings & Audit --------------------


class AppSettingsRead(BaseModel):
    default_fiscal_year_start: date | None = None
    default_fiscal_year_end: date | None = None
    enable_multi_tenant: bool = True
    max_companies_per_user: int = 3
    ghost_tenant_id: int | None = None
    ghost_company_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class AppSettingsUpdate(BaseModel):
    default_fiscal_year_start: date | None = None
    default_fiscal_year_end: date | None = None
    enable_multi_tenant: bool | None = None
    max_companies_per_user: int | None = None
    ghost_tenant_id: int | None = None
    ghost_company_id: int | None = None


class AuditLogRead(BaseModel):
    id: int
    created_at: datetime
    user_id: int | None
    tenant_id: int | None
    action: str
    message: str

    model_config = ConfigDict(from_attributes=True)


class ActivityLogOut(BaseModel):
    id: int
    timestamp: datetime
    actor: str | None = None
    type: str
    description: str
    tenant_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class MaintenanceTask(BaseModel):
    task: str
    from_date: date | None = None
    to_date: date | None = None
    company_id: int | None = None
    dry_run: bool = False


class CompanyResetRequest(BaseModel):
    confirm: bool  # Must be True to proceed


class NotificationRead(BaseModel):
    id: int
    company_id: int
    type: str
    order_id: int | None = None
    task_id: int | None = None
    created_at: datetime
    read: bool

    model_config = ConfigDict(from_attributes=True)


class CommissionRuleBase(BaseModel):
    name: str = Field(..., max_length=255)
    employee_type_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    is_global_default: bool = False
    basis: CommissionBasis = CommissionBasis.TURNOVER
    rate_percent: float = Field(..., ge=0, le=100)
    is_active: bool = True

class CommissionRuleCreate(CommissionRuleBase):
    pass

class CommissionRuleUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    employee_type_id: int | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    is_global_default: bool | None = None
    basis: CommissionBasis | None = None
    rate_percent: float | None = Field(None, ge=0, le=100)
    is_active: bool | None = None

class CommissionRuleRead(CommissionRuleBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# -------------------- Income/Expense Report by Department/Project --------------------


class IncomeExpenseCategoryRow(BaseModel):
    """Row showing income/expense for a given department/project combination."""
    department_id: int | None = None
    department_name: str | None = None
    project_id: int | None = None
    project_name: str | None = None
    segment_id: int | None = None
    segment_name: str | None = None
    income: float
    expense: float
    net: float  # income - expense


class IncomeExpenseReport(BaseModel):
    """Summary report of income and expenses grouped by department and project."""
    from_date: date
    to_date: date
    rows: List[IncomeExpenseCategoryRow]
    total_income: float
    total_expense: float
    total_net: float

class DaybookRow(BaseModel):
    """Row showing summary of a single voucher."""
    date: date
    id: int
    voucher_type: VoucherType
    voucher_number: Optional[str] = None
    ledger_name: Optional[str] = None
    description: Optional[str] = None
    debit: float
    credit: float

class DaybookReport(BaseModel):
    """Report containing all vouchers within a date range."""
    company_id: int
    company_name: str | None = None
    from_date: date
    to_date: date
    vouchers: list[DaybookRow]

class OnlineOrderReportRow(BaseModel):
    receipt_id: int
    order_id: int
    created_at: datetime
    date: date
    reference: str | None
    customer_name: str
    phone: str | None
    contact_no: str | None = None
    email: str | None = None
    address: str | None = None
    amount: float
    order_status: str
    invoice_id: int | None
    receipt_voucher_id: int | None
    transaction_id: str | None = None
    payment_screenshot: str | None = None
    payment_status: str
    package_id: Optional[int] = None
    package_status: Optional[str] = None

class OnlineOrderReport(BaseModel):
    company_id: int
    from_date: date
    to_date: date
    orders: list[OnlineOrderReportRow]

# -------------------- Delivery Management --------------------

class DeliveryPlaceBase(BaseModel):
    name: str
    default_shipping_charge: float = 0
    is_active: bool = True

class DeliveryPlaceCreate(DeliveryPlaceBase):
    pass

class DeliveryPlaceUpdate(BaseModel):
    name: str | None = None
    default_shipping_charge: float | None = None
    is_active: bool | None = None

class DeliveryPlaceResponse(DeliveryPlaceBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class DeliveryPartnerBase(BaseModel):
    name: str
    phone: str | None = None
    vehicle_number: str | None = None
    is_active: bool = True

class DeliveryPartnerCreate(DeliveryPartnerBase):
    pass

class DeliveryPartnerUpdate(BaseModel):
    name: str | None = None
    phone: str | None = None
    vehicle_number: str | None = None
    is_active: bool | None = None

class DeliveryPartnerResponse(DeliveryPartnerBase):
    id: int
    company_id: int
    ledger_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PackageBase(BaseModel):
    invoice_id: int
    delivery_partner_id: int
    delivery_place_id: int
    tracking_number: str | None = None
    status: str = "PENDING"
    cod_amount: float = 0
    shipping_charge: float = 0

class PackageCreate(PackageBase):
    pass

class PackageUpdate(BaseModel):
    delivery_partner_id: int | None = None
    delivery_place_id: int | None = None
    tracking_number: str | None = None
    status: str | None = None
    cod_amount: float | None = None
    shipping_charge: float | None = None

class PackageResponse(PackageBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

class PackageReceiveCOD(BaseModel):
    amount: float

class FixedAssetReportItem(BaseModel):
    id: int
    name: str
    code: Optional[str] = None
    category: Optional[str] = None
    sub_category: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_cost: float
    opening_balance: float
    quantity_on_hand: float
    depreciation_rate: float
    depreciation_method: str
    depreciation_for_period: float
    accumulated_depreciation: float
    book_value: float

class FixedAssetReport(BaseModel):
    company_name: str
    from_date: date
    to_date: date
    assets: list[FixedAssetReportItem]
    total_purchase_cost: float
    total_depreciation: float
    total_book_value: float

class PostDepreciationRequest(BaseModel):
    from_date: date
    to_date: date
    voucher_date: date
    expense_ledger_id: int
    accumulated_dep_ledger_id: int
    narration: str = "Depreciation of fixed assets"


# -------------------- System Announcements --------------------

class SystemAnnouncementBase(BaseModel):
    message_type: str = "text"
    content: str
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: bool = True
    target_tenant_ids: Optional[list[int]] = None

class SystemAnnouncementCreate(SystemAnnouncementBase):
    pass

class SystemAnnouncementUpdate(BaseModel):
    message_type: Optional[str] = None
    content: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_active: Optional[bool] = None
    target_tenant_ids: Optional[list[int]] = None

class SystemAnnouncementRead(SystemAnnouncementBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)

class ItemHistoryRow(BaseModel):
    date: date
    voucher_type: str
    voucher_number: str | None = None
    party_name: str | None = None
    item_id: int
    item_name: str
    qty: float
    rate: float
    amount: float
    
class ItemHistoryReport(BaseModel):
    company_id: int
    from_date: date
    to_date: date
    rows: list[ItemHistoryRow]


class BOMTransactionRow(BaseModel):
    """Unified BOM-related stock movements: production consume/output, phantom kit sale components."""

    row_type: Literal["production_consume", "production_output", "kit_sale_component"]
    txn_date: date
    ref_id: int
    ref_label: str | None = None
    parent_item_id: int | None = None
    parent_item_code: str | None = None
    parent_item_name: str | None = None
    component_item_id: int | None = None
    component_item_code: str | None = None
    component_item_name: str | None = None
    qty: float
    warehouse_id: int | None = None
    warehouse_name: str | None = None
    department_id: int | None = None
    project_id: int | None = None
    segment_id: int | None = None
    unit_cost: float | None = None
    amount: float | None = None
    bom_id: int | None = None


class BOMTransactionsReport(BaseModel):
    company_id: int
    from_date: date
    to_date: date
    rows: list[BOMTransactionRow]


class EmployeeCostReportRow(BaseModel):
    employee_id: int | None = None
    employee_name: str | None = None
    ledger_id: int | None = None
    ledger_name: str | None = None
    date: dt.date | None = None
    voucher_id: int | None = None
    voucher_number: str | None = None
    debit: float
    credit: float
    remarks: str | None = None
    # For month-wise grouping
    month_name: str | None = None
    year: int | None = None


class EmployeeCostReport(BaseModel):
    company_id: int
    from_date: date
    to_date: date
    rows: list[EmployeeCostReportRow]
    total_debit: float
    total_credit: float
