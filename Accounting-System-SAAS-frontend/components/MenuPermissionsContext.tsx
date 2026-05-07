"use client";

import { createContext, useContext, ReactNode, useMemo } from "react";

export type MenuAccessLevel = "deny" | "read" | "update" | "full";

export type MenuPermissionsContextValue = {
  getAccessLevel: (menuCode: string) => MenuAccessLevel;
  isMenuAllowed: (menuCode: string) => boolean;
};

const MenuPermissionsContext = createContext<MenuPermissionsContextValue | null>(null);

export function MenuPermissionsProvider({
  children,
  getAccessLevel,
  isMenuAllowed,
}: {
  children: ReactNode;
  getAccessLevel: (menuCode: string) => MenuAccessLevel;
  isMenuAllowed: (menuCode: string) => boolean;
}) {
  const value = useMemo<MenuPermissionsContextValue>(
    () => ({ getAccessLevel, isMenuAllowed }),
    [getAccessLevel, isMenuAllowed]
  );

  return (
    <MenuPermissionsContext.Provider value={value}>
      {children}
    </MenuPermissionsContext.Provider>
  );
}

export function useMenuPermissions(): MenuPermissionsContextValue {
  const ctx = useContext(MenuPermissionsContext);
  if (!ctx) {
    // Fallback: outside provider (e.g. public/admin pages or caching edge).
    // Return permissive defaults so pages don't crash; the Layout provider
    // will supply real values for authenticated company pages.
    if (process.env.NODE_ENV === 'development') {
      console.warn("[useMenuPermissions] Used outside MenuPermissionsProvider – returning safe defaults.");
    }
    return {
      getAccessLevel: () => 'full',
      isMenuAllowed: () => true,
    };
  }
  return ctx;
}

export function useMenuAccess(menuCode: string) {
  const { getAccessLevel, isMenuAllowed } = useMenuPermissions();
  const level = getAccessLevel(menuCode);
  const allowed = isMenuAllowed(menuCode);

  const canRead = level === "read" || level === "update" || level === "full";
  const canUpdate = level === "update" || level === "full";
  const canDelete = level === "full";

  return { level, allowed, canRead, canUpdate, canDelete };
}
