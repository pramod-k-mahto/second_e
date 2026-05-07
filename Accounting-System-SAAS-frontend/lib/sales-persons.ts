import { api } from "@/lib/api";

export type SalesPersonRead = {
  id: number;
  company_id: number;
  name: string;
  phone: string | null;
  email: string | null;
  commission_rate: number | null;
  notes: string | null;
  is_active: boolean;
};

export type SalesPersonCreate = {
  name: string;
  phone?: string | null;
  email?: string | null;
  commission_rate?: number | null;
  notes?: string | null;
  is_active?: boolean;
};

export type SalesPersonUpdate = Partial<SalesPersonCreate>;

const base = (companyId: number | string) =>
  `/companies/${companyId}/sales-persons`;

export async function list(
  companyId: number | string,
  params?: { isActive?: boolean; search?: string }
): Promise<SalesPersonRead[]> {
  const p: Record<string, string> = {};
  if (params?.isActive !== undefined) p.is_active = String(params.isActive);
  if (params?.search) p.search = params.search;
  const res = await api.get(base(companyId), { params: p });
  return res.data;
}

export async function create(
  companyId: number | string,
  payload: SalesPersonCreate
): Promise<SalesPersonRead> {
  const res = await api.post(base(companyId), payload);
  return res.data;
}

export async function update(
  companyId: number | string,
  id: number,
  payload: SalesPersonUpdate
): Promise<SalesPersonRead> {
  const res = await api.put(`${base(companyId)}/${id}`, payload);
  return res.data;
}

export async function deactivate(
  companyId: number | string,
  id: number
): Promise<void> {
  await api.delete(`${base(companyId)}/${id}`);
}
