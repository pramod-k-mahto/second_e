import type { ImportDataType } from "./types";

export const IMPORT_MAPPING_PRESETS: Record<ImportDataType, { label: string; json: any }[]> = {
  masters_ledgers: [],
  masters_items: [],
  masters_warehouses: [],
  opening_balances: [
    {
      label: "opening_balances (CSV template)",
      json: {
        ledger_name: "ledger_name",
        opening_balance: "opening_balance",
        opening_balance_type: "opening_balance_type",
        external_ref: "external_ref",
      },
    },
  ],
  stock_opening: [
    {
      label: "stock_opening",
      json: {
        item_name: "item_name",
        opening_stock: "opening_stock",
        opening_rate: "opening_rate",
        opening_date: "opening_date",
        external_ref: "external_ref",
      },
    },
  ],
  sales_invoices: [
    {
      label: "sales_invoices (flat rows grouped by invoice_no)",
      json: {
        group_key: "invoice_no",
        header: {
          date: "invoice_date",
          customer_name: "customer",
          reference: "invoice_no",
          external_ref: "external_ref",
        },
        line: {
          item_name: "item",
          quantity: "qty",
          rate: "rate",
          discount: "discount",
          tax_rate: "tax_rate",
          warehouse_id: "warehouse_id",
        },
      },
    },
  ],
  purchase_invoices: [],
  payments_receipts: [],
  journals: [],
  orders: [
    {
      label: "orders (woocommerce/shopify) grouped by order_id",
      json: {
        group_key: "order_id",
        header: {
          date: "order_date",
          customer_name: "customer",
          reference: "order_id",
          external_ref: "external_ref",
        },
        line: {
          item_name: "item",
          quantity: "qty",
          rate: "rate",
          discount: "discount",
          tax_rate: "tax_rate",
        },
      },
    },
  ],
};

export const IMPORT_ORDER_GROUPS: { label: string; types: ImportDataType[] }[] = [
  {
    label: "Masters",
    types: ["masters_ledgers", "masters_items", "masters_warehouses"],
  },
  {
    label: "Opening",
    types: ["opening_balances", "stock_opening"],
  },
  {
    label: "Transactions",
    types: ["sales_invoices", "purchase_invoices", "payments_receipts", "journals"],
  },
  {
    label: "Orders",
    types: ["orders"],
  },
];

export function importOrderRank(dt: ImportDataType): number {
  const idx = IMPORT_ORDER_GROUPS.findIndex((g) => g.types.includes(dt));
  return idx === -1 ? 999 : idx;
}
