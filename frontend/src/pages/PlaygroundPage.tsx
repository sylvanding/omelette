import { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, ChevronDown, Sparkles, Square, BookOpen, Quote, List, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import ChatInput from '@/components/playground/ChatInput';
import MessageBubble from '@/components/playground/MessageBubble';
import { streamChat, conversationApi } from '@/services/chat-api';
import { projectApi } from '@/services/api';
import type { ToolMode, Citation } from '@/types/chat';
import { isCitation, normalizeCitation } from '@/types/chat';
import type { LoadingStage } from '@/components/playground/MessageLoadingStages';
import type { A2UIMessage } from '@a2ui-sdk/types/0.8';

interface LocalMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  loadingStage?: LoadingStage;
  a2uiMessages?: A2UIMessage[];
}

export default function PlaygroundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId: routeConvId } = useParams<{ conversationId: string }>();

  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [toolMode, setToolMode] = useState<ToolMode>('qa');
  const [selectedKBs, setSelectedKBs] = useState<number[]>([]);
  const [conversationId, setConversationId] = useState<number | undefined>();
  const [isRestoringConversation, setIsRestoringConversation] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const hasRestoredRef = useRef<string | undefined>(undefined);

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list(1, 100),
  });
  const projects = projectsData?.items ?? [];

  useEffect(() => {
    if (!routeConvId || hasRestoredRef.current === routeConvId) return;
    hasRestoredRef.current = routeConvId;
    const convIdNum = Number(routeConvId);
    if (Number.isNaN(convIdNum)) return;

    setIsRestoringConversation(true);
    conversationApi.get(convIdNum)
      .then((conv) => {
        setConversationId(conv.id);
        setToolMode((conv.tool_mode as ToolMode) || 'qa');
        if (conv.knowledge_base_ids?.length) {
          setSelectedKBs(conv.knowledge_base_ids);
        }
        const restored: LocalMessage[] = (conv.messages ?? []).map((m) => ({
          id: `restored-${m.id}`,
          role: m.role as 'user' | 'assistant',
          content: m.content,
          citations: (m.citations as Citation[]) ?? [],
        }));
        setMessages(restored);
      })
      .catch(() => {
        setMessages([]);
        setConversationId(undefined);
      })
      .finally(() => setIsRestoringConversation(false));
  }, [routeConvId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const pendingDeltaRef = useRef('');
  const flushTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const assistantIdRef = useRef<string>('');

  const flushDelta = useCallback(() => {
    if (!pendingDeltaRef.current || !assistantIdRef.current) return;
    const delta = pendingDeltaRef.current;
    const aid = assistantIdRef.current;
    pendingDeltaRef.current = '';
    setMessages((prev) =>
      prev.map((m) =>
        m.id === aid
          ? { ...m, content: m.content + delta, loadingStage: 'generating' as LoadingStage }
          : m,
      ),
    );
  }, []);

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
        loadingStage: 'searching',
      };

      assistantIdRef.current = assistantMsg.id;
      pendingDeltaRef.current = '';

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
            pendingDeltaRef.current += delta;
            if (!flushTimerRef.current) {
              flushTimerRef.current = setTimeout(() => {
                flushTimerRef.current = undefined;
                flushDelta();
              }, 80);
            }
          } else if (event.event === 'citation') {
            if (!isCitation(event.data)) {
              console.warn('Invalid citation event', event.data);
              continue;
            }
            const citation = normalizeCitation(event.data as Record<string, unknown>);
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? {
                      ...m,
                      citations: [...(m.citations ?? []), citation],
                      loadingStage: 'citations' as LoadingStage,
                    }
                  : m,
              ),
            );
          } else if (event.event === 'a2ui_surface') {
            const a2uiMsg = event.data as unknown as A2UIMessage;
            if (a2uiMsg.beginRendering || a2uiMsg.surfaceUpdate || a2uiMsg.dataModelUpdate) {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsg.id
                    ? {
                        ...m,
                        a2uiMessages: [...(m.a2uiMessages ?? []), a2uiMsg],
                      }
                    : m,
                ),
              );
            }
          } else if (event.event === 'message_end') {
            if (flushTimerRef.current) {
              clearTimeout(flushTimerRef.current);
              flushTimerRef.current = undefined;
            }
            flushDelta();

            const cid = (event.data as { conversation_id?: number })
              .conversation_id;
            if (cid) {
              setConversationId(cid);
              if (!routeConvId) {
                navigate(`/chat/${cid}`, { replace: true });
              }
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          toast.error(t('playground.streamError'));
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content || t('playground.streamError') }
                : m,
            ),
          );
        }
      } finally {
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = undefined;
        }
        flushDelta();

        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsg.id
              ? { ...m, isStreaming: false, loadingStage: 'complete' as LoadingStage }
              : m,
          ),
        );
        setIsStreaming(false);
        abortRef.current = null;
        assistantIdRef.current = '';
      }
    },
    [conversationId, selectedKBs, toolMode, t, routeConvId, navigate, flushDelta],
  );

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleNewChat = () => {
    abortRef.current?.abort();
    setMessages([]);
    setConversationId(undefined);
    setIsStreaming(false);
    hasRestoredRef.current = undefined;
    navigate('/', { replace: true });
  };

  const toggleKB = (id: number) => {
    setSelectedKBs((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const isEmpty = messages.length === 0;

  if (isRestoringConversation) {
    return <LoadingState className="h-full" message={t('common.loading')} />;
  }

  if (routeConvId && !conversationId && !isRestoringConversation && hasRestoredRef.current === routeConvId) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t('history.conversationNotFound', { defaultValue: '对话未找到' })}
        description={t('history.conversationNotFoundDesc', { defaultValue: '该对话可能已被删除。' })}
        action={{ label: t('playground.newChat'), onClick: handleNewChat }}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-lg font-semibold">Playground</h1>
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
                <LoadingState className="py-4" />
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

              <div className="mx-auto mt-8 grid max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
                {([
                  { text: t('playground.suggestions.summarize'), icon: BookOpen, color: 'text-blue-600 dark:text-blue-400', bg: 'bg-blue-500/10' },
                  { text: t('playground.suggestions.citation'), icon: Quote, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10' },
                  { text: t('playground.suggestions.outline'), icon: List, color: 'text-purple-600 dark:text-purple-400', bg: 'bg-purple-500/10' },
                  { text: t('playground.suggestions.gap'), icon: Target, color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10' },
                ] as const).map((item) => (
                  <motion.button
                    key={item.text}
                    onClick={() => handleSend(item.text)}
                    disabled={isStreaming}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-left transition-all hover:border-primary/30 hover:shadow-md dark:hover:bg-muted/40"
                  >
                    <div className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${item.bg}`}>
                      <item.icon className={`size-4 ${item.color}`} />
                    </div>
                    <span className="text-sm text-muted-foreground leading-relaxed">{item.text}</span>
                  </motion.button>
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
                    loadingStage={msg.loadingStage}
                    a2uiMessages={msg.a2uiMessages}
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
          {isStreaming ? (
            <div className="flex justify-center mb-2">
              <Button variant="outline" size="sm" onClick={handleStop} className="gap-1.5">
                <Square className="size-3" />
                {t('playground.stop', { defaultValue: '停止生成' })}
              </Button>
            </div>
          ) : null}
          <ChatInput
            onSend={handleSend}
            isLoading={isStreaming}
            placeholder={
              selectedKBs.length > 0
                ? t('playground.inputPlaceholder')
                : t('playground.inputPlaceholderNoKB')
            }
            toolMode={toolMode}
            onToolModeChange={setToolMode}
            selectedKBs={selectedKBs
              .map((id) => {
                const p = projects.find((proj: { id: number; name: string }) => proj.id === id);
                return p ? { id: p.id, name: p.name } : null;
              })
              .filter(Boolean) as { id: number; name: string }[]
            }
            onRemoveKB={toggleKB}
          />
          <p className="mt-2 text-center text-xs text-muted-foreground">
            {t('playground.disclaimer')}
          </p>
        </div>
      </div>
    </div>
  );
}
