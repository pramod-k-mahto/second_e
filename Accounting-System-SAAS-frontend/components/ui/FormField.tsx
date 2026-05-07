"use client";

import * as React from "react";
import { Input, InputProps } from "./Input";

interface FormFieldProps extends InputProps {
  label?: string;
  error?: string | null;
  hint?: string;
  required?: boolean;
  containerClassName?: string;
}

export function FormField({
  label,
  error,
  hint,
  required,
  containerClassName = "",
  className = "",
  ...inputProps
}: FormFieldProps) {
  const { children, ...restInputProps } = inputProps;

  return (
    <div className={["space-y-1 text-sm", containerClassName].filter(Boolean).join(" ")}>
      {label && (
        <label className="flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200">
          <span>
            {label}
            {required && <span className="ml-0.5 text-critical-500">*</span>}
          </span>
          {hint && !error && (
            <span className="text-[11px] font-normal text-slate-400 dark:text-slate-500">
              {hint}
            </span>
          )}
        </label>
      )}
      {children ? (
        children
      ) : (
        <Input
          {...restInputProps}
          className={[
            className,
            error && "border-critical-500 focus-visible:ring-critical-500",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      )}
      {error && (
        <div className="text-[11px] text-critical-600 dark:text-critical-400">
          {error}
        </div>
      )}
    </div>
  );
}
