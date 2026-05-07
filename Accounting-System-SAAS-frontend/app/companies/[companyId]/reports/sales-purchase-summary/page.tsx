"use client";

import { useState } from "react";
import SalesSummaryPage from "../../sales/summary/page";
import PurchaseSummaryPage from "../../purchases/summary/page";

export default function SalesPurchaseSummaryCombinedPage() {
    const [activeTab, setActiveTab] = useState<"sales" | "purchase">("sales");

    return (
        <div className="space-y-4">
            <div className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-1 flex gap-1 shadow-sm mx-auto max-w-[400px]">
                <button
                    onClick={() => setActiveTab("sales")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${activeTab === "sales"
                        ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                >
                    Sales Register
                </button>
                <button
                    onClick={() => setActiveTab("purchase")}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${activeTab === "purchase"
                        ? "bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 shadow-sm border border-slate-200 dark:border-slate-700"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                        }`}
                >
                    Purchase Register
                </button>
            </div>

            <div className="mt-4">
                {activeTab === "sales" ? (
                    <SalesSummaryPage />
                ) : (
                    <PurchaseSummaryPage />
                )}
            </div>
        </div>
    );
}
