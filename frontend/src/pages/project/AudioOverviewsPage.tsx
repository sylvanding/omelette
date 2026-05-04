import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Headphones, Trash2, Play, Plus, Clock, Loader2 } from 'lucide-react';
import { audioOverviewsApi, paperApi, type AudioOverviewListItem, type DialogueEntry } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AudioPlayer } from '@/components/audio/AudioPlayer';
import { AudioOverviewDialog } from '@/components/audio/AudioOverviewDialog';
import PageLayout from '@/components/layout/PageLayout';
import { useToastMutation } from '@/hooks/use-toast-mutation';

export default function AudioOverviewsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const [selectedOverview, setSelectedOverview] = useState<AudioOverviewListItem | null>(null);
  const [showGenerateDialog, setShowGenerateDialog] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: queryKeys.audioOverviews.all(pid),
    queryFn: () => audioOverviewsApi.list(pid),
  });
  const { data: papersData } = useQuery({
    queryKey: queryKeys.papers.list(pid, { page: 1, page_size: 10 }),
    queryFn: () => paperApi.list(pid, { page: 1, page_size: 10 }),
    enabled: !!pid,
  });

  const deleteMutation = useToastMutation({
    mutationFn: (id: number) => audioOverviewsApi.delete(pid, id),
    invalidateKeys: [queryKeys.audioOverviews.all(pid)],
    successMessage: t('audioOverview.deleted', 'Audio overview deleted'),
  });

  const handlePlay = (overview: AudioOverviewListItem) => {
    setSelectedOverview(overview);
  };

  const handleDelete = (id: number) => {
    deleteMutation.mutate(id);
  };

  const handleGenerated = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <PageLayout title={t('audioOverview.title', 'Audio Overviews')}>
        <LoadingState />
      </PageLayout>
    );
  }

  const items = data?.items ?? [];
  const overviewPapers = papersData?.items ?? [];

  return (
    <PageLayout title={t('audioOverview.title', 'Audio Overviews')}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            {t('audioOverview.description', 'Listen to AI-generated discussions of your papers')}
          </p>
          <Button onClick={() => setShowGenerateDialog(true)}>
            <Plus className="mr-2 size-4" />
            {t('audioOverview.generateNew', 'Generate New')}
          </Button>
        </div>

        {/* Overview list */}
        {items.length === 0 ? (
          <EmptyState onGenerate={() => setShowGenerateDialog(true)} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((overview) => (
              <OverviewCard
                key={overview.id}
                overview={overview}
                onPlay={() => handlePlay(overview)}
                onDelete={() => handleDelete(overview.id)}
                isDeleting={deleteMutation.isPending && deleteMutation.variables === overview.id}
              />
            ))}
          </div>
        )}

        {/* Player modal */}
        {selectedOverview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
            <div className="relative flex h-[90vh] w-[95vw] max-w-4xl flex-col rounded-xl border bg-background shadow-2xl">
              <div className="flex items-center justify-between border-b px-6 py-4">
                <div className="flex items-center gap-2">
                  <Headphones className="size-5 text-primary" />
                  <h2 className="text-lg font-semibold">{selectedOverview.title}</h2>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setSelectedOverview(null)}
                  aria-label="Close"
                >
                  <Headphones className="size-4 rotate-180" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-6 py-4">
                <AudioPlayer
                  script={buildPlaceholderScript(selectedOverview)}
                  summary={selectedOverview.summary}
                />
              </div>
            </div>
          </div>
        )}

        {/* Generate dialog */}
        {showGenerateDialog && (
          <AudioOverviewDialog
            projectId={pid}
            paperIds={overviewPapers.map((paper) => paper.id)}
            paperTitles={overviewPapers.map((paper) => paper.title || 'Untitled')}
            onClose={() => setShowGenerateDialog(false)}
            onGenerated={handleGenerated}
          />
        )}
      </div>
    </PageLayout>
  );
}

function OverviewCard({
  overview,
  onPlay,
  onDelete,
  isDeleting,
}: {
  overview: AudioOverviewListItem;
  onPlay: () => void;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-start justify-between">
        <h3 className="line-clamp-2 text-sm font-semibold">{overview.title}</h3>
        <Badge variant="secondary" className="ml-2 shrink-0">
          {overview.tone}
        </Badge>
      </div>
      <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">{overview.summary}</p>
      <div className="mb-3 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Clock className="size-3" />
          {overview.duration_estimate}
        </span>
        <span>{overview.paper_count} {t('audioOverview.papers', 'papers')}</span>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="default" onClick={onPlay} className="flex-1">
          <Play className="mr-1 size-3" />
          {t('audioOverview.play', 'Play')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={onDelete}
          disabled={isDeleting}
          className="shrink-0"
        >
          {isDeleting ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Trash2 className="size-3" />
          )}
        </Button>
      </div>
    </div>
  );
}

function EmptyState({ onGenerate }: { onGenerate: () => void }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16">
      <Headphones className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-2 text-lg font-medium">{t('audioOverview.emptyTitle', 'No audio overviews yet')}</h3>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('audioOverview.emptyDescription', 'Generate your first audio overview to get started')}
      </p>
      <Button onClick={onGenerate}>
        <Plus className="mr-2 size-4" />
        {t('audioOverview.generateFirst', 'Generate First Overview')}
      </Button>
    </div>
  );
}

/**
 * Build a placeholder script from the overview metadata for playback display.
 * The actual script is generated by the LLM during generation; we show the summary
 * and paper info as a placeholder for overviews generated before this page existed.
 */
function buildPlaceholderScript(overview: AudioOverviewListItem): DialogueEntry[] {
  return [
    { speaker: 'Alex', text: overview.summary || overview.title },
    { speaker: 'Jordan', text: `This overview covers ${overview.paper_count} paper(s). Configure an LLM provider for full dialogue generation.` },
  ];
}
