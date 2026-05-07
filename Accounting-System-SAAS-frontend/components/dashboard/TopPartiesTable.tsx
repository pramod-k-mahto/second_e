import { memo } from "react";
import { TableCard } from "./TableCard";

interface PartyRow {
  name: string;
  type: "Customer" | "Supplier";
  receivable: string;
  payable: string;
}

interface TopPartiesTableProps {
  rows: PartyRow[];
}

export const TopPartiesTable = memo(function TopPartiesTable({ rows }: TopPartiesTableProps) {
  const formatAmount = (value: string) => {
    if (value === '—') return value;
    const num = Number(value.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(num)) return value;
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <TableCard
      title="Top Customers & Suppliers"
      subtitle="By outstanding balance"
    >
      <thead className="bg-slate-50">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-slate-500">
            Party
          </th>
          <th className="px-3 py-2 text-left font-medium text-slate-500">
            Type
          </th>
          <th className="px-3 py-2 text-right font-medium text-slate-500">
            Receivable
          </th>
          <th className="px-3 py-2 text-right font-medium text-slate-500">
            Payable
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {rows.length === 0 && (
          <tr>
            <td
              className="px-3 py-3 text-center text-xs text-slate-500"
              colSpan={4}
            >
              No customers or suppliers in selected range.
            </td>
          </tr>
        )}
        {rows.map((p) => (
          <tr key={`${p.type}-${p.name}`} className="hover:bg-slate-50">
            <td className="px-3 py-2 font-medium text-slate-900">{p.name}</td>
            <td className="px-3 py-2 text-slate-600">{p.type}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">
              {formatAmount(p.receivable)}
            </td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">
              {formatAmount(p.payable)}
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
});
