"use client";

import * as React from "react";
import { Input } from "./Input";

export interface DateRangeValue {
  from: string | null;
  to: string | null;
}

interface DateRangePickerProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  labelFrom?: string;
  labelTo?: string;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  labelFrom = "From",
  labelTo = "To",
  className = "",
  disabled,
}: DateRangePickerProps) {
  const handleChange = (field: "from" | "to", val: string) => {
    onChange({ ...value, [field]: val || null });
  };

  return (
    <div className={["grid grid-cols-1 gap-2 sm:grid-cols-2", className].filter(Boolean).join(" ")}>
      <div className="min-w-0 space-y-1">
        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {labelFrom}
        </div>
        <Input
          type="date"
          value={value.from ?? ""}
          onChange={(e) => handleChange("from", e.target.value)}
          disabled={disabled}
        />
      </div>
      <div className="min-w-0 space-y-1">
        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
          {labelTo}
        </div>
        <Input
          type="date"
          value={value.to ?? ""}
          onChange={(e) => handleChange("to", e.target.value)}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
