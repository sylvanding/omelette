/**
 * Mock data fixtures for tests. Values match types in src/types/index.ts and src/types/chat.ts.
 */

import type { Project, Paper, Keyword, Task, ActivityLog } from '@/types';
import type { Conversation } from '@/types/chat';
import type { Subscription } from '@/services/subscription-api';

const now = new Date().toISOString();

export const mockProject: Project = {
  id: 1,
  name: 'Test KB',
  description: 'A test knowledge base',
  domain: 'research',
  settings: null,
  created_at: now,
  updated_at: now,
  paper_count: 5,
  keyword_count: 3,
};

export const mockProject2: Project = {
  id: 2,
  name: 'Another KB',
  description: '',
  domain: '',
  settings: null,
  created_at: now,
  updated_at: now,
  paper_count: 0,
  keyword_count: 0,
};

export const mockProjectList = {
  items: [mockProject, mockProject2],
  total: 2,
  page: 1,
  page_size: 100,
  total_pages: 1,
};

export const mockPaper: Paper = {
  id: 1,
  project_id: 1,
  doi: '10.1234/example',
  title: 'Test Paper',
  abstract: 'Test abstract content',
  authors: [{ name: 'Jane Doe', affiliation: 'Test University' }],
  journal: 'Test Journal',
  year: 2024,
  citation_count: 10,
  source: 'semantic_scholar',
  source_id: 'ss-123',
  pdf_path: '/papers/1.pdf',
  pdf_url: 'https://example.com/paper.pdf',
  status: 'indexed',
  tags: ['test'],
  notes: '',
  reading_status: 'unread',
  read_at: null,
  rating: 0,
  quality_tags: null,
  created_at: now,
  updated_at: now,
};

export const mockPaperList = {
  items: [mockPaper],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

export const mockConversation: Conversation = {
  id: 1,
  title: 'Test Conversation',
  knowledge_base_ids: [1],
  model: 'mock-model',
  tool_mode: 'qa',
  created_at: now,
  updated_at: now,
  messages: [],
};

export const mockConversationList = {
  items: [mockConversation],
  total: 1,
  page: 1,
  page_size: 20,
  total_pages: 1,
};

export const mockKeyword: Keyword = {
  id: 1,
  project_id: 1,
  term: '机器学习',
  term_en: 'machine learning',
  level: 1,
  category: 'method',
  parent_id: null,
  synonyms: 'ML',
  created_at: now,
  children: [],
};

export const mockKeywordList: Keyword[] = [mockKeyword];

export const mockSettings: Record<string, unknown> = {
  llm_provider: 'mock',
  model_name: 'mock-model',
  temperature: 0.7,
};

export const mockSubscription: Subscription = {
  id: 1,
  project_id: 1,
  name: 'Test Subscription',
  query: 'machine learning',
  sources: ['semantic_scholar'],
  frequency: 'weekly',
  max_results: 50,
  is_active: true,
  last_run_at: now,
  total_found: 10,
  created_at: now,
  updated_at: now,
};

export const mockSubscriptionList: Subscription[] = [mockSubscription];

export const mockTask: Task = {
  id: 1,
  project_id: 1,
  task_type: 'index',
  status: 'completed',
  progress: 100,
  total: 100,
  created_at: now,
};

export const mockTaskList: Task[] = [mockTask];

export const mockActivityLog: ActivityLog = {
  id: 1,
  project_id: 1,
  action: 'paper_created',
  entity_type: 'paper',
  entity_id: 1,
  actor: 'system',
  details: { title: 'Test Paper' },
  created_at: now,
};

const mockActivityLog2: ActivityLog = {
  id: 2,
  project_id: 1,
  action: 'note_updated',
  entity_type: 'paper',
  entity_id: 1,
  actor: 'user',
  details: { title: 'Test Paper' },
  created_at: new Date(Date.now() - 3600_000).toISOString(),
};

export const mockActivityLogList = {
  items: [mockActivityLog, mockActivityLog2],
  total: 2,
  page: 1,
  page_size: 20,
  total_pages: 1,
};
