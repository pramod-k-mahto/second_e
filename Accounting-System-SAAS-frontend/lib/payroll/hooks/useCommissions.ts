
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
    CommissionRuleRead,
    CommissionRuleCreate,
    CommissionRuleUpdate,
    CommissionReportItem
} from "../types";

const RULES_QUERY_KEY = "commission-rules";
const REPORT_QUERY_KEY = "commission-report";

export function useCommissionRules(companyId: number) {
    return useQuery({
        queryKey: [RULES_QUERY_KEY, companyId],
        queryFn: async () => {
            const res = await api.get<CommissionRuleRead[]>(
                `/companies/${companyId}/commissions/rules`
            );
            return res.data;
        },
        enabled: !!companyId,
    });
}

export function useCreateCommissionRule(companyId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: CommissionRuleCreate) => {
            const res = await api.post<CommissionRuleRead>(
                `/companies/${companyId}/commissions/rules`,
                data
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [RULES_QUERY_KEY, companyId] });
        },
    });
}

export function useUpdateCommissionRule(companyId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ id, data }: { id: number; data: CommissionRuleUpdate }) => {
            const res = await api.put<CommissionRuleRead>(
                `/companies/${companyId}/commissions/rules/${id}`,
                data
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [RULES_QUERY_KEY, companyId] });
        },
    });
}

export function useDeleteCommissionRule(companyId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/companies/${companyId}/commissions/rules/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [RULES_QUERY_KEY, companyId] });
        },
    });
}

export function useCommissionReport(
    companyId: number,
    startDate: string,
    endDate: string,
    filters?: {
        departmentId?: number | null;
        projectId?: number | null;
        segmentId?: number | null;
    }
) {
    return useQuery({
        queryKey: [REPORT_QUERY_KEY, companyId, startDate, endDate, filters?.departmentId ?? null, filters?.projectId ?? null, filters?.segmentId ?? null],
        queryFn: async () => {
            const res = await api.get<CommissionReportItem[]>(
                `/companies/${companyId}/commissions/report`,
                {
                    params: {
                        start_date: startDate,
                        end_date: endDate,
                        department_id: filters?.departmentId ?? undefined,
                        project_id: filters?.projectId ?? undefined,
                        segment_id: filters?.segmentId ?? undefined,
                    },
                }
            );
            return res.data;
        },
        enabled: !!companyId && !!startDate && !!endDate,
    });
}

export function useDepartments(companyId: number) {
    return useQuery({
        queryKey: ["departments", companyId],
        queryFn: async () => {
            const res = await api.get<{ id: number; name: string }[]>(
                `/companies/${companyId}/departments`
            );
            return res.data;
        },
        enabled: !!companyId,
    });
}

export function useProjects(companyId: number) {
    return useQuery({
        queryKey: ["projects", companyId],
        queryFn: async () => {
            const res = await api.get<{ id: number; name: string }[]>(
                `/companies/${companyId}/projects`
            );
            return res.data;
        },
        enabled: !!companyId,
    });
}

export function useSegments(companyId: number) {
    return useQuery({
        queryKey: ["segments", companyId],
        queryFn: async () => {
            const res = await api.get<{ id: number; name: string }[]>(
                `/companies/${companyId}/segments`
            );
            return res.data;
        },
        enabled: !!companyId,
    });
}
