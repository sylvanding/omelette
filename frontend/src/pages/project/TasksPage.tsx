import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { ListTodo, XCircle } from 'lucide-react';
import { taskApi } from '@/services/api';
import { queryKeys } from '@/lib/query-keys';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import PageLayout from '@/components/layout/PageLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Task } from '@/types';

const STATUS_VARIANT: Record<Task['status'], 'warning' | 'info' | 'success' | 'destructive' | 'secondary'> = {
  pending: 'warning',
  running: 'info',
  completed: 'success',
  failed: 'destructive',
  cancelled: 'secondary',
};

const KANBAN_COLUMNS: { status: Task['status']; label: string; emoji: string }[] = [
  { status: 'pending', label: 'Pending', emoji: '⏳' },
  { status: 'running', label: 'Running', emoji: '▶️' },
  { status: 'completed', label: 'Completed', emoji: '✅' },
  { status: 'failed', label: 'Failed', emoji: '❌' },
  { status: 'cancelled', label: 'Cancelled', emoji: '⛔' },
];

function KanbanBoard({
  tasks,
  onCancel,
  isCanceling,
}: {
  tasks: Task[];
  onCancel: (id: number) => void;
  isCanceling: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      {KANBAN_COLUMNS.map((col) => {
        const colTasks = tasks.filter((t) => t.status === col.status);
        return (
          <div key={col.status} className="flex flex-col rounded-xl border border-border bg-muted/20">
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <span className="text-sm">{col.emoji}</span>
              <span className="text-sm font-medium">{col.label}</span>
              <span className="ml-auto rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {colTasks.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3" style={{ maxHeight: '60vh' }}>
              {colTasks.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">No tasks</p>
              ) : (
                colTasks.map((task) => (
                  <div
                    key={task.id}
                    className="rounded-lg border border-border bg-card p-3 shadow-sm"
                  >
                    <p className="text-sm font-medium">{task.task_type}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary transition-all"
                          style={{
                            width: task.total > 0 ? `${Math.round((task.progress / task.total) * 100)}%` : '0%',
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {task.progress}/{task.total}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {task.created_at ? new Date(task.created_at).toLocaleTimeString() : ''}
                    </p>
                    {task.status === 'running' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 h-6 w-full gap-1 text-xs text-destructive hover:bg-destructive/10"
                        onClick={() => onCancel(task.id)}
                        disabled={isCanceling}
                      >
                        <XCircle className="size-3" />
                        Cancel
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function TasksPage() {
  const { t, i18n } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const pid = projectId ? Number(projectId) : undefined;
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const { data, isLoading } = useQuery({
    queryKey: [...queryKeys.tasks.list(pid), page, pageSize],
    queryFn: () => taskApi.list(pid, { page, page_size: pageSize }),
    enabled: pid === undefined || !Number.isNaN(pid),
  });

  const cancelMutation = useToastMutation({
    mutationFn: (taskId: number) => taskApi.cancel(taskId),
    successMessage: t('common.cancel'),
    errorMessage: t('common.operationFailed'),
    invalidateKeys: [queryKeys.tasks.list(pid)],
  });

  const tasks = data?.items ?? [];
  const pagination = data
    ? { page: data.page, pageSize: data.page_size, total: data.total }
    : undefined;

  const columns: DataTableColumn<Task>[] = [
    {
      id: 'task_type',
      header: t('common.type'),
      accessorKey: 'task_type',
    },
    {
      id: 'status',
      header: t('common.status'),
      cell: ({ row }) => (
        <Badge variant={STATUS_VARIANT[row.status]}>{row.status}</Badge>
      ),
    },
    {
      id: 'progress',
      header: t('common.progress'),
      accessorFn: (row) => `${row.progress} / ${row.total}`,
    },
    {
      id: 'created_at',
      header: t('project.created'),
      accessorFn: (row) =>
        row.created_at
          ? new Date(row.created_at).toLocaleString(
              i18n.language === 'zh' ? 'zh-CN' : 'en-US'
            )
          : '—',
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) =>
        row.status === 'running' ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              cancelMutation.mutate(row.id);
            }}
            disabled={cancelMutation.isPending}
          >
            <XCircle className="size-3.5" />
            {t('common.cancel')}
          </Button>
        ) : null,
    },
  ];

  return (
    <PageLayout title={t('tasks.title')} subtitle={t('tasks.subtitle')}>
      <div className="mx-auto max-w-5xl space-y-6">
        <Tabs defaultValue="list" className="w-full">
          <TabsList>
            <TabsTrigger value="list">{t('common.list', 'List')}</TabsTrigger>
            <TabsTrigger value="kanban">{t('common.kanban', 'Kanban')}</TabsTrigger>
          </TabsList>

          <TabsContent value="list" className="mt-4">
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              {!isLoading && tasks.length === 0 ? (
                <EmptyState
                  icon={ListTodo}
                  title={t('tasks.noTasks')}
                  description={t('tasks.noTasksDesc')}
                />
              ) : (
                <DataTable<Task>
                  columns={columns}
                  data={tasks}
                  getRowId={(row) => row.id}
                  isLoading={isLoading}
                  pagination={
                    pagination
                      ? {
                          page: pagination.page,
                          pageSize: pagination.pageSize,
                          total: pagination.total,
                        }
                      : undefined
                  }
                  onPaginationChange={(p, ps) => {
                    setPage(p);
                    setPageSize(ps);
                  }}
                  emptyMessage={t('tasks.noTasks')}
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="kanban" className="mt-4">
            <KanbanBoard tasks={tasks} onCancel={cancelMutation.mutate} isCanceling={cancelMutation.isPending} />
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
