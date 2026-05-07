import { api } from "@/lib/api";

export interface StockSummaryBatchRequestItem {
  itemId: number;
  warehouseId: number;
}

export type StockSummaryRow = {
  item_id: number;
  item_name: string;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  opening_stock: number;
  movement_in: number;
  movement_out: number;
  quantity_on_hand: number;
  closing_value: number;
  purchase_qty: number;
  sales_qty: number;
};

export type StockValuationMethod = "FIFO" | "AVERAGE";

export type StockValuationRow = {
  product_id: number;
  qty_on_hand: number;
  value: number;
};

export type StockValuationResponse = {
  valuation_method: StockValuationMethod;
  as_on_date: string;
  total_value: number;
  rows: StockValuationRow[];
};



export interface StockSummaryBatchResult {
  itemId: number;
  warehouseId: number;
  quantityOnHand: string;
}

export interface StockSummaryBatchResponse {
  results: StockSummaryBatchResult[];
}

export type EffectiveRateResponse = {
  effective_rate: number | null;
};

export async function getBatchStockSummary(
  companyId: number,
  requests: StockSummaryBatchRequestItem[],
): Promise<StockSummaryBatchResult[]> {
  const { data } = await api.post<StockSummaryBatchResponse>(
    `/inventory/companies/${companyId}/stock-summary/batch`,
    { requests }
  );
  return data.results;
}

export async function getStockSummary(
  companyId: number,
  asOnDate: string,
  warehouseId?: number
): Promise<StockSummaryRow[]> {
  let url = `/inventory/companies/${companyId}/stock-summary?as_on_date=${encodeURIComponent(asOnDate)}`;
  if (warehouseId) {
    url += `&warehouse_id=${warehouseId}`;
  }
  const { data } = await api.get<StockSummaryRow[]>(url);
  return Array.isArray(data) ? data : [];
}

export type StockPeriodReportRow = {
  item_id: number;
  item_name: string;
  warehouse_id?: number | null;
  warehouse_name?: string | null;

  initial_qty: number;
  initial_rate: number;
  initial_value: number;

  inwards_qty: number;
  inwards_rate: number;
  inwards_value: number;

  outwards_qty: number;
  outwards_rate: number;
  outwards_value: number;

  balance_qty: number;
  balance_rate: number;
  balance_value: number;
};

export async function getStockPeriodReport(
  companyId: number,
  fromDate: string,
  toDate: string,
  warehouseId?: number
): Promise<StockPeriodReportRow[]> {
  let url = `/inventory/companies/${companyId}/stock-report-period?from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;
  if (warehouseId) {
    url += `&warehouse_id=${warehouseId}`;
  }
  const { data } = await api.get<StockPeriodReportRow[]>(url);
  return Array.isArray(data) ? data : [];
}


export type StockLedgerEntry = {
  id: number;
  posted_at: string;
  source_type: string;
  source_id: number;
  voucher_number?: string | null;
  warehouse_name?: string | null;
  qty_in: number;
  qty_out: number;
  balance: number;
  unit_cost?: number | null;
  item_value?: number | null;
};

export type StockLedgerResponse = {
  item_id: number;
  item_name: string;
  warehouse_id?: number | null;
  from_date?: string | null;
  to_date?: string | null;
  opening_qty: number;
  opening_value: number;
  entries: StockLedgerEntry[];
  closing_qty: number;
  closing_value: number;
};

export async function getStockLedger(
  companyId: number,
  itemId: number,
  params?: {
    warehouseId?: number;
    fromDate?: string;
    toDate?: string;
  }
): Promise<StockLedgerResponse> {
  let url = `/inventory/companies/${companyId}/stock/ledger?item_id=${itemId}`;
  if (params?.warehouseId) url += `&warehouse_id=${params.warehouseId}`;
  if (params?.fromDate) url += `&from_date=${params.fromDate}`;
  if (params?.toDate) url += `&to_date=${params.toDate}`;

  const { data } = await api.get<StockLedgerResponse>(url);
  return data;
}


export async function getStockValuation(
  companyId: number,
  asOnDate: string
): Promise<StockValuationResponse> {
  const { data } = await api.get<StockValuationResponse>(
    `/inventory/companies/${companyId}/stock/valuation?as_on_date=${encodeURIComponent(asOnDate)}`
  );
  return data;
}



export async function getEffectiveItemRate(
  companyId: number,
  itemId: number,
  warehouseId: number,
  dateParam: string
): Promise<number | null> {
  const { data } = await api.get<EffectiveRateResponse>(
    `/inventory/companies/${companyId}/items/${itemId}/effective-rate?warehouseId=${warehouseId}&date_param=${encodeURIComponent(
      dateParam
    )}`
  );
  return data?.effective_rate ?? null;
}
