import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';
import type { PaginationParams } from '@/types/api';

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
  list: (projectId: number, params?: PaginationParams) =>
    api
      .get<PaginatedData<Subscription>>(`/projects/${projectId}/subscriptions`, { params })
      .then(r => r.data),
  get: (projectId: number, subId: number) =>
    api.get<Subscription>(`/projects/${projectId}/subscriptions/${subId}`).then(r => r.data),
  create: (projectId: number, data: SubscriptionCreate) =>
    api.post<Subscription>(`/projects/${projectId}/subscriptions`, data).then(r => r.data),
  update: (
    projectId: number,
    subId: number,
    data: Partial<SubscriptionCreate & { is_active: boolean }>
  ) => api.put<Subscription>(`/projects/${projectId}/subscriptions/${subId}`, data).then(r => r.data),
  delete: (projectId: number, subId: number) =>
    api.delete<null>(`/projects/${projectId}/subscriptions/${subId}`).then(r => r.data),
  trigger: (projectId: number, subId: number, sinceDays?: number, autoImport?: boolean) =>
    api.post<{ status: string; new_papers?: number }>(`/projects/${projectId}/subscriptions/${subId}/trigger`, null, {
      params: { since_days: sinceDays, auto_import: autoImport },
    }).then(r => r.data),
  feeds: (projectId: number) =>
    api.get<Array<Record<string, unknown>>>(`/projects/${projectId}/subscriptions/feeds`).then(r => r.data),
  checkRss: (projectId: number, feedUrl: string, sinceDays?: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/subscriptions/check-rss`, null, {
      params: { feed_url: feedUrl, since_days: sinceDays },
    }).then(r => r.data),
};
