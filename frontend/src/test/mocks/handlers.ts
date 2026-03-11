import { http, HttpResponse } from 'msw';
import {
  mockProject,
  mockProject2,
  mockProjectList,
  mockPaper,
  mockPaperList,
  mockConversation,
  mockConversationList,
  mockKeyword,
  mockKeywordList,
  mockSettings,
  mockSubscription,
  mockSubscriptionList,
  mockTaskList,
} from '@/test/fixtures';

const apiBase = '/api/v1';

const mockResponse = <T>(data: T) => ({
  code: 200,
  message: 'ok',
  data,
  timestamp: new Date().toISOString(),
});

export const handlers = [
  // Projects
  http.get(`${apiBase}/projects`, () =>
    HttpResponse.json(mockResponse(mockProjectList)),
  ),
  http.get(`${apiBase}/projects/:id`, ({ params }) =>
    HttpResponse.json(
      mockResponse(
        params.id === '1' ? mockProject : { ...mockProject2, id: Number(params.id) },
      ),
    ),
  ),
  http.post(`${apiBase}/projects`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        id: 99,
        name: body.name,
        description: body.description ?? '',
        domain: body.domain ?? '',
        settings: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        paper_count: 0,
        keyword_count: 0,
      }),
    );
  }),
  http.put(`${apiBase}/projects/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        ...mockProject,
        id: Number(params.id),
        ...body,
      }),
    );
  }),
  http.delete(`${apiBase}/projects/:id`, () =>
    HttpResponse.json(mockResponse(null)),
  ),

  // Papers
  http.get(`${apiBase}/projects/:id/papers`, () =>
    HttpResponse.json(mockResponse(mockPaperList)),
  ),
  http.post(`${apiBase}/projects/:id/papers`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        ...mockPaper,
        id: 100,
        project_id: Number(params.id),
        title: (body.title as string) ?? 'New Paper',
        abstract: (body.abstract as string) ?? '',
        authors: body.authors ?? null,
        doi: body.doi ?? null,
        year: body.year ?? null,
        journal: (body.journal as string) ?? '',
        source: (body.source as string) ?? '',
        source_id: (body.source_id as string) ?? '',
        pdf_path: (body.pdf_path as string) ?? '',
        pdf_url: (body.pdf_url as string) ?? '',
        status: 'pending',
        tags: body.tags ?? null,
        notes: (body.notes as string) ?? '',
        citation_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
  }),
  http.delete(`${apiBase}/projects/:id/papers/:paperId`, () =>
    HttpResponse.json(mockResponse(null)),
  ),
  http.post(`${apiBase}/projects/:id/papers/bulk`, async ({ request }) => {
    const body = (await request.json()) as { papers?: unknown[] };
    return HttpResponse.json(
      mockResponse({ imported: body.papers?.length ?? 0 }),
    );
  }),
  http.post(`${apiBase}/projects/:id/papers/upload`, async ({ request }) => {
    const formData = await request.formData();
    const files = formData.getAll('files');
    return HttpResponse.json(
      mockResponse({
        papers: [],
        conflicts: [],
        total_uploaded: files.length,
      }),
    );
  }),

  // Keywords
  http.get(`${apiBase}/projects/:id/keywords`, () =>
    HttpResponse.json(mockResponse(mockKeywordList)),
  ),
  http.post(`${apiBase}/projects/:id/keywords`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        ...mockKeyword,
        id: 100,
        project_id: Number(params.id),
        term: (body.term as string) ?? '',
        term_en: (body.term_en as string) ?? '',
        level: (body.level as 1 | 2 | 3) ?? 1,
        category: (body.category as string) ?? '',
        parent_id: (body.parent_id as number) ?? null,
        synonyms: (body.synonyms as string) ?? '',
        created_at: new Date().toISOString(),
        children: [],
      }),
    );
  }),
  http.put(`${apiBase}/projects/:id/keywords/:keywordId`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({ ...mockKeyword, ...body }),
    );
  }),
  http.delete(`${apiBase}/projects/:id/keywords/:keywordId`, () =>
    HttpResponse.json(mockResponse(null)),
  ),
  http.post(`${apiBase}/projects/:id/keywords/expand`, async ({ request }) => {
    const body = (await request.json()) as { seed_terms?: string[] };
    const terms = body.seed_terms ?? ['machine learning'];
    return HttpResponse.json(
      mockResponse({
        expanded_terms: [...terms, 'deep learning', 'neural networks'],
      }),
    );
  }),
  http.get(`${apiBase}/projects/:id/keywords/search-formula`, () =>
    HttpResponse.json(
      mockResponse({ formula: '(machine learning) OR (deep learning)' }),
    ),
  ),

  // Search
  http.post(`${apiBase}/projects/:id/search/execute`, () =>
    HttpResponse.json(
      mockResponse({
        papers: mockPaperList.items,
        imported: 1,
        created: 0,
      }),
    ),
  ),
  http.get(`${apiBase}/projects/:id/search/sources`, () =>
    HttpResponse.json(
      mockResponse([
        { id: 'semantic_scholar', name: 'Semantic Scholar', status: 'ok' },
        { id: 'openalex', name: 'OpenAlex', status: 'ok' },
      ]),
    ),
  ),

  // RAG
  http.post(`${apiBase}/projects/:id/rag/query`, async ({ request }) => {
    const body = (await request.json()) as { question?: string };
    return HttpResponse.json(
      mockResponse({
        answer: `Mock answer for: ${body.question ?? 'unknown'}`,
        sources: [],
      }),
    );
  }),
  http.get(`${apiBase}/projects/:id/rag/stats`, () =>
    HttpResponse.json(
      mockResponse({
        document_count: 5,
        chunk_count: 50,
      }),
    ),
  ),

  // Writing
  http.post(`${apiBase}/projects/:id/writing/summarize`, async ({ request }) => {
    const body = (await request.json()) as { paper_ids?: number[] };
    const count = body.paper_ids?.length ?? 0;
    return HttpResponse.json(
      mockResponse({
        summaries: Array.from({ length: count }, (_, i) => ({
          title: `Summary ${i + 1}`,
          summary: `Mock summary for paper ${i + 1}.`,
        })),
      }),
    );
  }),
  http.post(`${apiBase}/projects/:id/writing/citations`, async ({ request }) => {
    const body = (await request.json()) as { paper_ids?: number[] };
    const count = body.paper_ids?.length ?? 0;
    return HttpResponse.json(
      mockResponse({
        citations: Array.from({ length: count }, (_, i) => ({
          citation: `[${i + 1}] Doe, J. (2024). Paper ${i + 1}. Test Journal.`,
        })),
      }),
    );
  }),
  http.post(`${apiBase}/projects/:id/writing/review-outline`, async ({ request }) => {
    const body = (await request.json()) as { topic?: string };
    return HttpResponse.json(
      mockResponse({
        outline: `# Review Outline: ${body.topic ?? 'topic'}\n\n1. Introduction\n2. Methods\n3. Results\n4. Discussion`,
      }),
    );
  }),
  http.post(`${apiBase}/projects/:id/writing/gap-analysis`, async ({ request }) => {
    const body = (await request.json()) as { research_topic?: string };
    return HttpResponse.json(
      mockResponse({
        analysis: `Gap analysis for: ${body.research_topic ?? 'topic'}\n\nIdentified gaps: ...`,
      }),
    );
  }),

  // Tasks
  http.get(`${apiBase}/tasks`, () =>
    HttpResponse.json(mockResponse(mockTaskList)),
  ),
  http.get(`${apiBase}/tasks/:taskId`, () =>
    HttpResponse.json(mockResponse(mockTaskList[0])),
  ),

  // Conversations
  http.get(`${apiBase}/conversations`, () =>
    HttpResponse.json(mockResponse(mockConversationList)),
  ),
  http.get(`${apiBase}/conversations/:id`, ({ params }) =>
    HttpResponse.json(
      mockResponse({ ...mockConversation, id: Number(params.id) }),
    ),
  ),
  http.post(`${apiBase}/conversations`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        id: 99,
        title: (body.title as string) ?? 'New Conversation',
        knowledge_base_ids: (body.knowledge_base_ids as number[]) ?? [],
        model: body.model ?? null,
        tool_mode: (body.tool_mode as string) ?? 'qa',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        messages: [],
      }),
    );
  }),
  http.put(`${apiBase}/conversations/:id`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({ ...mockConversation, ...body }),
    );
  }),
  http.delete(`${apiBase}/conversations/:id`, () =>
    HttpResponse.json(mockResponse(null)),
  ),

  // Settings
  http.get(`${apiBase}/settings`, () =>
    HttpResponse.json(mockResponse(mockSettings)),
  ),
  http.put(`${apiBase}/settings`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(mockResponse({ ...mockSettings, ...body }));
  }),
  http.post(`${apiBase}/settings/test-connection`, () =>
    HttpResponse.json(mockResponse({ success: true })),
  ),
  http.get(`${apiBase}/settings/models`, () =>
    HttpResponse.json(
      mockResponse({ models: [{ id: 'mock-model', name: 'Mock Model' }] }),
    ),
  ),

  // Subscriptions
  http.get(`${apiBase}/projects/:id/subscriptions`, () =>
    HttpResponse.json(mockResponse(mockSubscriptionList)),
  ),
  http.post(`${apiBase}/projects/:id/subscriptions`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        ...mockSubscription,
        id: 99,
        project_id: Number(params.id),
        name: (body.name as string) ?? 'New Subscription',
        query: (body.query as string) ?? '',
        sources: (body.sources as string[]) ?? [],
        frequency: (body.frequency as string) ?? 'weekly',
        max_results: (body.max_results as number) ?? 50,
        is_active: true,
        last_run_at: null,
        total_found: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }),
    );
  }),
  http.put(`${apiBase}/projects/:id/subscriptions/:subId`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({ ...mockSubscription, ...body }),
    );
  }),
  http.delete(`${apiBase}/projects/:id/subscriptions/:subId`, () =>
    HttpResponse.json(mockResponse(null)),
  ),
  http.post(`${apiBase}/projects/:id/subscriptions/:subId/trigger`, () =>
    HttpResponse.json(mockResponse({ status: 'triggered' })),
  ),

  // Dedup
  http.post(`${apiBase}/projects/:id/dedup/resolve`, () =>
    HttpResponse.json(mockResponse({ resolved: true })),
  ),
  http.post(`${apiBase}/projects/:id/dedup/auto-resolve`, async ({ request }) => {
    const body = (await request.json()) as { conflict_ids?: string[] };
    return HttpResponse.json(
      mockResponse({ resolved: body.conflict_ids?.length ?? 0 }),
    );
  }),

  // OCR
  http.post(`${apiBase}/projects/:id/ocr/process`, () =>
    HttpResponse.json(mockResponse({ processed: 1 })),
  ),
  http.get(`${apiBase}/projects/:id/ocr/stats`, () =>
    HttpResponse.json(
      mockResponse({ total: 5, processed: 5, pending: 0 }),
    ),
  ),

  // RAG index (for completeness)
  http.post(`${apiBase}/projects/:id/rag/index`, () =>
    HttpResponse.json(mockResponse({ status: 'started' })),
  ),
];
