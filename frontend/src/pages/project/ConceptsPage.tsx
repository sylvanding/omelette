import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Loader2, Network, BookOpen, ArrowLeft, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { conceptsApi } from '@/services/api';
import type { ConceptNode, TopicPage } from '@/services/api';

export default function ConceptsPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId);

  const [selectedConcept, setSelectedConcept] = useState<ConceptNode | null>(null);
  const [topicPage, setTopicPage] = useState<TopicPage | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const { data: graphData, isLoading } = useQuery({
    queryKey: ['concepts', pid],
    queryFn: () => conceptsApi.getGraph(pid),
    enabled: !!pid,
  });

  const { data: topicPageData, isFetching: isFetchingTopic } = useQuery({
    queryKey: ['concept-topic', pid, selectedConcept?.name],
    queryFn: () => conceptsApi.getTopicPage(pid, selectedConcept!.name),
    enabled: !!pid && !!selectedConcept,
  });

  const handleConceptClick = useCallback((concept: ConceptNode) => {
    setSelectedConcept(concept);
  }, []);

  const handleBackToGraph = useCallback(() => {
    setSelectedConcept(null);
    setTopicPage(null);
  }, []);

  const filteredNodes = graphData?.nodes.filter(
    (n) =>
      n.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      n.definition.toLowerCase().includes(searchTerm.toLowerCase()),
  ) ?? [];

  const relationTypeColor = (type: string) => {
    switch (type) {
      case 'prerequisite':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200';
      case 'applies_to':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'contrasts_with':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (topicPage && topicPageData) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={handleBackToGraph}>
            <ArrowLeft className="mr-2 size-4" />
            {t('concepts.backToGraph')}
          </Button>
        </div>

        {isFetchingTopic && (
          <div className="mb-4 flex items-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('concepts.generatingTopic')}
          </div>
        )}

        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center gap-3">
            <BookOpen className="size-5 text-primary" />
            <h2 className="text-xl font-semibold">{topicPageData.concept_name}</h2>
          </div>

          {topicPageData.definition && (
            <p className="mb-4 text-sm text-muted-foreground italic">
              {topicPageData.definition}
            </p>
          )}

          <div className="mb-6">
            <h3 className="mb-2 text-sm font-semibold">{t('concepts.overview')}</h3>
            <p className="text-sm leading-relaxed">{topicPageData.overview}</p>
          </div>

          {topicPageData.key_findings.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold">{t('concepts.keyFindings')}</h3>
              <ul className="space-y-1">
                {topicPageData.key_findings.map((finding, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                    {finding}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {topicPageData.related_topics.length > 0 && (
            <div className="mb-6">
              <h3 className="mb-2 text-sm font-semibold">{t('concepts.relatedTopics')}</h3>
              <div className="flex flex-wrap gap-1.5">
                {topicPageData.related_topics.map((topic) => (
                  <Badge key={topic} variant="secondary" className="text-xs">
                    {topic}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {topicPageData.research_directions.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold">{t('concepts.researchDirections')}</h3>
              <ul className="space-y-1">
                {topicPageData.research_directions.map((direction, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {direction}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!graphData || graphData.total_concepts === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground">
        <Network className="size-12 text-muted-foreground/50" />
        <p className="text-sm">{t('concepts.empty')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Network className="size-5 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">{t('concepts.title')}</h2>
            <p className="text-sm text-muted-foreground">
              {t('concepts.subtitle', { count: graphData.total_concepts, edges: graphData.edges.length })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input
              placeholder={t('concepts.searchPlaceholder')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-64 pl-9"
            />
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {filteredNodes.map((node) => (
          <button
            key={node.name}
            type="button"
            onClick={() => handleConceptClick(node)}
            className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary hover:bg-accent"
          >
            <div className="mb-2 flex items-center justify-between">
              <h3 className="font-medium">{node.name}</h3>
              <Badge variant="secondary" className="text-xs">
                {t('concepts.paperCount', { count: node.frequency, plural: node.frequency !== 1 ? 's' : '' })}
              </Badge>
            </div>

            <p className="mb-3 line-clamp-2 text-xs text-muted-foreground">
              {node.definition}
            </p>

            {node.related_concepts.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {node.related_concepts.slice(0, 3).map((rel) => (
                  <Badge key={rel} variant="outline" className="text-xs">
                    {rel}
                  </Badge>
                ))}
                {node.related_concepts.length > 3 && (
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    +{node.related_concepts.length - 3} more
                  </Badge>
                )}
              </div>
            )}
          </button>
        ))}
      </div>

      {graphData.edges.length > 0 && (
        <div className="mt-8 rounded-lg border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">{t('concepts.relationships')}</h3>
          <div className="space-y-2">
            {graphData.edges.map((edge, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <Badge variant="outline">{edge.source}</Badge>
                <span className="text-muted-foreground">
                  <Badge className={relationTypeColor(edge.relation_type)}>
                    {t(`concepts.relationTypes.${edge.relation_type}`, edge.relation_type.replace('_', ' '))}
                  </Badge>
                </span>
                <Badge variant="outline">{edge.target}</Badge>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
