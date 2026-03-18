import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';

export interface Subscription {
  id: number;
  project_id: number;
  name: string;
  query: string;
  sources: string[];
  frequency: string;
  max_results: number;
  is_active: boolean;
  last_run_at: string | null;
  total_found: number;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionCreate {
  name: string;
  query?: string;
  sources?: string[];
  frequency?: string;
  max_results?: number;
}

export const subscriptionApi = {
  list: (projectId: number) =>
    api
      .get<PaginatedData<Subscription>>(`/projects/${projectId}/subscriptions`)
      .then(r => r.data),
  create: (projectId: number, data: SubscriptionCreate) =>
    api.post<Subscription>(`/projects/${projectId}/subscriptions`, data).then(r => r.data),
  update: (
    projectId: number,
    subId: number,
    data: Partial<SubscriptionCreate & { is_active: boolean }>
  ) => api.put<Subscription>(`/projects/${projectId}/subscriptions/${subId}`, data).then(r => r.data),
  delete: (projectId: number, subId: number) =>
    api.delete<null>(`/projects/${projectId}/subscriptions/${subId}`).then(r => r.data),
  trigger: (projectId: number, subId: number) =>
    api.post<{ status: string }>(`/projects/${projectId}/subscriptions/${subId}/trigger`).then(r => r.data),
};
