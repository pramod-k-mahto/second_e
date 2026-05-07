import type {
  PurchaseBillCreateInput,
  SalesInvoiceCreateInput,
  PurchaseReturnCreate,
  SalesReturnCreate,
} from "./api";

export type PurchaseBillMode = "create" | "update";

export type PurchaseBillFormPayload = PurchaseBillCreateInput & {
  id?: number | string | null;
  voucher_id?: number | string | null;
  payment_mode_id?: number | string | null;
  original_date?: string | null;
  due_date?: string | null;
  bank_remark?: string | null;
  payment_ledger_id?: number | string | null;
};

export function buildPurchaseBillPayload(
  formState: PurchaseBillFormPayload,
  mode: PurchaseBillMode
): any {
  const payload: any = {
    ...(formState as any),
  };
  const original_date = (formState as any)?.original_date;

  if (!payload.lines) {
    payload.lines = [];
  }

  payload.lines = payload.lines.map((line: any) => {
    const restLine: any = { ...(line || {}) };
    delete restLine.id;
    delete restLine.voucher_id;
    const taxRate =
      restLine.tax_rate === undefined || restLine.tax_rate === null || restLine.tax_rate === ""
        ? 0
        : restLine.tax_rate;
    return {
      ...restLine,
      tax_rate: taxRate,
    };
  });

  if (payload.payment_mode_id === undefined || payload.payment_mode_id === "") {
    payload.payment_mode_id = null;
  } else {
    payload.payment_mode_id = Number(payload.payment_mode_id);
  }

  if (mode === "create") {
    if (!payload.date) {
      throw new Error("date is required for purchase invoice creation");
    }
  }

  delete payload.id;
  delete payload.voucher_id;
  delete payload.original_date;

  return payload;
}

export type SalesInvoiceMode = "create" | "update";

export type SalesInvoiceFormPayload = SalesInvoiceCreateInput & {
  id?: number | string | null;
  voucher_id?: number | string | null;
  payment_mode_id?: number | string | null;
  original_date?: string | null;
  bank_remark?: string | null;
  payment_ledger_id?: number | string | null;
};

export function buildSalesInvoicePayload(
  formState: SalesInvoiceFormPayload,
  mode: SalesInvoiceMode
): any {
  const payload: any = {
    ...(formState as any),
  };

  if (!payload.lines) {
    payload.lines = [];
  }

  payload.lines = payload.lines.map((line: any) => {
    const restLine: any = { ...(line || {}) };
    delete restLine.id;
    delete restLine.voucher_id;
    const taxRate =
      restLine.tax_rate === undefined || restLine.tax_rate === null || restLine.tax_rate === ""
        ? 0
        : restLine.tax_rate;
    return {
      ...restLine,
      tax_rate: taxRate,
      duty_tax_id: restLine.duty_tax_id ? Number(restLine.duty_tax_id) : null,
    };
  });

  if (payload.payment_mode_id === undefined || payload.payment_mode_id === "") {
    payload.payment_mode_id = null;
  } else {
    payload.payment_mode_id = Number(payload.payment_mode_id);
  }

  if (payload.sales_person_id === undefined || payload.sales_person_id === "") {
    payload.sales_person_id = null;
  } else if (payload.sales_person_id !== null) {
    payload.sales_person_id = Number(payload.sales_person_id);
  }

  if (payload.due_date === undefined || payload.due_date === "") {
    payload.due_date = null;
  }

  if (mode === "create") {
    if (!payload.date) {
      throw new Error("date is required for sales invoice creation");
    }
  }

  delete payload.id;
  delete payload.voucher_id;
  delete payload.original_date;

  return payload;
}

export type ReturnMode = "create" | "update";

export type PurchaseReturnFormPayload = PurchaseReturnCreate & {
  id?: number | string | null;
  voucher_id?: number | string | null;
  payment_mode_id?: number | string | null;
};

export function buildPurchaseReturnPayload(
  formState: PurchaseReturnFormPayload
): any {
  const payload: any = {
    ...(formState as any),
    purchase_return_ledger_id: null,
    input_tax_return_ledger_id: null,
  };

  if (!payload.lines) {
    payload.lines = [];
  }

  payload.lines = payload.lines.map((line: any) => {
    const restLine: any = { ...(line || {}) };
    delete restLine.id;
    delete restLine.voucher_id;
    const taxRate =
      restLine.tax_rate === undefined || restLine.tax_rate === null || restLine.tax_rate === ""
        ? 0
        : restLine.tax_rate;
    return {
      ...restLine,
      tax_rate: taxRate,
    };
  });

  if (payload.payment_mode_id === undefined || payload.payment_mode_id === "") {
    payload.payment_mode_id = null;
  } else {
    payload.payment_mode_id = Number(payload.payment_mode_id);
  }

  delete payload.id;
  delete payload.voucher_id;

  return payload;
}

export type SalesReturnFormPayload = SalesReturnCreate & {
  id?: number | string | null;
  voucher_id?: number | string | null;
  payment_mode_id?: number | string | null;
};

export function buildSalesReturnPayload(
  formState: SalesReturnFormPayload
): any {
  const payload: any = {
    ...(formState as any),
    sales_return_ledger_id: null,
    output_tax_return_ledger_id: null,
  };

  if (!payload.lines) {
    payload.lines = [];
  }

  payload.lines = payload.lines.map((line: any) => {
    const restLine: any = { ...(line || {}) };
    delete restLine.id;
    delete restLine.voucher_id;
    const taxRate =
      restLine.tax_rate === undefined || restLine.tax_rate === null || restLine.tax_rate === ""
        ? 0
        : restLine.tax_rate;
    return {
      ...restLine,
      tax_rate: taxRate,
    };
  });

  if (payload.payment_mode_id === undefined || payload.payment_mode_id === "") {
    payload.payment_mode_id = null;
  } else {
    payload.payment_mode_id = Number(payload.payment_mode_id);
  }

  delete payload.id;
  delete payload.voucher_id;

  return payload;
}
