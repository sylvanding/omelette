import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Upload,
  FileText,
  X,
  Check,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { kbApi, type UploadResult } from '@/services/kb-api';
import { cn } from '@/lib/utils';

interface PdfUploadDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUploadComplete: (result: UploadResult) => void;
}

export function PdfUploadDialog({
  projectId,
  open,
  onOpenChange,
  onUploadComplete,
}: PdfUploadDialogProps) {
  const { t } = useTranslation();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setFiles([]);
    setUploadResult(null);
    setError(null);
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) reset();
      onOpenChange(next);
    },
    [onOpenChange, reset]
  );

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter((f) => f.type === 'application/pdf');
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const added = list.filter((f) => !seen.has(`${f.name}-${f.size}`));
      return [...prev, ...added];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const selected = e.target.files;
      if (selected) addFiles(selected);
      e.target.value = '';
    },
    [addFiles]
  );

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setError(null);
    try {
      const res = await kbApi.uploadPdfs(projectId, files);
      const result = res?.data as UploadResult;
      setUploadResult(result);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : t('kb.upload.error');
      setError(msg);
    } finally {
      setIsUploading(false);
    }
  }, [projectId, files, t]);

  const handleContinue = useCallback(() => {
    if (uploadResult) {
      onUploadComplete(uploadResult);
      handleOpenChange(false);
    }
  }, [uploadResult, onUploadComplete, handleOpenChange]);

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('kb.upload.title')}</DialogTitle>
        </DialogHeader>

        {uploadResult ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-4">
              <Check className="size-5 text-green-600 dark:text-green-500" />
              <div>
                <p className="font-medium">{t('kb.upload.success')}</p>
                <p className="text-sm text-muted-foreground">
                  {t('kb.upload.parsed', {
                    count: uploadResult.total_uploaded,
                  })}
                  {uploadResult.conflicts.length > 0 &&
                    ` · ${t('kb.upload.conflicts', {
                      count: uploadResult.conflicts.length,
                    })}`}
                </p>
              </div>
            </div>
            {uploadResult.conflicts.length > 0 && (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
                <AlertTriangle className="size-4 text-amber-600 dark:text-amber-500" />
                <p className="text-sm">
                  {t('kb.upload.conflictsDesc')}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                'flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 transition-colors',
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              )}
            >
              <Upload className="mb-2 size-10 text-muted-foreground" />
              <p className="mb-1 text-sm font-medium">{t('kb.upload.dropHint')}</p>
              <p className="mb-4 text-xs text-muted-foreground">
                {t('kb.upload.pdfOnly')}
              </p>
              <input
                type="file"
                accept=".pdf,application/pdf"
                multiple
                onChange={handleFileInput}
                className="hidden"
                id="pdf-upload-input"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => document.getElementById('pdf-upload-input')?.click()}
              >
                {t('kb.upload.selectFiles')}
              </Button>
            </div>

            {files.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {t('kb.upload.fileCount', {
                      count: files.length,
                      size: formatSize(totalSize),
                    })}
                  </span>
                </div>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {files.map((file, i) => (
                    <li
                      key={`${file.name}-${i}`}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted/50"
                    >
                      <FileText className="size-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
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

            {error && (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                <AlertTriangle className="size-4 shrink-0" />
                {error}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          {uploadResult ? (
            <Button onClick={handleContinue}>
              {uploadResult.conflicts.length > 0
                ? t('kb.upload.continueToConflicts')
                : t('kb.upload.done')}
            </Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => handleOpenChange(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                onClick={handleUpload}
                disabled={files.length === 0 || isUploading}
              >
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
