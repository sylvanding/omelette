import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Network, Play, Upload, Loader2, X, Trash2, RotateCcw,
  AlertTriangle, CheckCircle, XCircle, PauseCircle,
} from 'lucide-react';
import { pipelineApi, type Pipeline } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const STATUS_COLORS: Record<string, string> = {
  running: 'text-blue-500',
  interrupted: 'text-amber-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  cancelled: 'text-gray-500',
};

const STATUS_ICONS: Record<string, typeof Loader2> = {
  running: Loader2,
  interrupted: PauseCircle,
  completed: CheckCircle,
  failed: XCircle,
  cancelled: Trash2,
};

export default function PipelinesPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [showStart, setShowStart] = useState(false);
  const [resolvingThread, setResolvingThread] = useState<string | null>(null);

  const { data: pipelinesData, isLoading, refetch } = useQuery({
    queryKey: queryKeys.pipelines.list(),
    queryFn: () => pipelineApi.list(),
    refetchInterval: 3000,
  });

  const pipelines = ((pipelinesData as Pipeline[] | undefined) ?? []).map((p) => ({
    thread_id: p.thread_id as string,
    status: p.status as Pipeline['status'],
    task_id: p.task_id as number | undefined,
  }));

  const cancelMutation = useToastMutation({
    mutationFn: (threadId: string) => pipelineApi.cancel(threadId),
    successMessage: 'Pipeline cancelled',
    errorMessage: 'Failed to cancel pipeline',
    invalidateKeys: [queryKeys.pipelines.list()],
  });

  const runningCount = pipelines.filter((p) => p.status === 'running').length;
  const interruptedCount = pipelines.filter((p) => p.status === 'interrupted').length;
  const completedCount = pipelines.filter((p) => p.status === 'completed').length;
  const failedCount = pipelines.filter((p) => p.status === 'failed').length;

  if (isLoading) {
    return (
      <PageLayout title="Pipelines">
        <LoadingState />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Pipelines" subtitle="Monitor and manage LangGraph pipeline executions">
      <div className="space-y-6">
        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-4">
          <StatusCard icon={Loader2} label="Running" value={runningCount} color="text-blue-500" description="Active pipelines" />
          <StatusCard icon={PauseCircle} label="Interrupted" value={interruptedCount} color="text-amber-500" description="Need resolution" />
          <StatusCard icon={CheckCircle} label="Completed" value={completedCount} color="text-green-500" description="Finished today" />
          <StatusCard icon={AlertTriangle} label="Failed" value={failedCount} color="text-red-500" description="Errors encountered" />
        </div>

        {/* Start pipeline panel */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Pipeline Executions</h2>
          <Button onClick={() => setShowStart(!showStart)} className="gap-2">
            <Play className="size-4" />
            {showStart ? 'Close' : 'Start Pipeline'}
          </Button>
        </div>

        {showStart && <StartPipelinePanel projectId={pid} />}

        {/* Resolving conflicts modal */}
        {resolvingThread && (
          <ConflictResolver
            threadId={resolvingThread}
            onClose={() => setResolvingThread(null)}
            onResolved={() => {
              setResolvingThread(null);
              refetch();
            }}
          />
        )}

        {/* Pipeline list */}
        {pipelines.length > 0 ? (
          <div className="space-y-3">
            {pipelines.map((pipeline) => (
              <PipelineCard
                key={pipeline.thread_id}
                pipeline={pipeline}
                onCancel={() => cancelMutation.mutate(pipeline.thread_id)}
                onResume={() => setResolvingThread(pipeline.thread_id)}
                isCanceling={cancelMutation.isPending && cancelMutation.variables === pipeline.thread_id}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <Network className="size-12" />
            <p className="text-sm">No pipelines running. Start one to begin processing!</p>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function StatusCard({
  icon: Icon,
  label,
  value,
  color,
  description,
}: {
  icon: typeof Loader2;
  label: string;
  value: number;
  color: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className={`size-4 ${color}`} />
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function StartPipelinePanel({ projectId }: { projectId: number }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchSources, setSearchSources] = useState('');
  const [searchMaxResults, setSearchMaxResults] = useState(50);
  const [uploadPaths, setUploadPaths] = useState('');

  const searchMutation = useToastMutation({
    mutationFn: () =>
      pipelineApi.search(
        projectId,
        searchQuery,
        searchSources.split(',').map((s) => s.trim()).filter(Boolean),
        searchMaxResults,
      ),
    successMessage: 'Search pipeline started',
    errorMessage: 'Failed to start search pipeline',
  });

  const uploadMutation = useToastMutation({
    mutationFn: () =>
      pipelineApi.upload(
        projectId,
        uploadPaths.split('\n').map((s) => s.trim()).filter(Boolean),
      ),
    successMessage: 'Upload pipeline started',
    errorMessage: 'Failed to start upload pipeline',
  });

  return (
    <Tabs defaultValue="search" className="w-full">
      <TabsList>
        <TabsTrigger value="search" className="gap-2">
          <Play className="size-3.5" />
          Search Pipeline
        </TabsTrigger>
        <TabsTrigger value="upload" className="gap-2">
          <Upload className="size-3.5" />
          Upload Pipeline
        </TabsTrigger>
      </TabsList>

      <TabsContent value="search" className="mt-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Search across academic sources and process papers through dedup, crawl, OCR, and indexing.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="pipe-search-query" className="mb-1 block text-xs text-muted-foreground">Search query</label>
              <input
                id="pipe-search-query"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g., transformer language model reasoning"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="pipe-sources" className="mb-1 block text-xs text-muted-foreground">Sources (comma-separated, empty for all)</label>
                <input
                  id="pipe-sources"
                  type="text"
                  value={searchSources}
                  onChange={(e) => setSearchSources(e.target.value)}
                  placeholder="semanticscholar, arxiv"
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label htmlFor="pipe-max" className="mb-1 block text-xs text-muted-foreground">Max results</label>
                <input
                  id="pipe-max"
                  type="number"
                  min={1}
                  max={200}
                  value={searchMaxResults}
                  onChange={(e) => setSearchMaxResults(Number(e.target.value))}
                  className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                />
              </div>
            </div>

            <Button
              onClick={() => searchMutation.mutate()}
              disabled={searchMutation.isPending || !searchQuery.trim()}
              className="gap-2"
            >
              {searchMutation.isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Starting...</>
              ) : (
                <><Play className="size-4" /> Start Search</>
              )}
            </Button>
          </div>
        </div>
      </TabsContent>

      <TabsContent value="upload" className="mt-4">
        <div className="rounded-lg border bg-card p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            Process local PDF files through extraction, dedup, OCR, and indexing.
          </p>

          <div className="space-y-4">
            <div>
              <label htmlFor="pipe-paths" className="mb-1 block text-xs text-muted-foreground">PDF file paths (one per line)</label>
              <textarea
                id="pipe-paths"
                value={uploadPaths}
                onChange={(e) => setUploadPaths(e.target.value)}
                placeholder="/path/to/paper1.pdf&#10;/path/to/paper2.pdf"
                rows={5}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm font-mono"
              />
            </div>

            <Button
              onClick={() => uploadMutation.mutate()}
              disabled={uploadMutation.isPending || !uploadPaths.trim()}
              className="gap-2"
            >
              {uploadMutation.isPending ? (
                <><Loader2 className="size-4 animate-spin" /> Starting...</>
              ) : (
                <><Upload className="size-4" /> Start Upload</>
              )}
            </Button>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}

function PipelineCard({
  pipeline,
  onCancel,
  onResume,
  isCanceling,
}: {
  pipeline: Pipeline;
  onCancel: () => void;
  onResume: () => void;
  isCanceling: boolean;
}) {
  const color = STATUS_COLORS[pipeline.status] ?? 'text-gray-500';
  const StatusIcon = STATUS_ICONS[pipeline.status] ?? Network;
  const shortId = pipeline.thread_id.length > 20
    ? `${pipeline.thread_id.slice(0, 10)}...${pipeline.thread_id.slice(-8)}`
    : pipeline.thread_id;
  const typeLabel = pipeline.thread_id.startsWith('search_') ? 'Search' : pipeline.thread_id.startsWith('upload_') ? 'Upload' : 'Pipeline';

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <StatusIcon className={`size-5 ${color} ${pipeline.status === 'running' ? 'animate-spin' : ''}`} />
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm">{shortId}</span>
              <Badge variant="outline" className="text-xs">{typeLabel}</Badge>
            </div>
            <span className={`text-xs ${color}`}>{pipeline.status}</span>
          </div>
        </div>

        <div className="flex gap-2">
          {pipeline.status === 'running' && (
            <Button variant="outline" size="sm" onClick={onCancel} disabled={isCanceling} className="gap-1 text-destructive">
              <X className="size-3.5" />
              Cancel
            </Button>
          )}
          {pipeline.status === 'interrupted' && (
            <Button variant="outline" size="sm" onClick={onResume} className="gap-1">
              <RotateCcw className="size-3.5" />
              Resume
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ConflictResolver({
  threadId,
  onClose,
  onResolved,
}: {
  threadId: string;
  onClose: () => void;
  onResolved: () => void;
}) {
  const { data: statusData, isLoading } = useQuery({
    queryKey: queryKeys.pipelines.status(threadId),
    queryFn: () => pipelineApi.status(threadId),
  });

  const [resolutions, setResolutions] = useState<Map<string, string>>(new Map());

  const resumeMutation = useToastMutation({
    mutationFn: () => {
      const conflicts = (statusData?.conflicts as Record<string, unknown>[] | undefined) ?? [];
      const resolved = conflicts.map((c) => ({
        conflict_id: c.conflict_id as string,
        action: resolutions.get(c.conflict_id as string) ?? 'skip',
      }));
      return pipelineApi.resume(threadId, resolved);
    },
    successMessage: 'Pipeline resumed',
    errorMessage: 'Failed to resume pipeline',
    invalidateKeys: [queryKeys.pipelines.list()],
    onSuccess: onResolved,
  });

  const conflicts = (statusData?.conflicts as Record<string, unknown>[] | undefined) ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="mx-4 max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-lg border bg-card">
        <div className="flex items-center justify-between border-b p-4">
          <h3 className="text-lg font-semibold">Resolve Conflicts</h3>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto p-4">
          {isLoading ? (
            <LoadingState />
          ) : conflicts.length === 0 ? (
            <p className="py-8 text-center text-muted-foreground">No conflicts to resolve.</p>
          ) : (
            <div className="space-y-4">
              {conflicts.map((conflict) => {
                const id = conflict.conflict_id as string;
                const oldPaper = conflict.old_paper as Record<string, unknown> | undefined;
                const newPaper = conflict.new_paper as Record<string, unknown> | undefined;

                return (
                  <div key={id} className="rounded-md border p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium">Conflict: {id}</span>
                      <select
                        aria-label={`Resolution for conflict ${id}`}
                        value={resolutions.get(id) ?? 'skip'}
                        onChange={(e) => setResolutions(new Map(resolutions).set(id, e.target.value))}
                        className="rounded-md border bg-background px-2 py-1 text-sm"
                      >
                        <option value="keep_old">Keep old</option>
                        <option value="keep_new">Keep new</option>
                        <option value="merge">Merge</option>
                        <option value="skip">Skip</option>
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">Old</div>
                        <div className="text-sm">{(oldPaper?.title as string) ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{(oldPaper?.doi as string) ?? ''}</div>
                      </div>
                      <div className="rounded-md bg-muted/30 p-3">
                        <div className="mb-1 text-xs font-medium text-muted-foreground">New</div>
                        <div className="text-sm">{(newPaper?.title as string) ?? 'Unknown'}</div>
                        <div className="text-xs text-muted-foreground">{(newPaper?.doi as string) ?? ''}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => resumeMutation.mutate()}
            disabled={resumeMutation.isPending || conflicts.length === 0}
            className="gap-2"
          >
            {resumeMutation.isPending ? (
              <><Loader2 className="size-4 animate-spin" /> Resuming...</>
            ) : (
              <><RotateCcw className="size-4" /> Resume Pipeline</>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
