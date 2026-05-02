import { useCallback, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CollectionSidebar } from '@/components/collections/CollectionSidebar';
import { collectionsApi, paperApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  BookOpen,
  Plus,
  Trash2,
  Loader2,
  FileText,
} from 'lucide-react';

export default function CollectionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);

  const [selectedCollectionId, setSelectedCollectionId] = useState<number | null>(null);
  const [selectedPaperIds, setSelectedPaperIds] = useState<Set<number>>(new Set());

  const { data: collectionDetail, isLoading: loadingDetail } = useQuery({
    queryKey: ['collection-detail', pid, selectedCollectionId],
    queryFn: () => collectionsApi.getDetail(pid, selectedCollectionId!),
    enabled: !!selectedCollectionId,
  });

  const { data: allPapers, isLoading: loadingPapers } = useQuery({
    queryKey: ['papers-for-collection', pid],
    queryFn: () => paperApi.list(pid, { page: 1, page_size: 200 }),
    enabled: selectedCollectionId !== null,
  });

  const collectionPapers = collectionDetail?.papers ?? [];
  const collectionPaperIds = new Set(collectionPapers.map(p => p.paper_id));
  const availablePapers = allPapers?.items.filter(p => !collectionPaperIds.has(p.id)) ?? [];

  const handleSelectCollection = useCallback((id: number | null) => {
    setSelectedCollectionId(id);
    setSelectedPaperIds(new Set());
  }, []);

  const handleTogglePaper = useCallback((paperId: number) => {
    setSelectedPaperIds(prev => {
      const next = new Set(prev);
      if (next.has(paperId)) {
        next.delete(paperId);
      } else {
        next.add(paperId);
      }
      return next;
    });
  }, []);

  const handleAddPapers = useCallback(async () => {
    if (!selectedCollectionId || selectedPaperIds.size === 0) return;
    await collectionsApi.addPapers(pid, selectedCollectionId, [...selectedPaperIds]);
    setSelectedPaperIds(new Set());
  }, [pid, selectedCollectionId, selectedPaperIds]);

  const handleRemovePaper = useCallback(async (paperId: number) => {
    if (!selectedCollectionId) return;
    await collectionsApi.removePapers(pid, selectedCollectionId, [paperId]);
  }, [pid, selectedCollectionId]);

  if (!selectedCollectionId) {
    return (
      <div className="flex h-full">
        <div className="w-64 shrink-0">
          <CollectionSidebar
            projectId={pid}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={handleSelectCollection}
          />
        </div>
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <div className="text-center">
            <BookOpen className="mx-auto mb-3 size-12 opacity-40" />
            <p className="text-sm">Select a collection to view its papers</p>
            <p className="mt-1 text-xs">Or create a new one from the sidebar</p>
          </div>
        </div>
      </div>
    );
  }

  if (loadingDetail) {
    return (
      <div className="flex h-full">
        <div className="w-64 shrink-0">
          <CollectionSidebar
            projectId={pid}
            selectedCollectionId={selectedCollectionId}
            onSelectCollection={handleSelectCollection}
          />
        </div>
        <div className="flex flex-1 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div className="w-64 shrink-0">
        <CollectionSidebar
          projectId={pid}
          selectedCollectionId={selectedCollectionId}
          onSelectCollection={handleSelectCollection}
        />
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Collection header */}
        {collectionDetail && (
          <div className="flex items-center justify-between border-b p-4">
            <div className="flex items-center gap-3">
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: collectionDetail.collection.color || '#64748b' }}
              />
              <div>
                <h2 className="text-lg font-semibold">{collectionDetail.collection.name}</h2>
                {collectionDetail.collection.description && (
                  <p className="text-sm text-muted-foreground">{collectionDetail.collection.description}</p>
                )}
              </div>
              <Badge variant="secondary">{collectionPapers.length} papers</Badge>
            </div>
            {selectedPaperIds.size > 0 && (
              <Button size="sm" onClick={handleAddPapers}>
                <Plus className="mr-1 size-3.5" />
                Add {selectedPaperIds.size} paper{selectedPaperIds.size > 1 ? 's' : ''}
              </Button>
            )}
          </div>
        )}

        <div className="flex flex-1 overflow-hidden">
          {/* Papers in collection */}
          <div className="flex-1 overflow-y-auto border-r">
            <div className="p-4">
              <h3 className="mb-3 text-sm font-medium">Papers in this collection</h3>
              {collectionPapers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No papers yet. Add papers from the list below.</p>
              ) : (
                <div className="space-y-2">
                  {collectionPapers.map(paper => (
                    <div
                      key={paper.paper_id}
                      className="flex items-start gap-3 rounded-md border bg-card p-3"
                    >
                      <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{paper.title}</p>
                        <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
                          {paper.year && <span>{paper.year}</span>}
                          {paper.citation_count > 0 && <span>{paper.citation_count} citations</span>}
                          {paper.doi && <span className="truncate">{paper.doi}</span>}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleRemovePaper(paper.paper_id)}
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Available papers */}
          <div className="w-80 overflow-y-auto">
            <div className="p-4">
              <h3 className="mb-3 text-sm font-medium">Add papers</h3>
              {loadingPapers ? (
                <div className="flex justify-center py-4">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              ) : availablePapers.length === 0 ? (
                <p className="text-sm text-muted-foreground">All papers are already in this collection.</p>
              ) : (
                <div className="space-y-1">
                  {availablePapers.map(paper => (
                    <div
                      key={paper.id}
                      className="flex items-start gap-2 rounded-md p-2 hover:bg-accent"
                    >
                      <button
                        type="button"
                        onClick={() => handleTogglePaper(paper.id)}
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border transition-colors ${
                          selectedPaperIds.has(paper.id)
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input hover:border-primary'
                        }`}
                      >
                        {selectedPaperIds.has(paper.id) && (
                          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium">{paper.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {paper.year ?? 'N/A'} · {paper.citation_count ?? 0} citations
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
