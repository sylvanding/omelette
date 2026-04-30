import { useState, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { Download } from 'lucide-react';
import { useDebouncedSave } from '@/hooks/useDebouncedSave';
import type { SaveStatus } from '@/hooks/useDebouncedSave';
import 'katex/dist/katex.min.css';
import { useTranslation } from 'react-i18next';

interface NotesPanelProps {
  paperId: number;
  projectId: number;
  notes: string;
  paperTitle: string;
  onSave: (notes: string) => Promise<void>;
}

const AUTO_SAVE_DELAY = 2000;

const SAVE_STATUS_LABELS: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Saving...',
  saved: 'Saved',
  error: 'Save failed',
};

const SAVE_STATUS_COLORS: Record<SaveStatus, string> = {
  idle: 'text-muted-foreground',
  saving: 'text-muted-foreground',
  saved: 'text-green-600',
  error: 'text-red-600',
};

function downloadAsMarkdown(title: string, content: string) {
  const date = new Date().toISOString().split('T')[0];
  const markdown = `# ${title}\n\n> Exported on ${date}\n\n---\n\n${content}`;
  const blob = new Blob([markdown], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title.replace(/[^a-zA-Z0-9\s-]/g, '').trim()}-notes.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function NotesPanel({ notes, paperTitle, onSave }: NotesPanelProps) {
  const { t } = useTranslation();
  const [content, setContent] = useState(notes);
  const [activeTab, setActiveTab] = useState<'edit' | 'preview'>('edit');

  const handleSave = async (text: string) => {
    await onSave(text);
  };

  const { status, triggerSave } = useDebouncedSave(handleSave, AUTO_SAVE_DELAY);

  const handleChange = (value: string) => {
    setContent(value);
    triggerSave(value);
    if (activeTab === 'preview') {
      setActiveTab('edit');
    }
  };

  const remarkPlugins = useMemo(() => [remarkGfm, remarkMath], []);
  const rehypePlugins = useMemo(() => [rehypeKatex, rehypeHighlight], []);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-1">
          <button
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              activeTab === 'edit'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('edit')}
            role="tab"
            aria-selected={activeTab === 'edit'}
          >
            {t('notes.edit', 'Edit')}
          </button>
          <button
            className={`rounded-md px-2 py-1 text-xs transition-colors ${
              activeTab === 'preview'
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('preview')}
            role="tab"
            aria-selected={activeTab === 'preview'}
          >
            {t('notes.preview', 'Preview')}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="rounded-md p-1 text-muted-foreground hover:text-foreground"
            onClick={() => downloadAsMarkdown(paperTitle, content)}
            title={t('notes.export', 'Export as Markdown')}
          >
            <Download className="size-3.5" />
          </button>
          <span className={`text-xs ${SAVE_STATUS_COLORS[status]}`}>
            {SAVE_STATUS_LABELS[status]}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {activeTab === 'edit' ? (
          <textarea
            className="h-full w-full resize-none bg-background p-3 text-sm leading-relaxed outline-none placeholder:text-muted-foreground"
            value={content}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={t('notes.placeholder', 'Write your notes here... Markdown and LaTeX are supported.')}
          />
        ) : (
          <div className="prose prose-sm prose-invert max-w-none p-3">
            <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins}>
              {content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
