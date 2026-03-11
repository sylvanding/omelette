import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { projectApi } from '../api';

describe('projectApi', () => {
  it('should fetch project list and return typed data', async () => {
    const result = await projectApi.list(1, 20);

    expect(result).toHaveProperty('items');
    expect(result).toHaveProperty('total', 2);
    expect(result).toHaveProperty('page', 1);
    expect(result).toHaveProperty('page_size', 100);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: 1,
      name: 'Test KB',
      description: 'A test knowledge base',
      paper_count: 5,
    });
  });

  it('should handle 404 errors by rejecting with Error', async () => {
    server.use(
      http.get('/api/v1/projects', () =>
        HttpResponse.json({ message: 'Not found' }, { status: 404 }),
      ),
    );

    await expect(projectApi.list(1, 20)).rejects.toThrow('Not found');
  });
});
