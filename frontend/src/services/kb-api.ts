import { api } from '@/lib/api';
import type { Paper } from '@/types';

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
  new_paper: Record<string, unknown>;
  reason: string;
  similarity: number | null;
}

export interface UploadResult {
  papers: NewPaperData[];
  conflicts: DedupConflictPair[];
  total_uploaded: number;
}

export const kbApi = {
  uploadPdfs: (projectId: number, files: File[]) => {
    const formData = new FormData();
    files.forEach((f) => formData.append('files', f));
    return api.post<UploadResult>(`/projects/${projectId}/papers/upload`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 120000,
    }).then(r => r.data);
  },

  resolveConflict: (
    projectId: number,
    conflictId: string,
    action: string,
    mergedPaper?: Record<string, unknown>
  ) =>
    api.post<{ resolved: boolean }>(`/projects/${projectId}/dedup/resolve`, {
      conflict_id: conflictId,
      action,
      merged_paper: mergedPaper,
    }).then(r => r.data),

  autoResolve: (projectId: number, conflictIds: string[]) =>
    api.post<Array<{ conflict_id: string; action: string; reason: string; error?: string }>>(`/projects/${projectId}/dedup/auto-resolve`, {
      conflict_ids: conflictIds,
    }).then(r => r.data),

  searchAndAdd: (
    projectId: number,
    query: string,
    sources: string[],
    maxResults: number
  ) =>
    api.post<{ papers: Paper[]; imported: number }>(`/projects/${projectId}/search/execute`, {
      query,
      sources,
      max_results: maxResults,
      auto_import: false,
    }).then(r => r.data),

  bulkImport: (projectId: number, papers: NewPaperData[]) =>
    api.post<{ created: number; skipped: number; total: number }>(`/projects/${projectId}/papers/bulk`, { papers }).then(r => r.data),
};
