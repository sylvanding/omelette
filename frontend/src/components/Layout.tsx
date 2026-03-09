import { Outlet, Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  Settings,
  FileText,
  Tags,
  Search,
  MessageSquare,
  PenLine,
  ListTodo,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectApi } from '@/services/api';

const globalNavItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/settings', label: 'Settings', icon: Settings },
];

const projectNavItems = [
  { path: 'papers', label: 'Papers', icon: FileText },
  { path: 'keywords', label: 'Keywords', icon: Tags },
  { path: 'search', label: 'Search', icon: Search },
  { path: 'rag', label: 'RAG Chat', icon: MessageSquare },
  { path: 'writing', label: 'Writing', icon: PenLine },
  { path: 'tasks', label: 'Tasks', icon: ListTodo },
];

export default function Layout() {
  const location = useLocation();
  const { projectId } = useParams<{ projectId: string }>();

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.get(Number(projectId!)),
    enabled: !!projectId,
  });

  const project = projectData?.data;
  const isProjectRoute = !!projectId;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-4">
          <Link
            to="/"
            className="flex items-center gap-2 font-bold text-lg text-foreground"
          >
            <span className="text-2xl">🍳</span>
            <span>Omelette</span>
          </Link>
          <nav className="flex items-center gap-1">
            {globalNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto text-xs text-muted-foreground">v0.1.0</div>
        </div>
      </header>

      <div className="mx-auto flex max-w-[1600px]">
        {isProjectRoute && project && (
          <aside className="w-56 shrink-0 border-r border-border bg-card/50">
            <div className="sticky top-14 flex flex-col gap-1 p-3">
              <Link
                to={`/projects/${projectId}`}
                className="mb-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground hover:bg-secondary"
              >
                {project.name}
              </Link>
              <nav className="flex flex-col gap-0.5">
                <Link
                  to={`/projects/${projectId}`}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    location.pathname === `/projects/${projectId}` ||
                      location.pathname === `/projects/${projectId}/`
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                  )}
                >
                  <LayoutDashboard className="size-4" />
                  Overview
                </Link>
                {projectNavItems.map((item) => {
                  const path = `/projects/${projectId}/${item.path}`;
                  const isActive = location.pathname === path;
                  return (
                    <Link
                      key={item.path}
                      to={path}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-primary text-primary-foreground'
                          : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
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
        )}

        <main className="min-w-0 flex-1 px-4 py-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
