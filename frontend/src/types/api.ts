/**
 * Shared API types — synced with backend Pydantic schemas.
 */

export type PaperStatus = 'pending' | 'metadata_only' | 'pdf_downloaded' | 'ocr_complete' | 'indexed' | 'error';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
export type SubscriptionFrequency = 'daily' | 'weekly' | 'monthly';
export type RewriteStyle = 'simplify' | 'academic' | 'translate_en' | 'translate_zh' | 'custom';

export interface PaginationParams {
  page?: number;
  page_size?: number;
}

export interface PaperListFilters extends PaginationParams {
  q?: string;
  status?: PaperStatus;
  year?: number;
  sort_by?: string;
  order?: 'asc' | 'desc';
}

export type SSEEvent =
  | { event: 'progress'; data: { stage?: string; percent?: number; message?: string } }
  | { event: 'complete'; data: { indexed?: number; collection?: string; papers_updated?: number } }
  | { event: 'error'; data: { code?: number; message: string; detail?: string } }
  | { event: string; data: Record<string, unknown> };

export type PipelineWSMessage =
  | {
      type: 'status';
      status: 'running' | 'interrupted' | 'completed' | 'failed' | 'cancelled';
      thread_id?: string;
      stage?: string;
      progress?: number;
    }
  | {
      type: 'error';
      message: string;
    };

export interface SearchExecuteRequest {
  query?: string;
  sources?: string[];
  max_results?: number;
  year_from?: number;
  year_to?: number;
  auto_import?: boolean;
}
