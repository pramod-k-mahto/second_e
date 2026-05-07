"use client";

import { ReactNode, useState } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="flex h-screen overflow-hidden">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div className="flex flex-1 flex-col">
          <Topbar onToggleSidebar={() => setSidebarOpen((v) => !v)} />

          <main className="flex-1 min-w-0 overflow-y-auto px-3 py-4 md:px-6 md:py-6">
            <div className="w-full space-y-6">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
