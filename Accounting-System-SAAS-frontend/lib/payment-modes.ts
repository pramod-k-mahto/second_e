import { api } from "./api";

export type PaymentModeRead = {
  id: number;
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

export type PaymentModeCreate = {
  name: string;
  ledger_group_id: number;
  is_active: boolean;
};

export type PaymentModeUpdate = {
  name?: string | null;
  ledger_group_id?: number | null;
  is_active?: boolean | null;
};

export type PaymentModeListParams = {
  isActive?: boolean;
  search?: string;
};

const basePath = "/payment-modes/companies";

export async function list(
  companyId: number | string,
  params?: PaymentModeListParams
): Promise<PaymentModeRead[]> {
  const query = new URLSearchParams();
  if (params?.isActive !== undefined) {
    query.append("is_active", String(params.isActive));
  }
  if (params?.search) {
    query.append("search", params.search);
  }
  const qs = query.toString();
  const url = `${basePath}/${companyId}/payment-modes${qs ? `?${qs}` : ""}`;
  const res = await api.get<PaymentModeRead[]>(url);
  return res.data;
}

export async function get(
  companyId: number | string,
  id: number | string
): Promise<PaymentModeRead> {
  const url = `${basePath}/${companyId}/payment-modes/${id}`;
  const res = await api.get<PaymentModeRead>(url);
  return res.data;
}

export async function create(
  companyId: number | string,
  payload: PaymentModeCreate
): Promise<PaymentModeRead> {
  const url = `${basePath}/${companyId}/payment-modes`;
  const res = await api.post<PaymentModeRead>(url, payload);
  return res.data;
}

export async function update(
  companyId: number | string,
  id: number | string,
  payload: PaymentModeUpdate
): Promise<PaymentModeRead> {
  const url = `${basePath}/${companyId}/payment-modes/${id}`;
  const res = await api.put<PaymentModeRead>(url, payload);
  return res.data;
}

export async function deactivate(
  companyId: number | string,
  id: number | string
): Promise<void> {
  const url = `${basePath}/${companyId}/payment-modes/${id}`;
  await api.delete(url);
}
