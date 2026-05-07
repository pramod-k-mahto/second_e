import { api } from "@/lib/api";
import type { MenuTemplateDropdownRead, TenantRead } from "@/types/tenantSelf";

export async function getTenantSelf(): Promise<TenantRead> {
  const res = await api.get<TenantRead>("/tenants/self");
  return res.data;
}

export async function listMenuTemplatesDropdown(params?: {
  include_inactive?: boolean;
}): Promise<MenuTemplateDropdownRead[]> {
  const res = await api.get<MenuTemplateDropdownRead[]>(
    "/admin/menu-templates/dropdown",
    {
      params: {
        include_inactive: params?.include_inactive ?? false,
      },
    }
  );
  return res.data;
}

export async function updateTenantPlanModules(payload: {
  menu_template_id: number | null;
  plan?: string;
}): Promise<TenantRead> {
  const res = await api.put<TenantRead>("/tenants/self/plan", payload);
  return res.data;
}
