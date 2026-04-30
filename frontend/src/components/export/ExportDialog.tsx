import { useState } from 'react';
import { X, Loader2, Download, Copy, Check, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { exportReferenceApi } from '@/services/api';
import { downloadExport, type ExportFormat } from '@/lib/bibliography-export';
import type { Paper } from '@/types';

interface ExportDialogProps {
  projectId: number;
  papers: Paper[];
  projectName: string;
  onClose: () => void;
}

type ExportTab = 'download' | 'zotero';

export function ExportDialog({ projectId, papers, projectName, onClose }: ExportDialogProps) {
  const [tab, setTab] = useState<ExportTab>('download');
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [zoteroName, setZoteroName] = useState('');
  const [zoteroSubmitting, setZoteroSubmitting] = useState(false);
  const [zoteroResult, setZoteroResult] = useState<{ message: string; items_created?: number } | null>(null);
  const [copied, setCopied] = useState(false);

  const handleDownload = async (format: ExportFormat) => {
    setExporting(format);
    try {
      downloadExport(papers, format, projectName);
    } finally {
      setExporting(null);
    }
  };

  const handleZoteroExport = async () => {
    if (!zoteroName.trim()) return;
    setZoteroSubmitting(true);
    try {
      const result = await exportReferenceApi.exportZotero(projectId, zoteroName.trim());
      setZoteroResult({
        message: result.message || 'Exported successfully',
        items_created: result.items_created,
      });
    } catch {
      setZoteroResult({ message: 'Export failed. Please try again.' });
    } finally {
      setZoteroSubmitting(false);
    }
  };

  const handleCopyPreview = async (preview: string) => {
    await navigator.clipboard.writeText(preview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formats: { value: ExportFormat; label: string; description: string }[] = [
    { value: 'bibtex', label: 'BibTeX', description: '.bib — LaTeX, JabRef, Zotero' },
    { value: 'ris', label: 'RIS', description: '.ris — EndNote, Mendeley, Zotero' },
    { value: 'endnote', label: 'EndNote', description: '.xml — EndNote XML format' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[80vh] w-[90vw] max-w-2xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <BookOpen className="size-5 text-muted-foreground" />
            <h2 className="text-lg font-semibold">Export to Reference Manager</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>

        {/* Tab selector */}
        <div className="flex gap-1 border-b px-6 py-2">
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'download' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('download')}
          >
            Download
          </button>
          <button
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === 'zotero' ? 'bg-secondary text-secondary-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab('zotero')}
          >
            Zotero
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          <p className="mb-4 text-sm text-muted-foreground">
            {papers.length} paper{papers.length !== 1 ? 's' : ''} will be exported from &ldquo;{projectName}&rdquo;
          </p>

          {tab === 'download' && (
            <div className="space-y-3">
              {formats.map(({ value, label, description }) => (
                <div
                  key={value}
                  className="flex items-center justify-between rounded-lg border p-4 transition-colors hover:bg-accent/50"
                >
                  <div>
                    <span className="font-medium">{label}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{description}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={exporting !== null || papers.length === 0}
                    onClick={() => void handleDownload(value)}
                  >
                    {exporting === value ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                    Export
                  </Button>
                </div>
              ))}
            </div>
          )}

          {tab === 'zotero' && (
            <div className="space-y-4">
              {zoteroResult ? (
                <div className="space-y-3">
                  <div className="rounded-lg border bg-accent/30 p-4">
                    <p className="text-sm">{zoteroResult.message}</p>
                    {zoteroResult.items_created !== undefined && (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {zoteroResult.items_created} item{zoteroResult.items_created !== 1 ? 's' : ''} created
                      </p>
                    )}
                  </div>
                  {zoteroResult.message.includes('manually') && (
                    <ZoteroManualPreview projectId={projectId} onCopy={handleCopyPreview} copied={copied} />
                  )}
                  <Button variant="outline" size="sm" onClick={() => setZoteroResult(null)}>
                    Try again
                  </Button>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm">
                    Create a new Zotero collection and import all papers. Requires <code className="rounded bg-accent px-1 text-xs">ZOTERO_API_KEY</code> and <code className="rounded bg-accent px-1 text-xs">ZOTERO_USER_ID</code> environment variables.
                  </p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Collection name"
                      value={zoteroName}
                      onChange={(e) => setZoteroName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleZoteroExport();
                      }}
                    />
                    <Button
                      disabled={!zoteroName.trim() || zoteroSubmitting}
                      onClick={() => void handleZoteroExport()}
                    >
                      {zoteroSubmitting ? <Loader2 className="size-4 animate-spin" /> : 'Create'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ZoteroManualPreview({
  projectId,
  onCopy,
  copied,
}: {
  projectId: number;
  onCopy: (preview: string) => void;
  copied: boolean;
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchPreview = async () => {
    setLoading(true);
    try {
      const result = await exportReferenceApi.exportZotero(projectId, 'preview');
      setPreview(result.preview);
    } finally {
      setLoading(false);
    }
  };

  if (!preview && !loading) {
    return (
      <Button variant="outline" size="sm" onClick={fetchPreview}>
        Show BibTeX preview
      </Button>
    );
  }

  if (loading) {
    return <Loader2 className="size-4 animate-spin" />;
  }

  return (
    <div className="relative">
      <pre className="max-h-48 overflow-auto rounded-lg border bg-muted p-3 text-xs font-mono">
        {preview}
      </pre>
      <Button
        variant="ghost"
        size="sm"
        className="absolute right-2 top-2"
        onClick={() => preview && onCopy(preview)}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </Button>
    </div>
  );
}
