import api from '@/lib/api';
import type {
  Conversation,
  ConversationCreate,
  ChatStreamRequest,
  SSEEvent,
} from '@/types/chat';
import type { ApiResponse, PaginatedData } from '@/lib/api';

export const conversationApi = {
  list: (page = 1, pageSize = 20) =>
    api.get(`/conversations?page=${page}&page_size=${pageSize}`) as Promise<
      ApiResponse<PaginatedData<Conversation>>
    >,

  get: (id: number) =>
    api.get(`/conversations/${id}`) as Promise<ApiResponse<Conversation>>,

  create: (data: ConversationCreate) =>
    api.post('/conversations', data) as Promise<ApiResponse<Conversation>>,

  update: (id: number, data: Partial<ConversationCreate>) =>
    api.put(`/conversations/${id}`, data) as Promise<ApiResponse<Conversation>>,

  delete: (id: number) =>
    api.delete(`/conversations/${id}`) as Promise<ApiResponse<null>>,
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
  get: () => api.get('/settings') as Promise<ApiResponse<Record<string, unknown>>>,

  update: (data: Record<string, unknown>) =>
    api.put('/settings', data) as Promise<ApiResponse<Record<string, unknown>>>,

  listModels: () =>
    api.get('/settings/models') as Promise<ApiResponse<Record<string, unknown>>>,

  testConnection: () =>
    api.post('/settings/test-connection') as Promise<
      ApiResponse<{ success: boolean; response?: string; error?: string }>
    >,
};
