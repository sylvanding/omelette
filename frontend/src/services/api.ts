import api from '@/lib/api';
import type { Project, Paper, Keyword } from '@/types';

export const projectApi = {
  list: (page = 1, pageSize = 20) =>
    api.get(`/projects?page=${page}&page_size=${pageSize}`),
  get: (id: number) => api.get(`/projects/${id}`),
  create: (data: Partial<Project>) => api.post('/projects', data),
  update: (id: number, data: Partial<Project>) => api.put(`/projects/${id}`, data),
  delete: (id: number) => api.delete(`/projects/${id}`),
};

export const paperApi = {
  list: (projectId: number, params?: Record<string, unknown>) =>
    api.get(`/projects/${projectId}/papers`, { params }),
  get: (projectId: number, paperId: number) =>
    api.get(`/projects/${projectId}/papers/${paperId}`),
  create: (projectId: number, data: Partial<Paper>) =>
    api.post(`/projects/${projectId}/papers`, data),
  delete: (projectId: number, paperId: number) =>
    api.delete(`/projects/${projectId}/papers/${paperId}`),
  bulkImport: (projectId: number, papers: Partial<Paper>[]) =>
    api.post(`/projects/${projectId}/papers/bulk`, { papers }),
};

export const keywordApi = {
  list: (projectId: number, level?: number) =>
    api.get(`/projects/${projectId}/keywords`, { params: level ? { level } : {} }),
  create: (projectId: number, data: Partial<Keyword>) =>
    api.post(`/projects/${projectId}/keywords`, data),
  update: (projectId: number, keywordId: number, data: Partial<Keyword>) =>
    api.put(`/projects/${projectId}/keywords/${keywordId}`, data),
  delete: (projectId: number, keywordId: number) =>
    api.delete(`/projects/${projectId}/keywords/${keywordId}`),
  expand: (projectId: number, seedTerms: string[], language?: string) =>
    api.post(`/projects/${projectId}/keywords/expand`, {
      seed_terms: seedTerms,
      language,
    }),
  searchFormula: (projectId: number, database?: string) =>
    api.get(`/projects/${projectId}/keywords/search-formula`, {
      params: { database },
    }),
};

export const searchApi = {
  execute: (projectId: number, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/search/execute`, null, { params: data }),
  sources: (projectId: number) =>
    api.get(`/projects/${projectId}/search/sources`),
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
    api.post(`/projects/${projectId}/rag/query`, { question, top_k: topK }),
  index: (projectId: number) => api.post(`/projects/${projectId}/rag/index`),
  stats: (projectId: number) => api.get(`/projects/${projectId}/rag/stats`),

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
    const reader = response.body!.getReader();
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
    api.post(`/projects/${projectId}/writing/summarize`, {
      paper_ids: paperIds,
      language: language ?? 'en',
    }),
  citations: (projectId: number, paperIds: number[], style?: string) =>
    api.post(`/projects/${projectId}/writing/citations`, {
      paper_ids: paperIds,
      style: style ?? 'gb_t_7714',
    }),
  reviewOutline: (projectId: number, topic: string, language?: string) =>
    api.post(`/projects/${projectId}/writing/review-outline`, {
      topic,
      language: language ?? 'en',
    }),
  gapAnalysis: (projectId: number, researchTopic: string) =>
    api.post(`/projects/${projectId}/writing/gap-analysis`, {
      research_topic: researchTopic,
    }),
};

export const taskApi = {
  list: (projectId?: number) =>
    api.get('/tasks', { params: projectId ? { project_id: projectId } : {} }),
  get: (taskId: number) => api.get(`/tasks/${taskId}`),
};

export const ocrApi = {
  process: (projectId: number, paperIds?: number[], forceOcr?: boolean) =>
    api.post(`/projects/${projectId}/ocr/process`, null, {
      params: paperIds?.length ? { paper_ids: paperIds, force_ocr: forceOcr } : { force_ocr: forceOcr },
    }),
  stats: (projectId: number) => api.get(`/projects/${projectId}/ocr/stats`),
};
