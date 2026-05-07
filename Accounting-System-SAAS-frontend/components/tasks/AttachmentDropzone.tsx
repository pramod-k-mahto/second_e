"use client";

import * as React from "react";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import type { Attachment } from "@/lib/tasks/types";

type UploadingAttachment = {
  id: string;
  file: File;
  previewUrl: string | null;
};

function isImage(file: File) {
  return file.type.startsWith("image/");
}

export function AttachmentDropzone({
  attachments,
  uploading,
  canUpload,
  onUpload,
  onDelete,
  deletingIds,
}: {
  attachments: Attachment[];
  uploading: UploadingAttachment[];
  canUpload: boolean;
  onUpload: (files: File[]) => void;
  onDelete: (a: Attachment) => void;
  deletingIds?: Set<number>;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = React.useState(false);
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewAttachment, setPreviewAttachment] = React.useState<Attachment | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = React.useState<string | null>(null);
  const previewBlobUrlRef = React.useRef<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  const [downloadingIds, setDownloadingIds] = React.useState<Set<number>>(() => new Set());
  const [downloadError, setDownloadError] = React.useState<string | null>(null);

  const downloadAttachment = React.useCallback(async (a: Attachment) => {
    setDownloadError(null);
    setDownloadingIds((prev) => new Set(prev).add(a.id));
    try {
      let blob: Blob | null = null;

      try {
        const res = await api.get(a.file_url, { responseType: "blob" });
        blob = res.data as Blob;
      } catch {
        const r = await fetch(a.file_url);
        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }
        blob = await r.blob();
      }

      if (!blob) throw new Error("Download failed");

      const url = URL.createObjectURL(blob);
      try {
        const link = document.createElement("a");
        link.href = url;
        link.download = a.file_name || "download";
        document.body.appendChild(link);
        link.click();
        link.remove();
      } finally {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      setDownloadError(err?.message || "Could not download file.");
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(a.id);
        return next;
      });
    }
  }, []);

  React.useEffect(() => {
    if (previewBlobUrlRef.current) {
      try {
        URL.revokeObjectURL(previewBlobUrlRef.current);
      } catch {
        // ignore
      }
      previewBlobUrlRef.current = null;
    }
    setPreviewBlobUrl(null);
    setPreviewError(null);

    if (!previewOpen || !previewAttachment) return;

    setPreviewLoading(true);
    const mime = previewAttachment.mime_type || "";
    const shouldBlob = mime.startsWith("image/") || mime === "application/pdf";

    if (!shouldBlob) {
      setPreviewLoading(false);
      return;
    }

    (async () => {
      try {
        let blob: Blob | null = null;

        try {
          const res = await api.get(previewAttachment.file_url, { responseType: "blob" });
          blob = res.data as Blob;
        } catch (err: any) {
          try {
            const r = await fetch(previewAttachment.file_url);
            if (!r.ok) {
              throw new Error(`HTTP ${r.status}`);
            }
            blob = await r.blob();
          } catch {
            const status = err?.response?.status;
            const detail = err?.response?.data?.detail;
            const message = err?.message;
            throw new Error(
              detail || (status ? `Request failed (${status})` : message ? String(message) : "Could not load preview")
            );
          }
        }

        if (!blob) throw new Error("Could not load preview");

        const url = URL.createObjectURL(blob);
        previewBlobUrlRef.current = url;
        setPreviewBlobUrl(url);
      } catch (err: any) {
        setPreviewError(err?.message || "Could not load preview.");
      } finally {
        setPreviewLoading(false);
      }
    })();

    return () => {
      if (previewBlobUrlRef.current) {
        try {
          URL.revokeObjectURL(previewBlobUrlRef.current);
        } catch {
          // ignore
        }
        previewBlobUrlRef.current = null;
      }
    };
  }, [previewOpen, previewAttachment]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    if (!arr.length) return;
    onUpload(arr);
  };

  return (
    <div className="rounded-lg border border-border-light dark:border-border-dark bg-surface-light dark:bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">Attachments</div>
        {canUpload ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            title="Upload files"
          >
            Upload
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
      />

      {canUpload ? (
        <div
          className={[
            "rounded-lg border-2 border-dashed p-4 text-sm transition-colors",
            dragOver
              ? "border-brand-500 bg-brand-50"
              : "border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30",
          ].join(" ")}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            handleFiles(e.dataTransfer.files);
          }}
        >
          Drag & drop files here, or click Upload.
        </div>
      ) : (
        <div className="text-xs text-slate-500">Attachments are read-only for you.</div>
      )}

      {downloadError ? (
        <div className="mt-3 rounded-md border border-critical-500/30 bg-critical-500/5 p-2 text-xs text-critical-600">
          {downloadError}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {uploading.map((u) => (
          <div
            key={u.id}
            className="rounded-lg border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 p-3"
          >
            <div className="text-xs text-slate-600 dark:text-slate-300">Uploading…</div>
            <div className="mt-1 truncate text-sm text-slate-900 dark:text-slate-100">
              {u.file.name}
            </div>
            {u.previewUrl ? (
              <img
                src={u.previewUrl}
                alt={u.file.name}
                className="mt-2 h-28 w-full rounded object-cover border border-border-light dark:border-border-dark"
              />
            ) : null}
            <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800">
              <div className="h-2 w-1/3 animate-pulse rounded-full bg-brand-600" />
            </div>
          </div>
        ))}

        {attachments.map((a) => {
          const deleting = deletingIds?.has(a.id) || false;
          const img = a.mime_type?.startsWith("image/");
          const pdf = a.mime_type === "application/pdf";
          const downloading = downloadingIds.has(a.id);
          return (
            <div
              key={a.id}
              className="rounded-lg border border-border-light dark:border-border-dark bg-white/70 dark:bg-slate-950/30 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <a
                  href={a.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0"
                >
                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                    {a.file_name}
                  </div>
                  <div className="mt-0.5 text-[11px] text-slate-500">
                    {a.mime_type} • {(a.size / 1024).toFixed(1)} KB
                  </div>
                </a>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setPreviewAttachment(a);
                      setPreviewOpen(true);
                    }}
                  >
                    Preview
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={downloading}
                    onClick={() => downloadAttachment(a)}
                  >
                    {downloading ? "Downloading…" : "Download"}
                  </Button>
                  {canUpload ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={deleting}
                      onClick={() => onDelete(a)}
                      className="text-critical-600"
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              </div>

              {img ? (
                <img
                  src={a.file_url}
                  alt={a.file_name}
                  className="mt-2 h-28 w-full rounded object-cover border border-border-light dark:border-border-dark"
                />
              ) : null}

              {!img && pdf ? (
                <div className="mt-2 text-xs text-slate-500">PDF file</div>
              ) : null}
            </div>
          );
        })}

        {!attachments.length && !uploading.length ? (
          <div className="text-sm text-slate-600 dark:text-slate-300">No attachments.</div>
        ) : null}
      </div>

      <Modal
        open={previewOpen}
        title={previewAttachment?.file_name || "Preview"}
        onClose={() => {
          setPreviewOpen(false);
          setPreviewAttachment(null);
        }}
      >
        <div className="space-y-3">
          {previewAttachment ? (
            previewLoading ? (
              <div className="text-sm text-slate-600 dark:text-slate-300">Loading preview…</div>
            ) : previewError ? (
              <div className="rounded-md border border-critical-500/30 bg-critical-500/5 p-3 text-sm text-critical-600">
                {previewError}
              </div>
            ) : previewAttachment.mime_type?.startsWith("image/") ? (
              <img
                src={previewBlobUrl || previewAttachment.file_url}
                alt={previewAttachment.file_name}
                className="max-h-[60vh] w-full rounded border border-border-light object-contain"
              />
            ) : previewAttachment.mime_type === "application/pdf" ? (
              <iframe
                src={previewBlobUrl || previewAttachment.file_url}
                className="h-[60vh] w-full rounded border border-border-light"
                title={previewAttachment.file_name}
              />
            ) : (
              <div className="rounded-md border border-border-light bg-white/70 p-3 text-sm">
                <div className="text-slate-900">Preview not available for this file type.</div>
                <div className="mt-2">
                  <a
                    href={previewAttachment.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline"
                  >
                    Open file
                  </a>
                </div>
              </div>
            )
          ) : (
            <div className="text-sm text-slate-600 dark:text-slate-300">No attachment selected.</div>
          )}

          {previewAttachment ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => downloadAttachment(previewAttachment)}
              >
                Download
              </Button>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

export function makeUploadingAttachment(file: File): UploadingAttachment {
  return {
    id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(16).slice(2)}`,
    file,
    previewUrl: isImage(file) ? URL.createObjectURL(file) : null,
  };
}
