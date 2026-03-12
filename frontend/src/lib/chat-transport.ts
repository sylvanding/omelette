import { DefaultChatTransport } from 'ai';
import type { OmeletteUIMessage } from '@/types/chat';
import { getMessageText } from '@/types/chat';

interface ChatTransportOptions {
  conversationId?: number;
  knowledgeBaseIds?: number[];
  toolMode?: string;
  model?: string;
}

export function createChatTransport(options: ChatTransportOptions) {
  return new DefaultChatTransport<OmeletteUIMessage>({
    api: '/api/v1/chat/stream/v2',
    prepareSendMessagesRequest({ messages, trigger }) {
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      const messageText = lastUserMsg ? getMessageText(lastUserMsg) : '';

      return {
        body: {
          message: messageText,
          conversation_id: options.conversationId ?? null,
          knowledge_base_ids: options.knowledgeBaseIds ?? [],
          tool_mode: options.toolMode ?? 'qa',
          model: options.model ?? null,
          trigger,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      };
    },
  });
}
