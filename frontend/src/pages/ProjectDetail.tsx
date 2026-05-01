import { Outlet, Link, useParams, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Compass,
  PenLine,
  ArrowLeft,
  Clock,
  Activity,
  Table2,
  Network,
  FolderOpen,
  FolderTree,
  Sparkles,
  TrendingUp,
  Lightbulb,
  Headphones,
  Search,
  Bell,
  NotebookPen,
  Users,
  LayoutDashboard,
  Download,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export default function ProjectDetail() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  const navItems = [
    { path: '', label: t('project.overview', 'Overview'), icon: LayoutDashboard },
    { path: 'papers', label: t('project.papers'), icon: FileText },
    { path: 'discovery', label: t('discovery.title'), icon: Compass },
    { path: 'search', label: t('searchPage.title', 'Search'), icon: Search },
    { path: 'reviews', label: t('reviews.title', 'Reviews'), icon: Table2 },
    { path: 'concepts', label: t('concepts.title', 'Concepts'), icon: Network },
    { path: 'library', label: t('library.title', 'Library'), icon: FolderOpen },
    { path: 'collections', label: t('collections.title', 'Collections'), icon: FolderTree },
    { path: 'feed', label: t('feed.title', 'Feed'), icon: Sparkles },
    { path: 'writing', label: t('project.writing'), icon: PenLine },
    { path: 'timeline', label: t('project.timeline'), icon: Clock },
    { path: 'trends', label: t('trends.title', 'Trends'), icon: TrendingUp },
    { path: 'gaps', label: t('gaps.title', 'Gap Analysis'), icon: Lightbulb },
    { path: 'activity', label: t('project.activity'), icon: Activity },
    { path: 'audio-overviews', label: t('audioOverview.title', 'Audio Overviews'), icon: Headphones },
    { path: 'notifications', label: t('notifications.title', 'Notifications'), icon: Bell },
    { path: 'notes', label: t('notes.dashboard', 'Notes'), icon: NotebookPen },
    { path: 'team', label: t('team.title', 'Team'), icon: Users },
    { path: 'export', label: 'Export', icon: Download },
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
      {/* Mobile horizontal nav */}
      <nav className="flex w-full overflow-x-auto border-b border-border bg-muted/30 px-2 py-1.5 md:hidden">
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
                'flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <item.icon className="size-3.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <aside className="hidden w-52 shrink-0 border-r border-border bg-muted/30 md:block">
        <div className="flex h-full flex-col p-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Link to="/knowledge-bases">
                <Button variant="ghost" size="icon" className="mb-2 size-8" aria-label={t('project.backToKB', 'Back to knowledge bases')}>
                  <ArrowLeft className="size-4" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">
              {t('project.backToKB')}
            </TooltipContent>
          </Tooltip>

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
