import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';
import type { Project, Paper, Keyword, Task } from '@/types';

export const projectApi = {
  list: (page = 1, pageSize = 20) =>
    api.get<PaginatedData<Project>>(`/projects?page=${page}&page_size=${pageSize}`).then(r => r.data),
  get: (id: number) =>
    api.get<Project>(`/projects/${id}`).then(r => r.data),
  create: (data: Partial<Project>) =>
    api.post<Project>('/projects', data).then(r => r.data),
  update: (id: number, data: Partial<Project>) =>
    api.put<Project>(`/projects/${id}`, data).then(r => r.data),
  delete: (id: number) =>
    api.delete<null>(`/projects/${id}`).then(r => r.data),
};

export const paperApi = {
  list: (projectId: number, params?: Record<string, unknown>) =>
    api.get<PaginatedData<Paper>>(`/projects/${projectId}/papers`, { params }).then(r => r.data),
  get: (projectId: number, paperId: number) =>
    api.get<Paper>(`/projects/${projectId}/papers/${paperId}`).then(r => r.data),
  create: (projectId: number, data: Partial<Paper>) =>
    api.post<Paper>(`/projects/${projectId}/papers`, data).then(r => r.data),
  delete: (projectId: number, paperId: number) =>
    api.delete<null>(`/projects/${projectId}/papers/${paperId}`).then(r => r.data),
  bulkImport: (projectId: number, papers: Partial<Paper>[]) =>
    api.post<{ created: number; skipped: number; total: number }>(`/projects/${projectId}/papers/bulk`, { papers }).then(r => r.data),
};

export const keywordApi = {
  list: (projectId: number, level?: number) =>
    api.get<Keyword[]>(`/projects/${projectId}/keywords`, { params: level ? { level } : {} }).then(r => r.data),
  create: (projectId: number, data: Partial<Keyword>) =>
    api.post<Keyword>(`/projects/${projectId}/keywords`, data).then(r => r.data),
  update: (projectId: number, keywordId: number, data: Partial<Keyword>) =>
    api.put<Keyword>(`/projects/${projectId}/keywords/${keywordId}`, data).then(r => r.data),
  delete: (projectId: number, keywordId: number) =>
    api.delete<null>(`/projects/${projectId}/keywords/${keywordId}`).then(r => r.data),
  expand: (projectId: number, seedTerms: string[], language?: string) =>
    api.post<{ expanded_terms: string[] }>(`/projects/${projectId}/keywords/expand`, {
      seed_terms: seedTerms,
      language,
    }).then(r => r.data),
  searchFormula: (projectId: number, database?: string) =>
    api.get<{ formula: string }>(`/projects/${projectId}/keywords/search-formula`, {
      params: { database },
    }).then(r => r.data),
};

export interface SearchSource {
  id: string;
  name: string;
  status?: string;
}

export const searchApi = {
  execute: (projectId: number, data: Record<string, unknown>) =>
    api.post<{ papers: Paper[]; imported: number; created?: number }>(
      `/projects/${projectId}/search/execute`, null, { params: data }
    ).then(r => r.data),
  sources: (projectId: number) =>
    api.get<SearchSource[]>(`/projects/${projectId}/search/sources`).then(r => r.data),
};

export interface IndexSSEEvent {
  event: 'progress' | 'complete' | 'error';
  data: {
    stage?: string;
    percent?: number;
    message?: string;
    indexed?: number;
    collection?: string;
    papers_updated?: number;
  };
}

export const ragApi = {
  query: (projectId: number, question: string, topK?: number) =>
    api.post<{ answer: string; sources?: unknown[] }>(`/projects/${projectId}/rag/query`, { question, top_k: topK }).then(r => r.data),
  index: (projectId: number) =>
    api.post<{ status: string }>(`/projects/${projectId}/rag/index`).then(r => r.data),
  stats: (projectId: number) =>
    api.get<Record<string, unknown>>(`/projects/${projectId}/rag/stats`).then(r => r.data),

  async *indexStream(
    projectId: number,
    signal?: AbortSignal,
  ): AsyncGenerator<IndexSSEEvent> {
    const response = await fetch(`/api/v1/projects/${projectId}/rag/index/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.body) throw new Error('Response body is null — streaming not supported');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    let currentEvent = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop()!;
      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith('data: ')) {
          const data = JSON.parse(line.slice(6));
          yield { event: currentEvent as IndexSSEEvent['event'], data };
        }
      }
    }
  },
};

export const writingApi = {
  summarize: (projectId: number, paperIds: number[], language?: string) =>
    api.post<{ summaries: { title?: string; summary?: string }[] }>(`/projects/${projectId}/writing/summarize`, {
      paper_ids: paperIds,
      language: language ?? 'en',
    }).then(r => r.data),
  citations: (projectId: number, paperIds: number[], style?: string) =>
    api.post<{ citations: { citation?: string }[] }>(`/projects/${projectId}/writing/citations`, {
      paper_ids: paperIds,
      style: style ?? 'gb_t_7714',
    }).then(r => r.data),
  reviewOutline: (projectId: number, topic: string, language?: string) =>
    api.post<{ outline: string }>(`/projects/${projectId}/writing/review-outline`, {
      topic,
      language: language ?? 'en',
    }).then(r => r.data),
  gapAnalysis: (projectId: number, researchTopic: string) =>
    api.post<{ analysis: string }>(`/projects/${projectId}/writing/gap-analysis`, {
      research_topic: researchTopic,
    }).then(r => r.data),
};

export const taskApi = {
  list: (projectId?: number) =>
    api.get<Task[]>('/tasks', { params: projectId ? { project_id: projectId } : {} }).then(r => r.data),
  get: (taskId: number) =>
    api.get<Task>(`/tasks/${taskId}`).then(r => r.data),
};

export const ocrApi = {
  process: (projectId: number, paperIds?: number[], forceOcr?: boolean) =>
    api.post<{ processed: number }>(`/projects/${projectId}/ocr/process`, null, {
      params: paperIds?.length ? { paper_ids: paperIds, force_ocr: forceOcr } : { force_ocr: forceOcr },
    }).then(r => r.data),
  stats: (projectId: number) =>
    api.get<Record<string, unknown>>(`/projects/${projectId}/ocr/stats`).then(r => r.data),
};

export const paperProcessApi = {
  process: (projectId: number, paperIds?: number[]) =>
    api.post<{ queued: number; message: string }>(
      `/projects/${projectId}/papers/process`,
      null,
      { params: paperIds?.length ? { paper_ids: paperIds } : {} },
    ).then(r => r.data),
};
