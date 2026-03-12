import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Search,
  Upload,
  Loader2,
  FileText,
  X,
  Check,
  AlertTriangle,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { kbApi, type UploadResult, type NewPaperData } from '@/services/kb-api';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { SearchQueryStep } from './search-add/SearchQueryStep';
import { SearchResultsStep, type SearchResult } from './search-add/SearchResultsStep';

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
  const [activeTab, setActiveTab] = useState('search');

  // --- Search state ---
  const [query, setQuery] = useState('');
  const [sources, setSources] = useState<string[]>(['semantic_scholar', 'openalex']);
  const [maxResults, setMaxResults] = useState(50);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [isSearching, setIsSearching] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // --- Upload state ---
  const [files, setFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStage, setUploadStage] = useState<'idle' | 'uploading' | 'analyzing'>('idle');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetAll = useCallback(() => {
    setActiveTab('search');
    setQuery('');
    setSources(['semantic_scholar', 'openalex']);
    setMaxResults(50);
    setSearchResults([]);
    setSelected(new Set());
    setSearchError(null);
    setFiles([]);
    setUploadResult(null);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStage('idle');
    if (abortRef.current) abortRef.current.abort();
  }, []);

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) resetAll();
      onOpenChange(next);
    },
    [onOpenChange, resetAll],
  );

  // --- Search handlers ---
  const toggleSource = (id: string) =>
    setSources((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );

  const toggleSelect = (index: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const selectAll = () => {
    if (selected.size === searchResults.length) setSelected(new Set());
    else setSelected(new Set(searchResults.map((_, i) => i)));
  };

  const handleSearch = async () => {
    if (!query.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    try {
      const res = await kbApi.searchAndAdd(projectId, query.trim(), sources, maxResults);
      const papers = (res?.papers as unknown as SearchResult[]) ?? [];
      setSearchResults(papers);
      setSelected(new Set());
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : t('common.operationFailed');
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  const handleImportSelected = async () => {
    const toAdd: NewPaperData[] = Array.from(selected)
      .sort((a, b) => a - b)
      .map((i) => searchResults[i])
      .map((p) => ({
        title: p.title,
        abstract: p.abstract,
        authors: p.authors,
        doi: p.doi,
        year: p.year,
        journal: p.journal,
        source: p.source,
      }));
    if (toAdd.length === 0) return;
    setIsImporting(true);
    setSearchError(null);
    try {
      await kbApi.bulkImport(projectId, toAdd);
      toast.success(t('kb.searchAdd.importSuccess', { count: toAdd.length }));
      onComplete();
      handleOpenChange(false);
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : t('common.operationFailed');
      setSearchError(msg);
    } finally {
      setIsImporting(false);
    }
  };

  // --- Upload handlers ---
  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const list = Array.from(newFiles).filter(
      (f) => f.type === 'application/pdf',
    );
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => `${f.name}-${f.size}`));
      const added = list.filter((f) => !seen.has(`${f.name}-${f.size}`));
      return [...prev, ...added];
    });
  }, []);

  const removeFile = (index: number) =>
    setFiles((prev) => prev.filter((_, i) => i !== index));

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      addFiles(e.dataTransfer.files);
    },
    [addFiles],
  );

  const handleUpload = useCallback(async () => {
    if (files.length === 0) return;
    setIsUploading(true);
    setUploadError(null);
    setUploadProgress(0);
    setUploadStage('uploading');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const formData = new FormData();
      files.forEach((f) => formData.append('files', f));

      const res = await api.post<UploadResult>(
        `/projects/${projectId}/papers/upload`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 300000,
          signal: controller.signal,
          onUploadProgress: (e) => {
            if (e.total) {
              const pct = Math.round((e.loaded / e.total) * 80);
              setUploadProgress(pct);
              if (pct >= 80) setUploadStage('analyzing');
            }
          },
        },
      );

      setUploadProgress(100);
      setUploadStage('idle');
      setUploadResult(res.data);
    } catch (err: unknown) {
      if (controller.signal.aborted) return;
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: string }).message)
          : t('kb.upload.error');
      setUploadError(msg);
    } finally {
      setIsUploading(false);
      abortRef.current = null;
    }
  }, [projectId, files, t]);

  const handleUploadContinue = useCallback(() => {
    if (uploadResult) {
      onComplete(uploadResult);
      handleOpenChange(false);
    }
  }, [uploadResult, onComplete, handleOpenChange]);

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);
  const hasSearchResults = searchResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('kb.addPaper.title')}</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="search" className="gap-1.5">
              <Search className="size-4" />
              {t('kb.addPaper.searchKeywords')}
            </TabsTrigger>
            <TabsTrigger value="upload" className="gap-1.5">
              <Upload className="size-4" />
              {t('kb.addPaper.uploadPdf')}
            </TabsTrigger>
          </TabsList>

          {/* Search Tab */}
          <TabsContent value="search" className="mt-4">
            {!hasSearchResults ? (
              <SearchQueryStep
                query={query}
                onQueryChange={setQuery}
                sources={sources}
                onToggleSource={toggleSource}
                maxResults={maxResults}
                onMaxResultsChange={setMaxResults}
                onSearch={handleSearch}
                error={searchError}
              />
            ) : (
              <SearchResultsStep
                results={searchResults}
                selected={selected}
                isSearching={isSearching}
                onToggleSelect={toggleSelect}
                onSelectAll={selectAll}
              />
            )}
          </TabsContent>

          {/* Upload Tab */}
          <TabsContent value="upload" className="mt-4">
            {uploadResult ? (
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
            ) : (
              <div className="space-y-4 py-2">
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
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
                          className="flex items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-sm hover:bg-muted/50"
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
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          {activeTab === 'search' && (
            <>
              {hasSearchResults ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchResults([]);
                      setSelected(new Set());
                    }}
                  >
                    {t('common.back')}
                  </Button>
                  <Button
                    onClick={handleImportSelected}
                    disabled={selected.size === 0 || isImporting}
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="size-4 animate-spin" />
                        {t('kb.searchAdd.importing')}
                      </>
                    ) : (
                      <>
                        <FileText className="size-4" />
                        {t('kb.searchAdd.addSelected', {
                          count: selected.size,
                        })}
                      </>
                    )}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleSearch}
                    disabled={!query.trim() || isSearching}
                  >
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
                <Button onClick={handleUploadContinue}>
                  {uploadResult.conflicts.length > 0
                    ? t('kb.upload.continueToConflicts')
                    : t('kb.upload.done')}
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={() => handleOpenChange(false)}
                  >
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
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
