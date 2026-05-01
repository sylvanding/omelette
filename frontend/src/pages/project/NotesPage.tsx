import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Search, FileText, BookOpen, NotebookPen } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { notesApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import PageLayout from '@/components/layout/PageLayout';
import { cn } from '@/lib/utils';

function NotesPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [search, setSearch] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: search
      ? queryKeys.notes.search(pid, search)
      : queryKeys.notes.all(pid),
    queryFn: () => notesApi.aggregate(pid, search || undefined),
  });

  if (isLoading) {
    return (
      <PageLayout title={t('notes.dashboard', 'Notes Dashboard')}>
        <LoadingState />
      </PageLayout>
    );
  }

  if (isError || !data) {
    return (
      <PageLayout title={t('notes.dashboard', 'Notes Dashboard')}>
        <div className="py-12 text-center text-muted-foreground">
          {t('notes.loadFailed', 'Failed to load notes')}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t('notes.dashboard', 'Notes Dashboard')}>
      <div className="space-y-6">
        {/* Summary cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard icon={BookOpen} label={t('notes.totalPapers', 'Total Papers')} value={data.total_papers} />
          <SummaryCard icon={FileText} label={t('notes.papersWithNotes', 'Papers with Notes')} value={data.papers_with_notes} color="text-blue-500" />
          <SummaryCard icon={NotebookPen} label={t('notes.totalNotes', 'Total Notes')} value={data.total_notes} color="text-green-500" />
        </div>

        {/* Search bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            className="w-full rounded-lg border bg-background py-2 pl-10 pr-4 text-sm outline-none focus:ring-2 focus:ring-primary"
            placeholder={t('notes.searchPlaceholder', 'Search across all notes...')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Notes list */}
        {data.notes.length === 0 ? (
          <EmptyState hasPapers={data.total_papers > 0} />
        ) : (
          <div className="space-y-4">
            {data.notes.map((note) => (
              <NoteCard key={note.paper_id} note={note} projectId={pid} />
            ))}
          </div>
        )}
      </div>
    </PageLayout>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  color = 'text-foreground',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  color?: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="size-4" />
        {label}
      </div>
      <div className={cn('mt-1 text-2xl font-bold', color)}>{value}</div>
    </div>
  );
}

function EmptyState({ hasPapers }: { hasPapers: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center rounded-lg border bg-muted/30 py-16 text-center">
      <NotebookPen className="mb-4 size-12 text-muted-foreground" />
      <h3 className="mb-1 text-lg font-semibold">
        {hasPapers
          ? t('notes.noNotesYet', 'No notes yet')
          : t('notes.noPapersYet', 'No papers yet')}
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {hasPapers
          ? t('notes.emptyWithPapers', 'Start adding notes to papers from the PDF reader to see them here.')
          : t('notes.emptyNoPapers', 'Add papers to your project first, then start taking notes.')}
      </p>
    </div>
  );
}

function NoteCard({ note, projectId }: { note: import('@/services/api').PaperNote; projectId: number }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const authorNames = note.authors
    .filter((a): a is { name: string } => typeof a === 'object' && a !== null && 'name' in a)
    .map((a) => a.name)
    .slice(0, 3);

  const citation = [authorNames.join(', '), note.year].filter(Boolean).join(', ');

  const isLong = note.notes.length > 300;
  const displayNotes = isLong && !expanded ? `${note.notes.slice(0, 300)}...` : note.notes;

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      {/* Paper header */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold">{note.title}</h3>
          {citation && (
            <p className="truncate text-xs text-muted-foreground">{citation}</p>
          )}
          {note.journal && (
            <p className="truncate text-xs text-muted-foreground italic">{note.journal}</p>
          )}
        </div>
        <a
          href={`/projects/${projectId}/papers/${note.paper_id}/read`}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          title={t('notes.openPaper', 'Open paper in reader')}
        >
          <BookOpen className="size-4" />
        </a>
      </div>

      {/* Notes content */}
      <div className="prose prose-sm prose-invert max-w-none rounded-md bg-muted/30 px-3 py-2 text-sm">
        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
          {displayNotes}
        </ReactMarkdown>
      </div>

      {isLong && (
        <button
          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? t('notes.showLess', 'Show less') : t('notes.showMore', 'Show more')}
        </button>
      )}

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase">
          {note.reading_status}
        </span>
        {note.updated_at && (
          <span>{t('notes.updated', 'Updated')} {new Date(note.updated_at).toLocaleDateString()}</span>
        )}
      </div>
    </div>
  );
}

export default NotesPage;
