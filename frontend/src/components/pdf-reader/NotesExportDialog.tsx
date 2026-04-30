import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Download, Loader2, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { paperApi } from '@/services/api';
import type { Paper } from '@/types';

interface NotesExportDialogProps {
  projectId: number;
}

export default function NotesExportDialog({ projectId }: NotesExportDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const { data: papersData, isLoading } = useQuery({
    queryKey: ['papers-with-notes', projectId],
    queryFn: () => paperApi.list(projectId),
    enabled: open,
  });

  const papersWithNotes = (papersData?.items ?? []).filter(
    (p: Paper) => p.notes && p.notes.trim().length > 0,
  );

  const handleExportAll = () => {
    const date = new Date().toISOString().split('T')[0];
    let markdown = `# Research Notes Export\n\n> Project ID: ${projectId}\n> Exported on ${date}\n\n---\n\n`;

    for (const paper of papersWithNotes) {
      markdown += `## ${paper.title ?? 'Untitled'}\n\n`;
      if (paper.authors) markdown += `**Authors:** ${paper.authors}\n\n`;
      if (paper.year) markdown += `**Year:** ${paper.year}\n\n`;
      markdown += `---\n\n${paper.notes}\n\n---\n\n`;
    }

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `research-notes-${date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5">
          <FileText className="size-3.5" />
          {t('papers.exportNotes', 'Export Notes')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Download className="size-4" />
            {t('papers.exportNotesTitle', 'Export All Notes')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {t('papers.exportNotesDesc', 'Export notes from all papers as a single Markdown file.')}
          </p>

          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.loading', 'Loading...')}
            </div>
          )}

          {!isLoading && papersWithNotes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('papers.noNotesToExport', 'No papers with notes found in this project.')}
            </p>
          )}

          {!isLoading && papersWithNotes.length > 0 && (
            <>
              <p className="text-sm">
                {t('papers.notesCount', '{{count}} papers with notes', { count: papersWithNotes.length })}
              </p>
              <div className="max-h-48 space-y-1 overflow-auto rounded border p-2">
                {papersWithNotes.map((paper: Paper) => (
                  <div key={paper.id} className="flex items-start gap-2 text-sm">
                    <FileText className="mt-0.5 size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{paper.title ?? 'Untitled'}</span>
                  </div>
                ))}
              </div>
              <Button onClick={handleExportAll} className="w-full gap-1.5">
                <Download className="size-4" />
                {t('papers.downloadAllNotes', 'Download All Notes')}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
