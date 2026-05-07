import useSWR from 'swr';
import { api } from '@/lib/api';

export type Role = 'user' | 'admin' | 'superadmin' | 'ghost_billing' | 'ghost_support' | 'ghost_tech';

export interface UserRead {
  id: number;
  email: string;
  full_name?: string;
  role: Role;
  tenant_id: number | null;
  is_active?: boolean;
  is_tenant_admin?: boolean;
  created_at: string;
}

export interface UserCreate {
  email: string;
  full_name: string;
  role: Role;
  tenant_id?: number | null;
  password: string;
  confirm_password: string;
}

export interface UserUpdate {
  email?: string;
  full_name?: string;
  role?: Role;
  tenant_id?: number | null;
  password?: string;
  is_tenant_admin?: boolean;
}

type ListParams = {
  q?: string;
  role?: Role | '';
  tenant_id?: number | null;
  skip?: number;
  limit?: number;
};

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export function buildUsersUrl(params: ListParams = {}): string {
  const search = new URLSearchParams();
  if (params.q) search.set('q', params.q);
  if (params.role) search.set('role', params.role);
  if (typeof params.tenant_id === 'number') search.set('tenant_id', String(params.tenant_id));
  if (typeof params.skip === 'number') search.set('skip', String(params.skip));
  if (typeof params.limit === 'number') search.set('limit', String(params.limit));
  const qs = search.toString();
  return qs ? `/admin/users?${qs}` : '/admin/users';
}

export function useUsers(params: ListParams) {
  const url = buildUsersUrl(params);
  return useSWR<UserRead[]>(url, fetcher);
}

export function useUser(userId?: string | number) {
  const id = userId ? String(userId) : null;
  return useSWR<UserRead>(id ? `/admin/users/${id}` : null, fetcher);
}

export async function createUser(payload: UserCreate) {
  const res = await api.post<UserRead>('/admin/users', payload);
  return res.data;
}

export async function updateUser(userId: number | string, payload: UserUpdate) {
  const res = await api.put<UserRead>(`/admin/users/${userId}`, payload);
  return res.data;
}

export async function deleteUser(userId: number | string) {
  await api.delete(`/admin/users/${userId}`);
}
