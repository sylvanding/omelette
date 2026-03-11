import api from '@/lib/api';

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
  list: (projectId: number) => api.get(`/projects/${projectId}/subscriptions`),
  create: (projectId: number, data: SubscriptionCreate) =>
    api.post(`/projects/${projectId}/subscriptions`, data),
  update: (
    projectId: number,
    subId: number,
    data: Partial<SubscriptionCreate & { is_active: boolean }>
  ) => api.put(`/projects/${projectId}/subscriptions/${subId}`, data),
  delete: (projectId: number, subId: number) =>
    api.delete(`/projects/${projectId}/subscriptions/${subId}`),
  trigger: (projectId: number, subId: number) =>
    api.post(`/projects/${projectId}/subscriptions/${subId}/trigger`),
};
