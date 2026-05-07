"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import {
  G, GhostBg, GhostPageHeader, GhostSpinner, GhostEmpty, ANIM_CSS,
} from "@/lib/adminTheme";
import { 
  FolderEdit, ChevronDown, ChevronUp, ChevronRight, MoveUp, MoveDown, LayoutGrid, ListTree, Layers, 
  Search, Trash2, CheckCircle2, AlertCircle, X, Check, PlusCircle, Settings, LayoutDashboard,
  Box, Terminal, Cpu, Database, Globe, Shield, User, Users, FileText, CreditCard, ShoppingCart,
  Truck, BarChart3, Briefcase, HeartHandshake, Map, Eye, EyeOff, Copy, GripVertical
} from "lucide-react";
import Link from "next/link";
import { usePermissions } from "@/components/PermissionsContext";

type Menu = {
  id: number; code: string; label: string; module?: string | null;
  parent_id?: number | null; sort_order?: number | null; is_active: boolean;
};

type MenuTemplateMenuItem = {
  menu_id: number;
  group_name: string | null;
  group_order: number | null;
  item_order: number | null;
  parent_id: number | null;
  is_sidebar_visible?: boolean;
  label?: string | null;
  code?: string | null;
};

type MenuTemplate = {
  id: number; name: string; description?: string | null;
  is_active: boolean; created_at: string; menu_ids: number[];
  items?: MenuTemplateMenuItem[];
};

const fetcher = (url: string) => api.get(url).then((r) => r.data);

const normalizedModule = (m: Menu) => (m.module || "").trim() || "Other";

const lbl: React.CSSProperties = { color: "#818cf8", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "8px", display: "block" };

const moduleColors = [
  { bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.25)", header: "rgba(99,102,241,0.12)", dot: "#818cf8", text: "#a5b4fc" },
  { bg: "rgba(14,165,233,0.08)", border: "rgba(14,165,233,0.25)", header: "rgba(14,165,233,0.12)", dot: "#38bdf8", text: "#7dd3fc" },
  { bg: "rgba(168,85,247,0.08)", border: "rgba(168,85,247,0.25)", header: "rgba(168,85,247,0.12)", dot: "#c084fc", text: "#d8b4fe" },
  { bg: "rgba(20,184,166,0.08)", border: "rgba(20,184,166,0.25)", header: "rgba(20,184,166,0.12)", dot: "#2dd4bf", text: "#5eead4" },
  { bg: "rgba(244,114,182,0.08)", border: "rgba(244,114,182,0.25)", header: "rgba(244,114,182,0.12)", dot: "#f472b6", text: "#f9a8d4" },
  { bg: "rgba(251,146,60,0.08)", border: "rgba(251,146,60,0.25)", header: "rgba(251,146,60,0.12)", dot: "#fb923c", text: "#fdba74" },
];

/** 
 * Automatically determines a logical group and order for a menu based on its code.
 */
function autoGroupMenu(menu: Menu): { group_name: string; group_order: number; item_order: number } {
  const code = (menu.code || "").toLowerCase();
  const sort = menu.sort_order || 0;

  if (code.includes("ledger") || code.includes("item") || code.includes("customer") || code.includes("supplier") || code.includes("employee") || code.includes("opening") || code.includes("account")) {
    return { group_name: "Masters", group_order: 10, item_order: sort || 100 };
  }
  if (code.includes("invoice") || code.includes("voucher") || code.includes("receipt") || code.includes("payment") || code.includes("journal") || code.includes("return") || code.includes("pos") || code.includes("billing")) {
    return { group_name: "Vouchers", group_order: 20, item_order: sort || 100 };
  }
  if (code.includes("report") || code.includes("balance") || code.includes("summary") || code.includes("statement") || code.includes("monthly") || code.includes("trial")) {
    return { group_name: "Reports", group_order: 30, item_order: sort || 100 };
  }
  if (code.includes("setting") || code.includes("company") || code.includes("user") || code.includes("profile") || code.includes("preference") || code.includes("utility")) {
    return { group_name: "Configuration", group_order: 100, item_order: sort || 500 };
  }
  
  return { group_name: "Main", group_order: 5, item_order: sort || 1000 };
}

type PresetDef = {
  name: string;
  description: string;
  matchPatterns: string[]; // List of substrings to match in menu codes
};

const TEMPLATE_PRESETS: PresetDef[] = [
  { 
    name: "Standard Trading", 
    description: "Includes common sales, purchase, inventory, and financial reporting.",
    matchPatterns: ["ledger", "item", "customer", "supplier", "sales.invoice", "purchase.invoice", "receipt", "payment", "report", "balance"]
  },
  { 
    name: "Service Business", 
    description: "Focuses on customers, invoicing, expenses, and service reports. Minimal inventory.",
    matchPatterns: ["ledger", "customer", "sales.invoice", "receipt", "payment", "expense", "report.income", "report.receivable"]
  },
  { 
    name: "Point of Sale (POS)", 
    description: "Optimized for retail with POS billing, items, and sales summaries.",
    matchPatterns: ["item", "pos.billing", "sales.invoice", "customer", "report.sales"]
  },
  { 
    name: "Minimalist", 
    description: "Only the core accounting essentials: Ledgers, Journals, and Basic Reports.",
    matchPatterns: ["ledger.list", "voucher.journal", "report.balance_sheet", "report.ledger"]
  }
];

/** Identifies the auto-managed “all menus” template; superadmin-only in the list UI. */
const SUPERADMIN_FULL_LIBRARY_DESC_MARKER = "[superadmin:full-menu-library]";
const SUPERADMIN_FULL_LIBRARY_TEMPLATE_NAME = "Default — Full menu library (Superadmin)";

function isSuperadminFullLibraryTemplate(t: MenuTemplate): boolean {
  return (t.description || "").includes(SUPERADMIN_FULL_LIBRARY_DESC_MARKER);
}

function templateDescriptionForTable(desc: string | null | undefined): string {
  if (!desc) return "";
  return desc.replace(SUPERADMIN_FULL_LIBRARY_DESC_MARKER, "").replace(/\s{2,}/g, " ").trim();
}

function buildFullLibraryTemplateItems(menuList: Menu[]) {
  return menuList.map((m) => {
    const auto = autoGroupMenu(m);
    return {
      menu_id: m.id,
      parent_id: m.parent_id ?? null,
      group_name: auto.group_name,
      group_order: auto.group_order,
      item_order: auto.item_order,
      is_sidebar_visible: true as boolean,
    };
  });
}

function MenuPicker({ 
  menusByModule, 
  selectedIds, 
  onToggle, 
  onSelect,
  existingGroups,
  onBulkAdd
}: {
  menusByModule: Record<string, Menu[]>;
  selectedIds: Record<number, boolean>;
  onToggle: (id: number) => void;
  onSelect: (module: string, checked: boolean) => void;
  existingGroups: string[];
  onBulkAdd: (ids: number[], groupName: string) => void;
}) {
  const [highlights, setHighlights] = useState<Record<number, boolean>>({});
  const [targetGroup, setTargetGroup] = useState("");
  
  const modules = Object.entries(menusByModule);
  const highlightedIds = Object.entries(highlights).filter(([_, v]) => v).map(([id]) => Number(id));

  const handleToggleHighlight = (id: number) => {
    setHighlights(p => ({ ...p, [id]: !p[id] }));
  };

  const handleModuleHighlight = (items: Menu[], val: boolean) => {
    const next = { ...highlights };
    items.forEach(m => { next[m.id] = val; });
    setHighlights(next);
  };

  const handleSelectAllGlobal = () => {
    const allItems = modules.flatMap(([_, items]) => items);
    if (allItems.length === 0) return;
    
    // Check if everything is currently highlighted
    const allHighlighted = allItems.every(m => highlights[m.id]);
    const next = { ...highlights };
    allItems.forEach(m => { next[m.id] = !allHighlighted; });
    setHighlights(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "6px", position: "relative", minHeight: "400px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "4px", padding: "6px 12px", background: "rgba(99,102,241,0.06)", borderRadius: "10px", border: "1px solid rgba(99,102,241,0.1)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{ fontSize: "12px", color: "#94a3b8" }}>{modules.length} modules available</span>
          <button 
            type="button" 
            onClick={handleSelectAllGlobal}
            style={{ padding: "4px 10px", background: "rgba(129,140,248,0.15)", border: "1px solid rgba(129,140,248,0.3)", borderRadius: "6px", color: "#a5b4fc", fontSize: "10px", fontWeight: 700, cursor: "pointer", transition: "all 0.2s" }}
          >
            {modules.flatMap(([_, items]) => items).every(m => highlights[m.id]) ? "Deselect All Visible" : "Select All Visible"}
          </button>
        </div>
        <span style={{ fontSize: "11px", fontWeight: 700, color: highlightedIds.length > 0 ? "#818cf8" : "#475569" }}>
          {highlightedIds.length} items highlighted
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "6px", paddingBottom: highlightedIds.length > 0 ? "80px" : "0" }}>
        {modules.length === 0 ? (
          <div style={{ color: "#475569", fontSize: "12px", textAlign: "center", padding: "32px", background: "rgba(255,255,255,0.02)", borderRadius: "12px", border: "1px dashed rgba(255,255,255,0.08)" }}>
            No more menus available in this module.
          </div>
        ) : (
          modules.map(([module, items], idx) => {
            const c = moduleColors[idx % moduleColors.length];
            const allHighlighted = items.every(m => highlights[m.id]);
            return (
              <div key={module} style={{ background: c.bg, border: `1px solid ${c.border}`, borderRadius: "8px", overflow: "hidden" }}>
                <div style={{ padding: "4px 10px", borderBottom: `1px solid ${c.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: c.header }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: c.text }}>{module}</span>
                  <div style={{ display: "flex", gap: "6px" }}>
                    <button type="button" onClick={() => handleModuleHighlight(items, !allHighlighted)} style={{ padding: "4px 8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#94a3b8", fontSize: "10px", cursor: "pointer" }}>
                      {allHighlighted ? "Deselect" : "Select All"}
                    </button>
                  </div>
                </div>
                {/* Column Headers */}
                {items.length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "4px 8px 4px 34px", borderBottom: `1px solid ${c.border}`, background: "rgba(0,0,0,0.2)" }}>
                    <div style={{ width: "160px", fontSize: "9px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>Menu Code</div>
                    <div style={{ fontSize: "9px", fontWeight: 800, color: "#475569", textTransform: "uppercase" }}>Label</div>
                  </div>
                )}
                <div style={{ padding: "4px", display: "grid", gridTemplateColumns: "1fr", gap: "1px" }}>
                  {items.map((m) => {
                    const isHigh = Boolean(highlights[m.id]);
                    return (
                      <div 
                        key={m.id} 
                        onClick={() => handleToggleHighlight(m.id)}
                        style={{ display: "flex", alignItems: "center", gap: "10px", cursor: "pointer", padding: "3px 8px", borderRadius: "8px", background: isHigh ? "rgba(99,102,241,0.15)" : "transparent", border: isHigh ? "1px solid rgba(99,102,241,0.3)" : "1px solid transparent", transition: "all 0.15s" }}
                      >
                         <div style={{ width: "16px", height: "16px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.2)", background: isHigh ? "#6366f1" : "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "10px", color: "#fff" }}>
                           {isHigh && "✓"}
                         </div>
                         <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: "10px", flex: 1 }}>
                           <div style={{ width: "160px", fontSize: "10px", color: "#6366f1", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.code}</div>
                           <div style={{ fontSize: "11px", fontWeight: 600, color: isHigh ? "#c7d2fe" : "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                         </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}
      </div>

      {highlightedIds.length > 0 && (
        <div style={{ position: "sticky", bottom: "0", left: "0", right: "0", padding: "12px", background: "#1e293b", borderTop: "2px solid #6366f1", borderRadius: "0 0 16px 16px", display: "flex", flexDirection: "column", gap: "10px", boxShadow: "0 -4px 12px rgba(0,0,0,0.3)", animation: "slideUp 0.2s ease" }}>
           <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: "11px", fontWeight: 700, color: "#818cf8" }}>{highlightedIds.length} ITEMS READY</span>
              <button onClick={() => setHighlights({})} style={{ background: "none", border: "none", color: "#64748b", fontSize: "11px", cursor: "pointer" }}>Clear All</button>
           </div>
           <div style={{ display: "flex", gap: "8px" }}>
             <input 
               list="existing-groups"
               placeholder="Target Group (optional)..."
               value={targetGroup}
               onChange={(e) => setTargetGroup(e.target.value)}
               style={{ ...G.inputStyle, flex: 1, height: "32px", fontSize: "11px", background: "rgba(0,0,0,0.3)" }}
             />
             <button 
               type="button"
               onClick={() => { 
                 const finalGroup = targetGroup.trim();
                 onBulkAdd(highlightedIds, finalGroup); 
                 setHighlights({}); 
                 setTargetGroup(""); 
               }}
               style={{ padding: "0 16px", background: "linear-gradient(135deg, #6366f1, #4f46e5)", color: "#fff", border: "none", borderRadius: "8px", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
             >
               {targetGroup.trim() ? "Add to Group" : "Add (Original Module)"}
             </button>
           </div>
        </div>
      )}
    </div>
  );
}

function MenuConfigEditor({
  menus,
  selectedIds,
  configs,
  onChange,
  onToggle,
  onBulkSetGroup,
  onApplyPreset,
  onAutoGroupAll,
  onAddContainer,
  onUpdateGlobalMenu,
  onDeleteGlobalMenu,
  onClearAll,
  existingGroups
}: {
  menus: Menu[];
  selectedIds: Record<number, boolean>;
  configs: Record<number, Partial<MenuTemplateMenuItem>>;
  onChange: (id: number, field: keyof MenuTemplateMenuItem, value: any) => void;
  onToggle: (id: number) => void;
  onBulkSetGroup: (groupName: string) => void;
  onApplyPreset: (preset: PresetDef) => void;
  onAutoGroupAll: () => void;
  onAddContainer: (name: string) => void;
  onUpdateGlobalMenu?: (id: number, label: string) => Promise<void>;
  onDeleteGlobalMenu?: (id: number) => Promise<void>;
  onClearAll?: () => void;
  existingGroups: string[];
}) {
  const { showToast } = useToast();
  const [bulkGroup, setBulkGroup] = useState("");
  const [showPresets, setShowPresets] = useState(false);
  const [treeSelected, setTreeSelected] = useState<Record<number, boolean>>({});
  const [moveTargetGroup, setMoveTargetGroup] = useState("");
  const [moveTargetParentId, setMoveTargetParentId] = useState<number | null | "">("");
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingGroupId, setEditingGroupId] = useState<number | null>(null);
  const [editingGroupLabel, setEditingGroupLabel] = useState("");
  const [workspaceSearch, setWorkspaceSearch] = useState("");
  const [showManageGroups, setShowManageGroups] = useState(false);
  const [movePopoverMenuId, setMovePopoverMenuId] = useState<number | null>(null);
  const [collapsedContainers, setCollapsedContainers] = useState<Record<number, boolean>>({});

  const toggleCollapseContainer = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedContainers(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Drag and Drop State
  const [draggedMenuId, setDraggedMenuId] = useState<number | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [dragOverParent, setDragOverParent] = useState<number | null>(null);
  const [dragOverSibling, setDragOverSibling] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, id: number) => {
    e.dataTransfer.setData("text/plain", id.toString());
    e.dataTransfer.effectAllowed = "move";
    setDraggedMenuId(id);
    e.stopPropagation();
  };

  const handleDragEnd = () => {
    setDraggedMenuId(null);
    setDragOverGroup(null);
    setDragOverParent(null);
    setDragOverSibling(null);
  };

  const handleDropToGroup = (e: React.DragEvent, groupName: string) => {
    e.preventDefault();
    setDragOverGroup(null);
    setDragOverSibling(null);
    const droppedId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!droppedId) return;

    onChange(droppedId, "group_name", groupName);
    onChange(droppedId, "parent_id", null);
  };

  const handleDropToParent = (e: React.DragEvent, parentId: number, groupName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverParent(null);
    setDragOverGroup(null);
    setDragOverSibling(null);
    const droppedId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!droppedId || droppedId === parentId) return;

    onChange(droppedId, "parent_id", parentId);
    onChange(droppedId, "group_name", groupName);
  };

  const handleDropToSibling = (e: React.DragEvent, targetId: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOverSibling(null);
    setDragOverParent(null);
    
    const droppedId = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!droppedId || droppedId === targetId) return;

    const targetCfg = configs[targetId] || {};
    const tParent = targetCfg.parent_id || null;
    
    onChange(droppedId, "parent_id", tParent);
    
    let targetGn = targetCfg.group_name;
    if (tParent) {
       const pCfg = configs[tParent];
       if (pCfg) {
           const pMenu = menus.find(x => x.id === tParent);
           targetGn = pCfg.group_name || pMenu?.module || "General";
       }
    }
    const gn = (targetGn || menus.find(m => m.id === targetId)?.module || "General").trim();
    onChange(droppedId, "group_name", gn);

    // Compute updated sort sequence
    const siblings = selectedMenus.filter(m => {
       const c = configs[m.id] || {};
       const pId = c.parent_id || null;
       let mGn = c.group_name;
       if (pId) {
           const pCfg = configs[pId];
           if (pCfg) mGn = pCfg.group_name || menus.find(x => x.id === pId)?.module || "General";
       }
       const computedGn = (mGn || m.module || "General").trim();

       return pId === tParent && computedGn === gn && m.id !== droppedId;
    }).sort((a,b) => (configs[a.id]?.item_order || 0) - (configs[b.id]?.item_order || 0));

    const targetIndex = siblings.findIndex(s => s.id === targetId);
    const droppedMenu = menus.find(m => m.id === droppedId);
    if (droppedMenu) {
       if (targetIndex !== -1) {
          // Identify if we are dropping after or before. 
          // An easy heuristic is to just splice it before the target.
          siblings.splice(targetIndex, 0, droppedMenu);
       } else {
          siblings.push(droppedMenu);
       }
    }

    siblings.forEach((m, idx) => {
       if (m) onChange(m.id, "item_order", idx + 1);
    });
  };

  const selectedMenus = useMemo(() => menus.filter(m => selectedIds[m.id]), [menus, selectedIds]);
  const treeSelectedIds = Object.entries(treeSelected).filter(([_, v]) => v).map(([id]) => Number(id));

  // Calculate groups with filtering
  const groupsRaw: Record<string, { order: number; items: Menu[] }> = {};
  const term = workspaceSearch.toLowerCase();
  
  selectedMenus.forEach((m) => {
    const cfg = configs[m.id] || {};
    
    // Evaluate the exact section name for this menu or its parent
    const resolveGroupName = (menu: Menu, config: any) => {
       let raw = config.group_name;
       if (raw === "Uncategorized") raw = null;
       return (raw || menu.module || "General").trim();
    };

    let gn = resolveGroupName(m, cfg);

    // Auto-inherit parent's container group visually to prevent orphan items disappearing
    if (cfg.parent_id) {
       const pCfg = configs[cfg.parent_id];
       const pMenu = menus.find(x => x.id == cfg.parent_id);
       if (pCfg && pMenu) {
           gn = resolveGroupName(pMenu, pCfg);
       }
    }
    
    // Match logic: Group name, Label, or Code
    const matches = !term || 
                    gn.toLowerCase().includes(term) || 
                    m.label.toLowerCase().includes(term) || 
                    m.code.toLowerCase().includes(term);
                    
    if (!matches) return;

    if (!groupsRaw[gn]) {
      groupsRaw[gn] = { order: Number(cfg.group_order) || 100, items: [] };
    }
    groupsRaw[gn].items.push(m);
  });

  const sortedGroups = Object.entries(groupsRaw).sort((a, b) => {
    if (a[1].order !== b[1].order) return a[1].order - b[1].order;
    return a[0].localeCompare(b[0]);
  });

  const groupNames = existingGroups;
  const menuGroupsInWorkspace = useMemo(() => menus.filter(m => m.module === "Menu Group"), [menus]);

  const handleToggleTreeSelect = (id: number) => {
    setTreeSelected(p => ({ ...p, [id]: !p[id] }));
  };

  const handleToggleGroupSelect = (groupItems: Menu[]) => {
    const allSelected = groupItems.length > 0 && groupItems.every(m => treeSelected[m.id]);
    const next = { ...treeSelected };
    groupItems.forEach(m => {
      next[m.id] = !allSelected;
    });
    setTreeSelected(next);
  };

  const handleToggleAll = () => {
    // Get currently visible IDs from groupsRaw (which respects workspaceSearch)
    const visibleIds = Object.values(groupsRaw).flatMap(g => g.items.map(m => m.id));
    if (visibleIds.length === 0) return;

    // Check if all visible are currently selected
    const allVisibleSelected = visibleIds.every(id => treeSelected[id]);
    
    const next = { ...treeSelected };
    visibleIds.forEach(id => {
      next[id] = !allVisibleSelected;
    });
    setTreeSelected(next);
  };

  const handleStartEditGroup = (e: React.MouseEvent, id: number, currentLabel: string) => {
    e.stopPropagation();
    setEditingGroupId(id);
    setEditingGroupLabel(currentLabel);
  };

  const handleSaveGroupRename = async (id: number) => {
    if (!editingGroupLabel.trim() || !onUpdateGlobalMenu) {
      setEditingGroupId(null);
      return;
    }
    await onUpdateGlobalMenu(id, editingGroupLabel.trim());
    setEditingGroupId(null);
  };

  const handleBulkMove = () => {
    if (!moveTargetGroup.trim() && moveTargetParentId === "") return;
    
    if (typeof moveTargetParentId === "number" && !selectedIds[moveTargetParentId]) {
      onToggle(moveTargetParentId);
    }

    treeSelectedIds.forEach(id => {
      if (moveTargetGroup.trim()) {
        onChange(id, "group_name", moveTargetGroup.trim());
      }
      if (moveTargetParentId !== "") {
        const pId = moveTargetParentId;
        onChange(id, "parent_id", pId);
        
        if (pId !== null) {
          const pCfg = configs[pId];
          const pMenu = menus.find(x => x.id === pId);
          const computedGn = pCfg?.group_name || pMenu?.module || "General";
          onChange(id, "group_name", computedGn);
          if (pCfg?.group_order) onChange(id, "group_order", pCfg.group_order);
        }
      }
    });

    setTreeSelected({});
    setMoveTargetGroup("");
    setMoveTargetParentId("");
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Header Toolbar */}
      <div style={{ display: "flex", flexDirection: "column", gap: "10px", background: "rgba(15,23,42,0.6)", borderRadius: "16px", padding: "10px 16px", border: "1px solid rgba(99,102,241,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div style={{ width: "32px", height: "32px", borderRadius: "10px", background: "rgba(99,102,241,0.15)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Layers style={{ width: "16px", height: "16px", color: "#818cf8" }} />
              </div>
              <div style={{ fontSize: "14px", fontWeight: 700, color: "#e2e8f0" }}>Hierarchy Builder</div>
            </div>
            
            <div style={{ height: "24px", width: "1px", background: "rgba(255,255,255,0.08)" }} />
            
            <div style={{ display: "flex", gap: "8px" }}>
              <button 
                type="button" 
                onClick={() => setShowAddGroup(true)}
                style={{ height: "32px", padding: "0 12px", background: "rgba(52,211,153,0.15)", border: "1px solid rgba(52,211,153,0.3)", borderRadius: "8px", color: "#6ee7b7", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Layers style={{ width: "14px", height: "14px" }} /> Add Menu Group
              </button>
              
              <button 
                type="button" 
                onClick={() => setShowManageGroups(!showManageGroups)}
                style={{ height: "32px", padding: "0 12px", background: showManageGroups ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.15)", border: `1px solid ${showManageGroups ? "#818cf8" : "rgba(99,102,241,0.3)"}`, borderRadius: "8px", color: "#a5b4fc", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                📝 Manage Groups
              </button>

              <button 
                type="button" 
                onClick={onAutoGroupAll}
                title="Magic Wand: Auto-Group all menus based on their purpose"
                style={{ height: "32px", padding: "0 12px", background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.3)", borderRadius: "8px", color: "#d8b4fe", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px", transition: "all 0.2s" }}
              >
                🪄 Magic Wand
              </button>

              <div style={{ position: "relative" }}>
                <button 
                  type="button" 
                  onClick={() => setShowPresets(!showPresets)}
                  style={{ height: "32px", padding: "0 12px", background: "rgba(99,102,241,0.15)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "8px", color: "#a5b4fc", fontSize: "12px", fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
                >
                  📋 Load Preset <ChevronDown style={{ width: "14px", height: "14px" }} />
                </button>
                {showPresets && (
                  <div style={{ position: "absolute", top: "100%", right: 0, marginTop: "8px", background: "#1e293b", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "12px", width: "240px", zIndex: 50, padding: "8px", boxShadow: "0 10px 25px rgba(0,0,0,0.5)" }}>
                    {TEMPLATE_PRESETS.map(p => (
                      <button 
                        key={p.name}
                        type="button"
                        onClick={() => { onApplyPreset(p); setShowPresets(false); }}
                        style={{ width: "100%", textAlign: "left", padding: "10px 12px", borderRadius: "8px", background: "transparent", border: "none", color: "#cbd5e1", cursor: "pointer", transition: "all 0.2s" }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 700 }}>{p.name}</div>
                        <div style={{ fontSize: "10px", color: "#64748b", marginTop: "2px", lineHeight: "1.4" }}>{p.description}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <button 
              type="button" 
              onClick={handleToggleAll}
              title="Select All Visible"
              style={{ height: "34px", padding: "0 10px", background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "8px", color: "#818cf8", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
            >
              {(() => {
                const visibleIds = Object.values(groupsRaw).flatMap(g => g.items.map(m => m.id));
                const allSelected = visibleIds.length > 0 && visibleIds.every(id => treeSelected[id]);
                return allSelected ? <X size={14} /> : <Check size={14} />;
              })()}
              {(() => {
                const visibleIds = Object.values(groupsRaw).flatMap(g => g.items.map(m => m.id));
                const allSelected = visibleIds.length > 0 && visibleIds.every(id => treeSelected[id]);
                return allSelected ? "Deselect Visible" : "Select Visible";
              })()}
            </button>

            {selectedMenus.length > 0 && onClearAll && (
              <button 
                type="button" 
                onClick={() => {
                  if (confirm(`Remove all ${selectedMenus.length} menus from this template?`)) {
                    onClearAll();
                  }
                }}
                title="Clear All Menus"
                style={{ height: "34px", padding: "0 10px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "8px", color: "#fca5a5", fontSize: "11px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "6px" }}
              >
                <Trash2 size={14} /> Clear Workspace
              </button>
            )}

            <div style={{ height: "24px", width: "1px", background: "rgba(255,255,255,0.08)" }} />

            {/* Workspace Filter */}
            <div style={{ position: "relative" }}>
               <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "#6366f1" }} />
               <input
                placeholder="Filter workspace..."
                value={workspaceSearch}
                onChange={(e) => setWorkspaceSearch(e.target.value)}
                style={{ ...G.inputStyle, width: "200px", padding: "8px 12px 8px 32px", background: "rgba(99,102,241,0.05)", border: "1px solid rgba(99,102,241,0.2)", fontSize: "11px", height: "36px", color: "#fff" }}
              />
              {workspaceSearch && (
                <button 
                  onClick={() => setWorkspaceSearch("")}
                  style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#475569", cursor: "pointer", fontSize: "14px" }}
                >
                  ×
                </button>
              )}
            </div>

            <div style={{ height: "24px", width: "1px", background: "rgba(255,255,255,0.08)" }} />

            <div style={{ position: "relative" }}>
               <Search style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", width: "14px", height: "14px", color: "#475569" }} />
               <input
                list="existing-groups"
                placeholder="Bulk Category..."
                value={bulkGroup}
                onChange={(e) => setBulkGroup(e.target.value)}
                style={{ ...G.inputStyle, width: "160px", padding: "8px 12px 8px 32px", background: "rgba(0,0,0,0.3)", fontSize: "11px", height: "36px" }}
              />
            </div>
            <button
              type="button"
              onClick={() => { if (bulkGroup.trim()) onBulkSetGroup(bulkGroup.trim()); setBulkGroup(""); }}
              style={{ height: "36px", padding: "0 14px", background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.3)", borderRadius: "8px", color: "#818cf8", fontSize: "11px", fontWeight: 700, cursor: "pointer" }}
            >
              Categorize
            </button>
          </div>
        </div>

        {/* Multi-Move Bar */}
        {treeSelectedIds.length > 0 && (
           <div style={{ display: "flex", alignItems: "center", gap: "12px", padding: "8px 12px", background: "rgba(99,102,241,0.1)", borderRadius: "10px", border: "1px solid rgba(99,102,241,0.2)", animation: "fadeIn 0.2s ease" }}>
              <span style={{ fontSize: "11px", fontWeight: 800, color: "#d8b4fe" }}>{treeSelectedIds.length} ITEMS SELECTED</span>
              <div style={{ flex: 1 }} />
              <input 
                 list="existing-groups"
                 placeholder="Move to group..."
                 value={moveTargetGroup}
                 onChange={(e) => setMoveTargetGroup(e.target.value)}
                 style={{ ...G.inputStyle, width: "180px", height: "34px", fontSize: "11px", background: "rgba(0,0,0,0.4)" }}
              />
              <div style={{ position: "relative" }}>
                <select 
                   value={moveTargetParentId === null ? "null" : moveTargetParentId}
                   onChange={(e) => {
                     const val = e.target.value;
                     if (val === "") setMoveTargetParentId("");
                     else if (val === "null") setMoveTargetParentId(null);
                     else setMoveTargetParentId(Number(val));
                   }}
                   style={{ ...G.inputStyle, width: "180px", height: "34px", fontSize: "11px", background: "rgba(0,0,0,0.4)", padding: "0 10px" }}
                >
                   <option value="">Nest inside...</option>
                   <option value="null">-- No Parent --</option>
                   {menuGroupsInWorkspace.map(mg => (
                     <option key={mg.id} value={mg.id}>Group: {mg.label}</option>
                   ))}
                </select>
              </div>
              <button 
                 onClick={handleBulkMove}
                 disabled={!moveTargetGroup.trim() && moveTargetParentId === ""}
                 style={{ height: "34px", padding: "0 14px", background: "#6366f1", color: "#fff", border: "none", borderRadius: "6px", fontSize: "11px", fontWeight: 700, cursor: "pointer", opacity: (moveTargetGroup.trim() || moveTargetParentId !== "") ? 1 : 0.5 }}
              >
                 Move All
              </button>
              <button onClick={() => setTreeSelected({})} style={{ background: "none", border: "none", color: "#64748b", fontSize: "11px", cursor: "pointer" }}>Cancel</button>
           </div>
        )}

        {/* Add Group Prompt */}
        {showAddGroup && (
          <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "12px", background: "rgba(52,211,153,0.1)", borderRadius: "10px", border: "1px solid rgba(52,211,153,0.2)", animation: "fadeIn 0.2s ease" }}>
             <Layers style={{ width: "16px", height: "16px", color: "#10b981" }} />
             <input 
                placeholder="Group Name (e.g. Sales Reports)"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) {
                    onAddContainer(newGroupName.trim());
                    setNewGroupName("");
                    setShowAddGroup(false);
                  }
                }}
                style={{ ...G.inputStyle, flex: 1, height: "32px", fontSize: "12px", background: "rgba(0,0,0,0.3)" }}
             />
             <button 
                type="button"
                disabled={!newGroupName.trim()}
                onClick={() => { onAddContainer(newGroupName.trim()); setNewGroupName(""); setShowAddGroup(false); }}
                style={{ height: "32px", padding: "0 16px", background: "#10b981", color: "#fff", border: "none", borderRadius: "8px", fontSize: "12px", fontWeight: 700, cursor: "pointer", opacity: newGroupName.trim() ? 1 : 0.5 }}
             >
                Create Group
             </button>
             <button onClick={() => { setShowAddGroup(false); setNewGroupName(""); }} style={{ background: "none", border: "none", color: "#64748b", fontSize: "12px", cursor: "pointer" }}>Cancel</button>
          </div>
        )}

        {/* Manage Groups List */}
        {showManageGroups && (
          <div style={{ marginTop: "10px", padding: "16px", background: "rgba(30,41,59,0.5)", borderRadius: "14px", border: "1px solid rgba(99,102,241,0.3)", animation: "fadeIn 0.2s ease" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>Workspace Menu Groups</div>
              <button onClick={() => setShowManageGroups(false)} style={{ background: "none", border: "none", color: "#64748b", cursor: "pointer", fontSize: "12px" }}>Close</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "10px" }}>
              {menuGroupsInWorkspace.length === 0 ? (
                <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "20px", color: "#475569", fontSize: "11px" }}>No custom groups created yet. Click &quot;Add Menu Group&quot; to start.</div>
              ) : (
                menuGroupsInWorkspace.map(mg => (
                  <div key={mg.id} style={{ background: "rgba(0,0,0,0.2)", borderRadius: "10px", padding: "10px", border: "1px solid rgba(255,255,255,0.05)", display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <Layers style={{ width: "14px", height: "14px", color: "#818cf8" }} />
                      <div style={{ fontSize: "10px", color: "#6366f1", fontFamily: "monospace" }}>{mg.code}</div>
                    </div>
                    {editingGroupId === mg.id ? (
                      <div style={{ display: "flex", gap: "4px" }}>
                        <input 
                          autoFocus
                          value={editingGroupLabel}
                          onChange={(e) => setEditingGroupLabel(e.target.value)}
                          style={{ ...G.inputStyle, height: "30px", fontSize: "11px", background: "#0f172a", flex: 1 }}
                        />
                        <button onClick={() => handleSaveGroupRename(mg.id)} style={{ background: "#10b981", border: "none", color: "#fff", padding: "0 6px", borderRadius: "4px", cursor: "pointer" }}><Check size={14} /></button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>{mg.label}</div>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button 
                            onClick={(e) => handleStartEditGroup(e as any, mg.id, mg.label)}
                            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)", color: "#818cf8", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", cursor: "pointer" }}
                          >
                            RENAME
                          </button>
                          <button 
                            onClick={async () => {
                              if (confirm(`Permanently delete group "${mg.label}"? This cannot be undone.`)) {
                                if (onDeleteGlobalMenu) await onDeleteGlobalMenu(mg.id);
                              }
                            }}
                            style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", color: "#fca5a5", fontSize: "10px", fontWeight: 700, padding: "2px 8px", borderRadius: "6px", cursor: "pointer" }}
                          >
                             DELETE
                          </button>
                        </div>
                      </div>
                    )}
                    
                    <div style={{ marginTop: "4px", padding: "6px", background: "rgba(0,0,0,0.2)", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.03)" }}>
                       <div style={{ fontSize: "9px", fontWeight: 800, color: "#475569", textTransform: "uppercase", marginBottom: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
                          <ListTree size={10} /> Items nested in this group:
                       </div>
                       <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                          {(() => {
                             const nested = menus.filter(m => selectedIds[m.id] && configs[m.id]?.parent_id === mg.id);
                             if (nested.length === 0) return <div style={{ fontSize: "10px", color: "#334155", fontStyle: "italic" }}>Empty</div>;
                             return nested.map(n => (
                                <div key={n.id} style={{ fontSize: "10px", padding: "1px 6px", background: "rgba(99,102,241,0.1)", borderRadius: "4px", color: "#94a3b8", border: "1px solid rgba(99,102,241,0.15)" }}>
                                   {n.label}
                                </div>
                             ));
                          })()}
                       </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Layout */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "16px", alignItems: "start" }}>
        
        {/* Hierarchy Tree */}
        <div style={{ display: "flex", flexDirection: "column", gap: "16px", minHeight: "400px" }}>
          {selectedMenus.length === 0 ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px", background: "rgba(15,23,42,0.3)", borderRadius: "18px", border: "1px dashed rgba(99,102,241,0.15)" }}>
               <div style={{ width: "48px", height: "48px", borderRadius: "50%", background: "rgba(99,102,241,0.08)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: "16px" }}>
                  <PlusCircle style={{ width: "24px", height: "24px", color: "#475569" }} />
               </div>
               <div style={{ color: "#94a3b8", fontSize: "14px", fontWeight: 600 }}>Workspace Empty</div>
               <div style={{ color: "#475569", fontSize: "12px", marginTop: "4px", textAlign: "center", maxWidth: "240px" }}>Add menus from the pool or load a preset to begin building.</div>
            </div>
          ) : (
            sortedGroups.map(([groupName, data], gIdx) => (
              <div key={groupName} style={{ background: "rgba(30,41,59,0.4)", borderRadius: "14px", border: "1px solid rgba(255,255,255,0.05)" }}>
                {/* Group Folder Header */}
                <div 
                  style={{ 
                    padding: "10px 16px", 
                    background: dragOverGroup === groupName ? "rgba(99,102,241,0.2)" : "rgba(255,255,255,0.02)", 
                    borderBottom: dragOverGroup === groupName ? "1px solid rgba(99,102,241,0.5)" : "1px solid rgba(255,255,255,0.05)", 
                    display: "flex", 
                    alignItems: "center", 
                    justifyContent: "space-between",
                    transition: "all 0.2s"
                  }}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverGroup(groupName); }}
                  onDragLeave={() => setDragOverGroup(null)}
                  onDrop={(e) => handleDropToGroup(e, groupName)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                     <input 
                        type="checkbox" 
                        checked={data.items.length > 0 && data.items.every(m => treeSelected[m.id])}
                        onChange={() => handleToggleGroupSelect(data.items)}
                        style={{ width: "15px", height: "15px", accentColor: "#6366f1", cursor: "pointer", marginRight: "4px" }}
                        title="Select all items in this group"
                     />
                     <FolderEdit style={{ width: "16px", height: "16px", color: "#6366f1" }} />
                     <input 
                       value={groupName}
                       onChange={(e) => {
                         const nextName = e.target.value;
                         data.items.forEach(m => onChange(m.id, "group_name", nextName));
                       }}
                       placeholder="Group Name..."
                       style={{ background: "transparent", border: "none", color: "#c7d2fe", fontSize: "13px", fontWeight: 700, padding: "2px 4px", outline: "none", width: "160px", height: "30px" }}
                     />
                     <span style={{ fontSize: "10px", color: "#475569", background: "rgba(0,0,0,0.2)", padding: "1px 6px", borderRadius: "6px" }}>{data.items.length}</span>
                     
                     <select 
                        value=""
                        onChange={(e) => {
                          const target = e.target.value;
                          if (target === "NEW_GROUP") {
                            const name = prompt("Enter new group name:");
                            if (name?.trim()) {
                              data.items.forEach(m => onChange(m.id, "group_name", name.trim()));
                              showToast({ title: "Group Created", description: `Entire content moved to new group "${name.trim()}".`, variant: "success" });
                            }
                          } else if (target) {
                            data.items.forEach(m => onChange(m.id, "group_name", target));
                            showToast({ title: "Group Moved", description: `Entire content of "${groupName}" moved to "${target}".`, variant: "success" });
                          }
                        }}
                        style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "6px", color: "#818cf8", fontSize: "10px", fontWeight: 700, height: "24px", padding: "0 6px", cursor: "pointer", outline: "none" }}
                     >
                        <option value="">Move all to...</option>
                        {groupNames.filter(gn => gn !== groupName).map(gn => (
                          <option key={gn} value={gn}>{gn}</option>
                        ))}
                        <option value="NEW_GROUP">+ New Group...</option>
                     </select>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                      <button 
                        type="button"
                        onClick={() => {
                          if (confirm(`Remove all ${data.items.length} menus in group "${groupName}" from this template?`)) {
                            data.items.forEach(m => onToggle(m.id));
                          }
                        }}
                        style={{ height: "24px", padding: "0 8px", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "6px", color: "#fca5a5", fontSize: "10px", fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" }}
                      >
                         <Trash2 size={12} strokeWidth={2.5} /> <span style={{ fontSize: "9px" }}>REMOVE GROUP</span>
                      </button>
                      <div style={{ height: "16px", width: "1px", background: "rgba(255,255,255,0.1)" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                        <span style={{ fontSize: "10px", color: "#475569", fontWeight: 800 }}>SORT</span>
                        <input 
                          type="number"
                          value={data.order}
                          onChange={(e) => {
                            const val = parseInt(e.target.value) || 0;
                            data.items.forEach(m => onChange(m.id, "group_order", val));
                          }}
                          style={{ width: "44px", height: "34px", textAlign: "center", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#818cf8", fontSize: "11px", fontWeight: 700 }}
                        />
                     </div>
                  </div>
                </div>

                {/* Items List (Tree Leaves) */}
                <div style={{ padding: "12px", display: "flex", flexDirection: "column", gap: "10px" }}>
                  {(() => {
                    const sectionItems = data.items;

                    // Rescue orphaned children whose parents are not selected/visible in the workspace
                    const allChildren = sectionItems.filter(m => {
                       const pid = configs[m.id]?.parent_id;
                       if (!pid) return false;
                       return sectionItems.some(x => x.id == pid);
                    });

                    const rootItems = sectionItems.filter(m => {
                       const pid = configs[m.id]?.parent_id;
                       if (!pid) return true;
                       return !sectionItems.some(x => x.id == pid);
                    });

                    const rootGroups = rootItems.filter(m => m.module === "Menu Group" || (m.code && m.code.startsWith("group.")));
                    const rootStandalone = rootItems.filter(m => m.module !== "Menu Group" && !(m.code && m.code.startsWith("group.")));
                    
                    const renderItem = (m: Menu, isChild = false, showMoveBtn?: boolean) => {
                      const cfg = configs[m.id] || {};
                      const isSelected = Boolean(treeSelected[m.id]);
                      const isGroup = m.module === "Menu Group" || (m.code && m.code.startsWith("group."));
                      // By default, show MOVE button only for non-group items; callers can override
                      const canMove = showMoveBtn !== undefined ? showMoveBtn : !isGroup;

                      return (
                        <div 
                          key={m.id} 
                          draggable
                          onDragStart={(e) => handleDragStart(e, m.id)}
                          onDragEnd={handleDragEnd}
                          onDragOver={(e) => {
                            if (draggedMenuId !== m.id) {
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              e.dataTransfer.dropEffect = "move";
                              setDragOverSibling(m.id);
                            }
                          }}
                          onDragLeave={(e) => {
                             e.stopPropagation();
                             setDragOverSibling(null);
                          }}
                          onDrop={(e) => handleDropToSibling(e, m.id)}
                          style={{ 
                            display: "flex", 
                            alignItems: "center", 
                            justifyContent: "space-between", 
                            padding: "8px 12px", 
                            background: isGroup ? "rgba(99,102,241,0.12)" : (isSelected ? "rgba(99,102,241,0.08)" : (draggedMenuId === m.id ? "rgba(99,102,241,0.3)" : "rgba(0,0,0,0.15)")), 
                            borderRadius: "10px", 
                            border: dragOverSibling === m.id ? "1px solid rgba(16,185,129,0.8)" : (isGroup ? "1px solid rgba(99,102,241,0.3)" : (isSelected ? "1px solid rgba(99,102,241,0.2)" : "1px solid transparent")), 
                            transition: "all 0.2s",
                            opacity: draggedMenuId === m.id ? 0.5 : 1,
                            width: "100%",
                            minWidth: 0,
                            boxSizing: "border-box"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1, minWidth: 0 }}>
                             <div style={{ cursor: "grab", color: "#475569", display: "flex", alignItems: "center" }} title="Drag to move">
                               <GripVertical size={14} />
                             </div>
                             <input 
                                type="checkbox" 
                                checked={isSelected} 
                                onChange={() => handleToggleTreeSelect(m.id)}
                                style={{ width: "14px", height: "14px", accentColor: "#6366f1", cursor: "pointer", flexShrink: 0 }}
                             />
                             {isChild && <ListTree style={{ width: "14px", height: "14px", color: "#475569", flexShrink: 0 }} />}
                             <div style={{ minWidth: 0, flex: 1 }}>
                                {isGroup && editingGroupId === m.id ? (
                                  <div style={{ position: "relative", display: "flex", alignItems: "center", gap: "6px", width: "100%" }}>
                                    <input 
                                      autoFocus
                                      value={editingGroupLabel}
                                      onChange={(e) => setEditingGroupLabel(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter") {
                                          e.preventDefault();
                                          handleSaveGroupRename(m.id);
                                        }
                                        if (e.key === "Escape") setEditingGroupId(null);
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      onMouseDown={(e) => e.stopPropagation()}
                                      style={{ ...G.inputStyle, height: "34px", fontSize: "12px", background: "#0f172a", width: "100%", outline: "2px solid #6366f1", color: "#fff", paddingRight: "50px" }}
                                    />
                                    <div style={{ position: "absolute", right: "4px", top: "50%", transform: "translateY(-50%)", display: "flex", gap: "2px" }}>
                                      <button 
                                        type="button" 
                                        onClick={(e) => { e.stopPropagation(); handleSaveGroupRename(m.id); }}
                                        style={{ background: "#10b981", border: "none", borderRadius: "4px", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}
                                      >
                                        <Check size={12} strokeWidth={3} />
                                      </button>
                                      <button 
                                        type="button" 
                                        onClick={(e) => { e.stopPropagation(); setEditingGroupId(null); }}
                                        style={{ background: "#475569", border: "none", borderRadius: "4px", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#fff" }}
                                      >
                                        <X size={12} strokeWidth={3} />
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div 
                                    style={{ fontSize: "12px", fontWeight: isGroup ? 800 : 600, color: isGroup ? "#a5b4fc" : (isSelected ? "#cbd5e1" : "#94a3b8"), display: "flex", alignItems: "center", gap: "8px", cursor: isGroup ? "pointer" : "default", width: "100%", minWidth: 0 }}
                                    onClick={(e) => {
                                      if (isGroup) {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        handleStartEditGroup(e, m.id, m.label);
                                      }
                                    }}
                                    className="group/item-label"
                                  >
                                    {isGroup && <Layers style={{ width: "14px", height: "14px", color: "#818cf8", flexShrink: 0 }} />}
                                    <span style={{ 
                                      borderBottom: isGroup ? "1px dashed rgba(129, 140, 248, 0.3)" : "none",
                                      whiteSpace: "nowrap",
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      maxWidth: "100%"
                                    }}>
                                      {m.label}
                                    </span>
                                    {isGroup && (
                                      <div style={{ display: "flex", gap: "4px" }}>
                                        <button
                                          type="button"
                                          title="Update Group Label"
                                          style={{ 
                                            padding: "2px 6px", 
                                            background: "rgba(99,102,241,0.1)", 
                                            border: "1px solid rgba(99,102,241,0.2)", 
                                            borderRadius: "4px", 
                                            display: "flex", 
                                            alignItems: "center", 
                                            gap: "4px",
                                            cursor: "pointer",
                                            marginLeft: "4px",
                                            flexShrink: 0
                                          }}
                                          className="opacity-60 group-hover/item-label:opacity-100 transition-opacity"
                                        >
                                          <FolderEdit style={{ width: "10px", height: "10px", color: "#818cf8" }} />
                                          <span style={{ fontSize: "9px", fontWeight: 700, color: "#818cf8" }}>UPDATE</span>
                                        </button>
                                        <button
                                          type="button"
                                          title="Permanently Delete Group"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            if (confirm(`Permanently delete group "${m.label}"? This cannot be undone.`)) {
                                              if (onDeleteGlobalMenu) onDeleteGlobalMenu(m.id);
                                            }
                                          }}
                                          style={{ 
                                            padding: "2px 6px", 
                                            background: "rgba(239,68,68,0.1)", 
                                            border: "1px solid rgba(239,68,68,0.2)", 
                                            borderRadius: "4px", 
                                            display: "flex", 
                                            alignItems: "center", 
                                            gap: "4px",
                                            cursor: "pointer",
                                            flexShrink: 0
                                          }}
                                          className="opacity-60 group-hover/item-label:opacity-100 transition-opacity"
                                        >
                                          <Trash2 style={{ width: "10px", height: "10px", color: "#fca5a5" }} />
                                          <span style={{ fontSize: "9px", fontWeight: 700, color: "#fca5a5" }}>DELETE</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div style={{ fontSize: "10px", color: "#475569", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.code}</div>
                             </div>
                          </div>
                          
                          <div style={{ display: "flex", gap: "8px", alignItems: "center", flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                              {/* Move to Group Popover */}
                             {canMove && (
                               <div style={{ position: "relative" }}>
                                 <button
                                   type="button"
                                   title="Move to a different group"
                                   onClick={(e) => { e.stopPropagation(); setMovePopoverMenuId(movePopoverMenuId === m.id ? null : m.id); }}
                                   style={{
                                     padding: "3px 8px",
                                     background: movePopoverMenuId === m.id ? "rgba(99,102,241,0.25)" : "rgba(99,102,241,0.08)",
                                     border: "1px solid rgba(99,102,241,0.3)",
                                     borderRadius: "6px",
                                     color: "#a5b4fc",
                                     fontSize: "9px",
                                     fontWeight: 800,
                                     cursor: "pointer",
                                     display: "flex",
                                     alignItems: "center",
                                     gap: "3px",
                                     whiteSpace: "nowrap",
                                     letterSpacing: "0.5px"
                                   }}
                                 >
                                   <MoveUp size={10} /> MOVE
                                 </button>
                                 {movePopoverMenuId === m.id && (
                                   <div
                                     style={{
                                       position: "absolute",
                                       top: "calc(100% + 4px)",
                                       right: 0,
                                       zIndex: 999,
                                       background: "#0f172a",
                                       border: "1px solid rgba(99,102,241,0.35)",
                                       borderRadius: "10px",
                                       padding: "6px",
                                       minWidth: "160px",
                                       boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                                       display: "flex",
                                       flexDirection: "column",
                                       gap: "2px"
                                     }}
                                     onClick={(e) => e.stopPropagation()}
                                   >
                                     {/* Nesting options (Now at the top) */}
                                     {menuGroupsInWorkspace.length > 0 && (
                                       <>
                                         <div style={{ fontSize: "9px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", padding: "2px 6px 6px" }}>Nest in Container</div>
                                         <div style={{ maxHeight: "140px", overflowY: "auto", display: "flex", flexDirection: "column", gap: "2px", padding: "4px 0" }}>
                                         {cfg.parent_id !== null && cfg.parent_id !== undefined && (
                                           <button
                                             type="button"
                                             onClick={() => {
                                               onChange(m.id, "parent_id", null);
                                               setMovePopoverMenuId(null);
                                             }}
                                             style={{
                                               padding: "6px 10px",
                                               background: "transparent",
                                               border: "none",
                                               borderRadius: "6px",
                                               color: "#10b981",
                                               fontSize: "11px",
                                               textAlign: "left",
                                               cursor: "pointer",
                                               fontWeight: 600,
                                               transition: "all 0.15s",
                                               display: "flex",
                                               alignItems: "center",
                                               gap: "6px"
                                             }}
                                             onMouseOver={(e) => { e.currentTarget.style.background = "rgba(16,185,129,0.15)"; e.currentTarget.style.color = "#34d399"; }}
                                             onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#10b981"; }}
                                           >
                                             ↑ Extract to Root
                                           </button>
                                         )}
                                         {menuGroupsInWorkspace.filter(mg => mg.id !== m.id && cfg.parent_id !== mg.id).map((mg) => {
                                           const mgCfg = configs[mg.id] || {};
                                           const mgGroupName = mgCfg.group_name || mg.module || "General";
                                           
                                           return (
                                             <button
                                               key={`nest-${mg.id}`}
                                               type="button"
                                               onClick={() => {
                                                  // Nest the item and inherit the container's parent group section
                                                  onChange(m.id, "parent_id", mg.id);
                                                  onChange(m.id, "group_name", mgGroupName);
                                                  setMovePopoverMenuId(null);
                                               }}
                                               style={{
                                                 padding: "6px 10px",
                                                 background: "transparent",
                                                 border: "none",
                                                 borderRadius: "6px",
                                                 color: "#94a3b8",
                                                 fontSize: "11px",
                                                 textAlign: "left",
                                                 cursor: "pointer",
                                                 fontWeight: 600,
                                                 transition: "all 0.15s",
                                                 display: "flex",
                                                 alignItems: "center",
                                                 gap: "6px"
                                               }}
                                               onMouseOver={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.15)"; e.currentTarget.style.color = "#c7d2fe"; }}
                                               onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
                                             >
                                               <Layers style={{ width: "12px", height: "12px", color: "#818cf8", flexShrink: 0 }} /> 
                                               <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{mg.label}</span>
                                             </button>
                                           );
                                         })}
                                         {menuGroupsInWorkspace.filter(mg => mg.id !== m.id && cfg.parent_id !== mg.id).length === 0 && (cfg.parent_id === null || cfg.parent_id === undefined) && (
                                           <div style={{ padding: "6px 10px", fontSize: "10px", color: "#475569" }}>No containers available</div>
                                         )}
                                         </div>
                                       </>
                                     )}
                                     
                                     {/* Move to Group Section */}
                                     {menuGroupsInWorkspace.length > 0 && <div style={{ height: "1px", background: "rgba(255,255,255,0.05)", margin: "4px 0" }} />}
                                     <div style={{ fontSize: "9px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", padding: "8px 6px 4px" }}>Move to Section</div>
                                     {existingGroups.filter(gn => gn !== (cfg.group_name || "")).map((gn) => (
                                       <button
                                         key={gn}
                                         type="button"
                                         onClick={() => {
                                           onChange(m.id, "group_name", gn);
                                           onChange(m.id, "parent_id", null);
                                           setMovePopoverMenuId(null);
                                         }}
                                         style={{
                                           padding: "6px 10px",
                                           background: "transparent",
                                           border: "none",
                                           borderRadius: "6px",
                                           color: "#94a3b8",
                                           fontSize: "11px",
                                           textAlign: "left",
                                           cursor: "pointer",
                                           fontWeight: 600,
                                           transition: "all 0.15s"
                                         }}
                                         onMouseOver={(e) => { e.currentTarget.style.background = "rgba(99,102,241,0.15)"; e.currentTarget.style.color = "#c7d2fe"; }}
                                         onMouseOut={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#94a3b8"; }}
                                       >
                                         → {gn}
                                       </button>
                                     ))}
                                     {existingGroups.filter(gn => gn !== (cfg.group_name || "")).length === 0 && (
                                       <div style={{ padding: "6px 10px", fontSize: "10px", color: "#475569" }}>No other sections available</div>
                                     )}
                                   </div>
                                 )}
                               </div>
                             )}



                             <div style={{ display: "flex", alignItems: "center", gap: "4px", background: "rgba(0,0,0,0.2)", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.05)", padding: "0 6px" }}>
                               <input 
                                 type="number" 
                                 value={cfg.item_order ?? ""} 
                                 onChange={(e) => onChange(m.id, "item_order", parseInt(e.target.value) || 0)}
                                 style={{ width: "42px", height: "32px", border: "none", background: "transparent", color: "#fff", fontSize: "11px", fontWeight: 700, textAlign: "center" }}
                               />
                             </div>

                             <button 
                                type="button" 
                                onClick={() => onChange(m.id, "is_sidebar_visible", cfg.is_sidebar_visible === false)} 
                                style={{ 
                                  padding: "4px", 
                                  background: cfg.is_sidebar_visible === false ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.1)", 
                                  border: "none", 
                                  color: cfg.is_sidebar_visible === false ? "#ef4444" : "#22c55e", 
                                  borderRadius: "6px",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center"
                                }} 
                                title={cfg.is_sidebar_visible === false ? "Hidden from Sidebar" : "Visible in Sidebar"}
                              >
                                {cfg.is_sidebar_visible === false ? <EyeOff style={{ width: "14px", height: "14px" }} /> : <Eye style={{ width: "14px", height: "14px" }} />}
                              </button>

                             <button type="button" onClick={() => onToggle(m.id)} style={{ padding: "4px", background: "transparent", border: "none", color: "#ef4444", opacity: 0.5, cursor: "pointer" }} onMouseOver={(e) => { e.currentTarget.style.opacity = "1"; }} onMouseOut={(e) => { e.currentTarget.style.opacity = "0.5"; }}>
                               <Trash2 style={{ width: "14px", height: "14px" }} />
                             </button>
                          </div>
                        </div>
                      );
                    };

                    return (
                      <>
                        {/* Standalone Items first */}
                        {/* Standalone Items first */}
                        {rootStandalone.length > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {rootStandalone.map(m => {
                              const children = allChildren.filter(c => configs[c.id]?.parent_id == m.id);
                              return (
                                <div 
                                  key={m.id}
                                  style={{
                                    background: dragOverParent === m.id ? "rgba(99,102,241,0.15)" : "transparent",
                                    border: dragOverParent === m.id ? "1px solid rgba(99,102,241,0.6)" : "1px solid transparent",
                                    borderRadius: "14px",
                                    padding: dragOverParent === m.id || children.length > 0 ? "4px" : "0",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: "4px",
                                    transition: "all 0.2s"
                                  }}
                                  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOverParent(m.id); }}
                                  onDragLeave={(e) => { e.stopPropagation(); setDragOverParent(null); }}
                                  onDrop={(e) => handleDropToParent(e, m.id, groupName)}
                                >
                                  {renderItem(m)}
                                  {children.length > 0 && (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 4px 4px 20px" }}>
                                      {children.map(c => renderItem(c, true))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* Custom Group Containers */}
                        {rootGroups.map(group => (
                          <div 
                            key={group.id} 
                            style={{ 
                              background: dragOverParent === group.id ? "rgba(99,102,241,0.15)" : "rgba(99,102,241,0.04)", 
                              border: dragOverParent === group.id ? "1px solid rgba(99,102,241,0.6)" : "1px solid rgba(99,102,241,0.15)", 
                              borderRadius: "14px", 
                              padding: "10px", 
                              display: "flex", 
                              flexDirection: "column", 
                              gap: "10px",
                              transition: "all 0.2s"
                            }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOverParent(group.id); }}
                            onDragLeave={() => setDragOverParent(null)}
                            onDrop={(e) => handleDropToParent(e, group.id, groupName)}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", borderBottom: collapsedContainers[group.id] ? "none" : "1px solid rgba(99,102,241,0.1)", paddingBottom: collapsedContainers[group.id] ? "0" : "8px", marginBottom: collapsedContainers[group.id] ? "0" : "2px", width: "100%" }}>
                               <button
                                 type="button"
                                 onClick={(e) => toggleCollapseContainer(group.id, e)}
                                 style={{
                                   background: "rgba(99,102,241,0.1)",
                                   border: "none",
                                   borderRadius: "4px",
                                   color: "#a5b4fc",
                                   cursor: "pointer",
                                   padding: "4px",
                                   display: "flex",
                                   alignItems: "center",
                                   justifyContent: "center",
                                   flexShrink: 0
                                 }}
                               >
                                 {collapsedContainers[group.id] ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                               </button>
                               <div style={{ flex: 1 }}>
                                 {renderItem(group)}
                               </div>
                            </div>
                            {!collapsedContainers[group.id] && (
                              <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "0 4px 4px 20px" }}>
                               {allChildren.filter(c => configs[c.id]?.parent_id == group.id).map(c => {
                                 const subChildren = allChildren.filter(sub => configs[sub.id]?.parent_id == c.id);
                                 return (
                                   <div 
                                      key={c.id} 
                                      style={{ display: "flex", flexDirection: "column", gap: "4px" }}
                                      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = "move"; setDragOverParent(c.id); }}
                                      onDrop={(e) => handleDropToParent(e, c.id, groupName)}
                                   >
                                     {renderItem(c, true)}
                                     {subChildren.length > 0 && (
                                       <div style={{ display: "flex", flexDirection: "column", gap: "4px", padding: "4px 4px 4px 20px" }}>
                                         {subChildren.map(subC => renderItem(subC, true))}
                                       </div>
                                     )}
                                   </div>
                                 );
                               })}
                               {allChildren.filter(c => configs[c.id]?.parent_id == group.id).length === 0 && (
                                 <div style={{ padding: "12px", textAlign: "center", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: "10px", fontSize: "10px", color: "#475569" }}>
                                   Container empty. Move items here.
                                 </div>
                               )}
                             </div>
                            )}
                          </div>
                        ))}
                      </>
                    );
                  })()}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Live Sidebar Preview (Integrated) */}
        <div style={{ position: "sticky", top: "20px" }}>
          <div style={{ background: "#0f172a", borderRadius: "18px", border: "1px solid rgba(99,102,241,0.3)", padding: "20px", boxShadow: "0 12px 32px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px", borderBottom: "1px solid rgba(255,255,255,0.05)", paddingBottom: "12px" }}>
              <LayoutDashboard style={{ width: "16px", height: "16px", color: "#6366f1" }} />
              <div style={{ fontSize: "12px", fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "1px" }}>Sidebar Preview</div>
            </div>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {sortedGroups.map(([groupName, data]) => {
                const visibleItems = data.items.filter(m => {
                  const cfg = configs[m.id] || {};
                  // Only hide the specifically disabled menu itself. Do NOT hide active children! 
                  // Active children should remain in the preview to simulate how they are hoisted in the real sidebar.
                  if (cfg.is_sidebar_visible === false) return false;
                  return true;
                });

                if (visibleItems.length === 0) return null;

                return (
                  <div key={groupName}>
                    <div style={{ fontSize: "10px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                      {groupName}
                      <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.05)" }} />
                    </div>
                      {visibleItems
                        .sort((a,b) => (configs[a.id]?.item_order || 0) - (configs[b.id]?.item_order || 0)).map(m => {
                        const cfg = configs[m.id] || {};
                        const isGroup = m.module === "Menu Group" || (m.code && m.code.startsWith("group."));
                        
                        return (
                          <div 
                            key={m.id} 
                            style={{ 
                              padding: "6px 10px", 
                              borderRadius: "8px", 
                              background: "rgba(255,255,255,0.03)", 
                              color: "#94a3b8", 
                              fontSize: "11px", 
                              display: "flex", 
                              alignItems: "center", 
                              gap: "8px", 
                              marginLeft: cfg.parent_id ? "16px" : "0"
                            }}
                          >
                            {isGroup ? (
                              <Layers style={{ width: "10px", height: "10px", color: "#818cf8" }} />
                            ) : (
                              <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(99,102,241,0.4)" }} />
                            )}
                            {m.label}
                          </div>
                        );
                      })}
                  </div>
                );
              })}
              {sortedGroups.length === 0 && (
                 <div style={{ padding: "20px", textAlign: "center", color: "#334155", fontSize: "10px", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: "12px" }}>
                   Hierarchy preview will appear here
                 </div>
              )}
            </div>
          </div>
          <div style={{ marginTop: "12px", padding: "0 12px", fontSize: "10px", color: "#475569", fontStyle: "italic", textAlign: "center", lineHeight: "1.4" }}>
            This structure is what the tenant user will experience in their sidebar.
          </div>
        </div>

      </div>
      
      <datalist id="existing-groups">
        {existingGroups.map((gn: string) => <option key={gn} value={gn} />)}
      </datalist>
    </div>
  );
}

function Modal({ children, onClose, title, icon, width = "1200px" }: { children: React.ReactNode; onClose: () => void; title: string; icon: string; width?: string }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", backdropFilter: "blur(10px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "20px" }} onClick={onClose}>
      <div 
        style={{ background: "#0f172a", width: "100%", maxWidth: width, maxHeight: "90vh", borderRadius: "24px", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", overflow: "hidden", display: "flex", flexDirection: "column", animation: "scaleUp 0.2s ease" }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(139,92,246,0.05)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ width: "40px", height: "40px", borderRadius: "12px", background: "rgba(139,92,246,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "20px" }}>{icon}</div>
            <div style={{ fontWeight: 800, color: "#fff", fontSize: "16px", letterSpacing: "0.5px" }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#94a3b8", width: "32px", height: "32px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }} onMouseOver={(e) => e.currentTarget.style.background = "rgba(239,68,68,0.2)"} onMouseOut={(e) => e.currentTarget.style.background = "rgba(255,255,255,0.05)"}>✕</button>
        </div>
        <div style={{ padding: "24px", overflowY: "auto", flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminMenuTemplatesPage() {
  const { showToast } = useToast();
  const { isSuperAdmin, loading: permLoading } = usePermissions();
  const fullLibrarySyncLockRef = useRef(false);
  const { data: menusData, error: menusError, mutate: mutateMenus } = useSWR<Menu[]>("/admin/menus?include_inactive=false", fetcher);
  const { data: templatesData, error: templatesError, mutate: mutateTemplates, isLoading: templatesLoading } =
    useSWR<MenuTemplate[]>("/admin/menu-templates?include_inactive=false", fetcher);
  const { data: tenantsData, mutate: mutateTenants } = useSWR<any[]>("/admin/tenants", fetcher);
  const { data: plansData } = useSWR<any[]>("/admin/plans", fetcher);

  const menus = menusData || [];
  const templates = templatesData || [];

  const visibleTemplates = useMemo(() => {
    if (isSuperAdmin) return templates;
    return templates.filter((t) => !isSuperadminFullLibraryTemplate(t));
  }, [templates, isSuperAdmin]);

  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createActive, setCreateActive] = useState(true);
  const [createMenuIds, setCreateMenuIds] = useState<Record<number, boolean>>({});
  const [createMenuConfigs, setCreateMenuConfigs] = useState<Record<number, Partial<MenuTemplateMenuItem>>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editMenuIds, setEditMenuIds] = useState<Record<number, boolean>>({});
  const [editMenuConfigs, setEditMenuConfigs] = useState<Record<number, Partial<MenuTemplateMenuItem>>>({});
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const usageByTemplate = useMemo(() => {
    const counts: Record<number, number> = {};
    if (!tenantsData) return counts;

    // 1. Create a map of Plan Name -> Template ID (Feature Template)
    const planToTemplateMap: Record<string, number> = {};
    if (plansData) {
      plansData.forEach(p => {
        if (p.name && p.menu_template_id) {
          planToTemplateMap[p.name.toLowerCase()] = p.menu_template_id;
        }
      });
    }

    // 2. Count usages (Direct + Plan-based)
    tenantsData.forEach(t => {
      // Direct assignment
      if (t.menu_template_id) {
        counts[t.menu_template_id] = (counts[t.menu_template_id] || 0) + 1;
      }
      
      // Plan-based assignment (Additive count)
      const planName = (t.plan || "").toLowerCase();
      const planTemplateId = planToTemplateMap[planName];
      if (planTemplateId && planTemplateId !== t.menu_template_id) {
          counts[planTemplateId] = (counts[planTemplateId] || 0) + 1;
      }
    });

    return counts;
  }, [tenantsData, plansData]);

  const syncGapByTemplate = useMemo(() => {
    const gaps: Record<number, number> = {};
    if (!tenantsData || !plansData) return gaps;

    const planToTemplateMap: Record<string, number> = {};
    plansData.forEach(p => {
      if (p.name && p.menu_template_id) {
        planToTemplateMap[p.name.toLowerCase()] = p.menu_template_id;
      }
    });

    tenantsData.forEach(t => {
      const planName = (t.plan || "").toLowerCase();
      const planTemplateId = planToTemplateMap[planName];
      // If they have a plan template but NO direct assignment, or a MISMATCHED direct assignment
      if (planTemplateId && (!t.menu_template_id || t.menu_template_id !== planTemplateId)) {
        gaps[planTemplateId] = (gaps[planTemplateId] || 0) + 1;
      }
    });

    return gaps;
  }, [tenantsData, plansData]);

  const [reconcilingId, setReconcilingId] = useState<number | null>(null);
  
  const handleReconcilePlan = async (templateId: number) => {
    if (!tenantsData || !plansData) return;
    setReconcilingId(templateId);
    showToast({ title: "Syncing", description: "Reconciling plan templates with tenant records...", variant: "info" });
    
    try {
      const planToTemplateMap: Record<string, number> = {};
      plansData.forEach(p => { if (p.name && p.menu_template_id) planToTemplateMap[p.name.toLowerCase()] = p.menu_template_id; });

      const targets = tenantsData.filter(t => {
        const planName = (t.plan || "").toLowerCase();
        return planToTemplateMap[planName] === templateId && t.menu_template_id !== templateId;
      });

      let updated = 0;
      for (const t of targets) {
        await api.put(`/admin/tenants/${t.id}`, { menu_template_id: templateId });
        updated++;
      }

      showToast({ title: "Success", description: `Synchronized ${updated} tenants with this template.`, variant: "success" });
      mutateTenants();
    } catch (e) {
      setActionError("Failed to synchronize some tenants.");
    } finally {
      setReconcilingId(null);
    }
  };
  const [actionError, setActionError] = useState<string | null>(null);
  const [previewingTemplate, setPreviewingTemplate] = useState<MenuTemplate | null>(null);

  const [deployingTemplateId, setDeployingTemplateId] = useState<number | null>(null);
  const [deployTenantIds, setDeployTenantIds] = useState<Record<number, boolean>>({});
  const [pushing, setPushing] = useState(false);
  const [deploySearch, setDeploySearch] = useState("");

  const masterGroupList = useMemo(() => {
    // Current Edit groups
    const fromEdit = Object.values(editMenuConfigs).map(c => c.group_name).filter(Boolean) as string[];
    // Current Create groups
    const fromCreate = Object.values(createMenuConfigs).map(c => c.group_name).filter(Boolean) as string[];
    // All global modules and Custom Group labels
    const fromMenus = menus.map(m => m.module === "Menu Group" ? m.label : m.module).filter(Boolean) as string[];
    
    return Array.from(new Set([...fromEdit, ...fromCreate, ...fromMenus])).sort();
  }, [editMenuConfigs, createMenuConfigs, menus]);

  // --- Logic for Magic Wand & Presets ---
  const applyPreset = (preset: PresetDef, mode: "create" | "edit") => {
    const nextIds: Record<number, boolean> = mode === "create" ? { ...createMenuIds } : { ...editMenuIds };
    const nextConfigs: Record<number, Partial<MenuTemplateMenuItem>> = mode === "create" ? { ...createMenuConfigs } : { ...editMenuConfigs };

    menus.forEach(m => {
      const code = (m.code || "").toLowerCase();
      const match = preset.matchPatterns.some(p => code.includes(p.toLowerCase()));
      if (match) {
        nextIds[m.id] = true;
        const auto = autoGroupMenu(m);
        nextConfigs[m.id] = { ...nextConfigs[m.id], ...auto };
      }
    });

    if (mode === "create") {
      setCreateMenuIds(nextIds);
      setCreateMenuConfigs(nextConfigs);
    } else {
      setEditMenuIds(nextIds);
      setEditMenuConfigs(nextConfigs);
    }
  };

  const autoGroupAll = (mode: "create" | "edit") => {
    const selectedIds = mode === "create" ? createMenuIds : editMenuIds;
    const nextConfigs: Record<number, Partial<MenuTemplateMenuItem>> = mode === "create" ? { ...createMenuConfigs } : { ...editMenuConfigs };

    menus.filter(m => selectedIds[m.id]).forEach(m => {
      const auto = autoGroupMenu(m);
      nextConfigs[m.id] = { ...nextConfigs[m.id], ...auto };
    });

    if (mode === "create") setCreateMenuConfigs(nextConfigs);
    else setEditMenuConfigs(nextConfigs);
  };

  const handleBulkAdd = (ids: number[], groupName: string, mode: "create" | "edit") => {
    const nextIds = mode === "create" ? { ...createMenuIds } : { ...editMenuIds };
    const nextConfigs = mode === "create" ? { ...createMenuConfigs } : { ...editMenuConfigs };

    ids.forEach(id => {
      nextIds[id] = true;
      const originalMenu = menus.find(m => m.id === id);
      const targetGn = groupName || originalMenu?.module || "General";
      
      nextConfigs[id] = { 
        ...nextConfigs[id], 
        group_name: targetGn, 
        item_order: nextConfigs[id]?.item_order ?? 100,
        is_sidebar_visible: nextConfigs[id]?.is_sidebar_visible ?? true
      };
    });

    if (mode === "create") {
      setCreateMenuIds(nextIds);
      setCreateMenuConfigs(nextConfigs);
    } else {
      setEditMenuIds(nextIds);
      setEditMenuConfigs(nextConfigs);
    }
  };
  
  const handleAddContainer = async (name: string, mode: "create" | "edit") => {
    try {
      const code = `group.${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}`;
      const { data: newMenu } = await api.post<Menu>("/admin/menus", {
        code,
        label: name,
        module: "Menu Group",
        is_active: true
      });
      
      // Force mutate menus to include the new one
      await mutateMenus();

      const nextIds = mode === "create" ? { ...createMenuIds } : { ...editMenuIds };
      const nextConfigs = mode === "create" ? { ...createMenuConfigs } : { ...editMenuConfigs };
      
      nextIds[newMenu.id] = true;
      nextConfigs[newMenu.id] = { group_name: "Uncategorized", group_order: 1, item_order: 1, is_sidebar_visible: true };

      if (mode === "create") {
        setCreateMenuIds(nextIds);
        setCreateMenuConfigs(nextConfigs);
      } else {
        setEditMenuIds(nextIds);
        setEditMenuConfigs(nextConfigs);
      }
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || "Failed to create menu group");
    }
  };

  const handleUpdateGlobalMenu = async (id: number, label: string) => {
    try {
      await api.put(`/admin/menus/${id}`, { label });
      await mutateMenus();
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || "Failed to update menu group label");
    }
  };

  const handleDeleteGlobalMenu = async (id: number) => {
    try {
      await api.delete(`/admin/menus/${id}`);
      await mutateMenus();
      
      // Remove from template selections too if present
      const nextCreateIds = { ...createMenuIds };
      if (nextCreateIds[id]) {
        delete nextCreateIds[id];
        setCreateMenuIds(nextCreateIds);
      }
      
      const nextEditIds = { ...editMenuIds };
      if (nextEditIds[id]) {
        delete nextEditIds[id];
        setEditMenuIds(nextEditIds);
      }
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || "Failed to delete menu group");
    }
  };

  const handleDeployToTenants = async () => {
    if (!deployingTemplateId) return;
    const targets = Object.entries(deployTenantIds).filter(([_, v]) => v).map(([id]) => Number(id));
    if (targets.length === 0) return;

    setPushing(true); setActionError(null);
    try {
      // Parallel deployment for maximum speed
      await Promise.all(targets.map(tid => api.put(`/admin/tenants/${tid}`, { menu_template_id: deployingTemplateId })));
      await mutateTenants();
      setDeployingTemplateId(null);
      setDeployTenantIds({});
      // Success toast would go here
    } catch (err: any) {
      setActionError(err?.response?.data?.detail || "Partial or total failure during deployment.");
    } finally { setPushing(false); }
  };

  const filteredMenus = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return menus;
    return menus.filter((m) => (m.label || "").toLowerCase().includes(q) || (m.code || "").toLowerCase().includes(q) || (m.module || "").toLowerCase().includes(q));
  }, [menus, search]);

  const menusByModule = useMemo(() => {
    const g: Record<string, Menu[]> = {};
    filteredMenus.slice().sort((a, b) => {
      const mA = normalizedModule(a).toLowerCase(), mB = normalizedModule(b).toLowerCase();
      if (mA !== mB) return mA.localeCompare(mB);
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    }).forEach((m) => {
      const mod = normalizedModule(m);
      if (!g[mod]) g[mod] = [];
      g[mod].push(m);
    });
    return g;
  }, [filteredMenus]);

  const menusByModuleForEdit = useMemo(() => {
    const g: Record<string, Menu[]> = {};
    const shellCodes = new Set(['DASHBOARD', 'sidebar.nav.companies', 'sidebar.nav.plans', 'sidebar.nav.users']);
    
    filteredMenus
      .filter(m => !editMenuIds[m.id])
      .filter(m => !shellCodes.has(m.code))
      .forEach((m) => {
        const mod = normalizedModule(m);
        if (!g[mod]) g[mod] = [];
        g[mod].push(m);
      });
    return g;
  }, [filteredMenus, editMenuIds]);

  const menusByModuleForCreate = useMemo(() => {
    const g: Record<string, Menu[]> = {};
    const shellCodes = new Set(['DASHBOARD', 'sidebar.nav.companies', 'sidebar.nav.plans', 'sidebar.nav.users']);
    
    filteredMenus
      .filter(m => !createMenuIds[m.id])
      .filter(m => !shellCodes.has(m.code))
      .forEach((m) => {
        const mod = normalizedModule(m);
        if (!g[mod]) g[mod] = [];
        g[mod].push(m);
      });
    return g;
  }, [filteredMenus, createMenuIds]);

  const startEdit = async (id: number) => {
    setEditingId(id); setEditError(null); setActionError(null); setEditLoading(true);
    try {
      const { data: t } = await api.get<MenuTemplate>(`/admin/menu-templates/${id}`);
      setEditName(t.name || ""); setEditDescription(t.description || ""); setEditActive(Boolean(t.is_active));
      const map: Record<number, boolean> = {};
      const configMap: Record<number, Partial<MenuTemplateMenuItem>> = {};
      
      (t.menu_ids || []).forEach((mid) => { map[mid] = true; });
      (t.items || []).forEach((item) => {
          configMap[item.menu_id] = {
              group_name: item.group_name,
              group_order: item.group_order,
              item_order: item.item_order,
              parent_id: item.parent_id,
              is_sidebar_visible: item.is_sidebar_visible
          };
      });
      
      setEditMenuIds(map);
      setEditMenuConfigs(configMap);
    } catch (err: any) { setEditError(err?.response?.data?.detail || "Failed to load template"); }
    finally { setEditLoading(false); }
  };

  const handleDuplicate = async (id: number) => {
    setActionError(null);
    try {
      const { data: t } = await api.get<MenuTemplate>(`/admin/menu-templates/${id}`);
      setCreateName(`${t.name} (Copy)`);
      setCreateDescription(t.description || "");
      setCreateActive(Boolean(t.is_active));
      
      const map: Record<number, boolean> = {};
      const configMap: Record<number, Partial<MenuTemplateMenuItem>> = {};
      
      (t.menu_ids || []).forEach((mid) => { map[mid] = true; });
      (t.items || []).forEach((item) => {
          configMap[item.menu_id] = {
              group_name: item.group_name,
              group_order: item.group_order,
              item_order: item.item_order,
              parent_id: item.parent_id,
              is_sidebar_visible: item.is_sidebar_visible
          };
      });
      
      setCreateMenuIds(map);
      setCreateMenuConfigs(configMap);
      setShowCreate(true);
      showToast({ title: "Template Loaded", description: "Template data pre-filled. You can now tweak and save.", variant: "success" });
    } catch (err: any) { 
      setActionError(err?.response?.data?.detail || "Failed to load template for duplication");
    }
  };

  const cancelEdit = () => { setEditingId(null); setEditError(null); setActionError(null); };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    if (!createName.trim()) return;
    setCreating(true); setCreateError(null); setActionError(null);
    try {
      const menu_ids = Object.entries(createMenuIds).filter(([, v]) => v).map(([k]) => Number(k));
      const items = menu_ids.map(mid => ({
        menu_id: mid,
        parent_id: createMenuConfigs[mid]?.parent_id ?? null,
        ...createMenuConfigs[mid]
      }));
      await api.post("/admin/menu-templates", { 
        name: createName.trim(), 
        description: createDescription.trim() || null, 
        is_active: createActive, 
        menu_ids,
        items
      });
      setCreateName(""); setCreateDescription(""); setCreateActive(true); setCreateMenuIds({}); setCreateMenuConfigs({});
      await mutateTemplates();
      setSaveSuccess("Template created successfully!");
      setTimeout(() => setSaveSuccess(null), 3000);
      // Removed setShowCreate(false); as per user request to keep it open
    } catch (err: any) { setCreateError(err?.response?.data?.detail || "Failed to create template"); }
    finally { setCreating(false); }
  };

  const handleSaveEdit = async () => {
    if (editingId == null) return;
    setEditLoading(true); setEditError(null); setActionError(null);
    try {
      const menu_ids = Object.entries(editMenuIds).filter(([, v]) => v).map(([k]) => Number(k));
      const items = menu_ids.map(mid => ({
        menu_id: mid,
        parent_id: editMenuConfigs[mid]?.parent_id ?? null,
        ...editMenuConfigs[mid]
      }));
      const orig = templates.find((x) => x.id === editingId);
      let descriptionOut: string | null = editDescription.trim() || null;
      if (orig && isSuperadminFullLibraryTemplate(orig)) {
        const base = descriptionOut || "Full menu library (all active menus). Auto-maintained.";
        descriptionOut = base.includes(SUPERADMIN_FULL_LIBRARY_DESC_MARKER)
          ? base
          : `${base} ${SUPERADMIN_FULL_LIBRARY_DESC_MARKER}`.trim();
      }
      await api.put(`/admin/menu-templates/${editingId}`, { 
        name: editName.trim() || undefined, 
        description: descriptionOut, 
        is_active: editActive, 
        menu_ids,
        items
      });
      await mutateTemplates();
      setSaveSuccess("Template updated successfully!");
      setTimeout(() => setSaveSuccess(null), 3000);
      // Removed setEditingId(null); as per user request to keep it open
    } catch (err: any) { setEditError(err?.response?.data?.detail || "Failed to update template"); }
    finally { setEditLoading(false); }
  };

  const handleDelete = async (id: number) => {
    const row = templates.find((x) => x.id === id);
    if (row && isSuperadminFullLibraryTemplate(row)) {
      setActionError("The default full-library template cannot be deleted. You can edit it or assign other templates to tenants.");
      return;
    }
    if (!confirm("Are you sure you want to deactivate (delete) this template? This will only work if the template is not currently assigned to any Tenants or Subscription Plans.")) return;
    setActionError(null);
    try { await api.delete(`/admin/menu-templates/${id}`); await mutateTemplates(); if (editingId === id) setEditingId(null); }
    catch (err: any) { setActionError(err?.response?.data?.detail || "Failed to delete template"); }
  };

  useEffect(() => {
    if (permLoading || !isSuperAdmin || menus.length === 0 || templatesLoading || templatesData === undefined) return;

    const existing = templatesData.find(isSuperadminFullLibraryTemplate);
    const menu_ids = menus.map((m) => m.id);
    const items = buildFullLibraryTemplateItems(menus);
    let cancelled = false;

    const sync = async () => {
      if (!existing) {
        if (fullLibrarySyncLockRef.current) return;
        fullLibrarySyncLockRef.current = true;
        try {
          await api.post("/admin/menu-templates", {
            name: SUPERADMIN_FULL_LIBRARY_TEMPLATE_NAME,
            description: `Full menu library (all active menus). Auto-maintained. ${SUPERADMIN_FULL_LIBRARY_DESC_MARKER}`,
            is_active: true,
            menu_ids,
            items,
          });
          if (!cancelled) await mutateTemplates();
        } catch (e: unknown) {
          console.error(e);
          const msg =
            (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
            "Failed to create default full-library template.";
          setActionError(msg);
        } finally {
          fullLibrarySyncLockRef.current = false;
        }
        return;
      }

      const cur = new Set(existing.menu_ids || []);
      const needUpdate =
        menu_ids.length !== cur.size || menu_ids.some((id) => !cur.has(id));
      if (!needUpdate) return;

      if (fullLibrarySyncLockRef.current) return;
      fullLibrarySyncLockRef.current = true;
      try {
        const desc = (existing.description || "").includes(SUPERADMIN_FULL_LIBRARY_DESC_MARKER)
          ? existing.description
          : `${existing.description || ""} ${SUPERADMIN_FULL_LIBRARY_DESC_MARKER}`.trim();
        await api.put(`/admin/menu-templates/${existing.id}`, {
          menu_ids,
          items,
          description: desc,
        });
        if (!cancelled) await mutateTemplates();
      } catch (e: unknown) {
        console.error(e);
        const msg =
          (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
          "Failed to sync default full-library template.";
        setActionError(msg);
      } finally {
        fullLibrarySyncLockRef.current = false;
      }
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [permLoading, isSuperAdmin, menus, templatesLoading, templatesData, mutateTemplates]);

  useEffect(() => {
    if (editingId == null || !templatesData) return;
    if (!templatesData.some((t) => t.id === editingId)) setEditingId(null);
  }, [editingId, templatesData]);

  const selectedForCreate = useMemo(() => menus.filter(m => createMenuIds[m.id]), [menus, createMenuIds]);
  const selectedForEdit = useMemo(() => menus.filter(m => editMenuIds[m.id]), [menus, editMenuIds]);

  const errorDetail = (templatesError as any)?.response?.data?.detail || (menusError as any)?.response?.data?.detail;
  const errorStatus = (templatesError as any)?.response?.status || (menusError as any)?.response?.status;
  const totalMenuCount = menus.length;
  const activeCount = visibleTemplates.filter((t) => t.is_active).length;

  return (
    <div style={G.pageWrap}>
      <style>{ANIM_CSS}{`
        .mt-row { transition: all 0.18s ease; }
        .mt-row:hover { background: rgba(99,102,241,0.06) !important; }
        .mt-edit-btn { transition: all 0.18s ease; }
        .mt-edit-btn:hover { background: rgba(99,102,241,0.15) !important; border-color: rgba(99,102,241,0.4) !important; color: #a5b4fc !important; }
        .mt-del-btn { transition: all 0.18s ease; }
        .mt-del-btn:hover { background: rgba(239,68,68,0.2) !important; border-color: rgba(239,68,68,0.4) !important; }
        .mt-ghost-btn { transition: all 0.2s ease; }
        .mt-ghost-btn:hover { background: rgba(255,255,255,0.1) !important; color: #e2e8f0 !important; }
      `}</style>
      <GhostBg />
      <div style={G.inner}>

        {/* Header */}
        <div style={{ marginBottom: "28px", animation: "fadeIn 0.4s ease" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "16px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
              <div style={{ width: "48px", height: "48px", borderRadius: "14px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "22px", boxShadow: "0 8px 24px rgba(99,102,241,0.3)" }}>🧩</div>
              <div>
                <h1 style={{ margin: 0, fontSize: "24px", fontWeight: 800, background: "linear-gradient(135deg, #c7d2fe, #818cf8)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text", letterSpacing: "-0.5px" }}>Menu Templates (UPDATED)</h1>
                <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#64748b" }}>Configure permission templates &middot; Control module access per tenant</p>
              </div>
            </div>
            <div style={{ display: "flex", gap: "10px" }}>
              <button 
                onClick={() => setShowCreate(true)} 
                style={{ padding: "10px 20px", borderRadius: "12px", background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(99,102,241,0.35)", transition: "all 0.2s" }}
              >
                + New Template
              </button>
              <Link href="/admin" className="mt-ghost-btn" style={{ padding: "10px 16px", borderRadius: "12px", border: "1px solid rgba(99,102,241,0.15)", background: "rgba(99,102,241,0.06)", color: "#a5b4fc", fontSize: "13px", fontWeight: 600, textDecoration: "none", display: "inline-flex", alignItems: "center", gap: "6px" }}>← Back</Link>
            </div>
          </div>
          {/* Stats pills */}
          <div style={{ display: "flex", gap: "12px", marginTop: "18px", flexWrap: "wrap" }}>
            {[
              { label: "Templates", value: visibleTemplates.length, color: "#818cf8", bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.18)" },
              { label: "Active", value: activeCount, color: "#34d399", bg: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.18)" },
              { label: "Menus", value: totalMenuCount, color: "#38bdf8", bg: "rgba(56,189,248,0.08)", border: "rgba(56,189,248,0.18)" },
            ].map((s) => (
              <div key={s.label} style={{ padding: "8px 16px", background: s.bg, border: `1px solid ${s.border}`, borderRadius: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ fontSize: "18px", fontWeight: 800, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600 }}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {errorStatus === 403 && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", padding: "14px 18px", color: "#fca5a5", fontSize: "13px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}><span style={{ fontSize: "16px" }}>🔐</span> Superadmin privileges required.</div>}
        {actionError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "12px", padding: "14px 18px", color: "#fca5a5", fontSize: "13px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "10px" }}><span style={{ fontSize: "16px" }}>⚠️</span> {actionError}</div>}

        {/* Edit Modal */}
        {editingId != null && (
          <Modal 
            onClose={cancelEdit} 
            title="Edit Template" 
            icon="✏️" 
            width="1250px"
          >
            {editError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "12px 16px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>⚠️</span> {editError}</div>}
            {saveSuccess && <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#6ee7b7", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>✅</span> {saveSuccess}</div>}
            {editLoading ? <GhostSpinner /> : (
              <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                  <div><label style={lbl}>Name</label><input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ ...G.inputStyle, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)" }} /></div>
                  <div><label style={lbl}>Description</label><input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} style={{ ...G.inputStyle, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)" }} /></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(99,102,241,0.04)", borderRadius: "10px", border: "1px solid rgba(99,102,241,0.08)" }}>
                  <span style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: 500 }}>Template is active</span>
                  <label style={{ position: "relative", width: "44px", height: "24px", cursor: "pointer" }}>
                    <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                    <span style={{ position: "absolute", inset: 0, borderRadius: "12px", background: editActive ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(100,116,139,0.3)", transition: "all 0.2s", boxShadow: editActive ? "0 0 12px rgba(99,102,241,0.3)" : "none" }} />
                    <span style={{ position: "absolute", top: "3px", left: editActive ? "23px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "all 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                  </label>
                </div>
                {/* Menu search for Edit Mode */}
                <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                  <div style={{ position: "relative", flex: 1, maxWidth: "360px" }}>
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menus by label, code, or module..." style={{ ...G.inputStyle, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)", paddingLeft: "36px" }} />
                    <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", pointerEvents: "none", opacity: 0.5 }}>🔍</span>
                  </div>
                  {search && <button type="button" onClick={() => setSearch("")} className="mt-ghost-btn" style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "12px", cursor: "pointer" }}>Clear</button>}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "16px", alignItems: "start" }}>
                  <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.05)", maxHeight: "600px", overflowY: "auto" }}>
                    <label style={lbl}>1. Select Menus from Modules</label>
                    <MenuPicker 
                      menusByModule={menusByModuleForEdit} 
                      selectedIds={editMenuIds} 
                      onToggle={(id) => setEditMenuIds((p) => ({ ...p, [id]: !p[id] }))} 
                      onSelect={(m, v) => setEditMenuIds((p) => { const n = { ...p }; (menusByModuleForEdit[m] || []).forEach((mi) => { n[mi.id] = v; }); return n; })} 
                      existingGroups={masterGroupList}
                      onBulkAdd={(ids, gn) => handleBulkAdd(ids, gn, "edit")}
                    />
                  </div>
                  
                  <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.05)", maxHeight: "600px", overflowY: "auto" }}>
                    <label style={lbl}>2. Configure Groups & Order</label>
                    <MenuConfigEditor 
                      menus={menus}
                      selectedIds={editMenuIds}
                      configs={editMenuConfigs} 
                      onChange={(id, f, v) => setEditMenuConfigs(p => ({ ...p, [id]: { ...p[id], [f]: v } }))}
                      onToggle={(id) => setEditMenuIds((p) => ({ ...p, [id]: !p[id] }))}
                      onBulkSetGroup={(gn) => {
                        const next = { ...editMenuConfigs };
                        menus.filter(m => editMenuIds[m.id]).forEach(m => { next[m.id] = { ...next[m.id], group_name: gn }; });
                        setEditMenuConfigs(next);
                      }}
                      onApplyPreset={(p) => applyPreset(p, "edit")}
                      onAutoGroupAll={() => autoGroupAll("edit")}
                      onAddContainer={(name) => handleAddContainer(name, "edit")}
                      onUpdateGlobalMenu={handleUpdateGlobalMenu}
                      onDeleteGlobalMenu={handleDeleteGlobalMenu}
                      onClearAll={() => { setEditMenuIds({}); setEditMenuConfigs({}); }}
                      existingGroups={masterGroupList}
                    />
                  </div>
                </div>
                <div style={{ display: "flex", gap: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                  <button type="button" onClick={handleSaveEdit} disabled={editLoading} style={{ padding: "10px 24px", borderRadius: "12px", background: "linear-gradient(135deg, #0891b2, #06b6d4)", color: "#fff", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(8,145,178,0.3)", opacity: editLoading ? 0.7 : 1, transition: "all 0.2s" }}>
                    {editLoading ? "Saving…" : "💾 Save Changes"}
                  </button>
                  <button type="button" onClick={cancelEdit} className="mt-ghost-btn" style={{ padding: "10px 20px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
                </div>
              </div>
            )}
          </Modal>
        )}

        {/* Templates list */}
        <div style={{ background: "rgba(15,23,42,0.5)", backdropFilter: "blur(16px)", border: "1px solid rgba(99,102,241,0.12)", borderRadius: "18px", overflow: "hidden", marginBottom: "24px", boxShadow: "0 4px 24px rgba(0,0,0,0.15)" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid rgba(99,102,241,0.1)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(99,102,241,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ fontSize: "15px" }}>📋</span>
              <span style={{ color: "#a5b4fc", fontSize: "13px", fontWeight: 700, letterSpacing: "0.3px" }}>All Templates</span>
            </div>
            {templatesLoading && <span style={{ color: "#64748b", fontSize: "12px", animation: "pulse 1.5s infinite" }}>Loading…</span>}
          </div>
          {templatesLoading ? <GhostSpinner /> : visibleTemplates.length === 0 ? <GhostEmpty message="No templates yet." /> : (
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                 <tr style={{ background: "rgba(99,102,241,0.04)" }}>
                  {["ID", "Name", "Menus", "Used By", "Status", "Created", "Actions"].map((h) => (
                    <th key={h} style={{ padding: "12px 18px", textAlign: "left", color: "#64748b", fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", borderBottom: "1px solid rgba(99,102,241,0.08)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleTemplates.map((t, i) => {
                  const descLine = templateDescriptionForTable(t.description);
                  const isFullLib = isSuperadminFullLibraryTemplate(t);
                  return (
                  <tr key={t.id} className="mt-row" style={{ borderBottom: i < visibleTemplates.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none", animation: `fadeIn 0.3s ease ${i * 0.04}s both` }}>
                    <td style={{ padding: "14px 18px" }}><span style={{ fontFamily: "monospace", fontSize: "12px", color: "#475569", background: "rgba(99,102,241,0.06)", padding: "2px 8px", borderRadius: "6px" }}>#{t.id}</span></td>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "#e2e8f0", fontSize: "14px", letterSpacing: "-0.2px" }}>{t.name}</span>
                        {isFullLib && (
                          <span style={{ fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", padding: "2px 8px", borderRadius: "6px", background: "rgba(251,191,36,0.12)", border: "1px solid rgba(251,191,36,0.35)", color: "#fcd34d" }}>
                            Superadmin default
                          </span>
                        )}
                      </div>
                      {descLine ? (
                        <div style={{ fontSize: "11px", color: "#64748b", marginTop: "3px", lineHeight: 1.4 }}>{descLine}</div>
                      ) : null}
                    </td>
                     <td style={{ padding: "14px 18px" }}>
                      <span style={{ padding: "4px 12px", background: "rgba(99,102,241,0.12)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "20px", fontSize: "12px", fontWeight: 700, color: "#a5b4fc" }}>
                        {(t.menu_ids || []).length} menus
                      </span>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                       <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Users style={{ width: "14px", height: "14px", color: usageByTemplate[t.id] ? "#818cf8" : "#475569" }} />
                          <span style={{ fontSize: "13px", fontWeight: 700, color: usageByTemplate[t.id] ? "#e2e8f0" : "#475569" }}>
                            {usageByTemplate[t.id] || 0} tenants
                          </span>
                       </div>
                    </td>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "4px 12px", borderRadius: "20px", fontSize: "11px", fontWeight: 700, background: t.is_active ? "rgba(52,211,153,0.1)" : "rgba(100,116,139,0.08)", color: t.is_active ? "#6ee7b7" : "#94a3b8", border: `1px solid ${t.is_active ? "rgba(52,211,153,0.25)" : "rgba(100,116,139,0.2)"}` }}>
                        <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: t.is_active ? "#34d399" : "#64748b", boxShadow: t.is_active ? "0 0 6px rgba(52,211,153,0.4)" : "none" }} />
                        {t.is_active ? "Active" : "Inactive"}
                      </div>
                    </td>
                    <td style={{ padding: "14px 18px", fontSize: "12px", color: "#64748b" }}>{new Date(t.created_at).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" })}</td>
                    <td style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button 
                          onClick={() => { setDeployingTemplateId(t.id); setDeployTenantIds({}); }} 
                          style={{ padding: "6px 14px", background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", borderRadius: "8px", color: "#6ee7b7", fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.18s" }}
                        >
                          🚀 Blast
                        </button>
                        <button onClick={() => handleDuplicate(t.id)} style={{ padding: "6px 14px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "8px", color: "#a5b4fc", fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.18s", display: "flex", alignItems: "center", gap: "6px" }} title="Duplicate Template">
                          <Copy size={13} /> Duplicate
                        </button>
                        <button onClick={() => startEdit(t.id)} className="mt-edit-btn" style={{ padding: "6px 14px", background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.2)", borderRadius: "8px", color: "#818cf8", fontSize: "12px", fontWeight: 600, cursor: "pointer", transition: "all 0.18s" }}>Edit</button>
                        <button
                          type="button"
                          onClick={() => handleDelete(t.id)}
                          disabled={isFullLib}
                          title={isFullLib ? "System default — cannot delete" : undefined}
                          className="mt-del-btn"
                          style={{
                            padding: "6px 14px",
                            background: isFullLib ? "rgba(100,116,139,0.08)" : "rgba(239,68,68,0.06)",
                            border: `1px solid ${isFullLib ? "rgba(100,116,139,0.2)" : "rgba(239,68,68,0.2)"}`,
                            borderRadius: "8px",
                            color: isFullLib ? "#64748b" : "#fca5a5",
                            fontSize: "12px",
                            fontWeight: 600,
                            cursor: isFullLib ? "not-allowed" : "pointer",
                            transition: "all 0.18s",
                            opacity: isFullLib ? 0.65 : 1,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Create Modal */}
        {showCreate && (
          <Modal 
            onClose={() => setShowCreate(false)} 
            title="Create New Template" 
            icon="✨" 
            width="1250px"
          >
            {createError && <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "10px", padding: "12px 16px", color: "#fca5a5", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>⚠️</span> {createError}</div>}
            {saveSuccess && <div style={{ background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.3)", borderRadius: "10px", padding: "12px 16px", color: "#6ee7b7", fontSize: "13px", marginBottom: "16px", display: "flex", alignItems: "center", gap: "8px" }}><span>✅</span> {saveSuccess}</div>}
            <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div><label style={lbl}>Name *</label><input value={createName} onChange={(e) => setCreateName(e.target.value)} required placeholder="e.g. Standard Access" style={{ ...G.inputStyle, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)" }} /></div>
                <div><label style={lbl}>Description</label><input value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} placeholder="Optional description" style={{ ...G.inputStyle, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)" }} /></div>
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", background: "rgba(99,102,241,0.04)", borderRadius: "10px", border: "1px solid rgba(99,102,241,0.08)" }}>
                <span style={{ color: "#cbd5e1", fontSize: "13px", fontWeight: 500 }}>Template is active</span>
                <label style={{ position: "relative", width: "44px", height: "24px", cursor: "pointer" }}>
                  <input type="checkbox" checked={createActive} onChange={(e) => setCreateActive(e.target.checked)} style={{ opacity: 0, width: 0, height: 0 }} />
                  <span style={{ position: "absolute", inset: 0, borderRadius: "12px", background: createActive ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(100,116,139,0.3)", transition: "all 0.2s", boxShadow: createActive ? "0 0 12px rgba(99,102,241,0.3)" : "none" }} />
                  <span style={{ position: "absolute", top: "3px", left: createActive ? "23px" : "3px", width: "18px", height: "18px", borderRadius: "50%", background: "#fff", transition: "all 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                </label>
              </div>
              {/* Menu search */}
              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                <div style={{ position: "relative", flex: 1, maxWidth: "360px" }}>
                  <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search menus by label, code, or module..." style={{ ...G.inputStyle, background: "rgba(15,23,42,0.6)", border: "1px solid rgba(99,102,241,0.15)", paddingLeft: "36px" }} />
                  <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", fontSize: "14px", pointerEvents: "none", opacity: 0.5 }}>🔍</span>
                </div>
                {search && <button type="button" onClick={() => setSearch("")} className="mt-ghost-btn" style={{ padding: "8px 14px", borderRadius: "8px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "12px", cursor: "pointer" }}>Clear</button>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: "24px", alignItems: "start" }}>
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.05)", maxHeight: "600px", overflowY: "auto" }}>
                  <label style={lbl}>1. Select Menus from Modules</label>
                  <MenuPicker 
                    menusByModule={menusByModuleForCreate} 
                    selectedIds={createMenuIds} 
                    onToggle={(id) => setCreateMenuIds((p) => ({ ...p, [id]: !p[id] }))} 
                    onSelect={(m, v) => setCreateMenuIds((p) => { const n = { ...p }; (menusByModuleForCreate[m] || []).forEach((mi) => { n[mi.id] = v; }); return n; })} 
                    existingGroups={masterGroupList}
                    onBulkAdd={(ids, gn) => handleBulkAdd(ids, gn, "create")}
                  />
                </div>
                
                <div style={{ background: "rgba(0,0,0,0.2)", borderRadius: "16px", padding: "16px", border: "1px solid rgba(255,255,255,0.05)", maxHeight: "600px", overflowY: "auto" }}>
                  <label style={lbl}>2. Configure Groups & Order</label>
                  <MenuConfigEditor 
                    menus={menus}
                    selectedIds={createMenuIds}
                    configs={createMenuConfigs} 
                    onChange={(id, f, v) => setCreateMenuConfigs(p => ({ ...p, [id]: { ...p[id], [f]: v } }))}
                    onToggle={(id) => setCreateMenuIds((p) => ({ ...p, [id]: !p[id] }))}
                    onBulkSetGroup={(gn) => {
                      const next = { ...createMenuConfigs };
                      menus.filter(m => createMenuIds[m.id]).forEach(m => { next[m.id] = { ...next[m.id], group_name: gn }; });
                      setCreateMenuConfigs(next);
                    }}
                    onApplyPreset={(p) => applyPreset(p, "create")}
                    onAutoGroupAll={() => autoGroupAll("create")}
                    onAddContainer={(name) => handleAddContainer(name, "create")}
                    onUpdateGlobalMenu={handleUpdateGlobalMenu}
                    onDeleteGlobalMenu={handleDeleteGlobalMenu}
                    onClearAll={() => { setCreateMenuIds({}); setCreateMenuConfigs({}); }}
                    existingGroups={masterGroupList}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: "12px", paddingTop: "12px", borderTop: "1px solid rgba(255,255,255,0.05)" }}>
                <button type="submit" disabled={creating} style={{ padding: "10px 24px", borderRadius: "12px", background: "linear-gradient(135deg, #7c3aed, #6366f1)", color: "#fff", fontSize: "13px", fontWeight: 700, border: "none", cursor: "pointer", boxShadow: "0 4px 16px rgba(124,58,237,0.3)", opacity: creating ? 0.7 : 1, transition: "all 0.2s" }}>
                  {creating ? "Creating…" : "✨ Create Template"}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="mt-ghost-btn" style={{ padding: "10px 20px", borderRadius: "12px", border: "1px solid rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              </div>
            </form>
          </Modal>
        )}

        {/* Footer */}
        <div style={{ marginTop: "32px", paddingTop: "20px", borderTop: "1px solid rgba(99,102,241,0.08)", textAlign: "center" }}>
          <span style={{ fontSize: "12px", color: "#334155" }}>🧩 Menu Templates &middot; Superadmin Configuration</span>
        </div>
      </div>

      {/* Quick Preview Modal */}
      {previewingTemplate && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.8)", backdropFilter: "blur(8px)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "40px" }} onClick={() => setPreviewingTemplate(null)}>
          <div style={{ background: "#0f172a", width: "100%", maxWidth: "400px", borderRadius: "24px", border: "1px solid rgba(139,92,246,0.3)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)", overflow: "hidden", animation: "fadeIn 0.2s ease" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: "20px 24px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "rgba(139,92,246,0.05)" }}>
              <div>
                <div style={{ fontWeight: 800, color: "#fff", fontSize: "15px", letterSpacing: "0.5px" }}>{previewingTemplate.name}</div>
                <div style={{ fontSize: "11px", color: "#64748b", marginTop: "2px" }}>Sidebar Layout Preview</div>
              </div>
              <button onClick={() => setPreviewingTemplate(null)} style={{ background: "rgba(255,255,255,0.05)", border: "none", color: "#94a3b8", width: "32px", height: "32px", borderRadius: "10px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
            </div>
            <div style={{ padding: "24px", maxHeight: "70vh", overflowY: "auto" }}>
              {(() => {
                const items = previewingTemplate.items || [];
                const groups: Record<string, { order: number; items: any[] }> = {};
                
                // Group items
                items.forEach(it => {
                  const gn = it.group_name || "Uncategorized";
                  if (!groups[gn]) groups[gn] = { order: it.group_order || 100, items: [] };
                  groups[gn].items.push(it);
                });

                const sortedGroups = Object.entries(groups).sort((a,b) => a[1].order - b[1].order);

                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
                    {sortedGroups.map(([name, data]) => (
                      <div key={name}>
                        <div style={{ fontSize: "10px", fontWeight: 800, color: "#475569", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                          {name}
                          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.05)" }} />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                          {data.items.sort((a,b) => (a.item_order || 0) - (b.item_order || 0)).map(m => {
                            const isGroup = m.code && m.code.startsWith("group.");
                            return (
                              <div key={m.menu_id} style={{ padding: "8px 12px", borderRadius: "10px", background: "rgba(255,255,255,0.03)", color: "#cbd5e1", fontSize: "12px", display: "flex", alignItems: "center", gap: "10px", marginLeft: m.parent_id ? "20px" : "0" }}>
                                {isGroup ? (
                                  <Layers style={{ width: "12px", height: "12px", color: "#818cf8" }} />
                                ) : (
                                  <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: "rgba(139,92,246,0.6)" }} />
                                )}
                                {m.label || m.code}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    {sortedGroups.length === 0 && (
                      <div style={{ padding: "40px 20px", textAlign: "center", color: "#475569", fontSize: "13px", border: "1px dashed rgba(255,255,255,0.05)", borderRadius: "16px" }}>
                        No menu items configured for this template.
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
            <div style={{ padding: "16px 24px", background: "rgba(0,0,0,0.2)", borderTop: "1px solid rgba(255,255,255,0.05)", textAlign: "center" }}>
               <button onClick={() => { startEdit(previewingTemplate.id); setPreviewingTemplate(null); }} style={{ width: "100%", padding: "10px", background: "linear-gradient(135deg, #7c3aed, #6366f1)", color: "#fff", border: "none", borderRadius: "12px", fontWeight: 700, fontSize: "13px", cursor: "pointer", boxShadow: "0 4px 12px rgba(124,58,237,0.3)" }}>Edit Structure</button>
            </div>
          </div>
        </div>
      )}
      {/* Deployment Modal */}
      {deployingTemplateId && (
        <Modal title="Deploy Template to Tenants" icon="🚀" onClose={() => setDeployingTemplateId(null)}>
           <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
              <div style={{ padding: "16px", background: "rgba(99,102,241,0.1)", borderRadius: "16px", border: "1px solid rgba(99,102,241,0.2)" }}>
                 <div style={{ fontSize: "14px", fontWeight: 800, color: "#fff", marginBottom: "4px" }}>Target Template: {templates.find(x => x.id === deployingTemplateId)?.name}</div>
                 <div style={{ fontSize: "12px", color: "#94a3b8" }}>Select the tenants you want to &quot;blast&quot; this sidebar configuration to. Their navigation will update instantly.</div>
              </div>

              <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                 <div style={{ position: "relative", flex: 1 }}>
                    <Search style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", width: "16px", height: "16px", color: "#475569" }} />
                    <input 
                       placeholder="Filter tenants (e.g. Acme, Premium...)"
                       value={deploySearch}
                       onChange={(e) => setDeploySearch(e.target.value)}
                       style={{ ...G.inputStyle, width: "100%", paddingLeft: "40px", height: "40px", background: "rgba(0,0,0,0.3)" }}
                    />
                 </div>
                 <button 
                  onClick={() => {
                    const filtered = (tenantsData || []).filter(t => (t.name || "").toLowerCase().includes(deploySearch.toLowerCase()) || (t.plan || "").toLowerCase().includes(deploySearch.toLowerCase()));
                    const next = { ...deployTenantIds };
                    filtered.forEach(t => next[t.id] = true);
                    setDeployTenantIds(next);
                  }}
                  style={{ height: "40px", padding: "0 16px", borderRadius: "10px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", color: "#94a3b8", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
                 >
                   Select All Visible
                 </button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "10px", maxHeight: "400px", overflowY: "auto", padding: "4px" }}>
                 {(tenantsData || []).filter(t => !deploySearch || (t.name || "").toLowerCase().includes(deploySearch.toLowerCase()) || (t.plan || "").toLowerCase().includes(deploySearch.toLowerCase())).map(t => {
                    const isSel = deployTenantIds[t.id];
                    const isUsed = t.menu_template_id === deployingTemplateId;
                    return (
                       <div 
                        key={t.id} 
                        onClick={() => setDeployTenantIds(prev => ({ ...prev, [t.id]: !prev[t.id] }))}
                        style={{ padding: "12px 16px", borderRadius: "12px", background: isSel ? "rgba(99,102,241,0.15)" : isUsed ? "rgba(16,185,129,0.05)" : "rgba(255,255,255,0.02)", border: isSel ? "1px solid #6366f1" : isUsed ? "1px solid rgba(16,185,129,0.3)" : "1px solid rgba(255,255,255,0.05)", cursor: "pointer", transition: "all 0.2s", display: "flex", alignItems: "center", gap: "12px" }}
                       >
                          <div style={{ width: "18px", height: "18px", borderRadius: "4px", border: "1px solid rgba(255,255,255,0.2)", background: isSel ? "#6366f1" : "rgba(0,0,0,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#fff" }}>{isSel && "✓"}</div>
                          <div style={{ flex: 1 }}>
                             <div style={{ fontSize: "14px", fontWeight: 700, color: isSel ? "#fff" : "#e2e8f0" }}>{t.name}</div>
                             <div style={{ fontSize: "10px", color: "#64748b" }}>Plan: {t.plan || "standard"} • ID: {t.id}</div>
                          </div>
                          {isUsed && <div style={{ fontSize: "9px", color: "#10b981", fontWeight: 800 }}>SYNCED</div>}
                       </div>
                    );
                 })}
              </div>

              <div style={{ display: "flex", gap: "12px", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "20px" }}>
                 <button onClick={() => setDeployingTemplateId(null)} style={{ flex: 1, height: "46px", borderRadius: "12px", background: "rgba(255,255,255,0.05)", border: "none", color: "#94a3b8", fontWeight: 700, cursor: "pointer" }}>Cancel</button>
                 <button 
                  onClick={handleDeployToTenants}
                  disabled={pushing || Object.values(deployTenantIds).filter(Boolean).length === 0}
                  style={{ flex: 2, height: "46px", borderRadius: "12px", background: "linear-gradient(135deg, #10b981, #059669)", border: "none", color: "#fff", fontWeight: 800, cursor: "pointer", opacity: pushing ? 0.7 : 1, boxShadow: "0 4px 15px rgba(16,185,129,0.3)" }}
                 >
                   {pushing ? "🚀 BLASTING..." : `🚀 BLAST TO ${Object.values(deployTenantIds).filter(Boolean).length} TENANTS`}
                 </button>
              </div>
           </div>
        </Modal>
      )}

      {actionError && (
        <div style={{ position: "fixed", bottom: "24px", right: "24px", background: "rgba(239,68,68,0.9)", backdropFilter: "blur(4px)", padding: "16px 24px", borderRadius: "16px", color: "#fff", fontWeight: 700, boxShadow: "0 10px 30px rgba(0,0,0,0.5)", zIndex: 10000 }}>
           ⚠️ {actionError}
           <button onClick={() => setActionError(null)} style={{ marginLeft: "12px", background: "rgba(255,255,255,0.2)", border: "none", color: "#fff", borderRadius: "4px", padding: "2px 6px", cursor: "pointer" }}>OK</button>
        </div>
      )}
    </div>
  );
}
