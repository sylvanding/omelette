import { useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, Plus, Play, Download, Trash2, Edit2, Save, X } from 'lucide-react';

import { reviewsApi } from '@/services/api';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { LoadingState } from '@/components/ui/loading-state';
import { EmptyState } from '@/components/ui/empty-state';
import PageLayout from '@/components/layout/PageLayout';
import type { Review, ReviewColumn, ExtractionResult } from '@/types';

export default function ReviewsPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const queryClient = useQueryClient();
  const pid = Number(projectId!);

  const { data: reviewsData, isLoading } = useQuery({
    queryKey: ['reviews', pid],
    queryFn: () => reviewsApi.list(pid),
  });

  const reviews = reviewsData?.reviews ?? [];
  const [selectedReview, setSelectedReview] = useState<Review | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const createMutation = useToastMutation({
    mutationFn: (data: { title: string; research_question: string; columns: ReviewColumn[] }) =>
      reviewsApi.create(pid, data),
    successMessage: 'Review created',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', pid] });
      setShowCreateForm(false);
    },
  });

  const deleteMutation = useToastMutation({
    mutationFn: (reviewId: number) => reviewsApi.delete(pid, reviewId),
    successMessage: 'Review deleted',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reviews', pid] });
      setSelectedReview(null);
    },
  });

  const extractMutation = useToastMutation({
    mutationFn: (reviewId: number) => reviewsApi.extract(pid, reviewId),
    successMessage: 'Extraction complete',
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extractions', pid, selectedReview?.id] });
    },
  });

  const handleDelete = useCallback(
    (review: Review) => {
      if (window.confirm(`Delete "${review.title}"?`)) {
        deleteMutation.mutate(review.id);
      }
    },
    [deleteMutation],
  );

  return (
    <PageLayout title="Systematic Reviews">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">
              Create systematic reviews with custom extraction columns and structured data extraction from papers.
            </p>
          </div>
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            New Review
          </button>
        </div>

        {showCreateForm && (
          <CreateReviewForm
            onSubmit={(data) => createMutation.mutate(data)}
            onCancel={() => setShowCreateForm(false)}
          />
        )}

        {isLoading && <LoadingState />}

        {!isLoading && reviews.length === 0 && !showCreateForm && (
          <EmptyState
            icon={FileText}
            title="No reviews yet"
            description="Create your first systematic review to start extracting structured data from papers."
          />
        )}

        {!isLoading && reviews.length > 0 && (
          <div className="space-y-4">
            {reviews.map((review) => (
              <ReviewCard
                key={review.id}
                review={review}
                onSelect={() => setSelectedReview(review)}
                onDelete={() => handleDelete(review)}
                isSelected={selectedReview?.id === review.id}
              />
            ))}
          </div>
        )}

        {selectedReview && (
          <ReviewDetail
            review={selectedReview}
            onExtract={() => extractMutation.mutate(selectedReview.id)}
            isExtracting={extractMutation.isPending}
          />
        )}
      </div>
    </PageLayout>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface CreateReviewFormProps {
  onSubmit: (data: { title: string; research_question: string; columns: ReviewColumn[] }) => void;
  onCancel: () => void;
}

function CreateReviewForm({ onSubmit, onCancel }: CreateReviewFormProps) {
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [columns, setColumns] = useState<ReviewColumn[]>([
    { name: 'sample_size', description: 'Number of participants or samples' },
    { name: 'methodology', description: 'Study design or methodology used' },
    { name: 'key_findings', description: 'Main results or findings' },
  ]);
  const [editingColumn, setEditingColumn] = useState<number | null>(null);

  const addColumn = () => {
    setColumns([...columns, { name: '', description: '' }]);
    setEditingColumn(columns.length);
  };

  const updateColumn = (index: number, field: keyof ReviewColumn, value: string) => {
    const updated = [...columns];
    updated[index] = { ...updated[index], [field]: value };
    setColumns(updated);
  };

  const removeColumn = (index: number) => {
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validColumns = columns.filter((c) => c.name.trim());
    onSubmit({ title, research_question: question, columns: validColumns });
  };

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <h3 className="font-semibold">Create New Review</h3>

      <div>
        <label className="mb-1 block text-sm font-medium">Title</label>
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g., Systematic Review of Deep Learning in Medicine"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Research Question</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What question is this review trying to answer?"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          rows={2}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">Extraction Columns</label>
        <div className="space-y-2">
          {columns.map((col, i) => (
            <div key={i} className="flex items-center gap-2">
              {editingColumn === i ? (
                <>
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => updateColumn(i, 'name', e.target.value)}
                    placeholder="Column name"
                    className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                  />
                  <input
                    type="text"
                    value={col.description}
                    onChange={(e) => updateColumn(i, 'description', e.target.value)}
                    placeholder="Description"
                    className="flex-1 rounded-md border bg-background px-2 py-1 text-sm"
                  />
                  <button type="button" onClick={() => setEditingColumn(null)} className="p-1 text-green-600">
                    <Save className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className="flex-1 truncate text-sm font-medium">{col.name || '(unnamed)'}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">{col.description}</span>
                  <button type="button" onClick={() => setEditingColumn(i)} className="p-1 text-muted-foreground hover:text-foreground">
                    <Edit2 className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => removeColumn(i)} className="p-1 text-muted-foreground hover:text-red-600">
                    <X className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addColumn}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground"
        >
          + Add Column
        </button>
      </div>

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-2 text-sm hover:bg-muted">
          Cancel
        </button>
        <button type="submit" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground hover:bg-primary/90">
          Create Review
        </button>
      </div>
    </form>
  );
}

interface ReviewCardProps {
  review: Review;
  onSelect: () => void;
  onDelete: () => void;
  isSelected: boolean;
}

function ReviewCard({ review, onSelect, onDelete, isSelected }: ReviewCardProps) {
  const statusColors: Record<string, string> = {
    pending: 'bg-slate-100 text-slate-700',
    in_progress: 'bg-blue-100 text-blue-700',
    complete: 'bg-green-100 text-green-700',
    failed: 'bg-red-100 text-red-700',
  };

  return (
    <div
      className={`rounded-lg border p-4 shadow-sm cursor-pointer transition-colors hover:bg-muted/50 ${
        isSelected ? 'border-primary bg-muted/50' : 'bg-card'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-medium">{review.title}</h3>
          {review.research_question && (
            <p className="mt-1 text-sm text-muted-foreground truncate max-w-xl">
              {review.research_question}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[review.extraction_status] ?? 'bg-slate-100 text-slate-700'}`}>
            {review.extraction_status}
          </span>
          <span className="text-xs text-muted-foreground">
            {review.paper_ids.length} papers, {review.columns.length} columns
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="p-1 text-muted-foreground hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReviewDetailProps {
  review: Review;
  onExtract: () => void;
  isExtracting: boolean;
}

function ReviewDetail({ review, onExtract, isExtracting }: ReviewDetailProps) {
  const { projectId } = useParams<{ projectId: string }>();
  const pid = Number(projectId!);

  const { data: extractions, isLoading } = useQuery({
    queryKey: ['extractions', pid, review.id],
    queryFn: () => reviewsApi.getExtractions(pid, review.id),
    enabled: review.extraction_status === 'complete' || review.extraction_status === 'in_progress',
  });

  const handleExport = () => {
    window.open(`/api/v1/projects/${pid}/reviews/${review.id}/export`, '_blank');
  };

  return (
    <div className="rounded-lg border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Extraction Results: {review.title}</h3>
        <div className="flex gap-2">
          <button
            onClick={onExtract}
            disabled={isExtracting}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {isExtracting ? 'Extracting...' : 'Run Extraction'}
          </button>
          {extractions && extractions.completed > 0 && (
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-muted"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {isLoading && <LoadingState />}

      {extractions && extractions.results.length > 0 && (
        <ExtractionTable
          columns={review.columns}
          results={extractions.results}
          completed={extractions.completed}
          total={extractions.total_papers}
        />
      )}
    </div>
  );
}

interface ExtractionTableProps {
  columns: ReviewColumn[];
  results: ExtractionResult[];
  completed: number;
  total: number;
}

function ExtractionTable({ columns, results, completed, total }: ExtractionTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">
          {completed} of {total} papers extracted
        </span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Paper ID</th>
              {columns.map((col) => (
                <th key={col.name} className="px-3 py-2 text-left font-medium">
                  {col.name}
                </th>
              ))}
              <th className="px-3 py-2 text-left font-medium">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.paper_id} className="border-t">
                <td className="px-3 py-2 font-mono text-xs">{result.paper_id}</td>
                {columns.map((col) => (
                  <td key={col.name} className="px-3 py-2 max-w-xs truncate">
                    {String(result.extracted_data[col.name] ?? '-')}
                  </td>
                ))}
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      result.confidence >= 0.8
                        ? 'bg-green-100 text-green-700'
                        : result.confidence >= 0.5
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {(result.confidence * 100).toFixed(0)}%
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
