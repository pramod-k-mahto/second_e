from __future__ import annotations

from datetime import datetime, date, time
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Time,
    Enum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    BigInteger,
    JSON,
    Index,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship, Mapped, mapped_column
from uuid import uuid4

from .database import Base


import enum


class LedgerGroupType(str, enum.Enum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


class OpeningBalanceType(str, enum.Enum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class VoucherType(str, enum.Enum):
    PAYMENT = "PAYMENT"
    RECEIPT = "RECEIPT"
    CONTRA = "CONTRA"
    JOURNAL = "JOURNAL"
    SALES_INVOICE = "SALES_INVOICE"
    PURCHASE_BILL = "PURCHASE_BILL"
    SALES_RETURN = "SALES_RETURN"
    PURCHASE_RETURN = "PURCHASE_RETURN"


class PayrollMode(str, enum.Enum):
    MONTHLY = "MONTHLY"
    DAILY = "DAILY"
    HOURLY = "HOURLY"


class SalaryMode(str, enum.Enum):
    PRO_RATA = "PRO_RATA"   # payable_days from attendance, BASIC prorated, absent deduction applied
    FIXED = "FIXED"         # full base salary always, no absent deduction (ignores attendance)
    HYBRID = "HYBRID"       # full base salary always, absent deduction from attendance records


class PayrollPayheadType(str, enum.Enum):
    EARNING = "EARNING"
    DEDUCTION = "DEDUCTION"


class AttendanceStatus(str, enum.Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LEAVE = "LEAVE"
    HOLIDAY = "HOLIDAY"
    WEEKOFF = "WEEKOFF"
    INCOMPLETE = "INCOMPLETE"


class LeaveRequestStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class PayrollRunStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    COMPUTED = "COMPUTED"
    APPROVED = "APPROVED"
    POSTED = "POSTED"


class LatePenaltyMode(str, enum.Enum):
    PER_MINUTE = "PER_MINUTE"
    SLAB = "SLAB"


class OvertimeMode(str, enum.Enum):
    PER_MINUTE = "PER_MINUTE"
    PER_HOUR = "PER_HOUR"


class AllocationDocType(str, enum.Enum):
    SALES_INVOICE = "SALES_INVOICE"
    PURCHASE_BILL = "PURCHASE_BILL"


class TransactionMode(str, enum.Enum):
    CASH = "CASH"
    BANK = "BANK"
    ESEWA = "ESEWA"
    KHALTI = "KHALTI"
    ONLINE = "ONLINE"
    CREDIT = "CREDIT"


class InventoryValuationMethod(str, enum.Enum):
    FIFO = "FIFO"
    AVERAGE = "AVERAGE"

class UserRole(str, enum.Enum):
    user = "user"
    admin = "admin"
    superadmin = "superadmin"
    TENANT = "TENANT"
    ghost_billing = "ghost_billing"
    ghost_support = "ghost_support"
    ghost_tech = "ghost_tech"


class MenuAccessLevel(str, enum.Enum):
    deny = "deny"      # cannot see/use
    read = "read"      # view/list/get
    update = "update"  # view + create/update
    full = "full"      # everything (including delete)


class DocumentStatus(str, enum.Enum):
    uploaded = "uploaded"
    processed = "processed"
    failed = "failed"
    confirmed = "confirmed"


class BusinessType(Base):
    __tablename__ = "business_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    default_menu_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_templates.id"), nullable=True
    )

    default_menu_template: Mapped[MenuTemplate | None] = relationship("MenuTemplate")
    features: Mapped[list["BusinessTypeFeature"]] = relationship(
        "BusinessTypeFeature", back_populates="business_type", cascade="all, delete-orphan"
    )
    tenants: Mapped[list["Tenant"]] = relationship("Tenant", back_populates="business_type")
    companies: Mapped[list["Company"]] = relationship("Company", back_populates="business_type_rel")


class BusinessTypeFeature(Base):
    __tablename__ = "business_type_features"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_type_id: Mapped[int] = mapped_column(
        ForeignKey("business_types.id", ondelete="CASCADE"), nullable=False
    )
    feature_code: Mapped[str] = mapped_column(String(100), nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    __table_args__ = (
        UniqueConstraint("business_type_id", "feature_code", name="uq_business_type_feature"),
    )

    business_type: Mapped["BusinessType"] = relationship("BusinessType", back_populates="features")


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole, name="userrole"),
        nullable=False,
        default=UserRole.user,
    )
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True, index=True)
    is_tenant_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_system_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    tenant_permissions: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    tenant: Mapped["Tenant | None"] = relationship("Tenant", back_populates="users")
    companies: Mapped[list["Company"]] = relationship("Company", back_populates="owner")
    company_access: Mapped[list["UserCompanyAccess"]] = relationship(
        "UserCompanyAccess", back_populates="user", cascade="all, delete-orphan"
    )

class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")
    plan: Mapped[str] = mapped_column(String(50), nullable=False, default="standard")
    inventory_valuation_method: Mapped[InventoryValuationMethod] = mapped_column(
        Enum(
            InventoryValuationMethod,
            name="inventory_valuation_method",
        ),
        nullable=False,
        default=InventoryValuationMethod.FIFO,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    license_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=5)
    # Document scan control (managed by superadmin/ghost admin)
    document_scan_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    daily_document_scan_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    business_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("business_types.id"), nullable=True, index=True
    )

    menu_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_templates.id"),
        nullable=True,
        index=True,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    companies: Mapped[list["Company"]] = relationship(
        "Company", back_populates="tenant", cascade="all, delete-orphan"
    )
    users: Mapped[list["User"]] = relationship(
        "User", back_populates="tenant", cascade="all, delete-orphan"
    )
    settings: Mapped["TenantSettings"] = relationship(
        "TenantSettings",
        back_populates="tenant",
        uselist=False,
        cascade="all, delete-orphan",
    )

    menu_template: Mapped[MenuTemplate | None] = relationship("MenuTemplate")
    business_type: Mapped[BusinessType | None] = relationship("BusinessType", back_populates="tenants")
    subscriptions: Mapped[list["TenantSubscription"]] = relationship(
        "TenantSubscription", back_populates="tenant", cascade="all, delete-orphan"
    )

    @property
    def menu_template_name(self) -> str | None:
        template = getattr(self, "menu_template", None)
        if not template:
            return None
        return str(getattr(template, "name", None) or "") or None

    @property
    def menu_template_modules(self) -> str | None:
        template = getattr(self, "menu_template", None)
        if not template:
            return None

        modules: set[str] = set()
        for link in getattr(template, "menus", []) or []:
            menu = getattr(link, "menu", None)
            module = str(getattr(menu, "module", "") or "").strip() if menu else ""
            if module:
                modules.add(module)

        if not modules:
            return ""

        return ", ".join(sorted(modules, key=lambda x: x.casefold()))

    @property
    def business_type_name(self) -> str | None:
        return self.business_type.name if self.business_type else None

    @property
    def users_count(self) -> int:
        return len(self.users)

    @property
    def user_count(self) -> int:
        return self.users_count

    @property
    def companies_count(self) -> int:
        return len(self.companies)


class TenantSubscription(Base):
    __tablename__ = "tenant_subscriptions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    plan_code: Mapped[str] = mapped_column(String(50), nullable=False)
    amount_paid: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    period_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    period_end: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    payment_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    payment_method: Mapped[TransactionMode] = mapped_column(Enum(TransactionMode, name="transaction_mode_sub"), nullable=False)
    bank_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PAID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="subscriptions")


class MenuTemplate(Base):
    __tablename__ = "menu_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    superadmin_only: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    menus: Mapped[list["MenuTemplateMenu"]] = relationship(
        "MenuTemplateMenu",
        back_populates="template",
        cascade="all, delete-orphan",
    )


class MenuTemplateMenu(Base):
    __tablename__ = "menu_template_menus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    template_id: Mapped[int] = mapped_column(ForeignKey("menu_templates.id", ondelete="CASCADE"), nullable=False)
    menu_id: Mapped[int] = mapped_column(ForeignKey("menus.id", ondelete="CASCADE"), nullable=False)

    group_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    group_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    item_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("menus.id", name="fk_menu_template_menus_parent_id"), nullable=True
    )
    is_sidebar_visible: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("template_id", "menu_id", name="uq_menu_template_menu"),
        Index("ix_menu_template_menus_template_id", "template_id"),
        Index("ix_menu_template_menus_menu_id", "menu_id"),
    )

    template: Mapped["MenuTemplate"] = relationship("MenuTemplate", back_populates="menus")
    menu: Mapped["Menu"] = relationship("Menu", foreign_keys=[menu_id])
    parent: Mapped[Optional["Menu"]] = relationship("Menu", foreign_keys=[parent_id])


class TenantSettings(Base):
    __tablename__ = "tenant_settings"

    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        primary_key=True,
    )
    inventory_valuation_method: Mapped[InventoryValuationMethod] = mapped_column(
        Enum(
            InventoryValuationMethod,
            name="inventory_valuation_method",
        ),
        nullable=False,
        default=InventoryValuationMethod.FIFO,
    )
    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="settings")


class CompanySettings(Base):
    __tablename__ = "company_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    calendar_mode: Mapped[str] = mapped_column(String(10), nullable=False, default="AD")
    website_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    website_api_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_qr_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    
    # Notification settings
    notify_on_dispatch: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_on_delivery: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_on_order_placed: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_on_payment_received: Mapped[bool] = mapped_column(Boolean, default=False)
    notify_on_overdue: Mapped[bool] = mapped_column(Boolean, default=False)
    overdue_reminders: Mapped[dict | None] = mapped_column(JSONB, nullable=True) # List of days [1, 7, 15]
    message_templates: Mapped[dict | None] = mapped_column(JSONB, nullable=True) # { "dispatch": "...", "delivery": "...", etc }
    smtp_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # host, port, user, password, from_email
    whatsapp_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)  # api_endpoint, token, from_number
    
    # AI Assistant settings
    ai_provider: Mapped[str | None] = mapped_column(String(50), nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(100), nullable=True)  # e.g. gpt-4o, gemini-1.5-pro
    ai_api_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ai_temperature: Mapped[float | None] = mapped_column(nullable=True, default=0.7)
    ai_max_tokens: Mapped[int | None] = mapped_column(Integer, nullable=True, default=1024)
    ai_system_prompt: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_permissions: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    ai_chatbot_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    company: Mapped["Company"] = relationship("Company", back_populates="settings")


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    fiscal_year_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    fiscal_year_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    pan_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    business_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("business_types.id"), nullable=True, index=True
    )
    business_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    currency: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    default_purchase_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_sales_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_item_income_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_item_expense_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_input_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_output_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_item_input_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_item_output_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_incentive_expense_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    default_incentive_payable_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    inventory_valuation_method: Mapped[InventoryValuationMethod] = mapped_column(
        Enum(
            InventoryValuationMethod,
            name="inventory_valuation_method",
        ),
        nullable=False,
        default=InventoryValuationMethod.AVERAGE,
    )
    # Cost center configuration per company.
    # cost_center_mode: None (disabled), "single", or "double".
    cost_center_mode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    # When cost_center_mode == "single", indicates which dimension is active:
    # "department" or "project".
    cost_center_single_dimension: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    enable_cost_centers_in_vouchers: Mapped[bool] = mapped_column(Boolean, default=False)
    
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    owner: Mapped[User] = relationship("User", back_populates="companies")
    tenant: Mapped["Tenant"] = relationship("Tenant", back_populates="companies")
    business_type_rel: Mapped[BusinessType | None] = relationship("BusinessType", back_populates="companies")
    settings: Mapped["CompanySettings"] = relationship(
        "CompanySettings",
        back_populates="company",
        uselist=False,
        cascade="all, delete-orphan",
    )
    ledger_groups: Mapped[list["LedgerGroup"]] = relationship(
        "LedgerGroup",
        back_populates="company",
        cascade="all, delete-orphan",
        foreign_keys="LedgerGroup.company_id",
    )
    ledgers: Mapped[list["Ledger"]] = relationship(
        "Ledger",
        back_populates="company",
        cascade="all, delete-orphan",
        foreign_keys="Ledger.company_id",
    )
    vouchers: Mapped[list["Voucher"]] = relationship(
        "Voucher", back_populates="company", cascade="all, delete-orphan"
    )

    customers: Mapped[list["Customer"]] = relationship(
        "Customer", back_populates="company", cascade="all, delete-orphan"
    )
    suppliers: Mapped[list["Supplier"]] = relationship(
        "Supplier", back_populates="company", cascade="all, delete-orphan"
    )
    items: Mapped[list["Item"]] = relationship(
        "Item", back_populates="company", cascade="all, delete-orphan"
    )

    user_access: Mapped[list["UserCompanyAccess"]] = relationship(
        "UserCompanyAccess", back_populates="company", cascade="all, delete-orphan"
    )

    warehouses: Mapped[list["Warehouse"]] = relationship(
        "Warehouse", back_populates="company", cascade="all, delete-orphan"
    )
    payment_modes: Mapped[list["PaymentMode"]] = relationship(
        "PaymentMode", back_populates="company", cascade="all, delete-orphan"
    )


class Department(Base):
    __tablename__ = "departments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class RestaurantTable(Base):
    __tablename__ = "restaurant_tables"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Segment(Base):
    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ItemCategory(Base):
    __tablename__ = "item_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ItemSubCategory(Base):
    __tablename__ = "item_subcategories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("item_categories.id"), nullable=True
    )
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class ItemBrand(Base):
    __tablename__ = "item_brands"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    tenant_id: Mapped[int | None] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(100), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)


class Plan(Base):
    __tablename__ = "plans"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    price_monthly: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    price_yearly: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    max_companies: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_users: Mapped[int | None] = mapped_column(Integer, nullable=True)

    menu_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("menu_templates.id"), nullable=True
    )

    features: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    menu_template: Mapped[Optional["MenuTemplate"]] = relationship("MenuTemplate")

class LedgerGroup(Base):
    __tablename__ = "ledger_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    group_type: Mapped[LedgerGroupType] = mapped_column(Enum(LedgerGroupType), nullable=False)
    parent_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledger_groups.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company", back_populates="ledger_groups")
    parent_group: Mapped[Optional["LedgerGroup"]] = relationship("LedgerGroup", remote_side=[id])
    ledgers: Mapped[list["Ledger"]] = relationship("Ledger", back_populates="group")


class Ledger(Base):
    __tablename__ = "ledgers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    group_id: Mapped[int] = mapped_column(ForeignKey("ledger_groups.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    opening_balance: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    opening_balance_type: Mapped[OpeningBalanceType] = mapped_column(
        Enum(OpeningBalanceType, name="opening_balance_type"),
        default=OpeningBalanceType.DEBIT,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship(
        "Company", back_populates="ledgers", foreign_keys=[company_id]
    )
    group: Mapped["LedgerGroup"] = relationship("LedgerGroup", back_populates="ledgers")
    voucher_lines: Mapped[list["VoucherLine"]] = relationship(
        "VoucherLine", back_populates="ledger"
    )

    customer: Mapped[Optional["Customer"]] = relationship(
        "Customer", back_populates="ledger", uselist=False
    )
    supplier: Mapped[Optional["Supplier"]] = relationship(
        "Supplier", back_populates="ledger", uselist=False
    )
    sales_items: Mapped[list["Item"]] = relationship(
        "Item", back_populates="income_ledger", foreign_keys="Item.income_ledger_id"
    )
    purchase_items: Mapped[list["Item"]] = relationship(
        "Item", back_populates="expense_ledger", foreign_keys="Item.expense_ledger_id"
    )
    output_tax_items: Mapped[list["Item"]] = relationship(
        "Item", back_populates="output_tax_ledger", foreign_keys="Item.output_tax_ledger_id"
    )
    input_tax_items: Mapped[list["Item"]] = relationship(
        "Item", back_populates="input_tax_ledger", foreign_keys="Item.input_tax_ledger_id"
    )


class PaymentMode(Base):
    __tablename__ = "payment_modes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    ledger_id: Mapped[int] = mapped_column(
        ForeignKey("ledgers.id", ondelete="CASCADE"), nullable=False
    )
    ledger_group_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledger_groups.id", ondelete="CASCADE"), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_payment_modes_company_name"),
    )

    company: Mapped["Company"] = relationship("Company", back_populates="payment_modes")
    ledger: Mapped["Ledger"] = relationship("Ledger")
    ledger_group: Mapped["LedgerGroup"] = relationship("LedgerGroup")


class Voucher(Base):
    __tablename__ = "vouchers"
    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "fiscal_year",
            "voucher_type",
            "voucher_sequence",
            name="uq_vouchers_company_fy_type_sequence",
        ),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    voucher_date: Mapped[date] = mapped_column(Date, nullable=False)
    bill_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    voucher_type: Mapped[VoucherType] = mapped_column(Enum(VoucherType), nullable=False)
    fiscal_year: Mapped[str | None] = mapped_column(String(20), nullable=True)
    voucher_sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    voucher_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_mode_id: Mapped[int | None] = mapped_column(ForeignKey("payment_modes.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"), nullable=True)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id"), nullable=True)
    bank_remark: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    company: Mapped["Company"] = relationship("Company", back_populates="vouchers")
    payment_mode: Mapped[PaymentMode | None] = relationship("PaymentMode")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    employee: Mapped[Optional["Employee"]] = relationship("Employee")
    lines: Mapped[list["VoucherLine"]] = relationship(
        "VoucherLine", back_populates="voucher", cascade="all, delete-orphan"
    )
    allocations: Mapped[list["VoucherAllocation"]] = relationship(
        "VoucherAllocation",
        back_populates="voucher",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    # Cascade delete voucher logs at the database level (ON DELETE CASCADE) and
    # reflect that in the ORM using passive_deletes so SQLAlchemy doesn't need
    # to load logs before deleting a voucher.
    logs: Mapped[list["VoucherLog"]] = relationship(
        "VoucherLog",
        back_populates="voucher",
        passive_deletes=True,
    )

    sales_invoice: Mapped[Optional["SalesInvoice"]] = relationship(
        "SalesInvoice", back_populates="voucher", uselist=False
    )
    purchase_bill: Mapped[Optional["PurchaseBill"]] = relationship(
        "PurchaseBill", back_populates="voucher", uselist=False
    )
    sales_return: Mapped[Optional["SalesReturn"]] = relationship(
        "SalesReturn", back_populates="voucher", uselist=False
    )
    purchase_return: Mapped[Optional["PurchaseReturn"]] = relationship(
        "PurchaseReturn", back_populates="voucher", uselist=False
    )


class VoucherLine(Base):
    __tablename__ = "voucher_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    voucher_id: Mapped[int] = mapped_column(ForeignKey("vouchers.id"), nullable=False)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    debit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    credit: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    # Optional cost center dimensions
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id"), nullable=True
    )
    employee_id: Mapped[int | None] = mapped_column(
        ForeignKey("employees.id"), nullable=True
    )
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    voucher: Mapped["Voucher"] = relationship("Voucher", back_populates="lines")
    ledger: Mapped["Ledger"] = relationship("Ledger", back_populates="voucher_lines")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    employee: Mapped[Optional["Employee"]] = relationship("Employee")

    __table_args__ = (
        CheckConstraint("debit >= 0", name="ck_voucher_lines_debit_non_negative"),
        CheckConstraint("credit >= 0", name="ck_voucher_lines_credit_non_negative"),
    )


class VoucherAllocation(Base):
    __tablename__ = "voucher_allocations"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    voucher_id: Mapped[int] = mapped_column(
        ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False, index=True
    )
    party_ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False, index=True)
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    doc_id: Mapped[int] = mapped_column(Integer, nullable=False)
    allocated_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    voucher: Mapped["Voucher"] = relationship("Voucher", back_populates="allocations")
    party_ledger: Mapped["Ledger"] = relationship("Ledger")

    __table_args__ = (
        UniqueConstraint("voucher_id", "doc_type", "doc_id", name="uq_voucher_allocations_voucher_doc"),
        CheckConstraint("allocated_amount >= 0", name="ck_voucher_allocations_amount_positive"),
        Index("ix_voucher_allocations_doc_lookup", "company_id", "doc_type", "doc_id"),
    )


class ImportJob(Base):
    __tablename__ = "import_jobs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)

    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    data_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="DRAFT", index=True)

    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    files: Mapped[list["ImportFile"]] = relationship(
        "ImportFile",
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    staging_rows: Mapped[list["ImportStagingRow"]] = relationship(
        "ImportStagingRow",
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    result: Mapped[Optional["ImportResult"]] = relationship(
        "ImportResult",
        back_populates="job",
        uselist=False,
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    idempotency_keys: Mapped[list["ImportIdempotencyKey"]] = relationship(
        "ImportIdempotencyKey",
        back_populates="job",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ImportFile(Base):
    __tablename__ = "import_files"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_job_id: Mapped[int] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    filename: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(String(50), nullable=False)
    stored_path: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    job: Mapped["ImportJob"] = relationship("ImportJob", back_populates="files")


class ImportStagingRow(Base):
    __tablename__ = "import_staging_rows"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_job_id: Mapped[int] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    row_no: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_data: Mapped[dict] = mapped_column(JSONB, nullable=False)
    mapped_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    validation_errors: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="PENDING", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint("import_job_id", "row_no", name="uq_import_staging_rows_job_row_no"),
    )

    job: Mapped["ImportJob"] = relationship("ImportJob", back_populates="staging_rows")


class ImportFieldMapping(Base):
    __tablename__ = "import_field_mappings"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(Text, nullable=False)
    data_type: Mapped[str] = mapped_column(Text, nullable=False)
    mapping_name: Mapped[str] = mapped_column(Text, nullable=False)
    mapping_json: Mapped[dict] = mapped_column(JSONB, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "source_type",
            "data_type",
            "mapping_name",
            name="uq_import_field_mappings_company_src_type_name",
        ),
    )


class ImportResult(Base):
    __tablename__ = "import_results"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    import_job_id: Mapped[int] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )
    created_ids: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    job: Mapped["ImportJob"] = relationship("ImportJob", back_populates="result")


class ImportIdempotencyKey(Base):
    __tablename__ = "import_idempotency_keys"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    import_job_id: Mapped[int] = mapped_column(
        ForeignKey("import_jobs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    data_type: Mapped[str] = mapped_column(Text, nullable=False)
    external_ref: Mapped[str] = mapped_column(Text, nullable=False)
    created_entity_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_entity_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "data_type",
            "external_ref",
            name="uq_import_idempotency_keys_company_type_ref",
        ),
    )

    job: Mapped["ImportJob"] = relationship("ImportJob", back_populates="idempotency_keys")


class VoucherAction(str, enum.Enum):
    CREATED = "CREATED"
    UPDATED = "UPDATED"
    DELETED = "DELETED"


class VoucherLog(Base):
    __tablename__ = "voucher_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    voucher_id: Mapped[int] = mapped_column(
        ForeignKey("vouchers.id", ondelete="CASCADE"), nullable=False
    )
    voucher_number: Mapped[str | None] = mapped_column(Text, nullable=True)
    action: Mapped[VoucherAction] = mapped_column(
        Enum(VoucherAction, name="voucher_action"), nullable=False
    )
    actor: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    diff_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )

    voucher: Mapped["Voucher"] = relationship("Voucher", back_populates="logs")


class Customer(Base):
    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    customer_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    billing_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    shipping_address_same_as_billing: Mapped[bool] = mapped_column(Boolean, default=True)
    shipping_city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    shipping_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    shipping_phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    vat_gst_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pan_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    registration_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tax_exempt: Mapped[bool] = mapped_column(Boolean, default=False)

    credit_limit: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    credit_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    default_payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    opening_balance: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    balance_type: Mapped[Optional[OpeningBalanceType]] = mapped_column(
        Enum(OpeningBalanceType), nullable=True
    )

    price_level: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    allow_credit: Mapped[bool] = mapped_column(Boolean, default=True)
    preferred_delivery_time: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    preferred_sales_person: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_purchase_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company", back_populates="customers")
    ledger: Mapped["Ledger"] = relationship("Ledger", back_populates="customer")


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    contact_person: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    mobile: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    website: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    country: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    district: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    area: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    street_address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    postal_code: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    bank_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_holder_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    account_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    branch_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ifsc_swift_routing_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    preferred_payment_mode: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    credit_limit: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    credit_days: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    vat_gst_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    pan_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    registration_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    hsn_sac_relevancy: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tax_exempt: Mapped[bool] = mapped_column(Boolean, default=False)

    supplier_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    product_categories: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    delivery_terms: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    return_policy: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    documents: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    tenant_id: Mapped[Optional[int]] = mapped_column(ForeignKey("tenants.id"), nullable=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    assigned_employee_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    updated_by_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company", back_populates="suppliers")
    ledger: Mapped["Ledger"] = relationship("Ledger", back_populates="supplier")


class UserCompanyAccess(Base):
    __tablename__ = "user_company_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)

    # Module-level flags within this company
    can_sales: Mapped[bool] = mapped_column(Boolean, default=True)
    can_purchases: Mapped[bool] = mapped_column(Boolean, default=True)
    can_inventory: Mapped[bool] = mapped_column(Boolean, default=True)
    can_reports: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user: Mapped["User"] = relationship("User", back_populates="company_access")
    company: Mapped["Company"] = relationship("Company", back_populates="user_access")


class Menu(Base):
    __tablename__ = "menus"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    label: Mapped[str] = mapped_column(String(255), nullable=False)
    module: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("menus.id"), nullable=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    parent: Mapped[Optional["Menu"]] = relationship("Menu", remote_side="Menu.id")


class UserMenuAccess(Base):
    __tablename__ = "user_menu_access"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tenant_id: Mapped[int] = mapped_column(ForeignKey("tenants.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    menu_id: Mapped[int] = mapped_column(ForeignKey("menus.id"), nullable=False, index=True)
    allowed: Mapped[bool] = mapped_column(Boolean, default=True)
    access_level: Mapped[MenuAccessLevel] = mapped_column(
        Enum(MenuAccessLevel, name="menuaccesslevel"),
        nullable=False,
        default=MenuAccessLevel.full,
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "company_id",
            "user_id",
            "menu_id",
            name="uq_tenant_company_user_menu",
        ),
    )

    user: Mapped["User"] = relationship("User")
    company: Mapped["Company"] = relationship("Company")
    menu: Mapped["Menu"] = relationship("Menu")


class Unit(Base):
    __tablename__ = "units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    decimals: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class ItemUnit(Base):
    __tablename__ = "item_units"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    unit_code: Mapped[str] = mapped_column(String(20), nullable=False)
    is_base: Mapped[bool] = mapped_column(Boolean, default=False)
    factor_to_base: Mapped[float] = mapped_column(Numeric(18, 6), default=1)
    decimals: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sort_order: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    item: Mapped["Item"] = relationship("Item", back_populates="units")

class DutyTax(Base):
    __tablename__ = "duty_taxes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    purchase_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    income_rate: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    tds_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped["Company"] = relationship("Company")
    ledger: Mapped[Optional["Ledger"]] = relationship("Ledger")

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_duty_taxes_company_name"),
    )

class TdsCategory(Base):
    __tablename__ = "tds_categories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_tds_categories_company_name"),
    )


class Item(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    code: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sku: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    barcode: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sub_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    brand_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    manufacturer: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    model_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    unit: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    default_sales_rate: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    default_purchase_rate: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    default_tax_rate: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    mrp: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    wholesale_price: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    delivery_charge: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    opening_stock: Mapped[Optional[float]] = mapped_column(Numeric(14, 3), nullable=True)
    opening_rate: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    opening_value: Mapped[Optional[float]] = mapped_column(Numeric(14, 2), nullable=True)
    standard_cost: Mapped[Optional[float]] = mapped_column(Numeric(14, 6), nullable=True)
    opening_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    reorder_level: Mapped[Optional[float]] = mapped_column(Numeric(14, 3), nullable=True)
    min_stock_warning: Mapped[Optional[float]] = mapped_column(Numeric(14, 3), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    specifications: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gallery_images: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    hsn_sac_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    is_fixed_asset: Mapped[bool] = mapped_column(Boolean, default=False)
    depreciation_rate: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    depreciation_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    income_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    expense_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    output_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    input_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )

    allow_negative_stock: Mapped[bool] = mapped_column(Boolean, default=False)
    sell_as_kit: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    costing_method: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    show_in_online_store: Mapped[bool] = mapped_column(Boolean, default=False)
    is_featured: Mapped[bool] = mapped_column(Boolean, default=False)
    is_returnable: Mapped[bool] = mapped_column(Boolean, default=True)
    has_variants: Mapped[bool] = mapped_column(Boolean, default=False)
    variant_attributes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Pharmacy / Medical Fields
    generic_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    dosage_form: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    drug_schedule: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    composition: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    strength: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    packing: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    prescription_required: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Advanced Tracking
    is_batch_tracked: Mapped[bool] = mapped_column(Boolean, default=False)
    is_expiry_tracked: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # Flexible Metadata
    field_metadata: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    seo_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    seo_keywords: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    slug: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    duty_tax_id: Mapped[int | None] = mapped_column(
        ForeignKey("duty_taxes.id", ondelete="SET NULL"), nullable=True
    )

    company: Mapped["Company"] = relationship("Company", back_populates="items")

    income_ledger: Mapped[Optional["Ledger"]] = relationship(
        "Ledger", back_populates="sales_items", foreign_keys=[income_ledger_id]
    )
    expense_ledger: Mapped[Optional["Ledger"]] = relationship(
        "Ledger", back_populates="purchase_items", foreign_keys=[expense_ledger_id]
    )
    output_tax_ledger: Mapped[Optional["Ledger"]] = relationship(
        "Ledger", back_populates="output_tax_items", foreign_keys=[output_tax_ledger_id]
    )
    input_tax_ledger: Mapped[Optional["Ledger"]] = relationship(
        "Ledger", back_populates="input_tax_items", foreign_keys=[input_tax_ledger_id]
    )
    duty_tax: Mapped[Optional["DutyTax"]] = relationship("DutyTax", foreign_keys=[duty_tax_id])

    units: Mapped[list["ItemUnit"]] = relationship(
        "ItemUnit", back_populates="item", cascade="all, delete-orphan"
    )

    @property
    def sales_ledger_id(self) -> int | None:
        return self.income_ledger_id

    @property
    def purchase_ledger_id(self) -> int | None:
        return self.expense_ledger_id

    @property
    def ledger_overrides_company_defaults(self) -> bool:
        company = getattr(self, "company", None)
        if company is None:
            return False

        overrides = False
        default_sales = getattr(company, "default_sales_ledger_id", None)
        default_purchase = getattr(company, "default_purchase_ledger_id", None)

        if default_sales is not None and self.income_ledger_id is not None:
            overrides = overrides or (int(self.income_ledger_id) != int(default_sales))

        if default_purchase is not None and self.expense_ledger_id is not None:
            overrides = overrides or (int(self.expense_ledger_id) != int(default_purchase))

        return overrides

    @property
    def ledger_override_warning(self) -> str | None:
        if not self.ledger_overrides_company_defaults:
            return None
        return (
            "You are overriding the default ledger set in Company Settings. "
            "This item will post to a different account than the standard setup."
        )
    
class ItemFieldConfig(Base):
    __tablename__ = "item_field_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    business_type: Mapped[str] = mapped_column(String(100), index=True) # e.g. PHARMACY, RETAIL
    field_code: Mapped[str] = mapped_column(String(100)) # e.g. generic_name
    display_label: Mapped[str] = mapped_column(String(255))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_required: Mapped[bool] = mapped_column(Boolean, default=False)
    group_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        UniqueConstraint("business_type", "field_code", name="uq_item_field_business_code"),
    )


class Warehouse(Base):
    __tablename__ = "warehouses"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id"), nullable=True
    )

    company: Mapped["Company"] = relationship("Company", back_populates="warehouses")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")


class StockMovement(Base):
    __tablename__ = "stock_movements"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    movement_date: Mapped[date] = mapped_column(Date, nullable=False)
    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    qty_in: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    qty_out: Mapped[float] = mapped_column(Numeric(14, 3), default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )


class StockLedger(Base):
    __tablename__ = "stock_ledger"
    __table_args__ = (
        Index("ix_stock_ledger_company_wh_item", "company_id", "warehouse_id", "item_id"),
        Index(
            "ix_stock_ledger_source_active",
            "company_id",
            "source_type",
            "source_id",
            "reversed_at",
        ),
        Index(
            "ix_stock_ledger_source_line_active",
            "company_id",
            "source_type",
            "source_line_id",
            "reversed_at",
        ),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)

    qty_delta: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    unit_cost: Mapped[float | None] = mapped_column(Numeric(14, 6), nullable=True)

    source_type: Mapped[str] = mapped_column(String(50), nullable=False)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False)
    source_line_id: Mapped[int | None] = mapped_column(Integer, nullable=True)

    posted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    reversed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    reversal_of_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("stock_ledger.id"),
        nullable=True,
    )
    created_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )


class StockBatch(Base):
    __tablename__ = "stock_batches"
    __table_args__ = (
        Index(
            "idx_batches_tenant_product_date",
            "tenant_id",
            "product_id",
            "created_at",
        ),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    tenant_id: Mapped[int] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    ref_type: Mapped[str] = mapped_column(String(20), nullable=False)
    ref_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    qty_in: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    qty_out: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False, default=0)
    rate: Mapped[float] = mapped_column(Numeric(12, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    tenant: Mapped["Tenant"] = relationship("Tenant")
    product: Mapped["Item"] = relationship("Item")


class ProductionOrderStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    APPROVED = "APPROVED"
    RUNNING = "RUNNING"
    RELEASED = "RELEASED"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"


class BOMMaster(Base):
    __tablename__ = "bom_master"
    __table_args__ = (
        Index("ix_bom_master_company_product", "company_id", "product_id"),
        Index("ix_bom_master_company_created", "company_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    bom_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    batch_size: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="ACTIVE")
    approval_status: Mapped[str] = mapped_column(String(20), nullable=False, default="DRAFT")
    approved_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    labor_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    machine_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    electricity_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    packing_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    overhead_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id", ondelete="SET NULL"), nullable=True
    )
    effective_from: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    effective_to: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    company: Mapped["Company"] = relationship("Company")
    product: Mapped["Item"] = relationship("Item", foreign_keys=[product_id])
    department: Mapped["Department | None"] = relationship("Department", foreign_keys=[department_id])
    project: Mapped["Project | None"] = relationship("Project", foreign_keys=[project_id])
    segment: Mapped["Segment | None"] = relationship("Segment", foreign_keys=[segment_id])
    items: Mapped[list["BOMItem"]] = relationship(
        "BOMItem", back_populates="bom", cascade="all, delete-orphan"
    )


class BOMItem(Base):
    __tablename__ = "bom_items"
    __table_args__ = (
        Index("ix_bom_items_bom_id", "bom_id"),
        Index("ix_bom_items_component_product", "component_product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bom_id: Mapped[int] = mapped_column(ForeignKey("bom_master.id", ondelete="CASCADE"), nullable=False)
    component_product_id: Mapped[int] = mapped_column(
        ForeignKey("items.id", ondelete="RESTRICT"), nullable=False
    )
    quantity: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    wastage_percent: Mapped[float] = mapped_column(Numeric(8, 3), nullable=False, default=0)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    bom: Mapped["BOMMaster"] = relationship("BOMMaster", back_populates="items")
    component_product: Mapped["Item"] = relationship("Item", foreign_keys=[component_product_id])


class ProductionOrder(Base):
    __tablename__ = "production_orders"
    __table_args__ = (
        Index("ix_production_orders_company_product", "company_id", "product_id"),
        Index("ix_production_orders_company_created", "company_id", "created_at"),
        Index("ix_production_orders_status", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    product_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    order_no: Mapped[str | None] = mapped_column(String(40), nullable=True)
    order_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    planned_qty: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)
    expected_completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    priority: Mapped[str | None] = mapped_column(String(20), nullable=True)
    supervisor_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    operator: Mapped[str | None] = mapped_column(String(120), nullable=True)
    machine: Mapped[str | None] = mapped_column(String(120), nullable=True)
    rejection_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    damaged_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    status: Mapped[ProductionOrderStatus] = mapped_column(
        Enum(ProductionOrderStatus, name="production_order_status", native_enum=False),
        nullable=False,
        default=ProductionOrderStatus.COMPLETED,
    )
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    bom_id: Mapped[int | None] = mapped_column(ForeignKey("bom_master.id", ondelete="SET NULL"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id", ondelete="SET NULL"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id", ondelete="SET NULL"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id", ondelete="SET NULL"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    bom_as_of: Mapped[date | None] = mapped_column(Date, nullable=True)
    expand_sub_assemblies: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    options: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    company: Mapped["Company"] = relationship("Company")
    product: Mapped["Item"] = relationship("Item", foreign_keys=[product_id])
    warehouse: Mapped["Warehouse | None"] = relationship("Warehouse", foreign_keys=[warehouse_id])
    bom: Mapped["BOMMaster | None"] = relationship("BOMMaster", foreign_keys=[bom_id])
    department: Mapped["Department | None"] = relationship("Department", foreign_keys=[department_id])
    project: Mapped["Project | None"] = relationship("Project", foreign_keys=[project_id])
    segment: Mapped["Segment | None"] = relationship("Segment", foreign_keys=[segment_id])
    voucher: Mapped["Voucher | None"] = relationship("Voucher", foreign_keys=[voucher_id])
    items: Mapped[list["ProductionItem"]] = relationship(
        "ProductionItem", back_populates="production_order", cascade="all, delete-orphan"
    )

    @property
    def voucher_number(self) -> str | None:
        return self.voucher.voucher_number if self.voucher else None


class ProductionItem(Base):
    __tablename__ = "production_items"
    __table_args__ = (
        Index("ix_production_items_order", "production_order_id"),
        Index("ix_production_items_product", "product_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    production_order_id: Mapped[int] = mapped_column(
        ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("items.id", ondelete="RESTRICT"), nullable=False)
    consumed_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)

    production_order: Mapped["ProductionOrder"] = relationship("ProductionOrder", back_populates="items")
    product: Mapped["Item"] = relationship("Item", foreign_keys=[product_id])


class ManufacturingSettings(Base):
    __tablename__ = "manufacturing_settings"
    __table_args__ = (
        Index("ix_manufacturing_settings_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    default_wip_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True)
    default_fg_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True)
    default_rm_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id", ondelete="SET NULL"), nullable=True)
    default_warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    costing_method: Mapped[str] = mapped_column(String(20), nullable=False, default="AUTO")
    approval_required: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    ai_predictions_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ProductionIssue(Base):
    __tablename__ = "production_issue"
    __table_args__ = (
        Index("ix_production_issue_company_order", "company_id", "production_order_id"),
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False)
    issue_no: Mapped[str] = mapped_column(String(40), nullable=False)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    issued_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    total_value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ProductionWIP(Base):
    __tablename__ = "production_wip"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    current_stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    issued_material_value: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    labor_added: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    overhead_added: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_wip_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class ProductionEntry(Base):
    __tablename__ = "production_entries"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    entry_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    produced_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    rejected_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    damaged_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    extra_consumption: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    stage: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ProductionFinishedGoods(Base):
    __tablename__ = "production_finished_goods"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    receive_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id", ondelete="SET NULL"), nullable=True)
    received_qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    unit_cost: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False, default=0)
    total_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ProductionScrap(Base):
    __tablename__ = "production_scrap"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    production_order_id: Mapped[int | None] = mapped_column(ForeignKey("production_orders.id", ondelete="SET NULL"), nullable=True, index=True)
    scrap_type: Mapped[str] = mapped_column(String(100), nullable=False)
    qty: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False, default=0)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    recoverable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    saleable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)


class ProductionCosting(Base):
    __tablename__ = "production_costing"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    production_order_id: Mapped[int] = mapped_column(ForeignKey("production_orders.id", ondelete="CASCADE"), nullable=False, index=True)
    material_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    labor_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    machine_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    electricity_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    packing_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    overhead_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_batch_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    cost_per_unit: Mapped[float] = mapped_column(Numeric(14, 6), nullable=False, default=0)
    variance_cost: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    profit_margin: Mapped[float] = mapped_column(Numeric(8, 3), nullable=False, default=0)
    created_by: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)


class StockTransferStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    POSTED = "POSTED"


class StockTransfer(Base):
    __tablename__ = "stock_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    transfer_number: Mapped[str | None] = mapped_column(String(50), nullable=True)
    transfer_date: Mapped[date] = mapped_column(Date, nullable=False)
    from_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    to_warehouse_id: Mapped[int] = mapped_column(ForeignKey("warehouses.id"), nullable=False)
    status: Mapped[StockTransferStatus] = mapped_column(
        Enum(StockTransferStatus, name="stock_transfer_status"),
        nullable=False,
        default=StockTransferStatus.DRAFT,
    )
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )
    posted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id"), nullable=True, index=True
    )

    company: Mapped["Company"] = relationship("Company")
    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher")

    @property
    def voucher_number(self) -> str | None:
        return self.voucher.voucher_number if self.voucher else None
    from_warehouse: Mapped["Warehouse"] = relationship(
        "Warehouse", foreign_keys=[from_warehouse_id]
    )
    to_warehouse: Mapped["Warehouse"] = relationship(
        "Warehouse", foreign_keys=[to_warehouse_id]
    )
    lines: Mapped[list["StockTransferLine"]] = relationship(
        "StockTransferLine", back_populates="transfer", cascade="all, delete-orphan"
    )


class StockTransferLine(Base):
    __tablename__ = "stock_transfer_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transfer_id: Mapped[int] = mapped_column(
        ForeignKey("stock_transfers.id"), nullable=False
    )
    line_no: Mapped[int] = mapped_column(Integer, nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    unit: Mapped[str] = mapped_column(String(20), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(18, 6), nullable=False)
    unit_cost: Mapped[float | None] = mapped_column(Numeric(18, 6), nullable=True)

    transfer: Mapped["StockTransfer"] = relationship(
        "StockTransfer", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")


class WebsiteOrderReceipt(Base):
    __tablename__ = "website_order_receipts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idempotency_key: Mapped[str] = mapped_column(String(255), nullable=False)
    request_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    external_reference: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sales_order_id: Mapped[int] = mapped_column(
        ForeignKey("sales_orders.id", ondelete="CASCADE"), nullable=False, index=True
    )
    receipt_voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id", ondelete="SET NULL"), nullable=True, index=True
    )
    transaction_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    payment_screenshot: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint(
            "company_id",
            "idempotency_key",
            name="uq_website_order_receipts_company_id_idempotency_key",
        ),
    )


class SalesOrder(Base):
    __tablename__ = "sales_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    sales_person_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales_persons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    converted_to_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    customer: Mapped["Customer"] = relationship("Customer")
    sales_person: Mapped[Optional["SalesPerson"]] = relationship(
        "SalesPerson", foreign_keys=[sales_person_id]
    )
    invoice: Mapped[Optional["SalesInvoice"]] = relationship(
        "SalesInvoice", foreign_keys=[converted_to_invoice_id]
    )
    lines: Mapped[list["SalesOrderLine"]] = relationship(
        "SalesOrderLine", back_populates="order", cascade="all, delete-orphan"
    )


class SalesOrderLine(Base):
    __tablename__ = "sales_order_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("sales_orders.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    hs_code: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["SalesOrder"] = relationship(
        "SalesOrder", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")
    converted_to_bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_bills.id", ondelete="SET NULL"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    supplier: Mapped["Supplier"] = relationship("Supplier")
    bill: Mapped[Optional["PurchaseBill"]] = relationship(
        "PurchaseBill", foreign_keys=[converted_to_bill_id]
    )
    lines: Mapped[list["PurchaseOrderLine"]] = relationship(
        "PurchaseOrderLine", back_populates="order", cascade="all, delete-orphan"
    )


class PurchaseOrderLine(Base):
    __tablename__ = "purchase_order_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    order_id: Mapped[int] = mapped_column(ForeignKey("purchase_orders.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    hs_code: Mapped[str | None] = mapped_column(Text, nullable=True)

    order: Mapped["PurchaseOrder"] = relationship(
        "PurchaseOrder", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")


class SalesInvoice(Base):
    __tablename__ = "sales_invoices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    custom_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bill_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    sales_person_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales_persons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    sales_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    output_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    payment_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id"), nullable=True, index=True
    )
    # Cost center dimensions (optional, for service invoices with Multi Branch)
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id"), nullable=True
    )
    invoice_type: Mapped[str] = mapped_column(String(20), nullable=False, default="PRODUCT")
    sales_type: Mapped[str] = mapped_column(String(20), nullable=True, default="LOCAL")
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    # TDS fields (TDS Receivable - customer deducts TDS from payment)
    apply_tds: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tds_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    tds_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    customer: Mapped["Customer"] = relationship("Customer")
    sales_person: Mapped[Optional["SalesPerson"]] = relationship(
        "SalesPerson", foreign_keys=[sales_person_id]
    )
    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher", back_populates="sales_invoice")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    tds_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[tds_ledger_id])
    lines: Mapped[list["SalesInvoiceLine"]] = relationship(
        "SalesInvoiceLine", back_populates="invoice", cascade="all, delete-orphan"
    )
    incentives: Mapped[list["SalesInvoiceIncentive"]] = relationship(
        "SalesInvoiceIncentive", back_populates="invoice", cascade="all, delete-orphan"
    )

    @property
    def sales_person_incentive_amounts(self) -> list["SalesInvoiceIncentive"]:
        return self.incentives

    @property
    def voucher_number(self) -> str | None:
        return self.voucher.voucher_number if self.voucher else None


class SalesInvoiceLine(Base):
    __tablename__ = "sales_invoice_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("sales_invoices.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    hs_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    sales_person_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales_persons.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"), nullable=True)
    ref_no: Mapped[str | None] = mapped_column(String(50), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    invoice: Mapped["SalesInvoice"] = relationship(
        "SalesInvoice", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")
    sales_person: Mapped[Optional["SalesPerson"]] = relationship(
        "SalesPerson", foreign_keys=[sales_person_id]
    )
    warehouse: Mapped[Optional["Warehouse"]] = relationship("Warehouse")

    @property
    def item_name(self) -> str | None:
        return self.item.name if self.item else None


class SalesInvoiceIncentive(Base):
    __tablename__ = "sales_invoice_incentives"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("sales_invoices.id", ondelete="CASCADE"), nullable=False)
    sales_person_id: Mapped[int] = mapped_column(ForeignKey("sales_persons.id"), nullable=False)
    incentive_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    is_manual: Mapped[bool] = mapped_column(Boolean, default=False)
    post_method: Mapped[str] = mapped_column(String(50), nullable=False) # "Auto" or "Manual"
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    invoice: Mapped["SalesInvoice"] = relationship("SalesInvoice", back_populates="incentives")
    sales_person: Mapped["SalesPerson"] = relationship("SalesPerson")


class PurchaseBill(Base):
    __tablename__ = "purchase_bills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    bill_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_mode_id: Mapped[int | None] = mapped_column(
        ForeignKey("payment_modes.id"), nullable=True
    )

    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    purchase_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    input_tax_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    payment_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id"), nullable=True, index=True
    )
    # TDS deduction fields
    apply_tds: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tds_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    tds_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    # Cost center dimensions
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id"), nullable=True
    )
    purchase_type: Mapped[str] = mapped_column(String(20), nullable=True, default="LOCAL")
    narration: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    supplier: Mapped["Supplier"] = relationship("Supplier")
    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher", back_populates="purchase_bill")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    tds_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[tds_ledger_id])
    lines: Mapped[list["PurchaseBillLine"]] = relationship(
        "PurchaseBillLine", back_populates="bill", cascade="all, delete-orphan"
    )

    @property
    def voucher_number(self) -> str | None:
        return self.voucher.voucher_number if self.voucher else None
    payment_mode: Mapped[Optional["PaymentMode"]] = relationship("PaymentMode")


class Document(Base):
    __tablename__ = "documents"
    __table_args__ = (
        Index("ix_documents_company_created", "company_id", "created_at"),
        Index("ix_documents_company_status", "company_id", "status"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(String(20), nullable=False)  # pdf|image
    status: Mapped[DocumentStatus] = mapped_column(
        Enum(DocumentStatus, name="document_status", native_enum=False),
        nullable=False,
        default=DocumentStatus.uploaded,
    )
    extracted_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    # Additional metadata kept optional for backward compatibility.
    document_kind: Mapped[str | None] = mapped_column(String(30), nullable=True)  # PURCHASE|BILL
    original_filename: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    size_bytes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    uploaded_by: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    logs: Mapped[list["DocumentLog"]] = relationship(
        "DocumentLog", back_populates="document", cascade="all, delete-orphan"
    )


class DocumentLog(Base):
    __tablename__ = "document_logs"
    __table_args__ = (
        Index("ix_document_logs_document_created", "document_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    document_id: Mapped[int] = mapped_column(ForeignKey("documents.id", ondelete="CASCADE"), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    document: Mapped["Document"] = relationship("Document", back_populates="logs")


class SalesReturn(Base):
    __tablename__ = "sales_returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_invoice_id: Mapped[int | None] = mapped_column(
        ForeignKey("sales_invoices.id", ondelete="SET NULL"), nullable=True, index=True
    )
    sales_return_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    output_tax_return_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    # Cost center dimensions
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id"), nullable=True, index=True
    )
    payment_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    customer: Mapped["Customer"] = relationship("Customer")
    source_invoice: Mapped[Optional["SalesInvoice"]] = relationship(
        "SalesInvoice", foreign_keys=[source_invoice_id]
    )
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher")
    lines: Mapped[list["SalesReturnLine"]] = relationship(
        "SalesReturnLine", back_populates="sales_return", cascade="all, delete-orphan"
    )


class SalesReturnLine(Base):
    __tablename__ = "sales_return_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    return_id: Mapped[int] = mapped_column(ForeignKey("sales_returns.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"), nullable=True)

    sales_return: Mapped["SalesReturn"] = relationship(
        "SalesReturn", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")
    warehouse: Mapped[Optional["Warehouse"]] = relationship("Warehouse")


class PurchaseReturn(Base):
    __tablename__ = "purchase_returns"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    supplier_id: Mapped[int] = mapped_column(ForeignKey("suppliers.id"), nullable=False)
    date: Mapped[date] = mapped_column(Date, nullable=False)
    reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    source_bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("purchase_bills.id", ondelete="SET NULL"), nullable=True, index=True
    )
    # Cost center dimensions
    department_id: Mapped[int | None] = mapped_column(
        ForeignKey("departments.id"), nullable=True
    )
    project_id: Mapped[int | None] = mapped_column(
        ForeignKey("projects.id"), nullable=True
    )
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("segments.id"), nullable=True
    )
    voucher_id: Mapped[int | None] = mapped_column(
        ForeignKey("vouchers.id"), nullable=True, index=True
    )
    purchase_return_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    input_tax_return_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    payment_ledger_id: Mapped[int | None] = mapped_column(
        ForeignKey("ledgers.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    company: Mapped["Company"] = relationship("Company")
    supplier: Mapped["Supplier"] = relationship("Supplier")
    source_bill: Mapped[Optional["PurchaseBill"]] = relationship(
        "PurchaseBill", foreign_keys=[source_bill_id]
    )
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher")
    purchase_return_ledger: Mapped[Optional["Ledger"]] = relationship(
        "Ledger", foreign_keys=[purchase_return_ledger_id]
    )
    input_tax_return_ledger: Mapped[Optional["Ledger"]] = relationship(
        "Ledger", foreign_keys=[input_tax_return_ledger_id]
    )

    lines: Mapped[list["PurchaseReturnLine"]] = relationship(
        "PurchaseReturnLine", back_populates="purchase_return", cascade="all, delete-orphan"
    )


class PurchaseReturnLine(Base):
    __tablename__ = "purchase_return_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    return_id: Mapped[int] = mapped_column(ForeignKey("purchase_returns.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"), nullable=True)

    purchase_return: Mapped["PurchaseReturn"] = relationship(
        "PurchaseReturn", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")
    warehouse: Mapped[Optional["Warehouse"]] = relationship("Warehouse")
class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False)
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    order_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="CASCADE"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class OutboundMessage(Base):
    __tablename__ = "outbound_messages"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    channel: Mapped[str] = mapped_column(String(20), nullable=False)
    recipient: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="PENDING")
    source_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    source_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    __table_args__ = (
        Index("ix_outbound_messages_status", "status"),
        Index("ix_outbound_messages_source", "company_id", "source_type", "source_id"),
    )


class PurchaseBillLine(Base):
    __tablename__ = "purchase_bill_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    bill_id: Mapped[int] = mapped_column(ForeignKey("purchase_bills.id"), nullable=False)
    item_id: Mapped[int] = mapped_column(ForeignKey("items.id"), nullable=False)
    quantity: Mapped[float] = mapped_column(Numeric(14, 3), nullable=False)
    rate: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False)
    discount: Mapped[float] = mapped_column(Numeric(14, 2), default=0)
    tax_rate: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    hs_code: Mapped[str | None] = mapped_column(Text, nullable=True)
    warehouse_id: Mapped[int | None] = mapped_column(ForeignKey("warehouses.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"), nullable=True)
    duty_tax_id: Mapped[int | None] = mapped_column(ForeignKey("duty_taxes.id", ondelete="SET NULL"), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)

    bill: Mapped["PurchaseBill"] = relationship(
        "PurchaseBill", back_populates="lines"
    )
    item: Mapped["Item"] = relationship("Item")
    warehouse: Mapped[Optional["Warehouse"]] = relationship("Warehouse")
    duty_tax: Mapped[Optional["DutyTax"]] = relationship("DutyTax")

    @property
    def item_name(self) -> str | None:
        return self.item.name if self.item else None


class AppSettings(Base):
    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    default_fiscal_year_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    default_fiscal_year_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    enable_multi_tenant: Mapped[bool] = mapped_column(Boolean, default=True)
    max_companies_per_user: Mapped[int] = mapped_column(Integer, default=3)
    ghost_tenant_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ghost_company_id: Mapped[int | None] = mapped_column(Integer, nullable=True)


class PayrollShift(Base):
    __tablename__ = "payroll_shifts"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    start_time: Mapped[time] = mapped_column(Time, nullable=False)
    end_time: Mapped[time] = mapped_column(Time, nullable=False)
    expected_work_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    grace_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    allow_night_shift: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class EmployeeType(Base):
    __tablename__ = "employee_types"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class PayrollDesignation(Base):
    __tablename__ = "payroll_designations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    base_monthly_salary: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    grade_rate: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped["Company"] = relationship("Company")
    template_lines: Mapped[list["DesignationTemplateLine"]] = relationship(
        "DesignationTemplateLine",
        back_populates="designation",
        cascade="all, delete-orphan",
        order_by="DesignationTemplateLine.sort_order, DesignationTemplateLine.id",
    )


class DesignationTemplateLine(Base):
    """Pay-head template line shared by all employees of a designation."""

    __tablename__ = "designation_template_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    designation_id: Mapped[int] = mapped_column(
        ForeignKey("payroll_designations.id", ondelete="CASCADE"), nullable=False
    )
    payhead_id: Mapped[int] = mapped_column(
        ForeignKey("payroll_payheads.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    designation: Mapped["PayrollDesignation"] = relationship(
        "PayrollDesignation", back_populates="template_lines"
    )
    payhead: Mapped["PayrollPayhead"] = relationship("PayrollPayhead")

    __table_args__ = (
        UniqueConstraint("designation_id", "payhead_id", name="uq_designation_template_lines_desig_payhead"),
        Index("ix_designation_template_lines_designation", "company_id", "designation_id"),
    )


class Employee(Base):
    __tablename__ = "employees"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    code: Mapped[str | None] = mapped_column(Text, nullable=True)
    full_name: Mapped[str] = mapped_column(Text, nullable=False)
    email: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(Text, nullable=True)
    designation_id: Mapped[int | None] = mapped_column(ForeignKey("payroll_designations.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)

    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    segment_id: Mapped[int | None] = mapped_column(ForeignKey("segments.id"), nullable=True)
    employee_type_id: Mapped[int | None] = mapped_column(ForeignKey("employee_types.id"), nullable=True)
    join_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    grade: Mapped[str | None] = mapped_column(Text, nullable=True)
    grade_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    marital_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    dob: Mapped[date | None] = mapped_column(Date, nullable=True)
    pan: Mapped[str | None] = mapped_column(String(50), nullable=True)

    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payroll_mode: Mapped[PayrollMode] = mapped_column(Enum(PayrollMode, name="payroll_mode"), nullable=False, default=PayrollMode.MONTHLY)
    salary_mode: Mapped[SalaryMode] = mapped_column(Enum(SalaryMode, name="salary_mode"), nullable=False, default=SalaryMode.PRO_RATA)
    base_monthly_salary: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    base_daily_wage: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    base_hourly_rate: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    apply_tds: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    tds_percent: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False, default=1.0)
    payable_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped["Company"] = relationship("Company")
    user: Mapped[Optional["User"]] = relationship("User")
    payable_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger")
    designation: Mapped[Optional["PayrollDesignation"]] = relationship("PayrollDesignation")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")
    segment: Mapped[Optional["Segment"]] = relationship("Segment")
    employee_type: Mapped[Optional["EmployeeType"]] = relationship("EmployeeType")
    extra_payheads: Mapped[list["EmployeeExtraPayhead"]] = relationship(
        "EmployeeExtraPayhead",
        back_populates="employee",
        cascade="all, delete-orphan",
        order_by="EmployeeExtraPayhead.sort_order",
    )

    __table_args__ = (
        Index("ix_employees_company_active", "company_id", "is_active"),
    )


class EmployeeShiftAssignment(Base):
    __tablename__ = "employee_shift_assignments"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    shift_id: Mapped[int] = mapped_column(ForeignKey("payroll_shifts.id", ondelete="CASCADE"), nullable=False)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    employee: Mapped["Employee"] = relationship("Employee")
    shift: Mapped["PayrollShift"] = relationship("PayrollShift")

    __table_args__ = (
        Index("ix_employee_shift_assignments_lookup", "company_id", "employee_id", "effective_from"),
    )


class PayrollPayhead(Base):
    __tablename__ = "payroll_payheads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[PayrollPayheadType] = mapped_column(Enum(PayrollPayheadType, name="payroll_payhead_type"), nullable=False)
    taxable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    default_rate: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    calculation_basis: Mapped[str | None] = mapped_column(Text, nullable=True)
    cost_center_option: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    expense_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    payable_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    expense_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[expense_ledger_id])
    payable_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[payable_ledger_id])

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_payroll_payheads_company_code"),
        Index("ix_payroll_payheads_company_type", "company_id", "type"),
    )


class EmployeePayStructure(Base):
    __tablename__ = "employee_pay_structures"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    employee: Mapped["Employee"] = relationship("Employee")
    lines: Mapped[list["EmployeePayStructureLine"]] = relationship(
        "EmployeePayStructureLine",
        back_populates="structure",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("ix_employee_pay_structures_company_emp", "company_id", "employee_id", "effective_from"),
    )


class EmployeePayStructureLine(Base):
    __tablename__ = "employee_pay_structure_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    structure_id: Mapped[int] = mapped_column(ForeignKey("employee_pay_structures.id", ondelete="CASCADE"), nullable=False)
    payhead_id: Mapped[int] = mapped_column(ForeignKey("payroll_payheads.id"), nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    structure: Mapped["EmployeePayStructure"] = relationship("EmployeePayStructure", back_populates="lines")
    payhead: Mapped["PayrollPayhead"] = relationship("PayrollPayhead")

    __table_args__ = (
        UniqueConstraint("structure_id", "payhead_id", name="uq_employee_pay_structure_lines_unique"),
    )


class EmployeeExtraPayhead(Base):
    """Employee-specific pay heads added on top of the designation template."""

    __tablename__ = "employee_extra_payheads"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True
    )
    payhead_id: Mapped[int] = mapped_column(
        ForeignKey("payroll_payheads.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    rate: Mapped[float | None] = mapped_column(Numeric(14, 4), nullable=True)
    formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    employee: Mapped["Employee"] = relationship("Employee", back_populates="extra_payheads")
    payhead: Mapped["PayrollPayhead"] = relationship("PayrollPayhead")

    __table_args__ = (
        UniqueConstraint("employee_id", "payhead_id", name="uq_employee_extra_payheads_emp_payhead"),
        Index("ix_employee_extra_payheads_company_emp", "company_id", "employee_id"),
    )


class BiometricDevice(Base):
    __tablename__ = "biometric_devices"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    vendor: Mapped[str | None] = mapped_column(Text, nullable=True)
    protocol: Mapped[str] = mapped_column(Text, nullable=False, default="HTTP")
    ip: Mapped[str | None] = mapped_column(Text, nullable=True)
    port: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timezone: Mapped[str] = mapped_column(Text, nullable=False, default="Asia/Kathmandu")
    location: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)


class BiometricDeviceUser(Base):
    __tablename__ = "biometric_device_users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    device_id: Mapped[int] = mapped_column(ForeignKey("biometric_devices.id", ondelete="CASCADE"), nullable=False)
    device_user_code: Mapped[str] = mapped_column(Text, nullable=False)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    device: Mapped["BiometricDevice"] = relationship("BiometricDevice")
    employee: Mapped[Optional["Employee"]] = relationship("Employee")

    __table_args__ = (
        UniqueConstraint("device_id", "device_user_code", name="uq_device_users_device_code"),
        Index("ix_device_users_company_employee", "company_id", "employee_id"),
    )


class AttendanceRawLog(Base):
    __tablename__ = "attendance_raw_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    device_id: Mapped[int | None] = mapped_column(ForeignKey("biometric_devices.id", ondelete="SET NULL"), nullable=True)
    device_user_code: Mapped[str] = mapped_column(Text, nullable=False)
    employee_id: Mapped[int | None] = mapped_column(ForeignKey("employees.id", ondelete="SET NULL"), nullable=True, index=True)
    event_ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    event_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(Text, nullable=False, default="PUSH")
    payload_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    device: Mapped[Optional["BiometricDevice"]] = relationship("BiometricDevice")
    employee: Mapped[Optional["Employee"]] = relationship("Employee")

    __table_args__ = (
        UniqueConstraint("company_id", "device_id", "device_user_code", "event_ts", name="uq_attendance_raw_logs_dedup"),
        Index("ix_attendance_raw_logs_company_employee_ts", "company_id", "employee_id", "event_ts"),
        Index("ix_attendance_raw_logs_company_ts", "company_id", "event_ts"),
    )


class AttendanceDaily(Base):
    __tablename__ = "attendance_daily"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False)
    shift_id: Mapped[int | None] = mapped_column(ForeignKey("payroll_shifts.id", ondelete="SET NULL"), nullable=True)
    first_in: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_out: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    worked_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overtime_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[AttendanceStatus] = mapped_column(Enum(AttendanceStatus, name="attendance_status"), nullable=False, default=AttendanceStatus.PRESENT)
    is_manual: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    manual_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    employee: Mapped["Employee"] = relationship("Employee")
    shift: Mapped[Optional["PayrollShift"]] = relationship("PayrollShift")

    __table_args__ = (
        UniqueConstraint("company_id", "employee_id", "work_date", name="uq_attendance_daily_unique"),
        Index("ix_attendance_daily_company_date", "company_id", "work_date"),
    )


class LeaveType(Base):
    __tablename__ = "leave_types"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(Text, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    paid: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    annual_quota: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    carry_forward: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    __table_args__ = (
        UniqueConstraint("company_id", "code", name="uq_leave_types_company_code"),
    )


class LeaveRequest(Base):
    __tablename__ = "leave_requests"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False)
    leave_type_id: Mapped[int] = mapped_column(ForeignKey("leave_types.id"), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    days: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False)
    status: Mapped[LeaveRequestStatus] = mapped_column(Enum(LeaveRequestStatus, name="leave_request_status"), nullable=False, default=LeaveRequestStatus.PENDING)
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    employee: Mapped["Employee"] = relationship("Employee")
    leave_type: Mapped["LeaveType"] = relationship("LeaveType")

    __table_args__ = (
        Index("ix_leave_requests_company_date", "company_id", "start_date", "end_date"),
    )


class Holiday(Base):
    __tablename__ = "holidays"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    holiday_date: Mapped[date] = mapped_column(Date, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        UniqueConstraint("company_id", "holiday_date", name="uq_holidays_company_date"),
    )


class PayrollSettings(Base):
    __tablename__ = "payroll_settings"

    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), primary_key=True)
    default_salary_expense_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    tds_payable_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    ssf_payable_ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    late_grace_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    late_penalty_mode: Mapped[LatePenaltyMode] = mapped_column(Enum(LatePenaltyMode, name="late_penalty_mode"), nullable=False, default=LatePenaltyMode.PER_MINUTE)
    late_penalty_rate: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    overtime_mode: Mapped[OvertimeMode] = mapped_column(Enum(OvertimeMode, name="overtime_mode"), nullable=False, default=OvertimeMode.PER_MINUTE)
    overtime_multiplier: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=1.0)
    weekoff_days: Mapped[str] = mapped_column(Text, nullable=False, default="SAT")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    default_salary_expense_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[default_salary_expense_ledger_id])
    tds_payable_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[tds_payable_ledger_id])
    ssf_payable_ledger: Mapped[Optional["Ledger"]] = relationship("Ledger", foreign_keys=[ssf_payable_ledger_id])


class PayrollRun(Base):
    __tablename__ = "payroll_runs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    period_year: Mapped[int] = mapped_column(Integer, nullable=False)
    period_month: Mapped[int] = mapped_column(Integer, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[PayrollRunStatus] = mapped_column(Enum(PayrollRunStatus, name="payroll_run_status"), nullable=False, default=PayrollRunStatus.DRAFT)
    locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    computed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    posted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    voucher_id: Mapped[int | None] = mapped_column(ForeignKey("vouchers.id"), nullable=True)
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    voucher: Mapped[Optional["Voucher"]] = relationship("Voucher")
    payslips: Mapped[list["PayrollPayslip"]] = relationship(
        "PayrollPayslip",
        back_populates="run",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "period_year", "period_month", name="uq_payroll_runs_company_period"),
        Index("ix_payroll_runs_company_status", "company_id", "status"),
    )


class PayrollPayslip(Base):
    __tablename__ = "payroll_payslips"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id", ondelete="CASCADE"), nullable=False, index=True)
    payable_days: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    absent_days: Mapped[float] = mapped_column(Numeric(10, 2), nullable=False, default=0)
    late_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    overtime_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    earnings_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    deductions_total: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tds_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    net_pay: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_manual_override: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    override_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    run: Mapped["PayrollRun"] = relationship("PayrollRun", back_populates="payslips")
    employee: Mapped["Employee"] = relationship("Employee")
    lines: Mapped[list["PayrollPayslipLine"]] = relationship(
        "PayrollPayslipLine",
        back_populates="payslip",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("company_id", "payroll_run_id", "employee_id", name="uq_payroll_payslips_unique"),
        Index("ix_payroll_payslips_company_employee", "company_id", "employee_id"),
    )


class PayrollPayslipLine(Base):
    __tablename__ = "payroll_payslip_lines"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    payslip_id: Mapped[int] = mapped_column(ForeignKey("payroll_payslips.id", ondelete="CASCADE"), nullable=False)
    payhead_id: Mapped[int] = mapped_column(ForeignKey("payroll_payheads.id"), nullable=False)
    type: Mapped[PayrollPayheadType] = mapped_column(Enum(PayrollPayheadType, name="payslip_line_type"), nullable=False)
    amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    payslip: Mapped["PayrollPayslip"] = relationship("PayrollPayslip", back_populates="lines")
    payhead: Mapped["PayrollPayhead"] = relationship("PayrollPayhead")

    __table_args__ = (
        UniqueConstraint("payslip_id", "payhead_id", name="uq_payroll_payslip_lines_unique"),
    )


class PayrollOverrideLog(Base):
    __tablename__ = "payroll_override_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True)
    payroll_run_id: Mapped[int] = mapped_column(ForeignKey("payroll_runs.id", ondelete="CASCADE"), nullable=False)
    payslip_id: Mapped[int] = mapped_column(ForeignKey("payroll_payslips.id", ondelete="CASCADE"), nullable=False)
    actor_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    diff_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    __table_args__ = (
        Index("ix_payroll_override_logs_company_run", "company_id", "payroll_run_id"),
    )



class CommissionBasis(str, enum.Enum):
    TURNOVER = "TURNOVER"

class CommissionRule(Base):
    __tablename__ = "commission_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    employee_type_id: Mapped[int | None] = mapped_column(ForeignKey("employee_types.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    
    is_global_default: Mapped[bool] = mapped_column(Boolean, default=False)
    basis: Mapped[CommissionBasis] = mapped_column(Enum(CommissionBasis, name="commission_basis"), default=CommissionBasis.TURNOVER)
    rate_percent: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    company: Mapped["Company"] = relationship("Company")
    employee_type: Mapped[Optional["EmployeeType"]] = relationship("EmployeeType")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")

class PackageStatus(str, enum.Enum):
    PENDING = "PENDING"
    DISPATCHED = "DISPATCHED"
    DELIVERED = "DELIVERED"
    RETURNED = "RETURNED"

class DeliveryPlace(Base):
    __tablename__ = "delivery_places"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    default_shipping_charge: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

class DeliveryPartner(Base):
    __tablename__ = "delivery_partners"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    vehicle_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    ledger_id: Mapped[int] = mapped_column(ForeignKey("ledgers.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    ledger: Mapped["Ledger"] = relationship("Ledger")

class Package(Base):
    __tablename__ = "packages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    invoice_id: Mapped[int] = mapped_column(ForeignKey("sales_invoices.id", ondelete="CASCADE"), nullable=False, index=True)
    delivery_partner_id: Mapped[int] = mapped_column(ForeignKey("delivery_partners.id"), nullable=False)
    delivery_place_id: Mapped[int] = mapped_column(ForeignKey("delivery_places.id"), nullable=False)
    tracking_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[PackageStatus] = mapped_column(Enum(PackageStatus, name="package_status"), nullable=False, default=PackageStatus.PENDING)
    cod_amount: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    shipping_charge: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


    invoice: Mapped["SalesInvoice"] = relationship("SalesInvoice")
    delivery_partner: Mapped["DeliveryPartner"] = relationship("DeliveryPartner")
    delivery_place: Mapped["DeliveryPlace"] = relationship("DeliveryPlace")


# ── Setup: Sales Incentive Rules ──────────────────────────────────────────────

class IncentiveRuleBasis(str, enum.Enum):
    AMOUNT = "amount"
    QTY = "qty"
    TARGET_AMOUNT = "target_amount"
    TARGET_QTY = "target_qty"


class IncentiveRuleType(str, enum.Enum):
    FIXED = "fixed"
    PERCENTAGE = "percentage"


class IncentiveRule(Base):
    __tablename__ = "incentive_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    basis_type: Mapped[str] = mapped_column(String(50), nullable=False, default="amount")
    threshold_min: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    threshold_max: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    incentive_type: Mapped[str] = mapped_column(String(20), nullable=False, default="percentage")
    incentive_value: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    sales_person_id: Mapped[int | None] = mapped_column(Integer, nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    item_id: Mapped[int | None] = mapped_column(ForeignKey("items.id"), nullable=True)
    ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


# ── Setup: Depreciation Rules ─────────────────────────────────────────────────

class DepreciationMethod(str, enum.Enum):
    STRAIGHT_LINE = "straight_line"
    REDUCING_BALANCE = "reducing_balance"


class DepreciationRule(Base):
    __tablename__ = "depreciation_rules"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    category: Mapped[str | None] = mapped_column(String(255), nullable=True)
    method: Mapped[str] = mapped_column(String(30), nullable=False, default="straight_line")
    rate_type: Mapped[str] = mapped_column(String(20), nullable=False, default="percentage")
    rate_value: Mapped[float] = mapped_column(Numeric(14, 4), nullable=False, default=0)
    useful_life_years: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)


class SalesTarget(Base):
    __tablename__ = "sales_targets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    fiscal_year: Mapped[str] = mapped_column(String(20), nullable=False)
    ledger_id: Mapped[int | None] = mapped_column(ForeignKey("ledgers.id"), nullable=True)
    department_id: Mapped[int | None] = mapped_column(ForeignKey("departments.id"), nullable=True)
    project_id: Mapped[int | None] = mapped_column(ForeignKey("projects.id"), nullable=True)

    # Monthly targets - indices 1 to 12
    # In NP (BS) context: 1=Baisakh, 2=Jestha, etc.
    # In AD context: 1=Jan, 2=Feb, etc.
    month_1: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_2: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_3: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_4: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_5: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_6: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_7: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_8: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_9: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_10: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_11: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    month_12: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    total_target: Mapped[float] = mapped_column(Numeric(14, 2), nullable=False, default=0)

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow)

    ledger: Mapped[Optional["Ledger"]] = relationship("Ledger")
    department: Mapped[Optional["Department"]] = relationship("Department")
    project: Mapped[Optional["Project"]] = relationship("Project")


class RewardType(str, enum.Enum):
    POINTS = "POINTS"
    MONEY = "MONEY"
    BADGE = "BADGE"


class Reward(Base):
    __tablename__ = "rewards"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(BigInteger, ForeignKey("employees.id"), nullable=False, index=True)
    reward_type: Mapped[RewardType] = mapped_column(Enum(RewardType, name="reward_type"), nullable=False)
    amount: Mapped[float | None] = mapped_column(Numeric(14, 2), nullable=True)
    points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    given_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    company: Mapped["Company"] = relationship("Company")
    employee: Mapped["Employee"] = relationship("Employee")


class ResourceGroup(Base):
    __tablename__ = "resource_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    resources: Mapped[list["Resource"]] = relationship("Resource", back_populates="group", cascade="all, delete-orphan")


class Resource(Base):
    __tablename__ = "resources"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(ForeignKey("resource_groups.id"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    link_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    group: Mapped["ResourceGroup"] = relationship("ResourceGroup", back_populates="resources")


class InteractionType(str, enum.Enum):
    CALL = "CALL"
    EMAIL = "EMAIL"
    MEETING = "MEETING"
    WHATSAPP = "WHATSAPP"
    OTHER = "OTHER"


class CustomerInteraction(Base):
    __tablename__ = "customer_interactions"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    company_id: Mapped[int] = mapped_column(ForeignKey("companies.id"), nullable=False, index=True)
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), nullable=False, index=True)
    employee_id: Mapped[int] = mapped_column(ForeignKey("employees.id"), nullable=False, index=True)
    interaction_type: Mapped[InteractionType] = mapped_column(Enum(InteractionType, name="interaction_type"), nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)
    task_id: Mapped[int | None] = mapped_column(
        ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, index=True
    )
    interaction_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)

    customer: Mapped["Customer"] = relationship("Customer")
    employee: Mapped["Employee"] = relationship("Employee")


class SalesPerson(Base):
    __tablename__ = "sales_persons"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tenant_id: Mapped[int | None] = mapped_column(
        ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    commission_rate: Mapped[float | None] = mapped_column(nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        UniqueConstraint("company_id", "name", name="uq_sales_persons_company_name"),
    )


class SystemAnnouncement(Base):
    __tablename__ = "system_announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    message_type: Mapped[str] = mapped_column(String(50), default="text")
    content: Mapped[str] = mapped_column(Text, nullable=False)
    start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    target_tenant_ids: Mapped[list[int] | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow)
