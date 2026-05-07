"use client";

import * as React from "react";
import { Select } from "./Select";
import type { ItemRead } from "@/types/item";

interface ProductSelectDropdownProps {
  items: ItemRead[];
  value: number | null;
  onChange: (itemId: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  showSku?: boolean;
}

export function ProductSelectDropdown({
  items,
  value,
  onChange,
  placeholder = "Select item",
  disabled,
  className = "",
  showSku = true,
}: ProductSelectDropdownProps) {
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
      {items.map((item) => (
        <option key={item.id} value={item.id}>
          {item.id} - {item.name}
          {showSku && item.sku ? ` (${item.sku})` : ""}
        </option>
      ))}
    </Select>
  );
}
