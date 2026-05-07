import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProductionOrderPage } from "./ProductionOrderPage";

const mocks = vi.hoisted(() => ({
  createProductionOrder: vi.fn(),
  completeProductionOrder: vi.fn(),
  cancelProductionOrder: vi.fn(),
  getProductionOrder: vi.fn(),
  getBOMByProduct: vi.fn(),
  getStockSummary: vi.fn(),
  showToast: vi.fn(),
  routerBack: vi.fn(),
  routerPush: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    back: mocks.routerBack,
    push: mocks.routerPush,
  }),
}));

vi.mock("swr", () => ({
  default: vi.fn((key: any) => {
    if (Array.isArray(key)) {
      return { data: [{ product_id: 1, qty_on_hand: 10 }] };
    }
    if (typeof key === "string" && key.includes("/warehouses")) {
      return { data: [{ id: 10, name: "Main", is_active: true }] };
    }
    return {
      data: [
        { id: 1, name: "FG Product", code: "FG-1" },
        { id: 2, name: "RM Product", code: "RM-1" },
      ],
    };
  }),
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
  createProductionOrder: mocks.createProductionOrder,
  completeProductionOrder: mocks.completeProductionOrder,
  cancelProductionOrder: mocks.cancelProductionOrder,
  getProductionOrder: mocks.getProductionOrder,
  getBOMByProduct: mocks.getBOMByProduct,
  getStockSummary: mocks.getStockSummary,
}));

describe("ProductionOrderPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getBOMByProduct.mockResolvedValue({
      id: 1,
      product_id: 1,
      version: 1,
      created_at: "2026-01-01T00:00:00Z",
      items: [],
      estimated_cost: 0,
    });
  });

  it("creates production order successfully", async () => {
    mocks.createProductionOrder.mockResolvedValue({
      id: 101,
      product_id: 1,
      quantity: 5,
      status: "COMPLETED",
      created_at: "2026-01-01",
      produced_qty: 5,
      items: [{ id: 1, product_id: 2, consumed_qty: 10 }],
    });

    render(React.createElement(ProductionOrderPage, { companyId: "1" }));
    fireEvent.change(screen.getByTestId("searchable-select"), { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText("Enter quantity"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Create Order"));

    await waitFor(() => expect(mocks.createProductionOrder).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/ID:/)).toBeInTheDocument();
  });

  it("renders insufficient stock error", async () => {
    mocks.createProductionOrder.mockRejectedValue(new Error("Insufficient stock"));
    render(React.createElement(ProductionOrderPage, { companyId: "1" }));
    fireEvent.change(screen.getByTestId("searchable-select"), { target: { value: "1" } });
    fireEvent.change(screen.getByPlaceholderText("Enter quantity"), { target: { value: "5" } });
    fireEvent.click(screen.getByText("Create Order"));

    await waitFor(() =>
      expect(screen.getByText("Insufficient stock for one or more BOM components.")).toBeInTheDocument()
    );
  });

  it("fetches order by id and shows consumed items", async () => {
    mocks.getProductionOrder.mockResolvedValue({
      id: 202,
      product_id: 1,
      quantity: 3,
      status: "COMPLETED",
      created_at: "2026-01-01",
      produced_qty: 3,
      items: [{ id: 7, product_id: 2, consumed_qty: 6 }],
    });

    render(React.createElement(ProductionOrderPage, { companyId: "1" }));
    const numberInputs = screen.getAllByRole("spinbutton");
    fireEvent.change(numberInputs[numberInputs.length - 1], { target: { value: "202" } });
    fireEvent.click(screen.getByText("Fetch Order"));
    await waitFor(() => expect(mocks.getProductionOrder).toHaveBeenCalledWith("1", 202));
    expect(screen.getByText("6")).toBeInTheDocument();
  });
});
