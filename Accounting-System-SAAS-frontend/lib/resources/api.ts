import axios from 'axios';
import { Resource, ResourceGroup, ResourceCreate, ResourceGroupCreate } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export const ResourcesApi = {
  listGroups: async (companyId: string | number): Promise<ResourceGroup[]> => {
    const response = await axios.get(`${API_BASE_URL}/companies/${companyId}/resources/groups`);
    return response.data;
  },

  createGroup: async (companyId: string | number, group: ResourceGroupCreate): Promise<ResourceGroup> => {
    const response = await axios.post(`${API_BASE_URL}/companies/${companyId}/resources/groups`, group);
    return response.data;
  },

  createResource: async (companyId: string | number, resource: ResourceCreate): Promise<Resource> => {
    const response = await axios.post(`${API_BASE_URL}/companies/${companyId}/resources`, resource);
    return response.data;
  },

  deleteResource: async (companyId: string | number, resourceId: number): Promise<void> => {
    await axios.delete(`${API_BASE_URL}/companies/${companyId}/resources/${resourceId}`);
  },
};
