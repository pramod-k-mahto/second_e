"use client";

import { useEffect, useMemo, useState, KeyboardEvent } from "react";

export type MasterSearchType =
  | "customer"
  | "supplier"
  | "ledger"
  | "item"
  | "category"
  | "subcategory"
  | "brand"
  | "warehouse";

export interface MasterSearchDialogProps {
  open: boolean;
  type: MasterSearchType;
  records: any[];
  onSelect: (record: any) => void;
  onClose: () => void;
  initialSearch?: string;
}

const typeLabels: Record<MasterSearchType, string> = {
  customer: "Customers",
  supplier: "Suppliers",
  ledger: "Ledgers",
  item: "Items",
  category: "Categories",
  subcategory: "Sub Categories",
  brand: "Brands",
  warehouse: "Warehouses",
};

export function MasterSearchDialog({ open, type, records, onSelect, onClose, initialSearch }: MasterSearchDialogProps) {
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);

  useEffect(() => {
    if (open) {
      setSearch(initialSearch ?? "");
      setHighlightIndex(0);
    }
  }, [open, type, initialSearch]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return records || [];
    return (records || []).filter((r) => {
      const fields: string[] = [];
      if (type === "customer" || type === "supplier") {
        fields.push(r.name || "", r.email || "", r.phone || "");
      } else if (type === "ledger") {
        fields.push(r.name || "", r.group_name || "");
      } else if (type === "item") {
        fields.push(
          String(r.id || ""),
          r.name || "",
          r.code || "",
          r.sku || "",
          r.barcode || "",
          r.category || "",
          r.brand_name || "",
          r.model_number || ""
        );
      } else if (type === "category" || type === "subcategory" || type === "brand" || type === "warehouse") {
        fields.push(r.name || "");
      }
      return fields.some((f) => f.toString().toLowerCase().includes(term));
    });
  }, [records, search, type]);

  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const rec = filtered[highlightIndex];
      if (rec) {
        onSelect(rec);
      }
    }
  };

  if (!open) return null;

  const title = `Search ${typeLabels[type]}`;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/40"
      onKeyDown={handleKeyDown}
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded shadow-lg w-full max-w-2xl p-4 text-sm">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-base font-medium">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-slate-500 hover:text-slate-700"
          >
            Close
          </button>
        </div>
        <input
          autoFocus
          className="w-full border rounded px-3 py-2 mb-3 text-sm"
          placeholder="Type to search..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setHighlightIndex(0);
          }}
        />
        <div className="border rounded max-h-64 overflow-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-slate-50">
                {type === "ledger" && (
                  <>
                    <th className="text-left py-1 px-2">Name</th>
                    <th className="text-left py-1 px-2">Group</th>
                  </>
                )}
                {(type === "customer" || type === "supplier") && (
                  <>
                    <th className="text-left py-1 px-2">Name</th>
                    <th className="text-left py-1 px-2">Email</th>
                    <th className="text-left py-1 px-2">Phone</th>
                  </>
                )}
                {type === "item" && (
                  <>
                    <th className="text-left py-1 px-2">Item</th>
                    <th className="text-left py-1 px-2">SKU</th>
                    <th className="text-left py-1 px-2">Category</th>
                    <th className="text-left py-1 px-2">Brand</th>
                  </>
                )}
                {(type === "category" || type === "subcategory" || type === "brand" || type === "warehouse") && (
                  <>
                    <th className="text-left py-1 px-2">Name</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="py-3 px-2 text-center text-slate-500"
                  >
                    No matches.
                  </td>
                </tr>
              ) : (
                filtered.map((r, idx) => {
                  const highlighted = idx === highlightIndex;
                  const rowClass = highlighted ? "bg-slate-100" : "";
                  if (type === "ledger") {
                    return (
                      <tr
                        key={r.id}
                        className={`border-b last:border-none cursor-pointer ${rowClass}`}
                        onClick={() => onSelect(r)}
                      >
                        <td className="py-1 px-2">{r.name}</td>
                        <td className="py-1 px-2 text-xs text-slate-500">{r.group_name}</td>
                      </tr>
                    );
                  }
                  if (type === "customer" || type === "supplier") {
                    return (
                      <tr
                        key={r.id}
                        className={`border-b last:border-none cursor-pointer ${rowClass}`}
                        onClick={() => onSelect(r)}
                      >
                        <td className="py-1 px-2">{r.name}</td>
                        <td className="py-1 px-2 text-xs text-slate-500">{r.email}</td>
                        <td className="py-1 px-2 text-xs text-slate-500">{r.phone}</td>
                      </tr>
                    );
                  }
                  if (type === "item") {
                    return (
                      <tr
                        key={r.id}
                        className={`border-b last:border-none cursor-pointer ${rowClass}`}
                        onClick={() => onSelect(r)}
                      >
                        <td className="py-1 px-2">{r.id != null ? `#${r.id} - ${r.name}` : r.name}</td>
                        <td className="py-1 px-2 text-xs text-slate-500">{r.sku}</td>
                        <td className="py-1 px-2 text-xs text-slate-500">{r.category}</td>
                        <td className="py-1 px-2 text-xs text-slate-500">{r.brand_name}</td>
                      </tr>
                    );
                  }
                  // category / subcategory / brand
                  return (
                    <tr
                      key={r.id}
                      className={`border-b last:border-none cursor-pointer ${rowClass}`}
                      onClick={() => onSelect(r)}
                    >
                      <td className="py-1 px-2">{r.name}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
