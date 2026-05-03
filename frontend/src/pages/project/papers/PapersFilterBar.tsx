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
  author: string;
  journal: string;
  status: PaperStatus | '';
  readingStatus: ReadingStatus | '';
  qualityTag: string;
  year: string;
  sortBy: string;
  order: 'asc' | 'desc';
  onSearchChange: (value: string) => void;
  onAuthorChange: (value: string) => void;
  onJournalChange: (value: string) => void;
  onStatusChange: (value: PaperStatus | '') => void;
  onReadingStatusChange: (value: ReadingStatus | '') => void;
  onQualityTagChange: (value: string) => void;
  onYearChange: (value: string) => void;
  onSortChange: (value: string) => void;
  onOrderChange: () => void;
}

export function PapersFilterBar({
  search,
  author,
  journal,
  status,
  readingStatus,
  qualityTag,
  year,
  sortBy,
  order,
  onSearchChange,
  onAuthorChange,
  onJournalChange,
  onStatusChange,
  onReadingStatusChange,
  onQualityTagChange,
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
    { value: 'rating', label: t('papers.sortBy.rating', 'Rating') },
    { value: 'title', label: t('papers.sortBy.title') },
  ];

  const qualityTagOptions = [
    { value: '', label: t('papers.qualityTags', 'Quality Tags') },
    { value: 'Seminal', label: 'Seminal' },
    { value: 'Survey', label: 'Survey' },
    { value: 'Controversial', label: 'Controversial' },
    { value: 'Replication', label: 'Replication' },
    { value: 'Methodology', label: 'Methodology' },
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
        <Input
          placeholder={t('papers.authorFilter', 'Author')}
          value={author}
          onChange={(e) => onAuthorChange(e.target.value)}
          className="w-[150px]"
        />
        <Input
          placeholder={t('papers.journalFilter', 'Journal')}
          value={journal}
          onChange={(e) => onJournalChange(e.target.value)}
          className="w-[150px]"
        />
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
        <Select
          value={qualityTag || '__all__'}
          onValueChange={(v) => onQualityTagChange(v === '__all__' ? '' : v)}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t('papers.qualityTags', 'Quality Tags')} />
          </SelectTrigger>
          <SelectContent>
            {qualityTagOptions.map((o) => (
              <SelectItem key={o.value || '__all__'} value={o.value || '__all__'}>
                {o.label}
              </SelectItem>
            ))}
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
