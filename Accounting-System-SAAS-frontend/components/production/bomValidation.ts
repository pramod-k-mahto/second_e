import type { BOMRead } from "@/types/production";

export type BomRowInput = {
  componentProductId: string;
  quantity: string;
  unit: string;
  wastagePercent: string;
};

export type BomValidationResult = {
  formError: string | null;
  rowErrors: Record<number, string[]>;
};

export function mapBomToRows(bom: BOMRead): BomRowInput[] {
  return bom.items.map((item) => ({
    componentProductId: String(item.component_product_id),
    quantity: String(item.quantity),
    unit: item.unit || "",
    wastagePercent: String(item.wastage_percent ?? 0),
  }));
}

export function validateBomRows(
  finishedProductId: string,
  rows: BomRowInput[]
): BomValidationResult {
  const rowErrors: Record<number, string[]> = {};
  const seenComponents = new Set<number>();
  const selectedRows = rows.filter((row) => row.componentProductId.trim() !== "");

  if (selectedRows.length === 0) {
    return { formError: "Add at least one component row.", rowErrors };
  }

  rows.forEach((row, index) => {
    const errors: string[] = [];
    const componentIdNum = Number(row.componentProductId || "0");
    const qty = Number(row.quantity || "0");
    const wastage = Number(row.wastagePercent || "0");

    if (!row.componentProductId) errors.push("Component product is required.");
    if (!(qty > 0)) errors.push("Quantity must be greater than 0.");
    if (!(wastage >= 0)) errors.push("Wastage percent must be 0 or more.");

    if (row.componentProductId && finishedProductId && row.componentProductId === finishedProductId) {
      errors.push("Finished product cannot be used as a component.");
    }

    if (row.componentProductId) {
      if (seenComponents.has(componentIdNum)) {
        errors.push("Duplicate component product is not allowed.");
      } else {
        seenComponents.add(componentIdNum);
      }
    }

    if (errors.length > 0) rowErrors[index] = errors;
  });

  const hasRowErrors = Object.keys(rowErrors).length > 0;
  return {
    formError: hasRowErrors ? "Please fix validation errors before saving." : null,
    rowErrors,
  };
}
