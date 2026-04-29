import { useTranslation } from 'react-i18next';
import { Pencil, Trash2, Play, Clock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { type Subscription } from '@/services/subscription-api';

interface SubscriptionCardProps {
  sub: Subscription;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  onToggleActive: () => void;
  isTriggering: boolean;
  isUpdating: boolean;
}

export function SubscriptionCard({
  sub,
  onEdit,
  onDelete,
  onTrigger,
  onToggleActive,
  isTriggering,
  isUpdating,
}: SubscriptionCardProps) {
  const { t, i18n } = useTranslation();

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return t('subscriptions.neverRun');
    return new Date(dateStr).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US');
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardTitle className="text-base">{sub.name}</CardTitle>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onEdit}
            aria-label={t('subscriptions.edit')}
          >
            <Pencil className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 text-destructive hover:text-destructive"
            onClick={onDelete}
            aria-label={t('subscriptions.delete')}
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            onClick={onTrigger}
            disabled={isTriggering}
            aria-label={t('subscriptions.trigger')}
          >
            <Play className={cn('size-4', isTriggering && 'animate-pulse')} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {sub.query && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            {sub.query}
          </p>
        )}
        {sub.sources && sub.sources.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {sub.sources.map((s) => (
              <Badge key={s} variant="secondary" className="text-xs">
                {s.replace(/_/g, ' ')}
              </Badge>
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="outline">{t(`subscriptions.frequency.${sub.frequency}`)}</Badge>
          <span className="flex items-center gap-1">
            <Clock className="size-3" />
            {formatDate(sub.last_run_at)}
          </span>
          <span className="flex items-center gap-1">
            <RefreshCw className="size-3" />
            {t('subscriptions.totalFound', { count: sub.total_found })}
          </span>
        </div>
      </CardContent>
      <CardFooter className="flex items-center justify-between border-t pt-4">
        <button
          role="switch"
          aria-checked={sub.is_active}
          aria-label={
            sub.is_active
              ? t('subscriptions.active')
              : t('subscriptions.inactive')
          }
          onClick={onToggleActive}
          disabled={isUpdating}
          className={cn(
            'relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
            sub.is_active ? 'bg-primary' : 'bg-muted'
          )}
        >
          <span
            className={cn(
              'pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition-transform',
              sub.is_active ? 'translate-x-4' : 'translate-x-0.5'
            )}
          />
        </button>
        <span className="text-xs text-muted-foreground">
          {sub.is_active ? t('subscriptions.active') : t('subscriptions.inactive')}
        </span>
      </CardFooter>
    </Card>
  );
}
