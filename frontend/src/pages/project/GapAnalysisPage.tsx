import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { Lightbulb, Loader2 } from 'lucide-react';
import { gapApi } from '@/services/api';
import type { GapAnalysisData } from '@/services/api';
import { Button } from '@/components/ui/button';
import PageLayout from '@/components/layout/PageLayout';
import GapAnalysisPanel from '@/components/gap-analysis/GapAnalysisPanel';

export default function GapAnalysisPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);
  const [data, setData] = useState<GapAnalysisData | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: () => gapApi.analyze(pid),
    onSuccess: (result) => setData(result),
  });

  if (!data) {
    return (
      <PageLayout title="Gap Analysis" subtitle="Identify research opportunities and knowledge gaps">
        <div className="flex flex-col items-center justify-center gap-4 py-12">
          <Lightbulb className="size-12 text-muted-foreground/50" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">No gap analysis performed yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Analyze your papers to discover research gaps and generate questions.
            </p>
          </div>
          <Button onClick={() => analyzeMutation.mutate()} disabled={analyzeMutation.isPending}>
            {analyzeMutation.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Lightbulb className="mr-2 size-4" />
                Run Gap Analysis
              </>
            )}
          </Button>
          {analyzeMutation.isError && (
            <p className="text-sm text-destructive">Analysis failed. Please try again.</p>
          )}
        </div>
      </PageLayout>
    );
  }

  return (
    <PageLayout title="Gap Analysis" subtitle="Identify research opportunities and knowledge gaps">
      <GapAnalysisPanel
        gaps={data.gaps ?? []}
        researchQuestions={data.research_questions ?? []}
        totalGaps={data.summary.total_gaps ?? 0}
        totalQuestions={data.summary.total_questions ?? 0}
      />
    </PageLayout>
  );
}
