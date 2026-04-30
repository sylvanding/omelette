import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

const TAG_COLORS = [
  'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  'bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-300',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300',
];

function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

interface InlineTagEditorProps {
  tags: string[] | null;
  onTagsChange: (tags: string[]) => void;
}

export function InlineTagEditor({ tags, onTagsChange }: InlineTagEditorProps) {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const currentTags = tags ?? [];

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);

  const addTag = () => {
    const trimmed = inputValue.trim();
    if (!trimmed || currentTags.includes(trimmed)) {
      setInputValue('');
      return;
    }
    onTagsChange([...currentTags, trimmed]);
    setInputValue('');
  };

  const removeTag = (tag: string) => {
    onTagsChange(currentTags.filter((t) => t !== tag));
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addTag();
    }
    if (e.key === 'Escape') {
      setIsEditing(false);
      setInputValue('');
    }
  };

  if (currentTags.length === 0 && !isEditing) {
    return (
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
        onClick={() => setIsEditing(true)}
      >
        <Plus className="size-3 mr-1" />
        {t('papers.addTag')}
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      {currentTags.map((tag) => (
        <Badge
          key={tag}
          variant="outline"
          className={`text-xs gap-1 ${getTagColor(tag)}`}
        >
          {tag}
          <button
            onClick={() => removeTag(tag)}
            className="ml-0.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10"
            aria-label={t('papers.removeTag', 'Remove tag')}
          >
            <X className="size-3" />
          </button>
        </Badge>
      ))}
      {isEditing ? (
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (inputValue.trim()) addTag();
            setIsEditing(false);
          }}
          placeholder={t('papers.addTagPlaceholder', 'Add tag...')}
          className="h-6 w-24 text-xs"
        />
      ) : (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setIsEditing(true)}
          aria-label={t('papers.addTag')}
        >
          <Plus className="size-3" />
        </Button>
      )}
    </div>
  );
}
