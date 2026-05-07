"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/ui/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { DataTable, type DataTableColumn } from "@/components/ui/DataTable";
import { useToast } from "@/components/ui/Toast";
import { JsonEditor } from "@/components/import/JsonEditor";
import { ImportStepperTabs, type ImportStepKey } from "@/components/import/ImportStepperTabs";
import { ImportStatusBadge } from "@/components/import/ImportStatusBadge";
import {
  commitImportJob,
  getImportColumns,
  getImportErrors,
  getImportJob,
  saveImportMapping,
  uploadImportFile,
  validateImportJob,
} from "@/lib/import/api";
import { IMPORT_MAPPING_PRESETS } from "@/lib/import/presets";
import type { ImportDataType, ImportJobErrorRow } from "@/lib/import/types";
import { addRecentImportJob } from "@/lib/import/recentJobs";

const apiBase = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000";

function safeJsonParse(raw: string): { ok: boolean; value?: any; error?: string } {
  try {
    const v = JSON.parse(raw);
    return { ok: true, value: v };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Invalid JSON" };
  }
}

function formatDate(s?: string | null) {
  if (!s) return "-";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}

type SimpleMappingRow = { target: string; source: string };

export default function AdminImportJobDetailPage() {
  const params = useParams<{ jobId: string }>();
  const { showToast } = useToast();

  const jobId = params?.jobId;

  React.useEffect(() => {
    if (jobId) addRecentImportJob({ id: String(jobId) });
  }, [jobId]);

  const [step, setStep] = React.useState<ImportStepKey>("upload");
  const [uploadPct, setUploadPct] = React.useState<number>(0);
  const [selectedFile, setSelectedFile] = React.useState<File | null>(null);

  const [mappingMode, setMappingMode] = React.useState<"simple" | "json">("json");
  const [mappingName, setMappingName] = React.useState<string>("default");
  const [mappingJsonRaw, setMappingJsonRaw] = React.useState<string>("{}\n");
  const [mappingJsonError, setMappingJsonError] = React.useState<string | null>(null);
  const [simpleRows, setSimpleRows] = React.useState<SimpleMappingRow[]>([
    { target: "external_ref", source: "" },
  ]);

  const jobQuery = useQuery({
    queryKey: ["importJob", jobId],
    queryFn: () => getImportJob(jobId),
    enabled: !!jobId,
    refetchInterval: (data) => {
      const s = String((data as any)?.status || "").toUpperCase();
      if (s === "VALIDATING" || s === "COMMITTING") return 1500;
      return false;
    },
  });

  const job = jobQuery.data as any;
  const dataType = (job?.data_type as ImportDataType | undefined) || undefined;

  const columnsQuery = useQuery({
    queryKey: ["importColumns", jobId],
    queryFn: () => getImportColumns(jobId),
    enabled: !!jobId,
    staleTime: 5_000,
  });

  const detectedColumns: string[] = React.useMemo(() => {
    const res = columnsQuery.data as any;
    const cols = res?.columns;
    return Array.isArray(cols) ? cols.map(String) : [];
  }, [columnsQuery.data]);

  const errorsQuery = useQuery({
    queryKey: ["importErrors", jobId],
    queryFn: () => getImportErrors(jobId),
    enabled: !!jobId && step === "results",
  });

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      setUploadPct(0);
      return uploadImportFile({ jobId, file: selectedFile, onProgress: setUploadPct });
    },
    onSuccess: async () => {
      showToast({ title: "Upload", description: "File uploaded successfully.", variant: "success" });
      await jobQuery.refetch();
      await columnsQuery.refetch();
      setStep("mapping");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      showToast({
        title: "Upload",
        description: typeof detail === "string" ? detail : "Upload failed",
        variant: "error",
      });
    },
  });

  const mappingMutation = useMutation({
    mutationFn: async () => {
      if (mappingMode === "json") {
        const parsed = safeJsonParse(mappingJsonRaw);
        if (!parsed.ok) {
          setMappingJsonError(parsed.error || "Invalid JSON");
          throw new Error("Invalid JSON mapping");
        }
        setMappingJsonError(null);
        return saveImportMapping(jobId, {
          mapping_name: mappingName || "default",
          mapping_json: parsed.value,
        });
      }

      const payload: Record<string, string> = {};
      for (const r of simpleRows) {
        const t = String(r.target || "").trim();
        const s = String(r.source || "").trim();
        if (!t) continue;
        if (!s) continue;
        payload[t] = s;
      }

      return saveImportMapping(jobId, {
        mapping_name: mappingName || "default",
        mapping_json: payload,
      });
    },
    onSuccess: async () => {
      showToast({ title: "Mapping", description: "Mapping saved.", variant: "success" });
      await jobQuery.refetch();
      setStep("validate");
    },
    onError: (err: any) => {
      if (String(err?.message || "") === "Invalid JSON mapping") return;
      const detail = err?.response?.data?.detail;
      showToast({
        title: "Mapping",
        description: typeof detail === "string" ? detail : "Failed to save mapping",
        variant: "error",
      });
    },
  });

  const validateMutation = useMutation({
    mutationFn: () => validateImportJob(jobId),
    onSuccess: async () => {
      showToast({ title: "Validate", description: "Validation started.", variant: "success" });
      await jobQuery.refetch();
      setStep("commit");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      showToast({
        title: "Validate",
        description: typeof detail === "string" ? detail : "Validation failed",
        variant: "error",
      });
    },
  });

  const commitMutation = useMutation({
    mutationFn: () => commitImportJob(jobId),
    onSuccess: async () => {
      showToast({ title: "Commit", description: "Commit started.", variant: "success" });
      await jobQuery.refetch();
      setStep("results");
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail;
      showToast({
        title: "Commit",
        description: typeof detail === "string" ? detail : "Commit failed",
        variant: "error",
      });
    },
  });

  const status = String(job?.status || "-");
  const statusUpper = status.toUpperCase();

  const canCommit = statusUpper === "VALIDATED" || statusUpper === "COMPLETED" || statusUpper === "COMMITTING";

  const presets = dataType ? IMPORT_MAPPING_PRESETS[dataType] || [] : [];

  const errorRows: ImportJobErrorRow[] = React.useMemo(() => {
    const d = errorsQuery.data as any;
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.errors)) return d.errors;
    return [];
  }, [errorsQuery.data]);

  const errorColumns: DataTableColumn<ImportJobErrorRow>[] = React.useMemo(
    () => [
      { id: "row_no", header: "Row", accessor: (r) => String(r.row_no ?? "-") },
      { id: "status", header: "Status", accessor: (r) => String(r.status ?? "-") },
      {
        id: "errors",
        header: "Validation errors",
        accessor: (r) => (
          <pre className="whitespace-pre-wrap text-[11px] text-slate-700 dark:text-slate-200">
            {JSON.stringify(r.validation_errors ?? r, null, 2)}
          </pre>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-4">
      <PageHeader
        title={`Import Job ${String(jobId)}`}
        subtitle="Upload → Mapping → Validate → Commit → Results/Errors"
        actions={
          <div className="flex items-center gap-2">
            <ImportStatusBadge status={status} />
            <Button
              variant="outline"
              onClick={() => jobQuery.refetch()}
              isLoading={jobQuery.isFetching}
              type="button"
            >
              Refresh
            </Button>
          </div>
        }
      />

      <Card>
        <div className="grid gap-2 md:grid-cols-4 text-xs">
          <div>
            <div className="text-slate-500">Company</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">
              {job?.company_name || job?.company_id || "-"}
            </div>
          </div>
          <div>
            <div className="text-slate-500">Source</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{job?.source_type || "-"}</div>
          </div>
          <div>
            <div className="text-slate-500">Data type</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{job?.data_type || "-"}</div>
          </div>
          <div>
            <div className="text-slate-500">Created at</div>
            <div className="font-medium text-slate-900 dark:text-slate-100">{formatDate(job?.created_at)}</div>
          </div>
        </div>

        <div className="mt-4">
          <ImportStepperTabs value={step} onChange={setStep} />
        </div>
      </Card>

      {step === "upload" && (
        <Card>
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Upload file</div>

            <input
              type="file"
              accept={".csv,.xlsx,.xls,.json,.xml"}
              onChange={(e) => {
                const f = e.target.files?.[0] || null;
                setSelectedFile(f);
              }}
            />

            {selectedFile && (
              <div className="text-xs text-slate-600">
                Selected: <span className="font-medium">{selectedFile.name}</span>
              </div>
            )}

            {uploadMutation.isPending && (
              <div className="text-xs text-slate-600">Uploading… {uploadPct}%</div>
            )}

            <div className="flex gap-2">
              <Button
                type="button"
                onClick={() => uploadMutation.mutate()}
                isLoading={uploadMutation.isPending}
                disabled={!selectedFile}
              >
                Upload
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  columnsQuery.refetch();
                }}
              >
                Refresh columns
              </Button>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
              Hint: If your file is flat-row invoice/order lines, use mapping mode with <code>group_key</code>.
            </div>

            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-700">Detected columns</div>
              {!columnsQuery.data ? (
                <div className="text-xs text-slate-500">No columns detected yet.</div>
              ) : detectedColumns.length === 0 ? (
                <div className="text-xs text-slate-500">No columns returned.</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {detectedColumns.map((c) => (
                    <span
                      key={c}
                      className="rounded border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {step === "mapping" && (
        <Card>
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Mapping name</label>
                <input
                  value={mappingName}
                  onChange={(e) => setMappingName(e.target.value)}
                  className="h-9 rounded-md border border-border-light bg-white px-3 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-700">Mode</label>
                <Select value={mappingMode} onChange={(e) => setMappingMode(e.target.value as any)}>
                  <option value="json">Advanced JSON mapping</option>
                  <option value="simple">Simple mapping</option>
                </Select>
              </div>

              <div className="ml-auto flex gap-2">
                <Button
                  type="button"
                  onClick={() => mappingMutation.mutate()}
                  isLoading={mappingMutation.isPending}
                >
                  Save mapping
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="text-xs font-medium text-slate-700 mb-1">Detected columns</div>
                <div className="max-h-64 overflow-auto rounded-md border border-slate-200 bg-white p-2">
                  {detectedColumns.length === 0 ? (
                    <div className="text-xs text-slate-500">No columns available yet.</div>
                  ) : (
                    <div className="flex flex-col gap-1">
                      {detectedColumns.map((c) => (
                        <div key={c} className="text-[11px] text-slate-700">
                          {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-3">
                  <div className="text-xs font-medium text-slate-700 mb-1">Templates</div>
                  <div className="text-xs text-slate-600">
                    Download templates:
                    <div className="mt-1 flex flex-col gap-1">
                      <a
                        className="text-brand-700 hover:underline"
                        href={`${apiBase}/templates/import/opening_balances.csv`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        opening_balances.csv
                      </a>
                      <a
                        className="text-brand-700 hover:underline"
                        href={`${apiBase}/templates/import/stock_opening.csv`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        stock_opening.csv
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div>
                {mappingMode === "json" ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs font-medium text-slate-700">Mapping JSON</div>
                      {presets.length > 0 && (
                        <Select
                          value={""}
                          onChange={(e) => {
                            const label = e.target.value;
                            const p = presets.find((x) => x.label === label);
                            if (!p) return;
                            setMappingJsonRaw(JSON.stringify(p.json, null, 2));
                            setMappingJsonError(null);
                          }}
                        >
                          <option value="">Load preset…</option>
                          {presets.map((p) => (
                            <option key={p.label} value={p.label}>
                              {p.label}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>

                    <JsonEditor value={mappingJsonRaw} onChange={setMappingJsonRaw} error={mappingJsonError} />
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs font-medium text-slate-700">Simple mapping</div>
                    <div className="space-y-2">
                      {simpleRows.map((r, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-2">
                          <input
                            value={r.target}
                            onChange={(e) => {
                              const next = [...simpleRows];
                              next[idx] = { ...next[idx], target: e.target.value };
                              setSimpleRows(next);
                            }}
                            placeholder="target_field"
                            className="h-9 rounded-md border border-border-light bg-white px-3 text-sm"
                          />
                          <Select
                            value={r.source}
                            onChange={(e) => {
                              const next = [...simpleRows];
                              next[idx] = { ...next[idx], source: e.target.value };
                              setSimpleRows(next);
                            }}
                          >
                            <option value="">Select source column</option>
                            {detectedColumns.map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </Select>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setSimpleRows((prev) => [...prev, { target: "", source: "" }])}
                      >
                        Add field
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setSimpleRows([{ target: "external_ref", source: "" }])}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {step === "validate" && (
        <Card>
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Validate</div>
            <div className="text-xs text-slate-600">
              Run validation to catch row-level issues before committing. Commit is disabled until validation
              completes.
            </div>

            <Button type="button" onClick={() => validateMutation.mutate()} isLoading={validateMutation.isPending}>
              Validate
            </Button>

            {job?.summary && (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium text-slate-700 mb-2">Latest summary</div>
                <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(job.summary, null, 2)}</pre>
              </div>
            )}

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setStep("results")}
              >
                View Errors
              </Button>
            </div>
          </div>
        </Card>
      )}

      {step === "commit" && (
        <Card>
          <div className="space-y-3">
            <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Commit</div>

            {!canCommit && (
              <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Commit is disabled until validation has completed successfully.
              </div>
            )}

            <Button
              type="button"
              onClick={() => commitMutation.mutate()}
              isLoading={commitMutation.isPending}
              disabled={!canCommit}
            >
              Commit
            </Button>

            <div className="text-xs text-slate-600">
              Idempotency / dedupes: rows may be skipped if an existing record matches the same
              <code> external_ref</code>.
            </div>

            {job?.result && (
              <div className="rounded-md border border-slate-200 bg-white p-3">
                <div className="text-xs font-medium text-slate-700 mb-2">Result</div>
                <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(job.result, null, 2)}</pre>
              </div>
            )}
          </div>
        </Card>
      )}

      {step === "results" && (
        <Card>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Results & Errors</div>
              <Button type="button" variant="outline" onClick={() => errorsQuery.refetch()} isLoading={errorsQuery.isFetching}>
                Refresh errors
              </Button>
            </div>

            {(job?.summary || job?.result) && (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-medium text-slate-700 mb-2">Summary</div>
                  <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(job?.summary ?? null, null, 2)}</pre>
                </div>
                <div className="rounded-md border border-slate-200 bg-white p-3">
                  <div className="text-xs font-medium text-slate-700 mb-2">Result</div>
                  <pre className="text-[11px] whitespace-pre-wrap">{JSON.stringify(job?.result ?? null, null, 2)}</pre>
                </div>
              </div>
            )}

            <div>
              <div className="text-xs font-medium text-slate-700 mb-2">Row-level errors</div>
              <DataTable
                columns={errorColumns}
                data={errorRows}
                getRowKey={(r, idx) => String(r.row_no ?? idx)}
                emptyMessage={errorsQuery.isLoading ? "Loading…" : "No errors found."}
              />
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
