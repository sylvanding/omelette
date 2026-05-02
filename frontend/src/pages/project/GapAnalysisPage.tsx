import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { gapApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { LoadingState } from '@/components/ui/loading-state';
import PageLayout from '@/components/layout/PageLayout';
import GapAnalysisPanel from '@/components/gap-analysis/GapAnalysisPanel';

export default function GapAnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.gaps.all(pid),
    queryFn: () => gapApi.analyze(pid),
  });

  if (isLoading) {
    return (
      <PageLayout title="Gap Analysis">
        <LoadingState />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Gap Analysis" subtitle="Identify research opportunities and knowledge gaps">
      <GapAnalysisPanel
        gaps={data?.gaps ?? []}
        researchQuestions={data?.research_questions ?? []}
        totalGaps={data?.summary.total_gaps ?? 0}
        totalQuestions={data?.summary.total_questions ?? 0}
      />
    </PageLayout>
  );
}
