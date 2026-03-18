import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tags, Search, Rss } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import KeywordsPage from './KeywordsPage';
import SearchPage from './SearchPage';
import { SubscriptionManager } from '@/components/knowledge-base/SubscriptionManager';
import PageLayout from '@/components/layout/PageLayout';

export default function DiscoveryPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const tabs = (
    <Tabs defaultValue="keywords" className="w-full">
      <TabsList>
        <TabsTrigger value="keywords" className="gap-1.5">
          <Tags className="size-4" />
          {t('project.keywords')}
        </TabsTrigger>
        <TabsTrigger value="search" className="gap-1.5">
          <Search className="size-4" />
          {t('project.search')}
        </TabsTrigger>
        <TabsTrigger value="subscriptions" className="gap-1.5">
          <Rss className="size-4" />
          {t('subscriptions.title')}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="keywords" className="mt-4">
        <KeywordsPage />
      </TabsContent>
      <TabsContent value="search" className="mt-4">
        <SearchPage />
      </TabsContent>
      <TabsContent value="subscriptions" className="mt-4">
        <SubscriptionManager projectId={pid} />
      </TabsContent>
    </Tabs>
  );

  return (
    <PageLayout title={t('discovery.title')} tabs={tabs}>
      <div className="min-h-0" />
    </PageLayout>
  );
}
