import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { type SubscriptionCreate } from '@/services/subscription-api';

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

interface SubscriptionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingSub: { name: string } | null;
  form: SubscriptionCreate;
  onSubmit: () => void;
  onFormChange: (changes: Partial<SubscriptionCreate>) => void;
  onToggleSource: (sourceId: string) => void;
  isPending: boolean;
}

export function SubscriptionFormDialog({
  open,
  onOpenChange,
  editingSub,
  form,
  onSubmit,
  onFormChange,
  onToggleSource,
  isPending,
}: SubscriptionFormDialogProps) {
  const { t } = useTranslation();

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onChange={(e) => onFormChange({ name: e.target.value })}
              placeholder={t('subscriptions.namePlaceholder')}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">
              {t('subscriptions.query')}
            </label>
            <Input
              value={form.query}
              onChange={(e) => onFormChange({ query: e.target.value })}
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
                    onChange={() => onToggleSource(opt.id)}
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
                onValueChange={(v) => onFormChange({ frequency: v })}
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
                  onFormChange({
                    max_results: Math.min(
                      200,
                      Math.max(1, parseInt(e.target.value, 10) || 1)
                    ),
                  })
                }
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
          >
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onSubmit}
            disabled={!form.name.trim() || isPending}
          >
            {editingSub
              ? t('subscriptions.save')
              : t('subscriptions.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
