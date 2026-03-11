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
      color: 'text-amber-600 dark:text-amber-400 bg-amber-500/10',
    },
    {
      label: t('project.keywords'),
      value: project.keyword_count,
      icon: Tags,
      path: 'keywords',
      color: 'text-blue-600 dark:text-blue-400 bg-blue-500/10',
    },
    {
      label: t('project.domain'),
      value: project.domain || '-',
      icon: FlaskConical,
      color: 'text-violet-600 dark:text-violet-400 bg-violet-500/10',
    },
    {
      label: t('project.created'),
      value: new Date(project.created_at).toLocaleDateString(),
      icon: Calendar,
      color: 'text-green-600 dark:text-green-400 bg-green-500/10',
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
            className="rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-md">
            {stat.path ? (
              <Link
                to={`/projects/${projectId}/${stat.path}`}
                className="flex items-start gap-3 hover:opacity-90"
              >
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${stat.color}`}>
                  <stat.icon className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="text-xl font-bold text-foreground">
                    {stat.value}
                  </div>
                </div>
              </Link>
            ) : (
              <div className="flex items-start gap-3">
                <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${stat.color}`}>
                  <stat.icon className="size-5" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">
                    {stat.label}
                  </div>
                  <div className="text-xl font-bold text-foreground">
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
