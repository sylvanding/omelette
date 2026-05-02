import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Target, Flame, BookOpen, TrendingUp, Pencil } from 'lucide-react';
import { useReadingGoals, computeTodayProgress, computeStreak } from '@/hooks/useReadingGoals';
import { formatReadingTime } from '@/hooks/useReadingTimer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface ReadingGoalsCardProps {
  sessions: Array<{
    id: number;
    started_at: string;
    paper_id: number;
    time_spent_seconds: number;
    paper_title: string;
  }>;
}

export function ReadingGoalsCard({ sessions }: ReadingGoalsCardProps) {
  const { t } = useTranslation();
  const { goals, updateGoals } = useReadingGoals();
  const [editing, setEditing] = useState(false);
  const [editDaily, setEditDaily] = useState(goals.dailyGoal);
  const [editWeekly, setEditWeekly] = useState(goals.weeklyGoal);

  const todayProgress = computeTodayProgress(sessions);
  const streak = computeStreak(sessions, goals.dailyGoal);
  const dailyPct = Math.min(100, Math.round((todayProgress.papersRead / goals.dailyGoal) * 100));

  const weeklyPapers = new Set(
    sessions
      .filter(s => {
        const d = new Date(s.started_at);
        const now = new Date();
        const weekAgo = new Date(now);
        weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      })
      .map(s => s.paper_id),
  ).size;
  const weeklyPct = Math.min(100, Math.round((weeklyPapers / goals.weeklyGoal) * 100));

  const handleSave = () => {
    updateGoals({ dailyGoal: editDaily, weeklyGoal: editWeekly });
    setEditing(false);
  };

  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-primary" />
          <h3 className="text-sm font-semibold">
            {t('readingGoals.title', 'Reading Goals')}
          </h3>
        </div>
        {!editing && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => {
              setEditDaily(goals.dailyGoal);
              setEditWeekly(goals.weeklyGoal);
              setEditing(true);
            }}
            aria-label={t('readingGoals.edit', 'Edit goals')}
          >
            <Pencil className="size-3" />
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-24">
              {t('readingGoals.dailyGoal', 'Daily goal')}
            </label>
            <Input
              type="number"
              min={1}
              max={50}
              value={editDaily}
              onChange={e => setEditDaily(Number(e.target.value))}
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {t('readingGoals.papersPerDay', 'papers/day')}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-24">
              {t('readingGoals.weeklyGoal', 'Weekly goal')}
            </label>
            <Input
              type="number"
              min={1}
              max={100}
              value={editWeekly}
              onChange={e => setEditWeekly(Number(e.target.value))}
              className="h-7 w-16 text-xs"
            />
            <span className="text-xs text-muted-foreground">
              {t('readingGoals.papersPerWeek', 'papers/week')}
            </span>
          </div>
          <div className="flex gap-1">
            <Button size="xs" onClick={handleSave}>
              {t('common.save', 'Save')}
            </Button>
            <Button size="xs" variant="outline" onClick={() => setEditing(false)}>
              {t('common.cancel', 'Cancel')}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Daily progress */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('readingGoals.today', 'Today')}</span>
              <span>
                {todayProgress.papersRead}/{goals.dailyGoal} {t('readingGoals.papers', 'papers')}
                {' · '}
                {formatReadingTime(todayProgress.totalSeconds)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  dailyPct >= 100 ? 'bg-emerald-500' : 'bg-primary',
                )}
                style={{ width: `${dailyPct}%` }}
              />
            </div>
          </div>

          {/* Weekly progress */}
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>{t('readingGoals.thisWeek', 'This week')}</span>
              <span>
                {weeklyPapers}/{goals.weeklyGoal} {t('readingGoals.papers', 'papers')}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  weeklyPct >= 100 ? 'bg-emerald-500' : 'bg-amber-500',
                )}
                style={{ width: `${weeklyPct}%` }}
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 pt-1">
            <div className="flex items-center gap-1.5 text-sm">
              <Flame className={cn('size-4', streak >= 7 ? 'text-orange-500' : 'text-muted-foreground')} />
              <span className="font-semibold">{streak}</span>
              <span className="text-xs text-muted-foreground">
                {t('readingGoals.dayStreak', 'day streak')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <BookOpen className="size-4 text-muted-foreground" />
              <span className="font-semibold">{todayProgress.papersRead}</span>
              <span className="text-xs text-muted-foreground">
                {t('readingGoals.readToday', 'read today')}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-sm">
              <TrendingUp className="size-4 text-muted-foreground" />
              <span className="font-semibold">{goals.dailyGoal}</span>
              <span className="text-xs text-muted-foreground">
                {t('readingGoals.daily', 'daily')}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
