import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search,
  ChevronDown,
  ChevronRight,
  Trash2,
  FileDown,
  Scan,
} from 'lucide-react';
import { paperApi, ocrApi } from '@/services/api';
import type { Paper, PaperStatus } from '@/types';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS: { value: PaperStatus | ''; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'metadata_only', label: 'Metadata Only' },
  { value: 'pdf_downloaded', label: 'PDF Downloaded' },
  { value: 'ocr_complete', label: 'OCR Complete' },
  { value: 'indexed', label: 'Indexed' },
  { value: 'error', label: 'Error' },
];

const SORT_OPTIONS = [
  { value: 'created_at', label: 'Created' },
  { value: 'year', label: 'Year' },
  { value: 'citation_count', label: 'Citations' },
  { value: 'title', label: 'Title' },
];

export default function PapersPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const pid = Number(projectId!);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<PaperStatus | ''>('');
  const [year, setYear] = useState('');
  const [sortBy, setSortBy] = useState('created_at');
  const [order, setOrder] = useState<'asc' | 'desc'>('desc');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['papers', pid, search, status, year, sortBy, order],
    queryFn: () =>
      paperApi.list(pid, {
        q: search || undefined,
        status: status || undefined,
        year: year ? Number(year) : undefined,
        sort_by: sortBy,
        order,
      }),
    enabled: !!pid,
  });

  const deleteMutation = useMutation({
    mutationFn: (paperId: number) => paperApi.delete(pid, paperId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['papers', pid] }),
  });

  const ocrMutation = useMutation({
    mutationFn: (paperIds: number[]) => ocrApi.process(pid, paperIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers', pid] });
      queryClient.invalidateQueries({ queryKey: ['project', projectId] });
    },
  });

  const papers: Paper[] = data?.data?.items ?? [];
  const total = data?.data?.total ?? 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-bold text-foreground">Papers</h1>
      </div>

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search title or abstract..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-border bg-background py-2 pl-9 pr-3 text-sm"
            />
          </div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PaperStatus | '')}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <input
            type="number"
            placeholder="Year"
            value={year}
            onChange={(e) => setYear(e.target.value)}
            className="w-24 rounded-lg border border-border bg-background px-3 py-2 text-sm"
          />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => setOrder((o) => (o === 'asc' ? 'desc' : 'asc'))}
            className="rounded-lg border border-border bg-secondary px-3 py-2 text-sm hover:bg-secondary/80"
          >
            {order === 'asc' ? '↑ Asc' : '↓ Desc'}
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12 text-muted-foreground">
          Loading...
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="w-8 px-4 py-3 text-left text-xs font-medium text-muted-foreground" />
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Journal
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Year
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Citations
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {papers.map((paper) => (
                  <React.Fragment key={paper.id}>
                    <tr
                      key={paper.id}
                      className="border-b border-border hover:bg-muted/30">
                      <td className="px-4 py-2">
                        <button
                          onClick={() =>
                            setExpandedId(expandedId === paper.id ? null : paper.id)
                          }
                          className="p-1 text-muted-foreground hover:text-foreground">
                          {expandedId === paper.id ? (
                            <ChevronDown className="size-4" />
                          ) : (
                            <ChevronRight className="size-4" />
                          )}
                        </button>
                      </td>
                      <td className="max-w-md px-4 py-2">
                        <span className="line-clamp-2 font-medium text-foreground">
                          {paper.title}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {paper.journal || '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {paper.year ?? '-'}
                      </td>
                      <td className="px-4 py-2 text-sm text-muted-foreground">
                        {paper.citation_count}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={cn(
                            'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                            paper.status === 'indexed' && 'bg-green-100 text-green-800',
                            paper.status === 'ocr_complete' && 'bg-blue-100 text-blue-800',
                            paper.status === 'error' && 'bg-red-100 text-red-800',
                            paper.status === 'pending' && 'bg-yellow-100 text-yellow-800',
                            !['indexed', 'ocr_complete', 'error', 'pending'].includes(
                              paper.status
                            ) && 'bg-gray-100 text-gray-800'
                          )}>
                          {paper.status}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <div className="flex justify-end gap-1">
                          {paper.pdf_url && (
                            <a
                              href={paper.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                              title="Download PDF">
                              <FileDown className="size-4" />
                            </a>
                          )}
                          <button
                            onClick={() =>
                              ocrMutation.mutate([paper.id])}
                            disabled={ocrMutation.isPending || paper.status === 'ocr_complete'}
                            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
                            title="Run OCR">
                            <Scan className="size-4" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Delete this paper?')) {
                                deleteMutation.mutate(paper.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            className="rounded p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50"
                            title="Delete">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === paper.id && (
                      <tr key={`${paper.id}-expanded`} className="bg-muted/20">
                        <td colSpan={7} className="px-4 py-4">
                          <div className="space-y-2 text-sm">
                            {paper.abstract && (
                              <div>
                                <span className="font-medium text-muted-foreground">
                                  Abstract:
                                </span>{' '}
                                <span className="text-foreground">{paper.abstract}</span>
                              </div>
                            )}
                            {paper.authors && paper.authors.length > 0 && (
                              <div>
                                <span className="font-medium text-muted-foreground">
                                  Authors:
                                </span>{' '}
                                <span className="text-foreground">
                                  {paper.authors
                                    .map((a) => (typeof a === 'object' && 'name' in a ? a.name : String(a)))
                                    .join(', ')}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border px-4 py-2 text-sm text-muted-foreground">
            {total} paper{total !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  );
}
