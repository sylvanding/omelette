import { api } from '@/lib/api';
import type { PaginatedData } from '@/lib/api';
import { apiUrl } from '@/lib/api-config';
import type { Project, Paper, Keyword, Task, ActivityLog, FeedResponse } from '@/types';
import type { PaginationParams, PaperListFilters, PaperComparisonRequest, PaperComparisonResponse, ActivityListFilters } from '@/types/api';
import type { GraphData } from '@/components/citation-graph/CitationGraphView';

export interface OverviewData {
  total_papers: number;
  papers_by_status: Record<string, number>;
  papers_by_reading: Record<string, number>;
  papers_by_year: Record<string, number>;
  avg_citations: number;
  recent_papers: Array<{ title: string; year: number | null; reading_status: string; added_at: string | null }>;
  keyword_count: number;
  subscription_count: number;
}

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
  getOverview: (id: number) =>
    api.get<OverviewData>(`/projects/${id}/overview`).then(r => r.data),
};

export interface ReadingAnalytics {
  total: number;
  by_status: Record<string, number>;
  read_by_week: Record<string, number>;
  top_journals: Array<{ journal: string; count: number }>;
  papers_per_week: number;
  avg_read_time_seconds: number;
  reading_streak_days: number;
  domain_coverage: number;
  citation_impact: {
    min: number;
    max: number;
    mean: number;
    median: number;
    p75: number;
  };
}

export interface KnowledgeGapItem {
  topic: string;
  relevance_score: number;
  paper_count: number;
}

export interface KnowledgeGapAnalysis {
  gaps: KnowledgeGapItem[];
  total_topics_analyzed: number;
  coverage_score: number;
}

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
  getCitationGraph: (projectId: number, paperId: number, options?: { depth?: number; maxNodes?: number; mode?: string }) =>
    api.get<GraphData>(`/projects/${projectId}/papers/${paperId}/citation-graph`, {
      params: { depth: options?.depth, max_nodes: options?.maxNodes, mode: options?.mode },
    }).then(r => r.data),
  update: (projectId: number, paperId: number, data: Partial<Paper>) =>
    api.put<Paper>(`/projects/${projectId}/papers/${paperId}`, data).then(r => r.data),
  getAnalytics: (projectId: number) =>
    api.get<ReadingAnalytics>(`/projects/${projectId}/papers/analytics`).then(r => r.data),
  compare: (projectId: number, data: PaperComparisonRequest) =>
    api.post<PaperComparisonResponse>(`/projects/${projectId}/papers/compare`, data).then(r => r.data),
  getRelated: (projectId: number, paperId: number, limit?: number) =>
    api.get<SimilarPaper[]>(`/projects/${projectId}/papers/${paperId}/similar`, {
      params: limit ? { limit } : {},
    }).then(r => r.data),
};

export interface SimilarPaper {
  id: number;
  title: string;
  authors: string[];
  year: number | null;
  journal: string;
  citation_count: number;
  similarity_score: number;
}

export type ExportFormat = 'bibtex' | 'ris' | 'endnote';

export interface ExportFilters {
  format: ExportFormat;
  q?: string;
  status?: string;
  year?: number;
}

/**
 * Export papers as a downloadable file. Uses raw fetch to bypass the axios
 * response interceptor (which unwraps JSON, not blobs).
 */
export async function exportPapers(projectId: number, filters: ExportFilters): Promise<void> {
  const params = new URLSearchParams({ format: filters.format });
  if (filters.q) params.set('q', filters.q);
  if (filters.status) params.set('status', filters.status);
  if (filters.year) params.set('year', String(filters.year));

  const response = await fetch(`/api/v1/projects/${projectId}/papers/export?${params}`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error(`Export failed: ${response.status}`);
  }

  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = `export-${filters.format}`;
  if (contentDisposition) {
    const match = contentDisposition.match(/filename="?([^"]+)"?/);
    if (match) filename = match[1];
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

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
          try {
            const data = JSON.parse(line.slice(6));
            yield { event: currentEvent as IndexSSEEvent['event'], data };
          } catch {
            // Skip malformed SSE data fragments
          }
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

// ---------------------------------------------------------------------------
// Pipeline API
// ---------------------------------------------------------------------------

export interface Pipeline {
  thread_id: string;
  status: 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled';
  task_id?: number;
}

export interface PipelineStatus {
  thread_id: string;
  status: string;
  stage?: string;
  progress?: number;
  conflicts?: Record<string, unknown>[];
  interrupted_at?: string[];
  result?: Record<string, unknown>;
  error?: string;
}

export const pipelineApi = {
  list: (status?: string) =>
    api.get<Record<string, unknown>[]>('/pipelines', { params: status ? { status } : undefined }).then(r => r.data),
  search: (projectId: number, query: string, sources?: string[], maxResults?: number) =>
    api.post<Record<string, unknown>>('/pipelines/search', {
      project_id: projectId, query, sources, max_results: maxResults ?? 50,
    }).then(r => r.data),
  upload: (projectId: number, pdfPaths: string[]) =>
    api.post<Record<string, unknown>>('/pipelines/upload', {
      project_id: projectId, pdf_paths: pdfPaths,
    }).then(r => r.data),
  status: (threadId: string) =>
    api.get<Record<string, unknown>>(`/pipelines/${threadId}/status`).then(r => r.data),
  resume: (threadId: string, resolvedConflicts: Record<string, unknown>[]) =>
    api.post<Record<string, unknown>>(`/pipelines/${threadId}/resume`, {
      resolved_conflicts: resolvedConflicts,
    }).then(r => r.data),
  cancel: (threadId: string) =>
    api.post<Record<string, unknown>>(`/pipelines/${threadId}/cancel`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Subscription API
// ---------------------------------------------------------------------------

export interface Subscription {
  id: number;
  project_id: number;
  name: string;
  query: string;
  sources: string[];
  frequency: 'daily' | 'weekly' | 'monthly';
  max_results: number;
  is_active: boolean;
  last_run_at: string | null;
  total_found: number;
  created_at: string | null;
  updated_at: string | null;
}

export interface SubscriptionCreate {
  name: string;
  query: string;
  sources: string[];
  frequency: 'daily' | 'weekly' | 'monthly';
  max_results: number;
}

export interface SubscriptionRunResult {
  new_papers: number;
  total_checked: number;
  sources_searched: string[];
  imported: number;
}

export const subscriptionApi = {
  list: (projectId: number, params?: PaginationParams) =>
    api.get<PaginatedData<Subscription>>(`/projects/${projectId}/subscriptions`, { params }).then(r => r.data),
  get: (projectId: number, subId: number) =>
    api.get<Subscription>(`/projects/${projectId}/subscriptions/${subId}`).then(r => r.data),
  create: (projectId: number, body: SubscriptionCreate) =>
    api.post<Subscription>(`/projects/${projectId}/subscriptions`, body).then(r => r.data),
  update: (projectId: number, subId: number, body: Partial<SubscriptionCreate>) =>
    api.put<Subscription>(`/projects/${projectId}/subscriptions/${subId}`, body).then(r => r.data),
  delete: (projectId: number, subId: number) =>
    api.delete(`/projects/${projectId}/subscriptions/${subId}`).then(r => r.data),
  trigger: (projectId: number, subId: number, sinceDays?: number, autoImport?: boolean) =>
    api.post<SubscriptionRunResult>(`/projects/${projectId}/subscriptions/${subId}/trigger`, null, {
      params: { since_days: sinceDays, auto_import: autoImport },
    }).then(r => r.data),
  checkRss: (projectId: number, feedUrl: string, sinceDays?: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/subscriptions/check-rss`, null, {
      params: { feed_url: feedUrl, since_days: sinceDays },
    }).then(r => r.data),
  checkUpdates: (projectId: number, query?: string, sources?: string[], sinceDays?: number, maxResults?: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/subscriptions/check-updates`, null, {
      params: { query, sources, since_days: sinceDays, max_results: maxResults },
    }).then(r => r.data),
  feeds: (projectId: number) =>
    api.get<Record<string, unknown>[]>(`/projects/${projectId}/subscriptions/feeds`).then(r => r.data),
};

export const activityApi = {
  list: (projectId: number, params?: ActivityListFilters) =>
    api.get<PaginatedData<ActivityLog>>(`/projects/${projectId}/activities`, { params }).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Augmented Reading API
// ---------------------------------------------------------------------------

export interface PaperHighlight {
  category: 'Goal' | 'Method' | 'Result';
  text: string;
  page: number;
  start_offset: number;
  end_offset: number;
}

export interface CitationCard {
  paper_id: number | null;
  paper_title: string;
  tldr: string;
  doi: string | null;
}

export interface TermDefinition {
  term: string;
  definition: string;
  context: string;
}

export const augmentedReadingApi = {
  getHighlights: (projectId: number, paperId: number, paperContent: string) =>
    api.post<{ highlights: PaperHighlight[] }>(
      `/projects/${projectId}/papers/${paperId}/highlights`,
      { paper_content: paperContent },
    ).then(r => r.data),

  getCitationCards: (projectId: number, paperId: number) =>
    api.get<{ cards: CitationCard[] }>(
      `/projects/${projectId}/papers/${paperId}/citation-cards`,
    ).then(r => r.data),

  getDefinitions: (projectId: number, paperId: number) =>
    api.get<{ definitions: TermDefinition[] }>(
      `/projects/${projectId}/papers/${paperId}/definitions`,
    ).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Evidence Consensus API
// ---------------------------------------------------------------------------

export interface EvidencePaperFinding {
  paper_id: number;
  paper_title: string;
  stance: 'support' | 'contradict' | 'mixed';
  finding: string;
  source_quote: string;
  confidence: number;
}

export interface EvidenceConsensusResult {
  support_count: number;
  contradict_count: number;
  mixed_count: number;
  total_papers: number;
  support_percentage: number;
  contradict_percentage: number;
  mixed_percentage: number;
  papers: EvidencePaperFinding[];
  overall_confidence: number;
}

export const evidenceConsensusApi = {
  analyze: (projectId: number, question: string, topK?: number) =>
    api.post<EvidenceConsensusResult>(
      `/projects/${projectId}/rag/evidence-consensus`,
      { question, top_k: topK },
    ).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Contradiction Detection API
// ---------------------------------------------------------------------------

export interface ContradictionPair {
  paper_a_id: number;
  paper_a_title: string;
  paper_b_id: number;
  paper_b_title: string;
  claim: string;
  position_a: string;
  position_b: string;
  confidence: number;
  topic: string;
}

export interface ContradictionResult {
  contradictions: ContradictionPair[];
  topics: string[];
  total_contradictions: number;
}

export const contradictionsApi = {
  detect: (projectId: number) =>
    api.post<ContradictionResult>(
      `/projects/${projectId}/analysis/contradictions`,
    ).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Collections API
// ---------------------------------------------------------------------------

export interface Collection {
  id: number;
  project_id: number;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  paper_count: number;
}

export interface CollectionPaperItem {
  paper_id: number;
  title: string;
  doi: string | null;
  year: number | null;
  citation_count: number;
}

export interface CollectionDetail {
  collection: Collection;
  papers: CollectionPaperItem[];
}

export interface PaperTagSuggestion {
  paper_id: number;
  suggested_tags: string[];
}

export const collectionsApi = {
  list: (projectId: number) =>
    api.get<{ collections: Collection[] }>(`/projects/${projectId}/collections`).then(r => r.data),

  create: (projectId: number, data: { name: string; description?: string; color?: string }) =>
    api.post<Collection>(`/projects/${projectId}/collections`, data).then(r => r.data),

  update: (projectId: number, collectionId: number, data: Partial<{ name: string; description: string; color: string; sort_order: number }>) =>
    api.put<Collection>(`/projects/${projectId}/collections/${collectionId}`, data).then(r => r.data),

  delete: (projectId: number, collectionId: number) =>
    api.delete<null>(`/projects/${projectId}/collections/${collectionId}`).then(r => r.data),

  getDetail: (projectId: number, collectionId: number) =>
    api.get<CollectionDetail>(`/projects/${projectId}/collections/${collectionId}`).then(r => r.data),

  addPapers: (projectId: number, collectionId: number, paperIds: number[]) =>
    api.post<Collection>(`/projects/${projectId}/collections/${collectionId}/papers`, { paper_ids: paperIds }).then(r => r.data),

  removePapers: (projectId: number, collectionId: number, paperIds: number[]) =>
    api.delete<Collection>(`/projects/${projectId}/collections/${collectionId}/papers`, { data: { paper_ids: paperIds } }).then(r => r.data),

  suggestTags: (projectId: number, paperIds: number[]) =>
    api.post<{ tags: PaperTagSuggestion[] }>(`/projects/${projectId}/collections/tags/suggest`, { paper_ids: paperIds }).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Reviews API
// ---------------------------------------------------------------------------

export interface ReviewColumn {
  name: string;
  description: string;
}

export interface Review {
  id: number;
  project_id: number;
  title: string;
  research_question: string;
  columns: ReviewColumn[];
  paper_ids: number[];
  extraction_status: string;
}

export interface ExtractionResult {
  paper_id: number;
  extracted_data: Record<string, unknown>;
  status: string;
  confidence: number;
}

export interface ExtractionProgress {
  review_id: number;
  status: string;
  total_papers: number;
  completed: number;
  results: ExtractionResult[];
}

export const reviewsApi = {
  list: (projectId: number) =>
    api.get<{ reviews: Review[] }>(`/projects/${projectId}/reviews`).then(r => r.data),

  create: (projectId: number, data: { title: string; research_question?: string; columns?: ReviewColumn[]; paper_ids?: number[] }) =>
    api.post<Review>(`/projects/${projectId}/reviews`, data).then(r => r.data),

  update: (projectId: number, reviewId: number, data: Partial<{ title: string; research_question: string; columns: ReviewColumn[]; paper_ids: number[] }>) =>
    api.put<Review>(`/projects/${projectId}/reviews/${reviewId}`, data).then(r => r.data),

  delete: (projectId: number, reviewId: number) =>
    api.delete<null>(`/projects/${projectId}/reviews/${reviewId}`).then(r => r.data),

  extract: (projectId: number, reviewId: number) =>
    api.post<ExtractionProgress>(`/projects/${projectId}/reviews/${reviewId}/extract`).then(r => r.data),

  getExtractions: (projectId: number, reviewId: number) =>
    api.get<ExtractionProgress>(`/projects/${projectId}/reviews/${reviewId}/extractions`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Concepts API
// ---------------------------------------------------------------------------

export interface ConceptNode {
  name: string;
  definition: string;
  frequency: number;
  related_papers: number[];
  related_concepts: string[];
}

export interface ConceptEdge {
  source: string;
  target: string;
  relation_type: string;
  description: string;
}

export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
  total_concepts: number;
}

export interface TopicPage {
  concept_name: string;
  definition: string;
  overview: string;
  key_findings: string[];
  related_topics: string[];
  research_directions: string[];
}

export const conceptsApi = {
  extract: (projectId: number) =>
    api.post<ConceptGraph>(`/projects/${projectId}/concepts/extract`).then(r => r.data),

  getGraph: (projectId: number) =>
    api.get<ConceptGraph>(`/projects/${projectId}/concepts/graph`).then(r => r.data),

  getTopicPage: (projectId: number, conceptName: string) =>
    api.get<TopicPage>(`/projects/${projectId}/concepts/${encodeURIComponent(conceptName)}/page`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Library Organization API
// ---------------------------------------------------------------------------

export interface PaperIssue {
  paper_id: number;
  title: string;
  issues: string[];
  issue_count: number;
}

export interface LibraryHealth {
  total_papers: number;
  papers_with_issues: number;
  healthy_papers: number;
  issues: PaperIssue[];
}

export interface RepairedPaper {
  paper_id: number;
  title: string;
  abstract: string;
  authors: unknown[];
  journal: string;
  year: number | null;
  citation_count: number;
  doi: string;
}

export interface RepairResult {
  repaired: RepairedPaper[];
  failed: Array<{ paper_id: number; reason: string }>;
  total_attempted: number;
  success_count: number;
  failure_count: number;
}

export interface TagSuggestion {
  paper_id: number;
  suggested_tags: string[];
}

export interface AutoTagResult {
  tags: TagSuggestion[];
  total_tagged: number;
}

export interface PaperCluster {
  name: string;
  description: string;
  paper_ids: number[];
}

export interface ClusterResult {
  clusters: PaperCluster[];
  total_clusters: number;
}

export const libraryApi = {
  health: (projectId: number) =>
    api.get<LibraryHealth>(`/projects/${projectId}/library/health`).then(r => r.data),

  repair: (projectId: number) =>
    api.post<RepairResult>(`/projects/${projectId}/library/repair`).then(r => r.data),

  autoTag: (projectId: number) =>
    api.post<AutoTagResult>(`/projects/${projectId}/library/auto-tag`).then(r => r.data),

  clusters: (projectId: number) =>
    api.post<ClusterResult>(`/projects/${projectId}/library/clusters`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Reading Session API
// ---------------------------------------------------------------------------

export interface ReadingSessionInput {
  paper_id: number;
  started_at: string;
  ended_at: string;
  time_spent_seconds: number;
  pages_read?: number;
}

export const readingSessionApi = {
  record: (projectId: number, data: ReadingSessionInput) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/papers/reading-sessions`, data).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Knowledge Gap Analysis API
// ---------------------------------------------------------------------------

export const knowledgeGapsApi = {
  get: (projectId: number) =>
    api.get<KnowledgeGapAnalysis>(`/projects/${projectId}/analytics/knowledge-gaps`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Personalized Research Feed API
// ---------------------------------------------------------------------------

export const feedApi = {
  get: (projectId: number) =>
    api.get<FeedResponse>(`/projects/${projectId}/feed/recommendations`).then(r => r.data),

  refresh: (projectId: number) =>
    api.post<FeedResponse>(`/projects/${projectId}/feed/refresh`).then(r => r.data),

  feedback: (projectId: number, paperId: number, feedback: string) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/feed/${paperId}/feedback`, { feedback }).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Audio Overviews API
// ---------------------------------------------------------------------------

export interface DialogueEntry {
  speaker: string;
  text: string;
}

export interface AudioOverviewResponse {
  title: string;
  duration_estimate: string;
  summary: string;
  script: DialogueEntry[];
  paper_count: number;
}

export interface AudioOverviewRequest {
  paper_ids: number[];
  tone?: 'formal' | 'conversational';
  focus_areas?: string[];
}

export interface AudioOverviewListItem {
  id: number;
  title: string;
  summary: string;
  duration_estimate: string;
  tone: string;
  paper_count: number;
  paper_ids: number[];
  created_at: string | null;
}

export interface AudioOverviewListResponse {
  items: AudioOverviewListItem[];
  total: number;
}

export const audioOverviewsApi = {
  generate: (projectId: number, data: AudioOverviewRequest) =>
    api.post<AudioOverviewResponse>(`/projects/${projectId}/audio-overviews`, data).then(r => r.data),

  list: (projectId: number) =>
    api.get<AudioOverviewListResponse>(`/projects/${projectId}/audio-overviews`).then(r => r.data),

  delete: (projectId: number, overviewId: number) =>
    api.delete<Record<string, unknown>>(`/projects/${projectId}/audio-overviews/${overviewId}`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Browser Upload API
// ---------------------------------------------------------------------------

export interface BrowserCaptureResult {
  status: string;
  paper_id: number;
  title: string;
  processing: boolean;
}

export const browserUploadApi = {
  capture: (
    projectId: number,
    params: {
      pdf_url?: string;
      doi?: string;
      arxiv_id?: string;
      title?: string;
      tags?: string;
    },
  ) =>
    api.post<BrowserCaptureResult>(
      `/projects/${projectId}/upload/browser`,
      null,
      { params },
    ).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Reference Manager Export API
// ---------------------------------------------------------------------------

export interface ZoteroExportResult {
  preview?: string;
  message: string;
  paper_count?: number;
  collection_key?: string;
  collection_name?: string;
  items_created?: number;
  errors?: string[];
}

export const exportReferenceApi = {
  exportBibtex: (projectId: number) =>
    api.post<string>(`/projects/${projectId}/export/bibtex`).then(r => r.data),
  exportRis: (projectId: number) =>
    api.post<string>(`/projects/${projectId}/export/ris`).then(r => r.data),
  exportZotero: (projectId: number, collectionName: string) =>
    api.post<{ data: ZoteroExportResult }>(
      `/projects/${projectId}/export/zotero`,
      { collection_name: collectionName },
    ).then(r => r.data.data),
};

// ---------------------------------------------------------------------------
// Team Members API
// ---------------------------------------------------------------------------

export type TeamMemberRole = 'owner' | 'admin' | 'editor' | 'viewer';

export interface TeamMember {
  id: number;
  email: string;
  role: TeamMemberRole;
  status: string;
  invited_by: string | null;
  created_at: string;
}

export const teamMembersApi = {
  list: (projectId: number) =>
    api.get<TeamMember[]>(`/projects/${projectId}/members`).then(r => r.data),
  invite: (projectId: number, email: string, role: TeamMemberRole = 'viewer') =>
    api.post<TeamMember>(`/projects/${projectId}/members`, { email, role }).then(r => r.data),
  updateRole: (projectId: number, memberId: number, role: TeamMemberRole) =>
    api.put<TeamMember>(`/projects/${projectId}/members/${memberId}`, { role }).then(r => r.data),
  remove: (projectId: number, memberId: number) =>
    api.delete<null>(`/projects/${projectId}/members/${memberId}`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// API Keys Management API
// ---------------------------------------------------------------------------

export type { APIKey, APIKeyScope, CreatedAPIKey } from '@/types';
import type { APIKeyScope } from '@/types';

export interface CreateAPIKeyRequest {
  name: string;
  scope?: APIKeyScope;
}

export const apiKeysApi = {
  list: () =>
    api.get<import('@/types').APIKey[]>('/api-keys').then(r => r.data),

  create: (data: CreateAPIKeyRequest) =>
    api.post<import('@/types').CreatedAPIKey>('/api-keys', data).then(r => r.data),

  revoke: (keyId: number) =>
    api.post<import('@/types').APIKey>(`/api-keys/${keyId}/revoke`).then(r => r.data),

  delete: (keyId: number) =>
    api.delete<null>(`/api-keys/${keyId}`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Author Network API
// ---------------------------------------------------------------------------

export interface AuthorNetworkNode {
  name: string;
  paper_count: number;
  paper_ids: number[];
  coauthors: string[];
  h_index_estimate: number;
}

export interface AuthorNetworkEdge {
  source: string;
  target: string;
  collaboration_count: number;
}

export interface AuthorNetworkMetrics {
  total_authors: number;
  total_edges: number;
  density: number;
  top_authors: Array<{ name: string; degree: number }>;
}

export interface AuthorNetworkData {
  nodes: AuthorNetworkNode[];
  edges: AuthorNetworkEdge[];
  metrics: AuthorNetworkMetrics;
  total_authors: number;
}

export const authorNetworkApi = {
  get: (projectId: number, params?: { min_collaborations?: number; max_nodes?: number }) =>
    api.get<AuthorNetworkData>(`/projects/${projectId}/analysis/author-network`, {
      params: {
        min_collaborations: params?.min_collaborations,
        max_nodes: params?.max_nodes,
      },
    }).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Research Trends API
// ---------------------------------------------------------------------------

export interface TrendYearlyCount {
  year: number;
  count: number;
}

export interface TrendTopicTrend {
  topic: string;
  slope: number;
  r_squared: number;
  trend: 'rising' | 'declining' | 'stable';
  total_papers: number;
  first_year: number;
  last_year: number;
  yearly_counts: TrendYearlyCount[];
}

export interface TrendEmergingTopic {
  topic: string;
  yoy_growth: number;
}

export interface TrendSummaryStats {
  total_papers: number;
  year_span: number;
  first_year: number | null;
  last_year: number | null;
  total_topics: number;
  emerging_count: number;
  declining_count: number;
}

export interface TrendPublicationEntry {
  year: number;
  count: number;
  citations: number;
}

export interface TrendAnalysisData {
  publication_timeline: TrendPublicationEntry[];
  topic_trends: TrendTopicTrend[];
  emerging_topics: TrendEmergingTopic[];
  declining_topics: TrendEmergingTopic[];
  summary_stats: TrendSummaryStats;
}

export const trendsApi = {
  get: (projectId: number) =>
    api.get<TrendAnalysisData>(`/projects/${projectId}/analysis/trends`).then(r => r.data),
};

export interface GapEntry {
  topic: string;
  description: string;
  evidence: string;
  related_paper_ids: number[];
  gap_score: number;
}

export interface GapResearchQuestion {
  question: string;
  addresses_gap: string;
  novelty_score: number;
  feasibility_score: number;
}

export interface GapSummary {
  total_gaps: number;
  total_questions: number;
}

export interface GapAnalysisData {
  gaps: GapEntry[];
  research_questions: GapResearchQuestion[];
  summary: GapSummary;
}

export const gapApi = {
  analyze: (projectId: number) =>
    api.post<GapAnalysisData>(`/projects/${projectId}/analysis/gaps`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Paper Version Tracking API
// ---------------------------------------------------------------------------

export interface PaperVersionEntry {
  id: number;
  paper_id: number;
  version: number;
  source: string;
  doi: string | null;
  title: string;
  abstract: string;
  authors: unknown[] | null;
  journal: string;
  year: number | null;
  citation_count: number;
  pdf_url: string | null;
  is_preprint: boolean;
  preprint_server: string | null;
  diff_summary: string | null;
  created_at: string | null;
}

export interface VersionHistoryData {
  versions: PaperVersionEntry[];
  total: number;
}

export interface VersionUpgradeResult {
  paper_id: number;
  upgraded_to_version: number;
  new_doi: string | null;
  new_journal: string;
  preserved_fields: string[];
}

export const versionTrackingApi = {
  getVersions: (projectId: number, paperId: number) =>
    api.get<VersionHistoryData>(`/projects/${projectId}/papers/${paperId}/versions`).then(r => r.data),

  checkForUpdates: (projectId: number, paperId: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/papers/${paperId}/versions/check`).then(r => r.data),

  upgradeToVersion: (projectId: number, paperId: number, versionId: number) =>
    api.post<VersionUpgradeResult>(
      `/projects/${projectId}/papers/${paperId}/versions/${versionId}/upgrade`,
    ).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Impact Score API
// ---------------------------------------------------------------------------

export interface ImpactFactor {
  raw?: number | null;
  year?: number | null;
  name?: string | null;
  quality_tags?: string[] | null;
  normalized: number;
  percentile?: number | null;
  weight: number;
}

export interface ImpactScoreEntry {
  paper_id: number;
  title: string;
  score: number;
  factors: Record<string, ImpactFactor>;
}

export interface ImpactScoreResponse {
  scores: ImpactScoreEntry[];
  total: number;
  avg_score: number;
  top_paper_id: number | null;
}

export const impactScoresApi = {
  get: (projectId: number) =>
    api.get<ImpactScoreResponse>(`/projects/${projectId}/analysis/impact-scores`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Notifications API
// ---------------------------------------------------------------------------

export interface NotificationItem {
  id: number;
  project_id: number;
  type: string;
  title: string;
  body: string;
  paper_id: number | null;
  subscription_id: number | null;
  is_read: boolean;
  is_dismissed: boolean;
  created_at: string | null;
}

export interface NotificationListResponse {
  items: NotificationItem[];
  total: number;
  unread_count: number;
}

export const notificationsApi = {
  list: (projectId: number, unreadOnly?: boolean) =>
    api.get<NotificationListResponse>(`/projects/${projectId}/notifications`, {
      params: unreadOnly ? { unread_only: true } : {},
    }).then(r => r.data),

  markRead: (projectId: number, notificationId: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/notifications/${notificationId}/read`).then(r => r.data),

  markAllRead: (projectId: number) =>
    api.post<Record<string, unknown>>(`/projects/${projectId}/notifications/mark-all-read`).then(r => r.data),

  dismiss: (projectId: number, notificationId: number) =>
    api.delete<Record<string, unknown>>(`/projects/${projectId}/notifications/${notificationId}`).then(r => r.data),
};

// ---------------------------------------------------------------------------
// Notes Aggregation API
// ---------------------------------------------------------------------------

export interface PaperNote {
  paper_id: number;
  title: string;
  authors: Record<string, unknown>[];
  year: number | null;
  journal: string | null;
  notes: string;
  reading_status: string;
  updated_at: string | null;
}

export interface NotesAggregationResponse {
  total_papers: number;
  papers_with_notes: number;
  total_notes: number;
  notes: PaperNote[];
}

export const notesApi = {
  aggregate: (projectId: number, search?: string) =>
    api
      .get<NotesAggregationResponse>(`/projects/${projectId}/papers/notes/aggregate`, {
        params: search ? { search } : {},
      })
      .then(r => r.data),
};
