import api from '@/lib/api';
import type { ApiResponse } from '@/lib/api';

export interface NewPaperData {
  title: string;
  abstract?: string;
  authors?: { name: string }[];
  doi?: string;
  year?: number;
  journal?: string;
  pdf_path?: string;
  source?: string;
}

export interface DedupConflictPair {
  conflict_id: string;
  old_paper: Record<string, unknown>;
  new_paper: NewPaperData;
  reason: string;
  similarity: number | null;
}

export interface UploadResult {
  papers: NewPaperData[];
  conflicts: DedupConflictPair[];
  total_uploaded: number;
}

export const kbApi = {
  uploadPdfs: async (projectId: number, files: File[]): Promise<ApiResponse<UploadResult>> => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post(`/projects/${projectId}/papers/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    });
  },

  resolveConflict: (
    projectId: number,
    conflictId: string,
    action: string,
    mergedPaper?: Record<string, unknown>
  ) =>
    api.post(`/projects/${projectId}/dedup/resolve`, {
      conflict_id: conflictId,
      action,
      merged_paper: mergedPaper,
    }),

  autoResolve: (projectId: number, conflictIds: string[]) =>
    api.post(`/projects/${projectId}/dedup/auto-resolve`, {
      conflict_ids: conflictIds,
    }),

  searchAndAdd: (
    projectId: number,
    query: string,
    sources: string[],
    maxResults: number
  ) =>
    api.post(`/projects/${projectId}/search/execute`, null, {
      params: {
        query,
        sources,
        max_results: maxResults,
        auto_import: false,
      },
    }),

  bulkImport: (projectId: number, papers: NewPaperData[]) =>
    api.post(`/projects/${projectId}/papers/bulk`, { papers }),
};
