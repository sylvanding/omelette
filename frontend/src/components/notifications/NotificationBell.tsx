import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCheck, ExternalLink, Loader2 } from 'lucide-react';
import { notificationsApi, type NotificationItem } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
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

export default function NotificationBell() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId ? Number(projectId) : null;
  const queryClient = useQueryClient();
  const [isOpen, setIsOpen] = useState(false);

  const { data } = useQuery({
    queryKey: queryKeys.notifications.unread(pid!),
    queryFn: () => notificationsApi.list(pid!, true),
    enabled: !!pid,
    refetchInterval: 30_000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(pid!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(pid!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread(pid!) });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationsApi.markAllRead(pid!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all(pid!) });
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.unread(pid!) });
      setIsOpen(false);
    },
  });

  const unreadCount = data?.unread_count ?? 0;
  const items = data?.items ?? [];

  if (!pid) {
    return (
      <button
        aria-label={t('notifications.title', 'Notifications')}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="size-4" />
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        aria-label={t('notifications.title', 'Notifications')}
        onClick={() => setIsOpen(!isOpen)}
        className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
      >
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown panel */}
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-lg border bg-popover shadow-lg">
            <div className="flex items-center justify-between border-b px-4 py-2">
              <span className="text-sm font-semibold">
                {t('notifications.title', 'Notifications')}
              </span>
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto px-2 py-1 text-xs"
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

            <div className="max-h-80 overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {t('notifications.noUnread', 'No unread notifications')}
                </div>
              ) : (
                items.map((item) => (
                  <NotificationDropdownItem
                    key={item.id}
                    notification={item}
                    onMarkRead={() => markReadMutation.mutate(item.id)}
                  />
                ))
              )}
            </div>

            <div className="border-t px-4 py-2">
              <a
                href={`/projects/${projectId}/notifications`}
                className="flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ExternalLink className="size-3" />
                {t('notifications.viewAll', 'View all notifications')}
              </a>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function NotificationDropdownItem({
  notification,
  onMarkRead,
}: {
  notification: NotificationItem;
  onMarkRead: () => void;
}) {
  const timeAgo = notification.created_at
    ? formatTimeAgo(notification.created_at)
    : '';

  return (
    <div
      className={`border-b px-4 py-3 last:border-b-0 ${
        !notification.is_read ? 'bg-accent/50' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{notification.title}</p>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{notification.body}</p>
          {timeAgo && (
            <span className="mt-0.5 text-[10px] text-muted-foreground">{timeAgo}</span>
          )}
        </div>
        {!notification.is_read && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onMarkRead();
            }}
            className="shrink-0 text-muted-foreground hover:text-foreground"
            aria-label="Mark as read"
          >
            <CheckCheck className="size-3" />
          </button>
        )}
      </div>
    </div>
  );
}
