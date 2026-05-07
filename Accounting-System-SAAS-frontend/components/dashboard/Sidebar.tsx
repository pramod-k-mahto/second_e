"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { api, getCurrentCompany } from "@/lib/api";
import { menuHrefFromCode } from "@/lib/menuRouting";
import { LayoutDashboard, Settings, Briefcase, ChevronDown } from "lucide-react";
import { useMenuPermissions } from "@/components/MenuPermissionsContext";
import { useTenantSelf } from "@/lib/tenantSelf/queries";
import { usePermissions } from "@/components/PermissionsContext";

type Menu = {
  id: number;
  label: string;
  module?: string | null;
  code: string;
  is_sidebar_visible?: boolean;
  children?: any[];
  href?: string | null;
};

interface SidebarProps {
  open: boolean;
  onClose: () => void;
  isCollapsed?: boolean;
  rawMenusData?: any[]; 
}

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export function Sidebar({ open, onClose, isCollapsed = false, rawMenusData }: SidebarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const pathname = usePathname();
  const companyId = getCurrentCompany()?.id;
  const { isMenuAllowed } = useMenuPermissions();
  const { isSuperAdmin, isSystemAdmin, isTenantAdmin, ghostCompanyId } = usePermissions();
  const { data: tenant, isLoading: tenantLoading } = useTenantSelf();
  


  // 1. Define internal MenuItem type that matches backend and handles children
  interface MenuItem {
    id: number;
    label: string;
    code: string;
    module?: string | null;
    parent_id?: number | null;
    is_sidebar_visible?: boolean;
    sort_order?: number | null;
    group_order?: number | null;
    children?: MenuItem[];
    href?: string | null;
  }

  interface ModuleGroup {
    module: string;
    items: MenuItem[];
  }

  const sections = useMemo(() => {
    if (!rawMenusData || rawMenusData.length === 0) return [];

    // Group ROOT items by their assigned module
    const moduleMap = new Map<string, MenuItem[]>();
    
    rawMenusData.forEach((rootItem: MenuItem) => {
      // Determine the best module name for the section header
      let mod = rootItem.module || "General";
      
      // Give first priority to the nested group's name (Container label).
      // If not available, fallback to the default parent group (child's module).
      const isGroup = rootItem.module === "Menu Group" || (rootItem.code && rootItem.code.startsWith('group.'));
      if (isGroup) {
         const childMod = (rootItem.children && rootItem.children.length > 0 && rootItem.children[0].module)
           ? rootItem.children[0].module
           : "General";
         mod = rootItem.label || childMod || "General";
         if (mod === "Menu Group" || mod === "group") mod = "General"; // safety fallback
      }

      if (!moduleMap.has(mod)) moduleMap.set(mod, []);
      moduleMap.get(mod)!.push({ ...rootItem });
    });

    const processedSections = Array.from(moduleMap.entries()).map(([moduleName, itemsInGroup]) => {
      // Sort the root items in this module
      itemsInGroup.sort((a, b) => {
        const aIsGroup = (a.children && a.children.length > 0) || a.module === 'Menu Group' || (a.code && a.code.startsWith('group.'));
        const bIsGroup = (b.children && b.children.length > 0) || b.module === 'Menu Group' || (b.code && b.code.startsWith('group.'));
        if (aIsGroup && !bIsGroup) return -1;
        if (!aIsGroup && bIsGroup) return 1;
        return (a.sort_order || 0) - (b.sort_order || 0);
      });

      // Determine the weight of this entire section
      const groupOrder = itemsInGroup.reduce((min, it) => Math.min(min, it.group_order ?? 1000), 1000);
      
      let weight = groupOrder;
      if (moduleName === "General") weight = Math.min(weight, 0);
      if (["Setup", "Settings", "System Shell", "Platform"].includes(moduleName)) weight = Math.max(weight, 900);

      return {
        module: moduleName,
        items: itemsInGroup,
        weight
      };
    }).filter(s => s.items.length > 0);

    const filterByPermissions = (items: MenuItem[]): MenuItem[] => {
      const filtered: MenuItem[] = [];
      items.forEach(item => {
        const isSystemAdminRole = isSystemAdmin || isSuperAdmin;
        
        const systemShellCodes = new Set(['sidebar.nav.companies', 'sidebar.nav.plans', 'sidebar.nav.users']);
        if (systemShellCodes.has(item.code) && !isSystemAdminRole) return;
        
        const isVisible = item.is_sidebar_visible !== false;

        const processedChildren = item.children ? filterByPermissions(item.children) : undefined;
        const hasValidChildren = Array.isArray(processedChildren) && processedChildren.length > 0;
        const isGroup = item.module === "Menu Group" || (item.code && item.code.startsWith("group."));
        const isAccountingMasterNav =
          item.code === "accounting.masters" && hasValidChildren;
        const isMeAllowed =
          isSystemAdminRole ||
          isGroup ||
          isAccountingMasterNav ||
          isMenuAllowed(item.code) ||
          item.code === "reports.item_wise_profit" ||
          item.code === "reports.employee_cost" ||
          item.code === "admin.platform_bookkeeping" ||
          item.code?.startsWith("admin.");

        // If the admin lacks permissions OR the item was explicitly marked invisible (EyeOff),
        // we hide the parent but HOIST any active/valid children up to the root level.
        if (!isMeAllowed || !isVisible) {
          if (hasValidChildren) {
             filtered.push(...processedChildren!);
          }
          return;
        }

        // If the item itself has no route AND no valid children, it's a dead end container. Remove it.
        let href = menuHrefFromCode(companyId || 0, item.code);
        
        // Manual override for Platform Bookkeeping
        if (item.code === "admin.platform_bookkeeping" && ghostCompanyId) {
          href = `/companies/${ghostCompanyId}`;
        }

        // Safety: If it's an admin/system item but no href was resolved, use it as-is (dead link)
        // or ensure it shows up if it's meant to be a leaf node.
        const isAdminLink = item.code?.startsWith("admin.") || item.module === "System Shell" || item.module === "Platform";
        
        if (!href && !hasValidChildren && !isAdminLink && !isSystemAdminRole) {
          return;
        }

        filtered.push({ ...item, children: processedChildren, href: href || undefined });
      });
      return filtered;
    };

    // 4. Permission filtering on the newly built categorized trees
    const finalSections = processedSections.map(s => ({
      ...s,
      items: filterByPermissions(s.items)
    })).filter(s => s.items.length > 0);

    // 5. Manual Injection for Menu Templates
    if (isSystemAdmin || isSuperAdmin || isTenantAdmin) {
      const hasMenuTemplate = finalSections.some(s => s.items.some(it => it.code === 'admin.menu_templates'));
      if (!hasMenuTemplate && isMenuAllowed('admin.menu_templates')) {
        let settingsSection = finalSections.find(s => s.module === "Settings");
        if (!settingsSection) {
          settingsSection = { module: "Settings", items: [], weight: 910 };
          finalSections.push(settingsSection);
        }
        settingsSection.items.push({
          id: -999,
          label: "Menu Templates",
          code: "admin.menu_templates",
          module: "Settings",
          is_sidebar_visible: true,
          sort_order: 999
        });
      }
    }

    return finalSections.sort((a, b) => a.weight - b.weight);
  }, [rawMenusData, isMenuAllowed, isSuperAdmin, isSystemAdmin, isTenantAdmin]);

  const activeModule = useMemo(() => {
    if (!companyId || !sections) return null;

    const findActive = (items: MenuItem[]): boolean => {
      for (const item of items) {
        const href = menuHrefFromCode(companyId, item.code);
        if (href && (pathname === href || pathname.startsWith(href + "/"))) return true;
        if (item.children && findActive(item.children)) return true;
      }
      return false;
    };

    for (const section of sections) {
      if (findActive(section.items)) return section.module;
    }
    return null;
  }, [companyId, sections, pathname]);

  const [expandedStates, setExpandedStates] = useState<Record<string, boolean>>({});
  
  // Style config based on user role
  const config = {
    asideWidth: "w-56",
    navPadding: isSuperAdmin ? "px-3" : "px-0",
    itemPaddingX: isSuperAdmin ? "px-2.5" : "pr-2",
    leafPaddingX: isSuperAdmin ? "px-2.5" : "pr-2",
    itemAlign: isSuperAdmin ? "items-center" : "items-start",
    textClass: isSuperAdmin ? "truncate" : "whitespace-normal break-words leading-tight",
    containerClass: isSuperAdmin ? "ml-3 border-l border-white/5 pl-3 mt-1 py-0.5" : "space-y-px mt-0.5",
    iconAlign: isSuperAdmin ? "" : "mt-0.5",
    dotAlign: isSuperAdmin ? "" : "mt-1.5",
    roundedClass: isSuperAdmin ? "rounded-lg" : "rounded-none",
    groupHeaderClass: isSuperAdmin ? "rounded-xl border" : "border-y",
  };

  useEffect(() => {
    if (activeModule) {
      setExpandedStates(prev => ({ ...prev, [activeModule]: true }));
    }
  }, [activeModule]);

  if (!mounted) {
    return (
      <nav className={`mt-1.5 space-y-0.5 ${config.navPadding} overflow-y-auto max-h-[calc(100vh-160px)] custom-scrollbar`}>
        <div className="text-xs text-slate-300 px-2 py-1">
          {!isCollapsed && "Select a company to load menus."}
        </div>
      </nav>
    );
  }

  const toggleExpanded = (key: string) => {
    setExpandedStates((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const renderMenuItems = (items: MenuItem[], depth = 0) => {
    return items.map((item) => {
      const hasChildren = item.children && item.children.length > 0;
      const expandKey = `${item.code}_${item.id}`;
      const isExpanded = expandedStates[expandKey];

      const href = (item.code.startsWith("admin.") || companyId) ? menuHrefFromCode(companyId!, item.code) : null;
      const isActive = href ? (pathname === href || pathname.startsWith(href + "/")) : false;

      if (hasChildren) {
        // If this is a depth 0 structural container, unpack its children rather than showing a double folder button
        // Only treat as a structural container if explicitly tagged; the label===module
        // heuristic caused false positives (e.g. "accounting.masters" with group_name "Master").
        const isContainer = item.module === "Menu Group" || (item.code && item.code.startsWith("group."));
        if (depth === 0 && isContainer && !isCollapsed) {
          return (
            <div key={item.id} className="space-y-0.5">
              {renderMenuItems(item.children || [], depth)}
            </div>
          );
        }

        return (
          <div key={item.id} className="space-y-0.5">
            <button
              type="button"
              onClick={() => toggleExpanded(expandKey)}
              style={!isSuperAdmin && !isCollapsed ? { paddingLeft: `${depth * 12 + 12}px` } : {}}
              className={`flex w-full ${isCollapsed ? "justify-center" : config.itemAlign} gap-2 ${isExpanded ? "rounded-xl bg-indigo-500/10 text-indigo-400 font-semibold shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)] border border-indigo-500/20" : `${config.roundedClass} text-slate-300 hover:text-white hover:bg-white/10`} ${isCollapsed ? "px-0" : config.itemPaddingX} py-0.5 transition-all duration-200`}
              title={isCollapsed ? item.label : ""}
            >
              <div className={`flex ${isCollapsed ? "justify-center" : config.itemAlign} gap-2 min-w-0 flex-1`}>
                <svg 
                  className={`w-4 h-4 shrink-0 transition-transform ${config.iconAlign} ${isExpanded ? "text-slate-300" : "text-slate-400"}`} 
                  viewBox="0 0 24 24" fill={isExpanded ? "currentColor" : "none"} fillOpacity={isExpanded ? 0.2 : 0} stroke="currentColor" strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={isExpanded ? "m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5c0-1.1.9-2 2-2h3.93a2 2 0 0 1 1.66.9l.82 1.2a2 2 0 0 0 1.66.9H18a2 2 0 0 1 2 2v2" : "M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"} />
                </svg>
                {!isCollapsed && (
                  <span className={`font-semibold tracking-tight ${config.textClass}`}>{item.label}</span>
                )}
              </div>
              {!isCollapsed && (
                <svg 
                  className={`w-3 h-3 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} 
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              )}
            </button>
            {isExpanded && !isCollapsed && (
              <div className={config.containerClass}>
                {renderMenuItems(item.children || [], depth + 1)}
              </div>
            )}
          </div>
        );
      }

      const content = (
        <div className={`flex ${isCollapsed ? "justify-center" : config.itemAlign} gap-3`}>
          <div className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${config.dotAlign} ${isActive ? "bg-emerald-400 scale-110 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-slate-500 group-hover:bg-slate-300"}`} />
          {!isCollapsed && (
            <span className={config.textClass}>{item.label}</span>
          )}
        </div>
      );

      if (!href) {
        return null; // Do not show disabled or unroutable menu items 
      }

      return (
        <Link
          key={item.id}
          href={href}
          onClick={onClose}
          style={!isSuperAdmin && !isCollapsed ? { paddingLeft: `${depth * 12 + 12}px` } : {}}
          className={`group flex ${isCollapsed ? "justify-center" : config.itemAlign} gap-3 ${config.roundedClass} ${isCollapsed ? "px-0" : config.leafPaddingX} py-0.5 text-sm transition-all duration-200 ${isActive 
            ? "bg-emerald-500/15 text-emerald-400 font-semibold shadow-sm ring-1 ring-emerald-500/30" 
            : "text-slate-400 hover:bg-white/10 hover:text-white"
          }`}
          title={isCollapsed ? item.label : ""}
        >
          {content}
        </Link>
      );
    });
  };

  return (
    <nav className={`mt-1.5 space-y-0.5 ${config.navPadding} overflow-y-auto max-h-[calc(100vh-160px)] custom-scrollbar`}>
      {!companyId && (
        <div className="text-xs text-slate-300 px-2 py-1">
          {!isCollapsed && "Select a company to load menus."}
        </div>
      )}

      {sections.length === 0 && (
        <div className="text-xs text-slate-300 px-2 py-1">
          {!isCollapsed && "Loading menus…"}
        </div>
      )}

      {sections.map((section) => (
        <div key={section.module} className="mb-4">
            {!isCollapsed && (
              <div className="flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500/80">
                 {section.module === "General" ? <LayoutDashboard className="w-3 h-3" /> : 
                  (["Setup", "Settings", "System Shell"].includes(section.module)) ? <Settings className="w-3 h-3" /> :
                  <Briefcase className="w-3 h-3" />}
                 {section.module === "General" ? "Overview" : section.module}
              </div>
            )}
           
           <div className="space-y-px mt-0.5">
              {renderMenuItems(section.items)}
           </div>
        </div>
      ))}
    </nav>
  );
}
