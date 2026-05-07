"use client";

import { useMenuPermissions } from "@/components/MenuPermissionsContext";

interface TopbarProps {
  onToggleSidebar: () => void;
}

export function Topbar({ onToggleSidebar }: TopbarProps) {
  const { isMenuAllowed } = useMenuPermissions();

  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-3 shadow-sm md:px-6">
      <div className="flex items-center gap-2">
        <button
          onClick={onToggleSidebar}
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 md:hidden"
        >
          ☰
        </button>
        <div>
          <div className="text-xs uppercase tracking-wide text-slate-400">
            Overview
          </div>
          <div className="text-sm font-semibold text-slate-900">
            Accounting Dashboard
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Quick Utilities */}
        <div className="flex items-center gap-2 mr-2 border-r border-slate-100 pr-4">
          {isMenuAllowed('header.calculator') && (
            <button className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-50 text-lg" title="Calculator">
              🧮
            </button>
          )}
          {isMenuAllowed('header.theme_toggle') && (
            <button className="h-8 w-8 flex items-center justify-center rounded hover:bg-slate-50 text-lg" title="Toggle Theme">
              🌗
            </button>
          )}
        </div>

        {isMenuAllowed('header.pending_orders') && (
          <button className="relative hidden items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 sm:flex">
            <span>Orders</span>
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-amber-500 text-[10px] text-white">3</span>
          </button>
        )}

        {isMenuAllowed('header.notifications') && (
          <button className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100">
            🔔
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
        )}

        <div className="flex items-center gap-2 ml-2">
          <div className="hidden text-right text-xs md:block">
            <div className="font-medium text-slate-900">John Doe</div>
            <div className="text-slate-500">Finance Manager</div>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold uppercase text-white">
            JD
          </div>
        </div>
      </div>
    </header>
  );
}
