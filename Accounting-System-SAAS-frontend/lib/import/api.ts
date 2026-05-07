import { api } from "@/lib/api";
import type {
  ImportJobColumnsResponse,
  ImportJobCommitResponse,
  ImportJobCreatePayload,
  ImportJobCreateResponse,
  ImportJobErrorsResponse,
  ImportJobMappingPayload,
  ImportJobRead,
  ImportJobUploadResponse,
  ImportJobValidateResponse,
} from "./types";

export async function createImportJob(payload: ImportJobCreatePayload) {
  const res = await api.post<ImportJobCreateResponse>("/admin/import/jobs", payload);
  return res.data;
}

export async function getImportJob(jobId: string | number) {
  const res = await api.get<ImportJobRead>(`/admin/import/jobs/${jobId}`);
  return res.data;
}

export async function uploadImportFile(params: {
  jobId: string | number;
  file: File;
  onProgress?: (pct: number) => void;
}) {
  const form = new FormData();
  form.append("file", params.file);

  const res = await api.post<ImportJobUploadResponse>(
    `/admin/import/jobs/${params.jobId}/upload`,
    form,
    {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (evt) => {
        if (!params.onProgress) return;
        const total = evt.total || 0;
        if (!total) return;
        const pct = Math.round((evt.loaded / total) * 100);
        params.onProgress(pct);
      },
    }
  );
  return res.data;
}

export async function getImportColumns(jobId: string | number) {
  const res = await api.get<ImportJobColumnsResponse>(`/admin/import/jobs/${jobId}/columns`);
  return res.data;
}

export async function saveImportMapping(jobId: string | number, payload: ImportJobMappingPayload) {
  const res = await api.post(`/admin/import/jobs/${jobId}/mapping`, payload);
  return res.data;
}

export async function validateImportJob(jobId: string | number) {
  const res = await api.post<ImportJobValidateResponse>(`/admin/import/jobs/${jobId}/validate`);
  return res.data;
}

export async function commitImportJob(jobId: string | number) {
  const res = await api.post<ImportJobCommitResponse>(`/admin/import/jobs/${jobId}/commit`);
  return res.data;
}

export async function getImportErrors(jobId: string | number) {
  const res = await api.get<ImportJobErrorsResponse | any>(`/admin/import/jobs/${jobId}/errors`);
  return res.data;
}
