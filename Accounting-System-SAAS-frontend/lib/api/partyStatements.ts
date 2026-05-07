import useSWR from "swr";
import { isAxiosError } from "axios";
import { api } from "@/lib/api";
import type { PartyStatementReport } from "@/components/ledger/PartyStatementTable";

export type CustomerLedgerMappingRow = {
  customer_id: number;
  customer_name: string;
  ledger_id?: number | null;
};

export type SupplierLedgerMappingRow = {
  supplier_id: number;
  supplier_name: string;
  ledger_id?: number | null;
};

type StatementFetchMode = "strict" | "soft";

const jsonFetcher = <T,>(url: string) => api.get(url).then((res) => res.data as T);

async function customerStatementFetcher([url, mode]: readonly [string, StatementFetchMode]): Promise<
  PartyStatementReport | null
> {
  try {
    const res = await api.get(url);
    return res.data as PartyStatementReport;
  } catch (e) {
    if (mode === "soft" && isAxiosError(e)) {
      const s = e.response?.status;
      if (s === 403 || s === 404) return null;
    }
    throw e;
  }
}

async function supplierStatementFetcher([url, mode]: readonly [string, StatementFetchMode]): Promise<
  PartyStatementReport | null
> {
  try {
    const res = await api.get(url);
    return res.data as PartyStatementReport;
  } catch (e) {
    if (mode === "soft" && isAxiosError(e)) {
      const s = e.response?.status;
      if (s === 403 || s === 404) return null;
    }
    throw e;
  }
}

export async function fetchCustomerStatement(
  companyId: string | number,
  customerId: string | number,
  fromDate: string,
  toDate: string,
) {
  const url = `/companies/${companyId}/reports/customer-statement?customer_id=${encodeURIComponent(
    String(customerId),
  )}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;
  const res = await api.get(url);
  return res.data as PartyStatementReport;
}

export async function fetchSupplierStatement(
  companyId: string | number,
  supplierId: string | number,
  fromDate: string,
  toDate: string,
) {
  const url = `/companies/${companyId}/reports/supplier-statement?supplier_id=${encodeURIComponent(
    String(supplierId),
  )}&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;
  const res = await api.get(url);
  return res.data as PartyStatementReport;
}

export async function fetchCustomerLedgerMapping(companyId: string | number) {
  const res = await api.get(`/companies/${companyId}/reports/customer-ledger-mapping?has_ledger=true`);
  return res.data as CustomerLedgerMappingRow[];
}

export async function fetchSupplierLedgerMapping(companyId: string | number) {
  const res = await api.get(`/companies/${companyId}/reports/supplier-ledger-mapping?has_ledger=true`);
  return res.data as SupplierLedgerMappingRow[];
}

export type PartyStatementHookOptions = {
  /** When true, 403/404 do not throw — balance badges hide instead of flooding the console. */
  suppressForbidden?: boolean;
};

export const useCustomerStatement = (
  companyId: string | number | undefined,
  customerId: string | number | undefined,
  fromDate: string,
  toDate: string,
  opts?: PartyStatementHookOptions,
) => {
  const shouldFetch = companyId && customerId && fromDate && toDate;
  const mode: StatementFetchMode = opts?.suppressForbidden ? "soft" : "strict";
  const swrKey: readonly [string, StatementFetchMode] | null = shouldFetch
    ? ([
        `/companies/${companyId}/reports/customer-statement?customer_id=${customerId}&from_date=${fromDate}&to_date=${toDate}`,
        mode,
      ] as const)
    : null;

  const { data, error, isLoading } = useSWR(swrKey, swrKey ? customerStatementFetcher : null);

  return {
    report: data === null ? undefined : data,
    isLoading,
    isError: !!error,
    error,
  };
};

export const useSupplierStatement = (
  companyId: string | number | undefined,
  supplierId: string | number | undefined,
  fromDate: string,
  toDate: string,
  opts?: PartyStatementHookOptions,
) => {
  const shouldFetch = companyId && supplierId && fromDate && toDate;
  const mode: StatementFetchMode = opts?.suppressForbidden ? "soft" : "strict";
  const swrKey: readonly [string, StatementFetchMode] | null = shouldFetch
    ? ([
        `/companies/${companyId}/reports/supplier-statement?supplier_id=${supplierId}&from_date=${fromDate}&to_date=${toDate}`,
        mode,
      ] as const)
    : null;

  const { data, error, isLoading } = useSWR(swrKey, swrKey ? supplierStatementFetcher : null);

  return {
    report: data === null ? undefined : data,
    isLoading,
    isError: !!error,
    error,
  };
};

export const useCustomerLedgerMapping = (companyId: string | number | undefined) => {
  const { data, error, isLoading } = useSWR<CustomerLedgerMappingRow[]>(
    companyId ? `/companies/${companyId}/reports/customer-ledger-mapping?has_ledger=true` : null,
    jsonFetcher,
  );

  return {
    data,
    isLoading,
    isError: !!error,
    error,
  };
};

export const useSupplierLedgerMapping = (companyId: string | number | undefined) => {
  const { data, error, isLoading } = useSWR<SupplierLedgerMappingRow[]>(
    companyId ? `/companies/${companyId}/reports/supplier-ledger-mapping?has_ledger=true` : null,
    jsonFetcher,
  );

  return {
    data,
    isLoading,
    isError: !!error,
    error,
  };
};
