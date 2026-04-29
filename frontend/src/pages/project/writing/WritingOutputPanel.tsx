import { useTranslation } from 'react-i18next';
import { Loader2, Copy, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WritingOutputPanelProps {
  activeTab: string;
  output: string;
  reviewContent: string;
  displayContent: string;
  reviewStreaming: boolean;
  reviewCitations: Record<string, { paper_id: number; title: string; number: number }>;
  onCopy: () => void;
  onDownload: () => void;
}

export function WritingOutputPanel({
  activeTab,
  output,
  reviewContent,
  displayContent,
  reviewStreaming,
  reviewCitations,
  onCopy,
  onDownload,
}: WritingOutputPanelProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">
          {t('common.output')}
        </h2>
        {activeTab === 'review' && reviewContent.trim() && (
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="ghost"
              onClick={onCopy}
              className="gap-1 text-xs"
            >
              <Copy className="size-3.5" />
              {t('common.copy', '复制')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onDownload}
              className="gap-1 text-xs"
            >
              <Download className="size-3.5" />
              {t('common.download', '下载')}
            </Button>
          </div>
        )}
      </div>
      {activeTab === 'review' ? (
        <div className="max-h-[70vh] overflow-y-auto rounded-lg border border-border bg-background p-4">
          {displayContent.trim() ? (
            <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
              {displayContent}
              {reviewStreaming && (
                <span className="ml-1 inline-block size-2 animate-pulse rounded-full bg-primary" />
              )}
            </div>
          ) : reviewStreaming ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              {t('common.generating', '正在生成...')}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">—</p>
          )}
          {Object.keys(reviewCitations).length > 0 && !reviewStreaming && (
            <div className="mt-6 border-t border-border pt-4">
              <h3 className="mb-2 text-sm font-semibold">
                {t('writing.references', '参考文献')}
              </h3>
              <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {Object.entries(reviewCitations)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([num, cite]) => (
                    <li key={num}>{cite.title}</li>
                  ))}
              </ol>
            </div>
          )}
        </div>
      ) : (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 text-sm">
          {output || (reviewStreaming ? t('common.generating') : '—')}
        </pre>
      )}
    </div>
  );
}
