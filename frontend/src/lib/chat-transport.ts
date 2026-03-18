import type { MutableRefObject } from 'react';
import { DefaultChatTransport } from 'ai';
import type { OmeletteUIMessage } from '@/types/chat';
import { getMessageText } from '@/types/chat';
import { apiUrl } from '@/lib/api-config';

export interface ChatTransportOptions {
  conversationId?: number;
  knowledgeBaseIds?: number[];
  toolMode?: string;
  model?: string;
}

/**
 * Create a stable transport that reads options from a ref on every request.
 *
 * AI SDK 5.0's `useChat` stores the `Chat` instance in a `useRef` and never
 * recreates it when the `transport` prop changes. A ref-based transport
 * ensures each request always uses the *latest* knowledge-base selection,
 * tool mode, etc. without needing to recreate the Chat object.
 */
export function createRefChatTransport(
  optionsRef: MutableRefObject<ChatTransportOptions>,
) {
  return new DefaultChatTransport<OmeletteUIMessage>({
    api: apiUrl('/chat/stream'),
    prepareSendMessagesRequest({ messages, trigger }) {
      const opts = optionsRef.current;
      const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
      const messageText = lastUserMsg ? getMessageText(lastUserMsg) : '';

      return {
        body: {
          message: messageText,
          conversation_id: opts.conversationId ?? null,
          knowledge_base_ids: opts.knowledgeBaseIds ?? [],
          tool_mode: opts.toolMode ?? 'qa',
          model: opts.model ?? null,
          trigger,
        },
        headers: {
          'Content-Type': 'application/json',
        },
      };
    },
  });
}
