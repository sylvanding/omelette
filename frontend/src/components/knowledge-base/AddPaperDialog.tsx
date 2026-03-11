import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PdfUploadDialog } from './PdfUploadDialog';
import { SearchAddDialog } from './SearchAddDialog';
import type { UploadResult } from '@/services/kb-api';
import { cn } from '@/lib/utils';

interface AddPaperDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: (uploadResult?: UploadResult) => void;
}

export function AddPaperDialog({
  projectId,
  open,
  onOpenChange,
  onComplete,
}: AddPaperDialogProps) {
  const { t } = useTranslation();
  const [showSearch, setShowSearch] = useState(false);
  const [showUpload, setShowUpload] = useState(false);

  const handleSelectSearch = () => {
    setShowSearch(true);
  };

  const handleSelectUpload = () => {
    setShowUpload(true);
  };

  const handleSearchComplete = () => {
    setShowSearch(false);
    onComplete();
    onOpenChange(false);
  };

  const handleUploadComplete = (result: UploadResult) => {
    setShowUpload(false);
    onComplete(result);
    onOpenChange(false);
  };

  const handleSearchOpenChange = (next: boolean) => {
    setShowSearch(next);
  };

  const handleUploadOpenChange = (next: boolean) => {
    setShowUpload(next);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('kb.addPaper.title')}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {t('kb.addPaper.subtitle')}
          </p>
          <div className="grid gap-4 py-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={handleSelectSearch}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 transition-all',
                'hover:border-primary hover:bg-primary/5 hover:shadow-md',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Search className="size-7 text-primary" />
              </div>
              <span className="font-semibold">{t('kb.addPaper.searchKeywords')}</span>
              <span className="text-center text-sm text-muted-foreground">
                {t('kb.addPaper.searchDesc')}
              </span>
            </button>
            <button
              type="button"
              onClick={handleSelectUpload}
              className={cn(
                'flex flex-col items-center gap-3 rounded-xl border-2 border-border p-6 transition-all',
                'hover:border-primary hover:bg-primary/5 hover:shadow-md',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2'
              )}
            >
              <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                <Upload className="size-7 text-primary" />
              </div>
              <span className="font-semibold">{t('kb.addPaper.uploadPdf')}</span>
              <span className="text-center text-sm text-muted-foreground">
                {t('kb.addPaper.uploadDesc')}
              </span>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <SearchAddDialog
        projectId={projectId}
        open={showSearch}
        onOpenChange={handleSearchOpenChange}
        onComplete={handleSearchComplete}
      />

      <PdfUploadDialog
        projectId={projectId}
        open={showUpload}
        onOpenChange={handleUploadOpenChange}
        onUploadComplete={handleUploadComplete}
      />
    </>
  );
}
