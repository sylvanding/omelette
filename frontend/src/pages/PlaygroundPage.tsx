import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus, ChevronDown, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import ChatInput from '@/components/playground/ChatInput';
import MessageBubble from '@/components/playground/MessageBubble';
import ToolModeSelector from '@/components/playground/ToolModeSelector';
import { streamChat } from '@/services/chat-api';
import { projectApi } from '@/services/api';
import type { ToolMode, Citation } from '@/types/chat';

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export default function PlaygroundPage() {
  const { t } = useTranslation();
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('qa');
  const [selectedKBs, setSelectedKBs] = useState<number[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list(1, 100),
  });
  const projects = projectsData?.data?.items ?? [];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    async (message: string) => {
      const userMsg: LocalMessage = {
        id: `u-${Date.now()}`,
        role: 'user',
        content: message,
      };
      const assistantMsg: LocalMessage = {
        id: `a-${Date.now()}`,
        role: 'assistant',
        content: '',
        citations: [],
        isStreaming: true,
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setIsStreaming(true);

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const gen = streamChat(
          {
            conversation_id: conversationId,
            message,
            knowledge_base_ids: selectedKBs.length > 0 ? selectedKBs : undefined,
            tool_mode: toolMode,
          },
          controller.signal,
        );

        for await (const event of gen) {
          if (event.event === 'text_delta') {
            const delta = (event.data as { delta: string }).delta;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + delta }
                  : m,
              ),
            );
          } else if (event.event === 'citation') {
            const citation = event.data as unknown as Citation;
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, citations: [...(m.citations ?? []), citation] }
                  : m,
              ),
            );
          } else if (event.event === 'message_end') {
            const cid = (event.data as { conversation_id?: number })
              .conversation_id;
            if (cid) setConversationId(cid);
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content || t('playground.streamError') }
                : m,
            ),
          );
        }
      } finally {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id ? { ...m, isStreaming: false } : m,
          ),
        );
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [conversationId, selectedKBs, toolMode, t],
  );

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setIsStreaming(false);
  };

  const toggleKB = (id: number) => {
    setSelectedKBs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const isEmpty = messages.length === 0;

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold">Playground</h1>
          <ToolModeSelector value={toolMode} onChange={setToolMode} />
        </div>
        <div className="flex items-center gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                {t('playground.knowledgeBase')}
                {selectedKBs.length > 0 && (
                  <Badge variant="secondary" className="ml-1 px-1.5">
                    {selectedKBs.length}
                  </Badge>
                )}
                <ChevronDown className="size-3.5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2" align="end">
              {isLoadingProjects ? (
                <p className="p-2 text-xs text-muted-foreground">
                  {t('common.loading')}
                </p>
              ) : projects.length === 0 ? (
                <p className="p-2 text-xs text-muted-foreground">
                  {t('playground.noKB')}
                </p>
              ) : (
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {projects.map((p: { id: number; name: string }) => (
                    <button
                      key={p.id}
                      onClick={() => toggleKB(p.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                    >
                      <div
                        className={`size-4 rounded border ${
                          selectedKBs.includes(p.id)
                            ? 'border-primary bg-primary'
                            : 'border-border'
                        }`}
                      />
                      <span className="truncate">{p.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="sm" onClick={handleNewChat} className="gap-1.5">
            <Plus className="size-3.5" />
            {t('playground.newChat')}
          </Button>
        </div>
      </header>

      {/* Messages area */}
      <ScrollArea className="flex-1">
        {isEmpty ? (
          <div className="flex h-full min-h-[60vh] flex-col items-center justify-center px-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-center"
            >
              <div className="mx-auto mb-6 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <Sparkles className="size-8 text-primary" />
              </div>
              <h2 className="mb-2 text-2xl font-bold tracking-tight">
                {t('playground.welcome')}
              </h2>
              <p className="mx-auto max-w-md text-sm text-muted-foreground">
                {t('playground.welcomeDesc')}
              </p>

              <div className="mx-auto mt-8 grid max-w-lg grid-cols-2 gap-3">
                {[
                  t('playground.suggestions.summarize'),
                  t('playground.suggestions.citation'),
                  t('playground.suggestions.outline'),
                  t('playground.suggestions.gap'),
                ].map((q) => (
                  <button
                    key={q}
                    onClick={() => handleSend(q)}
                    disabled={isStreaming}
                    className="rounded-xl border border-border bg-card p-3 text-left text-sm text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-foreground"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-6 px-4 py-6">
            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  <MessageBubble
                    role={msg.role}
                    content={msg.content}
                    citations={msg.citations}
                    isStreaming={msg.isStreaming}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
            <div ref={bottomRef} />
          </div>
        )}
      </ScrollArea>

      {/* Input area */}
      <div className="border-t border-border bg-background p-4">
        <div className="mx-auto max-w-3xl">
          <ChatInput
            onSend={handleSend}
            isLoading={isStreaming}
            placeholder={
              selectedKBs.length > 0
                ? t('playground.inputPlaceholder')
                : t('playground.inputPlaceholderNoKB')
            }
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t('playground.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
