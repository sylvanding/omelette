import { useState, useCallback, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import {
  ZoomIn,
  ZoomOut,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

interface PDFViewerProps {
  url: string;
  onTextSelect?: (text: string, pageNumber: number) => void;
}

const ZOOM_STEP = 0.15;
const MIN_SCALE = 0.5;
const MAX_SCALE = 3.0;

export default function PDFViewer({ url, onTextSelect }: PDFViewerProps) {
  const { t } = useTranslation();
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [isScanned, setIsScanned] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const onDocumentLoadSuccess = useCallback(
    async (pdf: { numPages: number; getPage: (n: number) => Promise<{ getTextContent: () => Promise<{ items: unknown[] }> }> }) => {
      setNumPages(pdf.numPages);
      setLoadError(null);

      try {
        const page = await pdf.getPage(1);
        const textContent = await page.getTextContent();
        const hasText = textContent.items.some(
          (item: unknown) =>
            typeof item === 'object' &&
            item !== null &&
            'str' in item &&
            typeof (item as { str: string }).str === 'string' &&
            (item as { str: string }).str.trim().length > 0
        );
        setIsScanned(!hasText);
      } catch {
        setIsScanned(false);
      }
    },
    []
  );

  const handleMouseUp = useCallback(() => {
    if (!onTextSelect) return;
    const selection = window.getSelection();
    const text = selection?.toString().trim();
    if (text && text.length > 0) {
      onTextSelect(text, currentPage);
    }
  }, [onTextSelect, currentPage]);

  const zoomIn = () => setScale((s) => Math.min(s + ZOOM_STEP, MAX_SCALE));
  const zoomOut = () => setScale((s) => Math.max(s - ZOOM_STEP, MIN_SCALE));
  const prevPage = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const nextPage = () => setCurrentPage((p) => Math.min(p + 1, numPages));

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') prevPage();
      if (e.key === 'ArrowRight' || e.key === 'PageDown') nextPage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-destructive">
        <AlertTriangle className="size-8" />
        <p className="text-sm">{loadError}</p>
        <a
          href={url}
          download
          className="text-sm text-primary underline">
          {t('pdf.downloadFallback', '下载 PDF')}
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between border-b border-border bg-muted/30 px-3 py-1.5">
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={zoomOut} className="size-7">
            <ZoomOut className="size-3.5" />
          </Button>
          <span className="min-w-12 text-center text-xs text-muted-foreground">
            {Math.round(scale * 100)}%
          </span>
          <Button size="icon" variant="ghost" onClick={zoomIn} className="size-7">
            <ZoomIn className="size-3.5" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={prevPage} disabled={currentPage <= 1} className="size-7">
            <ChevronLeft className="size-3.5" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {currentPage} / {numPages || '?'}
          </span>
          <Button size="icon" variant="ghost" onClick={nextPage} disabled={currentPage >= numPages} className="size-7">
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
        {isScanned && (
          <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {t('pdf.scannedWarning', '扫描件 - 文本选择受限')}
          </span>
        )}
      </div>

      {/* PDF Content */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-muted/20"
        onMouseUp={handleMouseUp}>
        <div className="flex justify-center p-4">
          <Document
            file={url}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={(err) => setLoadError(err?.message ?? 'PDF load failed')}
            loading={
              <div className="flex items-center gap-2 py-20 text-muted-foreground">
                <Loader2 className="size-5 animate-spin" />
                {t('pdf.loading', '加载 PDF...')}
              </div>
            }>
            <Page
              pageNumber={currentPage}
              scale={scale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              loading={
                <div className="flex h-[800px] items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              }
            />
          </Document>
        </div>
      </div>
    </div>
  );
}
