import { http, HttpResponse } from 'msw';

const apiBase = '/api/v1';

const mockResponse = <T>(data: T) => ({
  code: 200,
  message: 'ok',
  data,
  timestamp: new Date().toISOString(),
});

export const handlers = [
  http.get(`${apiBase}/projects`, () =>
    HttpResponse.json(
      mockResponse({
        items: [
          { id: 1, name: 'Test KB', description: 'A test knowledge base', paper_count: 5, keyword_count: 3 },
          { id: 2, name: 'Another KB', description: '', paper_count: 0, keyword_count: 0 },
        ],
        total: 2,
        page: 1,
        page_size: 100,
        total_pages: 1,
      }),
    ),
  ),

  http.get(`${apiBase}/conversations`, () =>
    HttpResponse.json(
      mockResponse({
        items: [],
        total: 0,
        page: 1,
        page_size: 20,
        total_pages: 1,
      }),
    ),
  ),

  http.post(`${apiBase}/projects`, async ({ request }) => {
    const body = (await request.json()) as Record<string, unknown>;
    return HttpResponse.json(
      mockResponse({
        id: 99,
        name: body.name,
        description: body.description ?? '',
        paper_count: 0,
        keyword_count: 0,
      }),
    );
  }),

  http.delete(`${apiBase}/projects/:id`, () =>
    HttpResponse.json(mockResponse({ deleted: true })),
  ),

  http.get(`${apiBase}/settings`, () =>
    HttpResponse.json(
      mockResponse({
        llm_provider: 'mock',
        model_name: 'mock-model',
        temperature: 0.7,
      }),
    ),
  ),
];
