import { lazy, Suspense, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { Loader2, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SelectionQA } from './SelectionQA';

const PDFViewer = lazy(() => import('./PDFViewer'));

interface PDFReaderLayoutProps {
  pdfUrl: string;
  paperId: number;
  paperTitle: string;
  projectId: number;
  onBack: () => void;
}

export default function PDFReaderLayout({
  pdfUrl,
  paperId,
  paperTitle,
  projectId,
  onBack,
}: PDFReaderLayoutProps) {
  const { t } = useTranslation();
  const [selectedText, setSelectedText] = useState('');
  const [selectedPage, setSelectedPage] = useState(1);

  const handleTextSelect = useCallback((text: string, pageNumber: number) => {
    setSelectedText(text);
    setSelectedPage(pageNumber);
  }, []);

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-background px-4 py-2">
        <Button size="icon" variant="ghost" onClick={onBack} className="size-8">
          <ArrowLeft className="size-4" />
        </Button>
        <h1 className="line-clamp-1 flex-1 text-sm font-medium">{paperTitle}</h1>
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-hidden">
        <Group direction="horizontal" autoSaveId="pdf-reader-layout">
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
            <SelectionQA
              selectedText={selectedText}
              selectedPage={selectedPage}
              paperId={paperId}
              paperTitle={paperTitle}
              projectId={projectId}
            />
          </Panel>
        </Group>
      </div>
    </div>
  );
}
