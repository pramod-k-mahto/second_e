import { api } from "@/lib/api";

export type ApiError = {
  error?: string;
  message?: string;
  details?: unknown;
};

export type StockTransferStatus = "DRAFT" | "POSTED";

export type StockTransferHeader = {
  id: number;
  companyId: number;
  transferNumber: string;
  transferDate: string;
  fromWarehouseId: number;
  toWarehouseId: number;
  status: StockTransferStatus;
  remarks: string | null;
  createdBy: number;
  createdAt: string;
  postedAt: string | null;
  voucherId?: number | null;
  voucherNumber?: string | null;
};

export type StockTransferLine = {
  id: number;
  lineNo: number;
  itemId: number;
  unit: string;
  quantity: string;
};

export type StockTransferDetail = {
  header: StockTransferHeader;
  lines: StockTransferLine[];
};

export type StockTransferListFilters = {
  fromDate?: string;
  toDate?: string;
  fromWarehouseId?: number;
  toWarehouseId?: number;
  status?: StockTransferStatus;
  page?: number;
  pageSize?: number;
};

export type StockTransferListResponse = {
  data: StockTransferHeader[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export type StockTransferLineInput = {
  itemId: number;
  unit: string;
  quantity: string;
};

export type CreateOrUpdateStockTransferPayload = {
  transferDate: string;
  fromWarehouseId: number;
  toWarehouseId: number;
  remarks?: string | null;
  lines: StockTransferLineInput[];
};

function buildListQuery(filters: StockTransferListFilters = {}) {
  const params: Record<string, string | number> = {};
  if (filters.fromDate) params.fromDate = filters.fromDate;
  if (filters.toDate) params.toDate = filters.toDate;
  if (typeof filters.fromWarehouseId === "number") {
    params.fromWarehouseId = filters.fromWarehouseId;
  }
  if (typeof filters.toWarehouseId === "number") {
    params.toWarehouseId = filters.toWarehouseId;
  }
  if (filters.status) params.status = filters.status;
  if (typeof filters.page === "number") params.page = filters.page;
  if (typeof filters.pageSize === "number") params.pageSize = filters.pageSize;
  return params;
}

export async function listStockTransfers(
  companyId: number,
  filters: StockTransferListFilters = {}
): Promise<StockTransferListResponse> {
  const res = await api.get<StockTransferListResponse>(
    `/inventory/companies/${companyId}/stock-transfers`,
    { params: buildListQuery(filters) }
  );
  return res.data;
}

export async function getStockTransfer(
  companyId: number,
  transferId: number
): Promise<StockTransferDetail> {
  const res = await api.get<StockTransferDetail>(
    `/inventory/companies/${companyId}/stock-transfers/${transferId}`
  );
  return res.data;
}

export async function createStockTransfer(
  companyId: number,
  payload: CreateOrUpdateStockTransferPayload
): Promise<StockTransferDetail> {
  const res = await api.post<StockTransferDetail>(
    `/inventory/companies/${companyId}/stock-transfers`,
    payload
  );
  return res.data;
}

export async function updateStockTransfer(
  companyId: number,
  transferId: number,
  payload: CreateOrUpdateStockTransferPayload
): Promise<StockTransferDetail> {
  const res = await api.put<StockTransferDetail>(
    `/inventory/companies/${companyId}/stock-transfers/${transferId}`,
    payload
  );
  return res.data;
}

export async function postStockTransfer(
  companyId: number,
  transferId: number
): Promise<StockTransferDetail> {
  const res = await api.post<StockTransferDetail>(
    `/inventory/companies/${companyId}/stock-transfers/${transferId}/post`,
    {}
  );
  return res.data;
}

export async function deleteStockTransfer(
  companyId: number,
  transferId: number
): Promise<void> {
  await api.delete(
    `/inventory/companies/${companyId}/stock-transfers/${transferId}`
  );
}
