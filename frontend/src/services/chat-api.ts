import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';
import type {
  Conversation,
  ConversationCreate,
} from '@/types/chat';

export const conversationApi = {
  list: (page = 1, pageSize = 20) =>
    api.get<PaginatedData<Conversation>>(`/conversations?page=${page}&page_size=${pageSize}`).then(r => r.data),

  get: (id: number) =>
    api.get<Conversation>(`/conversations/${id}`).then(r => r.data),

  create: (data: ConversationCreate) =>
    api.post<Conversation>('/conversations', data).then(r => r.data),

  update: (id: number, data: Partial<ConversationCreate>) =>
    api.put<Conversation>(`/conversations/${id}`, data).then(r => r.data),

  delete: (id: number) =>
    api.delete<null>(`/conversations/${id}`).then(r => r.data),
};

export const settingsApi = {
  get: () =>
    api.get<Record<string, unknown>>('/settings').then(r => r.data),

  update: (data: Record<string, unknown>) =>
    api.put<Record<string, unknown>>('/settings', data).then(r => r.data),

  listModels: () =>
    api.get<Array<Record<string, unknown>>>('/settings/models').then(r => r.data),

  testConnection: () =>
    api.post<{ success: boolean; response?: string; error?: string }>('/settings/test-connection').then(r => r.data),

  health: () =>
    api.get<Record<string, unknown>>('/settings/health').then(r => r.data),
};
