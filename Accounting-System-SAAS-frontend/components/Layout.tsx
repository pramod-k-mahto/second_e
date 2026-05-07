"use client";

import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { ReactNode, useEffect, useMemo, useState, useCallback } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getMenuTemplate } from "@/lib/api/menuTemplates";
import { MenuTemplate } from "@/types/menuTemplate";
import {
  api,
  getToken,
  setToken,
  getCurrentCompany,
  setCurrentCompany,
  CurrentCompany,
  NotificationRecord,
  markNotificationRead,
  SalesOrderSummary,
  PurchaseOrderSummary,
  setDefaultLedgers,
} from '@/lib/api';
import { MasterSearchDialog, MasterSearchType } from '@/components/MasterSearchDialog';
import { usePermissions } from '@/components/PermissionsContext';
import { MenuPermissionsProvider } from '@/components/MenuPermissionsContext';
import { useTheme } from '@/components/ThemeProvider';
import { isMenuPermissionsFeatureEnabled } from '@/lib/featureFlags';
import { menuHrefFromCode } from '@/lib/menuRouting';
import { useTenantSelf } from '@/lib/tenantSelf/queries';
import { DynamicCompanyMenu } from '@/components/dashboard/DynamicCompanyMenu';
import { Sidebar } from '@/components/dashboard/Sidebar';
import ChatWidget from '@/components/chat/ChatWidget';
import { MenuSearchDialog, MenuSearchItem } from './MenuSearchDialog';
import { Search as LucideSearch } from 'lucide-react';
import { CalendarSettingsProvider } from '@/components/CalendarSettingsContext';

type MenuRead = {
  id: number;
  code: string;
  label: string;
  module: string | null;
  parent_id: number | null;
  sort_order: number | null;
  is_active: boolean;
  access_level?: MenuAccessLevel;
  is_sidebar_visible?: boolean;
};

type MenuAccessLevel = 'deny' | 'read' | 'update' | 'full';

/** Resolve Accounting ▸ Master container across templates (code/label/module vary). */
function findAccountingMasterMenu(flat: any[]): any | undefined {
  if (!flat?.length) return undefined;
  const norm = (s: unknown) => String(s ?? "").trim().toLowerCase();
  const byCode = flat.find((m: any) => norm(m?.code) === "accounting.masters");
  if (byCode) return byCode;
  const labelHits = flat.filter((m: any) => {
    const L = norm(m?.label);
    return L === "master" || L === "masters";
  });
  const inAccounting = labelHits.find((m: any) => norm(m?.module) === "accounting");
  if (inAccounting) return inAccounting;
  if (labelHits.length === 1) return labelHits[0];
  return flat.find(
    (m: any) => norm(m?.code).includes("accounting") && norm(m?.code).includes("master")
  );
}

/** Menu codes for Sales Person master — must stay aligned with `menuRouting` / menu-templates. */
const SALES_PERSON_MASTER_CODES = new Set([
  "accounting.masters.sales-persons",
  "accounting.masters.sales-person",
  "accounting.masters.sales_person",
  "accounting.masters.sales_persons",
]);

function isSalesPersonMasterMenuKey(menuCode: string): boolean {
  return SALES_PERSON_MASTER_CODES.has(menuCode.trim().toLowerCase());
}

type UserMenuAccessEntry = {
  id: number;
  user_id: number;
  company_id: number;
  menu_id: number;
  access_level: MenuAccessLevel;
};

function SidebarIcon({ name, className }: { name: string; className?: string }) {
  const cls = className || 'h-4 w-4';
  if (name === 'tasks') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
        <path d="M9 11l2 2 4-4" />
        <path d="M4 6h16" />
        <path d="M4 12h4" />
        <path d="M4 18h16" />
      </svg>
    );
  }
  if (name === 'voucher') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
        <path d="M7 3h10v18H7z" />
        <path d="M9 7h6" />
        <path d="M9 11h6" />
        <path d="M9 15h4" />
      </svg>
    );
  }
  if (name === 'master') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
        <ellipse cx="12" cy="5" rx="8" ry="3" />
        <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
        <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </svg>
    );
  }
  if (name === 'reports') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
        <path d="M4 19V5" />
        <path d="M4 19h16" />
        <path d="M7 15l4-4 3 3 6-6" />
      </svg>
    );
  }
  if (name === 'settings') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
        <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z" />
        <path d="M19.4 15a7.9 7.9 0 0 0 .1-2l2-1.2-2-3.5-2.3.6a7.6 7.6 0 0 0-1.7-1L15 5h-6l-.5 2.9a7.6 7.6 0 0 0-1.7 1L4.5 8.3 2.5 11.8 4.5 13a7.9 7.9 0 0 0 .1 2l-2 1.2 2 3.5 2.3-.6a7.6 7.6 0 0 0 1.7 1L9 23h6l.5-2.9a7.6 7.6 0 0 0 1.7-1l2.3.6 2-3.5-2.1-1.2z" />
      </svg>
    );
  }
  if (name === 'chevron') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
        <path d="M9 6l6 6-6 6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={cls}>
      <path d="M12 6v12" />
      <path d="M6 12h12" />
    </svg>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const [currentCompany, setCurrentCompanyState] = useState<CurrentCompany | null>(null);
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const { data: currentUser, error: userError, isLoading: userLoading } = useSWR(
    getToken() ? '/auth/me' : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: activeAnnouncements } = useSWR<any[]>(
    getToken() ? '/announcements/active' : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const [activeAnnouncement, setActiveAnnouncement] = useState<any | null>(null);
  /** ChatWidget is client-only after mount to avoid SSR/client HTML drift (pathname vs local company). */
  const [chatWidgetReady, setChatWidgetReady] = useState(false);

  useEffect(() => {
    setChatWidgetReady(true);
  }, []);

  useEffect(() => {
    if (activeAnnouncements && activeAnnouncements.length > 0) {
      for (const ann of activeAnnouncements) {
        if (!sessionStorage.getItem(`seen_announcement_${ann.id}`)) {
          setActiveAnnouncement(ann);
          break;
        }
      }
    }
  }, [activeAnnouncements]);

  const handleDismissAnnouncement = () => {
    if (activeAnnouncement) {
      sessionStorage.setItem(`seen_announcement_${activeAnnouncement.id}`, 'true');
      setActiveAnnouncement(null);
    }
  };

  useEffect(() => {
    const token = getToken();
    if (!token && !pathname.startsWith('/auth') && !pathname.startsWith('/store') && pathname !== '/') {
      router.replace('/auth/login');
    }
  }, [pathname, router]);

  useEffect(() => {
    const cc = getCurrentCompany();
    setCurrentCompanyState(cc);
  }, [pathname]);

  const handleLogout = useCallback(async () => {
    setToken(null);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // best-effort cookie cleanup
    }
    router.push('/auth/login');
  }, [router]);

  useEffect(() => {
    const isPublicPage = pathname.startsWith('/auth') || pathname.startsWith('/store') || pathname === '/';
    if (isPublicPage || !getToken()) return;

    let timeoutId: ReturnType<typeof setTimeout>;

    const handleIdle = () => {
      if (getToken()) {
        showToast({ title: 'Session Expired', description: 'You have been logged out due to 30 minutes of inactivity.', variant: 'error' });
        handleLogout();
      }
    };

    const resetTimer = () => {
      clearTimeout(timeoutId);
      // 30 minutes in ms = 30 * 60 * 1000 = 1800000
      timeoutId = setTimeout(handleIdle, 1800000);
    };

    // Attach native DOM events for activity
    const events = ['mousemove', 'keydown', 'wheel', 'mousedown', 'touchstart', 'touchmove'];
    for (const evt of events) {
      window.addEventListener(evt, resetTimer, { passive: true });
    }

    resetTimer(); // Start the timer

    return () => {
      clearTimeout(timeoutId);
      for (const evt of events) {
        window.removeEventListener(evt, resetTimer);
      }
    };
  }, [pathname, handleLogout, showToast]);

  const handleSeedDefaultChart = async () => {
    if (!companyId) return;
    if (typeof window !== 'undefined') {
      const ok = window.confirm(
        'Seed default chart of accounts for this company?\n\nThis will create a standard set of ledger groups and ledgers for this company. It may add new accounts if they do not exist already, but it will not delete your existing data.'
      );
      if (!ok) return;
    }
    try {
      await api.post(`/companies/${companyId}/seed/default-chart`);
      try {
        const defaultsRes = await api.get(`/companies/${companyId}/default-ledgers`);
        if (defaultsRes?.data) {
          setDefaultLedgers(companyId, defaultsRes.data || {});
        }
      } catch {
        // ignore default-ledger fetch failure from header seed action
      }
      if (typeof window !== 'undefined') {
        window.alert('Seeded default chart of accounts successfully.');
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to seed default chart.';
      if (typeof window !== 'undefined') {
        window.alert(msg);
      }
    }
  };

  const handleCloseCompany = () => {
    setCurrentCompany(null);
    setCurrentCompanyState(null);
    setCompanyMenuOpen(false);
    router.push('/companies');
  };

  const handleSelectCompany = () => {
    setCompanyMenuOpen(false);
    router.push('/companies');
  };

  const handleGoDashboard = () => {
    setCompanyMenuOpen(false);
    router.push('/dashboard');
  };

  const isAuthPage = pathname.startsWith('/auth');
  const isAdminPage = pathname.startsWith('/admin');
  const currentVoucherType = searchParams.get('type');
  const userRole = currentUser?.role as string | undefined;
  const userRoleLower = userRole?.toLowerCase();
  const permissionsCtx = usePermissions();
  
  const isSuperAdmin = userRoleLower === 'superadmin';
  const isGhostAdmin = permissionsCtx.isGhostAdmin;
  const isAdminLike = userRoleLower === 'admin' || isSuperAdmin || userRoleLower === 'ghost' || isGhostAdmin;

  const isTenantAdmin = permissionsCtx.isTenantAdmin;
  const isSystemAdmin = permissionsCtx.isSystemAdmin;

  const { theme, toggleTheme } = useTheme();

  const ghostCompanyId = permissionsCtx.ghostCompanyId;
  const activeCompanyId = useMemo(() => {
    if (currentCompany?.id) return currentCompany.id;
    const match = pathname.match(/^\/companies\/(\d+)/);
    return match ? Number(match[1]) : null;
  }, [currentCompany, pathname]);

  const companyId = activeCompanyId;

  const isCompanyContext = /^\/companies\/[^/]+/.test(pathname);

  const canFetchCompanyData = !!companyId && !!getToken() && !isAuthPage;

  const { data: dashCustomers } = useSWR(
    canFetchCompanyData ? `/sales/companies/${companyId}/customers` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashLedgers } = useSWR(
    canFetchCompanyData ? `/ledgers/companies/${companyId}/ledgers` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashSuppliers } = useSWR(
    canFetchCompanyData ? `/purchases/companies/${companyId}/suppliers` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashItems } = useSWR(
    canFetchCompanyData ? `/inventory/companies/${companyId}/items` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashCategories } = useSWR(
    canFetchCompanyData ? `/companies/${companyId}/categories?is_active=true` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashSubcategories } = useSWR(
    canFetchCompanyData ? `/companies/${companyId}/subcategories?is_active=true` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashBrands } = useSWR(
    canFetchCompanyData ? `/companies/${companyId}/brands?is_active=true` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );
  const { data: dashWarehouses } = useSWR(
    canFetchCompanyData ? `/inventory/companies/${companyId}/warehouses` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  // 1. Fetch the full menu registry (raw source of all potential items)
  // Only admins can successfully fetch this.
  const { data: allRegistryMenus } = useSWR<any[]>(
    getToken() ? "/admin/menus" : null,
    (url: string) => api.get(url).then((res) => res.data).catch(() => null)
  );


  // 1b. Fetch standard company menus (Safe fallback for non-admins)
  const { data: standardMenus } = useSWR<any[]>(
    canFetchCompanyData ? `/companies/${companyId}/menus` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  // 1c. Fetch global tenant menus (Dashboard context fallback)
  const { data: globalMenus } = useSWR<any[]>(
    getToken() && !isAuthPage ? "/tenants/self/menus" : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  // 1d. Fetch all plans (for admin discovery)
  const { data: allPlansForAdmin } = useSWR<any[]>(
    isAdminLike || isSystemAdmin ? "/admin/plans" : null,
    (url: string) => api.get(url).then((res) => res.data).catch(() => null)
  );

  const { data: tenant, isLoading: tenantLoading } = useTenantSelf();
  
  // 2. Fetch Plan-Level Template (Dynamic Discovery)
  const planTemplateId = useMemo(() => {
    // a. Discovery by Code (Robust)
    if (allPlansForAdmin && tenant?.plan) {
      const plansArray = Array.isArray(allPlansForAdmin) ? allPlansForAdmin : (allPlansForAdmin as any)?.results || [];
      const planCode = String(tenant.plan).trim().toLowerCase();
      const planObj = plansArray.find((p: any) => String(p.code || "").trim().toLowerCase() === planCode);
      if (planObj?.menu_template_id) return Number(planObj.menu_template_id);
    }

    // b. Fallback by Feature Tag
    const match = String(tenant?.plan_features || "").match(/template_id:(\d+)/);
    return match ? Number(match[1]) : null;
  }, [tenant, allPlansForAdmin]);

  const { data: planTemplate } = useSWR<MenuTemplate>(
    planTemplateId ? `/admin/menu-templates/${planTemplateId}` : null,
    () => getMenuTemplate(planTemplateId!)
  );

  // 3. Fetch Tenant-Level Template
  const { data: tenantTemplate } = useSWR<MenuTemplate>(
    tenant?.menu_template_id ? `/admin/menu-templates/${tenant.menu_template_id}` : null,
    () => getMenuTemplate(tenant!.menu_template_id!)
  );

  // 4. SMART UNION: Merge menu IDs from both templates + Build Tree
  const rawMenusData = useMemo(() => {
    const legacyCodesToHide = new Set(["inventory.bom", "inventory.production_orders"]);
    const pruneLegacyMenus = (items: any[]): any[] => {
      return (items || [])
        .filter((item) => !legacyCodesToHide.has(String(item?.code || "").toLowerCase()))
        .map((item) => ({
          ...item,
          children: Array.isArray(item?.children) ? pruneLegacyMenus(item.children) : item.children,
          items: Array.isArray(item?.items) ? pruneLegacyMenus(item.items) : item.items,
        }));
    };

    /** Sales Person masters — always grouped under Accounting ▸ Master in the sidebar tree */
    const SALES_PERSON_UNDER_MASTER_CODES = new Set([
      "accounting.masters.sales-persons",
      "accounting.masters.sales-person",
      "accounting.masters.sales_person",
      "accounting.masters.sales_persons",
    ]);

    const attachSalesPersonMenusUnderAccountingMaster = (flat: any[]) => {
      const master = findAccountingMasterMenu(flat);
      if (master?.id == null) return;
      const masterId = master.id;
      flat.forEach((m: any) => {
        const codeLc = String(m?.code ?? "").trim().toLowerCase();
        if (!SALES_PERSON_UNDER_MASTER_CODES.has(codeLc)) return;
        m.parent_id = masterId;
      });
    };

    // a. Correctly identify the registry array (handle raw array vs. {results: []})
    const registryArray = Array.isArray(allRegistryMenus) ? allRegistryMenus : (allRegistryMenus as any)?.results;
    
    // b. Determine the BASELINE (Start with what the backend already gave us)
    const baselineSource = companyId ? (standardMenus || []) : (globalMenus || []);
    
    // Convert baseline (which might be grouped) to a flat list of authorized IDs to start with
    const authorizedIds = new Set<number>();
    const traverseAndCollect = (items: any[]) => {
      items.forEach(item => {
        if (item.id) authorizedIds.add(item.id);
        if (item.children) traverseAndCollect(item.children);
        if (item.items) traverseAndCollect(item.items); // Handle grouped data
      });
    };
    traverseAndCollect(baselineSource);

    // c. Metadata Fusion: Map all template-level overrides (ordering, parenting, grouping)
    const templateOverrides = new Map<number, any>();
    const applyTpl = (tpl: any) => {
      if (tpl?.items && Array.isArray(tpl.items)) {
        tpl.items.forEach((it: any) => {
          templateOverrides.set(Number(it.menu_id), it);
        });
      }
    };
    applyTpl(planTemplate);
    applyTpl(tenantTemplate); // Tenant template takes priority over Plan template

    // d. EXTEND & MERGE: If registry is available (Admins), build the authorized tree with metadata overrides
    const allRegistry = Array.isArray(registryArray) ? (registryArray as any[]) : null;
    if (allRegistry) {
      if (planTemplate?.menu_ids) planTemplate.menu_ids.forEach(id => authorizedIds.add(id));
      if (tenantTemplate?.menu_ids) tenantTemplate.menu_ids.forEach(id => authorizedIds.add(id));
    
      // Map all registry items for parent lookup
      const registryMap = new Map<number, any>();
      allRegistry.forEach(m => registryMap.set(m.id, m));

      // Final authorized set must include ancestors
      const finalIds = new Set<number>();
      const addWithAncestors = (id: number) => {
        if (finalIds.has(id)) return;
        finalIds.add(id);
        const item = registryMap.get(id);
        if (item?.parent_id) addWithAncestors(item.parent_id);
      };

      authorizedIds.forEach(id => addWithAncestors(id));

      // Superadmin: always surface the full menu library in company sidebar & layout (same scope as the
      // "Default — Full menu library" template), not only the tenant/plan template subset.
      if (isSuperAdmin) {
        allRegistry.forEach((m: any) => {
          if (m?.id != null) addWithAncestors(Number(m.id));
        });
      }
      
      // Auto-include core system items and administrative menus for system admins
      allRegistry.forEach(m => {
        const code = m.code?.toLowerCase();
        if (m.id < 0 || ['dashboard', 'companies', 'settings'].includes(code) || (isSystemAdmin && code?.startsWith('admin.'))) {
          addWithAncestors(m.id);
        }
      });

      // Apply Overrides to authorized list
      const authorizedFlatList = allRegistry
        .filter(m => finalIds.has(m.id))
        .map(m => {
          const ovr = templateOverrides.get(Number(m.id));
          if (ovr) {
            return {
              ...m,
              label: ovr.label !== undefined ? ovr.label : m.label,
              // Strictly follow template hierarchy and sorting
              parent_id: ovr.parent_id !== undefined ? ovr.parent_id : m.parent_id,
              sort_order: ovr.item_order !== undefined ? ovr.item_order : (m.sort_order || 0),
              group_order: ovr.group_order !== undefined ? ovr.group_order : 1000,
              module: ovr.group_name || m.module,
              is_sidebar_visible: ovr.is_sidebar_visible !== undefined ? ovr.is_sidebar_visible : m.is_sidebar_visible
            };
          }
          return m;
        });

      // Hardcode inject Item Wise Profit if missing from DB templates temporarily
      if (!authorizedFlatList.find(m => m.code === "reports.item_wise_profit")) {
          const reportsParent = authorizedFlatList.find(m => m.code === "REPORTS" || m.label === "Reports");
          authorizedFlatList.push({
              id: 999999,
              code: "reports.item_wise_profit",
              label: "Item Wise Profit",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 207,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Depreciation Report if missing from DB templates temporarily
      if (!authorizedFlatList.find(m => m.code === "reports.fixed_assets")) {
          const reportsParent = authorizedFlatList.find(m => m.code === "REPORTS" || m.label === "Reports");
          authorizedFlatList.push({
              id: 999993,
              code: "reports.fixed_assets",
              label: "Depreciation Report",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 208,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      if (!authorizedFlatList.find(m => m.code === "reports.bom_transactions")) {
          const reportsParent = authorizedFlatList.find(m => m.code === "REPORTS" || m.label === "Reports");
          authorizedFlatList.push({
              id: 999988,
              code: "reports.bom_transactions",
              label: "BOM transactions",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 210,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      if (!authorizedFlatList.find(m => m.code === "reports.employee_cost")) {
          const reportsParent = authorizedFlatList.find(m => m.code === "REPORTS" || m.label === "Reports" || m.label === "Report" || m.module === "Reports");
          authorizedFlatList.push({
              id: 999986,
              code: "reports.employee_cost",
              label: "Employee Cost Report",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 211,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Duties & Taxes if missing from DB templates temporarily
      if (!authorizedFlatList.find(m => m.code === "settings.duty_taxes")) {
          const settingsParent = authorizedFlatList.find(m => m.code?.toLowerCase() === "settings") || authorizedFlatList.find(m => m.label === "Settings" && m.module === "Settings" && (!m.parent_id || m.parent_id == 0));
          const calendarMenu = authorizedFlatList.find(m => m.code === "settings.calendar");
          const targetSortOrder = calendarMenu && calendarMenu.sort_order !== undefined ? Number(calendarMenu.sort_order) + 0.5 : 902.5;
          authorizedFlatList.push({
              id: 999992,
              code: "settings.duty_taxes",
              label: "Duties & Taxes",
              module: "Settings",
              parent_id: settingsParent ? settingsParent.id : null,
              sort_order: targetSortOrder,
              group_order: 900,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Sales Person if missing from DB templates temporarily
      if (!authorizedFlatList.find(m => m.code === "accounting.masters.sales-persons")) {
          const masterParent =
            findAccountingMasterMenu(authorizedFlatList) ||
            authorizedFlatList.find(m => m.code === "accounting.masters" || m.label === "Master" || m.label === "Masters");
          authorizedFlatList.push({
              id: 999975,
              code: "accounting.masters.sales-persons",
              label: "Sales Person",
              module: "Accounting",
              parent_id: masterParent ? masterParent.id : null,
              sort_order: 107,
              group_order: 100,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject full Manufacturing ERP menu tree if missing
      let mfgParent = authorizedFlatList.find(m => m.code === "MANUFACTURING_ERP" || m.label === "Manufacturing ERP");
      if (!mfgParent) {
          mfgParent = {
              id: 999988,
              code: "MANUFACTURING_ERP",
              label: "Manufacturing ERP",
              module: "Manufacturing",
              parent_id: null,
              sort_order: 230,
              group_order: 300,
              is_sidebar_visible: true
          } as any;
          authorizedFlatList.push(mfgParent as any);
      }
      const ensureMfgMenu = (id: number, code: string, label: string, sort_order: number) => {
          if (!authorizedFlatList.find(m => m.code === code)) {
              authorizedFlatList.push({
                  id, code, label, module: "Manufacturing",
                  parent_id: mfgParent ? (mfgParent as any).id : null,
                  sort_order, group_order: 300, is_sidebar_visible: true
              } as any);
          }
      };
      ensureMfgMenu(999990, "manufacturing.dashboard", "Dashboard", 231);
      ensureMfgMenu(999989, "manufacturing.bom_master", "BOM Master", 232);
      ensureMfgMenu(999987, "manufacturing.production_order", "Production Order", 233);
      ensureMfgMenu(999986, "manufacturing.material_issue", "Material Issue", 234);
      ensureMfgMenu(999985, "manufacturing.wip", "Work In Progress", 235);
      ensureMfgMenu(999984, "manufacturing.production_entry", "Production Entry", 236);
      ensureMfgMenu(999983, "manufacturing.finished_goods_receive", "Finished Goods Receive", 237);
      ensureMfgMenu(999982, "manufacturing.wastage_scrap", "Wastage / Scrap", 238);
      ensureMfgMenu(999981, "manufacturing.production_costing", "Production Costing", 239);
      ensureMfgMenu(999980, "manufacturing.reports", "Reports", 240);
      ensureMfgMenu(999978, "manufacturing.ai_documents", "AI Documents", 242);
      ensureMfgMenu(999977, "manufacturing.fg_journal_entry", "FG Journal Entry", 243);

      // Hardcode inject Platform Bookkeeping for Ghost Admins if ghostCompanyId exists
      if (ghostCompanyId && (isSystemAdmin || isAdminLike) && !authorizedFlatList.find(m => m.code === "admin.platform_bookkeeping")) {
          authorizedFlatList.push({
              id: 999998,
              code: "admin.platform_bookkeeping",
              label: "Platform Bookkeeping",
              module: "Platform",
              parent_id: null,
              sort_order: -10,
              group_order: 0,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Smart Reports for Ghost Admins / Superadmins
      if ((isSystemAdmin || isAdminLike) && !authorizedFlatList.find(m => m.code === "admin.smart_reports")) {
          authorizedFlatList.push({
              id: 999997,
              code: "admin.smart_reports",
              label: "Smart Reports",
              module: "Platform",
              parent_id: null,
              sort_order: -5,
              group_order: 0,
              is_sidebar_visible: true
          });
      }
      // Sub-menus (Note: These will be child-linked by parent_id)
      authorizedFlatList.push({
          id: 999996,
          code: "admin.reports.sales",
          label: "SaaS Sales",
          module: "Platform",
          parent_id: 999997,
          sort_order: 1,
          is_sidebar_visible: true
      });
      authorizedFlatList.push({
          id: 999995,
          code: "admin.reports.collections",
          label: "Tenant Collections",
          module: "Platform",
          parent_id: 999997,
          sort_order: 2,
          is_sidebar_visible: true
      });
      authorizedFlatList.push({
          id: 999994,
          code: "admin.reports.debtors",
          label: "Credit Aging",
          module: "Platform",
          parent_id: 999997,
          sort_order: 3,
          is_sidebar_visible: true
      });

      attachSalesPersonMenusUnderAccountingMaster(authorizedFlatList);

      // Recursive tree builder
      const buildTree = (items: any[], parentId: number | null = null): any[] => {
        // Find items whose parent matches parentId
        // OR items at root level (parentId === null) whose designated parent is NOT in the list (Healing)
        return items
          .filter(item => {
            const pid = item.parent_id || null;
            if (parentId === null) {
              const parentExists = items.some(it => it.id == pid);
              return !pid || pid == 0 || !parentExists;
            }
            return pid == parentId;
          })
          .map(item => ({
            ...item,
            children: buildTree(items, item.id)
          }))
          .sort((a, b) => {
            const aIsGroup = (a.children && a.children.length > 0) || a.module === 'Menu Group' || (a.code && a.code.startsWith('group.'));
            const bIsGroup = (b.children && b.children.length > 0) || b.module === 'Menu Group' || (b.code && b.code.startsWith('group.'));
            if (aIsGroup && !bIsGroup) return -1;
            if (!aIsGroup && bIsGroup) return 1;
            return (a.sort_order || 0) - (b.sort_order || 0);
          });
      };

      return pruneLegacyMenus(buildTree(authorizedFlatList, null));
    }
    
    // d. ROBUST FALLBACK: If no registry is available (Non-Admins), still apply template overrides and rebuild the tree
    if (baselineSource) {
      // 1. Flatten the existing baseline to normalize it for re-grouping/re-parenting
      const flattenedBaseline: any[] = [];
      const traverse = (items: any[]) => {
        items.forEach(it => {
          // Normalize item structure
          const normalized = { ...it };
          if (it.items) delete (normalized as any).items;
          if (it.children) delete (normalized as any).children;
          flattenedBaseline.push(normalized);
          
          if (it.children && Array.isArray(it.children)) traverse(it.children);
          if (it.items && Array.isArray(it.items)) traverse(it.items);
        });
      };
      traverse(baselineSource);

      // 2. Apply Metadata Overrides from Templates
      const overriddenBaseline = flattenedBaseline.map(m => {
        const ovr = templateOverrides.get(Number(m.id));
        if (ovr) {
          return {
            ...m,
            label: ovr.label !== undefined ? ovr.label : m.label,
            parent_id: ovr.parent_id !== undefined ? ovr.parent_id : m.parent_id,
            sort_order: ovr.item_order !== undefined ? ovr.item_order : (m.sort_order || 0),
            group_order: ovr.group_order !== undefined ? ovr.group_order : 100,
            module: ovr.group_name || m.module,
            is_sidebar_visible: ovr.is_sidebar_visible !== undefined ? ovr.is_sidebar_visible : m.is_sidebar_visible
          };
        }
        // Even without an override, ensure we have a default sort_order
        return { ...m, sort_order: m.sort_order || 0, group_order: 1000 };
      });

      // 2b. INJECT MISSING PARENTS (Containers)
      // Custom Menu Groups might not be returned in baselineSource.
      const existingIds = new Set(overriddenBaseline.map(m => m.id));
      const itemsToInject: any[] = [];
      
      // Find ALL parent IDs required by items
      const neededParentIds = new Set<number>();
      overriddenBaseline.forEach(m => {
         if (m.parent_id) neededParentIds.add(Number(m.parent_id));
      });

      // Also ensure we include any explicit group from templates just in case
      templateOverrides.forEach((ovr, id) => {
         if (ovr.code?.startsWith('group.') || ovr.label) {
             neededParentIds.add(Number(id));
         }
      });

      neededParentIds.forEach(id => {
         if (!existingIds.has(id)) {
            // We need this parent, but it's missing!
            const ovr = templateOverrides.get(id) || {};
            
            // Native fallback if template doesn't specify details
            const nativeM = (globalMenus || []).find((m: any) => m.id === id); 
            
            itemsToInject.push({
               id: id,
               code: ovr.code || nativeM?.code || `group.${id}`,
               label: ovr.label || nativeM?.label || `Custom Group`,
               module: ovr.group_name || nativeM?.module || "Menu Group",
               parent_id: ovr.parent_id !== undefined ? ovr.parent_id : (nativeM?.parent_id || null),
               sort_order: ovr.item_order ?? nativeM?.sort_order ?? 0,
               group_order: ovr.group_order ?? nativeM?.group_order ?? 1000,
               is_sidebar_visible: ovr.is_sidebar_visible !== false
            });
            existingIds.add(id);
         }
      });
      
      if (itemsToInject.length > 0) {
         overriddenBaseline.push(...itemsToInject);
      }

      // Hardcode inject Item Wise Profit if missing from DB templates temporarily
      if (!overriddenBaseline.find(m => m.code === "reports.item_wise_profit")) {
          const reportsParent = overriddenBaseline.find(m => m.code === "REPORTS" || m.label === "Reports");
          overriddenBaseline.push({
              id: 999999,
              code: "reports.item_wise_profit",
              label: "Item Wise Profit",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 207,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Depreciation Report if missing from DB templates temporarily
      if (!overriddenBaseline.find(m => m.code === "reports.fixed_assets")) {
          const reportsParent = overriddenBaseline.find(m => m.code === "REPORTS" || m.label === "Reports");
          overriddenBaseline.push({
              id: 999993,
              code: "reports.fixed_assets",
              label: "Depreciation Report",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 208,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Item History if missing from DB templates temporarily
      if (!overriddenBaseline.find(m => m.code === "reports.item_history")) {
          const reportsParent = overriddenBaseline.find(m => m.code === "REPORTS" || m.label === "Reports");
          overriddenBaseline.push({
              id: 999991,
              code: "reports.item_history",
              label: "Item History",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 209,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      if (!overriddenBaseline.find(m => m.code === "reports.bom_transactions")) {
          const reportsParent = overriddenBaseline.find(m => m.code === "REPORTS" || m.label === "Reports");
          overriddenBaseline.push({
              id: 999987,
              code: "reports.bom_transactions",
              label: "BOM transactions",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 210,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      if (!overriddenBaseline.find(m => m.code === "reports.employee_cost")) {
          const reportsParent = overriddenBaseline.find(m => m.code === "REPORTS" || m.label === "Reports" || m.label === "Report" || m.module === "Reports");
          overriddenBaseline.push({
              id: 999986,
              code: "reports.employee_cost",
              label: "Employee Cost Report",
              module: "Reports",
              parent_id: reportsParent ? reportsParent.id : null,
              sort_order: 211,
              group_order: 200,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Duties & Taxes if missing from DB templates temporarily
      if (!overriddenBaseline.find(m => m.code === "settings.duty_taxes")) {
          const settingsParent = overriddenBaseline.find(m => m.code?.toLowerCase() === "settings") || overriddenBaseline.find(m => m.label === "Settings" && m.module === "Settings" && (!m.parent_id || m.parent_id == 0));
          const calendarMenu = overriddenBaseline.find(m => m.code === "settings.calendar");
          const targetSortOrder = calendarMenu && calendarMenu.sort_order !== undefined ? Number(calendarMenu.sort_order) + 0.5 : 902.5;
          overriddenBaseline.push({
              id: 999992,
              code: "settings.duty_taxes",
              label: "Duties & Taxes",
              module: "Settings",
              parent_id: settingsParent ? settingsParent.id : null,
              sort_order: targetSortOrder,
              group_order: 900,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject Sales Person if missing from DB templates temporarily
      if (!overriddenBaseline.find(m => m.code === "accounting.masters.sales-persons")) {
          const masterParent =
            findAccountingMasterMenu(overriddenBaseline) ||
            overriddenBaseline.find(m => m.code === "accounting.masters" || m.label === "Master" || m.label === "Masters");
          overriddenBaseline.push({
              id: 999975,
              code: "accounting.masters.sales-persons",
              label: "Sales Person",
              module: "Accounting",
              parent_id: masterParent ? masterParent.id : null,
              sort_order: 107,
              group_order: 100,
              is_sidebar_visible: true
          });
      }

      // Hardcode inject full Manufacturing ERP menu tree if missing
      let fallbackMfgParent = overriddenBaseline.find(m => m.code === "MANUFACTURING_ERP" || m.label === "Manufacturing ERP");
      if (!fallbackMfgParent) {
          fallbackMfgParent = {
              id: 999988,
              code: "MANUFACTURING_ERP",
              label: "Manufacturing ERP",
              module: "Manufacturing",
              parent_id: null,
              sort_order: 230,
              group_order: 300,
              is_sidebar_visible: true
          } as any;
          overriddenBaseline.push(fallbackMfgParent as any);
      }
      const ensureFallbackMfgMenu = (id: number, code: string, label: string, sort_order: number) => {
          if (!overriddenBaseline.find(m => m.code === code)) {
              overriddenBaseline.push({
                  id, code, label, module: "Manufacturing",
                  parent_id: fallbackMfgParent ? (fallbackMfgParent as any).id : null,
                  sort_order, group_order: 300, is_sidebar_visible: true
              } as any);
          }
      };
      ensureFallbackMfgMenu(999990, "manufacturing.dashboard", "Dashboard", 231);
      ensureFallbackMfgMenu(999989, "manufacturing.bom_master", "BOM Master", 232);
      ensureFallbackMfgMenu(999987, "manufacturing.production_order", "Production Order", 233);
      ensureFallbackMfgMenu(999986, "manufacturing.material_issue", "Material Issue", 234);
      ensureFallbackMfgMenu(999985, "manufacturing.wip", "Work In Progress", 235);
      ensureFallbackMfgMenu(999984, "manufacturing.production_entry", "Production Entry", 236);
      ensureFallbackMfgMenu(999983, "manufacturing.finished_goods_receive", "Finished Goods Receive", 237);
      ensureFallbackMfgMenu(999982, "manufacturing.wastage_scrap", "Wastage / Scrap", 238);
      ensureFallbackMfgMenu(999981, "manufacturing.production_costing", "Production Costing", 239);
      ensureFallbackMfgMenu(999980, "manufacturing.reports", "Reports", 240);
      ensureFallbackMfgMenu(999978, "manufacturing.ai_documents", "AI Documents", 242);
      ensureFallbackMfgMenu(999977, "manufacturing.fg_journal_entry", "FG Journal Entry", 243);

      attachSalesPersonMenusUnderAccountingMaster(overriddenBaseline);

      // Hardcode inject Platform Bookkeeping for Ghost Admins if ghostCompanyId exists
      if (ghostCompanyId && (isSystemAdmin || isAdminLike) && !overriddenBaseline.find(m => m.code === "admin.platform_bookkeeping")) {
          overriddenBaseline.push({
              id: 999998,
              code: "admin.platform_bookkeeping",
              label: "Platform Bookkeeping",
              module: "Platform",
              parent_id: null,
              sort_order: -10,
              group_order: 0,
              is_sidebar_visible: true
          });
      }

      // 3. Re-build Recursive Tree with circular reference protection
      const buildTree = (items: any[], parentId: number | null = null, visited = new Set<number>()): any[] => {
        return items
          .filter(item => {
            const pid = item.parent_id || null;
            if (parentId === null) {
              const parentExists = items.some(it => it.id == pid);
              return !pid || pid == 0 || !parentExists;
            }
            return pid == parentId;
          })
          .map(item => {
             // Cycle detection
             if (visited.has(item.id)) {
                 return { ...item, children: [] };
             }
             const newVisited = new Set(visited);
             newVisited.add(item.id);
             
             return {
                ...item,
                children: buildTree(items, item.id, newVisited)
             };
          })
          .sort((a, b) => {
            const aIsGroup = (a.children && a.children.length > 0) || a.module === 'Menu Group' || (a.code && a.code.startsWith('group.'));
            const bIsGroup = (b.children && b.children.length > 0) || b.module === 'Menu Group' || (b.code && b.code.startsWith('group.'));
            if (aIsGroup && !bIsGroup) return -1;
            if (!aIsGroup && bIsGroup) return 1;
            return (a.sort_order || 0) - (b.sort_order || 0);
          });
      };

      return pruneLegacyMenus(buildTree(overriddenBaseline, null, new Set()));
    }
    
    return [];
  }, [allRegistryMenus, planTemplate, tenantTemplate, standardMenus, globalMenus, companyId, ghostCompanyId, isSystemAdmin, isAdminLike, isSuperAdmin]);

  // Rest of the hooks...

  const flatMenus = useMemo(() => {
    if (!rawMenusData) return [];
    const result: MenuRead[] = [];
    const traverse = (items: any[]) => {
      items.forEach((item) => {
        result.push(item);
        if (item.children && Array.isArray(item.children)) {
          traverse(item.children);
        }
      });
    };
    if (rawMenusData.length > 0 && (rawMenusData[0] as any).items) {
      // It's Grouped (ModuleGroups)
      rawMenusData.forEach((group: any) => {
        if (group.items) traverse(group.items);
      });
    } else {
      // It's a Nested Tree (MenuItem[])
      traverse(rawMenusData);
    }
    return result;
  }, [rawMenusData]);

  const menuToModuleMap: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    if (flatMenus) {
      flatMenus.forEach((m) => {
        if (!m.code || !m.module) return;
        map[m.code.trim().toLowerCase()] = m.module;
      });
    }
    return map;
  }, [flatMenus]);

  const allowedModuleSet = useMemo(() => {
    if (tenantLoading && !tenant) return null;
    
    const splitRegex = /[,\n\r;]+/;
    const allItems = new Set<string>();

    const addModules = (str: string | null | undefined) => {
      if (!str) return;
      str.split(splitRegex).forEach((m) => {
        const val = m.trim().toLowerCase();
        if (val) allItems.add(val);
      });
    };

    // 1. Additive Source: Backend-calculated 'modules' array
    if (tenant?.modules && Array.isArray(tenant.modules)) {
      tenant.modules.forEach((m: string) => {
        const val = m.trim().toLowerCase();
        if (val) allItems.add(val);
      });
    }

    // 2. Additive Source: Tenant's individual template selection
    addModules(tenant?.menu_template_modules);

    // 3. SMART SYNC: Deep scan Template Items for module authorization
    const deepScanTemplate = (tpl: any) => {
      if (!tpl) return;
      // Many templates store items with individual module tagging or can be resolved via code
      const items = Array.isArray(tpl.items) ? tpl.items : [];
      items.forEach((item: any) => {
        if (item.code) {
           const mName = menuToModuleMap[item.code.trim().toLowerCase()];
           if (mName) allItems.add(mName.toLowerCase().trim());
        }
      });
      // Fallback: Check if the template has its own modules list string
      if (typeof tpl.modules === 'string') addModules(tpl.modules);
    };

    deepScanTemplate(planTemplate);
    deepScanTemplate(tenantTemplate);

    // 4. Additive Source: Template Name fallbacks
    if (tenant?.menu_template_name) { allItems.add(tenant.menu_template_name.toLowerCase()); }
    
    return allItems.size > 0 ? allItems : null;
  }, [tenant, tenantLoading, planTemplate, tenantTemplate, menuToModuleMap]);
  // Keep compatibility for the dynamic part which still uses 'menus' directly for grouped data
  const menus = rawMenusData;

  const { data: userMenuAccess } = useSWR<UserMenuAccessEntry[]>(
    currentUser && canFetchCompanyData
      ? `/tenants/self/users/${currentUser.id}/companies/${companyId}/menus`
      : null,
    (url: string) => api.get(url).then((res) => res.data),
    {
      refreshInterval: 3000,
      keepPreviousData: true,
    }
  );

  const accessLevelByMenuId = useMemo(() => {
    const map: Record<number, MenuAccessLevel> = {};
    if (userMenuAccess) {
      userMenuAccess.forEach((entry) => {
        map[entry.menu_id] = entry.access_level || 'deny';
      });
    }
    return map;
  }, [userMenuAccess]);

  const accessLevelByCode: Record<string, MenuAccessLevel> = useMemo(() => {
    const map: Record<string, MenuAccessLevel> = {};
    if (flatMenus) {
      flatMenus.forEach((m) => {
        if (!m.code) return;
        const level = accessLevelByMenuId[m.id];
        if (level) {
          const key = m.code.trim().toLowerCase();
          map[key] = level;
        }
      });
    }
    return map;
  }, [flatMenus, accessLevelByMenuId]);

  const visibilityByCode: Record<string, boolean> = useMemo(() => {
    const map: Record<string, boolean> = {};
    if (flatMenus) {
      flatMenus.forEach((m) => {
        if (!m.code) return;
        const key = m.code.trim().toLowerCase();
        map[key] = m.is_sidebar_visible !== false;
      });
    }
    return map;
  }, [flatMenus]);

  const getAccessLevel = useCallback((menuCode: string): MenuAccessLevel => {
    // System Admin bypasses everything
    if (isSystemAdmin) return 'full';

    const key = menuCode.trim().toLowerCase();
    if (key === "reports.employee_cost") return "read";
    // Per-company user menu row can be "deny" while template still lists Sales Person — keep page usable
    // for tenant admins and admin-like roles (incl. superadmin).
    if (isSalesPersonMasterMenuKey(key) && (isAdminLike || isTenantAdmin)) {
      const lvl = accessLevelByCode[key];
      if (lvl && lvl !== "deny") return lvl;
      return "full";
    }

    const level = accessLevelByCode[key];
    if (level) return level;

    // Fallback for Admins/TenantAdmins if no explicit setting
    if (isAdminLike || isTenantAdmin || userRoleLower === 'tenant') return 'full';

    // Default for regular users
    return 'deny';
  }, [isSystemAdmin, isSuperAdmin, isAdminLike, isTenantAdmin, userRoleLower, accessLevelByCode]);

  const isMenuAllowed = useCallback((menuCode: string, defaultAllowed: boolean = false): boolean => {
    // 0. System Admin and Tenant Admins bypass core tool restrictions
    if (isSystemAdmin) return true;

    const key = menuCode.trim().toLowerCase();

    // Deep Normalization helper to bridge naming gaps (e.g. 'menu template' vs 'menu_template')
    const normalize = (s: string) => s.toLowerCase().replace(/[\s\-_]/g, '');
    const normalizedKey = normalize(key);

    // Sales Person master: allow before deny check so route guards / page match `useMenuAccess` / superadmin UX.
    if (isSalesPersonMasterMenuKey(key) && (isAdminLike || isTenantAdmin || isSuperAdmin)) {
      return true;
    }

    // 1. Explicit Permission Check (Backend / Access Levels)
    const level = accessLevelByCode[key];
    if (level === 'deny') return false; 

    // 2. System Core Essentials (Always show for authorized admins)
    const systemEssentials = new Set([
      'dashboard', 'companies', 'select-company', 'logout', 'profile', 'change-password',
      'menu template', 'menu_template', 'menu templates', 'menu_templates', 'admin.menu_template', 'admin.menu_templates',
      'admin.platform_bookkeeping'
    ]);
    if (systemEssentials.has(key) && (isSystemAdmin || isSuperAdmin || isTenantAdmin || isAdminLike)) return true;

    // 2.5 Structural Menu Groups (Always allowed structurally, naturally pruned later if empty)
    const moduleName = menuToModuleMap[key];
    if (key.startsWith('group.') || moduleName === 'Menu Group') {
       return true;
    }

    // 2.6 Manufacturing migration bridge:
    // if manufacturing menus are present in the fetched tree, allow them even when
    // module-set metadata lags behind template/menu updates.
    if (key === 'manufacturing_erp' || key.startsWith('manufacturing.')) {
      const existsInTree = flatMenus.some((m) => String(m.code || '').trim().toLowerCase() === key);
      if (existsInTree) return true;
    }

      // 3. Module Identity & Combined Enforcement (Plan + Template)
      // Look up label for friendly matching (e.g. 'Menu Template' in plan matches 'Menu Templates' label)
      const menu = flatMenus.find(m => m.code.trim().toLowerCase() === key);
      const label = menu?.label?.trim();

      if (allowedModuleSet) {
        // 3a. Check if the MODULE is authorized (with normalization)
        if (moduleName) {
          const mName = moduleName.toLowerCase();
          const normMName = normalize(mName);
          if (allowedModuleSet.has(mName)) return true;
          
          for (const feature of Array.from(allowedModuleSet)) {
            const normFeature = normalize(feature);
            if (normMName.includes(normFeature) || normFeature.includes(normMName)) return true;
          }
        }
        
        // 3b. Check if the specific MENU CODE is authorized
        if (allowedModuleSet.has(key)) return true;

        // 3c. Deep Normalized Check for Code and Label
        if (label) {
          const normLabel = normalize(label);
          if (allowedModuleSet.has(label.toLowerCase())) return true;
          
          for (const feature of Array.from(allowedModuleSet)) {
             const normFeature = normalize(feature);
             if (normLabel.includes(normFeature) || normFeature.includes(normLabel)) return true;
             if (normalizedKey.includes(normFeature) || normFeature.includes(normalizedKey)) return true;
          }
        }

        return false;
      }

    // 4. Fallback: Trust the primary backend visibility flag if no set is loaded
    // OR if we are in Hybrid Fallback Mode (non-admin), where rawMenusData is already curated by the backend.
    const registryArray = Array.isArray(allRegistryMenus) ? allRegistryMenus : (allRegistryMenus as any)?.results;
    const isLibraryMissing = !registryArray || registryArray.length === 0;
    if (isLibraryMissing) {
      // If we are in fallback mode, we trust that if the menu is in our list, it is allowed.
      return visibilityByCode[key] === true || defaultAllowed;
    }

    return visibilityByCode[key] === true || defaultAllowed;
  }, [isSystemAdmin, isSuperAdmin, isAdminLike, isTenantAdmin, accessLevelByCode, allowedModuleSet, menuToModuleMap, flatMenus, visibilityByCode, allRegistryMenus]);

  const menuSearchItems = useMemo(() => {
    const map = new Map<string, { id: number | string; label: string; module?: string | null; code: string; href?: string | null }>();
    (flatMenus || []).forEach((m) => {
      const code = String(m.code || "").trim();
      if (!code) return;
      map.set(code.toLowerCase(), {
        id: m.id,
        label: m.label,
        module: m.module,
        code,
        href: companyId ? menuHrefFromCode(companyId, code) : null,
      });
    });
    const ensure = (code: string, label: string, module = "Manufacturing") => {
      const key = code.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: `virtual-${key}`,
          label,
          module,
          code,
          href: companyId ? menuHrefFromCode(companyId, code) : null,
        });
      }
    };
    ensure("reports.employee_cost", "Employee Cost Report", "Reports");
    ensure("accounting.masters.sales-persons", "Sales Person", "Accounting");
    ensure("manufacturing.dashboard", "Dashboard");
    ensure("manufacturing.bom_master", "BOM Master");
    ensure("manufacturing.production_order", "Production Order");
    ensure("manufacturing.material_issue", "Material Issue");
    ensure("manufacturing.wip", "Work In Progress");
    ensure("manufacturing.production_entry", "Production Entry");
    ensure("manufacturing.finished_goods_receive", "Finished Goods Receive");
    ensure("manufacturing.wastage_scrap", "Wastage / Scrap");
    ensure("manufacturing.production_costing", "Production Costing");
    ensure("manufacturing.reports", "Manufacturing Reports");
    ensure("manufacturing.ai_documents", "AI Documents");
    ensure("manufacturing.fg_journal_entry", "FG Journal Entry");

    const salesPersonKeys = [
      "accounting.masters.sales-persons",
      "accounting.masters.sales-person",
      "accounting.masters.sales_person",
      "accounting.masters.sales_persons",
    ];
    if (companyId) {
      const n = Number(companyId);
      if (Number.isFinite(n)) {
        const spHref = menuHrefFromCode(n, "accounting.masters.sales-persons");
        if (spHref) {
          for (const k of salesPersonKeys) {
            const cur = map.get(k);
            if (cur && !cur.href) {
              map.set(k, { ...cur, href: spHref });
            }
          }
        }
      }
    }

    return Array.from(map.values()).filter((m) => isMenuAllowed(m.code, true));
  }, [flatMenus, companyId, isMenuAllowed]);

  const isMenuKnown = useCallback((menuCode: string): boolean => {
    if (isSystemAdmin) return true;
    const key = menuCode.trim().toLowerCase();
    const hasExplicit = Object.prototype.hasOwnProperty.call(accessLevelByCode, key);
    if (hasExplicit) return true;

    if (isAdminLike || isTenantAdmin || userRoleLower === 'tenant') return true;
    return false;
  }, [isSuperAdmin, isAdminLike, isTenantAdmin, userRoleLower, accessLevelByCode]);

  const isMenuVisible = useCallback((menuCode: string, defaultAllowed: boolean = false): boolean => {
    // 0. System Admin shows all
    if (isSystemAdmin) return true;

    const key = menuCode.trim().toLowerCase();
    
    // 1. Permission Check First
    const isAllowed = isMenuAllowed(menuCode, defaultAllowed);
    if (!isAllowed) return false;

    // 2. Fallback Mode: For non-admins without registry access, if it's allowed, it's visible.
    const registryArray = Array.isArray(allRegistryMenus) ? allRegistryMenus : (allRegistryMenus as any)?.results;
    const isLibraryMissing = !registryArray || registryArray.length === 0;
    if (isLibraryMissing) return true;

    // 3. Visibility Check (strictly respect the flag unless system admin)
    const isExplicitlyHidden = visibilityByCode[key] === false;
    
    if (isExplicitlyHidden) return false;

    return true; 
  }, [isSystemAdmin, isSuperAdmin, isTenantAdmin, isMenuAllowed, visibilityByCode, menuToModuleMap, allRegistryMenus]);

  useEffect(() => {
    if (!companyId || !isCompanyContext || !menus) return;
    if (!userMenuAccess) return;
    if (isSuperAdmin) return;

    const path = pathname;

    const guards: { prefix: string; code: string }[] = [
      { prefix: `/companies/${companyId}/sales/invoices`, code: 'sales.invoice.list' },
      { prefix: `/companies/${companyId}/sales/orders`, code: 'sales.order.list' },
      { prefix: `/companies/${companyId}/sales/returns`, code: 'sales.return.list' },
      { prefix: `/companies/${companyId}/sales/customers`, code: 'sales.customers' },
      { prefix: `/companies/${companyId}/purchases/bills`, code: 'purchases.bill.list' },
      { prefix: `/companies/${companyId}/purchases/orders`, code: 'purchases.order.list' },
      { prefix: `/companies/${companyId}/purchases/returns`, code: 'purchases.return.list' },
      { prefix: `/companies/${companyId}/purchases/suppliers`, code: 'purchases.suppliers' },
      { prefix: `/companies/${companyId}/inventory/items`, code: 'inventory.items' },
      { prefix: `/companies/${companyId}/inventory/categories`, code: 'inventory.categories' },
      { prefix: `/companies/${companyId}/inventory/brands`, code: 'inventory.brands' },
      { prefix: `/companies/${companyId}/inventory/warehouses`, code: 'inventory.warehouses' },
      { prefix: `/companies/${companyId}/inventory/stock-transfers`, code: 'inventory.stock_transfers' },
      { prefix: `/companies/${companyId}/inventory/bom`, code: 'inventory.bom' },
      { prefix: `/companies/${companyId}/inventory/production-orders`, code: 'inventory.production_orders' },
      { prefix: `/companies/${companyId}/manufacturing`, code: 'manufacturing.dashboard' },
      { prefix: `/companies/${companyId}/ledgers`, code: 'accounting.masters.ledgers' },
      { prefix: `/companies/${companyId}/reports/trial-balance`, code: 'reports.trial_balance' },
      { prefix: `/companies/${companyId}/reports/ledger`, code: 'reports.ledger' },
      { prefix: `/companies/${companyId}/reports/daybook`, code: 'reports.daybook' },
      { prefix: `/companies/${companyId}/reports/balance-sheet`, code: 'reports.balance_sheet' },
      { prefix: `/companies/${companyId}/reports/profit-loss`, code: 'reports.pnl' },
      { prefix: `/companies/${companyId}/reports/items`, code: 'reports.stock' },
      { prefix: `/companies/${companyId}/reports/customers`, code: 'reports.customers' },
      { prefix: `/companies/${companyId}/reports/suppliers`, code: 'reports.suppliers' },
      { prefix: `/companies/${companyId}/reports/sales-purchase-summary`, code: 'reports.sales_summary' },
      { prefix: `/companies/${companyId}/reports/income-expense-summary`, code: 'reports.income_expense_summary' },
      { prefix: `/companies/${companyId}/reports/receivable-payable`, code: 'reports.receivable_payable' },
      { prefix: `/companies/${companyId}/reports/online-orders`, code: 'reports.online_orders' },
      { prefix: `/companies/${companyId}/reports/bom-transactions`, code: 'reports.bom_transactions' },
      { prefix: `/companies/${companyId}/sales/pos`, code: 'pos.billing' },
      { prefix: `/companies/${companyId}/sales/restaurant-pos`, code: 'sales.restaurant_pos' },
      { prefix: `/companies/${companyId}/vouchers`, code: 'accounting.voucher.payment' },
      { prefix: `/companies/${companyId}/sales-persons`, code: 'accounting.masters.sales-persons' },
      { prefix: `/companies/${companyId}/settings/payment-modes`, code: 'accounting.masters.payment-modes' },
      { prefix: `/companies/${companyId}/settings/company-defaults`, code: 'accounting.masters.payment-modes' },
      { prefix: `/companies/${companyId}/settings/cost-centers`, code: 'accounting.masters.payment-modes' },
      { prefix: `/companies/${companyId}/settings/departments`, code: 'accounting.masters.payment-modes' },
      { prefix: `/companies/${companyId}/settings/projects`, code: 'accounting.masters.payment-modes' },
      { prefix: `/companies/${companyId}/payroll`, code: 'payroll.dashboard' },
      { prefix: `/companies/${companyId}/delivery`, code: 'delivery.packages' },
      { prefix: `/companies/${companyId}/performance`, code: 'performance.dashboard' },
      { prefix: `/companies/${companyId}/resources`, code: 'resources.library' },
      { prefix: `/companies/${companyId}/tasks`, code: 'TASKS' },
    ];

    const guard = guards.find((g) => path.startsWith(g.prefix));
    if (guard && isMenuKnown(guard.code) && !isMenuAllowed(guard.code)) {
      if (typeof window !== 'undefined') {
        window.alert('You do not have permission to access this page.');
      }
      router.replace('/dashboard');
    }
  }, [
    companyId,
    pathname,
    isCompanyContext,
    isSuperAdmin,
    menus,
    userMenuAccess,
    router,
  ]);

  const [lookupOpen, setLookupOpen] = useState(false);
  const [menuSearchOpen, setMenuSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: any) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setMenuSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  const [lookupType, setLookupType] = useState<MasterSearchType>('customer');
  const [headerSearch, setHeaderSearch] = useState('');
  const [masterMenuType, setMasterMenuType] = useState('CUSTOMERS');
  const [voucherMenuType, setVoucherMenuType] = useState('PAYMENT');
  const [reportMenuType, setReportMenuType] = useState('TRIAL_BALANCE');
  const [voucherOpen, setVoucherOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [posOpen, setPosOpen] = useState(false);
  const [payrollOpen, setPayrollOpen] = useState(false);
  const [masterOpen, setMasterOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [misReportsOpen, setMisReportsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('sidebar_collapsed');
    if (saved === 'true') setIsSidebarCollapsed(true);
  }, []);

  const toggleSidebarCollapse = () => {
    const newVal = !isSidebarCollapsed;
    setIsSidebarCollapsed(newVal);
    localStorage.setItem('sidebar_collapsed', String(newVal));
  };
  const [pendingOrdersOpen, setPendingOrdersOpen] = useState(false);
  const [isUpdatingChart, setIsUpdatingChart] = useState(false);
  const [updateChartMessage, setUpdateChartMessage] = useState<string | null>(null);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [calculatorValue, setCalculatorValue] = useState('');

  const handleCreateMaster = () => {
    if (!companyId) return;

    if (masterMenuType === 'LEDGERS') {
      router.push(`/companies/${companyId}/ledgers`);
    } else if (masterMenuType === 'CUSTOMERS') {
      router.push(`/companies/${companyId}/sales/customers`);
    } else if (masterMenuType === 'SUPPLIERS') {
      router.push(`/companies/${companyId}/purchases/suppliers`);
    } else if (masterMenuType === 'ITEMS') {
      router.push(`/companies/${companyId}/inventory/items`);
    } else if (masterMenuType === 'CATEGORIES') {
      router.push(`/companies/${companyId}/inventory/categories`);
    } else if (masterMenuType === 'SUBCATEGORIES') {
      router.push(`/companies/${companyId}/inventory/subcategories`);
    } else if (masterMenuType === 'BRANDS') {
      router.push(`/companies/${companyId}/inventory/brands`);
    } else if (masterMenuType === 'WAREHOUSES') {
      router.push(`/companies/${companyId}/inventory/warehouses`);
    }
  };

  const lookupRecords = useMemo(() => {
    if (lookupType === 'customer') return dashCustomers || [];
    if (lookupType === 'ledger') return dashLedgers || [];
    if (lookupType === 'supplier') return dashSuppliers || [];
    if (lookupType === 'item') return dashItems || [];
    if (lookupType === 'category') return (dashCategories as any[]) || [];
    if (lookupType === 'subcategory') return (dashSubcategories as any[]) || [];
    if (lookupType === 'brand') return (dashBrands as any[]) || [];
    if (lookupType === 'warehouse') return (dashWarehouses as any[]) || [];
    return [];
  }, [lookupType, dashCustomers, dashLedgers, dashSuppliers, dashItems, dashCategories, dashSubcategories, dashBrands, dashWarehouses]);

  const handleLookupSelect = (record: any) => {
    setLookupOpen(false);
    if (!companyId) return;

    if (lookupType === 'customer') {
      router.push(`/companies/${companyId}/sales/customers`);
      return;
    }
    if (lookupType === 'supplier') {
      router.push(`/companies/${companyId}/purchases/suppliers`);
      return;
    }
    if (lookupType === 'ledger') {
      router.push(`/companies/${companyId}/ledgers`);
      return;
    }
    if (lookupType === 'item') {
      router.push(`/companies/${companyId}/inventory/items`);
      return;
    }
    if (lookupType === 'category') {
      router.push(`/companies/${companyId}/inventory/categories`);
      return;
    }
    if (lookupType === 'subcategory') {
      router.push(`/companies/${companyId}/inventory/subcategories`);
      return;
    }
    if (lookupType === 'brand') {
      router.push(`/companies/${companyId}/inventory/brands`);
      return;
    }
    if (lookupType === 'warehouse') {
      router.push(`/companies/${companyId}/inventory/warehouses`);
      return;
    }
  };

  const { data: notifications, mutate: mutateNotifications } = useSWR<NotificationRecord[]>(
    canFetchCompanyData
      ? `/notifications/companies/${companyId}/notifications?unread_only=true`
      : null,
    (url: string) => api.get(url).then((res) => res.data),
    {
      refreshInterval: 30000,
    }
  );

  const unreadCount = notifications?.length || 0;

  const tasksLastSeenKey = useMemo(() => {
    const uid = currentUser?.id;
    if (!companyId || !uid) return null;
    return `tasks:lastSeen:${companyId}:${uid}`;
  }, [companyId, currentUser?.id]);

  const [tasksLastSeenAt, setTasksLastSeenAt] = useState<number>(0);

  useEffect(() => {
    if (!tasksLastSeenKey) return;
    try {
      const raw = window.localStorage.getItem(tasksLastSeenKey);
      const n = raw ? Number(raw) : 0;
      setTasksLastSeenAt(Number.isFinite(n) ? n : 0);
    } catch {
      setTasksLastSeenAt(0);
    }
  }, [tasksLastSeenKey]);

  const { data: taskNotifTasks } = useSWR<any>(
    canFetchCompanyData ? `/companies/${companyId}/tasks?sort=updated_desc&skip=0&limit=50` : null,
    (url: string) => api.get(url).then((res) => res.data),
    {
      refreshInterval: 30000,
    }
  );

  const newAssignedTasksCount = useMemo(() => {
    const uid = currentUser?.id;
    const results = taskNotifTasks?.results;
    if (!uid || !Array.isArray(results)) return 0;

    let c = 0;
    for (const t of results) {
      const assigned = t?.assignee_id === uid || (Array.isArray(t?.assignees) && t.assignees.some((a: any) => a?.id === uid));
      if (!assigned) continue;

      const ts = t?.updated_at ? Date.parse(t.updated_at) : NaN;
      if (!Number.isFinite(ts)) continue;
      if (tasksLastSeenAt && ts <= tasksLastSeenAt) continue;
      c += 1;
    }
    return c;
  }, [currentUser?.id, taskNotifTasks, tasksLastSeenAt]);

  const adminTasksLastSeenKey = useMemo(() => {
    const uid = currentUser?.id;
    if (!companyId || !uid) return null;
    return `tasks:admin:lastSeen:${companyId}:${uid}`;
  }, [companyId, currentUser?.id]);

  const [adminTasksLastSeenAt, setAdminTasksLastSeenAt] = useState<number>(0);

  useEffect(() => {
    if (!adminTasksLastSeenKey) return;
    try {
      const raw = window.localStorage.getItem(adminTasksLastSeenKey);
      const n = raw ? Number(raw) : 0;
      setAdminTasksLastSeenAt(Number.isFinite(n) ? n : 0);
    } catch {
      setAdminTasksLastSeenAt(0);
    }
  }, [adminTasksLastSeenKey]);

  const adminTaskActivityCount = useMemo(() => {
    const uid = currentUser?.id;
    const results = taskNotifTasks?.results;
    if (!uid || !Array.isArray(results)) return 0;

    let c = 0;
    for (const t of results) {
      if (t?.created_by_id !== uid) continue;

      const assignedToSomeoneElse =
        (typeof t?.assignee_id === 'number' && t.assignee_id !== uid) ||
        (Array.isArray(t?.assignees) && t.assignees.some((a: any) => a?.id && a.id !== uid));
      if (!assignedToSomeoneElse) continue;

      const ts = t?.updated_at ? Date.parse(t.updated_at) : NaN;
      if (!Number.isFinite(ts)) continue;
      if (adminTasksLastSeenAt && ts <= adminTasksLastSeenAt) continue;
      c += 1;
    }
    return c;
  }, [adminTasksLastSeenAt, currentUser?.id, taskNotifTasks]);

  const tasksNotificationCount = useMemo(() => {
    const isAdminViewer = Boolean(permissionsCtx.isTenantAdmin || isSuperAdmin);
    if (isAdminViewer) return newAssignedTasksCount + adminTaskActivityCount;
    return newAssignedTasksCount;
  }, [adminTaskActivityCount, isSuperAdmin, newAssignedTasksCount, permissionsCtx.isTenantAdmin]);

  const [lastTaskNotifCount, setLastTaskNotifCount] = useState<number>(0);
  const [taskNotifPrimed, setTaskNotifPrimed] = useState(false);

  useEffect(() => {
    if (!companyId || !currentUser?.id) return;

    if (!taskNotifPrimed) {
      setLastTaskNotifCount(tasksNotificationCount);
      setTaskNotifPrimed(true);
      return;
    }

    if (tasksNotificationCount > lastTaskNotifCount) {
      const delta = tasksNotificationCount - lastTaskNotifCount;
      showToast({
        variant: "success",
        title: "New task activity",
        description: delta === 1 ? "You have 1 new task notification." : `You have ${delta} new task notifications.`,
      });
    }

    setLastTaskNotifCount(tasksNotificationCount);
  }, [companyId, currentUser?.id, lastTaskNotifCount, showToast, taskNotifPrimed, tasksNotificationCount]);

  const markTasksSeenAndOpen = () => {
    if (!companyId) return;
    const now = Date.now();
    if (tasksLastSeenKey) {
      try {
        window.localStorage.setItem(tasksLastSeenKey, String(now));
      } catch {
        // ignore
      }
    }
    if (adminTasksLastSeenKey) {
      try {
        window.localStorage.setItem(adminTasksLastSeenKey, String(now));
      } catch {
        // ignore
      }
    }
    setTasksLastSeenAt(now);
    setAdminTasksLastSeenAt(now);
    router.push(`/companies/${companyId}/tasks`);
  };

  const extractErrorMessage = (detail: any, fallback: string): string => {
    if (!detail) return fallback;

    if (Array.isArray(detail)) {
      return detail
        .map((e: any) => {
          if (typeof e === 'string') return e;
          if (e?.msg) return e.msg;
          try {
            return JSON.stringify(e);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join('; ');
    }

    if (typeof detail === 'string') return detail;
    if (detail?.msg) return detail.msg;

    try {
      if (typeof detail === 'object') {
        return JSON.stringify(detail);
      }
    } catch {
      // ignore
    }

    return fallback;
  };

  const handleNotificationClick = async (n: NotificationRecord) => {
    if (!companyId) return;

    let target: string | null = null;
    if (n.type === 'SALES_ORDER_CREATED') {
      target = `/companies/${companyId}/sales/orders/${n.order_id}`;
    } else if (n.type === 'PURCHASE_ORDER_CREATED') {
      target = `/companies/${companyId}/purchases/orders/${n.order_id}`;
    } else if (n.type === 'TASK_ASSIGNED' || n.type === 'TASK_COMPLETED') {
      target = `/companies/${companyId}/tasks?taskId=${n.task_id}`;
    }

    try {
      await markNotificationRead(companyId, n.id);
      await mutateNotifications();
    } catch (err) {
      // ignore for now; UI will retry on next poll
    }

    if (target) {
      router.push(target);
      setNotificationsOpen(false);
    }
  };

  const { data: openSalesOrders } = useSWR<SalesOrderSummary[]>(
    canFetchCompanyData ? `/orders/companies/${companyId}/orders/sales?status=OPEN` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const { data: openPurchaseOrders } = useSWR<
    PurchaseOrderSummary[]
  >(
    canFetchCompanyData ? `/orders/companies/${companyId}/orders/purchase?status=OPEN` : null,
    (url: string) => api.get(url).then((res) => res.data)
  );

  const handleConvertSalesOrderHeader = async (order: SalesOrderSummary) => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/sales/orders/${order.id}`);
    setPendingOrdersOpen(false);
  };

  const handleConvertPurchaseOrderHeader = async (order: PurchaseOrderSummary) => {
    if (!companyId) return;
    router.push(`/companies/${companyId}/purchases/orders/${order.id}`);
    setPendingOrdersOpen(false);
  };

  const handleVoucherGo = () => {
    if (!companyId) return;

    if (
      voucherMenuType === 'PAYMENT' ||
      voucherMenuType === 'RECEIPT' ||
      voucherMenuType === 'CONTRA' ||
      voucherMenuType === 'JOURNAL' ||
      voucherMenuType === 'PURCHASE_ORDER' ||
      voucherMenuType === 'SALES_ORDER'
    ) {
      router.push(`/companies/${companyId}/vouchers?type=${voucherMenuType}`);
    } else if (voucherMenuType === 'PURCHASE') {
      router.push(`/companies/${companyId}/purchases/bills`);
    } else if (voucherMenuType === 'SALES') {
      router.push(`/companies/${companyId}/sales/invoices`);
    }
  };

  const handleReportGo = () => {
    if (!companyId) return;

    if (reportMenuType === 'TRIAL_BALANCE') {
      router.push(`/companies/${companyId}/reports/trial-balance`);
    } else if (reportMenuType === 'LEDGER') {
      router.push(`/companies/${companyId}/reports/ledger`);
    } else if (reportMenuType === 'DAYBOOK') {
      router.push(`/companies/${companyId}/reports/daybook`);
    } else if (reportMenuType === 'BALANCE_SHEET') {
      router.push(`/companies/${companyId}/reports/balance-sheet`);
    } else if (reportMenuType === 'PROFIT_LOSS') {
      router.push(`/companies/${companyId}/reports/profit-loss`);
    } else if (reportMenuType === 'STOCK_ITEMS') {
      router.push(`/companies/${companyId}/reports/items`);
    } else if (reportMenuType === 'REPORT_CUSTOMERS') {
      router.push(`/companies/${companyId}/reports/customers`);
    } else if (reportMenuType === 'REPORT_SUPPLIERS') {
      router.push(`/companies/${companyId}/reports/suppliers`);
    } else if (reportMenuType === 'SALES_PURCHASE_REGISTER') {
      router.push(`/companies/${companyId}/reports/sales-purchase-summary`);
    } else if (reportMenuType === 'INCOME_EXPENSE_SUMMARY') {
      router.push(`/companies/${companyId}/reports/income-expense-summary`);
    } else if (reportMenuType === 'RECEIVABLE_PAYABLE') {
      router.push(`/companies/${companyId}/reports/receivable-payable`);
    } else if (reportMenuType === 'ONLINE_ORDERS') {
      router.push(`/companies/${companyId}/reports/online-orders`);
    } else if (reportMenuType === 'FIXED_ASSETS') {
      router.push(`/companies/${companyId}/reports/fixed-assets`);
    } else if (reportMenuType === 'SALES_INCENTIVE') {
      router.push(`/companies/${companyId}/reports/sales-incentive`);
    }
  };

  const showTasks = false;

  const companyMenusByModule = useMemo(() => {
    const byId = new Map<number, MenuRead>();
    (flatMenus || []).forEach((m) => {
      if (typeof m?.id !== 'number') return;
      if (!byId.has(m.id)) byId.set(m.id, m);
    });

    const list = Array.from(byId.values()).filter((m) => isMenuAllowed(m.code));
    list.sort((a, b) => {
      const modA = String(a.module || '').toLowerCase();
      const modB = String(b.module || '').toLowerCase();
      if (modA !== modB) return modA.localeCompare(modB);
      const orderA = a.sort_order ?? 0;
      const orderB = b.sort_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return (a.id || 0) - (b.id || 0);
    });

    const groups: Record<string, MenuRead[]> = {};
    for (const m of list) {
      const key = (String(m.module || 'Other').trim() || 'Other').toUpperCase();
      if (!groups[key]) groups[key] = [];
      groups[key].push(m);
    }
    return groups;
  }, [menus, isMenuAllowed]);

  const companyMenusChildrenByParentId = useMemo(() => {
    const map = new Map<number | null, MenuRead[]>();
    const byId = new Map<number, MenuRead>();
    (flatMenus || []).forEach((m) => {
      if (typeof m?.id !== 'number') return;
      if (!byId.has(m.id)) byId.set(m.id, m);
    });

    Array.from(byId.values()).forEach((m) => {
      const key = m.parent_id ?? null;
      const arr = map.get(key) || [];
      arr.push(m);
      map.set(key, arr);
    });
    for (const [key, arr] of map.entries()) {
      arr.sort((a, b) => {
        const orderA = a.sort_order ?? 0;
        const orderB = b.sort_order ?? 0;
        if (orderA !== orderB) return orderA - orderB;
        return (a.id || 0) - (b.id || 0);
      });
      map.set(key, arr);
    }
    return map;
  }, [menus]);

  // Top-level sidebar entries are always visible for all users
  const showSettingsPlan = true; // My Plan
  const showSettingsUsers = true; // User
  const showSettingsMenuPermissions = isMenuPermissionsFeatureEnabled({
    companyId,
    currentUser,
  }); // Menu Permissions

  const showCompanySettings =
    isMenuVisible('settings.company') ||
    isMenuVisible('settings.language') ||
    isMenuVisible('settings.currency') ||
    isMenuVisible('settings.calendar') ||
    isMenuVisible('settings.inventory_valuation') ||
    isMenuVisible('settings.duty_taxes');

  const showDeliveryMenu =
    isMenuVisible('delivery.places') ||
    isMenuVisible('delivery.partners') ||
    isMenuVisible('delivery.packages');

  const showPosMenu = isMenuVisible('pos.billing');

  const showPayrollMenu =
    isMenuVisible('payroll.dashboard') ||
    isMenuVisible('payroll.employees') ||
    isMenuVisible('payroll.payheads') ||
    isMenuVisible('payroll.shifts') ||
    isMenuVisible('payroll.shift_assignments') ||
    isMenuVisible('payroll.devices') ||
    isMenuVisible('payroll.device_users') ||
    isMenuVisible('payroll.attendance') ||
    isMenuVisible('payroll.leave') ||
    isMenuVisible('payroll.pay_structures') ||
    isMenuVisible('payroll.runs');

  const activeCompanyMenuModule = useMemo(() => {
    if (!companyId) return null as string | null;
    for (const [module, moduleMenus] of Object.entries(companyMenusByModule)) {
      for (const m of moduleMenus) {
        const href = menuHrefFromCode(companyId, m.code);
        if (!href) continue;
        if (pathname === href || pathname.startsWith(href + '/')) {
          return module;
        }
      }
    }
    return null;
  }, [companyId, companyMenusByModule, pathname]);

  const [expandedCompanyMenuModule, setExpandedCompanyMenuModule] = useState<string | null>(null);

  useEffect(() => {
    setExpandedCompanyMenuModule(activeCompanyMenuModule);
  }, [activeCompanyMenuModule]);

  const isStorePage = pathname.startsWith('/store');

  // ── Hydration-safe token check ──────────────────────────────────────────────
  // Always start with `true` on both server and client so the SSR HTML matches
  // the initial client render. After hydration the effect corrects the value.
  const [hasToken, setHasToken] = useState(true);
  useEffect(() => {
    setHasToken(!!getToken());
  }, [pathname]);

  if (isAuthPage || isStorePage || pathname === '/' || !hasToken) {
    return (
      <CalendarSettingsProvider>
        <main className="min-h-screen bg-slate-100">{children}</main>
      </CalendarSettingsProvider>
    );
  }

  if (isAdminPage) {
    if (userLoading || !currentUser) {
      return (
        <main className="min-h-screen flex items-center justify-center bg-slate-100">
          <div className="text-sm text-slate-500">Loading...</div>
        </main>
      );
    }

    if (!isAdminLike) {
      router.replace('/dashboard');
      return null;
    }

    if (isTenantAdmin && !isSuperAdmin) {
      const tenantIdRaw = (currentUser as any)?.tenant_id;
      const tenantIdStr = tenantIdRaw == null ? '' : String(tenantIdRaw);
      const tenantIdNum = tenantIdStr ? Number(tenantIdStr) : NaN;
      const tenantIdOk = Number.isFinite(tenantIdNum) && tenantIdNum > 0;

      const isAllowedTenantAdminRoute =
        pathname === '/admin' ||
        (tenantIdOk && pathname.startsWith(`/admin/tenants/${tenantIdStr}/backup-restore`));

      const isAllowedImportDashboardRoute = pathname === '/admin/import' || pathname.startsWith('/admin/import/');

      if (
        !isAllowedTenantAdminRoute &&
        !isAllowedImportDashboardRoute
      ) {
        router.replace('/admin');
        return null;
      }
    }
  }

  return (
    <MenuPermissionsProvider
      getAccessLevel={getAccessLevel}
      isMenuAllowed={(code) => isMenuAllowed(code)}
    >
      <div className="min-h-screen flex bg-background-light text-slate-900 dark:bg-background-dark dark:text-slate-100">

        <aside className={`${isSidebarCollapsed ? "w-16" : "w-56"} bg-slate-950/85 text-slate-100 flex flex-col border-r border-border-dark/70 shadow-xl backdrop-blur-md group transition-all duration-300 ease-in-out`}>
          <div className="w-full bg-slate-900 px-4 py-4 border-b border-border-dark/50 flex items-center justify-between">
            {!isSidebarCollapsed && (
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-black shadow-lg ring-1 ring-white/20">P</div>
                <span className="text-sm font-bold tracking-tight text-white uppercase text-indigo-400">Prixna ERP Pro</span>
              </div>
            )}
            {isSidebarCollapsed && (
              <div className="h-7 w-7 rounded bg-indigo-600 flex items-center justify-center text-[10px] font-black shadow-lg ring-1 ring-white/20 mx-auto">P</div>
            )}
            <button 
              onClick={toggleSidebarCollapse}
              className="hidden md:flex p-1 rounded-lg hover:bg-slate-800 text-slate-400 transition-colors ml-auto"
              title={isSidebarCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
            >
              <svg className={`w-4 h-4 transform transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>
          </div>
          <div className={`px-4 py-2 font-semibold text-lg border-b border-border-dark tracking-wide flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-end"} gap-2 relative`}>
            <div className={`flex items-center gap-1.5 ${isSidebarCollapsed ? "flex-col" : ""}`}>
              {isMenuAllowed('header.calculator') && (
                <button
                  type="button"
                  onClick={() => setCalculatorOpen((open) => !open)}
                  className="text-xs h-7 w-7 rounded-full bg-slate-900/40 hover:bg-slate-800 border border-slate-700 flex items-center justify-center"
                  title="Calculator"
                >
                  <span role="img" aria-label="calculator">
                    🧮
                  </span>
                </button>
              )}
              {isMenuAllowed('header.theme_toggle') && (
                <button
                  type="button"
                  onClick={toggleTheme}
                  className="text-xs h-7 w-7 rounded-full bg-slate-900/40 hover:bg-slate-800 border border-slate-700 flex items-center justify-center"
                  title="Toggle Theme"
                >
                  {theme === 'dark' ? '🌙' : '☀️'}
                </button>
              )}
              <div className="flex items-center gap-2">
                {isMenuAllowed('header.notifications') && (
                  <button
                    type="button"
                    className="relative text-xs h-7 w-7 rounded-full hover:bg-slate-800 flex items-center justify-center"
                    onClick={() => setNotificationsOpen((o) => !o)}
                    title="Notifications"
                  >
                    🔔
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-red-500 text-[9px] text-white rounded-full px-1">
                        {unreadCount}
                      </span>
                    )}
                  </button>
                )}

                {isMenuAllowed('TASKS') && (
                  <button
                    type="button"
                    className="relative text-xs h-7 w-7 rounded-full hover:bg-slate-800 flex items-center justify-center"
                    onClick={markTasksSeenAndOpen}
                    disabled={!companyId}
                    title="Task notifications"
                  >
                    🔔
                    {tasksNotificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 bg-amber-500 text-[9px] text-white rounded-full px-1">
                        {tasksNotificationCount}
                      </span>
                    )}
                  </button>
                )}

                {isMenuAllowed('header.pending_orders') && (
                  <button
                    type="button"
                    className="relative text-xs h-7 w-7 rounded-full hover:bg-slate-800 flex items-center justify-center"
                    onClick={() => setPendingOrdersOpen((o) => !o)}
                    disabled={!companyId}
                    title="Order notifications"
                  >
                    🔔
                    {((openSalesOrders?.length ?? 0) + (openPurchaseOrders?.length ?? 0)) > 0 && (
                      <span className="absolute -top-1 -right-1 bg-amber-500 text-[9px] text-white rounded-full px-1">
                        {(openSalesOrders?.length ?? 0) + (openPurchaseOrders?.length ?? 0)}
                      </span>
                    )}
                  </button>
                )}
              </div>
            </div>

            {calculatorOpen && (
              <div className={`absolute ${isSidebarCollapsed ? "left-14" : "left-2"} top-12 z-40 w-56 min-h-[260px] rounded-2xl border border-slate-700 bg-slate-900 text-xs shadow-2xl p-3.5 flex flex-col`}>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <input
                    className="flex-1 rounded border border-slate-700 bg-slate-950 px-2 py-1.5 text-right text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    value={calculatorValue}
                    onChange={(e) => setCalculatorValue(e.target.value)}
                    placeholder="0"
                  />
                  <button
                    type="button"
                    className="px-1.5 py-1.5 rounded border border-red-700 bg-slate-900 text-[10px] text-red-300 hover:bg-red-900/60"
                    onClick={() => setCalculatorValue('')}
                  >
                    C
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-1.5 text-sm">
                  {['7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'].map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="rounded-lg border border-slate-700 bg-slate-800 px-2 py-1.5 text-center hover:bg-slate-700 text-sm"
                      onClick={() => {
                        if (key === '=') {
                          try {
                            // eslint-disable-next-line no-new-func
                            const fn = new Function(`return (${calculatorValue || '0'})`);
                            const result = fn();
                            setCalculatorValue(String(result ?? ''));
                          } catch {
                            setCalculatorValue('');
                          }
                        } else {
                          setCalculatorValue((prev) => prev + key);
                        }
                      }}
                    >
                      {key}
                    </button>
                  ))}
                </div>
                <div className="flex justify-end pt-1 mt-auto">
                  <button
                    type="button"
                    className="text-[10px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:bg-slate-800"
                    onClick={() => setCalculatorOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            )}
          </div>
          {!currentCompany && (
            <Sidebar 
              open={sidebarOpen} 
              onClose={() => setSidebarOpen(false)} 
              isCollapsed={isSidebarCollapsed}
              rawMenusData={rawMenusData}
            />
          )}
          <div className="flex-1 flex text-base relative">
            {/* Hover strip + left nav group */}
            <div className="relative group/left">
              {/* Visible border strip that triggers the left nav on hover */}
              <div className="h-full w-[10px] bg-border-dark/60 cursor-pointer" />

              {/* Left main nav: slides in from the left when hovering the strip or itself */}
              <nav className="absolute inset-y-0 left-0 z-20 w-44 px-3 py-4 space-y-2 overflow-y-auto text-base bg-black border border-white/5 rounded-r-2xl shadow-[0_0_30px_rgba(0,0,0,0.8)] transform -translate-x-full group-hover/left:translate-x-0 transition-all duration-300">
                <Link
                  href="/dashboard"
                  className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-2 rounded-md text-slate-100 hover:bg-amber-400/90 hover:text-white transition-colors`}
                  title={isSidebarCollapsed ? "Dashboard" : ""}
                >
                  {isSidebarCollapsed ? "📊" : "📊 Dashboard"}
                </Link>
                <Link
                  href="/companies"
                  className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-2 rounded-md text-slate-100 hover:bg-amber-400/90 hover:text-white transition-colors`}
                  title={isSidebarCollapsed ? "Companies" : ""}
                >
                  {isSidebarCollapsed ? "🏢" : "🏢 Companies"}
                </Link>
                <Link
                  href="/settings/plan"
                  className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-2 rounded-md text-slate-100 hover:bg-amber-400/90 hover:text-white transition-colors`}
                  title={isSidebarCollapsed ? "My Plan" : ""}
                >
                  {isSidebarCollapsed ? "📦" : "📦 My Plan"}
                </Link>
                <Link
                  href="/settings/users"
                  className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-2 rounded-md text-slate-100 hover:bg-amber-400/90 hover:text-white transition-colors`}
                  title={isSidebarCollapsed ? "User" : ""}
                >
                  {isSidebarCollapsed ? "👤" : "👤 User"}
                </Link>
                {permissionsCtx.isTenantAdmin && !isSuperAdmin && (
                  <div className="mt-4 border-t border-border-dark pt-3 text-[11px]">
                    <div className="px-3 mb-2 text-sm font-semibold text-slate-50">
                      Tools : Main Menu
                    </div>
                    <div className="space-y-1">
                      {currentUser?.tenant_id != null && isMenuAllowed('sidebar.nav.backup') && (
                        <Link
                          href={`/admin/tenants/${currentUser.tenant_id}/backup-restore`}
                          className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors`}
                        >
                          💾 Backup &amp; Restore
                        </Link>
                      )}
                      {currentUser?.tenant_id != null && isMenuAllowed('sidebar.nav.import') && (
                        <Link
                          href="/admin/import"
                          className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors`}
                        >
                          🔁 Import Dashboard
                        </Link>
                      )}
                      <Link
                        href="/settings/menu-permissions"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors`}
                      >
                        🔐 Menu Permissions
                      </Link>
                    </div>
                  </div>
                )}
                {(isSuperAdmin || isGhostAdmin) && (
                  <div className={`mt-4 border-t border-border-dark pt-3 text-[11px]`}>
                    {!isSidebarCollapsed && <div className="px-3 mb-2 text-sm font-semibold text-slate-50 text-center uppercase tracking-wider">Superadmin</div>}
                    <div className="space-y-1">
                      <Link
                        href="/admin/ghost"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1.5 rounded-md text-base font-semibold text-white hover:bg-emerald-500/20 hover:text-emerald-400 transition-colors`}
                        title={isSidebarCollapsed ? "Ghost Dashboard" : ""}
                        style={{ 
                          background: isSidebarCollapsed ? "" : "linear-gradient(135deg, rgba(16,185,129,0.15), rgba(0,0,0,0.4))", 
                          border: isSidebarCollapsed ? "" : "1px solid rgba(16,185,129,0.2)" 
                        }}
                      >
                        {isSidebarCollapsed ? "👻" : "👻 Ghost Dashboard"}
                      </Link>
                      {ghostCompanyId && (
                        <Link
                          href="/admin/ghost-redirect"
                          className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1.5 rounded-md text-base font-semibold text-white hover:bg-sky-500/20 hover:text-sky-400 transition-colors mt-1`}
                          title={isSidebarCollapsed ? "Platform Books" : ""}
                          style={{ 
                            background: isSidebarCollapsed ? "" : "linear-gradient(135deg, rgba(14,165,233,0.15), rgba(0,0,0,0.4))", 
                            border: isSidebarCollapsed ? "" : "1px solid rgba(14,165,233,0.2)" 
                          }}
                        >
                          {isSidebarCollapsed ? "🧮" : "🧮 Platform Books"}
                        </Link>
                      )}
                      <Link
                        href="/admin"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1.5 rounded-md text-base text-slate-100 hover:bg-amber-400/90 hover:text-white transition-colors`}
                        title={isSidebarCollapsed ? "Home" : ""}
                      >
                        {isSidebarCollapsed ? "🏠" : "🏠 Home"}
                      </Link>
                      <Link
                        href="/admin/tenants"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-amber-400/90 hover:text-white`}
                        title={isSidebarCollapsed ? "Tenants" : ""}
                      >
                        {isSidebarCollapsed ? "🌐" : "🌐 Tenants"}
                      </Link>
                      <Link
                        href="/admin/backup-restore"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-amber-400/90 hover:text-white`}
                        title={isSidebarCollapsed ? "Company Backup & Restore" : ""}
                      >
                        {isSidebarCollapsed ? "💾" : "💾 Company Backup & Restore"}
                      </Link>
                      <Link
                        href="/admin/menu-templates"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-amber-400/90 hover:text-white`}
                        title={isSidebarCollapsed ? "Menu Templates" : ""}
                      >
                        {isSidebarCollapsed ? "🧩" : "🧩 Menu Templates"}
                      </Link>
                      {showSettingsMenuPermissions && (
                        <Link
                          href="/settings/menu-permissions"
                          className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-amber-400/90 hover:text-white`}
                          title={isSidebarCollapsed ? "Menu Permissions" : ""}
                        >
                          {isSidebarCollapsed ? "🧩" : "🧩 Menu Permissions"}
                        </Link>
                      )}
                      <Link
                        href="/admin/records"
                        className={`block ${isSidebarCollapsed ? "text-center" : "px-3"} py-1 rounded text-base text-slate-200 hover:bg-amber-400/90 hover:text-white`}
                        title={isSidebarCollapsed ? "Records" : ""}
                      >
                        {isSidebarCollapsed ? "📑" : "📑 Records"}
                      </Link>
                    </div>
                  </div>
                )}
              </nav>
            </div>

            {currentCompany && (
              <nav className={`flex-1 ${isSuperAdmin ? "px-3" : "px-0"} py-4 space-y-4 overflow-y-auto border-l border-white/5 bg-black text-base shadow-[0_0_40px_rgba(0,0,0,1)] rounded-l-2xl`}>
                <div className="pb-3 px-1.5">
                  <div className={`flex items-center ${isSidebarCollapsed ? "justify-center" : "justify-between"} gap-3 rounded-2xl border border-white/5 bg-white/5 px-3 py-2 shadow-sm`}>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 flex items-center justify-center rounded-full bg-sky-500 text-white text-sm font-semibold shadow-sm" title={currentCompany.name}>
                        🏢
                      </div>
                      {!isSidebarCollapsed && (
                        <div className="flex flex-col min-w-0">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Current company</span>
                          <span
                            className="text-sm font-semibold text-white truncate"
                            title={currentCompany.name}
                          >
                            {currentCompany.name}
                          </span>
                        </div>
                      )}
                    </div>
                    {!isSidebarCollapsed && (
                      <div className="relative flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setCompanyMenuOpen((open) => !open)}
                          className="px-2.5 py-1 rounded-full border border-white/10 bg-white/5 text-[11px] font-medium text-slate-200 hover:bg-white/10 shadow-sm"
                        >
                          Menu ▾
                        </button>
                        {companyMenuOpen && (
                          <div className="absolute right-0 mt-1 w-44 rounded-lg border border-slate-800 bg-slate-950 text-xs shadow-xl overflow-hidden">
                            <button
                              type="button"
                              onClick={handleGoDashboard}
                              className="w-full flex items-center justify-between px-3 py-2 text-slate-100 hover:bg-slate-800/90"
                            >
                              <span>Dashboard</span>
                              <span className="text-[10px] text-slate-400">Go</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleSelectCompany}
                              className="w-full flex items-center justify-between px-3 py-2 text-slate-100 hover:bg-slate-800/90 border-t border-slate-800/80"
                            >
                              <span>Select Company</span>
                              <span className="text-[10px] text-slate-400">List</span>
                            </button>
                            <button
                              type="button"
                              onClick={handleCloseCompany}
                              className="w-full flex items-center justify-between px-3 py-2 text-red-300 hover:bg-red-900/60 border-t border-slate-800/80"
                            >
                              <span>Close Company</span>
                              <span className="text-[10px] text-red-500">Exit</span>
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-2 px-1.5">

                  {companyId && rawMenusData && (
                    <DynamicCompanyMenu 
                      companyId={companyId} 
                      rawGroups={(() => {
                        if (rawMenusData.length === 0) return [];
                        if ((rawMenusData[0] as any).items) return rawMenusData; // Already grouped
                        
                        // Otherwise, group ROOT items exactly like Sidebar.tsx does
                        const moduleMap = new Map<string, any[]>();
                        rawMenusData.forEach((rootItem: any) => {
                          let mod = rootItem.module || "General";
                          const isGroup = (rootItem.module === "Menu Group" || (rootItem.code && rootItem.code.startsWith('group.')));
                          
                          // Give first priority to the nested group's name (Container label).
                          // If not available, fallback to the default parent group (child's module).
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

                        return Array.from(moduleMap.entries()).map(([moduleName, itemsInGroup]) => ({
                          module: moduleName,
                          items: itemsInGroup
                        }));
                      })()}
                    />
                  )}
                </div>
              </nav>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="m-3 px-3 py-2 rounded bg-slate-800 hover:bg-slate-700 text-sm"
          >
            Logout
          </button>
        </aside>
        <div className="flex-1 min-w-0 flex flex-col min-h-screen bg-slate-50 transition-all duration-300 ease-in-out">
          {!isAuthPage && !isStorePage && pathname !== '/' && (
            <div className="bg-white shadow-sm border-b border-slate-200 px-4 py-2 text-sm relative dark:bg-slate-950 dark:border-slate-800 sticky top-0 z-30 no-print">
              <div className="flex items-center justify-between gap-3">
                {/* Left: company name breadcrumb */}
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 hidden sm:block">
                    {currentCompany ? "Company" : "View"}
                  </span>
                  <span className="text-slate-300 dark:text-slate-600 hidden sm:block">/</span>
                  <span className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate" title={currentCompany?.name || (pathname === '/dashboard' ? 'Dashboard' : 'Navigation')}>
                    {currentCompany?.name || (pathname === '/dashboard' ? 'Dashboard Overview' : 'Application Navigation')}
                  </span>
                </div>

                {/* Center: Search Bar */}
                <div className="flex-1 max-w-md mx-4">
                  <button
                    type="button"
                    onClick={() => setMenuSearchOpen(true)}
                    className="w-full h-9 px-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800 dark:hover:bg-slate-800 dark:hover:border-slate-700 transition-all group"
                  >
                    <LucideSearch className="w-4 h-4 text-slate-400 group-hover:text-slate-500" />
                    <span className="text-xs text-slate-400 group-hover:text-slate-500 flex-1 text-left">Search menus and features...</span>
                    <kbd className="hidden lg:inline-flex h-5 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 font-mono text-[10px] font-medium text-slate-500 opacity-100 dark:border-slate-700 dark:bg-slate-950">
                      <span className="text-xs">⌘</span>K
                    </kbd>
                  </button>
                </div>

                {/* Right: notification bells */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Task notifications bell */}
                  {isMenuAllowed('TASKS') && (
                    <button
                      type="button"
                      className="relative h-8 w-8 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center transition-colors"
                      onClick={markTasksSeenAndOpen}
                      disabled={!companyId}
                      aria-label="Task notifications"
                      title="Tasks"
                    >
                      <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {tasksNotificationCount > 0 && (
                        <span className="absolute -right-1 -top-1 inline-flex items-center justify-center bg-amber-500 text-[9px] text-white rounded-full px-1 min-w-[16px] h-4">
                          {tasksNotificationCount}
                        </span>
                      )}
                    </button>
                  )}

                  {/* General notifications bell */}
                  {isMenuAllowed('header.notifications') && (
                    <button
                      type="button"
                      className="relative h-8 w-8 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center transition-colors"
                      onClick={() => setNotificationsOpen((o) => !o)}
                      title="Notifications"
                    >
                      <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                      </svg>
                      {unreadCount > 0 && (
                        <span className="absolute -right-1 -top-1 inline-flex items-center justify-center bg-red-500 text-[9px] text-white rounded-full px-1 min-w-[16px] h-4">
                          {unreadCount}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Pending orders bell */}
                  {isMenuAllowed('header.pending_orders') && (
                    <button
                      type="button"
                      className="relative h-8 w-8 rounded-full border border-slate-200 bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:border-slate-700 dark:hover:bg-slate-800 disabled:opacity-60 flex items-center justify-center transition-colors"
                      onClick={() => setPendingOrdersOpen((o) => !o)}
                      disabled={!companyId}
                      title="Pending Orders"
                    >
                      <svg className="w-4 h-4 text-slate-600 dark:text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      {((openSalesOrders?.length ?? 0) + (openPurchaseOrders?.length ?? 0)) > 0 && (
                        <span className="absolute -right-1 -top-1 inline-flex items-center justify-center bg-amber-500 text-[9px] text-white rounded-full px-1 min-w-[16px] h-4">
                          {(openSalesOrders?.length ?? 0) + (openPurchaseOrders?.length ?? 0)}
                        </span>
                      )}
                    </button>
                  )}
                </div>
              </div>


              {notificationsOpen && companyId && (
                <div className="absolute right-12 top-14 mt-1 w-[380px] max-h-[400px] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl text-xs z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                      </span>
                      Task Notifications
                    </h3>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => setNotificationsOpen(false)}
                      title="Close"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {(!notifications || notifications.length === 0) ? (
                    <div className="px-4 py-8 text-center text-slate-500 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-2">✨</span>
                      <p>All caught up! No new notifications.</p>
                    </div>
                  ) : (
                    <div className="p-3">
                      <ul className="space-y-2">
                        {notifications.map((n) => {
                          const isSales = n.type === 'SALES_ORDER_CREATED';
                          const isPurchase = n.type === 'PURCHASE_ORDER_CREATED';
                          const isTaskAssigned = n.type === 'TASK_ASSIGNED';
                          const isTaskCompleted = n.type === 'TASK_COMPLETED';

                          return (
                            <li key={n.id}>
                              <button
                                type="button"
                                className="w-full text-left group rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/30 p-3 shadow-sm hover:border-blue-300 dark:hover:border-blue-700/50 hover:shadow-md transition-all flex gap-3 items-start"
                                onClick={() => handleNotificationClick(n)}
                              >
                                <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                                  isSales ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 
                                  isPurchase ? 'bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400' : 
                                  isTaskAssigned ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' :
                                  isTaskCompleted ? 'bg-green-100 text-green-600 dark:bg-green-500/20 dark:text-green-400' :
                                  'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
                                }`}>
                                  {isSales ? (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
                                  ) : isPurchase ? (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>
                                  ) : isTaskAssigned ? (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>
                                  ) : isTaskCompleted ? (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  ) : (
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-semibold text-slate-800 dark:text-slate-200 text-sm">
                                      {isSales ? 'Sales Order' : isPurchase ? 'Purchase Order' : isTaskAssigned ? 'Task Assigned' : isTaskCompleted ? 'Task Completed' : n.type}
                                    </span>
                                    <span className="text-[10px] font-medium text-slate-500 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80">
                                      #{isTaskAssigned || isTaskCompleted ? n.task_id : n.order_id}
                                    </span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mb-1.5">
                                    {isSales && 'A new sales order requires your attention.'}
                                    {isPurchase && 'A new purchase order requires your attention.'}
                                    {isTaskAssigned && 'You have been assigned a new task. Click to view details.'}
                                    {isTaskCompleted && 'A task you follow has been completed.'}
                                    {!isSales && !isPurchase && !isTaskAssigned && !isTaskCompleted && 'Click to view details.'}
                                  </div>
                                  <div className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">
                                    {new Date(n.created_at).toLocaleString(undefined, {
                                      month: 'short', day: 'numeric', year: 'numeric',
                                      hour: 'numeric', minute: '2-digit'
                                    })}
                                  </div>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {pendingOrdersOpen && companyId && (
                <div className="absolute right-4 top-14 mt-1 w-[420px] max-h-[400px] overflow-y-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl text-xs z-50 animate-in fade-in slide-in-from-top-2">
                  <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between sticky top-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md z-10">
                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100 flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400">🔔</span>
                      Pending Orders
                    </h3>
                    <button
                      type="button"
                      className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors h-6 w-6 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-800"
                      onClick={() => setPendingOrdersOpen(false)}
                      title="Close"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  {!openSalesOrders && !openPurchaseOrders ? (
                    <div className="px-4 py-8 text-center text-slate-500 flex flex-col items-center justify-center">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-400 mb-2"></div>
                      <p>Loading pending orders...</p>
                    </div>
                  ) : (openSalesOrders?.length ?? 0) === 0 && (openPurchaseOrders?.length ?? 0) === 0 ? (
                    <div className="px-4 py-8 text-center text-slate-500 flex flex-col items-center justify-center">
                      <span className="text-3xl mb-2">🎉</span>
                      <p>No pending sales or purchase orders. All caught up!</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-slate-100 dark:divide-slate-800">
                      <div className="p-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-indigo-500"></span> Sales Orders
                        </div>
                        {(!openSalesOrders || openSalesOrders.length === 0) && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">None.</div>
                        )}
                        {openSalesOrders && openSalesOrders.length > 0 && (
                          <ul className="space-y-2.5">
                            {openSalesOrders.slice(0, 5).map((o) => (
                              <li key={o.id} className="group rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/30 p-2.5 shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700/50 hover:shadow-md transition-all">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{o.voucher_number}</span>
                                  <span className="text-[9px] font-medium text-slate-500 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{o.voucher_date}</span>
                                </div>
                                <div className="flex justify-between items-end mb-2">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[100px]" title={o.customer_name}>
                                    {o.customer_name}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{o.total_amount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-md border border-indigo-200 dark:border-indigo-500/30 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors w-full"
                                    onClick={() => handleConvertSalesOrderHeader(o)}
                                  >
                                    Convert to Invoice
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="p-4">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3 flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full bg-rose-500"></span> Purchase Orders
                        </div>
                        {(!openPurchaseOrders || openPurchaseOrders.length === 0) && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 italic">None.</div>
                        )}
                        {openPurchaseOrders && openPurchaseOrders.length > 0 && (
                          <ul className="space-y-2.5">
                            {openPurchaseOrders.slice(0, 5).map((o) => (
                              <li key={o.id} className="group rounded-xl border border-slate-200/60 dark:border-slate-700/60 bg-white/50 dark:bg-slate-800/30 p-2.5 shadow-sm hover:border-rose-300 dark:hover:border-rose-700/50 hover:shadow-md transition-all">
                                <div className="flex justify-between items-center mb-1.5">
                                  <span className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">{o.voucher_number}</span>
                                  <span className="text-[9px] font-medium text-slate-500 px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800">{o.voucher_date}</span>
                                </div>
                                <div className="flex justify-between items-end mb-2">
                                  <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[100px]" title={o.supplier_name}>
                                    {o.supplier_name}
                                  </span>
                                  <span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{o.total_amount.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-end">
                                  <button
                                    type="button"
                                    className="px-2.5 py-1 rounded-md border border-rose-200 dark:border-rose-500/30 text-[10px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-500/10 hover:bg-rose-100 dark:hover:bg-rose-500/20 transition-colors w-full"
                                    onClick={() => handleConvertPurchaseOrderHeader(o)}
                                  >
                                    Convert to Bill
                                  </button>
                                </div>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}


          <main className="flex-1 px-3 py-4 md:px-6 md:py-6 print:p-0">
            <div className={`mx-auto ${isSuperAdmin ? 'max-w-[98%]' : 'max-w-6xl'} space-y-4 print:max-w-none`}>
              <CalendarSettingsProvider>
                {children}
              </CalendarSettingsProvider>
            </div>
          </main>

          {/* Active System Announcement Modal */}
          {activeAnnouncement && (
            <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
              <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-300">
                <div className="relative">
                  <div className="h-24 bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 block opacity-90" />
                  <button
                    onClick={handleDismissAnnouncement}
                    className="absolute top-4 right-4 text-white hover:bg-white/20 p-2 rounded-full transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                  </button>
                  <div className="absolute top-8 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 p-3 rounded-full shadow-lg flex items-center justify-center">
                    <span className="text-3xl inline-block drop-shadow-sm select-none" style={{ lineHeight: 1 }}>📢</span>
                  </div>
                </div>

                <div className="px-8 pt-10 pb-8 text-center">
                  <h3 className="text-xl font-bold bg-gradient-to-br from-slate-800 to-slate-600 dark:from-slate-100 dark:to-slate-300 bg-clip-text text-transparent mb-6">
                    System Announcement
                  </h3>
                  
                  <div className="text-slate-600 dark:text-slate-300 mb-8 whitespace-pre-wrap leading-relaxed max-h-[40vh] overflow-y-auto custom-scrollbar text-[15px]">
                    {activeAnnouncement.message_type === 'image' ? (
                      <img 
                        src={activeAnnouncement.content} 
                        alt="Announcement" 
                        className="max-w-full rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 mx-auto"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      activeAnnouncement.content
                    )}
                  </div>

                  <button
                    onClick={handleDismissAnnouncement}
                    className="w-full py-3.5 px-4 bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white rounded-xl font-semibold shadow-md shadow-violet-500/20 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    Got it, thanks!
                  </button>
                </div>
              </div>
            </div>
          )}

          <MasterSearchDialog
            open={lookupOpen}
            type={lookupType}
            records={lookupRecords}
            initialSearch={headerSearch}
            onSelect={handleLookupSelect}
            onClose={() => {
              setLookupOpen(false);
              setHeaderSearch('');
            }}
          />

          <MenuSearchDialog
            open={menuSearchOpen}
            onClose={() => setMenuSearchOpen(false)}
            menus={menuSearchItems}
            companyId={companyId}
          />

          {chatWidgetReady && companyId && <ChatWidget companyId={companyId} />}
        </div>
      </div>
    </MenuPermissionsProvider>
  );
}
