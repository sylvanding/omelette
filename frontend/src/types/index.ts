/**
 * Shared TypeScript types matching backend Pydantic schemas.
 */

export interface Project {
  id: number;
  name: string;
  description: string;
  domain: string;
  settings: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  paper_count: number;
  keyword_count: number;
}

export interface Paper {
  id: number;
  project_id: number;
  doi: string | null;
  title: string;
  abstract: string;
  authors: Author[] | null;
  journal: string;
  year: number | null;
  citation_count: number;
  source: string;
  source_id: string;
  pdf_path: string;
  pdf_url: string;
  status: PaperStatus;
  tags: string[] | null;
  notes: string;
  created_at: string;
  updated_at: string;
}

export interface Author {
  name: string;
  affiliation?: string;
}

export type PaperStatus = 'pending' | 'metadata_only' | 'pdf_downloaded' | 'ocr_complete' | 'indexed' | 'error';

export interface Keyword {
  id: number;
  project_id: number;
  term: string;
  term_en: string;
  level: 1 | 2 | 3;
  category: string;
  parent_id: number | null;
  synonyms: string;
  created_at: string;
  children: Keyword[];
}

export interface Task {
  id: number;
  project_id: number;
  task_type: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  total: number;
  created_at: string;
}
