import { useState, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  FilePlus,
  FileMinus,
  FileEdit,
  Star,
  Tag,
  Search,
  ListTodo,
  Cpu,
  PenLine,
  ArrowDownToLine,
  Loader2,
  FileText,
} from 'lucide-react';
import { activityApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { ActivityLog } from '@/types';

const ACTION_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
  paper_created: { icon: FilePlus, color: 'text-green-500' },
  paper_deleted: { icon: FileMinus, color: 'text-red-500' },
  paper_updated: { icon: FileEdit, color: 'text-blue-500' },
  rating_changed: { icon: Star, color: 'text-yellow-500' },
  tag_added: { icon: Tag, color: 'text-purple-500' },
  tag_removed: { icon: Tag, color: 'text-purple-500' },
  keyword_added: { icon: Tag, color: 'text-orange-500' },
  search_executed: { icon: Search, color: 'text-cyan-500' },
  rag_indexed: { icon: Cpu, color: 'text-indigo-500' },
  task_completed: { icon: ListTodo, color: 'text-emerald-500' },
  note_updated: { icon: PenLine, color: 'text-pink-500' },
  status_changed: { icon: ArrowDownToLine, color: 'text-sky-500' },
  writing_generated: { icon: PenLine, color: 'text-violet-500' },
};

const PAGE_SIZE = 20;

export default function ActivityFeedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const [actionFilter, setActionFilter] = useState<string>('');

  const filters = useMemo(
    () => ({
      page: 1,
      page_size: 500,
      ...(actionFilter ? { action: actionFilter } : {}),
    }),
    [actionFilter],
  );

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: queryKeys.activities.list(pid, filters),
    queryFn: ({ pageParam }) =>
      activityApi.list(pid, { page: pageParam as number, page_size: PAGE_SIZE, ...(actionFilter ? { action: actionFilter } : {}) }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const nextPage = allPages.length + 1;
      return nextPage <= lastPage.total_pages ? nextPage : undefined;
    },
    enabled: !!pid,
  });

  const activities = useMemo(
    () => data?.pages.flatMap((page) => page.items) ?? [],
    [data?.pages],
  );

  const groupedByDate = useMemo(() => {
    const map = new Map<string, ActivityLog[]>();
    for (const activity of activities) {
      const date = new Date(activity.created_at).toLocaleDateString();
      if (!map.has(date)) map.set(date, []);
      map.get(date)!.push(activity);
    }
    return Array.from(map.entries()).map(([date, activities]) => ({
      date,
      activities,
    }));
  }, [activities]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleActivityClick = (activity: ActivityLog) => {
    if (activity.entity_type === 'paper' && activity.entity_id) {
      navigate(`/projects/${pid}/papers/${activity.entity_id}/read`);
    }
  };

  if (isLoading) {
    return <LoadingState />;
  }

  if (activities.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('activity.empty')}
        description={t('activity.emptyHint')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Select value={actionFilter} onValueChange={(val) => setActionFilter(val === 'all' ? '' : val)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder={t('activity.filterAll')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('activity.filterAll')}</SelectItem>
            {Object.keys(ACTION_CONFIG).map((action) => (
              <SelectItem key={action} value={action}>
                {t(`activity.actions.${action}`, action)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-6">
        {groupedByDate.map((group) => (
          <div key={group.date} className="space-y-3">
            <h3 className="text-sm font-medium text-muted-foreground">
              {formatDateHeader(group.date)}
            </h3>
            <div className="space-y-2">
              {group.activities.map((activity) => (
                <ActivityItem
                  key={activity.id}
                  activity={activity}
                  onClick={() => handleActivityClick(activity)}
                  t={t}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasNextPage && (
        <div className="flex justify-center pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleLoadMore}
            disabled={isFetchingNextPage}
          >
            {isFetchingNextPage && <Loader2 className="mr-2 size-4 animate-spin" />}
            {t('activity.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}

interface ActivityItemProps {
  activity: ActivityLog;
  onClick: () => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

function ActivityItem({ activity, onClick, t }: ActivityItemProps) {
  const config = ACTION_CONFIG[activity.action] ?? {
    icon: FileText,
    color: 'text-muted-foreground',
  };
  const Icon = config.icon;

  const title = getActivityTitle(activity, t);
  const time = formatRelativeTime(activity.created_at);

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-3 rounded-lg border bg-card px-4 py-3 text-left transition-colors hover:bg-accent/50',
        activity.entity_type === 'paper' && 'cursor-pointer',
      )}
      onClick={onClick}
    >
      <div className={cn('shrink-0', config.color)}>
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        {activity.details?.title && (
          <p className="truncate text-xs text-muted-foreground">
            {activity.details.title as string}
          </p>
        )}
      </div>
      <time className="shrink-0 text-xs text-muted-foreground">{time}</time>
    </button>
  );
}

function getActivityTitle(activity: ActivityLog, t: (key: string, params?: Record<string, unknown>) => string): string {
  const actionKey = `activity.actions.${activity.action}`;
  const translated = t(actionKey, activity.action);
  if (translated !== activity.action) return translated;

  const title = activity.details?.title as string | undefined;
  return `${activity.action.replace(/_/g, ' ')}${title ? `: ${title}` : ''}`;
}

function formatRelativeTime(dateStr: string): string {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString();
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (date.toLocaleDateString() === today.toLocaleDateString()) return 'Today';
  if (date.toLocaleDateString() === yesterday.toLocaleDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
