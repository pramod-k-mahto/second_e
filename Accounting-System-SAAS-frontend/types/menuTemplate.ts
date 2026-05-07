export type MenuTemplateMenuItem = {
  menu_id: number;
  group_name: string | null;
  group_order: number | null;
  item_order: number | null;
  parent_id: number | null;
  is_sidebar_visible?: boolean;
  label?: string | null;
  code?: string | null;
};

export type MenuTemplate = {
  id: number;
  name: string;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  menu_ids: number[];
  items?: MenuTemplateMenuItem[];
};

export type MenuTemplateDropdownItem = {
  id: number;
  name: string;
  modules: string;
};
