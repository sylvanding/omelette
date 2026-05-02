import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff, CheckCheck, X, ExternalLink, Loader2 } from 'lucide-react';
import { notificationsApi, type NotificationItem } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';
import { useToastMutation } from '@/hooks/use-toast-mutation';
function formatTimeAgo(dateStr: string): string {
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

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.notifications.all(pid),
    queryFn: () => notificationsApi.list(pid),
  });

  const markReadMutation = useToastMutation({
    mutationFn: (id: number) => notificationsApi.markRead(pid, id),
    invalidateKeys: [queryKeys.notifications.all(pid)],
  });

  const markAllReadMutation = useToastMutation({
    mutationFn: () => notificationsApi.markAllRead(pid),
    invalidateKeys: [queryKeys.notifications.all(pid)],
    successMessage: t('notifications.markedAllRead', 'All notifications marked as read'),
  });

  const dismissMutation = useToastMutation({
    mutationFn: (id: number) => notificationsApi.dismiss(pid, id),
    invalidateKeys: [queryKeys.notifications.all(pid)],
  });

  if (isLoading) {
    return (
      <PageLayout title={t('notifications.title', 'Notifications')}>
        <LoadingState />
      </PageLayout>
    );
  }

  const items = data?.items ?? [];
  const unreadCount = data?.unread_count ?? 0;

  return (
    <PageLayout title={t('notifications.title', 'Notifications')}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {unreadCount > 0
              ? t('notifications.unreadCount', '{{count}} unread', { count: unreadCount })
              : t('notifications.allRead', 'All caught up!')}
          </p>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
            >
              {markAllReadMutation.isPending ? (
                <Loader2 className="mr-1 size-3 animate-spin" />
              ) : (
                <CheckCheck className="mr-1 size-3" />
              )}
              {t('notifications.markAllRead', 'Mark all read')}
            </Button>
          )}
        </div>

        {/* Notification list */}
        {items.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-2">
            {items.map((notification) => (
              <NotificationCard
                key={notification.id}
                notification={notification}
                onMarkRead={() => markReadMutation.mutate(notification.id)}
                onDismiss={() => dismissMutation.mutate(notification.id)}
                isMarkingRead={markReadMutation.isPending && markReadMutation.variables === notification.id}
                isDismissing={dismissMutation.isPending && dismissMutation.variables === notification.id}
              />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function NotificationCard({
  notification,
  onMarkRead,
  onDismiss,
  isMarkingRead,
  isDismissing,
}: {
  notification: NotificationItem;
  onMarkRead: () => void;
  onDismiss: () => void;
  isMarkingRead: boolean;
  isDismissing: boolean;
}) {
  const { t } = useTranslation();

  const timeAgo = notification.created_at ? formatTimeAgo(notification.created_at) : '';

  const typeLabels: Record<string, string> = {
    subscription_match: t('notifications.types.subscriptionMatch', 'Subscription Match'),
    system: t('notifications.types.system', 'System'),
    paper_update: t('notifications.types.paperUpdate', 'Paper Update'),
  };

  return (
    <div
      className={`flex items-start gap-3 rounded-lg border p-4 transition-colors ${
        !notification.is_read ? 'bg-accent/50' : 'bg-card'
      }`}
    >
      <div className="mt-0.5 shrink-0">
        {notification.is_read ? (
          <BellOff className="size-4 text-muted-foreground" />
        ) : (
          <Bell className="size-4 text-primary" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm ${!notification.is_read ? 'font-semibold' : 'font-medium'}`}>
            {notification.title}
          </h3>
          <Badge variant="outline" className="text-xs">
            {typeLabels[notification.type] ?? notification.type}
          </Badge>
          {!notification.is_read && (
            <span className="size-2 rounded-full bg-primary" />
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{notification.body}</p>
        {timeAgo && (
          <span className="mt-1 text-xs text-muted-foreground">{timeAgo}</span>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {notification.paper_id && (
          <Button variant="ghost" size="icon" className="size-7" aria-label="View paper">
            <ExternalLink className="size-3" />
          </Button>
        )}
        {!notification.is_read && (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            onClick={onMarkRead}
            disabled={isMarkingRead}
            aria-label="Mark as read"
          >
            {isMarkingRead ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <CheckCheck className="size-3" />
            )}
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onDismiss}
          disabled={isDismissing}
          aria-label="Dismiss"
        >
          {isDismissing ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <X className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

function EmptyState() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <Bell className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">{t('notifications.emptyTitle', 'No notifications')}</h3>
      <p className="text-sm text-muted-foreground">
        {t('notifications.emptyDescription', 'When subscriptions find new papers, they will appear here')}
      </p>
    </div>
  );
}
