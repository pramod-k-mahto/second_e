"use client";

import { useState } from "react";
import type { Ledger } from "@/types/ledger";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

interface LedgerTableProps {
  ledgers: Ledger[];
  groups: { id: number; name: string }[];
  search: string;
  onSearchChange: (value: string) => void;
  groupFilter: string;
  onGroupFilterChange: (value: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onEdit: (ledger: Ledger) => void;
  onDelete: (ledger: Ledger) => void;
}

export function LedgerTable({
  ledgers,
  groups,
  search,
  onSearchChange,
  groupFilter,
  onGroupFilterChange,
  page,
  totalPages,
  onPageChange,
  onEdit,
  onDelete,
}: LedgerTableProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-3 py-2 text-xs dark:border-slate-800">
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Search</span>
          <Input
            className="h-8 w-48 px-2 text-xs"
            placeholder="Ledger ID or name..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500 dark:text-slate-400">Group</span>
          <select
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            value={groupFilter}
            onChange={(e) => onGroupFilterChange(e.target.value)}
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.name}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="max-h-[420px] overflow-auto">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50 text-[11px] text-slate-500 shadow-sm dark:bg-slate-900 dark:text-slate-300">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Ledger Name</th>
              <th className="px-3 py-2 text-left font-medium">Group</th>
              <th className="px-3 py-2 text-right font-medium">Opening</th>
              <th className="px-3 py-2 text-left font-medium">Contact</th>
              <th className="px-3 py-2 text-left font-medium">Phone</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white dark:divide-slate-800 dark:bg-slate-950">
            {ledgers.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-3 py-4 text-center text-xs text-slate-500 dark:text-slate-400"
                >
                  No ledgers found.
                </td>
              </tr>
            )}
            {ledgers.map((l) => (
              <tr
                key={l.id}
                className="hover:bg-slate-50 dark:hover:bg-slate-900/80"
              >
                <td className="px-3 py-1.5 text-slate-900 dark:text-slate-100">
                  {l.name}
                </td>
                <td className="px-3 py-1.5 text-slate-600 dark:text-slate-300">
                  {l.groupName}
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums text-slate-800 dark:text-slate-100">
                  {l.openingBalance.toFixed(2)}{" "}
                  <span className="text-[10px] text-slate-500 dark:text-slate-400">
                    {l.openingType}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">
                  {l.contactPerson || "—"}
                </td>
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-200">
                  {l.phone || "—"}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <RowActionsDropdown
                    onEdit={() => onEdit(l)}
                    onDelete={() => onDelete(l)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
        <span>
          Page {page} of {totalPages}
        </span>
        <div className="space-x-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            Prev
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
}

interface RowActionsDropdownProps {
  onEdit: () => void;
  onDelete: () => void;
}

function RowActionsDropdown({ onEdit, onDelete }: RowActionsDropdownProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        onClick={() => setOpen((o) => !o)}
      >
        ⋮
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-32 rounded-md border border-slate-200 bg-white text-[11px] shadow-lg dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            className="block w-full px-2 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            Edit
          </button>
          <button
            type="button"
            className="block w-full px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
