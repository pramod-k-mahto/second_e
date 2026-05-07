export type BOMItemCreate = {
  component_product_id: number;
  quantity: number;
  unit?: string;
  wastage_percent?: number;
  remarks?: string;
};

export type BOMCreate = {
  product_id: number;
  version?: number;
  bom_code?: string;
  batch_size?: number | null;
  status?: string;
  items: BOMItemCreate[];
  warehouse_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  labor_cost?: number;
  machine_cost?: number;
  electricity_cost?: number;
  packing_cost?: number;
  overhead_cost?: number;
};

export type BOMUpdate = {
  version?: number;
  bom_code?: string;
  batch_size?: number | null;
  status?: string;
  approval_status?: string;
  items?: BOMItemCreate[];
  warehouse_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  labor_cost?: number | null;
  machine_cost?: number | null;
  electricity_cost?: number | null;
  packing_cost?: number | null;
  overhead_cost?: number | null;
};

export type BOMItemRead = {
  id: number;
  component_product_id: number;
  quantity: number;
  unit?: string;
  wastage_percent: number;
  remarks?: string;
};

export type BOMRead = {
  id: number;
  product_id: number;
  version: number;
  bom_code?: string | null;
  batch_size?: number | null;
  status?: string;
  approval_status?: string;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  effective_from?: string | null;
  effective_to?: string | null;
  labor_cost?: number;
  machine_cost?: number;
  electricity_cost?: number;
  packing_cost?: number;
  overhead_cost?: number;
  created_at: string;
  items: BOMItemRead[];
  estimated_cost: number;
};

export type ProductionOrderCreate = {
  product_id: number;
  quantity: number;
  order_no?: string | null;
  order_date?: string | null;
  planned_qty?: number | null;
  status?: string | null;
  bom_id?: number | null;
  warehouse_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  voucher_id?: number | null;
  voucher_number?: string | null;
  bom_as_of?: string | null;
  expand_sub_assemblies?: boolean;
  options?: Record<string, unknown> | null;
  priority?: string | null;
  supervisor_name?: string | null;
  operator?: string | null;
  machine?: string | null;
  expected_completion_date?: string | null;
};

export type ProductionOrderItemRead = {
  id: number;
  product_id: number;
  consumed_qty: number;
};

export type ProductionOrderRead = {
  id: number;
  order_no?: string | null;
  order_date?: string | null;
  product_id: number;
  quantity: number;
  planned_qty?: number | null;
  status: string;
  created_at: string;
  produced_qty: number;
  warehouse_id?: number | null;
  bom_id?: number | null;
  department_id?: number | null;
  project_id?: number | null;
  segment_id?: number | null;
  bom_as_of?: string | null;
  expand_sub_assemblies?: boolean;
  options?: Record<string, unknown> | null;
  priority?: string | null;
  supervisor_name?: string | null;
  operator?: string | null;
  machine?: string | null;
  expected_completion_date?: string | null;
  rejection_qty?: number;
  damaged_qty?: number;
  actual_material_cost?: number;
  standard_material_cost?: number;
  items: ProductionOrderItemRead[];
};

export type ProductionIssueRead = {
  id: number;
  issue_no: string;
  production_order_id: number;
  issue_date: string;
  warehouse_id?: number | null;
  total_value: number;
  created_at: string;
};

export type StockSummaryRow = {
  product_id: number;
  qty_on_hand: number;
};
