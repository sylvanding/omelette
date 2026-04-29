import { useTranslation } from 'react-i18next';
import { Upload, FileText, X, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { UploadResult } from '@/services/kb-api';

interface UploadTabContentProps {
  uploadResult: UploadResult | null;
  isUploading: boolean;
  uploadProgress: number;
  uploadStage: 'idle' | 'uploading' | 'analyzing';
  uploadError: string | null;
  files: File[];
  isDragging: boolean;
  addFiles: (newFiles: FileList | File[]) => void;
  removeFile: (index: number) => void;
  onIsDraggingChange: (dragging: boolean) => void;
}

export function UploadTabContent({
  uploadResult,
  isUploading,
  uploadProgress,
  uploadStage,
  uploadError,
  files,
  isDragging,
  addFiles,
  removeFile,
  onIsDraggingChange,
}: UploadTabContentProps) {
  const { t } = useTranslation();

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  if (uploadResult) {
    return (
      <div className="space-y-4 py-2">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4">
          <Check className="size-5 text-green-600 dark:text-green-500" />
          <div>
            <p className="font-medium">{t('kb.upload.success')}</p>
            <p className="text-sm text-muted-foreground">
              {t('kb.upload.parsed', { count: uploadResult.total_uploaded })}
              {uploadResult.conflicts.length > 0 &&
                ` · ${t('kb.upload.conflicts', { count: uploadResult.conflicts.length })}`}
            </p>
          </div>
        </div>
        {uploadResult.conflicts.length > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500" />
            <p className="text-sm">{t('kb.upload.conflictsDesc')}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 py-2">
      <div
        onDrop={(e) => {
          e.preventDefault();
          onIsDraggingChange(false);
          addFiles(e.dataTransfer.files);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          onIsDraggingChange(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          onIsDraggingChange(false);
        }}
        className={cn(
          'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
          isDragging
            ? 'border-primary bg-primary/5'
            : 'border-border hover:border-primary/50',
        )}
      >
        <Upload className="mb-2 size-10 text-muted-foreground" />
        <p className="mb-1 text-sm font-medium">
          {t('kb.upload.dropHint')}
        </p>
        <p className="mb-4 text-xs text-muted-foreground">
          {t('kb.upload.pdfOnly')}
        </p>
        <input
          type="file"
          accept=".pdf,application/pdf"
          multiple
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files);
            e.target.value = '';
          }}
          className="hidden"
          id="pdf-upload-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            document.getElementById('pdf-upload-input')?.click()
          }
        >
          {t('kb.upload.selectFiles')}
        </Button>
      </div>

      {files.length > 0 && (
        <div className="space-y-2">
          <span className="text-sm font-medium">
            {t('kb.upload.fileCount', {
              count: files.length,
              size: formatSize(totalSize),
            })}
          </span>
          <ul className="max-h-40 space-y-1 overflow-y-auto overflow-x-hidden rounded-md border border-border p-2 pr-3">
            {files.map((file, i) => (
              <li
                key={`${file.name}-${i}`}
                className="flex min-w-0 items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-sm hover:bg-muted/50"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" />
                <span
                  className="min-w-0 flex-1 truncate"
                  title={file.name}
                >
                  {file.name}
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-muted-foreground">
                  {formatSize(file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => removeFile(i)}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  aria-label={t('kb.upload.removeFile')}
                >
                  <X className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isUploading && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {uploadStage === 'uploading'
                ? t('kb.upload.uploading')
                : t('kb.upload.analyzing')}
            </span>
            <span>{uploadProgress}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                'h-full rounded-full transition-all duration-300',
                uploadStage === 'analyzing'
                  ? 'animate-pulse bg-amber-500'
                  : 'bg-primary',
              )}
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {uploadError && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="size-4 shrink-0" />
          {uploadError}
        </div>
      )}
    </div>
  );
}
