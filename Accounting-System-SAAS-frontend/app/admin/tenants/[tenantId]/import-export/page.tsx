"use client";

import Link from "next/link";
import { useParams } from "next/navigation";

export default function TenantImportExportPage() {
  const params = useParams();
  const tenantId = params?.tenantId as string | undefined;

  if (!tenantId) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2">Import and Export</h1>
        <p className="text-sm text-slate-600">Tenant tools for importing and exporting ledgers and other data.</p>
        <div className="text-xs text-slate-500 mt-1">
          Tenant ID: <span className="font-mono">{tenantId}</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="bg-white shadow rounded p-4 space-y-2">
          <div className="text-sm font-semibold">Ledger Import / Export</div>
          <div className="text-xs text-slate-600">Import ledgers and export ledger data for backup or migration.</div>
          <div className="text-xs text-slate-500">Coming soon.</div>
        </div>

        <div className="bg-white shadow rounded p-4 space-y-2">
          <div className="text-sm font-semibold">Other Data Import / Export</div>
          <div className="text-xs text-slate-600">Import and export other company data (masters, transactions, etc.).</div>
          <div className="text-xs text-slate-500">Coming soon.</div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <Link
          href="/admin"
          className="px-3 py-2 rounded border border-slate-300 text-slate-700 bg-white hover:bg-slate-50 text-xs"
        >
          Back to Admin Home
        </Link>
      </div>
    </div>
  );
}
