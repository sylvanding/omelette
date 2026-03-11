import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';
import type {
  Conversation,
  ConversationCreate,
  ChatStreamRequest,
  SSEEvent,
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

export async function* streamChat(
  request: ChatStreamRequest,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const response = await fetch('/api/v1/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Chat stream error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.slice(6);
        } else if (line === '' && currentEvent && currentData) {
          try {
            yield { event: currentEvent, data: JSON.parse(currentData) };
          } catch {
            yield { event: currentEvent, data: { raw: currentData } };
          }
          currentEvent = '';
          currentData = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export const settingsApi = {
  get: () =>
    api.get<Record<string, unknown>>('/settings').then(r => r.data),

  update: (data: Record<string, unknown>) =>
    api.put<Record<string, unknown>>('/settings', data).then(r => r.data),

  listModels: () =>
    api.get<Record<string, unknown>>('/settings/models').then(r => r.data),

  testConnection: () =>
    api.post<{ success: boolean; response?: string; error?: string }>('/settings/test-connection').then(r => r.data),
};
