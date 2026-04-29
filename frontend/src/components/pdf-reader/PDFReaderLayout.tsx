import { lazy, Suspense, useState, useCallback } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Loader2, ArrowLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { SelectionQA } from './SelectionQA';
import NotesPanel from './NotesPanel';
import { paperApi } from '@/services/api';

const PDFViewer = lazy(() => import('./PDFViewer'));

interface PDFReaderLayoutProps {
  pdfUrl: string;
  paperId: number;
  paperTitle: string;
  projectId: number;
  notes: string;
  onBack: () => void;
}

export default function PDFReaderLayout({
  pdfUrl,
  paperId,
  paperTitle,
  projectId,
  notes,
  onBack,
}: PDFReaderLayoutProps) {
  const { t } = useTranslation();
  const [selectedText, setSelectedText] = useState('');
  const [selectedPage, setSelectedPage] = useState(1);
  const [activeTab, setActiveTab] = useState('notes');

  const handleTextSelect = useCallback((text: string, pageNumber: number) => {
    setSelectedText(text);
    setSelectedPage(pageNumber);
  }, []);

  const handleSaveNotes = async (content: string) => {
    await paperApi.update(projectId, paperId, { notes: content });
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2">
        <Button size="icon" variant="ghost" onClick={onBack} className="size-8" aria-label={t('pdf.back', 'Back')}>
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="line-clamp-1 flex-1 text-sm font-medium">{paperTitle}</h1>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <Group orientation="horizontal" id="pdf-reader-layout">
          <Panel defaultSize={70} minSize={40}>
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-8 animate-spin text-muted-foreground" />
                </div>
              }>
              <PDFViewer url={pdfUrl} onTextSelect={handleTextSelect} />
            </Suspense>
          </Panel>
          <Separator className="w-1.5 bg-border transition-colors hover:bg-primary/20" />
          <Panel defaultSize={30} minSize={20} collapsible>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
              <div className="border-b border-border px-2 py-1">
                <TabsList className="h-7">
                  <TabsTrigger value="notes" className="text-xs">{t('notes.tab', 'Notes')}</TabsTrigger>
                  <TabsTrigger value="qa" className="text-xs">{t('notes.qa', 'Q&A')}</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="notes" className="m-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                <NotesPanel
                  paperId={paperId}
                  projectId={projectId}
                  notes={notes}
                  onSave={handleSaveNotes}
                />
              </TabsContent>
              <TabsContent value="qa" className="m-0 flex-1 overflow-hidden data-[state=inactive]:hidden">
                <SelectionQA
                  selectedText={selectedText}
                  selectedPage={selectedPage}
                  paperId={paperId}
                  paperTitle={paperTitle}
                  projectId={projectId}
                />
              </TabsContent>
            </Tabs>
          </Panel>
        </Group>
      </div>
    </div>
  );
}
