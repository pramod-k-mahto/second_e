import type { ImportDataType, ImportSourceType } from "./types";

export const IMPORT_SOURCE_TYPES: { value: ImportSourceType; label: string }[] = [
  { value: "excel", label: "Excel" },
  { value: "csv", label: "CSV" },
  { value: "json", label: "JSON" },
  { value: "tally", label: "Tally (XML)" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "shopify", label: "Shopify" },
];

export const IMPORT_DATA_TYPES: { value: ImportDataType; label: string }[] = [
  { value: "masters_ledgers", label: "Masters: Ledgers" },
  { value: "masters_items", label: "Masters: Items" },
  { value: "masters_warehouses", label: "Masters: Warehouses" },
  { value: "opening_balances", label: "Opening Balances" },
  { value: "stock_opening", label: "Stock Opening" },
  { value: "sales_invoices", label: "Sales Invoices" },
  { value: "purchase_invoices", label: "Purchase Invoices" },
  { value: "payments_receipts", label: "Payments / Receipts" },
  { value: "journals", label: "Journals" },
  { value: "orders", label: "Orders" },
];

export const IMPORT_JOB_STATUS_LABEL: Record<string, string> = {
  DRAFT: "DRAFT",
  UPLOADED: "UPLOADED",
  MAPPED: "MAPPED",
  VALIDATING: "VALIDATING",
  VALIDATED: "VALIDATED",
  COMMITTING: "COMMITTING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
};
