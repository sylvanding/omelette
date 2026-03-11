import api from '@/lib/api';
import type { ApiResponse, PaginatedData } from '@/lib/api';
import type { Project, Paper, Keyword, Task } from '@/types';

export const projectApi = {
  list: (page = 1, pageSize = 20) =>
    api.get(`/projects?page=${page}&page_size=${pageSize}`) as Promise<ApiResponse<PaginatedData<Project>>>,
  get: (id: number) =>
    api.get(`/projects/${id}`) as Promise<ApiResponse<Project>>,
  create: (data: Partial<Project>) =>
    api.post('/projects', data) as Promise<ApiResponse<Project>>,
  update: (id: number, data: Partial<Project>) =>
    api.put(`/projects/${id}`, data) as Promise<ApiResponse<Project>>,
  delete: (id: number) =>
    api.delete(`/projects/${id}`) as Promise<ApiResponse<null>>,
};

export const paperApi = {
  list: (projectId: number, params?: Record<string, unknown>) =>
    api.get(`/projects/${projectId}/papers`, { params }) as Promise<ApiResponse<PaginatedData<Paper>>>,
  get: (projectId: number, paperId: number) =>
    api.get(`/projects/${projectId}/papers/${paperId}`) as Promise<ApiResponse<Paper>>,
  create: (projectId: number, data: Partial<Paper>) =>
    api.post(`/projects/${projectId}/papers`, data) as Promise<ApiResponse<Paper>>,
  delete: (projectId: number, paperId: number) =>
    api.delete(`/projects/${projectId}/papers/${paperId}`) as Promise<ApiResponse<null>>,
  bulkImport: (projectId: number, papers: Partial<Paper>[]) =>
    api.post(`/projects/${projectId}/papers/bulk`, { papers }) as Promise<ApiResponse<{ imported: number }>>,
};

export const keywordApi = {
  list: (projectId: number, level?: number) =>
    api.get(`/projects/${projectId}/keywords`, { params: level ? { level } : {} }) as Promise<ApiResponse<Keyword[]>>,
  create: (projectId: number, data: Partial<Keyword>) =>
    api.post(`/projects/${projectId}/keywords`, data) as Promise<ApiResponse<Keyword>>,
  update: (projectId: number, keywordId: number, data: Partial<Keyword>) =>
    api.put(`/projects/${projectId}/keywords/${keywordId}`, data) as Promise<ApiResponse<Keyword>>,
  delete: (projectId: number, keywordId: number) =>
    api.delete(`/projects/${projectId}/keywords/${keywordId}`) as Promise<ApiResponse<null>>,
  expand: (projectId: number, seedTerms: string[], language?: string) =>
    api.post(`/projects/${projectId}/keywords/expand`, {
      seed_terms: seedTerms,
      language,
    }) as Promise<ApiResponse<{ expanded_terms: string[] }>>,
  searchFormula: (projectId: number, database?: string) =>
    api.get(`/projects/${projectId}/keywords/search-formula`, {
      params: { database },
    }) as Promise<ApiResponse<{ formula: string }>>,
};

export interface SearchSource {
  id: string;
  name: string;
  status?: string;
}

export const searchApi = {
  execute: (projectId: number, data: Record<string, unknown>) =>
    api.post(`/projects/${projectId}/search/execute`, null, { params: data }) as Promise<
      ApiResponse<{ papers: Paper[]; imported: number; created?: number }>
    >,
  sources: (projectId: number) =>
    api.get(`/projects/${projectId}/search/sources`) as Promise<ApiResponse<SearchSource[]>>,
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
    api.post(`/projects/${projectId}/writing/summarize`, {
      paper_ids: paperIds,
      language: language ?? 'en',
    }) as Promise<ApiResponse<{ summaries: { title?: string; summary?: string }[] }>>,
  citations: (projectId: number, paperIds: number[], style?: string) =>
    api.post(`/projects/${projectId}/writing/citations`, {
      paper_ids: paperIds,
      style: style ?? 'gb_t_7714',
    }) as Promise<ApiResponse<{ citations: { citation?: string }[] }>>,
  reviewOutline: (projectId: number, topic: string, language?: string) =>
    api.post(`/projects/${projectId}/writing/review-outline`, {
      topic,
      language: language ?? 'en',
    }) as Promise<ApiResponse<{ outline: string }>>,
  gapAnalysis: (projectId: number, researchTopic: string) =>
    api.post(`/projects/${projectId}/writing/gap-analysis`, {
      research_topic: researchTopic,
    }) as Promise<ApiResponse<{ analysis: string }>>,
};

export const taskApi = {
  list: (projectId?: number) =>
    api.get('/tasks', { params: projectId ? { project_id: projectId } : {} }) as Promise<ApiResponse<Task[]>>,
  get: (taskId: number) =>
    api.get(`/tasks/${taskId}`) as Promise<ApiResponse<Task>>,
};

export const ocrApi = {
  process: (projectId: number, paperIds?: number[], forceOcr?: boolean) =>
    api.post(`/projects/${projectId}/ocr/process`, null, {
      params: paperIds?.length ? { paper_ids: paperIds, force_ocr: forceOcr } : { force_ocr: forceOcr },
    }) as Promise<ApiResponse<{ processed: number }>>,
  stats: (projectId: number) =>
    api.get(`/projects/${projectId}/ocr/stats`) as Promise<ApiResponse<Record<string, unknown>>>,
};
