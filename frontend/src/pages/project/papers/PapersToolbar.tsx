import { useTranslation } from 'react-i18next';
import { Trash2, Zap, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

interface PapersToolbarProps {
  selectedRows: Set<string | number>;
  needsProcessing: boolean;
  isBatchDeleting: boolean;
  onBatchDelete: () => void;
  onProcessAll: () => void;
  onAddPaper: () => void;
}

export function PapersToolbar({
  selectedRows,
  needsProcessing,
  isBatchDeleting,
  onBatchDelete,
  onProcessAll,
  onAddPaper,
}: PapersToolbarProps) {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2">
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
