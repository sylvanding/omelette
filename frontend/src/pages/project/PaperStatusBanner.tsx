import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';

interface PaperStatusBannerProps {
  processing: number;
  indexed: number;
  total: number;
}

export function PaperStatusBanner({
  processing,
  indexed,
  total,
}: PaperStatusBannerProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-3 rounded-lg border border-blue-500/30 bg-blue-500/5 px-4 py-3">
      <Loader2 className="size-4 animate-spin text-blue-600 dark:text-blue-400" />
      <div className="flex-1">
        <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
          {t('papers.processingBanner', {
            processing,
            indexed,
            total,
          })}
        </p>
      </div>
    </div>
  );
}
