import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Download, HardDrive, CheckCircle2, AlertCircle, Loader2, FileDown, FileText } from 'lucide-react';
import { crawlerApi, paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';

export default function CrawlerPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [priority, setPriority] = useState<'high' | 'low'>('low');
  const [maxPapers, setMaxPapers] = useState(50);

  const { data: papersData, isLoading: isLoadingPapers } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
  });

  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['crawl-stats', pid],
    queryFn: () => crawlerApi.stats(pid),
  });

  const papers = papersData?.items ?? [];
  const needsPdf = papers.filter(
    (p) => p.status === 'pending' || p.status === 'metadata_only'
  );
  const hasPdf = papers.filter((p) => p.status === 'pdf_downloaded' || p.status === 'ocr_complete' || p.status === 'indexed');

  const crawlMutation = useToastMutation({
    mutationFn: () => crawlerApi.start(pid, priority, maxPapers),
    successMessage: 'PDF download completed',
    errorMessage: 'Failed to download PDFs',
    invalidateKeys: [['crawl-stats', pid], queryKeys.papers.list(pid)],
  });

  if (isLoadingPapers || isLoadingStats) {
    return (
      <PageLayout title="PDF Crawler">
        <LoadingState />
      </PageLayout>
    );
  }

  const storage = statsData?.storage as Record<string, unknown> | undefined;
  const storageTotal = (storage?.total_bytes as number) ?? 0;
  const storageCount = (storage?.total_files as number) ?? 0;

  return (
    <PageLayout title="PDF Crawler" subtitle="Automatically download full-text PDFs from your paper library">
      <div className="space-y-6">
        {/* Status overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            icon={FileText}
            label="Needs PDF"
            value={needsPdf.length}
            color="text-amber-500"
            description="Papers awaiting PDF download"
          />
          <StatusCard
            icon={FileDown}
            label="PDF Downloaded"
            value={hasPdf.length}
            color="text-blue-500"
            description="Papers with PDFs on disk"
          />
          <StatusCard
            icon={HardDrive}
            label="Storage Used"
            value={formatBytes(storageTotal)}
            color="text-purple-500"
            description={`${storageCount} files on disk`}
          />
          <StatusCard
            icon={CheckCircle2}
            label="Total Papers"
            value={papers.length}
            color="text-green-500"
            description="All papers in project"
          />
        </div>

        {/* Crawl configuration */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <Download className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Download PDFs</h2>
              <p className="text-sm text-muted-foreground">
                Download full-text PDFs for {needsPdf.length} paper{needsPdf.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-6">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Priority</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPriority('high')}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    priority === 'high' ? 'bg-primary text-primary-foreground' : 'border bg-card hover:bg-muted/50'
                  }`}
                >
                  High (most cited first)
                </button>
                <button
                  type="button"
                  onClick={() => setPriority('low')}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    priority === 'low' ? 'bg-primary text-primary-foreground' : 'border bg-card hover:bg-muted/50'
                  }`}
                >
                  Low (newest first)
                </button>
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Max papers</label>
              <input
                type="number"
                min={1}
                max={200}
                value={maxPapers}
                onChange={(e) => setMaxPapers(Number(e.target.value))}
                className="w-24 rounded-md border bg-background px-2 py-1.5 text-sm"
              />
            </div>
          </div>

          <Button
            onClick={() => crawlMutation.mutate()}
            disabled={crawlMutation.isPending || needsPdf.length === 0}
            className="gap-2"
          >
            {crawlMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="size-4" />
                Start Download
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {crawlMutation.isSuccess && crawlMutation.data && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Downloaded</div>
              <div className="mt-1 text-2xl font-bold text-green-500">
                {crawlMutation.data.successful ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Failed</div>
              <div className="mt-1 text-2xl font-bold text-red-500">
                {crawlMutation.data.failed ?? 0}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total attempted</div>
              <div className="mt-1 text-2xl font-bold">
                {crawlMutation.data.total ?? 0}
              </div>
            </div>
          </div>
        )}

        {/* Paper list */}
        {papers.length > 0 && (
          <div className="rounded-lg border bg-card">
            <div className="border-b px-4 py-3">
              <h3 className="text-sm font-semibold">Papers</h3>
            </div>
            <div className="divide-y divide-border">
              {papers.slice(0, 20).map((paper) => (
                <div key={paper.id} className="flex items-center gap-3 px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{paper.title || 'Untitled'}</p>
                    {paper.doi && (
                      <p className="truncate text-xs text-muted-foreground">{paper.doi}</p>
                    )}
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      paper.status === 'pdf_downloaded' || paper.status === 'ocr_complete' || paper.status === 'indexed'
                        ? 'border-green-500 text-green-600'
                        : paper.status === 'metadata_only' || paper.status === 'pending'
                          ? 'border-amber-500 text-amber-600'
                          : ''
                    }
                  >
                    {paper.status}
                  </Badge>
                </div>
              ))}
              {papers.length > 20 && (
                <div className="px-4 py-2 text-center text-xs text-muted-foreground">
                  Showing 20 of {papers.length} papers
                </div>
              )}
            </div>
          </div>
        )}

        {papers.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-muted-foreground">
            <AlertCircle className="size-12" />
            <p className="text-sm">No papers in this project yet.</p>
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
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`size-4 ${color}`} />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{description}</div>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
