"use client";

import useSWR from "swr";
import { useParams } from "next/navigation";
import { useMemo } from "react";
import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { getStockValuation, type StockValuationResponse } from "@/lib/api/inventory";

const fetcher = async (url: string) => {
  try {
    const res = await api.get(url);
    return res.data;
  } catch (err: any) {
    const status = err?.response?.status;
    const detail = err?.response?.data?.detail;
    if (status === 501 && typeof detail === "string" && detail.includes("FIFO inventory valuation is not implemented yet")) {
      const e = new Error(detail);
      (e as any).code = "FIFO_NOT_IMPLEMENTED";
      throw e;
    }
    throw err;
  }
};

type Item = {
  id: number;
  name: string;
  code?: string | null;
};

export default function StockSummaryPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const asOnDate = new Date().toISOString().slice(0, 10);

  const { data: items } = useSWR<Item[]>(
    companyId ? `/inventory/companies/${companyId}/items` : null,
    fetcher
  );

  const {
    data: valuation,
    isLoading,
    error: valuationError,
  } = useSWR<StockValuationResponse>(
    companyId ? ["stock-valuation", companyId, asOnDate] : null,
    async () => {
      if (!companyId) throw new Error("Missing companyId");
      return await getStockValuation(Number(companyId), asOnDate);
    }
  );

  const fifoNotImplemented = (valuationError as any)?.code === "FIFO_NOT_IMPLEMENTED";

  const itemNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const it of items ?? []) {
      map.set(Number(it.id), String(it.name || `#${it.id}`));
    }
    return map;
  }, [items]);

  const visibleRows = (valuation?.rows || []).filter((row) => {
    const q = Number(row.qty_on_hand ?? 0);
    return Number.isFinite(q) && q !== 0;
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Summary"
        subtitle="View current stock on hand and valuation."
      />

      <Card>
        <div className="flex items-center justify-between gap-3 mb-3 text-sm">
          <div className="text-xs text-slate-600">
            Valuation Method:{" "}
            <span className="font-medium">
              {valuation?.valuation_method ?? "AVERAGE"}
            </span>
          </div>

          <div className="text-xs text-slate-600">
            Stock Value:{" "}
            <span className="font-medium">
              {Number(valuation?.total_value ?? 0).toFixed(2)}
            </span>
          </div>
        </div>

        {fifoNotImplemented ? (
          <div className="text-xs text-slate-600 space-y-2">
            <div>
              FIFO valuation not available yet. Switch to AVERAGE in Company Settings.
            </div>
          </div>
        ) : isLoading ? (
          <div className="text-xs text-slate-500">Loading stock summary...</div>
        ) : visibleRows.length === 0 ? (
          <div className="text-xs text-slate-500">No stock on hand.</div>
        ) : (
          <div className="border rounded mt-2">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-slate-50">
                  <th className="text-left py-2 px-2">Item</th>
                  <th className="text-right py-2 px-2">Quantity On Hand</th>
                  <th className="text-right py-2 px-2">Value</th>
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row) => (
                  <tr key={row.product_id} className="border-b last:border-none">
                    <td className="py-1 px-2 text-slate-700">
                      {itemNameById.get(Number(row.product_id)) || `#${row.product_id}`}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {Number(row.qty_on_hand ?? 0)}
                    </td>
                    <td className="py-1 px-2 text-right">
                      {Number(row.value ?? 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
