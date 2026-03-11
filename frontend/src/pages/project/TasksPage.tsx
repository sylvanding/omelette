import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { taskApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  running: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

export default function TasksPage() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId ? Number(projectId) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', pid],
    queryFn: () => taskApi.list(pid),
  });

  const tasks = data ?? [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">{t('tasks.title')}</h1>

      <div className="rounded-xl border border-border bg-card overflow-hidden">
        {isLoading ? (
          <LoadingState message={t('common.loading')} />
        ) : tasks.length === 0 ? (
          <EmptyState
            icon={ListTodo}
            title={t('tasks.noTasks')}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('common.type')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('common.status')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('common.progress')}
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground">
                    {t('project.created')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((task) => (
                  <tr
                    key={task.id}
                    className="border-b border-border hover:bg-muted/30">
                    <td className="px-4 py-3 text-sm font-medium text-foreground">
                      {task.task_type}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                          STATUS_STYLES[task.status] ?? 'bg-gray-100 text-gray-800'
                        )}>
                        {task.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {task.progress} / {task.total}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {task.created_at
                        ? new Date(task.created_at).toLocaleString()
                        : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
