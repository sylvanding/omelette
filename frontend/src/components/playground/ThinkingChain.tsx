import { memo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  Search,
  BookOpen,
  Filter,
  Sparkles,
  Wand2,
  CheckCircle2,
  Loader2,
  AlertTriangle,
  SkipForward,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ThinkingStep {
  step: string;
  label: string;
  detail?: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  duration_ms?: number;
  summary?: string;
}

interface ThinkingChainProps {
  steps: ThinkingStep[];
}

const STEP_ICONS: Record<string, typeof Search> = {
  understand: Search,
  retrieve: BookOpen,
  rank: Filter,
  clean: Wand2,
  generate: Sparkles,
  complete: CheckCircle2,
};

const STATUS_ICON: Record<string, typeof Loader2> = {
  running: Loader2,
  done: CheckCircle2,
  error: AlertTriangle,
  skipped: SkipForward,
};

function formatDuration(ms?: number): string {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ThinkingChain({ steps }: ThinkingChainProps) {
  const { t } = useTranslation();
  const [userOverride, setUserOverride] = useState<boolean | null>(null);

  const allDoneLocal = steps.every((s) => s.status !== 'running');
  const expanded = userOverride !== null ? userOverride : !allDoneLocal;

  if (steps.length === 0) return null;

  const stepLabel = (step: ThinkingStep) =>
    t(`playground.thinking.${step.step}`, { defaultValue: step.label });

  const latestRunning = steps.findLast((s) => s.status === 'running');
  const completedStep = steps.find((s) => s.step === 'complete');

  return (
    <div className="mb-2">
      <button
        onClick={() => setUserOverride(!expanded)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {latestRunning && !allDoneLocal ? (
          <Loader2 className="size-3 animate-spin text-primary" />
        ) : (
          <CheckCircle2 className="size-3 text-emerald-500" />
        )}
        <span>
          {allDoneLocal && completedStep
            ? completedStep.summary
            : latestRunning
              ? stepLabel(latestRunning)
              : t('playground.thinking.collapsed')}
        </span>
        <ChevronDown className={cn('size-3 transition-transform', expanded && 'rotate-180')} />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="ml-1 mt-1.5 space-y-1 border-l-2 border-border/50 pl-3">
              {steps.filter((s) => s.step !== 'complete').map((step, index) => {
                const Icon = STEP_ICONS[step.step] ?? Search;
                const StatusIcon = STATUS_ICON[step.status];
                return (
                  <div key={`${step.step}-${index}`} className="flex items-start gap-2 py-0.5">
                    <Icon className={cn(
                      'mt-0.5 size-3 shrink-0',
                      step.status === 'running' && 'text-primary',
                      step.status === 'done' && 'text-emerald-500',
                      step.status === 'error' && 'text-amber-500',
                      step.status === 'skipped' && 'text-muted-foreground',
                    )} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          'text-xs font-medium',
                          step.status === 'running' && 'text-foreground',
                          step.status === 'done' && 'text-muted-foreground',
                          step.status === 'error' && 'text-amber-600 dark:text-amber-400',
                          step.status === 'skipped' && 'text-muted-foreground line-through',
                        )}>
                          {stepLabel(step)}
                        </span>
                        {step.status === 'running' && (
                          <StatusIcon className="size-3 animate-spin text-primary" />
                        )}
                        {step.duration_ms !== undefined && step.status === 'done' && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatDuration(step.duration_ms)}
                          </span>
                        )}
                      </div>
                      {step.summary && step.status === 'done' && (
                        <p className="text-[10px] text-muted-foreground">{step.summary}</p>
                      )}
                      {step.detail && step.status === 'running' && (
                        <p className="text-[10px] text-muted-foreground">{step.detail}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(ThinkingChain);
