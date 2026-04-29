import { useTranslation } from 'react-i18next';
import { Search, Upload, Loader2, FileText } from 'lucide-react';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import type { UploadResult } from '@/services/kb-api';

interface AddPaperDialogFooterProps {
  activeTab: string;
  hasSearchResults: boolean;
  selectedCount: number;
  isImporting: boolean;
  isSearching: boolean;
  query: string;
  isUploading: boolean;
  filesCount: number;
  uploadResult: UploadResult | null;
  onBack: () => void;
  onImport: () => void;
  onSearch: () => void;
  onCancel: () => void;
  onUpload: () => void;
  onContinue: () => void;
}

export function AddPaperDialogFooter({
  activeTab,
  hasSearchResults,
  selectedCount,
  isImporting,
  isSearching,
  query,
  isUploading,
  filesCount,
  uploadResult,
  onBack,
  onImport,
  onSearch,
  onCancel,
  onUpload,
  onContinue,
}: AddPaperDialogFooterProps) {
  const { t } = useTranslation();

  return (
    <DialogFooter>
      {activeTab === 'search' && (
        <>
          {hasSearchResults ? (
            <>
              <Button variant="outline" onClick={onBack}>
                {t('common.back')}
              </Button>
              <Button onClick={onImport} disabled={selectedCount === 0 || isImporting}>
                {isImporting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('kb.searchAdd.importing')}
                  </>
                ) : (
                  <>
                    <FileText className="size-4" />
                    {t('kb.searchAdd.addSelected', { count: selectedCount })}
                  </>
                )}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
              <Button onClick={onSearch} disabled={!query.trim() || isSearching}>
                {isSearching ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('kb.searchAdd.searching')}
                  </>
                ) : (
                  <>
                    <Search className="size-4" />
                    {t('common.search')}
                  </>
                )}
              </Button>
            </>
          )}
        </>
      )}
      {activeTab === 'upload' && (
        <>
          {uploadResult ? (
            <Button onClick={onContinue}>
              {uploadResult.conflicts.length > 0
                ? t('kb.upload.continueToConflicts')
                : t('kb.upload.done')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel}>
                {t('common.cancel')}
              </Button>
              <Button onClick={onUpload} disabled={filesCount === 0 || isUploading}>
                {isUploading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    {t('kb.upload.uploading')}
                  </>
                ) : (
                  <>
                    <Upload className="size-4" />
                    {t('kb.upload.upload')}
                  </>
                )}
              </Button>
            </>
          )}
        </>
      )}
    </DialogFooter>
  );
}
