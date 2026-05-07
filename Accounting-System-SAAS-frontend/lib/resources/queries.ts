import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ResourcesApi } from './api';
import { ResourceCreate, ResourceGroupCreate } from './types';

export const useResourceGroups = (companyId: string | number) => {
  return useQuery({
    queryKey: ['resource-groups', companyId],
    queryFn: () => ResourcesApi.listGroups(companyId),
    enabled: !!companyId,
  });
};

export const useCreateResourceGroup = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, group }: { companyId: string | number; group: ResourceGroupCreate }) =>
      ResourcesApi.createGroup(companyId, group),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['resource-groups', companyId] });
    },
  });
};

export const useCreateResource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, resource }: { companyId: string | number; resource: ResourceCreate }) =>
      ResourcesApi.createResource(companyId, resource),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['resource-groups', companyId] });
    },
  });
};

export const useDeleteResource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ companyId, resourceId }: { companyId: string | number; resourceId: number }) =>
      ResourcesApi.deleteResource(companyId, resourceId),
    onSuccess: (_, { companyId }) => {
      queryClient.invalidateQueries({ queryKey: ['resource-groups', companyId] });
    },
  });
};
