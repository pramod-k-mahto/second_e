"use client";

import * as React from "react";
import type { Attachment } from "@/lib/tasks/types";
import { AttachmentDropzone, makeUploadingAttachment } from "@/components/tasks/AttachmentDropzone";

export function TaskAttachments({
  attachments,
  canUpload,
  onUpload,
  onDelete,
  deletingIds,
}: {
  attachments: Attachment[];
  canUpload: boolean;
  onUpload: (files: File[]) => Promise<void> | void;
  onDelete: (a: Attachment) => Promise<void> | void;
  deletingIds?: Set<number>;
}) {
  const [uploading, setUploading] = React.useState<ReturnType<typeof makeUploadingAttachment>[]>([]);

  return (
    <AttachmentDropzone
      attachments={attachments as any}
      uploading={uploading}
      canUpload={canUpload}
      deletingIds={deletingIds}
      onUpload={async (files) => {
        const ups = files.map(makeUploadingAttachment);
        setUploading((prev) => [...prev, ...ups]);
        try {
          await onUpload(files);
        } finally {
          setUploading((prev) => prev.filter((p) => !ups.some((u) => u.id === p.id)));
        }
      }}
      onDelete={(a) => onDelete(a as any)}
    />
  );
}
