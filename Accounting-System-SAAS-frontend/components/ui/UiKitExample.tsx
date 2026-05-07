"use client";

import * as React from "react";
import { Card } from "./Card";
import { DataTable, DataTableColumn } from "./DataTable";
import { DateRangePicker, DateRangeValue } from "./DateRangePicker";
import { Pagination } from "./Pagination";
import { ExportButtons } from "./ExportButtons";
import { ConfirmDialog } from "./ConfirmDialog";
import { ToastProvider, useToast } from "./Toast";

interface ExampleRow {
  id: number;
  date: string;
  voucherNo: string;
  ledger: string;
  amount: number;
}

const EXAMPLE_DATA: ExampleRow[] = Array.from({ length: 37 }).map((_, idx) => ({
  id: idx + 1,
  date: "2025-01-0" + (((idx % 9) + 1).toString()),
  voucherNo: `VCH-${(idx + 1).toString().padStart(4, "0")}`,
  ledger: idx % 2 === 0 ? "Cash" : "Bank",
  amount: 1000 + idx * 50,
}));

const PAGE_SIZE = 10;

function UiKitExampleInner() {
  const { showToast } = useToast();

  const [dateRange, setDateRange] = React.useState<DateRangeValue>({
    from: null,
    to: null,
  });

  const [page, setPage] = React.useState(1);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [isExportingExcel, setIsExportingExcel] = React.useState(false);
  const [isExportingPdf, setIsExportingPdf] = React.useState(false);

  const totalPages = Math.max(1, Math.ceil(EXAMPLE_DATA.length / PAGE_SIZE));
  const pageData = React.useMemo(
    () =>
      EXAMPLE_DATA.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [page]
  );

  const columns: DataTableColumn<ExampleRow>[] = [
    {
      id: "date",
      header: "Date",
      accessor: (row) => row.date,
    },
    {
      id: "voucherNo",
      header: "Voucher No",
      accessor: (row) => row.voucherNo,
    },
    {
      id: "ledger",
      header: "Ledger",
      accessor: (row) => row.ledger,
    },
    {
      id: "amount",
      header: "Amount",
      accessor: (row) => row.amount.toLocaleString(),
      justify: "right",
    },
  ];

  const handleExportExcel = async () => {
    setConfirmOpen(false);
    setIsExportingExcel(true);
    try {
      // simulate
      await new Promise((resolve) => setTimeout(resolve, 800));
      showToast({
        title: "Export complete",
        description: "Excel export finished.",
        variant: "success",
      });
    } catch {
      showToast({
        title: "Export failed",
        description: "Could not export to Excel.",
        variant: "error",
      });
    } finally {
      setIsExportingExcel(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    try {
      // simulate
      await new Promise((resolve) => setTimeout(resolve, 800));
      showToast({
        title: "Export complete",
        description: "PDF export finished.",
        variant: "success",
      });
    } catch {
      showToast({
        title: "Export failed",
        description: "Could not export to PDF.",
        variant: "error",
      });
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
        <ExportButtons
          onExportExcel={() => setConfirmOpen(true)}
          onExportPdf={handleExportPdf}
          isExportingExcel={isExportingExcel}
          isExportingPdf={isExportingPdf}
        />
      </div>

      <Card>
        <DataTable
          columns={columns}
          data={pageData}
          getRowKey={(row) => row.id}
        />
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title="Export to Excel"
        description="Export the current report to Excel?"
        confirmLabel="Export"
        isConfirming={isExportingExcel}
        onConfirm={handleExportExcel}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export function UiKitExample() {
  return (
    <ToastProvider>
      <UiKitExampleInner />
    </ToastProvider>
  );
}
