import { useMemo, useDeferredValue, useRef, useCallback, useLayoutEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import { createRefChatTransport } from '@/lib/chat-transport';
import type {
  OmeletteUIMessage,
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

/**
 * Stable container for options that change over time.
 * The transport reads this ref directly on each request, so the
 * Chat instance created by useChat never needs to be recreated.
 */
interface OptionsSnapshot {
  conversationId?: number;
  knowledgeBaseIds: number[];
  toolMode: ToolMode;
  model?: string;
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
  // Keep the latest onConversationId callback in a ref for the onFinish handler.
  const onConversationIdRef = useRef(onConversationId);
  // AI SDK's useChat stores the Chat instance in a useRef and never recreates
  // it when the transport prop changes. To work around this, we create ONE
  // stable transport that reads the latest options from a ref on every request.
  const optionsRef = useRef<OptionsSnapshot>({ conversationId, knowledgeBaseIds, toolMode, model });

  // Sync refs in layout effect to avoid cascading renders
  useLayoutEffect(() => {
    onConversationIdRef.current = onConversationId;
    optionsRef.current = { conversationId, knowledgeBaseIds, toolMode, model };
  });

  // eslint-disable-next-line react-hooks/refs -- ref only read during API requests, not render
  const transport = useMemo(() => createRefChatTransport(optionsRef), []);

  const chat = useChat<OmeletteUIMessage>({
    transport,
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
