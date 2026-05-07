export interface Resource {
  id: number;
  company_id: number;
  group_id: number;
  title: string;
  description: string | null;
  link_url: string | null;
  file_path: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ResourceGroup {
  id: number;
  company_id: number;
  name: string;
  description: string | null;
  is_active: boolean;
  created_at: string;
  resources: Resource[];
}

export interface ResourceCreate {
  group_id: number;
  title: string;
  description?: string;
  link_url?: string;
  file_path?: string;
  is_active?: boolean;
}

export interface ResourceGroupCreate {
  name: string;
  description?: string;
  is_active?: boolean;
}
