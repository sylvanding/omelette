import { useNavigate, useParams } from 'react-router-dom';
import { GapAnalysisDialog } from './GapAnalysisDialog';

export default function GapAnalysisPage() {
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();

  return (
    <GapAnalysisDialog
      projectId={Number(projectId!)}
      onClose={() => navigate(`/projects/${projectId}`)}
    />
  );
}
