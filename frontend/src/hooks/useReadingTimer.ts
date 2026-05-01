import { useEffect, useRef, useState } from 'react';

import { readingSessionApi } from '@/services/api';

interface UseReadingTimerOptions {
  projectId: number;
  paperId: number;
  enabled?: boolean;
}

interface UseReadingTimerReturn {
  elapsedSeconds: number;
  isRunning: boolean;
}

export function useReadingTimer({
  projectId,
  paperId,
  enabled = true,
}: UseReadingTimerOptions): UseReadingTimerReturn {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startTimeRef = useRef<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushRef = useRef<Promise<unknown> | null>(null);

  const isRunning = startTimeRef.current !== null && elapsedSeconds > 0;

  const flushSession = async () => {
    if (!startTimeRef.current || elapsedSeconds < 5) return;
    if (flushRef.current) return;

    const startedAt = startTimeRef.current;
    const endedAt = new Date();
    const timeSpent = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);

    flushRef.current = readingSessionApi
      .record(projectId, {
        paper_id: paperId,
        started_at: startedAt.toISOString(),
        ended_at: endedAt.toISOString(),
        time_spent_seconds: timeSpent,
      })
      .finally(() => {
        flushRef.current = null;
      });
  };

  useEffect(() => {
    if (!enabled) return;

    startTimeRef.current = new Date();
    setElapsedSeconds(0);

    intervalRef.current = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      startTimeRef.current = null;
      void flushSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flushSession uses refs, stable across renders
  }, [paperId, enabled]);

  useEffect(() => {
    if (!enabled) return;

    const handleVisibilityChange = () => {
      if (document.hidden) {
        void flushSession();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flushSession uses refs, stable across renders
  }, [projectId, paperId, enabled]);

  return { elapsedSeconds, isRunning };
}

export function formatReadingTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
