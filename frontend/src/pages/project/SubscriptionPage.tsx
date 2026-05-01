import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Rss, Plus, Play, Trash2, Edit, Loader2,
  Clock, RefreshCw, X, Bell, Globe,
} from 'lucide-react';
import { subscriptionApi } from '@/services/api';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';

type Frequency = 'daily' | 'weekly' | 'monthly';

export default function SubscriptionPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [showCreate, setShowCreate] = useState(false);
  const [editingSub, setEditingSub] = useState<number | null>(null);
  const [runResults, setRunResults] = useState<Map<number, Record<string, number>>>(new Map());

  const { data: subsData, isLoading } = useQuery({
    queryKey: ['subscriptions', pid],
    queryFn: () => subscriptionApi.list(pid, { page: 1, page_size: 50 }),
  });

  const subscriptions = subsData?.items ?? [];

  const deleteMutation = useToastMutation({
    mutationFn: (subId: number) => subscriptionApi.delete(pid, subId),
    successMessage: 'Subscription deleted',
    errorMessage: 'Failed to delete subscription',
    invalidateKeys: [['subscriptions', pid]],
  });

  const triggerMutation = useToastMutation({
    mutationFn: ({ subId, autoImport }: { subId: number; autoImport: boolean }) =>
      subscriptionApi.trigger(pid, subId, 7, autoImport),
    successMessage: 'Subscription update completed',
    errorMessage: 'Failed to trigger subscription',
    invalidateKeys: [['subscriptions', pid]],
  });

  const checkUpdatesMutation = useToastMutation({
    mutationFn: (params: { query: string; sources?: string[]; maxResults: number }) =>
      subscriptionApi.checkUpdates(pid, params.query, params.sources, 7, params.maxResults),
    successMessage: 'Update check completed',
    errorMessage: 'Failed to check for updates',
  });

  if (isLoading) {
    return (
      <PageLayout title="Subscriptions">
        <LoadingState />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Subscriptions" subtitle="Stay updated with new papers matching your queries">
      <div className="space-y-6">
        {/* Quick update check */}
        <QuickUpdateCheck
          onCheck={(params) => checkUpdatesMutation.mutate(params)}
          isChecking={checkUpdatesMutation.isPending}
          isSuccess={checkUpdatesMutation.isSuccess}
          data={checkUpdatesMutation.data as Record<string, unknown> | undefined}
        />

        {/* Subscriptions list */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your Subscriptions</h2>
          <Button onClick={() => setShowCreate(true)} className="gap-2">
            <Plus className="size-4" />
            New Subscription
          </Button>
        </div>

        {showCreate && (
          <SubscriptionForm
            projectId={pid}
            onClose={() => setShowCreate(false)}
          />
        )}

        {editingSub && (
          <SubscriptionForm
            projectId={pid}
            existingSubId={editingSub}
            onClose={() => setEditingSub(null)}
          />
        )}

        {/* Subscription cards */}
        {subscriptions.length > 0 ? (
          <div className="space-y-3">
            {subscriptions.map((sub) => (
              <SubscriptionCard
                key={sub.id}
                sub={sub}
                onDelete={() => deleteMutation.mutate(sub.id)}
                onTrigger={(autoImport) =>
                  triggerMutation.mutate(
                    { subId: sub.id, autoImport },
                    { onSuccess: (data) => {
                      setRunResults((prev) => new Map(prev).set(sub.id, data as unknown as Record<string, number>));
                    }}
                  )
                }
                onEdit={() => setEditingSub(sub.id)}
                runResult={runResults.get(sub.id)}
                isTriggering={triggerMutation.isPending && triggerMutation.variables?.subId === sub.id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Bell className="size-12" />
            <p className="text-sm">No subscriptions yet. Create one to stay updated!</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function QuickUpdateCheck({
  onCheck,
  isChecking,
  isSuccess,
  data,
}: {
  onCheck: (params: { query: string; sources?: string[]; maxResults: number }) => void;
  isChecking: boolean;
  isSuccess: boolean;
  data: Record<string, unknown> | undefined;
}) {
  const [query, setQuery] = useState('');
  const [maxResults, setMaxResults] = useState(50);

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center gap-3">
        <Globe className="size-5 text-primary" />
        <div>
          <h2 className="text-lg font-semibold">Quick Update Check</h2>
          <p className="text-sm text-muted-foreground">
            Search across sources for new papers without creating a subscription
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-4">
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs text-muted-foreground">Query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., transformer language model"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Max results</label>
          <input
            type="number"
            min={1}
            max={200}
            value={maxResults}
            onChange={(e) => setMaxResults(Number(e.target.value))}
            className="w-24 rounded-md border bg-background px-2 py-2 text-sm"
          />
        </div>
      </div>

      <Button
        onClick={() => onCheck({ query, maxResults })}
        disabled={isChecking || !query.trim()}
        className="gap-2"
      >
        {isChecking ? (
          <>
            <Loader2 className="size-4 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            <RefreshCw className="size-4" />
            Check for Updates
          </>
        )}
      </Button>

      {isSuccess && data && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">New papers found</div>
            <div className="mt-1 text-lg font-bold text-green-500">
              {data.new_papers ?? 0}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Total found</div>
            <div className="mt-1 text-lg font-bold">
              {data.total_found ?? 0}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">Sources checked</div>
            <div className="mt-1 text-lg font-bold">
              {(data.sources_checked &&
                (Array.isArray(data.sources_checked)
                  ? data.sources_checked.length
                  : typeof data.sources_checked === 'object'
                    ? Object.keys(data.sources_checked).length
                    : 0)) ?? 0}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SubscriptionForm({
  projectId,
  existingSubId,
  onClose,
}: {
  projectId: number;
  existingSubId?: number;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [query, setQuery] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('weekly');
  const [maxResults, setMaxResults] = useState(50);
  const [sources, setSources] = useState('');

  const createMutation = useToastMutation({
    mutationFn: () =>
      subscriptionApi.create(projectId, {
        name,
        query,
        sources: sources.split(',').map((s) => s.trim()).filter(Boolean),
        frequency,
        max_results: maxResults,
      }),
    successMessage: 'Subscription created',
    errorMessage: 'Failed to create subscription',
    invalidateKeys: [['subscriptions', projectId]],
    onSuccess: () => onClose(),
  });

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-semibold">
          {existingSubId ? 'Edit Subscription' : 'New Subscription'}
        </h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., LLM Research Updates"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-muted-foreground">Search query</label>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., large language model reasoning"
            className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Frequency</label>
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as Frequency)}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Max results</label>
            <input
              type="number"
              min={1}
              max={200}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value))}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Sources (comma-separated)</label>
            <input
              type="text"
              value={sources}
              onChange={(e) => setSources(e.target.value)}
              placeholder="semanticscholar, arxiv"
              className="w-full rounded-md border bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending || !name.trim() || !query.trim()}
            className="gap-2"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>{existingSubId ? 'Update' : 'Create'}</>
            )}
          </Button>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

function SubscriptionCard({
  sub,
  onDelete,
  onTrigger,
  onEdit,
  runResult,
  isTriggering,
}: {
  sub: {
    id: number;
    name: string;
    query: string;
    sources: string[];
    frequency: string;
    max_results: number;
    is_active: boolean;
    last_run_at: string | null;
    total_found: number;
  };
  onDelete: () => void;
  onTrigger: (autoImport: boolean) => void;
  onEdit: () => void;
  runResult?: Record<string, number>;
  isTriggering: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Rss className="size-4 text-primary" />
            <h3 className="font-semibold">{sub.name}</h3>
            <Badge variant={sub.is_active ? 'default' : 'secondary'} className="text-xs">
              {sub.is_active ? 'Active' : 'Paused'}
            </Badge>
          </div>
          <p className="mt-1 truncate text-sm text-muted-foreground">{sub.query}</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              {sub.frequency}
            </span>
            <span>{sub.sources.length > 0 ? sub.sources.join(', ') : 'All sources'}</span>
            <span>Max {sub.max_results} results</span>
            <span>Total found: {sub.total_found}</span>
            {sub.last_run_at && (
              <span>Last run: {new Date(sub.last_run_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>

        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={() => onTrigger(false)}
            disabled={isTriggering}
            title="Run check"
          >
            {isTriggering ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8"
            onClick={onEdit}
            title="Edit"
          >
            <Edit className="size-3.5" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="size-8 text-destructive"
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {/* Run results */}
      {runResult && (
        <div className="mt-3 grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-3">
          <div>
            <div className="text-xs text-muted-foreground">New papers</div>
            <div className="text-lg font-bold text-green-500">{runResult.new_papers ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Total found</div>
            <div className="text-lg font-bold">{runResult.total_checked ?? 0}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Imported</div>
            <div className="text-lg font-bold text-blue-500">{runResult.imported ?? 0}</div>
          </div>
        </div>
      )}
    </div>
  );
}
