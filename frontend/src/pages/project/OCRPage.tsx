import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Eye, Cpu, Zap, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react';
import { ocrApi, paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import PageLayout from '@/components/layout/PageLayout';

export default function OCRPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [forceOcr, setForceOcr] = useState(false);
  const [useGpu, setUseGpu] = useState(true);

  const { data: papersData, isLoading: isLoadingPapers } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
  });

  const { data: statsData, isLoading: isLoadingStats } = useQuery({
    queryKey: ['ocr-stats', pid],
    queryFn: () => ocrApi.stats(pid),
  });

  const papers = papersData?.items ?? [];
  const pdfReady = papers.filter(
    (p) => p.status === 'pdf_downloaded' || p.status === 'metadata_only'
  );
  const ocrComplete = papers.filter((p) => p.status === 'ocr_complete');
  const indexed = papers.filter((p) => p.status === 'indexed');

  const processMutation = useToastMutation({
    mutationFn: () =>
      ocrApi.process(
        pid,
        undefined,
        forceOcr,
        useGpu
      ),
    successMessage: 'OCR processing completed',
    errorMessage: 'Failed to process OCR',
    invalidateKeys: [['ocr-stats', pid], queryKeys.papers.list(pid)],
  });

  if (isLoadingPapers || isLoadingStats) {
    return (
      <PageLayout title="OCR Processing">
        <LoadingState />
      </PageLayout>
    );
  }

  const totalChunks = (statsData?.total_chunks as number) ?? 0;

  return (
    <PageLayout title="OCR Processing" subtitle="Extract text from PDFs for full-text search and analysis">
      <div className="space-y-6">
        {/* Status overview */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard
            icon={FileText}
            label="Ready for OCR"
            value={pdfReady.length}
            color="text-amber-500"
            description="PDFs downloaded, awaiting text extraction"
          />
          <StatusCard
            icon={Eye}
            label="OCR Complete"
            value={ocrComplete.length}
            color="text-blue-500"
            description="Text extracted, not yet indexed"
          />
          <StatusCard
            icon={CheckCircle2}
            label="Indexed"
            value={indexed.length}
            color="text-green-500"
            description="Full-text searchable"
          />
          <StatusCard
            icon={FileText}
            label="Text Chunks"
            value={totalChunks}
            color="text-purple-500"
            description="Total searchable chunks"
          />
        </div>

        {/* Action panel */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <Zap className="size-5 text-primary" />
            <div>
              <h2 className="text-lg font-semibold">Process PDFs</h2>
              <p className="text-sm text-muted-foreground">
                Extract text from {pdfReady.length} paper{pdfReady.length !== 1 ? 's' : ''} with downloaded PDFs
              </p>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={forceOcr}
                onChange={(e) => setForceOcr(e.target.checked)}
                className="rounded"
              />
              Force re-OCR
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={useGpu}
                onChange={(e) => setUseGpu(e.target.checked)}
                className="rounded"
              />
              <Cpu className="size-4" />
              Use GPU acceleration
            </label>
          </div>

          <Button
            onClick={() => processMutation.mutate()}
            disabled={processMutation.isPending || pdfReady.length === 0}
            className="gap-2"
          >
            {processMutation.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Eye className="size-4" />
                Start OCR Processing
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {processMutation.isSuccess && processMutation.data && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Processed</div>
              <div className="mt-1 text-2xl font-bold text-green-500">
                {processMutation.data.processed}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Failed</div>
              <div className="mt-1 text-2xl font-bold text-red-500">
                {processMutation.data.failed}
              </div>
            </div>
            <div className="rounded-lg border bg-card p-4">
              <div className="text-sm text-muted-foreground">Total</div>
              <div className="mt-1 text-2xl font-bold">
                {processMutation.data.total}
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
                  </div>
                  <Badge
                    variant="outline"
                    className={
                      paper.status === 'indexed'
                        ? 'border-green-500 text-green-600'
                        : paper.status === 'ocr_complete'
                          ? 'border-blue-500 text-blue-600'
                          : paper.status === 'pdf_downloaded'
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
  value: number;
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
