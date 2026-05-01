import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import {
  Brain, Database, Trash2, Send, Loader2, BookOpen, AlertTriangle,
  FileText, Sparkles, BarChart3, RefreshCw,
} from 'lucide-react';
import { ragApi, paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { Button } from '@/components/ui/button';
import PageLayout from '@/components/layout/PageLayout';
import type { Paper } from '@/types';

export default function RAGPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState<unknown[]>([]);

  const { data: statsData } = useQuery({
    queryKey: ['rag-stats', pid],
    queryFn: () => ragApi.stats(pid),
  });

  const { data: papersData, isLoading: isLoadingPapers } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
  });

  const indexMutation = useToastMutation({
    mutationFn: () => ragApi.index(pid),
    successMessage: 'Index built successfully',
    errorMessage: 'Failed to build index',
    invalidateKeys: [['rag-stats', pid]],
  });

  const deleteIndexMutation = useToastMutation({
    mutationFn: () => ragApi.deleteIndex(pid),
    successMessage: 'Index deleted',
    errorMessage: 'Failed to delete index',
    invalidateKeys: [['rag-stats', pid]],
    onSuccess: () => { setAnswer(''); setSources([]); },
  });

  const queryMutation = useToastMutation({
    mutationFn: ({ question }: { question: string }) => ragApi.query(pid, question),
    errorMessage: 'Failed to query knowledge base',
    onSuccess: (data) => {
      setAnswer((data as { answer: string }).answer);
      setSources((data as { sources?: unknown[] }).sources ?? []);
    },
  });

  const handleQuery = () => {
    if (!query.trim()) return;
    queryMutation.mutate({ question: query.trim() });
  };

  const stats = statsData as Record<string, unknown> | undefined;
  const indexedCount = (stats?.indexed_count as number) ?? 0;
  const totalChunks = (stats?.total_chunks as number) ?? 0;
  const indexedPapers = papersData?.items?.filter(
    (p: Paper) => p.status === 'indexed' || p.status === 'ocr_complete'
  ).length ?? 0;

  return (
    <PageLayout title="RAG Query" subtitle="Ask questions about your indexed literature">
      <div className="space-y-6">
        {/* Index stats */}
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard icon={Database} label="Indexed Papers" value={indexedPapers} color="text-blue-500" />
          <StatCard icon={FileText} label="Total Chunks" value={totalChunks} color="text-purple-500" />
          <StatCard icon={BarChart3} label="Vector Records" value={indexedCount} color="text-green-500" />
          <StatCard icon={BookOpen} label="Papers Ready" value={indexedPapers} color="text-amber-500" />
        </div>

        {/* Build index */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="size-4 text-primary" />
              <span className="text-sm font-medium">Vector Index</span>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => indexMutation.mutate()}
                disabled={indexMutation.isPending || isLoadingPapers}
                className="gap-1.5"
              >
                {indexMutation.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Build Index
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => deleteIndexMutation.mutate()}
                disabled={deleteIndexMutation.isPending || indexedCount === 0}
                className="gap-1.5 text-destructive"
              >
                <Trash2 className="size-3.5" />
                Delete Index
              </Button>
            </div>
          </div>
          {indexedCount === 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              No papers indexed yet. Papers must be OCR-complete or indexed before they can be added to the vector store.
            </p>
          )}
        </div>

        {/* Query interface */}
        <div className="rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Brain className="size-4" />
              Ask a Question
            </h3>
          </div>
          <div className="p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleQuery()}
                placeholder="What are the key findings about transformer attention mechanisms?"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
              />
              <Button
                onClick={handleQuery}
                disabled={queryMutation.isPending || !query.trim() || indexedCount === 0}
                className="gap-1.5"
              >
                {queryMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
                Query
              </Button>
            </div>

            {answer && (
              <div className="mt-4 rounded-md border bg-muted/30 p-4">
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span className="text-sm font-medium">Answer</span>
                </div>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{answer}</p>
              </div>
            )}

            {sources.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-center gap-2">
                  <BookOpen className="size-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Sources ({sources.length})</span>
                </div>
                <div className="space-y-2">
                  {sources.slice(0, 5).map((source, i) => {
                    const s = source as Record<string, unknown>;
                    return (
                      <div key={i} className="rounded-md border p-3">
                        <p className="text-sm font-medium">{String(s.paper_title ?? 'Unknown')}</p>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                          {String(s.excerpt ?? '')}
                        </p>
                        <div className="mt-1.5 flex gap-2 text-xs text-muted-foreground">
                          {s.relevance != null && (
                            <span>Relevance: {(s.relevance as number).toFixed(2)}</span>
                          )}
                          {s.page_number != null && (
                            <span>Page {(s.page_number as number) + 1}</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  {sources.length > 5 && (
                    <p className="text-center text-xs text-muted-foreground">
                      Showing 5 of {sources.length} sources
                    </p>
                  )}
                </div>
              </div>
            )}

            {indexedCount === 0 && (
              <div className="mt-4 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-500" />
                <p className="text-sm text-amber-700">
                  No vector index exists. Build the index first to enable semantic search over your papers.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </PageLayout>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className={`size-4 ${color}`} />
        {label}
      </div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}
