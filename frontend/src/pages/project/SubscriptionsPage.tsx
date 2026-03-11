import { useParams } from 'react-router-dom';
import { SubscriptionManager } from '@/components/knowledge-base/SubscriptionManager';

export default function SubscriptionsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  return <SubscriptionManager projectId={pid} />;
}
