import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { paperApi } from '@/services/api';
import { useThrottledValue } from '@/hooks/useThrottledValue';
import { queryKeys } from '@/lib/query-keys';
import PageLayout from '@/components/layout/PageLayout';
import { WritingOutputPanel } from './writing/WritingOutputPanel';
import { WritingTabInputs } from './writing/WritingTabInputs';
import { WritingTabs } from './writing/WritingTabs';
import { useWritingMutations } from './writing/useWritingMutations';
import type { Paper } from '@/types';

export default function WritingPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const [activeTab, setActiveTab] = useState('summarize');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [topic, setTopic] = useState('');
  const [researchTopic, setResearchTopic] = useState('');
  const [citeStyle, setCiteStyle] = useState('gb_t_7714');
  const [language, setLanguage] = useState('en');

  const [reviewTopic, setReviewTopic] = useState('');
  const [reviewStyle, setReviewStyle] = useState('narrative');
  const [reviewLang, setReviewLang] = useState('zh');

  const { data: papersData } = useQuery({
    queryKey: queryKeys.papers.list(pid),
    queryFn: () => paperApi.list(pid),
    enabled: !!pid,
  });

  const papers: Paper[] = papersData?.items ?? [];

  const {
    output,
    reviewContent,
    reviewCitations,
    reviewSections,
    currentSection,
    isPending,
    canRun,
    reviewStreaming,
    runAction,
    startReviewStream,
    stopReviewStream,
    copyReviewContent,
    downloadReview,
  } = useWritingMutations({
    pid,
    selectedIds,
    topic,
    researchTopic,
    citeStyle,
    language,
    activeTab,
    reviewTopic,
    reviewStyle,
    reviewLang,
  });

  const displayContent = useThrottledValue(reviewContent, 80);

  const togglePaper = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  return (
    <PageLayout title={t('writing.title')}>
      <div className="space-y-6">
        <WritingTabs activeTab={activeTab} onTabChange={setActiveTab}>
          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <WritingTabInputs
              activeTab={activeTab}
              papers={papers}
              selectedIds={selectedIds}
              topic={topic}
              researchTopic={researchTopic}
              citeStyle={citeStyle}
              language={language}
              reviewTopic={reviewTopic}
              reviewStyle={reviewStyle}
              reviewLang={reviewLang}
              reviewSections={reviewSections}
              currentSection={currentSection}
              isPending={isPending}
              canRun={canRun}
              reviewStreaming={reviewStreaming}
              onTogglePaper={togglePaper}
              onTopicChange={setTopic}
              onResearchTopicChange={setResearchTopic}
              onCiteStyleChange={setCiteStyle}
              onLanguageChange={setLanguage}
              onReviewTopicChange={setReviewTopic}
              onReviewStyleChange={setReviewStyle}
              onReviewLangChange={setReviewLang}
              onRunAction={runAction}
              onStartReview={startReviewStream}
              onStopReview={stopReviewStream}
            />

            <WritingOutputPanel
              activeTab={activeTab}
              output={output}
              reviewContent={reviewContent}
              displayContent={displayContent}
              reviewStreaming={reviewStreaming}
              reviewCitations={reviewCitations}
              onCopy={copyReviewContent}
              onDownload={downloadReview}
            />
          </div>
        </WritingTabs>
      </div>
    </PageLayout>
  );
}
