import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { collectionsApi } from '@/services/api';
import type { Collection } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, X, Tag } from 'lucide-react';

interface CollectionSidebarProps {
  projectId: number;
  selectedCollectionId: number | null;
  onSelectCollection: (id: number | null) => void;
}

const COLLECTION_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b',
];

export function CollectionSidebar({
  projectId,
  selectedCollectionId,
  onSelectCollection,
}: CollectionSidebarProps) {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLLECTION_COLORS[0]);
  const [loading, setLoading] = useState(false);

  const loadCollections = useCallback(async () => {
    try {
      const data = await collectionsApi.list(projectId);
      setCollections(data.collections);
    } catch {
      // Silently fail - collections may not be set up yet
    }
  }, [projectId]);

  useEffect(() => {
    loadCollections();
  }, [loadCollections]);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setLoading(true);
    try {
      const collection = await collectionsApi.create(projectId, {
        name: newName.trim(),
        color: newColor,
      });
      setCollections(prev => [...prev, collection]);
      setNewName('');
      setIsCreating(false);
    } catch (e) {
      console.error('Failed to create collection', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (collectionId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await collectionsApi.delete(projectId, collectionId);
      setCollections(prev => prev.filter(c => c.id !== collectionId));
      if (selectedCollectionId === collectionId) {
        onSelectCollection(null);
      }
    } catch (e) {
      console.error('Failed to delete collection', e);
    }
  };

  const handleRename = async (collection: Collection, newName: string) => {
    if (newName.trim() === collection.name) return;
    try {
      const updated = await collectionsApi.update(projectId, collection.id, {
        name: newName.trim(),
      });
      setCollections(prev => prev.map(c => c.id === collection.id ? updated : c));
    } catch (e) {
      console.error('Failed to rename collection', e);
    }
  };

  return (
    <div className="flex h-full flex-col border-r bg-background">
      <div className="flex items-center justify-between border-b p-3">
        <h3 className="text-sm font-semibold">{t('collections.title')}</h3>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => setIsCreating(true)}
          title={t('collections.create')}
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {/* All Papers option */}
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent ${
            selectedCollectionId === null ? 'bg-accent font-medium' : ''
          }`}
          onClick={() => onSelectCollection(null)}
        >
          <span className="size-2 rounded-full bg-muted-foreground/40" />
          {t('collections.allPapers')}
        </button>

        {collections.map(collection => (
          <CollectionRow
            key={collection.id}
            collection={collection}
            isSelected={selectedCollectionId === collection.id}
            onSelect={() => onSelectCollection(collection.id)}
            onDelete={(e) => handleDelete(collection.id, e)}
            onRename={(name) => handleRename(collection, name)}
          />
        ))}

        {isCreating && (
          <div className="mt-2 space-y-2 rounded-md border p-2">
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder={t('collections.namePlaceholder')}
              size="sm"
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') handleCreate();
                if (e.key === 'Escape') setIsCreating(false);
              }}
            />
            <div className="flex items-center gap-1">
              {COLLECTION_COLORS.map(color => (
                <button
                  key={color}
                  type="button"
                  className={`size-4 rounded-full border-2 transition-transform hover:scale-110 ${
                    newColor === color ? 'border-foreground' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: color }}
                  onClick={() => setNewColor(color)}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Button size="xs" onClick={handleCreate} disabled={loading || !newName.trim()}>
                {t('collections.createBtn')}
              </Button>
              <Button size="xs" variant="outline" onClick={() => setIsCreating(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t p-2">
        <TagSuggestButton projectId={projectId} />
      </div>
    </div>
  );
}

interface CollectionRowProps {
  collection: Collection;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: (e: React.MouseEvent) => void;
  onRename: (name: string) => void;
}

function CollectionRow({ collection, isSelected, onSelect, onDelete, onRename }: CollectionRowProps) {
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(collection.name);

  const handleSave = () => {
    if (editName.trim() && editName !== collection.name) {
      onRename(editName.trim());
    }
    setEditing(false);
  };

  return (
    <div
      className={`group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent ${
        isSelected ? 'bg-accent font-medium' : ''
      }`}
    >
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left"
        onClick={onSelect}
      >
        <span
          className="size-2 shrink-0 rounded-full"
          style={{ backgroundColor: collection.color || '#64748b' }}
        />
        <span className="truncate">{collection.name}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {collection.paper_count}
        </span>
      </button>

      <div className="hidden items-center gap-1 group-hover:flex">
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          onClick={() => {
            setEditName(collection.name);
            setEditing(true);
          }}
          title={t('collections.rename')}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          </svg>
        </button>
        <button
          type="button"
          className="rounded p-0.5 text-muted-foreground hover:text-destructive"
          onClick={onDelete}
          title={t('collections.delete')}
        >
          <X className="size-3" />
        </button>
      </div>

      {editing && (
        <div className="absolute inset-0 z-10 flex items-center gap-1 rounded-md bg-background px-2">
          <Input
            value={editName}
            onChange={e => setEditName(e.target.value)}
            size="sm"
            autoFocus
            onKeyDown={e => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setEditing(false);
            }}
            onBlur={handleSave}
          />
        </div>
      )}
    </div>
  );
}

interface TagSuggestButtonProps {
  projectId: number;
}

function TagSuggestButton({ projectId }: TagSuggestButtonProps) {
  const [loading, setLoading] = useState(false);

  const handleSuggestTags = async () => {
    setLoading(true);
    try {
      // Fetch all papers to tag
      const { paperApi } = await import('@/services/api');
      const papersData = await paperApi.list(projectId, { page: 1, page_size: 100 });
      const paperIds = papersData.items.map(p => p.id);

      if (paperIds.length === 0) return;

      const { suggestTags } = collectionsApi;
      const result = await suggestTags(projectId, paperIds);
      console.log('Tag suggestions:', result.tags);
      // In a full implementation, this would update the paper tags
    } catch (e) {
      console.error('Failed to suggest tags', e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="w-full text-xs"
      onClick={handleSuggestTags}
      disabled={loading}
    >
      <Tag className="mr-1 size-3" />
      {loading ? t('collections.aiTags.generating') : t('collections.aiTags.button')}
    </Button>
  );
}
