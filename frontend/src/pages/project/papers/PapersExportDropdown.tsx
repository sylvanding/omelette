import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, FileText, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import type { ExportFormat } from '@/services/api';
import { exportPapers } from '@/services/api';

interface PapersExportDropdownProps {
  projectId: number;
  filters: {
    q?: string;
    status?: string;
    year?: number;
  };
  paperCount: number;
}

export function PapersExportDropdown({ projectId, filters, paperCount }: PapersExportDropdownProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  const handleExport = async (format: ExportFormat) => {
    setExporting(format);
    try {
      await exportPapers(projectId, { format, ...filters });
    } catch {
      // Error toast is handled by the calling component
    } finally {
      setExporting(null);
    }
  };

  const formats: { value: ExportFormat; label: string }[] = [
    { value: 'bibtex', label: 'BibTeX (.bib)' },
    { value: 'ris', label: 'RIS (.ris)' },
    { value: 'endnote', label: 'EndNote (.xml)' },
  ];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <Download className="size-4" />
          {t('papers.export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {t('papers.exportFormat')}
        </DropdownMenuLabel>
        {formats.map(({ value, label }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => void handleExport(value)}
            disabled={exporting !== null || paperCount === 0}
          >
            {exporting === value ? (
              <Check className="size-4 animate-spin" />
            ) : (
              <FileText className="size-4" />
            )}
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
