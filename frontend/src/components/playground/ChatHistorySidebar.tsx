import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, PanelLeftClose, Clock, MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { conversationApi } from '@/services/chat-api';
import type { Conversation } from '@/types/chat';

interface ChatHistorySidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  currentConversationId?: number;
  onSelectConversation: (id: number) => void;
  onNewChat: () => void;
}

export default function ChatHistorySidebar({
  collapsed,
  onToggle,
  currentConversationId,
  onSelectConversation,
  onNewChat,
}: ChatHistorySidebarProps) {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationApi.list(1, 50),
    staleTime: 10_000,
  });

  const conversations: Conversation[] = data?.items ?? [];
  const filtered = search
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('history.timeJustNow');
    if (mins < 60) return t('history.timeMinutes', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('history.timeHours', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('history.timeDays', { count: days });
    return d.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US');
  };

  if (collapsed) {
    return null;
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/30">
      <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
        <h2 className="text-sm font-semibold">{t('history.title')}</h2>
        <Button variant="ghost" size="icon" className="size-7" onClick={onToggle}>
          <PanelLeftClose className="size-4" />
        </Button>
      </div>

      <div className="flex items-center gap-1.5 border-b border-border/50 px-2 py-2">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5 text-xs" onClick={onNewChat}>
          <Plus className="size-3.5" />
          {t('playground.newChat')}
        </Button>
      </div>

      <div className="px-2 py-2">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="h-8 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 px-2 pb-2">
          {isLoading ? (
            <div className="space-y-2 px-1 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <MessageSquare className="mx-auto mb-2 size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {search ? t('history.noMatch') : t('history.empty')}
              </p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={cn(
                  'flex w-full flex-col gap-1 rounded-md px-2.5 py-2 text-left transition-colors',
                  currentConversationId === conv.id
                    ? 'bg-accent'
                    : 'hover:bg-accent/50',
                )}
              >
                <span className="truncate text-sm font-medium">{conv.title}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {t(`playground.toolMode.${conv.tool_mode}`, { defaultValue: conv.tool_mode })}
                  </Badge>
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="size-2.5" />
                    {formatTime(conv.updated_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}
