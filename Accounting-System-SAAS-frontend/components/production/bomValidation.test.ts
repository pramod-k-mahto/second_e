import { describe, expect, it } from "vitest";
import { validateBomRows } from "./bomValidation";

describe("validateBomRows", () => {
  it("returns error when no component rows are selected", () => {
    const result = validateBomRows("1", [
      { componentProductId: "", quantity: "", unit: "", wastagePercent: "0" },
    ]);
    expect(result.formError).toContain("at least one component");
  });

  it("rejects duplicate and same-as-finished product rows", () => {
    const result = validateBomRows("7", [
      { componentProductId: "7", quantity: "2", unit: "pcs", wastagePercent: "0" },
      { componentProductId: "8", quantity: "1", unit: "pcs", wastagePercent: "0" },
      { componentProductId: "8", quantity: "3", unit: "pcs", wastagePercent: "1" },
    ]);
    const joined = Object.values(result.rowErrors).flat().join(" ");
    expect(joined).toContain("Finished product cannot be used");
    expect(joined).toContain("Duplicate component product");
  });
});
