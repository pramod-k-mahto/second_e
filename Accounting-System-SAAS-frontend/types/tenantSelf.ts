export type TenantRead = {
  id: number;
  name: string;
  status: string;
  plan: string;
  plan_name?: string | null;
  expires_at?: string | null;
  menu_template_id?: number | null;
  menu_template_name?: string | null;
  menu_template_modules?: string | null;
  plan_features?: string | null;
  modules?: string[] | null;
};

export type MenuTemplateDropdownRead = {
  id: number;
  name: string;
  modules: string; // comma-separated
};
