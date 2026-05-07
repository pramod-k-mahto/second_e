import { api } from "@/lib/api";
import type { Menu } from "@/types/menu";
import type { MenuTemplate } from "@/types/menuTemplate";
import type { Tenant } from "@/types/tenant";

type ListMenuTemplatesParams = {
  include_inactive?: boolean;
};

export async function getAdminMenus(params?: { include_inactive?: boolean }): Promise<Menu[]> {
  const res = await api.get<Menu[]>("/admin/menus", {
    params: {
      include_inactive: params?.include_inactive ?? false,
    },
  });
  return res.data;
}

export async function listMenuTemplates(params?: ListMenuTemplatesParams): Promise<MenuTemplate[]> {
  const res = await api.get<MenuTemplate[]>("/admin/menu-templates", {
    params: {
      include_inactive: params?.include_inactive ?? false,
    },
  });
  return res.data;
}

export async function getMenuTemplate(id: number): Promise<MenuTemplate> {
  const res = await api.get<MenuTemplate>(`/admin/menu-templates/${id}`);
  return res.data;
}

export async function createMenuTemplate(payload: {
  name: string;
  description?: string | null;
  is_active?: boolean;
  menu_ids: number[];
}): Promise<MenuTemplate> {
  const res = await api.post<MenuTemplate>("/admin/menu-templates", payload);
  return res.data;
}

export async function updateMenuTemplate(
  id: number,
  payload: {
    name?: string;
    description?: string | null;
    is_active?: boolean;
    menu_ids?: number[];
  }
): Promise<MenuTemplate> {
  const res = await api.put<MenuTemplate>(`/admin/menu-templates/${id}`, payload);
  return res.data;
}

export async function deleteMenuTemplate(id: number): Promise<void> {
  await api.delete(`/admin/menu-templates/${id}`);
}

export async function updateTenantMenuTemplate(
  tenantId: number,
  menu_template_id: number | null
): Promise<Tenant> {
  const res = await api.put<Tenant>(`/admin/tenants/${tenantId}`, {
    menu_template_id,
  });
  return res.data;
}

export async function listCompanyMenus(companyId: number): Promise<Menu[]> {
  const res = await api.get<Menu[]>(`/companies/${companyId}/menus`);
  return res.data;
}
