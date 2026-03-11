import { Outlet, Link, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileText,
  Tags,
  Search,
  PenLine,
  ListTodo,
  ArrowLeft,
  Rss,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectApi } from '@/services/api';
import { Button } from '@/components/ui/button';

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  const navItems = [
    { path: '', label: t('project.overview'), icon: LayoutDashboard },
    { path: 'papers', label: t('project.papers'), icon: FileText },
    { path: 'keywords', label: t('project.keywords'), icon: Tags },
    { path: 'search', label: t('project.search'), icon: Search },
    { path: 'writing', label: t('project.writing'), icon: PenLine },
    { path: 'tasks', label: t('project.tasks'), icon: ListTodo },
    { path: 'subscriptions', label: t('subscriptions.title'), icon: Rss },
  ];

  const { data } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.get(Number(projectId!)),
    enabled: !!projectId,
  });

  const project = data;
  const basePath = `/projects/${projectId}`;

  return (
    <div className="flex h-full">
      <aside className="w-52 shrink-0 border-r border-border bg-muted/30">
        <div className="flex h-full flex-col p-3">
          <Link to="/knowledge-bases">
            <Button variant="ghost" size="sm" className="mb-2 w-full justify-start gap-1.5">
              <ArrowLeft className="size-3.5" />
              {t('project.backToKB')}
            </Button>
          </Link>

          {project && (
            <h2 className="mb-3 truncate px-2 text-sm font-semibold">
              {project.name}
            </h2>
          )}

          <nav className="flex flex-col gap-0.5">
            {navItems.map((item) => {
              const fullPath = item.path ? `${basePath}/${item.path}` : basePath;
              const isActive = item.path
                ? location.pathname === fullPath
                : location.pathname === basePath || location.pathname === `${basePath}/`;
              return (
                <Link
                  key={item.path}
                  to={fullPath}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto p-6">
        <Outlet />
      </div>
    </div>
  );
}
