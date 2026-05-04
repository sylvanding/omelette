import { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, ChevronDown, ChevronRight } from 'lucide-react';
import { paperApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { Paper } from '@/types';
import { PapersFilterBar } from './papers/PapersFilterBar';
import type { PaperStatus, ReadingStatus } from '@/types';

interface YearGroup {
  year: number;
  papers: Paper[];
  totalCitations: number;
}

export default function TimelinePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaperStatus | ''>('');
  const [readingStatus, setReadingStatus] = useState<ReadingStatus | ''>('');
  const [year, setYear] = useState('');
  const [qualityTag, setQualityTag] = useState('');
  const [expandedYears, setExpandedYears] = useState<Set<number>>(new Set());

  const filters = useMemo(
    () => ({
      page: 1,
      page_size: 100,
      q: search || undefined,
      status: status || undefined,
      reading_status: readingStatus || undefined,
      year: year ? Number(year) : undefined,
      sort_by: 'year',
      order: 'desc' as const,
    }),
    [search, status, readingStatus, year],
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.papers.list(pid, filters),
    queryFn: () => paperApi.list(pid, filters),
    enabled: !!pid,
  });

  const papers: Paper[] = useMemo(() => data?.items ?? [], [data?.items]);

  const yearGroups: YearGroup[] = useMemo(() => {
    const map = new Map<number, Paper[]>();
    for (const paper of papers) {
      const y = paper.year ?? 0;
      if (!map.has(y)) map.set(y, []);
      map.get(y)!.push(paper);
    }
    return Array.from(map.entries())
      .map(([year, papers]) => ({
        year,
        papers: papers.sort((a, b) => b.citation_count - a.citation_count),
        totalCitations: papers.reduce((sum, p) => sum + p.citation_count, 0),
      }))
      .sort((a, b) => b.year - a.year);
  }, [papers]);

  const allYears = useMemo(() => yearGroups.map((g) => g.year), [yearGroups]);

  const toggleYear = (year: number) => {
    setExpandedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) next.delete(year);
      else next.add(year);
      return next;
    });
  };

  const expandAll = () => setExpandedYears(new Set(allYears));
  const collapseAll = () => setExpandedYears(new Set());

  const handlePaperClick = (paper: Paper) => {
    navigate(`/projects/${pid}/papers/${paper.id}/read`);
  };

  if (isLoading) {
    return <LoadingState />;
  }

  if (papers.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title={t('timeline.empty')}
        description={t('timeline.emptyHint')}
      />
    );
  }

  return (
    <div className="space-y-4">
      <PapersFilterBar
        search={search}
        author=""
        journal=""
        status={status}
        readingStatus={readingStatus}
        year={year}
        qualityTag={qualityTag}
        sortBy="year"
        order="desc"
        onSearchChange={setSearch}
        onAuthorChange={() => {}}
        onJournalChange={() => {}}
        onStatusChange={setStatus}
        onReadingStatusChange={setReadingStatus}
        onYearChange={setYear}
        onQualityTagChange={setQualityTag}
        onSortChange={() => {}}
        onOrderChange={() => {}}
      />

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t('timeline.paperCount', { count: papers.length })}
        </span>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={expandAll}>
            {t('common.expandAll')}
          </Button>
          <Button variant="ghost" size="sm" onClick={collapseAll}>
            {t('common.collapse')}
          </Button>
        </div>
      </div>

      {/* Horizontal timeline bar */}
      <TimelineBar groups={yearGroups} expandedYears={expandedYears} onYearClick={toggleYear} />

      {/* Year groups */}
      <div className="space-y-6">
        {yearGroups.map((group) => (
          <YearGroupSection
            key={group.year}
            group={group}
            isExpanded={expandedYears.has(group.year)}
            onToggle={() => toggleYear(group.year)}
            onPaperClick={handlePaperClick}
            t={t}
          />
        ))}
      </div>
    </div>
  );
}

interface TimelineBarProps {
  groups: YearGroup[];
  expandedYears: Set<number>;
  onYearClick: (year: number) => void;
}

function TimelineBar({ groups, expandedYears, onYearClick }: TimelineBarProps) {
  const maxCitations = Math.max(...groups.map((g) => g.totalCitations), 1);

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-end gap-2 overflow-x-auto pb-2">
        {groups.map((group) => {
          const height = Math.max(
            20,
            (group.totalCitations / maxCitations) * 80,
          );
          const isExpanded = expandedYears.has(group.year);
          return (
            <TooltipProvider key={group.year}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'flex shrink-0 cursor-pointer flex-col items-center gap-1 rounded-md px-2 py-1 transition-colors hover:bg-accent',
                      isExpanded && 'bg-accent',
                    )}
                    onClick={() => onYearClick(group.year)}
                  >
                    <span className="text-xs font-medium text-muted-foreground">
                      {group.year}
                    </span>
                    <div
                      className="w-6 rounded-sm bg-primary/60 transition-all"
                      style={{ height: `${height}px` }}
                    />
                    <span className="text-xs text-muted-foreground">
                      {group.papers.length}
                    </span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="font-medium">{group.year}</p>
                  <p className="text-xs text-muted-foreground">
                    {group.papers.length} paper(s) · {group.totalCitations.toLocaleString()} citation(s)
                  </p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    </div>
  );
}

interface YearGroupSectionProps {
  group: YearGroup;
  isExpanded: boolean;
  onToggle: () => void;
  onPaperClick: (paper: Paper) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
}

function YearGroupSection({ group, isExpanded, onToggle, onPaperClick, t }: YearGroupSectionProps) {
  return (
    <div className="rounded-lg border bg-card">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-accent/50"
        onClick={onToggle}
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="size-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="size-4 text-muted-foreground" />
          )}
          <span className="text-lg font-semibold">{group.year}</span>
          <Badge variant="secondary">
            {group.papers.length} {t('timeline.papers', { count: group.papers.length })}
          </Badge>
          <span className="text-sm text-muted-foreground">
            {group.totalCitations.toLocaleString()} citation(s)
          </span>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t px-4 py-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {group.papers.map((paper) => (
              <PaperCard
                key={paper.id}
                paper={paper}
                onClick={() => onPaperClick(paper)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface PaperCardProps {
  paper: Paper;
  onClick: () => void;
}

function PaperCard({ paper, onClick }: PaperCardProps) {
  const nodeSize = Math.max(8, Math.min(40, Math.sqrt(paper.citation_count) * 5));

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent/50"
            onClick={onClick}
          >
            <div
              className="mt-0.5 shrink-0 rounded-full bg-primary/30"
              style={{ width: `${nodeSize}px`, height: `${nodeSize}px` }}
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{paper.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {paper.journal || '—'}
              </p>
            </div>
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-sm">
          <p className="font-semibold">{paper.title}</p>
          {paper.authors && paper.authors.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {paper.authors
                .map((a) => (typeof a === 'object' && 'name' in a ? a.name : String(a)))
                .slice(0, 3)
                .join(', ')}
              {paper.authors.length > 3 ? ' et al.' : ''}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {paper.journal || '—'} · {paper.year ?? 'N/A'}
          </p>
          <p className="mt-1 text-xs font-medium">
            {paper.citation_count.toLocaleString()} citation(s)
          </p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
