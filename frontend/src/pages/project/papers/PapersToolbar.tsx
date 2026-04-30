import { useTranslation } from 'react-i18next';
import { Trash2, Zap, Plus, GitCompareArrows, Headphones, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { PapersExportDropdown } from './PapersExportDropdown';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface PapersToolbarProps {
  selectedRows: Set<string | number>;
  needsProcessing: boolean;
  isBatchDeleting: boolean;
  onBatchDelete: () => void;
  onProcessAll: () => void;
  onAddPaper: () => void;
  onCompare: () => void;
  onAudioOverview: () => void;
  onExport: () => void;
  projectId: number;
  paperFilters: {
    q?: string;
    status?: string;
    year?: number;
  };
  paperCount: number;
}

export function PapersToolbar({
  selectedRows,
  needsProcessing,
  isBatchDeleting,
  onBatchDelete,
  onProcessAll,
  onAddPaper,
  onCompare,
  onAudioOverview,
  onExport,
  projectId,
  paperFilters,
  paperCount,
}: PapersToolbarProps) {
  const { t } = useTranslation();
  const canCompare = selectedRows.size >= 2 && selectedRows.size <= 5;
  const canAudio = selectedRows.size >= 1 && selectedRows.size <= 10;

  return (
    <div className="flex gap-2">
      <PapersExportDropdown
        projectId={projectId}
        filters={paperFilters}
        paperCount={paperCount}
      />
      <Button
        variant="outline"
        size="sm"
        onClick={onExport}
        className="gap-1.5"
        disabled={paperCount === 0}
      >
        <BookOpen className="size-4" />
        Reference Export
      </Button>
      {selectedRows.size > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  disabled={!canCompare}
                  onClick={canCompare ? onCompare : undefined}
                  className="gap-1.5"
                >
                  <GitCompareArrows className="size-4" />
                  {t('papers.compare')} ({selectedRows.size})
                </Button>
              </span>
            </TooltipTrigger>
            {!canCompare && (
              <TooltipContent>
                <p>{t('papers.compareTooMany')}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
      {selectedRows.size > 0 && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  variant="outline"
                  disabled={!canAudio}
                  onClick={canAudio ? onAudioOverview : undefined}
                  className="gap-1.5"
                >
                  <Headphones className="size-4" />
                  {t('papers.audioOverview')} ({selectedRows.size})
                </Button>
              </span>
            </TooltipTrigger>
            {!canAudio && (
              <TooltipContent>
                <p>{t('papers.audioOverviewRange', 'Select 1-10 papers')}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
      )}
      {selectedRows.size > 0 && (
        <ConfirmDialog
          trigger={
            <Button
              variant="destructive"
              disabled={isBatchDeleting}
              className="gap-1.5"
            >
              <Trash2 className="size-4" />
              {t('common.delete')} ({selectedRows.size})
            </Button>
          }
          title={t('common.confirmDeleteTitle')}
          description={t('common.confirmDeleteDesc')}
          confirmText={t('common.delete')}
          cancelText={t('common.cancel')}
          onConfirm={onBatchDelete}
          destructive
        />
      )}
      {needsProcessing && (
        <Button variant="outline" onClick={onProcessAll} className="gap-1.5">
          <Zap className="size-4" />
          {t('papers.processAll')}
        </Button>
      )}
      <Button onClick={onAddPaper} className="gap-1.5">
        <Plus className="size-4" />
        {t('papers.addPaper')}
      </Button>
    </div>
  );
}
