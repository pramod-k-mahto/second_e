"use client";

import * as React from "react";
import { Table, THead, TBody, TR, TH, TD } from "./Table";

export type DataTableColumn<T> = {
  id: string;
  header: React.ReactNode;
  accessor: (row: T) => React.ReactNode;
  justify?: "left" | "right" | "center";
  className?: string;
};

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  getRowKey: (row: T, index: number) => React.Key;
  emptyMessage?: string;
  className?: string;
}

export function DataTable<T>({
  columns,
  data,
  getRowKey,
  emptyMessage = "No records found.",
  className = "",
}: DataTableProps<T>) {
  const hasData = data && data.length > 0;

  return (
    <Table className={className}>
      <THead>
        <TR>
          {columns.map((col) => (
            <TH
              key={col.id}
              className={[
                col.justify === "right" && "text-right",
                col.justify === "center" && "text-center",
                col.className,
              ]
                .filter(Boolean)
                .join(" ")}
            >
              {col.header}
            </TH>
          ))}
        </TR>
      </THead>
      <TBody>
        {!hasData && (
          <TR>
            <TD colSpan={columns.length} className="py-6 text-center text-xs text-slate-500">
              {emptyMessage}
            </TD>
          </TR>
        )}
        {hasData &&
          data.map((row, rowIndex) => (
            <TR key={getRowKey(row, rowIndex)}>
              {columns.map((col) => (
                <TD
                  key={col.id}
                  className={[
                    col.justify === "right" && "text-right",
                    col.justify === "center" && "text-center",
                    col.className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {col.accessor(row)}
                </TD>
              ))}
            </TR>
          ))}
      </TBody>
    </Table>
  );
}
