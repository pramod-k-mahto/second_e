import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchRewards, grantReward, revokeReward } from './api';
import { RewardCreate } from './types';

export const useRewards = (companyId: string, params?: { employee_id?: number; reward_type?: string }) => {
  return useQuery({
    queryKey: ['rewards', companyId, params],
    queryFn: () => fetchRewards(companyId, params),
    enabled: !!companyId,
  });
};

export const useGrantReward = (companyId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reward: RewardCreate) => grantReward(companyId, reward),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards', companyId] });
      queryClient.invalidateQueries({ queryKey: ['performance', companyId] });
    },
  });
};

export const useRevokeReward = (companyId: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (rewardId: number) => revokeReward(companyId, rewardId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rewards', companyId] });
      queryClient.invalidateQueries({ queryKey: ['performance', companyId] });
    },
  });
};
