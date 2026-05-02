import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Search,
  Upload,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { kbApi, type UploadResult, type NewPaperData } from '@/services/kb-api';
import { api } from '@/lib/api';
import { SearchQueryStep } from './search-add/SearchQueryStep';
import { SearchResultsStep, type SearchResult } from './search-add/SearchResultsStep';
import { AddPaperDialogFooter } from './AddPaperDialogFooter';
import { UploadTabContent } from './upload-add/UploadTabContent';

interface AddPaperDialogProps {
  projectId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: (uploadResult?: UploadResult) => void;
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
      const papers: SearchResult[] = (res?.papers ?? []).map((p) => ({
        title: p.title,
        abstract: p.abstract ?? undefined,
        authors: typeof p.authors === 'string' ? undefined : (p.authors as { name: string }[] | undefined),
        doi: p.doi ?? undefined,
        year: p.year ?? undefined,
        journal: p.journal ?? undefined,
        source: p.source ?? undefined,
      }));
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
      onComplete?.();
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
      onComplete?.(uploadResult);
      handleOpenChange(false);
    }
  }, [uploadResult, onComplete, handleOpenChange]);

  const hasSearchResults = searchResults.length > 0;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl overflow-hidden">
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
            <UploadTabContent
              uploadResult={uploadResult}
              isUploading={isUploading}
              uploadProgress={uploadProgress}
              uploadStage={uploadStage}
              uploadError={uploadError}
              files={files}
              isDragging={isDragging}
              addFiles={addFiles}
              removeFile={removeFile}
              onIsDraggingChange={setIsDragging}
            />
          </TabsContent>
        </Tabs>

        <AddPaperDialogFooter
          activeTab={activeTab}
          hasSearchResults={hasSearchResults}
          selectedCount={selected.size}
          isImporting={isImporting}
          isSearching={isSearching}
          query={query}
          isUploading={isUploading}
          filesCount={files.length}
          uploadResult={uploadResult}
          onBack={() => {
            setSearchResults([]);
            setSelected(new Set());
          }}
          onImport={handleImportSelected}
          onSearch={handleSearch}
          onCancel={() => handleOpenChange(false)}
          onUpload={handleUpload}
          onContinue={handleUploadContinue}
        />
      </DialogContent>
    </Dialog>
  );
}
