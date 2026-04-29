import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { Plus, Rss } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  subscriptionApi,
  type Subscription,
  type SubscriptionCreate,
} from '@/services/subscription-api';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { SubscriptionCard } from './SubscriptionCard';
import { SubscriptionFormDialog } from './SubscriptionFormDialog';

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

      <SubscriptionFormDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setEditingSub(null);
            resetForm();
          }
          setDialogOpen(open);
        }}
        editingSub={editingSub}
        form={form}
        onSubmit={handleSubmit}
        onFormChange={(changes) => setForm((prev) => ({ ...prev, ...changes }))}
        onToggleSource={toggleSource}
        isPending={createMutation.isPending || updateMutation.isPending}
      />
    </div>
  );
}
