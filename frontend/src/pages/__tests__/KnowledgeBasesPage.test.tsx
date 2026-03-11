import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderWithProviders, screen, waitFor } from '@/test/utils';
import { server } from '@/test/mocks/server';
import KnowledgeBasesPage from '../KnowledgeBasesPage';

function mockResponse<T>(data: T) {
  return {
    code: 200,
    message: 'ok',
    data,
    timestamp: new Date().toISOString(),
  };
}

describe('KnowledgeBasesPage', () => {
  it('should render the knowledge bases list from MSW mock', async () => {
    renderWithProviders(<KnowledgeBasesPage />);

    await waitFor(() => {
      expect(screen.getByText('Test KB')).toBeInTheDocument();
    });
    expect(screen.getByText('Another KB')).toBeInTheDocument();
  });

  it('should show empty state when no projects exist', async () => {
    server.use(
      http.get('/api/v1/projects', () =>
        HttpResponse.json(
          mockResponse({
            items: [],
            total: 0,
            page: 1,
            page_size: 100,
            total_pages: 1,
          }),
        ),
      ),
    );

    renderWithProviders(<KnowledgeBasesPage />);

    await waitFor(() => {
      expect(screen.getByText('No knowledge bases yet')).toBeInTheDocument();
    });
    expect(screen.getByText('Create your first knowledge base to manage literature')).toBeInTheDocument();
  });
});
