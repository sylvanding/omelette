import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';
import { apiUrl } from '@/lib/api-config';
import type { Project, Paper, Keyword, Task } from '@/types';
import type { PaginationParams, PaperListFilters } from '@/types/api';
import type { GraphData } from '@/components/citation-graph/CitationGraphView';

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
  export: (id: number) =>
    api.get<Record<string, unknown>>(`/projects/${id}/export`).then(r => r.data),
  import: (data: Record<string, unknown>) =>
    api.post<Project>('/projects/import', data).then(r => r.data),
  runPipeline: (projectId: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/pipeline/run`).then(r => r.data),
  runPaperPipeline: (projectId: number, paperId: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/pipeline/paper/${paperId}`).then(r => r.data),
};

export const paperApi = {
  list: (projectId: number, params?: PaperListFilters) =>
    api.get<PaginatedData<Paper>>(`/projects/${projectId}/papers`, { params }).then(r => r.data),
  get: (projectId: number, paperId: number) =>
    api.get<Paper>(`/projects/${projectId}/papers/${paperId}`).then(r => r.data),
  create: (projectId: number, data: Partial<Paper>) =>
    api.post<Paper>(`/projects/${projectId}/papers`, data).then(r => r.data),
  delete: (projectId: number, paperId: number) =>
    api.delete<null>(`/projects/${projectId}/papers/${paperId}`).then(r => r.data),
  batchDelete: (projectId: number, paperIds: number[]) =>
    api.post<{ deleted: number; requested: number }>(`/projects/${projectId}/papers/batch-delete`, { paper_ids: paperIds }).then(r => r.data),
  bulkImport: (projectId: number, papers: Partial<Paper>[]) =>
    api.post<{ created: number; skipped: number; total: number }>(`/projects/${projectId}/papers/bulk`, { papers }).then(r => r.data),
  getChunks: (projectId: number, paperId: number, params?: PaginationParams & { chunk_type?: string }) =>
    api.get<PaginatedData<Record<string, unknown>>>(`/projects/${projectId}/papers/${paperId}/chunks`, { params }).then(r => r.data),
  getCitationGraph: (projectId: number, paperId: number, depth?: number, maxNodes?: number) =>
    api.get<GraphData>(`/projects/${projectId}/papers/${paperId}/citation-graph`, {
      params: { depth, max_nodes: maxNodes },
    }).then(r => r.data),
};

export const keywordApi = {
  list: (projectId: number, params?: PaginationParams & { level?: number }) =>
    api.get<PaginatedData<Keyword>>(`/projects/${projectId}/keywords`, { params }).then(r => r.data),
  create: (projectId: number, data: Partial<Keyword>) =>
    api.post<Keyword>(`/projects/${projectId}/keywords`, data).then(r => r.data),
  bulkCreate: (projectId: number, keywords: Partial<Keyword>[]) =>
    api.post<{ created: number }>(`/projects/${projectId}/keywords/bulk`, { keywords }).then(r => r.data),
  update: (projectId: number, keywordId: number, data: Partial<Keyword>) =>
    api.put<Keyword>(`/projects/${projectId}/keywords/${keywordId}`, data).then(r => r.data),
  delete: (projectId: number, keywordId: number) =>
    api.delete<null>(`/projects/${projectId}/keywords/${keywordId}`).then(r => r.data),
  expand: (projectId: number, seedTerms: string[], language?: string, maxResults?: number) =>
    api.post<{ expanded_terms: string[] }>(`/projects/${projectId}/keywords/expand`, {
      seed_terms: seedTerms,
      language,
      max_results: maxResults,
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
  execute: (projectId: number, data: {
    query?: string;
    sources?: string[];
    max_results?: number;
    auto_import?: boolean;
  }) =>
    api.post<{ papers: Paper[]; imported: number; created?: number }>(
      `/projects/${projectId}/search/execute`, data
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
  query: (projectId: number, question: string, topK?: number, useReranker?: boolean) =>
    api.post<{ answer: string; sources?: unknown[] }>(`/projects/${projectId}/rag/query`, {
      question, top_k: topK, use_reranker: useReranker,
    }).then(r => r.data),
  index: (projectId: number) =>
    api.post<{ status: string }>(`/projects/${projectId}/rag/index`).then(r => r.data),
  stats: (projectId: number) =>
    api.get<Record<string, unknown>>(`/projects/${projectId}/rag/stats`).then(r => r.data),
  deleteIndex: (projectId: number) =>
    api.delete<Record<string, unknown>>(`/projects/${projectId}/rag/index`).then(r => r.data),

  async *indexStream(
    projectId: number,
    signal?: AbortSignal,
  ): AsyncGenerator<IndexSSEEvent> {
    const response = await fetch(apiUrl(`/projects/${projectId}/rag/index/stream`), {
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

export interface WritingAssistRequest {
  task: 'summarize' | 'cite' | 'review_outline' | 'gap_analysis';
  text?: string;
  paper_ids?: number[];
  topic?: string;
  style?: string;
  language?: string;
}

export interface WritingAssistResponse {
  content: string;
  citations: Record<string, unknown>[];
  suggestions: string[];
}

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
  assist: (projectId: number, request: WritingAssistRequest) =>
    api.post<WritingAssistResponse>(`/projects/${projectId}/writing/assist`, request).then(r => r.data),
};

export const taskApi = {
  list: (projectId?: number, params?: PaginationParams & { status?: string }) =>
    api.get<PaginatedData<Task>>('/tasks', {
      params: { ...params, project_id: projectId },
    }).then(r => r.data),
  get: (taskId: number) =>
    api.get<Task>(`/tasks/${taskId}`).then(r => r.data),
  cancel: (taskId: number) =>
    api.post<null>(`/tasks/${taskId}/cancel`).then(r => r.data),
};

export const ocrApi = {
  process: (projectId: number, paperIds?: number[], forceOcr?: boolean, useGpu?: boolean) =>
    api.post<{ processed: number; failed: number; total: number }>(`/projects/${projectId}/ocr/process`, null, {
      params: {
        ...(paperIds?.length ? { paper_ids: paperIds } : {}),
        force_ocr: forceOcr,
        use_gpu: useGpu,
      },
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

export const gpuApi = {
  status: () =>
    api.get<Record<string, unknown>>('/gpu/status').then(r => r.data),
  unload: () =>
    api.post<Record<string, unknown>>('/gpu/unload').then(r => r.data),
};

export const dedupApi = {
  run: (projectId: number, strategy?: 'full' | 'doi_only' | 'title_only') =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/dedup/run`, null, {
      params: { strategy },
    }).then(r => r.data),
  candidates: (projectId: number, params?: PaginationParams) =>
    api.get<PaginatedData<Record<string, unknown>>>(`/projects/${projectId}/dedup/candidates`, { params }).then(r => r.data),
  verify: (projectId: number, paperAId: number, paperBId: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/dedup/verify`, null, {
      params: { paper_a_id: paperAId, paper_b_id: paperBId },
    }).then(r => r.data),
};

export const crawlerApi = {
  start: (projectId: number, priority?: 'high' | 'low', maxPapers?: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/crawl/start`, null, {
      params: { priority, max_papers: maxPapers },
    }).then(r => r.data),
  stats: (projectId: number) =>
    api.get<Record<string, unknown>>(`/projects/${projectId}/crawl/stats`).then(r => r.data),
};
