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
            <div className="rounded-xl border border-dashed border-border bg-muted/20 p-12 text-center text-muted-foreground">
              {t('common.comingSoon', 'Coming soon')}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </PageLayout>
  );
}
