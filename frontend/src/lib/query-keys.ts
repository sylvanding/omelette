import type { PaperListFilters, PaginationParams, ActivityListFilters } from '@/types/api';

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
    citationGraph: (projectId: number, paperId: number, mode?: string) =>
      ['citation-graph', projectId, paperId, mode ?? 'all'] as const,
    chunks: (projectId: number, paperId: number, params?: PaginationParams) =>
      ['chunks', projectId, paperId, params] as const,
    analytics: (projectId: number) =>
      ['paper-analytics', projectId] as const,
    related: (projectId: number, paperId: number) =>
      ['related-papers', projectId, paperId] as const,
  },
  analytics: {
    knowledgeGaps: (projectId: number) =>
      ['knowledge-gaps', projectId] as const,
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
  activities: {
    list: (projectId: number, filters?: ActivityListFilters) =>
      ['activities', projectId, filters] as const,
  },
  apiKeys: {
    all: ['api-keys'] as const,
  },
  authorNetwork: {
    all: (projectId: number) => ['author-network', projectId] as const,
  },
  trends: {
    all: (projectId: number) => ['trends', projectId] as const,
  },
  gaps: {
    all: (projectId: number) => ['gaps', projectId] as const,
  },
  paperVersions: {
    all: (projectId: number, paperId: number) => ['paper-versions', projectId, paperId] as const,
  },
  impactScores: {
    all: (projectId: number) => ['impact-scores', projectId] as const,
  },
  audioOverviews: {
    all: (projectId: number) => ['audio-overviews', projectId] as const,
  },
  notifications: {
    all: (projectId: number) => ['notifications', projectId] as const,
    unread: (projectId: number) => ['notifications', projectId, 'unread'] as const,
  },
} as const;
