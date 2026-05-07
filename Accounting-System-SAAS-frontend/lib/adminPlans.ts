import { api } from "@/lib/api";

export type Plan = {
  id: number;
  code: string;
  name: string;
  price_monthly: number | null;
  price_yearly: number | null;
  max_companies: number | null;
  max_users: number | null;
  menu_template_id: number | null;
  features: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type PlanCreatePayload = {
  code: string;
  name: string;
  price_monthly?: number | null;
  price_yearly?: number | null;
  max_companies?: number | null;
  max_users?: number | null;
  menu_template_id?: number | null;
  features?: string[]; // optional, default []
  is_active?: boolean; // default true
};

export type PlanUpdatePayload = {
  code?: string;
  name?: string;
  price_monthly?: number | null;
  price_yearly?: number | null;
  max_companies?: number | null;
  max_users?: number | null;
  menu_template_id?: number | null;
  features?: string[];
  is_active?: boolean;
};

export async function getPlans(): Promise<Plan[]> {
  const res = await api.get<Plan[]>("/admin/plans");
  return res.data;
}

export async function createPlan(
  payload: PlanCreatePayload
): Promise<Plan> {
  const res = await api.post<Plan>("/admin/plans", payload);
  return res.data;
}

export async function getPlan(id: number): Promise<Plan> {
  const res = await api.get<Plan>(`/admin/plans/${id}`);
  return res.data;
}

export async function updatePlan(
  id: number,
  payload: PlanUpdatePayload
): Promise<Plan> {
  const res = await api.put<Plan>(`/admin/plans/${id}`, payload);
  return res.data;
}

export async function archivePlan(id: number): Promise<Plan> {
  const res = await api.post<Plan>(`/admin/plans/${id}/archive`);
  return res.data;
}

export async function duplicatePlan(
  id: number,
  overrides?: { code?: string; name?: string }
): Promise<Plan> {
  const res = await api.post<Plan>(
    `/admin/plans/${id}/duplicate`,
    overrides ?? {}
  );
  return res.data;
}

export async function deletePlan(id: number): Promise<void> {
  await api.delete(`/admin/plans/${id}`);
}