import { useState, lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';

const CitationGraphView = lazy(() => import('@/components/citation-graph/CitationGraphView'));
import type { GraphData, GraphMode } from '@/components/citation-graph/CitationGraphView';

interface CitationGraphDialogProps {
  projectId: number;
  paperId: number;
  onClose: () => void;
}

export function CitationGraphDialog({
  projectId,
  paperId,
  onClose,
}: CitationGraphDialogProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<GraphMode>('all');
  const [activePaperId, setActivePaperId] = useState(paperId);

  const { data, isLoading } = useQuery<GraphData>({
    queryKey: queryKeys.papers.citationGraph(projectId, activePaperId, mode),
    queryFn: () => paperApi.getCitationGraph(projectId, activePaperId, { mode }),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative h-[80vh] w-[90vw] max-w-6xl rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold">
            {t('papers.citationGraph.title', 'Citation graph')}
          </h2>
          <Button
            size="icon"
            variant="ghost"
            onClick={onClose}
            aria-label={t('papers.citationGraph.close', 'Close citation graph')}
          >
            <X className="size-5" />
          </Button>
        </div>
        <div className="h-[calc(100%-56px)]">
          <Suspense
            fallback={
              <div className="flex h-full items-center justify-center">
                <Loader2 className="size-8 animate-spin text-muted-foreground" />
              </div>
            }
          >
            <CitationGraphView
              data={data ?? { nodes: [], edges: [], center_id: null }}
              isLoading={isLoading}
              projectId={projectId}
              mode={mode}
              onModeChange={setMode}
              onNodeClick={(newPaperId) => {
                if (newPaperId) setActivePaperId(newPaperId);
              }}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
