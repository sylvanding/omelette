import { useMemo, useDeferredValue, useRef, useCallback } from 'react';
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

  // AI SDK's useChat stores the Chat instance in a useRef and never recreates
  // it when the transport prop changes. To work around this, we create ONE
  // stable transport that reads the latest options from a ref on every request.
  const optionsRef = useRef({ conversationId, knowledgeBaseIds, toolMode, model });
  optionsRef.current = { conversationId, knowledgeBaseIds, toolMode, model };

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
