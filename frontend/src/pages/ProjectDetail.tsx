import { Outlet, Link, useParams, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  LayoutDashboard,
  FileText,
  Tags,
  Search,
  MessageSquare,
  PenLine,
  ListTodo,
  ArrowLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { projectApi } from '@/services/api';
import { Button } from '@/components/ui/button';

const navItems = [
  { path: '', label: '概览', icon: LayoutDashboard },
  { path: 'papers', label: '论文', icon: FileText },
  { path: 'keywords', label: '关键词', icon: Tags },
  { path: 'search', label: '检索', icon: Search },
  { path: 'rag', label: 'RAG 问答', icon: MessageSquare },
  { path: 'writing', label: '写作', icon: PenLine },
  { path: 'tasks', label: '任务', icon: ListTodo },
];

export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const location = useLocation();

  const { data } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => projectApi.get(Number(projectId!)),
    enabled: !!projectId,
  });

  const project = data?.data;
  const basePath = `/projects/${projectId}`;

  return (
    <div className="flex h-full">
      <aside className="w-52 shrink-0 border-r border-border bg-muted/30">
        <div className="flex h-full flex-col p-3">
          <Link to="/knowledge-bases">
            <Button variant="ghost" size="sm" className="mb-2 w-full justify-start gap-1.5">
              <ArrowLeft className="size-3.5" />
              返回知识库
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
