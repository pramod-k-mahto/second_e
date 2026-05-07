import axios from 'axios';
import { CustomerInteraction, CustomerInteractionCreate } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export const InteractionsApi = {
  listInteractions: async (
    companyId: string | number,
    params?: { customer_id?: number; employee_id?: number }
  ): Promise<CustomerInteraction[]> => {
    const response = await axios.get(`${API_BASE_URL}/companies/${companyId}/interactions`, { params });
    return response.data;
  },

  logInteraction: async (
    companyId: string | number,
    interaction: CustomerInteractionCreate
  ): Promise<CustomerInteraction> => {
    const response = await axios.post(`${API_BASE_URL}/companies/${companyId}/interactions`, interaction);
    return response.data;
  },
};
