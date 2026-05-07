"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useMemo, useEffect } from "react";
import { menuHrefFromCode } from "@/lib/menuRouting";
import { useMenuPermissions } from "@/components/MenuPermissionsContext";
import { usePermissions } from "@/components/PermissionsContext";

interface MenuItem {
  id: number;
  label: string;
  code: string;
  module?: string | null;
  is_sidebar_visible?: boolean;
  sort_order?: number | null;
  group_order?: number | null;
  children?: MenuItem[];
}

interface ModuleGroup {
  module: string;
  items: MenuItem[];
}

interface DynamicCompanyMenuProps {
  companyId: number;
  rawGroups: ModuleGroup[];
  onItemClick?: () => void;
}

const groupMeta: Record<string, { icon: string; color: string; bg: string; border: string; text: string }> = {
  'Sales': { icon: '💰', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Purchases': { icon: '🛒', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Accounting': { icon: '⚖️', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'POS': { icon: '🖥️', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Dashboard Analytics': { icon: '✨', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Reports': { icon: '📈', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Inventory': { icon: '📦', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Manufacturing': { icon: '🏭', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Payroll': { icon: '👥', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Settings': { icon: '⚙️', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Master': { icon: '💎', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Voucher': { icon: '📄', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Resources': { icon: '📚', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
  'Tasks': { icon: '✅', color: 'text-emerald-500', bg: 'bg-emerald-500/5', border: 'border-emerald-500/10', text: 'text-emerald-400' },
};

export function DynamicCompanyMenu({ companyId, rawGroups, onItemClick }: DynamicCompanyMenuProps) {
  const pathname = usePathname();
  const { isMenuAllowed } = useMenuPermissions();
  const { isSuperAdmin, isSystemAdmin, ghostCompanyId } = usePermissions();
  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  
  // Style config based on user role
  const config = {
    itemAlign: isSuperAdmin ? "items-center" : "items-start",
    textClass: isSuperAdmin ? "truncate" : "whitespace-normal break-words leading-tight",
    containerClass: isSuperAdmin ? "ml-3 border-l border-white/5 pl-3 mt-1 py-0.5" : "space-y-px mt-0.5", 
    iconAlign: isSuperAdmin ? "" : "mt-0.5",
    dotAlign: isSuperAdmin ? "" : "mt-1.5",
    itemPaddingX: isSuperAdmin ? "px-2.5" : "pr-2",
    roundedClass: isSuperAdmin ? "rounded-lg" : "rounded-none",
    groupHeaderClass: isSuperAdmin ? "rounded-xl border" : "border-y",
  };

  const toggleExpanded = (key: string) => {
    setExpandedStates((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const filteredGroups = useMemo(() => {
    if (!rawGroups) return [];
    
    const filterByPermissions = (items: MenuItem[]): MenuItem[] => {
      const filtered: MenuItem[] = [];
      items.forEach(item => {
        const isGroup = item.module === "Menu Group" || (item.code && item.code.startsWith("group."));
        
        // Exclude hardcoded System Shell items from the dynamic sidebar list
        const systemShellCodes = new Set(['DASHBOARD', 'sidebar.nav.companies', 'sidebar.nav.plans', 'sidebar.nav.users']);
        if (systemShellCodes.has(item.code)) return;

        const processedChildren = item.children ? filterByPermissions(item.children) : undefined;
        const hasAllowedChildren = Array.isArray(processedChildren) && processedChildren.length > 0;

        let shouldKeep = false;

        // 1. Visibility — Accounting ▸ Master is often marked sidebar-hidden in templates but must stay
        //    a real folder (otherwise children like Sales Person are hoisted and look "unlinked").
        const isVisible = item.is_sidebar_visible !== false;
        const isAccountingMasterFolder = item.code === "accounting.masters";
        const effectiveVisible =
          isAccountingMasterFolder && hasAllowedChildren ? true : isVisible;
        
        // 2. Permission check
        const isMeAllowed = isSystemAdmin || isMenuAllowed(item.code);
        
        if (isSystemAdmin) {
           shouldKeep = true;
        } else if (isGroup || item.code === "accounting.masters") {
           shouldKeep = hasAllowedChildren;
        } else {
           shouldKeep = isMeAllowed;
        }

        // If the item itself shouldn't be kept OR it was explicitly hidden via EyeOff,
        // we omit this parent. BUT if it has valid children, we seamlessly hoist them up!
        if (!shouldKeep || !effectiveVisible) {
           if (hasAllowedChildren) {
             filtered.push(...processedChildren!);
           }
           return;
        }

        // If the item itself has no route AND no valid children, it's a dead end container. Remove it.
        const href = companyId ? menuHrefFromCode(companyId, item.code) : null;
        if (!href && !hasAllowedChildren) {
          return;
        }

        filtered.push({ ...item, children: processedChildren });
      });

      // Sort: group_order first, then sort_order within the same group
      filtered.sort((a, b) => {
        const aGo = a.group_order ?? 1000;
        const bGo = b.group_order ?? 1000;
        if (aGo !== bGo) return aGo - bGo;
        return (a.sort_order ?? 0) - (b.sort_order ?? 0);
      });

      return filtered;
    };

    const processedGroups = rawGroups.map(group => {
      const items = filterByPermissions(group.items);
      let weight = items.reduce((min, it) => Math.min(min, it.group_order ?? 1000), 1000);
      // Force generic/structural naming to the end unless overridden, and General to top
      if (group.module === "General") weight = Math.min(weight, 0);
      if (["Setup", "Settings", "System Shell"].includes(group.module)) weight = Math.max(weight, 900);

      return {
        ...group,
        items,
        weight
      };
    }).filter(group => group.items.length > 0);

    processedGroups.sort((a, b) => a.weight - b.weight);
    return processedGroups;
  }, [rawGroups, isMenuAllowed, isSuperAdmin, isSystemAdmin]);

  const renderMenuItems = (items: MenuItem[], depth = 0) => {
    const sorted = [...items].sort((a, b) => {
      // At top level, respect group_order (section weight) first, then item sort_order
      // At deeper levels only sort_order matters (all children belong to same group)
      if (depth === 0) {
        const aGo = a.group_order ?? 1000;
        const bGo = b.group_order ?? 1000;
        if (aGo !== bGo) return aGo - bGo;
      }
      return (a.sort_order ?? 0) - (b.sort_order ?? 0);
    });
    return sorted.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const href = menuHrefFromCode(companyId, item.code);
      const isActive = href ? (pathname === href || pathname.startsWith(href + "/")) : false;
      const expandKey = `${item.code}_${item.id}`;
      const isExpanded = expandedStates[expandKey];

      if (hasChildren) {
        const itemCode = String(item.code || "").toLowerCase();
        // Make Document parent directly navigable to avoid a dead-feeling parent entry.
        if (itemCode === "document" && href) {
          return (
            <div key={`${item.code}-${item.id}`} className="space-y-1">
              <Link
                href={href}
                onClick={onItemClick}
                style={{ paddingLeft: `${depth * 12 + 14}px` }}
                className={`group flex ${config.itemAlign} gap-2.5 ${config.roundedClass} py-1.5 text-sm transition-all duration-200 ${
                  isActive
                    ? "bg-emerald-500/20 text-emerald-300 font-semibold border-y border-emerald-500/10"
                    : "text-slate-400 hover:bg-emerald-500/10 hover:text-white"
                }`}
              >
                <div className={`w-1 h-1 rounded-full shrink-0 transition-all ${config.dotAlign} ${isActive ? "bg-emerald-500 scale-125 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500 group-hover:bg-slate-300"}`} />
                <span className={config.textClass}>{item.label}</span>
              </Link>
            </div>
          );
        }

        // If this is a depth 0 structural container, unpack its children rather than showing a double folder button
        const isContainer = item.module === "Menu Group" || (item.code && item.code.startsWith("group.")) || (depth === 0 && item.label?.toLowerCase() === item.module?.toLowerCase());
        if (depth === 0 && isContainer) {
          return (
            <div key={`${item.code}-${item.id}`} className="space-y-0.5">
              {renderMenuItems(item.children || [], depth)}
            </div>
          );
        }

        return (
          <div key={`${item.code}-${item.id}`} className="space-y-1">
            <button
              type="button"
              onClick={() => toggleExpanded(expandKey)}
              style={{ paddingLeft: `${depth * 12 + 14}px` }}
              className={`flex w-full ${config.itemAlign} gap-2 ${config.itemPaddingX} py-1.5 text-sm transition-all duration-200 ${
                isExpanded 
                  ? "rounded-xl bg-indigo-500/10 text-indigo-400 font-semibold shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] border border-indigo-500/20" 
                  : "rounded-lg text-slate-400 hover:text-white hover:bg-white/10 border border-transparent"
              }`}
            >
              <div className={`flex ${config.itemAlign} gap-2 min-w-0 flex-1`}>
                <svg 
                   className={`w-3.5 h-3.5 shrink-0 transition-transform ${config.iconAlign} ${isExpanded ? "text-slate-300" : "text-slate-400"}`} 
                   viewBox="0 0 24 24" fill={isExpanded ? "currentColor" : "none"} fillOpacity={isExpanded ? 0.2 : 0} stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? "m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" : "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"} />
                </svg>
                <span className={config.textClass}>{item.label}</span>
              </div>
              <svg 
                className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} 
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {isExpanded && (
              <div className={config.containerClass + " mt-0.5"}>
                {renderMenuItems(item.children || [], depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const content = (
        <>
          <div className={`w-1 h-1 rounded-full shrink-0 transition-all ${config.dotAlign} ${isActive ? "bg-emerald-500 scale-125 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500 group-hover:bg-slate-300"}`} />
          <span className={config.textClass}>{item.label}</span>
        </>
      );

      if (!href) {
        return null; // Do not render any visually disabled placeholders for unroutable links
      }

      return (
        <Link
          key={`${item.code}-${item.id}`}
          href={href}
          onClick={onItemClick}
          style={!isSuperAdmin ? { paddingLeft: `${depth * 12 + 14}px` } : {}}
          className={`group flex ${config.itemAlign} gap-2.5 ${config.roundedClass} py-1.5 text-sm transition-all duration-200 ${
            isActive 
              ? "bg-emerald-500/20 text-emerald-300 font-semibold border-y border-emerald-500/10" 
              : "text-slate-400 hover:bg-emerald-500/10 hover:text-white"
          }`}
        >
          {content}
        </Link>
      );
    });
  };

  return (
    <div className="space-y-3">
      {filteredGroups.map((group) => {
        const meta = groupMeta[group.module] || { icon: '📁', color: 'text-slate-600', bg: 'bg-slate-50', border: 'border-slate-100', text: 'text-slate-700' };
        const isExpanded = expandedStates[group.module] ?? false;

        return (
          <div key={group.module} className="group/folder">
            <button
              type="button"
              onClick={() => toggleExpanded(group.module)}
              className={`flex w-full items-center justify-between px-3 py-2 transition-transform duration-300 active:scale-[0.98] ${
                isExpanded 
                  ? `${isSuperAdmin ? "rounded-t-xl border border-b-0 border-white/10" : "border-t border-b-0 border-white/10"} ${meta.bg} shadow-[inset_0_1px_4px_rgba(0,0,0,0.2)]` 
                  : `${isSuperAdmin ? "rounded-xl border border-white/5" : "border-y border-transparent"} bg-white/5 hover:bg-white/10`
              }`}
            >
              <span className="flex items-center gap-3">
                <span className={`flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 shadow-sm border border-white/5 text-base`}>
                  {meta.icon}
                </span>
                <div className="text-left">
                  <div className={`font-bold tracking-wide text-xs uppercase ${meta.text}`}>
                    {group.module}
                  </div>
                </div>
              </span>
              <svg 
                className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`} 
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {isExpanded && (
              <div className={`pt-1.5 pb-2 px-1 space-y-0.5 animate-in fade-in slide-in-from-top-1 duration-200 ${
                isSuperAdmin ? "border-x border-b border-white/10 rounded-b-xl bg-black/20" : "border-b border-white/10 bg-black/20"
              }`}>
                {renderMenuItems(group.items)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
