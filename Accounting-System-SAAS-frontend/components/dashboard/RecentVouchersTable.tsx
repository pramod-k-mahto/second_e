import { memo } from "react";
import { TableCard } from "./TableCard";
import { safeADToBS } from "@/lib/bsad";

interface VoucherRow {
  no: string;
  date: string;
  type: string;
  party: string;
  amount: string;
}

interface RecentVouchersTableProps {
  rows: VoucherRow[];
  calendarMode?: 'AD' | 'BS';
}

export const RecentVouchersTable = memo(function RecentVouchersTable({ rows, calendarMode }: RecentVouchersTableProps) {
  const formatDate = (date: string) => {
    if (!date) return '';
    if (calendarMode === 'BS') {
      return safeADToBS(date) || date;
    }
    const [y, m, d] = date.split('-').map((v) => Number(v));
    if (!y || !m || !d) return date;
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString(undefined, {
      day: '2-digit',
      month: 'short',
    });
  };

  const formatAmount = (value: string) => {
    const num = Number(value.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(num)) return value;
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 2,
    }).format(num);
  };

  return (
    <TableCard title="Recent Vouchers" subtitle="Last activity in selected range">
      <thead className="bg-slate-50">
        <tr>
          <th className="px-3 py-2 text-left font-medium text-slate-500">No.</th>
          <th className="px-3 py-2 text-left font-medium text-slate-500">Date</th>
          <th className="px-3 py-2 text-left font-medium text-slate-500">Type</th>
          <th className="px-3 py-2 text-left font-medium text-slate-500">Party</th>
          <th className="px-3 py-2 text-right font-medium text-slate-500">Amount</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100 bg-white">
        {rows.length === 0 && (
          <tr>
            <td
              className="px-3 py-3 text-center text-xs text-slate-500"
              colSpan={5}
            >
              No vouchers in selected range.
            </td>
          </tr>
        )}
        {rows.map((v) => (
          <tr key={`${v.type}-${v.no}`} className="hover:bg-slate-50">
            <td className="px-3 py-2 font-medium text-slate-900">{v.no}</td>
            <td className="px-3 py-2 text-slate-600">{formatDate(v.date)}</td>
            <td className="px-3 py-2 text-slate-600">{v.type}</td>
            <td className="px-3 py-2 text-slate-600">{v.party}</td>
            <td className="px-3 py-2 text-right tabular-nums text-slate-900">
              {formatAmount(v.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </TableCard>
  );
});
