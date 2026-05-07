import axios from 'axios';
import { EmployeePerformanceRead } from './types';

export const fetchAllPerformance = async (companyId: string): Promise<EmployeePerformanceRead[]> => {
  const response = await axios.get(`/companies/${companyId}/performance/employees`);
  return response.data;
};

export const fetchEmployeePerformance = async (
  companyId: string,
  employeeId: number
): Promise<EmployeePerformanceRead> => {
  const response = await axios.get(`/companies/${companyId}/performance/employees/${employeeId}`);
  return response.data;
};
