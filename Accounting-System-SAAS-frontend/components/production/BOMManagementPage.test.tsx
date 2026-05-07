import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BOMManagementPage } from "./BOMManagementPage";

const mocks = vi.hoisted(() => ({
  createBOM: vi.fn(),
  updateBOM: vi.fn(),
  getBOMByProduct: vi.fn(),
  deleteBOM: vi.fn(),
  showToast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
  useSearchParams: () => ({
    get: () => null,
  }),
}));

vi.mock("swr", () => ({
  default: vi.fn(() => ({
    data: [
      { id: 1, name: "Finished Product", code: "FP", unit: "pcs" },
      { id: 2, name: "Component A", code: "CA", unit: "kg" },
      { id: 3, name: "Component B", code: "CB", unit: "ltr" },
    ],
    mutate: vi.fn(),
  })),
  useSWRConfig: () => ({ mutate: vi.fn() }),
}));

vi.mock("@/components/ui/Toast", () => ({
  useToast: () => ({ showToast: mocks.showToast }),
}));

vi.mock("@/components/ui/Input", () => ({
  Input: (props: any) => React.createElement("input", props),
}));

vi.mock("@/components/ui/SearchableSelect", () => ({
  SearchableSelect: ({ options, value, onChange }: any) =>
    React.createElement(
      "select",
      { "data-testid": "searchable-select", value, onChange: (e: any) => onChange(e.target.value) },
      React.createElement("option", { value: "" }, "Select"),
      ...options.map((o: any) => React.createElement("option", { key: o.value, value: o.value }, o.label))
    ),
}));

vi.mock("@/lib/api", () => ({
  api: { get: vi.fn() },
  getApiErrorMessage: (e: any) => e?.message || "Request failed",
  createBOM: mocks.createBOM,
  updateBOM: mocks.updateBOM,
  getBOMByProduct: mocks.getBOMByProduct,
  deleteBOM: mocks.deleteBOM,
}));

describe("BOMManagementPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("adds and removes dynamic rows", () => {
    render(React.createElement(BOMManagementPage, { companyId: "1" }));
    expect(screen.getAllByText("Remove")).toHaveLength(1);
    fireEvent.click(screen.getByText("Add Row"));
    expect(screen.getAllByText("Remove")).toHaveLength(2);
    fireEvent.click(screen.getAllByText("Remove")[1]);
    expect(screen.getAllByText("Remove")).toHaveLength(1);
  });

  it("creates, updates and deletes BOM with mocked services", async () => {
    mocks.createBOM.mockResolvedValue({
      id: 10,
      product_id: 1,
      version: 1,
      created_at: "",
      estimated_cost: 111,
      items: [{ id: 1, component_product_id: 2, quantity: 2, unit: "kg", wastage_percent: 0 }],
    });
    mocks.updateBOM.mockResolvedValue({
      id: 10,
      product_id: 1,
      version: 2,
      created_at: "",
      estimated_cost: 222,
      items: [{ id: 1, component_product_id: 2, quantity: 3, unit: "kg", wastage_percent: 1 }],
    });
    mocks.deleteBOM.mockResolvedValue(undefined);

    render(React.createElement(BOMManagementPage, { companyId: "1" }));

    const selects = screen.getAllByTestId("searchable-select");
    fireEvent.change(selects[0], { target: { value: "1" } });
    fireEvent.change(selects[selects.length - 1], { target: { value: "2" } });
    fireEvent.change(screen.getByPlaceholderText("Quantity"), { target: { value: "2" } });

    fireEvent.click(screen.getByText("Save as New BOM"));
    await waitFor(() => expect(mocks.createBOM).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("Update Current BOM"));
    await waitFor(() => expect(mocks.updateBOM).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByText("Delete BOM"));
    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() => expect(mocks.deleteBOM).toHaveBeenCalledTimes(1));
  });
});
