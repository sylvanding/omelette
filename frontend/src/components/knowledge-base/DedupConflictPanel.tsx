import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';
import type { DedupConflictPair } from '@/services/kb-api';
import { cn } from '@/lib/utils';

interface DedupConflictPanelProps {
  projectId: number;
  conflicts: DedupConflictPair[];
  onResolve: (conflictId: string, action: string) => void;
  onAutoResolveAll: () => void;
}

const PAPER_FIELDS = ['title', 'authors', 'doi', 'year', 'journal'] as const;

function formatAuthors(authors: unknown): string {
  if (!authors || !Array.isArray(authors)) return '';
  return authors
    .map((a) => (typeof a === 'object' && a && 'name' in a ? String((a as { name: string }).name) : ''))
    .filter(Boolean)
    .join(', ');
}

function getFieldValue(paper: Record<string, unknown>, field: string): string {
  const v = paper[field];
  if (field === 'authors') return formatAuthors(v);
  if (v == null) return '';
  return String(v);
}

function isDifferent(
  oldPaper: Record<string, unknown>,
  newPaper: Record<string, unknown>,
  field: string
): boolean {
  const oldVal = getFieldValue(oldPaper, field);
  const newVal = getFieldValue(newPaper, field);
  return oldVal !== newVal;
}

export function DedupConflictPanel({
  projectId,
  conflicts,
  onResolve,
  onAutoResolveAll,
}: DedupConflictPanelProps) {
  const { t } = useTranslation();
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [aiResolvingId, setAiResolvingId] = useState<string | null>(null);

  const handleResolve = async (conflictId: string, action: string) => {
    setResolvingId(conflictId);
    try {
      onResolve(conflictId, action);
    } finally {
      setResolvingId(null);
    }
  };

  const handleAiResolve = async (conflictId: string) => {
    setAiResolvingId(conflictId);
    try {
      onResolve(conflictId, 'ai_resolve');
    } finally {
      setAiResolvingId(null);
    }
  };

  const handleKeepAll = (action: 'keep_existing' | 'keep_new') => {
    conflicts.forEach((c) => handleResolve(c.conflict_id, action));
  };

  const handleAutoResolveAll = () => {
    onAutoResolveAll();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge variant="secondary" className="gap-1">
          <AlertTriangle className="size-3" />
          {t('kb.dedup.conflictsCount', { count: conflicts.length })}
        </Badge>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleKeepAll('keep_existing')}
          >
            {t('kb.dedup.keepAllExisting')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleKeepAll('keep_new')}
          >
            {t('kb.dedup.keepAllNew')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAutoResolveAll}
          >
            <Sparkles className="size-4" />
            {t('kb.dedup.aiResolveAll')}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {conflicts.map((conflict) => (
          <div
            key={conflict.conflict_id}
            className="rounded-xl border border-border bg-card p-4"
          >
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('kb.dedup.existingPaper')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {PAPER_FIELDS.map((field) => {
                    const oldVal = getFieldValue(conflict.old_paper, field);
                    const diff = isDifferent(
                      conflict.old_paper,
                      conflict.new_paper as unknown as Record<string, unknown>,
                      field
                    );
                    return (
                      <div key={field} className="text-sm">
                        <span className="font-medium text-muted-foreground">
                          {t(`kb.dedup.field.${field}`)}:
                        </span>{' '}
                        <span
                          className={cn(
                            diff && 'rounded bg-amber-200/50 dark:bg-amber-900/30'
                          )}
                        >
                          {oldVal || '—'}
                        </span>
                        {!diff && oldVal && (
                          <Check className="ml-1 inline size-3.5 text-green-600 dark:text-green-500" />
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {t('kb.dedup.newPaper')}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {PAPER_FIELDS.map((field) => {
                    const newVal = getFieldValue(
                      conflict.new_paper as unknown as Record<string, unknown>,
                      field
                    );
                    const diff = isDifferent(
                      conflict.old_paper,
                      conflict.new_paper as unknown as Record<string, unknown>,
                      field
                    );
                    return (
                      <div key={field} className="text-sm">
                        <span className="font-medium text-muted-foreground">
                          {t(`kb.dedup.field.${field}`)}:
                        </span>{' '}
                        <span
                          className={cn(
                            diff && 'rounded bg-amber-200/50 dark:bg-amber-900/30'
                          )}
                        >
                          {newVal || '—'}
                        </span>
                        {!diff && newVal && (
                          <Check className="ml-1 inline size-3.5 text-green-600 dark:text-green-500" />
                        )}
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {conflict.reason && (
              <p className="mb-4 text-xs text-muted-foreground">
                {t('kb.dedup.reason')}: {conflict.reason}
                {conflict.similarity != null &&
                  ` (${t('kb.dedup.similarity', { value: Math.round(conflict.similarity * 100) })}%)`}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResolve(conflict.conflict_id, 'keep_existing')}
                disabled={resolvingId === conflict.conflict_id}
              >
                {t('kb.dedup.keepExisting')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResolve(conflict.conflict_id, 'keep_new')}
                disabled={resolvingId === conflict.conflict_id}
              >
                {t('kb.dedup.keepNew')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleResolve(conflict.conflict_id, 'skip')}
                disabled={resolvingId === conflict.conflict_id}
              >
                {t('kb.dedup.skip')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAiResolve(conflict.conflict_id)}
                disabled={aiResolvingId === conflict.conflict_id}
              >
                <Sparkles className="size-4" />
                {t('kb.dedup.aiResolve')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
