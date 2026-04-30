import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Tag, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface BulkTagDialogProps {
  selectedCount: number;
  existingTags: string[];
  onApply: (tagsToAdd: string[], tagsToRemove: string[]) => void;
  onClose: () => void;
}

export function BulkTagDialog({
  selectedCount,
  existingTags,
  onApply,
  onClose,
}: BulkTagDialogProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [tagsToAdd, setTagsToAdd] = useState<string[]>([]);
  const [tagsToRemove, setTagsToRemove] = useState<string[]>([]);

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || tagsToAdd.includes(trimmed)) {
      setInputValue('');
      return;
    }
    setTagsToAdd([...tagsToAdd, trimmed]);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
  };

  const toggleRemoveTag = (tag: string) => {
    if (tagsToRemove.includes(tag)) {
      setTagsToRemove(tagsToRemove.filter((t) => t !== tag));
    } else {
      setTagsToRemove([...tagsToRemove, tag]);
    }
  };

  const handleApply = () => {
    onApply(tagsToAdd, tagsToRemove);
    setTagsToAdd([]);
    setTagsToRemove([]);
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Tag className="size-4" />
            {t('papers.bulkTag.title', 'Bulk Tag')} ({selectedCount} {t('papers.bulkTag.papers', 'papers')})
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">{t('papers.bulkTag.addTags', 'Add tags')}</label>
            <div className="flex gap-2 mt-1">
              <Input
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('papers.addTagPlaceholder', 'Add tag...')}
              />
              <Button size="sm" onClick={addTag} disabled={!inputValue.trim()}>
                <Plus className="size-4" />
              </Button>
            </div>
            {tagsToAdd.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tagsToAdd.map((tag) => (
                  <Badge key={tag} variant="default" className="text-xs gap-1">
                    +{tag}
                    <button onClick={() => setTagsToAdd(tagsToAdd.filter((t) => t !== tag))}>
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {existingTags.length > 0 && (
            <div>
              <label className="text-sm font-medium">{t('papers.bulkTag.removeTags', 'Remove tags')}</label>
              <div className="flex flex-wrap gap-1 mt-1">
                {existingTags.map((tag) => (
                  <Badge
                    key={tag}
                    variant={tagsToRemove.includes(tag) ? 'destructive' : 'outline'}
                    className="text-xs gap-1 cursor-pointer"
                    onClick={() => toggleRemoveTag(tag)}
                  >
                    -{tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>{t('common.cancel')}</Button>
          <Button onClick={handleApply} disabled={tagsToAdd.length === 0 && tagsToRemove.length === 0}>
            {t('common.apply', 'Apply')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
