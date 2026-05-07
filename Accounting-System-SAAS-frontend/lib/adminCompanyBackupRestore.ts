import { api, getApiErrorMessage } from "@/lib/api";

export type RestoreCompanyResponse = { status: string; company_id: number };

function getStatusCode(error: unknown): number | null {
  const status = (error as any)?.response?.status;
  return typeof status === "number" ? status : null;
}

export function getApiErrorWithStatus(error: unknown): string {
  const status = getStatusCode(error);
  const msg = getApiErrorMessage(error);
  return status ? `${status}: ${msg}` : msg;
}

export async function downloadCompanyBackup(
  tenantId: number,
  companyId: number,
  format: "json" | "xml" | "excel" | "csv" = "json",
  tables?: string[],
  isSample: boolean = false
): Promise<void> {
  let apiUrl = `/admin/tenants/${tenantId}/companies/${companyId}/backup?format=${format}`;
  if (isSample) {
    apiUrl += `&is_sample=true`;
  }
  if (tables && tables.length > 0) {
    tables.forEach((t) => {
      apiUrl += `&tables=${encodeURIComponent(t)}`;
    });
  }

  const res = await api.get<Blob>(apiUrl, {
    responseType: "blob",
  });

  const blob = res.data;
  const cd = String((res.headers as any)?.["content-disposition"] || "");
  const match = /filename=\"?([^\";]+)\"?/i.exec(cd);
  const ext = format === "excel" ? "xlsx" : format;
  const filename =
    match?.[1] || `tenant_${tenantId}_company_${companyId}_backup.${ext}`;

  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

export async function restoreCompanyNew(
  tenantId: number,
  file: File
): Promise<RestoreCompanyResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await api.post<RestoreCompanyResponse>(
    `/admin/tenants/${tenantId}/companies/restore-new`,
    form
  );

  return res.data;
}

export async function restoreCompanyOverwrite(
  tenantId: number,
  companyId: number,
  file: File
): Promise<RestoreCompanyResponse> {
  const form = new FormData();
  form.append("file", file);

  const res = await api.post<RestoreCompanyResponse>(
    `/admin/tenants/${tenantId}/companies/${companyId}/restore?confirm_overwrite=true`,
    form
  );

  return res.data;
}
