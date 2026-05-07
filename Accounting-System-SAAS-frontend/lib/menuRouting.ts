export function menuHrefFromCode(companyId: number, code: string): string | null {
  const c = String(code || "").trim().toLowerCase();
  if (!c) return null;

  if (c === "dashboard" || c.startsWith("dashboard.")) return "/dashboard";
  if (c === "sidebar.nav.companies") return "/companies";
  if (c === "sidebar.nav.plans") return "/settings/plan";
  if (c === "sidebar.nav.users") return "/settings/users";
  if (c === "sidebar.nav.backup") return "/settings/backup";
  if (c === "sidebar.nav.import") return "/admin/import";

  if (c === "payroll.dashboard") return `/companies/${companyId}/payroll`;
  if (c === "payroll.employees") return `/companies/${companyId}/payroll/employees`;
  if (c === "payroll.payheads") return `/companies/${companyId}/payroll/payheads`;
  if (c === "payroll.shifts") return `/companies/${companyId}/payroll/shifts`;
  if (c === "payroll.shift_assignments") return `/companies/${companyId}/payroll/shift-assignments`;
  if (c === "payroll.devices") return `/companies/${companyId}/payroll/devices`;
  if (c === "payroll.device_users") return `/companies/${companyId}/payroll/device-users`;
  if (c === "payroll.attendance") return `/companies/${companyId}/payroll/attendance`;
  if (c === "payroll.leave") return `/companies/${companyId}/payroll/leave`;
  if (c === "payroll.pay_structures") return `/companies/${companyId}/payroll/pay-structures`;
  if (c === "payroll.runs") return `/companies/${companyId}/payroll/runs`;
  if (c === "payroll.cost_centers") return `/companies/${companyId}/settings/cost-centers`;
  if (c === "payroll.commission_rules") return `/companies/${companyId}/payroll/commissions/rules`;
  if (c === "payroll.commission_report") return `/companies/${companyId}/payroll/commissions/report`;
  
  if (c === "performance.dashboard") return `/companies/${companyId}/performance`;
  if (c === "performance.rewards") return `/companies/${companyId}/rewards`;
  if (c === "resources.library") return `/companies/${companyId}/resources`;
  if (c === "communications.logs") return `/companies/${companyId}/communications`;
  if (c === "tasks.list") return `/companies/${companyId}/tasks`;
  if (c === "tasks.heads") return `/companies/${companyId}/tasks/heads`;
  if (c === "tasks.performance_report") return `/companies/${companyId}/reports/task-performance`;

  if (c === "sales.invoice.list") return `/companies/${companyId}/sales/invoices`;
  if (c === "sales.order.list") return `/companies/${companyId}/sales/orders`;
  if (c === "sales.return.list") return `/companies/${companyId}/sales/returns`;
  if (c === "sales.restaurant_pos") return `/companies/${companyId}/sales/restaurant-pos`;

  if (c === "purchases.bill.list") return `/companies/${companyId}/purchases/bills`;
  if (c === "purchases.order.list") return `/companies/${companyId}/purchases/orders`;
  if (c === "purchases.return.list") return `/companies/${companyId}/purchases/returns`;
  if (c === "document" || c === "documents" || c === "document.dashboard") {
    return `/companies/${companyId}/documents/list`;
  }
  if (c === "document.upload") return `/companies/${companyId}/documents/upload`;
  if (c === "document.list") return `/companies/${companyId}/documents/list`;
  if (c === "document.actions") return `/companies/${companyId}/documents/actions`;

  if (c === "pos.billing") return `/companies/${companyId}/sales/pos`;
  if (c === "pos.tables") return `/companies/${companyId}/sales/restaurant-tables`;

  if (c === "inventory.items") return `/companies/${companyId}/inventory/items`;
  if (c === "inventory.categories") return `/companies/${companyId}/inventory/categories`;
  if (c === "inventory.brands") return `/companies/${companyId}/inventory/brands`;
  if (c === "inventory.warehouses") return `/companies/${companyId}/inventory/warehouses`;
  if (c === "inventory.stock_transfers") return `/companies/${companyId}/inventory/stock-transfers`;
  // Legacy inventory menu codes now route to new Manufacturing ERP screens.
  if (c === "inventory.bom") return `/companies/${companyId}/manufacturing/bom-master`;
  if (c === "inventory.production_orders") return `/companies/${companyId}/manufacturing/production-order`;
  if (c === "manufacturing.dashboard") return `/companies/${companyId}/manufacturing`;
  if (c === "manufacturing.bom_master") return `/companies/${companyId}/manufacturing/bom-master`;
  if (c === "manufacturing.production_order") return `/companies/${companyId}/manufacturing/production-order`;
  if (c === "manufacturing.material_issue") return `/companies/${companyId}/manufacturing/material-issue`;
  if (c === "manufacturing.wip") return `/companies/${companyId}/manufacturing/work-in-progress`;
  if (c === "manufacturing.production_entry") return `/companies/${companyId}/manufacturing/production-entry`;
  if (c === "manufacturing.finished_goods_receive") return `/companies/${companyId}/manufacturing/finished-goods-receive`;
  if (c === "manufacturing.wastage_scrap") return `/companies/${companyId}/manufacturing/wastage-scrap`;
  if (c === "manufacturing.production_costing") return `/companies/${companyId}/manufacturing/production-costing`;
  if (c === "manufacturing.reports") return `/companies/${companyId}/manufacturing/reports`;
  if (c === "manufacturing.settings") return `/companies/${companyId}/manufacturing/settings`;
  if (c === "manufacturing.ai_documents") return `/companies/${companyId}/manufacturing/ai-documents`;
  if (c === "manufacturing.fg_journal_entry") return `/companies/${companyId}/vouchers?type=JOURNAL`;

  if (c === "accounting.masters.ledgers") return `/companies/${companyId}/ledgers`;
  if (c === "accounting.masters.sales_target") return `/companies/${companyId}/sales-target`;

  if (c === "reports.quick_analysis") return `/companies/${companyId}/reports`;
  if (c === "reports.revenue_analytics") return `/companies/${companyId}/reports/revenue-analytics`;
  if (c === "reports.performance_insights") return `/companies/${companyId}/reports/performance-insights`;
  if (c === "reports.trial_balance") return `/companies/${companyId}/reports/trial-balance`;
  if (c === "reports.ledger") return `/companies/${companyId}/reports/ledger`;
  if (c === "reports.daybook") return `/companies/${companyId}/reports/daybook`;
  if (c === "reports.balance_sheet") return `/companies/${companyId}/reports/balance-sheet`;
  if (c === "reports.pnl") return `/companies/${companyId}/reports/profit-loss`;
  if (c === "reports.stock") return `/companies/${companyId}/reports/items`;
  if (c === "reports.item_wise_profit") return `/companies/${companyId}/reports/item-wise-profit`;
  if (c === "reports.item_history") return `/companies/${companyId}/reports/item-history`;
  if (c === "reports.bom_transactions") return `/companies/${companyId}/reports/bom-transactions`;
  if (c === "reports.employee_cost") return `/companies/${companyId}/reports/employee-cost`;
  if (c === "reports.sales_mix") return `/companies/${companyId}/reports/sales-mix`;
  if (c === "reports.expenses_mix") return `/companies/${companyId}/reports/expenses-mix`;
  if (c === "reports.fixed_assets") return `/companies/${companyId}/reports/fixed-assets`;
  if (c === "reports.customers") return `/companies/${companyId}/reports/customers`;
  if (c === "reports.suppliers") return `/companies/${companyId}/reports/suppliers`;
  if (c === "reports.sales_summary") return `/companies/${companyId}/sales/summary`;
  if (c === "reports.purchase_summary") return `/companies/${companyId}/purchases/summary`;
  if (c === "reports.income_expense_summary") return `/companies/${companyId}/reports/income-expense-summary`;
  if (c === "reports.mis_cash_flow") return `/companies/${companyId}/reports/mis-cash-flow`;
  if (c === "reports.mis_fund_management") return `/companies/${companyId}/reports/mis-fund-management`;
  if (c === "reports.mis_target_vs_actual") return `/companies/${companyId}/reports/mis-target-vs-actual`;
  if (c === "reports.receivable_payable") return `/companies/${companyId}/reports/receivable-payable`;
  if (c === "reports.monthly_income_expense") return `/companies/${companyId}/reports/monthly-income-expense`;
  if (c === "reports.online_orders") return `/companies/${companyId}/reports/online-orders`;

  if (c === "accounting.masters.payment-modes") return `/companies/${companyId}/settings/payment-modes`;
  if (c === "accounting.masters.sales-persons" || c === "accounting.masters.sales-person" || c === "accounting.masters.sales_person" || c === "accounting.masters.sales_persons") return `/companies/${companyId}/sales-persons`;
  if (c === "settings.company") return null;
  if (c === "settings.language") return `/companies/${companyId}/settings/language`;
  if (c === "settings.currency") return `/companies/${companyId}/settings/currency`;
  if (c === "settings.calendar") return `/companies/${companyId}/settings/calendar`;
  if (c === "settings.print") return `/companies/${companyId}/settings/print`;

  if (c === "settings.website_orders") return `/companies/${companyId}/settings/website-orders`;
  if (c === "settings.website_integration") return `/companies/${companyId}/settings/website-integration`;
  if (c === "settings.notifications") return `/companies/${companyId}/settings/notifications`;
  if (c === "settings.inventory_valuation") return `/companies/${companyId}/settings/inventory-valuation`;
  if (c === "settings.cost-centers") return `/companies/${companyId}/settings/cost-centers`;
  if (c === "settings.departments") return `/companies/${companyId}/settings/departments`;
  if (c === "settings.projects") return `/companies/${companyId}/settings/projects`;
  if (c === "settings.customer-types") return `/companies/${companyId}/settings/customer-types`;
  if (c === "settings.payment-modes") return `/companies/${companyId}/settings/payment-modes`;
  if (c === "settings.company-defaults") return `/companies/${companyId}/settings/company-defaults`;
  if (c === "settings.duty_taxes") return `/companies/${companyId}/settings/duty-taxes`;
  if (c === "settings.setup") return `/companies/${companyId}/settings/setup`;

  if (c === "delivery.places") return `/companies/${companyId}/inventory/delivery-places`;
  if (c === "delivery.partners") return `/companies/${companyId}/sales/delivery-partners`;
  if (c === "delivery.places_partners") return `/companies/${companyId}/delivery/places-partners`;
  if (c === "delivery.packages") return `/companies/${companyId}/sales/packages`;

  if (c === "inventory.categories") return `/companies/${companyId}/inventory/categories`;
  if (c === "inventory.subcategories") return `/companies/${companyId}/inventory/subcategories`;
  if (c === "inventory.brands") return `/companies/${companyId}/inventory/brands`;
  if (c === "inventory.items") return `/companies/${companyId}/inventory/items`;
  if (c === "inventory.warehouses") return `/companies/${companyId}/inventory/warehouses`;
  if (c === "inventory.stock_transfers") return `/companies/${companyId}/inventory/stock-transfers`;
  if (c === "inventory_stock_summary") return `/companies/${companyId}/inventory/stock-summary`;

  if (c === "sales.customers") return `/companies/${companyId}/sales/customers`;
  if (c === "purchases.suppliers") return `/companies/${companyId}/purchases/suppliers`;
  if (c === "settings.company") return `/companies/${companyId}/settings/company-profile`;

  if (c === "accounting.voucher.payment") return `/companies/${companyId}/vouchers?type=PAYMENT`;
  if (c === "accounting.voucher.receipt") return `/companies/${companyId}/vouchers?type=RECEIPT`;
  if (c === "accounting.voucher.collection_receipt") return `/companies/${companyId}/vouchers?type=COLLECTION_RECEIPT`;
  if (c === "accounting.voucher.contra") return `/companies/${companyId}/vouchers?type=CONTRA`;
  if (c === "accounting.voucher.journal") return `/companies/${companyId}/vouchers?type=JOURNAL`;
  if (c === "accounting.voucher.sales_invoice") return `/companies/${companyId}/vouchers?type=SALES_INVOICE`;
  if (c === "accounting.voucher.purchase_bill") return `/companies/${companyId}/vouchers?type=PURCHASE_BILL`;
  
  // -- GLOBAL ADMIN ROUTES (No companyId required) --
  if (c === "admin.plans") return "/admin/plans";
  if (c === "admin.platform_bookkeeping") return "/admin/ghost-redirect";
  if (c === "admin.ghost") return "/admin/ghost";
  if (c === "admin.announcements") return "/admin/announcements";
  if (c === "admin.menu_library" || c === "admin.menus") return "/admin/menus";
  if (c === "admin.menu_template" || c === "admin.menu_templates") return "/admin/menu-templates";
  if (c === "admin.settings") return "/admin/settings";
  if (c === "admin.backup") return "/admin/backup";
  if (c === "admin.logs") return "/admin/logs";

  // -- GHOST SMART REPORTS --
  if (c === "admin.smart_reports") return "/admin/ghost";
  if (c === "admin.reports.sales") return "/admin/ghost/reports/sales";
  if (c === "admin.reports.collections") return "/admin/ghost/reports/collections";
  if (c === "admin.reports.debtors") return "/admin/ghost/reports/debtors";

  return null;
}
