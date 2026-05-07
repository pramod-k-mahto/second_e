import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { EmployeeTypeRead, EmployeeTypeCreate, EmployeeTypeUpdate } from "../types";

const QUERY_KEY = "employee-types";

export function useEmployeeTypes(companyId: number) {
    return useQuery({
        queryKey: [QUERY_KEY, companyId],
        queryFn: async () => {
            const res = await api.get<EmployeeTypeRead[]>(
                `/payroll/companies/${companyId}/employee-types`
            );
            return res.data;
        },
        enabled: !!companyId,
    });
}

export function useCreateEmployeeType(companyId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (data: EmployeeTypeCreate) => {
            const res = await api.post<EmployeeTypeRead>(
                `/payroll/companies/${companyId}/employee-types`,
                data
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
        },
    });
}

export function useUpdateEmployeeType(companyId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({
            id,
            data,
        }: {
            id: number;
            data: EmployeeTypeUpdate;
        }) => {
            const res = await api.put<EmployeeTypeRead>(
                `/payroll/companies/${companyId}/employee-types/${id}`,
                data
            );
            return res.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
        },
    });
}

export function useDeleteEmployeeType(companyId: number) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async (id: number) => {
            await api.delete(`/payroll/companies/${companyId}/employee-types/${id}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEY, companyId] });
        },
    });
}
