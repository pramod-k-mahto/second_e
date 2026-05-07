"use client";

import useSWR from "swr";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { api } from "@/lib/api";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/Table";

const fetcher = (url: string) => api.get(url).then((res) => res.data);

type SalesPerson = {
  id: number;
  name: string;
  is_active: boolean;
};

type SalesByPersonRow = {
  sales_person_id: number | null;
  sales_person_name: string | null;
  invoice_count: number;
  total_sales_amount: number;
  outstanding_amount: number;
};

export default function SalesByPersonReportPage() {
  const params = useParams();
  const companyId = params?.companyId as string;

  const { data: currentUser } = useSWR(
    companyId ? "/auth/me" : null,
    fetcher
  );

  const userRoleLower = (currentUser?.role ? String(currentUser.role) : "").toLowerCase();
  const isAdminLike = userRoleLower && userRoleLower !== "user";
  const selfSalesPersonId: string =
    currentUser?.sales_person_id != null
      ? String(currentUser.sales_person_id)
      : currentUser?.employee_id != null
      ? String(currentUser.employee_id)
      : "";

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const monthStart = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return start.toISOString().slice(0, 10);
  }, []);

  const [fromDate, setFromDate] = useState<string>(monthStart);
  const [toDate, setToDate] = useState<string>(today);
  const [salesPersonId, setSalesPersonId] = useState<string>("");

  useEffect(() => {
    if (isAdminLike) return;
    if (!selfSalesPersonId) return;
    setSalesPersonId(selfSalesPersonId);
  }, [isAdminLike, selfSalesPersonId]);

  const { data: salesPersons } = useSWR<SalesPerson[]>(
    companyId ? `/companies/${companyId}/sales-persons?is_active=true` : null,
    fetcher
  );

  const reportUrl = useMemo(() => {
    if (!companyId) return null;
    if (!fromDate || !toDate) return null;

    const qs = new URLSearchParams({
      from_date: fromDate,
      to_date: toDate,
    });

    if (salesPersonId) {
      qs.set("sales_person_id", salesPersonId);
    }

    return `/sales/companies/${companyId}/reports/sales-by-person?${qs.toString()}`;
  }, [companyId, fromDate, toDate, salesPersonId]);

  const { data: rows } = useSWR<SalesByPersonRow[]>(reportUrl, fetcher);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales by Person"
        subtitle="View sales totals grouped by salesperson."
      />

      <Card>
        <div className="grid gap-3 text-xs md:grid-cols-4 md:items-end">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-700">From</label>
            <Input
              type="date"
              className="h-8 px-2 py-1 text-xs"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-700">To</label>
            <Input
              type="date"
              className="h-8 px-2 py-1 text-xs"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-medium text-slate-700">Sales Person</label>
            <Select
              className="h-8 px-2 py-1 text-xs"
              value={salesPersonId}
              onChange={(e) => setSalesPersonId(e.target.value)}
              disabled={!isAdminLike && Boolean(selfSalesPersonId)}
            >
              <option value="">All</option>
              {(salesPersons || []).map((sp) => (
                <option key={sp.id} value={String(sp.id)}>
                  {sp.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="text-[11px] text-slate-500">
            {rows ? `Rows: ${rows.length}` : "Loading..."}
          </div>
        </div>
      </Card>

      <Card>
        {!rows ? (
          <div className="text-sm text-slate-500">Loading report...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500">No data for selected filters.</div>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Sales Person</TH>
                <TH className="text-right">Invoice Count</TH>
                <TH className="text-right">Total Sales</TH>
                <TH className="text-right">Outstanding</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r, idx) => (
                <TR key={`${r.sales_person_id ?? "none"}-${idx}`} className="hover:bg-slate-50">
                  <TD className="text-xs">{r.sales_person_name || "-"}</TD>
                  <TD className="text-right text-xs">{Number(r.invoice_count || 0)}</TD>
                  <TD className="text-right text-xs">{Number(r.total_sales_amount || 0).toFixed(2)}</TD>
                  <TD className="text-right text-xs">{Number(r.outstanding_amount || 0).toFixed(2)}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
    </div>
  );
}
