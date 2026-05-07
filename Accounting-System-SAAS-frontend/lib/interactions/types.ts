export type InteractionType = 'CALL' | 'EMAIL' | 'MEETING' | 'WHATSAPP' | 'OTHER';

export interface CustomerInteraction {
  id: number;
  company_id: number;
  customer_id: number;
  employee_id: number;
  interaction_type: InteractionType;
  notes: string;
  interaction_date: string;
  created_at: string;
  customer_name?: string;
  employee_name?: string;
  task_id?: number | null;
}

export interface CustomerInteractionCreate {
  customer_id: number;
  employee_id: number;
  interaction_type: InteractionType;
  notes: string;
  interaction_date?: string;
  task_id?: number | null;
}
