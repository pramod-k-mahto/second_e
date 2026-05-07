"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

type Report = {
  id: string;
  label: string;
  desc: string;
  icon: string;
  accent: string;
  dot: string;
};

type ReportGroup = {
  group: string;
  reports: Report[];
};

const reportGroups: ReportGroup[] = [
  {
    group: "Financial Statements",
    reports: [
      { id: "balance-sheet", label: "Balance Sheet", desc: "Assets, liabilities & equity overview", icon: "📊", accent: "text-emerald-700", dot: "bg-emerald-500" },
      { id: "profit-loss", label: "Profit & Loss", desc: "Income vs expenses performance report", icon: "💹", accent: "text-amber-700", dot: "bg-amber-500" },
      { id: "trial-balance", label: "Trial Balance", desc: "Check debit & credit balance summary", icon: "⚖️", accent: "text-blue-700", dot: "bg-blue-500" },
      { id: "profit-loss-comparison", label: "P&L Comparison", desc: "Comparative profit and loss analysis", icon: "📈", accent: "text-indigo-700", dot: "bg-indigo-500" },
      { id: "monthly-income-expense", label: "Monthly Trend Analysis", desc: "Monthly income and expense trends", icon: "📉", accent: "text-rose-700", dot: "bg-rose-500" },
      { id: "sales-purchase-summary", label: "Sales vs Purchase Summary", desc: "Combined sales and purchase comparison", icon: "🔄", accent: "text-cyan-700", dot: "bg-cyan-500" },
    ],
  },
  {
    group: "Ledger & Transactions",
    reports: [
      { id: "ledger", label: "Ledger Report", desc: "Detailed ledger account transactions", icon: "📒", accent: "text-slate-700", dot: "bg-slate-500" },
      { id: "daybook", label: "Daybook", desc: "Daily transaction journal entries", icon: "📅", accent: "text-cyan-700", dot: "bg-cyan-500" },
      { id: "party-statement", label: "Party Statement", desc: "Customer & supplier account statements", icon: "👥", accent: "text-violet-700", dot: "bg-violet-500" },
      { id: "income-expense-summary", label: "Income & Expense Summary", desc: "Summarized income and expense view", icon: "📋", accent: "text-pink-700", dot: "bg-pink-500" },
      { id: "mis-income-project-matrix", label: "Income & Expense Matrix", desc: "Department (Cols) vs Project (Rows) analysis", icon: "🧮", accent: "text-indigo-700", dot: "bg-indigo-500" },
      { id: "mis-cash-flow", label: "Cash Flow Statement", desc: "Cash inflow and outflow tracking", icon: "💸", accent: "text-emerald-600", dot: "bg-emerald-400" },
      { id: "mis-fund-management", label: "Fund Management", desc: "Working capital and fund analysis", icon: "🏦", accent: "text-blue-700", dot: "bg-blue-500" },
    ],
  },
  {
    group: "Receivables & Payables",
    reports: [
      { id: "receivable-payable", label: "Receivable & Payable", desc: "Outstanding dues from customers & suppliers", icon: "💸", accent: "text-indigo-700", dot: "bg-indigo-500" },
      { id: "customers", label: "Customer List", desc: "Customer-wise sales and balance analysis", icon: "🧑‍🤝‍🧑", accent: "text-blue-600", dot: "bg-blue-400" },
      { id: "suppliers", label: "Supplier List", desc: "Supplier-wise purchases and balance analysis", icon: "🏭", accent: "text-teal-700", dot: "bg-teal-500" },
      { id: "customer-ledger", label: "Customer Ledger", desc: "Detailed customer transaction history", icon: "📜", accent: "text-indigo-600", dot: "bg-indigo-400" },
      { id: "supplier-ledger", label: "Supplier Ledger", desc: "Detailed supplier transaction history", icon: "📦", accent: "text-orange-600", dot: "bg-orange-400" },
    ],
  },
  {
    group: "Inventory & Assets",
    reports: [
      { id: "items", label: "Stock of Items", desc: "Inventory stock levels and valuations", icon: "📦", accent: "text-blue-700", dot: "bg-blue-500" },
      { id: "bom-transactions", label: "BOM transactions", desc: "Production consumption/output and kit-sale component issues", icon: "🧩", accent: "text-indigo-700", dot: "bg-indigo-500" },
      { id: "item-history", label: "Item History", desc: "History of purchases and sales across items", icon: "📝", accent: "text-emerald-700", dot: "bg-emerald-500" },
      { id: "fixed-assets", label: "Depreciation Report (Fixed Assets)", desc: "Track asset values and period depreciation", icon: "🏗️", accent: "text-orange-700", dot: "bg-orange-500" },
      { id: "stock-movements", label: "Stock Movement Log", desc: "Detailed inventory audit trail", icon: "🚚", accent: "text-slate-600", dot: "bg-slate-400" },
      { id: "stock-summary", label: "Stock Summary (Detailed)", desc: "Comprehensive stock position report", icon: "📊", accent: "text-violet-600", dot: "bg-violet-400" },
    ],
  },
  {
    group: "Sales & Incentives",
    reports: [
      { id: "mis-target-vs-actual", label: "Target Vs Actual Sales", desc: "Compare actual sales against set targets", icon: "🎯", accent: "text-rose-700", dot: "bg-rose-500" },
      { id: "restaurant-summary", label: "Restaurant Summary", desc: "Performance by order type and tables", icon: "🍽️", accent: "text-orange-700", dot: "bg-orange-500" },
      { id: "sales-incentive", label: "Sales Incentive Report", desc: "Per-person sales totals & incentive calculations", icon: "💰", accent: "text-violet-700", dot: "bg-violet-500" },
      { id: "item-wise-profit", label: "Item Wise Profit", desc: "Profit margins per inventory item", icon: "💎", accent: "text-emerald-700", dot: "bg-emerald-500" },
      { id: "online-orders", label: "Online Store Orders", desc: "eCommerce order performance summary", icon: "🌐", accent: "text-sky-700", dot: "bg-sky-500" },
    ],
  },
  {
    group: "Analytics & Insights",
    reports: [
      { id: "revenue-analytics", label: "Revenue Analytics", desc: "Advanced revenue trends and forecasting", icon: "📈", accent: "text-indigo-700", dot: "bg-indigo-500" },
      { id: "performance-insights", label: "Performance Insights", desc: "Key business performance indicators", icon: "💡", accent: "text-amber-700", dot: "bg-amber-500" },
    ],
  },
];

export default function ReportsIndexPage() {
  const params = useParams();
  const router = useRouter();
  const companyId = params?.companyId as string;

  if (!companyId) return null;

  return (
    <div className="space-y-4">
      {/* Compact Header */}
      <div className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden">
        <div className="h-[3px] w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800/40 text-base">
              📈
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 tracking-tight">Reports</h1>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none mt-0.5">Financial statements & analysis</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-sm transition-all"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9.707 16.707a1 1 0 01-1.414 0l-6-6a1 1 0 010-1.414l6-6a1 1 0 011.414 1.414L5.414 9H17a1 1 0 110 2H5.414l4.293 4.293a1 1 0 010 1.414z" clipRule="evenodd" /></svg>
              Back
            </button>
            <button
              type="button"
              onClick={() => router.push(`/companies/${companyId}`)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-rose-600 text-xs font-semibold shadow-sm transition-all hover:border-rose-200 hover:bg-rose-50"
            >
              <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
              Close
            </button>
          </div>
        </div>
      </div>

      {/* Grouped Report List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {reportGroups.map((group) => (
          <div
            key={group.group}
            className="rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700/60 shadow-sm overflow-hidden"
          >
            {/* Group header */}
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {group.group}
              </span>
            </div>

            {/* Report rows */}
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {group.reports.map((report) => (
                <Link
                  key={report.id}
                  href={`/companies/${companyId}/reports/${report.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group cursor-pointer no-underline"
                >
                  {/* Color dot */}
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${report.dot}`} />

                  {/* Icon */}
                  <span className="text-base w-5 shrink-0 text-center">{report.icon}</span>

                  {/* Label + desc */}
                  <div className="flex-1 min-w-0">
                    <div className={`text-xs font-semibold ${report.accent} dark:text-slate-200 group-hover:underline truncate`}>
                      {report.label}
                    </div>
                    <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate leading-tight">
                      {report.desc}
                    </div>
                  </div>

                  {/* Arrow */}
                  <svg
                    className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 group-hover:text-slate-500 dark:group-hover:text-slate-400 shrink-0 transition-colors"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
