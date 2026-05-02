import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageLayout from '@/components/layout/PageLayout';
import { TeamMembersManager } from '@/components/team/TeamMembersManager';

export default function TeamMembersPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  return (
    <PageLayout title={t('team.title', 'Team Members')}>
      <TeamMembersManager projectId={pid} />
    </PageLayout>
  );
}
