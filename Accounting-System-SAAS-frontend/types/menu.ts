export type Menu = {
  id: number;
  code: string;
  label: string;
  module?: string | null;
  parent_id?: number | null;
  sort_order?: number | null;
  is_active: boolean;
  is_sidebar_visible?: boolean;
};
