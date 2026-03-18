import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
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
import MessageBubbleV2 from '@/components/playground/MessageBubbleV2';
import ChatHistorySidebar from '@/components/playground/ChatHistorySidebar';
import { useSidebarCollapsed } from '@/components/playground/sidebar-utils';
import { SidebarToggleButton } from '@/components/playground/SidebarToggleButton';
import { conversationApi } from '@/services/chat-api';
import { projectApi } from '@/services/api';
import { useChatStream } from '@/hooks/use-chat-stream';
import type { ToolMode, OmeletteUIMessage, Citation } from '@/types/chat';

export default function PlaygroundPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { conversationId: routeConvId } = useParams<{ conversationId: string }>();

  const [toolModeOverride, setToolModeOverride] = useState<ToolMode | null>(null);
  const [selectedKBsOverride, setSelectedKBsOverride] = useState<number[] | null>(null);
  const [newConversationId, setNewConversationId] = useState<number | undefined>();
  const [sidebarCollapsed, setSidebarCollapsed] = useSidebarCollapsed();
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: projectsData, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectApi.list(1, 100),
  });
  const projects = projectsData?.items ?? [];

  const convIdNum = routeConvId ? Number(routeConvId) : undefined;
  const { data: restoredConv, isLoading: isRestoringConversation, isError: restoreFailed } = useQuery({
    queryKey: ['conversation', convIdNum],
    queryFn: () => conversationApi.get(convIdNum!),
    enabled: convIdNum != null && !Number.isNaN(convIdNum),
  });

  const conversationId = restoredConv?.id ?? newConversationId;
  const toolMode = toolModeOverride ?? (restoredConv?.tool_mode as ToolMode) ?? 'qa';
  const selectedKBs = selectedKBsOverride ?? restoredConv?.knowledge_base_ids ?? [];

  const setToolMode = useCallback((mode: ToolMode) => setToolModeOverride(mode), []);
  const setSelectedKBs = useCallback((fn: number[] | ((prev: number[]) => number[])) => {
    setSelectedKBsOverride((prev) =>
      typeof fn === 'function' ? fn(prev ?? []) : fn,
    );
  }, []);

  const restoredMessages = useMemo((): OmeletteUIMessage[] => {
    if (!restoredConv) return [];
    return (restoredConv.messages ?? []).map((m) => {
      const parts: OmeletteUIMessage['parts'] = [{ type: 'text' as const, text: m.content }];
      if (m.role === 'assistant' && m.citations) {
        for (const cit of m.citations as Citation[]) {
          parts.push({ type: 'data-citation' as const, id: `cit-${cit.index}`, data: cit });
        }
      }
      return {
        id: `restored-${m.id}`,
        role: m.role as 'user' | 'assistant',
        parts,
      };
    });
  }, [restoredConv]);

  const handleConversationId = useCallback(
    (cid: number) => {
      setNewConversationId(cid);
      if (!routeConvId) {
        // Update URL without React Router navigation to avoid unmount/remount
        // during streaming. The key="playground" on the Route prevents remount
        // for sidebar clicks, but replaceState is safer during active streams.
        window.history.replaceState(null, '', `/chat/${cid}`);
      }
    },
    [routeConvId],
  );

  const {
    messages,
    sendMessage,
    stop,
    isStreaming,
    setMessages,
  } = useChatStream({
    conversationId,
    knowledgeBaseIds: selectedKBs,
    toolMode,
    initialMessages: restoredMessages.length > 0 ? restoredMessages : undefined,
    onConversationId: handleConversationId,
    onError: (err) => toast.error(err.message || t('playground.streamError')),
  });

  // When navigating to a different conversation via sidebar, load its messages
  // into the existing Chat instance (which is preserved thanks to key="playground").
  const prevConvIdRef = useRef(convIdNum);
  useEffect(() => {
    if (convIdNum !== prevConvIdRef.current) {
      prevConvIdRef.current = convIdNum;
      setNewConversationId(undefined);
      setToolModeOverride(null);
      setSelectedKBsOverride(null);
    }
  }, [convIdNum]);

  useEffect(() => {
    if (restoredConv && restoredMessages.length > 0 && convIdNum != null) {
      setMessages(restoredMessages);
    }
  }, [restoredConv, restoredMessages, convIdNum, setMessages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(
    (message: string) => {
      sendMessage(message);
    },
    [sendMessage],
  );

  const handleStop = useCallback(() => {
    stop();
  }, [stop]);

  const handleNewChat = () => {
    stop();
    setMessages([]);
    setNewConversationId(undefined);
    setToolModeOverride(null);
    setSelectedKBsOverride(null);
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

  if (routeConvId && !conversationId && !isRestoringConversation && restoreFailed) {
    return (
      <EmptyState
        icon={Sparkles}
        title={t('history.conversationNotFound')}
        description={t('history.conversationNotFoundDesc')}
        action={{ label: t('playground.newChat'), onClick: handleNewChat }}
        className="h-full"
      />
    );
  }

  return (
    <div className="flex h-full">
      <ChatHistorySidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentConversationId={conversationId}
        onSelectConversation={(id) => navigate(`/chat/${id}`)}
        onNewChat={handleNewChat}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      {/* Top bar */}
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <div className="flex items-center gap-2">
          <SidebarToggleButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
          <h1 className="text-lg font-semibold">{t('playground.title')}</h1>
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
      <ScrollArea className="min-h-0 flex-1">
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
                  { text: t('playground.suggestions.summarize'), icon: BookOpen, color: 'text-blue-700 dark:text-blue-300', gradient: 'from-blue-50 to-violet-50 dark:from-blue-950/40 dark:to-violet-950/40' },
                  { text: t('playground.suggestions.citation'), icon: Quote, color: 'text-emerald-700 dark:text-emerald-300', gradient: 'from-emerald-50 to-teal-50 dark:from-emerald-950/40 dark:to-teal-950/40' },
                  { text: t('playground.suggestions.outline'), icon: List, color: 'text-violet-700 dark:text-violet-300', gradient: 'from-violet-50 to-purple-50 dark:from-violet-950/40 dark:to-purple-950/40' },
                  { text: t('playground.suggestions.gap'), icon: Target, color: 'text-rose-700 dark:text-rose-300', gradient: 'from-rose-50 to-pink-50 dark:from-rose-950/40 dark:to-pink-950/40' },
                ] as const).map((item) => (
                  <motion.button
                    key={item.text}
                    onClick={() => handleSend(item.text)}
                    disabled={isStreaming}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={`flex items-start gap-3 rounded-xl border border-border/50 bg-gradient-to-br ${item.gradient} p-4 text-left transition-all hover:border-primary/30 hover:shadow-md`}
                  >
                    <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/60 dark:bg-white/10">
                      <item.icon className={`size-4 ${item.color}`} />
                    </div>
                    <span className="text-sm text-foreground/80 leading-relaxed">{item.text}</span>
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
                  <MessageBubbleV2
                    message={msg}
                    isStreaming={isStreaming && msg === messages[messages.length - 1] && msg.role === 'assistant'}
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
                {t('playground.stop')}
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
    </div>
  );
}
