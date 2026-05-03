import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll } from 'vitest';
import { server } from './mocks/server';
import i18n from '@/i18n';

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  // Force English for consistent test assertions
  await i18n.changeLanguage('en');
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
});

afterAll(() => server.close());
