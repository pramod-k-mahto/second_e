export type Tenant = {
  id: number;
  name: string;
  plan: string;
  status: string;
  expires_at?: string | null;
  menu_template_id?: number | null;
  menu_template_modules?: string | null;
  menu_template_name?: string | null;
  plan_features?: string | null;
  modules?: string[];
  companies_count?: number | null;
};
