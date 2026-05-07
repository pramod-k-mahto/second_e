from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict


ImportJobStatus = Literal[
    "DRAFT",
    "UPLOADED",
    "MAPPED",
    "VALIDATING",
    "VALIDATED",
    "COMMITTING",
    "COMPLETED",
    "FAILED",
]


ImportSourceType = Literal[
    "excel",
    "csv",
    "json",
    "tally",
    "woocommerce",
    "shopify",
]


ImportDataType = Literal[
    "masters_ledgers",
    "masters_items",
    "masters_warehouses",
    "opening_balances",
    "stock_opening",
    "sales_invoices",
    "purchase_invoices",
    "payments_receipts",
    "journals",
    "orders",
]


class ImportJobCreate(BaseModel):
    tenant_id: int
    company_id: int
    source_type: ImportSourceType
    data_type: ImportDataType


class ImportJobRead(BaseModel):
    id: int
    tenant_id: int
    company_id: int
    source_type: str
    data_type: str
    status: str
    created_by: int | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportFileRead(BaseModel):
    id: int
    import_job_id: int
    filename: str
    file_type: str
    stored_path: str
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportColumnsResponse(BaseModel):
    columns: list[str]


class ImportMappingUpsertRequest(BaseModel):
    mapping_name: str | None = None
    mapping_json: dict[str, Any]


class ImportMappingRead(BaseModel):
    id: int
    tenant_id: int
    company_id: int
    source_type: str
    data_type: str
    mapping_name: str
    mapping_json: dict[str, Any]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ImportValidateResponse(BaseModel):
    job_id: int
    total_rows: int
    valid_rows: int
    error_rows: int
    status: str


class ImportCommitResponse(BaseModel):
    job_id: int
    status: str
    created_ids: dict[str, Any] | None = None
    summary: dict[str, Any] | None = None


class ImportJobStatusResponse(BaseModel):
    job: ImportJobRead
    files: list[ImportFileRead] = []
    result: dict[str, Any] | None = None


class ImportJobErrorsRow(BaseModel):
    id: int
    row_no: int
    status: str
    validation_errors: dict[str, Any] | None = None

    model_config = ConfigDict(from_attributes=True)


class ImportJobErrorsResponse(BaseModel):
    job_id: int
    errors: list[ImportJobErrorsRow]
