"use client";

import * as React from "react";
import { Select } from "./Select";
import type { Ledger } from "@/types/ledger";

interface LedgerSelectDropdownProps {
  ledgers: Ledger[];
  value: number | null;
  onChange: (ledgerId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showGroup?: boolean;
}

export function LedgerSelectDropdown({
  ledgers,
  value,
  onChange,
  placeholder = "Select ledger",
  disabled,
  className = "",
  showGroup = true,
}: LedgerSelectDropdownProps) {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const v = e.target.value;
    onChange(v ? Number(v) : null);
  };

  return (
    <Select
      value={value ?? ""}
      onChange={handleChange}
      disabled={disabled}
      className={className}
    >
      <option value="" disabled>
        {placeholder}
      </option>
      {ledgers.map((ledger) => (
        <option key={ledger.id} value={ledger.id}>
          {ledger.name}
          {showGroup && ledger.groupName ? ` (${ledger.groupName})` : ""}
        </option>
      ))}
    </Select>
  );
}
