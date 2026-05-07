"use client";

import * as React from "react";
import { Button } from "./Button";

interface ExportButtonsProps {
  onExportExcel?: () => void;
  onExportPdf?: () => void;
  onPrint?: () => void;
  isExportingExcel?: boolean;
  isExportingPdf?: boolean;
  disabled?: boolean;
  className?: string;
}

export function ExportButtons({
  onExportExcel,
  onExportPdf,
  onPrint,
  isExportingExcel,
  isExportingPdf,
  disabled,
  className = "",
}: ExportButtonsProps) {
  const isExcelDisabled = disabled || !onExportExcel;
  const isPdfDisabled = disabled || !onExportPdf;

  return (
    <div className={["flex items-center gap-2", className].filter(Boolean).join(" ")}>
      {onPrint && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onPrint}
          disabled={disabled}
          className="flex items-center gap-1.5"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 4v3H4a2 2 0 00-2 2v3a2 2 0 002 2h1v2a2 2 0 002 2h6a2 2 0 002-2v-2h1a2 2 0 002-2V9a2 2 0 00-2-2h-1V4a2 2 0 00-2-2H7a2 2 0 00-2 2zm8 0H7v3h6V4zm0 8H7v4h6v-4z" clipRule="evenodd" />
          </svg>
          Print
        </Button>
      )}
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onExportExcel}
        disabled={isExcelDisabled}
        isLoading={isExportingExcel}
      >
        Excel
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onExportPdf}
        disabled={isPdfDisabled}
        isLoading={isExportingPdf}
      >
        PDF
      </Button>
    </div>
  );
}
