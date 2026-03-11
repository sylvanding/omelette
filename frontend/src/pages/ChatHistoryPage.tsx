import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Trash2, Search, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { conversationApi } from '@/services/chat-api';
import type { Conversation } from '@/types/chat';

const toolModeLabels: Record<string, string> = {
  qa: '问答',
  citation_lookup: '引用查找',
  review_outline: '综述大纲',
  gap_analysis: '研究空白',
};

export default function ChatHistoryPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationApi.list(1, 100),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => conversationApi.delete(id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['conversations'] }),
  });

  const conversations: Conversation[] = data?.data?.items ?? [];
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
    if (mins < 1) return '刚刚';
    if (mins < 60) return `${mins} 分钟前`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} 小时前`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days} 天前`;
    return d.toLocaleDateString('zh-CN');
  };

  return (
    <div className="h-full p-6">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">对话历史</h1>
          <p className="text-sm text-muted-foreground">查看和管理你的历史对话</p>
        </div>

        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="搜索对话..."
              className="pl-9"
            />
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-14rem)]">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground">
              加载中...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-12 text-center">
              <MessageSquare className="mx-auto mb-3 size-12 text-muted-foreground" />
              <h2 className="text-lg font-semibold">
                {search ? '没有找到匹配的对话' : '还没有对话记录'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {search ? '试试其他搜索词' : '去 Playground 开始你的第一次对话'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((conv, i) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  className="group flex items-start justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent/50"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-medium">{conv.title}</h3>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {toolModeLabels[conv.tool_mode] ?? conv.tool_mode}
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
                        {conv.messages?.length ?? 0} 条消息
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm('确定删除这条对话？'))
                        deleteMutation.mutate(conv.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className="ml-2 rounded-md p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </motion.div>
              ))}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
