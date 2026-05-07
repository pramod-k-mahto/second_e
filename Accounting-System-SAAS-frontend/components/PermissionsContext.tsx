"use client";

import { createContext, useContext, useMemo, ReactNode } from "react";
import useSWR from "swr";
import { api } from "@/lib/api";

export type CrudFlags = { create: boolean; read: boolean; update: boolean; delete: boolean };

export type PermissionMap = {
  masters_customers?: CrudFlags;
  masters_suppliers?: CrudFlags;
  masters_items?: CrudFlags;
  masters_ledgers?: CrudFlags;
  sales_invoices?: CrudFlags;
  purchases_bills?: CrudFlags;
  vouchers?: CrudFlags;
  reports?: CrudFlags;
  settings_company?: CrudFlags;
  settings_users?: CrudFlags;
};

export type PermissionsContextValue = {
  isTenantAdmin: boolean;
  role: string;
  isSuperAdmin: boolean;
  isGhostAdmin: boolean;
  isAdminLike: boolean;
  isSystemAdmin: boolean;
  permissions: PermissionMap;
  ghostCompanyId?: number | null;
  ghostTenantId?: number | null;
  loading: boolean;
  error: any;
  can: (moduleKey: keyof PermissionMap, action: keyof CrudFlags) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { data, error, isLoading } = useSWR("/auth/me", fetcher);

  const isSystemAdminRole = useMemo(() => {
    const role = String(data?.role || "").toLowerCase();
    return !!data?.is_system_admin || role === "superadmin" || role.startsWith("ghost_") || role === "ghost";
  }, [data]);

  const { data: adminSettings } = useSWR(
    isSystemAdminRole ? "/admin/settings" : null,
    fetcher
  );

  const value: PermissionsContextValue = useMemo(() => {
    const isTenantAdmin = !!data?.is_tenant_admin;
    const role = String(data?.role || "").toLowerCase();
    const isSuperAdmin = role === "superadmin";
    const isGhostAdmin = role.startsWith("ghost_");
    const isAdminLike = role === "admin" || isSuperAdmin || isGhostAdmin || role === "ghost";
    const isSystemAdmin = !!data?.is_system_admin || isSuperAdmin || isGhostAdmin || role === "ghost";
    const permissions: PermissionMap = (data?.tenant_permissions as PermissionMap) || {};

    const can = (moduleKey: keyof PermissionMap, action: keyof CrudFlags): boolean => {
      if (isSystemAdmin) return true;
      if (isTenantAdmin) return true;
      const mod = permissions[moduleKey];
      if (!mod) return false;
      return !!mod[action];
    };

    return {
      isTenantAdmin,
      role,
      isSuperAdmin,
      isGhostAdmin,
      isAdminLike,
      isSystemAdmin,
      permissions,
      ghostCompanyId: adminSettings?.ghost_company_id,
      ghostTenantId: adminSettings?.ghost_tenant_id,
      loading: isLoading,
      error,
      can,
    };
  }, [data, error, isLoading, adminSettings]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): PermissionsContextValue {
  const ctx = useContext(PermissionsContext);
  if (!ctx) {
    throw new Error("usePermissions must be used within a PermissionsProvider");
  }
  return ctx;
}
