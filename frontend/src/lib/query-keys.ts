import type { PaperListFilters, PaginationParams } from '@/types/api';

export const queryKeys = {
  projects: {
    all: ['projects'] as const,
    list: (page?: number, pageSize?: number) => ['projects', { page, pageSize }] as const,
    detail: (id: number) => ['project', id] as const,
  },
  papers: {
    list: (projectId: number, filters?: PaperListFilters) =>
      ['papers', projectId, filters] as const,
    detail: (projectId: number, paperId: number) =>
      ['paper', projectId, paperId] as const,
    citationGraph: (projectId: number, paperId: number) =>
      ['citation-graph', projectId, paperId] as const,
    chunks: (projectId: number, paperId: number, params?: PaginationParams) =>
      ['chunks', projectId, paperId, params] as const,
  },
  keywords: {
    list: (projectId: number, level?: number) =>
      ['keywords', projectId, level] as const,
  },
  tasks: {
    list: (projectId?: number, status?: string) =>
      ['tasks', projectId, status] as const,
    detail: (taskId: number) => ['task', taskId] as const,
  },
  conversations: {
    list: () => ['conversations'] as const,
    detail: (id: number) => ['conversation', id] as const,
  },
  subscriptions: {
    list: (projectId: number) => ['subscriptions', projectId] as const,
    detail: (projectId: number, subId: number) => ['subscription', projectId, subId] as const,
    feeds: (projectId: number) => ['subscription-feeds', projectId] as const,
  },
  settings: {
    all: () => ['settings'] as const,
    models: () => ['settings', 'models'] as const,
    health: () => ['settings', 'health'] as const,
  },
  rag: {
    stats: (projectId: number) => ['rag-stats', projectId] as const,
  },
  pipelines: {
    list: (status?: string) => ['pipelines', status] as const,
    status: (threadId: string) => ['pipeline-status', threadId] as const,
  },
  gpu: {
    status: () => ['gpu-status'] as const,
  },
} as const;
