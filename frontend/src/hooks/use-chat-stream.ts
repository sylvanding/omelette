import { useMemo, useDeferredValue, useRef, useCallback } from 'react';
import { useChat } from '@ai-sdk/react';
import { createChatTransport } from '@/lib/chat-transport';
import type {
  OmeletteUIMessage,
  OmeletteDataParts,
  Citation,
  ThinkingData,
  ToolMode,
} from '@/types/chat';
import { getCitations, getThinkingSteps, getConversationId } from '@/types/chat';

interface UseChatStreamOptions {
  conversationId?: number;
  knowledgeBaseIds: number[];
  toolMode: ToolMode;
  model?: string;
  initialMessages?: OmeletteUIMessage[];
  onConversationId?: (id: number) => void;
  onError?: (error: Error) => void;
}

interface UseChatStreamReturn {
  messages: OmeletteUIMessage[];
  sendMessage: (text: string) => void;
  stop: () => void;
  status: 'ready' | 'submitted' | 'streaming' | 'error';
  error: Error | undefined;
  isStreaming: boolean;
  lastAssistantCitations: Citation[];
  lastAssistantThinking: ThinkingData[];
  setMessages: (msgs: OmeletteUIMessage[] | ((prev: OmeletteUIMessage[]) => OmeletteUIMessage[])) => void;
}

export function useChatStream({
  conversationId,
  knowledgeBaseIds,
  toolMode,
  model,
  initialMessages,
  onConversationId,
  onError,
}: UseChatStreamOptions): UseChatStreamReturn {
  const onConversationIdRef = useRef(onConversationId);
  onConversationIdRef.current = onConversationId;

  const transport = useMemo(
    () =>
      createChatTransport({
        conversationId,
        knowledgeBaseIds,
        toolMode,
        model,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversationId, JSON.stringify(knowledgeBaseIds), toolMode, model],
  );

  const chat = useChat<OmeletteUIMessage>({
    transport,
    dataPartSchemas: {} as Record<keyof OmeletteDataParts, undefined>,
    messages: initialMessages,
    onError,
    onFinish({ messages: finishedMessages }) {
      const lastAssistant = [...finishedMessages].reverse().find((m) => m.role === 'assistant');
      if (lastAssistant) {
        const cid = getConversationId(lastAssistant);
        if (cid && onConversationIdRef.current) {
          onConversationIdRef.current(cid);
        }
      }
    },
    experimental_throttle: 80,
  });

  const deferredMessages = useDeferredValue(chat.messages);

  const isStreaming = chat.status === 'streaming' || chat.status === 'submitted';

  const lastAssistant = useMemo(() => {
    return [...deferredMessages].reverse().find((m) => m.role === 'assistant');
  }, [deferredMessages]);

  const lastAssistantCitations = useMemo(() => {
    return lastAssistant ? getCitations(lastAssistant) : [];
  }, [lastAssistant]);

  const lastAssistantThinking = useMemo(() => {
    return lastAssistant ? getThinkingSteps(lastAssistant) : [];
  }, [lastAssistant]);

  const sendMessage = useCallback(
    (text: string) => {
      chat.sendMessage({ text });
    },
    [chat],
  );

  return {
    messages: deferredMessages,
    sendMessage,
    stop: chat.stop,
    status: chat.status,
    error: chat.error,
    isStreaming,
    lastAssistantCitations,
    lastAssistantThinking,
    setMessages: chat.setMessages,
  };
}
