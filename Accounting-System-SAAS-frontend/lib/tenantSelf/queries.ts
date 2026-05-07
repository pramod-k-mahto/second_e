"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import {
  getTenantSelf,
  listMenuTemplatesDropdown,
  updateTenantPlanModules,
} from "@/lib/api/tenantSelf";

export function tenantSelfKey() {
  return ["tenantSelf"] as const;
}

export function menuTemplatesDropdownKey() {
  return ["menuTemplatesDropdown"] as const;
}

export function useTenantSelf() {
  return useQuery({
    queryKey: tenantSelfKey(),
    queryFn: () => getTenantSelf(),
    placeholderData: (previousData) => previousData,
    retry: (failureCount, error) => {
      const status = (error as AxiosError | undefined)?.response?.status;
      if (status === 403 || status === 404) return false;
      return failureCount < 2;
    },
  });
}

export function useMenuTemplatesDropdown(enabled: boolean = true) {
  return useQuery({
    queryKey: menuTemplatesDropdownKey(),
    queryFn: () => listMenuTemplatesDropdown({ include_inactive: false }),
    enabled,
    retry: (failureCount, error) => {
      const status = (error as AxiosError | undefined)?.response?.status;
      if (status === 403) return false;
      return failureCount < 2;
    },
  });
}

export function useUpdateTenantPlanModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: { menu_template_id: number | null; plan?: string }) =>
      updateTenantPlanModules(payload),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: tenantSelfKey() });
    },
  });
}
