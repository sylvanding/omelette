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
  mockActivityLogList,
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
  http.put(`${apiBase}/projects/:id/papers/:paperId`, async ({ request, params }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        ...mockPaper,
        id: Number(params.paperId),
        project_id: Number(params.id),
        ...body,
        updated_at: new Date().toISOString(),
      }),
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
    const body = (await request.json()) as { paper_ids?: number[]; style?: string };
    const count = body.paper_ids?.length ?? 0;
    const style = body.style ?? 'gb_t_7714';
    const styleTemplates: Record<string, (i: number) => string> = {
      apa: (i) => `Doe, J., Smith, A., & Wang, L. (2024). Paper ${i + 1}. Test Journal, 15(3), 100-120.`,
      mla: (i) => `Doe, John, et al. "Paper ${i + 1}." Test Journal, vol. 15, no. 3, 2024, pp. 100-120.`,
      chicago: (i) => `Doe, John, Alice Smith, and Li Wang. "Paper ${i + 1}." Test Journal 15, no. 3 (2024): 100-120.`,
      ieee: (i) => `J. Doe, A. Smith, and L. Wang, "Paper ${i + 1}," Test Journal, vol. 15, no. 3, pp. 100-120, 2024.`,
      gb_t_7714: (i) => `Doe J, Smith A, Wang L. Paper ${i + 1}[J]. Test Journal, 2024, 15(3): 100-120.`,
    };
    const formatter = styleTemplates[style] ?? styleTemplates.gb_t_7714;
    return HttpResponse.json(
      mockResponse({
        citations: Array.from({ length: count }, (_, i) => ({
          citation: formatter(i),
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
    HttpResponse.json(
      mockResponse({
        items: mockSubscriptionList,
        total: mockSubscriptionList.length,
        page: 1,
        page_size: 20,
        total_pages: 1,
      }),
    ),
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

  // Paper analytics
  http.get(`${apiBase}/projects/:id/papers/analytics`, () =>
    HttpResponse.json(
      mockResponse({
        total: 1,
        by_status: { unread: 1, reading: 0, read: 0, archived: 0 },
        read_by_week: {},
        top_journals: [{ journal: 'Test Journal', count: 1 }],
      }),
    ),
  ),

  // Paper similar / related
  http.get(`${apiBase}/projects/:id/papers/:paperId/similar`, () =>
    HttpResponse.json(
      mockResponse([
        {
          id: 2,
          title: 'Related Paper One',
          authors: ['Author A', 'Author B'],
          year: 2023,
          journal: 'Related Journal',
          citation_count: 25,
          similarity_score: 92.5,
        },
        {
          id: 3,
          title: 'Related Paper Two',
          authors: ['Author C'],
          year: 2022,
          journal: 'Another Journal',
          citation_count: 15,
          similarity_score: 78.3,
        },
      ]),
    ),
  ),

  // Paper compare
  http.post(`${apiBase}/projects/:id/papers/compare`, async ({ request }) => {
    const body = (await request.json()) as { paper_ids?: number[]; focus?: string };
    const ids = body.paper_ids ?? [1, 2];
    return HttpResponse.json(
      mockResponse({
        papers: ids.map((id, i) => ({
          id,
          title: `Paper ${id} - Title ${i + 1}`,
          authors: [{ name: `Author ${i + 1}` }],
          year: 2024 - i,
          journal: 'Test Journal',
          citation_count: 10 * (i + 1),
        })),
        dimensions: [
          {
            dimension: 'research_question',
            cells: ids.map((id, i) => ({
              paper_id: id,
              content: `Paper ${id} investigates research question ${i + 1}.`,
            })),
          },
          {
            dimension: 'method',
            cells: ids.map((id, i) => ({
              paper_id: id,
              content: `Paper ${id} uses method ${i + 1}.`,
            })),
          },
          {
            dimension: 'dataset',
            cells: ids.map((id) => ({
              paper_id: id,
              content: `Dataset used in paper ${id}.`,
            })),
          },
          {
            dimension: 'key_results',
            cells: ids.map((id, i) => ({
              paper_id: id,
              content: `Paper ${id} found result ${i + 1}.`,
            })),
          },
          {
            dimension: 'limitations',
            cells: ids.map((id) => ({
              paper_id: id,
              content: `Limitations of paper ${id}.`,
            })),
          },
          {
            dimension: 'year',
            cells: ids.map((id, i) => ({
              paper_id: id,
              content: String(2024 - i),
            })),
          },
          {
            dimension: 'citation_count',
            cells: ids.map((id, i) => ({
              paper_id: id,
              content: String(10 * (i + 1)),
            })),
          },
        ],
        summary: 'Mock AI-generated comparison summary highlighting differences between the selected papers.',
      }),
    );
  }),

  // Activities
  http.get(`${apiBase}/projects/:id/activities`, () =>
    HttpResponse.json(mockResponse(mockActivityLogList)),
  ),

  // Audio Overviews
  http.post(`${apiBase}/projects/:id/audio-overviews`, () =>
    HttpResponse.json(
      mockResponse({
        title: 'Audio Overview',
        duration_estimate: '1 min',
        summary: 'Mock audio overview summary.',
        script: [
          { speaker: 'Alex', text: 'Welcome to our discussion.' },
          { speaker: 'Jordan', text: "Today we're exploring key findings." },
        ],
        paper_count: 2,
      }),
    ),
  ),
  http.get(`${apiBase}/projects/:id/audio-overviews`, () =>
    HttpResponse.json(
      mockResponse({
        items: [
          {
            id: 1,
            title: 'Introduction to Machine Learning',
            summary: 'A discussion of fundamental ML concepts and applications.',
            duration_estimate: '5 min',
            tone: 'conversational',
            paper_count: 3,
            paper_ids: [1, 2, 3],
            created_at: new Date().toISOString(),
          },
          {
            id: 2,
            title: 'Deep Learning Advances',
            summary: 'Exploring recent breakthroughs in neural network architectures.',
            duration_estimate: '8 min',
            tone: 'formal',
            paper_count: 5,
            paper_ids: [4, 5, 6, 7, 8],
            created_at: new Date().toISOString(),
          },
        ],
        total: 2,
      }),
    ),
  ),
  http.delete(`${apiBase}/projects/:id/audio-overviews/:overviewId`, () =>
    HttpResponse.json(mockResponse({ deleted: true })),
  ),

  // Browser Upload
  http.post(`${apiBase}/projects/:id/upload/browser`, ({ request }) => {
    const url = new URL(request.url);
    const title = url.searchParams.get('title') || 'Captured Paper';
    return HttpResponse.json(
      mockResponse({
        status: 'captured',
        paper_id: 101,
        title,
        processing: true,
      }),
    );
  }),

  // Reference Manager Export
  http.post(`${apiBase}/projects/:id/export/bibtex`, () =>
    HttpResponse.text('@article{Smith2024Test,\n  title = {Test Paper},\n  author = {Smith, John},\n  year = {2024},\n}'),
  ),
  http.post(`${apiBase}/projects/:id/export/ris`, () =>
    HttpResponse.text('TY  - JOUR\nTI  - Test Paper\nAU  - Smith, John\nPY  - 2024\nER  - '),
  ),
  http.post(`${apiBase}/projects/:id/export/zotero`, async ({ request }) => {
    const body = (await request.json()) as { collection_name?: string };
    return HttpResponse.json(
      mockResponse({
        preview: '@article{Smith2024Test,\n  title = {Test Paper},\n  author = {Smith, John},\n  year = {2024},\n}',
        message: body.collection_name ? `Created collection "${body.collection_name}" (demo mode)` : 'Zotero credentials not configured. Import the BibTeX preview manually.',
        paper_count: 1,
        items_created: 0,
        errors: [],
      }),
    );
  }),

  // Team Members
  http.get(`${apiBase}/projects/:id/members`, () =>
    HttpResponse.json(
      mockResponse([
        {
          id: 1,
          email: 'owner@example.com',
          role: 'owner',
          status: 'active',
          invited_by: null,
          created_at: new Date().toISOString(),
        },
      ]),
    ),
  ),
  http.post(`${apiBase}/projects/:id/members`, async ({ request }) => {
    const body = (await request.json()) as { email?: string; role?: string };
    return HttpResponse.json(
      mockResponse({
        id: 99,
        email: body.email ?? 'new@example.com',
        role: body.role ?? 'viewer',
        status: 'active',
        invited_by: null,
        created_at: new Date().toISOString(),
      }),
    );
  }),
  http.put(`${apiBase}/projects/:id/members/:memberId`, async ({ request }) => {
    const body = (await request.json()) as { role?: string };
    return HttpResponse.json(
      mockResponse({
        id: 99,
        email: 'updated@example.com',
        role: body.role ?? 'viewer',
        status: 'active',
        invited_by: null,
        created_at: new Date().toISOString(),
      }),
    );
  }),
  http.delete(`${apiBase}/projects/:id/members/:memberId`, () =>
    HttpResponse.json(mockResponse(null)),
  ),

  // API Keys
  http.get(`${apiBase}/api-keys`, () =>
    HttpResponse.json(
      mockResponse([
        {
          id: 1,
          name: 'My API Key',
          key_prefix: 'omk_ab12',
          scope: 'read',
          is_active: true,
          last_used_at: null,
          created_at: new Date().toISOString(),
        },
      ]),
    ),
  ),
  http.post(`${apiBase}/api-keys`, async ({ request }) => {
    const body = (await request.json()) as { name?: string; scope?: string };
    return HttpResponse.json(
      mockResponse({
        id: 99,
        name: body.name ?? 'New Key',
        key: 'omk_test' + Math.random().toString(36).slice(2, 34),
        key_prefix: 'omk_test',
        scope: body.scope ?? 'read',
        is_active: true,
        created_at: new Date().toISOString(),
      }),
    );
  }),
  http.post(`${apiBase}/api-keys/:keyId/revoke`, () =>
    HttpResponse.json(
      mockResponse({
        id: 99,
        name: 'Revoked Key',
        key_prefix: 'omk_test',
        scope: 'read',
        is_active: false,
        last_used_at: null,
        created_at: new Date().toISOString(),
      }),
    ),
  ),
  http.delete(`${apiBase}/api-keys/:keyId`, () =>
    HttpResponse.json(mockResponse(null)),
  ),

  // Author Network
  http.get(`${apiBase}/projects/:id/analysis/author-network`, () =>
    HttpResponse.json(
      mockResponse({
        nodes: [
          {
            name: 'Jane Smith',
            paper_count: 5,
            paper_ids: [1, 2, 3, 4, 5],
            coauthors: ['John Doe', 'Alice Wang'],
            h_index_estimate: 2,
          },
          {
            name: 'John Doe',
            paper_count: 3,
            paper_ids: [1, 2, 6],
            coauthors: ['Jane Smith'],
            h_index_estimate: 1,
          },
          {
            name: 'Alice Wang',
            paper_count: 2,
            paper_ids: [3, 7],
            coauthors: ['Jane Smith'],
            h_index_estimate: 1,
          },
        ],
        edges: [
          { source: 'Jane Smith', target: 'John Doe', collaboration_count: 2 },
          { source: 'Jane Smith', target: 'Alice Wang', collaboration_count: 1 },
        ],
        metrics: {
          total_authors: 3,
          total_edges: 2,
          density: 0.667,
          top_authors: [
            { name: 'Jane Smith', degree: 2 },
            { name: 'John Doe', degree: 1 },
            { name: 'Alice Wang', degree: 1 },
          ],
        },
        total_authors: 3,
      }),
    ),
  ),

  // Research Trends
  http.get(`${apiBase}/projects/:id/analysis/trends`, () =>
    HttpResponse.json(
      mockResponse({
        publication_timeline: [
          { year: 2020, count: 2, citations: 80 },
          { year: 2021, count: 3, citations: 120 },
          { year: 2022, count: 5, citations: 200 },
          { year: 2023, count: 4, citations: 180 },
          { year: 2024, count: 6, citations: 250 },
        ],
        topic_trends: [
          {
            topic: 'deep learning',
            slope: 0.8,
            r_squared: 0.92,
            trend: 'rising',
            total_papers: 12,
            first_year: 2020,
            last_year: 2024,
            yearly_counts: [
              { year: 2020, count: 2 },
              { year: 2021, count: 3 },
              { year: 2022, count: 4 },
              { year: 2023, count: 2 },
              { year: 2024, count: 1 },
            ],
          },
          {
            topic: 'transformers',
            slope: 1.2,
            r_squared: 0.95,
            trend: 'rising',
            total_papers: 8,
            first_year: 2021,
            last_year: 2024,
            yearly_counts: [
              { year: 2021, count: 1 },
              { year: 2022, count: 2 },
              { year: 2023, count: 3 },
              { year: 2024, count: 2 },
            ],
          },
          {
            topic: 'reinforcement learning',
            slope: -0.3,
            r_squared: 0.65,
            trend: 'declining',
            total_papers: 4,
            first_year: 2020,
            last_year: 2024,
            yearly_counts: [
              { year: 2020, count: 2 },
              { year: 2021, count: 1 },
              { year: 2022, count: 1 },
              { year: 2023, count: 0 },
              { year: 2024, count: 0 },
            ],
          },
        ],
        emerging_topics: [
          { topic: 'transformers', yoy_growth: 0.67 },
        ],
        declining_topics: [
          { topic: 'reinforcement learning', yoy_growth: -1.0 },
        ],
        summary_stats: {
          total_papers: 20,
          year_span: 5,
          first_year: 2020,
          last_year: 2024,
          total_topics: 3,
          emerging_count: 1,
          declining_count: 1,
        },
      }),
    ),
  ),
  http.post(`${apiBase}/projects/:id/analysis/gaps`, () =>
    HttpResponse.json(
      mockResponse({
        gaps: [
          {
            topic: 'Long-term clinical outcomes',
            description: 'No papers evaluate the long-term effectiveness of the proposed methods in clinical settings.',
            evidence: 'Papers 1 and 3 focus on short-term metrics without follow-up studies.',
            related_paper_ids: [1, 3],
            gap_score: 0.82,
          },
          {
            topic: 'Cross-modal validation',
            description: 'Methods are validated only on single modalities; no cross-modal transfer studies exist.',
            evidence: 'Papers 1 and 2 each test on one modality only.',
            related_paper_ids: [1, 2],
            gap_score: 0.71,
          },
        ],
        research_questions: [
          {
            question: 'How do deep learning-based methods perform in longitudinal studies over 12+ months?',
            addresses_gap: 'Long-term clinical outcomes',
            novelty_score: 0.85,
            feasibility_score: 0.6,
          },
          {
            question: 'Can a single model achieve state-of-the-art results across multiple modalities?',
            addresses_gap: 'Cross-modal validation',
            novelty_score: 0.78,
            feasibility_score: 0.55,
          },
          {
            question: 'What is the trade-off between reconstruction quality and inference time?',
            addresses_gap: 'Cross-modal validation',
            novelty_score: 0.6,
            feasibility_score: 0.8,
          },
        ],
        summary: { total_gaps: 2, total_questions: 3 },
      }),
    ),
  ),

  // Paper Version Tracking
  http.get(`${apiBase}/projects/:id/papers/:paperId/versions`, () =>
    HttpResponse.json(
      mockResponse({
        versions: [
          {
            id: 1,
            paper_id: 1,
            version: 1,
            source: 'auto_poll',
            doi: '10.1101/2024.01.01.123456',
            title: 'A Study on Machine Learning (Preprint)',
            abstract: 'Preprint abstract.',
            authors: null,
            journal: '',
            year: 2024,
            citation_count: 5,
            pdf_url: null,
            is_preprint: true,
            preprint_server: 'bioRxiv',
            diff_summary: null,
            created_at: '2024-01-15T10:00:00Z',
          },
          {
            id: 2,
            paper_id: 1,
            version: 2,
            source: 'auto_poll',
            doi: '10.1234/journal.2024.567',
            title: 'A Study on Machine Learning',
            abstract: 'Updated journal abstract with additional details.',
            authors: null,
            journal: 'Nature Machine Intelligence',
            year: 2024,
            citation_count: 25,
            pdf_url: 'https://example.com/paper.pdf',
            is_preprint: false,
            preprint_server: null,
            diff_summary: 'Title changed; Journal: None -> Nature Machine Intelligence; Citations: 5 -> 25',
            created_at: '2024-06-20T14:30:00Z',
          },
        ],
        total: 2,
      }),
    ),
  ),
  http.post(`${apiBase}/projects/:id/papers/:paperId/versions/check`, () =>
    HttpResponse.json(
      mockResponse({
        update_found: true,
        version: {
          id: 3,
          paper_id: 1,
          version: 3,
          source: 'manual_check',
          doi: '10.1234/journal.2024.890',
          title: 'A Study on Machine Learning (Revised)',
          abstract: 'Revised abstract.',
          authors: null,
          journal: 'Nature Machine Intelligence',
          year: 2024,
          citation_count: 42,
          pdf_url: null,
          is_preprint: false,
          preprint_server: null,
          diff_summary: 'Citations: 25 -> 42',
          created_at: new Date().toISOString(),
        },
      }),
    ),
  ),
  http.post(`${apiBase}/projects/:id/papers/:paperId/versions/:versionId/upgrade`, async ({ params }) =>
    HttpResponse.json(
      mockResponse({
        paper_id: Number(params.paperId),
        upgraded_to_version: Number(params.versionId),
        new_doi: '10.1234/journal.2024.567',
        new_journal: 'Nature Machine Intelligence',
        preserved_fields: ['notes', 'tags', 'reading_status', 'read_at', 'rating', 'quality_tags', 'status'],
      }),
    ),
  ),

  // Impact Scores
  http.get(`${apiBase}/projects/:id/analysis/impact-scores`, () =>
    HttpResponse.json(
      mockResponse({
        scores: [
          {
            paper_id: 1,
            title: mockPaper.title,
            score: 72.5,
            factors: {
              citations: { raw: mockPaper.citation_count, normalized: 0.8, weight: 0.3 },
              recency: { year: mockPaper.year, normalized: 0.9, weight: 0.2 },
              journal: { name: mockPaper.journal, normalized: 0.6, weight: 0.2 },
              evidence_consensus: { quality_tags: mockPaper.quality_tags, normalized: 0.5, weight: 0.15 },
              field_percentile: { percentile: 0.75, normalized: 0.75, weight: 0.15 },
            },
          },
        ],
        total: 1,
        avg_score: 72.5,
        top_paper_id: 1,
      }),
    ),
  ),

  // Notifications
  http.get(`${apiBase}/projects/:id/notifications`, ({ request }) => {
    const url = new URL(request.url);
    const unreadOnly = url.searchParams.get('unread_only') === 'true';
    const items = [
      {
        id: 1,
        project_id: 1,
        type: 'subscription_match',
        title: 'New paper: Deep Learning in NLP',
        body: 'A new paper matching your subscription "NLP Advances" has been found.',
        paper_id: 42,
        subscription_id: 1,
        is_read: false,
        is_dismissed: false,
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 2,
        project_id: 1,
        type: 'paper_update',
        title: 'Paper version updated',
        body: 'The paper "Transformers at Scale" has been updated with a new version.',
        paper_id: 15,
        subscription_id: null,
        is_read: false,
        is_dismissed: false,
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
      {
        id: 3,
        project_id: 1,
        type: 'subscription_match',
        title: 'Weekly digest: 5 new papers',
        body: 'Your subscription "Computer Vision" found 5 new papers this week.',
        paper_id: null,
        subscription_id: 2,
        is_read: true,
        is_dismissed: false,
        created_at: new Date(Date.now() - 86400000).toISOString(),
      },
    ];
    const filteredItems = unreadOnly ? items.filter((item) => !item.is_read) : items;
    return HttpResponse.json(
      mockResponse({
        items: filteredItems,
        total: filteredItems.length,
        unread_count: items.filter((item) => !item.is_read).length,
      }),
    );
  }),
  http.post(`${apiBase}/projects/:id/notifications/:notificationId/read`, () =>
    HttpResponse.json(mockResponse({ read: true })),
  ),
  http.post(`${apiBase}/projects/:id/notifications/mark-all-read`, () =>
    HttpResponse.json(mockResponse({ marked_count: 2 })),
  ),
  http.delete(`${apiBase}/projects/:id/notifications/:notificationId`, () =>
    HttpResponse.json(mockResponse({ dismissed: true })),
  ),
];
