import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { toast } from 'sonner';
import { X, Loader2, Copy, Download, Check, BookOpen, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { paperApi, writingApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { toBibTeX, toRIS } from '@/lib/bibliography-export';
import { CitationStylePicker } from '@/components/citation/CitationStylePicker';
import type { CitationStyle } from '@/components/citation/citation-styles';
import type { Paper } from '@/types';

interface BibliographyBuilderDialogProps {
  projectId: number;
  onClose: () => void;
}

type ExportTab = 'formatted' | 'bibtex' | 'ris';

export function BibliographyBuilderDialog({ projectId, onClose }: BibliographyBuilderDialogProps) {
  const { t } = useTranslation();
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [style, setStyle] = useState<CitationStyle>('apa');
  const [tab, setTab] = useState<ExportTab>('formatted');
  const [output, setOutput] = useState('');
  const [search, setSearch] = useState('');
  const [copied, setCopied] = useState(false);

  const { data: papersData, isLoading } = useQuery({
    queryKey: queryKeys.papers.list(projectId, { page: 1, page_size: 200 }),
    queryFn: () => paperApi.list(projectId, { page: 1, page_size: 200 }),
  });

  const papers = useMemo(() => papersData?.items ?? [], [papersData]);
  const allPaperIds = useMemo(() => papers.map((p) => p.id), [papers]);

  const filteredPapers = useMemo(() => {
    if (!search.trim()) return papers;
    const q = search.toLowerCase();
    return papers.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.authors ?? []).some((a) => (typeof a === 'object' && 'name' in a ? a.name : String(a)).toLowerCase().includes(q)),
    );
  }, [papers, search]);

  const citationMutation = useToastMutation({
    mutationFn: () => writingApi.citations(projectId, Array.from(selectedIds), style),
    errorMessage: t('common.operationFailed'),
    onSuccess: (res) => {
      const citations = res?.citations ?? [];
      setOutput(citations.map((c: { citation?: string }) => c.citation ?? '').join('\n'));
      setTab('formatted');
    },
  });

  const toggleAll = () => {
    if (selectedIds.size === allPaperIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allPaperIds));
    }
  };

  const togglePaper = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleGenerate = () => {
    if (selectedIds.size === 0) {
      toast.warning('Select at least one paper');
      return;
    }
    citationMutation.mutate();
  };

  const handleExport = () => {
    const selectedPapers = papers.filter((p) => selectedIds.has(p.id));
    const projectName = 'omelette';

    let content: string;
    let filename: string;
    let mimeType: string;

    if (tab === 'bibtex') {
      content = toBibTeX(selectedPapers);
      filename = `${projectName}-bibliography.bib`;
      mimeType = 'application/x-bibtex';
    } else if (tab === 'ris') {
      content = toRIS(selectedPapers);
      filename = `${projectName}-bibliography.ris`;
      mimeType = 'application/x-research-info-systems';
    } else {
      content = output || 'No output generated yet';
      filename = `${projectName}-bibliography.txt`;
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = async () => {
    const textToCopy = tab === 'formatted' ? output : papers.filter((p) => selectedIds.has(p.id)).map(formatPlainText).join('\n\n');
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast.success(t('common.copied'));
  };

  const isGenerating = citationMutation.isPending;
  const hasOutput = tab === 'formatted' && output.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[85vh] w-[90vw] max-w-3xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Bibliography Builder</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel: paper selection */}
          <div className="w-1/2 border-r p-4 flex flex-col">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium">
                Select Papers ({selectedIds.size}/{papers.length})
              </span>
              <button
                className="text-xs text-primary hover:underline"
                onClick={toggleAll}
              >
                {selectedIds.size === allPaperIds.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search papers..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            <div className="flex-1 overflow-auto space-y-1">
              {isLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : filteredPapers.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-8">No papers found</p>
              ) : (
                filteredPapers.map((paper) => (
                  <label
                    key={paper.id}
                    className="flex items-start gap-2 rounded-md p-2 hover:bg-accent/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(paper.id)}
                      onChange={() => togglePaper(paper.id)}
                      className="mt-1 size-3.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{paper.title}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatAuthors(paper.authors)}{paper.year ? ` (${paper.year})` : ''}
                      </div>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="mt-3 pt-3 border-t">
              <div className="mb-2">
                <span className="text-xs text-muted-foreground">Citation Style</span>
              </div>
              <CitationStylePicker value={style} onChange={setStyle} />
            </div>

            <Button
              className="mt-3"
              onClick={handleGenerate}
              disabled={selectedIds.size === 0 || isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                'Generate Bibliography'
              )}
            </Button>
          </div>

          {/* Right panel: output */}
          <div className="w-1/2 p-4 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium">Output</span>
              <div className="flex gap-1">
                {(['formatted', 'bibtex', 'ris'] as ExportTab[]).map((t) => (
                  <button
                    key={t}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      tab === t
                        ? 'bg-secondary text-secondary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => {
                      setTab(t);
                      if (t === 'bibtex' || t === 'ris') {
                        // Auto-generate for export formats
                      }
                    }}
                  >
                    {t === 'formatted' ? 'Formatted' : t === 'bibtex' ? 'BibTeX' : 'RIS'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-auto rounded-lg border bg-muted p-3 font-mono text-xs whitespace-pre-wrap">
              {hasOutput ? (
                output
              ) : tab === 'bibtex' || tab === 'ris' ? (
                selectedIds.size > 0
                  ? (tab === 'bibtex' ? toBibTeX : toRIS)(papers.filter((p) => selectedIds.has(p.id)))
                  : 'Select papers to see the export preview'
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select papers and click Generate to create your bibliography
                </div>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={handleCopy} disabled={selectedIds.size === 0}>
                {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
                Copy
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={selectedIds.size === 0}>
                <Download className="size-4" />
                Export {tab === 'formatted' ? 'Text' : tab === 'bibtex' ? '.bib' : '.ris'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatAuthors(authors: unknown[] | null): string {
  if (!authors || authors.length === 0) return '';
  const names = authors.slice(0, 3).map((a) => (typeof a === 'object' && 'name' in a ? a.name : String(a)));
  if (authors.length > 3) names.push('et al.');
  return names.join(', ');
}

function formatPlainText(paper: Paper): string {
  const authors = formatAuthors(paper.authors);
  const year = paper.year ? ` (${paper.year})` : '';
  const journal = paper.journal ? `. ${paper.journal}` : '';
  const doi = paper.doi ? `. DOI: ${paper.doi}` : '';
  return `${authors}${year}. ${paper.title}${journal}${doi}.`;
}
