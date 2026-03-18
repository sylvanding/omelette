import { api } from '@/lib/api';

export interface SearchPipelineRequest {
  project_id: number;
  query: string;
  sources?: string[];
  max_results?: number;
}

export interface UploadPipelineRequest {
  project_id: number;
  pdf_paths: string[];
}

export interface ResolvedConflict {
  conflict_id: string;
  action: 'keep_old' | 'keep_new' | 'merge' | 'skip';
  merged_paper?: Record<string, unknown>;
  new_paper?: Record<string, unknown>;
}

export interface PipelineStatus {
  thread_id: string;
  status: string;
  stage?: string;
  progress?: number;
  result?: Record<string, unknown>;
}

export const pipelineApi = {
  list: (status?: string) =>
    api.get<PipelineStatus[]>('/pipelines', { params: status ? { status } : {} }).then(r => r.data),
  startSearch: (data: SearchPipelineRequest) =>
    api.post<{ thread_id: string }>('/pipelines/search', data).then(r => r.data),
  startUpload: (data: UploadPipelineRequest) =>
    api.post<{ thread_id: string }>('/pipelines/upload', data).then(r => r.data),
  getStatus: (threadId: string) =>
    api.get<PipelineStatus>(`/pipelines/${threadId}/status`).then(r => r.data),
  resume: (threadId: string, resolvedConflicts: ResolvedConflict[]) =>
    api.post<{ status: string }>(`/pipelines/${threadId}/resume`, { resolved_conflicts: resolvedConflicts }).then(r => r.data),
  cancel: (threadId: string) =>
    api.post<{ status: string }>(`/pipelines/${threadId}/cancel`).then(r => r.data),
};
