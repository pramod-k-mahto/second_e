export type RewardType = 'POINTS' | 'MONEY' | 'BADGE';

export interface RewardBase {
  employee_id: number;
  reward_type: RewardType;
  amount?: number;
  points?: number;
  reason: string;
  given_at?: string;
}

export interface RewardCreate extends RewardBase {}

export interface RewardRead extends RewardBase {
  id: number;
  company_id: number;
}
