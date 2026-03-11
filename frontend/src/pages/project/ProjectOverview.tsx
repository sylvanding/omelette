import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { FileText, Tags, FlaskConical, Calendar } from 'lucide-react';
import { projectApi } from '@/services/api';

export default function ProjectOverview() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();

  const { data, isLoading } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.get(Number(projectId!)),
    enabled: !!projectId,
  });

  const project = data?.data;

  if (isLoading) {
    return (
      <div className="flex justify-center py-20 text-muted-foreground">
        {t('common.loading')}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="py-20 text-center text-muted-foreground">
        {t('project.notFound')}
      </div>
    );
  }

  const stats = [
    {
      label: t('project.papers'),
      value: project.paper_count,
      icon: FileText,
      path: 'papers',
    },
    {
      label: t('project.keywords'),
      value: project.keyword_count,
      icon: Tags,
      path: 'keywords',
    },
    {
      label: t('project.domain'),
      value: project.domain || '-',
      icon: FlaskConical,
    },
    {
      label: t('project.created'),
      value: new Date(project.created_at).toLocaleDateString(),
      icon: Calendar,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{project.name}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {project.description || t('project.noDesc')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card p-4">
            {stat.path ? (
              <Link
                to={`/projects/${projectId}/${stat.path}`}
                className="flex items-start gap-3 hover:opacity-90"
              >
                <stat.icon className="size-6 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {stat.value}
                  </div>
                </div>
              </Link>
            ) : (
              <div className="flex items-start gap-3">
                <stat.icon className="size-6 text-muted-foreground" />
                <div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="text-lg font-semibold text-foreground">
                    {stat.value}
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-muted-foreground">
        <p>{t('project.navHint')}</p>
      </div>
    </div>
  );
}
