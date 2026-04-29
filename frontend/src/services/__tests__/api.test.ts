import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/mocks/server';
import { projectApi, paperApi } from '../api';

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

describe('paperApi.update', () => {
  it('updates paper notes and returns the updated paper', async () => {
    const result = await paperApi.update(1, 1, { notes: 'My research notes' });

    expect(result).toHaveProperty('id', 1);
    expect(result.notes).toBe('My research notes');
  });

  it('sends a PUT request to the correct endpoint', async () => {
    const result = await paperApi.update(2, 42, {
      title: 'Updated Title',
      notes: 'New notes',
    });

    expect(result.project_id).toBe(2);
    expect(result.title).toBe('Updated Title');
    expect(result.notes).toBe('New notes');
  });
});
