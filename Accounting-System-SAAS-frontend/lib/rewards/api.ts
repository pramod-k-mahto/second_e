import axios from 'axios';
import { RewardRead, RewardCreate } from './types';

const normalizeRewardsResponse = (payload: unknown): RewardRead[] => {
  if (Array.isArray(payload)) {
    return payload as RewardRead[];
  }

  if (payload && typeof payload === 'object') {
    const candidate = payload as {
      rewards?: unknown;
      data?: unknown;
      items?: unknown;
      results?: unknown;
    };

    if (Array.isArray(candidate.rewards)) return candidate.rewards as RewardRead[];
    if (Array.isArray(candidate.data)) return candidate.data as RewardRead[];
    if (Array.isArray(candidate.items)) return candidate.items as RewardRead[];
    if (Array.isArray(candidate.results)) return candidate.results as RewardRead[];
  }

  return [];
};

export const fetchRewards = async (
  companyId: string,
  params?: { employee_id?: number; reward_type?: string }
): Promise<RewardRead[]> => {
  const response = await axios.get(`/companies/${companyId}/rewards`, { params });
  return normalizeRewardsResponse(response.data);
};

export const grantReward = async (
  companyId: string,
  reward: RewardCreate
): Promise<RewardRead> => {
  const response = await axios.post(`/companies/${companyId}/rewards`, reward);
  return response.data;
};

export const revokeReward = async (
  companyId: string,
  rewardId: number
): Promise<void> => {
  await axios.delete(`/companies/${companyId}/rewards/${rewardId}`);
};
