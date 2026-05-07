import logging
from typing import List

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from . import models

logger = logging.getLogger(__name__)

DEFAULT_MENUS = [
    {"code": "DASHBOARD", "label": "Dashboard", "module": "General", "parent_code": None, "sort_order": 10},
    {"code": "COMPANIES", "label": "Companies", "module": "Setup", "parent_code": None, "sort_order": 20},
    {"code": "USERS", "label": "Users", "module": "Setup", "parent_code": None, "sort_order": 30},
    
    # Sales
    {"code": "SALES", "label": "Sales", "module": "Sales", "parent_code": None, "sort_order": 40},
    {"code": "sales.invoice.list", "label": "Sales Invoices", "module": "Sales", "parent_code": "SALES", "sort_order": 41},
    {"code": "sales.return.list", "label": "Sales Returns", "module": "Sales", "parent_code": "SALES", "sort_order": 42},
    {"code": "sales.order.list", "label": "Sales Orders", "module": "Sales", "parent_code": "SALES", "sort_order": 43},
    {"code": "sales.customers", "label": "Customers Master", "module": "Sales", "parent_code": "SALES", "sort_order": 44},
    
    # POS
    {"code": "POS", "label": "POS", "module": "POS", "parent_code": None, "sort_order": 45},
    {"code": "pos.billing", "label": "POS Billing", "module": "POS", "parent_code": "POS", "sort_order": 46},
    {"code": "sales.restaurant_pos", "label": "Restaurant POS", "module": "POS", "parent_code": "POS", "sort_order": 47},
    {"code": "pos.tables", "label": "Table Management", "module": "POS", "parent_code": "POS", "sort_order": 48},
    
    # Purchases
    {"code": "PURCHASES", "label": "Purchases", "module": "Purchases", "parent_code": None, "sort_order": 50},
    {"code": "purchases.bill.list", "label": "Purchase Invoices", "module": "Purchases", "parent_code": "PURCHASES", "sort_order": 51},
    {"code": "purchases.return.list", "label": "Purchase Returns", "module": "Purchases", "parent_code": "PURCHASES", "sort_order": 52},
    {"code": "purchases.order.list", "label": "Purchase Orders", "module": "Purchases", "parent_code": "PURCHASES", "sort_order": 53},
    {"code": "purchases.suppliers", "label": "Suppliers Master", "module": "Purchases", "parent_code": "PURCHASES", "sort_order": 54},

    # Document
    {"code": "DOCUMENT", "label": "Document", "module": "Document", "parent_code": None, "sort_order": 55},
    {"code": "document.upload", "label": "Upload Document", "module": "Document", "parent_code": "DOCUMENT", "sort_order": 56},
    {"code": "document.list", "label": "Document List", "module": "Document", "parent_code": "DOCUMENT", "sort_order": 57},
    
    # Inventory
    {"code": "INVENTORY", "label": "Inventory", "module": "Inventory", "parent_code": None, "sort_order": 60},
    {"code": "inventory.items", "label": "Items", "module": "Inventory", "parent_code": "INVENTORY", "sort_order": 61},
    {"code": "inventory.categories", "label": "Categories", "module": "Inventory", "parent_code": "INVENTORY", "sort_order": 62},
    {"code": "inventory.subcategories", "label": "Subcategories", "module": "Inventory", "parent_code": "INVENTORY", "sort_order": 63},
    {"code": "inventory.brands", "label": "Brands", "module": "Inventory", "parent_code": "INVENTORY", "sort_order": 64},
    {"code": "inventory.warehouses", "label": "Warehouses", "module": "Inventory", "parent_code": "INVENTORY", "sort_order": 65},
    {"code": "inventory.stock_transfers", "label": "Stock Transfers", "module": "Inventory", "parent_code": "INVENTORY", "sort_order": 66},
    
    # Manufacturing ERP
    {"code": "MANUFACTURING_ERP", "label": "Manufacturing ERP", "module": "Manufacturing", "parent_code": None, "sort_order": 230},
    {"code": "manufacturing.dashboard", "label": "Dashboard", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 231},
    {"code": "manufacturing.bom_master", "label": "BOM Master", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 232},
    {"code": "manufacturing.production_order", "label": "Production Order", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 233},
    {"code": "manufacturing.material_issue", "label": "Material Issue", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 234},
    {"code": "manufacturing.wip", "label": "Work In Progress", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 235},
    {"code": "manufacturing.production_entry", "label": "Production Entry", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 236},
    {"code": "manufacturing.finished_goods_receive", "label": "Finished Goods Receive", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 237},
    {"code": "manufacturing.wastage_scrap", "label": "Wastage / Scrap", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 238},
    {"code": "manufacturing.production_costing", "label": "Production Costing", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 239},
    {"code": "manufacturing.reports", "label": "Reports", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 240},
    {"code": "manufacturing.settings", "label": "Settings", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 241},
    {"code": "manufacturing.ai_documents", "label": "AI Documents", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 242},
    {"code": "manufacturing.fg_journal_entry", "label": "FG Journal Entry", "module": "Manufacturing", "parent_code": "MANUFACTURING_ERP", "sort_order": 243},
    
    # Tasks
    {"code": "TASKS", "label": "Tasks", "module": "Tasks", "parent_code": None, "sort_order": 70},
    {"code": "tasks.list", "label": "Task Board", "module": "Tasks", "parent_code": "TASKS", "sort_order": 71},
    {"code": "tasks.heads", "label": "Task Heads", "module": "Tasks", "parent_code": "TASKS", "sort_order": 72},
    {"code": "tasks.performance_report", "label": "Performance Report", "module": "Tasks", "parent_code": "TASKS", "sort_order": 73},
    
    # Payroll
    {"code": "PAYROLL", "label": "Payroll", "module": "Payroll", "parent_code": None, "sort_order": 80},
    {"code": "payroll.dashboard", "label": "Payroll Dashboard", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 81},
    {"code": "payroll.employees", "label": "Employees", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 82},
    {"code": "payroll.payheads", "label": "Payheads", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 83},
    {"code": "payroll.shifts", "label": "Shifts", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 84},
    {"code": "payroll.shift_assignments", "label": "Assignments", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 85},
    {"code": "payroll.devices", "label": "Biometric Devices", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 86},
    {"code": "payroll.attendance", "label": "Attendance", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 87},
    {"code": "payroll.leave", "label": "Leave Management", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 88},
    {"code": "payroll.runs", "label": "Payroll Runs", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 89},
    {"code": "payroll.device_users", "label": "Device Users", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 90},
    {"code": "payroll.pay_structures", "label": "Pay Structures", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 91},
    {"code": "payroll.cost_centers", "label": "Cost Centers", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 92},
    {"code": "payroll.commission_rules", "label": "Commission Rules", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 93},
    {"code": "payroll.commission_report", "label": "Commission Report", "module": "Payroll", "parent_code": "PAYROLL", "sort_order": 94},
    {"code": "accounting.voucher.payment", "label": "Payment Voucher", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 110},
    {"code": "accounting.voucher.receipt", "label": "Receipt Voucher", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 111},
    {"code": "accounting.voucher.journal", "label": "Journal Voucher", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 112},
    {"code": "accounting.voucher.contra", "label": "Contra Voucher", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 113},
    
    # Accounting
    {"code": "accounting.masters", "label": "Master", "module": "Accounting", "parent_code": None, "sort_order": 100},
    {"code": "accounting.masters.ledgers", "label": "Ledgers", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 101},
    {"code": "accounting.masters.sales_target", "label": "Sales Target Setup", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 105},
    {"code": "accounting.masters.payment-modes", "label": "Payment Modes", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 106},
    {"code": "accounting.masters.sales-persons", "label": "Sales Person", "module": "Accounting", "parent_code": "accounting.masters", "sort_order": 107},
    
    # Reports
    {"code": "INVENTORY_STOCK_SUMMARY", "label": "Stock Summary", "module": "Reports", "parent_code": None, "sort_order": 200},
    {"code": "REPORTS", "label": "Reports", "module": "Reports", "parent_code": None, "sort_order": 210},
    {"code": "REPORTS_SALES", "label": "Sales Reports", "module": "Reports", "parent_code": "REPORTS", "sort_order": 211},
    {"code": "REPORTS_PURCHASES", "label": "Purchase Reports", "module": "Reports", "parent_code": "REPORTS", "sort_order": 212},
    {"code": "reports.quick_analysis", "label": "Quick Analysis report", "module": "Reports", "parent_code": "REPORTS", "sort_order": 205},
    {"code": "reports.stock", "label": "Stock Status & Alerts", "module": "Reports", "parent_code": "REPORTS", "sort_order": 206},
    {"code": "reports.ledger", "label": "Ledger Report", "module": "Reports", "parent_code": "REPORTS", "sort_order": 213},
    {"code": "reports.income_expense_summary", "label": "Income/Expense Summary", "module": "Reports", "parent_code": "REPORTS", "sort_order": 218},
    {"code": "reports.monthly_income_expense", "label": "Monthly Income & Expense", "module": "Reports", "parent_code": "REPORTS", "sort_order": 219},
    {"code": "reports.online_orders", "label": "Online Orders", "module": "Reports", "parent_code": "REPORTS", "sort_order": 220},
    {"code": "reports.mis_cash_flow", "label": "Cash Flow Report", "module": "Reports", "parent_code": "REPORTS", "sort_order": 221},
    {"code": "reports.mis_fund_management", "label": "Fund Management", "module": "Reports", "parent_code": "REPORTS", "sort_order": 222},
    {"code": "reports.revenue_analytics", "label": "Revenue Analytics", "module": "Dashboard Analytics", "parent_code": "REPORTS", "sort_order": 5},
    {"code": "reports.performance_insights", "label": "Performance Insights", "module": "Dashboard Analytics", "parent_code": "REPORTS", "sort_order": 6},
    {"code": "reports.mis_target_vs_actual", "label": "Target Vs Actual", "module": "Reports", "parent_code": "REPORTS", "sort_order": 223},
    {"code": "reports.trial_balance", "label": "Trial Balance", "module": "Reports", "parent_code": "REPORTS", "sort_order": 214},
    {"code": "reports.daybook", "label": "Daybook", "module": "Reports", "parent_code": "REPORTS", "sort_order": 215},
    {"code": "reports.balance_sheet", "label": "Balance Sheet", "module": "Reports", "parent_code": "REPORTS", "sort_order": 216},
    {"code": "reports.pnl", "label": "Profit & Loss", "module": "Reports", "parent_code": "REPORTS", "sort_order": 217},
    {"code": "reports.customers", "label": "Customer Reports", "module": "Reports", "parent_code": "REPORTS_SALES", "sort_order": 2111},
    {"code": "reports.suppliers", "label": "Supplier Reports", "module": "Reports", "parent_code": "REPORTS_PURCHASES", "sort_order": 2121},
    {"code": "reports.sales_summary", "label": "Sales Summary", "module": "Reports", "parent_code": "REPORTS_SALES", "sort_order": 2112},
    {"code": "reports.purchase_summary", "label": "Purchase Summary", "module": "Reports", "parent_code": "REPORTS_PURCHASES", "sort_order": 2122},
    {"code": "reports.receivable_payable", "label": "Receivable/Payable", "module": "Reports", "parent_code": "REPORTS", "sort_order": 224},
    {"code": "reports.profit_loss_comparison", "label": "P&L Comparison", "module": "Reports", "parent_code": "REPORTS", "sort_order": 225},
    {"code": "reports.sales_purchase_summary", "label": "Sales vs Purchase Summary", "module": "Reports", "parent_code": "REPORTS", "sort_order": 226},
    {"code": "reports.customer_ledger", "label": "Customer Ledger", "module": "Reports", "parent_code": "REPORTS_SALES", "sort_order": 2113},
    {"code": "reports.supplier_ledger", "label": "Supplier Ledger", "module": "Reports", "parent_code": "REPORTS_PURCHASES", "sort_order": 2123},
    {"code": "reports.stock_movements", "label": "Stock Movement Log", "module": "Reports", "parent_code": "REPORTS", "sort_order": 227},
    {"code": "reports.stock_summary", "label": "Detailed Stock Summary", "module": "Reports", "parent_code": "REPORTS", "sort_order": 228},
    {"code": "reports.inventory_history", "label": "Item History", "module": "Reports", "parent_code": "REPORTS", "sort_order": 231},
    {"code": "reports.item_wise_profit", "label": "Item Wise Profit", "module": "Reports", "parent_code": "REPORTS_SALES", "sort_order": 2114},
    {"code": "reports.sales_mix", "label": "Sales Mix Report", "module": "Reports", "parent_code": "REPORTS_SALES", "sort_order": 2115},
    {"code": "reports.expenses_mix", "label": "Expenses Mix Report", "module": "Reports", "parent_code": "REPORTS", "sort_order": 229},
    {"code": "reports.fixed_assets", "label": "Depreciation Report", "module": "Reports", "parent_code": "REPORTS", "sort_order": 230},
    {"code": "reports.bom_transactions", "label": "BOM transactions", "module": "Reports", "parent_code": "REPORTS", "sort_order": 232},
    {"code": "reports.employee_cost", "label": "Employee Cost Report", "module": "Reports", "parent_code": "REPORTS", "sort_order": 233},
    
    # Settings
    {"code": "settings", "label": "Settings", "module": "Settings", "parent_code": None, "sort_order": 900},
    {"code": "settings.company", "label": "Company Profile", "module": "Settings", "parent_code": "settings", "sort_order": 901},
    {"code": "settings.calendar", "label": "Calendar Settings", "module": "Settings", "parent_code": "settings", "sort_order": 902},
    {"code": "settings.duty_taxes", "label": "Duties & Taxes", "module": "Settings", "parent_code": "settings", "sort_order": 903},
    {"code": "settings.language", "label": "Language", "module": "Settings", "parent_code": "settings", "sort_order": 904},
    {"code": "settings.users", "label": "Users & Roles", "module": "Settings", "parent_code": "settings", "sort_order": 905},
    {"code": "settings.plans", "label": "Plans", "module": "Settings", "parent_code": "settings", "sort_order": 906},
    {"code": "settings.menu_permissions", "label": "Menu Permissions", "module": "Settings", "parent_code": "settings", "sort_order": 907},
    {"code": "settings.currency", "label": "Currency Settings", "module": "Settings", "parent_code": "settings", "sort_order": 908},
    {"code": "settings.notifications", "label": "Notification Settings", "module": "Settings", "parent_code": "settings", "sort_order": 909},
    {"code": "settings.inventory_valuation", "label": "Inventory Valuation", "module": "Settings", "parent_code": "settings", "sort_order": 910},
    {"code": "settings.cost-centers", "label": "Cost Centers", "module": "Settings", "parent_code": "settings", "sort_order": 911},
    {"code": "settings.projects", "label": "Projects", "module": "Settings", "parent_code": "settings", "sort_order": 912},
    
    # Delivery
    {"code": "DELIVERY", "label": "Delivery", "module": "Delivery", "parent_code": None, "sort_order": 75},
    {"code": "delivery.places_partners", "label": "Places & Partners", "module": "Delivery", "parent_code": "DELIVERY", "sort_order": 76},
    {"code": "delivery.packages", "label": "Packages & Dispatches", "module": "Delivery", "parent_code": "DELIVERY", "sort_order": 77},
    
    # Performance
    {"code": "PERFORMANCE", "label": "Performance", "module": "Performance", "parent_code": None, "sort_order": 85},
    {"code": "dashboard.total_sales", "label": "Total Sales Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 1},
    {"code": "dashboard.total_purchase", "label": "Total Purchase Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 2},
    {"code": "dashboard.sales_vs_margin", "label": "Sales vs Gross Margin", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 3},
    {"code": "dashboard.expenses", "label": "Expenses Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 4},
    {"code": "dashboard.net_income", "label": "Net-Income Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 5},
    {"code": "dashboard.receivables", "label": "Receivables Summary Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 6},
    {"code": "dashboard.payables", "label": "Payables Summary Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 7},
    {"code": "dashboard.balances", "label": "Balances (Cash/Bank) Widget", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 8},
    {"code": "dashboard.income_vs_expenses", "label": "Income vs Expenses Waterfall Chart", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 9},
    {"code": "dashboard.recent_activity", "label": "Recent Activity Table", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 10},
    {"code": "dashboard.top_parties", "label": "Top Customers/Suppliers Table", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 11},
    {"code": "dashboard.date_filters", "label": "Date Quick Filters & Pickers", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 12},
    {"code": "dashboard.master_panel", "label": "Master Panel Trigger 📂", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 13},
    {"code": "dashboard.export_actions", "label": "Export CSV Buttons", "module": "Dashboard Analytics", "parent_code": "DASHBOARD", "sort_order": 14},

    # System Shell / Navigation (Grouped under Settings or a new Shell group)
    {"code": "header.notifications", "label": "General Notifications 🔔", "module": "System Shell", "parent_code": None, "sort_order": 201},
    {"code": "header.pending_orders", "label": "Pending Orders Counter 🔔", "module": "System Shell", "parent_code": None, "sort_order": 202},
    {"code": "header.calculator", "label": "Calculator Tool 🧮", "module": "System Shell", "parent_code": None, "sort_order": 203},
    {"code": "header.theme_toggle", "label": "Theme Toggle (Dark/Light) 🌗", "module": "System Shell", "parent_code": None, "sort_order": 203},
    {"code": "sidebar.nav.companies", "label": "Companies Link 🏢", "module": "System Shell", "parent_code": None, "sort_order": 204},
    {"code": "sidebar.nav.plans", "label": "Subscription/Plans Link 📦", "module": "System Shell", "parent_code": None, "sort_order": 205},
    {"code": "sidebar.nav.users", "label": "User Management Link 👤", "module": "System Shell", "parent_code": None, "sort_order": 206},
    {"code": "sidebar.nav.backup", "label": "Backup & Restore Tools 💾", "module": "System Shell", "parent_code": None, "sort_order": 207},
    {"code": "sidebar.nav.import", "label": "Import Tools 🔁", "module": "System Shell", "parent_code": None, "sort_order": 208},
    {"code": "admin.announcements", "label": "System Broadcasts", "module": "System Shell", "parent_code": None, "sort_order": 210},
    {"code": "performance.dashboard", "label": "Performance Dashboard", "module": "Performance", "parent_code": "PERFORMANCE", "sort_order": 86},
    {"code": "performance.rewards", "label": "Rewards", "module": "Performance", "parent_code": "PERFORMANCE", "sort_order": 87},
    
    # Resources
    {"code": "RESOURCES", "label": "Resources", "module": "Resources", "parent_code": None, "sort_order": 95},
    {"code": "resources.library", "label": "Library", "module": "Resources", "parent_code": "RESOURCES", "sort_order": 96},
    {"code": "communications.logs", "label": "Comm. Logs", "module": "Resources", "parent_code": "RESOURCES", "sort_order": 97},

    # Admin / Platform
    {"code": "admin.platform_bookkeeping", "label": "Platform Bookkeeping", "module": "Platform", "parent_code": None, "sort_order": 211},
    {"code": "admin.settings", "label": "Admin Settings", "module": "Platform", "parent_code": None, "sort_order": 212},
]

REQUIRED_FRONTEND_MENU_CODES = [
    "pos.billing",
    "pos.tables",
    "sales.restaurant_pos",
    "sales.invoice.list",
    "sales.order.list",
    "sales.return.list",
    "sales.customers",
    "purchases.bill.list",
    "purchases.order.list",
    "purchases.return.list",
    "purchases.suppliers",
    "document.upload",
    "document.list",
    "inventory.items",
    "inventory.categories",
    "inventory.subcategories",
    "inventory.brands",
    "inventory.warehouses",
    "inventory.stock_transfers",
    "manufacturing.dashboard",
    "manufacturing.bom_master",
    "manufacturing.production_order",
    "manufacturing.material_issue",
    "manufacturing.wip",
    "manufacturing.production_entry",
    "manufacturing.finished_goods_receive",
    "manufacturing.wastage_scrap",
    "manufacturing.production_costing",
    "manufacturing.reports",
    "manufacturing.settings",
    "manufacturing.ai_documents",
    "manufacturing.fg_journal_entry",
    "payroll.dashboard",
    "payroll.employees",
    "payroll.payheads",
    "payroll.shifts",
    "payroll.shift_assignments",
    "payroll.devices",
    "payroll.attendance",
    "payroll.leave",
    "payroll.runs",
    "payroll.device_users",
    "payroll.pay_structures",
    "payroll.cost_centers",
    "payroll.commission_rules",
    "payroll.commission_report",
    "delivery.places_partners",
    "delivery.packages",
    "performance.dashboard",
    "performance.rewards",
    "resources.library",
    "communications.logs",
    "accounting.masters.ledgers",
    "accounting.masters.payment-modes",
    "accounting.masters.sales_target",
    "accounting.masters.sales-persons",
    "accounting.voucher.payment",
    "accounting.voucher.receipt",
    "accounting.voucher.journal",
    "accounting.voucher.contra",
    "reports.quick_analysis",
    "reports.stock",
    "reports.revenue_analytics",
    "reports.performance_insights",
    "reports.trial_balance",
    "reports.daybook",
    "reports.balance_sheet",
    "reports.pnl",
    "reports.customers",
    "reports.suppliers",
    "reports.sales_summary",
    "reports.purchase_summary",
    "reports.receivable_payable",
    "dashboard.total_sales",
    "dashboard.total_purchase",
    "dashboard.sales_vs_margin",
    "dashboard.expenses",
    "dashboard.net_income",
    "dashboard.receivables",
    "dashboard.payables",
    "dashboard.balances",
    "dashboard.income_vs_expenses",
    "dashboard.recent_activity",
    "dashboard.top_parties",
    "dashboard.date_filters",
    "dashboard.master_panel",
    "dashboard.export_actions",
    "header.notifications",
    "header.pending_orders",
    "header.calculator",
    "header.theme_toggle",
    "sidebar.nav.companies",
    "sidebar.nav.plans",
    "sidebar.nav.users",
    "sidebar.nav.backup",
    "sidebar.nav.import",
    "admin.announcements",
    "admin.platform_bookkeeping",
    "admin.settings",
    "reports.ledger",
    "reports.income_expense_summary",
    "reports.monthly_income_expense",
    "reports.online_orders",
    "reports.mis_cash_flow",
    "reports.mis_fund_management",
    "reports.mis_target_vs_actual",
    "settings.language",
    "settings.calendar",
    "settings.duty_taxes",
    "settings.company",
    "settings.users",
    "settings.plans",
    "settings.currency",
    "settings.notifications",
    "settings.inventory_valuation",
    "settings.cost-centers",
    "settings.projects",
    "INVENTORY_STOCK_SUMMARY",
    "REPORTS_SALES",
    "REPORTS_PURCHASES",
    # Parent Menus
    "SALES",
    "PURCHASES",
    "DOCUMENT",
    "INVENTORY",
    "MANUFACTURING_ERP",
    "POS",
    "PAYROLL",
    "TASKS",
    "REPORTS",
    "settings",
    "accounting.masters",
    "accounting.masters.sales-persons",
    "DASHBOARD",
    "DELIVERY",
    "PERFORMANCE",
    "RESOURCES",
    "reports.profit_loss_comparison",
    "reports.sales_purchase_summary",
    "reports.customer_ledger",
    "reports.supplier_ledger",
    "reports.stock_movements",
    "reports.stock_summary",
    "reports.inventory_history",
    "reports.item_wise_profit",
    "reports.fixed_assets",
    "reports.employee_cost",
]

MINIMAL_REQUIRED_MENU_CODES = []

# Full default seed catalog (for superadmin reference template only; not assignable to tenants).
DEFAULT_FULL_CATALOG_TEMPLATE_NAME = "Default Menu Template"
ALL_SEED_MENU_CODES: list[str] = [str(item["code"]) for item in DEFAULT_MENUS]

BASELINE_BOM_PRODUCTION_MENU_CODES = [
    "manufacturing.bom_master",
    "manufacturing.production_order",
]


LEGACY_CODE_MAP = {
    "SALES_INVOICES": "sales.invoice.list",
    "SALES_RETURNS": "sales.return.list",
    "PURCHASE_BILLS": "purchases.bill.list",
    "PURCHASE_RETURNS": "purchases.return.list",
    "INVENTORY_ITEMS": "inventory.items",
}


def upsert_default_menus(db: Session) -> List[models.Menu]:
    defaults = DEFAULT_MENUS

    # Migration: Rename old codes to new canonical codes
    for old_code, new_code in LEGACY_CODE_MAP.items():
        existing_old = db.query(models.Menu).filter(models.Menu.code == old_code).first()
        if existing_old:
            # Check if new code already exists
            existing_new = db.query(models.Menu).filter(models.Menu.code == new_code).first()
            if existing_new:
                # Merge? For now just deactivate old one if new one exists to avoid duplicates
                existing_old.is_active = False
                existing_old.code = f"DEPRECATED_{old_code}_{existing_old.id}"
                logger.info("Deactivated legacy menu %s as %s already exists", old_code, new_code)
            else:
                existing_old.code = new_code
                logger.info("Migrated legacy menu code %s to %s", old_code, new_code)
    db.flush()

    existing_codes = {code for (code,) in db.query(models.Menu.code).all()}
    missing_codes = [item["code"] for item in defaults if item["code"] not in existing_codes]
    if missing_codes:
        logger.warning("Missing global menus detected; creating defaults: %s", missing_codes)

    code_to_menu: dict[str, models.Menu] = {}

    for item in defaults:
        code = item["code"]
        existing = db.query(models.Menu).filter(models.Menu.code == code).first()
        if existing:
            existing.label = item["label"]
            existing.module = item["module"]
            existing.sort_order = item["sort_order"]
            existing.is_active = True
            menu = existing
        else:
            menu = models.Menu(
                code=code,
                label=item["label"],
                module=item["module"],
                sort_order=item["sort_order"],
                is_active=True,
            )
            db.add(menu)
        db.flush()
        code_to_menu[code] = menu

    for item in defaults:
        code = item["code"]
        parent_code = item["parent_code"]
        menu = code_to_menu[code]

        if parent_code:
            parent_menu = code_to_menu.get(parent_code)
            if not parent_menu:
                parent_menu = db.query(models.Menu).filter(models.Menu.code == parent_code).first()
            if not parent_menu:
                raise HTTPException(
                    status_code=400,
                    detail=f"Parent menu with code '{parent_code}' not found for '{code}'",
                )
            menu.parent_id = parent_menu.id
        else:
            menu.parent_id = None

        db.add(menu)

    db.commit()

    result = (
        db.query(models.Menu)
        .filter(models.Menu.code.in_([item["code"] for item in defaults]))
        .order_by(models.Menu.module, models.Menu.sort_order, models.Menu.id)
        .all()
    )
    return result


def user_can_view_superadmin_menu_templates(user: models.User) -> bool:
    """Who may list/view superadmin-only menu templates (reference catalogs).

    Includes platform roles; excludes tenant-scoped admins (they manage tenant users only).

    Note: Auth resolves the user from DB by JWT ``sub`` (user id). Ghost dashboard must use a
    token whose ``sub`` points at a row with one of these roles (typically ``superadmin``).
    """
    role = getattr(user, "role", None)
    if role == models.UserRole.superadmin:
        return True
    if role in (
        models.UserRole.ghost_billing,
        models.UserRole.ghost_support,
        models.UserRole.ghost_tech,
    ):
        return True

    role_str = str(role.value if hasattr(role, "value") else role).lower()
    if role_str == "superadmin" or role_str.startswith("ghost_"):
        return True
    if bool(getattr(user, "is_system_admin", False)):
        return True
    # Seeded / platform operator: admin not attached to a tenant
    if role_str == "admin" and getattr(user, "tenant_id", None) is None:
        return True
    return False


def ensure_menu_template_assignable_to_tenant(template: models.MenuTemplate | None) -> None:
    """Raise if template is reserved for superadmin reference only."""
    if template is None:
        return
    if bool(getattr(template, "superadmin_only", False)):
        raise HTTPException(
            status_code=400,
            detail="This menu template is restricted to platform superadmins and cannot be assigned to tenants or plans.",
        )


def required_menu_codes_after_template_edit(t: models.MenuTemplate) -> list[str]:
    """Menus auto-injected after create/update via admin API."""
    if getattr(t, "superadmin_only", False):
        return []
    if t.name == "Standard":
        return REQUIRED_FRONTEND_MENU_CODES
    return MINIMAL_REQUIRED_MENU_CODES


def ensure_superadmin_full_catalog_menu_template(db: Session) -> None:
    """Seed 'Default Menu Template' with every menu from DEFAULT_MENUS (superadmin-only visibility)."""
    existing = (
        db.query(models.MenuTemplate)
        .filter(models.MenuTemplate.name == DEFAULT_FULL_CATALOG_TEMPLATE_NAME)
        .first()
    )
    if not existing:
        tpl = models.MenuTemplate(
            name=DEFAULT_FULL_CATALOG_TEMPLATE_NAME,
            description=(
                "Menu Templates (UPDATED): full default seed catalog. "
                "Reference only—visible to platform superadmin; not assignable to tenants or plans."
            ),
            is_active=True,
            superadmin_only=True,
        )
        db.add(tpl)
        db.flush()
        template_id = int(tpl.id)
    else:
        template_id = int(existing.id)
        if not bool(getattr(existing, "superadmin_only", False)):
            existing.superadmin_only = True
            db.add(existing)
            db.flush()

    ensure_menu_template_has_required_menus(
        db,
        template_id=template_id,
        required_menu_codes=ALL_SEED_MENU_CODES,
    )


def ensure_default_menu_templates(db: Session) -> None:
    existing = db.query(models.MenuTemplate).filter(models.MenuTemplate.name == "Standard").first()
    if not existing:
        template = models.MenuTemplate(name="Standard", description="", is_active=True)
        db.add(template)
        db.flush()
        template_id = int(template.id)
    else:
        template_id = int(existing.id)

    # 1. Ensure required frontend menus are in the 'Standard' template
    ensure_menu_template_has_required_menus(
        db,
        template_id=template_id,
        required_menu_codes=REQUIRED_FRONTEND_MENU_CODES,
    )

    # 1b. Superadmin full-catalog reference (all DEFAULT_MENUS) — before the all-templates loop
    ensure_superadmin_full_catalog_menu_template(db)

    # 2. ALSO ensure required frontend menus are in ALL existing templates.
    # For custom templates, we only enforce MINIMAL_REQUIRED_MENU_CODES.
    # This prevents the "Standard" re-inflation bug while maintaining shell access.
    all_templates = db.query(models.MenuTemplate).all()
    for t in all_templates:
        if getattr(t, "superadmin_only", False):
            continue
        # Standard template gets full set
        if t.name == "Standard":
            req_codes = REQUIRED_FRONTEND_MENU_CODES
        else:
            # All other templates only get minimal set (allows customization)
            req_codes = MINIMAL_REQUIRED_MENU_CODES

        ensure_menu_template_has_required_menus(
            db,
            template_id=int(t.id),
            required_menu_codes=req_codes,
        )

    # 3. Finally, normalize groupings across all templates to ensure shell/settings items are in the right places
    normalize_all_template_groupings(db)
    # 4. Ensure baseline BOM/production menus exist on assigned templates.
    ensure_baseline_menus_on_assigned_templates(db)

    db.commit()


def _default_group_for_menu_code(code: str) -> tuple[str | None, int | None]:
    c = str(code or "").strip()
    cl = c.lower()

    if "dashboard" in cl:
        return "General", 5

    if cl in {"companies", "users", "plans"}:
        return "Setup", 10

    if cl.startswith("settings"):
        return "Settings", 20

    if cl.startswith("sidebar.nav") or cl.startswith("header."):
        return "System Shell", 40

    if "analytics" in cl or "insights" in cl or "dashboard." in cl:
        return "Dashboard Analytics", 5

    if cl.startswith("reports") or cl.startswith("REPORTS") or cl in {"INVENTORY_STOCK_SUMMARY"}:
        return "Reports", 30

    if cl.startswith("pos.") or cl == "pos" or "restaurant_pos" in cl:
        return "POS", 15

    if cl.startswith("inventory.") or cl == "inventory":
        return "Inventory", 22

    if cl.startswith("manufacturing.") or cl == "manufacturing_erp":
        return "Manufacturing", 24

    if cl.startswith("document.") or cl == "document":
        return "Document", 23

    if cl.startswith("payroll.") or cl == "payroll":
        return "Payroll", 25

    if cl.startswith("delivery.") or cl == "delivery":
        return "Delivery", 26

    if cl.startswith("performance.") or cl == "performance":
        return "Performance", 27

    if cl.startswith("resources.") or cl == "resources" or cl.startswith("communications."):
        return "Resources", 28

    if cl.startswith("accounting.") or cl == "accounting":
        return "Accounting", 15

    if cl.startswith("sales") or cl.startswith("purchase") or cl in {"purchases", "sales"}:
        if ".customers" in cl or ".suppliers" in cl:
            return "Master", 20
        return "Voucher", 10

    return "Master", 20


def normalize_all_template_groupings(db: Session, force_shell: bool = True) -> None:
    templates = db.query(models.MenuTemplate).all()
    for tpl in templates:
        rows = (
            db.query(models.MenuTemplateMenu, models.Menu)
            .join(models.Menu, models.Menu.id == models.MenuTemplateMenu.menu_id)
            .filter(models.MenuTemplateMenu.template_id == int(tpl.id))
            .all()
        )

        changed = False
        for (link, menu) in rows:
            link_changed = False
            code = str(getattr(menu, "code", "") or "").lower()
            group_name, group_order = _default_group_for_menu_code(code)

            # FORCE normalization for System Shell, Dashboard, Setup, and Settings
            # This ensures these menus "will not cover take other location" (will not leak into business modules)
            is_shell_item = (
                "dashboard" in code or 
                code in {"companies", "users", "plans"} or 
                code.startswith("settings") or 
                code.startswith("sidebar.nav") or 
                code.startswith("header.")
            )

            if force_shell and is_shell_item:
                target_visibility = False if code in {"dashboard", "sidebar.nav.companies", "sidebar.nav.plans", "sidebar.nav.users"} else True
                if (link.group_name != group_name or 
                    link.group_order != group_order or 
                    link.is_sidebar_visible != target_visibility):
                    link.group_name = group_name
                    link.group_order = group_order
                    # Strictly hide system shell items from the dynamic lists
                    if is_shell_item:
                        link.is_sidebar_visible = target_visibility
                    changed = True
                    link_changed = True
            else:
                # Standard normalization for functional modules
                current_group = getattr(link, "group_name", "")
                # Fix accounting codes that were wrongly assigned "Master" as group_name
                if group_name == "Accounting" and current_group in ["Master", "", None]:
                    link.group_name = group_name
                    link.group_order = group_order
                    changed = True
                    link_changed = True

                if group_name in ["POS", "Payroll", "Delivery", "Performance", "Resources"] and current_group in ["Master", "Voucher", "", None, "Accounting"]:
                    link.group_name = group_name
                    link.group_order = group_order
                    changed = True
                    link_changed = True

                if getattr(link, "group_name", None) is None and group_name is not None:
                    link.group_name = group_name
                    changed = True
                    link_changed = True

                if getattr(link, "group_order", None) is None and group_order is not None:
                    link.group_order = int(group_order)
                    changed = True
                    link_changed = True

            if link_changed:
                db.add(link)

        if changed:
            db.commit()


def get_default_menu_template_id(db: Session) -> int | None:
    template = db.query(models.MenuTemplate).filter(models.MenuTemplate.name == "Standard").first()
    if template and bool(getattr(template, "is_active", True)):
        return int(template.id)
    return None


def ensure_default_menu_template_assigned_to_all_tenants(db: Session) -> None:
    template_id = get_default_menu_template_id(db)
    if not template_id:
        return

    tenants = db.query(models.Tenant).filter(models.Tenant.menu_template_id.is_(None)).all()
    if not tenants:
        return

    for tenant in tenants:
        tenant.menu_template_id = int(template_id)
        db.add(tenant)
    db.commit()


def ensure_baseline_menus_on_assigned_templates(db: Session) -> None:
    """Backfill baseline menus on all tenant/plan assigned templates.

    This only inserts missing template links and never mutates existing links,
    preserving custom per-template overrides.
    """
    template_ids: set[int] = set()

    tenant_ids = (
        db.query(models.Tenant.menu_template_id)
        .filter(models.Tenant.menu_template_id.isnot(None))
        .all()
    )
    template_ids.update(int(r[0]) for r in tenant_ids if r and r[0] is not None)

    plan_ids = (
        db.query(models.Plan.menu_template_id)
        .filter(models.Plan.menu_template_id.isnot(None))
        .all()
    )
    template_ids.update(int(r[0]) for r in plan_ids if r and r[0] is not None)

    default_template_id = get_default_menu_template_id(db)
    if default_template_id:
        template_ids.add(int(default_template_id))

    for template_id in sorted(template_ids):
        ensure_menu_template_has_required_menus(
            db,
            template_id=int(template_id),
            required_menu_codes=BASELINE_BOM_PRODUCTION_MENU_CODES,
        )


def ensure_menu_template_has_required_menus(
    db: Session,
    *,
    template_id: int,
    required_menu_codes: list[str],
) -> None:
    required_codes = [str(c).strip() for c in (required_menu_codes or []) if str(c).strip()]
    if not required_codes:
        return

    template = db.query(models.MenuTemplate).get(int(template_id))
    if not template:
        raise HTTPException(status_code=400, detail="Invalid menu_template_id")

    # Ensure required menus exist in the catalog.
    upsert_default_menus(db)

    menus = (
        db.query(models.Menu)
        .filter(func.lower(models.Menu.code).in_([str(c).lower() for c in required_codes]))
        .all()
    )
    found_codes = {str(m.code or "").casefold() for m in menus}
    missing_codes = [c for c in required_codes if str(c).casefold() not in found_codes]
    if missing_codes:
        raise HTTPException(status_code=400, detail=f"Required menu(s) not found: {missing_codes}")

    existing_menu_ids = {
        int(r[0])
        for r in (
            db.query(models.MenuTemplateMenu.menu_id)
            .filter(models.MenuTemplateMenu.template_id == int(template_id))
            .all()
        )
    }

    created_any = False
    for m in menus:
        if int(m.id) in existing_menu_ids:
            continue
        
        code = str(getattr(m, "code", "") or "")
        group_name, group_order = _default_group_for_menu_code(code)
        # Hide hardcoded System Shell items and dashboard widgets from the dynamic sidebar
        is_shell_item = code in {"DASHBOARD", "sidebar.nav.companies", "sidebar.nav.plans", "sidebar.nav.users"}
        is_widget = code.startswith("dashboard.")
        
        db.add(
            models.MenuTemplateMenu(
                template_id=int(template_id),
                menu_id=int(m.id),
                group_name=group_name,
                group_order=group_order,
                item_order=int(getattr(m, "sort_order", 0) or 0) or None,
                is_sidebar_visible=not (is_shell_item or is_widget),
            )
        )
        created_any = True

    if created_any:
        db.commit()


def ensure_default_menus_for_company(db: Session, company_id: int) -> None:
    company = db.query(models.Company).get(company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    upsert_default_menus(db)
    ensure_baseline_menus_on_assigned_templates(db)

    required_settings_codes = [
        "settings",
        "settings.company",
        "settings.calendar",
        "settings.language",
    ]

    settings_parent = db.query(models.Menu).filter(models.Menu.code == "settings").first()
    if not settings_parent:
        settings_parent = models.Menu(
            code="settings",
            label="Settings",
            module="Settings",
            parent_id=None,
            sort_order=900,
            is_active=True,
        )
        db.add(settings_parent)
        db.flush()

    # Normalize the Settings parent itself
    if not settings_parent.module:
        settings_parent.module = "Settings"
    settings_parent.label = "Settings"
    settings_parent.parent_id = None
    settings_parent.sort_order = 900
    settings_parent.is_active = True

    required_settings_defaults = {
        "settings.company": {"label": "Company", "sort_order": 901},
        "settings.calendar": {"label": "Calendar", "sort_order": 902},
        "settings.language": {"label": "Language", "sort_order": 903},
    }

    changed = False
    for code, meta in required_settings_defaults.items():
        menu = db.query(models.Menu).filter(models.Menu.code == code).first()
        if not menu:
            menu = models.Menu(
                code=code,
                label=meta["label"],
                module="Settings",
                parent_id=settings_parent.id,
                sort_order=meta["sort_order"],
                is_active=True,
            )
            db.add(menu)
            changed = True
            continue

        # Self-heal normalization for pre-existing rows
        if menu.label != meta["label"]:
            menu.label = meta["label"]
            changed = True
        if not menu.module:
            menu.module = "Settings"
            changed = True
        if menu.module != "Settings":
            menu.module = "Settings"
            changed = True
        if menu.parent_id != settings_parent.id:
            menu.parent_id = settings_parent.id
            changed = True
        if menu.sort_order != meta["sort_order"]:
            menu.sort_order = meta["sort_order"]
            changed = True
        if menu.is_active is not True:
            menu.is_active = True
            changed = True

    # Sanity check / observability
    existing_required = {
        code
        for (code,) in db.query(models.Menu.code)
        .filter(models.Menu.code.in_(required_settings_codes))
        .all()
    }
    missing_required = [code for code in required_settings_codes if code not in existing_required]
    if missing_required:
        logger.error(
            "Company %s has incomplete menu catalog after seeding (missing required settings menus: %s)",
            company_id,
            missing_required,
        )

    if changed:
        db.commit()
