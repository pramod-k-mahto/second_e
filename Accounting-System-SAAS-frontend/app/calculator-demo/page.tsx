"use client";

import React, { useState } from "react";
import { CalculatorModal } from "@/components/CalculatorModal";

export default function CalculatorDemoPage() {
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-900 px-4">
      <div className="max-w-md w-full rounded-xl bg-white dark:bg-slate-950 shadow-lg border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50 mb-2">
          Voucher / Invoice Form (Demo)
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300">
          This is a demo showing how to open the calculator modal from a form or voucher page.
        </p>

        <div className="space-y-2">
          <label className="block text-sm text-slate-700 dark:text-slate-200">Amount</label>
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
              placeholder="Enter amount"
            />
            <button
              type="button"
              className="rounded-md bg-brand-600 hover:bg-brand-700 text-white text-sm px-3 py-2"
              onClick={() => setIsCalculatorOpen(true)}
            >
              Calculator
            </button>
          </div>
        </div>

        <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
          In a real voucher or invoice page, you could later extend the calculator to accept an
          <code className="mx-1 bg-slate-100 dark:bg-slate-800 px-1 rounded text-[10px]">onResult(value: number)</code>
          callback and use the result to fill this amount field.
        </p>
      </div>

      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
      />
    </div>
  );
}
