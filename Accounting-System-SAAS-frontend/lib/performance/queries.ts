import { useQuery } from '@tanstack/react-query';
import { fetchAllPerformance, fetchEmployeePerformance } from './api';

export const useAllPerformance = (companyId: string) => {
  return useQuery({
    queryKey: ['performance', companyId],
    queryFn: () => fetchAllPerformance(companyId),
    enabled: !!companyId,
  });
};

export const useEmployeePerformance = (companyId: string, employeeId: number) => {
  return useQuery({
    queryKey: ['performance', companyId, employeeId],
    queryFn: () => fetchEmployeePerformance(companyId, employeeId),
    enabled: !!companyId && !!employeeId,
  });
};
