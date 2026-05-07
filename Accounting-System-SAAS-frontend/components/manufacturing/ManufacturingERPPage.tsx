"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { downloadCSV } from "@/lib/exportUtils";
import { openPrintWindow } from "@/lib/printReport";
import {
  api,
  approveBOM,
  approveProductionOrder,
  assignManufacturingRole,
  calculateCostingRecord,
  cancelProductionOrder,
  completeProductionOrder,
  confirmCompanyDocument,
  createFinishedGoodsReceiveRecord,
  createMaterialIssue,
  createProductionEntryRecord,
  createProductionOrder,
  createScrapRecord,
  deleteProductionOrder,
  exportManufacturingReport,
  getCompany,
  getCurrentCompany,
  getManufacturingAnalytics,
  getManufacturingDashboard,
  getManufacturingReports,
  getManufacturingSettings,
  listBOMs,
  listCosting,
  listCompanyDocuments,
  listFinishedGoodsReceives,
  listManufacturingRolePresets,
  listManufacturingWip,
  listMaterialIssues,
  listProductionEntries,
  listProductionOrders,
  listScrap,
  processCompanyDocument,
  updateProductionOrder,
  uploadCompanyDocument,
  upsertManufacturingSettings,
  type CompanyDocument,
  type ManufacturingAnalytics,
  type MfgRolePresetsResponse,
} from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { QuickItemModal } from "@/components/production/QuickItemModal";
import { ManageLookupsModal } from "./ManageLookupsModal";

type Section =
  | "dashboard"
  | "bom-master"
  | "production-order"
  | "material-issue"
  | "work-in-progress"
  | "production-entry"
  | "finished-goods-receive"
  | "wastage-scrap"
  | "production-costing"
  | "reports"
  | "settings"
  | "ai-documents";

export function ManufacturingERPPage({ companyId, section }: { companyId: string; section: Section }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [orderId, setOrderId] = useState("");
  const [issueOrderId, setIssueOrderId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("");
  const [orderFromDate, setOrderFromDate] = useState("");
  const [orderToDate, setOrderToDate] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [entryOrderId, setEntryOrderId] = useState("");
  const [entryQty, setEntryQty] = useState("");
  const [fgOrderId, setFgOrderId] = useState("");
  const [fgQty, setFgQty] = useState("");
  const [fgWarehouseId, setFgWarehouseId] = useState("");
  const [fgDepartmentId, setFgDepartmentId] = useState("");
  const [fgProjectId, setFgProjectId] = useState("");
  const [fgSegmentId, setFgSegmentId] = useState("");
  const [scrapType, setScrapType] = useState("");
  const [scrapQty, setScrapQty] = useState("");
  const [costOrderId, setCostOrderId] = useState("");
  const [laborCost, setLaborCost] = useState("");
  const [isCalculating, setIsCalculating] = useState(false);
  const [isSubmittingEntry, setIsSubmittingEntry] = useState(false);
  const [isSubmittingFG, setIsSubmittingFG] = useState(false);
  const [isSubmittingIssue, setIsSubmittingIssue] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // Production order create form
  const [showCreateOrder, setShowCreateOrder] = useState(false);
  const [newOrderProductId, setNewOrderProductId] = useState("");
  const [newOrderQty, setNewOrderQty] = useState("");
  const [newOrderDate, setNewOrderDate] = useState("");
  const [newOrderStatus, setNewOrderStatus] = useState("DRAFT");
  const [newOrderPriority, setNewOrderPriority] = useState("");
  const [newOrderSupervisor, setNewOrderSupervisor] = useState("");
  const [newOrderOperator, setNewOrderOperator] = useState("");
  const [newOrderMachine, setNewOrderMachine] = useState("");
  const [newOrderCompletionDate, setNewOrderCompletionDate] = useState("");

  // Production order edit form
  const [editingOrderId, setEditingOrderId] = useState<number | null>(null);
  const [editOrderProductId, setEditOrderProductId] = useState("");
  const [editOrderQty, setEditOrderQty] = useState("");
  const [editOrderDate, setEditOrderDate] = useState("");
  const [editOrderStatus, setEditOrderStatus] = useState("DRAFT");
  const [editOrderPriority, setEditOrderPriority] = useState("");
  const [editOrderSupervisor, setEditOrderSupervisor] = useState("");
  const [editOrderOperator, setEditOrderOperator] = useState("");
  const [editOrderMachine, setEditOrderMachine] = useState("");
  const [editOrderCompletionDate, setEditOrderCompletionDate] = useState("");
  const [isUpdatingOrder, setIsUpdatingOrder] = useState(false);
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  // Quick item modal state for new products
  const [quickCreateOpen, setQuickCreateOpen] = useState(false);
  const [quickCreateContext, setQuickCreateContext] = useState<"NEW" | "EDIT" | null>(null);

  // Custom options for Production Orders
  const [customStatuses, setCustomStatuses] = useState<string[]>([]);
  const [customPriorities, setCustomPriorities] = useState<string[]>([]);
  const [customSupervisors, setCustomSupervisors] = useState<string[]>([]);
  const [customOperators, setCustomOperators] = useState<string[]>([]);
  const [customMachines, setCustomMachines] = useState<string[]>([]);
  const [customStages, setCustomStages] = useState<string[]>([]);
  const [customRolePresets, setCustomRolePresets] = useState<Record<string, Record<string, string>>>({});
  const [customRolePermissions, setCustomRolePermissions] = useState<Record<string, string>>({});
  const [manageLookupsOpen, setManageLookupsOpen] = useState(false);

  const MFG_MENUS = [
    "manufacturing.dashboard",
    "manufacturing.bom_master",
    "manufacturing.production_order",
    "manufacturing.material_issue",
    "manufacturing.work_in_progress",
    "manufacturing.production_entry",
    "manufacturing.finished_goods_receive",
    "manufacturing.wastage_scrap",
    "manufacturing.production_costing",
    "manufacturing.reports",
    "manufacturing.settings",
    "manufacturing.ai_documents"
  ];

  useEffect(() => {
    try {
      const storedS = localStorage.getItem("mfgCustomStatuses");
      const storedP = localStorage.getItem("mfgCustomPriorities");
      const storedSup = localStorage.getItem("mfgCustomSupervisors");
      const storedOp = localStorage.getItem("mfgCustomOperators");
      const storedMa = localStorage.getItem("mfgCustomMachines");
      const storedSt = localStorage.getItem("mfgCustomStages");
      const storedRP = localStorage.getItem("mfgCustomRolePresets");
      if (storedS) setCustomStatuses(JSON.parse(storedS));
      if (storedP) setCustomPriorities(JSON.parse(storedP));
      if (storedSup) setCustomSupervisors(JSON.parse(storedSup));
      if (storedOp) setCustomOperators(JSON.parse(storedOp));
      if (storedMa) setCustomMachines(JSON.parse(storedMa));
      if (storedSt) setCustomStages(JSON.parse(storedSt));
      if (storedRP) setCustomRolePresets(JSON.parse(storedRP));
    } catch (e) {}
  }, []);

  const saveCustomLookups = (type: "STATUS" | "PRIORITY" | "SUPERVISOR" | "OPERATOR" | "MACHINE" | "STAGE" | "ROLE_PRESET", items: any) => {
    try {
      if (type === "STATUS") {
        setCustomStatuses(items);
        localStorage.setItem("mfgCustomStatuses", JSON.stringify(items));
      } else if (type === "PRIORITY") {
        setCustomPriorities(items);
        localStorage.setItem("mfgCustomPriorities", JSON.stringify(items));
      } else if (type === "SUPERVISOR") {
        setCustomSupervisors(items);
        localStorage.setItem("mfgCustomSupervisors", JSON.stringify(items));
      } else if (type === "OPERATOR") {
        setCustomOperators(items);
        localStorage.setItem("mfgCustomOperators", JSON.stringify(items));
      } else if (type === "MACHINE") {
        setCustomMachines(items);
        localStorage.setItem("mfgCustomMachines", JSON.stringify(items));
      } else if (type === "STAGE") {
        setCustomStages(items);
        localStorage.setItem("mfgCustomStages", JSON.stringify(items));
      } else {
        setCustomRolePresets(items);
        localStorage.setItem("mfgCustomRolePresets", JSON.stringify(items));
      }
    } catch (e) {}
  };

  // Production entry extra fields
  const [entryRejectedQty, setEntryRejectedQty] = useState("");
  const [entryDamagedQty, setEntryDamagedQty] = useState("");
  const [entryExtraConsumption, setEntryExtraConsumption] = useState("");
  const [entryStage, setEntryStage] = useState("");
  const [entryNotes, setEntryNotes] = useState("");

  // Scrap extra fields
  const [scrapReason, setScrapReason] = useState("");
  const [scrapRecoverable, setScrapRecoverable] = useState(false);
  const [scrapSaleable, setScrapSaleable] = useState(false);
  const [scrapOrderId, setScrapOrderId] = useState("");

  // Production costing extra fields
  const [machineCost, setMachineCost] = useState("");
  const [electricityCost, setElectricityCost] = useState("");
  const [packingCost, setPackingCost] = useState("");
  const [overheadCost, setOverheadCost] = useState("");
  const [salesValue, setSalesValue] = useState("");

  // Quick-action state for production order rows
  const [quickActionOrderId, setQuickActionOrderId] = useState<number | null>(null);
  const [isCompletingOrder, setIsCompletingOrder] = useState(false);
  const [isCancellingOrder, setIsCancellingOrder] = useState(false);

  // AI Documents
  const [aiTab, setAiTab] = useState<"scanner" | "reorder" | "wastage" | "profitability" | "roles">("scanner");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessingDocId, setIsProcessingDocId] = useState<number | null>(null);
  const [isConfirmingDocId, setIsConfirmingDocId] = useState<number | null>(null);
  const [roleAssignUserId, setRoleAssignUserId] = useState("");
  const [roleAssignRole, setRoleAssignRole] = useState("factory_manager");
  const [isAssigningRole, setIsAssigningRole] = useState(false);

  // Settings form
  const [settingsCostingMethod, setSettingsCostingMethod] = useState("AUTO");
  const [settingsApprovalRequired, setSettingsApprovalRequired] = useState(true);
  const [settingsAiEnabled, setSettingsAiEnabled] = useState(false);
  const [settingsWipLedger, setSettingsWipLedger] = useState("");
  const [settingsFgLedger, setSettingsFgLedger] = useState("");
  const [settingsRmLedger, setSettingsRmLedger] = useState("");
  const [settingsWarehouse, setSettingsWarehouse] = useState("");
  const [reportKey, setReportKey] = useState("production_register");
  const [reportSearch, setReportSearch] = useState("");
  const [bomSearch, setBomSearch] = useState("");
  const [bomStatusFilter, setBomStatusFilter] = useState("");
  const [previewBomId, setPreviewBomId] = useState<number | null>(null);
  const [columnFilterKey, setColumnFilterKey] = useState("");
  const [columnFilterValue, setColumnFilterValue] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const { data: dashboard } = useSWR(section === "dashboard" ? ["mfg-dash", companyId] : null, () =>
    getManufacturingDashboard(companyId)
  );
  const { data: boms, mutate: mutateBom } = useSWR(section === "bom-master" ? ["mfg-bom", companyId] : null, () =>
    listBOMs(companyId)
  );
  const { data: orders, mutate: mutateOrders } = useSWR(
    section === "production-order" ||
    section === "material-issue" ||
    section === "production-entry" ||
    section === "finished-goods-receive" ||
    section === "production-costing" ||
    section === "wastage-scrap"
      ? ["mfg-orders", companyId, orderFromDate, orderToDate]
      : null,
    () =>
      listProductionOrders(companyId, {
        ...(orderFromDate ? { from_date: orderFromDate } : {}),
        ...(orderToDate ? { to_date: orderToDate } : {}),
      })
  );

  const derivedSupervisors = Array.from(new Set([...customSupervisors, ...(orders || []).map((o: any) => o.supervisor_name).filter(Boolean)]));
  const derivedStatuses = Array.from(new Set(["DRAFT", "APPROVED", "RUNNING", "RELEASED", "COMPLETED", "CANCELLED", ...customStatuses, ...(orders || []).map((o: any) => o.status).filter(Boolean)]));
  const derivedPriorities = Array.from(new Set(["NORMAL", "HIGH", "URGENT", "LOW", ...customPriorities, ...(orders || []).map((o: any) => o.priority).filter(Boolean)]));
  const derivedOperators = Array.from(new Set([...customOperators, ...(orders || []).map((o: any) => o.operator).filter(Boolean)]));
  const derivedMachines = Array.from(new Set([...customMachines, ...(orders || []).map((o: any) => o.machine).filter(Boolean)]));
  const derivedStages = Array.from(new Set(["MIXING", "CUTTING", "ASSEMBLY", "PACKAGING", "TESTING", "QUALITY_CHECK", ...customStages]));

  const { data: wip } = useSWR(section === "work-in-progress" ? ["mfg-wip", companyId] : null, () =>
    listManufacturingWip(companyId)
  );
  const { data: entries, mutate: mutateEntries } = useSWR(section === "production-entry" ? ["mfg-entry", companyId] : null, () =>
    listProductionEntries(companyId)
  );
  const { data: fg, mutate: mutateFG } = useSWR(section === "finished-goods-receive" ? ["mfg-fg", companyId] : null, () =>
    listFinishedGoodsReceives(companyId)
  );
  const { data: scrap } = useSWR(section === "wastage-scrap" ? ["mfg-scrap", companyId] : null, () =>
    listScrap(companyId)
  );
  const { data: costing, mutate: mutateCosting } = useSWR(section === "production-costing" ? ["mfg-costing", companyId] : null, () =>
    listCosting(companyId)
  );
  const { data: reports } = useSWR(section === "reports" ? ["mfg-reports", companyId, fromDate, toDate] : null, () =>
    getManufacturingReports(companyId, {
      ...(fromDate ? { from_date: fromDate } : {}),
      ...(toDate ? { to_date: toDate } : {}),
    })
  );
  const { data: issues, mutate: mutateIssues } = useSWR(section === "material-issue" ? ["mfg-issues", companyId] : null, () =>
    listMaterialIssues(companyId)
  );
  const { data: settingsData, mutate: mutateSettings } = useSWR(
    section === "settings" ? ["mfg-settings", companyId] : null,
    () => getManufacturingSettings(companyId),
    {
      onSuccess: (data) => {
        if (data) {
          setSettingsCostingMethod(data.costing_method || "AUTO");
          setSettingsApprovalRequired(data.approval_required ?? true);
          setSettingsAiEnabled(data.ai_predictions_enabled ?? false);
          setSettingsWipLedger(data.default_wip_ledger_id ? String(data.default_wip_ledger_id) : "");
          setSettingsFgLedger(data.default_fg_ledger_id ? String(data.default_fg_ledger_id) : "");
          setSettingsRmLedger(data.default_rm_ledger_id ? String(data.default_rm_ledger_id) : "");
          setSettingsWarehouse(data.default_warehouse_id ? String(data.default_warehouse_id) : "");
        }
      },
    }
  );
  const { data: aiDocuments, mutate: mutateAiDocs } = useSWR(
    section === "ai-documents" ? ["mfg-ai-docs", companyId] : null,
    () => listCompanyDocuments(companyId)
  );
  const { data: analytics, mutate: mutateAnalytics } = useSWR(
    section === "ai-documents" ? ["mfg-analytics", companyId] : null,
    () => getManufacturingAnalytics(companyId)
  );
  const { data: rolePresets } = useSWR(
    section === "ai-documents" ? ["mfg-role-presets", companyId] : null,
    () => listManufacturingRolePresets(companyId)
  );
  const { data: company } = useSWR(["mfg-company", companyId], () => getCompany(companyId));
  const needsItems =
    section === "bom-master" ||
    section === "production-order" ||
    section === "material-issue" ||
    section === "work-in-progress" ||
    section === "production-entry" ||
    section === "wastage-scrap" ||
    section === "production-costing";
  const { data: items, mutate: mutateItems } = useSWR(
    needsItems ? ["mfg-items", companyId] : null,
    async () => {
      const res = await api.get(`/inventory/companies/${companyId}/items`);
      return res.data as Array<{ id: number; name?: string; code?: string | null }>;
    }
  );
  const itemNameById = new Map<number, string>(
    (items || []).map((it) => [Number(it.id), [it.name, it.code].filter(Boolean).join(" | ") || `#${it.id}`])
  );

  const onApproveBom = async (id: number) => {
    await approveBOM(companyId, id);
    showToast({ title: "BOM approved", variant: "success" });
    mutateBom();
  };

  const onApproveOrder = async () => {
    const id = Number(orderId);
    if (!(id > 0)) return;
    await approveProductionOrder(companyId, id);
    showToast({ title: "Order approved", variant: "success" });
    mutateOrders();
  };

  const onCompleteOrder = async (id: number) => {
    try {
      setIsCompletingOrder(true);
      setQuickActionOrderId(id);
      await completeProductionOrder(companyId, id);
      showToast({ title: "Order completed", variant: "success" });
      mutateOrders();
    } catch (err: any) {
      showToast({ title: "Complete failed", description: err.response?.data?.detail || "Error", variant: "destructive" });
    } finally {
      setIsCompletingOrder(false);
      setQuickActionOrderId(null);
    }
  };

  const onCancelOrder = async (id: number) => {
    try {
      setIsCancellingOrder(true);
      setQuickActionOrderId(id);
      await cancelProductionOrder(companyId, id);
      showToast({ title: "Order cancelled", variant: "success" });
      mutateOrders();
    } catch (err: any) {
      showToast({ title: "Cancel failed", description: err.response?.data?.detail || "Error", variant: "destructive" });
    } finally {
      setIsCancellingOrder(false);
      setQuickActionOrderId(null);
    }
  };

  const handleEditClick = (order: any) => {
    setEditingOrderId(order.id);
    setEditOrderProductId(String(order.product_id || ""));
    setEditOrderQty(String(order.quantity || ""));
    setEditOrderDate(order.order_date ? String(order.order_date).slice(0, 10) : "");
    setEditOrderStatus(order.status || "DRAFT");
    setEditOrderPriority(order.priority || "");
    setEditOrderSupervisor(order.supervisor_name || "");
    setEditOrderOperator(order.operator || "");
    setEditOrderMachine(order.machine || "");
    setEditOrderCompletionDate(order.expected_completion_date ? String(order.expected_completion_date).slice(0, 10) : "");
  };

  const onUpdateOrder = async () => {
    if (!editingOrderId) return;
    try {
      setIsUpdatingOrder(true);
      await updateProductionOrder(companyId, editingOrderId, {
        product_id: Number(editOrderProductId),
        quantity: Number(editOrderQty),
        ...(editOrderDate ? { order_date: editOrderDate } : {}),
        status: editOrderStatus || "DRAFT",
        ...(editOrderPriority ? { priority: editOrderPriority } : {}),
        ...(editOrderSupervisor ? { supervisor_name: editOrderSupervisor } : {}),
        ...(editOrderOperator ? { operator: editOrderOperator } : {}),
        ...(editOrderMachine ? { machine: editOrderMachine } : {}),
        ...(editOrderCompletionDate ? { expected_completion_date: editOrderCompletionDate } : {}),
      });
      showToast({ title: "Order updated", variant: "success" });
      mutateOrders();
      setEditingOrderId(null);
    } catch (err: any) {
      showToast({ title: "Update failed", description: err.response?.data?.detail || "Error", variant: "destructive" });
    } finally {
      setIsUpdatingOrder(false);
    }
  };

  const onDeleteOrder = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this order?")) return;
    try {
      setIsDeletingOrder(true);
      setQuickActionOrderId(id);
      await deleteProductionOrder(companyId, id);
      showToast({ title: "Order deleted", variant: "success" });
      mutateOrders();
    } catch (err: any) {
      showToast({ title: "Delete failed", description: err.response?.data?.detail || "Error", variant: "destructive" });
    } finally {
      setIsDeletingOrder(false);
      setQuickActionOrderId(null);
    }
  };

  const onCreateIssue = async () => {
    const id = Number(issueOrderId);
    if (!(id > 0)) return;
    await createMaterialIssue(companyId, { production_order_id: id });
    showToast({ title: "Material issue created", variant: "success" });
  };

  const downloadJson = (filename: string, data: unknown) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadBlob = (filename: string, blob: Blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };
  const escapeHtml = (value: unknown) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const buildPrintableTableHtml = (columns: string[], rows: any[]) => {
    if (!columns.length) return "<p>No printable data available.</p>";
    const head = `<thead><tr>${columns.map((c) => `<th>${escapeHtml(c)}</th>`).join("")}</tr></thead>`;
    const bodyRows = rows
      .map(
        (row) =>
          `<tr>${columns
            .map((c) => `<td>${escapeHtml(row?.[c])}</td>`)
            .join("")}</tr>`
      )
      .join("");
    const body = `<tbody>${bodyRows || `<tr><td colspan="${columns.length}">No data</td></tr>`}</tbody>`;
    return `<table>${head}${body}</table>`;
  };

  const selectedRows: any[] = (reports?.[reportKey] || []) as any[];
  const filteredRows = !reportSearch.trim()
    ? selectedRows
    : selectedRows.filter((row) =>
        Object.values(row || {}).some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(reportSearch.trim().toLowerCase())
        )
      );
  const columnFilteredRows =
    columnFilterKey && columnFilterValue.trim()
      ? filteredRows.filter((row) =>
          String(row?.[columnFilterKey] ?? "")
            .toLowerCase()
            .includes(columnFilterValue.trim().toLowerCase())
        )
      : filteredRows;
  const sortedRows = [...columnFilteredRows].sort((a, b) => {
    if (!sortColumn) return 0;
    const av = String(a?.[sortColumn] ?? "");
    const bv = String(b?.[sortColumn] ?? "");
    const cmp = av.localeCompare(bv, undefined, { numeric: true, sensitivity: "base" });
    return sortDir === "asc" ? cmp : -cmp;
  });
  const reportColumns = filteredRows.length
    ? Object.keys(filteredRows[0] || {})
    : selectedRows.length
    ? Object.keys(selectedRows[0] || {})
    : [];
  const filteredBoms = (boms || []).filter((bom: any) => {
    const matchesSearch =
      !bomSearch.trim() ||
      String(bom?.id ?? "").includes(bomSearch.trim()) ||
      String(bom?.bom_code ?? "")
        .toLowerCase()
        .includes(bomSearch.trim().toLowerCase()) ||
      String(bom?.product_id ?? "").includes(bomSearch.trim());
    const status = String(bom?.approval_status || "DRAFT").toUpperCase();
    const matchesStatus = !bomStatusFilter || status === bomStatusFilter;
    return matchesSearch && matchesStatus;
  });
  const approvedBomCount = filteredBoms.filter((b: any) => String(b?.approval_status || "").toUpperCase() === "APPROVED").length;
  const draftBomCount = filteredBoms.length - approvedBomCount;

  return (
    <div className="space-y-4 max-w-6xl">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Manufacturing ERP</h1>
            <p className="text-xs text-slate-500 mt-1">Integrated production, WIP, costing, scrap and controls.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.back()}>
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M17 10a1 1 0 01-1 1H6.414l3.293 3.293a1 1 0 01-1.414 1.414l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L6.414 9H16a1 1 0 011 1z" clipRule="evenodd" />
              </svg>
              Back
            </Button>
            <Button type="button" variant="ghost" onClick={() => router.push(`/companies/${companyId}`)}>
              <svg className="w-4 h-4 mr-1.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
              Close
            </Button>
          </div>
        </div>
      </div>

      {section === "dashboard" && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <StatCard title="Today Production" value={dashboard?.today_production ?? 0} />
          <StatCard title="Pending Orders" value={dashboard?.pending_orders ?? 0} />
          <StatCard title="Monthly Output" value={dashboard?.monthly_output ?? 0} />
          <StatCard title="Material Shortage" value={dashboard?.material_shortage ?? 0} />
          <StatCard title="Wastage Qty" value={dashboard?.wastage_qty ?? 0} />
        </div>
      )}

      {section === "bom-master" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">BOM Master</p>
              <p className="text-xs text-slate-500">Professional queue for approval and review.</p>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                Approved: {approvedBomCount}
              </span>
              <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                Pending: {draftBomCount}
              </span>
              <Button
                size="sm"
                onClick={() => router.push(`/companies/${companyId}/inventory/bom`)}
              >
                <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                New BOM
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block text-xs mb-1">Search BOM</label>
              <Input value={bomSearch} onChange={(e) => setBomSearch(e.target.value)} placeholder="BOM ID / Code / Product ID" />
            </div>
            <div>
              <label className="block text-xs mb-1">Approval Status</label>
              <select
                className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
                value={bomStatusFilter}
                onChange={(e) => setBomStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            {filteredBoms.slice(0, 30).map((row: any) => {
              const status = String(row.approval_status || "DRAFT").toUpperCase();
              const statusClass =
                status === "APPROVED"
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300";
              const isOpen = previewBomId === Number(row.id);
              const estimatedComponentCost = (row.items || []).reduce((acc: number, it: any) => {
                const comp = (items || []).find((p) => Number(p.id) === Number(it.component_product_id));
                const qty = Number(it.quantity || 0);
                const wastage = Number(it.wastage_percent || 0);
                const grossQty = qty + (qty * wastage) / 100;
                const rate = Number((comp as any)?.default_purchase_rate || 0);
                return acc + grossQty * rate;
              }, 0);
              const batchSize = Number(row.batch_size || 0);
              const fgUnitCost = batchSize > 0 ? estimatedComponentCost / batchSize : 0;
              return (
                <div
                  key={row.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2 text-xs"
                >
                  <div className="w-full flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-slate-800 dark:text-slate-100">BOM #{row.id}</span>
                      <span className="text-slate-500">
                        Product: {itemNameById.get(Number(row.product_id)) || `#${row.product_id}`}
                      </span>
                      {row.bom_code ? <span className="text-slate-500">Code: {row.bom_code}</span> : null}
                      <span className={`px-2 py-0.5 rounded-full ${statusClass}`}>{status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          router.push(`/companies/${companyId}/inventory/bom?bomId=${row.id}&productId=${row.product_id}`)
                        }
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPreviewBomId(isOpen ? null : Number(row.id))}
                      >
                        {isOpen ? "Hide Preview" : "Preview"}
                      </Button>
                      <Button size="sm" variant={status === "APPROVED" ? "outline" : "default"} onClick={() => onApproveBom(row.id)} disabled={status === "APPROVED"}>
                        {status === "APPROVED" ? "Approved" : "Approve"}
                      </Button>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="w-full mt-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">
                      <div className="flex flex-wrap gap-3 text-[11px] text-slate-600 dark:text-slate-300 mb-2">
                        <span>Version: <strong>{row.version ?? "-"}</strong></span>
                        <span>Estimated Cost: <strong>{Number(row.estimated_cost || 0).toFixed(2)}</strong></span>
                        {row.batch_size != null && <span>Batch Size: <strong>{row.batch_size}</strong></span>}
                        <span>FG Unit Cost: <strong>{fgUnitCost.toFixed(4)}</strong></span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-[11px]">
                          <thead className="bg-slate-50 dark:bg-slate-800/50">
                            <tr>
                              <th className="text-left px-2 py-1">Component</th>
                              <th className="text-right px-2 py-1">Qty</th>
                              <th className="text-right px-2 py-1">Qty + Wastage</th>
                              <th className="text-left px-2 py-1">Unit</th>
                              <th className="text-right px-2 py-1">Wastage %</th>
                              <th className="text-right px-2 py-1">Rate</th>
                              <th className="text-right px-2 py-1">Line Cost</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(row.items || []).map((it: any) => {
                              const comp = (items || []).find((p) => Number(p.id) === Number(it.component_product_id));
                              const qty = Number(it.quantity || 0);
                              const wastage = Number(it.wastage_percent || 0);
                              const grossQty = qty + (qty * wastage) / 100;
                              const rate = Number((comp as any)?.default_purchase_rate || 0);
                              const lineCost = grossQty * rate;
                              return (
                                <tr key={it.id} className="border-t border-slate-100 dark:border-slate-800">
                                  <td className="px-2 py-1">
                                    {(comp as any)?.name || `#${it.component_product_id}`}
                                  </td>
                                  <td className="px-2 py-1 text-right">{qty.toFixed(3)}</td>
                                  <td className="px-2 py-1 text-right">{grossQty.toFixed(3)}</td>
                                  <td className="px-2 py-1">{it.unit || (comp as any)?.unit || "-"}</td>
                                  <td className="px-2 py-1 text-right">{wastage.toFixed(2)}</td>
                                  <td className="px-2 py-1 text-right">{rate.toFixed(2)}</td>
                                  <td className="px-2 py-1 text-right">{lineCost.toFixed(2)}</td>
                                </tr>
                              );
                            })}
                            {(row.items || []).length === 0 && (
                              <tr>
                                <td colSpan={7} className="px-2 py-2 text-center text-slate-500">No BOM lines found.</td>
                              </tr>
                            )}
                            {(row.items || []).length > 0 && (
                              <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40">
                                <td colSpan={6} className="px-2 py-1 text-right font-semibold">Estimated Component Cost</td>
                                <td className="px-2 py-1 text-right font-semibold">
                                  {estimatedComponentCost.toFixed(2)}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {filteredBoms.length === 0 && <div className="text-xs text-slate-500 py-3 text-center">No BOM records found for current filters.</div>}
          </div>
        </div>
      )}

      {section === "production-order" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Production Orders</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setManageLookupsOpen(true)}>
                Manage Lookups
              </Button>
              <Button size="sm" onClick={() => setShowCreateOrder((v) => !v)}>
                {showCreateOrder ? "Cancel" : "+ New Order"}
              </Button>
            </div>
          </div>

          {showCreateOrder && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3 mb-4">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Create Production Order</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block mb-1">Finished Good *</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={newOrderProductId}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        setQuickCreateContext("NEW");
                        setQuickCreateOpen(true);
                        setNewOrderProductId("");
                      } else {
                        setNewOrderProductId(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Product</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Product</option>
                    {(items || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.code || `#${p.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Planned Qty *</label>
                  <Input value={newOrderQty} onChange={(e) => setNewOrderQty(e.target.value)} type="number" min={0} step="any" placeholder="0" />
                </div>
                <div>
                  <label className="block mb-1">Order Date</label>
                  <Input type="date" value={newOrderDate} onChange={(e) => setNewOrderDate(e.target.value)} />
                </div>
                <div>
                  <label className="block mb-1">Status</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={newOrderStatus}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new status:");
                        if (val) {
                          saveCustomLookups("STATUS", [...customStatuses, val.toUpperCase()]);
                          setNewOrderStatus(val.toUpperCase());
                        } else setNewOrderStatus("DRAFT");
                      } else {
                        setNewOrderStatus(e.target.value);
                      }
                    }}
                  >
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Status</option>
                    {derivedStatuses.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Priority</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={newOrderPriority}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new priority:");
                        if (val) {
                          saveCustomLookups("PRIORITY", [...customPriorities, val.toUpperCase()]);
                          setNewOrderPriority(val.toUpperCase());
                        } else setNewOrderPriority("");
                      } else {
                        setNewOrderPriority(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Priority</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Priority</option>
                    {derivedPriorities.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Supervisor</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={newOrderSupervisor}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new supervisor name:");
                        if (val) {
                          saveCustomLookups("SUPERVISOR", [...customSupervisors, val]);
                          setNewOrderSupervisor(val);
                        } else setNewOrderSupervisor("");
                      } else {
                        setNewOrderSupervisor(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Supervisor</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Supervisor</option>
                    {derivedSupervisors.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Expected Completion</label>
                  <Input type="date" value={newOrderCompletionDate} onChange={(e) => setNewOrderCompletionDate(e.target.value)} />
                </div>
                <div>
                  <label className="block mb-1">Operator</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={newOrderOperator}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new operator name:");
                        if (val) {
                          saveCustomLookups("OPERATOR", [...customOperators, val]);
                          setNewOrderOperator(val);
                        } else setNewOrderOperator("");
                      } else {
                        setNewOrderOperator(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Operator</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Operator</option>
                    {derivedOperators.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Machine</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={newOrderMachine}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new machine name:");
                        if (val) {
                          saveCustomLookups("MACHINE", [...customMachines, val]);
                          setNewOrderMachine(val);
                        } else setNewOrderMachine("");
                      } else {
                        setNewOrderMachine(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Machine</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Machine</option>
                    {derivedMachines.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
              </div>
              <Button
                size="sm"
                disabled={isCreatingOrder || !newOrderProductId || !newOrderQty}
                onClick={async () => {
                  try {
                    setIsCreatingOrder(true);
                    await createProductionOrder(companyId, {
                      product_id: Number(newOrderProductId),
                      quantity: Number(newOrderQty),
                      ...(newOrderDate ? { order_date: newOrderDate } : {}),
                      status: newOrderStatus || "DRAFT",
                      ...(newOrderPriority ? { priority: newOrderPriority } : {}),
                      ...(newOrderSupervisor ? { supervisor_name: newOrderSupervisor } : {}),
                      ...(newOrderOperator ? { operator: newOrderOperator } : {}),
                      ...(newOrderMachine ? { machine: newOrderMachine } : {}),
                      ...(newOrderCompletionDate ? { expected_completion_date: newOrderCompletionDate } : {}),
                    });
                    mutateOrders();
                    setShowCreateOrder(false);
                    setNewOrderProductId("");
                    setNewOrderQty("");
                    setNewOrderDate("");
                    setNewOrderStatus("DRAFT");
                    setNewOrderPriority("");
                    setNewOrderSupervisor("");
                    setNewOrderOperator("");
                    setNewOrderMachine("");
                    setNewOrderCompletionDate("");
                    showToast({ title: "Production order created", variant: "success" });
                  } catch (err: any) {
                    const msg = err.response?.data?.detail || "Failed to create order";
                    showToast({ title: "Create failed", description: msg, variant: "destructive" });
                  } finally {
                    setIsCreatingOrder(false);
                  }
                }}
              >
                {isCreatingOrder ? "Creating..." : "Create Order"}
              </Button>
            </div>
          )}

          {editingOrderId && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3 mb-4">
              <div className="flex justify-between items-center">
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Edit Production Order #{editingOrderId}</p>
                <button type="button" onClick={() => setEditingOrderId(null)} className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
                  Cancel Edit
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                <div>
                  <label className="block mb-1">Finished Good *</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={editOrderProductId}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        setQuickCreateContext("EDIT");
                        setQuickCreateOpen(true);
                        setEditOrderProductId("");
                      } else {
                        setEditOrderProductId(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Product</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Product</option>
                    {(items || []).map((p: any) => (
                      <option key={p.id} value={p.id}>
                        {p.name || p.code || `#${p.id}`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Planned Qty *</label>
                  <Input value={editOrderQty} onChange={(e) => setEditOrderQty(e.target.value)} type="number" min={0} step="any" placeholder="0" />
                </div>
                <div>
                  <label className="block mb-1">Order Date</label>
                  <Input type="date" value={editOrderDate} onChange={(e) => setEditOrderDate(e.target.value)} />
                </div>
                <div>
                  <label className="block mb-1">Status</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={editOrderStatus}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new status:");
                        if (val) {
                          saveCustomLookups("STATUS", [...customStatuses, val.toUpperCase()]);
                          setEditOrderStatus(val.toUpperCase());
                        }
                      } else {
                        setEditOrderStatus(e.target.value);
                      }
                    }}
                  >
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Status</option>
                    {derivedStatuses.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Priority</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={editOrderPriority}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new priority:");
                        if (val) {
                          saveCustomLookups("PRIORITY", [...customPriorities, val.toUpperCase()]);
                          setEditOrderPriority(val.toUpperCase());
                        }
                      } else {
                        setEditOrderPriority(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Priority</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Priority</option>
                    {derivedPriorities.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Supervisor</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={editOrderSupervisor}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new supervisor name:");
                        if (val) {
                          saveCustomLookups("SUPERVISOR", [...customSupervisors, val]);
                          setEditOrderSupervisor(val);
                        }
                      } else {
                        setEditOrderSupervisor(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Supervisor</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Supervisor</option>
                    {derivedSupervisors.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Expected Completion</label>
                  <Input type="date" value={editOrderCompletionDate} onChange={(e) => setEditOrderCompletionDate(e.target.value)} />
                </div>
                <div>
                  <label className="block mb-1">Operator</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={editOrderOperator}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new operator name:");
                        if (val) {
                          saveCustomLookups("OPERATOR", [...customOperators, val]);
                          setEditOrderOperator(val);
                        }
                      } else {
                        setEditOrderOperator(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Operator</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Operator</option>
                    {derivedOperators.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1">Machine</label>
                  <select
                    className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-sm"
                    value={editOrderMachine}
                    onChange={(e) => {
                      if (e.target.value === "ADD_NEW") {
                        const val = prompt("Enter new machine name:");
                        if (val) {
                          saveCustomLookups("MACHINE", [...customMachines, val]);
                          setEditOrderMachine(val);
                        }
                      } else {
                        setEditOrderMachine(e.target.value);
                      }
                    }}
                  >
                    <option value="">Select Machine</option>
                    <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Machine</option>
                    {derivedMachines.map(s => <option key={s} value={s as string}>{s as string}</option>)}
                  </select>
                </div>
              </div>
              <Button
                size="sm"
                disabled={isUpdatingOrder || !editOrderProductId || !editOrderQty}
                onClick={onUpdateOrder}
              >
                {isUpdatingOrder ? "Updating..." : "Update Order"}
              </Button>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <div>
              <label className="block text-xs mb-1">Search Order No</label>
              <Input value={orderSearch} onChange={(e) => setOrderSearch(e.target.value)} placeholder="e.g. PO-00012" />
            </div>
            <div>
              <label className="block text-xs mb-1">Status</label>
              <select
                className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
                value={orderStatusFilter}
                onChange={(e) => setOrderStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                <option value="DRAFT">Draft</option>
                <option value="APPROVED">Approved</option>
                <option value="RUNNING">Running</option>
                <option value="RELEASED">Released</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1">From</label>
              <Input type="date" value={orderFromDate} onChange={(e) => setOrderFromDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs mb-1">To</label>
              <Input type="date" value={orderToDate} onChange={(e) => setOrderToDate(e.target.value)} />
            </div>
          </div>
          <div className="flex gap-2 items-end">
            <div>
              <label className="block text-xs mb-1">Order ID to Approve</label>
              <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} type="number" min={1} />
            </div>
            <Button onClick={onApproveOrder}>Approve Order</Button>
          </div>
          <div className="text-xs text-slate-500">Matched Orders: {(orders || []).length}</div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left px-2 py-2 font-semibold">Order No</th>
                  <th className="text-left px-2 py-2 font-semibold">Product</th>
                  <th className="text-right px-2 py-2 font-semibold">Qty</th>
                  <th className="text-left px-2 py-2 font-semibold">Date</th>
                  <th className="text-left px-2 py-2 font-semibold">Priority</th>
                  <th className="text-left px-2 py-2 font-semibold">Supervisor</th>
                  <th className="text-left px-2 py-2 font-semibold">Status</th>
                  <th className="text-left px-2 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(orders || []).slice(0, 30).map((o: any) => {
                  const isActive = quickActionOrderId === Number(o.id);
                  const canComplete = ["DRAFT", "RELEASED", "APPROVED"].includes(o.status);
                  const canCancel = ["DRAFT", "RELEASED"].includes(o.status);
                  return (
                  <tr key={o.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="px-2 py-1.5 font-medium">{o.order_no || `#${o.id}`}</td>
                    <td className="px-2 py-1.5">{itemNameById.get(Number(o.product_id)) || `Item #${o.product_id}`}</td>
                    <td className="px-2 py-1.5 text-right">{Number(o.quantity).toFixed(2)}</td>
                    <td className="px-2 py-1.5">{o.order_date ? String(o.order_date).slice(0, 10) : "-"}</td>
                    <td className="px-2 py-1.5">
                      {o.priority ? (
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                          o.priority === "URGENT" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                          : o.priority === "HIGH" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300"
                          : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}>{o.priority}</span>
                      ) : "-"}
                    </td>
                    <td className="px-2 py-1.5">{o.supervisor_name || "-"}</td>
                    <td className="px-2 py-1.5">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                        o.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : o.status === "CANCELLED"
                          ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300"
                          : o.status === "RUNNING"
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                          : o.status === "APPROVED"
                          ? "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      }`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleEditClick(o)}
                          className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
                        >
                          Edit
                        </button>
                        {o.status === "DRAFT" && (
                          <button
                            type="button"
                            disabled={isActive && isDeletingOrder}
                            onClick={() => onDeleteOrder(Number(o.id))}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 disabled:opacity-50"
                          >
                            {isActive && isDeletingOrder ? "…" : "Delete"}
                          </button>
                        )}
                        {canComplete && (
                          <button
                            type="button"
                            disabled={isActive && isCompletingOrder}
                            onClick={() => onCompleteOrder(Number(o.id))}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 disabled:opacity-50"
                          >
                            {isActive && isCompletingOrder ? "…" : "Complete"}
                          </button>
                        )}
                        {canCancel && (
                          <button
                            type="button"
                            disabled={isActive && isCancellingOrder}
                            onClick={() => onCancelOrder(Number(o.id))}
                            className="px-2 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700 hover:bg-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:hover:bg-rose-900/50 disabled:opacity-50"
                          >
                            {isActive && isCancellingOrder ? "…" : "Cancel"}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
                {(orders || []).length === 0 && (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-slate-500">No production orders found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "material-issue" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Material Issue</p>
          <p className="text-xs text-slate-500">Issue raw materials from store to production. Creates WIP accounting entry (Dr WIP / Cr Raw Material).</p>
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block text-xs mb-1">Production Order *</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                value={issueOrderId}
                onChange={(e) => setIssueOrderId(e.target.value)}
              >
                <option value="">Select Order</option>
                {(orders || []).filter((o: any) => ["DRAFT","APPROVED","RELEASED"].includes(o.status)).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.order_no || `#${o.id}`} — {itemNameById.get(Number(o.product_id)) || `Item ${o.product_id}`} ({o.status})
                  </option>
                ))}
              </select>
            </div>
            <Button disabled={isSubmittingIssue || !issueOrderId} onClick={async () => {
              try {
                setIsSubmittingIssue(true);
                await onCreateIssue();
                mutateIssues();
              } catch (err: any) {
                const msg = err.response?.data?.detail || "Failed to issue material";
                showToast({ title: "Issue failed", description: msg, variant: "destructive" });
              } finally {
                setIsSubmittingIssue(false);
              }
            }}>
              {isSubmittingIssue ? "Issuing..." : "Issue Material"}
            </Button>
          </div>
          {(issues || []).length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left px-2 py-2 font-semibold">Issue No</th>
                    <th className="text-left px-2 py-2 font-semibold">Order</th>
                    <th className="text-left px-2 py-2 font-semibold">Date</th>
                    <th className="text-right px-2 py-2 font-semibold">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {(issues || []).slice(0, 30).map((iss: any) => (
                    <tr key={iss.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5 font-medium">{iss.issue_no}</td>
                      <td className="px-2 py-1.5">#{iss.production_order_id}</td>
                      <td className="px-2 py-1.5">{String(iss.issue_date).slice(0, 10)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(iss.total_value).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {(issues || []).length === 0 && (
            <p className="text-xs text-slate-500 text-center py-3">No material issues recorded yet.</p>
          )}
        </div>
      )}

      {section === "work-in-progress" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Work In Progress</p>
          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="text-left px-2 py-2 font-semibold">Order No</th>
                  <th className="text-left px-2 py-2 font-semibold">Product</th>
                  <th className="text-left px-2 py-2 font-semibold">Stage</th>
                  <th className="text-right px-2 py-2 font-semibold">Material Value</th>
                  <th className="text-right px-2 py-2 font-semibold">Labor Added</th>
                  <th className="text-right px-2 py-2 font-semibold">Overhead Added</th>
                  <th className="text-right px-2 py-2 font-semibold">Total WIP Cost</th>
                </tr>
              </thead>
              <tbody>
                {(wip || []).map((row) => {
                  const order = (orders || []).find((o: any) => Number(o.id) === Number(row.production_order_id));
                  return (
                    <tr key={row.production_order_id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5 font-medium">{(order as any)?.order_no || `#${row.production_order_id}`}</td>
                      <td className="px-2 py-1.5">{order ? itemNameById.get(Number((order as any).product_id)) || `Item #${(order as any).product_id}` : "-"}</td>
                      <td className="px-2 py-1.5">
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                          {row.current_stage || "IN PROGRESS"}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right">{Number(row.issued_material_value).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.labor_added).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.overhead_added).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{Number(row.total_wip_cost).toFixed(2)}</td>
                    </tr>
                  );
                })}
                {(wip || []).length === 0 && (
                  <tr><td colSpan={7} className="px-2 py-4 text-center text-slate-500">No WIP records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "production-entry" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Production Entry</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div>
              <label className="block mb-1">Production Order *</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                value={entryOrderId}
                onChange={(e) => setEntryOrderId(e.target.value)}
              >
                <option value="">Select Order</option>
                {(orders || []).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.order_no || `#${o.id}`} — {itemNameById.get(Number(o.product_id)) || `Item ${o.product_id}`} ({o.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Produced Qty *</label>
              <Input value={entryQty} onChange={(e) => setEntryQty(e.target.value)} type="number" min={0} step="any" placeholder="0" />
            </div>
            <div>
              <label className="block mb-1">Rejected Qty</label>
              <Input value={entryRejectedQty} onChange={(e) => setEntryRejectedQty(e.target.value)} type="number" min={0} step="any" placeholder="0" />
            </div>
            <div>
              <label className="block mb-1">Damaged Qty</label>
              <Input value={entryDamagedQty} onChange={(e) => setEntryDamagedQty(e.target.value)} type="number" min={0} step="any" placeholder="0" />
            </div>
            <div>
              <label className="block mb-1">Extra Consumption</label>
              <Input value={entryExtraConsumption} onChange={(e) => setEntryExtraConsumption(e.target.value)} type="number" min={0} step="any" placeholder="0" />
            </div>
            <div>
              <label className="block mb-1">Production Stage</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
                value={entryStage}
                onChange={(e) => {
                  if (e.target.value === "ADD_NEW") {
                    const val = prompt("Enter new stage name:");
                    if (val) {
                      saveCustomLookups("STAGE", [...customStages, val.toUpperCase()]);
                      setEntryStage(val.toUpperCase());
                    }
                  } else {
                    setEntryStage(e.target.value);
                  }
                }}
              >
                <option value="">Select Stage</option>
                <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Stage</option>
                {derivedStages.map(s => <option key={s} value={s as string}>{s as string}</option>)}
              </select>
            </div>
            <div className="md:col-span-3">
              <label className="block mb-1">Notes</label>
              <Input value={entryNotes} onChange={(e) => setEntryNotes(e.target.value)} placeholder="Optional notes" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={isSubmittingEntry || !entryOrderId || !entryQty}
            onClick={async () => {
              try {
                setIsSubmittingEntry(true);
                await createProductionEntryRecord(companyId, {
                  production_order_id: Number(entryOrderId),
                  produced_qty: Number(entryQty),
                  rejected_qty: Number(entryRejectedQty || 0),
                  damaged_qty: Number(entryDamagedQty || 0),
                  extra_consumption: Number(entryExtraConsumption || 0),
                  ...(entryStage ? { stage: entryStage } : {}),
                  ...(entryNotes ? { notes: entryNotes } : {}),
                });
                mutateEntries();
                setEntryQty("");
                setEntryRejectedQty("");
                setEntryDamagedQty("");
                setEntryExtraConsumption("");
                setEntryStage("");
                setEntryNotes("");
                showToast({ title: "Production entry created", variant: "success" });
              } catch (err: any) {
                const msg = err.response?.data?.detail || "Failed to create production entry";
                showToast({ title: "Entry failed", description: msg, variant: "destructive" });
              } finally {
                setIsSubmittingEntry(false);
              }
            }}
          >
            {isSubmittingEntry ? "Saving..." : "Save Entry"}
          </Button>
          {(entries || []).length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left px-2 py-2 font-semibold">ID</th>
                    <th className="text-left px-2 py-2 font-semibold">Order</th>
                    <th className="text-left px-2 py-2 font-semibold">Date</th>
                    <th className="text-right px-2 py-2 font-semibold">Produced</th>
                    <th className="text-right px-2 py-2 font-semibold">Rejected</th>
                    <th className="text-right px-2 py-2 font-semibold">Damaged</th>
                    <th className="text-left px-2 py-2 font-semibold">Stage</th>
                  </tr>
                </thead>
                <tbody>
                  {(entries || []).slice(0, 30).map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5">#{row.id}</td>
                      <td className="px-2 py-1.5">#{row.production_order_id}</td>
                      <td className="px-2 py-1.5">{String(row.entry_date).slice(0, 10)}</td>
                      <td className="px-2 py-1.5 text-right text-emerald-700 dark:text-emerald-400">{Number(row.produced_qty).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right text-rose-600 dark:text-rose-400">{Number(row.rejected_qty).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right text-amber-600 dark:text-amber-400">{Number(row.damaged_qty).toFixed(2)}</td>
                      <td className="px-2 py-1.5">{row.stage || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "finished-goods-receive" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2 text-xs">
          <div className="flex gap-2 items-end flex-wrap">
            <div className="flex-1 min-w-[220px]">
              <label className="block mb-1">Production Order</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-slate-950 disabled:cursor-not-allowed disabled:opacity-50"
                value={fgOrderId}
                onChange={(e) => setFgOrderId(e.target.value)}
              >
                <option value="">Select Order</option>
                {(orders || []).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    #{o.id} - {o.product_name || `Item ${o.product_id}`} ({o.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Warehouse ID (optional)</label>
              <Input value={fgWarehouseId} onChange={(e) => setFgWarehouseId(e.target.value)} type="number" min={1} />
            </div>
            <div>
              <label className="block mb-1">Department ID (optional)</label>
              <Input value={fgDepartmentId} onChange={(e) => setFgDepartmentId(e.target.value)} type="number" min={1} />
            </div>
            <div>
              <label className="block mb-1">Project ID (optional)</label>
              <Input value={fgProjectId} onChange={(e) => setFgProjectId(e.target.value)} type="number" min={1} />
            </div>
            <div>
              <label className="block mb-1">Segment ID (optional)</label>
              <Input value={fgSegmentId} onChange={(e) => setFgSegmentId(e.target.value)} type="number" min={1} />
            </div>
            <div>
              <label className="block mb-1">Receive Qty</label>
              <Input value={fgQty} onChange={(e) => setFgQty(e.target.value)} type="number" min={0} step="any" />
            </div>
            <Button
              size="sm"
              disabled={isSubmittingFG || !fgOrderId}
              onClick={async () => {
                try {
                  setIsSubmittingFG(true);
                  await createFinishedGoodsReceiveRecord(companyId, {
                    production_order_id: Number(fgOrderId),
                    ...(fgWarehouseId ? { warehouse_id: Number(fgWarehouseId) } : {}),
                    ...(fgDepartmentId ? { department_id: Number(fgDepartmentId) } : {}),
                    ...(fgProjectId ? { project_id: Number(fgProjectId) } : {}),
                    ...(fgSegmentId ? { segment_id: Number(fgSegmentId) } : {}),
                    received_qty: Number(fgQty),
                  });
                  mutateFG();
                  showToast({ title: "Finished goods received", variant: "success" });
                } catch (err: any) {
                  const msg = err.response?.data?.detail || "Failed to receive finished goods";
                  showToast({ title: "Receive failed", description: msg, variant: "destructive" });
                } finally {
                  setIsSubmittingFG(false);
                }
              }}
            >
              {isSubmittingFG ? "Receiving..." : "Receive FG"}
            </Button>
          </div>
          {(fg || []).slice(0, 30).map((row: any) => (
            <div key={row.id} className="border-b border-slate-100 dark:border-slate-800 py-2">
              FG #{row.id} | Order #{row.production_order_id} | Qty {row.received_qty} | Cost {row.total_cost}
            </div>
          ))}
        </div>
      )}

      {section === "wastage-scrap" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Wastage / Scrap</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div>
              <label className="block mb-1">Production Order (optional)</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
                value={scrapOrderId}
                onChange={(e) => setScrapOrderId(e.target.value)}
              >
                <option value="">None</option>
                {(orders || []).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.order_no || `#${o.id}`} — {itemNameById.get(Number(o.product_id)) || `Item ${o.product_id}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Scrap Type *</label>
              <Input value={scrapType} onChange={(e) => setScrapType(e.target.value)} placeholder="e.g. Metal offcut" />
            </div>
            <div>
              <label className="block mb-1">Qty *</label>
              <Input value={scrapQty} onChange={(e) => setScrapQty(e.target.value)} type="number" min={0} step="any" placeholder="0" />
            </div>
            <div className="md:col-span-3">
              <label className="block mb-1">Reason</label>
              <Input value={scrapReason} onChange={(e) => setScrapReason(e.target.value)} placeholder="Reason for scrap" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrapRecoverable}
                  onChange={(e) => setScrapRecoverable(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Recoverable</span>
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={scrapSaleable}
                  onChange={(e) => setScrapSaleable(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Saleable</span>
              </label>
            </div>
          </div>
          <Button
            size="sm"
            disabled={!scrapType || !scrapQty}
            onClick={async () => {
              try {
                await createScrapRecord(companyId, {
                  scrap_type: scrapType,
                  qty: Number(scrapQty),
                  ...(scrapReason ? { reason: scrapReason } : {}),
                  recoverable: scrapRecoverable,
                  saleable: scrapSaleable,
                  ...(scrapOrderId ? { production_order_id: Number(scrapOrderId) } : {}),
                });
                setScrapType("");
                setScrapQty("");
                setScrapReason("");
                setScrapRecoverable(false);
                setScrapSaleable(false);
                setScrapOrderId("");
                showToast({ title: "Scrap recorded", variant: "success" });
              } catch (err: any) {
                const msg = err.response?.data?.detail || "Failed to save scrap";
                showToast({ title: "Scrap failed", description: msg, variant: "destructive" });
              }
            }}
          >
            Save Scrap
          </Button>
          {(scrap || []).length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left px-2 py-2 font-semibold">ID</th>
                    <th className="text-left px-2 py-2 font-semibold">Order</th>
                    <th className="text-left px-2 py-2 font-semibold">Type</th>
                    <th className="text-right px-2 py-2 font-semibold">Qty</th>
                    <th className="text-left px-2 py-2 font-semibold">Reason</th>
                    <th className="text-center px-2 py-2 font-semibold">Recoverable</th>
                    <th className="text-center px-2 py-2 font-semibold">Saleable</th>
                  </tr>
                </thead>
                <tbody>
                  {(scrap || []).slice(0, 30).map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5">#{row.id}</td>
                      <td className="px-2 py-1.5">{row.production_order_id ? `#${row.production_order_id}` : "-"}</td>
                      <td className="px-2 py-1.5">{row.scrap_type}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.qty).toFixed(2)}</td>
                      <td className="px-2 py-1.5">{row.reason || "-"}</td>
                      <td className="px-2 py-1.5 text-center">{row.recoverable ? "✓" : "—"}</td>
                      <td className="px-2 py-1.5 text-center">{row.saleable ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "production-costing" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Production Costing</p>
          <p className="text-xs text-slate-500">Calculate total batch cost: Material + Labor + Machine + Electricity + Packing + Overhead</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="md:col-span-3">
              <label className="block mb-1">Production Order *</label>
              <select
                className="w-full h-9 rounded-md border border-slate-200 dark:border-slate-700 bg-transparent px-3 py-1 text-sm shadow-sm"
                value={costOrderId}
                onChange={(e) => setCostOrderId(e.target.value)}
              >
                <option value="">Select Order</option>
                {(orders || []).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.order_no || `#${o.id}`} — {itemNameById.get(Number(o.product_id)) || `Item ${o.product_id}`} ({o.status}) | Qty: {o.quantity}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block mb-1">Labor Cost</label>
              <Input value={laborCost} onChange={(e) => setLaborCost(e.target.value)} type="number" min={0} step="any" placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1">Machine Cost</label>
              <Input value={machineCost} onChange={(e) => setMachineCost(e.target.value)} type="number" min={0} step="any" placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1">Electricity Cost</label>
              <Input value={electricityCost} onChange={(e) => setElectricityCost(e.target.value)} type="number" min={0} step="any" placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1">Packing Cost</label>
              <Input value={packingCost} onChange={(e) => setPackingCost(e.target.value)} type="number" min={0} step="any" placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1">Other Overhead</label>
              <Input value={overheadCost} onChange={(e) => setOverheadCost(e.target.value)} type="number" min={0} step="any" placeholder="0.00" />
            </div>
            <div>
              <label className="block mb-1">Expected Sales Value (for margin %)</label>
              <Input value={salesValue} onChange={(e) => setSalesValue(e.target.value)} type="number" min={0} step="any" placeholder="0.00" />
            </div>
          </div>
          <Button
            size="sm"
            disabled={isCalculating || !costOrderId}
            onClick={async () => {
              try {
                setIsCalculating(true);
                await calculateCostingRecord(companyId, {
                  production_order_id: Number(costOrderId),
                  labor_cost: Number(laborCost || 0),
                  machine_cost: Number(machineCost || 0),
                  electricity_cost: Number(electricityCost || 0),
                  packing_cost: Number(packingCost || 0),
                  overhead_cost: Number(overheadCost || 0),
                  sales_value: Number(salesValue || 0),
                });
                mutateCosting();
                showToast({ title: "Costing calculated", variant: "success" });
              } catch (err: any) {
                const msg = err.response?.data?.detail || "Failed to calculate costing";
                showToast({ title: "Calculation failed", description: msg, variant: "destructive" });
              } finally {
                setIsCalculating(false);
              }
            }}
          >
            {isCalculating ? "Calculating..." : "Calculate Cost"}
          </Button>
          {(costing || []).length > 0 && (
            <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
              <table className="min-w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/50">
                  <tr>
                    <th className="text-left px-2 py-2 font-semibold">Order</th>
                    <th className="text-right px-2 py-2 font-semibold">Material</th>
                    <th className="text-right px-2 py-2 font-semibold">Labor</th>
                    <th className="text-right px-2 py-2 font-semibold">Machine</th>
                    <th className="text-right px-2 py-2 font-semibold">Electricity</th>
                    <th className="text-right px-2 py-2 font-semibold">Packing</th>
                    <th className="text-right px-2 py-2 font-semibold">Overhead</th>
                    <th className="text-right px-2 py-2 font-semibold">Total Cost</th>
                    <th className="text-right px-2 py-2 font-semibold">Cost/Unit</th>
                    <th className="text-right px-2 py-2 font-semibold">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {(costing || []).slice(0, 30).map((row: any) => (
                    <tr key={row.id} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="px-2 py-1.5">#{row.production_order_id}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.material_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.labor_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.machine_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.electricity_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.packing_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.overhead_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right font-semibold">{Number(row.total_batch_cost).toFixed(2)}</td>
                      <td className="px-2 py-1.5 text-right">{Number(row.cost_per_unit).toFixed(4)}</td>
                      <td className={`px-2 py-1.5 text-right font-semibold ${Number(row.profit_margin) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"}`}>
                        {Number(row.profit_margin).toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {section === "reports" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="block mb-1">From</label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <label className="block mb-1">To</label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <StatCard title="Today Production" value={Number(reports?.kpis?.today_production || 0)} />
            <StatCard title="Pending Orders" value={Number(reports?.kpis?.pending_orders || 0)} />
            <StatCard title="Monthly Output" value={Number(reports?.kpis?.monthly_output || 0)} />
            <StatCard title="Material Shortage" value={Number(reports?.kpis?.material_shortage || 0)} />
            <StatCard title="Wastage %" value={Number(reports?.kpis?.wastage_percent || 0)} />
          </div>
          <div className="max-w-sm">
            <label className="block mb-1">Export Dataset</label>
            <select
              className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
              value={reportKey}
              onChange={(e) => setReportKey(e.target.value)}
            >
              <option value="production_register">Production Register</option>
              <option value="material_consumption">Material Consumption</option>
              <option value="wip_report">WIP Report</option>
              <option value="finished_goods_report">Finished Goods Report</option>
              <option value="scrap_report">Scrap Report</option>
              <option value="costing_report">Costing Report</option>
              <option value="bom_product_profit">BOM Product Profit</option>
            </select>
          </div>
          <div className="max-w-sm">
            <label className="block mb-1">Search Rows</label>
            <Input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search in selected dataset" />
          </div>
          <div className="max-w-sm">
            <label className="block mb-1">Column Filter</label>
            <select
              className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
              value={columnFilterKey}
              onChange={(e) => setColumnFilterKey(e.target.value)}
            >
              <option value="">None</option>
              {reportColumns.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="max-w-sm">
            <label className="block mb-1">Column Filter Value</label>
            <Input
              value={columnFilterValue}
              onChange={(e) => setColumnFilterValue(e.target.value)}
              placeholder={columnFilterKey ? `Filter ${columnFilterKey}` : "Select column first"}
              disabled={!columnFilterKey}
            />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => downloadJson("manufacturing-reports.json", reports || {})}>
              Export JSON
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                downloadCSV(
                  sortedRows,
                  reportColumns.map((c) => ({ label: c, key: c })),
                  `manufacturing_${reportKey}_filtered.csv`
                )
              }
            >
              Export Filtered CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () =>
                downloadBlob(
                  "manufacturing-production-register.csv",
                  await exportManufacturingReport(companyId, reportKey, "csv", {
                    ...(fromDate ? { from_date: fromDate } : {}),
                    ...(toDate ? { to_date: toDate } : {}),
                  })
                )
              }
            >
              Export CSV
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={async () =>
                downloadBlob(
                  "manufacturing-report.xlsx",
                  await exportManufacturingReport(companyId, reportKey, "excel", {
                    ...(fromDate ? { from_date: fromDate } : {}),
                    ...(toDate ? { to_date: toDate } : {}),
                  })
                )
              }
            >
              Export Excel
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                openPrintWindow({
                  title: `Manufacturing Report - ${reportKey}`,
                  company: company?.name || getCurrentCompany()?.name || "Company",
                  subtitle: "Manufacturing ERP",
                  period: fromDate || toDate ? `${fromDate || "Start"} - ${toDate || "End"}` : "All dates",
                  badge: "MANUFACTURING",
                  orientation: "landscape",
                  contentHtml: buildPrintableTableHtml(reportColumns, sortedRows.slice(0, 500)),
                })
              }
            >
              Print Preview
            </Button>
          </div>
          <div className="flex gap-4 text-xs text-slate-500">
            <span>Production Rows: {(reports?.production_register || []).length}</span>
            <span>WIP Rows: {(reports?.wip_report || []).length}</span>
            <span>Scrap Rows: {(reports?.scrap_report || []).length}</span>
          </div>

          {/* BOM Product-wise Profit Report */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">BOM Product-wise Profit Report</p>
              <span className="text-[10px] text-slate-400">Production Cost vs Sales Revenue</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2 font-medium">Product</th>
                    <th className="px-4 py-2 font-medium text-right">Produced Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Sold Qty</th>
                    <th className="px-4 py-2 font-medium text-right">Production Cost</th>
                    <th className="px-4 py-2 font-medium text-right">Sales Revenue</th>
                    <th className="px-4 py-2 font-medium text-right">Gross Profit</th>
                    <th className="px-4 py-2 font-medium text-right">Margin %</th>
                  </tr>
                </thead>
                <tbody>
                  {!reports?.bom_product_profit || (reports.bom_product_profit as any[]).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                        No data — complete production costings and raise sales invoices to see profit analysis.
                      </td>
                    </tr>
                  ) : (
                    (reports.bom_product_profit as any[]).map((row: any) => {
                      const isProfit = row.gross_profit >= 0;
                      return (
                        <tr key={row.product_id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{row.product_name}</td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{Number(row.produced_qty).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{Number(row.sold_qty).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{Number(row.total_production_cost).toFixed(2)}</td>
                          <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{Number(row.total_sales_revenue).toFixed(2)}</td>
                          <td className={`px-4 py-2 text-right font-semibold ${isProfit ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                            {isProfit ? "+" : ""}{Number(row.gross_profit).toFixed(2)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              row.margin_pct >= 20 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : row.margin_pct >= 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                                : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                            }`}>
                              {row.total_sales_revenue > 0 ? `${Number(row.margin_pct).toFixed(1)}%` : "No Sales"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  )}
                  {reports?.bom_product_profit && (reports.bom_product_profit as any[]).length > 0 && (() => {
                    const rows = reports.bom_product_profit as any[];
                    const totalCost = rows.reduce((s: number, r: any) => s + Number(r.total_production_cost), 0);
                    const totalRev = rows.reduce((s: number, r: any) => s + Number(r.total_sales_revenue), 0);
                    const totalProfit = totalRev - totalCost;
                    const totalMargin = totalRev > 0 ? (totalProfit / totalRev * 100) : 0;
                    return (
                      <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800/50 font-semibold">
                        <td className="px-4 py-2 text-slate-800 dark:text-slate-200">TOTAL</td>
                        <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{rows.reduce((s: number, r: any) => s + Number(r.produced_qty), 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-slate-600 dark:text-slate-400">{rows.reduce((s: number, r: any) => s + Number(r.sold_qty), 0).toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-slate-800 dark:text-slate-200">{totalCost.toFixed(2)}</td>
                        <td className="px-4 py-2 text-right text-slate-800 dark:text-slate-200">{totalRev.toFixed(2)}</td>
                        <td className={`px-4 py-2 text-right ${totalProfit >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"}`}>
                          {totalProfit >= 0 ? "+" : ""}{totalProfit.toFixed(2)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            totalMargin >= 20 ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                              : totalMargin >= 0 ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                              : "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                          }`}>
                            {totalRev > 0 ? `${totalMargin.toFixed(1)}%` : "No Sales"}
                          </span>
                        </td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-lg">
            <table className="min-w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  {reportColumns.map((c) => (
                    <th key={c} className="text-left px-2 py-2 font-semibold whitespace-nowrap border-b border-slate-200 dark:border-slate-700">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 hover:text-primary-600"
                        onClick={() => {
                          if (sortColumn === c) {
                            setSortDir((d) => (d === "asc" ? "desc" : "asc"));
                          } else {
                            setSortColumn(c);
                            setSortDir("asc");
                          }
                        }}
                      >
                        {c}
                        {sortColumn === c ? (sortDir === "asc" ? "▲" : "▼") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedRows.slice(0, 200).map((row, idx) => (
                  <tr key={`${reportKey}-${idx}`} className="border-b border-slate-100 dark:border-slate-800">
                    {reportColumns.map((c) => (
                      <td key={`${idx}-${c}`} className="px-2 py-1.5 whitespace-nowrap">
                        {String(row?.[c] ?? "")}
                      </td>
                    ))}
                  </tr>
                ))}
                {sortedRows.length === 0 && (
                  <tr>
                    <td className="px-2 py-3 text-slate-500" colSpan={Math.max(1, reportColumns.length)}>
                      No rows found for current dataset/filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {section === "settings" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Manufacturing Settings</p>
            <p className="text-xs text-slate-500 mt-0.5">Configure default ledgers, costing method, and approval workflow.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Default Ledger Accounts</p>
              <div>
                <label className="block mb-1">WIP Ledger ID</label>
                <Input value={settingsWipLedger} onChange={(e) => setSettingsWipLedger(e.target.value)} type="number" min={1} placeholder="Ledger ID for Work In Progress" />
              </div>
              <div>
                <label className="block mb-1">Finished Goods Ledger ID</label>
                <Input value={settingsFgLedger} onChange={(e) => setSettingsFgLedger(e.target.value)} type="number" min={1} placeholder="Ledger ID for Finished Goods" />
              </div>
              <div>
                <label className="block mb-1">Raw Material Ledger ID</label>
                <Input value={settingsRmLedger} onChange={(e) => setSettingsRmLedger(e.target.value)} type="number" min={1} placeholder="Ledger ID for Raw Materials" />
              </div>
              <div>
                <label className="block mb-1">Default Warehouse ID</label>
                <Input value={settingsWarehouse} onChange={(e) => setSettingsWarehouse(e.target.value)} type="number" min={1} placeholder="Default Warehouse ID" />
              </div>
            </div>
            <div className="space-y-3 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">Production Controls</p>
              <div>
                <label className="block mb-1">Costing Method</label>
                <select
                  className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
                  value={settingsCostingMethod}
                  onChange={(e) => setSettingsCostingMethod(e.target.value)}
                >
                  <option value="AUTO">AUTO (System Calculated)</option>
                  <option value="MANUAL">MANUAL (User Defined)</option>
                  <option value="FIFO">FIFO</option>
                  <option value="AVERAGE">Average Cost</option>
                </select>
              </div>
              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsApprovalRequired}
                    onChange={(e) => setSettingsApprovalRequired(e.target.checked)}
                    className="rounded border-slate-300 w-4 h-4"
                  />
                  <span className="text-sm">Require approval before production starts</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settingsAiEnabled}
                    onChange={(e) => setSettingsAiEnabled(e.target.checked)}
                    className="rounded border-slate-300 w-4 h-4"
                  />
                  <span className="text-sm">Enable AI production predictions</span>
                </label>
              </div>
              {settingsData && (
                <div className="text-[10px] text-slate-400 pt-1">
                  Last updated: {settingsData ? String(settingsData.updated_at).slice(0, 16).replace("T", " ") : "—"}
                </div>
              )}
            </div>
          </div>
          <Button
            disabled={isSavingSettings}
            onClick={async () => {
              try {
                setIsSavingSettings(true);
                await upsertManufacturingSettings(companyId, {
                  ...(settingsWipLedger ? { default_wip_ledger_id: Number(settingsWipLedger) } : { default_wip_ledger_id: null }),
                  ...(settingsFgLedger ? { default_fg_ledger_id: Number(settingsFgLedger) } : { default_fg_ledger_id: null }),
                  ...(settingsRmLedger ? { default_rm_ledger_id: Number(settingsRmLedger) } : { default_rm_ledger_id: null }),
                  ...(settingsWarehouse ? { default_warehouse_id: Number(settingsWarehouse) } : { default_warehouse_id: null }),
                  costing_method: settingsCostingMethod,
                  approval_required: settingsApprovalRequired,
                  ai_predictions_enabled: settingsAiEnabled,
                });
                mutateSettings();
                showToast({ title: "Settings saved", variant: "success" });
              } catch (err: any) {
                const msg = err.response?.data?.detail || "Failed to save settings";
                showToast({ title: "Save failed", description: msg, variant: "destructive" });
              } finally {
                setIsSavingSettings(false);
              }
            }}
          >
            {isSavingSettings ? "Saving..." : "Save Settings"}
          </Button>
        </div>
      )}

      {section === "ai-documents" && (
        <div className="space-y-4">
          <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            {(["scanner", "reorder", "wastage", "profitability", "roles"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setAiTab(tab)}
                className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
                  aiTab === tab
                    ? "border-blue-600 text-blue-600 dark:text-blue-400"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
                }`}
              >
                {tab === "scanner" && "Document Scanner"}
                {tab === "reorder" && "Reorder Alerts"}
                {tab === "wastage" && "Wastage Analysis"}
                {tab === "profitability" && "Profitability"}
                {tab === "roles" && "Role Management"}
              </button>
            ))}
          </div>

          {aiTab === "scanner" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 p-6">
                <p className="text-sm font-semibold text-blue-800 dark:text-blue-300 mb-3">Upload Production Document</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mb-4">
                  Upload a purchase bill or production sheet — AI will extract and auto-fill entries.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 items-start">
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="text-sm text-slate-600 dark:text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-blue-100 file:text-blue-700 hover:file:bg-blue-200 dark:file:bg-blue-900 dark:file:text-blue-300"
                    onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    disabled={!uploadFile || isUploading}
                    onClick={async () => {
                      if (!uploadFile) return;
                      try {
                        setIsUploading(true);
                        const formData = new FormData();
                        formData.append("file", uploadFile);
                        await uploadCompanyDocument(companyId, formData);
                        setUploadFile(null);
                        mutateAiDocs();
                        showToast({ title: "Document uploaded", variant: "success" });
                      } catch (err: any) {
                        const msg = err.response?.data?.detail || "Upload failed";
                        showToast({ title: "Upload failed", description: msg, variant: "destructive" });
                      } finally {
                        setIsUploading(false);
                      }
                    }}
                  >
                    {isUploading ? "Uploading..." : "Upload & Scan"}
                  </Button>
                </div>
              </div>

              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Scanned Documents</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                        <th className="px-4 py-2 font-medium">File</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Uploaded</th>
                        <th className="px-4 py-2 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {!aiDocuments || aiDocuments.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                            No documents uploaded yet.
                          </td>
                        </tr>
                      ) : (
                        aiDocuments.map((doc) => (
                          <tr key={doc.id} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300 max-w-[180px] truncate">{doc.original_filename || doc.file_path?.split("/").pop() || "—"}</td>
                            <td className="px-4 py-2 text-slate-500">{doc.document_kind || "—"}</td>
                            <td className="px-4 py-2">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                doc.status === "confirmed" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                  : doc.status === "processed" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                  : doc.status === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                  : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                              }`}>
                                {doc.status?.toUpperCase() ?? "PENDING"}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-slate-400">{doc.created_at ? String(doc.created_at).slice(0, 10) : "—"}</td>
                            <td className="px-4 py-2">
                              <div className="flex gap-2">
                                {doc.status === "uploaded" && (
                                  <button
                                    disabled={isProcessingDocId === doc.id}
                                    onClick={async () => {
                                      try {
                                        setIsProcessingDocId(doc.id);
                                        await processCompanyDocument(companyId, doc.id);
                                        mutateAiDocs();
                                        showToast({ title: "Processing complete", variant: "success" });
                                      } catch (err: any) {
                                        const msg = err.response?.data?.detail || "Processing failed";
                                        showToast({ title: "Error", description: msg, variant: "destructive" });
                                      } finally {
                                        setIsProcessingDocId(null);
                                      }
                                    }}
                                    className="px-2 py-1 rounded text-[10px] font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300 disabled:opacity-50"
                                  >
                                    {isProcessingDocId === doc.id ? "Processing..." : "Process"}
                                  </button>
                                )}
                                {doc.status === "processed" && (
                                  <button
                                    disabled={isConfirmingDocId === doc.id}
                                    onClick={async () => {
                                      try {
                                        setIsConfirmingDocId(doc.id);
                                        await confirmCompanyDocument(companyId, doc.id);
                                        mutateAiDocs();
                                        showToast({ title: "Entry confirmed and posted", variant: "success" });
                                      } catch (err: any) {
                                        const msg = err.response?.data?.detail || "Confirmation failed";
                                        showToast({ title: "Error", description: msg, variant: "destructive" });
                                      } finally {
                                        setIsConfirmingDocId(null);
                                      }
                                    }}
                                    className="px-2 py-1 rounded text-[10px] font-medium bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/40 dark:text-green-300 disabled:opacity-50"
                                  >
                                    {isConfirmingDocId === doc.id ? "Confirming..." : "Confirm & Post"}
                                  </button>
                                )}
                                {doc.extracted_data && (
                                  <span className="px-2 py-1 rounded text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-500">
                                    {Object.keys(doc.extracted_data as Record<string, unknown>).length} fields
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {aiTab === "reorder" && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Material Reorder Alerts</p>
                <button onClick={() => mutateAnalytics()} className="text-xs text-blue-600 hover:underline">Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-2 font-medium">Urgency</th>
                      <th className="px-4 py-2 font-medium">Item</th>
                      <th className="px-4 py-2 font-medium">On Hand</th>
                      <th className="px-4 py-2 font-medium">Reorder Level</th>
                      <th className="px-4 py-2 font-medium">Monthly Usage</th>
                      <th className="px-4 py-2 font-medium">Suggested Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!analytics?.reorder_alerts || analytics.reorder_alerts.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No reorder alerts at this time.
                        </td>
                      </tr>
                    ) : (
                      analytics.reorder_alerts.map((alert, idx) => (
                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              alert.urgency === "CRITICAL" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                : alert.urgency === "HIGH" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400"
                                : "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                            }`}>
                              {alert.urgency}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{alert.item_name}</td>
                          <td className="px-4 py-2 text-red-600 dark:text-red-400 font-semibold">{Number(alert.on_hand || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-slate-500">{Number(alert.reorder_level || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-slate-500">{Number(alert.monthly_usage || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-blue-700 dark:text-blue-400 font-semibold">{Number(alert.suggested_qty || 0).toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aiTab === "wastage" && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Abnormal Wastage Detection</p>
                <button onClick={() => mutateAnalytics()} className="text-xs text-blue-600 hover:underline">Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-2 font-medium">Order No</th>
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-4 py-2 font-medium">Actual Wastage %</th>
                      <th className="px-4 py-2 font-medium">Expected %</th>
                      <th className="px-4 py-2 font-medium">Excess %</th>
                      <th className="px-4 py-2 font-medium">Wastage Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!analytics?.wastage_anomalies || analytics.wastage_anomalies.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No wastage anomalies detected.
                        </td>
                      </tr>
                    ) : (
                      analytics.wastage_anomalies.map((anomaly, idx) => (
                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2 font-mono text-slate-700 dark:text-slate-300">{anomaly.order_no}</td>
                          <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{anomaly.product_name}</td>
                          <td className="px-4 py-2 text-red-600 dark:text-red-400 font-semibold">{Number(anomaly.actual_wastage_pct || 0).toFixed(2)}%</td>
                          <td className="px-4 py-2 text-slate-500">{Number(anomaly.expected_wastage_pct || 0).toFixed(2)}%</td>
                          <td className="px-4 py-2">
                            <span className="inline-block px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 font-semibold">
                              +{Number(anomaly.excess_pct || 0).toFixed(2)}%
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-500">{Number(anomaly.wastage_qty || 0).toFixed(3)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aiTab === "profitability" && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Product Profitability Analysis</p>
                <button onClick={() => mutateAnalytics()} className="text-xs text-blue-600 hover:underline">Refresh</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                      <th className="px-4 py-2 font-medium">Product</th>
                      <th className="px-4 py-2 font-medium">Avg CPU</th>
                      <th className="px-4 py-2 font-medium">Avg Selling Price</th>
                      <th className="px-4 py-2 font-medium">Margin %</th>
                      <th className="px-4 py-2 font-medium">Runs</th>
                      <th className="px-4 py-2 font-medium">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!analytics?.product_profitability || analytics.product_profitability.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                          No profitability data available. Complete production costings to see analysis.
                        </td>
                      </tr>
                    ) : (
                      analytics.product_profitability.map((p, idx) => (
                        <tr key={idx} className="border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                          <td className="px-4 py-2 font-medium text-slate-800 dark:text-slate-200">{p.product_name}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{Number(p.avg_cpu || 0).toFixed(2)}</td>
                          <td className="px-4 py-2 text-slate-600 dark:text-slate-400">{Number(p.avg_selling_price || 0) > 0 ? Number(p.avg_selling_price || 0).toFixed(2) : "—"}</td>
                          <td className="px-4 py-2">
                            <span className={`font-semibold ${Number(p.margin_pct || 0) >= 20 ? "text-green-600 dark:text-green-400" : Number(p.margin_pct || 0) >= 0 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"}`}>
                              {Number(p.avg_selling_price || 0) > 0 ? `${Number(p.margin_pct || 0).toFixed(1)}%` : "—"}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-slate-500">{p.production_runs}</td>
                          <td className="px-4 py-2">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              p.recommendation === "INCREASE VOLUME" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                : p.recommendation === "REVIEW PRICING" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-400"
                                : p.recommendation === "REVIEW COSTS" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                                : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                            }`}>
                              {p.recommendation}
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {aiTab === "roles" && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-4">
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Assign Manufacturing Role</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Assign a role preset to a user. This sets menu-level permissions for all manufacturing sections at once.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs mb-1 text-slate-600 dark:text-slate-400">User ID</label>
                    <Input
                      type="number"
                      min={1}
                      placeholder="Enter user ID"
                      value={roleAssignUserId}
                      onChange={(e) => setRoleAssignUserId(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="block text-xs mb-1 text-slate-600 dark:text-slate-400">Role Preset</label>
                    <select
                      className="w-full rounded-md border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-2 text-sm"
                      value={roleAssignRole}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === "ADD_NEW") {
                          const name = prompt("Enter custom role name:");
                          if (name) {
                            const newPresets = { ...customRolePresets, [name]: MFG_MENUS.reduce((acc, m) => ({ ...acc, [m]: "deny" }), {}) };
                            saveCustomLookups("ROLE_PRESET", newPresets);
                            setRoleAssignRole(name);
                            setCustomRolePermissions(newPresets[name]);
                          }
                        } else {
                          setRoleAssignRole(val);
                          if (customRolePresets[val]) {
                            setCustomRolePermissions(customRolePresets[val]);
                          } else {
                            setCustomRolePermissions({});
                          }
                        }
                      }}
                    >
                      <option value="">Select role...</option>
                      <option value="ADD_NEW" className="font-semibold text-blue-600 dark:text-blue-400">+ Add New Preset</option>
                      <optgroup label="System Presets">
                        {rolePresets
                          ? Object.keys(rolePresets.details ?? {}).map((r) => (
                              <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                            ))
                          : (["factory_manager", "storekeeper", "accountant", "viewer"] as const).map((r) => (
                              <option key={r} value={r}>{r.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</option>
                            ))
                        }
                      </optgroup>
                      {Object.keys(customRolePresets).length > 0 && (
                        <optgroup label="Custom Presets">
                          {Object.keys(customRolePresets).map((r) => (
                            <option key={r} value={r}>{r}</option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      disabled={!roleAssignUserId || !roleAssignRole || isAssigningRole}
                      onClick={async () => {
                        if (!roleAssignUserId || !roleAssignRole) return;
                        try {
                          setIsAssigningRole(true);
                          const isCustom = !!customRolePresets[roleAssignRole];
                          await assignManufacturingRole(
                            companyId, 
                            Number(roleAssignUserId), 
                            roleAssignRole,
                            isCustom ? customRolePermissions : undefined
                          );
                          setRoleAssignUserId("");
                          setRoleAssignRole("");
                          setCustomRolePermissions({});
                          showToast({ title: `Role "${roleAssignRole}" assigned successfully`, variant: "success" });
                        } catch (err: any) {
                          const msg = err.response?.data?.detail || "Assignment failed";
                          showToast({ title: "Error", description: msg, variant: "destructive" });
                        } finally {
                          setIsAssigningRole(false);
                        }
                      }}
                      className="w-full"
                    >
                      {isAssigningRole ? "Assigning..." : "Assign Role"}
                    </Button>
                  </div>
                </div>
              </div>

              {roleAssignRole && customRolePresets[roleAssignRole] && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Role Builder: {roleAssignRole}</p>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-7"
                      onClick={() => {
                        const newPresets = { ...customRolePresets, [roleAssignRole]: customRolePermissions };
                        saveCustomLookups("ROLE_PRESET", newPresets);
                        showToast({ title: "Role preset saved", variant: "success" });
                      }}
                    >
                      Save Preset Changes
                    </Button>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {MFG_MENUS.map(menu => (
                      <div key={menu} className="flex flex-col gap-1 p-2 rounded border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                        <label className="text-[10px] font-mono text-slate-500 uppercase">{menu.replace("manufacturing.", "")}</label>
                        <select
                          className="w-full bg-transparent text-xs outline-none"
                          value={customRolePermissions[menu] || "deny"}
                          onChange={(e) => {
                            setCustomRolePermissions(prev => ({ ...prev, [menu]: e.target.value }));
                          }}
                        >
                          <option value="deny">Deny</option>
                          <option value="read">Read</option>
                          <option value="update">Update</option>
                          <option value="full">Full</option>
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {rolePresets && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Role Preset Details</p>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500 dark:text-slate-400">
                          <th className="px-4 py-2 font-medium">Menu</th>
                          {Object.keys(rolePresets.details ?? {}).map((r) => (
                            <th key={r} className="px-4 py-2 font-medium capitalize">{r.replace(/_/g, " ")}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const roles = rolePresets.details ?? {};
                          const allMenus = Array.from(new Set(Object.values(roles).flatMap((r: any) => Object.keys(r))));
                          return allMenus.map((menuCode) => (
                            <tr key={menuCode} className="border-t border-slate-100 dark:border-slate-800">
                              <td className="px-4 py-2 font-mono text-slate-600 dark:text-slate-400">{menuCode.replace("manufacturing.", "")}</td>
                              {Object.values(roles).map((r: any, i) => {
                                const level = r[menuCode] ?? "deny";
                                return (
                                  <td key={i} className="px-4 py-2">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                      level === "full" ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400"
                                        : level === "update" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400"
                                        : level === "read" ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                        : "bg-red-50 text-red-400 dark:bg-red-950/30 dark:text-red-500"
                                    }`}>
                                      {level}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          ));
                        })()}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {!["dashboard", "bom-master", "production-order", "material-issue", "work-in-progress", "production-entry", "finished-goods-receive", "wastage-scrap", "production-costing", "reports", "settings", "ai-documents"].includes(section) && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 text-sm text-slate-600 dark:text-slate-300">
          This section is enabled in menu and route structure. API hooks are ready and can be expanded per workflow.
        </div>
      )}

      <QuickItemModal
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
        companyId={companyId}
        type="FINISHED_PRODUCT"
        onSuccess={async (newItemId) => {
          await mutateItems();
          if (quickCreateContext === "NEW") {
            setNewOrderProductId(String(newItemId));
          } else if (quickCreateContext === "EDIT") {
            setEditOrderProductId(String(newItemId));
          }
          setQuickCreateContext(null);
        }}
      />

      <ManageLookupsModal
        open={manageLookupsOpen}
        onClose={() => setManageLookupsOpen(false)}
        initialStatuses={customStatuses}
        initialPriorities={customPriorities}
        initialSupervisors={customSupervisors}
        initialOperators={customOperators}
        initialMachines={customMachines}
        initialStages={customStages}
        initialRolePresets={customRolePresets}
        onUpdate={saveCustomLookups}
      />
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
      <p className="text-xs text-slate-500">{title}</p>
      <p className="text-xl font-semibold text-slate-900 dark:text-slate-100 mt-1">{value}</p>
    </div>
  );
}
