import { useState, useCallback } from 'react';

const STORAGE_KEY = 'omelette-reading-goals';

interface ReadingGoals {
  dailyGoal: number;
  weeklyGoal: number;
}

interface DayProgress {
  date: string;
  papersRead: number;
  totalSeconds: number;
}

const DEFAULT_GOALS: ReadingGoals = { dailyGoal: 3, weeklyGoal: 15 };

function loadGoals(): ReadingGoals {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return { ...DEFAULT_GOALS, ...JSON.parse(stored) };
  } catch { /* localStorage unavailable */ }
  return DEFAULT_GOALS;
}

function saveGoals(goals: ReadingGoals): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(goals));
  } catch { /* localStorage unavailable */ }
}

export function useReadingGoals() {
  const [goals, setGoals] = useState<ReadingGoals>(loadGoals);

  const updateGoals = useCallback((update: Partial<ReadingGoals>) => {
    setGoals(prev => {
      const next = { ...prev, ...update };
      saveGoals(next);
      return next;
    });
  }, []);

  return { goals, updateGoals };
}

export function computeTodayProgress(
  sessions: Array<{ started_at: string; paper_id: number; time_spent_seconds: number }>,
): DayProgress {
  const today = new Date().toISOString().split('T')[0];
  const todaySessions = sessions.filter(s => s.started_at.startsWith(today));
  const paperIds = new Set(todaySessions.map(s => s.paper_id));
  const totalSeconds = todaySessions.reduce((sum, s) => sum + s.time_spent_seconds, 0);
  return { date: today, papersRead: paperIds.size, totalSeconds };
}

export function computeStreak(
  sessions: Array<{ started_at: string; paper_id: number }>,
  dailyGoal: number,
): number {
  if (sessions.length === 0) return 0;

  const dayCounts = new Map<string, number>();
  for (const s of sessions) {
    const day = s.started_at.split('T')[0];
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
  }

  const today = new Date();
  let streak = 0;

  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().split('T')[0];
    const paperIds = new Set(
      sessions
        .filter(s => s.started_at.startsWith(key))
        .map(s => s.paper_id),
    );
    if (paperIds.size >= dailyGoal) {
      streak++;
    } else if (i === 0) {
      // Today doesn't count yet — don't break streak
      continue;
    } else {
      break;
    }
  }

  return streak;
}
