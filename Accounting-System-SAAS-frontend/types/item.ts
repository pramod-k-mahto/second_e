// Item DTOs

export type ItemBase = {
  code?: string | null;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  category?: string | null;
  sub_category?: string | null;
  unit?: string | null;
  default_sales_rate?: number | null;
  default_purchase_rate?: number | null;
  default_tax_rate?: number | null;
  mrp?: number | null;
  wholesale_price?: number | null;
  opening_stock?: number | null;
  opening_rate?: number | null;
  opening_date?: string | null;
  reorder_level?: number | null;
  min_stock_warning?: number | null;
  location?: string | null;
  brand_name?: string | null;
  manufacturer?: string | null;
  model_number?: string | null;
  description?: string | null;
  specifications?: string | null;
  image_url?: string | null;
  gallery_images?: string | null;
  tax_type?: string | null;
  hsn_sac_code?: string | null;
  income_ledger_id?: number | null;
  expense_ledger_id?: number | null;
  output_tax_ledger_id?: number | null;
  input_tax_ledger_id?: number | null;
  allow_negative_stock?: boolean;
  sell_as_kit?: boolean;
  costing_method?: string | null;
  is_active?: boolean;
  show_in_online_store?: boolean;
  is_featured?: boolean;
  is_returnable?: boolean;
  has_variants?: boolean;
  variant_attributes?: string | null;
  seo_title?: string | null;
  seo_keywords?: string | null;
  slug?: string | null;
};

export type ItemCreate = ItemBase;

export type ItemUpdate = Partial<ItemBase>;

export type ItemRead = ItemBase & {
  id: number;
  created_by_id?: number | null;
  updated_by_id?: number | null;
  created_at: string;
  updated_at: string;
};

// Item units

export type ItemUnitRead = {
  id: number;
  unit_code: string;
  is_base: boolean;
  factor_to_base: number;
  decimals: number | null;
  sort_order: number | null;
};

export type ItemUnitCreate = {
  unit_code: string;
  is_base?: boolean;
  factor_to_base?: number;
  decimals?: number | null;
  sort_order?: number | null;
};

// Invoice line payload (to backend)

export type SalesInvoiceLineRequest = {
  item_id: number;
  quantity: number; // base unit
  rate: number; // per base unit
  discount: number;
  tax_rate: number;
};
