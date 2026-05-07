"use client";

import React, { useMemo } from "react";

export type PartyType = "customer" | "supplier";

export type PartyOption = {
  id: number;
  name: string;
};

export interface PartySelectorProps {
  partyType: PartyType;
  value: string;
  onChange: (newPartyId: string) => void;
  customerOptions: PartyOption[];
  supplierOptions: PartyOption[];
  isLoading?: boolean;
  disabled?: boolean;
}

export const PartySelector: React.FC<PartySelectorProps> = ({
  partyType,
  value,
  onChange,
  customerOptions,
  supplierOptions,
  isLoading,
  disabled,
}) => {
  const options = useMemo(() => {
    return partyType === "customer" ? customerOptions : supplierOptions;
  }, [partyType, customerOptions, supplierOptions]);

  return (
    <div>
      <label className="block mb-1 text-sm">
        {partyType === "customer" ? "Customer" : "Supplier"}
      </label>
      <select
        className="border rounded px-2 py-1 text-sm min-w-[220px]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled || isLoading}
      >
        <option value="">
          {isLoading ? "Loading..." : `Select ${partyType === "customer" ? "customer" : "supplier"}`}
        </option>
        {options.map((opt) => (
          <option key={`${partyType}-${opt.id}`} value={String(opt.id)}>
            {opt.name} (#{opt.id})
          </option>
        ))}
      </select>
    </div>
  );
};
