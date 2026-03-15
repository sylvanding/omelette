import { lazy, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, AlertTriangle } from 'lucide-react';
import { paperApi } from '@/services/api';
import { Button } from '@/components/ui/button';

const PDFReaderLayout = lazy(
  () => import('@/components/pdf-reader/PDFReaderLayout')
);

export default function PDFReaderPage() {
  const { t } = useTranslation();
  const { projectId, paperId } = useParams<{
    projectId: string;
    paperId: string;
  }>();
  const navigate = useNavigate();
  const pid = Number(projectId!);
  const ppid = Number(paperId!);

  const { data: paper, isLoading, error } = useQuery({
    queryKey: ['paper', pid, ppid],
    queryFn: () => paperApi.get(pid, ppid),
    enabled: !!pid && !!ppid,
  });

  if (isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3">
        <AlertTriangle className="size-8 text-destructive" />
        <p className="text-sm text-muted-foreground">
          {t('pdf.notFound', '论文不存在或无法加载')}
        </p>
        <Button variant="outline" onClick={() => navigate(-1)}>
          {t('common.goBack', '返回')}
        </Button>
      </div>
    );
  }

  const pdfUrl = `/api/v1/projects/${pid}/papers/${ppid}/pdf`;

  return (
    <Suspense
      fallback={
        <div className="flex h-[60vh] items-center justify-center">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      }>
      <PDFReaderLayout
        pdfUrl={pdfUrl}
        paperId={ppid}
        paperTitle={paper.title ?? 'Untitled'}
        projectId={pid}
        onBack={() => navigate(`/projects/${pid}/papers`)}
      />
    </Suspense>
  );
}
