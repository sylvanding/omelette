import { useTranslation } from 'react-i18next';
import { Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import type { Paper } from '@/types';

const CITE_STYLES = [
  { id: 'gb_t_7714', label: 'GB/T 7714' },
  { id: 'apa', label: 'APA' },
  { id: 'mla', label: 'MLA' },
  { id: 'chicago', label: 'Chicago' },
];

const REVIEW_STYLES = [
  { id: 'narrative', labelKey: 'writing.styleNarrative' },
  { id: 'systematic', labelKey: 'writing.styleSystematic' },
  { id: 'thematic', labelKey: 'writing.styleThematic' },
];

interface WritingTabInputsProps {
  activeTab: string;
  papers: Paper[];
  selectedIds: number[];
  topic: string;
  researchTopic: string;
  citeStyle: string;
  language: string;
  reviewTopic: string;
  reviewStyle: string;
  reviewLang: string;
  reviewSections: string[];
  currentSection: string;
  isPending: boolean;
  canRun: boolean;
  reviewStreaming: boolean;
  onTogglePaper: (id: number) => void;
  onTopicChange: (value: string) => void;
  onResearchTopicChange: (value: string) => void;
  onCiteStyleChange: (value: string) => void;
  onLanguageChange: (value: string) => void;
  onReviewTopicChange: (value: string) => void;
  onReviewStyleChange: (value: string) => void;
  onReviewLangChange: (value: string) => void;
  onRunAction: () => void;
  onStartReview: () => void;
  onStopReview: () => void;
}

export function WritingTabInputs({
  activeTab,
  papers,
  selectedIds,
  topic,
  researchTopic,
  citeStyle,
  language,
  reviewTopic,
  reviewStyle,
  reviewLang,
  reviewSections,
  currentSection,
  isPending,
  canRun,
  reviewStreaming,
  onTogglePaper,
  onTopicChange,
  onResearchTopicChange,
  onCiteStyleChange,
  onLanguageChange,
  onReviewTopicChange,
  onReviewStyleChange,
  onReviewLangChange,
  onRunAction,
  onStartReview,
  onStopReview,
}: WritingTabInputsProps) {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 text-sm font-semibold text-foreground">
        {activeTab === 'summarize' || activeTab === 'cite'
          ? t('writing.selectPapers')
          : activeTab === 'outline'
            ? t('writing.topic')
            : t('writing.researchTopic')}
      </h2>

      {(activeTab === 'summarize' || activeTab === 'cite') && (
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {papers.map((p) => (
            <label
              key={p.id}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border p-2 hover:bg-muted/50"
            >
              <input
                type="checkbox"
                checked={selectedIds.includes(p.id)}
                onChange={() => onTogglePaper(p.id)}
                className="rounded"
              />
              <span className="line-clamp-1 text-sm">{p.title}</span>
            </label>
          ))}
          {papers.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {t('writing.noPapers')}
            </p>
          )}
        </div>
      )}

      {activeTab === 'outline' && (
        <Input
          placeholder={t('writing.topicPlaceholder')}
          value={topic}
          onChange={(e) => onTopicChange(e.target.value)}
        />
      )}

      {activeTab === 'gap' && (
        <Input
          placeholder={t('writing.researchTopicPlaceholder')}
          value={researchTopic}
          onChange={(e) => onResearchTopicChange(e.target.value)}
        />
      )}

      {activeTab === 'cite' && (
        <div className="mt-3">
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('writing.citeStyle')}
          </label>
          <Select value={citeStyle} onValueChange={onCiteStyleChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CITE_STYLES.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {(activeTab === 'summarize' || activeTab === 'outline') && (
        <div className="mt-3">
          <label className="mb-1 block text-xs text-muted-foreground">
            {t('writing.language')}
          </label>
          <Select value={language} onValueChange={onLanguageChange}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="en">{t('writing.langEn')}</SelectItem>
              <SelectItem value="zh">{t('writing.langZh')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      {activeTab === 'review' && (
        <div className="space-y-3">
          <Input
            placeholder={t(
              'writing.reviewTopicPlaceholder',
              '综述主题（可留空自动确定）'
            )}
            value={reviewTopic}
            onChange={(e) => onReviewTopicChange(e.target.value)}
          />
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('writing.reviewStyle', '综述风格')}
            </label>
            <Select value={reviewStyle} onValueChange={onReviewStyleChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_STYLES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {t(s.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('writing.language')}
            </label>
            <Select value={reviewLang} onValueChange={onReviewLangChange}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh">{t('writing.langZh')}</SelectItem>
                <SelectItem value="en">{t('writing.langEn')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {reviewSections.length > 0 && (
            <div className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {t('writing.reviewOutline', '综述提纲')}
              </p>
              <ol className="list-decimal space-y-0.5 pl-4 text-sm">
                {reviewSections.map((s, i) => (
                  <li
                    key={i}
                    className={cn(
                      currentSection === s && 'font-semibold text-primary'
                    )}
                  >
                    {s}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {activeTab !== 'review' ? (
        <Button
          onClick={onRunAction}
          disabled={isPending || !canRun}
          className="mt-4 gap-1.5"
        >
          {isPending && <Loader2 className="size-4 animate-spin" />}
          {t('common.generate')}
        </Button>
      ) : (
        <div className="mt-4 flex gap-2">
          <Button
            onClick={onStartReview}
            disabled={reviewStreaming}
            className="gap-1.5"
          >
            {reviewStreaming && <Loader2 className="size-4 animate-spin" />}
            {t('writing.generateReview', '生成综述草稿')}
          </Button>
          {reviewStreaming && (
            <Button
              variant="outline"
              onClick={onStopReview}
              className="gap-1.5"
            >
              <Square className="size-4" />
              {t('common.stop', '停止')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
