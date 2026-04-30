import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Copy, Check, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toBibTeX, toAPA, toMLA } from '@/lib/bibliography-export';
import type { Paper } from '@/types';

interface BulkCitationDialogProps {
  papers: Paper[];
  onClose: () => void;
}

type CitationFormat = 'bibtex' | 'apa' | 'mla';

const formatGenerators: Record<CitationFormat, (papers: Paper[]) => string> = {
  bibtex: toBibTeX,
  apa: toAPA,
  mla: toMLA,
};

const formatExtensions: Record<CitationFormat, string> = {
  bibtex: 'bib',
  apa: 'txt',
  mla: 'txt',
};

export function BulkCitationDialog({ papers, onClose }: BulkCitationDialogProps) {
  const { t } = useTranslation();
  const [format, setFormat] = useState<CitationFormat>('bibtex');
  const [copied, setCopied] = useState(false);

  const citationText = formatGenerators[format](papers);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(citationText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([citationText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `citations.${formatExtensions[format]}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formats: { value: CitationFormat; label: string }[] = [
    { value: 'bibtex', label: 'BibTeX' },
    { value: 'apa', label: 'APA 7th' },
    { value: 'mla', label: 'MLA 9th' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[70vh] w-[90vw] max-w-xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <h2 className="text-lg font-semibold">
            {t('papers.bulkCitation')} ({papers.length})
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        {/* Format tabs */}
        <div className="flex gap-1 border-b px-6 py-2">
          {formats.map(({ value, label }) => (
            <button
              key={value}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                format === value
                  ? 'bg-secondary text-secondary-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setFormat(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Preview */}
        <div className="flex-1 overflow-auto p-4">
          <pre className="whitespace-pre-wrap break-words rounded-lg border bg-muted p-4 text-xs font-mono">
            {citationText || 'No papers to export'}
          </pre>
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t px-6 py-3">
          <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? t('common.copied') : t('common.copy')}
          </Button>
          <Button variant="outline" size="sm" onClick={handleDownload} className="gap-1.5">
            <Download className="size-4" />
            {t('common.download', 'Download')}
          </Button>
        </div>
      </div>
    </div>
  );
}
