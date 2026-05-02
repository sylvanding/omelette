import { useParams } from 'react-router-dom';
import { ContradictionReport } from '@/components/contradiction/ContradictionReport';
import PageLayout from '@/components/layout/PageLayout';

export default function ContradictionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  return (
    <PageLayout title="Contradictions" subtitle="Detect conflicting claims and findings across your papers">
      <ContradictionReport projectId={pid} />
    </PageLayout>
  );
}
