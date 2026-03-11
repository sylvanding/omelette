import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { MessageSquare, Trash2, Search, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { conversationApi } from '@/services/chat-api';
import type { Conversation } from '@/types/chat';

export default function ChatHistoryPage() {
  const { t, i18n } = useTranslation();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationApi.list(1, 100),
  });

  const deleteMutation = useToastMutation({
    mutationFn: (id: number) => conversationApi.delete(id),
    successMessage: t('common.deleteSuccess'),
    errorMessage: t('common.deleteFailed'),
    invalidateKeys: [['conversations']],
  });

  const conversations: Conversation[] = data?.items ?? [];
  const filtered = search
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const formatDate = (dateStr: string) => {
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

  return (
    <div className="h-full p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">{t('history.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('history.subtitle')}</p>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-14rem)]">
          {isLoading ? (
            <LoadingState message={t('common.loading')} />
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={search ? t('history.noMatch') : t('history.empty')}
              description={search ? t('history.noMatchDesc') : t('history.emptyDesc')}
            />
          ) : (
            <div className="space-y-2">
              {filtered.map((conv, i) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link
                    to={`/chat/${conv.id}`}
                    className="group flex items-start justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/30 hover:bg-accent/50"
                  >
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-medium">{conv.title}</h3>
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        <Badge variant="secondary" className="text-xs">
                          {t(`playground.toolMode.${conv.tool_mode}`, { defaultValue: conv.tool_mode })}
                        </Badge>
                        {conv.model && (
                          <Badge variant="outline" className="text-xs">
                            {conv.model}
                          </Badge>
                        )}
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          {formatDate(conv.updated_at)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {t('history.messageCount', { count: conv.messages?.length ?? 0 })}
                        </span>
                      </div>
                    </div>
                    <ConfirmDialog
                      trigger={
                        <button
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
                          disabled={deleteMutation.isPending}
                          className="ml-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      }
                      title={t('common.confirmDeleteTitle')}
                      description={t('history.confirmDelete')}
                      confirmText={t('common.delete')}
                      cancelText={t('common.cancel')}
                      onConfirm={() => deleteMutation.mutate(conv.id)}
                      destructive
                    />
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
