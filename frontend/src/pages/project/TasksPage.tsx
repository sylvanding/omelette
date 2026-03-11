import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ListTodo } from 'lucide-react';
import { motion } from 'framer-motion';
import { taskApi } from '@/services/api';
import { cn } from '@/lib/utils';
import { EmptyState } from '@/components/ui/empty-state';
import { TableSkeleton } from '@/components/ui/skeletons';
import PageHeader from '@/components/layout/PageHeader';
import { staggerContainer, staggerItem } from '@/lib/motion';

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  running: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  completed: 'bg-green-500/10 text-green-700 dark:text-green-400',
  failed: 'bg-red-500/10 text-red-700 dark:text-red-400',
  cancelled: 'bg-muted text-muted-foreground',
};

export default function TasksPage() {
  const { t, i18n } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId ? Number(projectId) : undefined;

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', pid],
    queryFn: () => taskApi.list(pid),
  });

  const tasks = data ?? [];

  return (
    <div className="h-full p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <PageHeader
          title={t('tasks.title')}
          subtitle={t('tasks.subtitle')}
        />

        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {isLoading ? (
            <TableSkeleton rows={4} cols={4} />
          ) : tasks.length === 0 ? (
            <EmptyState
              icon={ListTodo}
              title={t('tasks.noTasks')}
              description={t('tasks.noTasksDesc')}
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
                <motion.tbody
                  variants={staggerContainer}
                  initial="hidden"
                  animate="visible"
                >
                  {tasks.map((task) => (
                    <motion.tr
                      key={task.id}
                      variants={staggerItem}
                      className="border-b border-border hover:bg-muted/30"
                    >
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
                          ? new Date(task.created_at).toLocaleString(i18n.language === 'zh' ? 'zh-CN' : 'en-US')
                          : '—'}
                      </td>
                    </motion.tr>
                  ))}
                </motion.tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
