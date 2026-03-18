import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  Plus,
  Play,
  Trash2,
  Pencil,
  Clock,
  RefreshCw,
  Rss,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  subscriptionApi,
  type Subscription,
  type SubscriptionCreate,
} from '@/services/subscription-api';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';

const SOURCE_OPTIONS = [
  { id: 'semantic_scholar', labelKey: 'subscriptions.sources.semanticScholar' },
  { id: 'openalex', labelKey: 'subscriptions.sources.openalex' },
  { id: 'arxiv', labelKey: 'subscriptions.sources.arxiv' },
  { id: 'crossref', labelKey: 'subscriptions.sources.crossref' },
] as const;

const FREQUENCY_OPTIONS = [
  { value: 'daily', labelKey: 'subscriptions.frequency.daily' },
  { value: 'weekly', labelKey: 'subscriptions.frequency.weekly' },
  { value: 'monthly', labelKey: 'subscriptions.frequency.monthly' },
] as const;

interface SubscriptionManagerProps {
  projectId: number;
}

export function SubscriptionManager({ projectId }: SubscriptionManagerProps) {
  const { t } = useTranslation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<Subscription | null>(null);
  const [form, setForm] = useState<SubscriptionCreate>({
    name: '',
    query: '',
    sources: [],
    frequency: 'weekly',
    max_results: 50,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['subscriptions', projectId],
    queryFn: () => subscriptionApi.list(projectId),
    enabled: !!projectId,
  });

  const createMutation = useToastMutation({
    mutationFn: (payload: SubscriptionCreate) =>
      subscriptionApi.create(projectId, payload),
    successMessage: t('common.createSuccess'),
    errorMessage: t('common.createFailed'),
    invalidateKeys: [['subscriptions', projectId]],
    onSuccess: () => {
      setDialogOpen(false);
      resetForm();
    },
  });

  const updateMutation = useToastMutation({
    mutationFn: ({
      subId,
      payload,
    }: {
      subId: number;
      payload: Partial<SubscriptionCreate & { is_active: boolean }>;
    }) => subscriptionApi.update(projectId, subId, payload),
    successMessage: t('common.updateSuccess'),
    errorMessage: t('common.updateFailed'),
    invalidateKeys: [['subscriptions', projectId]],
    onSuccess: () => {
      setDialogOpen(false);
      setEditingSub(null);
      resetForm();
    },
  });

  const deleteMutation = useToastMutation({
    mutationFn: (subId: number) => subscriptionApi.delete(projectId, subId),
    successMessage: t('common.deleteSuccess'),
    errorMessage: t('common.deleteFailed'),
    invalidateKeys: [['subscriptions', projectId]],
  });

  const triggerMutation = useToastMutation({
    mutationFn: (subId: number) => subscriptionApi.trigger(projectId, subId),
    successMessage: t('subscriptions.triggerSuccess'),
    errorMessage: t('subscriptions.triggerFailed'),
    invalidateKeys: [['subscriptions', projectId]],
  });

  const subscriptions: Subscription[] = data?.items ?? [];

  const resetForm = () => {
    setForm({
      name: '',
      query: '',
      sources: [],
      frequency: 'weekly',
      max_results: 50,
    });
  };

  const openCreateDialog = () => {
    setEditingSub(null);
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (sub: Subscription) => {
    setEditingSub(sub);
    setForm({
      name: sub.name,
      query: sub.query,
      sources: sub.sources ?? [],
      frequency: sub.frequency,
      max_results: sub.max_results,
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return;
    if (editingSub) {
      updateMutation.mutate({
        subId: editingSub.id,
        payload: form,
      });
    } else {
      createMutation.mutate(form);
    }
  };

  const toggleSource = (sourceId: string) => {
    setForm((prev) => ({
      ...prev,
      sources: prev.sources?.includes(sourceId)
        ? [...(prev.sources ?? []).filter((s) => s !== sourceId)]
        : [...(prev.sources ?? []), sourceId],
    }));
  };

  const handleToggleActive = (sub: Subscription) => {
    updateMutation.mutate({
      subId: sub.id,
      payload: { is_active: !sub.is_active },
    });
  };

  if (isLoading) {
    return <LoadingState message={t('common.loading')} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">{t('subscriptions.title')}</h2>
        <Button onClick={openCreateDialog}>
          <Plus className="size-4" />
          {t('subscriptions.newSubscription')}
        </Button>
      </div>

      {subscriptions.length === 0 ? (
        <EmptyState
          icon={Rss}
          title={t('subscriptions.empty')}
          action={{ label: t('subscriptions.newSubscription'), onClick: openCreateDialog }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subscriptions.map((sub) => (
            <SubscriptionCard
              key={sub.id}
              sub={sub}
              onEdit={() => openEditDialog(sub)}
              onDelete={() => deleteMutation.mutate(sub.id)}
              onTrigger={() => triggerMutation.mutate(sub.id)}
              onToggleActive={() => handleToggleActive(sub)}
              isTriggering={triggerMutation.isPending}
              isUpdating={updateMutation.isPending}
            />
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingSub
                ? t('subscriptions.editTitle')
                : t('subscriptions.createTitle')}
            </DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('subscriptions.name')}
              </label>
              <Input
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                placeholder={t('subscriptions.namePlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('subscriptions.query')}
              </label>
              <Input
                value={form.query}
                onChange={(e) => setForm((p) => ({ ...p, query: e.target.value }))}
                placeholder={t('subscriptions.queryPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">
                {t('subscriptions.sources')}
              </label>
              <div className="flex flex-wrap gap-2">
                {SOURCE_OPTIONS.map((opt) => (
                  <label
                    key={opt.id}
                    className="flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  >
                    <input
                      type="checkbox"
                      checked={form.sources?.includes(opt.id)}
                      onChange={() => toggleSource(opt.id)}
                      className="rounded"
                    />
                    {t(opt.labelKey)}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('subscriptions.frequencyLabel')}
                </label>
                <Select
                  value={form.frequency}
                  onValueChange={(v) =>
                    setForm((p) => ({ ...p, frequency: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FREQUENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {t(opt.labelKey)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {t('subscriptions.maxResults')}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={form.max_results}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      max_results: Math.min(
                        200,
                        Math.max(1, parseInt(e.target.value, 10) || 1)
                      ),
                    }))
                  }
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDialogOpen(false);
                setEditingSub(null);
                resetForm();
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!form.name.trim() || createMutation.isPending || updateMutation.isPending}
            >
              {editingSub
                ? t('subscriptions.save')
                : t('subscriptions.create')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface SubscriptionCardProps {
  sub: Subscription;
  onEdit: () => void;
  onDelete: () => void;
  onTrigger: () => void;
  onToggleActive: () => void;
  isTriggering: boolean;
  isUpdating: boolean;
}

function SubscriptionCard({
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
