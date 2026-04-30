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
  reading_status: ReadingStatus;
  read_at: string | null;
  rating: number;
  quality_tags: string[] | null;
  created_at: string;
  updated_at: string;
}

export interface Author {
  name: string;
  affiliation?: string;
}

export type PaperStatus = 'pending' | 'metadata_only' | 'pdf_downloaded' | 'ocr_complete' | 'indexed' | 'error';
export type ReadingStatus = 'unread' | 'reading' | 'read' | 'archived';

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

export interface ActivityLog {
  id: number;
  project_id: number;
  action: string;
  entity_type: string;
  entity_id: number;
  actor: string;
  details: Record<string, unknown> | null;
  created_at: string;
}

export interface Collection {
  id: number;
  project_id: number;
  name: string;
  description: string;
  color: string;
  sort_order: number;
  paper_count: number;
}

export interface CollectionPaper {
  paper_id: number;
  title: string;
  doi: string | null;
  year: number | null;
  citation_count: number;
}

export interface CollectionDetail {
  collection: Collection;
  papers: CollectionPaper[];
}

export interface PaperTagSuggestion {
  paper_id: number;
  suggested_tags: string[];
}

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
