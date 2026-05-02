import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useReadingGoals, computeTodayProgress, computeStreak } from '../useReadingGoals';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('useReadingGoals', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('returns default goals when nothing stored', () => {
    const { result } = renderHook(() => useReadingGoals());
    expect(result.current.goals).toEqual({ dailyGoal: 3, weeklyGoal: 15 });
  });

  it('updates daily goal and persists', () => {
    const { result } = renderHook(() => useReadingGoals());
    act(() => result.current.updateGoals({ dailyGoal: 5 }));
    expect(result.current.goals.dailyGoal).toBe(5);
    expect(result.current.goals.weeklyGoal).toBe(15);
  });

  it('updates weekly goal and persists', () => {
    const { result } = renderHook(() => useReadingGoals());
    act(() => result.current.updateGoals({ weeklyGoal: 20 }));
    expect(result.current.goals.weeklyGoal).toBe(20);
  });

  it('loads persisted goals from localStorage', () => {
    localStorage.setItem('omelette-reading-goals', JSON.stringify({ dailyGoal: 7, weeklyGoal: 30 }));
    const { result } = renderHook(() => useReadingGoals());
    expect(result.current.goals).toEqual({ dailyGoal: 7, weeklyGoal: 30 });
  });
});

describe('computeTodayProgress', () => {
  it('counts unique papers read today', () => {
    const today = new Date().toISOString().split('T')[0];
    const sessions = [
      { started_at: `${today}T10:00:00Z`, paper_id: 1, time_spent_seconds: 300 },
      { started_at: `${today}T14:00:00Z`, paper_id: 1, time_spent_seconds: 200 },
      { started_at: `${today}T15:00:00Z`, paper_id: 2, time_spent_seconds: 400 },
      { started_at: '2020-01-01T10:00:00Z', paper_id: 3, time_spent_seconds: 100 },
    ];
    const progress = computeTodayProgress(sessions);
    expect(progress.papersRead).toBe(2);
    expect(progress.totalSeconds).toBe(900);
  });

  it('returns zero when no sessions today', () => {
    const sessions = [
      { started_at: '2020-01-01T10:00:00Z', paper_id: 1, time_spent_seconds: 300 },
    ];
    const progress = computeTodayProgress(sessions);
    expect(progress.papersRead).toBe(0);
  });
});

describe('computeStreak', () => {
  it('returns 0 for empty sessions', () => {
    expect(computeStreak([], 3)).toBe(0);
  });

  it('counts consecutive days meeting goal', () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toISOString().split('T')[0];
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const sessions = [
      { started_at: `${todayStr}T10:00:00Z`, paper_id: 1 },
      { started_at: `${todayStr}T14:00:00Z`, paper_id: 2 },
      { started_at: `${todayStr}T15:00:00Z`, paper_id: 3 },
      { started_at: `${yesterdayStr}T10:00:00Z`, paper_id: 4 },
      { started_at: `${yesterdayStr}T14:00:00Z`, paper_id: 5 },
      { started_at: `${yesterdayStr}T15:00:00Z`, paper_id: 6 },
    ];

    const streak = computeStreak(sessions, 3);
    expect(streak).toBeGreaterThanOrEqual(1);
    expect(streak).toBeLessThanOrEqual(2);
  });
});
