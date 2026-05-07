import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { InteractionsApi } from './api';
import { CustomerInteractionCreate } from './types';

export const useInteractions = (
  companyId: string | number,
  params?: { customer_id?: number; employee_id?: number }
) => {
  return useQuery({
    queryKey: ['interactions', companyId, params],
    queryFn: () => InteractionsApi.listInteractions(companyId, params),
    enabled: !!companyId,
  });
};

export const useLogInteraction = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      companyId,
      interaction,
    }: {
      companyId: string | number;
      interaction: CustomerInteractionCreate;
    }) => InteractionsApi.logInteraction(companyId, interaction),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['interactions', companyId] });
    },
  });
};
