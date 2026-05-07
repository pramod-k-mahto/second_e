"use client";

import * as React from "react";
import { Modal } from "./Modal";
import { Button } from "./Button";

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  isConfirming,
  onConfirm,
  onCancel,
  children,
}: ConfirmDialogProps) {
  const handleClose = () => {
    if (!isConfirming) onCancel();
  };

  return (
    <Modal open={open} onClose={handleClose} title={title}>
      {description && (
        <p className="mb-4 text-xs text-slate-600 dark:text-slate-300">{description}</p>
      )}
      {children && <div className="mb-4">{children}</div>}
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleClose}
          disabled={isConfirming}
        >
          {cancelLabel}
        </Button>
        <Button
          type="button"
          variant="danger"
          size="sm"
          onClick={onConfirm}
          isLoading={isConfirming}
        >
          {confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
