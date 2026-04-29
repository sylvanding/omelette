import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PaperStatus, ReadingStatus } from '@/types';

interface PapersFilterBarProps {
  search: string;
  status: PaperStatus | '';
  readingStatus: ReadingStatus | '';
  year: string;
  sortBy: string;
  order: 'asc' | 'desc';
  onSearchChange: (value: string) => void;
  onStatusChange: (value: PaperStatus | '') => void;
  onReadingStatusChange: (value: ReadingStatus | '') => void;
  onYearChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onOrderChange: () => void;
}

export function PapersFilterBar({
  search,
  status,
  readingStatus,
  year,
  sortBy,
  order,
  onSearchChange,
  onStatusChange,
  onReadingStatusChange,
  onYearChange,
  onSortChange,
  onOrderChange,
}: PapersFilterBarProps) {
  const { t } = useTranslation();

  const statusOptions = [
    { value: '', label: t('papers.statuses.all') },
    { value: 'pending', label: t('papers.statuses.pending') },
    { value: 'metadata_only', label: t('papers.statuses.metadata_only') },
    { value: 'pdf_downloaded', label: t('papers.statuses.pdf_downloaded') },
    { value: 'ocr_complete', label: t('papers.statuses.ocr_complete') },
    { value: 'indexed', label: t('papers.statuses.indexed') },
    { value: 'error', label: t('papers.statuses.error') },
  ];

  const sortOptions = [
    { value: 'created_at', label: t('papers.sortBy.created_at') },
    { value: 'year', label: t('papers.sortBy.year') },
    { value: 'citation_count', label: t('papers.sortBy.citation_count') },
    { value: 'title', label: t('papers.sortBy.title') },
  ];

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t('papers.searchPlaceholder')}
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={status || '__all__'}
          onValueChange={(v) => onStatusChange(v === '__all__' ? '' : (v as PaperStatus))}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('papers.statuses.all')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('papers.statuses.all')}</SelectItem>
            {statusOptions.filter((o) => o.value).map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          type="number"
          placeholder={t('common.year')}
          value={year}
          onChange={(e) => onYearChange(e.target.value)}
          className="w-24"
        />
        <Select
          value={readingStatus || '__all__'}
          onValueChange={(v) => onReadingStatusChange(v === '__all__' ? '' : (v as ReadingStatus))}
        >
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder={t('papers.readingStatuses.unread')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">{t('papers.readingStatuses.all', 'All')}</SelectItem>
            <SelectItem value="unread">{t('papers.readingStatuses.unread')}</SelectItem>
            <SelectItem value="reading">{t('papers.readingStatuses.reading')}</SelectItem>
            <SelectItem value="read">{t('papers.readingStatuses.read')}</SelectItem>
            <SelectItem value="archived">{t('papers.readingStatuses.archived')}</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={onSortChange}>
          <SelectTrigger className="w-[140px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sortOptions.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          onClick={onOrderChange}
          aria-label={t('papers.toggleSortOrder', 'Toggle sort order')}
        >
          {order === 'asc' ? t('common.asc') : t('common.desc')}
        </Button>
      </div>
    </div>
  );
}
