export type ImportSourceType =
  | "excel"
  | "csv"
  | "json"
  | "tally"
  | "woocommerce"
  | "shopify";

export type ImportDataType =
  | "masters_ledgers"
  | "masters_items"
  | "masters_warehouses"
  | "opening_balances"
  | "stock_opening"
  | "sales_invoices"
  | "purchase_invoices"
  | "payments_receipts"
  | "journals"
  | "orders";

export type ImportJobStatus =
  | "DRAFT"
  | "UPLOADED"
  | "MAPPED"
  | "VALIDATING"
  | "VALIDATED"
  | "COMMITTING"
  | "COMPLETED"
  | "FAILED";

export type ImportJobRead = {
  id: string | number;
  status?: ImportJobStatus | string;
  tenant_id?: number | null;
  company_id?: number | null;
  company_name?: string | null;
  source_type?: ImportSourceType | string;
  data_type?: ImportDataType | string;
  created_at?: string | null;
  updated_at?: string | null;
  result?: any;
  summary?: any;
};

export type ImportJobCreatePayload = {
  tenant_id?: number | null;
  company_id: number;
  source_type: ImportSourceType;
  data_type: ImportDataType;
};

export type ImportJobCreateResponse = {
  id: string | number;
};

export type ImportJobColumnsResponse = {
  columns: string[];
};

export type ImportJobUploadResponse = {
  files?: any[];
  detected_files?: any[];
  file_name?: string;
};

export type ImportJobMappingPayload = {
  mapping_name?: string;
  mapping_json: any;
};

export type ImportJobValidateResponse = {
  total_rows?: number;
  valid_rows?: number;
  error_rows?: number;
  summary?: any;
};

export type ImportJobCommitResponse = {
  created_rows?: number;
  skipped_rows?: number;
  updated_rows?: number;
  summary?: any;
  result?: any;
};

export type ImportJobErrorRow = {
  row_no?: number;
  status?: string;
  validation_errors?: any;
  [k: string]: any;
};

export type ImportJobErrorsResponse = {
  errors: ImportJobErrorRow[];
};
