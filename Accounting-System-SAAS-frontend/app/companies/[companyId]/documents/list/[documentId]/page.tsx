"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import useSWR from "swr";
import {
  confirmCompanyDocument,
  getApiErrorMessage,
  getCompanyDocument,
  processCompanyDocument,
  type DocumentExtractedData,
} from "@/lib/api";

type Kind = "PURCHASE" | "BILL";

export default function DocumentReviewPage() {
  const params = useParams();
  const companyId = params?.companyId as string;
  const documentId = Number(params?.documentId);

  const { data: document, isLoading, error, mutate } = useSWR(
    companyId && Number.isFinite(documentId) ? `document-${companyId}-${documentId}` : null,
    () => getCompanyDocument(companyId, documentId)
  );

  const [processing, setProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [allowCreateSupplier, setAllowCreateSupplier] = useState(true);
  const [allowCreateItems, setAllowCreateItems] = useState(true);
  const [kind, setKind] = useState<Kind>("BILL");
  const [extractedDataText, setExtractedDataText] = useState("");
  const [showInlinePreview, setShowInlinePreview] = useState(false);

  const readyJson = useMemo(() => {
    const source = extractedDataText.trim() || JSON.stringify(document?.extracted_data || {}, null, 2);
    return source;
  }, [document?.extracted_data, extractedDataText]);

  const previewFileUrl = useMemo(() => {
    const raw = String(document?.file_url || "").trim();
    if (!raw) return "";
    if (/^https?:\/\//i.test(raw)) return raw;
    const apiBase = (process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8000").replace(/\/$/, "");
    return `${apiBase}${raw.startsWith("/") ? raw : `/${raw}`}`;
  }, [document?.file_url]);

  const previewKind = useMemo(() => {
    const ct = String(document?.content_type || "").toLowerCase();
    if (ct.includes("pdf")) return "pdf";
    if (ct.startsWith("image/")) return "image";
    const url = previewFileUrl.toLowerCase();
    if (url.endsWith(".pdf")) return "pdf";
    if (/\.(png|jpg|jpeg|webp|gif)$/.test(url)) return "image";
    return "other";
  }, [document?.content_type, previewFileUrl]);

  const handleProcess = async () => {
    if (!companyId || !documentId) return;
    setProcessing(true);
    setActionError(null);
    try {
      await processCompanyDocument(companyId, documentId, true);
      await mutate();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirm = async () => {
    if (!companyId || !documentId) return;
    setConfirming(true);
    setActionError(null);
    try {
      const parsed = JSON.parse(readyJson) as DocumentExtractedData;
      await confirmCompanyDocument(companyId, documentId, {
        document_type: kind,
        extracted_data: parsed,
        allow_create_missing_supplier: allowCreateSupplier,
        allow_create_missing_items: allowCreateItems,
      });
      await mutate();
    } catch (err) {
      setActionError(getApiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800 dark:text-slate-100">Document Review</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Process with AI, review extracted fields, then confirm to create accounting records.
            </p>
          </div>
          <Link
            href={`/companies/${companyId}/documents/list`}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
          >
            Back
          </Link>
        </div>
      </div>

      {isLoading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
          Loading document...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {(error as any)?.response?.data?.detail || "Failed to load document"}
        </div>
      ) : !document ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Document not found.</div>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="text-xs text-slate-600 dark:text-slate-300">
                <div>
                  <span className="font-semibold">File:</span> {document.original_filename || "document"}
                </div>
                <div>
                  <span className="font-semibold">Status:</span> {document.status}
                </div>
                <div>
                  <span className="font-semibold">Created:</span>{" "}
                  {document.created_at ? new Date(document.created_at).toLocaleString() : "—"}
                </div>
              </div>
              <div className="flex items-center justify-start gap-2 md:justify-end">
                <button
                  type="button"
                  disabled={processing}
                  onClick={handleProcess}
                  className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
                >
                  {processing ? "Processing..." : "Run AI Process"}
                </button>
                {previewFileUrl && (
                  <button
                    type="button"
                    onClick={() => setShowInlinePreview((v) => !v)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:border-slate-700 dark:text-slate-200"
                  >
                    {showInlinePreview ? "Hide Preview" : "Preview File"}
                  </button>
                )}
              </div>
            </div>
            {showInlinePreview && previewFileUrl && (
              <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-950">
                {previewKind === "pdf" ? (
                  <iframe
                    src={previewFileUrl}
                    title="Document Preview"
                    className="h-[560px] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
                  />
                ) : previewKind === "image" ? (
                  <div className="flex justify-center overflow-auto rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900">
                    <img
                      src={previewFileUrl}
                      alt="Document preview"
                      className="max-h-[560px] w-auto max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                    Inline preview is not supported for this file type.
                    <a
                      href={previewFileUrl}
                      className="ml-1 font-semibold text-indigo-600 underline dark:text-indigo-400"
                    >
                      Open file
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <div className="mb-2 flex flex-wrap items-center gap-3">
              <label className="text-xs font-semibold text-slate-600 dark:text-slate-300">Create As</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
                className="h-8 rounded-md border border-slate-300 px-2 text-xs dark:border-slate-700 dark:bg-slate-950"
              >
                <option value="BILL">Bill</option>
                <option value="PURCHASE">Purchase Order</option>
              </select>
              <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={allowCreateSupplier}
                  onChange={(e) => setAllowCreateSupplier(e.target.checked)}
                />
                Allow create supplier
              </label>
              <label className="inline-flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={allowCreateItems}
                  onChange={(e) => setAllowCreateItems(e.target.checked)}
                />
                Allow create items
              </label>
            </div>

            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Extracted Data (Editable JSON)
            </label>
            <textarea
              value={readyJson}
              onChange={(e) => setExtractedDataText(e.target.value)}
              rows={16}
              className="w-full rounded-lg border border-slate-300 p-2 font-mono text-xs dark:border-slate-700 dark:bg-slate-950"
            />

            {actionError && <div className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700">{actionError}</div>}

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                disabled={confirming}
                onClick={handleConfirm}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {confirming ? "Confirming..." : "Confirm & Create Record"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
